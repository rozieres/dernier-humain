import { launch, openPage, waitFor } from '../tools/browser.mjs';

const BASE = process.env.FOREST_URL || 'http://127.0.0.1:5226/dev/forest.html';
let failures = 0;
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
  const Z = g.zones.forest;
  const T = {
    g, Z, keys: new Set(), log: { indexed: 0, sfx: [], activated: 0, respawns: [] },
    hold(code, down = true) {
      g.input.simulate(code, down);
      if (down) T.keys.add(code);
      else T.keys.delete(code);
    },
    releaseAll() {
      for (const k of [...T.keys]) T.hold(k, false);
    },
    frame() {
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    },
    sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
    },
    step(n = 1) {
      for (let i = 0; i < n; i++) g.debug.advance(1 / 60);
    },
    closeReader() {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    },
    async press(code = 'KeyE') {
      g.input.simulate(code, true);
      await T.frame();
      g.input.simulate(code, false);
      await T.frame();
    },
    aimAt(x, y, z) {
      const e = g.player.eye;
      g.player.yaw = Math.atan2(-(x - e.x), -(z - e.z));
      g.player.pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z));
    },
    dronePosAt(d, t) {
      if (d.tracking) return d.pos;
      const r = d.route;
      const u = ((((d.s + 3.5 * t) / r.length) % 1) + 1) % 1 * r.n;
      const i = Math.floor(u);
      const a = r.samples[i];
      const b = r.samples[(i + 1) % r.n];
      const f = u - i;
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
    },
    safe(path, speed, margin) {
      const total = path.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : 0), 0);
      const dur = total / speed + 1.5;
      for (let t = 0; t <= dur; t += 0.25) {
        let left = Math.min(total, t * speed);
        let p = path[path.length - 1];
        for (let i = 1; i < path.length; i++) {
          const L = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
          if (left <= L) {
            const k = L > 0 ? left / L : 1;
            p = [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * k, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * k];
            break;
          }
          left -= L;
        }
        for (const d of Z.crawlers.drones) {
          const q = T.dronePosAt(d, t);
          if (Math.hypot(q.x - p[0], q.z - p[1]) < margin) return false;
        }
      }
      return true;
    },
    async walkTo(x, z, { sprint = true, tol = 0.9, timeout = 30 } = {}) {
      const p = g.player.position;
      let last = Math.hypot(x - p.x, z - p.z);
      let stuck = 0;
      let t = 0;
      T.hold('KeyW');
      if (sprint) T.hold('ShiftLeft');
      await T.frame();
      while (Math.hypot(x - p.x, z - p.z) > tol && t < timeout) {
        g.player.yaw = Math.atan2(-(x - p.x), -(z - p.z));
        g.player.pitch = 0;
        T.step(6);
        t += 0.1;
        const d = Math.hypot(x - p.x, z - p.z);
        stuck = d > last - 0.05 ? stuck + 0.1 : 0;
        last = d;
        if (stuck > 0.6) {
          T.hold('Space');
          T.hold('KeyD');
          await T.frame();
          T.step(15);
          T.hold('Space', false);
          T.hold('KeyD', false);
          await T.frame();
          stuck = 0;
        }
      }
      T.releaseAll();
      await T.frame();
      T.step(6);
      return Math.hypot(x - p.x, z - p.z) <= tol + 0.3;
    },
    async sneak(points, { margin = 23, maxWait = 240 } = {}) {
      const speed = 8.4;
      let waited = 0;
      let i = 0;
      const p = g.player.position;
      while (i < points.length) {
        const leg = [[p.x, p.z]];
        let j = i;
        let len = 0;
        while (j < points.length && len < 18) {
          const prev = leg[leg.length - 1];
          len += Math.hypot(points[j][0] - prev[0], points[j][1] - prev[1]);
          leg.push(points[j]);
          j++;
        }
        if (T.safe(leg, speed, margin)) {
          for (let k = i; k < j; k++) {
            const ok = await T.walkTo(points[k][0], points[k][1]);
            if (!ok) return { ok: false, at: k, waited };
          }
          i = j;
          continue;
        }
        if (!T.safe([[p.x, p.z], [p.x, p.z]], speed, margin) && i > 0) {
          await T.walkTo(points[i - 1][0], points[i - 1][1]);
          i = Math.max(0, i - 1);
        }
        T.step(15);
        waited += 0.25;
        if (waited > maxWait) return { ok: false, at: i, waited, timeout: true };
        await new Promise((r) => setTimeout(r, 0));
      }
      return { ok: true, waited };
    },
  };
  const sfx = g.audio.sfx;
  g.audio.sfx = (name, opts) => {
    T.log.sfx.push({ name, t: g.time.now });
    return sfx.call(g.audio, name, opts);
  };
  g.events.on('player:indexed', () => T.log.indexed++);
  g.events.on('player:respawn', (e) => T.log.respawns.push(e?.reason));
  g.events.on('beacon:activated', (e) => {
    if (e?.zone === 'forest') T.log.activated++;
  });
  window.__T = T;
};

