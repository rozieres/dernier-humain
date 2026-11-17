import * as THREE from 'three';
import { slabGeometry } from './geo.js';

const GHOST_TIME = 9;
const SOLID_TIME = 9;
const BOB = 0.04;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const REAL_TINT = new THREE.Color(1, 1, 1);
const VERIFIED_TINT = new THREE.Color('#ffe6c4').multiplyScalar(1.12);
const MINT_TINT = new THREE.Color('#6ff5c6').multiplyScalar(1.3);

export function createStones(ctx, { material, ghostMaterial, slabs, onFirstReveal }) {
  const { physics, scanner, audio } = ctx;
  const geo = slabGeometry({ seed: 3, depth: 2.1, rough: 0.11, segs: 22 });
  const n = slabs.length;
  const solid = new THREE.InstancedMesh(geo, material, n);
  solid.name = 'hallu:slabs';
  solid.castShadow = true;
  solid.receiveShadow = true;
  const ghostGeo = geo.clone();
  const ghostAttr = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  ghostAttr.setUsage(THREE.DynamicDrawUsage);
  ghostGeo.setAttribute('aGhost', ghostAttr);
  const ghost = new THREE.InstancedMesh(ghostGeo, ghostMaterial, n);
  ghost.name = 'hallu:slab-ghosts';
  ghost.renderOrder = 4;
  solid.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ghost.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const tint = new THREE.Color();
  const UP = new THREE.Vector3(0, 1, 0);
  const groups = new Map();
  let clock = 0;
  let revealedOnce = false;

  const list = slabs.map((d, i) => {
    const e = {
      ...d, index: i, phase: d.kind === 'hidden' ? 'gone' : d.kind === 'fake' ? 'idle' : 'solid',
      t: 0, fade: 1, flicker: 1, verified: 0, tell: 3 + ((i * 7.13) % 9), blink: 0, jitter: 0,
      seed: (i * 1.618) % 6.283, quat: new THREE.Quaternion().setFromAxisAngle(UP, d.yaw || 0),
      scale: d.scale || 1, collider: null,
    };
    if (d.kind !== 'fake') {
      e.collider = physics.addStaticBox({
        position: [d.pos[0], d.pos[1] - 0.3, d.pos[2]], size: [2.7 * e.scale, 0.6, 2.7 * e.scale], quaternion: e.quat,
        userData: { surface: 'stone', hallu: d.kind },
      });
    }
    if (!groups.has(d.group)) groups.set(d.group, { id: d.group, members: [], center: new THREE.Vector3(), kind: 'hallucination' });
    const g = groups.get(d.group);
    g.members.push(e);
    if (d.kind === 'hidden') g.kind = 'hidden';
    return e;
  });

  for (const g of groups.values()) {
    for (const e of g.members) g.center.add(p.fromArray(e.pos));
    g.center.divideScalar(g.members.length);
    g.center.y -= 0.4;
    g.handle = scanner.register({ position: g.center, kind: g.kind, marker: false, onScan: () => reveal(g) });
  }

  function reveal(g) {
    let shown = false;
    for (const e of g.members) {
      if (e.kind === 'fake') {
        if (e.phase === 'ghost') e.t = 0;
        else if (e.phase === 'idle' || e.phase === 'return') {
          e.phase = 'glitch';
          e.t = 0;
          shown = true;
        }
      } else if (e.kind === 'hidden') {
        if (e.phase === 'solid' || e.phase === 'appear') e.t = Math.min(e.t, 0.2);
        else {
          e.phase = 'appear';
          e.t = 0;
          e.fade = 0;
          shown = true;
        }
      } else e.verified = GHOST_TIME;
    }
    if (shown) {
      audio.sfx('hallu.reveal', { position: g.center, volume: 0.7 });
      if (!revealedOnce) {
        revealedOnce = true;
        onFirstReveal?.();
      }
    }
  }

  function step(e, dt) {
    e.t += dt;
    if (e.verified > 0) e.verified = Math.max(0, e.verified - dt);
    if (e.blink > 0) e.blink--;
    if (e.jitter > 0) e.jitter--;
    switch (e.phase) {
      case 'idle':
        e.tell -= dt;
        if (e.tell <= 0) {
          e.tell = 5 + Math.random() * 11;
          if (Math.random() < 0.5) e.blink = 1;
          else e.jitter = 2;
        }
        break;
      case 'glitch':
        e.fade = 0.4 + Math.random() * 0.6;
        e.flicker = 0.4 + Math.random() * 1.4;
        e.jitter = 1;
        if (e.t >= 0.45) {
          e.phase = 'ghost';
          e.t = 0;
          e.fade = 0.3;
        }
        break;
      case 'ghost':
        e.fade = Math.min(1, e.fade + dt * 2.5);
        e.flicker = 0.88 + 0.12 * Math.sin(e.t * 31) * Math.sin(e.t * 7.3);
        if (e.t >= GHOST_TIME) {
          e.phase = 'return';
          e.t = 0;
        }
        break;
      case 'return':
        e.flicker = 0.5 + Math.random();
        if (e.t >= 0.5) {
          e.phase = 'idle';
          e.t = 0;
          e.fade = 1;
          e.flicker = 1;
        }
        break;
      case 'appear':
        e.fade = Math.min(1, e.t / 0.8);
        e.flicker = 0.9 + 0.1 * Math.sin(e.t * 40);
        if (e.t >= 0.8) {
          e.phase = 'solid';
          e.t = 0;
        }
        break;
      case 'solid':
        if (e.kind === 'hidden' && e.t >= SOLID_TIME) {
          e.phase = 'vanish';
          e.t = 0;
        }
        break;
      case 'vanish':
        e.fade = 1 - Math.min(1, e.t / 1.2);
        e.flicker = 0.8 + 0.2 * Math.sin(e.t * 50);
        if (e.t >= 1.2) {
          e.phase = 'gone';
          e.t = 0;
        }
        break;
      default:
        break;
    }
  }

  function write(e) {
    const bob = Math.sin(clock * 0.7 + e.seed) * BOB + Math.sin(clock * 1.9 + e.seed * 2) * BOB * 0.3;
    p.set(e.pos[0] + (e.jitter ? (Math.random() - 0.5) * 0.08 : 0), e.pos[1] + bob, e.pos[2]);
    s.setScalar(e.scale);
    q.copy(e.quat);
    m4.compose(p, q, s);
    let showSolid = false;
    let showGhost = false;
    let hue = 0;
    switch (e.phase) {
      case 'idle':
        showSolid = e.blink === 0;
        break;
      case 'glitch':
        showSolid = Math.random() > 0.45 + e.t;
        showGhost = !showSolid;
        break;
      case 'ghost':
        showGhost = true;
        break;
      case 'return':
        showSolid = Math.random() > 0.6 - e.t;
        showGhost = !showSolid;
        break;
      case 'appear':
      case 'vanish':
        showGhost = true;
        hue = 1;
        break;
      case 'solid':
        showSolid = true;
        if (e.kind === 'hidden') {
          showGhost = true;
          hue = 1;
          e.fade = 1;
          e.flicker = 0.35;
        }
        if (e.kind === 'hidden' && e.t < 0.2) {
          showSolid = Math.random() > 0.5 - e.t * 2.5;
          showGhost = !showSolid;
          hue = 1;
        }
        break;
      default:
        break;
    }
    solid.setMatrixAt(e.index, showSolid ? m4 : ZERO);
    ghost.setMatrixAt(e.index, showGhost ? m4 : ZERO);
    if (e.kind === 'hidden') tint.copy(MINT_TINT);
    else tint.copy(REAL_TINT).lerp(VERIFIED_TINT, Math.min(1, e.verified / 1.5) * (e.kind === 'real' ? 1 : 0));
    solid.setColorAt(e.index, tint);
    ghostAttr.setXYZ(e.index, showGhost ? e.fade : 0, e.flicker, hue);
  }

  function update(dt) {
    clock += dt;
    let ghosts = false;
    for (const e of list) {
      step(e, dt);
      write(e);
      if (e.kind !== 'real' && e.phase !== 'idle' && e.phase !== 'gone') ghosts = true;
    }
    ghost.visible = ghosts;
    solid.instanceMatrix.needsUpdate = true;
    ghost.instanceMatrix.needsUpdate = true;
    if (solid.instanceColor) solid.instanceColor.needsUpdate = true;
    ghostAttr.needsUpdate = true;
  }

  update(0);
  const sphere = new THREE.Sphere();
  for (const e of list) sphere.center.add(p.fromArray(e.pos));
  sphere.center.divideScalar(Math.max(1, n));
  for (const e of list) sphere.radius = Math.max(sphere.radius, sphere.center.distanceTo(p.fromArray(e.pos)) + 4);
  solid.boundingSphere = sphere;
  ghost.boundingSphere = sphere.clone();

  return {
    meshes: [solid, ghost],
    list,
    groups,
    update,
    reveal,
    revealAll(kind) {
      for (const g of groups.values()) if (!kind || g.kind === kind) reveal(g);
    },
  };
}
