import { launch, openPage, waitFor } from '../tools/browser.mjs';

const BASE = process.env.FARM_URL || 'http://127.0.0.1:5223/dev/farm.html';
const SHOTS = process.env.FARM_SHOTS || '';
const ONLY = process.env.FARM_ONLY || '12345';
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
  const z = g.zones.farm;
  const T = {
    g, z, keys: new Set(), events: [],
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
    step(n = 1) {
      for (let i = 0; i < n; i++) g.debug.advance(1 / 60);
    },
    async tap(code) {
      T.hold(code, true);
      await T.frame();
      T.step(2);
      T.hold(code, false);
      await T.frame();
      T.step(2);
    },
    place(x, zz, yaw = 0, y) {
      g.player.teleport(x, y ?? g.world.heightAt(x, zz), zz, yaw);
      T.step(3);
    },
    yawTo(x, zz) {
      const p = g.player.position;
      return Math.atan2(-(x - p.x), -(zz - p.z));
    },
    aimAt(v) {
      const e = g.player.eye;
      g.player.yaw = Math.atan2(-(v.x - e.x), -(v.z - e.z));
      g.player.pitch = Math.atan2(v.y - e.y, Math.hypot(v.x - e.x, v.z - e.z));
    },
    hdist(a, b) {
      return Math.hypot(a.x - b.x, a.z - b.z);
    },
    async walkTo(points, { sprint = true, timeout = 60, wait, jump = false } = {}) {
      for (const [x, zz] of points) {
        let t = 0;
        while (wait && !wait()) {
          T.step(3);
          t += 0.05;
          if (t > timeout) return false;
        }
        T.hold('KeyW');
        if (sprint) T.hold('ShiftLeft');
        while (Math.hypot(g.player.position.x - x, g.player.position.z - zz) > 0.9) {
          g.player.yaw = T.yawTo(x, zz);
          g.player.pitch = 0;
          if (jump) T.hold('Space', Math.floor(t * 5) % 2 === 0);
          await T.frame();
          T.step(6);
          t += 0.1;
          if (t > timeout) {
            T.releaseAll();
            return false;
          }
        }
      }
      T.releaseAll();
      await T.frame();
      T.step(20);
      return true;
    },
    async grab(entity) {
      for (let i = 0; i < 12; i++) {
        T.aimAt(entity.position);
        T.step(1);
        await T.frame();
        if (g.cursor.target?.entity === entity) {
          await T.tap('Mouse0');
          return g.cursor.held === entity;
        }
      }
      T.lastGrab = { target: g.cursor.target?.kind ?? null, other: g.cursor.target?.entity?.userData?.kind ?? null, d: g.player.eye.distanceTo(entity.position), mode: g.state.mode };
      return false;
    },
  };
  for (const type of ['grab:start', 'grab:end', 'player:glide', 'player:respawn', 'beacon:ready', 'beacon:activated', 'farm:hit']) {
    g.events.on(type, (p) => T.events.push({ type, zone: p?.zone, t: g.time.now }));
  }
  window.__T = T;
};

const { browser, context } = await launch({ width: 1280, height: 720 });
await context.route(/\/@vite\/client/, (route) => route.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));

async function boot(query, { clear = true } = {}) {
  const { page, log } = await openPage(context, `${BASE}?mute=1&${query}`, { quiet: true });
  if (clear) await page.evaluate(() => localStorage.clear());
  await waitFor(page, 'window.__game?.ready', 120000);
  await page.waitForTimeout(800);
  return { page, log };
}

async function stats(page, poses) {
  const out = [];
  for (const p of poses) {
    await page.evaluate((p) => {
      const g = window.__game;
      g.debug.freecam(true);
      g.debug.flycam.setPose(p[0], p[1], p[2], p[3], p[4] ?? 0);
    }, p);
    await page.waitForTimeout(600);
    out.push(await page.evaluate(() => window.__game.debug.stats()));
  }
  return out;
}

const POSES = {
  hub: [0, 39.7, 0, -Math.PI / 2, 0.02],
  arrival: [458, 23.8, -45, -1.25, 0],
  yard: [585, 26, -98, 0, 0.2],
  field: [496, 26.5, -54, -1.5, -0.05],
  garden: [716, 27.8, 45, -1.5708, 0],
  greenhouse: [740.2, 28.2, 46.4, -0.3, -0.3],
};

