import { rampTo, glideTo, mtof } from './engine.js';
import { piano, strings, bell, musicBox, burst, tone } from './instruments.js';
import { MOODS } from './moods.js';
import { arrange, ARR_RANK, STAGE_ARR } from './theme.js';

const CROSSFADE = 4;
const NIGHT_LEVEL = [1, 1, 0.9, 0.74, 0.6, 0.5, 0.55];
const NIGHT_LP = [19000, 17000, 11000, 6000, 3800, 2700, 5000];
const NIGHT_AMOUNT = [0, 0, 0.15, 0.45, 0.7, 0.9, 0.6];

const ZONE_MOOD = { hub: 'meadows', feed: 'feed', farm: 'farm', hallu: 'hallu', oldweb: 'oldweb', forest: 'forest', lighthouse: 'lighthouse' };

class Mood {
  constructor(music, key) {
    this.music = music;
    this.eng = music.eng;
    this.key = key;
    this.def = MOODS[key];
    this.params = music.state.params;
    this.active = false;
  }

  get night() {
    return this.def.human ? 0 : this.music.night;
  }

  activate(now, fade) {
    const m = this.music;
    const def = this.def;
    this.active = true;
    this.fadeEnd = 0;
    this.bed = this.eng.voice('music', def.human ? m.humanIn : m.synthIn);
    this.bed.persistent = true;
    this.bed.commit();
    this.fader = this.bed.out;
    this.fader.gain.setValueAtTime(0, now);
    this.fader.gain.linearRampToValueAtTime(1, now + fade);
    this.mix = this.bed.gain(def.level, this.fader);
    this.verbSend = this.bed.gain(def.verb, def.human ? m.humanVerb : m.synthVerb);
    this.fader.connect(this.verbSend);
    if (def.delay) {
      const ds = this.bed.gain(def.delay, m.synthDelay);
      this.fader.connect(ds);
    }
    this.stepDur = 60 / def.bpm / 4;
    this.step = 0;
    this.next = now + 0.06;
    def.start(this, this.next);
  }

  layer(level, dest) {
    return this.bed.gain(level, dest || this.mix);
  }

  note(dest, build) {
    const v = this.eng.voice('music', dest);
    build(v);
    v.commit();
  }

  fadeIn(now, fade) {
    this.fadeEnd = 0;
    rampTo(this.fader.gain, 1, now, fade);
  }

  fadeOut(now, fade) {
    rampTo(this.fader.gain, 0, now, fade);
    this.fadeEnd = now + fade + 0.2;
  }

  param(name, value, now) {
    if (this.active && this.def.param) this.def.param(this, name, value, now, false);
  }

  run(now, horizon, silent) {
    if (this.next < now - 0.3) this.next = now + 0.05;
    while (this.next < horizon) {
      if (!silent) this.def.step(this, this.next, this.step);
      this.step++;
      this.next += this.stepDur;
    }
    if (this.fadeEnd && now > this.fadeEnd) {
      this.active = false;
      this.fadeEnd = 0;
      this.bed.stop(0.02);
      return false;
    }
    return true;
  }
}

export class Performer {
  constructor(eng, out, choose, cat = 'music') {
    this.eng = eng;
    this.cat = cat;
    this.choose = choose;
    this.out = out;
    this.events = [];
    this.idx = 0;
    this.restUntil = 0;
    this.endAt = 0;
    this.rest = 0;
    this.forced = null;
    this.name = null;
  }

  get busy() {
    return this.idx < this.events.length || this.eng.ac.currentTime < this.endAt;
  }

  startAt(name, t) {
    this.events = [];
    this.idx = 0;
    this.forced = name;
    this.restUntil = t;
    this.endAt = 0;
  }

  interrupt(now, fade) {
    rampTo(this.out.gain, 0, now, fade);
    this.out.gain.setValueAtTime(0, now + fade + 0.05);
    this.out.gain.linearRampToValueAtTime(1, now + fade + 0.15);
    this.events = [];
    this.idx = 0;
    this.endAt = 0;
    this.restUntil = now + fade + 0.3;
  }

  hurry(now, within) {
    if (this.idx >= this.events.length && this.restUntil > now + within) this.restUntil = now + within;
  }

