import { launch, openPage, waitFor } from '../tools/browser.mjs';

const BASE = process.env.STORY_URL || 'http://127.0.0.1:5221/dev/hub.html';
const SHOTS = process.env.STORY_SHOTS || '';
let failures = 0;
const ONLY = process.env.STORY_ONLY ? process.env.STORY_ONLY.split(',') : null;
const want = (name) => !ONLY || ONLY.includes(name);
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
  const T = {
    g,
    events: [],
    said: [],
    async step(sec) {
      const n = Math.round(sec * 60);
      for (let i = 0; i < n; i += 30) {
        g.debug.advance(Math.min(30, n - i) / 60);
        await new Promise((r) => setTimeout(r, 0));
      }
    },
    place(x, z, yaw = 0) {
      g.player.teleport(x, g.world.heightAt(x, z) + 0.1, z, yaw);
    },
    aimAt(x, y, z) {
      const e = g.player.eye;
      g.player.yaw = Math.atan2(-(x - e.x), -(z - e.z));
      g.player.pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z));
    },
    count(type, pred = () => true) {
      return T.events.filter((e) => e.type === type && pred(e.p || {})).length;
    },
  };
  for (const type of ['zone:enter', 'zone:leave', 'stage:change', 'game:start', 'link:restored', 'mode:change', 'scan:end']) {
    g.events.on(type, (p) => T.events.push({ type, p, t: g.time.now }));
  }
  const say = g.companion.say.bind(g.companion);
  g.companion.say = (k, o) => {
    T.said.push(String(k));
    return say(k, o);
  };
  window.__T = T;
  return true;
};

const { browser, context } = await launch({ width: 1280, height: 720 });
await context.route(/\/@vite\/client/, (route) => route.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));

async function boot(query, { clear = true, until = 'window.__game?.ready' } = {}) {
  const origin = new URL(BASE).origin;
  const { page, log } = await openPage(context, clear ? `${origin}/@vite/client` : `${BASE}${query}`, { quiet: true });
  if (clear) {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto(`${BASE}${query}`, { waitUntil: 'load' });
  }
  await waitFor(page, until, 120000);
  await page.evaluate(HELPERS);
  return { page, log };
}
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : null);
const run = (page, fn, arg) => page.evaluate(fn, arg);
const errorsOf = (log) => [...log.errors, ...log.warnings];

if (want('flow')) {
  const { page, log } = await boot('?mute=1', { until: 'window.__game?.ready && window.__game.state.mode === "title"' });
  await page.waitForTimeout(2500);
  const cam = await run(page, () => {
    const p = __game.camera.position;
    return { x: p.x, y: p.y, z: p.z };
  });
  await page.waitForTimeout(1500);
  const cam2 = await run(page, () => {
    const p = __game.camera.position;
    return { x: p.x, y: p.y, z: p.z, title: Boolean(document.querySelector('.title.layer')), canContinue: Boolean(document.querySelector('[data-id="continue"]')) };
  });
  await shot(page, 'test-title');
  check('fresh boot shows the title over a live orbiting world', cam2.title && !cam2.canContinue && Math.hypot(cam.x - cam2.x, cam.z - cam2.z) > 0.2, `camera moved ${Math.hypot(cam.x - cam2.x, cam.z - cam2.z).toFixed(2)} m`);
  await page.click('[data-id="new"]');
  await waitFor(page, 'window.__game.state.mode === "intro"', 10000);
  await waitFor(page, '(document.querySelector(".intro-typed")?.textContent || "").length > 24 && (document.querySelector(".intro-rest")?.textContent || "").length > 12', 30000);
  await shot(page, 'test-intro');
  const typing = await run(page, () => document.querySelector('.intro-typed')?.textContent || '');
  check('"Commencer" plays the intro cards', typing.length > 0, `typed "${typing}"`);
  await waitFor(page, 'window.__game.state.mode === "playing"', 90000);
  await page.waitForTimeout(3500);
  await shot(page, 'test-playing');
  const after = await run(page, () => {
    const g = __game;
    const p = g.player.position;
    const hud = document.querySelector('.hud');
    return {
      d: Math.hypot(p.x - 0, p.z - 8), newGame: __T.events.find((e) => e.type === 'game:start')?.p?.newGame,
      hud: hud ? !hud.classList.contains('is-hidden') : false, zone: g.story.zone, cookie: g.zones.hub.cookie?.state,
    };
  });
  check('intro ends in "playing" at the hub spawn with the HUD', after.d < 1.5 && after.hud && after.zone === 'hub', JSON.stringify(after));
  check('the cookie banner hangs in front of a new player', after.cookie === 'shown' || after.cookie === 'appearing', after.cookie);
  check('flow without errors', errorsOf(log).length === 0, errorsOf(log).slice(0, 2).join(' | '));
  await page.close();
}

