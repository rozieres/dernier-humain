import { launch, openPage, waitFor } from '../tools/browser.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5215';
const URL = process.env.PLAYER_URL || `${BASE}/dev/player.html`;
let failures = 0;
const results = [];
function check(label, ok, detail = '') {
  const line = `${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`;
  results.push(line);
  console.log(line);
  if (!ok) failures++;
}

const HELPERS = () => {
  const g = window.__game;
  const T = {
    g,
    keys: new Set(),
    hold(code, down = true) {
      g.input.simulate(code, down);
      if (down) T.keys.add(code);
      else T.keys.delete(code);
    },
    frame() {
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    },
    releaseAll() {
      for (const k of [...T.keys]) T.hold(k, false);
    },
    step(n = 1) {
      for (let i = 0; i < n; i++) g.debug.advance(1 / 60);
    },
    async settle(sec = 0.3) {
      T.step(Math.round(sec * 60));
      await new Promise((r) => setTimeout(r, 0));
    },
    place(x, z, yaw = 0, y) {
      const h = y ?? g.world.heightAt(x, z);
      g.player.teleport(x, h, z, yaw);
      T.step(2);
    },
    aimAt(x, y, z) {
      const e = g.player.eye;
      const dx = x - e.x;
      const dy = y - e.y;
      const dz = z - e.z;
      g.player.yaw = Math.atan2(-dx, -dz);
      g.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      T.step(1);
    },
    feet() {
      return g.player.position.clone();
    },
    hdist(a, b) {
      return Math.hypot(a.x - b.x, a.z - b.z);
    },
    events: [],
  };
  for (const type of ['player:jump', 'player:land', 'player:glide', 'player:respawn', 'scan:start', 'scan:hit', 'scan:end', 'grab:start', 'grab:end', 'link:ride:start', 'link:ride:end', 'link:restored']) {
    g.events.on(type, (p) => T.events.push({ type, p, t: g.time.now }));
  }
  window.__T = T;
};

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

const { browser, context } = await launch({ width: 1280, height: 720 });
await context.route(/\/@vite\/client/, (route) => route.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));
const { page, log } = await openPage(context, URL);
await waitFor(page, 'window.__game?.ready && window.__player');
await page.evaluate(HELPERS);
const run = (fn, arg) => page.evaluate(fn, arg);

const walk = await run(async () => {
  const { g, hold, step, place, feet, hdist, releaseAll } = window.__T;
  const out = {};
  for (const sprint of [false, true]) {
    place(0, 14, 0);
    await window.__T.settle(0.3);
    hold('KeyW');
    if (sprint) hold('ShiftLeft');
    await window.__T.frame();
    step(60);
    const a = feet();
    step(60);
    const b = feet();
    releaseAll();
    step(30);
    out[sprint ? 'sprint' : 'walk'] = hdist(a, b);
  }
  out.grounded = g.player.grounded;
  return out;
});
check('walk speed 5.5 m/s ± 8 %', Math.abs(walk.walk - 5.5) <= 0.44, `${walk.walk.toFixed(2)} m/s`);
check('sprint speed 9 m/s ± 8 %', Math.abs(walk.sprint - 9) <= 0.72, `${walk.sprint.toFixed(2)} m/s`);

const jump = await run(async () => {
  const { g, hold, step, place } = window.__T;
  place(0, 14, 0);
  await window.__T.settle(0.3);
  const y0 = g.player.position.y;
  hold('Space');
  let top = y0;
  for (let i = 0; i < 90; i++) {
    step(1);
    top = Math.max(top, g.player.position.y);
  }
  hold('Space', false);
  step(30);
  return { apex: top - y0, grounded: g.player.grounded };
});
check('jump apex ≈ 1.6 m', Math.abs(jump.apex - 1.6) < 0.1 && jump.grounded, `${jump.apex.toFixed(3)} m`);

const hop = await run(async () => {
  const { g, hold, step, place } = window.__T;
  place(0, 14, 0);
  await window.__T.settle(0.3);
  const y0 = g.player.position.y;
  hold('Space');
  step(5);
  hold('Space', false);
  let top = y0;
  for (let i = 0; i < 60; i++) {
    step(1);
    top = Math.max(top, g.player.position.y);
  }
  return top - y0;
});
check('variable jump height (tap < full)', hop < 1.0 && hop > 0.2, `${hop.toFixed(2)} m`);

