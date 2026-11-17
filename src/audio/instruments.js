import { env, mtof, rand } from './engine.js';

const BUILTIN = new Set(['sine', 'square', 'sawtooth', 'triangle']);

export function tone(v, o) {
  const { t, a = 0.004, d = 0.2, sustain = 0, g = 0.3, dest = v.out, type = 'sine', detune = 0 } = o;
  const f = o.f ?? mtof(o.midi);
  const amp = v.gain(0, dest);
  const end = env(amp.gain, t, a, g, d, sustain);
  const osc = v.osc(BUILTIN.has(type) ? type : v.eng.waves[type], f, t, end + 0.01, amp);
  if (detune) osc.detune.value = detune;
  if (o.f1) {
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide ?? a + sustain + d));
  }
  return osc;
}

export function burst(v, o) {
  const { t, a = 0.002, d = 0.1, sustain = 0, g = 0.3, dest = v.out, type = 'bandpass', q = 1, color = 'white', rate = 1 } = o;
  const f = o.f ?? 1000;
  const amp = v.gain(0, dest);
  const flt = v.filter(type, f, q, amp);
  const end = env(amp.gain, t, a, g, d, sustain);
  v.noise(color, t, end + 0.01, flt, rate);
  if (o.f1) {
    flt.frequency.setValueAtTime(f, t);
    flt.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide ?? a + sustain + d));
  }
  return flt;
}

export function fm(v, o) {
  const { t, a = 0.002, d = 0.5, sustain = 0, g = 0.3, dest = v.out, ratio = 2, index = 2, index1 = 0.01, modDecay } = o;
  const f = o.f ?? mtof(o.midi);
  const amp = v.gain(0, dest);
  const end = env(amp.gain, t, a, g, d, sustain);
  const car = v.osc('sine', f, t, end + 0.01, amp);
  const depth = v.gain(0);
  const mod = v.osc('sine', f * ratio, t, end + 0.01, depth);
  depth.connect(car.frequency);
  depth.gain.setValueAtTime(index * f * ratio, t);
  depth.gain.exponentialRampToValueAtTime(Math.max(index1, 0.001) * f * ratio, t + (modDecay ?? d * 0.6));
  if (o.f1) {
    car.frequency.setValueAtTime(f, t);
    car.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide ?? d));
    mod.frequency.setValueAtTime(f * ratio, t);
    mod.frequency.exponentialRampToValueAtTime(o.f1 * ratio, t + (o.glide ?? d));
  }
  return car;
}

const BELL = [[1, 1, 1], [2.01, 0.5, 0.7], [2.76, 0.42, 0.55], [4.07, 0.25, 0.4], [5.43, 0.16, 0.3], [6.8, 0.08, 0.22]];
const BOX = [[1, 1, 1], [3.01, 0.22, 0.35], [5.98, 0.1, 0.18]];

export function bell(v, o) {
  const { t, d = 2.5, g = 0.15, dest = v.out, partials = BELL, a = 0.002 } = o;
  const f = o.f ?? mtof(o.midi);
  for (let i = 0; i < partials.length; i++) {
    const [ratio, amp, decay] = partials[i];
    if (f * ratio > 15000) break;
    tone(v, { t, a, d: d * decay, g: g * amp, f: f * ratio, dest, detune: rand(-3, 3) });
  }
}

export function musicBox(v, o) {
  bell(v, { ...o, partials: BOX, d: o.d ?? 1.8 });
}

export function piano(v, o) {
  const { t, vel = 0.6, dur = 1, dest = v.out, detune = 3 } = o;
  const f = o.f ?? mtof(o.midi);
  const peak = 0.11 * (0.25 + vel * vel * 1.1);
  const ring = Math.max(0.9, 3.6 - Math.log2(f / 110) * 0.75) * (0.75 + vel * 0.4);
  const off = t + Math.min(dur, ring * 1.6);
  const rel = 0.32;
  const amp = v.gain(0, dest);
  const p = amp.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + 0.006);
  p.exponentialRampToValueAtTime(peak * 0.45, t + 0.13);
  const sustained = peak * 0.45 * Math.exp(-Math.max(0, off - t - 0.13) / ring);
  p.exponentialRampToValueAtTime(Math.max(sustained, 1e-4), Math.max(off, t + 0.14));
  p.exponentialRampToValueAtTime(1e-4, Math.max(off, t + 0.14) + rel);
  p.linearRampToValueAtTime(0, Math.max(off, t + 0.14) + rel + 0.01);
  const end = Math.max(off, t + 0.14) + rel + 0.02;
  const felt = v.filter('lowpass', Math.min(7000, f * (2 + vel * 6)), 0.5, amp);
  felt.frequency.setValueAtTime(Math.min(7000, f * (2.5 + vel * 7)), t);
  felt.frequency.exponentialRampToValueAtTime(Math.max(f * 1.6, 260), t + 1.4);
  const wave = v.eng.waves.piano;
  const d = detune * rand(0.6, 1.2);
  v.osc(wave, f, t, end, felt).detune.value = d;
  v.osc(wave, f, t, end, felt).detune.value = -d;
  burst(v, { t, f: 260 + f * 0.4, q: 0.8, type: 'lowpass', d: 0.035, g: 0.06 * vel, dest, color: 'pink' });
  return end;
}

