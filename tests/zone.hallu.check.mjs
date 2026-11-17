import { launch, openPage, waitFor } from '../tools/browser.mjs';

const BASE = process.env.HALLU_URL || 'http://127.0.0.1:5224/dev/hallu.html';
let failures = 0;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (id) => !ONLY || ONLY.includes(id);
function check(label, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

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

const HELPERS = () => {
  const g = window.__game;
  const Z = g.zones.hallu;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) g.debug.advance(1 / 60);
  };
  const T = {
    g, Z, frame, step,
    events: [],
    async hold(code, down = true) {
      g.input.simulate(code, down);
      await frame();
    },
    face(x, z) {
      const p = g.player.position;
      g.player.yaw = Math.atan2(-(x - p.x), -(z - p.z));
      g.player.pitch = -0.25;
    },
    hd(x, z) {
      const p = g.player.position;
      return Math.hypot(x - p.x, z - p.z);
    },
    async press(code) {
      g.input.simulate(code, true);
      step(1);
      await frame();
      g.input.simulate(code, false);
      await frame();
      step(1);
    },
    async scan() {
      for (let i = 0; i < 200 && !g.scanner.ready; i++) step(1);
      await T.press('KeyF');
      step(150);
    },
    async walkTo(x, z, { tol = 0.35, max = 12 } = {}) {
      T.face(x, z);
      await T.hold('KeyW', true);
      let t = 0;
      while (T.hd(x, z) > tol && t < max) {
        T.face(x, z);
        step(1);
        t += 1 / 60;
        if (g.player.position.y < 30) break;
      }
      await T.hold('KeyW', false);
      step(12);
      return T.hd(x, z) <= tol + 0.5;
    },
    async hopTo(target, { from, fromRadius = 1.4 }) {
      const [x, y, z] = target;
      T.face(x, z);
      const p0 = g.player.position.clone();
      const edge = Math.hypot(x - from[0], z - from[2]) - 1.25;
      await T.hold('KeyW', true);
      let t = 0;
      while (Math.hypot(g.player.position.x - from[0], g.player.position.z - from[2]) < Math.min(edge, fromRadius - 0.3) && t < 4) {
        T.face(x, z);
        step(1);
        t += 1 / 60;
      }
      g.input.simulate('Space', true);
      step(10);
      g.input.simulate('Space', false);
      let landed = false;
      for (let i = 0; i < 120; i++) {
        T.face(x, z);
        step(1);
        if (g.player.grounded && g.player.position.y > y - 0.4 && T.hd(x, z) < 1.6) {
          landed = true;
          break;
        }
        if (g.player.position.y < y - 4) break;
      }
      await T.hold('KeyW', false);
      step(15);
      if (landed) await T.walkTo(x, z, { tol: 0.4, max: 2 });
      return { landed: landed && Math.abs(g.player.position.y - y) < 0.5, from: [p0.x, p0.y, p0.z], at: [g.player.position.x, g.player.position.y, g.player.position.z] };
    },
    visibleReal(group) {
      return Z.stones.list.filter((e) => e.group === group && (e.phase === 'idle' || e.phase === 'solid'));
    },
  };
  for (const type of ['scan:start', 'scan:hit', 'player:respawn', 'beacon:ready', 'beacon:activated', 'player:land']) {
    g.events.on(type, (p) => T.events.push({ type, zone: p?.zone, kind: p?.kind }));
  }
  window.__T = T;
};

const { browser, context } = await launch({ width: 1280, height: 720 });
await context.route(/\/@vite\/client/, (route) => route.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));

async function open(query = 'nosave=1&mute=1', clear = true) {
  const { page, log } = await openPage(context, `${BASE}?${query}`);
  if (clear) await page.evaluate(() => localStorage.clear());
  await waitFor(page, 'window.__game?.ready && window.__game.zones.hallu?.stones', 90000);
  await page.evaluate(HELPERS);
  return { page, log, run: (fn, arg) => page.evaluate(fn, arg) };
}

