import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const PLANKS = 3;
const MAX_V = 7;
const MAX_W = 5;
const RESET_DIST = 9;

export function createRopeBridge(ctx, { a, b, segments, slack, width, materials, kits }) {
  const { physics } = ctx;
  const { RAPIER, world: rw, GROUPS } = physics;
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const chord = B.clone().sub(A);
  const span = chord.length();
  const segLen = (span + slack) / segments;

  const hinges = [];
  const shape = (sag) => {
    hinges.length = 0;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      hinges.push(A.clone().lerp(B, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0)));
    }
    let len = 0;
    for (let i = 0; i < segments; i++) len += hinges[i].distanceTo(hinges[i + 1]);
    return len;
  };
  let lo = 0;
  let hi = span * 0.3;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (shape(mid) < segments * segLen) lo = mid;
    else hi = mid;
  }
  shape((lo + hi) / 2);

  const lateral = new THREE.Vector3(chord.z, 0, -chord.x).normalize();
  const rest = [];
  const segs = [];
  const proxies = [];
  const pq = new THREE.Quaternion();
  const pv = new THREE.Vector3();
  const pt = new THREE.Vector3();
  const xAxis = new THREE.Vector3();
  const yAxis = new THREE.Vector3();
  const m3 = new THREE.Matrix4();
  for (let i = 0; i < segments; i++) {
    const c = hinges[i].clone().add(hinges[i + 1]).multiplyScalar(0.5);
    xAxis.subVectors(hinges[i + 1], hinges[i]).normalize();
    yAxis.crossVectors(lateral, xAxis).normalize();
    m3.makeBasis(xAxis, yAxis, lateral);
    const quat = new THREE.Quaternion().setFromRotationMatrix(m3);
    rest.push({ position: c, quaternion: quat });
    const dummy = new THREE.Object3D();
    dummy.position.copy(c);
    dummy.quaternion.copy(quat);
    const entity = physics.addDynamic(dummy, {
      shape: 'box', size: [segLen - 0.03, 0.12, width], mass: 55, friction: 1.0, restitution: 0,
      linearDamping: 0.7, angularDamping: 2.2, buoyant: false, canSleep: true, userData: { kind: 'ropebridge', surface: 'wood' },
    });
    entity.collider.setCollisionGroups(physics.groups(GROUPS.DYNAMIC, GROUPS.DYNAMIC));
    const parts = [{ off: new THREE.Vector3(0, 0, 0), handle: physics.addStaticBox({ position: c, size: [segLen - 0.02, 0.12, width], quaternion: quat, friction: 1, userData: { kind: 'ropebridge', surface: 'wood' } }) }];
    for (const side of [-1, 1]) {
      const off = new THREE.Vector3(0, 0.62, side * (width / 2 + 0.06));
      parts.push({ off, handle: physics.addStaticBox({ position: off.clone().applyQuaternion(quat).add(c), size: [segLen - 0.2, 1.1, 0.08], quaternion: quat, friction: 0.1, userData: { kind: 'ropebridge' } }) });
    }
    for (const part of parts) part.handle.collider.setCollisionGroups(physics.groups(GROUPS.STATIC, GROUPS.PLAYER));
    const proxy = {
      parts,
      place(t, r) {
        pq.set(r.x, r.y, r.z, r.w);
        for (const part of parts) {
          pv.copy(part.off).applyQuaternion(pq).add(pt.set(t.x, t.y, t.z));
          part.handle.collider.setTranslation({ x: pv.x, y: pv.y, z: pv.z });
          part.handle.collider.setRotation(r);
        }
      },
    };
    proxies.push(proxy);
    segs.push(entity);
  }

  const anchorBody = (p) => rw.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y, p.z));
  const fixA = anchorBody(A);
  const fixB = anchorBody(B);
  const joints = [];
  const half = segLen / 2;
  joints.push(rw.createImpulseJoint(RAPIER.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: -half, y: 0, z: 0 }), fixA, segs[0].body, true));
  for (let i = 0; i < segments - 1; i++) {
    const j = rw.createImpulseJoint(
      RAPIER.JointData.revolute({ x: half, y: 0, z: 0 }, { x: -half, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }),
      segs[i].body, segs[i + 1].body, true,
    );
    j.setContactsEnabled(false);
    j.setLimits(-0.55, 0.55);
    j.configureMotorVelocity(0, 6);
    joints.push(j);
  }
  joints.push(rw.createImpulseJoint(RAPIER.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: half, y: 0, z: 0 }), fixB, segs[segments - 1].body, true));
  for (const j of joints) j.setContactsEnabled(false);

  const plankGeo = new RoundedBoxGeometry(segLen / PLANKS - 0.07, 0.08, width + 0.22, 1, 0.02);
  plankGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(plankGeo.attributes.position.count * 3).fill(1), 3));
  const planks = new THREE.InstancedMesh(plankGeo, materials.wood, segments * PLANKS);
  planks.name = 'hallu:rope-planks';
  planks.castShadow = true;
  planks.receiveShadow = true;
  planks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const rand = ctx.rng.seeded('hallu:planks');
  const plankLocal = [];
  const tint = new THREE.Color();
  for (let i = 0; i < segments * PLANKS; i++) {
    const k = i % PLANKS;
    const off = new THREE.Vector3(-half + (k + 0.5) * (segLen / PLANKS), 0.02 + (rand() - 0.5) * 0.02, (rand() - 0.5) * 0.08);
    const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.05, (rand() - 0.5) * 0.12, (rand() - 0.5) * 0.04));
    plankLocal.push({ off, rot });
    tint.set(rand() < 0.15 ? '#6e5038' : '#9a7650').multiplyScalar(0.85 + rand() * 0.3);
    planks.setColorAt(i, tint);
  }

  const ropeGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0);
  const ropeCount = 2 * (segments + 1) + 2 * (segments + 1) + 2 * (segments + 1) + 8;
  const ropes = new THREE.InstancedMesh(ropeGeo, materials.rope, ropeCount);
  ropes.name = 'hallu:ropes';
  ropes.castShadow = true;
  ropes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ropes.frustumCulled = false;

  const POST_H = 1.35;
  const posts = [];
  for (const [P, dir] of [[A, -1], [B, 1]]) {
    const back = chord.clone().setY(0).normalize().multiplyScalar(dir * 0.35);
    for (const side of [-1, 1]) {
      const base = P.clone().add(back).addScaledVector(lateral, side * (width / 2 + 0.3));
      const top = base.clone().add(new THREE.Vector3(0, POST_H, 0));
      posts.push({ base, top, side, end: dir });
      kits.wood.add(new THREE.CylinderGeometry(0.13, 0.17, POST_H + 1.6, 9), { pos: [base.x, base.y + (POST_H - 1.6) / 2, base.z], color: '#6f5236', rot: [0, 0, (side * 0.06)] });
      kits.wood.add(new THREE.SphereGeometry(0.16, 9, 6), { pos: [top.x, top.y + 0.78, top.z], scale: [1, 0.6, 1], color: '#5d4430' });
      kits.iron.add(new THREE.TorusGeometry(0.16, 0.035, 6, 12), { pos: [top.x, top.y - 0.05, top.z], rot: [Math.PI / 2, 0, 0], color: '#3a3430' });
    }
    kits.wood.add(new THREE.BoxGeometry(width + 0.9, 0.18, 0.9), {
      pos: [P.x + back.x * 0.6, P.y - 0.1, P.z + back.z * 0.6], quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(lateral.x, lateral.z) + Math.PI / 2), color: '#7c5c3e',
    });
  }

  const tmpP = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  const up = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const qRope = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0);
  const scl = new THREE.Vector3();
  const live = Array.from({ length: segments + 1 }, () => new THREE.Vector3());
  const liveUp = Array.from({ length: segments + 1 }, () => new THREE.Vector3());
  const edgeL = Array.from({ length: segments + 1 }, () => new THREE.Vector3());
  const edgeR = Array.from({ length: segments + 1 }, () => new THREE.Vector3());
  const handL = Array.from({ length: segments + 1 }, () => new THREE.Vector3());
  const handR = Array.from({ length: segments + 1 }, () => new THREE.Vector3());
  const latW = new THREE.Vector3();
  let ropeIndex = 0;

  function rope(p, q, r) {
    dir.subVectors(q, p);
    const len = dir.length();
    if (len < 1e-4) {
      ropes.setMatrixAt(ropeIndex++, m4.makeScale(0, 0, 0));
      return;
    }
    qRope.setFromUnitVectors(Y, dir.divideScalar(len));
    m4.compose(p, qRope, scl.set(r, len, r));
    ropes.setMatrixAt(ropeIndex++, m4);
  }

  function sag(p, q, out, amount) {
    return out.lerpVectors(p, q, 0.5).add(tmpP.set(0, -amount, 0));
  }

  const mid = new THREE.Vector3();
  function frame() {
    for (let i = 0; i < segments; i++) {
      const s = segs[i];
      const mesh = s.mesh;
      for (let k = 0; k < PLANKS; k++) {
        const pl = plankLocal[i * PLANKS + k];
        tmpP.copy(pl.off).applyQuaternion(mesh.quaternion).add(mesh.position);
        tmpQ.copy(mesh.quaternion).multiply(pl.rot);
        m4.compose(tmpP, tmpQ, scl.set(1, 1, 1));
        planks.setMatrixAt(i * PLANKS + k, m4);
      }
    }
    for (let h = 0; h <= segments; h++) {
      if (h === 0) {
        live[h].copy(A);
        liveUp[h].set(0, 1, 0).applyQuaternion(segs[0].mesh.quaternion);
      } else {
        const s = segs[h - 1].mesh;
        live[h].set(half, 0, 0).applyQuaternion(s.quaternion).add(s.position);
        liveUp[h].set(0, 1, 0).applyQuaternion(s.quaternion);
        if (h === segments) live[h].copy(B);
      }
      const s = segs[Math.min(h, segments - 1)].mesh;
      latW.set(0, 0, 1).applyQuaternion(s.quaternion);
      edgeL[h].copy(live[h]).addScaledVector(latW, -(width / 2 + 0.1)).addScaledVector(liveUp[h], -0.03);
      edgeR[h].copy(live[h]).addScaledVector(latW, width / 2 + 0.1).addScaledVector(liveUp[h], -0.03);
      handL[h].copy(edgeL[h]).addScaledVector(liveUp[h], 1.08).addScaledVector(latW, -0.06);
      handR[h].copy(edgeR[h]).addScaledVector(liveUp[h], 1.08).addScaledVector(latW, 0.06);
    }
    ropeIndex = 0;
    for (let h = 0; h < segments; h++) {
      rope(edgeL[h], edgeL[h + 1], 0.035);
      rope(edgeR[h], edgeR[h + 1], 0.035);
      rope(handL[h], handL[h + 1], 0.04);
      rope(handR[h], handR[h + 1], 0.04);
    }
    for (let h = 1; h < segments; h++) {
      rope(edgeL[h], handL[h], 0.018);
      rope(edgeR[h], handR[h], 0.018);
    }
    for (const p of posts) {
      const h = p.end < 0 ? 0 : segments;
      const hand = p.side < 0 ? handL[h] : handR[h];
      const edge = p.side < 0 ? edgeL[h] : edgeR[h];
      rope(p.top, sag(p.top, hand, mid, 0.05), 0.045);
      rope(mid, hand, 0.045);
      rope(tmpP.copy(p.base).add(up.set(0, 0.25, 0)), edge, 0.04);
    }
    while (ropeIndex < ropeCount) ropes.setMatrixAt(ropeIndex++, m4.makeScale(0, 0, 0));
    planks.instanceMatrix.needsUpdate = true;
    ropes.instanceMatrix.needsUpdate = true;
  }

  function reset() {
    for (let i = 0; i < segments; i++) {
      const s = segs[i];
      s.setPosition(rest[i].position, rest[i].quaternion);
      s.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      s.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      proxies[i].place(rest[i].position, rest[i].quaternion);
    }
  }

  let resets = 0;
  let clock = 0;
  const local = new THREE.Vector3();
  const invQ = new THREE.Quaternion();
  function segmentUnder(p) {
    for (let i = 0; i < segments; i++) {
      const s = segs[i];
      local.copy(p).sub(s.position).applyQuaternion(invQ.copy(s.quaternion).invert());
      if (Math.abs(local.x) <= half + 0.05 && Math.abs(local.z) <= width / 2 + 0.2 && local.y > -0.3 && local.y < 0.9) return i;
    }
    return -1;
  }

  function load(p, impulse) {
    const i = segmentUnder(p);
    if (i < 0) return false;
    const s = segs[i];
    local.z = 0;
    local.y = 0;
    local.applyQuaternion(s.quaternion).add(s.position);
    s.body.applyImpulseAtPoint({ x: 0, y: -impulse, z: 0 }, { x: local.x, y: local.y, z: local.z }, true);
    return true;
  }

  function fixedUpdate(dt, player, windy) {
    clock += dt;
    if (player) load(player, 78 * 9.81 * dt);
    const gust = Math.sin(clock * 0.45) * 0.6 + Math.sin(clock * 1.13 + 1.7) * 0.4;
    for (let i = 2; i < segments - 2; i++) {
      const body = segs[i].body;
      if (!windy) break;
      body.applyImpulse({ x: lateral.x * gust * 6 * dt, y: 0, z: lateral.z * gust * 6 * dt }, false);
    }
    let bad = false;
    for (let i = 0; i < segments; i++) {
      const body = segs[i].body;
      if (body.isSleeping()) continue;
      const t = body.translation();
      if (!Number.isFinite(t.x + t.y + t.z)) {
        bad = true;
        break;
      }
      const r = rest[i].position;
      if (Math.abs(t.x - r.x) + Math.abs(t.y - r.y) + Math.abs(t.z - r.z) > RESET_DIST) {
        bad = true;
        break;
      }
      const v = body.linvel();
      const sp = Math.hypot(v.x, v.y, v.z);
      if (sp > MAX_V) body.setLinvel({ x: (v.x / sp) * MAX_V, y: (v.y / sp) * MAX_V, z: (v.z / sp) * MAX_V }, true);
      const w = body.angvel();
      const ws = Math.hypot(w.x, w.y, w.z);
      if (ws > MAX_W) body.setAngvel({ x: (w.x / ws) * MAX_W, y: (w.y / ws) * MAX_W, z: (w.z / ws) * MAX_W }, true);
    }
    if (bad) {
      resets++;
      reset();
    }
    for (let i = 0; i < segments; i++) {
      const t = segs[i].body.translation();
      proxies[i].place(t, segs[i].body.rotation());
    }
  }

  frame();
  planks.computeBoundingSphere();
  planks.boundingSphere.radius += 6;

  return {
    meshes: [planks, ropes],
    segments: segs,
    rest,
    segLen,
    fixedUpdate,
    frame,
    load,
    reset,
    get resets() {
      return resets;
    },
  };
}