  run(now, horizon, silent) {
    const ev = this.events;
    while (this.idx < ev.length && ev[this.idx].t < horizon) {
      const e = ev[this.idx++];
      if (!silent && e.t > now - 0.03) this.play(e);
    }
    if (this.idx < ev.length) return;
    if (this.endAt) {
      this.restUntil = this.endAt + this.rest;
      this.endAt = 0;
    }
    if (horizon < this.restUntil) return;
    const name = this.forced || this.choose();
    this.forced = null;
    if (!name) {
      this.restUntil = now + 1;
      return;
    }
    const r = arrange(name, Math.max(now + 0.15, this.restUntil));
    this.events = r.events;
    this.idx = 0;
    this.endAt = r.end;
    this.rest = r.rest;
    this.name = name;
  }

  play(e) {
    const v = this.eng.voice(this.cat, this.out);
    if (e.inst === 'piano') piano(v, e);
    else if (e.inst === 'strings') strings(v, e);
    else if (e.inst === 'bell') bell(v, { t: e.t, midi: e.midi, g: e.g, d: 4 });
    else if (e.inst === 'box') musicBox(v, { t: e.t, midi: e.midi, g: e.g });
    v.commit();
  }
}

export class Music {
  constructor(eng, state) {
    this.eng = eng;
    this.state = state;
    const ac = eng.ac;
    const bus = eng.buses.music;
    const g = (v, dest) => {
      const n = ac.createGain();
      n.gain.value = v;
      eng.count.core++;
      if (dest) n.connect(dest);
      return n;
    };
    this.synthDuck = g(1, bus.in);
    this.synthLevel = g(1, this.synthDuck);
    this.synthLP = ac.createBiquadFilter();
    this.synthLP.type = 'lowpass';
    this.synthLP.frequency.value = 19000;
    this.synthLP.Q.value = 0.5;
    eng.count.core++;
    this.synthLP.connect(this.synthLevel);
    this.synthIn = g(1, this.synthLP);
    this.synthVerbDuck = g(1, bus.verb);
    this.synthVerb = g(1, this.synthVerbDuck);
    this.synthDelayDuck = g(1, bus.delay);
    this.synthDelay = g(1, this.synthDelayDuck);
    this.humanDuck = g(1, bus.in);
    this.humanIn = g(1, this.humanDuck);
    this.humanVerb = g(1, bus.verb);
    this.humanSend = g(0.4, this.humanVerb);
    this.humanDuck.connect(this.humanSend);
    this.cueIn = g(1, bus.in);
    this.cueVerb = g(0.7, bus.verb);
    this.cueIn.connect(this.cueVerb);

    this.moods = {};
    this.running = [];
    this.current = null;
    this.night = 0;
    this.finalePlayed = state.stage >= 6;
    this.creditsPlayed = false;
    this.performer = new Performer(eng, g(1, this.humanIn), () => this.choose());
    this.duckUntil = 0;
    const now = ac.currentTime;
    this.applyStage(now, true);
    this.refresh(now);
    if (state.cue === 'finale' || state.cue === 'credits') this.cue(state.cue, now);
  }

  moodKey() {
    const s = this.state;
    if (s.cue === 'title') return 'title';
    if (s.cue === 'credits') return null;
    return ZONE_MOOD[s.zone] || 'meadows';
  }

  refresh(now) {
    const key = this.moodKey();
    if ((this.current?.key ?? null) === key) return;
    if (this.current) this.current.fadeOut(now, CROSSFADE);
    if (!key) {
      this.current = null;
      return;
    }
    let mood = this.moods[key];
    if (!mood) mood = this.moods[key] = new Mood(this, key);
    if (mood.active) mood.fadeIn(now, CROSSFADE);
    else {
      mood.activate(now, CROSSFADE);
      this.running.push(mood);
    }
    this.current = mood;
    const beat = 60 / mood.def.bpm;
    glideTo(this.eng.buses.music.delayNode.delayTime, Math.min(1.5, beat * 0.75 * (mood.def.bpm > 100 ? 2 : 1)), now, 0.8);
  }