// 1. boot + budget
if (want('1')) {
  const { page, log, run } = await open();
  await page.waitForTimeout(2500);
  const budget = await run(async () => {
    const { g, Z } = window.__T;
    const near = g.scene.getObjectByName('zone:hallu');
    const measure = async () => {
      await new Promise((r) => setTimeout(r, 400));
      return g.debug.stats();
    };
    const out = {};
    const views = {
      arrival: () => g.player.teleport(...Z.spawn),
      pillar: () => g.player.teleport(330, 50, 612, 0),
    };
    for (const [name, place] of Object.entries(views)) {
      place();
      const on = await measure();
      near.visible = false;
      const hide = g.zones.hallu.frame;
      g.zones.hallu.frame = () => {};
      const off = await measure();
      g.zones.hallu.frame = hide;
      near.visible = true;
      out[name] = { calls: on.calls - off.calls, triangles: on.triangles - off.triangles };
    }
    g.debug.freecam(true);
    g.debug.flycam.setPose(0, 39.7, 0, Math.atan2(-330, -600), 0);
    const hubOn = await measure();
    near.visible = false;
    const hide = g.zones.hallu.frame;
    g.zones.hallu.frame = () => {};
    const hubOff = await measure();
    g.zones.hallu.frame = hide;
    near.visible = true;
    out.hub = { calls: hubOn.calls - hubOff.calls, triangles: hubOn.triangles - hubOff.triangles };
    g.debug.freecam(false);
    return out;
  });
  check('boot: zero console errors/warnings', log.errors.length === 0 && log.warnings.length === 0, `${log.errors.length} errors, ${log.warnings.length} warnings ${[...log.errors, ...log.warnings].slice(0, 2).join(' | ')}`);
  for (const k of ['arrival', 'pillar']) check(`budget inside (${k}) ≤ 60 draws, ≤ 300k tris`, budget[k].calls <= 60 && budget[k].triangles <= 300000, `${budget[k].calls} draws, ${budget[k].triangles} tris`);
  check('budget from the hub ≤ 10 draws', budget.hub.calls <= 10, `${budget.hub.calls} draws, ${budget.hub.triangles} tris`);
  await page.close();
}

// 2a. completability by route B (scan, read the stones, jump)
if (want('2a')) {
  const { page, log, run } = await open();
  const res = await run(async () => {
    const { g, Z, step, frame, walkTo, hopTo, scan, visibleReal } = window.__T;
    const out = { hops: [], fallsOnFake: 0 };
    g.player.teleport(...Z.spawn);
    step(30);
    await scan();
    out.scanFlag = g.state.flag('zone.hallu.scan');
    const F = Z.layout;
    const jetty = Z.layout.jettyStart;
    g.player.teleport(jetty[0], jetty[1], jetty[2], 0);
    step(30);
    await walkTo(F.jettyEnd[0], F.jettyEnd[2]);
    let from = F.jettyEnd;
    for (let k = 0; k < Z.layout.stepsB; k++) {
      await scan();
      const candidates = visibleReal(`b${k}`);
      if (candidates.length !== 1) {
        out.ambiguous = { k, n: candidates.length };
        break;
      }
      const target = candidates[0].pos;
      const hop = await hopTo(target, { from });
      out.hops.push(hop.landed);
      if (!hop.landed) {
        out.failedAt = { k, hop };
        break;
      }
      from = target;
    }
    const L = Z.layout.landingBPoint;
    if (out.hops.length === Z.layout.stepsB && out.hops.every(Boolean)) {
      const land = await hopTo(L, { from });
      out.landed = land.landed;
      await walkTo(L[0] + (330 - L[0]) * 0.5, L[2] + (600 - L[2]) * 0.5, { tol: 1 });
    }
    out.cross = g.state.flag('zone.hallu.cross');
    out.ready = g.state.beacons.hallu;
    const b = g.beacons.get('hallu');
    const V = g.player.position.constructor;
    const front = new V(0, 0, 2.2).applyMatrix4(b.matrix);
    await walkTo(front.x, front.z, { tol: 0.4 });
    window.__T.face(b.ringPos.x, b.ringPos.z);
    g.player.pitch = 0;
    step(10);
    await frame();
    out.prompt = g.interact.current?.label || null;
    await window.__T.press('KeyE');
    for (let i = 0; i < 600 && !window.__T.events.some((e) => e.type === 'beacon:activated'); i++) await new Promise((r) => setTimeout(r, 50));
    out.active = g.state.beacons.hallu;
    out.activatedEvent = window.__T.events.some((e) => e.type === 'beacon:activated' && e.zone === 'hallu');
    return out;
  });
  check('route B: first scan in the zone sets zone.hallu.scan', res.scanFlag === true);
  check('route B: every step had exactly one stone left standing after a scan', !res.ambiguous, JSON.stringify(res.ambiguous || ''));
  check('route B: all jumps landed on real stones', res.hops.length > 0 && res.hops.every(Boolean) && !res.failedAt, `${res.hops.length} hops ${res.failedAt ? JSON.stringify(res.failedAt) : ''}`);
  check('route B: reaching the pillar sets cross + beacon ready', res.cross === true && (res.ready === 'ready' || res.ready === 'active'));
  check('route B: E on the beacon relights it', res.active === 'active' && res.activatedEvent, `prompt "${res.prompt}", status ${res.active}`);
  check('route B: no console errors', log.errors.length === 0, log.errors.slice(0, 2).join(' | '));
  await page.close();
}

