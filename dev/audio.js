import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import * as THREE from 'three';
import { createEvents } from '/src/core/events.js';
import createAudio from '/src/audio/audio.js';

const events = createEvents();
const settings = { sensitivity: 1, invertY: false, fov: 70, master: 0.9, music: 0.8, sfx: 0.85, quality: 'high', subtitles: true, reduceFx: false };
const state = {
  mode: 'playing',
  stage: 0,
  settings,
  setMode(mode) {
    const from = state.mode;
    state.mode = mode;
    events.emit('mode:change', { from, to: mode });
  },
  setSetting(key, value) {
    settings[key] = value;
    events.emit('settings:change', { key, value });
  },
};
const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 6000);
camera.position.set(0, 1.7, 0);
camera.updateMatrixWorld();
const ctx = { events, state, camera, time: { now: 0, dt: 0, realDt: 0, frame: 0 }, has: (n) => n === 'audio' };
const audio = await createAudio(ctx);
ctx.audio = audio;
audio.start?.();

const $ = (sel) => document.querySelector(sel);
const board = $('#board');
const el = (tag, props = {}, parent) => {
  const n = Object.assign(document.createElement(tag), props);
  if (parent) parent.appendChild(n);
  return n;
};
const section = (title) => {
  const s = el('section', {}, board);
  el('h2', { textContent: title }, s);
  return el('div', { className: 'grid' }, s);
};
const flash = (b) => {
  b.classList.add('flash');
  setTimeout(() => b.classList.remove('flash'), 220);
};

$('#unlock').addEventListener('click', () => audio.unlock());

const names = audio.debug.names;
let positional = false;

const sfxGrid = section(`Effets — ${names.sfx.length}`);
const posRow = el('label', { className: 'chk' }, sfxGrid.parentElement);
const posBox = el('input', { type: 'checkbox' }, posRow);
posRow.append('positionnel (source qui tourne à 8 m)');
posBox.addEventListener('change', () => (positional = posBox.checked));
let orbit = 0;
const orbitPos = new THREE.Vector3();
for (const name of names.sfx) {
  const b = el('button', { className: 'k', textContent: name }, sfxGrid);
  b.addEventListener('click', () => {
    audio.sfx(name, positional ? { position: orbitPos.clone() } : undefined);
    flash(b);
  });
}

const loopGrid = section(`Boucles — ${names.loops.length}`);
const loopHandles = new Map();
for (const name of names.loops) {
  const b = el('button', { className: 'k', textContent: name }, loopGrid);
  b.addEventListener('click', () => {
    const h = loopHandles.get(name);
    if (h) {
      h.stop(0.8);
      loopHandles.delete(name);
      b.classList.remove('on');
    } else {
      loopHandles.set(name, audio.loop(name, positional ? { position: orbitPos, refDistance: 4, maxDistance: 60 } : undefined));
      b.classList.add('on');
    }
  });
}

const zoneGrid = section('Ambiance de zone (fondu 4 s)');
const zoneButtons = [];
for (const id of [null, ...names.zones]) {
  const b = el('button', { className: 'k', textContent: id ?? 'prairies (null)' }, zoneGrid);
  zoneButtons.push([id, b]);
  b.addEventListener('click', () => audio.music.setZone(id));
}

const stageGrid = section('Étape (balises rallumées)');
const stageButtons = [];
for (let n = 0; n <= 6; n++) {
  const b = el('button', { className: 'k human', textContent: n === 6 ? '6 · finale' : String(n) }, stageGrid);
  stageButtons.push(b);
  b.addEventListener('click', () => {
    state.stage = n;
    events.emit('stage:change', { stage: n, from: audio.music.stage });
  });
}

const cueGrid = section('Repères musicaux');
for (const cue of names.cues) {
  const b = el('button', { className: 'k human', textContent: cue }, cueGrid);
  b.addEventListener('click', () => {
    audio.music.play(cue);
    flash(b);
  });
}

const modeGrid = section('Mode (ducking)');
const modeButtons = [];
for (const mode of ['playing', 'reading', 'paused']) {
  const b = el('button', { className: 'k', textContent: mode }, modeGrid);
  modeButtons.push([mode, b]);
  b.addEventListener('click', () => state.setMode(mode));
}

const sliderGrid = section('Paramètres');
sliderGrid.className = 'sliders';
const slider = (label, value, onInput) => {
  el('span', { textContent: label }, sliderGrid);
  const input = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value }, sliderGrid);
  const out = el('span', { textContent: Number(value).toFixed(2) }, sliderGrid);
  input.addEventListener('input', () => {
    out.textContent = Number(input.value).toFixed(2);
    onInput(Number(input.value));
  });
};
for (const p of names.params) slider(p, 0, (v) => audio.setParam(p, v));
slider('master', settings.master, (v) => state.setSetting('master', v));
slider('music', settings.music, (v) => state.setSetting('music', v));
slider('sfx', settings.sfx, (v) => state.setSetting('sfx', v));

