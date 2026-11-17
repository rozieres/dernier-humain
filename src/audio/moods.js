import { rand, pick, chance, weighted, smooth, glideTo, mtof } from './engine.js';
import { tone, burst, fm, bell, musicBox, pluck, glassPad, strings, kick, hat, flute, chip } from './instruments.js';
import { THEME } from './theme.js';

const PENTA = [64, 66, 69, 71, 74, 76, 78, 81, 83, 86];
const WHOLE = [64, 66, 68, 70, 72, 74, 76, 78, 80, 82, 84];

const HUB_CHORDS = {
  D: { bass: 38, pad: [62, 66, 69, 76], tones: [62, 66, 69] },
  Bm: { bass: 35, pad: [59, 62, 66, 69], tones: [59, 62, 66] },
  G: { bass: 43, pad: [55, 59, 62, 66], tones: [55, 59, 62] },
  Em: { bass: 40, pad: [52, 59, 62, 67], tones: [52, 55, 59] },
  A: { bass: 45, pad: [57, 62, 64, 69], tones: [57, 62, 64] },
};
const HUB_NEXT = {
  D: [['Bm', 3], ['G', 3], ['Em', 1]],
  Bm: [['G', 4], ['Em', 1], ['A', 1]],
  G: [['D', 2], ['A', 3], ['Em', 1]],
  Em: [['A', 2], ['G', 2]],
  A: [['D', 3], ['Bm', 2]],
};

function pentaWeights(chord) {
  const pcs = chord.tones.map((m) => m % 12);
  return PENTA.map((m) => [m, pcs.includes(m % 12) ? 3 : 1]);
}

function heavenly(wrong) {
  return {
    bpm: wrong ? 66 : 72,
    level: 0.9,
    verb: wrong ? 0.75 : 0.55,
    delay: 0.22,
    start(m, t) {
      m.pads = m.layer(1);
      m.bassL = m.layer(0.9);
      m.plucks = m.layer(1);
      m.bells = m.layer(0.6);
      m.chordName = 'D';
      m.shift = 0;
      m.lastNote = 0;
      if (wrong) {
        m.wobble = m.bed.gain(28);
        m.bed.osc('sine', 0.19, t, null, m.wobble);
      }
    },
    step(m, t, i) {
      const stepDur = m.stepDur;
      if (i % 32 === 0) {
        if (i > 0) m.chordName = weighted(HUB_NEXT[m.chordName]);
        if (wrong && chance(0.5)) m.shift = Math.max(-4, Math.min(4, m.shift + pick([-2, 2])));
        const c = HUB_CHORDS[m.chordName];
        m.weights = pentaWeights(c);
        const sh = wrong ? m.shift : 0;
        const dur = stepDur * 32;
        m.note(m.pads, (v) => {
          glassPad(v, { notes: c.pad.map((n) => n + sh), t, dur: dur + 0.8, g: 0.03, attack: 2.2, release: 3, cutoff: 2200 - m.night * 900, mod: wrong ? m.wobble : null });
        });
        m.note(m.bassL, (v) => {
          tone(v, { t, midi: c.bass + 12 + sh, a: 1.5, sustain: dur - 2, d: 2.2, g: 0.07 });
        });
        if (wrong && chance(0.45)) {
          m.note(m.plucks, (v) => {
            const car = pluck(v, { t: t + stepDur * 6, midi: c.bass + 12 + 6 + 24 + sh, g: 0.05, d: 1.4, bright: 1.2 });
            car.detune.setValueAtTime(0, t + stepDur * 6);
            car.detune.linearRampToValueAtTime(rand(-80, 80), t + stepDur * 6 + 1.2);
          });
        }
      }
      if (i % 2 === 0 && chance(0.24 - m.night * 0.08)) {
        let midi = weighted(m.weights);
        if (midi === m.lastNote) midi = weighted(m.weights);
        if (wrong && chance(0.5)) midi = pick(WHOLE);
        if (m.night > 0.4 && chance(0.6)) midi -= 12;
        m.lastNote = midi;
        const sh = wrong ? m.shift : 0;
        m.note(m.plucks, (v) => {
          const car = pluck(v, { t, midi: midi + sh, g: 0.055, d: 1.1, bright: 1.3 });
          if (wrong) {
            car.detune.setValueAtTime(0, t);
            car.detune.linearRampToValueAtTime(rand(-55, 55), t + 0.9);
          }
        });
      }
      if (i % 4 === 0 && chance(0.03)) {
        m.note(m.bells, (v) => bell(v, { t, midi: pick([86, 88, 90, 93]) + (wrong ? pick([1, 6]) : 0), d: 3, g: 0.016 }));
      }
    },
  };
}