// 2b. completability by route C (rope bridge, then the hidden slabs revealed by scans)
if (want('2b')) {
  const { page, log, run } = await open();
  const res = await run(async () => {
    const { g, Z, step, walkTo, hopTo, scan } = window.__T;
    const out = { hops: [] };
    const L = Z.layout;
    g.player.teleport(L.ropeStart[0], L.ropeStart[1], L.ropeStart[2], 0);
    step(60);
    const rest = Z.rope.segments.map((s) => s.position.y);
    out.restLow = Math.min(...rest);
    let minUnder = Infinity;
    const watch = () => {
      for (const s of Z.rope.segments) minUnder = Math.min(minUnder, s.position.y);
    };
    window.__T.face(L.rockPoint[0], L.rockPoint[2]);
    await window.__T.hold('KeyW', true);
    for (let i = 0; i < 60 * 12 && window.__T.hd(L.rockPoint[0], L.rockPoint[2]) > 1.2; i++) {
      window.__T.face(L.rockPoint[0], L.rockPoint[2]);
      step(1);
      watch();
      if (g.player.position.y < 30) break;
    }
    await window.__T.hold('KeyW', false);
    step(20);
    out.onRock = window.__T.hd(L.rockPoint[0], L.rockPoint[2]) < 2.5 && Math.abs(g.player.position.y - L.rockY) < 0.6;
    out.endPos = [g.player.position.x, g.player.position.y, g.player.position.z, L.rockPoint, L.rockY];
    out.sagUnderPlayer = out.restLow - minUnder;
    out.ropeResets = Z.rope.resets;
    let from = L.rockPoint;
    const hidden = Z.stones.list.filter((e) => e.kind === 'hidden' && e.group.startsWith('c')).sort((a, b) => a.group.localeCompare(b.group));
    out.invisibleBefore = hidden.every((e) => e.phase === 'gone');
    for (let k = 0; k < hidden.length && out.onRock; k++) {
      const e = hidden[k];
      if (e.phase !== 'solid' || e.t > 6) await scan();
      if (k === 0) out.visibleAfterScan = hidden.slice(0, 3).every((h) => h.phase === 'solid' || h.phase === 'appear');
      const hop = await hopTo(e.pos, { from, fromRadius: k === 0 ? 3.3 : 1.4 });
      out.hops.push(hop.landed);
      if (!hop.landed) {
        out.failedAt = { k, hop, phase: e.phase };
        break;
      }
      from = e.pos;
    }
    if (out.hops.length === hidden.length && out.hops.every(Boolean)) {
      const land = await hopTo(L.landingCPoint, { from });
      out.landed = land.landed;
      await walkTo(330, 600, { tol: 8 });
    }
    out.cross = g.state.flag('zone.hallu.cross');
    out.ready = g.state.beacons.hallu;
    out.bridgeReal = Z.bridge.real;
    return out;
  });
  check('route C: rope bridge carries the player across to the rock', res.onRock, `${JSON.stringify(res.endPos)} sag under the player ${res.sagUnderPlayer?.toFixed(2)} m, resets ${res.ropeResets}`);
  check('route C: rope bridge sags under the player and never resets', res.sagUnderPlayer > 0.05 && res.ropeResets === 0);
  check('route C: hidden slabs are invisible until a scan reveals them', res.invisibleBefore && res.visibleAfterScan);
  check('route C: every jump on the hidden slabs landed', res.hops.length === 6 && res.hops.every(Boolean) && res.landed, JSON.stringify(res.failedAt || ''));
  check('route C: pillar reached, beacon ready, return bridge made real', res.cross && res.ready === 'ready' && res.bridgeReal);
  check('route C: no console errors', log.errors.length === 0, log.errors.slice(0, 2).join(' | '));
  await page.close();
}