const climb = await run(async () => {
  const { g, hold, step, place, releaseAll } = window.__T;
  const path = g.world.paths.find((p) => p.to === 'feed').points;
  place(path[0][0], path[0][1], 0);
  await window.__T.settle(0.3);
  hold('KeyW');
  hold('ShiftLeft');
  await window.__T.frame();
  let idx = 0;
  let worst = 0;
  let steps = 0;
  let stuck = 0;
  let last = g.player.position.clone();
  while (steps < 60 * 140) {
    const p = g.player.position;
    while (idx < path.length - 1 && Math.hypot(path[idx][0] - p.x, path[idx][1] - p.z) < 3) idx++;
    const [tx, tz] = path[idx];
    g.player.yaw = Math.atan2(-(tx - p.x), -(tz - p.z));
    step(1);
    steps++;
    const sink = g.world.heightAt(p.x, p.z) - p.y;
    worst = Math.max(worst, sink);
    if (steps % 120 === 0) {
      if (p.distanceTo(last) < 2) stuck++;
      last.copy(p);
    }
    if (p.z < -480) break;
  }
  releaseAll();
  const p = g.player.position;
  return { worst, steps, z: p.z, y: p.y, mesa: g.world.zones.feed.mesaY, stuck };
});
check('run hub → feed mesa without sinking into the terrain', climb.worst < 0.05 && climb.z < -480 && Math.abs(climb.y - climb.mesa) < 1,
  `max sink ${climb.worst.toFixed(3)} m, reached z ${climb.z.toFixed(0)} y ${climb.y.toFixed(1)} in ${(climb.steps / 60).toFixed(0)} s, stuck ${climb.stuck}`);

const glide = await run(async () => {
  const { g, hold, step, place, releaseAll, events } = window.__T;
  const zone = g.world.zones.feed;
  place(zone.center[0] - 150, zone.center[1], Math.PI / 2, zone.mesaY);
  await window.__T.settle(0.3);
  const start = g.player.position.clone();
  hold('KeyW');
  hold('ShiftLeft');
  await window.__T.frame();
  let opened = null;
  const samples = [];
  let steps = 0;
  let jumped = false;
  while (steps < 60 * 90) {
    if (!jumped && Math.hypot(g.player.position.x - zone.center[0], g.player.position.z - zone.center[1]) > zone.topR - 1) {
      hold('Space');
      jumped = true;
    }
    step(1);
    steps++;
    if (g.player.gliding && !opened) opened = { t: steps, pos: g.player.position.clone() };
    if (opened && steps - opened.t > 180 && g.player.gliding) samples.push({ vy: g.player.velocity.y, h: Math.hypot(g.player.velocity.x, g.player.velocity.z) });
    if (opened && (g.player.grounded || g.player.respawning)) break;
  }
  releaseAll();
  const end = g.player.position;
  const n = samples.length || 1;
  return {
    opened: Boolean(opened),
    dist: Math.hypot(end.x - start.x, end.z - start.z),
    sink: samples.reduce((s, v) => s + v.vy, 0) / n,
    speed: samples.reduce((s, v) => s + v.h, 0) / n,
    seconds: steps / 60,
    glideEvents: events.filter((e) => e.type === 'player:glide').length,
  };
});
check('glide opens off the mesa edge', glide.opened && glide.glideEvents >= 2, `${glide.glideEvents} glide events`);
check('glide covers > 250 m horizontally', glide.dist > 250, `${glide.dist.toFixed(0)} m in ${glide.seconds.toFixed(1)} s`);
check('glide sink ≈ 2.5 m/s at ≈ 16 m/s', Math.abs(glide.sink + 2.5) < 0.35 && Math.abs(glide.speed - 16) < 1.5, `sink ${glide.sink.toFixed(2)} m/s, speed ${glide.speed.toFixed(2)} m/s`);

