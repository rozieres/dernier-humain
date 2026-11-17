import { launch, openPage, waitFor } from '../tools/browser.mjs';

const BASE = process.env.FEED_URL || 'http://127.0.0.1:5222/dev/feed.html';
const HMR_STUB = `const hot = { accept() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {}, data: {} };
export const createHotContext = () => hot;
export const injectQuery = (url) => url;
export function updateStyle(id, css) {
  let el = document.querySelector(\`style[data-vite-dev-id="\${id}"]\`);
  if (!el) {
    el = document.createElement('style');
    el.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(el);
  }
  el.textContent = css;
}
export function removeStyle() {}
export class ErrorOverlay {}`;

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const HELPERS = () => {
  const g = window.__game;
  const T = {
    g,
    keys: new Set(),
    events: [],
    hold(code, down = true) {
      g.input.simulate(code, down);
      if (down) T.keys.add(code);
      else T.keys.delete(code);
    },
    releaseAll() {
      for (const k of [...T.keys]) T.hold(k, false);
    },
    step(n = 1) {
      for (let i = 0; i < n; i++) g.debug.advance(1 / 60);
    },
    frame() {
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    },
    async press(code) {
      T.hold(code, true);
      await T.frame();
      T.hold(code, false);
      await T.frame();
    },
    click(code = 'Mouse0') {
      T.hold(code, true);
      T.step(2);
      T.hold(code, false);
      T.step(2);
    },
    face(x, z) {
      const p = g.player.position;
      g.player.yaw = Math.atan2(-(x - p.x), -(z - p.z));
    },
    aimAt(x, y, z) {
      const e = g.player.eye;
      g.player.yaw = Math.atan2(-(x - e.x), -(z - e.z));
      g.player.pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z));
      T.step(1);
    },
    async walkTo(x, z, { within = 1, maxSec = 60, sprint = true } = {}) {
      T.hold('KeyW');
      if (sprint) T.hold('ShiftLeft');
      await T.frame();
      for (let i = 0; i < maxSec * 60; i++) {
        T.face(x, z);
        T.step(1);
        const p = g.player.position;
        if (Math.hypot(x - p.x, z - p.z) < within) break;
      }
      T.releaseAll();
      await T.frame();
      T.step(10);
      const p = g.player.position;
      return Math.hypot(x - p.x, z - p.z);
    },
    finite() {
      const p = g.player.position;
      return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
    },
  };
  for (const type of ['beacon:activated', 'beacon:ready', 'grab:start', 'grab:end', 'link:ride:start', 'link:ride:end', 'player:glide']) {
    g.events.on(type, (p) => T.events.push({ type, p: { zone: p?.zone, id: p?.id, active: p?.active } }));
  }
  const say = g.companion.say.bind(g.companion);
  T.said = [];
  g.companion.say = (k, o) => {
    T.said.push(k);
    return say(k, o);
  };
  window.__T = T;
};

const { browser, context } = await launch({ width: 1280, height: 720 });
await context.route(/\/@vite\/client/, (route) => route.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));

async function boot(query) {
  const { page, log } = await openPage(context, `${BASE}?mute=1${query}`);
  await waitFor(page, 'window.__game?.ready', 120000);
  await page.waitForTimeout(800);
  await page.evaluate(HELPERS);
  return { page, log };
}

const VIEWS = {
  arrival: [0, 124, -497, 0, 0.1],
  rim: [0, 124.4, -606, 0, -0.4],
  bottom: [6, 8, -628, 0.6, 0.3],
  hub: [0, 38, 8, 0, 0.1],
};
async function measure(page) {
  const out = {};
  for (const [name, [x, y, z, yaw, pitch]] of Object.entries(VIEWS)) {
    out[name] = await page.evaluate(async ([x, y, z, yaw, pitch]) => {
      const { g, step, frame } = window.__T;
      g.player.teleport(x, y, z, yaw);
      step(30);
      g.player.yaw = yaw;
      g.player.pitch = pitch;
      step(2);
      await new Promise((r) => setTimeout(r, 1200));
      await frame();
      const full = g.debug.stats();
      const objs = g.zones.feed.objects.filter((o) => o && o.visible);
      for (const o of objs) o.visible = false;
      await frame();
      await frame();
      const bare = g.debug.stats();
      for (const o of objs) o.visible = true;
      await frame();
      return { calls: full.calls - bare.calls, triangles: full.triangles - bare.triangles };
    }, [x, y, z, yaw, pitch]);
  }
  return out;
}

