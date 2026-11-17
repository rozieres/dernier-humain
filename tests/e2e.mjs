import { mkdirSync } from 'node:fs';
import { launch } from '../tools/browser.mjs';
import { startTarget, killAll } from './e2e/server.mjs';
import { HMR_STUB, PAGE_HELPERS } from './e2e/page.mjs';
import { decodePng, pixelStats } from './e2e/png.mjs';

const SHOTS = new URL('./output/e2e/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const REALTIME = process.env.E2E_REALTIME === '1';
const FF = REALTIME ? 0 : 1;
const ZONES = ['feed', 'farm', 'hallu', 'oldweb', 'forest'];
const SENTENCE = 'Bonjour Maryvonne. Il y a encore quelqu\'un.';
const NOISE = /GL Driver Message|GPU stall|ReadPixels|software WebGL|swiftshader|GroupMarkerNotSet/i;
const T0 = Date.now();
const failures = [];
const health = [];
const log = { errors: [], warnings: [] };
let heapStart = null;

const secs = () => ((Date.now() - T0) / 1000).toFixed(0).padStart(3);
function report(ok, name, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} [${secs()}s] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}
async function step(name, fn) {
  try {
    const detail = await fn();
    report(true, name, typeof detail === 'string' ? detail : '');
    return true;
  } catch (err) {
    report(false, name, String(err.message || err).split('\n')[0].slice(0, 600));
    return false;
  }
}
function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

let page;
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = (name) => page.screenshot({ path: `${SHOTS}${name}.png` });
const sleep = (ms) => page.waitForTimeout(ms);