const sea = await run(async () => {
  const { g, hold, step, place, releaseAll, events } = window.__T;
  let x = -840;
  while (x > -1000 && g.world.heightAt(x - 30, 170) > 1.5) x -= 2;
  place(x, 170, Math.PI / 2);
  await window.__T.settle(0.6);
  const start = g.player.position.clone();
  const before = events.length;
  hold('KeyW');
  await window.__T.frame();
  let steps = 0;
  let safe = null;
  let respawn = null;
  while (steps < 60 * 30 && !respawn) {
    const sp = g.player.safePosition;
    safe = { x: sp.x, y: sp.y, z: sp.z };
    step(1);
    steps++;
    await new Promise((r) => setTimeout(r, 0));
    respawn = events.slice(before).find((e) => e.type === 'player:respawn');
  }
  releaseAll();
  for (let i = 0; i < 300 && g.player.respawning; i++) await window.__T.frame();
  await window.__T.frame();
  await window.__T.settle(0.3);
  const p = g.player.position;
  return { reason: respawn?.p.reason, back: Math.hypot(p.x - safe.x, p.z - safe.z), walked: Math.hypot(safe.x - start.x, safe.z - start.z), safeAbove: safe.y - g.world.SEA_LEVEL };
});
check('walking into the sea respawns at the last safe position', sea.reason === 'water' && sea.back < 1 && sea.walked > 5 && sea.safeAbove > 0.4,
  `reason ${sea.reason}, ${sea.back?.toFixed(2)} m from the safe spot (${sea.walked?.toFixed(1)} m down the beach, ${sea.safeAbove?.toFixed(2)} m above the sea)`);

const ride = await run(async () => {
  const { g, step, place, settle } = window.__T;
  const plat = window.__player.platform;
  place(plat.position.x, plat.position.z, 0, plat.position.y + 0.21);
  await settle(0.5);
  const local = (p) => p.clone().sub(plat.position).applyQuaternion(plat.quaternion.clone().invert());
  const a = local(g.player.position);
  const pa = plat.position.clone();
  step(150);
  const b = local(g.player.position);
  return { drift: a.distanceTo(b), moved: pa.distanceTo(plat.position), grounded: g.player.grounded };
});
check('a moving kinematic platform carries the player', ride.drift < 0.35 && ride.moved > 1 && ride.grounded, `platform moved ${ride.moved.toFixed(2)} m, drift in its frame ${ride.drift.toFixed(3)} m`);

const stairs = await run(async () => {
  const { g, hold, step, releaseAll } = window.__T;
  const out = [];
  for (const s of window.__player.stairs) {
    for (const sprint of [false, true]) {
      g.player.teleport(s.x, g.world.zones.hub.y, s.start + 3, 0);
      step(30);
      const y0 = g.player.position.y;
      hold('KeyW');
      if (sprint) hold('ShiftLeft');
      let maxY = -Infinity;
      let maxVy = 0;
      let maxEye = 0;
      let air = 0;
      let ticks = 0;
      let prevEye = g.player.eye.y;
      while (ticks < 60 * 6 && g.player.position.z > s.end - 2) {
        step(1);
        ticks++;
        maxY = Math.max(maxY, g.player.position.y - y0);
        maxVy = Math.max(maxVy, g.player.velocity.y);
        maxEye = Math.max(maxEye, Math.abs(g.player.eye.y - prevEye));
        prevEye = g.player.eye.y;
        if (!g.player.grounded) air++;
      }
      releaseAll();
      step(20);
      out.push({
        name: s.name, sprint, riser: s.riser, top: s.top, maxY, maxVy, maxEye, air,
        through: g.player.position.z <= s.end - 2, back: Math.abs(g.player.position.y - y0), seconds: ticks / 60,
      });
    }
  }
  return out;
});
for (const s of stairs) {
  const label = `${s.name} stairs at ${s.sprint ? 'sprint' : 'walk'}`;
  check(`${label}: climbed up and down`, s.through && Math.abs(s.maxY - s.top) < 0.06 && s.back < 0.05, `top ${s.maxY.toFixed(2)}/${s.top} m, ${s.seconds.toFixed(2)} s`);
  check(`${label}: no launch, never airborne`, s.air === 0 && s.maxVy < 2, `${s.air} airborne ticks, max vy ${s.maxVy.toFixed(2)} m/s`);
  check(`${label}: camera smoothed`, s.maxEye < 0.5 * s.riser + 0.02, `max eye step ${s.maxEye.toFixed(3)} m per tick for a ${s.riser} m riser`);
}

