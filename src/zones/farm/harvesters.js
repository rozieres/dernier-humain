import * as THREE from 'three';
import { Parts, lathe, rod, beam } from './kit.js';
import { LOOPS, SCARECROW, HARVESTER_SPEED } from './layout.js';

const PI = Math.PI;
const WHITE = '#f4f6fb';
const PEARL = '#e1e6ef';
const TYRE = '#22262d';
const CYAN = '#5ce1e6';
const MAGENTA = '#ff5fa2';
export const HALF = { x: 2.25, y: 1.8, z: 4.25 };
const GROUND = -HALF.y;
const REEL = new THREE.Vector3(0, GROUND + 1.55, -4.15);

function bodyGeometry() {
  const P = new Parts(601);
  const W = { color: WHITE, vary: 0.02 };
  P.box(3.0, 1.5, 5.4, { radius: 0.5, segments: 4, pos: [0, GROUND + 1.55, 0.5], ...W });
  P.box(3.2, 1.7, 3.6, { radius: 0.75, segments: 5, pos: [0, GROUND + 2.85, 1.25], ...W });
  P.box(2.3, 1.55, 1.9, { radius: 0.35, segments: 4, pos: [0, GROUND + 2.75, -1.35], color: '#151c27', metal: 0.25, vary: 0.02 });
  P.box(2.55, 0.22, 2.2, { radius: 0.1, segments: 2, pos: [0, GROUND + 3.58, -1.3], color: PEARL, vary: 0.02 });
  P.box(1.5, 0.95, 1.7, { radius: 0.3, segments: 3, pos: [0, GROUND + 1.25, -2.7], ...W });
  P.box(4.5, 0.55, 1.2, { radius: 0.22, segments: 3, pos: [0, GROUND + 0.78, -3.55], color: PEARL, vary: 0.02 });
  for (const sx of [-1, 1]) {
    const tip = new THREE.ConeGeometry(0.26, 1.0, 16);
    tip.rotateX(-PI / 2);
    P.add(tip, { pos: [sx * 2.1, GROUND + 0.75, -4.55], ...W });
    beam(P, [sx * 1.25, GROUND + 2.0, -1.8], [sx * 2.05, GROUND + 1.6, -4.1], 0.16, 0.22, { color: PEARL, vary: 0.02 });
    for (const [wz, wr, ww] of [[-1.15, 0.98, 0.72], [2.65, 0.68, 0.5]]) {
      const tyre = lathe([[wr - 0.32, -ww / 2], [wr - 0.05, -ww / 2], [wr, -ww / 2 + 0.08], [wr + 0.02, 0], [wr, ww / 2 - 0.08], [wr - 0.05, ww / 2], [wr - 0.32, ww / 2]], 40);
      tyre.rotateZ(PI / 2);
      P.add(tyre, { pos: [sx * (1.6 + ww / 2 - 0.1), GROUND + wr, wz], color: TYRE, vary: 0.05 });
      const hub = lathe([[0, -ww / 2 + 0.06], [wr - 0.3, -ww / 2 + 0.06], [wr - 0.32, -ww / 2 + 0.1], [wr * 0.4, -ww / 2 + 0.02], [0, -ww / 2]], 32);
      hub.rotateZ(sx > 0 ? PI / 2 : -PI / 2);
      P.add(hub, { pos: [sx * (1.6 + ww - 0.12), GROUND + wr, wz], color: PEARL, vary: 0.02 });
    }
  }
  rod(P, [-1.3, GROUND + 3.4, 1.9], [-3.1, GROUND + 3.9, 0.4], 0.17, { color: PEARL, vary: 0.02 }, 12);
  rod(P, [-3.1, GROUND + 3.9, 0.4], [-3.25, GROUND + 3.35, 0.25], 0.15, { color: PEARL, vary: 0.02 }, 12);
  P.box(2.2, 0.6, 0.6, { radius: 0.2, segments: 2, pos: [0, GROUND + 1.25, 3.55], color: PEARL, vary: 0.02 });
  P.add(lathe([[0, 0], [0.22, 0], [0.24, 0.12], [0.18, 0.2], [0, 0.22]], 16), { pos: [0, GROUND + 3.68, -0.7], color: '#c7ced9' });
  return P.build();
}

