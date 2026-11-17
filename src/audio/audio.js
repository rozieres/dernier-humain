import { Engine, LOOKAHEAD, rampTo, clamp01, rand, smooth } from './engine.js';
import { Music } from './music.js';
import { SFX, SFX_NAMES } from './sfx.js';
import { LOOPS, LOOP_NAMES } from './loops.js';
import { Signal, Air, babble } from './ambient.js';

const PARAMS = ['depth', 'signal', 'speed', 'danger', 'altitude', 'glide'];
const CUES = ['title', 'beacon', 'finale', 'credits'];
const ZONES = ['hub', 'feed', 'farm', 'hallu', 'oldweb', 'forest', 'lighthouse'];
const LIMITS = { 'ui.type': 3, 'ui.hover': 2, 'ui.click': 3, 'scan.synth': 4, 'scan.human': 3, 'scan.hallu': 3, modem: 1, 'lamp.ignite': 1, 'beacon.activate': 1, knock: 3 };
const SCAN_SFX = { human: 'scan.human', synthetic: 'scan.synth', hallucination: 'scan.hallu', hidden: 'scan.human', beacon: 'scan.human' };
const MODE_DUCK = { paused: 0.55, reading: 0.62 };
const MAX_SFX_VOICES = 48;
const NO_OPTS = {};

function setPos(node, p) {
  if (node.positionX) {
    node.positionX.value = p.x ?? p[0] ?? 0;
    node.positionY.value = p.y ?? p[1] ?? 0;
    node.positionZ.value = p.z ?? p[2] ?? 0;
  } else {
    node.setPosition(p.x ?? p[0] ?? 0, p.y ?? p[1] ?? 0, p.z ?? p[2] ?? 0);
  }
}