const kinematicSlope = await run(async () => {
  const { g, hold, step, releaseAll } = window.__T;
  const ramp = window.__player.kinematicRamp;
  const Y = g.world.zones.hub.y;
  const down = { x: 0, y: -1, z: 0 };
  g.player.teleport(ramp.position.x, Y, ramp.position.z + 7, 0);
  step(30);
  let worst = -Infinity;
  let top = -Infinity;
  const sample = () => {
    const p = g.player.position;
    const hit = g.physics.raycast({ x: p.x, y: Y + 10, z: p.z }, down, 20, { groups: g.physics.GROUPS.KINEMATIC });
    if (hit && Math.abs(hit.point.y - p.y) < 0.5) worst = Math.max(worst, hit.point.y - p.y);
    top = Math.max(top, p.y - Y);
  };
  hold('KeyW');
  for (let i = 0; i < 60 * 4 && g.player.position.z > ramp.position.z - 2.5; i++) {
    step(1);
    sample();
  }
  g.player.yaw = Math.PI;
  for (let i = 0; i < 60 * 4 && g.player.position.z < ramp.position.z + 5; i++) {
    step(1);
    sample();
  }
  releaseAll();
  step(10);
  return { worst, top };
});
check('walking on a sloped kinematic body (20°) never sinks into it', kinematicSlope.worst < 0.01 && kinematicSlope.top > 1.5, `deepest ${kinematicSlope.worst.toFixed(3)} m below the surface, reached ${kinematicSlope.top.toFixed(2)} m`);

const lift = await run(async () => {
  const { g, step } = window.__T;
  g.player.teleport(-30, g.world.zones.hub.y + 40, -30, 0);
  step(2);
  const accelOver = (ticks, ...lifts) => {
    const v0 = g.player.velocity.y;
    for (let i = 0; i < ticks; i++) {
      for (const a of lifts) g.player.applyLift(a);
      step(1);
    }
    return ((g.player.velocity.y - v0) * 60) / ticks;
  };
  accelOver(5, 40);
  const raised = accelOver(4, 40);
  accelOver(2, 40, 10);
  const lowered = accelOver(4, 40, 10);
  step(8);
  const after = accelOver(6);
  return { raised, lowered, after };
});
check('applyLift: the latest call wins, then decays to zero', Math.abs(lift.raised - 16) < 1 && Math.abs(lift.lowered + 14) < 1 && Math.abs(lift.after + 24) < 1,
  `accel ${lift.raised.toFixed(1)} m/s² with lift 40 (expect 16), ${lift.lowered.toFixed(1)} with 40 then 10 (expect −14), ${lift.after.toFixed(1)} once released (expect −24)`);

const advanceInput = await run(() => {
  const { g, step, place } = window.__T;
  place(0, 14, 0);
  step(20);
  const z0 = g.player.position.z;
  g.input.simulate('KeyW', true);
  g.debug.advance(1 / 60);
  const moveDown = g.input.move.z;
  g.debug.advance(10 / 60);
  const moved = z0 - g.player.position.z;
  g.input.simulate('KeyW', false);
  g.debug.advance(1 / 60);
  return { moveDown, moved, moveUp: g.input.move.z };
});
check('debug.advance refreshes input state without a rendered frame', advanceInput.moveDown === -1 && advanceInput.moveUp === 0 && advanceInput.moved > 0.2,
  `move.z ${advanceInput.moveDown} then ${advanceInput.moveUp}, walked ${advanceInput.moved.toFixed(2)} m in 11 ticks`);

