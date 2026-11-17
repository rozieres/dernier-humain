import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Parts, woodTexture, stoneTexture, metalMask } from '../../entities/props/kit.js';

const PEAK_SEARCH = { x0: 380, x1: 640, z0: -560, z1: -320 };
const PIER = { start: -916, length: 27, width: 2.4, deck: 1.4, z: 170, ramp: 6 };
const FAR = 520;
const STEP_RUN = 0.55;
const STEP_W = 1.8;
const STEP_H = 0.7;
const STEP_RISE = 0.4;
const RAMP_T = 0.3;

function findPeak(world) {
  let best = [0, -Infinity, 0];
  const { x0, x1, z0, z1 } = PEAK_SEARCH;
  for (let x = x0; x <= x1; x += 2) {
    for (let z = z0; z <= z1; z += 2) {
      const h = world.heightAt(x, z);
      if (h > best[1]) best = [x, h, z];
    }
  }
  return best;
}

function walkableRoute(world, peak) {
  const S = 2;
  const N = 200;
  const X0 = peak[0] - 196;
  const Z0 = peak[2] - 200;
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = world.heightAt(X0 + i * S, Z0 + j * S);
  const tan = Math.tan((38 * Math.PI) / 180);
  const from = new Int32Array(N * N).fill(-1);
  const queue = [];
  for (let i = 0; i < N; i++) {
    for (const j of [0, N - 1]) {
      for (const c of [j * N + i, i * N + j]) {
        if (from[c] < 0 && H[c] < 70 && H[c] > 2) {
          from[c] = c;
          queue.push(c);
        }
      }
    }
  }
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let k = 0; k < queue.length; k++) {
    const c = queue[k];
    const i = c % N;
    const j = (c / N) | 0;
    for (const [di, dj] of D) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
      const n = jj * N + ii;
      if (from[n] >= 0) continue;
      if (Math.abs(H[n] - H[c]) / (S * Math.hypot(di, dj)) > tan) continue;
      from[n] = c;
      queue.push(n);
    }
  }
  let top = -1;
  for (const c of queue) {
    const x = X0 + (c % N) * S;
    const z = Z0 + ((c / N) | 0) * S;
    if (Math.hypot(x - peak[0], z - peak[2]) < 6 && (top < 0 || H[c] > H[top])) top = c;
  }
  if (top < 0) return { points: [], reachable: false };
  const points = [];
  for (let c = top; ; c = from[c]) {
    points.push([X0 + (c % N) * S, H[c], Z0 + ((c / N) | 0) * S]);
    if (from[c] === c) break;
  }
  return { points, reachable: true };
}

function smoothLine(points, iterations = 40) {
  const dense = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, , az] = points[i - 1];
    const [bx, , bz] = points[i];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 0.5));
    for (let k = 0; k < n; k++) dense.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  const last = points[points.length - 1];
  dense.push([last[0], last[2]]);
  let pts = dense;
  for (let it = 0; it < iterations; it++) {
    const next = pts.map((p) => [...p]);
    for (let i = 1; i < pts.length - 1; i++) {
      next[i][0] = (pts[i - 1][0] + 2 * pts[i][0] + pts[i + 1][0]) / 4;
      next[i][1] = (pts[i - 1][1] + 2 * pts[i][1] + pts[i + 1][1]) / 4;
    }
    pts = next;
  }
  return pts;
}