const voiceRow = el('div', { className: 'row' }, section('Tiret').parentElement);
const voiceText = el('input', { type: 'text', value: "Bonjour ! Je suis Tiret — votre assistant de navigation. Comment puis-je optimiser votre expérience aujourd'hui ?" }, voiceRow);
const voiceBtn = el('button', { className: 'k', textContent: 'parler' }, voiceRow);
voiceBtn.addEventListener('click', () => audio.voice(voiceText.value));

const meters = $('#meters');
const meterRow = (label) => {
  el('span', { textContent: label }, meters);
  const bar = el('div', { className: 'bar' }, meters);
  const fill = el('i', {}, bar);
  const val = el('span', { textContent: '—' }, meters);
  return { fill, val };
};
const mRms = meterRow('RMS');
const mPeak = meterRow('crête');
const info = el('div', { style: 'grid-column: 1 / -1; color: var(--mute); white-space: pre; margin-top: 6px' }, meters);

const spec = $('#spec');
const sctx = spec.getContext('2d');
const wave = $('#wave');
const wctx = wave.getContext('2d');
let freq = null;
let time = null;
let analyser = null;

function drawScope() {
  const eng = audio.debug.engine;
  if (eng && !analyser) {
    analyser = eng.analyser;
    freq = new Float32Array(analyser.frequencyBinCount);
    time = new Float32Array(analyser.fftSize);
  }
  sctx.fillStyle = '#07090c';
  sctx.fillRect(0, 0, spec.width, spec.height);
  wctx.fillStyle = '#07090c';
  wctx.fillRect(0, 0, wave.width, wave.height);
  sctx.strokeStyle = '#1a2028';
  sctx.fillStyle = '#4a5562';
  sctx.font = '18px "IBM Plex Mono", monospace';
  const W = spec.width;
  const H = spec.height;
  const fx = (f) => (Math.log10(f / 20) / Math.log10(20000 / 20)) * W;
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    const x = fx(f);
    sctx.beginPath();
    sctx.moveTo(x, 0);
    sctx.lineTo(x, H);
    sctx.stroke();
    sctx.fillText(f >= 1000 ? `${f / 1000}k` : String(f), x + 4, H - 8);
  }
  if (!analyser || !audio.running) return;
  analyser.getFloatFrequencyData(freq);
  analyser.getFloatTimeDomainData(time);
  const nyq = analyser.context.sampleRate / 2;
  const grad = sctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#ffb454');
  grad.addColorStop(0.55, '#5ce1e6');
  grad.addColorStop(1, '#ff5fa2');
  sctx.beginPath();
  sctx.moveTo(0, H);
  for (let i = 1; i < freq.length; i++) {
    const f = (i / freq.length) * nyq;
    if (f < 20) continue;
    const x = fx(f);
    const y = H - ((Math.max(-110, freq[i]) + 110) / 100) * H;
    sctx.lineTo(x, y);
  }
  sctx.lineTo(W, H);
  sctx.closePath();
  sctx.fillStyle = 'rgba(92, 225, 230, 0.18)';
  sctx.fill();
  sctx.strokeStyle = grad;
  sctx.lineWidth = 2;
  sctx.stroke();
  let sum = 0;
  let peak = 0;
  wctx.beginPath();
  for (let i = 0; i < time.length; i++) {
    const s = time[i];
    sum += s * s;
    if (Math.abs(s) > peak) peak = Math.abs(s);
    const x = (i / time.length) * wave.width;
    const y = wave.height / 2 - s * wave.height * 0.45;
    if (i === 0) wctx.moveTo(x, y);
    else wctx.lineTo(x, y);
  }
  wctx.strokeStyle = '#ffb454';
  wctx.lineWidth = 1.5;
  wctx.stroke();
  const rms = Math.sqrt(sum / time.length);
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  const pct = (d) => `${Math.max(0, Math.min(100, ((d + 60) / 60) * 100))}%`;
  mRms.fill.style.width = pct(db(rms));
  mRms.val.textContent = `${db(rms).toFixed(1)}`;
  mPeak.fill.style.width = pct(db(peak));
  mPeak.val.textContent = `${db(peak).toFixed(1)}`;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  orbit += dt * 0.6;
  orbitPos.set(Math.cos(orbit) * 8, 1.7, Math.sin(orbit) * 8);
  audio.frame(dt);
  drawScope();
  const n = audio.debug.nodes();
  const ac = audio.debug.context;
  $('#status').textContent = ac ? `contexte : ${ac.state} · ${ac.sampleRate} Hz · ${ac.currentTime.toFixed(1)} s` : 'contexte : en attente d’un geste';
  $('#unlock').classList.toggle('on', audio.running);
  $('#unlock').textContent = audio.running ? 'Son actif' : 'Activer le son';
  if (n) info.textContent = `nœuds  sfx ${n.sfx}  musique ${n.music}  boucles ${n.loop}\nvoix ${n.voices}  zone ${audio.music.zone ?? 'null'}  étape ${audio.music.stage}  mode ${state.mode}`;
  for (const [id, b] of zoneButtons) b.classList.toggle('on', audio.music.zone === id);
  stageButtons.forEach((b, i) => b.classList.toggle('on', audio.music.stage === i));
  for (const [m, b] of modeButtons) b.classList.toggle('on', state.mode === m);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const METER_SRC = `
class Meter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.reset();
    this.port.onmessage = (e) => {
      if (e.data === 'reset') this.reset();
      else this.port.postMessage({ n: this.n, rms: Math.sqrt(this.sum / Math.max(1, this.n)), wrms: Math.sqrt(this.wsum / Math.max(1, this.n)),
        peak: this.peak, maxWin: Math.sqrt(this.maxWin), clicks: this.clicks, worst: this.worst, maxJump: this.maxJump });
    };
  }
  reset() { this.n = 0; this.sum = 0; this.wsum = 0; this.peak = 0; this.clicks = 0; this.worst = 0; this.maxJump = 0;
    this.prev = [0, 0]; this.prevMad = [1, 1]; this.win = 0; this.winN = 0; this.maxWin = 0; this.mute = 4; }
  process(inputs) {
    const raw = inputs[0];
    const w = inputs[1];
    if (!raw || !raw.length) return true;
    const len = raw[0].length;
    if (this.mute > 0) { this.mute--; for (let c = 0; c < raw.length && c < 2; c++) this.prev[c] = raw[c][len - 1]; return true; }
    for (let c = 0; c < raw.length && c < 2; c++) {
      const x = raw[c];
      let mad = 0;
      let p = this.prev[c];
      for (let i = 0; i < len; i++) { mad += Math.abs(x[i] - p); p = x[i]; }
      mad /= len;
      p = this.prev[c];
      for (let i = 0; i < len; i++) {
        const d = Math.abs(x[i] - p);
        if (d > this.maxJump) this.maxJump = d;
        if (d > 0.04 && d > 8 * this.prevMad[c] && d > 5 * mad) { this.clicks++; const r = d / Math.max(mad, 1e-4); if (r > this.worst) this.worst = r; }
        p = x[i];
        const a = Math.abs(x[i]);
        if (a > this.peak) this.peak = a;
      }
      this.prev[c] = p;
      this.prevMad[c] = Math.max(mad, 0.0005);
    }
    for (let i = 0; i < len; i++) {
      let s = 0; let ws = 0;
      for (let c = 0; c < raw.length; c++) s += raw[c][i] * raw[c][i];
      s /= raw.length;
      if (w && w.length) { for (let c = 0; c < w.length; c++) ws += w[c][i] * w[c][i]; ws /= w.length; }
      this.sum += s; this.wsum += ws; this.n++;
      this.win += s; this.winN++;
      if (this.winN >= 2048) { const m = this.win / this.winN; if (m > this.maxWin) this.maxWin = m; this.win = 0; this.winN = 0; }
    }
    return true;
  }
}
registerProcessor('dh-meter', Meter);
`;

