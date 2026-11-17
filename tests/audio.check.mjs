import { launch, openPage, waitFor } from '../tools/browser.mjs';

const URL = process.env.AUDIO_URL || 'http://127.0.0.1:5202/dev/audio.html';
const only = process.argv.slice(2);
const want = (phase) => only.length === 0 || only.includes(phase);
const failures = [];
const fail = (msg) => failures.push(msg);
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-inf');
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

const { browser, context } = await launch({ width: 1400, height: 900 });
const VITE_CLIENT_STUB = `
const styles = new Map();
export function createHotContext() {
  return { data: {}, accept() {}, dispose() {}, prune() {}, invalidate() {}, decline() {}, on() {}, off() {}, send() {} };
}
export function updateStyle(id, css) {
  let el = styles.get(id);
  if (!el) { el = document.createElement('style'); el.dataset.viteDevId = id; document.head.appendChild(el); styles.set(id, el); }
  el.textContent = css;
}
export function removeStyle(id) { styles.get(id)?.remove(); styles.delete(id); }
export function injectQuery(url) { return url; }
export class ErrorOverlay {}
`;
await context.route('**/@vite/client', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB }));
const { page, log } = await openPage(context, URL, { quiet: true });
await waitFor(page, 'window.__audioDev?.ready');
await page.click('#unlock');
await waitFor(page, 'window.__audioDev.audio.running');
await page.evaluate(() => window.__audioDev.meter.install());

const ev = (fn, arg) => page.evaluate(fn, arg);
const sleep = (ms) => page.waitForTimeout(ms);
const nodes = () => ev(() => window.__audioDev.audio.debug.nodes());
const setSetting = (key, value) => ev(([k, v]) => window.__audioDev.state.setSetting(k, v), [key, value]);
const reset = () => ev(() => window.__audioDev.meter.reset());
const read = () => ev(() => window.__audioDev.meter.read());
async function measure(ms) {
  await reset();
  await sleep(ms);
  return read();
}
async function waitNodes(cat, target, timeout) {
  const t0 = Date.now();
  let n = await nodes();
  while (n[cat] > target && Date.now() - t0 < timeout) {
    await sleep(100);
    n = await nodes();
  }
  return { n, ms: Date.now() - t0 };
}
const names = await ev(() => window.__audioDev.audio.debug.names);

const CONTRACT_SFX = `ui.click ui.hover ui.open ui.close ui.type step.grass step.stone step.sand step.dirt step.wood step.metal jump land land.hard glide.open glide.close scan scan.human scan.synth scan.hallu grab drop throw impact.soft impact.hard interact read page trace.found beacon.ready beacon.activate stage.shift link.attach link.arrive link.restore popup.open popup.close popup.dodge drone.hit drone.down seed.pick seed.plant harvester.hit hallu.reveal hallu.fall pedestal.ok pedestal.wrong modem guestbook.open knock knock.reply note.slide indexed alarm cabin.off door crt.on lamp.ignite reply.send respawn splash companion.blip`.split(' ');
const CONTRACT_LOOPS = 'wind sea fire crt server drone crawler harvester fan feed.chatter cabin.murmur radio.theme midi'.split(' ');
for (const n of CONTRACT_SFX) if (!names.sfx.includes(n)) fail(`missing sfx ${n}`);
for (const n of CONTRACT_LOOPS) if (!names.loops.includes(n)) fail(`missing loop ${n}`);

const RMS_FLOOR = 0.003;
const PEAK_MAX = 0.98;

