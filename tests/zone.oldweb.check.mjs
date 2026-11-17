import { launch, openPage, waitFor } from '../tools/browser.mjs';

const BASE = process.env.OLDWEB_URL || 'http://127.0.0.1:5225/dev/oldweb.html';
const SHOTS = process.env.OLDWEB_SHOTS || '';
const want = (n) => !process.env.PHASES || process.env.PHASES.split(',').includes(String(n));
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
  const Z = g.zones.oldweb;
  const keys = new Set();
  const T = {
    g, Z, events: [], trace: [],
    hold(code, down = true) {
      g.input.simulate(code, down);
      if (down) keys.add(code);
      else keys.delete(code);
    },
    releaseAll() {
      for (const k of [...keys]) T.hold(k, false);
    },
    step(n = 1) {
      for (let i = 0; i < n; i++) {
        g.input.poll();
        g.debug.advance(1 / 60);
        g.input.endFrame();
      }
    },
    closeReader() {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Enter', key: 'Enter', bubbles: true }));
    },
    frames(n = 2) {
      return new Promise((r) => {
        const loop = (k) => (k <= 0 ? r() : requestAnimationFrame(() => loop(k - 1)));
        loop(n);
      });
    },
    toLocal(lx, lz) {
      const [cx, cz, yaw] = Z.inspect().chapel;
      return [cx + lx * Math.cos(yaw) + lz * Math.sin(yaw), cz - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
    },
    look(x, y, z) {
      const e = g.player.eye;
      g.player.yaw = Math.atan2(-(x - e.x), -(z - e.z));
      g.player.pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z));
    },
    walkTo(x, z, { tol = 0.8, maxT = 90, sprint = true, jump = false } = {}) {
      T.hold('KeyW', true);
      if (sprint) T.hold('ShiftLeft', true);
      let t = 0;
      let last = g.player.position.clone();
      let since = 0;
      let dodge = 0;
      let lastJump = -9;
      while (t < maxT) {
        const p = g.player.position;
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < tol) break;
        const yaw = Math.atan2(-(x - p.x), -(z - p.z));
        g.player.yaw = yaw + (dodge > 0 ? 1.1 : 0);
        if (dodge > 0) dodge -= 0.1;
        if (jump && d < 2.2 && t - lastJump > 0.8) {
          lastJump = t;
          g.input.simulate('Space', true);
          T.step(24);
          g.input.simulate('Space', false);
        }
        T.step(6);
        t += 0.1;
        since += 0.1;
        if (since >= 0.6) {
          if (g.player.position.distanceTo(last) < 0.5) {
            dodge = 0.7;
            g.input.simulate('Space', true);
            T.step(20);
            g.input.simulate('Space', false);
          }
          last = g.player.position.clone();
          since = 0;
        }
      }
      T.hold('KeyW', false);
      T.hold('ShiftLeft', false);
      T.step(20);
      const p = g.player.position;
      return Math.hypot(x - p.x, z - p.z);
    },
    click(code = 'Mouse0') {
      g.input.simulate(code, true);
      T.step(2);
      g.input.simulate(code, false);
      T.step(2);
    },
    route(points, opts) {
      let d = 0;
      for (const [x, z] of points) {
        d = T.walkTo(x, z, { tol: 1.2, ...opts });
        T.trace.push({ wp: [Math.round(x), Math.round(z)], d: +d.toFixed(2), held: T.heldId(), p: g.player.position.toArray().map((v) => +v.toFixed(1)) });
      }
      return d;
    },
    relic(id) {
      return Z.inspect().relics.find((r) => r.id === id);
    },
    pedestal(id) {
      return Z.inspect().pedestals.find((p) => p.id === id);
    },
    heldId() {
      const e = g.cursor.held;
      return e?.userData?.relic || null;
    },
    grabRelic(id) {
      const r = T.relic(id);
      T.look(r.position[0], r.position[1], r.position[2]);
      T.step(2);
      T.click('Mouse0');
      T.step(10);
      return T.heldId();
    },
    async place(id) {
      const p = T.pedestal(id);
      const fx = Math.sin(p.yaw);
      const fz = Math.cos(p.yaw);
      const [tx, ty, tz] = p.top;
      const want = { x: tx, y: ty + 0.38, z: tz };
      T.walkTo(tx + fx * 2.3, tz + fz * 2.3, { tol: 0.3, sprint: false, maxT: 20 });
      const aim = { ...want };
      let err = 9;
      for (let i = 0; i < 24; i++) {
        T.look(aim.x, aim.y, aim.z);
        T.step(30);
        const e = g.cursor.held;
        if (!e) return { ok: false, reason: 'dropped', i, p: g.player.position.toArray().map((v) => +v.toFixed(2)) };
        const o = e.position;
        const along = (o.x - tx) * fx + (o.z - tz) * fz;
        err = Math.hypot(o.x - tx, o.z - tz);
        if (err < 0.1 && Math.abs(o.y - want.y) < 0.25) break;
        const n = Math.round(Math.abs(along) / 0.09);
        if (n > 0 && Math.abs(along) > 0.08) {
          const key = along > 0 ? 'KeyW' : 'KeyS';
          g.input.simulate(key, true);
          T.step(Math.min(n, 12));
          g.input.simulate(key, false);
          T.step(10);
        }
        const side = (o.x - tx) * fz - (o.z - tz) * fx;
        aim.x -= fz * side * 0.8;
        aim.z += fx * side * 0.8;
        aim.y += (want.y - o.y) * 0.8;
      }
      T.click('Mouse0');
      T.step(120);
      return { ok: true, err };
    },
  };
  for (const type of ['scan:hit', 'grab:start', 'grab:end', 'beacon:ready', 'beacon:activated', 'player:respawn']) {
    g.events.on(type, (p) => T.events.push({ type, kind: p?.kind, zone: p?.zone, label: p?.handle?.label }));
  }
  window.__T = T;
};