const FEED_CHORDS = [
  { bass: 38, tones: [62, 66, 69], pad: [62, 66, 69, 74] },
  { bass: 45, tones: [61, 64, 69], pad: [61, 64, 69, 73] },
  { bass: 47, tones: [62, 66, 71], pad: [59, 62, 66, 71] },
  { bass: 43, tones: [62, 67, 71], pad: [59, 62, 67, 71] },
];

const feed = {
  bpm: 118,
  level: 0.75,
  verb: 0.25,
  delay: 0.18,
  start(m, t) {
    m.lp = m.bed.filter('lowpass', 16000, 0.9, m.mix);
    m.pump = m.bed.gain(1, m.lp);
    m.kickL = m.layer(1, m.lp);
    m.bassL = m.layer(1, m.pump);
    m.stab = m.layer(1, m.pump);
    m.arp = m.layer(1, m.pump);
    m.sparkle = m.layer(1, m.lp);
    m.box = m.layer(0, m.mix);
    m.boxIndex = 0;
    m.boxNext = 0;
    this.param(m, 'depth', m.params.depth, t, true);
  },
  param(m, name, value, now, instant) {
    if (name !== 'depth') return;
    const d = value;
    const tau = instant ? 0.01 : 0.35;
    m.gains = {
      sparkle: 1 - smooth(0.05, 0.2, d),
      kick: 1 - smooth(0.2, 0.35, d),
      arp: 1 - smooth(0.38, 0.55, d),
      bass: 1 - smooth(0.58, 0.75, d),
      stab: 1 - smooth(0.78, 0.92, d),
      box: smooth(0.82, 1, d),
    };
    glideTo(m.sparkle.gain, m.gains.sparkle, now, tau);
    glideTo(m.kickL.gain, m.gains.kick, now, tau);
    glideTo(m.arp.gain, m.gains.arp, now, tau);
    glideTo(m.bassL.gain, m.gains.bass, now, tau);
    glideTo(m.stab.gain, m.gains.stab, now, tau);
    glideTo(m.box.gain, m.gains.box * 1.6, now, tau);
    glideTo(m.lp.frequency, 280 + 15000 * Math.pow(1 - d, 2.6), now, tau);
    glideTo(m.verbSend.gain, 0.25 + 0.7 * d, now, tau);
  },
  step(m, t, i) {
    const s = i % 16;
    const chord = FEED_CHORDS[((i / 16) | 0) % 4];
    const g = m.gains;
    if (s % 4 === 0) {
      const p = m.pump.gain;
      p.setValueAtTime(0.35, t);
      p.setTargetAtTime(1, t + 0.012, 0.075);
      if (g.kick > 0.01) m.note(m.kickL, (v) => kick(v, { t, g: 0.26 }));
    }
    if (s % 4 === 2 && g.bass > 0.01) {
      m.note(m.bassL, (v) => tone(v, { t, midi: chord.bass, type: 'glossy', a: 0.005, d: 0.22, g: 0.13 }));
    }
    if (s === 0 && g.stab > 0.01) {
      m.note(m.stab, (v) => glassPad(v, { notes: chord.pad, t, dur: m.stepDur * 14, g: 0.026, attack: 0.03, release: 0.4, cutoff: 3600 }));
    }
    if (g.arp > 0.01) {
      const idx = s % 8;
      const oct = idx >= 4 ? 12 : 0;
      const midi = chord.tones[idx % 3] + 12 + oct + (idx % 4 === 3 ? 12 : 0);
      m.note(m.arp, (v) => tone(v, { t, midi, type: 'glossy', a: 0.003, d: 0.14, g: 0.03 }));
    }
    if (g.sparkle > 0.01 && s % 2 === 1 && chance(0.32)) {
      m.note(m.sparkle, (v) => fm(v, { t, midi: pick(chord.tones) + 36, ratio: 3, index: 0.8, d: 0.35, g: 0.016 }));
    }
    if (g.box > 0.01 && i >= m.boxNext) {
      const flat = BOX_NOTES;
      if (m.boxIndex >= flat.length) {
        m.boxIndex = 0;
        m.boxNext = i + 48;
        return;
      }
      const [midi, len] = flat[m.boxIndex++];
      m.note(m.box, (v) => musicBox(v, { t: t + rand(0, 0.03), midi: midi + 12, g: 0.05, d: 2.2 }));
      m.boxNext = i + Math.round(len * 7 * rand(0.95, 1.1));
    }
  },
};