if (want('tutorial')) {
  const { page, log } = await boot('?nosave=1&skipMenu=1&skipIntro=1&mute=1', { until: 'window.__game?.ready && window.__game.state.mode === "playing"' });
  await run(page, () => {
    __T.said.length = 0;
  });
  await run(page, async () => {
    const T = window.__T;
    T.g.input.simulate('KeyW', true);
    await T.step(1.5);
    T.g.input.simulate('KeyW', false);
    T.place(0, 8, 0);
    for (let i = 0; i < 120 && !T.said.includes('intro.scan'); i++) await T.step(0.5);
    await T.step(2);
  });
  const mid = await run(page, () => ({ said: [...__T.said], goal: __game.state.flag('story.tut.goal') }));
  await run(page, async () => {
    const T = window.__T;
    T.g.scanner.pulse();
    await T.step(5);
    T.place(5.8, 1.5, Math.PI);
    await T.step(8);
    const e = T.g.world.zones.feed.hubEnd;
    T.place(e[0] + 4, e[2] + 6, 0);
    await T.step(8);
  });
  const tut = await run(page, () => ({ said: __T.said.filter((k) => k.startsWith('intro.')), done: __game.state.flag('story.tut.done') }));
  const order = ['intro.hello', 'intro.goal', 'intro.scan', 'intro.scanned', 'intro.grab', 'intro.links'];
  const idx = order.map((k) => tut.said.indexOf(k));
  check('tutorial lines fire in order when their conditions are met', idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])), tut.said.join(', '));
  check('tutorial marks itself done', tut.done === true, `goal after walk: ${mid.goal}`);

  const obj = await run(page, () => document.querySelector('.hud-objective')?.textContent || '');
  check('objective line shows the main objective after the goal', obj.includes('Trouver le dernier message humain'), obj);

  const btn = await run(page, () => {
    const T = window.__T;
    const g = T.g;
    T.place(0, 8.5, 0);
    const c = g.zones.hub.cookie;
    return c ? { state: c.state } : null;
  });
  await page.waitForTimeout(300);
  const click = await run(page, async () => {
    const T = window.__T;
    const g = T.g;
    const c = g.zones.hub.cookie;
    if (!c) return { missing: true };
    const b = c.buttons[1].mesh;
    const wp = b.getWorldPosition(b.position.clone());
    T.aimAt(wp.x, wp.y, wp.z);
    await T.step(0.1);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const target = g.cursor.target?.object === b;
    g.input.simulate('Mouse0', true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    g.input.simulate('Mouse0', false);
    await new Promise((r) => setTimeout(r, 600));
    await T.step(1);
    return { target, flag: g.state.flag('zone.hub.cookie'), gone: !g.zones.hub.cookie, said: T.said.includes('intro.cookie') };
  });
  check('cookie banner: the button is a clickable target', click.target === true, JSON.stringify(btn));
  check('cookie banner bursts on a simulated click and Tiret comments', click.flag && click.gone && click.said, JSON.stringify(click));

  const zones = await run(page, async () => {
    const T = window.__T;
    const g = T.g;
    T.events.length = 0;
    const out = {};
    const at = async (x, z, s = 1.2) => {
      T.place(x, z);
      await T.step(s);
    };
    await at(0, 0);
    await at(0, -112);
    await at(0, -104);
    await at(0, -116);
    out.flicker = T.count('zone:leave', (p) => p.id === 'hub');
    await at(0, -300, 2);
    out.leftHub = T.count('zone:leave', (p) => p.id === 'hub');
    out.neutral = document.querySelector('.address')?.textContent || '';
    await at(0, -560, 2);
    out.feedEnter = T.count('zone:enter', (p) => p.id === 'feed');
    out.address = document.querySelector('.address')?.textContent || '';
    out.objective = document.querySelector('.hud-objective')?.textContent || '';
    out.saidEnter = T.said.includes('zone.feed.enter');
    const hint = g.texts.HINTS.feed[0];
    await T.step(100);
    out.hintEarly = T.said.includes(hint);
    await T.step(55);
    out.hint = T.said.includes(hint) && g.state.flag('story.hint.feed') === 1;
    await at(0, -300, 2);
    await at(0, 0, 2);
    out.feedLeave = T.count('zone:leave', (p) => p.id === 'feed');
    out.hubEnter = T.count('zone:enter', (p) => p.id === 'hub');
    out.total = T.events.filter((e) => e.type.startsWith('zone:')).length;
    return out;
  });
  check('zone borders: no flicker across the hub edge', zones.flicker === 0 && zones.leftHub === 1, JSON.stringify(zones));
  check('zone:enter / zone:leave once each across the feed border', zones.feedEnter === 1 && zones.feedLeave === 1 && zones.hubEnter === 1 && zones.total === 4, `total ${zones.total}`);
  check('after ~150 s without progress in a zone, Tiret gives its first hint', !zones.hintEarly && zones.hint, `early ${zones.hintEarly}, at 155 s ${zones.hint}`);
  check('entering the feed updates the address bar and the objective, Tiret greets', zones.address.includes('fil.flux-infini.app') && zones.objective.includes('Descendre au fond du Fil') && zones.saidEnter, `${zones.address} | ${zones.objective}`);
  check('tutorial and zones without console errors', errorsOf(log).length === 0, errorsOf(log).slice(0, 2).join(' | '));
  await page.close();
}

