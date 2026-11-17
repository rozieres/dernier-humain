import * as THREE from 'three';
import { BEACON_ZONES } from '../core/state.js';
import { sharedUniforms } from '../core/glsl.js';
import { createAtlas } from './actors/atlas.js';
import {
  RING_Y, SCREEN, pylonGeometry, pylonMaterial, ringGeometry, ringMaterial, screenMaterial,
  beamGeometry, beamMaterial, emberMaterial,
} from './actors/beacon-gfx.js';

const CAPACITY = BEACON_ZONES.length;
const EMBERS = 36;
const STATUS_LINE = {
  locked: 'HORS LIGNE',
  ready: 'SIGNAL RETROUVÉ — PRÊTE À RALLUMER',
  active: 'EN LIGNE — 1 VISITEUR',
};
const PHOSPHOR = { locked: '#6f8f7a', ready: '#ffb454', active: '#ffc978' };
const LABEL = { locked: 'Balise éteinte', ready: 'Rallumer la balise', active: 'Relire' };
const UP = new THREE.Vector3(0, 1, 0);

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const easeOut = (t) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

export default async function create(ctx) {
  const { scene, state, events, camera } = ctx;

  const atlas = createAtlas(ctx, { cols: 2, rows: 3, cellW: 512, cellH: 384 });
  const pylonMat = pylonMaterial(ctx);
  const pylons = new THREE.InstancedMesh(pylonGeometry(), pylonMat, CAPACITY);
  pylons.name = 'beacons:pylons';
  pylons.castShadow = true;
  pylons.receiveShadow = true;
  pylons.count = 0;

  const ringGeo = ringGeometry();
  const ringGlow = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 2), 2);
  ringGlow.setUsage(THREE.DynamicDrawUsage);
  ringGeo.setAttribute('aGlow', ringGlow);
  const rings = new THREE.InstancedMesh(ringGeo, ringMaterial(ctx), CAPACITY);
  rings.name = 'beacons:rings';
  rings.castShadow = true;
  rings.count = 0;
  rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const screenGeo = new THREE.PlaneGeometry(SCREEN.w, SCREEN.h);
  const screenRect = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
  const screenState = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
  screenState.setUsage(THREE.DynamicDrawUsage);
  screenGeo.setAttribute('aRect', screenRect);
  screenGeo.setAttribute('aScreen', screenState);
  const screens = new THREE.InstancedMesh(screenGeo, screenMaterial(ctx, atlas.texture), CAPACITY);
  screens.name = 'beacons:screens';
  screens.count = 0;

  const beamGeo = beamGeometry();
  const beamState = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
  beamState.setUsage(THREE.DynamicDrawUsage);
  beamGeo.setAttribute('aBeam', beamState);
  const beams = new THREE.InstancedMesh(beamGeo, beamMaterial(ctx), CAPACITY);
  beams.name = 'beacons:beams';
  beams.count = 0;
  beams.frustumCulled = false;
  beams.renderOrder = 6;

  const emberGeo = new THREE.BufferGeometry();
  const emberPos = new THREE.BufferAttribute(new Float32Array(CAPACITY * EMBERS * 3), 3);
  const emberSeed = new THREE.BufferAttribute(new Float32Array(CAPACITY * EMBERS * 4), 4);
  const emberAmount = new THREE.BufferAttribute(new Float32Array(CAPACITY * EMBERS), 1);
  emberAmount.setUsage(THREE.DynamicDrawUsage);
  emberGeo.setAttribute('position', emberPos);
  emberGeo.setAttribute('aSeed', emberSeed);
  emberGeo.setAttribute('aAmount', emberAmount);
  emberGeo.setDrawRange(0, 0);
  const emberMat = emberMaterial(ctx);
  const embers = new THREE.Points(emberGeo, emberMat);
  embers.name = 'beacons:embers';
  embers.frustumCulled = false;
  embers.renderOrder = 5;

  scene.add(pylons, rings, screens, beams, embers);

  const list = [];
  const byZone = new Map();
  const m4 = new THREE.Matrix4();
  const m4b = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const size = new THREE.Vector2();
  let sequence = null;

  function drawScreen(b) {
    const zone = ctx.texts.ZONES?.[b.zone];
    atlas.draw(b.index, {
      style: 'terminal',
      title: 'Anneau des derniers sites',
      body: [zone?.name || b.zone, `site ${BEACON_ZONES.indexOf(b.zone) + 1}/5`, `> ${STATUS_LINE[b.status]}`],
      footer: b.status === 'active' ? 'ANNEAU:\\>' : b.status === 'ready' ? 'RALLUMER ? (O/N)' : '...',
      accent: PHOSPHOR[b.status],
      seed: b.index * 7 + 1,
    });
  }

  function applyStatus(b, { instant = true } = {}) {
    drawScreen(b);
    if (b.interact) b.interact.label = LABEL[b.status];
    const active = b.status === 'active';
    if (instant) {
      b.beamLen = active ? 1 : 0;
      b.ringPower = active ? 1.6 : 0;
    }
    if (b.status === 'ready' && !b.hum) {
      b.hum = ctx.audio.loop('server', { position: b.ringPos, volume: 0.55, refDistance: 3, maxDistance: 35, fade: 2 });
    } else if (b.status !== 'ready' && b.hum) {
      b.hum.stop?.(1.5);
      b.hum = null;
    }
    if (active && b.scan) {
      b.scan.remove?.();
      b.scan = null;
    }
  }

  function syncFromState() {
    for (const b of list) {
      const status = state.beacons[b.zone];
      if (status !== b.status && !(sequence && sequence.beacon === b)) {
        b.status = status;
        applyStatus(b);
      }
    }
  }

  function writeInstance(b, dt) {
    const t = ctx.time.now;
    let glow = 0;
    let pulse = 0;
    let screenBright = 0.28;
    let staticAmt = 1;
    let emberAmt = 0;
    if (b.status === 'locked') {
      glow = 0.02;
      screenBright = 0.7 + 0.08 * Math.sin(t * 0.7 + b.index);
      staticAmt = 0.55;
    } else if (b.status === 'ready') {
      const p = 0.5 + 0.5 * Math.sin(t * 2.4 + b.index);
      glow = 0.5 + 1.6 * p * p;
      pulse = 1;
      screenBright = 1.1;
      staticAmt = 0.25;
      emberAmt = 1;
    } else {
      glow = b.ringPower;
      pulse = 0.3;
      screenBright = 1.25;
      staticAmt = 0.05;
      emberAmt = 0.45;
    }
    if (sequence && sequence.beacon === b) {
      glow = sequence.ringGlow;
      emberAmt = sequence.embers;
      screenBright = 1.3;
      staticAmt = sequence.staticAmt;
    }
    b.spinSpeed += ((sequence && sequence.beacon === b ? sequence.spin : b.status === 'active' ? 0.25 : b.status === 'ready' ? 0.5 : 0) - b.spinSpeed) * (1 - Math.exp(-dt * 2));
    b.spin += b.spinSpeed * dt;
    if (b.status === 'locked') b.spin += (Math.round(b.spin / Math.PI) * Math.PI - b.spin) * (1 - Math.exp(-dt * 1.5));

    ringGlow.setXY(b.index, glow, pulse);
    qb.setFromAxisAngle(UP, b.spin);
    m4b.compose(b.ringLocal, qb, one);
    m4.multiplyMatrices(b.matrix, m4b);
    rings.setMatrixAt(b.index, m4);
    screenState.setXYZW(b.index, screenBright, staticAmt, 0, 0);
    beamState.setXYZW(b.index, b.beamLen, b.status === 'active' || b.beamLen > 0 ? 1 : 0, b.seed, sequence?.beacon === b ? sequence.flare : 0);
    for (let k = 0; k < EMBERS; k++) emberAmount.setX(b.index * EMBERS + k, emberAmt);
    if (b.light) b.light.intensity = glow * (1.2 + sharedUniforms.uNight.value * 2.2) + (sequence?.beacon === b ? sequence.flare * 30 : 0);
  }

  function wait(seconds) {
    return new Promise((resolve) => {
      sequence.waits.push({ t: seconds, resolve });
    });
  }

  function cameraRig(b) {
    const front = new THREE.Vector3(0, 0, 1).applyQuaternion(b.yawQ);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(b.yawQ);
    const base = b.position;
    const ground = (p) => Math.max(ctx.world.heightAt(p.x, p.z), ctx.world.SEA_LEVEL);
    const at = (dist, sideK, height, out) => {
      out.copy(base).addScaledVector(front, dist).addScaledVector(side, dist * sideK);
      out.y = ground(out) + height;
      return out;
    };
    return { front, side, at };
  }

  async function activate(zone) {
    const b = byZone.get(zone);
    if (!b || b.status !== 'ready' || sequence) return false;
    state.setBeacon(zone, 'active');
    b.status = 'active';
    applyStatus(b, { instant: false });
    const prevMode = state.mode;
    state.setMode('cinematic');
    ctx.postfx.setLetterbox(1, 0.6);

    const rig = cameraRig(b);
    const camPos = rig.at(4.8, 0.5, 0.4, new THREE.Vector3());
    const camTarget = b.ringPos.clone();
    const usePlayer = ctx.has('player') && !ctx.debug.flycam?.enabled;
    sequence = {
      beacon: b, t: 0, waits: [], spin: 0.5, ringGlow: 0.6, embers: 1, flare: 0, staticAmt: 0.3,
      camPos, camTarget, fov: 58, usePlayer,
      saved: { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov },
      track: null,
    };
    if (usePlayer) ctx.player.cinematic({ position: camPos, target: camTarget, fov: 58, blend: 1.2 });

    const s = sequence;
    const startPos = camPos.clone();
    const closePos = rig.at(3.8, 0.35, 0.35, new THREE.Vector3());
    const widePos = rig.at(15, 0.6, 1.6, new THREE.Vector3());
    s.track = (t) => {
      if (t < 3.2) {
        const k = ease(t / 3.2);
        camPos.lerpVectors(startPos, closePos, k);
        camTarget.copy(b.ringPos);
        camTarget.y += k * 0.2;
        s.spin = 0.5 + 14 * k * k;
        s.ringGlow = 0.6 + 3.4 * k * k;
        s.embers = 1 + 2 * k;
        s.staticAmt = 0.3 * (1 - k);
      } else if (t < 5.4) {
        const k = (t - 3.2) / 2.2;
        camPos.copy(closePos);
        camTarget.copy(b.ringPos);
        camTarget.y += 0.2 + easeOut(k) * 9;
        s.spin = 14 - 10 * k;
        s.ringGlow = 3.2 - 1.2 * k;
        s.embers = 3 - 2 * k;
      } else {
        const k = ease((t - 5.4) / 3.6);
        camPos.lerpVectors(closePos, widePos, k);
        camTarget.copy(b.ringPos);
        camTarget.y += THREE.MathUtils.lerp(9.2, 3.2, ease(k * 1.3));
        s.spin = 4 - 3.75 * k;
        s.ringGlow = 2 - 0.4 * k;
        s.embers = 1 - 0.55 * k;
      }
      if (t >= 3.2) b.beamLen = easeOut((t - 3.2) / 1.4);
      s.flare = t >= 3.2 ? Math.exp(-(t - 3.2) * 2.2) : 0;
    };

    await wait(3.2);
    ctx.audio.sfx('beacon.activate', { position: b.ringPos });
    ctx.postfx.flash('#ffb454', 0.5);
    ctx.particles.burst({ position: b.ringPos, count: 70, color: '#ffb454', color2: '#fff1d6', shape: 'ember', speed: [2, 7], spread: 1, life: [0.8, 2.2], size: [0.04, 0.12], gravity: -1, drag: 0.6 });
    ctx.particles.burst({ position: b.ringPos, count: 30, color: '#ffb454', shape: 'glyph', speed: [1, 3.5], direction: UP, spread: 0.7, life: [1.5, 3], size: [0.08, 0.16], gravity: 0.8, drag: 0.4 });
    await wait(2.2);
    const count = BEACON_ZONES.filter((z) => state.beacons[z] === 'active').length;
    events.emit('beacon:activated', { zone, count });
    await wait(3.6);

    b.beamLen = 1;
    b.ringPower = 1.6;
    if (usePlayer) ctx.player.cinematic(null);
    else {
      camera.position.copy(s.saved.pos);
      camera.quaternion.copy(s.saved.quat);
      camera.fov = s.saved.fov;
      camera.updateProjectionMatrix();
    }
    ctx.postfx.setLetterbox(0, 0.6);
    sequence = null;
    state.setMode(prevMode === 'cinematic' ? 'playing' : prevMode);
    await ctx.ui.reader.open(ctx.texts.BEACON_DOCS?.[zone]);
    state.save();
    return true;
  }

  function onInteract(b) {
    if (b.status === 'locked') {
      const hint = ctx.texts.HINTS?.[b.zone]?.[0];
      if (hint) ctx.companion.say(hint, { priority: 1, interrupt: true });
    } else if (b.status === 'ready') {
      activate(b.zone);
    } else {
      ctx.ui.reader.open(ctx.texts.BEACON_DOCS?.[b.zone]);
    }
  }

  const blend = new THREE.Vector3();
  const lookM = new THREE.Matrix4();
  const lookQ = new THREE.Quaternion();
  const startQ = new THREE.Quaternion();

  const beacons = {
    get(zone) {
      return byZone.get(zone) || null;
    },
    get activating() {
      return sequence ? sequence.beacon.zone : null;
    },

    create(zone, { position, rotationY = 0 } = {}) {
      if (!BEACON_ZONES.includes(zone)) throw new Error(`[beacons] unknown zone "${zone}"`);
      if (byZone.has(zone)) throw new Error(`[beacons] beacon "${zone}" created twice`);
      const index = list.length;
      const p = Array.isArray(position) ? new THREE.Vector3().fromArray(position) : new THREE.Vector3().copy(position);
      const r = ctx.rng.seeded(`beacon:${zone}`);
      const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, rotationY);
      const tiltAxis = new THREE.Vector3(r() - 0.5, 0, r() - 0.5).normalize();
      const tiltQ = new THREE.Quaternion().setFromAxisAngle(tiltAxis, THREE.MathUtils.degToRad(1.6 + r() * 1.6));
      const quat = tiltQ.clone().multiply(yawQ);
      const sunk = p.clone();
      sunk.y -= 0.08;
      const matrix = new THREE.Matrix4().compose(sunk, quat, one);

      const group = new THREE.Group();
      group.name = `beacon:${zone}`;
      group.position.copy(sunk);
      group.quaternion.copy(quat);
      scene.add(group);
      group.updateMatrixWorld(true);

      const ringLocal = new THREE.Vector3(0, RING_Y, 0);
      const ringPos = ringLocal.clone().applyMatrix4(matrix);
      const b = {
        zone, index, group, position: p, matrix, yawQ, ringLocal, ringPos,
        status: state.beacons[zone] || 'locked', seed: r(), spin: 0, spinSpeed: 0, beamLen: 0, ringPower: 0,
        scan: null, signal: null, light: null, interact: null, hum: null, collider: null,
      };
      list.push(b);
      byZone.set(zone, b);

      pylons.setMatrixAt(index, matrix);
      m4b.makeTranslation(0, SCREEN.y, SCREEN.z);
      m4.multiplyMatrices(matrix, m4b);
      screens.setMatrixAt(index, m4);
      m4.makeTranslation(ringPos.x, ringPos.y, ringPos.z);
      beams.setMatrixAt(index, m4);
      const rect = atlas.rect(index);
      screenRect.setXYZW(index, rect.x, rect.y, rect.z, rect.w);
      screenRect.needsUpdate = true;
      for (let k = 0; k < EMBERS; k++) {
        const e = index * EMBERS + k;
        emberPos.setXYZ(e, ringPos.x, ringPos.y - 0.2, ringPos.z);
        emberSeed.setXYZW(e, (k + r()) / EMBERS, r(), r(), r());
      }
      emberPos.needsUpdate = true;
      emberSeed.needsUpdate = true;
      pylons.count = rings.count = screens.count = beams.count = list.length;
      emberGeo.setDrawRange(0, list.length * EMBERS);
      for (const mesh of [pylons, screens, beams]) mesh.instanceMatrix.needsUpdate = true;
      pylons.computeBoundingSphere();
      screens.computeBoundingSphere();

      b.collider = ctx.physics.addStaticCylinder({ position: [p.x, p.y + 1.2, p.z], radius: 0.6, height: 2.4, userData: { beacon: zone } });
      const zoneName = ctx.texts.ZONES?.[zone]?.name || zone;
      if (b.status !== 'active') b.scan = ctx.scanner.register({ position: ringPos, kind: 'beacon', label: `Balise — ${zoneName}` });
      b.signal = ctx.scanner.addSignal({ position: ringPos, active: () => b.status !== 'active', strength: 1 });
      b.light = ctx.env.lights.add({ position: ringPos.clone(), color: '#ffb454', intensity: 0, distance: 16 });
      const front = new THREE.Vector3(0, 1.4, 0.6).applyMatrix4(matrix);
      b.interact = ctx.interact.add({
        id: `beacon:${zone}`, position: front, radius: 3.2, label: LABEL[b.status], onInteract: () => onInteract(b),
      });
      applyStatus(b);
      writeInstance(b, 0);
      return {
        group, zone,
        get status() {
          return b.status;
        },
        position: p,
        ringPosition: ringPos,
      };
    },

    setReady(zone) {
      if (state.beacons[zone] !== 'locked') return false;
      state.setBeacon(zone, 'ready');
      const b = byZone.get(zone);
      if (b) {
        b.status = 'ready';
        applyStatus(b);
      }
      events.emit('beacon:ready', { zone });
      return true;
    },

    activate,

    frame(dt) {
      ctx.renderer.getDrawingBufferSize(size);
      emberMat.uniforms.uScale.value = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      if (sequence) {
        const s = sequence;
        s.t += dt;
        for (let i = s.waits.length - 1; i >= 0; i--) {
          s.waits[i].t -= dt;
          if (s.waits[i].t <= 0) s.waits.splice(i, 1)[0].resolve();
        }
        s.track(s.t);
        if (!s.usePlayer) {
          const w = ease(Math.min(1, s.t / 1.2));
          blend.lerpVectors(s.saved.pos, s.camPos, w);
          camera.position.copy(blend);
          lookM.lookAt(s.camPos, s.camTarget, UP);
          lookQ.setFromRotationMatrix(lookM);
          startQ.copy(s.saved.quat);
          camera.quaternion.slerpQuaternions(startQ, lookQ, w);
          camera.fov = THREE.MathUtils.lerp(s.saved.fov, s.fov, w);
          camera.updateProjectionMatrix();
        }
      }
      for (const b of list) writeInstance(b, dt);
      if (list.length) {
        ringGlow.needsUpdate = true;
        rings.instanceMatrix.needsUpdate = true;
        screenState.needsUpdate = true;
        beamState.needsUpdate = true;
        emberAmount.needsUpdate = true;
      }
    },
  };

  events.on('stage:change', syncFromState);
  return beacons;
}
