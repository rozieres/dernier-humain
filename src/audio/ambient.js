import { rand, lerp, expo, glideTo, clamp01 } from './engine.js';
import { tone, burst, formant, vowelOf } from './instruments.js';

export class Signal {
  constructor(eng) {
    this.eng = eng;
    this.value = 0;
    this.next = 0;
  }

  run(now, horizon, silent) {
    const s = this.value;
    if (s < 0.01) {
      this.next = 0;
      return;
    }
    if (this.next < now) this.next = now + 0.05;
    while (this.next < horizon) {
      if (!silent) this.click(this.next, s);
      const mean = 1.5 * Math.pow(1 - s, 2.2) + 0.075;
      this.next += Math.max(0.045, expo(mean) * 0.55 + mean * 0.45);
    }
  }

  click(t, s) {
    const v = this.eng.voice('sfx', this.eng.buses.sfx.in, 'signal');
    burst(v, { t, f: lerp(4200, 1600, s), q: 2, d: 0.008, g: 0.035 + 0.03 * s });
    tone(v, { t, f: lerp(2000, 880, s) * rand(0.985, 1.015), d: lerp(0.02, 0.1, s), g: 0.012 + 0.045 * s });
    v.commit();
  }
}

export class Air {
  constructor(eng) {
    this.eng = eng;
    this.v = null;
    this.quietSince = 0;
    this.gust = 1;
    this.gustAt = 0;
  }

  build(now) {
    const v = this.eng.voice('sfx', this.eng.amb);
    v.persistent = true;
    v.commit();
    v.out.gain.value = 1;
    this.windF = v.filter('bandpass', 500, 0.8);
    this.wind = v.gain(0, v.out);
    this.windF.connect(this.wind);
    v.noise('pink', now, null, this.windF);
    this.rushF = v.filter('highpass', 2500, 0.6);
    this.rush = v.gain(0, v.out);
    this.rushF.connect(this.rush);
    v.noise('white', now, null, this.rushF);
    this.riserF = v.filter('lowpass', 500, 2);
    this.riser = v.gain(0, v.out);
    this.riserF.connect(this.riser);
    this.riserOsc = v.osc('sawtooth', 90, now, null, this.riserF);
    v.osc('sawtooth', 90.7, now, null, this.riserF);
    this.v = v;
  }

  update(params, now) {
    const active = params.speed > 0.005 || params.altitude > 0.005 || params.glide > 0.005;
    this.quietSince = active ? 0 : this.quietSince || now;
    if (!active && !this.v) return;
    if (!this.v) this.build(now);
    this.apply(params, now);
  }

  apply({ speed, altitude, glide }, now) {
    const fast = Math.max(speed, glide);
    glideTo(this.wind.gain, clamp01(Math.max(altitude * 0.3, glide * 0.55, speed * 0.45)) * 0.5 * this.gust, now, 0.25);
    glideTo(this.windF.frequency, 300 + 1100 * fast + 250 * altitude, now, 0.3);
    glideTo(this.rush.gain, (glide * 0.05 + speed * 0.04) * this.gust, now, 0.2);
    glideTo(this.riser.gain, speed * 0.035, now, 0.2);
    glideTo(this.riserOsc.frequency, 70 + 240 * speed, now, 0.3);
    glideTo(this.riserF.frequency, 300 + 2600 * speed, now, 0.3);
  }

  run(now, params) {
    if (!this.v) return;
    if (this.quietSince) {
      if (now - this.quietSince > 2.5) {
        this.v.stop(0.1);
        this.v = null;
      }
      return;
    }
    if (now < this.gustAt) return;
    this.gustAt = now + rand(0.6, 1.8);
    this.gust = rand(0.75, 1.2);
    this.apply(params, now);
  }
}

const PAUSES = { ',': 0.13, ';': 0.16, ':': 0.15, '.': 0.24, '!': 0.24, '?': 0.24, '…': 0.3, '—': 0.16, '–': 0.14 };
const VOWEL_CHARS = /[aeiouyàâéèêëîïôöùûü]/i;

export function babble(eng, dest, text, pitch) {
  const sylls = [];
  let t = 0;
  const words = String(text).split(/(\s+|[,;:.!?…—–]+)/);
  const question = /\?\s*$/.test(text);
  const exclaim = /!\s*$/.test(text);
  for (const w of words) {
    if (!w || /^\s+$/.test(w)) {
      t += 0.035;
      continue;
    }
    if (/^[,;:.!?…—–]+$/.test(w)) {
      t += PAUSES[w[w.length - 1]] ?? 0.1;
      continue;
    }
    const lower = w.toLowerCase();
    const vowels = [];
    let prev = false;
    for (const ch of lower) {
      const isV = VOWEL_CHARS.test(ch);
      if (isV && !prev) vowels.push(ch);
      prev = isV;
    }
    const n = Math.max(1, Math.min(4, vowels.length || 1));
    for (let i = 0; i < n; i++) {
      const d = rand(0.055, 0.08);
      sylls.push({ t, d, ch: vowels[i] || 'a', stress: i === n - 1 });
      t += d + rand(0.012, 0.03);
    }
  }
  if (!sylls.length) return null;
  const natural = t;
  const maxLen = 2.4;
  if (natural > maxLen) {
    const keep = Math.ceil(sylls.length * (maxLen / natural) * 1.25);
    const stride = sylls.length / keep;
    const picked = [];
    for (let k = 0; k < keep; k++) picked.push(sylls[Math.floor(k * stride)]);
    const scale = maxLen / natural;
    sylls.length = 0;
    for (const s of picked) sylls.push({ ...s, t: s.t * scale });
  }
  const v = eng.voice('sfx', dest, 'voice');
  const base = 470 * pitch;
  const t0 = eng.ac.currentTime + 0.02;
  const last = sylls[sylls.length - 1].t || 1;
  const lp = v.filter('lowpass', 2600, 0.7, v.out);
  for (let i = 0; i < sylls.length; i++) {
    const s = sylls[i];
    const k = s.t / last;
    let f = base * (1.08 - 0.16 * k) * rand(0.94, 1.07);
    if (exclaim && k < 0.25) f *= 1.12;
    if (question && i >= sylls.length - 2) f *= 1.28;
    if (s.stress) f *= 1.04;
    const end = question && i === sylls.length - 1 ? f * 1.18 : f * rand(0.92, 1.03);
    formant(v, { t: t0 + s.t, f0: f, f0end: end, vowel: vowelOf(s.ch), source: 'triangle', d: s.d, a: 0.01, g: 0.07, q: 3.5, dest: lp });
    tone(v, { t: t0 + s.t, f, f1: end, d: s.d * 0.8, a: 0.008, g: 0.018, dest: lp });
  }
  v.commit();
  return v;
}