const BOX_NOTES = THEME.slice(0, 4).flatMap((bar) => bar.mel);

const FARM_OSTI = [74, 69, 78, 69, 76, 69, 81];
const FARM_LOW = [50, 57, 50, 55, 57];
const FLUTE_PHRASES = [
  [[0, 2], [2, 1], [4, 1], [7, 4]],
  [[7, 2], [9, 1], [7, 1], [4, 2], [2, 2]],
  [[4, 1], [7, 1], [9, 2], [7, 1], [4, 1], [2, 2]],
  [[12, 3], [11, 1], [9, 2], [7, 2]],
  [[0, 1], [2, 1], [4, 2], [2, 1], [0, 3]],
];

const farm = {
  bpm: 104,
  level: 1.9,
  verb: 0.3,
  delay: 0.1,
  start(m, t) {
    m.osti = m.layer(1);
    m.low = m.layer(1);
    m.fl = m.layer(1);
    const drone = m.bed.gain(0, m.mix);
    drone.gain.setValueAtTime(0, t);
    drone.gain.linearRampToValueAtTime(0.022, t + 3);
    const lp = m.bed.filter('lowpass', 520, 0.7, drone);
    m.bed.osc(m.eng.waves.reed, mtof(38), t, null, lp);
    m.bed.osc(m.eng.waves.reed, mtof(45), t, null, lp).detune.value = 3;
  },
  step(m, t, i) {
    if (i % 2 === 0) {
      const k = (i / 2) % 7;
      m.note(m.osti, (v) => fm(v, { t, midi: FARM_OSTI[k], ratio: 3.5, index: 1.3, index1: 0.1, modDecay: 0.05, d: 0.2, g: 0.04 }));
    }
    if (i % 3 === 0) {
      const k = (i / 3) % 5;
      m.note(m.low, (v) => pluck(v, { t, midi: FARM_LOW[k], g: 0.07, d: 0.45, bright: 0.9 }));
    }
    if (i % 32 === 8 && chance(0.6)) {
      const phrase = pick(FLUTE_PHRASES);
      const eighth = m.stepDur * 2;
      let at = t;
      for (const [deg, len] of phrase) {
        const start = at;
        m.note(m.fl, (v) => flute(v, { t: start, midi: 74 + deg, dur: len * eighth * 0.92, g: 0.04 }));
        at += len * eighth;
      }
    }
  },
};

const OLD_CHORDS = [
  { root: 38, tones: [74, 78, 81, 86] },
  { root: 35, tones: [71, 74, 78, 83] },
  { root: 43, tones: [71, 74, 79, 83] },
  { root: 45, tones: [69, 73, 76, 81] },
];
const D_MAJOR = [69, 71, 73, 74, 76, 78, 79, 81, 83, 85, 86];