const { browser, context } = await launch({ width: 1280, height: 720 });
await context.route(/\/@vite\/client/, (route) => route.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));

async function open(query) {
  const { page, log } = await openPage(context, `${BASE}?mute=1${query}`, { quiet: true });
  await waitFor(page, 'window.__game?.ready', 120000);
  await page.waitForTimeout(1500);
  await page.evaluate(HELPERS);
  return { page, log };
}

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

try {
  // 1. Boot + budgets
  if (want(1)) {
    const poses = {
      inside: [-470, 470, 2.4, -0.05],
      chapel: [-596, 596, 2.356, 0.05],
      hub: [0, 0, 2.356, 0],
    };
    const measure = async (query) => {
      const { page, log } = await open(query);
      const out = {};
      for (const [name, [x, z, yaw, pitch]] of Object.entries(poses)) {
        out[name] = await page.evaluate(async ({ x, z, yaw, pitch }) => {
          const g = window.__game;
          g.player.teleport(x, g.world.heightAt(x, z), z, yaw);
          g.player.pitch = pitch;
          await window.__T.frames(240);
          const s = [];
          for (let i = 0; i < 40; i++) {
            await window.__T.frames(1);
            s.push(g.debug.stats());
          }
          return { calls: Math.max(...s.map((v) => v.calls)), triangles: Math.max(...s.map((v) => v.triangles)) };
        }, { x, z, yaw, pitch });
      }
      await page.close();
      return { out, log };
    };
    const withZone = await measure('&nosave=1');
    const without = await measure('&nosave=1&zones=none');
    check('boot: no console errors', withZone.log.errors.length === 0, withZone.log.errors.slice(0, 3).join(' | '));
    check('boot: no console warnings', withZone.log.warnings.length === 0, withZone.log.warnings.slice(0, 3).join(' | '));
    for (const name of Object.keys(poses)) {
      const dc = withZone.out[name].calls - without.out[name].calls;
      const dt = withZone.out[name].triangles - without.out[name].triangles;
      const far = name === 'hub';
      console.log(`     ${name}: +${dc} draw calls, +${(dt / 1000).toFixed(1)}k triangles`);
      check(`budget ${name}: draw calls`, dc <= (far ? 10 : 60), `+${dc}`);
      check(`budget ${name}: triangles`, dt <= 300000, `+${(dt / 1000).toFixed(0)}k`);
    }
  }

  // 2. Completable by play
  if (want(2)) {
    await context.clearCookies();
    const { page, log } = await open('&nosave=1');
    const r = await page.evaluate(async () => {
      const T = window.__T;
      const g = T.g;
      const out = {};
      const [sx, sy, sz] = T.Z.spawn;
      out.spawnOk = g.player.position.distanceTo({ x: sx, y: sy, z: sz }) < 2.5;

      // Modem: the cave
      const cave = T.Z.inspect().cave;
      g.player.teleport(cave[0] + 30, g.world.heightAt(cave[0] + 30, cave[2]), cave[2], Math.PI / 2);
      T.step(10);
      g.input.simulate('KeyF', true);
      await T.frames(3);
      g.input.simulate('KeyF', false);
      await new Promise((res) => setTimeout(res, 3500));
      out.scanHuman = T.events.filter((e) => e.type === 'scan:hit' && e.kind === 'human').map((e) => e.label);
      out.signal = g.scanner.signal;
      T.walkTo(cave[0] + 2, cave[2], { sprint: false });
      const modem = T.relic('modem');
      out.modemWalk = T.walkTo(modem.position[0] + 1.6, modem.position[2], { sprint: false });
      out.modemGrab = T.grabRelic('modem');
      // Wrong pedestal first
      const pf = T.pedestal('floppy');
      out.toPedestals = T.walkTo(...T.toLocal(-9, 14));
      out.toPedestals2 = T.walkTo(pf.top[0] + Math.sin(pf.yaw) * 2, pf.top[2] + Math.cos(pf.yaw) * 2, { sprint: false });
      out.wrongPlace = await T.place('floppy');
      out.wrongEjected = !T.relic('modem').placed && T.pedestal('floppy').occupied === null;
      out.modemRegrab = T.grabRelic('modem');
      if (!out.modemRegrab) {
        const m = T.relic('modem');
        T.walkTo(m.position[0] + 1.5, m.position[2] + 1.5, { sprint: false, tol: 0.4 });
        out.modemRegrab = T.grabRelic('modem');
      }
      out.modemPlace = await T.place('modem');
      out.modemPlaced = T.relic('modem').placed;

      // Floppy: the climb
      const foot = T.Z.inspect().rampFoot;
      g.player.teleport(foot[0], g.world.heightAt(foot[0], foot[2] - 1.5), foot[2] - 1.5, Math.PI);
      T.step(10);
      const top = T.Z.inspect().rampTop;
      out.rampWalk = T.walkTo(top[0], top[2] - 0.3, { sprint: false, tol: 0.5 });
      out.rampY = g.player.position.y - foot[1];
      const ledge = T.Z.inspect().ledgeTop;
      out.ledgeWalk = T.walkTo(ledge[0], ledge[2], { sprint: false, jump: true, tol: 0.6, maxT: 12 });
      out.onLedge = g.player.position.y > ledge[1] - 0.2;
      out.floppyGrab = T.grabRelic('floppy');
      const pfl = T.pedestal('floppy');
      g.player.yaw = 0;
      T.walkTo(ledge[0], ledge[2] - 4, { sprint: false, tol: 0.6, maxT: 8 });
      out.floppyCarry1 = T.heldId();
      T.route([[-556, 482], [-534, 477], [-525, 505], [-529, 521], [-548, 572], T.toLocal(-9, 14)]);
      T.walkTo(pfl.top[0] + Math.sin(pfl.yaw) * 2, pfl.top[2] + Math.cos(pfl.yaw) * 2, { sprint: false });
      out.floppyPlace = await T.place('floppy');
      out.floppyPlaced = T.relic('floppy').placed;
      out.trace = T.trace.splice(0);
      out.floppyPos = T.relic('floppy').position.map((v) => +v.toFixed(2));

      // CD-ROM: the search
      const cd = T.relic('cdrom');
      g.player.teleport(cd.position[0] - 2.4, g.world.heightAt(cd.position[0] - 2.4, cd.position[2] + 1.2), cd.position[2] + 1.2, 0);
      T.step(10);
      out.cdCaught = T.relic('cdrom').caught;
      out.cdGrab = T.grabRelic('cdrom');
      const pc = T.pedestal('cdrom');
      T.route([[-529, 521], [-548, 572], T.toLocal(9, 16)]);
      T.walkTo(pc.top[0] + Math.sin(pc.yaw) * 2, pc.top[2] + Math.cos(pc.yaw) * 2, { sprint: false });
      out.cdPlace = await T.place('cdrom');
      out.cdPlaced = T.relic('cdrom').placed;
      T.step(200);
      out.solved = T.Z.inspect().solved;
      out.beaconReady = g.state.beacons.oldweb;
      out.flags = { relics: g.state.flag('zone.oldweb.relics'), pedestals: g.state.flag('zone.oldweb.pedestals') };
      out.counter = T.Z.inspect().counter;
      return out;
    });
    console.log('     run:', JSON.stringify(r));
    check('spawn at the arrival', r.spawnOk);
    check('scan reveals the relics as human', ['Modem 56k', 'Disquette 3½', 'CD-ROM "50 heures gratuites"'].some((l) => r.scanHuman.includes(l)), r.scanHuman.join(', '));
    check('modem grabbed in the cave', r.modemGrab === 'modem');
    check('wrong pedestal ejects the relic', r.wrongEjected);
    check('modem placed on its pedestal', r.modemPlaced);
    check('ramp climbed', r.rampY > 1.6, r.rampY.toFixed(2));
    check('ledge reached by a jump', r.onLedge);
    check('floppy grabbed on the ledge', r.floppyGrab === 'floppy');
    check('floppy carried down', r.floppyCarry1 === 'floppy');
    check('floppy placed', r.floppyPlaced);
    check('CD caught in the tree', r.cdCaught);
    check('CD grabbed from the tree', r.cdGrab === 'cdrom');
    check('CD placed', r.cdPlaced);
    check('challenge solved, beacon ready', r.solved && r.beaconReady === 'ready');
    check('flags relics + pedestals', r.flags.relics === true && r.flags.pedestals === true);
    check('counter flips to 215', r.counter === 215);
    await shot(page, 'proof-solved');

    const r2 = await page.evaluate(async () => {
      const T = window.__T;
      const g = T.g;
      const out = {};
      T.walkTo(...T.toLocal(-1.5, 14.5));
      T.walkTo(...T.toLocal(0, 8.8), { sprint: false });
      T.walkTo(...T.toLocal(0, 4), { sprint: false });
      T.walkTo(...T.toLocal(0, -1.7), { sprint: false, tol: 0.3 });
      const book = T.Z.inspect().book;
      T.look(book[0], book[1], book[2]);
      await T.frames(4);
      out.prompt = g.interact.current?.id;
      await g.debug.press('KeyE', 80);
      await T.frames(10);
      out.mode = g.state.mode;
      T.closeReader();
      await T.frames(10);
      out.guestbook = g.state.flag('zone.oldweb.guestbook');
      const b = g.beacons.get('oldweb');
      const ring = b.ringPos || b.ringPosition;
      const front = { x: b.position.x + Math.sin(T.Z.inspect().chapel[2]) * 1.4, z: b.position.z + Math.cos(T.Z.inspect().chapel[2]) * 1.4 };
      T.walkTo(front.x, front.z, { sprint: false, tol: 0.4 });
      T.look(ring.x, ring.y - 1.6, ring.z);
      await T.frames(4);
      T.step(1);
      out.beaconPrompt = g.interact.current?.id;
      out.beaconDist = g.player.position.distanceTo(b.position);
      out.beaconStatus = b.status;
      await g.debug.press('KeyE', 80);
      for (let i = 0; i < 200 && g.state.mode !== 'reading'; i++) await T.frames(5);
      out.beacon = g.state.beacons.oldweb;
      out.activated = T.events.some((e) => e.type === 'beacon:activated' && e.zone === 'oldweb');
      out.readingBeaconDoc = g.state.mode === 'reading';
      T.closeReader();
      await T.frames(10);
      out.beaconFlag = g.state.flag('zone.oldweb.beacon');
      return out;
    });
    console.log('     end:', JSON.stringify(r2));
    check('guestbook interaction offered', r2.prompt === 'oldweb:guestbook', r2.prompt);
    check('guestbook opens the reader', r2.mode === 'reading');
    check('guestbook flag', r2.guestbook === true);
    check('beacon interaction offered', r2.beaconPrompt === 'beacon:oldweb', r2.beaconPrompt);
    check('beacon relit by E', r2.beacon === 'active' && r2.activated);
    check('beacon document opened', r2.readingBeaconDoc);
    check('beacon step flag', r2.beaconFlag === true);
    check('run: no console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
    await page.close();
  }

  // 3. debugSolve + activation, 4. reload solved
  if (want(3)) {
    const { page, log } = await open('');
    await page.evaluate(() => localStorage.removeItem('dhsi.save.v1'));
    await page.reload({ waitUntil: 'load' });
    await waitFor(page, 'window.__game?.ready', 120000);
    await page.evaluate(HELPERS);
    const r = await page.evaluate(async () => {
      const T = window.__T;
      const g = T.g;
      const out = { before: g.state.beacons.oldweb };
      g.debug.solve('oldweb');
      out.ready = g.state.beacons.oldweb;
      const done = g.beacons.activate('oldweb');
      for (let i = 0; i < 200 && g.state.mode !== 'reading'; i++) await T.frames(5);
      out.active = g.state.beacons.oldweb;
      out.event = T.events.some((e) => e.type === 'beacon:activated' && e.zone === 'oldweb');
      out.reading = g.state.mode === 'reading';
      T.closeReader();
      await done;
      g.state.save();
      return out;
    });
    check('debugSolve on a fresh boot → ready', r.before === 'locked' && r.ready === 'ready', JSON.stringify(r));
    check('activation → active + event + document', r.active === 'active' && r.event && r.reading);
    await page.goto(`${BASE}?mute=1&load=1`, { waitUntil: 'load' });
    await waitFor(page, 'window.__game?.ready', 120000);
    await page.waitForTimeout(1500);
    const r4 = await page.evaluate(() => {
      const g = window.__game;
      const i = g.zones.oldweb.inspect();
      return { beacon: g.state.beacons.oldweb, solved: i.solved, placed: i.relics.every((x) => x.placed), counter: i.counter, occupied: i.pedestals.map((p) => p.occupied) };
    });
    check('reload: zone rebuilt solved', r4.beacon === 'active' && r4.solved && r4.placed && r4.counter === 215, JSON.stringify(r4));
    await shot(page, 'proof-reload');
    await page.evaluate(() => localStorage.removeItem('dhsi.save.v1'));
    check('reload: no console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
    await page.close();
  }

  // 5. Random input fuzz
  if (want(5)) {
    const { page, log } = await open('&nosave=1');
    const r = await page.evaluate(async () => {
      const T = window.__T;
      const g = T.g;
      const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'Mouse0', 'Mouse2', 'KeyF'];
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const spots = [[-470, 470], [-604, 600], [-583.6, 436], [-660, 530], [-507, 492]];
      let bad = 0;
      let below = 0;
      for (let t = 0; t < 600; t++) {
        if (t % 120 === 0) {
          const [x, z] = spots[(t / 120) % spots.length];
          g.player.teleport(x, g.world.heightAt(x, z), z, rnd() * 6.28);
        }
        for (const c of codes) if (rnd() < 0.15) g.input.simulate(c, rnd() < 0.5);
        g.player.yaw += (rnd() - 0.5) * 0.6;
        g.player.pitch = Math.max(-1.2, Math.min(1.2, g.player.pitch + (rnd() - 0.5) * 0.3));
        T.step(6);
        const p = g.player.position;
        if (!Number.isFinite(p.x + p.y + p.z)) bad++;
        if (p.y < g.world.heightAt(p.x, p.z) - 0.5) below++;
        for (const r of T.Z.inspect().relics) if (!r.position.every(Number.isFinite)) bad++;
        if (t % 30 === 0) await T.frames(1);
      }
      for (const c of codes) g.input.simulate(c, false);
      if (g.cursor.held) g.cursor.release();
      T.step(30);
      const cd = T.relic('cdrom');
      g.player.teleport(cd.position[0] - 2.5, g.world.heightAt(cd.position[0] - 2.5, cd.position[2] + 1.5), cd.position[2] + 1.5, 0);
      T.step(10);
      const grabbed = T.grabRelic('cdrom');
      const e = g.cursor.held;
      g.cursor.release({ throw: true });
      e.setPosition([-260, g.world.heightAt(-260, 700) + 1, 700]);
      T.step(60 * 21);
      const back = T.relic('cdrom');
      const respawned = Math.hypot(back.position[0] - back.origin[0], back.position[2] - back.origin[2]) < 0.5 && back.caught;
      return { bad, below, grabbed, respawned };
    });
    check('fuzz 60 s: no NaN', r.bad === 0, JSON.stringify(r));
    check('fuzz 60 s: never below the terrain', r.below === 0, JSON.stringify(r));
    check('relic thrown out of the zone respawns where it was found', r.grabbed === 'cdrom' && r.respawned, JSON.stringify(r));
    check('fuzz: no console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
    await page.close();
  }
} catch (err) {
  console.log('FAIL exception', err.stack || err);
  failures++;
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