if (want('sfx')) {
  await setSetting('music', 0);
  await sleep(4500);
  console.log('\nSFX                 maxRMS dB   peak dB  clicks  freed  ms');
  const base = (await nodes()).sfx;
  for (const name of names.sfx) {
    await reset();
    await ev((n) => window.__audioDev.audio.sfx(n), name);
    await sleep(60);
    const { n, ms } = await waitNodes('sfx', base, 9000);
    await sleep(120);
    const m = await read();
    const freed = n.sfx === base;
    console.log(`${pad(name, 18)} ${lpad(f1(db(m.maxWin)), 9)} ${lpad(f1(db(m.peak)), 9)} ${lpad(m.clicks, 7)} ${lpad(freed ? 'yes' : 'NO', 6)} ${lpad(ms, 5)}`);
    if (m.maxWin < RMS_FLOOR) fail(`sfx ${name}: too quiet (${f1(db(m.maxWin))} dB)`);
    if (m.peak >= PEAK_MAX) fail(`sfx ${name}: clips (peak ${m.peak.toFixed(3)})`);
    if (m.clicks > 0) fail(`sfx ${name}: ${m.clicks} click(s)`);
    if (!freed) fail(`sfx ${name}: ${n.sfx - base} node(s) not freed`);
  }
  await reset();
  await ev(() => window.__audioDev.audio.sfx('knock', { position: [6, 1.7, 0] }));
  await sleep(500);
  const pos = await read();
  if (pos.maxWin < RMS_FLOOR) fail('positional sfx silent');
  await reset();
  await ev(() => window.__audioDev.audio.voice("Bonjour ! Je suis Tiret — votre assistant de navigation. Comment puis-je optimiser votre expérience aujourd'hui ? Il est important de noter que je n'en ai jamais lu."));
  await sleep(60);
  const v = await waitNodes('sfx', base, 6000);
  const vm = await read();
  console.log(`${pad('voice (long text)', 18)} ${lpad(f1(db(vm.maxWin)), 9)} ${lpad(f1(db(vm.peak)), 9)} ${lpad(vm.clicks, 7)} ${lpad(v.n.sfx === base ? 'yes' : 'NO', 6)} ${lpad(v.ms, 5)}`);
  if (v.ms > 2900) fail(`voice too long (${v.ms} ms)`);
  if (vm.maxWin < RMS_FLOOR || vm.clicks > 0 || v.n.sfx !== base) fail('voice check failed');
}

if (want('loops')) {
  await setSetting('music', 0);
  console.log('\nLOOP                RMS dB  maxRMS dB   peak dB  clicks  centroid  freed');
  const base = (await nodes()).loop;
  for (const name of names.loops) {
    await ev((n) => (window.__h = window.__audioDev.audio.loop(n)), name);
    await sleep(1700);
    const m = await measure(3000);
    await ev(() => window.__h.stop(0.4));
    const { n } = await waitNodes('loop', base, 4000);
    const freed = n.loop === base;
    console.log(`${pad(name, 18)} ${lpad(f1(db(m.rms)), 8)} ${lpad(f1(db(m.maxWin)), 9)} ${lpad(f1(db(m.peak)), 9)} ${lpad(m.clicks, 7)} ${lpad(Math.round(m.centroid), 9)} ${lpad(freed ? 'yes' : 'NO', 6)}`);
    if (m.maxWin < RMS_FLOOR) fail(`loop ${name}: too quiet`);
    if (m.peak >= PEAK_MAX) fail(`loop ${name}: clips`);
    if (m.clicks > 0) fail(`loop ${name}: ${m.clicks} click(s)`);
    if (!freed) fail(`loop ${name}: ${n.loop - base} node(s) not freed`);
  }
  await ev(() => (window.__h = window.__audioDev.audio.loop('fire', { position: [5, 1.7, 0], refDistance: 3, maxDistance: 40 })));
  await sleep(1700);
  const near = await measure(1500);
  await ev(() => window.__h.setPosition([0, 1.7, 400]));
  await sleep(600);
  const far = await measure(1500);
  await ev(() => window.__h.stop(0.2));
  await waitNodes('loop', base, 3000);
  console.log(`positional fire: near ${f1(db(near.rms))} dB, beyond maxDistance ${f1(db(far.rms))} dB`);
  if (!(near.rms > far.rms * 10)) fail('positional loop not attenuated with distance');
}

