import { rand } from './engine.js';

export const THEME = [
  { chord: 'D', mel: [[66, 1], [69, 1], [74, 2]] },
  { chord: 'Bm', mel: [[73, 1], [71, 1], [69, 1.5], [66, 0.5]] },
  { chord: 'G', mel: [[67, 1], [71, 1], [74, 1], [76, 1]] },
  { chord: 'A', mel: [[73, 3], [69, 1]] },
  { chord: 'D', mel: [[66, 1], [69, 1], [74, 1], [78, 1]] },
  { chord: 'Bm', mel: [[76, 1.5], [74, 0.5], [71, 2]] },
  { chord: 'Gm', mel: [[70, 2], [69, 1], [67, 1]] },
  { chord: 'D', mel: [[66, 0.5], [64, 0.5], [62, 3]] },
];

export const CHORDS = {
  D: { root: 38, tones: [57, 62, 66] },
  Bm: { root: 35, tones: [54, 59, 62] },
  G: { root: 43, tones: [55, 59, 62] },
  A: { root: 45, tones: [57, 61, 64] },
  Gm: { root: 43, tones: [55, 58, 62] },
  Bb: { root: 46, tones: [57, 58, 62, 65] },
};

export const THEME_NOTES = THEME.flatMap((bar) => bar.mel.map((n) => n[0]));

const ARR = {
  hint: { bars: 1, bpm: 46, melody: 'hint', vel: 0.32, rest: [10, 16] },
  fragment: { bars: 8, bpm: 50, melody: 'fragment', vel: 0.4, rest: [12, 24] },
  phrase: { bars: 4, bpm: 60, melody: 'all', vel: 0.48, rest: [12, 20] },
  strings: { bars: 4, bpm: 58, melody: 'all', vel: 0.5, strings: 0.035, rest: [12, 18] },
  six: { bars: 6, bpm: 56, melody: 'all', vel: 0.52, strings: 0.04, second: true, rest: [14, 22] },
  full: { bars: 8, bpm: 52, melody: 'all', vel: 0.55, strings: 0.045, second: true, rest: [16, 26] },
  finale: { bars: 8, bpm: 56, melody: 'all', vel: 0.68, strings: 0.06, second: true, octave: true, bells: true, coda: true, rest: [8, 12] },
  resolved: { bars: 0, bpm: 50, resolved: true, rest: [10, 18] },
  credits: { bars: 8, bpm: 46, melody: 'all', vel: 0.52, strings: 0.05, second: true, unresolved: true, rest: [3600, 3600] },
  radio: { bars: 8, bpm: 66, melody: 'all', vel: 0.55, second: true, rest: [5, 9] },
};

export const ARR_RANK = { fragment: 1, phrase: 2, strings: 3, six: 4, full: 5 };
export const STAGE_ARR = [null, 'fragment', 'phrase', 'strings', 'six', 'full'];

function beatMap(cfg, beats) {
  const base = 60 / cfg.bpm;
  const times = new Float64Array(beats + 2);
  let walk = 0;
  let t = 0;
  for (let b = 0; b <= beats + 1; b++) {
    times[b] = t;
    walk = Math.max(-1, Math.min(1, walk * 0.7 + rand(-0.45, 0.45)));
    let k = 1 + walk * 0.09;
    const inBar = b % 4;
    const bar = (b / 4) | 0;
    if (bar % 4 === 3) k *= 1 + 0.12 * inBar;
    if (bar === beats / 4 - 1) k *= 1 + 0.15 * inBar;
    if (b % 16 === 15) k += 0.18;
    t += base * k;
  }
  return (pos) => {
    const i = Math.min(Math.floor(pos), beats);
    return times[i] + (pos - i) * (times[i + 1] - times[i]);
  };
}