const { browser, context } = await launch({ width: 1280, height: 720 });
await context.route(/\/@vite\/client/, (route) => route.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));

async function open(query, { clear = true } = {}) {
  const res = await openPage(context, `${BASE}?mute=1&stage=0${query}`, { quiet: true });
  if (clear) await res.page.evaluate(() => localStorage.clear());
  await waitFor(res.page, 'window.__game?.ready', 90000);
  await res.page.waitForTimeout(1200);
  return res;
}

const POSES = {
  inside: [[-602, -335, 1.2], [-602, -335, 3.0], [-500, -270, 1.0], [-700, -330, -1.4]],
  hub: [[0, 0, 1.08]],
};

async function measure(page) {
  return page.evaluate(async (poses) => {
    const g = window.__game;
    const out = {};
    for (const [key, list] of Object.entries(poses)) {
      let calls = 0;
      let tris = 0;
      for (const [x, z, yaw] of list) {
        const y = key === 'hub' ? 38.2 : g.world.heightAt(x, z);
        g.player.teleport(x, y, z, yaw);
        g.player.pitch = key === 'hub' ? 0.02 : 0;
        for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(r));
        const s = g.debug.stats();
        calls = Math.max(calls, s.calls);
        tris = Math.max(tris, s.triangles);
      }
      out[key] = { calls, tris };
    }
    return out;
  }, POSES);
}

// 1. boot + budget
{
  const { page: base } = await open('&nosave=1&zones=none');
  const b = await measure(base);
  await base.close();
  const { page, log } = await open('&nosave=1');
  const z = await measure(page);
  check('boots with zero console errors/warnings', log.errors.length === 0 && log.warnings.length === 0, `${log.errors.length} errors, ${log.warnings.length} warnings ${log.errors.slice(0, 2).join(' | ')}`);
  const inCalls = z.inside.calls - b.inside.calls;
  const inTris = z.inside.tris - b.inside.tris;
  const hubCalls = z.hub.calls - b.hub.calls;
  const hubTris = z.hub.tris - b.hub.tris;
  check('inside the zone: ≤ 60 draw calls added', inCalls <= 60, `${inCalls} calls (${z.inside.calls} vs ${b.inside.calls})`);
  check('inside the zone: ≤ 300k triangles added', inTris <= 300000, `${(inTris / 1000).toFixed(0)}k`);
  check('from the hub: ≤ 10 draw calls added', hubCalls <= 10, `${hubCalls} calls, ${(hubTris / 1000).toFixed(0)}k tris`);
  console.log(`STATS inside +${inCalls} calls +${(inTris / 1000).toFixed(0)}k tris · hub +${hubCalls} calls +${(hubTris / 1000).toFixed(1)}k tris`);
  await page.close();
}