function carveSteps(ctx, routeTopDown, peak, rand) {
  const { world, physics } = ctx;
  const line = smoothLine([...routeTopDown].reverse());
  const samples = [];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1];
    const [bx, bz] = line[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-4) continue;
    const nx = (bz - az) / len;
    const nz = -(bx - ax) / len;
    let t = carry;
    for (; t < len; t += STEP_RUN) {
      const x = ax + ((bx - ax) * t) / len;
      const z = az + ((bz - az) * t) / len;
      const steep = [-1.1, 0, 1.1].some((o) => world.slopeAt(x + nx * o, z + nz * o) > 0.12);
      samples.push({ x, z, yaw: Math.atan2(bx - ax, bz - az), steep, ground: world.heightAt(x, z) });
    }
    carry = t - len;
  }
  const n = samples.length;
  const keep = samples.map((s, i) => {
    if (Math.hypot(s.x - peak[0], s.z - peak[2]) < 2.4) return false;
    for (let j = Math.max(0, i - 6); j <= Math.min(n - 1, i + 3); j++) if (samples[j].steep) return true;
    return false;
  });
  const top = samples.map((s) => {
    let h = s.ground;
    for (let k = 0; k < 6; k++) h = Math.max(h, world.heightAt(s.x + Math.cos(k * 1.047) * 0.25, s.z + Math.sin(k * 1.047) * 0.25));
    return h + 0.04;
  });
  for (let i = n - 2; i >= 0; i--) if (keep[i] && keep[i + 1]) top[i] = Math.max(top[i], top[i + 1] - STEP_RISE);
  for (let i = 1; i < n; i++) if (keep[i] && keep[i - 1]) top[i] = Math.max(top[i], top[i - 1] - STEP_RISE);
  for (let i = 1; i < n; i++) {
    if (!keep[i] || keep[i - 1]) continue;
    let j = i;
    while (j > 0 && top[j] - samples[j - 1].ground > STEP_RISE + 0.04) {
      keep[j - 1] = true;
      top[j - 1] = Math.max(top[j - 1], top[j] - STEP_RISE);
      j--;
    }
  }
  const P = new Parts(41);
  const center = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  const AXIS_X = new THREE.Vector3(1, 0, 0);
  const qp = new THREE.Quaternion();
  const up = new THREE.Vector3();
  const mid = new THREE.Vector3();
  let count = 0;
  samples.forEach((s, i) => {
    if (!keep[i]) return;
    const h = Math.max(STEP_H, top[i] - s.ground + 0.5);
    const w = STEP_W + (rand() - 0.5) * 0.15;
    P.box(w, h, STEP_RUN + 0.06, {
      radius: 0.05, segments: 1, pos: [s.x, top[i] - h / 2, s.z], rot: [0, s.yaw, 0],
      color: rand() > 0.5 ? '#8f897f' : '#7d786f', vary: 0.22, jitter: 0.012,
    });
    const prev = i > 0 ? samples[i - 1] : null;
    if (prev) {
      const y0 = keep[i - 1] ? top[i - 1] : prev.ground;
      const run = Math.hypot(s.x - prev.x, s.z - prev.z);
      const pitch = Math.atan2(top[i] - y0, run);
      q.setFromAxisAngle(UP, Math.atan2(s.x - prev.x, s.z - prev.z)).multiply(qp.setFromAxisAngle(AXIS_X, -pitch));
      up.set(0, 1, 0).applyQuaternion(q);
      mid.set((s.x + prev.x) / 2, (top[i] + y0) / 2, (s.z + prev.z) / 2).addScaledVector(up, -RAMP_T / 2);
      physics.addStaticBox({ position: mid.toArray(), size: [STEP_W, RAMP_T, run / Math.cos(pitch) + 0.08], quaternion: q.clone(), userData: { surface: 'stone' } });
    }
    center.x += s.x;
    center.y += top[i];
    center.z += s.z;
    count++;
  });
  if (count) center.divideScalar(count);
  return { geometry: count ? P.build() : null, count, center, line: samples.map((s, i) => [s.x, keep[i] ? top[i] : s.ground, s.z]) };
}