const oldweb = {
  bpm: 112,
  level: 3.6,
  verb: 0.18,
  delay: 0.12,
  start(m) {
    const lp = m.bed.filter('lowpass', 5200, 0.6, m.mix);
    m.bassL = m.layer(1, lp);
    m.arp = m.layer(1, lp);
    m.lead = m.layer(1, lp);
    m.drums = m.layer(1, lp);
    m.leadIdx = 6;
  },
  step(m, t, i) {
    const s = i % 16;
    const bar = (i / 16) | 0;
    const chord = OLD_CHORDS[bar % 4];
    if (s % 2 === 0) {
      const midi = chord.root + (s % 4 === 0 ? 12 : 24);
      m.note(m.bassL, (v) => chip(v, { t, midi, wave: 'triangle', d: 0.14, g: 0.11 }));
      m.note(m.drums, (v) => hat(v, { t, g: s % 4 === 2 ? 0.012 : 0.007, d: 0.025 }));
    }
    if (s === 4 || s === 12) m.note(m.drums, (v) => burst(v, { t, f: 1700, q: 0.9, d: 0.09, g: 0.03 }));
    if (s === 0 || s === 10) m.note(m.drums, (v) => tone(v, { t, f: 110, f1: 50, glide: 0.08, d: 0.14, g: 0.09, type: 'triangle' }));
    m.note(m.arp, (v) => chip(v, { t, midi: chord.tones[s % 4] - 12, wave: 'pulse25', d: 0.07, g: 0.011 }));
    if (bar % 4 < 2 && s % 2 === 0 && chance(0.7)) {
      const step = weighted([[-2, 1], [-1, 3], [0, 1], [1, 3], [2, 1]]);
      m.leadIdx = Math.max(0, Math.min(D_MAJOR.length - 1, m.leadIdx + step));
      const midi = D_MAJOR[m.leadIdx];
      const len = chance(0.3) ? 4 : 2;
      m.note(m.lead, (v) => chip(v, { t, midi, wave: 'pulse12', sustain: m.stepDur * len * 0.6, d: 0.1, g: 0.022 }));
    }
  },
};

const forest = {
  bpm: 60,
  level: 1,
  human: true,
  verb: 0.6,
  delay: 0,
  start(m, t) {
    const b = m.bed;
    const droneLp = b.filter('lowpass', 150, 1.6, m.mix);
    const lfo = b.gain(55);
    b.osc('sine', 0.045, t, null, lfo);
    b.mod(lfo, droneLp.frequency);
    const dg = b.gain(0, droneLp);
    dg.gain.setValueAtTime(0, t);
    dg.gain.linearRampToValueAtTime(0.06, t + 4);
    b.osc('sawtooth', mtof(26), t, null, dg).detune.value = -4;
    b.osc('sawtooth', mtof(33), t, null, dg).detune.value = 5;
    b.osc('sine', mtof(38), t, null, dg);
    m.windF = b.filter('bandpass', 420, 0.8);
    m.windG = b.gain(0.05, m.mix);
    m.windF.connect(m.windG);
    b.noise('pink', t, null, m.windF);
    m.far = b.filter('lowpass', 1500, 0.7, m.mix);
    m.farSend = b.gain(0.8, m.verbSend);
    m.far.connect(m.farSend);
    m.tension = b.gain(0, m.mix);
    m.tensionOsc = b.osc('triangle', 196, t, null, m.tension);
    b.osc('triangle', 203, t, null, m.tension);
    m.pulse = m.layer(1);
    m.pulseNext = 0;
    this.param(m, 'danger', m.params.danger, t, true);
  },
  param(m, name, value, now, instant) {
    if (name !== 'danger') return;
    glideTo(m.tension.gain, value * value * 0.012, now, instant ? 0.01 : 0.5);
    glideTo(m.tensionOsc.frequency, 196 + 70 * value, now, 0.8);
  },
  step(m, t, i) {
    if (i % 16 === 0 && chance(0.5)) {
      glideTo(m.windF.frequency, rand(260, 750), t, 1.4);
      glideTo(m.windG.gain, rand(0.025, 0.08), t, 1.8);
    }
    if (chance(0.022)) {
      const kind = weighted([['bird', 3], ['owl', 1], ['creak', 1]]);
      m.note(m.far, (v) => {
        if (kind === 'bird') {
          const f = rand(2200, 3400);
          const n = 2 + ((Math.random() * 3) | 0);
          for (let k = 0; k < n; k++) tone(v, { t: t + k * rand(0.11, 0.16), f, f1: f * rand(1.15, 1.35), glide: 0.06, a: 0.01, d: 0.07, g: 0.012 });
        } else if (kind === 'owl') {
          tone(v, { t, f: 390, f1: 360, a: 0.06, d: 0.35, g: 0.03 });
          tone(v, { t: t + 0.55, f: 380, f1: 330, a: 0.06, d: 0.5, g: 0.025 });
        } else {
          const o = tone(v, { t, f: 90, type: 'sawtooth', a: 0.15, sustain: 0.4, d: 0.3, g: 0.012 });
          o.frequency.linearRampToValueAtTime(rand(70, 130), t + 0.8);
        }
      });
    }
    const danger = m.params.danger;
    if (danger > 0.02) {
      if (m.pulseNext < t) m.pulseNext = t;
      while (m.pulseNext < t + m.stepDur) {
        const at = m.pulseNext;
        const g = 0.05 + danger * 0.16;
        m.note(m.pulse, (v) => {
          tone(v, { t: at, f: 58, f1: 44, d: 0.2, g });
          tone(v, { t: at + 0.24, f: 54, f1: 42, d: 0.24, g: g * 0.6 });
          if (danger > 0.55) burst(v, { t: at, f: 2400, q: 3, d: 0.02, g: 0.01 * danger });
        });
        m.pulseNext += 60 / (46 + 76 * danger);
      }
    }
  },
};