const grab = await run(async () => {
  const { g, hold, step, place, aimAt, events } = window.__T;
  const crate = window.__player.crates[0];
  const out = {};
  for (const [name, e] of [['crate', crate], ['pave', window.__player.pave]]) {
    const c = e.position;
    for (const [ox, oz] of [[0, 2.2], [2.2, 0], [-2.2, 0], [0, -2.2], [1.6, 1.6], [-1.6, 1.6]]) {
      place(c.x + ox, c.z + oz, 0);
      await window.__T.settle(0.4);
      aimAt(c.x, c.y, c.z);
      if (g.cursor.target?.entity === e) break;
    }
    hold('Mouse0');
    step(2);
    hold('Mouse0', false);
    step(2);
    const held = g.cursor.held === e;
    hold('KeyS');
    await window.__T.frame();
    step(50);
    hold('KeyS', false);
    await window.__T.frame();
    step(40);
    const carried = e.position.distanceTo(g.player.eye);
    const yaw0 = g.player.yaw;
    const turn = Math.atan2(Math.sin(Math.PI - yaw0), Math.cos(Math.PI - yaw0));
    for (let i = 1; i <= 40; i++) {
      g.player.yaw = yaw0 + (turn * i) / 40;
      g.player.pitch *= 0.9;
      step(1);
    }
    g.player.pitch = 0;
    step(30);
    const stillHeld = g.cursor.held === e;
    const from = e.position.clone();
    hold('Mouse2');
    step(2);
    hold('Mouse2', false);
    const thrown = events.filter((x) => x.type === 'grab:end').pop()?.p.thrown;
    let landed = null;
    for (let i = 0; i < 300 && !landed; i++) {
      step(1);
      if (i > 10 && e.body.linvel().y > -0.5 && e.position.y - g.world.heightAt(e.position.x, e.position.z) < (e.halfHeight || 0.5) + 0.3) landed = e.position.clone();
    }
    out[name] = { held: held && stillHeld, carried, thrown, dist: landed ? Math.hypot(landed.x - from.x, landed.z - from.z) : 0 };
  }
  return out;
});
check('grab a crate (Mouse0)', grab.crate.held, '');
check('carried crate stays in front of the camera', grab.crate.carried < 3.6, `${grab.crate.carried.toFixed(2)} m from the eye`);
check('thrown crate lands > 8 m away', grab.crate.thrown && grab.crate.dist > 8, `${grab.crate.dist.toFixed(1)} m`);
check('thrown 18 kg cobblestone flies ≈ 12 m', grab.pave.held && grab.pave.dist > 9.5 && grab.pave.dist < 16, `${grab.pave.dist.toFixed(1)} m`);

const click = await run(async () => {
  const { g, hold, step, place, aimAt } = window.__T;
  const b = window.__player.button;
  const before = b.clicks;
  place(3, -5.2, 0);
  await window.__T.settle(0.3);
  aimAt(3, b.mesh.position.y, -7);
  const reticleTarget = g.cursor.target?.kind;
  hold('Mouse0');
  step(2);
  hold('Mouse0', false);
  step(2);
  return { clicks: b.clicks - before, reticleTarget };
});
check('a click reaches the clickable', click.clicks === 1 && click.reticleTarget === 'click', `clicks ${click.clicks}, target ${click.reticleTarget}`);

const scan = await run(async () => {
  const { g, hold, step, place, events } = window.__T;
  place(-10, 10, 0);
  await window.__T.settle(1);
  const THREE = g.camera.position.constructor;
  const eye = g.player.eye.clone();
  const extra = [12, 45, 90].map((d, i) => g.scanner.register({ position: new THREE(eye.x + d, eye.y, eye.z + i), kind: 'beacon', label: `t${d}` }));
  const before = events.length;
  hold('KeyF');
  step(2);
  hold('KeyF', false);
  step(2);
  hold('KeyF');
  step(2);
  hold('KeyF', false);
  step(Math.round(60 * 2.6));
  const evs = events.slice(before);
  const denied = evs.filter((e) => e.type === 'scan:start').length === 1;
  const hits = evs.filter((e) => e.type === 'scan:hit');
  const order = hits.every((h, i) => i === 0 || h.p.distance >= hits[i - 1].p.distance);
  const timing = hits.every((h) => Math.abs((h.t - evs[0].t) - h.p.distance / 60) < 0.05);
  const P = window.__player;
  const phases = { hallu: P.hallu[0].phase, statue: P.hallu[1].phase, hidden: P.hidden[0].phase, hiddenVisible: P.hiddenBridge.visible };
  const end = evs.find((e) => e.type === 'scan:end');
  const extraHits = hits.filter((h) => extra.includes(h.p.handle)).map((h) => h.p.distance);
  extra.forEach((h) => h.remove());
  step(60 * 12);
  const later = { hallu: P.hallu[0].phase, hidden: P.hidden[0].phase, hiddenVisible: P.hiddenBridge.visible };
  return { hits: hits.length, order, timing, phases, end: end?.p, extraHits, denied, later };
});
check('scan hits registered targets in distance order', scan.hits >= 8 && scan.order && scan.timing && scan.extraHits.length === 3, `${scan.hits} hits, order ${scan.order}, timing ${scan.timing}, test targets at ${scan.extraHits.map((d) => d.toFixed(0)).join('/')} m`);
check('scan:end summary counts', scan.end && scan.end.hallucination === 2 && scan.end.hidden === 1 && scan.end.beacon === 3, JSON.stringify(scan.end && { ...scan.end, origin: undefined }));
check('scan toggles hallucinated + hidden objects', ['glitch', 'ghost'].includes(scan.phases.hallu) && ['appear', 'settle', 'solid'].includes(scan.phases.hidden) && scan.phases.hiddenVisible, JSON.stringify(scan.phases));
check('hallucination returns, hidden fades away again', scan.later.hallu === 'idle' && scan.later.hidden === 'gone' && !scan.later.hiddenVisible, JSON.stringify(scan.later));
check('scan cooldown refuses an immediate second pulse', scan.denied);