function glowGeometry() {
  const P = new Parts(602);
  for (const sx of [-1, 1]) {
    P.box(0.05, 0.08, 4.6, { radius: 0.02, pos: [sx * 1.52, GROUND + 1.55, 0.6], color: CYAN, vary: 0 });
    P.box(0.05, 0.06, 2.9, { radius: 0.02, pos: [sx * 1.62, GROUND + 2.6, 1.3], color: MAGENTA, vary: 0 });
    P.box(0.5, 0.12, 0.05, { radius: 0.03, pos: [sx * 0.75, GROUND + 3.3, -2.32], color: '#ffffff', vary: 0 });
  }
  P.add(new THREE.SphereGeometry(0.16, 12, 8), { pos: [0, GROUND + 3.9, -0.7], color: MAGENTA, vary: 0 });
  P.box(3.6, 0.06, 0.05, { radius: 0.02, pos: [0, GROUND + 0.55, -4.17], color: CYAN, vary: 0 });
  return P.build();
}

function reelGeometry() {
  const P = new Parts(603);
  rod(P, [-2.2, 0, 0], [2.2, 0, 0], 0.12, { color: '#c4cbd7', metal: 0.5 }, 12);
  for (const x of [-2.05, 0, 2.05]) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      beam(P, [x, 0, 0], [x, Math.sin(a) * 0.86, Math.cos(a) * 0.86], 0.06, 0.06, { color: '#c4cbd7', metal: 0.5 });
    }
    const ring = new THREE.TorusGeometry(0.86, 0.04, 6, 32);
    ring.rotateY(PI / 2);
    P.add(ring.translate(x, 0, 0), { color: WHITE });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    rod(P, [-2.15, Math.sin(a) * 0.86, Math.cos(a) * 0.86], [2.15, Math.sin(a) * 0.86, Math.cos(a) * 0.86], 0.055, { color: WHITE, vary: 0.02 }, 8);
  }
  return P.build();
}

function teethGeometry() {
  const P = new Parts(604);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    for (let k = 0; k < 15; k++) {
      const x = -2.0 + k * (4 / 14);
      const g = new THREE.BoxGeometry(0.035, 0.28, 0.035);
      g.translate(0, 0.98, 0);
      g.rotateX(-a);
      P.add(g, { pos: [x, 0, 0], color: k % 2 ? CYAN : MAGENTA, vary: 0 });
    }
  }
  return P.build();
}

function loopCurve(world, spec, index) {
  const pts = [];
  const n = 24;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * PI * 2;
    const w = 1 + (spec.wobble / spec.a) * Math.sin(t * 3 + index * 1.7);
    const lx = Math.cos(t) * spec.a * w;
    const lz = Math.sin(t) * spec.b * w;
    const c = Math.cos(spec.rot);
    const s = Math.sin(spec.rot);
    const x = SCARECROW.x + lx * c - lz * s;
    const z = SCARECROW.z + lx * s + lz * c;
    pts.push(new THREE.Vector3(x, world.heightAt(x, z), z));
  }
  if (spec.dir < 0) pts.reverse();
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal');
}