  choose() {
    const s = this.state;
    if (s.cue === 'credits') {
      if (this.creditsPlayed) return null;
      this.creditsPlayed = true;
      return 'credits';
    }
    if (s.cue === 'title') return 'hint';
    if (s.stage >= 6) {
      if (this.finalePlayed) return 'resolved';
      this.finalePlayed = true;
      return 'finale';
    }
    let arr = STAGE_ARR[Math.max(0, Math.min(5, s.stage | 0))];
    if (s.zone === 'lighthouse' && (ARR_RANK[arr] || 0) < ARR_RANK.full) arr = 'full';
    return arr;
  }

  applyStage(now, instant) {
    const s = Math.max(0, Math.min(6, this.state.stage | 0));
    const dur = instant ? 0.01 : 10;
    this.night = NIGHT_AMOUNT[s];
    rampTo(this.synthLevel.gain, NIGHT_LEVEL[s], now, dur);
    rampTo(this.synthVerb.gain, NIGHT_LEVEL[s], now, dur);
    rampTo(this.synthDelay.gain, NIGHT_LEVEL[s], now, dur);
    if (instant) this.synthLP.frequency.setValueAtTime(NIGHT_LP[s], now);
    else glideTo(this.synthLP.frequency, NIGHT_LP[s], now, 3);
    this.performer.hurry(now, 3);
  }

  setZone(now) {
    this.refresh(now);
    if (this.state.zone === 'lighthouse') this.performer.hurry(now, 2);
  }

  setStage(now) {
    this.applyStage(now, false);
  }

  param(name, value, now) {
    for (let i = 0; i < this.running.length; i++) this.running[i].param(name, value, now);
  }

  duck(level, now, attack, holdUntil, release) {
    const nodes = [this.synthDuck, this.synthVerbDuck, this.synthDelayDuck, this.humanDuck];
    for (const n of nodes) {
      rampTo(n.gain, level, now, attack);
      n.gain.setValueAtTime(level, holdUntil);
      n.gain.linearRampToValueAtTime(1, holdUntil + release);
    }
  }

  cue(name, now) {
    const s = this.state;
    if (name === 'title') {
      s.cue = 'title';
      this.performer.interrupt(now, 1.5);
      this.refresh(now);
    } else if (name === 'beacon') {
      this.swell(now, false);
      this.duck(0.3, now, 1.2, now + 6, 2.5);
    } else if (name === 'finale') {
      s.cue = null;
      this.finalePlayed = true;
      this.performer.interrupt(now, 1.5);
      this.performer.startAt('finale', now + 3.2);
      this.swell(now, true);
      this.duck(0.15, now, 1.5, now + 48, 8);
      this.refresh(now);
    } else if (name === 'credits') {
      s.cue = 'credits';
      this.creditsPlayed = false;
      this.performer.interrupt(now, 2);
      this.refresh(now);
    }
  }

  swell(now, big) {
    const v = this.eng.voice('music', this.cueIn);
    const t = now + 0.05;
    const rise = big ? 3.2 : 4;
    const chord = big ? [26, 38, 45, 50, 57, 62, 66, 69] : [38, 45, 50, 57, 62, 66, 69, 74];
    strings(v, { notes: chord, t, dur: rise + (big ? 1.5 : 0.6), g: big ? 0.05 : 0.04, cutoff: big ? 1800 : 1400, attack: rise, release: big ? 5 : 3, spread: 9 });
    burst(v, { t, color: 'pink', type: 'lowpass', f: 250, f1: 3200, glide: rise, q: 1.2, a: rise, d: 0.6, g: 0.035 });
    if (!big) {
      const notes = [74, 78, 81, 86];
      for (let i = 0; i < notes.length; i++) bell(v, { t: t + rise + 0.15 + i * 0.045, midi: notes[i], d: 4.5, g: 0.03 });
    }
    tone(v, { t: t + rise + 0.1, f: mtof(26), a: 0.05, d: 2.5, g: big ? 0.16 : 0.11 });
    v.commit();
  }

  tick(now, horizon, silent) {
    for (let i = this.running.length - 1; i >= 0; i--) {
      if (!this.running[i].run(now, horizon, silent)) this.running.splice(i, 1);
    }
    this.performer.run(now, horizon, silent);
  }
}
