import * as THREE from 'three';
import { Builder, lathe, PI, nz } from './kit.js';
import { seeded } from '../../core/rng.js';
import { crackTexture } from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);

function catmull(points, step) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n);
}

function slabGeometry() {
  const g = new THREE.CylinderGeometry(0.5, 0.52, 0.16, 7, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.18 * Math.sin(a * 3 + 1.3) + 0.1 * Math.cos(a * 5);
    p.setXYZ(i, x * k, p.getY(i) + (p.getY(i) > 0 ? 0.02 * nz(x * 3, z * 3, 1, 1) : 0), z * k * 0.8);
  }
  g.computeVertexNormals();
  return g;
}

function rockGeometry(seed, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + 0.22 * nz(x * 1.4 + seed, y * 1.4, z * 1.4, 1) + 0.08 * nz(x * 4, y * 4 + seed, z * 4, 1);
    p.setXYZ(i, x * k, y * k * 0.8, z * k);
  }
  g.computeVertexNormals();
  return g;
}

export function buildIsland(ctx, { cottage, tower, landing, mats, kioskPos }) {
  const { scene, physics, world, mat } = ctx;
  const group = new THREE.Group();
  scene.add(group);
  const r = seeded(9001);
  const ground = (x, z) => world.heightAt(x, z);
  const doorOut = cottage.tw([-1.6, 0, 3.3]);
  const T = tower.root.position;
  const avoid = [];
  const free = (x, z, pad = 0) => avoid.every((a) => Math.hypot(x - a.x, z - a.z) > a.r + pad);
  avoid.push({ x: cottage.group.position.x, z: cottage.group.position.z, r: 5.2 }, { x: T.x, z: T.z, r: 16 });

  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpS = new THREE.Vector3();
  const tmpP = new THREE.Vector3();
  const tmpN = new THREE.Vector3();
  const tmpC = new THREE.Color();

  const routes = [
    [[landing.x, landing.z], [landing.x - 8, landing.z + 1.6], [landing.x - 19, landing.z + 3.6], [landing.x - 30, landing.z + 5.2], [doorOut.x + 3, doorOut.z + 0.4], [doorOut.x, doorOut.z]],
    [[doorOut.x + 0.4, doorOut.z - 1.8], [doorOut.x + 0.9, doorOut.z - 6], [doorOut.x - 2.5, doorOut.z - 9.8], [tower.stairFoot.x + 4.5, T.z + 3.5], [tower.stairFoot.x, T.z + 0.2]],
  ];
  const slabs = [];
  for (const route of routes) {
    for (const p of catmull(route, 0.82)) {
      for (let k = 0; k < 2; k++) {
        if (k === 1 && r() < 0.55) continue;
        const ox = (r() - 0.5) * 0.7 + (k ? (r() < 0.5 ? -0.6 : 0.6) : 0);
        const oz = (r() - 0.5) * 0.7;
        const x = p.x + ox;
        const z = p.z + oz;
        slabs.push({ x, z, s: 0.55 + r() * 0.35, a: r() * PI * 2 });
      }
    }
  }
  const slabMesh = new THREE.InstancedMesh(slabGeometry(), mats.flag, slabs.length);
  slabs.forEach((s, i) => {
    const y = ground(s.x, s.z);
    world.normalAt(s.x, s.z, tmpN);
    tmpQ.setFromUnitVectors(UP, tmpN).multiply(new THREE.Quaternion().setFromAxisAngle(UP, s.a));
    tmpM.compose(tmpP.set(s.x, y + 0.01, s.z), tmpQ, tmpS.set(s.s, 0.7 + r() * 0.5, s.s * (0.8 + r() * 0.3)));
    slabMesh.setMatrixAt(i, tmpM);
    slabMesh.setColorAt(i, tmpC.set('#a49e94').multiplyScalar(0.8 + r() * 0.3));
  });
  slabMesh.receiveShadow = true;
  slabMesh.userData.surface = 'stone';
  group.add(slabMesh);

  const nearPath = (x, z, d) => slabs.some((s) => Math.abs(s.x - x) < d && Math.abs(s.z - z) < d && Math.hypot(s.x - x, s.z - z) < d);
  const CC = cottage.group.position;
  const wallLines = [
    [[CC.x - 12, CC.z - 12.5], [CC.x - 2, CC.z - 13.5], [CC.x + 6.5, CC.z - 9], [CC.x + 8.6, doorOut.z - 2.3]],
    [[CC.x + 8.6, doorOut.z + 2.3], [CC.x + 7.6, CC.z + 9], [CC.x + 1, CC.z + 13.5], [CC.x - 10, CC.z + 13]],
  ];
  const wallStones = [];
  for (const line of wallLines) {
    const pts = catmull(line, 0.42);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[Math.min(pts.length - 1, i + 1)];
      const a = Math.atan2(q.z - p.z, q.x - p.x);
      for (let c = 0; c < 3; c++) {
        const s = c === 2 ? 0.26 : 0.32 - c * 0.04;
        wallStones.push({ x: p.x + (r() - 0.5) * 0.1, z: p.z + (r() - 0.5) * 0.1, y: 0.16 + c * 0.24, a: -a + (r() - 0.5) * 0.5, sx: 0.32 + r() * 0.16, sy: s * (0.7 + r() * 0.3), sz: 0.3 + r() * 0.1 });
      }
    }
    for (let i = 0; i < pts.length - 1; i += 3) {
      const p = pts[i];
      const q = pts[Math.min(pts.length - 1, i + 3)];
      const len = Math.hypot(q.x - p.x, q.z - p.z);
      if (len < 0.05) continue;
      const a = Math.atan2(q.z - p.z, q.x - p.x);
      const cx = (p.x + q.x) / 2;
      const cz = (p.z + q.z) / 2;
      physics.addStaticBox({ position: new THREE.Vector3(cx, ground(cx, cz) + 0.35, cz), size: [len + 0.2, 0.8, 0.62], quaternion: new THREE.Quaternion().setFromAxisAngle(UP, -a), userData: { kind: 'wall', surface: 'stone' } });
    }
  }
  const wallMesh = new THREE.InstancedMesh(rockGeometry(3.1), mats.rock, wallStones.length);
  wallStones.forEach((s, i) => {
    tmpQ.setFromEuler(new THREE.Euler((r() - 0.5) * 0.3, s.a, (r() - 0.5) * 0.3));
    tmpM.compose(tmpP.set(s.x, ground(s.x, s.z) + s.y, s.z), tmpQ, tmpS.set(s.sx, s.sy, s.sz));
    wallMesh.setMatrixAt(i, tmpM);
    wallMesh.setColorAt(i, tmpC.set('#a8a196').multiplyScalar(0.7 + r() * 0.4).lerp(new THREE.Color('#6f7a52'), r() < 0.25 ? 0.35 : 0));
  });
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  const C = cottage.group.position;
  const rocks = [];
  for (let i = 0; i < 400 && rocks.length < 90; i++) {
    const a = r() * PI * 2;
    const rad = 36 + r() * 32;
    const x = -1140 + Math.cos(a) * rad;
    const z = 170 + Math.sin(a) * rad;
    if (!free(x, z, 3) || nearPath(x, z, 3) || Math.hypot(x - landing.x, z - landing.z) < 9 || Math.hypot(x - kioskPos.x, z - kioskPos.z) < 5) continue;
    if (nz(x * 0.05, z * 0.05, 9, 1) < 0.05 && rad < 58) continue;
    const s = 1.1 + r() * 2.2 + (rad > 58 ? 1 : 0);
    rocks.push({ x, z, s, a: r() * PI * 2 });
    const n = 2 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) rocks.push({ x: x + (r() - 0.5) * s * 3.2, z: z + (r() - 0.5) * s * 3.2, s: s * (0.25 + r() * 0.45), a: r() * PI * 2 });
  }
  const rockMesh = new THREE.InstancedMesh(rockGeometry(7.7), mats.rock, rocks.length);
  rocks.forEach((s, i) => {
    world.normalAt(s.x, s.z, tmpN);
    tmpQ.setFromUnitVectors(UP, tmpN).multiply(new THREE.Quaternion().setFromAxisAngle(UP, s.a));
    tmpM.compose(tmpP.set(s.x, ground(s.x, s.z) - s.s * 0.25, s.z), tmpQ, tmpS.set(s.s * (1 + r() * 0.6), s.s * (0.6 + r() * 0.4), s.s));
    rockMesh.setMatrixAt(i, tmpM);
    rockMesh.setColorAt(i, tmpC.set('#9c968b').multiplyScalar(0.75 + r() * 0.35).lerp(new THREE.Color('#c7b98a'), r() < 0.3 ? 0.25 : 0));
    if (s.s > 1.2) physics.addStaticSphere({ position: new THREE.Vector3(s.x, ground(s.x, s.z) - s.s * 0.35, s.z), radius: s.s * 0.75, userData: { kind: 'rock', surface: 'stone' } });
  });
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  group.add(rockMesh);

  const tuft = new THREE.IcosahedronGeometry(0.5, 0);
  const tp = tuft.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    tp.setY(i, y < 0 ? y * 0.15 : y * 0.7 + 0.08 * nz(tp.getX(i) * 5, tp.getZ(i) * 5, 0, 1));
    tp.setX(i, tp.getX(i) * (1 + 0.15 * nz(tp.getZ(i) * 4, y * 4, 1, 1)));
  }
  tuft.computeVertexNormals();
  const heather = [];
  for (let i = 0; i < 9000 && heather.length < 900; i++) {
    const a = r() * PI * 2;
    const rad = 10 + Math.sqrt(r()) * 56;
    const x = -1140 + Math.cos(a) * rad;
    const z = 170 + Math.sin(a) * rad;
    const y = ground(x, z);
    if (y < 1.6 || !free(x, z, 1.2) || nearPath(x, z, 1.4)) continue;
    const patch = nz(x * 0.06, z * 0.06, 3, 1) + 0.35 * nz(x * 0.2, z * 0.2, 5, 1);
    if (patch < 0.12 + (rad < 30 ? 0.15 : 0)) continue;
    if (Math.hypot(x - landing.x, z - landing.z) < 4) continue;
    heather.push({ x, z, y, s: 0.3 + r() * 0.35 + patch * 0.4, gorse: nz(x * 0.11, z * 0.11, 8, 1) > 0.42 });
  }
  const heatherMesh = new THREE.InstancedMesh(tuft, mats.heather, heather.length);
  heather.forEach((h, i) => {
    tmpQ.setFromAxisAngle(UP, r() * PI * 2);
    tmpM.compose(tmpP.set(h.x, h.y - 0.04, h.z), tmpQ, tmpS.set(h.s * (1 + r() * 0.5), h.s * (0.7 + r() * 0.6), h.s));
    heatherMesh.setMatrixAt(i, tmpM);
    const c = h.gorse ? tmpC.set('#b8952a').lerp(new THREE.Color('#4a5a2a'), r() * 0.5) : tmpC.set(r() < 0.55 ? '#6e4866' : '#5a4650').lerp(new THREE.Color('#4a4a30'), r() * 0.6);
    heatherMesh.setColorAt(i, c.multiplyScalar(0.8 + r() * 0.35));
  });
  heatherMesh.receiveShadow = true;
  group.add(heatherMesh);

  const W = new Builder(501);
  const M = new Builder(502);
  const S = new Builder(503);
  const L = new Builder(504);
  const V = new Builder(505);
  const place = (x, z, yaw = 0, tilt = true) => {
    const y = ground(x, z);
    const m = new THREE.Matrix4();
    const qq = new THREE.Quaternion();
    if (tilt) qq.setFromUnitVectors(UP, world.normalAt(x, z, new THREE.Vector3()));
    qq.multiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
    m.compose(new THREE.Vector3(x, y, z), qq, new THREE.Vector3(1, 1, 1));
    return (lx, ly, lz, extra) => {
      const local = new THREE.Matrix4().makeTranslation(lx, ly, lz);
      if (extra) local.multiply(extra);
      return m.clone().multiply(local);
    };
  };
  const rotE = (x, y, z) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z));

  const bench = { x: landing.x - 21, z: landing.z + 14 };
  const bAt = place(bench.x, bench.z, -PI / 2 + 0.25, false);
  for (const dx of [-0.75, 0.75]) S.box(0.22, 0.48, 0.42, { radius: 0.04, matrix: bAt(dx, 0.2, 0), color: '#a29c90', vary: 0.12, jitter: 0.01 });
  for (let i = 0; i < 3; i++) W.box(1.9, 0.05, 0.13, { radius: 0.015, matrix: bAt(0, 0.47, -0.15 + i * 0.15), color: '#8f8270', vary: 0.18 });
  physics.addStaticBox({ position: new THREE.Vector3(bench.x, ground(bench.x, bench.z) + 0.25, bench.z), size: [1.9, 0.5, 0.46], quaternion: new THREE.Quaternion().setFromAxisAngle(UP, -PI / 2 + 0.25), userData: { kind: 'bench', surface: 'wood' } });

  const boatA = Math.atan2(207.5 - 170, -1084 + 1140);
  const boatPos = { x: -1140 + Math.cos(boatA) * 66.5, z: 170 + Math.sin(boatA) * 66.5 };
  const bt = place(boatPos.x, boatPos.z, -boatA + PI / 2 + 0.3);
  const hull = new THREE.SphereGeometry(1, 20, 8, 0, PI * 2, PI / 2, PI / 2);
  const hp = hull.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i);
    const k = x > 0 ? 1 - 0.75 * x * x : 1 - 0.25 * x * x;
    hp.setXYZ(i, x * 2.1, hp.getY(i) * 0.55, hp.getZ(i) * 0.78 * k);
  }
  hull.computeVertexNormals();
  const inner = hull.clone();
  inner.scale(0.95, 0.9, 0.9);
  const ip = inner.index.array;
  for (let i = 0; i < ip.length; i += 3) {
    const t = ip[i];
    ip[i] = ip[i + 2];
    ip[i + 2] = t;
  }
  inner.computeVertexNormals();
  const boatMatrix = bt(0, 0.42, 0, rotE(0.12, 0, 0.05));
  W.add(hull, { matrix: boatMatrix, color: '#e8e4da', vary: 0.08, shade(c, x, y, z, lx, ly) {
    if (ly > -0.08) c.setRGB(0.1, 0.22, 0.4);
    else if (ly < -0.36) c.setRGB(0.45, 0.13, 0.09);
  } });
  W.add(inner, { matrix: boatMatrix, color: '#9c7a52', vary: 0.12 });
  for (const lx of [-0.6, 0.45]) W.box(0.22, 0.04, 1.3, { radius: 0.01, matrix: boatMatrix.clone().multiply(new THREE.Matrix4().makeTranslation(lx, -0.12, 0)), color: '#8a6a44', vary: 0.12 });
  for (const s of [-1, 1]) W.box(2.6, 0.03, 0.08, { radius: 0.01, matrix: boatMatrix.clone().multiply(new THREE.Matrix4().makeTranslation(-0.2, 0.06, s * 0.35)).multiply(rotE(0, s * 0.06, 0.08)), color: '#c9b48a', vary: 0.1 });
  M.add(new THREE.SphereGeometry(0.18, 12, 8), { matrix: bt(1.4, 0.18, 1.1), color: '#e2642a', vary: 0.08 });
  M.add(new THREE.TorusGeometry(0.28, 0.045, 6, 18), { matrix: bt(-1.2, 0.05, 1.0, rotE(PI / 2, 0, 0)), color: '#c9b78a', vary: 0.12 });
  M.add(new THREE.TorusGeometry(0.2, 0.04, 6, 16), { matrix: bt(-1.2, 0.1, 1.0, rotE(PI / 2, 0, 0)), color: '#c9b78a', vary: 0.12 });
  physics.addStaticBox({ position: new THREE.Vector3(boatPos.x, ground(boatPos.x, boatPos.z) + 0.3, boatPos.z), size: [4.2, 0.6, 1.5], quaternion: new THREE.Quaternion().setFromAxisAngle(UP, -boatA + PI / 2 + 0.3), userData: { kind: 'boat', surface: 'wood' } });
  for (let i = 0; i < 4; i++) {
    const px = -0.4 + (i % 2) * 0.75 + (i > 1 ? 0.35 : 0);
    const pz = -1.25 - Math.floor(i / 2) * 0.62;
    const ptAt = (lx, ly, lz, extra) => bt(px, 0, pz, rotE(0, i * 0.4, 0)).multiply(new THREE.Matrix4().makeTranslation(lx, ly + (i === 3 ? 0.5 : 0), lz)).multiply(extra || new THREE.Matrix4());
    W.box(0.62, 0.05, 0.46, { radius: 0.01, matrix: ptAt(0, 0.03, 0), color: '#6d5236', vary: 0.15 });
    for (const lx of [-0.22, 0, 0.22]) W.add(new THREE.TorusGeometry(0.21, 0.014, 5, 14, PI), { matrix: ptAt(lx, 0.05, 0, rotE(0, PI / 2, 0)), color: '#8f7550', vary: 0.15 });
    W.box(0.6, 0.012, 0.012, { matrix: ptAt(0, 0.26, 0), color: '#8f7550', vary: 0.1 });
    V.add(new THREE.CylinderGeometry(0.21, 0.21, 0.6, 12, 1, true, 0, PI), { matrix: ptAt(0, 0.05, 0, rotE(0, 0, PI / 2)), color: '#3c4f4a', vary: 0.12 });
  }

  const lineA = new THREE.Vector3(C.x - 4.2, 0, C.z + 8.6);
  const lineB = new THREE.Vector3(C.x + 4.6, 0, C.z + 10.4);
  lineA.y = ground(lineA.x, lineA.z);
  lineB.y = ground(lineB.x, lineB.z);
  for (const p of [lineA, lineB]) {
    W.box(0.1, 2.0, 0.1, { radius: 0.02, pos: [p.x, p.y + 0.95, p.z], color: '#7a6248', vary: 0.15 });
    physics.addStaticCylinder({ position: new THREE.Vector3(p.x, p.y + 1, p.z), radius: 0.08, height: 2, userData: { kind: 'post', surface: 'wood' } });
  }
  const ropePts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    ropePts.push(new THREE.Vector3().lerpVectors(lineA, lineB, t).setY(THREE.MathUtils.lerp(lineA.y, lineB.y, t) + 1.88 - 0.22 * Math.sin(t * PI)));
  }
  const rope = new THREE.CatmullRomCurve3(ropePts);
  M.add(new THREE.TubeGeometry(rope, 24, 0.008, 4), { color: '#d8d0bc', vary: 0.05 });
  const laundry = [
    { t: 0.16, w: 1.1, h: 1.25, color: '#f2efe6' },
    { t: 0.35, w: 0.62, h: 0.7, color: 'stripes' },
    { t: 0.52, w: 0.22, h: 0.36, color: '#3e5e8a' },
    { t: 0.6, w: 0.22, h: 0.36, color: '#3e5e8a' },
    { t: 0.78, w: 0.9, h: 0.6, color: '#d9c48a' },
  ];
  const dir = new THREE.Vector3().subVectors(lineB, lineA).setY(0).normalize();
  const yaw = Math.atan2(-dir.z, dir.x);
  for (const item of laundry) {
    const top = rope.getPoint(item.t);
    const g = new THREE.PlaneGeometry(item.w, item.h, 6, 6);
    g.translate(0, -item.h / 2, 0);
    const gp = g.attributes.position;
    for (let i = 0; i < gp.count; i++) gp.setZ(i, 0.05 * Math.sin(gp.getX(i) * 6 + item.t * 10) * (-gp.getY(i) / item.h));
    g.computeVertexNormals();
    const stripes = item.color === 'stripes';
    L.add(g, {
      matrix: new THREE.Matrix4().makeRotationY(yaw).setPosition(top.x, top.y - 0.01, top.z),
      color: stripes ? '#f0ece2' : item.color, vary: 0.06,
      shade: stripes ? (c, x, y) => {
        if (Math.sin((y - top.y) * 52) > 0.25) c.setRGB(0.06, 0.1, 0.28);
      } : undefined,
    });
    for (const dx of [-item.w / 2 + 0.05, item.w / 2 - 0.05]) {
      const off = new THREE.Vector3(dx, 0, 0).applyAxisAngle(UP, yaw);
      W.box(0.018, 0.07, 0.012, { pos: [top.x + off.x, top.y - 0.01, top.z + off.z], rot: [0, yaw, 0], color: '#c9b58a', vary: 0.1 });
    }
  }

  const bed = cottage.toWorld(1.0, 0, -6.6);
  const bedYaw = cottage.group.rotation.y;
  const bdAt = (lx, ly, lz, extra) => new THREE.Matrix4().makeRotationY(bedYaw).setPosition(bed.x, ground(bed.x, bed.z), bed.z).multiply(new THREE.Matrix4().makeTranslation(lx, ly, lz)).multiply(extra || new THREE.Matrix4());
  for (const [lx, lz, w, d] of [[0, -1.0, 3.2, 0.08], [0, 1.0, 3.2, 0.08], [-1.6, 0, 0.08, 2.08], [1.6, 0, 0.08, 2.08]]) W.box(w, 0.3, d, { radius: 0.01, matrix: bdAt(lx, 0.12, lz), color: '#6c5236', vary: 0.18 });
  S.box(3.1, 0.06, 1.94, { radius: 0.02, matrix: bdAt(0, 0.2, 0), color: '#4a3524', vary: 0.2 });
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 6; i++) {
      const lx = -1.3 + i * 0.52;
      const lz = -0.6 + row * 0.6;
      if (row === 1) {
        for (let k = 0; k < 5; k++) V.add(new THREE.ConeGeometry(0.035, 0.42, 5), { matrix: bdAt(lx - 0.15 + k * 0.08, 0.42, lz + (r() - 0.5) * 0.05, rotE((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3)), color: '#5f8a4a', vary: 0.15 });
      } else {
        V.add(new THREE.IcosahedronGeometry(0.17, 1), { matrix: bdAt(lx, 0.33, lz), color: row ? '#7f9e5a' : '#5d7f48', vary: 0.2, jitter: 0.03 });
      }
    }
  }
  M.add(lathe([[0, 0], [0.13, 0], [0.13, 0.26], [0.11, 0.28], [0, 0.28]], 14), { matrix: bdAt(1.95, 0, 1.3, rotE(0, 0, 0.1)), color: '#5d7a6a', vary: 0.1 });
  M.cyl(0.015, 0.025, 0.4, { seg: 6, matrix: bdAt(2.12, 0.22, 1.3, rotE(0, 0, -0.9)), color: '#5d7a6a' });
  physics.addStaticBox({ position: new THREE.Vector3(bed.x, ground(bed.x, bed.z) + 0.15, bed.z), size: [3.3, 0.3, 2.2], quaternion: new THREE.Quaternion().setFromAxisAngle(UP, bedYaw), userData: { kind: 'garden', surface: 'wood' } });

  const pile = cottage.toWorld(-4.05, 0, -0.6);
  const pAt = (lx, ly, lz, extra) => new THREE.Matrix4().makeRotationY(bedYaw).setPosition(pile.x, ground(pile.x, pile.z), pile.z).multiply(new THREE.Matrix4().makeTranslation(lx, ly, lz)).multiply(extra || new THREE.Matrix4());
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i < 9 - (row > 3 ? 2 : 0); i++) {
      const lz = -1.15 + i * 0.27 + (row % 2) * 0.13;
      W.add(new THREE.CylinderGeometry(0.12, 0.13, 0.62, 8), { matrix: pAt((r() - 0.5) * 0.06, 0.14 + row * 0.24, lz, rotE(0, 0, PI / 2)), color: r() < 0.5 ? '#8a6a46' : '#a07c52', vary: 0.18, jitter: 0.01, shade(c, x, y, z, lx, ly) {
        if (Math.abs(ly) > 0.3) c.lerp(new THREE.Color('#d6b98a'), 0.6);
      } });
    }
  }
  W.box(0.8, 0.05, 2.7, { radius: 0.01, matrix: pAt(0, 1.38, 0, rotE(0.1, 0, 0)), color: '#4a4f57', vary: 0.12 });
  W.box(0.4, 0.5, 0.4, { radius: 0.03, matrix: pAt(0.2, 0.25, 1.75), color: '#7d6040', vary: 0.12 });
  M.box(0.04, 0.5, 0.025, { matrix: pAt(0.2, 0.75, 1.75, rotE(0.2, 0, 0.1)), color: '#6b4a2e' });
  M.box(0.14, 0.11, 0.02, { matrix: pAt(0.2, 0.99, 1.75, rotE(0.2, 0, 0.1)), color: '#555a60' });
  physics.addStaticBox({ position: new THREE.Vector3(pile.x, ground(pile.x, pile.z) + 0.65, pile.z), size: [0.7, 1.3, 2.6], quaternion: new THREE.Quaternion().setFromAxisAngle(UP, bedYaw), userData: { kind: 'woodpile', surface: 'wood' } });

  const kioskYaw = 2.3;
  const kAt = (lx, ly, lz, extra) => new THREE.Matrix4().makeRotationY(kioskYaw).setPosition(kioskPos.x, ground(kioskPos.x, kioskPos.z), kioskPos.z).multiply(new THREE.Matrix4().makeTranslation(0, -0.3, 0)).multiply(rotE(-1.0, 0, 0.32)).multiply(new THREE.Matrix4().makeTranslation(lx, ly, lz)).multiply(extra || new THREE.Matrix4());
  const kshape = new THREE.Shape();
  const kw = 0.84;
  const kh = 2.3;
  kshape.moveTo(-kw / 2 + 0.1, 0);
  kshape.lineTo(kw / 2 - 0.1, 0);
  kshape.quadraticCurveTo(kw / 2, 0, kw / 2, 0.1);
  kshape.lineTo(kw / 2, kh - 0.2);
  kshape.quadraticCurveTo(kw / 2, kh, kw / 2 - 0.2, kh);
  kshape.lineTo(-kw / 2 + 0.2, kh);
  kshape.quadraticCurveTo(-kw / 2, kh, -kw / 2, kh - 0.2);
  kshape.lineTo(-kw / 2, 0.1);
  kshape.quadraticCurveTo(-kw / 2, 0, -kw / 2 + 0.1, 0);
  const kbody = new THREE.ExtrudeGeometry(kshape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 4, curveSegments: 10 });
  kbody.translate(0, -0.35, -0.08);
  const kb = new Builder(601);
  kb.add(kbody, { matrix: kAt(0, 0, 0), color: '#eef1f6', vary: 0.04, shade(c, x, y) {
    const sand = THREE.MathUtils.smoothstep(y, ground(kioskPos.x, kioskPos.z) + 0.5, ground(kioskPos.x, kioskPos.z) - 0.1);
    c.lerp(new THREE.Color('#b9a888'), sand * 0.8);
  } });
  kb.box(0.7, 1.58, 0.05, { radius: 0.05, segments: 2, matrix: kAt(0, 0.93, 0.15), color: '#0d1117', vary: 0 });
  const kioskBody = new THREE.Mesh(kb.build(), mats.synth);
  kioskBody.castShadow = true;
  kioskBody.receiveShadow = true;
  group.add(kioskBody);
  const kioskTex = mats.kiosk;
  const screenMat = mat.basic({ map: kioskTex, color: new THREE.Color(1, 1, 1).multiplyScalar(0.8) });
  const kioskScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.46), screenMat);
  kioskScreen.applyMatrix4(kAt(0, 0.93, 0.18));
  group.add(kioskScreen);
  const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.46), mat.basic({ map: crackTexture(), transparent: true, depthWrite: false }));
  crack.applyMatrix4(kAt(0, 0.93, 0.185));
  crack.renderOrder = 2;
  group.add(crack);
  const kioskEyeMat = mat.glow('#5ce1e6', 3);
  const kioskEye = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), kioskEyeMat);
  kioskEye.applyMatrix4(kAt(0, 1.82, 0.19));
  group.add(kioskEye);
  const kioskTop = new THREE.Vector3(0, 0.95, 0.2).applyMatrix4(kAt(0, 0, 0));
  const kq = new THREE.Quaternion().setFromRotationMatrix(kAt(0, 0, 0));
  physics.addStaticBox({ position: new THREE.Vector3(0, 0.9, 0).applyMatrix4(kAt(0, 0, 0)), size: [0.95, 2.1, 0.3], quaternion: kq, userData: { kind: 'kiosk', surface: 'metal' } });
  const kioskLight = ctx.env.lights.add({ position: new THREE.Vector3(0, 1.0, 0.8).applyMatrix4(kAt(0, 0, 0)), color: '#5ce1e6', intensity: 0.7, distance: 6, decay: 1.6, flicker: 0.6 });

  const mk = (b, material, shadow = true) => {
    if (b.empty) return null;
    const m = new THREE.Mesh(b.build(), material);
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const meshes = { wood: mk(W, mats.wood), metal: mk(M, mats.metal, false), stone: mk(S, mats.rubble), laundry: mk(L, mats.laundry, false), soft: mk(V, mats.cloth, false) };

  world.addClearing({ x: -1140, z: 170, r: 76, trees: true, grass: false, rocks: true });
  world.addClearing({ x: C.x, z: C.z, r: 5.5, trees: true, grass: true });
  world.addClearing({ x: T.x, z: T.z, r: 15, trees: true, grass: true });
  world.addClearing({ x: bed.x, z: bed.z, r: 1.9, trees: true, grass: true });
  world.addClearing({ x: kioskPos.x, z: kioskPos.z, r: 2.2, trees: true, grass: true });
  for (const p of catmull(routes[0], 2.2)) world.addClearing({ x: p.x, z: p.z, r: 1.5, trees: true, grass: true });

  let flick = 0;
  return {
    group, meshes, kioskScreen, kioskTop, bench, boatPos,
    update(dt) {
      flick -= dt;
      if (flick <= 0) {
        flick = 0.05 + Math.random() * 0.4;
        const k = Math.random() < 0.18 ? 0.15 + Math.random() * 0.3 : 1;
        screenMat.color.setScalar(0.8 * k);
        kioskEyeMat.color.setRGB(0.36, 0.88, 0.9).multiplyScalar(3 * k);
        kioskLight.intensity = 0.7 * k;
      }
    },
  };
}