// 2d. the rope bridge survives crates slammed into it
if (want('2d')) {
  const { page, log, run } = await open();
  const res = await run(async () => {
    const { g, Z, step } = window.__T;
    const segs = Z.rope.segments;
    g.player.teleport(...Z.layout.ropeStart);
    step(60 * 6);
    const rest = segs.map((sg) => ({ position: sg.position.clone() }));
    const mid = segs[11].position.clone();
    const crates = [];
    for (let i = 0; i < 4; i++) {
      const c = g.props.crate([mid.x + (i - 1.5) * 0.3, mid.y + 6 + i * 1.5, mid.z], { size: 1 });
      c.setVelocity([(i % 2 ? 1 : -1) * 6, -35, 0]);
      crates.push(c);
    }
    let maxV = 0;
    let maxDev = 0;
    for (let i = 0; i < 60 * 6; i++) {
      step(1);
      segs.forEach((sg, k) => {
        const v = sg.body.linvel();
        maxV = Math.max(maxV, Math.hypot(v.x, v.y, v.z));
        maxDev = Math.max(maxDev, sg.position.distanceTo(rest[k].position));
      });
    }
    for (const c of crates) {
      c.remove();
      g.scene.remove(c.mesh);
    }
    step(60 * 8);
    let settle = 0;
    segs.forEach((sg, k) => {
      settle = Math.max(settle, sg.position.distanceTo(rest[k].position));
    });
    const finite = segs.every((sg) => Number.isFinite(sg.position.x + sg.position.y + sg.position.z));
    return { maxV, maxDev, settle, finite, resets: Z.rope.resets };
  });
  check('rope bridge: crates slammed into it never launch it (|v| ≤ 7 m/s, stays within 9 m of rest)', res.finite && res.maxV <= 7.5 && res.maxDev < 9, JSON.stringify(res));
  check('rope bridge: settles back near its rest shape', res.settle < 0.6, `${res.settle.toFixed(2)} m`);
  check('rope bridge stress: no console errors', log.errors.length === 0, log.errors.slice(0, 2).join(' | '));
  await page.close();
}

// 2c. the trap: the grand bridge drops the player, who comes back to the real part
if (want('2c')) {
  const { page, log, run } = await open();
  const res = await run(async () => {
    const { g, Z, step } = window.__T;
    const said = [];
    const say = g.companion.say.bind(g.companion);
    g.companion.say = (key, o) => {
      said.push(key);
      return say(key, o);
    };
    g.player.teleport(...Z.spawn);
    step(30);
    await window.__T.hold('KeyW', true);
    let fell = false;
    for (let i = 0; i < 60 * 14; i++) {
      g.player.yaw = Z.spawn[3];
      step(1);
      if (g.player.respawning || window.__T.events.some((e) => e.type === 'player:respawn')) {
        fell = true;
        break;
      }
    }
    await window.__T.hold('KeyW', false);
    for (let i = 0; i < 80 && !window.__T.events.some((e) => e.type === 'player:respawn'); i++) await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 40 && g.player.respawning; i++) await new Promise((r) => setTimeout(r, 50));
    step(30);
    const p = g.player.position;
    const r = Math.hypot(p.x - 330, p.z - 600);
    return { fell, said, r, y: p.y, deck: Z.bridgeDeckY(r), reason: window.__T.events.find((e) => e.type === 'player:respawn') };
  });
  check('trap: Tiret is sure the bridge exists', res.said.includes('zone.hallu.sure'), res.said.join(','));
  check('trap: the bridge gives way and the player respawns', res.fell);
  check('trap: respawn lands back on solid ground of the rim/real span', res.r > 91 && Math.abs(res.y - res.deck) < 1.2, `r ${res.r.toFixed(1)} y ${res.y.toFixed(2)} deck ${res.deck.toFixed(2)}`);
  check('trap: Tiret apologises after the fall', res.said.includes('zone.hallu.fall'));
  check('trap: no console errors', log.errors.length === 0, log.errors.slice(0, 2).join(' | '));
  await page.close();
}

