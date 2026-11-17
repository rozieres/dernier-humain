import { rand, pick, mtof } from './engine.js';
import { tone, burst, fm, bell, piano, strings, formant, VOWELS } from './instruments.js';

const r = (k) => rand(1 - k, 1 + k);

function step(v, t, p, o) {
  const g = o.g * r(0.25);
  if (o.thud) tone(v, { t, f: o.thud * p * r(0.12), f1: o.thud * 0.6 * p, d: o.thudD ?? 0.06, g: g * (o.thudG ?? 0.7) });
  burst(v, { t, f: o.f * p * r(0.2), q: o.q ?? 1, type: o.type ?? 'bandpass', d: o.d * r(0.25), a: o.a ?? 0.003, g, color: o.color ?? 'white' });
  if (o.second) burst(v, { t: t + rand(0.012, 0.03), f: o.f * 1.3 * p * r(0.2), q: o.q ?? 1, d: o.d * 0.6, g: g * 0.5, color: o.color ?? 'white' });
}

function knock(v, t, p, g, muffled) {
  const dest = muffled ? v.filter('lowpass', 520, 0.8, v.out) : v.out;
  tone(v, { t, f: 190 * p * r(0.05), f1: 120 * p, glide: 0.05, d: 0.09, g: g * 0.9, dest });
  tone(v, { t, f: 340 * p * r(0.06), d: 0.05, g: g * 0.35, dest });
  burst(v, { t, f: 1100 * p, q: 2.5, d: 0.03, g: g * 0.45, dest });
}

function chord(v, t, notes, gap, o) {
  for (let i = 0; i < notes.length; i++) bell(v, { t: t + i * gap, midi: notes[i], ...o });
}

function dtmf(v, t, d, lo, hi, dest) {
  tone(v, { t, f: lo, a: 0.004, sustain: d, d: 0.01, g: 0.07, dest });
  tone(v, { t, f: hi, a: 0.004, sustain: d, d: 0.01, g: 0.07, dest });
}