const zoneRows = [];
if (want('zones')) {
  await setSetting('music', 0.8);
  await setSetting('sfx', 0);
  const plan = [
    ['null', null, null],
    ['feed', 'feed', null],
    ['feed@depth1', 'feed', ['depth', 1]],
    ['farm', 'farm', ['depth', 0]],
    ['hallu', 'hallu', null],
    ['oldweb', 'oldweb', null],
    ['forest', 'forest', null],
    ['forest@danger1', 'forest', ['danger', 1]],
    ['lighthouse', 'lighthouse', ['danger', 0]],
    ['hub', 'hub', null],
  ];
  await ev(() => window.__audioDev.audio.music.setZone(null));
  await sleep(4500);
  for (const [label, zone, param] of plan) {
    await reset();
    if (param) await ev(([k, v]) => window.__audioDev.audio.setParam(k, v), param);
    await ev((z) => window.__audioDev.audio.music.setZone(z), zone);
    await sleep(4500);
    const xf = await read();
    const m = await measure(8000);
    zoneRows.push({ label, ...m, xfClicks: xf.clicks, xfPeak: xf.peak });
  }
}

const stageRows = [];
if (want('stages')) {
  await setSetting('music', 0.8);
  await setSetting('sfx', 0);
  await ev(() => window.__audioDev.audio.music.setZone(null));
  for (let s = 0; s <= 6; s++) {
    await reset();
    await ev((n) => window.__audioDev.events.emit('stage:change', { stage: n, from: n - 1 }), s);
    await sleep(3000);
    const xf = await read();
    const m = await measure(9000);
    const arr = await ev(() => window.__audioDev.audio.debug.music.performer.name);
    stageRows.push({ label: `stage ${s} ${arr ?? '-'}`, ...m, xfClicks: xf.clicks, xfPeak: xf.peak });
  }
  await ev(() => window.__audioDev.events.emit('stage:change', { stage: 0, from: 6 }));
}

const cueRows = [];
if (want('cues')) {
  await setSetting('music', 0.8);
  for (const cue of ['title', 'beacon', 'finale', 'credits']) {
    await reset();
    await ev((c) => window.__audioDev.audio.music.play(c), cue);
    await sleep(cue === 'beacon' ? 8000 : 12000);
    const m = await read();
    cueRows.push({ label: `cue ${cue}`, ...m, xfClicks: 0, xfPeak: 0 });
  }
  await ev(() => window.__audioDev.audio.music.setZone(null));
  await sleep(4500);
}

function table(title, rows) {
  if (!rows.length) return;
  console.log(`\n${title.padEnd(16)} RMS dB  K-RMS dB   peak dB  centroid Hz  clicks  xfade clicks`);
  for (const r of rows) {
    console.log(`${pad(r.label, 16)} ${lpad(f1(db(r.rms)), 6)} ${lpad(f1(db(r.wrms)), 9)} ${lpad(f1(db(r.peak)), 9)} ${lpad(Math.round(r.centroid), 12)} ${lpad(r.clicks, 7)} ${lpad(r.xfClicks, 13)}`);
    if (r.peak >= PEAK_MAX || r.xfPeak >= PEAK_MAX) fail(`${r.label}: clips`);
    if (r.clicks > 0 || r.xfClicks > 0) fail(`${r.label}: clicks`);
    if (r.rms < 0.002) fail(`${r.label}: silent`);
  }
}
table('ZONE', zoneRows);
table('STAGE', stageRows);
table('CUE', cueRows);