const rides = await run(async () => {
  const { g, step, place, events } = window.__T;
  const out = [];
  async function rideOnce(id, from) {
    const z = g.world.zones[id];
    const start = from === 'a' ? z.hubEnd : z.arrival;
    place(start[0], start[2], 0);
    await window.__T.settle(0.3);
    const p = g.links.ride(id, from);
    let done = false;
    p.then(() => { done = true; });
    let worst = -Infinity;
    let steps = 0;
    let maxY = 0;
    while (!done && steps < 60 * 40) {
      step(1);
      steps++;
      const f = g.player.position;
      worst = Math.max(worst, g.world.heightAt(f.x, f.z) - f.y);
      maxY = Math.max(maxY, f.y);
      if (steps % 30 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    await new Promise((r) => setTimeout(r, 0));
    step(30);
    const end = from === 'a' ? z.arrival : z.hubEnd;
    const f = g.player.position;
    return {
      id, from, seconds: steps / 60, worst, done, maxY,
      miss: Math.hypot(f.x - end[0], f.z - end[2]),
      dy: f.y - g.world.heightAt(f.x, f.z),
      visited: g.state.visitedLinks.has(id), locked: g.player.locked, grounded: g.player.grounded,
    };
  }
  out.push(await rideOnce('feed', 'a'));
  out.push(await rideOnce('feed', 'b'));
  const restored = events.length;
  g.links.setEnabled('lighthouse', true);
  step(60 * 6.5);
  await new Promise((r) => setTimeout(r, 0));
  const restoredEvent = events.slice(restored).some((e) => e.type === 'link:restored' && e.p.id === 'lighthouse');
  out.push({ ...(await rideOnce('lighthouse', 'a')), restoredEvent });
  return out;
});
for (const r of rides) {
  check(`ride ${r.id} from ${r.from} lands at the far end`, r.done && r.miss < 8 && Math.abs(r.dy) < 0.3 && !r.locked && r.grounded, `${r.miss.toFixed(1)} m from the end, ${r.seconds.toFixed(1)} s, apex y ${r.maxY.toFixed(0)}`);
  check(`ride ${r.id} from ${r.from} never passes through the terrain`, r.worst < 0.05, `worst ${r.worst.toFixed(2)} m`);
  check(`ride ${r.id} from ${r.from} lasts 8–20 s and sets visitedLinks`, r.seconds > 8 && r.seconds < 20 && r.visited);
}
check('setEnabled("lighthouse", true) emits link:restored', rides[2].restoredEvent);

const soak = await run(async () => {
  const { g, step, place, releaseAll } = window.__T;
  place(0, 8, 0);
  await window.__T.settle(0.3);
  const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space', 'KeyF', 'Mouse0', 'Mouse2', 'KeyE'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let bad = 0;
  for (let i = 0; i < 60 * 60; i++) {
    if (i % 15 === 0) {
      for (const k of keys) g.input.simulate(k, rnd() < (k === 'KeyW' ? 0.6 : 0.2));
      g.input.simulateLook((rnd() - 0.5) * 300, (rnd() - 0.5) * 120);
    }
    if (i % 600 === 0 && rnd() < 0.5) g.player.teleport((rnd() - 0.5) * 60, g.world.heightAt(0, 0), (rnd() - 0.5) * 60);
    step(1);
    const p = g.player.position;
    if (!Number.isFinite(p.x + p.y + p.z) || !Number.isFinite(g.camera.position.y)) bad++;
    if (i % 60 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  for (const k of keys) g.input.simulate(k, false);
  releaseAll();
  return { bad, mode: g.state.mode };
});
check('60 s random-input soak: no NaN', soak.bad === 0, `${soak.bad} bad frames`);

await page.waitForTimeout(500);
check('no console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
check('no console warnings', log.warnings.length === 0, log.warnings.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'}`);
process.exit(failures ? 1 : 0);
