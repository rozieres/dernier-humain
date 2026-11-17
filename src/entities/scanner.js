import * as THREE from 'three';
import { sharedUniforms } from '../core/glsl.js';
import { createKeyEdges } from './player/keys.js';
import { createGhostMaterial } from './scanner/ghost.js';

const SPEED = 60;
const MAX_RADIUS = 140;
const COOLDOWN = 2.5;
const MARKER_LIFE = 8;
const MAX_MARKERS = 12;
const SYNTH_MARKER_RANGE = 40;
const SIGNAL_NEAR = 4;
const SIGNAL_FAR = 140;
const MARKER_KIND = { human: 'human', synthetic: 'synthetic', hallucination: 'hallucination', hidden: 'hallucination', beacon: 'beacon' };
const KINDS = ['human', 'synthetic', 'hallucination', 'hidden', 'beacon'];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export default async function create(ctx) {
  const { events, state, mat, camera } = ctx;
  const edge = createKeyEdges(ctx);
  const ghostViolet = createGhostMaterial(mat, '#c77dff', 1.1);
  const ghostMint = createGhostMaterial(mat, '#7af5c8', 0.95);

  const targets = new Set();
  const signals = new Set();
  const fakes = new Set();
  const origin = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let cooldown = 0;
  let pulse = null;
  let signal = 0;
  let sentSignal = -1;

  const read = (v, out) => (Array.isArray(v) ? out.fromArray(v) : out.copy(v));

  function targetPosition(h, out) {
    if (h.object) {
      h.object.updateWorldMatrix(true, false);
      return h.object.getWorldPosition(out);
    }
    return read(h.position, out);
  }

  function register({ object, position, kind, label, marker = true, onScan } = {}) {
    if (!KINDS.includes(kind)) throw new Error(`[scanner] unknown target kind "${kind}"`);
    if (!object && !position) throw new Error('[scanner] register needs an object or a position');
    const handle = {
      object, position, kind, label, marker, onScan, enabled: true,
      remove() {
        targets.delete(handle);
      },
    };
    targets.add(handle);
    return handle;
  }

  function notReady() {
    ctx.audio.sfx('ui.click', { pitch: 0.55, volume: 0.45 });
    ctx.player.shake(0.12, 0.18);
  }

  function hit(entry) {
    const { handle, kind, distance, point } = entry;
    pulse.summary[kind]++;
    events.emit('scan:hit', { handle, kind, distance });
    try {
      handle.onScan?.({ handle, kind, distance, position: point });
    } catch (err) {
      console.error('[scanner] onScan failed', err);
    }
    if (handle.marker === false || pulse.markers >= MAX_MARKERS) return;
    if (kind === 'synthetic' && (distance > SYNTH_MARKER_RANGE || handle.label)) return;
    pulse.markers++;
    ctx.ui.marker.add({ position: point, kind: MARKER_KIND[kind], label: kind === 'synthetic' ? undefined : handle.label, duration: MARKER_LIFE });
  }

  function firePulse() {
    if (cooldown > 0 || pulse) {
      notReady();
      return false;
    }
    cooldown = COOLDOWN;
    if (ctx.has('player')) origin.copy(ctx.player.eye);
    else camera.getWorldPosition(origin);
    const o = origin.clone();
    ctx.postfx.scanPulse(o, { speed: SPEED, maxRadius: MAX_RADIUS });
    events.emit('scan:start', { origin: o });
    const queue = [];
    for (const h of targets) {
      if (!h.enabled) continue;
      const point = targetPosition(h, new THREE.Vector3());
      const distance = point.distanceTo(o);
      if (distance <= MAX_RADIUS) queue.push({ handle: h, kind: h.kind, distance, point });
    }
    queue.sort((a, b) => a.distance - b.distance);
    pulse = { origin: o, t: 0, queue, index: 0, markers: 0, summary: Object.fromEntries(KINDS.map((k) => [k, 0])) };
    return true;
  }

  function stepPulse(dt) {
    pulse.t += dt;
    const radius = pulse.t * SPEED;
    while (pulse.index < pulse.queue.length && pulse.queue[pulse.index].distance <= radius) {
      const entry = pulse.queue[pulse.index++];
      if (entry.handle.enabled && targets.has(entry.handle)) hit(entry);
    }
    if (!ctx.has('postfx')) sharedUniforms.uScan.value.set(pulse.origin.x, pulse.origin.y, pulse.origin.z, radius);
    if (radius >= MAX_RADIUS) {
      const { summary, origin: o } = pulse;
      pulse = null;
      if (!ctx.has('postfx')) sharedUniforms.uScan.value.w = -1;
      events.emit('scan:end', { ...summary, origin: o });
    }
  }

  function makeFake(object, kind, { duration }) {
    const ghost = kind === 'hidden' ? ghostMint : ghostViolet;
    const meshes = [];
    object.traverse((m) => {
      if (m.isMesh) meshes.push({ mesh: m, material: m.material, before: m.onBeforeRender });
    });
    const entry = {
      object, kind, duration, meshes, ghosted: false,
      phase: kind === 'hidden' ? 'gone' : 'idle',
      t: 0, fade: 1, flicker: 1,
      tell: 4 + Math.random() * 8,
      base: new THREE.Vector3(), jitterFrames: 0, blinkFrames: 0,
    };
    const beforeRender = (renderer, scene, cam, geometry, material) => {
      material.uniforms.uFade.value = entry.fade;
      material.uniforms.uFlicker.value = entry.flicker;
      material.uniformsNeedUpdate = true;
    };
    entry.setGhost = (on) => {
      if (entry.ghosted === on) return;
      entry.ghosted = on;
      for (const m of meshes) {
        m.mesh.material = on ? ghost : m.material;
        m.mesh.onBeforeRender = on ? beforeRender : m.before;
      }
    };
    if (kind === 'hidden') object.visible = false;
    entry.target = register({
      object, kind, marker: true,
      onScan: () => reveal(entry),
    });
    fakes.add(entry);
    return {
      object,
      get phase() {
        return entry.phase;
      },
      get revealed() {
        return entry.phase !== 'idle' && entry.phase !== 'gone';
      },
      reveal: () => reveal(entry),
      get enabled() {
        return entry.target.enabled;
      },
      set enabled(v) {
        entry.target.enabled = v;
      },
      remove() {
        entry.setGhost(false);
        if (entry.jitterFrames) object.position.copy(entry.base);
        object.visible = true;
        entry.target.remove();
        fakes.delete(entry);
      },
    };
  }

  function reveal(e) {
    if (e.kind === 'hallucination') {
      if (e.phase === 'ghost') {
        e.t = 0;
        return;
      }
      if (e.phase !== 'idle') return;
      e.phase = 'glitch';
      e.t = 0;
      ctx.audio.sfx('hallu.reveal', { position: e.object.getWorldPosition(tmp) });
    } else {
      if (e.phase === 'solid') {
        e.t = 0;
        return;
      }
      if (e.phase !== 'gone' && e.phase !== 'vanish') return;
      e.phase = 'appear';
      e.t = 0;
      e.object.visible = true;
      e.setGhost(true);
      e.fade = 0;
    }
  }

  function endJitter(e) {
    if (e.jitterFrames > 0 && --e.jitterFrames === 0) e.object.position.copy(e.base);
    if (e.blinkFrames > 0 && --e.blinkFrames === 0) e.object.visible = true;
  }

  function updateFake(e, dt) {
    e.t += dt;
    endJitter(e);
    switch (e.phase) {
      case 'idle':
        e.tell -= dt;
        if (e.tell <= 0 && !e.jitterFrames && !e.blinkFrames) {
          e.tell = 6 + Math.random() * 10;
          if (Math.random() < 0.5) {
            e.object.visible = false;
            e.blinkFrames = 1;
          } else {
            e.base.copy(e.object.position);
            e.object.position.x += (Math.random() - 0.5) * 0.06;
            e.object.position.y += (Math.random() - 0.5) * 0.04;
            e.jitterFrames = 2;
          }
        }
        break;
      case 'glitch':
        e.setGhost(Math.random() < 0.45 + e.t);
        e.fade = 0.4 + Math.random() * 0.6;
        e.flicker = 0.4 + Math.random() * 1.4;
        if (!e.jitterFrames) {
          e.base.copy(e.object.position);
          e.object.position.x += (Math.random() - 0.5) * 0.08;
          e.jitterFrames = 1;
        }
        if (e.t >= 0.45) {
          e.setGhost(true);
          e.phase = 'ghost';
          e.t = 0;
          e.fade = 0.3;
        }
        break;
      case 'ghost':
        e.fade = Math.min(1, e.fade + dt * 2.5);
        e.flicker = 0.88 + 0.12 * Math.sin(e.t * 31) * Math.sin(e.t * 7.3);
        if (e.t >= e.duration) {
          e.phase = 'return';
          e.t = 0;
        }
        break;
      case 'return':
        e.setGhost(Math.random() < 0.6 - e.t);
        e.flicker = 0.5 + Math.random();
        if (e.t >= 0.5) {
          e.setGhost(false);
          e.flicker = 1;
          e.fade = 1;
          e.phase = 'idle';
          e.t = 0;
        }
        break;
      case 'appear':
        e.fade = Math.min(1, e.t / 0.8);
        e.flicker = 0.9 + 0.1 * Math.sin(e.t * 40);
        if (e.t >= 0.8) {
          e.phase = 'settle';
          e.t = 0;
        }
        break;
      case 'settle':
        e.setGhost(Math.random() < 0.5 - e.t * 2.5);
        if (e.t >= 0.2) {
          e.setGhost(false);
          e.phase = 'solid';
          e.t = 0;
        }
        break;
      case 'solid':
        if (e.t >= Math.max(0.5, e.duration - 2.2)) {
          e.setGhost(true);
          e.phase = 'vanish';
          e.t = 0;
        }
        break;
      case 'vanish':
        e.fade = 1 - Math.min(1, e.t / 1.2);
        e.flicker = 0.8 + 0.2 * Math.sin(e.t * 50);
        if (e.t >= 1.2) {
          e.setGhost(false);
          e.object.visible = false;
          e.phase = 'gone';
          e.t = 0;
        }
        break;
      default:
        break;
    }
  }

  function addSignal({ position, active = () => true, strength = 1 } = {}) {
    const handle = {
      position, active, strength, enabled: true,
      remove() {
        signals.delete(handle);
      },
    };
    signals.add(handle);
    return handle;
  }

  function updateSignal(dt) {
    const eye = ctx.has('player') ? ctx.player.eye : camera.position;
    let target = 0;
    for (const s of signals) {
      if (!s.enabled || !s.active()) continue;
      const d = read(s.position, tmp).distanceTo(eye);
      const t = clamp01(1 - (d - SIGNAL_NEAR) / (SIGNAL_FAR - SIGNAL_NEAR));
      const v = t * t * s.strength;
      if (v > target) target = v;
    }
    signal += (clamp01(target) - signal) * (1 - Math.exp(-2.5 * dt));
    if (signal < 1e-3 && target === 0) signal = 0;
    if (Math.abs(signal - sentSignal) > 0.001 || (signal === 0 && sentSignal !== 0)) {
      sentSignal = signal;
      ctx.ui.setSignal(signal);
      ctx.audio.setParam('signal', signal);
    }
  }

  const scanner = {
    pulse: firePulse,
    register,
    hallucination: (object3D, { duration = 8 } = {}) => makeFake(object3D, 'hallucination', { duration }),
    hidden: (object3D, { duration = 10 } = {}) => makeFake(object3D, 'hidden', { duration }),
    addSignal,
    get ready() {
      return cooldown <= 0 && !pulse;
    },
    get cooldown() {
      return Math.max(0, cooldown);
    },
    get signal() {
      return signal;
    },
    get scanning() {
      return Boolean(pulse);
    },

    update(dt) {
      cooldown = Math.max(0, cooldown - dt);
      const key = edge('KeyF');
      const busy = ctx.has('player') && (ctx.player.locked || ctx.player.riding);
      if (key && state.mode === 'playing' && !busy && !ctx.debug.flycam?.enabled) firePulse();
      if (pulse) stepPulse(dt);
      for (const e of fakes) updateFake(e, dt);
      updateSignal(dt);
    },

    dispose() {
      for (const e of [...fakes]) {
        e.setGhost(false);
        e.object.visible = true;
      }
      fakes.clear();
      targets.clear();
      signals.clear();
      ghostViolet.dispose();
      ghostMint.dispose();
    },
  };
  return scanner;
}