async function until(fn, arg, { timeout = 30000, msg, ff = 0, poll = 100 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const r = await page.evaluate(fn, arg);
    if (r) return r;
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${msg}`);
    if (ff && FF) await page.evaluate((s) => window.__game.debug.advance(s), ff);
    await sleep(poll);
  }
}

async function ff(seconds) {
  if (!FF) {
    await sleep(seconds * 1000);
    return;
  }
  for (let left = seconds; left > 0; left -= 0.5) {
    await page.evaluate((s) => window.__game.debug.advance(s), Math.min(0.5, left));
    await sleep(15);
  }
}

async function sampleHealth(label) {
  await ev(() => window.__T.frames(3));
  const s = await ev(() => ({ ...window.__game.debug.stats(), mem: performance.memory ? performance.memory.usedJSHeapSize : null }));
  health.push({ label, ...s });
  const bad = s.calls > 400 || s.triangles > 3_000_000;
  report(!bad, `health ${label}`, `${s.fps} fps, ${s.calls} draws, ${(s.triangles / 1000).toFixed(0)}k tris`);
  return s;
}

async function pressE(expectId, respot = null) {
  let cur = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    await ev(() => window.__game.debug.advance(0.15));
    await ev(() => window.__T.frames(2));
    cur = await ev(() => window.__game.interact.current?.id || null);
    if (!expectId || cur === expectId) break;
    if (attempt === 11) {
      const d = await ev(() => {
        const g = window.__game;
        const e = g.player.eye;
        return `mode ${g.state.mode}, locked ${g.player.locked}, eye ${e.x.toFixed(1)},${e.y.toFixed(1)},${e.z.toFixed(1)}, yaw ${g.player.yaw.toFixed(2)}`;
      });
      throw new Error(`interaction target is ${cur}, expected ${expectId} after 12 tries (${d})`);
    }
    if (respot) await standAt(respot);
    console.log(`      (waiting for interaction ${expectId}: currently ${cur})`);
    await ff(1);
  }
  await ev(() => window.__game.debug.press('KeyE', 70));
  return cur;
}

async function closeReader(msg) {
  await page.keyboard.press('KeyE', { delay: 120 });
  await until(() => !document.querySelector('.reader.layer:not(.is-leaving)'), null, { timeout: 5000, msg: `reader to close (${msg})` });
}

async function standAt(spot, { yaw } = {}) {
  await ev(({ spot, yaw }) => {
    const T = window.__T;
    T.place(spot.x, spot.z, yaw ?? 0, spot.hint, spot.exact);
    window.__game.debug.advance(0.3);
    T.aimAt(...spot.target);
  }, { spot, yaw });
}

async function rideLink(id, side) {
  const before = await ev((id) => window.__T.count('link:ride:end', (p) => p.id === id), id);
  const spot = await ev(([id, side]) => window.__T.linkSpot(id, side), [id, side]);
  await standAt(spot);
  await pressE(`link:${id}:${side}`, spot);
  await until(([id, n]) => window.__T.count('link:ride:end', (p) => p.id === id) > n, [id, before], { timeout: 60000, ff: 0.5, msg: `link:ride:end for ${id}` });
  await ev(() => window.__game.debug.advance(0.5));
}

async function boot(query) {
  await page.goto(`${BASE}/${query}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__game?.ready', null, { timeout: 120000, polling: 100 });
  await ev(PAGE_HELPERS);
}

let BASE;
let server;
let browser;
try {
  server = await startTarget();
  BASE = server.base;
  console.log(`e2e: target ${server.mode} at ${BASE}${REALTIME ? ' (real time)' : ''}`);
  const launched = await launch({ width: 1280, height: 720 });
  browser = launched.browser;
  const context = launched.context;
  if (server.mode !== 'preview') await context.route(/\/@vite\/client/, (route) => route.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));
  page = await context.newPage();
  page.on('console', (msg) => {
    const type = msg.type();
    const loc = msg.location();
    const text = `${msg.text()}${loc?.url ? ` @ ${loc.url.replace(BASE, '')}:${loc.lineNumber}` : ''}`;
    if (type === 'error') log.errors.push(text);
    else if (type === 'warning' && !NOISE.test(msg.text())) log.warnings.push(text);
  });
  page.on('pageerror', (err) => log.errors.push(`pageerror: ${err.stack || err}`));
  page.on('requestfailed', (req) => log.errors.push(`request failed: ${req.url()} ${req.failure()?.errorText || ''}`));

  await step('1 boot: title over a rendered world, no save', async () => {
    await boot('?mute=1');
    heapStart = await ev(() => (performance.memory ? performance.memory.usedJSHeapSize : null));
    await until(() => window.__game.state.mode === 'title' && document.querySelector('.title.layer'), null, { timeout: 60000, msg: 'title screen' });
    await until(() => !document.querySelector('.loading.layer') && !document.getElementById('boot-loader'), null, { timeout: 10000, msg: 'loading screen to disappear' });
    await sleep(1500);
    await ev(() => {
      document.getElementById('ui').style.visibility = 'hidden';
    });
    const png = decodePng(await page.screenshot());
    await ev(() => {
      document.getElementById('ui').style.visibility = '';
    });
    const st = pixelStats(png);
    await shot('01-title');
    must(st.max > 40 && st.std > 6 && st.colors > 8, `canvas looks black or flat: ${JSON.stringify(st)}`);
    const cont = await ev(() => Boolean(document.querySelector('[data-id="continue"]')));
    must(!cont, '"Continuer" is shown without a save');
    const heading = await ev(() => document.querySelector('[data-id="new"]')?.textContent || '');
    must(/Commencer/.test(heading), `new-game button text is "${heading}"`);
    return `luma mean ${st.mean.toFixed(0)}, std ${st.std.toFixed(0)}, ${st.colors} colours`;
  });
  await sampleHealth('title');

  await step('2 new game: intro cards, then playing at the hub', async () => {
    await page.click('[data-id="new"]');
    await until(() => window.__game.state.mode === 'intro', null, { timeout: 10000, msg: 'mode intro after "Commencer"' });
    await until(() => (document.querySelector('.intro-typed')?.textContent || '').length > 3, null, { timeout: 20000, msg: 'first intro card to type' });
    await shot('02-intro');
    const t0 = Date.now();
    while ((await ev(() => window.__game.state.mode)) === 'intro') {
      if (Date.now() - t0 > 120000) throw new Error('timeout waiting for the intro to finish');
      await page.keyboard.press('Space');
      await sleep(450);
    }
    await until(() => window.__game.state.mode === 'playing', null, { timeout: 30000, msg: 'mode playing after intro' });
    await sleep(2600);
    const r = await ev(() => {
      const hud = document.querySelector('.hud');
      const start = window.__T.events.find((e) => e.type === 'game:start');
      const p = window.__game.player.position;
      return { hud: hud ? !hud.classList.contains('is-hidden') && getComputedStyle(hud).display !== 'none' : false, newGame: start?.p?.newGame, zone: window.__game.story.zone, p: [p.x, p.y, p.z] };
    });
    await shot('03-hub');
    must(r.newGame === true, `game:start newGame = ${r.newGame}`);
    must(r.hud, 'HUD is not visible');
    must(Math.hypot(r.p[0], r.p[2]) < 40, `player is far from the hub: ${r.p.map((v) => v.toFixed(1))}`);
    return `at ${r.p.map((v) => v.toFixed(1)).join(', ')}, zone ${r.zone}`;
  });
  await sampleHealth('hub');

  await step('3a hub: cookie banner dismissed with a simulated click', async () => {
    const info = await until(() => {
      const c = window.__game.zones.hub.cookie;
      return c && c.state === 'shown' ? { y: window.__game.zones.hub.spawn[1] } : null;
    }, null, { timeout: 20000, msg: 'cookie banner to be shown' });
    await ev((y) => {
      const T = window.__T;
      const g = window.__game;
      T.place(0, 8.5, 0, y);
      g.debug.advance(0.3);
      const b = g.zones.hub.cookie.buttons[1].mesh;
      const wp = b.getWorldPosition(b.position.clone());
      T.aimAt(wp.x, wp.y, wp.z);
    }, info.y);
    await ev(() => window.__game.debug.advance(0.2));
    await ev(() => window.__T.frames(2));
    const target = await ev(() => window.__game.cursor.target?.object === window.__game.zones.hub.cookie?.buttons[1].mesh);
    await shot('04-cookie');
    must(target, 'the cursor does not target the cookie button');
    await ev(() => window.__game.debug.press('Mouse0', 80));
    await until(() => window.__game.state.flag('zone.hub.cookie') === true, null, { timeout: 8000, ff: 0.3, msg: 'flag zone.hub.cookie' });
  });

  await step('3b hub: scan (F) emits scan:start then scan:end', async () => {
    await ev(() => window.__T.events.splice(0));
    await ev(() => window.__game.debug.press('KeyF', 80));
    await until(() => window.__T.count('scan:start') > 0, null, { timeout: 8000, ff: 0.2, msg: 'scan:start' });
    await until(() => window.__T.count('scan:end') > 0, null, { timeout: 20000, ff: 0.5, msg: 'scan:end' });
    const order = await ev(() => window.__T.events.filter((e) => e.type.startsWith('scan:')).map((e) => e.type).join(','));
    must(order.startsWith('scan:start') && order.includes('scan:end'), `event order ${order}`);
  });

  await step('3c hub: walking forward 3 s moves the player and keeps it grounded', async () => {
    await ev(() => {
      const g = window.__game;
      const T = window.__T;
      T.place(0, 12, 0, g.zones.hub.spawn[1]);
      g.debug.advance(0.5);
    });
    const a = await ev(() => window.__game.player.position.toArray());
    await ev(() => window.__game.input.simulate('KeyW', true));
    for (let i = 0; i < 12; i++) {
      await ev(() => window.__game.debug.advance(0.25));
      await sleep(30);
    }
    const b = await ev(() => {
      const g = window.__game;
      const p = g.player.position;
      return { p: p.toArray(), grounded: g.player.grounded, gy: window.__T.groundY(p.x, p.z, p.y) };
    });
    await ev(() => window.__game.input.simulate('KeyW', false));
    const d = Math.hypot(b.p[0] - a[0], b.p[2] - a[2]);
    must(d > 3, `moved only ${d.toFixed(2)} m in 3 s`);
    must(b.grounded, 'player is not grounded after walking');
    must(Math.abs(b.p[1] - b.gy) < 0.6, `player y ${b.p[1].toFixed(2)} vs ground ${b.gy.toFixed(2)}`);
    return `${d.toFixed(1)} m, y ${b.p[1].toFixed(2)}`;
  });

  await step('3d hub: tutorial trace hub_welcome read in the reader', async () => {
    await ev(() => window.__T.events.splice(0));
    const spot = await ev(() => {
      const g = window.__game;
      const t = g.traces.get('hub_welcome');
      const p = t.position;
      const l = Math.hypot(p.x, p.z) || 1;
      return { x: p.x - (p.x / l) * 1.6, z: p.z - (p.z / l) * 1.6, hint: g.zones.hub.spawn[1], target: [p.x, p.y, p.z] };
    });
    await standAt(spot);
    await pressE('trace:hub_welcome');
    await until(() => document.querySelector('.reader.layer') && window.__game.state.mode === 'reading', null, { timeout: 8000, msg: 'reader to open on the trace' });
    const doc = await ev(() => {
      const d = window.__game.texts.TRACES.hub_welcome;
      const n = window.__T.norm;
      return { text: document.querySelector('.reader')?.textContent || '', first: n(d.body[0]).slice(0, 24), norm: n(document.querySelector('.reader')?.textContent) };
    });
    must(doc.norm.includes(doc.first), 'reader does not show the hub_welcome document');
    await shot('05-trace-reader');
    await closeReader('trace');
    await until(() => window.__game.state.mode === 'playing', null, { timeout: 5000, msg: 'mode playing after the trace' });
    await until(() => window.__T.count('trace:found') > 0, null, { timeout: 5000, ff: 0.2, msg: 'trace:found' });
    const n = await ev(() => window.__game.state.traces.size);
    must(n === 1, `state.traces has ${n} entries`);
  });
  await sampleHealth('hub after tutorial');

  const stageNow = () => ev(() => window.__game.state.stage);
  let stage = 0;
  for (const id of ZONES) {
    const label = `4.${ZONES.indexOf(id) + 1} ${id}`;
    await ev(() => window.__T.events.splice(0));
    let inZone = await step(`${label}: ride the link from the hub`, async () => {
      await rideLink(id, 'a');
      const r = await ev((id) => {
        const g = window.__game;
        const p = g.player.position;
        return { zone: g.world.zoneAt(p.x, p.z), visited: g.state.visitedLinks.has(id), pos: p.toArray().map((v) => +v.toFixed(0)), mode: g.state.mode };
      }, id);
      must(r.zone === id, `after the ride the player is in "${r.zone}" at ${r.pos}`);
      must(r.visited, `state.visitedLinks lacks ${id}`);
      await until((id) => window.__T.count('zone:enter', (p) => p.id === id) > 0, id, { timeout: 15000, ff: 0.5, msg: `zone:enter for ${id}` });
      return `landed at ${r.pos}`;
    });
    if (!inZone) {
      await ev((id) => {
        window.__game.debug.teleport(id);
        window.__game.debug.advance(2);
      }, id);
    }
    await ff(1);
    await shot(`10-${id}-arrival`);
    await sampleHealth(`${id} arrival`);

    await step(`${label}: solve the puzzle (debug.solve) and the beacon turns ready`, async () => {
      await ev((id) => {
        window.__game.debug.solve(id);
      }, id);
      await until((id) => window.__game.state.beacons[id] === 'ready', id, { timeout: 60000, ff: 0.5, msg: `beacon ${id} to become ready` });
      await ff(1);
    });

    await step(`${label}: light the beacon and read its document`, async () => {
      const spot = await ev((id) => window.__T.beaconSpot(id), id);
      await standAt(spot);
      await shot(`11-${id}-beacon-ready`);
      await ev(() => window.__T.events.splice(0));
      await pressE(`beacon:${id}`, spot);
      try {
        await until((id) => window.__T.count('beacon:activated', (p) => p.zone === id) > 0, id, { timeout: 60000, ff: 0.5, msg: `beacon:activated in ${id}` });
      } catch (err) {
        await ev((id) => {
          const g = window.__game;
          g.state.setBeacon(id, 'active');
          g.events.emit('beacon:activated', { zone: id, count: g.state.stage + 1 });
        }, id);
        throw err;
      }
      await until(() => window.__game.state.mode === 'reading' && document.querySelector('.reader.layer'), null, { timeout: 60000, ff: 0.5, msg: `beacon document reader in ${id}` });
      const doc = await ev((id) => {
        const d = window.__game.texts.BEACON_DOCS[id];
        const n = window.__T.norm;
        return { first: n(d.body?.[0] || d.title || d.site).slice(0, 24), norm: n(document.querySelector('.reader')?.textContent) };
      }, id);
      must(doc.norm.includes(doc.first), `reader does not show the ${id} beacon document`);
      await shot(`12-${id}-beacon-reader`);
      await closeReader(`beacon ${id}`);
      await until(() => window.__game.state.mode === 'playing', null, { timeout: 8000, msg: `mode playing after the ${id} beacon` });
      const s = await stageNow();
      must(s === stage + 1, `state.stage is ${s}, expected ${stage + 1}`);
      must(await ev((n) => window.__T.count('stage:change', (p) => p.stage === n) > 0, stage + 1), 'no stage:change event');
      stage = s;
      return `stage ${s}`;
    });
    await ff(1.5);
    await shot(`13-${id}-beacon-lit`);
    await sampleHealth(`${id} beacon lit`);

    if (id === 'forest') {
      await step('5 the ring closes: cinematic plays and ends, lighthouse link restored', async () => {
        await until(() => window.__game.story.cinematic || window.__T.count('link:restored') > 0, null, { timeout: 90000, ff: 1, msg: 'the ring cinematic to start' });
        await shot('20-ring');
        await until(() => !window.__game.story.cinematic && window.__game.state.mode === 'playing', null, { timeout: 90000, ff: 1, msg: 'the ring cinematic to end' });
        await until(() => window.__T.count('link:restored', (p) => p.id === 'lighthouse') > 0, null, { timeout: 30000, ff: 1, msg: 'link:restored for lighthouse' });
        must(await ev(() => window.__game.links.get('lighthouse').enabled), 'lighthouse link not enabled');
      });
      await sampleHealth('after the ring');
    }

    await step(`${label}: back to the hub by the link`, async () => {
      await rideLink(id, 'b');
      const r = await ev(() => {
        const p = window.__game.player.position;
        return { zone: window.__game.world.zoneAt(p.x, p.z), d: Math.hypot(p.x, p.z) };
      });
      must(r.d < 70, `arrived ${r.d.toFixed(0)} m from the hub centre (zone ${r.zone})`);
    }).then(async (ok) => {
      if (!ok) {
        await ev(() => {
          window.__game.debug.teleport('hub');
          window.__game.debug.advance(1);
        });
      }
    });
  }

  await step('6a lighthouse: ride the link from the hub', async () => {
    await rideLink('lighthouse', 'a');
    const r = await ev(() => {
      const g = window.__game;
      const p = g.player.position;
      return { zone: g.world.zoneAt(p.x, p.z), pos: p.toArray().map((v) => +v.toFixed(0)), arrive: g.state.flag('story.finale.link') };
    });
    must(r.zone === 'lighthouse', `landed in "${r.zone}" at ${r.pos}`);
    await ff(2);
    await shot('30-lighthouse-landing');
    return `landed at ${r.pos}`;
  }).then(async (ok) => {
    if (!ok) {
      await ev(() => {
        window.__game.debug.teleport('lighthouse');
        window.__game.debug.advance(1);
      });
    }
  });
  await sampleHealth('lighthouse landing');

  await step('6b lighthouse: open the cottage door, read the CRT, reply', async () => {
    const door = await ev(() => {
      const c = window.__game.zones.lighthouse.cottage;
      const out = c.tw([-1.6, 0, 4.4]);
      const t = c.doorWorld;
      return { x: out.x, z: out.z, hint: c.group.position.y, target: [t.x, t.y, t.z] };
    });
    await standAt(door);
    await shot('31-cottage-door');
    await pressE('lighthouse:door');
    await until(() => window.__game.zones.lighthouse.cottage.doorOpen, null, { timeout: 8000, ff: 0.3, msg: 'the cottage door to open' });
    await ff(2.5);
    const crt = await ev(() => {
      const c = window.__game.zones.lighthouse.cottage;
      const p = c.tw([0.6, 0, 1.0]);
      const t = c.crtWorld;
      return { x: p.x, z: p.z, hint: c.group.position.y, exact: true, target: [t.x, t.y, t.z] };
    });
    await standAt(crt);
    await pressE('lighthouse:crt');
    await until(() => document.querySelector('.reader.layer') && window.__game.state.mode === 'reading', null, { timeout: 10000, msg: 'the reader on the CRT final message' });
    const doc = await ev(() => {
      const n = window.__T.norm;
      const d = window.__game.texts.LIGHTHOUSE.final;
      return { first: n(d.body[0]).slice(0, 24), norm: n(document.querySelector('.reader')?.textContent) };
    });
    must(doc.norm.includes(doc.first), 'the reader does not show the final message');
    await shot('32-final-message');
    await page.click('.reader button.btn--action:has-text("Répondre")', { timeout: 5000 });
    await until(() => document.querySelector('.reply-area') && !document.querySelector('.reply.layer.is-sent'), null, { timeout: 8000, msg: 'the reply box' });
    await sleep(700);
    await page.click('.reply-area');
    await page.keyboard.type(SENTENCE, { delay: 12 });
    const typed = await ev(() => document.querySelector('.reply-area').value);
    must(typed === SENTENCE, `textarea contains "${typed}"`);
    await shot('33-reply');
    await page.click('.btn--send', { timeout: 5000 });
    await until(() => window.__T.count('finale:reply') > 0, null, { timeout: 8000, msg: 'finale:reply' });
  });

  await step('7 finale: sequence plays, credits show the sentence', async () => {
    await until(() => window.__game.state.mode === 'cinematic' || document.querySelector('.credits'), null, { timeout: 20000, ff: 1, msg: 'the finale cinematic to start' });
    await shot('40-finale-start');
    await until(() => document.querySelector('.credits.layer'), null, { timeout: 170000, ff: FF ? 1 : 0, poll: 150, msg: 'the credits to appear' });
    await shot('41-credits');
    const text = await until(() => {
      const el = document.querySelector('.credit--player');
      return el && el.classList.contains('is-in') ? el.textContent : null;
    }, null, { timeout: 120000, poll: 200, msg: 'the player sentence in the credits' });
    await shot('42-credits-player');
    must(text.includes('Bonjour Maryvonne'), `credits show "${text}"`);
    await until(() => [...document.querySelectorAll('.credits button')].some((b) => /Continuer/.test(b.textContent)), null, { timeout: 120000, poll: 300, msg: 'the credits end buttons' });
    await shot('43-credits-end');
    await page.click('.credits button:has-text("Continuer à explorer")');
    await until(() => window.__game.state.finaleDone === true && window.__game.state.mode === 'playing', null, { timeout: 20000, ff: 0.3, msg: 'finaleDone and mode playing' });
    const r = await ev(() => {
      const g = window.__game;
      const p = g.player.position;
      const L = g.world.zones.lighthouse;
      return { msgs: g.state.playerMessages.map((m) => m.text), stage: g.state.stage, zone: g.world.zoneAt(p.x, p.z), d: Math.hypot(p.x - L.center[0], p.z - L.center[1]), radius: L.radius, done: window.__T.count('finale:done') };
    });
    must(r.msgs.includes(SENTENCE), `playerMessages: ${JSON.stringify(r.msgs)}`);
    must(r.stage === 6, `stage is ${r.stage}`);
    must(r.d < r.radius, `player is ${r.d.toFixed(0)} m from the island centre (zone ${r.zone})`);
    must(r.done > 0, 'no finale:done event');
    await sleep(1500);
    await shot('44-after-finale');
    return `player ${r.d.toFixed(0)} m from the island centre`;
  });
  await sampleHealth('after finale');

  await step('8a persistence: reload offers "Continuer" and restores the game', async () => {
    await sleep(500);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction('window.__game?.ready', null, { timeout: 120000, polling: 100 });
    await ev(PAGE_HELPERS);
    await until(() => window.__game.state.mode === 'title' && document.querySelector('.title.layer'), null, { timeout: 60000, msg: 'title after reload' });
    must(await ev(() => Boolean(document.querySelector('[data-id="continue"]'))), '"Continuer" is missing after reload');
    await shot('50-title-continue');
    await page.click('[data-id="continue"]');
    await until(() => window.__game.state.mode === 'playing', null, { timeout: 40000, msg: 'mode playing after Continuer' });
    await sleep(2500);
    const r = await ev(() => {
      const g = window.__game;
      return { b: g.state.beacons, done: g.state.finaleDone, traces: [...g.state.traces], stage: g.state.stage };
    });
    must(Object.values(r.b).length === 5 && Object.values(r.b).every((s) => s === 'active'), `beacons ${JSON.stringify(r.b)}`);
    must(r.done === true, 'finaleDone is false after reload');
    must(r.traces.includes('hub_welcome'), `traces ${JSON.stringify(r.traces)}`);
    must(r.stage === 6, `stage ${r.stage}`);
    return `stage ${r.stage}, traces ${r.traces.length}`;
  });

  await step('8b persistence: the cork board holds the message', async () => {
    const saved = await ev(() => localStorage.getItem('dhsi.messages.v1') || '');
    must(saved.includes('Maryvonne'), 'the message is not in localStorage dhsi.messages.v1');
    const spot = await ev(() => {
      const c = window.__game.zones.lighthouse.cottage;
      const p = c.tw([-0.6, 0, -0.5]);
      const t = c.boardWorld;
      return { x: p.x, z: p.z, hint: c.group.position.y, exact: true, target: [t.x, t.y, t.z] };
    });
    await standAt(spot);
    await pressE('lighthouse:board');
    await until(() => document.querySelector('.reader.layer') && window.__game.state.mode === 'reading', null, { timeout: 8000, msg: 'the cork board reader' });
    const text = await ev(() => document.querySelector('.reader')?.textContent || '');
    await shot('51-cork-board');
    must(text.includes('Bonjour Maryvonne'), 'the board reader does not list the player message');
    await closeReader('board');
  });
  await sampleHealth('after reload');
} catch (err) {
  report(false, 'harness', String(err.stack || err).slice(0, 1500));
} finally {
  let heapEnd = null;
  try {
    heapEnd = await page?.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : null));
  } catch {}
  const uniq = (list) => [...new Set(list)];
  if (log.errors.length) report(false, 'console/page errors', `${log.errors.length}`);
  for (const e of uniq(log.errors).slice(0, 12)) console.log(`      error: ${e.slice(0, 500)}`);
  if (log.warnings.length) report(false, 'console warnings from the game', `${log.warnings.length}`);
  for (const w of uniq(log.warnings).slice(0, 12)) console.log(`      warning: ${w.slice(0, 500)}`);
  if (!log.errors.length && !log.warnings.length) report(true, 'no console error, page error or game warning');
  if (health.length) {
    const max = (k) => Math.max(...health.map((h) => h[k]));
    const min = Math.min(...health.map((h) => h.fps));
    console.log(`health summary: fps min ${min}, draws max ${max('calls')}, triangles max ${(max('triangles') / 1000).toFixed(0)}k`);
  }
  const mb = (v) => (v == null ? 'n/a' : `${(v / 1048576).toFixed(0)} MB`);
  console.log(`JS heap: start ${mb(heapStart)}, end ${mb(heapEnd)}`);
  try {
    await browser?.close();
  } catch {}
  killAll();
  console.log(`${failures.length ? 'FAILED' : 'PASSED'} — ${failures.length} failure(s) in ${((Date.now() - T0) / 1000).toFixed(0)} s; screenshots in tests/output/e2e/`);
  process.exit(failures.length ? 1 : 0);
}