// 1. boot + budgets
if (ONLY.includes('1')) {
  const withZone = await boot('nosave=1');
  check('boots with zero console errors / warnings', withZone.log.errors.length === 0 && withZone.log.warnings.length === 0, `${withZone.log.errors.length} errors, ${withZone.log.warnings.length} warnings ${withZone.log.errors.slice(0, 2).join(' | ')}`);
  const a = await stats(withZone.page, Object.values(POSES));
  await withZone.page.close();
  const without = await boot('nosave=1&zones=');
  const b = await stats(without.page, Object.values(POSES));
  await without.page.close();
  Object.keys(POSES).forEach((name, i) => {
    const calls = a[i].calls - b[i].calls;
    const tris = a[i].triangles - b[i].triangles;
    const limit = name === 'hub' ? 10 : 60;
    check(`budget ${name}: +${calls} draws, +${(tris / 1000).toFixed(0)}k tris`, calls <= limit && tris <= 300000, `with ${a[i].calls}/${(a[i].triangles / 1000).toFixed(0)}k, without ${b[i].calls}/${(b[i].triangles / 1000).toFixed(0)}k`);
  });
}

// 2. completability by play
if (ONLY.includes('2')) {
  const { page, log } = await boot('nosave=1');
  await page.evaluate(HELPERS);
  const run = (fn, arg) => page.evaluate(fn, arg);
  const shot = async (name) => {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
  };

  const arrival = await run(() => {
    const { g, z } = window.__T;
    const p = g.player.position;
    return { dx: p.x - z.spawn[0], dz: p.z - z.spawn[2], beacon: g.state.beacons.farm };
  });
  check('player starts at the arrival, beacon locked', Math.hypot(arrival.dx, arrival.dz) < 2 && arrival.beacon === 'locked');

  // Seed "silo": updraft + glide to the silo deck.
  const lift = await run(async () => {
    const T = window.__T;
    const { g, z } = T;
    const fan = z.fans[1];
    T.place(fan.x - 7, fan.z, -Math.PI / 2);
    await T.frame();
    T.hold('KeyW');
    await T.frame();
    let t = 0;
    while (T.hdist(g.player.position, fan) > 1.5 && t < 4) {
      T.step(2);
      t += 2 / 60;
    }
    T.hold('KeyW', false);
    await T.frame();
    T.hold('Space');
    await T.frame();
    let maxY = g.player.position.y;
    let opened = false;
    for (let i = 0; i < 60 * 9; i++) {
      if (!opened) g.player.yaw = T.yawTo(z.deck.x, z.deck.z);
      T.step(1);
      maxY = Math.max(maxY, g.player.position.y);
      if (g.player.gliding) opened = true;
      if (opened && T.hdist(g.player.position, z.deck) < 3.5) break;
      if (i % 30 === 0) await T.frame();
    }
    const risen = maxY - fan.y;
    T.hold('Space', false);
    await T.frame();
    T.step(120);
    const p = g.player.position;
    return { risen, opened, onDeck: T.hdist(p, z.deck) < 7.5 && p.y > z.deck.y - 0.3 && p.y < z.deck.y + 2.5 && g.player.grounded, y: p.y, deckY: z.deck.y, d: T.hdist(p, z.deck) };
  });
  check('updraft lifts ≈ 28 m', lift.risen > 25 && lift.risen < 33, `${lift.risen.toFixed(1)} m`);
  check('glide from the updraft lands on the silo deck', lift.opened && lift.onDeck, JSON.stringify(lift));
  await shot('play-deck');

  const pickSilo = await run(async () => {
    const T = window.__T;
    const { g, z } = T;
    const seed = z.seeds.find((s) => s.id === 'silo');
    const p = seed.entity.position;
    await T.walkTo([[p.x + 1.6, p.z + 1.4]], { sprint: false, timeout: 8 });
    const ok = await T.grab(seed.entity);
    return { ok, flag: g.state.flag('zone.farm.seed.silo'), why: T.lastGrab };
  });
  check('silo seed grabbed with the cursor', pickSilo.ok && pickSilo.flag === true, JSON.stringify(pickSilo));

  const carry = async (seedId, route) => run(async ({ seedId, route }) => {
    const T = window.__T;
    const { g, z } = T;
    const seed = z.seeds.find((s) => s.id === seedId);
    const ok = await T.walkTo(route, { timeout: 120 });
    return { ok, held: g.cursor.held === seed.entity, p: g.player.position.toArray() };
  }, { seedId, route });

  const plantInto = async (seedId) => run(async (seedId) => {
    const T = window.__T;
    const { g, z } = T;
    const seed = z.seeds.find((s) => s.id === seedId);
    const pot = z.pots.find((p) => !p.seed);
    await T.walkTo([[pot.soil.x, pot.soil.z + 2.4]], { sprint: false, timeout: 20 });
    g.player.yaw = 0;
    g.player.pitch = -0.05;
    T.step(20);
    let best = 9;
    for (let i = 0; i < 160; i++) {
      const target = pot.soil.clone();
      target.y += 0.26;
      const err = target.clone().sub(seed.mesh.position);
      best = Math.min(best, err.length());
      if (err.length() < 0.1) break;
      g.player.pitch += err.y * 0.3;
      const keys = [];
      if (err.z < -0.06) keys.push('KeyW');
      if (err.z > 0.06) keys.push('KeyS');
      if (err.x > 0.06) keys.push('KeyD');
      if (err.x < -0.06) keys.push('KeyA');
      for (const k of keys) T.hold(k);
      await T.frame();
      T.step(1);
      T.releaseAll();
      await T.frame();
      T.step(8);
    }
    await T.tap('Mouse0');
    T.step(150);
    return { planted: seed.planted, pot: seed.pot, best };
  }, seedId);

  const greenhouseRoute = (from) => {
    const r = [];
    if (from === 'silo') r.push([609, -128], [609, -95], [700, 30]);
    if (from === 'field') r.push([495, -12], [700, 30]);
    r.push([716, 45], [736.5, 45], [740.5, 45.4]);
    return r;
  };

  const down = await run(async () => {
    const T = window.__T;
    const ok = await T.walkTo([[585, -128]], { jump: true, timeout: 20 });
    return { ok, held: T.g.cursor.held === T.z.seeds[0].entity, y: T.g.player.position.y };
  });
  check('jumped off the deck with the seed', down.ok && down.held, JSON.stringify(down));
  const c1 = await carry('silo', greenhouseRoute('silo'));
  const p1 = await plantInto('silo');
  check('silo seed carried to the greenhouse and planted', c1.held && p1.planted, JSON.stringify({ c1, p1 }));
  await shot('play-planted1');

  // Seed "field": cross the harvester rings with timing.
  const field = await run(async () => {
    const T = window.__T;
    const { g, z } = T;
    const seed = z.seeds.find((s) => s.id === 'field');
    const c = seed.origin;
    const dir = { x: -1, z: 0.12 };
    const n = Math.hypot(dir.x, dir.z);
    dir.x /= n;
    dir.z /= n;
    const ringR = z.harvesters.map((h) => {
      let best = null;
      for (let u = 0; u < 1; u += 0.002) {
        const p = h.curve.getPointAt(u);
        const rx = p.x - c.x;
        const rz = p.z - c.z;
        const along = rx * dir.x + rz * dir.z;
        const across = Math.abs(rx * dir.z - rz * dir.x);
        if (along > 0 && (!best || across < best.across)) best = { across, along };
      }
      return best.along;
    });
    const gaps = [Math.max(4, ringR[0] - 6.5), (ringR[0] + ringR[1]) / 2, (ringR[1] + ringR[2]) / 2, ringR[2] + 7];
    const pt = (d) => [c.x + dir.x * d, c.z + dir.z * d];
    const safe = (ring, from, to) => () => {
      const h = z.harvesters[ring];
      const a = { x: c.x + dir.x * from, z: c.z + dir.z * from };
      const b = { x: c.x + dir.x * to, z: c.z + dir.z * to };
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const d = T.hdist(h.position, mid);
      const ahead = h.curve.getPointAt((h.u + 0.02) % 1);
      const approaching = T.hdist(ahead, mid) < d;
      return d > 26 || (!approaching && d > 9);
    };
    T.place(...pt(gaps[3] + 4), 0);
    const hitsBefore = T.events.filter((e) => e.type === 'farm:hit').length;
    let ok = true;
    for (let ring = 2; ring >= 0 && ok; ring--) {
      const [x, zz] = pt(gaps[ring + 1]);
      ok = await T.walkTo([[x, zz]], { sprint: true, timeout: 30 });
      ok = ok && await T.walkTo([pt(gaps[ring])], { sprint: true, timeout: 40, wait: safe(ring, gaps[ring + 1], gaps[ring]) });
    }
    await T.walkTo([[c.x - dir.x * 0.0 + dir.x * 1.8, c.z + dir.z * 1.8]], { sprint: false, timeout: 6 });
    const grabbed = await T.grab(seed.entity);
    for (let ring = 0; ring <= 2 && grabbed; ring++) {
      ok = ok && await T.walkTo([pt(gaps[ring + 1])], { sprint: true, timeout: 40, wait: safe(ring, gaps[ring], gaps[ring + 1]) });
    }
    const hits = T.events.filter((e) => e.type === 'farm:hit').length - hitsBefore;
    return { ok, grabbed, held: g.cursor.held === seed.entity, hits, why: T.lastGrab, pos: g.player.position.toArray().map(Math.round), seed: seed.entity.position.toArray().map(Math.round), origin: c.toArray().map(Math.round) };
  });
  check('field seed fetched across the harvester rings without being hit', field.grabbed && field.held && field.hits === 0, JSON.stringify(field));
  await shot('play-field');
  const c2 = await carry('field', greenhouseRoute('field'));
  const p2 = await plantInto('field');
  check('field seed carried to the greenhouse and planted', c2.held && p2.planted, JSON.stringify({ c2, p2 }));

  // Seed "bales": move bales with the cursor.
  const bales = await run(async () => {
    const T = window.__T;
    const { g, z } = T;
    const seed = z.seeds.find((s) => s.id === 'bales');
    const sp = seed.entity.position.clone();
    T.place(sp.x, sp.z + 3.4, 0);
    await T.frame();
    let moved = 0;
    let grabbed = false;
    for (let attempt = 0; attempt < 14 && !grabbed; attempt++) {
      const side = attempt % 4 < 2 ? 1 : -1;
      await T.walkTo([[sp.x, sp.z + side * 2.5]], { sprint: false, timeout: 6 });
      grabbed = await T.grab(seed.entity);
      if (grabbed) break;
      T.aimAt(seed.entity.position);
      T.step(1);
      await T.frame();
      const t2 = g.cursor.target;
      if (t2?.kind === 'grab' && t2.entity !== seed.entity) {
        await T.tap('Mouse0');
        if (g.cursor.held) {
          moved++;
          g.player.yaw += 1.6;
          T.step(30);
          await T.frame();
          await T.tap('Mouse2');
          T.step(60);
        }
      }
    }
    return { moved, grabbed, flags: g.state.flag('zone.farm.seeds'), why: T.lastGrab };
  });
  check('bales moved with the cursor, seed grabbed', bales.moved >= 1 && bales.grabbed && bales.flags === true, JSON.stringify(bales));
  await shot('play-bales');
  const c3 = await carry('bales', [[751, 52.2], [747, 50.2], [737.3, 49.3], [732.5, 45.2], [736, 45.2], [740.5, 45.4]]);
  const p3 = await plantInto('bales');
  check('bale seed carried and planted, beacon ready', c3.held && p3.planted, JSON.stringify({ c3, p3 }));
  const ready = await run(() => ({ beacon: window.__game.state.beacons.farm, plant: window.__game.state.flag('zone.farm.plant'), seeds: window.__game.state.flag('zone.farm.seeds') }));
  check('flags seeds + plant set, beacon ready', ready.beacon === 'ready' && ready.plant === true && ready.seeds === true, JSON.stringify(ready));
  await shot('play-pots');

  const act = await run(async () => {
    const T = window.__T;
    const { g } = T;
    const b = g.beacons.get('farm');
    T.place(b.position.x - 2.4, b.position.z, -Math.PI / 2);
    g.player.pitch = -0.1;
    await T.frame();
    await g.debug.press('KeyE', 80);
    for (let i = 0; i < 200 && g.state.beacons.farm !== 'active'; i++) await T.frame();
    for (let i = 0; i < 900 && !T.events.some((e) => e.type === 'beacon:activated'); i++) await T.frame();
    for (let i = 0; i < 400 && g.state.mode !== 'reading'; i++) await T.frame();
    return { status: g.state.beacons.farm, event: T.events.some((e) => e.type === 'beacon:activated' && e.zone === 'farm'), mode: g.state.mode };
  });
  check('E on the beacon relights it', act.status === 'active' && act.event && act.mode === 'reading', JSON.stringify(act));
  await shot('play-beacon');
  check('playthrough: zero console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  await page.close();
}

// 3. debugSolve on a fresh boot, then activation; 4. reload with the solved state
if (ONLY.includes('3')) {
  const { page, log } = await boot('');
  const res = await page.evaluate(async () => {
    const g = window.__game;
    const events = [];
    g.events.on('beacon:activated', (p) => events.push(p.zone));
    const before = g.state.beacons.farm;
    g.zones.farm.debugSolve();
    const ready = g.state.beacons.farm;
    g.beacons.activate('farm');
    for (let i = 0; i < 1200 && g.state.mode !== 'reading'; i++) await new Promise((r) => requestAnimationFrame(r));
    g.state.save();
    return { before, ready, after: g.state.beacons.farm, events, mode: g.state.mode };
  });
  check('debugSolve leaves the beacon ready', res.before === 'locked' && res.ready === 'ready', JSON.stringify(res));
  check('activation: active + beacon:activated + document', res.after === 'active' && res.events.includes('farm') && ['reading', 'playing'].includes(res.mode), JSON.stringify(res));
  check('debugSolve run: zero console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, 'window.__game?.ready', 120000);
  const re = await page.evaluate(() => {
    const g = window.__game;
    const z = g.zones.farm;
    return { beacon: g.state.beacons.farm, planted: z.seeds.every((s) => s.planted), pots: z.pots.map((p) => p.seed?.id ?? null), flag: g.state.flag('zone.farm.plant') };
  });
  check('reload rebuilds the zone solved', re.beacon === 'active' && re.planted && re.pots.every(Boolean) && re.flag === true, JSON.stringify(re));
  await page.evaluate(() => localStorage.clear());
  await page.close();
}

// 5. 60 s of random input
if (ONLY.includes('5')) {
  const { page, log } = await boot('nosave=1');
  const res = await page.evaluate(async () => {
    const g = window.__game;
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'Mouse0', 'Mouse2', 'KeyF', 'KeyE'];
    const spots = [[585, -121], [533, -54], [742, 45], [750, 47.5], [585, -150, 46], [472, -48], [646, -150]];
    let rnd = 12345;
    const rand = () => {
      rnd = (rnd * 1103515245 + 12345) % 2147483648;
      return rnd / 2147483648;
    };
    let bad = null;
    let minClear = Infinity;
    for (let s = 0; s < 600; s++) {
      if (s % 100 === 0) {
        const sp = spots[(s / 100) % spots.length];
        g.player.teleport(sp[0], sp[2] ?? g.world.heightAt(sp[0], sp[1]), sp[1], rand() * 6.28);
      }
      for (const k of keys) g.input.simulate(k, rand() < (k === 'KeyW' ? 0.6 : 0.18));
      g.input.simulateLook((rand() - 0.5) * 300, (rand() - 0.5) * 120);
      await new Promise((r) => requestAnimationFrame(r));
      g.debug.advance(0.1);
      if (g.state.mode === 'reading') g.ui.reader.close?.();
      if (g.state.mode !== 'playing' && g.state.mode !== 'cinematic') g.state.setMode('playing');
      const p = g.player.position;
      if (![p.x, p.y, p.z].every(Number.isFinite)) bad = 'NaN player';
      minClear = Math.min(minClear, p.y - g.world.heightAt(p.x, p.z));
      for (const seed of g.zones.farm.seeds) {
        const q = seed.mesh.position;
        if (![q.x, q.y, q.z].every(Number.isFinite)) bad = `NaN seed ${seed.id}`;
      }
    }
    for (const k of keys) g.input.simulate(k, false);
    return { bad, minClear };
  });
  check('60 s random input: no NaN', !res.bad, res.bad || '');
  check('60 s random input: never below the terrain', res.minClear > -0.3, `min clearance ${res.minClear.toFixed(2)} m`);
  check('60 s random input: no exception', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall farm checks passed');
process.exit(failures ? 1 : 0);