const balanced = zoneRows.filter((r) => r.label !== 'feed@depth1');
if (balanced.length) {
  const levels = balanced.map((r) => db(r.wrms)).sort((a, b) => a - b);
  const median = levels[(levels.length / 2) | 0];
  for (const r of balanced) {
    const d = db(r.wrms) - median;
    if (Math.abs(d) > 6) fail(`zone ${r.label}: ${d > 0 ? '+' : ''}${f1(d)} dB from median`);
    if (r.centroid > 3500) fail(`zone ${r.label}: harsh (centroid ${Math.round(r.centroid)} Hz)`);
    if (r.centroid < 150) fail(`zone ${r.label}: muddy (centroid ${Math.round(r.centroid)} Hz)`);
  }
  console.log(`\nzone K-weighted spread: ${f1(levels[levels.length - 1] - levels[0])} dB (median ${f1(median)} dB)`);
}

if (want('soak')) {
  await setSetting('music', 0.8);
  await setSetting('sfx', 0.85);
  const before = await nodes();
  const res = await ev(async () => {
    const d = window.__audioDev;
    const a = d.audio;
    const sfx = a.debug.names.sfx;
    const zones = [null, 'feed', 'farm', 'hallu', 'oldweb', 'forest', 'lighthouse'];
    const handles = [];
    const t0 = performance.now();
    let i = 0;
    while (performance.now() - t0 < 12000) {
      a.sfx(sfx[(Math.random() * sfx.length) | 0], Math.random() < 0.3 ? { position: [Math.random() * 20 - 10, 1, Math.random() * 20 - 10] } : undefined);
      if (i % 20 === 0) a.music.setZone(zones[(i / 20) % zones.length]);
      if (i % 15 === 0) handles.push(a.loop(a.debug.names.loops[(i / 15) % a.debug.names.loops.length], { position: [Math.random() * 30, 0, 0] }));
      if (i % 25 === 0 && handles.length) handles.shift().stop(0.3);
      for (const p of a.debug.names.params) a.setParam(p, Math.random());
      if (i % 40 === 0) a.voice('Excellente question ! Il est important de noter que.');
      i++;
      await new Promise((r) => setTimeout(r, 40));
    }
    for (const h of handles) h.stop(0.2);
    for (const p of a.debug.names.params) a.setParam(p, 0);
    a.music.setZone(null);
    return i;
  });
  const after = await waitNodes('sfx', before.sfx, 10000);
  await waitNodes('loop', before.loop, 6000);
  await sleep(6500);
  const end = await nodes();
  console.log(`\nsoak: ${res} actions in 12 s; nodes before ${JSON.stringify(before)} after ${JSON.stringify(end)} (sfx drained in ${after.ms} ms)`);
  if (end.sfx !== before.sfx) fail(`soak: ${end.sfx - before.sfx} sfx nodes leaked`);
  if (end.loop !== before.loop) fail(`soak: ${end.loop - before.loop} loop nodes leaked`);
  if (end.music > before.music + 60) fail(`soak: music nodes grew ${before.music} → ${end.music}`);
}

await ev(() => window.__audioDev.state.setMode('paused'));
await sleep(1200);
const duck = await ev(() => window.__audioDev.audio.debug.engine.buses.music.duck.gain.value);
await ev(() => window.__audioDev.state.setMode('playing'));
if (!(duck > 0.4 && duck < 0.8)) fail(`pause duck gain ${duck}`);

await ev(() => {
  const a = window.__audioDev.audio;
  a.sfx('nope.nope');
  a.sfx('nope.nope');
  a.loop('nope.loop').stop();
});
await sleep(200);
const expected = log.warnings.filter((w) => w.startsWith('[audio] unknown'));
if (expected.length !== 2) fail(`expected 2 unknown-name warnings, got ${expected.length}`);
const otherWarnings = log.warnings.filter((w) => !w.startsWith('[audio] unknown'));
for (const e of log.errors) fail(`console error: ${e}`);
for (const w of otherWarnings) fail(`console warning: ${w}`);

await browser.close();
console.log(failures.length ? `\nFAIL (${failures.length})\n- ${failures.join('\n- ')}` : '\nPASS');
process.exit(failures.length ? 1 : 0);
