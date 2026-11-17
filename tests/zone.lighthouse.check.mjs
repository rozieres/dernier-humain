import { launch, waitFor } from '../tools/browser.mjs';

const BASE = process.env.LIGHTHOUSE_URL || 'http://127.0.0.1:5227/dev/lighthouse.html';
const SHOTS = process.env.SHOTS || '';
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
  if (!el) { el = document.createElement('style'); el.setAttribute('data-vite-dev-id', id); document.head.appendChild(el); }
  el.textContent = css;
}
export function removeStyle() {}
export class ErrorOverlay {}`;

const HELPERS = () => {
  const g = window.__game;
  const T = {
    events: [],
    frame: () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    face(x, z) {
      const p = g.player.position;
      g.player.yaw = Math.atan2(-(x - p.x), -(z - p.z));
    },
    async walkTo(x, z, { tol = 0.6, max = 30 } = {}) {
      T.legStart = g.player.position.toArray().map((v) => +v.toFixed(2));
      g.input.simulate('KeyW', true);
      await T.frame();
      let t = 0;
      try {
        while (t < max) {
          const p = g.player.position;
          if (Math.hypot(x - p.x, z - p.z) < tol) return true;
          T.face(x, z);
          g.player.pitch = 0;
          g.debug.advance(1 / 30);
          t += 1 / 30;
          if (Math.round(t * 30) % 10 === 0) await T.frame();
        }
        const q = g.player.position;
        T.lastFail = [T.legStart, [q.x, q.y, q.z, x, z].map((v) => +v.toFixed(2))];
        return false;
      } finally {
        g.input.simulate('KeyW', false);
        await T.frame();
        g.debug.advance(0.3);
      }
    },
    aimAt(x, y, z) {
      const e = g.player.eye;
      g.player.yaw = Math.atan2(-(x - e.x), -(z - e.z));
      g.player.pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z));
    },
    async pressE() {
      await T.frame();
      await g.debug.press('KeyE', 60);
      await T.frame();
    },
  };
  for (const type of ['finale:reply', 'finale:done', 'stage:change', 'link:ride:end', 'mode:change']) g.events.on(type, (p) => T.events.push({ type, p, t: g.time.now }));
  window.T = T;
  return true;
};

async function open(context, query, { init } = {}) {
  const page = await context.newPage();
  const log = { errors: [], warnings: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') log.errors.push(m.text());
    if (m.type() === 'warning') log.warnings.push(m.text());
  });
  page.on('pageerror', (e) => log.errors.push(String(e.stack || e)));
  if (init) await page.addInitScript(init);
  await page.goto(`${BASE}?${query}`, { waitUntil: 'load', timeout: 60000 });
  await waitFor(page, 'window.__game?.ready && window.__lh', 120000);
  await page.waitForTimeout(800);
  await page.evaluate(HELPERS);
  return { page, log, run: (fn, arg) => page.evaluate(fn, arg) };
}

const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const { browser, context } = await launch({ width: 1280, height: 720 });
await context.route(/\/@vite\/client/, (route) => route.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));

{
  const { page, log, run } = await open(context, 'stage=5&nosave=1&mute=1');
  const stats = await run(async () => {
    const g = window.__game;
    const out = {};
    const pose = async (p, t) => {
      g.player.cinematic({ position: p, target: t, fov: 70, blend: 0.001 });
      for (let i = 0; i < 12; i++) await window.T.frame();
      return g.debug.stats();
    };
    out.landing = await pose([-1100, 14, 176], [-1150, 30, 172]);
    out.room = await pose([-1141.2, 15.95, 178.3], [-1138.4, 15.4, 181.6]);
    out.hub = await pose([0, 39.7, 0], [-1170, 40, 166]);
    g.player.cinematic(null);
    return out;
  });
  await page.close();
  const base = await open(context, 'stage=5&nosave=1&mute=1&zones=');
  const without = await base.run(async () => {
    const g = window.__game;
    const out = {};
    const pose = async (p, t) => {
      g.player.cinematic({ position: p, target: t, fov: 70, blend: 0.001 });
      for (let i = 0; i < 12; i++) await window.T.frame();
      return g.debug.stats();
    };
    out.landing = await pose([-1100, 14, 176], [-1150, 30, 172]);
    out.room = await pose([-1141.2, 15.95, 178.3], [-1138.4, 15.4, 181.6]);
    out.hub = await pose([0, 39.7, 0], [-1170, 40, 166]);
    return out;
  });
  await base.page.close();
  for (const k of ['landing', 'room', 'hub']) {
    const dc = stats[k].calls - without[k].calls;
    const dt = stats[k].triangles - without[k].triangles;
    const limit = k === 'hub' ? 10 : 60;
    check(`budget ${k}`, dc <= limit && dt <= 300000, `+${dc} draws, +${(dt / 1000).toFixed(0)}k tris (zone total view ${stats[k].calls} draws)`);
  }
  check('boot without console errors/warnings', log.errors.length === 0 && log.warnings.length === 0, [...log.errors, ...log.warnings].slice(0, 3).join(' | '));
}

{
  const { page, log, run } = await open(context, 'stage=3&nosave=1&mute=1');
  const r = await run(async () => {
    const g = window.__game;
    const lh = window.__lh;
    const T = window.T;
    const door = lh.cottage.doorWorld;
    g.player.teleport(door.x + 2.2, g.world.heightAt(door.x + 2.2, door.z) + 0.1, door.z, 0);
    g.debug.advance(0.5);
    T.aimAt(door.x, door.y, door.z);
    await T.frame();
    const label = g.interact.current?.label;
    await T.pressE();
    await T.sleep(400);
    const reading = g.state.mode;
    const note = document.querySelector('.reader')?.textContent || '';
    return { label, reading, note: note.includes('coincée'), noteVisible: lh.cottage.noteMesh.visible };
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  Object.assign(r, await run(() => {
    window.__game.debug.advance(1);
    return { open: window.__lh.cottage.doorOpen, mode: window.__game.state.mode };
  }));
  await shot(page, 'test-stuck-door');
  check('stuck door at stage 3', r.label === 'Pousser' && r.reading === 'reading' && r.note && !r.open && r.noteVisible && r.mode !== 'reading', JSON.stringify(r));
  check('stage 3 run without console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  await page.close();
}

{
  const past = JSON.stringify([
    { text: 'Je suis passé. Il pleuvait. Merci pour la lumière.', date: '2031-03-02T21:10:00.000Z' },
    { text: 'bonjour madame. jai lu tout le journal. le goéland au sandwich, cest vrai ?', date: '2031-07-14T23:40:00.000Z' },
  ]);
  const { page, log, run } = await open(context, 'stage=5&nosave=1&mute=1', { init: `localStorage.setItem('dhsi.messages.v1', ${JSON.stringify(past)});` });
  const r = await run(async () => {
    const g = window.__game;
    const lh = window.__lh;
    const T = window.T;
    lh.cottage.setDoor(true, true);
    const b = lh.cottage.boardWorld;
    const stand = lh.cottage.tw([-0.6, 0, -0.6]);
    g.player.teleport(stand.x, stand.y, stand.z, 0);
    g.debug.advance(0.4);
    T.aimAt(b.x, b.y, b.z);
    await T.frame();
    await T.sleep(500);
    const label = g.interact.current?.id;
    await T.pressE();
    await T.sleep(400);
    const text = document.querySelector('.reader')?.textContent || '';
    return { label, messages: g.state.playerMessages.length, hasFirst: text.includes('Il pleuvait'), hasSecond: text.includes('goéland') };
  });
  await page.waitForTimeout(600);
  await shot(page, 'test-board-reader');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(400);
  await run(async () => {
    const g = window.__game;
    const lh = window.__lh;
    const b = lh.cottage.boardWorld;
    const p = lh.cottage.tw([-0.6, 1.62, -0.9]);
    g.player.cinematic({ position: [p.x, p.y, p.z], target: [b.x, b.y, b.z], fov: 60, blend: 0.001 });
    await window.T.sleep(800);
  });
  await shot(page, 'room-board-two-messages');
  check('cork board shows two past messages', r.label === 'lighthouse:board' && r.messages === 2 && r.hasFirst && r.hasSecond, JSON.stringify(r));
  check('board run without console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  await page.close();
}

{
  const { page, log, run } = await open(context, 'stage=5&mute=1', { init: `if (!sessionStorage.getItem('lh-init')) { sessionStorage.setItem('lh-init', '1'); localStorage.clear(); }` });
  const walk = await run(async () => {
    const g = window.__game;
    const lh = window.__lh;
    const T = window.T;
    g.state.save();
    const route = [[-1110, 178], [-1122, 180.4], [-1131, 181.8]];
    const out = { legs: [] };
    for (const [x, z] of route) out.legs.push(await T.walkTo(x, z));
    const outside = lh.cottage.tw([-1.6, 0, 3.2]);
    out.legs.push(await T.walkTo(outside.x, outside.z, { tol: 0.4 }));
    out.tiretAfterDoor = g.companion.mode;
    const door = lh.cottage.doorWorld;
    T.aimAt(door.x, door.y, door.z);
    await T.frame();
    await T.sleep(300);
    out.doorLabel = g.interact.current?.label;
    await T.pressE();
    g.debug.advance(1.5);
    out.doorOpen = lh.cottage.doorOpen;
    const inside = [lh.cottage.tw([-1.6, 0, 1.2]), lh.cottage.tw([0.2, 0, 0.5]), lh.cottage.tw([1.9, 0, 0.35])];
    for (const p of inside) {
      const ok = await T.walkTo(p.x, p.z, { tol: 0.45, max: 12 });
      out.legs.push(ok);
      if (!ok) break;
    }
    out.inside = lh.state.inside;
    out.lastFail = T.lastFail;
    const crt = lh.cottage.crtWorld;
    T.aimAt(crt.x, crt.y, crt.z);
    await T.frame();
    await T.sleep(300);
    out.crtLabel = g.interact.current?.id;
    out.flagsBefore = { house: g.state.flag('story.finale.house') };
    await T.pressE();
    await T.sleep(700);
    out.mode = g.state.mode;
    return out;
  });
  check('walk from landing to the door, Tiret stays outside', walk.legs.every(Boolean) && walk.doorLabel === 'Entrer' && walk.tiretAfterDoor === 'stay', JSON.stringify({ legs: walk.legs, label: walk.doorLabel, tiret: walk.tiretAfterDoor }));
  check('door opens and the player gets inside', walk.doorOpen && walk.inside && walk.flagsBefore.house, JSON.stringify(walk));
  check('E on the CRT opens the reader', walk.crtLabel === 'lighthouse:crt' && walk.mode === 'reading', JSON.stringify(walk));
  await shot(page, 'reader-final');
  await page.click('.reader-actions button:has-text("Répondre")');
  await page.waitForSelector('textarea.reply-area', { timeout: 5000 });
  await page.waitForTimeout(600);
  const message = "J'ai lu. Il est tard ici aussi. Je laisse la lumiere alumée.";
  await page.focus('textarea.reply-area');
  await page.keyboard.type(message, { delay: 8 });
  await shot(page, 'reply-typed');
  await page.click('.reply-actions button.btn--send');
  const t0 = Date.now();
  const timeline = SHOTS ? [[4, 'finale-1-room'], [16, 'finale-2-ignite-start'], [24, 'finale-2-ignite'], [32, 'finale-2-beams'], [38, 'finale-3-strait'], [46, 'finale-3-strait-b'], [56, 'finale-4-shore'], [72, 'finale-4-dawn']] : [];
  for (const [sec, name] of timeline) {
    const left = sec * 1000 - (Date.now() - t0);
    if (left > 0) await page.waitForTimeout(left);
    await shot(page, name);
  }
  await page.waitForSelector('.credits', { timeout: 120000 });
  const tCredits = (Date.now() - t0) / 1000;
  const mid = await run(() => ({
    mode: window.__game.state.mode, replied: window.__game.state.flag('story.finale.reply'), lamp: window.__lh.tower.lamp,
    events: window.T.events.filter((e) => e.type !== 'mode:change').map((e) => e.type), messages: window.__game.state.playerMessages.map((m) => m.text),
    envStage: window.__game.env.stage,
  }));
  check('finale plays to the credits', mid.mode === 'ending' && mid.replied && mid.lamp === 1 && mid.events.includes('finale:reply') && mid.events.includes('stage:change') && mid.envStage === 6, `${tCredits.toFixed(1)} s — ${JSON.stringify(mid)}`);
  check('finale lasts 70-95 s before the credits', tCredits >= 70 && tCredits <= 95, `${tCredits.toFixed(1)} s`);
  await page.waitForTimeout(12000);
  await shot(page, 'credits');
  await page.waitForSelector('.credits-end button', { timeout: 120000 });
  const creditText = await page.evaluate(() => document.querySelector('.credits')?.textContent || '');
  await page.click('.credits-end button:has-text("Continuer")');
  await page.waitForTimeout(3500);
  const end = await run(() => {
    const g = window.__game;
    const lh = window.__lh;
    const saved = JSON.parse(localStorage.getItem('dhsi.save.v1') || '{}');
    return {
      finaleDone: g.state.finaleDone, stage: g.state.stage, mode: g.state.mode, lamp: lh.tower.lamp, tiret: g.companion.mode,
      messages: g.state.playerMessages.map((m) => m.text), savedDone: saved.finaleDone, done: window.T.events.some((e) => e.type === 'finale:done'),
      pos: g.player.position.toArray().map((v) => +v.toFixed(1)),
    };
  });
  await shot(page, 'after-finale-dawn');
  check('end state after "Continuer à explorer"', end.finaleDone && end.stage === 6 && end.mode === 'playing' && end.lamp === 1 && end.tiret === 'follow' && end.messages.includes(message) && end.savedDone && end.done, JSON.stringify(end));
  check('credits never showed the reply before (no stray text)', !creditText.includes('undefined'), '');
  await page.goto(`${BASE}?mute=1`, { waitUntil: 'load' });
  await waitFor(page, 'window.__game?.ready && window.__lh', 120000);
  await page.waitForTimeout(1500);
  const reloaded = await run(() => ({
    finaleDone: window.__game.state.finaleDone, stage: window.__game.state.stage, lamp: window.__lh.tower.lamp, door: window.__lh.cottage.doorOpen, env: window.__game.env.stage,
  }));
  check('reload after the finale rebuilds the final state', reloaded.finaleDone && reloaded.stage === 6 && reloaded.lamp === 1 && reloaded.door && reloaded.env === 6, JSON.stringify(reloaded));
  check('completability run without console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  await page.close();
}

{
  const save = JSON.stringify({
    beacons: { feed: 'active', farm: 'active', hallu: 'active', oldweb: 'active', forest: 'active' }, traces: [], visitedLinks: ['lighthouse'],
    flags: { 'story.finale.reply': true, 'story.finale.read': true, 'zone.lighthouse.replied': 'empty', 'zone.lighthouse.door': true },
    checkpoint: { x: -1139.5, y: 14.4, z: 178.5, yaw: -1.5 }, finaleDone: false,
  });
  const { page, log, run } = await open(context, 'mute=1', { init: `localStorage.setItem('dhsi.save.v1', ${JSON.stringify(save)}); localStorage.removeItem('dhsi.messages.v1');` });
  await page.waitForSelector('.credits', { timeout: 20000 });
  const mid = await run(() => ({ mode: window.__game.state.mode, lamp: window.__lh.tower.lamp }));
  await page.waitForTimeout(500);
  await page.keyboard.down('Space');
  await page.waitForTimeout(1900);
  await page.keyboard.up('Space');
  await page.waitForSelector('.credits-end button', { timeout: 10000 });
  await page.click('.credits-end button:has-text("Continuer")');
  await page.waitForTimeout(2500);
  const end = await run(() => ({ finaleDone: window.__game.state.finaleDone, mode: window.__game.state.mode, stage: window.__game.state.stage, env: window.__game.env.stage }));
  check('reload mid-finale (empty reply) resumes at the credits', mid.mode === 'ending' && mid.lamp === 1 && end.finaleDone && end.mode === 'playing' && end.stage === 6 && end.env === 6, JSON.stringify({ mid, end }));
  check('resume run without console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  await page.close();
}

{
  const { page, log, run } = await open(context, 'nosave=1&mute=1');
  await run(() => {
    window.__solve = window.__lh.debugSolve('test');
    return true;
  });
  await page.waitForSelector('.credits', { timeout: 60000 });
  await page.keyboard.down('Space');
  await page.waitForTimeout(1900);
  await page.keyboard.up('Space');
  await page.waitForSelector('.credits-end button', { timeout: 10000 });
  await page.click('.credits-end button:has-text("Continuer")');
  const r = await run(async () => ({ result: await window.__solve, finaleDone: window.__game.state.finaleDone, stage: window.__game.state.stage, msg: window.__game.state.playerMessages.at(-1)?.text }));
  check('debugSolve() runs the finale on a fresh boot', r.result === 'continue' && r.finaleDone && r.stage === 6 && r.msg === 'test', JSON.stringify(r));
  check('debugSolve run without console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  await page.close();
}

{
  const { page, log, run } = await open(context, 'stage=5&nosave=1&mute=1');
  const r = await run(async () => {
    const g = window.__game;
    const lh = window.__lh;
    lh.cottage.setDoor(true, true);
    const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'KeyF', 'Mouse0'];
    let bad = 0;
    let below = 0;
    let rand = 12345;
    const rnd = () => {
      rand = (rand * 16807) % 2147483647;
      return rand / 2147483647;
    };
    const start = lh.cottage.tw([0, 0, 0]);
    g.player.teleport(start.x, start.y, start.z, 0);
    for (let i = 0; i < 600; i++) {
      for (const c of codes) g.input.simulate(c, rnd() < 0.3);
      g.player.yaw += (rnd() - 0.5) * 0.8;
      g.debug.advance(0.1);
      const p = g.player.position;
      if (![p.x, p.y, p.z].every(Number.isFinite)) bad++;
      if (p.y < g.world.heightAt(p.x, p.z) - 0.5) below++;
      if (Math.hypot(p.x + 1140, p.z - 170) > 90) g.player.teleport(start.x, start.y, start.z, 0);
      if (i % 50 === 0) await new Promise((res) => setTimeout(res, 0));
    }
    for (const c of codes) g.input.simulate(c, false);
    return { bad, below, mode: g.state.mode };
  });
  check('60 s of random input: no NaN, never below terrain', r.bad === 0 && r.below === 0, JSON.stringify(r));
  check('random input without console errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