// 3. debugSolve on a fresh boot
if (want('3')) {
  const { page, log, run } = await open();
  const res = await run(async () => {
    const { g, Z } = window.__T;
    let opened = false;
    g.events.on('mode:change', ({ to }) => {
      if (to === 'reading') opened = true;
    });
    const status = Z.debugSolve();
    const ready = g.state.beacons.hallu;
    g.beacons.activate('hallu');
    for (let i = 0; i < 400 && !opened; i++) await new Promise((r) => setTimeout(r, 50));
    return { status, ready, active: g.state.beacons.hallu, event: window.__T.events.some((e) => e.type === 'beacon:activated' && e.zone === 'hallu'), opened, flags: ['scan', 'cross', 'beacon'].map((k) => g.state.flag(`zone.hallu.${k}`)) };
  });
  check('debugSolve leaves the beacon ready', res.ready === 'ready');
  check('activation: state active + beacon:activated + document opened', res.active === 'active' && res.event && res.opened, JSON.stringify(res));
  check('objective flags scan/cross/beacon all set', res.flags.every(Boolean), JSON.stringify(res.flags));
  check('debugSolve: no console errors', log.errors.length === 0, log.errors.slice(0, 2).join(' | '));
  await page.close();
}

// 4. reload with the solved state
if (want('4')) {
  const first = await open('mute=1');
  await first.run(async () => {
    const { g, Z } = window.__T;
    Z.debugSolve();
    g.beacons.activate('hallu');
    for (let i = 0; i < 400 && g.state.beacons.hallu !== 'active'; i++) await new Promise((r) => setTimeout(r, 50));
    g.state.save();
  });
  await first.page.waitForTimeout(500);
  await first.page.close();
  const { page, log, run } = await open('mute=1', false);
  const res = await run(() => {
    const { g, Z } = window.__T;
    return { status: g.state.beacons.hallu, real: Z.bridge.real, cross: g.state.flag('zone.hallu.cross'), beacon: g.beacons.get('hallu').status };
  });
  check('reload: zone rebuilt solved (beacon active, return bridge real)', res.status === 'active' && res.real && res.cross && res.beacon === 'active', JSON.stringify(res));
  check('reload: no console errors', log.errors.length === 0, log.errors.slice(0, 2).join(' | '));
  await page.evaluate(() => localStorage.clear());
  await page.close();
}

// 5. 60 s of random input inside the zone
if (want('5')) {
  const { page, log, run } = await open();
  const res = await run(async () => {
    const { g, Z, step } = window.__T;
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'KeyF', 'KeyE'];
    const spots = [Z.spawn, Z.layout.jettyStart, Z.layout.ropeStart, Z.layout.rockPoint, Z.layout.landingBPoint, [330, 50.4, 606]];
    let rnd = 12345;
    const rand = () => {
      rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
      return rnd / 0x7fffffff;
    };
    let bad = null;
    let below = 0;
    let t = 0;
    let spot = 0;
    while (t < 60) {
      if (t % 10 < 0.5 && Math.floor(t / 10) !== spot - 1) {
        const s = spots[spot % spots.length];
        g.player.teleport(s[0], s[1], s[2], rand() * 6.28);
        spot++;
      }
      for (const k of keys) g.input.simulate(k, rand() < (k === 'KeyW' ? 0.6 : 0.25));
      g.player.yaw += (rand() - 0.5) * 1.2;
      g.player.pitch = (rand() - 0.5) * 1.2;
      await window.__T.frame();
      const n = 10 + Math.floor(rand() * 30);
      for (let i = 0; i < n; i++) {
        step(1);
        const p = g.player.position;
        if (!Number.isFinite(p.x + p.y + p.z)) bad = 'NaN';
        if (p.y < g.world.heightAt(p.x, p.z) - 0.6) below++;
      }
      t += n / 60;
      if (g.state.mode !== 'playing') {
        g.state.setMode('playing');
      }
    }
    for (const k of keys) g.input.simulate(k, false);
    return { bad, below, resets: Z.rope.resets };
  });
  check('random input 60 s: no NaN, never below the terrain', !res.bad && res.below === 0, JSON.stringify(res));
  check('random input: no console errors', log.errors.length === 0, log.errors.slice(0, 2).join(' | '));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