export function createHarvesters(ctx, materials) {
  const { world, physics, scene } = ctx;
  const geos = { body: bodyGeometry(), glow: glowGeometry(), reel: reelGeometry(), teeth: teethGeometry() };
  const count = LOOPS.length;
  const meshes = {
    body: new THREE.InstancedMesh(geos.body, materials.synth, count),
    glow: new THREE.InstancedMesh(geos.glow, materials.glow, count),
    reel: new THREE.InstancedMesh(geos.reel, materials.synth, count),
    teeth: new THREE.InstancedMesh(geos.teeth, materials.glow, count),
  };
  meshes.body.castShadow = true;
  meshes.body.receiveShadow = true;
  meshes.reel.castShadow = true;
  const group = new THREE.Group();
  group.name = 'farm:harvesters';
  for (const m of Object.values(meshes)) {
    m.frustumCulled = false;
    group.add(m);
  }
  scene.add(group);

  const tmpP = new THREE.Vector3();
  const tmpT = new THREE.Vector3();
  const tmpA = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const list = LOOPS.map((spec, i) => {
    const curve = loopCurve(world, spec, i);
    const length = curve.getLength();
    const proxy = new THREE.Object3D();
    const h = {
      index: i, curve, length, u: spec.phase, proxy,
      position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), roll: 0, reel: 0,
      chute: new THREE.Vector3(), chuteDir: new THREE.Vector3(0, 0.4, 1), hitCooldown: 0, sound: null,
    };
    pose(h, 0);
    proxy.position.copy(h.position);
    proxy.quaternion.copy(h.quaternion);
    h.entity = physics.addKinematic(proxy, { shape: 'box', size: [HALF.x * 2, HALF.y * 2, HALF.z * 2], userData: { kind: 'harvester', surface: 'metal' } });
    return h;
  });

  function pose(h, dt) {
    h.u = (h.u + (HARVESTER_SPEED * dt) / h.length) % 1;
    h.curve.getPointAt(h.u, tmpP);
    h.curve.getTangentAt(h.u, tmpT);
    const ahead = h.curve.getTangentAt((h.u + 3 / h.length) % 1, tmpA);
    const turn = Math.atan2(tmpT.x * ahead.z - tmpT.z * ahead.x, tmpT.x * ahead.x + tmpT.z * ahead.z);
    const yaw = Math.atan2(-tmpT.x, -tmpT.z);
    const fx = tmpP.x - Math.sin(yaw) * 3;
    const fz = tmpP.z - Math.cos(yaw) * 3;
    const bx = tmpP.x + Math.sin(yaw) * 3;
    const bz = tmpP.z + Math.cos(yaw) * 3;
    const pitch = Math.atan2(world.heightAt(fx, fz) - world.heightAt(bx, bz), 6);
    const targetRoll = THREE.MathUtils.clamp(-turn * 1.6, -0.09, 0.09);
    h.roll += (targetRoll - h.roll) * Math.min(1, dt * 3);
    euler.set(pitch, yaw, h.roll);
    h.quaternion.setFromEuler(euler);
    const ground = Math.max(world.heightAt(tmpP.x, tmpP.z), world.heightAt(fx, fz) - 0.1, world.heightAt(bx, bz) - 0.1);
    h.position.set(tmpP.x, ground + HALF.y + 0.03, tmpP.z);
  }

  const m4 = new THREE.Matrix4();
  const r4 = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  const reelQ = new THREE.Quaternion();
  const xAxis = new THREE.Vector3(1, 0, 0);
  const inv = new THREE.Quaternion();

  return {
    list,
    group,
    fixedUpdate(dt) {
      for (const h of list) {
        pose(h, dt);
        h.entity.moveTo(h.position, h.quaternion);
        h.hitCooldown = Math.max(0, h.hitCooldown - dt);
      }
    },
    frame(dt) {
      for (const h of list) {
        h.reel = (h.reel + dt * 3.2) % (PI * 2);
        const p = h.proxy.position;
        const q = h.proxy.quaternion;
        m4.compose(p, q, one);
        meshes.body.setMatrixAt(h.index, m4);
        meshes.glow.setMatrixAt(h.index, m4);
        reelQ.setFromAxisAngle(xAxis, -h.reel);
        r4.compose(REEL, reelQ, one);
        r4.premultiply(m4);
        meshes.reel.setMatrixAt(h.index, r4);
        meshes.teeth.setMatrixAt(h.index, r4);
        h.chute.set(0, GROUND + 1.3, 3.9).applyQuaternion(q).add(p);
        h.chuteDir.set(0, 0.5, 1).applyQuaternion(q);
      }
      for (const m of Object.values(meshes)) m.instanceMatrix.needsUpdate = true;
    },
    toLocal(h, point, out) {
      inv.copy(h.quaternion).invert();
      return out.copy(point).sub(h.position).applyQuaternion(inv);
    },
  };
}