export default async function create(ctx) {
  const muted = typeof location !== 'undefined' && new URLSearchParams(location.search).get('mute') === '1';
  const st = {
    zone: null,
    stage: ctx.state?.stage ?? 0,
    cue: null,
    params: { depth: 0, signal: 0, speed: 0, danger: 0, altitude: 0, glide: 0 },
  };
  let ac = null;
  let eng = null;
  let music = null;
  let signal = null;
  let air = null;
  let timer = 0;
  let musicSilent = false;
  let sfxSilent = false;
  let speech = null;
  const loops = [];
  const warned = new Set();
  const lastHit = { human: 0, synthetic: 0, hallucination: 0, hidden: 0, beacon: 0 };
  const unsubs = [];

  function warnOnce(kind, name) {
    const key = `${kind}:${name}`;
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`[audio] unknown ${kind} "${name}"`);
  }

  function gestureAllowed() {
    const ua = typeof navigator !== 'undefined' ? navigator.userActivation : null;
    return !ua || ua.hasBeenActive || ua.isActive;
  }

  function boot() {
    if (ac || muted || typeof window === 'undefined') return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !gestureAllowed()) return;
    ac = new AC({ latencyHint: 'interactive' });
    eng = new Engine(ac);
    applyVolumes(true);
    applyMode(true);
    music = new Music(eng, st);
    signal = new Signal(eng);
    signal.value = st.params.signal;
    air = new Air(eng);
    air.update(st.params, ac.currentTime);
    for (let i = 0; i < loops.length; i++) build(loops[i]);
    timer = setInterval(tick, 25);
  }

  function running() {
    return ac !== null && ac.state === 'running';
  }

  function unlock() {
    boot();
    if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
  }

  function onGesture() {
    unlock();
    if (running()) removeGestures();
  }
  const GESTURES = ['pointerdown', 'keydown', 'touchstart'];
  function removeGestures() {
    if (typeof window === 'undefined') return;
    for (const g of GESTURES) window.removeEventListener(g, onGesture, true);
  }
  if (typeof window !== 'undefined' && !muted) {
    for (const g of GESTURES) window.addEventListener(g, onGesture, { capture: true, passive: true });
  }

  function applyVolumes(instant) {
    const s = ctx.state?.settings || NO_OPTS;
    const master = clamp01(s.master ?? 1);
    const mus = clamp01(s.music ?? 1);
    const fx = clamp01(s.sfx ?? 1);
    musicSilent = master * mus < 0.001;
    sfxSilent = master * fx < 0.001;
    if (!eng) return;
    const now = ac.currentTime;
    const dur = instant ? 0.005 : 0.15;
    rampTo(eng.master.gain, master * master, now, dur);
    rampTo(eng.buses.music.vol.gain, mus * mus, now, dur);
    rampTo(eng.buses.sfx.vol.gain, fx * fx, now, dur);
  }

  function applyMode(instant) {
    if (!eng) return;
    const level = MODE_DUCK[ctx.state?.mode] ?? 1;
    rampTo(eng.buses.music.duck.gain, level, ac.currentTime, instant ? 0.005 : 0.8);
  }

  function tick() {
    if (!running()) return;
    const now = ac.currentTime;
    const horizon = now + LOOKAHEAD;
    music.tick(now, horizon, musicSilent);
    signal.run(now, horizon, sfxSilent);
    air.run(now, st.params);
    for (let i = 0; i < loops.length; i++) {
      const impl = loops[i].impl;
      if (impl && !impl.culled && impl.ctrl.tick) impl.ctrl.tick(now, horizon);
    }
    eng.sweep(now);
  }

  function build(h) {
    if (h.stopped || h.impl || !eng) return;
    const now = ac.currentTime;
    const v = eng.voice('loop', null);
    v.persistent = true;
    let dest = eng.amb;
    let panner = null;
    if (h.position) {
      panner = v.panner({ refDistance: h.refDistance, maxDistance: h.maxDistance * 2 });
      setPos(panner, h.position);
      panner.connect(eng.amb);
      dest = panner;
    }
    const cull = v.gain(1, dest);
    v.out.connect(cull);
    v.out.gain.setValueAtTime(0, now);
    v.out.gain.linearRampToValueAtTime(h.volume, now + h.fadeIn);
    const L = { eng, v, in: v.gain(1, v.out), t: now, nextEvt: 0 };
    L.ctrl = LOOPS[h.name](L);
    if (h.pitch !== 1 && L.ctrl.pitch) L.ctrl.pitch(h.pitch, now);
    v.commit();
    h.impl = { v, ctrl: L.ctrl, cull, panner, culled: false, cullLevel: 1 };
  }

  function loop(name, opts = NO_OPTS) {
    const h = {
      name,
      volume: opts.volume ?? 1,
      position: opts.position ?? null,
      refDistance: opts.refDistance ?? 6,
      maxDistance: opts.maxDistance ?? 120,
      fadeIn: opts.fade ?? 1.5,
      pitch: 1,
      stopped: false,
      impl: null,
      setVolume(value, t = 0.3) {
        h.volume = value;
        if (h.impl) rampTo(h.impl.v.out.gain, value, ac.currentTime, t);
      },
      setPosition(p) {
        const was = h.position;
        h.position = p;
        if (!h.impl) return;
        if (!was && p) {
          h.impl.v.stop(0.1);
          h.impl = null;
          h.fadeIn = 0.1;
          build(h);
        } else if (h.impl.panner && p) setPos(h.impl.panner, p);
      },
      setPitch(p) {
        h.pitch = p;
        if (h.impl && h.impl.ctrl.pitch) h.impl.ctrl.pitch(p, ac.currentTime);
      },
      stop(fade = 1) {
        if (h.stopped) return;
        h.stopped = true;
        const i = loops.indexOf(h);
        if (i >= 0) loops.splice(i, 1);
        if (h.impl) {
          h.impl.v.stop(Math.max(fade, 0.02));
          h.impl = null;
        }
      },
    };
    if (!LOOPS[name]) {
      warnOnce('loop', name);
      h.stopped = true;
      return h;
    }
    loops.push(h);
    build(h);
    return h;
  }

  function capVoices() {
    const now = ac.currentTime;
    let n = 0;
    for (let i = 0; i < eng.live.length; i++) {
      const v = eng.live[i];
      if (v.cat === 'sfx' && !v.persistent && !v.stealing && v.end > now) n++;
    }
    for (let i = 0; n >= MAX_SFX_VOICES && i < eng.live.length; i++) {
      const v = eng.live[i];
      if (v.cat !== 'sfx' || v.persistent || v.stealing) continue;
      v.stealing = true;
      v.stop(0.03);
      n--;
    }
  }

  function sfx(name, opts = NO_OPTS) {
    const def = SFX[name];
    if (!def) {
      warnOnce('sfx', name);
      return;
    }
    if (!running() || sfxSilent) return;
    eng.limit(name, LIMITS[name] ?? 5);
    capVoices();
    const v = eng.voice('sfx', null, name);
    if (opts.position) {
      const p = v.panner({ refDistance: opts.refDistance ?? 3, maxDistance: opts.maxDistance ?? 250 });
      setPos(p, opts.position);
      p.connect(eng.buses.sfx.in);
      v.out.connect(p);
    } else {
      v.out.connect(eng.buses.sfx.in);
    }
    v.out.gain.value = opts.volume ?? 1;
    def(v, ac.currentTime + 0.008, (opts.pitch ?? 1) * rand(0.97, 1.03));
    v.commit();
  }

  function voice(text, opts = NO_OPTS) {
    if (!running() || sfxSilent || !text) return;
    if (speech && !speech.done) speech.stop(0.04);
    speech = babble(eng, eng.buses.sfx.in, text, opts.pitch ?? 1);
  }

  function setParam(name, value) {
    if (!(name in st.params)) {
      warnOnce('param', name);
      return;
    }
    const v = clamp01(Number(value) || 0);
    if (Math.abs(v - st.params[name]) < 0.002 && !(v === 0 && st.params[name] !== 0)) return;
    st.params[name] = v;
    if (!eng) return;
    const now = ac.currentTime;
    if (name === 'signal') signal.value = v;
    else if (name === 'speed' || name === 'altitude' || name === 'glide') air.update(st.params, now);
    else music.param(name, v, now);
  }

  const musicApi = {
    setZone(id) {
      st.zone = id ?? null;
      if (st.cue === 'title') st.cue = null;
      if (music) music.setZone(ac.currentTime);
    },
    setStage(n) {
      st.stage = Math.max(0, Math.min(6, n | 0));
      if (music) music.setStage(ac.currentTime);
    },
    play(cue) {
      if (!CUES.includes(cue)) {
        warnOnce('cue', cue);
        return;
      }
      if (music) music.cue(cue, ac.currentTime);
      else if (cue !== 'beacon') st.cue = cue;
    },
    get zone() {
      return st.zone;
    },
    get stage() {
      return st.stage;
    },
  };

  function zoneEvent(id) {
    st.zone = id;
    if (music) music.setZone(ac.currentTime);
  }

  const on = (type, fn) => unsubs.push(ctx.events.on(type, fn));
  on('settings:change', () => applyVolumes(false));
  on('mode:change', ({ to } = NO_OPTS) => {
    applyMode(false);
    if (to === 'title' && st.cue !== 'title') musicApi.play('title');
    if (to === 'playing' && (st.cue === 'title' || st.cue === 'credits')) {
      st.cue = null;
      if (music) music.refresh(ac.currentTime);
    }
  });
  on('input:lock', unlock);
  on('zone:enter', (e) => zoneEvent(e?.id ?? null));
  on('zone:leave', (e) => {
    if (st.zone === e?.id) zoneEvent(null);
  });
  on('stage:change', (e) => musicApi.setStage(e?.stage ?? 0));
  on('scan:start', () => sfx('scan'));
  on('scan:hit', (e) => {
    const kind = e?.kind;
    const name = SCAN_SFX[kind];
    if (!name || !running()) return;
    const now = ac.currentTime;
    if (now - lastHit[kind] < 0.07) return;
    lastHit[kind] = now;
    sfx(name, { volume: 0.35 + 0.65 * (1 - smooth(10, 160, e.distance ?? 0)) });
  });
  on('grab:start', () => sfx('grab'));
  on('grab:end', (e) => sfx(e?.thrown ? 'throw' : 'drop'));
  on('link:ride:start', () => {
    sfx('link.attach');
    if (st.params.speed < 0.05) setParam('speed', 0.6);
  });
  on('link:ride:end', () => {
    sfx('link.arrive');
    setParam('speed', 0);
  });
  on('link:restored', () => sfx('link.restore'));
  on('trace:found', () => sfx('trace.found'));
  on('beacon:ready', () => sfx('beacon.ready'));
  on('beacon:activated', () => musicApi.play('beacon'));
  on('player:jump', () => sfx('jump'));
  on('player:land', (e) => {
    const speed = e?.speed ?? 6;
    sfx(speed > 11 ? 'land.hard' : 'land', { volume: Math.min(1, 0.35 + speed / 10) });
  });
  on('player:step', (e) => {
    const name = `step.${e?.surface || 'grass'}`;
    sfx(SFX[name] ? name : 'step.grass');
  });
  on('player:glide', (e) => {
    sfx(e?.active ? 'glide.open' : 'glide.close');
    setParam('glide', e?.active ? Math.max(st.params.glide, 0.7) : 0);
  });
  on('player:respawn', () => sfx('respawn'));
  on('player:indexed', () => sfx('indexed'));
  on('finale:reply', () => sfx('reply.send'));

  boot();

  return {
    unlock,
    sfx,
    loop,
    voice,
    setParam,
    music: musicApi,

    frame() {
      if (!running()) return;
      const cam = ctx.camera;
      if (cam && cam.matrixWorld) {
        const e = cam.matrixWorld.elements;
        const l = ac.listener;
        if (l.positionX) {
          l.positionX.value = e[12];
          l.positionY.value = e[13];
          l.positionZ.value = e[14];
          l.forwardX.value = -e[8];
          l.forwardY.value = -e[9];
          l.forwardZ.value = -e[10];
          l.upX.value = e[4];
          l.upY.value = e[5];
          l.upZ.value = e[6];
        } else {
          l.setPosition(e[12], e[13], e[14]);
          l.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]);
        }
        const now = ac.currentTime;
        for (let i = 0; i < loops.length; i++) {
          const h = loops[i];
          const impl = h.impl;
          if (!impl || !impl.panner || !h.position) continue;
          const p = h.position;
          const x = p.x ?? p[0];
          const y = p.y ?? p[1];
          const z = p.z ?? p[2];
          setPos(impl.panner, p);
          const dx = x - e[12];
          const dy = y - e[13];
          const dz = z - e[14];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const level = 1 - smooth(h.maxDistance * 0.7, h.maxDistance, dist);
          if (Math.abs(level - impl.cullLevel) > 0.02 || (level === 0 && impl.cullLevel !== 0)) {
            impl.cullLevel = level;
            rampTo(impl.cull.gain, level, now, 0.15);
          }
          impl.culled = level === 0;
        }
      }
      tick();
    },

    dispose() {
      clearInterval(timer);
      removeGestures();
      for (const u of unsubs) u();
      for (const h of [...loops]) h.stop(0.01);
      if (ac) ac.close().catch(() => {});
      ac = null;
      eng = null;
    },

    get running() {
      return running();
    },

    debug: {
      get context() {
        return ac;
      },
      get engine() {
        return eng;
      },
      get music() {
        return music;
      },
      nodes() {
        return eng ? { ...eng.count, voices: eng.live.length, loops: loops.length } : null;
      },
      state: st,
      names: { sfx: SFX_NAMES, loops: LOOP_NAMES, cues: CUES, zones: ZONES, params: PARAMS },
    },
  };
}