const meter = {
  node: null,
  analyser: null,
  acc: null,
  frames: 0,
  timer: 0,
  async install() {
    const ac = audio.debug.context;
    const eng = audio.debug.engine;
    const url = URL.createObjectURL(new Blob([METER_SRC], { type: 'text/javascript' }));
    await ac.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    this.node = new AudioWorkletNode(ac, 'dh-meter', { numberOfInputs: 2, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit' });
    eng.tap.connect(this.node, 0, 0);
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 60;
    hp.Q.value = 0.5;
    const shelf = ac.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 1500;
    shelf.gain.value = 4;
    eng.tap.connect(hp);
    hp.connect(shelf);
    shelf.connect(this.node, 0, 1);
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0;
    eng.tap.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.frequencyBinCount);
    this.acc = new Float64Array(this.analyser.frequencyBinCount);
  },
  reset() {
    this.node.port.postMessage('reset');
    this.acc.fill(0);
    this.frames = 0;
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.analyser.getFloatFrequencyData(this.buf);
      for (let i = 0; i < this.buf.length; i++) this.acc[i] += Math.pow(10, this.buf[i] / 10);
      this.frames++;
    }, 50);
  },
  read() {
    clearInterval(this.timer);
    const ac = audio.debug.context;
    const nyq = ac.sampleRate / 2;
    let num = 0;
    let den = 0;
    for (let i = 1; i < this.acc.length; i++) {
      const f = (i / this.acc.length) * nyq;
      const m = Math.sqrt(this.acc[i] / Math.max(1, this.frames));
      num += f * m;
      den += m;
    }
    const centroid = den > 0 ? num / den : 0;
    return new Promise((resolve) => {
      this.node.port.onmessage = (e) => resolve({ ...e.data, centroid });
      this.node.port.postMessage('read');
    });
  },
};

window.__audioDev = { audio, ctx, state, events, meter, loopHandles, ready: true };