// 2. completability, stealth checks, random input
{
  const { page, log } = await open('&nosave=1');
  await page.evaluate(HELPERS);

  const toFire = await page.evaluate(async () => {
    const { g, Z } = window.__T;
    const s = Z.spawn;
    g.player.teleport(s[0], s[1], s[2], s[3]);
    window.__T.step(30);
    const path = [[-446, -238], [-470, -252], [-500, -270], [-516, -284], [-548, -298], [-578, -312], [-601, -320], [-608, -323]];
    const res = await window.__T.sneak(path);
    return { ...res, campfire: g.state.flag('zone.forest.campfire'), indexed: window.__T.log.indexed, pos: [g.player.position.x, g.player.position.z] };
  });
  check('walks from the arrival to the campfire between patrols', toFire.ok && toFire.campfire && toFire.indexed === 0, JSON.stringify(toFire));

  const forum = await page.evaluate(async () => {
    const T = window.__T;
    const { g, Z } = T;
    const target = Z.terminalScreen;
    const dir = { x: Z.fire[0] - target.x, z: Z.fire[1] - target.z };
    const l = Math.hypot(dir.x, dir.z);
    await T.walkTo(target.x + (dir.x / l) * 1.3, target.z + (dir.z / l) * 1.3, { sprint: false, tol: 0.5 });
    T.aimAt(target.x, target.y, target.z);
    T.step(2);
    await T.frame();
    const label = g.interact.current?.label;
    await T.press('KeyE');
    await T.frame();
    const mode = g.state.mode;
    window.__T.closeReader();
    await T.frame();
    return { label, mode, forum: g.state.flag('zone.forest.forum'), after: g.state.mode };
  });
  check('"Lire" on the terminal opens the forum post', forum.label === 'Lire' && forum.mode === 'reading' && forum.forum && forum.after === 'playing', JSON.stringify(forum));

  const toDoor = await page.evaluate(async () => {
    const T = window.__T;
    const { g, Z } = T;
    const door = Z.cabins[Z.right].door;
    await T.walkTo(-618, -332, { sprint: false });
    const c = Z.cabins[Z.right];
    const front = [door.x + Math.sin(c.yaw) * 1.4, door.z + Math.cos(c.yaw) * 1.4];
    const path = [[-624, -338], [-646, -362], [-668, -392], [-690, -414], [-712, -428], [-728, -436], [-744, -444], front];
    const res = await T.sneak(path);
    return { ...res, indexed: T.log.indexed, dist: Math.hypot(g.player.position.x - door.x, g.player.position.z - door.z) };
  });
  check('sneaks from the campfire to the door that stays lit', toDoor.ok && toDoor.indexed === 0, JSON.stringify(toDoor));

  const knock = await page.evaluate(async () => {
    const T = window.__T;
    const { g, Z } = T;
    const c = Z.cabins[Z.right];
    const lifeBefore = Z.life(Z.right);
    T.aimAt(c.doorFace.x, c.doorFace.y, c.doorFace.z);
    T.step(2);
    await T.frame();
    const label = g.interact.current?.label;
    const t0 = g.time.now;
    for (let k = 0; k < 3; k++) {
      await T.press('KeyE');
      T.step(30);
    }
    const knocks = T.log.sfx.filter((s) => s.name === 'knock' && s.t >= t0).length;
    T.step(60);
    const earlyReply = T.log.sfx.some((s) => s.name === 'knock.reply');
    T.step(80);
    const reply = T.log.sfx.find((s) => s.name === 'knock.reply');
    const lastKnock = T.log.sfx.filter((s) => s.name === 'knock').pop();
    T.step(60 * 5);
    const slide = T.log.sfx.find((s) => s.name === 'note.slide');
    const seq = Z.sequence;
    const note = g.scene.getObjectByName('forest:note');
    T.aimAt(note.position.x, note.position.y, note.position.z);
    T.step(2);
    await T.frame();
    const label2 = g.interact.current?.label;
    await T.press('KeyE');
    await T.frame();
    const mode = g.state.mode;
    window.__T.closeReader();
    await T.frame();
    return {
      label, knocks, earlyReply, silence: reply && lastKnock ? +(reply.t - lastKnock.t).toFixed(2) : null, slideGap: slide && reply ? +(slide.t - reply.t).toFixed(2) : null,
      seq, label2, mode, door: g.state.flag('zone.forest.door'), beacon: g.state.beacons.forest, lifeBefore, lifeAfter: Z.life(Z.right),
    };
  });
  check('the lit window stays lit up close', knock.lifeBefore > 0.95 && knock.lifeAfter > 0.95, `${knock.lifeBefore} → ${knock.lifeAfter}`);
  check('three knocks → silence → reply knock → note slides out', knock.label === 'Frapper' && knock.knocks === 3 && !knock.earlyReply && knock.silence >= 2 && knock.slideGap >= 2.5 && knock.seq === 'done', JSON.stringify(knock));
  check('"Lire le mot" opens the note, sets the flag, beacon ready', knock.label2 === 'Lire le mot' && knock.mode === 'reading' && knock.door && knock.beacon === 'ready', JSON.stringify(knock));

  const back = await page.evaluate(async () => {
    const T = window.__T;
    const { g, Z } = T;
    const path = [[-744, -444], [-728, -436], [-712, -428], [-690, -414], [-668, -392], [-646, -362], [-624, -338]];
    const res = await T.sneak(path);
    const b = Z.beacon.position;
    const front = { x: b.x + Math.sin(Z.beaconYaw) * 1.6, z: b.z + Math.cos(Z.beaconYaw) * 1.6 };
    await T.walkTo(front.x, front.z, { sprint: false, tol: 0.5 });
    T.aimAt(b.x, b.y + 1.4, b.z);
    T.step(2);
    await T.frame();
    const label = g.interact.current?.label;
    await T.press('KeyE');
    for (let i = 0; i < 400 && g.state.mode !== 'reading'; i++) await T.sleep(50);
    const mode = g.state.mode;
    window.__T.closeReader();
    await T.frame();
    return { ...res, label, mode, status: g.state.beacons.forest, activated: T.log.activated, indexed: T.log.indexed, flag: g.state.flag('zone.forest.beacon') };
  });
  check('comes back and relights the beacon with E', back.ok && back.status === 'active' && back.activated === 1 && back.mode === 'reading', JSON.stringify(back));

  const cabinOff = await page.evaluate(async () => {
    const T = window.__T;
    const { g, Z } = T;
    const c = Z.cabins[3];
    Z.pauseDetection(120);
    g.player.teleport(c.cfg.x + 60, g.world.heightAt(c.cfg.x + 60, c.cfg.z), c.cfg.z, 0);
    T.step(60 * 30);
    const before = Z.life(3);
    const t0 = g.time.now;
    g.player.teleport(c.door.x + 14, g.world.heightAt(c.door.x + 14, c.door.z), c.door.z, 0);
    T.step(30);
    const mid = Z.life(3);
    T.step(90);
    const after = Z.life(3);
    const off = T.log.sfx.filter((s) => s.name === 'cabin.off' && s.t >= t0).length;
    g.player.teleport(c.cfg.x + 70, g.world.heightAt(c.cfg.x + 70, c.cfg.z), c.cfg.z, 0);
    T.step(60 * 10);
    const stillOff = Z.life(3);
    T.step(60 * 30);
    return { before, mid, after, off, stillOff, back: Z.life(3) };
  });
  check('a cabin fades to dark within ~2 s when approached (cabin.off once)', cabinOff.before > 0.95 && cabinOff.mid > 0.05 && cabinOff.after < 0.02 && cabinOff.off === 1, JSON.stringify(cabinOff));
  check('the cabin relights after a while far away', cabinOff.stillOff < 0.05 && cabinOff.back > 0.95, JSON.stringify(cabinOff));

  const beam = await page.evaluate(async () => {
    const T = window.__T;
    const { g, Z } = T;
    Z.pauseDetection(0);
    T.step(60 * 3);
    const n0 = T.log.indexed;
    let filled = 0;
    let t = 0;
    for (const d of Z.crawlers.drones) {
      const p = Z.crawlers.groundUnder(d);
      g.player.teleport(p.x, g.world.heightAt(p.x, p.z), p.z, 0);
      filled = 0;
      for (t = 0; t < 4 && T.log.indexed === n0; t += 0.05) {
        T.step(3);
        filled = Math.max(filled, Z.gauge);
      }
      if (T.log.indexed > n0) break;
      T.step(60 * 4);
    }
    const tFill = t;
    for (let i = 0; i < 80 && g.player.respawning !== false; i++) await T.sleep(50);
    for (let i = 0; i < 80 && g.player.respawning; i++) await T.sleep(50);
    T.step(10);
    const e = Z.edge;
    return {
      indexed: T.log.indexed - n0, tFill: +tFill.toFixed(2), filled, gauge: Z.gauge,
      distEdge: Math.hypot(g.player.position.x - e.x, g.player.position.z - e.z), reason: T.log.respawns.at(-1),
      alarm: T.log.sfx.some((s) => s.name === 'alarm'), progress: g.state.flag('zone.forest.door') && g.state.flag('zone.forest.forum'),
    };
  });
  check('standing in a beam fills the gauge in ~1.6 s', beam.indexed === 1 && beam.tFill > 1.3 && beam.tFill < 2.4, JSON.stringify(beam));
  check('indexed → alarm, back to the forest edge, progress kept', beam.alarm && beam.distEdge < 3 && beam.reason === 'indexed' && beam.progress, JSON.stringify(beam));

  const cover = await page.evaluate(async () => {
    const T = window.__T;
    const { g, Z } = T;
    let best = null;
    for (const d of Z.crawlers.drones) {
      for (const t of g.vegetation.treesNear(d.pos.x, d.pos.z, 12)) {
        const dx = t.x - d.pos.x;
        const dz = t.z - d.pos.z;
        const h = Math.hypot(dx, dz);
        if (h > 4 && h < 9 && t.radius > 0.3 && (!best || t.radius > best.t.radius)) best = { d, t, h };
      }
    }
    if (!best) return { found: false };
    const { d, t } = best;
    d.tracking = true;
    d.lost = 0;
    const ux = (t.x - d.pos.x) / best.h;
    const uz = (t.z - d.pos.z) / best.h;
    const hide = { x: t.x + ux * (t.radius + 0.5), z: t.z + uz * (t.radius + 0.5) };
    g.player.teleport(hide.x, g.world.heightAt(hide.x, hide.z), hide.z, 0);
    for (let i = 0; i < 40; i++) {
      d.lost = 0;
      d.tracking = true;
      T.step(3);
    }
    const hidden = Z.gauge;
    const seenHidden = d.seen;
    const side = { x: hide.x - uz * 2.2, z: hide.z + ux * 2.2 };
    g.player.teleport(side.x, g.world.heightAt(side.x, side.z), side.z, 0);
    let exposed = 0;
    const n0 = T.log.indexed;
    for (let i = 0; i < 60 && T.log.indexed === n0; i++) {
      d.lost = 0;
      d.tracking = true;
      T.step(3);
      exposed = Math.max(exposed, Z.gauge);
    }
    return { found: true, hidden, seenHidden, exposed, radius: t.radius, drone: d.i };
  });
  check('a trunk between drone and player blocks detection', cover.found && cover.hidden === 0 && !cover.seenHidden && cover.exposed > 0.2, JSON.stringify(cover));

  const random = await page.evaluate(async () => {
    const T = window.__T;
    const { g, Z } = T;
    T.releaseAll();
    g.player.teleport(-610, g.world.heightAt(-610, -340), -340, 0);
    T.step(10);
    const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space', 'KeyE', 'KeyF'];
    let bad = 0;
    let below = 0;
    let readings = 0;
    for (let k = 0; k < 600; k++) {
      for (const c of codes) if (Math.random() < 0.15) T.hold(c, !T.keys.has(c));
      g.player.yaw += (Math.random() - 0.5) * 0.6;
      if (k % 5 === 0) await T.frame();
      T.step(6);
      if (g.state.mode === 'reading') {
        readings++;
        window.__T.closeReader();
      }
      const p = g.player.position;
      if (![p.x, p.y, p.z, Z.gauge].every(Number.isFinite)) bad++;
      if (p.y < g.world.heightAt(p.x, p.z) - 0.5) below++;
      if (k % 50 === 0) await T.frame();
    }
    T.releaseAll();
    return { bad, below, readings };
  });
  check('60 s of random input: no NaN, never below the terrain', random.bad === 0 && random.below === 0, JSON.stringify(random));
  check('no console errors during the run', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  await page.close();
}

// 3. debugSolve + 4. reload with the solved state
{
  const { page, log } = await open('');
  await page.evaluate(HELPERS);
  const solve = await page.evaluate(async () => {
    const T = window.__T;
    const { g } = T;
    const status = g.debug.solve('forest');
    g.state.save();
    const ready = g.state.beacons.forest;
    g.beacons.activate('forest');
    for (let i = 0; i < 200 && g.state.mode !== 'reading'; i++) await T.sleep(50);
    const mode = g.state.mode;
    const doc = document.querySelector('#ui')?.textContent?.includes('Forum des Veilleurs');
    window.__T.closeReader();
    await T.frame();
    return { status, ready, mode, doc, active: g.state.beacons.forest, activated: T.log.activated };
  });
  check('debugSolve() leaves the beacon ready', solve.ready === 'ready', JSON.stringify(solve));
  check('activation → active, beacon:activated, document opens', solve.active === 'active' && solve.activated === 1 && solve.mode === 'reading' && solve.doc, JSON.stringify(solve));
  await page.evaluate(() => {
    const g = window.__game;
    g.state.setBeacon('forest', 'ready');
    g.state.save();
  });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, 'window.__game?.ready', 90000);
  await page.waitForTimeout(800);
  const reload = await page.evaluate(async () => {
    const g = window.__game;
    for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
    return { status: g.state.beacons.forest, seq: g.zones.forest.sequence, note: g.scene.getObjectByName('forest:note')?.visible, door: g.state.flag('zone.forest.door') };
  });
  check('reload with the solved state rebuilds the zone solved', reload.seq === 'done' && reload.note && reload.door, JSON.stringify(reload));
  check('no console errors (solve/reload)', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  await page.evaluate(() => localStorage.clear());
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