function stoneGeometry(seed) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 2).deleteAttribute('normal').deleteAttribute('uv'));
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 + seed) * Math.sin(v.y * 2.7 + seed * 1.7) * Math.sin(v.z * 3.3 + seed * 0.3);
    v.multiplyScalar(1 + 0.16 * n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function buildWilds(ctx, { rand }) {
  const { world, physics, scene, mat } = ctx;
  const groups = [];
  const stoneMat = mat.standard({ map: stoneTexture('cairn'), vertexColors: true, roughness: 0.88, metalness: 0 }, { onShader: metalMask });
  const woodMat = mat.standard({ map: woodTexture('pier'), vertexColors: true, roughness: 0.9, metalness: 0 }, { onShader: metalMask });

  const peak = findPeak(world);
  const route = walkableRoute(world, peak);
  const summit = new THREE.Group();
  summit.name = 'wilds:summit';
  const [px, py, pz] = peak;
  const sp = new Parts(7);
  const stairs = carveSteps(ctx, route.points, peak, rand);
  const entry = stairs.line.filter(([x, , z]) => Math.hypot(x - px, z - pz) > 2.5).pop();
  const ledgeY = Math.min(py - 0.35, (entry ? entry[1] : py) + 0.3);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + rand() * 0.4;
    const r = k === 0 ? 0 : 1.3 + rand() * 0.8;
    const sy = 1.5 + rand() * 0.6;
    sp.add(stoneGeometry(k * 3.7), {
      color: k % 3 ? '#8c877e' : '#7a756d', vary: 0.2, pos: [Math.cos(a) * r, -sy * 0.97 + rand() * 0.08, Math.sin(a) * r],
      scale: [1.2 + rand() * 0.5, sy, 1.0 + rand() * 0.5], rot: [rand() * 0.12, rand() * 6, rand() * 0.12],
    });
  }
  let y = py - ledgeY - 0.2;
  const layers = [[0.78, 0.4], [0.64, 0.36], [0.55, 0.32], [0.44, 0.28], [0.34, 0.24], [0.25, 0.2]];
  layers.forEach(([r, h], i) => {
    y += h * (i === 0 ? 0.6 : 1.05);
    sp.add(stoneGeometry(i * 5.1 + 1), {
      color: i % 2 ? '#9a948a' : '#7f7a72', vary: 0.2, pos: [(rand() - 0.5) * 0.08, y, (rand() - 0.5) * 0.08],
      scale: [r, h * 0.55, r * (0.85 + rand() * 0.2)], rot: [rand() * 0.15, rand() * 6, rand() * 0.15],
    });
  });
  const ex = entry ? entry[0] - px : 1;
  const ez = entry ? entry[2] - pz : 0;
  const el = Math.hypot(ex, ez) || 1;
  const dir = [ex / el, ez / el];
  const boxAt = [dir[0] * 1.45, 0.02, dir[1] * 1.45];
  const boxYaw = Math.atan2(dir[0], dir[1]);
  sp.box(0.3, 0.24, 0.42, { radius: 0.03, segments: 2, pos: [boxAt[0], boxAt[1] + 0.12, boxAt[2]], rot: [0, boxYaw, 0], color: '#4a4440', metal: 0.7, vary: 0.25 });
  sp.box(0.32, 0.05, 0.44, { radius: 0.02, segments: 2, pos: [boxAt[0], boxAt[1] + 0.265, boxAt[2]], rot: [0.06, boxYaw, 0], color: '#5b4f45', metal: 0.7, vary: 0.3 });
  sp.box(0.08, 0.08, 0.02, { radius: 0.01, pos: [boxAt[0] + dir[0] * 0.16, boxAt[1] + 0.2, boxAt[2] + dir[1] * 0.16], rot: [0, boxYaw, 0], color: '#8a6a3a', metal: 0.8 });
  const cairn = new THREE.Mesh(sp.build(), stoneMat);
  cairn.position.set(px, ledgeY, pz);
  cairn.castShadow = true;
  cairn.receiveShadow = true;
  summit.add(cairn);
  physics.addStaticCylinder({ position: [px, ledgeY - 0.6, pz], radius: 2.4, height: 1.0, userData: { surface: 'stone' } });
  physics.addStaticCylinder({ position: [px, py + 0.6, pz], radius: 0.55, height: 1.6, userData: { surface: 'stone' } });

  if (stairs.count) {
    const steps = new THREE.Mesh(stairs.geometry, stoneMat);
    steps.castShadow = true;
    steps.receiveShadow = true;
    scene.add(steps);
    groups.push({ object: steps, center: stairs.center, far: 450 });
  }

  const wayStones = new Parts(11);
  let placed = 0;
  let acc = 0;
  const pts = route.points;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]);
    if (acc < 34 || i > pts.length - 4) continue;
    acc = 0;
    const [x, , z] = pts[i];
    const ox = x + 1.6;
    const oz = z + 1.2;
    const gy = world.heightAt(ox, oz);
    let hy = 0;
    for (let k = 0; k < 3; k++) {
      const r = 0.32 - k * 0.07;
      hy += k === 0 ? r * 0.3 : r * 0.62;
      wayStones.add(stoneGeometry(placed * 2 + k), {
        color: '#8a857c', vary: 0.2, pos: [ox - px, gy + hy - ledgeY, oz - pz], scale: [r, r * 0.6, r * 0.9], rot: [0, rand() * 6, 0],
      });
    }
    placed++;
  }
  if (placed) {
    const ways = new THREE.Mesh(wayStones.build(), stoneMat);
    ways.position.copy(cairn.position);
    ways.castShadow = true;
    scene.add(ways);
    groups.push({ object: ways, center: new THREE.Vector3(px, py, pz), far: FAR + 300 });
  }
  scene.add(summit);
  groups.push({ object: summit, center: new THREE.Vector3(px, py, pz), far: FAR });
  const summitTrace = [px + dir[0] * 1.75, ledgeY + 0.05, pz + dir[1] * 1.75];

  const pier = new THREE.Group();
  pier.name = 'wilds:pier';
  const P = new Parts(23);
  const x0 = PIER.start;
  const x1 = PIER.start - PIER.length;
  const deckY = PIER.deck;
  const zc = PIER.z;
  for (let x = x0; x > x1; x -= 0.27) {
    const len = PIER.width + (rand() - 0.5) * 0.18;
    const tone = rand();
    P.box(0.22, 0.06, len, {
      radius: 0.012, segments: 1, pos: [x - 0.12, deckY - 0.03 + (rand() - 0.5) * 0.015, zc + (rand() - 0.5) * 0.08],
      rot: [(rand() - 0.5) * 0.02, (rand() - 0.5) * 0.03, (rand() - 0.5) * 0.02],
      color: tone > 0.8 ? '#7d6a55' : tone > 0.4 ? '#8f7b63' : '#9b8a74', vary: 0.18, jitter: 0.004,
    });
  }
  for (const s of [-1, 1]) {
    P.box(PIER.length, 0.18, 0.14, { radius: 0.02, pos: [(x0 + x1) / 2, deckY - 0.16, zc + s * 0.9], color: '#5e4c3c', vary: 0.2 });
  }
  const pileXs = [];
  for (let x = x0 - 1; x >= x1 + 0.2; x -= 3) pileXs.push(x);
  pileXs.push(x1 + 0.25);
  for (const x of pileXs) {
    for (const s of [-1, 1]) {
      const bed = Math.min(world.heightAt(x, zc + s * 1.15), deckY - 0.5) - 0.6;
      const top = deckY + (x === pileXs[pileXs.length - 1] || x === pileXs[0] ? 0.9 : 0.12);
      const h = top - bed;
      P.add(new THREE.CylinderGeometry(0.13, 0.15, h, 10, 3), {
        pos: [x, bed + h / 2, zc + s * 1.15], rot: [(rand() - 0.5) * 0.04, rand() * 3, (rand() - 0.5) * 0.04], color: '#5a4636', vary: 0.25, jitter: 0.01,
      });
    }
  }
  const rampX0 = x0 + PIER.ramp;
  const rampGround = world.heightAt(rampX0, zc);
  const rampLen = Math.hypot(PIER.ramp, deckY - rampGround);
  const rampAngle = Math.atan2(deckY - rampGround, PIER.ramp);
  for (let k = 0; k < Math.floor(rampLen / 0.27); k++) {
    const t = (k + 0.5) / Math.floor(rampLen / 0.27);
    P.box(0.22, 0.06, PIER.width - 0.3, {
      radius: 0.012, pos: [rampX0 - t * PIER.ramp, rampGround + t * (deckY - rampGround) - 0.03, zc], rot: [0, 0, -rampAngle], color: '#8a775f', vary: 0.18,
    });
  }
  const postX = x1 + 0.9;
  P.add(new THREE.CylinderGeometry(0.17, 0.2, 0.7, 12), { pos: [postX, deckY + 0.35, zc - 0.75], color: '#4b3a2c', vary: 0.2 });
  P.add(new THREE.TorusGeometry(0.2, 0.035, 6, 16), { pos: [postX, deckY + 0.52, zc - 0.75], rot: [Math.PI / 2, 0, 0], color: '#3a3430', metal: 0.6 });
  P.add(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6), { pos: [x1 + 0.25, deckY + 1.3, zc + 1.15], color: '#4a3a2c' });
  P.add(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), { pos: [x1 + 0.25 - 0.35, deckY + 2.55, zc + 1.15], rot: [0, 0, Math.PI / 2], color: '#4a3a2c' });
  const deck = new THREE.Mesh(P.build(), woodMat);
  deck.castShadow = true;
  deck.receiveShadow = true;
  pier.add(deck);
  physics.addStaticBox({ position: [(x0 + x1) / 2, deckY - 0.1, zc], size: [PIER.length, 0.2, PIER.width], userData: { surface: 'wood' } });
  const rq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -rampAngle);
  physics.addStaticBox({
    position: [rampX0 - PIER.ramp / 2, (rampGround + deckY) / 2 - 0.1, zc], size: [rampLen + 0.3, 0.2, PIER.width - 0.3], quaternion: rq, userData: { surface: 'wood' },
  });
  for (const x of pileXs) for (const s of [-1, 1]) physics.addStaticCylinder({ position: [x, deckY - 1.2, zc + s * 1.15], radius: 0.15, height: 2.4 });
  physics.addStaticCylinder({ position: [postX, deckY + 0.35, zc - 0.75], radius: 0.2, height: 0.7, userData: { surface: 'wood' } });
  for (const x of [pileXs[0], pileXs[pileXs.length - 1]]) {
    for (const s of [-1, 1]) physics.addStaticCylinder({ position: [x, deckY + 0.45, zc + s * 1.15], radius: 0.15, height: 0.9 });
  }

  const buoyBase = new THREE.Vector3(x1 - 2.4, 0, zc - 1.2);
  const buoyParts = new Parts(31);
  buoyParts.add(new THREE.SphereGeometry(0.42, 20, 14), { scale: [1, 0.86, 1], color: '#c8402e', vary: 0.12 });
  buoyParts.add(new THREE.CylinderGeometry(0.43, 0.43, 0.16, 20), { pos: [0, 0.05, 0], color: '#efe6d6', vary: 0.1 });
  buoyParts.add(new THREE.CylinderGeometry(0.05, 0.08, 0.6, 8), { pos: [0, 0.55, 0], color: '#3a3430', metal: 0.6 });
  buoyParts.add(new THREE.TorusGeometry(0.09, 0.02, 6, 12), { pos: [0, 0.9, 0], color: '#3a3430', metal: 0.6 });
  const buoy = new THREE.Mesh(buoyParts.build(), stoneMat);
  buoy.castShadow = true;
  pier.add(buoy);
  const ropeA = new THREE.Vector3(x1 + 0.9, deckY + 0.52, zc - 0.75);
  const ropeB = new THREE.Vector3(buoyBase.x, 0.66, buoyBase.z);
  const ropePts = Array.from({ length: 12 }, (_, i) => {
    const k = i / 11;
    const v = new THREE.Vector3().lerpVectors(ropeA, ropeB, k);
    v.y -= Math.sin(k * Math.PI) * 0.7;
    return v;
  });
  const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ropePts), 20, 0.018, 5, false), mat.standard({ color: '#8b7b62', roughness: 0.95 }));
  pier.add(rope);
  scene.add(pier);
  groups.push({ object: pier, center: new THREE.Vector3((x0 + x1) / 2, deckY, zc), far: FAR });

  const lantern = ctx.props.lantern?.([x1 + 0.25 - 0.65, deckY + 2.5, zc + 1.15], { hanging: true, intensity: 2.4 });
  const pierTrace = [x1 + 0.7, deckY, zc + 0.35];

  const pierGroup = groups[groups.length - 1];

  function updateBuoy(t) {
    const wy = ctx.has('water') ? ctx.water.heightAt(buoyBase.x, buoyBase.z) : 0;
    buoy.position.set(buoyBase.x, Math.max(wy, -0.2) - 0.12, buoyBase.z);
    buoy.rotation.set(Math.sin(t * 0.9) * 0.12, t * 0.05, Math.cos(t * 1.1) * 0.1);
  }

  return {
    peak,
    route,
    stairs,
    summitTrace,
    pierTrace,
    pier: { x0, x1, deckY, z: zc },
    lantern,
    groups,
    update(t, camera) {
      for (const g of groups) g.object.visible = camera.position.distanceTo(g.center) < g.far;
      if (pierGroup.object.visible) updateBuoy(t);
    },
  };
}