export function arrange(name, t0) {
  const cfg = ARR[name];
  const events = [];
  let end = t0;
  const push = (e) => {
    events.push(e);
    const tail = e.t + (e.dur || 0) + (e.inst === 'strings' ? 2 : 0.6);
    if (tail > end) end = tail;
  };

  if (cfg.resolved) {
    const dur = rand(10, 14);
    push({ t: t0, inst: 'strings', notes: [38, 50, 57, 62, 66, 76], dur, g: 0.04, cutoff: 1100, attack: 3 });
    const at = t0 + rand(2.5, 4);
    const tail = [[66, 0], [64, 1.3], [62, 2.6]];
    for (const [m, dt] of tail) push({ t: at + dt + rand(-0.05, 0.08), inst: 'piano', midi: m, vel: rand(0.28, 0.4), dur: 1.6 });
    if (Math.random() < 0.5) push({ t: at + rand(5, 7), inst: 'box', midi: 86, g: 0.03 });
    return { events, end: t0 + dur + 2, rest: rand(...cfg.rest) };
  }

  const beats = cfg.bars * 4;
  const at = beatMap(cfg, beats);

  if (cfg.melody === 'hint') {
    const count = Math.random() < 0.35 ? 4 : 3;
    const notes = [[66, 0], [69, 1.1], [74, 2.3], [73, 4.2]];
    for (let i = 0; i < count; i++) {
      push({ t: t0 + notes[i][1] * (60 / cfg.bpm) + rand(-0.06, 0.1), inst: 'piano', midi: notes[i][0], vel: cfg.vel * rand(0.75, 1.15), dur: 2.4 });
    }
    return { events, end, rest: rand(...cfg.rest) };
  }

  if (cfg.melody === 'fragment') {
    const len = 2 + ((Math.random() * 3) | 0);
    const start = (Math.random() * (THEME_NOTES.length - len)) | 0;
    let t = t0;
    for (let i = 0; i < len; i++) {
      push({ t, inst: 'piano', midi: THEME_NOTES[start + i], vel: cfg.vel * rand(0.7, 1.2), dur: 1.8 });
      t += (60 / cfg.bpm) * rand(0.9, 1.7);
    }
    return { events, end, rest: rand(...cfg.rest) };
  }

  for (let b = 0; b < cfg.bars; b++) {
    const last = b === cfg.bars - 1;
    const bar = cfg.unresolved && b === 7 ? { chord: 'Bb', mel: [[69, 4]] } : THEME[b];
    const chord = CHORDS[bar.chord];
    const phrasePos = (b % 4) / 3;
    const shape = 0.82 + 0.25 * Math.sin(phrasePos * Math.PI);
    let pos = b * 4;
    for (const [midi, len] of bar.mel) {
      const t = t0 + at(pos) + rand(-0.018, 0.022);
      const dur = at(pos + len) - at(pos) + 0.12 + (last ? 1.6 : 0);
      const vel = Math.min(1, cfg.vel * shape * rand(0.82, 1.18) * (len >= 2 ? 1.08 : 1));
      push({ t, inst: 'piano', midi, vel, dur });
      if (cfg.octave && b >= 4) push({ t: t + 0.012, inst: 'piano', midi: midi - 12, vel: vel * 0.55, dur });
      pos += len;
    }
    const barStart = t0 + at(b * 4);
    const barLen = at(b * 4 + 4) - at(b * 4);
    if (cfg.second) {
      const lh = 0.3 * (cfg.vel / 0.55);
      push({ t: barStart - rand(0.02, 0.045), inst: 'piano', midi: chord.root, vel: lh * rand(0.9, 1.15), dur: barLen + (last ? 2 : 0.2) });
      if (!last || !cfg.unresolved) {
        const tones = chord.tones;
        push({ t: t0 + at(b * 4 + 1) + rand(-0.03, 0.03), inst: 'piano', midi: tones[0], vel: lh * rand(0.7, 0.95), dur: barLen * 0.75 });
        push({ t: t0 + at(b * 4 + 2) + rand(-0.03, 0.03), inst: 'piano', midi: tones[1], vel: lh * rand(0.7, 0.95), dur: barLen * 0.5 });
        if (Math.random() < 0.6) push({ t: t0 + at(b * 4 + 3) + rand(-0.03, 0.03), inst: 'piano', midi: tones[2], vel: lh * rand(0.6, 0.85), dur: barLen * 0.3 });
      } else {
        for (let i = 0; i < chord.tones.length; i++) push({ t: barStart + 0.05 + i * 0.07, inst: 'piano', midi: chord.tones[i], vel: lh * 0.8, dur: barLen + 2 });
      }
    }
    if (cfg.strings) {
      const notes = [chord.root + 12, ...chord.tones];
      push({ t: barStart - 0.2, inst: 'strings', notes, dur: barLen + (last ? 3 : 0.5), g: cfg.strings, cutoff: cfg.octave ? 1500 : 950, attack: b === 0 ? 2 : 1.1 });
    }
    if (cfg.bells && (b === 0 || b === 4)) push({ t: barStart, inst: 'bell', midi: b === 0 ? 86 : 90, g: 0.025 });
  }
  const endBeat = at(beats);
  if (cfg.coda) {
    push({ t: t0 + endBeat + 0.6, inst: 'strings', notes: [38, 50, 57, 62, 66, 69, 74], dur: 8, g: 0.05, cutoff: 1300, attack: 2.5 });
    push({ t: t0 + endBeat + 1.4, inst: 'piano', midi: 74, vel: 0.4, dur: 4 });
    push({ t: t0 + endBeat + 1.42, inst: 'piano', midi: 78, vel: 0.32, dur: 4 });
    push({ t: t0 + endBeat + 1.45, inst: 'piano', midi: 81, vel: 0.3, dur: 4 });
    push({ t: t0 + endBeat + 3.5, inst: 'bell', midi: 98, g: 0.016 });
  }
  if (cfg.unresolved) push({ t: t0 + endBeat + 3.2, inst: 'piano', midi: 76, vel: 0.36, dur: 5 });
  events.sort((a, b) => a.t - b.t);
  return { events, end, rest: rand(...cfg.rest) };
}
