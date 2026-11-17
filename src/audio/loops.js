import { rand, pick, chance, expo, glideTo, mtof } from './engine.js';
import { tone, burst, fm, formant, chip, hat, VOWELS } from './instruments.js';
import { Performer } from './music.js';

const VOWEL_LIST = Object.values(VOWELS);

function events(L, rate, fn) {
  return (now, h) => {
    if (L.nextEvt < now) L.nextEvt = now + expo(1 / rate);
    while (L.nextEvt < h) {
      const v = L.eng.voice('loop', L.in);
      fn(v, L.nextEvt);
      v.commit();
      L.nextEvt += expo(1 / rate);
    }
  };
}

function every(L, key, min, max, now, fn) {
  if (L[key] === undefined || L[key] < now) {
    if (L[key] !== undefined) fn(now);
    L[key] = now + rand(min, max);
  }
}

function noiseBand(L, color, type, f, q, g) {
  const flt = L.v.filter(type, f, q);
  const gain = L.v.gain(g, L.in);
  flt.connect(gain);
  L.v.noise(color, L.t, null, flt);
  return { flt, gain };
}

export const LOOPS = {
  wind(L) {
    const a = noiseBand(L, 'pink', 'bandpass', 420, 0.9, 0.55);
    const b = noiseBand(L, 'white', 'bandpass', 2400, 6, 0.012);
    let p = 1;
    return {
      pitch(x) {
        p = x;
      },
      tick(now) {
        every(L, 'gust', 1.2, 3.8, now, (t) => {
          glideTo(a.flt.frequency, rand(260, 900) * p, t, 1.1);
          glideTo(a.gain.gain, rand(0.35, 0.95), t, 1.4);
          glideTo(b.flt.frequency, rand(1500, 3200) * p, t, 1.5);
          glideTo(b.gain.gain, rand(0.002, 0.018), t, 1.2);
        });
      },
    };
  },

  sea(L) {
    const v = L.v;
    const lfo = v.gain(1);
    const swell = v.osc('sine', 0.09, L.t, null, lfo);
    const body = noiseBand(L, 'brown', 'lowpass', 480, 0.6, 0.2);
    const depth = v.gain(0.14);
    lfo.connect(depth);
    depth.connect(body.gain.gain);
    const foam = noiseBand(L, 'pink', 'bandpass', 3200, 0.5, 0.02);
    const lag = v.delay(2.4, 4);
    lfo.connect(lag);
    const fd = v.gain(0.02);
    lag.connect(fd);
    fd.connect(foam.gain.gain);
    const crash = events(L, 1 / 7, (cv, t) => {
      burst(cv, { t, color: 'pink', type: 'bandpass', q: 0.5, f: 1600, f1: 600, glide: 2.5, a: 1.2, d: 1.8, g: 0.06 });
      burst(cv, { t: t + 0.4, color: 'brown', type: 'lowpass', f: 300, a: 0.8, d: 1.6, g: 0.07 });
    });
    return {
      pitch(x) {
        glideTo(body.flt.frequency, 480 * x, L.eng.ac.currentTime, 0.5);
      },
      tick(now, h) {
        crash(now, h);
        every(L, 'drift', 8, 14, now, (t) => glideTo(swell.frequency, rand(0.07, 0.12), t, 4));
      },
    };
  },

  fire(L) {
    const rumble = noiseBand(L, 'brown', 'lowpass', 260, 0.7, 0.4);
    const hiss = noiseBand(L, 'pink', 'bandpass', 1300, 0.5, 0.05);
    const crackle = events(L, 7, (cv, t) => {
      if (chance(0.12)) tone(cv, { t, f: rand(500, 800), f1: 180, glide: 0.03, d: 0.03, g: 0.05 });
      else burst(cv, { t, f: rand(1800, 5200), q: rand(1, 4), d: rand(0.003, 0.014), g: rand(0.03, 0.14) });
    });
    return {
      tick(now, h) {
        crackle(now, h);
        every(L, 'flick', 0.1, 0.35, now, (t) => {
          glideTo(hiss.gain.gain, rand(0.02, 0.08), t, 0.08);
          glideTo(rumble.gain.gain, rand(0.3, 0.5), t, 0.3);
        });
      },
    };
  },

  crt(L) {
    const v = L.v;
    const whine = v.gain(0.0008, L.in);
    const w = v.osc('sine', 15625, L.t, null, whine);
    const humLp = v.filter('lowpass', 380, 0.8);
    const hum = v.gain(0.05, L.in);
    humLp.connect(hum);
    v.osc('sawtooth', 50, L.t, null, humLp);
    v.osc('sine', 100, L.t, null, hum).detune.value = 3;
    const stat = noiseBand(L, 'white', 'bandpass', 5500, 0.8, 0.006);
    return {
      pitch(x) {
        w.frequency.value = 15625 * x;
      },
      tick(now) {
        every(L, 'flick', 0.3, 2, now, (t) => glideTo(stat.gain.gain, rand(0.002, 0.012), t, 0.05));
      },
    };
  },

  server(L) {
    const v = L.v;
    noiseBand(L, 'pink', 'lowpass', 1100, 0.6, 0.17);
    const tonal = v.filter('bandpass', 240, 4);
    const tg = v.gain(0.045, L.in);
    tonal.connect(tg);
    const fanOsc = v.osc('sawtooth', 120, L.t, null, tonal);
    const seek = events(L, 1.6, (cv, t) => {
      const n = 2 + ((Math.random() * 5) | 0);
      for (let i = 0; i < n; i++) burst(cv, { t: t + i * rand(0.025, 0.06), f: rand(2500, 4500), q: 2, d: 0.004, g: 0.06 });
      if (chance(0.06)) tone(cv, { t: t + 0.3, f: 2000, d: 0.03, g: 0.01 });
    });
    return {
      pitch(x) {
        fanOsc.frequency.value = 120 * x;
      },
      tick: seek,
    };
  },

  drone(L) {
    const v = L.v;
    const bp = v.filter('bandpass', 900, 0.9);
    const lp = v.filter('lowpass', 3200, 0.7);
    const g = v.gain(0.06, L.in);
    bp.connect(lp);
    lp.connect(g);
    const base = [171, 174, 179, 183];
    const rotors = base.map((f) => v.osc('sawtooth', f, L.t, null, bp));
    let p = 1;
    return {
      pitch(x) {
        p = x;
      },
      tick(now) {
        every(L, 'thrust', 0.4, 1.4, now, (t) => {
          const k = rand(0.94, 1.08) * p;
          for (let i = 0; i < rotors.length; i++) glideTo(rotors[i].frequency, base[i] * k * rand(0.995, 1.005), t, 0.25);
        });
      },
    };
  },

  crawler(L) {
    const v = L.v;
    const lowLp = v.filter('lowpass', 320, 1.5);
    const low = v.gain(0.12, L.in);
    lowLp.connect(low);
    v.osc('sawtooth', 55, L.t, null, lowLp);
    v.osc('sawtooth', 58.3, L.t, null, lowLp);
    const sweep = noiseBand(L, 'pink', 'bandpass', 500, 14, 0.5);
    let up = true;
    const whoop = events(L, 1 / 6, (cv, t) => tone(cv, { t, f: 380, f1: 920, glide: 1.6, a: 0.6, d: 1.2, g: 0.025, type: 'triangle' }));
    return {
      tick(now, h) {
        whoop(now, h);
        every(L, 'sweep', 3.5, 5, now, (t) => {
          glideTo(sweep.flt.frequency, up ? rand(1400, 2000) : rand(260, 420), t, 1.4);
          up = !up;
        });
      },
    };
  },

  harvester(L) {
    const v = L.v;
    const whineBp = v.filter('bandpass', 900, 4);
    const whine = v.gain(0.025, L.in);
    whineBp.connect(whine);
    const gear = v.osc('sawtooth', 420, L.t, null, whineBp);
    let beat = 0;
    let p = 1;
    const chug = (now, h) => {
      if (L.nextEvt < now) L.nextEvt = now + 0.05;
      while (L.nextEvt < h) {
        const t = L.nextEvt;
        const accent = beat++ % 4 === 0;
        const cv = L.eng.voice('loop', L.in);
        tone(cv, { t, f: (accent ? 64 : 58) * p, f1: 38, d: 0.1, g: accent ? 0.22 : 0.14 });
        burst(cv, { t, f: 900, type: 'lowpass', d: 0.06, g: 0.09, color: 'brown' });
        if (accent) fm(cv, { t: t + 0.06, f: 300 * p, ratio: 2.4, index: 2, d: 0.08, g: 0.02 });
        cv.commit();
        L.nextEvt += 0.24 / p;
      }
    };
    return {
      pitch(x) {
        p = x;
        gear.frequency.value = 420 * x;
      },
      tick(now, h) {
        chug(now, h);
        every(L, 'hiss', 3, 6, now, (t) => {
          const cv = L.eng.voice('loop', L.in);
          burst(cv, { t, f: 2200, q: 0.7, color: 'pink', a: 0.05, sustain: 0.3, d: 0.4, g: 0.02 });
          cv.commit();
        });
      },
    };
  },

  fan(L) {
    const v = L.v;
    const air = noiseBand(L, 'pink', 'lowpass', 900, 0.6, 0.3);
    const blade = v.gain(0.06, L.in);
    const trem = v.gain(0.03);
    trem.connect(blade.gain);
    const rate = v.osc('sine', 12, L.t, null, trem);
    const hum = v.osc('sine', 95, L.t, null, blade);
    return {
      pitch(x) {
        rate.frequency.value = 12 * x;
        hum.frequency.value = 95 * x;
      },
      tick(now) {
        every(L, 'drift', 2, 5, now, (t) => glideTo(air.flt.frequency, rand(700, 1100), t, 1));
      },
    };
  },

  'feed.chatter'(L) {
    noiseBand(L, 'pink', 'lowpass', 700, 0.6, 0.04);
    const lp = L.v.filter('lowpass', 3400, 0.7);
    const g = L.v.gain(4.5, L.in);
    lp.connect(g);
    const babble = (now, h) => {
      if (L.nextEvt < now) L.nextEvt = now + 0.02;
      while (L.nextEvt < h) {
        const t = L.nextEvt;
        const cv = L.eng.voice('loop', lp);
        const f0 = pick([170, 205, 240, 290, 320]) * rand(0.97, 1.03);
        formant(cv, { t, f0, f0end: f0 * rand(0.9, 1.12), vowel: pick(VOWEL_LIST), d: rand(0.05, 0.11), g: rand(0.025, 0.06), q: 6 });
        if (chance(0.015)) {
          tone(cv, { t, f: 1320, d: 0.12, g: 0.012 });
          tone(cv, { t: t + 0.09, f: 1760, d: 0.18, g: 0.012 });
        }
        cv.commit();
        L.nextEvt += expo(1 / 16);
      }
    };
    return { tick: babble };
  },

  'cabin.murmur'(L) {
    const v = L.v;
    const wall = v.filter('lowpass', 480, 0.7);
    const wg = v.gain(3.2, L.in);
    wall.connect(wg);
    noiseBand(L, 'brown', 'lowpass', 180, 0.6, 0.05);
    const speakers = [118, 185, 228];
    const phrase = (t) => {
      const cv = L.eng.voice('loop', wall);
      const f = pick(speakers) * rand(0.95, 1.05);
      const laugh = chance(0.12);
      const n = laugh ? 5 + ((Math.random() * 3) | 0) : 3 + ((Math.random() * 8) | 0);
      let at = t;
      for (let i = 0; i < n; i++) {
        const k = i / n;
        const f0 = laugh ? f * (1.5 - k * 0.5) : f * (1.12 - k * 0.22) * rand(0.94, 1.08);
        const d = laugh ? 0.08 : rand(0.1, 0.2);
        formant(cv, { t: at, f0, f0end: f0 * rand(0.9, 1.05), vowel: laugh ? VOWELS.a : pick(VOWEL_LIST), d, a: 0.025, g: laugh ? 0.13 : 0.1, q: 4 });
        at += d + (laugh ? 0.05 : rand(0.03, 0.09));
      }
      cv.commit();
      return at - t;
    };
    const strum = (t) => {
      const cv = L.eng.voice('loop', wall);
      const root = pick([43, 45, 50, 47]);
      const shape = [0, 7, 12, 16, 19];
      for (let i = 0; i < shape.length; i++) {
        const at = t + i * rand(0.02, 0.04);
        const lp = cv.filter('lowpass', 2400, 1, cv.out);
        lp.frequency.setValueAtTime(2400, at);
        lp.frequency.exponentialRampToValueAtTime(300, at + 0.4);
        tone(cv, { t: at, f: mtof(root + shape[i]), type: 'sawtooth', a: 0.003, d: 1.3, g: 0.05, dest: lp });
      }
      cv.commit();
    };
    return {
      tick(now, h) {
        if (L.nextEvt < now) L.nextEvt = now + 0.3;
        while (L.nextEvt < h) {
          const len = phrase(L.nextEvt);
          L.nextEvt += len + rand(0.15, 1.6);
        }
        if (L.strum === undefined || L.strum < now) {
          if (L.strum !== undefined) strum(L.strum);
          L.strum = (L.strum === undefined ? now : L.strum) + rand(6, 15);
          if (L.strum < now) L.strum = now + rand(6, 15);
        }
      },
    };
  },

  'radio.theme'(L) {
    const v = L.v;
    const hp = v.filter('highpass', 420, 0.7);
    const peak = v.filter('peaking', 1300, 1.2);
    peak.gain.value = 6;
    const lp = v.filter('lowpass', 2900, 0.9);
    const sat = v.shaper(L.eng.curves.soft);
    const g = v.gain(0.5, L.in);
    hp.connect(peak);
    peak.connect(lp);
    lp.connect(sat);
    sat.connect(g);
    const hiss = noiseBand(L, 'white', 'bandpass', 3200, 0.5, 0.01);
    const perf = new Performer(L.eng, v.gain(1, hp), () => 'radio', 'loop');
    const crack = events(L, 1.5, (cv, t) => burst(cv, { t, f: rand(1500, 4000), q: 2, d: 0.004, g: rand(0.01, 0.04) }));
    return {
      tick(now, h) {
        perf.run(now, h, false);
        crack(now, h);
        every(L, 'fade', 2, 5, now, (t) => glideTo(hiss.gain.gain, rand(0.005, 0.014), t, 0.6));
      },
    };
  },

  midi(L) {
    const v = L.v;
    const lp = v.filter('lowpass', 4800, 0.6);
    const g = v.gain(1, L.in);
    lp.connect(g);
    const LEAD = [
      [67, 71, 74, 79, 78, 74, 71, 74],
      [76, 0, 74, 71, 67, 0, 71, 74],
      [72, 76, 79, 76, 72, 76, 79, 84],
      [83, 0, 81, 0, 78, 76, 74, 0],
      [79, 0, 78, 79, 83, 79, 76, 74],
      [76, 74, 71, 74, 76, 0, 79, 0],
      [81, 79, 76, 72, 74, 76, 78, 81],
      [79, 0, 0, 0, 67, 0, 0, 0],
    ];
    const ROOTS = [43, 40, 48, 50, 43, 40, 48, 50];
    const eighth = 60 / 120 / 2;
    let i = 0;
    return {
      tick(now, h) {
        if (L.nextEvt < now) L.nextEvt = now + 0.05;
        while (L.nextEvt < h) {
          const t = L.nextEvt;
          const bar = ((i / 8) | 0) % 8;
          const s = i % 8;
          const cv = L.eng.voice('loop', lp);
          const n = LEAD[bar][s];
          if (n) chip(cv, { t, midi: n, wave: 'pulse25', sustain: eighth * 0.55, d: 0.08, g: 0.035 });
          chip(cv, { t, midi: ROOTS[bar] + (s % 2 ? 12 : 0), wave: 'triangle', sustain: eighth * 0.4, d: 0.05, g: 0.09 });
          hat(cv, { t, g: s % 2 ? 0.01 : 0.006 });
          if (s === 2 || s === 6) burst(cv, { t, f: 1800, q: 1, d: 0.07, g: 0.025 });
          cv.commit();
          i++;
          L.nextEvt += eighth;
        }
      },
    };
  },
};

export const LOOP_NAMES = Object.keys(LOOPS);
