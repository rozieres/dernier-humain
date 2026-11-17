import * as THREE from 'three';
import { sharedUniforms } from '../core/glsl.js';
import { createTiretMesh } from './actors/tiret-mesh.js';
import { BLOCKED_MODES, lineDuration, lineIndex, syllables, envelopeAt, emoteFor } from './actors/speech.js';

const DEG = Math.PI / 180;
const PLACE = { x: 0.56, y: -0.44, distance: 3.1 };
const MIN_DISTANCE = 2.6;
const MAX_DISTANCE = 4.2;
const CLEAR_ANGLE = 9.5 * DEG;
const RIGHT_MIN = 12 * DEG;
const VIEW_LAG_RATE = 18;
const DROP_AGE = 8;
const IDLE_AFTER = 150;
const NOTHING_COOLDOWN = 90;
const EMOTE_LENGTH = { nod: 0.9, shake: 1.1, spin: 0.9, shy: 2.6 };
const UP = new THREE.Vector3(0, 1, 0);

export default async function create(ctx) {
  const { scene, camera, events, state, world } = ctx;
  const visual = createTiretMesh(ctx);
  scene.add(visual.group, visual.trail);

  const pos = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const target = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const look = new THREE.Vector3();
  const right = new THREE.Vector3();
  const lastEye = new THREE.Vector3();
  const up = new THREE.Vector3();
  const prevPos = new THREE.Vector3();
  const excursion = new THREE.Vector3();
  const excursionGoal = new THREE.Vector3();
  const rel = { a: 0, e: 0, r: PLACE.distance, va: 0, ve: 0, vr: 0 };
  const seen = { a: 0, e: 0, r: 0 };
  const stayAt = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const lightPos = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');

  let mode = 'follow';
  let dim = 0;
  let dimSmooth = 0;
  let opacity = 1;
  let yaw = 0;
  let bank = 0;
  let stillFor = 0;
  let excursionTimer = 0;
  let losTimer = 0;
  let losLimit = Infinity;
  let occluded = 0;
  let riding = false;
  let catchUp = 0;
  let light = null;
  let placed = false;
  let time = 0;
  let emote = null;

  let current = null;
  const queue = [];
  let idleTimer = 0;
  let lastNothing = -Infinity;
  let scanKinds = new Set();

  const now = () => performance.now() / 1000;

  function viewer() {
    if (state.mode === 'cinematic' && placed) return;
    const usePlayer = ctx.has('player') && !ctx.debug.flycam?.enabled;
    if (usePlayer) {
      eye.copy(ctx.player.eye);
      ctx.player.forward(fwd);
    } else {
      camera.getWorldPosition(eye);
      camera.getWorldDirection(fwd);
    }
    look.copy(fwd).normalize();
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    right.crossVectors(fwd, UP).normalize();
    up.crossVectors(right, look).normalize();
  }

  function halfFov() {
    const v = (camera.fov * DEG) / 2;
    const tv = Math.tan(v);
    return { v, h: Math.atan(tv * camera.aspect), tv, th: tv * camera.aspect };
  }

  function toRelative(p, out) {
    tmp.subVectors(p, eye);
    const r = Math.max(tmp.length(), 1e-3);
    const f = tmp.dot(look);
    out.a = Math.atan2(tmp.dot(right), f);
    out.e = Math.asin(THREE.MathUtils.clamp(tmp.dot(up) / r, -1, 1));
    out.r = r;
    return out;
  }

  function fromRelative(a, e, r, out) {
    const ce = Math.cos(e);
    return out.copy(eye)
      .addScaledVector(look, r * ce * Math.cos(a))
      .addScaledVector(right, r * ce * Math.sin(a))
      .addScaledVector(up, r * Math.sin(e));
  }

  function enterFromSide() {
    const hf = halfFov();
    rel.a = hf.h + 10 * DEG;
    rel.e = -Math.atan(-PLACE.y * hf.tv);
    rel.r = PLACE.distance;
    rel.va = rel.ve = rel.vr = 0;
  }

  function groundFloor(x, z) {
    return Math.max(world.heightAt(x, z), world.SEA_LEVEL) + 0.3;
  }

  function resolveLine(input) {
    const pool = ctx.texts.TIRET?.[input];
    if (!Array.isArray(pool)) return { key: null, text: String(input) };
    if (!pool.length) return null;
    const flag = `story.tiret.${input}`;
    const count = Number(state.flag(flag)) || 0;
    state.setFlag(flag, count + 1);
    return { key: input, text: pool[lineIndex(count, pool.length)] };
  }

  function spokenCount(key) {
    return Number(state.flag(`story.tiret.${key}`)) || 0;
  }

  function finish(spoken) {
    const line = current;
    current = null;
    line?.resolve(spoken);
  }

  function start(entry) {
    const line = resolveLine(entry.input);
    if (!line) {
      entry.resolve(false);
      return;
    }
    const duration = lineDuration(line.text);
    current = { ...entry, ...line, t: 0, duration, sylls: syllables(line.text) };
    idleTimer = 0;
    if (state.settings.subtitles !== false) ctx.ui.subtitle({ speaker: 'Tiret', text: line.text, duration });
    ctx.audio.voice(line.text);
    const kind = entry.emote ?? emoteFor(line.key, line.text);
    if (kind) companion.emote(kind);
  }

  function canSpeak() {
    return !BLOCKED_MODES.has(state.mode);
  }

  function pump() {
    if (current || !canSpeak()) return;
    const t = now();
    while (queue.length) {
      const entry = queue.shift();
      if (entry.priority <= 0 && t - entry.time > DROP_AGE) {
        entry.resolve(false);
        continue;
      }
      start(entry);
      if (current) return;
    }
  }

  function setEmote(kind) {
    emote = { kind, t: 0, length: EMOTE_LENGTH[kind] ?? 1 };
  }

  const companion = {
    get position() {
      return pos;
    },
    get mode() {
      return mode;
    },
    get speaking() {
      return current ? current.text : null;
    },
    get queueLength() {
      return queue.length;
    },

    say(keyOrText, { priority = 0, interrupt = false, emote: kind } = {}) {
      return new Promise((resolve) => {
        const entry = { input: keyOrText, priority, interrupt, emote: kind, time: now(), resolve };
        if (current && canSpeak() && (priority > current.priority || (interrupt && priority >= current.priority))) {
          finish(false);
          start(entry);
          return;
        }
        let i = queue.length;
        while (i > 0 && queue[i - 1].priority < priority) i--;
        queue.splice(i, 0, entry);
        pump();
      });
    },

    silence() {
      for (const entry of queue.splice(0)) entry.resolve(false);
      if (current) finish(false);
    },

    setMode(next, position) {
      if (!['follow', 'stay', 'hidden'].includes(next)) throw new Error(`[companion] unknown mode "${next}"`);
      mode = next;
      if (next === 'stay' && position) {
        if (Array.isArray(position)) stayAt.fromArray(position);
        else stayAt.copy(position);
      }
    },

    setDim(amount) {
      dim = THREE.MathUtils.clamp(Number(amount) || 0, 0, 1);
    },

    emote(kind) {
      if (kind in EMOTE_LENGTH) setEmote(kind);
    },

    start() {
      light = ctx.env.lights.add({ position: lightPos, color: '#5ce1e6', intensity: 0, distance: 5 });
    },

    frame(dt) {
      time += dt;
      viewer();
      if (!placed) {
        enterFromSide();
        fromRelative(rel.a, rel.e, rel.r, pos);
        prevPos.copy(pos);
        lastEye.copy(eye);
        visual.reset(pos);
        placed = true;
      }
      updateSpeech(dt);
      updateMotion(dt);
      updateLook(dt);
      updateVisual(dt);
    },
  };

  function updateSpeech(dt) {
    if (current) {
      current.t += dt;
      if (current.t >= current.duration) finish(true);
    }
    pump();
    if (!current && state.mode === 'playing') {
      idleTimer += dt;
      if (idleTimer >= IDLE_AFTER) {
        idleTimer = 0;
        companion.say('idle', { priority: -1 });
      }
    }
  }

  function spring(key, vkey, goal, omega, dt) {
    const steps = Math.max(1, Math.ceil(dt * 60));
    const sub = dt / steps;
    for (let i = 0; i < steps; i++) {
      rel[vkey] += ((goal - rel[key]) * omega * omega - 2 * omega * rel[vkey]) * sub;
      rel[key] += rel[vkey] * sub;
    }
  }

  function updateMotion(dt) {
    const moved = tmp.subVectors(eye, lastEye).length() / Math.max(dt, 1e-4);
    lastEye.copy(eye);
    stillFor = moved < 0.35 ? stillFor + dt : 0;
    catchUp = Math.max(0, catchUp - dt);
    prevPos.copy(pos);

    if (mode === 'stay') {
      target.copy(stayAt);
      target.y = Math.max(target.y, groundFloor(target.x, target.z));
      const omega = 2.6;
      tmp.subVectors(target, pos).multiplyScalar(omega * omega).addScaledVector(vel, -2 * omega);
      vel.addScaledVector(tmp, dt);
      pos.addScaledVector(vel, dt);
      toRelative(pos, seen);
      rel.a = seen.a;
      rel.e = seen.e;
      rel.r = seen.r;
      rel.va = rel.ve = rel.vr = 0;
      occluded = Math.max(0, occluded - dt * 3);
      return;
    }

    const hf = halfFov();
    const aGoal = Math.atan(PLACE.x * hf.th);
    const eGoal = -Math.atan(-PLACE.y * hf.tv);

    if (moved > 40) {
      catchUp = 1.2;
      enterFromSide();
    } else {
      toRelative(pos, seen);
      const k = 1 - Math.exp(-dt * VIEW_LAG_RATE);
      rel.a += angleDelta(rel.a, seen.a) * k;
      rel.e += (seen.e - rel.e) * k;
      rel.r += (seen.r - rel.r) * k;
      if (Math.abs(rel.a) > Math.PI / 2 + 0.3) enterFromSide();
    }

    if (stillFor > 3 && mode === 'follow') {
      excursionTimer -= dt;
      if (excursionTimer <= 0) {
        excursionTimer = 2.5 + Math.random() * 2.5;
        excursionGoal.set((Math.random() - 0.4) * 10 * DEG, (Math.random() - 0.5) * 6 * DEG, (Math.random() - 0.4) * 0.8);
      }
    } else {
      excursionGoal.set(0, 0, 0);
      excursionTimer = 0.5;
    }
    excursion.lerp(excursionGoal, 1 - Math.exp(-dt * 1.3));

    const fast = riding || catchUp > 0;
    const omega = fast ? 7 : 4.2;
    spring('a', 'va', Math.max(RIGHT_MIN, aGoal + excursion.x), omega, dt);
    spring('e', 've', eGoal + excursion.y, omega, dt);
    if (rel.a < RIGHT_MIN) {
      rel.a = RIGHT_MIN;
      rel.va = Math.max(rel.va, 0);
    }
    spring('r', 'vr', PLACE.distance + excursion.z, fast ? 6 : 3, dt);
    rel.r = THREE.MathUtils.clamp(rel.r, MIN_DISTANCE, MAX_DISTANCE);
    rel.e = THREE.MathUtils.clamp(rel.e, -hf.v - 20 * DEG, hf.v);

    losTimer -= dt;
    if (losTimer <= 0 && ctx.physics?.raycast) {
      losTimer = 0.1;
      fromRelative(rel.a, rel.e, rel.r, target);
      tmp.subVectors(target, eye);
      const dist = tmp.length();
      const hit = ctx.physics.raycast(eye, tmp.normalize(), dist + 0.2, { exclude: ctx.physics.playerEntity });
      losLimit = hit ? hit.distance - 0.25 : Infinity;
    }
    let blocked = false;
    if (losLimit < rel.r) {
      if (losLimit >= MIN_DISTANCE) rel.r = losLimit;
      else blocked = true;
    }
    occluded = THREE.MathUtils.clamp(occluded + (blocked ? dt * 4 : -dt * 2), 0, 1);

    fromRelative(rel.a, rel.e, rel.r, pos);
    const floor = groundFloor(pos.x, pos.z);
    if (pos.y < floor) {
      pos.y = floor;
      tmp.subVectors(pos, eye);
      const h = Math.hypot(tmp.x, tmp.z);
      const dy = tmp.y;
      if (h > 1e-3 && h * h + dy * dy < MIN_DISTANCE * MIN_DISTANCE) {
        const k = Math.sqrt(Math.max(MIN_DISTANCE * MIN_DISTANCE - dy * dy, 0)) / h;
        pos.set(eye.x + tmp.x * k, pos.y, eye.z + tmp.z * k);
      }
      toRelative(pos, seen);
      if (Math.hypot(seen.a, seen.e) < CLEAR_ANGLE) {
        const a = Math.sqrt(Math.max(0, CLEAR_ANGLE * CLEAR_ANGLE - seen.e * seen.e));
        fromRelative(Math.max(seen.a, a), seen.e, seen.r, pos);
      }
    } else if (Math.hypot(rel.a, rel.e) < CLEAR_ANGLE) {
      rel.e = -Math.sqrt(Math.max(0, CLEAR_ANGLE * CLEAR_ANGLE - rel.a * rel.a));
      fromRelative(rel.a, rel.e, rel.r, pos);
    }
    vel.subVectors(pos, prevPos).divideScalar(Math.max(dt, 1e-4));
    if (vel.lengthSq() > 900) {
      vel.set(0, 0, 0);
      visual.reset(pos);
    }
  }

  function updateLook(dt) {
    const toViewer = tmp.subVectors(eye, pos);
    toViewer.y = 0;
    let face = Math.atan2(toViewer.x, toViewer.z);
    if (mode === 'follow' && !current) {
      const gaze = tmp2.copy(eye).addScaledVector(look, 12).sub(pos);
      const gazeYaw = Math.atan2(gaze.x, gaze.z) - Math.PI / 2;
      const wander = excursion.lengthSq() > 0.05 && stillFor > 3 ? 0.55 : 0.32;
      face += angleDelta(face, gazeYaw) * wander;
    }
    yaw += angleDelta(yaw, face) * (1 - Math.exp(-dt * 4));
    const lateral = vel.dot(right);
    bank += (THREE.MathUtils.clamp(-lateral * 0.22, -0.6, 0.6) - bank) * (1 - Math.exp(-dt * 5));
  }

  function updateVisual(dt) {
    dimSmooth += (dim - dimSmooth) * (1 - Math.exp(-dt * 2));
    const goal = mode === 'hidden' ? 0 : 1 - occluded;
    opacity += (goal - opacity) * (1 - Math.exp(-dt * (goal ? 4 : 3)));
    if (Math.abs(goal - opacity) < 0.002) opacity = goal;

    let speak = 0;
    if (current) speak = envelopeAt(current.sylls, current.t);
    let pitch = 0;
    let extraYaw = 0;
    let roll = 0;
    let dy = 0;
    let shrink = 1;
    if (emote) {
      emote.t += dt;
      const k = emote.t / emote.length;
      const fade = Math.sin(Math.min(1, k) * Math.PI);
      if (emote.kind === 'nod') {
        dy = -Math.abs(Math.sin(k * Math.PI * 2)) * 0.035;
        pitch = Math.sin(k * Math.PI * 2) * 0.3;
      } else if (emote.kind === 'shake') {
        extraYaw = Math.sin(k * Math.PI * 6) * 0.55 * (1 - k);
      } else if (emote.kind === 'spin') {
        const e = k < 1 ? 1 - Math.pow(1 - k, 3) : 1;
        roll = e * Math.PI * 2;
        dy = Math.sin(Math.min(1, k) * Math.PI) * 0.06;
      } else if (emote.kind === 'shy') {
        shrink = 1 - 0.3 * fade;
        dy = -0.04 * fade;
      }
      if (k >= 1) emote = null;
    }

    const bob = Math.sin(time * 1.7) * 0.018 + Math.sin(time * 0.63 + 1.3) * 0.01;
    visual.group.position.copy(pos);
    visual.group.position.y += bob + dy;
    euler.set(pitch + Math.sin(time * 1.1) * 0.05, yaw + extraYaw, bank + roll + Math.sin(time * 0.9) * 0.04);
    visual.group.quaternion.setFromEuler(euler);
    const pulse = speak * 0.18;
    const sx = (1 + pulse + Math.sin(time * 2.3) * 0.015) * shrink * (0.4 + 0.6 * opacity);
    const sy = (1 + speak * 0.28) * shrink * (0.4 + 0.6 * opacity);
    visual.body.scale.set(sx, sy, sy);

    const night = sharedUniforms.uNight.value;
    const dimK = 1 - dimSmooth * 0.72;
    const glow = (1.1 - night * 0.55) * dimK;
    visual.bodyMat.uniforms.uGlow.value = glow;
    visual.bodyMat.uniforms.uSpeak.value = speak;
    visual.bodyMat.uniforms.uOpacity.value = opacity;
    visual.bodyMat.uniforms.uSweep.value = current ? Math.sin(current.t * 5.0) * 0.8 : Math.sin(time * 0.7) * 0.9;
    visual.haloMat.uniforms.uGlow.value = (0.14 + night * 0.04 + speak * 0.14) * dimK * opacity;
    visual.group.visible = opacity > 0.01;

    const speed = vel.length();
    visual.updateTrail(dt, visual.group.position, visual.group.quaternion, speed, 0.45 * dimK * opacity);
    visual.trail.visible = opacity > 0.01;

    lightPos.copy(visual.group.position);
    if (light) light.intensity = (0.12 + night * 0.4 + speak * 0.2) * dimK * opacity;
  }

  function angleDelta(from, to) {
    return Math.atan2(Math.sin(to - from), Math.cos(to - from));
  }

  events.on('player:respawn', ({ reason } = {}) => {
    catchUp = 1.5;
    if (reason === 'water') companion.say('sea.drown', { priority: 1 });
    else if (reason === 'fall') companion.say('fall', { priority: 1 });
  });
  events.on('trace:found', ({ found, total } = {}) => {
    if (found === 1) companion.say('trace.first', { priority: 1 });
    else if (total && found >= total) companion.say('trace.all', { priority: 2 });
    else if (Math.random() < 1 / 3) companion.say('trace.any');
  });
  events.on('link:ride:start', () => {
    riding = true;
    if (spokenCount('link.first') === 0) companion.say('link.first', { priority: 1 });
    else if (Math.random() < 1 / 4) companion.say('link.ride');
  });
  events.on('link:ride:end', () => {
    riding = false;
    catchUp = 1;
  });
  events.on('scan:start', () => {
    scanKinds = new Set();
  });
  events.on('scan:hit', ({ kind } = {}) => {
    scanKinds.add(kind);
  });
  events.on('scan:end', () => {
    const t = now();
    if (scanKinds.has('human') && spokenCount('scan.human') < 3) {
      companion.say('scan.human', { priority: 1 });
    } else if (!scanKinds.has('human') && !scanKinds.has('hallucination') && !scanKinds.has('beacon') && t - lastNothing >= NOTHING_COOLDOWN) {
      lastNothing = t;
      companion.say('scan.nothing');
    }
  });

  return companion;
}