if (want('runaway')) {
  const { page, log } = await boot('?nosave=1&skipMenu=1&skipIntro=1&mute=1', { until: 'window.__game?.ready && window.__game.state.mode === "playing"' });
  const away = await run(page, async () => {
    const T = window.__T;
    T.said.length = 0;
    await T.step(0.5);
    T.place(150, -200);
    await T.step(20);
    T.place(5.8, 1.5);
    await T.step(4);
    return { said: T.said.filter((k) => k.startsWith('intro.')), done: __game.state.flag('story.tut.done') };
  });
  check('tutorial is skipped without error when the player runs away', away.done === true && !away.said.includes('intro.grab') && !away.said.includes('intro.scan'), away.said.join(', '));
  check('run-away without console errors', errorsOf(log).length === 0, errorsOf(log).slice(0, 2).join(' | '));
  await page.close();
}

if (want('beacons')) {
  const { page, log } = await boot('?skipMenu=1&skipIntro=1&mute=1', { until: 'window.__game?.ready && window.__game.state.mode === "playing"' });
  await run(page, async () => {
    const T = window.__T;
    T.g.story.debug.skipTutorial();
    T.g.zones.hub.debugSolve();
    T.events.length = 0;
    await T.step(1);
  });
  const stages = [];
  for (const [i, zone] of ['feed', 'farm', 'hallu', 'oldweb', 'forest'].entries()) {
    const r = await run(page, async ([zone, count]) => {
      const T = window.__T;
      const g = T.g;
      g.state.setBeacon(zone, 'active');
      g.events.emit('beacon:activated', { zone, count });
      await T.step(1.5);
      const sc = T.events.filter((e) => e.type === 'stage:change').pop();
      return { stage: sc?.p?.stage, from: sc?.p?.from, said: T.said.slice(-2), mode: g.state.mode };
    }, [zone, i + 1]);
    stages.push(r);
    if (i < 4) await page.waitForTimeout(400);
  }
  check('five beacon:activated move the stage 1 → 5', stages.every((s, i) => s.stage === i + 1 && s.from === i), stages.map((s) => s.stage).join(','));
  check('Tiret reacts to each beacon (first, any, any, night, all)', ['beacon.first', 'beacon.any', 'beacon.any', 'stage.night', 'beacon.all'].every((k, i) => stages[i].said.includes(k)), stages.map((s) => s.said.join('+')).join(' / '));
  await waitFor(page, 'window.__game.state.mode === "cinematic"', 45000);
  const cin = [];
  for (const t of [2.2, 6.2, 9.4]) {
    await waitFor(page, `window.__game.story.debug.ring.time >= ${t}`, 20000);
    await shot(page, `test-ring-${cin.length}`);
    cin.push(await run(page, () => __game.story.debug.ring.time));
  }
  await waitFor(page, 'window.__game.state.mode === "playing"', 30000);
  await page.waitForTimeout(1200);
  const ring = await run(page, () => ({
    enabled: __game.links.get('lighthouse')?.enabled, restored: __T.count('link:restored', (p) => p.id === 'lighthouse'),
    objective: document.querySelector('.hud-objective')?.textContent || '', said: __T.said.includes('link.restored'), done: __game.state.flag('story.ring.done'),
  }));
  check('the fifth beacon plays the "ring closes" cinematic', cin.length === 3, cin.map((t) => t.toFixed(1)).join(', '));
  check('the cinematic enables the lighthouse link', ring.enabled === true && ring.restored === 1 && ring.said && ring.done, JSON.stringify(ring));
  check('objective switches to the finale', ring.objective.includes('lien rétabli'), ring.objective);

  await run(page, async () => {
    const T = window.__T;
    T.place(14, 15, 1.2);
    await T.step(3);
    T.g.story.save();
  });
  const saved = await run(page, () => ({ ...__game.state.checkpoint }));
  await page.goto(`${BASE}?mute=1`, { waitUntil: 'load' });
  await waitFor(page, 'window.__game?.ready && window.__game.state.mode === "title"', 120000);
  await page.evaluate(HELPERS);
  const canContinue = await run(page, () => Boolean(document.querySelector('[data-id="continue"]')));
  await page.click('[data-id="continue"]');
  await waitFor(page, 'window.__game.state.mode === "playing"', 30000);
  await page.waitForTimeout(2500);
  const cont = await run(page, () => {
    const g = __game;
    const p = g.player.position;
    return { x: p.x, z: p.z, stage: g.state.stage, env: g.env.stage, link: g.links.get('lighthouse')?.enabled, newGame: __T.events.find((e) => e.type === 'game:start')?.p?.newGame, cookie: Boolean(g.zones.hub.cookie) };
  });
  check('"Continuer" restores position, stage and the enabled link', canContinue && Math.hypot(cont.x - saved.x, cont.z - saved.z) < 1.5 && cont.stage === 5 && cont.env === 5 && cont.link === true && cont.newGame === false && !cont.cookie, JSON.stringify(cont));
  await page.goto(`${BASE}?mute=1`, { waitUntil: 'load' });
  await waitFor(page, 'window.__game?.ready && window.__game.state.mode === "title"', 120000);
  await page.click('[data-id="new"]');
  await waitFor(page, 'window.__game?.ready && window.__game.state.mode === "intro"', 120000);
  const fresh = await run(page, () => ({ stage: __game.state.stage, title: Boolean(document.querySelector('.title.layer')), link: __game.links.get('lighthouse')?.enabled, flags: Object.keys(__game.state.flags).length }));
  check('"Commencer" over a save reloads into a clean new game, straight into the intro', fresh.stage === 0 && !fresh.title && fresh.link === false, JSON.stringify(fresh));
  check('beacons, cinematic and continue without console errors', errorsOf(log).length === 0, errorsOf(log).slice(0, 2).join(' | '));
  await page.evaluate(() => localStorage.clear());
  await page.close();
}