// 1. boot + budget
{
  const { page, log } = await boot('&nosave=1');
  check('zone boots, debugSolve exists', await page.evaluate(() => typeof window.__game.zones.feed.debugSolve === 'function'));
  const delta = await measure(page);
  check('boot: no console errors/warnings', log.errors.length === 0 && log.warnings.length === 0, `${log.errors.length} errors, ${log.warnings.length} warnings ${log.errors.slice(0, 2).join(' | ')}`);
  await page.close();
  for (const name of Object.keys(VIEWS)) {
    const dc = delta[name].calls;
    const dt = delta[name].triangles;
    const maxCalls = name === 'hub' ? 10 : 60;
    check(`budget at ${name}: ≤ ${maxCalls} draws, ≤ 300k tris`, dc <= maxCalls && dt <= 300000, `+${dc} draws, +${Math.round(dt / 1000)}k tris`);
  }
}

// 2. completability by a real player
{
  const { page, log } = await boot('&nosave=1');
  const run = (fn, arg) => page.evaluate(fn, arg);

  const rim = await run(async () => {
    const { g, walkTo } = window.__T;
    const s = g.zones.feed.spawn;
    g.player.teleport(s[0], s[1], s[2], s[3]);
    window.__T.step(20);
    await walkTo(0, -606, { within: 1.2 });
    return { p: g.player.position.toArray(), said: [...window.__T.said] };
  });
  check('walk from the arrival to the rim', rim.p[2] < -600 && rim.p[1] > 123, rim.p.map((v) => v.toFixed(1)).join(','));
  check('Tiret: zone.feed.pit at the rim', rim.said.includes('zone.feed.pit'));

  const fall = await run(async () => {
    const { g, hold, step } = window.__T;
    g.player.yaw = 0;
    hold('KeyW');
    await window.__T.frame();
    let glided = false;
    let t = 0;
    let ledgeStops = 0;
    for (; t < 150 * 60; t++) {
      const p = g.player.position;
      if (!g.player.grounded && g.player.velocity.y < -1) hold('Space');
      if (g.player.gliding) {
        glided = true;
        g.player.yaw += 1.4 / 60;
        g.player.pitch = -0.15;
      }
      if (g.player.grounded) {
        hold('Space', false);
        if (p.y < 9.5) break;
        g.player.yaw = Math.atan2(p.x, 640 + p.z);
        if (t % 60 === 0) ledgeStops++;
      }
      step(1);
    }
    window.__T.releaseAll();
    await window.__T.frame();
    step(30);
    return { y: g.player.position.y, glided, sec: t / 60, ledgeStops, descend: g.state.flag('zone.feed.descend'), said: [...window.__T.said] };
  });
  check('jump in and glide down to the floor', fall.glided && fall.y < 9.5, `y=${fall.y.toFixed(1)} after ${fall.sec.toFixed(1)} s`);
  check('flag zone.feed.descend + Tiret bottom', fall.descend === true && fall.said.includes('zone.feed.bottom'));

  const thrown = await run(async () => {
    const { g, step, walkTo, aimAt, click } = window.__T;
    const feed = g.zones.feed;
    const nearestPave = () => {
      const p = g.player.position;
      let best = null;
      for (const e of feed.paves) {
        const d = Math.hypot(e.position.x - p.x, e.position.z - p.z);
        if (!best || d < best.d) best = { e, d };
      }
      return best.e;
    };
    const solveAim = (target) => {
      const held = g.cursor.held;
      let best = { err: 1e9, pitch: 0 };
      for (let pitch = -0.2; pitch < 1.3; pitch += 0.01) {
        g.player.pitch = pitch;
        const dir = { x: -Math.sin(g.player.yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(g.player.yaw) * Math.cos(pitch) };
        dir.y += 0.22;
        const l = Math.hypot(dir.x, dir.y, dir.z);
        const v = 14 / l;
        let px = held.position.x;
        let py = held.position.y;
        let pz = held.position.z;
        let vx = dir.x * v;
        let vy = dir.y * v;
        let vz = dir.z * v;
        let err = 1e9;
        for (let i = 0; i < 180; i++) {
          vy -= 9.81 / 60;
          px += vx / 60;
          py += vy / 60;
          pz += vz / 60;
          err = Math.min(err, Math.hypot(px - target.x, py - target.y, pz - target.z));
        }
        if (err < best.err) best = { err, pitch };
      }
      return best;
    };
    const tries = [];
    let held = false;
    for (let attempt = 0; attempt < 8 && feed.drone.state === 'flying'; attempt++) {
      const pave = nearestPave();
      await walkTo(pave.position.x, pave.position.z, { within: 1.6, sprint: false });
      aimAt(pave.position.x, pave.position.y, pave.position.z);
      click('Mouse0');
      if (g.cursor.held !== pave) {
        tries.push('grab-miss');
        continue;
      }
      held = true;
      const d = feed.drone.position;
      const dx = g.player.position.x - d.x;
      const dz = g.player.position.z - d.z;
      const dist = Math.hypot(dx, dz) || 1;
      await walkTo(d.x + (dx / dist) * 7, d.z + (dz / dist) * 7, { within: 0.8, sprint: false, maxSec: 10 });
      const target = feed.drone.position;
      aimAt(target.x, target.y, target.z);
      step(20);
      const aim = solveAim(feed.drone.position);
      g.player.pitch = aim.pitch;
      step(25);
      const aim2 = solveAim(feed.drone.position);
      g.player.pitch = aim2.pitch;
      step(2);
      click('Mouse2');
      for (let i = 0; i < 150 && feed.drone.state === 'flying'; i++) step(1);
      tries.push(`${feed.drone.state}:${aim2.err.toFixed(2)}`);
    }
    for (let i = 0; i < 240 && g.state.beacons.feed !== 'ready'; i++) step(1);
    return {
      held, tries, drone: feed.drone.state, beacon: g.state.beacons.feed, flags: ['pave', 'drone'].map((k) => g.state.flag(`zone.feed.${k}`)),
      said: [...window.__T.said],
    };
  });
  check('grab a pavé (flag + Tiret)', thrown.held && thrown.flags[0] === true && thrown.said.includes('zone.feed.pave'));
  check('throw the pavé at the drone until it falls', thrown.drone === 'down' && thrown.flags[1] === true, thrown.tries.join(' '));
  check('beacon ready + Tiret solved', thrown.beacon === 'ready' && thrown.said.includes('zone.feed.solved'));

  const lit = await run(async () => {
    const { g, walkTo, step, aimAt, press } = window.__T;
    const yaw = Math.PI - (150 * Math.PI) / 180;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    await walkTo(fx * 2.2, -640 + fz * 2.2, { within: 0.5, sprint: false });
    let label = null;
    for (let k = 0; k < 4 && !label?.startsWith('beacon:'); k++) {
      aimAt(fx * 0.6, 9.2, -640 + fz * 0.6);
      await window.__T.frame();
      label = g.interact.current?.id;
    }
    await press('KeyE');
    for (let i = 0; i < 600 && !window.__T.events.some((e) => e.type === 'beacon:activated'); i++) await window.__T.frame();
    for (let i = 0; i < 120 && g.state.mode !== 'reading'; i++) await window.__T.frame();
    return { label, beacon: g.state.beacons.feed, mode: g.state.mode, event: window.__T.events.some((e) => e.type === 'beacon:activated' && e.p.zone === 'feed') };
  });
  check('press E on the beacon: active + event + document', lit.beacon === 'active' && lit.event && lit.mode === 'reading', JSON.stringify(lit));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  const up = await run(async () => {
    const { g, walkTo, step, frame, press } = window.__T;
    if (g.state.mode !== 'playing') g.state.setMode('playing');
    const link = g.links.get('feed-top');
    await walkTo(link.b[0], link.b[2], { within: 1.2, sprint: false });
    let label = null;
    for (let k = 0; k < 6 && !label?.startsWith('Retour'); k++) {
      window.__T.aimAt(link.b[0], link.b[1] + 1.6 + k * 0.3, link.b[2]);
      await frame();
      label = g.interact.current?.label;
    }
    await press('KeyE');
    for (let i = 0; i < 900 && !window.__T.events.some((e) => e.type === 'link:ride:end'); i++) await frame();
    step(30);
    return { label, y: g.player.position.y, r: Math.hypot(g.player.position.x, g.player.position.z + 640) };
  });
  check('ride the link back up to the rim', up.y > 123 && up.r > 20 && up.r < 45, JSON.stringify(up));
  check('run: no console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  await page.close();
}

// 3. debugSolve on a fresh boot + 4. reload solved
{
  const { page, log } = await boot('');
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, 'window.__game?.ready', 120000);
  await page.evaluate(HELPERS);
  const r = await page.evaluate(async () => {
    const { g, frame, events } = window.__T;
    g.debug.solve('feed');
    const ready = g.state.beacons.feed;
    g.beacons.activate('feed');
    for (let i = 0; i < 900 && !(events.some((e) => e.type === 'beacon:activated') && g.state.mode === 'reading'); i++) await frame();
    return { ready, active: g.state.beacons.feed, ev: events.some((e) => e.type === 'beacon:activated' && e.p.zone === 'feed'), mode: g.state.mode };
  });
  check('debugSolve leaves the beacon ready', r.ready === 'ready');
  check('activation: active + beacon:activated + document', r.active === 'active' && r.ev && r.mode === 'reading', JSON.stringify(r));
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__game.state.save());
  await page.goto(`${BASE}?mute=1&load=1`, { waitUntil: 'load' });
  await waitFor(page, 'window.__game?.ready', 120000);
  await page.waitForTimeout(500);
  const solved = await page.evaluate(() => {
    const g = window.__game;
    return { beacon: g.state.beacons.feed, drone: g.zones.feed.drone.state, popups: g.zones.feed.drone.popups, flag: g.state.flag('zone.feed.drone') };
  });
  check('reload with the solved state rebuilds the zone solved', solved.drone === 'down' && solved.popups === 0 && solved.beacon === 'active', JSON.stringify(solved));
  check('solve/reload: no console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  await page.evaluate(() => localStorage.clear());
  await page.close();
}

// 5. 60 s of random input
{
  const { page, log } = await boot('&nosave=1');
  const r = await page.evaluate(async () => {
    const { g, hold, step, finite } = window.__T;
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'Mouse0', 'Mouse2', 'KeyF', 'KeyE'];
    let bad = 0;
    let below = 0;
    const spots = [[0, 124, -560], [0, 124.4, -606], [0, 60, -640], [5, 8, -632]];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let s = 0; s < 3600; s++) {
      if (s % 900 === 0) {
        const [x, y, z] = spots[(s / 900) % spots.length];
        g.player.teleport(x, y, z, 0);
      }
      if (s % 12 === 0) {
        for (const k of keys) hold(k, rnd() < 0.25);
        await window.__T.frame();
      }
      g.player.yaw += (rnd() - 0.5) * 0.1;
      g.player.pitch = Math.max(-1.4, Math.min(1.4, g.player.pitch + (rnd() - 0.5) * 0.08));
      step(1);
      if (!finite()) bad++;
      const p = g.player.position;
      if (p.y < g.world.heightAt(p.x, p.z) - 0.3) below++;
    }
    window.__T.releaseAll();
    return { bad, below, mode: g.state.mode };
  });
  check('60 s random input: no NaN, never below terrain', r.bad === 0 && r.below === 0, JSON.stringify(r));
  check('random input: no console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