export const SFX = {
  'ui.click': (v, t, p) => {
    tone(v, { t, f: 1700 * p, f1: 1150 * p, d: 0.035, g: 0.09 });
    burst(v, { t, f: 4500, type: 'highpass', d: 0.008, g: 0.05 });
  },
  'ui.hover': (v, t, p) => tone(v, { t, f: 2300 * p, d: 0.04, a: 0.006, g: 0.05 }),
  'ui.open': (v, t, p) => {
    fm(v, { t, f: 660 * p, ratio: 2, index: 0.6, d: 0.12, g: 0.08 });
    fm(v, { t: t + 0.06, f: 990 * p, ratio: 2, index: 0.6, d: 0.18, g: 0.07 });
    v.send(0.2);
  },
  'ui.close': (v, t, p) => {
    fm(v, { t, f: 990 * p, ratio: 2, index: 0.5, d: 0.1, g: 0.06 });
    fm(v, { t: t + 0.055, f: 620 * p, ratio: 2, index: 0.5, d: 0.14, g: 0.06 });
  },
  'ui.type': (v, t, p) => {
    burst(v, { t, f: 2600 * p * r(0.2), q: 3, d: 0.012, g: 0.06 * r(0.3) });
    tone(v, { t, f: 170 * r(0.1), d: 0.025, g: 0.05 });
    if (Math.random() < 0.08) bell(v, { t: t + 0.02, f: 2400, d: 0.3, g: 0.01 });
  },

  'step.grass': (v, t, p) => step(v, t, p, { f: 2400, q: 0.8, d: 0.07, g: 0.05, thud: 90, color: 'pink', second: true }),
  'step.stone': (v, t, p) => step(v, t, p, { f: 2600, type: 'highpass', q: 0.8, d: 0.025, g: 0.045, thud: 150, thudD: 0.04 }),
  'step.sand': (v, t, p) => step(v, t, p, { f: 1500, q: 0.6, d: 0.1, a: 0.012, g: 0.13, color: 'pink', second: true }),
  'step.dirt': (v, t, p) => step(v, t, p, { f: 800, type: 'lowpass', q: 0.7, d: 0.06, g: 0.07, thud: 75, color: 'pink' }),
  'step.wood': (v, t, p) => {
    step(v, t, p, { f: 900, q: 2, d: 0.03, g: 0.04, thud: 200, thudD: 0.07, thudG: 1.2 });
    tone(v, { t, f: 410 * p * r(0.05), d: 0.05, g: 0.02 });
  },
  'step.metal': (v, t, p) => {
    fm(v, { t, f: 820 * p * r(0.08), ratio: 1.41, index: 2, d: 0.14, g: 0.025 });
    step(v, t, p, { f: 3800, type: 'highpass', d: 0.02, g: 0.03, thud: 120, thudD: 0.04 });
  },
  jump: (v, t, p) => {
    burst(v, { t, f: 500 * p, f1: 1400 * p, q: 1.2, a: 0.02, d: 0.12, g: 0.06, color: 'pink' });
    tone(v, { t, f: 110, f1: 80, d: 0.06, g: 0.04 });
  },
  land: (v, t, p) => {
    tone(v, { t, f: 85 * p, f1: 50, d: 0.12, g: 0.13 });
    burst(v, { t, f: 650 * p, type: 'lowpass', d: 0.08, g: 0.09, color: 'pink' });
  },
  'land.hard': (v, t, p) => {
    tone(v, { t, f: 70 * p, f1: 34, d: 0.32, g: 0.3 });
    burst(v, { t, f: 900 * p, type: 'lowpass', q: 0.9, d: 0.2, g: 0.16, color: 'brown' });
    burst(v, { t: t + 0.01, f: 2500, q: 1, d: 0.05, g: 0.05 });
    v.send(0.3);
  },
  'glide.open': (v, t, p) => {
    const f = burst(v, { t, f: 700 * p, f1: 1600 * p, q: 1.4, a: 0.03, d: 0.22, g: 0.07, color: 'pink' });
    const flap = v.gain(420);
    v.osc('square', 26, t, t + 0.3, flap);
    flap.connect(f.frequency);
    tone(v, { t, f: 300, f1: 520, d: 0.1, g: 0.02 });
  },
  'glide.close': (v, t, p) => burst(v, { t, f: 1300 * p, f1: 400 * p, q: 0.8, a: 0.01, d: 0.22, g: 0.2, color: 'pink' }),

  scan: (v, t, p) => {
    tone(v, { t, f: 1180 * p, f1: 1080 * p, glide: 1.2, a: 0.004, d: 1.3, g: 0.11 });
    tone(v, { t, f: 2360 * p, d: 0.4, g: 0.025 });
    burst(v, { t, f: 1800, f1: 7000, q: 4, a: 0.25, d: 0.5, g: 0.02 });
    for (let i = 0; i < 4; i++) tone(v, { t: t + 0.12 + i * 0.09, f: (2400 + i * 900) * p, f1: (3400 + i * 1200) * p, a: 0.05, d: 0.3, g: 0.012 });
    v.send(0.55);
  },
  'scan.human': (v, t, p) => {
    piano(v, { t, midi: pick([74, 78, 81]) + (p > 1.02 ? 2 : 0), vel: 0.55, dur: 1.4 });
    piano(v, { t: t + 0.09, midi: pick([66, 69]), vel: 0.3, dur: 1.2 });
    v.send(0.35);
  },
  'scan.synth': (v, t, p) => {
    fm(v, { t, f: 3100 * p, ratio: 3.47, index: 1.2, d: 0.09, g: 0.04 });
    burst(v, { t, f: 9000, type: 'highpass', d: 0.01, g: 0.02 });
    v.send(0.2);
  },
  'scan.hallu': (v, t, p) => {
    const a = tone(v, { t, f: 700 * p, f1: 560 * p, glide: 0.7, a: 0.03, d: 0.6, g: 0.06 });
    const b = tone(v, { t, f: 714 * p, f1: 545 * p, glide: 0.7, a: 0.03, d: 0.6, g: 0.05 });
    const lfo = v.gain(45);
    v.osc('sine', 7.5, t, t + 0.75, lfo);
    lfo.connect(a.detune);
    lfo.connect(b.detune);
    v.send(0.5);
  },

  grab: (v, t, p) => {
    tone(v, { t, f: 280 * p, f1: 620 * p, glide: 0.06, d: 0.09, g: 0.09 });
    tone(v, { t: t + 0.02, f: 110, d: 0.25, a: 0.02, g: 0.03, type: 'triangle' });
    burst(v, { t, f: 3000, q: 2, d: 0.01, g: 0.03 });
  },
  drop: (v, t, p) => tone(v, { t, f: 540 * p, f1: 240 * p, glide: 0.08, d: 0.1, g: 0.07 }),
  throw: (v, t, p) => {
    burst(v, { t, f: 600 * p, f1: 2600 * p, q: 1.6, a: 0.04, d: 0.18, g: 0.09, color: 'pink' });
    tone(v, { t, f: 200, f1: 420, d: 0.12, g: 0.03 });
  },
  'impact.soft': (v, t, p) => {
    tone(v, { t, f: 95 * p, f1: 60, d: 0.1, g: 0.12 });
    burst(v, { t, f: 450 * p, type: 'lowpass', d: 0.07, g: 0.1, color: 'pink' });
  },
  'impact.hard': (v, t, p) => {
    tone(v, { t, f: 70 * p, f1: 40, d: 0.22, g: 0.22 });
    burst(v, { t, f: 1300 * p, q: 1.2, d: 0.07, g: 0.14 });
    fm(v, { t, f: 410 * p, ratio: 2.31, index: 1.5, d: 0.2, g: 0.025 });
    v.send(0.25);
  },

  interact: (v, t, p) => {
    tone(v, { t, f: 880 * p, d: 0.08, g: 0.06 });
    tone(v, { t: t + 0.05, f: 1320 * p, d: 0.12, g: 0.05 });
  },
  read: (v, t, p) => {
    const f = burst(v, { t, f: 3000 * p, q: 1, a: 0.02, d: 0.22, g: 0.05, color: 'pink' });
    const jit = v.gain(900);
    v.noise('white', t, t + 0.3, jit, 0.02);
    jit.connect(f.frequency);
    bell(v, { t: t + 0.05, midi: 81, d: 0.8, g: 0.012 });
  },
  page: (v, t, p) => {
    burst(v, { t, f: 1400 * p, f1: 4200 * p, q: 0.8, a: 0.05, d: 0.22, g: 0.18, color: 'pink' });
    burst(v, { t: t + 0.12, f: 2500, q: 2, d: 0.04, g: 0.06 });
  },
  'trace.found': (v, t, p) => {
    const notes = [62, 66, 69, 74];
    for (let i = 0; i < notes.length; i++) piano(v, { t: t + i * 0.09 + rand(0, 0.02), midi: notes[i] + 12, vel: 0.45 + i * 0.05, dur: 1.6 });
    bell(v, { t: t + 0.36, midi: 93, d: 2.2, g: 0.02 });
    v.send(0.45);
  },
  'beacon.ready': (v, t, p) => {
    const hum = tone(v, { t, f: mtof(45) * p, a: 0.8, d: 0.6, g: 0.05, type: 'warm' });
    hum.detune.linearRampToValueAtTime(30, t + 1.2);
    bell(v, { t: t + 0.7, midi: 69, d: 2, g: 0.05 });
    bell(v, { t: t + 0.95, midi: 74, d: 2.5, g: 0.06 });
    v.send(0.5);
  },
  'beacon.activate': (v, t, p) => {
    tone(v, { t, f: 36, f1: 55, glide: 2.5, a: 1.2, sustain: 0.8, d: 1.8, g: 0.22 });
    strings(v, { notes: [38, 45, 50, 57], t, dur: 1.6, g: 0.05, cutoff: 2600, attack: 1.4, release: 1.8, spread: 10 });
    const base = mtof(50) * p;
    for (let n = 2; n <= 10; n++) {
      tone(v, { t: t + 0.25 * n, f: base * n, a: 0.35, sustain: 0.3, d: 1.4, g: 0.03 / Math.sqrt(n), detune: rand(-4, 4) });
    }
    burst(v, { t, f: 300, f1: 4000, glide: 2.6, q: 0.9, a: 2.4, d: 0.8, g: 0.04, color: 'pink' });
    bell(v, { t: t + 2.6, midi: 86, d: 2.5, g: 0.035 });
    v.send(0.7);
  },
  'stage.shift': (v, t, p) => {
    burst(v, { t, f: 200, f1: 900, q: 0.8, a: 1.2, d: 1.6, g: 0.05, color: 'pink' });
    bell(v, { t: t + 0.8, f: mtof(50) * p, d: 4, g: 0.05 });
    v.send(0.6);
  },

  'link.attach': (v, t, p) => {
    fm(v, { t, f: 620 * p, ratio: 1.73, index: 3, d: 0.12, g: 0.07 });
    burst(v, { t, f: 3200, q: 2, d: 0.03, g: 0.07 });
    burst(v, { t: t + 0.05, f: 900, f1: 3200, glide: 0.5, q: 3, a: 0.2, d: 0.35, g: 0.04 });
  },
  'link.arrive': (v, t, p) => {
    fm(v, { t, f: 520 * p, ratio: 1.73, index: 2.5, d: 0.12, g: 0.06 });
    burst(v, { t, f: 2400, f1: 500, q: 1.4, a: 0.01, d: 0.3, g: 0.07, color: 'pink' });
    bell(v, { t: t + 0.1, midi: 81, d: 1.2, g: 0.02 });
  },
  'link.restore': (v, t, p) => {
    const saw = tone(v, { t, f: 90, f1: 720, glide: 1.4, a: 0.9, d: 0.6, g: 0.04, type: 'sawtooth' });
    saw.detune.value = 5;
    for (let i = 0; i < 9; i++) burst(v, { t: t + rand(0.1, 1.4), f: rand(3000, 7000), q: 4, d: 0.015, g: 0.02 });
    chord(v, t + 1.45, [62, 69, 74, 81], 0.06, { d: 3, g: 0.04 });
    v.send(0.55);
  },

  'popup.open': (v, t, p) => {
    const o = tone(v, { t, f: 520 * p, f1: 980 * p, glide: 0.07, d: 0.16, g: 0.06, type: 'square' });
    o.frequency.linearRampToValueAtTime(820 * p, t + 0.14);
    burst(v, { t, f: 2200, q: 2, d: 0.02, g: 0.05 });
  },
  'popup.close': (v, t, p) => {
    tone(v, { t, f: 900 * p, f1: 360 * p, glide: 0.1, d: 0.12, g: 0.05, type: 'triangle' });
    burst(v, { t, f: 3000, f1: 800, q: 0.8, d: 0.1, g: 0.035 });
  },
  'popup.dodge': (v, t, p) => {
    tone(v, { t, f: 380 * p, f1: 1650 * p, glide: 0.12, d: 0.16, g: 0.05, type: 'triangle' });
    burst(v, { t, f: 800, f1: 4000, q: 2, a: 0.03, d: 0.1, g: 0.035 });
  },
  'drone.hit': (v, t, p) => {
    fm(v, { t, f: 480 * p, ratio: 2.71, index: 4, d: 0.3, g: 0.08 });
    const sq = tone(v, { t: t + 0.03, f: 180 * p, d: 0.25, sustain: 0.1, g: 0.03, type: 'square' });
    sq.frequency.setValueAtTime(240 * p, t + 0.08);
    sq.frequency.setValueAtTime(150 * p, t + 0.13);
    sq.frequency.setValueAtTime(260 * p, t + 0.18);
    burst(v, { t, f: 2400, q: 1, d: 0.06, g: 0.08 });
  },
  'drone.down': (v, t, p) => {
    const lp = v.filter('lowpass', 2400, 1, v.out);
    tone(v, { t, f: 820 * p, f1: 90, glide: 1.1, sustain: 0.8, d: 0.3, g: 0.05, type: 'sawtooth', dest: lp });
    burst(v, { t: t + 1.15, f: 900, type: 'lowpass', d: 0.4, g: 0.16, color: 'brown' });
    burst(v, { t: t + 1.16, f: 3000, q: 1, d: 0.12, g: 0.06 });
    tone(v, { t: t + 1.15, f: 70, f1: 38, d: 0.3, g: 0.14 });
    v.send(0.3);
  },
  'seed.pick': (v, t, p) => {
    tone(v, { t, f: 600 * p, f1: 900 * p, glide: 0.04, d: 0.07, g: 0.06 });
    burst(v, { t, f: 3500, q: 1, d: 0.06, g: 0.025, color: 'pink' });
  },
  'seed.plant': (v, t, p) => {
    tone(v, { t, f: 90 * p, f1: 55, d: 0.12, g: 0.1 });
    burst(v, { t, f: 600, type: 'lowpass', d: 0.1, g: 0.08, color: 'brown' });
    for (let i = 0; i < 3; i++) bell(v, { t: t + 0.18 + i * 0.08, midi: [74, 78, 81][i], d: 0.8, g: 0.018 });
    v.send(0.3);
  },
  'harvester.hit': (v, t, p) => {
    fm(v, { t, f: 160 * p, ratio: 2.83, index: 6, d: 0.7, g: 0.12 });
    fm(v, { t, f: 377 * p, ratio: 1.41, index: 3, d: 0.4, g: 0.05 });
    burst(v, { t, f: 1800, q: 0.7, d: 0.18, g: 0.12 });
    tone(v, { t, f: 60, f1: 35, d: 0.3, g: 0.2 });
    v.send(0.3);
  },
  'hallu.reveal': (v, t, p) => {
    const notes = [74, 76, 78, 80, 82];
    for (let i = 0; i < notes.length; i++) {
      tone(v, { t: t + i * 0.07, f: mtof(notes[i]) * p, f1: mtof(notes[i] + 2) * p, glide: 1.2, a: 0.4, d: 0.9, g: 0.02, detune: rand(-20, 20) });
    }
    burst(v, { t, f: 2000, f1: 8000, q: 3, a: 0.5, d: 0.6, g: 0.03 });
    v.send(0.6);
  },
  'hallu.fall': (v, t, p) => {
    const o = tone(v, { t, f: 1300 * p, f1: 180 * p, glide: 1.3, a: 0.05, sustain: 0.9, d: 0.4, g: 0.05 });
    const lfo = v.gain(30);
    v.osc('sine', 6, t, t + 1.4, lfo);
    lfo.connect(o.detune);
    burst(v, { t, f: 2400, f1: 300, glide: 1.3, q: 1.2, a: 0.2, sustain: 0.6, d: 0.5, g: 0.04, color: 'pink' });
  },
  'pedestal.ok': (v, t, p) => {
    chord(v, t, [74, 78, 81], 0.07, { d: 1.8, g: 0.045 });
    tone(v, { t, f: mtof(50), d: 0.5, g: 0.05 });
    v.send(0.35);
  },
  'pedestal.wrong': (v, t, p) => {
    const lp = v.filter('lowpass', 900, 1, v.out);
    tone(v, { t, f: 196 * p, d: 0.12, sustain: 0.05, g: 0.045, type: 'square', dest: lp });
    tone(v, { t: t + 0.16, f: 185 * p, d: 0.2, sustain: 0.05, g: 0.045, type: 'square', dest: lp });
  },
  modem: (v, t) => {
    const hp = v.filter('highpass', 300, 0.7);
    const line = v.filter('lowpass', 3400, 0.7, v.out);
    hp.connect(line);
    tone(v, { t, f: 350, sustain: 0.45, d: 0.02, g: 0.05, dest: hp });
    tone(v, { t, f: 440, sustain: 0.45, d: 0.02, g: 0.05, dest: hp });
    const pad = [[941, 1336], [697, 1209], [852, 1477], [770, 1336], [697, 1477], [941, 1209], [852, 1336]];
    for (let i = 0; i < pad.length; i++) dtmf(v, t + 0.55 + i * 0.11, 0.07, pad[i][0], pad[i][1], hp);
    const ans = t + 1.42;
    const at = tone(v, { t: ans, f: 2100, a: 0.01, sustain: 0.68, d: 0.02, g: 0.05, dest: hp });
    at.frequency.setValueAtTime(2100, ans + 0.24);
    at.frequency.setValueAtTime(1800, ans + 0.25);
    at.frequency.setValueAtTime(2100, ans + 0.27);
    at.frequency.setValueAtTime(1800, ans + 0.48);
    at.frequency.setValueAtTime(2100, ans + 0.5);
    const fsk = t + 2.15;
    const w = tone(v, { t: fsk, f: 1180, a: 0.01, sustain: 0.42, d: 0.02, g: 0.045, dest: hp });
    for (let k = 0; k < 20; k++) w.frequency.setValueAtTime(Math.random() < 0.5 ? 980 : 1180, fsk + k * 0.021);
    const bong = t + 2.65;
    tone(v, { t: bong, f: 1290, d: 0.22, sustain: 0.05, g: 0.06, type: 'triangle', dest: hp });
    tone(v, { t: bong + 0.26, f: 890, d: 0.26, sustain: 0.05, g: 0.06, type: 'triangle', dest: hp });
    const trill = t + 3.2;
    const tr = tone(v, { t: trill, f: 2400, a: 0.01, sustain: 0.3, d: 0.02, g: 0.035, dest: hp });
    for (let k = 0; k < 14; k++) tr.frequency.setValueAtTime(k % 2 ? 1800 : 2400, trill + k * 0.023);
    const hiss = burst(v, { t: t + 3.55, f: 1800, q: 0.6, a: 0.05, sustain: 1.1, d: 0.3, g: 0.07, dest: hp });
    const am = v.gain(0.5);
    v.osc('square', 31, t + 3.55, t + 5.1, am);
    am.connect(hiss.frequency);
    tone(v, { t: t + 3.55, f: 1650, a: 0.05, sustain: 1.0, d: 0.3, g: 0.012, dest: hp });
  },
  'guestbook.open': (v, t, p) => {
    const creak = tone(v, { t, f: 110 * p, a: 0.08, sustain: 0.3, d: 0.15, g: 0.02, type: 'sawtooth', dest: v.filter('bandpass', 700, 6, v.out) });
    for (let k = 0; k < 8; k++) creak.frequency.setValueAtTime(rand(85, 140), t + k * 0.05);
    burst(v, { t: t + 0.3, f: 2500, q: 1, d: 0.2, g: 0.03, color: 'pink' });
    bell(v, { t: t + 0.25, midi: 79, d: 1.6, g: 0.03 });
    bell(v, { t: t + 0.38, midi: 83, d: 1.8, g: 0.03 });
    v.send(0.3);
  },
  knock: (v, t, p) => {
    knock(v, t, p * r(0.04), 0.22, false);
    v.send(0.18);
  },
  'knock.reply': (v, t, p) => {
    knock(v, t, p * 0.9 * r(0.04), 0.16, true);
    v.send(0.4);
  },
  'note.slide': (v, t, p) => {
    const f = burst(v, { t, f: 2500 * p, f1: 1500 * p, glide: 0.8, q: 0.9, a: 0.1, sustain: 0.45, d: 0.25, g: 0.1, color: 'pink' });
    const fr = v.gain(400);
    v.noise('white', t, t + 0.9, fr, 0.01);
    fr.connect(f.frequency);
  },
  indexed: (v, t, p) => {
    tone(v, { t, f: 1900 * p, f1: 7800 * p, glide: 0.45, a: 0.4, d: 0.06, g: 0.02 });
    burst(v, { t: t + 0.46, f: 5000, q: 0.6, a: 0.008, d: 0.08, g: 0.14 });
    tone(v, { t: t + 0.46, f: 90, f1: 40, a: 0.008, d: 0.2, g: 0.15 });
    tone(v, { t: t + 0.5, f: 2400, f1: 600, glide: 0.25, d: 0.25, g: 0.03, type: 'square', dest: v.filter('lowpass', 3000, 0.7, v.out) });
    v.send(0.3);
  },
  alarm: (v, t) => {
    const lp = v.filter('lowpass', 2200, 0.8, v.out);
    for (let i = 0; i < 6; i++) tone(v, { t: t + i * 0.3, f: i % 2 ? 660 : 880, a: 0.01, sustain: 0.22, d: 0.04, g: 0.045, type: 'square', dest: lp });
    v.send(0.2);
  },
  'cabin.off': (v, t) => {
    burst(v, { t, f: 3000, q: 1.5, d: 0.015, g: 0.08 });
    tone(v, { t, f: 50, d: 0.02, g: 0.04 });
    tone(v, { t: t + 0.01, f: 100, f1: 30, glide: 1, a: 0.01, d: 1, g: 0.06, type: 'sawtooth', dest: v.filter('lowpass', 400, 0.7, v.out) });
  },
  door: (v, t, p) => {
    const bp = v.filter('bandpass', 650, 7, v.out);
    const creak = tone(v, { t, f: 95 * p, a: 0.1, sustain: 0.45, d: 0.15, g: 0.05, type: 'sawtooth', dest: bp });
    for (let k = 0; k < 12; k++) creak.frequency.setValueAtTime(rand(80, 125) * p, t + k * 0.05);
    burst(v, { t: t + 0.05, f: 3000, q: 2, d: 0.02, g: 0.05 });
    tone(v, { t: t + 0.72, f: 80, f1: 50, d: 0.15, g: 0.12 });
    burst(v, { t: t + 0.72, f: 500, type: 'lowpass', d: 0.1, g: 0.06, color: 'brown' });
    v.send(0.3);
  },
  'crt.on': (v, t) => {
    tone(v, { t, f: 70, f1: 45, d: 0.15, g: 0.12 });
    burst(v, { t, f: 2500, q: 0.7, d: 0.12, g: 0.05 });
    const deg = tone(v, { t: t + 0.05, f: 55, a: 0.1, sustain: 0.5, d: 0.6, g: 0.06, type: 'triangle' });
    deg.frequency.linearRampToValueAtTime(62, t + 1);
    tone(v, { t: t + 0.1, f: 15600, a: 0.4, sustain: 0.5, d: 0.6, g: 0.0025 });
    for (let i = 0; i < 6; i++) burst(v, { t: t + rand(0.05, 0.6), f: rand(2000, 6000), q: 3, d: 0.01, g: 0.025 });
  },
  'lamp.ignite': (v, t, p) => {
    tone(v, { t, f: 48, f1: 30, d: 0.5, g: 0.28 });
    burst(v, { t, f: 1600, q: 0.6, d: 0.18, g: 0.14 });
    burst(v, { t: t + 0.01, f: 300, type: 'lowpass', d: 0.4, g: 0.12, color: 'brown' });
    const lp = v.filter('lowpass', 200, 1.2, v.out);
    lp.frequency.setValueAtTime(200, t + 0.1);
    lp.frequency.exponentialRampToValueAtTime(2600, t + 3.2);
    const hum = v.gain(0, lp);
    hum.gain.setValueAtTime(0, t + 0.1);
    hum.gain.linearRampToValueAtTime(0.06, t + 2.4);
    hum.gain.setValueAtTime(0.06, t + 3.6);
    hum.gain.linearRampToValueAtTime(0, t + 5);
    for (const [f, d] of [[55, 0], [110, 3], [165, -4], [220, 6]]) {
      const o = v.osc('sawtooth', f * 0.75 * p, t + 0.1, t + 5.05, hum);
      o.detune.value = d;
      o.frequency.setValueAtTime(f * 0.75 * p, t + 0.1);
      o.frequency.exponentialRampToValueAtTime(f * p, t + 3);
    }
    for (let i = 0; i < 14; i++) {
      const at = t + 1.2 + rand(0, 3.3);
      tone(v, { t: at, f: rand(2200, 6200), a: 0.02, d: rand(0.3, 0.8), g: 0.008 });
    }
    v.send(0.6);
  },
  'reply.send': (v, t) => {
    burst(v, { t, f: 1500, f1: 4500, q: 1, a: 0.1, d: 0.3, g: 0.04, color: 'pink' });
    piano(v, { t: t + 0.2, midi: 62, vel: 0.35, dur: 2 });
    piano(v, { t: t + 0.24, midi: 66, vel: 0.3, dur: 2 });
    piano(v, { t: t + 0.28, midi: 69, vel: 0.32, dur: 2 });
    v.send(0.4);
  },
  respawn: (v, t, p) => {
    burst(v, { t, f: 200, f1: 3000, glide: 0.9, q: 1, a: 0.85, d: 0.15, g: 0.06, color: 'pink' });
    tone(v, { t: t + 0.7, f: 440 * p, f1: 880 * p, glide: 0.25, a: 0.01, d: 0.6, g: 0.04 });
    bell(v, { t: t + 0.9, midi: 81, d: 1.6, g: 0.025 });
    v.send(0.4);
  },
  splash: (v, t, p) => {
    burst(v, { t, f: 2200 * p, f1: 500, glide: 0.5, q: 0.6, a: 0.01, d: 0.55, g: 0.18, color: 'white', type: 'lowpass' });
    tone(v, { t, f: 90, f1: 45, d: 0.2, g: 0.12 });
    for (let i = 0; i < 7; i++) {
      const at = t + 0.1 + rand(0, 0.5);
      const f = rand(380, 900);
      tone(v, { t: at, f, f1: f * 2.2, glide: 0.04, d: 0.05, g: 0.02 });
    }
    v.send(0.25);
  },
  'companion.blip': (v, t, p) => {
    fm(v, { t, f: 1180 * p, ratio: 2, index: 0.4, d: 0.07, g: 0.05 });
    fm(v, { t: t + 0.075, f: 1490 * p, ratio: 2, index: 0.4, d: 0.1, g: 0.045 });
    formant(v, { t, f0: 620 * p, vowel: VOWELS.i, source: 'triangle', d: 0.06, g: 0.02 });
  },
};

export const SFX_NAMES = Object.keys(SFX);