const lighthouse = {
  bpm: 60,
  level: 1,
  human: true,
  verb: 0.35,
  delay: 0,
  start(m, t) {
    const b = m.bed;
    const lfo = b.gain(1);
    m.swell = b.osc('sine', 0.085, t, null, lfo);
    const seaLp = b.filter('lowpass', 420, 0.7, m.mix);
    const sea = b.gain(0.11, seaLp);
    const seaDepth = b.gain(0.07);
    lfo.connect(seaDepth);
    seaDepth.connect(sea.gain);
    b.noise('brown', t, null, sea);
    const foamHp = b.filter('highpass', 2600, 0.6, m.mix);
    const foam = b.gain(0.004, foamHp);
    const lag = b.delay(2.2, 3);
    lfo.connect(lag);
    const foamDepth = b.gain(0.004, foam.gain);
    lag.connect(foamDepth);
    b.noise('white', t, null, foam);
    m.windF = b.filter('bandpass', 650, 0.6);
    m.windG = b.gain(0.025, m.mix);
    m.windF.connect(m.windG);
    b.noise('pink', t, null, m.windF);
    const warm = b.gain(0, m.mix);
    warm.gain.setValueAtTime(0, t);
    warm.gain.linearRampToValueAtTime(0.018, t + 6);
    b.osc('sine', mtof(38), t, null, warm);
    b.osc('sine', mtof(45), t, null, warm).detune.value = 2;
  },
  step(m, t, i) {
    if (i % 24 === 0) {
      glideTo(m.windF.frequency, rand(450, 900), t, 2);
      glideTo(m.windG.gain, rand(0.012, 0.035), t, 2.5);
      glideTo(m.swell.frequency, rand(0.07, 0.11), t, 4);
    }
  },
};

const TITLE_CHORDS = [
  [50, 57, 62, 66, 69, 76],
  [47, 54, 59, 62, 64, 71],
  [43, 55, 59, 62, 66, 74],
  [45, 57, 61, 64, 69, 76],
];

const title = {
  bpm: 60,
  level: 1,
  human: true,
  verb: 0.6,
  delay: 0,
  start(m, t) {
    m.pads = m.layer(1);
    m.chord = 0;
    const air = m.bed.filter('lowpass', 700, 0.5);
    const ag = m.bed.gain(0, m.mix);
    ag.gain.setValueAtTime(0, t);
    ag.gain.linearRampToValueAtTime(0.03, t + 5);
    air.connect(ag);
    m.bed.noise('pink', t, null, air);
  },
  step(m, t, i) {
    if (i % 56 === 0) {
      const notes = TITLE_CHORDS[m.chord++ % TITLE_CHORDS.length];
      m.note(m.pads, (v) => strings(v, { notes, t, dur: m.stepDur * 56, g: 0.026, cutoff: 1000, attack: 4, release: 4 }));
    }
    if (i % 8 === 4 && chance(0.05)) m.note(m.pads, (v) => bell(v, { t, midi: pick([81, 86, 88]), d: 4, g: 0.008 }));
  },
};

export const MOODS = {
  meadows: heavenly(false),
  hallu: heavenly(true),
  feed,
  farm,
  oldweb,
  forest,
  lighthouse,
  title,
};