export function strings(v, o) {
  const { notes, t, dur, g = 0.05, dest = v.out, cutoff = 900, attack = 1.4, release = 2, spread = 7 } = o;
  const amp = v.gain(0, dest);
  const p = amp.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(g, t + attack);
  p.setValueAtTime(g, t + Math.max(attack, dur));
  p.linearRampToValueAtTime(0, t + Math.max(attack, dur) + release);
  const end = t + Math.max(attack, dur) + release + 0.02;
  const flt = v.filter('lowpass', cutoff, 0.6, amp);
  flt.frequency.setValueAtTime(cutoff * 0.55, t);
  flt.frequency.linearRampToValueAtTime(cutoff, t + attack * 1.2);
  const wave = v.eng.waves.warm;
  for (let i = 0; i < notes.length; i++) {
    const f = mtof(notes[i]);
    v.osc(wave, f, t, end, flt).detune.value = spread * rand(0.5, 1);
    v.osc(wave, f, t, end, flt).detune.value = -spread * rand(0.5, 1);
  }
  return end;
}

export function glassPad(v, o) {
  const { notes, t, dur, g = 0.04, dest = v.out, cutoff = 2400, attack = 2, release = 2.5 } = o;
  const amp = v.gain(0, dest);
  const p = amp.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(g, t + attack);
  p.setValueAtTime(g, t + Math.max(attack, dur));
  p.linearRampToValueAtTime(0, t + Math.max(attack, dur) + release);
  const end = t + Math.max(attack, dur) + release + 0.02;
  const flt = v.filter('lowpass', cutoff, 0.4, amp);
  for (let i = 0; i < notes.length; i++) {
    const f = mtof(notes[i]);
    const a1 = v.osc('triangle', f, t, end, flt);
    const a2 = v.osc('sine', f * 2, t, end, flt);
    a1.detune.value = 4;
    a2.detune.value = -4;
    if (o.mod) {
      v.mod(o.mod, a1.detune);
      v.mod(o.mod, a2.detune);
    }
  }
  return end;
}

export function pluck(v, o) {
  const { t, g = 0.08, d = 0.9, dest = v.out, bright = 1.6, ratio = 1 } = o;
  return fm(v, { t, f: o.f ?? mtof(o.midi), g, d, a: 0.003, ratio, index: bright, index1: 0.05, modDecay: 0.18, dest });
}

export function kick(v, o) {
  const { t, g = 0.4, dest = v.out } = o;
  tone(v, { t, f: 130, f1: 42, glide: 0.11, a: 0.002, d: 0.32, g, dest });
  burst(v, { t, f: 3200, type: 'highpass', d: 0.012, g: g * 0.12, dest });
}

export function hat(v, o) {
  const { t, g = 0.04, d = 0.035, dest = v.out, f = 8000 } = o;
  burst(v, { t, f, type: 'highpass', q: 0.7, d, g, dest });
}

export const VOWELS = {
  a: [800, 1250],
  e: [450, 1900],
  i: [320, 2300],
  o: [480, 860],
  u: [340, 760],
  y: [300, 1750],
};
const VOWEL_KEYS = 'aeiouy';

export function vowelOf(ch) {
  if (VOWELS[ch]) return VOWELS[ch];
  if ('éèêë'.includes(ch)) return VOWELS.e;
  if ('àâ'.includes(ch)) return VOWELS.a;
  if ('îï'.includes(ch)) return VOWELS.i;
  if ('ôö'.includes(ch)) return VOWELS.o;
  if ('ùûü'.includes(ch)) return VOWELS.u;
  return VOWELS[VOWEL_KEYS[(Math.random() * 6) | 0]];
}

export function formant(v, o) {
  const { t, f0, d = 0.09, g = 0.08, dest = v.out, vowel = VOWELS.a, source = 'sawtooth', q = 7, a = 0.012 } = o;
  const amp = v.gain(0, dest);
  const end = env(amp.gain, t, a, g, d);
  const f1 = v.filter('bandpass', vowel[0], q * 0.6, amp);
  const f2 = v.filter('bandpass', vowel[1], q, amp);
  const osc = v.osc(source, f0, t, end + 0.01);
  osc.connect(f1);
  osc.connect(f2);
  if (o.f0end) {
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(o.f0end, end);
  }
  return osc;
}

export function flute(v, o) {
  const { t, dur, g = 0.05, dest = v.out } = o;
  const f = o.f ?? mtof(o.midi);
  const amp = v.gain(0, dest);
  const p = amp.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(g, t + 0.07);
  p.setValueAtTime(g, t + dur);
  p.linearRampToValueAtTime(0, t + dur + 0.16);
  const end = t + dur + 0.18;
  const osc = v.osc(v.eng.waves.flute, f, t, end, amp);
  const vib = v.gain(0);
  v.osc('sine', 5.5, t, end, vib);
  vib.gain.setValueAtTime(0, t);
  vib.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(0.35, dur));
  vib.connect(osc.frequency);
  burst(v, { t, f: f * 2.2, q: 1.5, d: 0.07, g: g * 0.5, dest, color: 'pink' });
  burst(v, { t, f: f * 3, q: 0.8, a: 0.05, sustain: Math.max(0, dur - 0.1), d: 0.1, g: g * 0.12, dest, color: 'pink' });
  return end;
}

export function chip(v, o) {
  const { t, g = 0.05, d = 0.12, sustain = 0, dest = v.out, wave = 'pulse25' } = o;
  const f = o.f ?? mtof(o.midi);
  return tone(v, { t, f, g, d, sustain, a: 0.003, type: wave, dest });
}