if (want('budget')) {
  const measure = async (zones) => {
    const { page } = await boot(`?nosave=1&skipMenu=1&skipIntro=1&mute=1&zones=${zones}`, { until: 'window.__game?.ready && window.__game.state.mode === "playing"' });
    await run(page, () => {
      __game.companion.silence();
      __game.player.teleport(0, 38.04, 14, 0);
      __game.player.pitch = 0.05;
    });
    await page.waitForTimeout(2500);
    const s = await run(page, () => __game.debug.stats());
    await page.close();
    return s;
  };
  const withHub = await measure('hub');
  const without = await measure('none');
  const calls = withHub.calls - without.calls;
  const tris = withHub.triangles - without.triangles;
  console.log(`     hub budget from the plaza: +${calls} draw calls, +${(tris / 1000).toFixed(0)}k triangles (total ${withHub.calls} / ${(withHub.triangles / 1e6).toFixed(2)} M)`);
  check('hub within budget (≤ 60 draw calls, ≤ 300k triangles)', calls <= 60 && tris <= 300000, `${calls} calls, ${tris} tris`);
}

if (want('soak')) {
  const { page, log } = await boot('?nosave=1&skipMenu=1&skipIntro=1&mute=1', { until: 'window.__game?.ready && window.__game.state.mode === "playing"' });
  const soak = await run(page, async () => {
    const T = window.__T;
    const g = T.g;
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space', 'KeyF', 'Mouse0', 'Mouse2', 'KeyE'];
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let bad = 0;
    let below = 0;
    for (let i = 0; i < 60 * 60; i++) {
      if (i % 15 === 0) {
        for (const k of keys) g.input.simulate(k, rnd() < (k === 'KeyW' ? 0.6 : 0.15));
        g.input.simulateLook((rnd() - 0.5) * 300, (rnd() - 0.5) * 120);
      }
      if (i % 600 === 0) T.place((rnd() - 0.5) * 50, (rnd() - 0.5) * 50, rnd() * 6);
      if (g.state.mode === 'reading' && i % 30 === 0) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
      g.debug.advance(1 / 60);
      const p = g.player.position;
      if (!Number.isFinite(p.x + p.y + p.z) || !Number.isFinite(g.camera.position.y)) bad++;
      if (p.y < g.world.heightAt(p.x, p.z) - 0.3) below++;
      if (i % 60 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    for (const k of keys) g.input.simulate(k, false);
    return { bad, below, mode: g.state.mode };
  });
  check('60 s random-input soak at the hub: no NaN, never under the terrain', soak.bad === 0 && soak.below === 0, JSON.stringify(soak));
  check('soak without console errors', errorsOf(log).length === 0, errorsOf(log).slice(0, 2).join(' | '));
  await page.close();
}

if (want('wilds')) {
  const { page, log } = await boot('?nosave=1&skipMenu=1&skipIntro=1&mute=1', { until: 'window.__game?.ready && window.__game.state.mode === "playing"' });
  const climb = await run(page, async () => {
    const T = window.__T;
    const g = T.g;
    g.story.debug.skipTutorial();
    g.zones.hub.debugSolve();
    const { stairs, peak } = g.zones.hub.wilds;
    const line = stairs.line.map(([x, , z]) => [x, z]);
    line.push([peak[0], peak[2]]);
    T.place(line[0][0], line[0][1]);
    await T.step(0.5);
    g.input.simulate('KeyW', true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    let idx = 0;
    let t = 0;
    while (t < 180 && idx < line.length - 3) {
      const p = g.player.position;
      let best = idx;
      let bd = Infinity;
      for (let j = Math.max(0, idx - 10); j < Math.min(line.length, idx + 25); j++) {
        const d = Math.hypot(line[j][0] - p.x, line[j][1] - p.z);
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      idx = best;
      const [tx, tz] = line[Math.min(line.length - 1, idx + 2)];
      g.player.yaw = Math.atan2(-(tx - p.x), -(tz - p.z));
      g.debug.advance(1 / 60);
      t += 1 / 60;
      if (Math.round(t * 60) % 120 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    for (let i = 0; i < 120; i++) {
      const p = g.player.position;
      g.player.yaw = Math.atan2(-(peak[0] - p.x), -(peak[2] - p.z));
      g.debug.advance(1 / 60);
    }
    g.input.simulate('KeyW', false);
    const p = g.player.position;
    return { t: Math.round(t), d: Math.hypot(p.x - peak[0], p.z - peak[2]), dy: p.y - peak[1], steps: stairs.count, length: line.length };
  });
  check('the summit of the Monts du Cache is reachable on foot along its carved steps', climb.d < 3 && climb.dy > -2.5, JSON.stringify(climb));
  const pier = await run(page, async () => {
    const T = window.__T;
    const g = T.g;
    const { x0, x1, z } = g.zones.hub.wilds.pier;
    T.place(x0 + 9, z, Math.PI / 2);
    g.input.simulate('KeyW', true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (let i = 0; i < 9 * 60 && g.player.position.x > x1 + 1.2; i++) {
      g.player.yaw = Math.PI / 2 + (z - g.player.position.z) * 0.3;
      g.debug.advance(1 / 60);
    }
    g.input.simulate('KeyW', false);
    const p = g.player.position;
    return { x: p.x, y: p.y, tip: x1, grounded: g.player.grounded };
  });
  check('the pier is walkable to its tip', pier.x < pier.tip + 2.5 && pier.y > 1.2 && pier.grounded, JSON.stringify(pier));
  check('wilds without console errors', errorsOf(log).length === 0, errorsOf(log).slice(0, 2).join(' | '));
  await page.close();
}

await browser.close();
console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'}`);
process.exit(failures ? 1 : 0);
