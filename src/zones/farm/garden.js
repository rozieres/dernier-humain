import * as THREE from 'three';
import { Parts, lathe, rod, beam, superellipse } from './kit.js';
import { GREENHOUSE, SCARECROW, BALES } from './layout.js';

const PI = Math.PI;
const BRICKS = ['#9c4a32', '#a85a3c', '#8a3e2a', '#b0644a', '#94503a', '#7f3b29'];
const SOIL = '#4a3526';
const STRAW = '#d9b44a';
const LEAF = ['#4f7a2e', '#5f8c34', '#3f6a28', '#6d9a3c'];

const WALL = [[724.5, 31], [741, 27.5], [757, 30.5], [762.5, 44], [757.5, 60], [739, 63.5], [725, 58], [721.5, 48.2], [721.2, 41.5]];

function bed(world, P, cx, cz, a, b, yaw) {
  const pos = [];
  const segs = 36;
  const rings = 4;
  const h = (t) => 0.22 * (1 - t * t) + 0.03;
  const pt = (t, th) => {
    const [ex, ez] = superellipse(a, b, th, 2.6);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const lx = ex * t * (1 + 0.06 * Math.sin(th * 3 + cx));
    const lz = ez * t * (1 + 0.06 * Math.sin(th * 2 + cz));
    const x = cx + lx * c + lz * s;
    const z = cz - lx * s + lz * c;
    return [x, world.heightAt(x, z) + h(t) - (t >= 1 ? 0.12 : 0), z];
  };
  for (let k = 1; k <= rings; k++) {
    for (let i = 0; i < segs; i++) {
      const t0 = (k - 1) / rings;
      const t1 = k === rings ? 1.04 : k / rings;
      const th0 = (i / segs) * PI * 2;
      const th1 = ((i + 1) / segs) * PI * 2;
      const p00 = pt(t0, th0);
      const p01 = pt(t0, th1);
      const p10 = pt(t1, th0);
      const p11 = pt(t1, th1);
      if (k === 1) pos.push(...p00, ...p11, ...p10);
      else pos.push(...p00, ...p01, ...p11, ...p00, ...p11, ...p10);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  P.add(g, { color: SOIL, vary: 0.25 });
  return (t, th) => pt(t, th);
}

function leaf(F, base, dir, len, width, color, droop = 0.25) {
  const g = new THREE.PlaneGeometry(width, len, 1, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + len / 2) / len;
    p.setXYZ(i, p.getX(i) * Math.sin(Math.min(1, t * 1.15) * PI) * 1.1, -droop * t * t * len, t * len);
  }
  g.computeVertexNormals();
  g.rotateX(-Math.atan2(dir[1], Math.hypot(dir[0], dir[2])));
  g.rotateY(Math.atan2(dir[0], dir[2]));
  F.add(g, { pos: base, color, vary: 0.18 });
}

function rosette(F, x, y, z, r, n, colorSet, rand, lift = 0.5) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2 + rand() * 0.4;
    const up = lift + rand() * 0.3;
    leaf(F, [x, y, z], [Math.sin(a), up, Math.cos(a)], r * (0.8 + rand() * 0.4), r * 0.55, colorSet[Math.floor(rand() * colorSet.length)], 0.3);
  }
}

function stoneWall(ctx, S, rand) {
  const { world, physics } = ctx;
  const gap = [7, 8];
  for (let e = 0; e < WALL.length; e++) {
    const [ax, az] = WALL[e];
    const [bx, bz] = WALL[(e + 1) % WALL.length];
    if (e === gap[0]) continue;
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    const yaw = Math.atan2(dx, dz);
    for (let course = 0; course < 3; course++) {
      const step = 0.48;
      const offset = course % 2 ? step / 2 : 0;
      for (let d = offset; d < len; d += step * (0.85 + rand() * 0.3)) {
        const x = ax + dx * d + (rand() - 0.5) * 0.08;
        const z = az + dz * d + (rand() - 0.5) * 0.08;
        const g = world.heightAt(x, z);
        const stone = new THREE.DodecahedronGeometry(0.27, 0);
        stone.scale(1.0 + rand() * 0.45, 0.55 + rand() * 0.25 - (course === 2 ? 0.05 : 0), 1.15 + rand() * 0.3);
        stone.rotateZ((rand() - 0.5) * 0.25);
        stone.rotateY(yaw + PI / 2 + (rand() - 0.5) * 0.3);
        const tone = ['#9a958b', '#8b867c', '#a8a297', '#7e7a72', '#b3ad9f'][Math.floor(rand() * 5)];
        S.add(stone, { pos: [x, g + 0.12 + course * 0.26 + (rand() - 0.5) * 0.04, z], color: tone, vary: 0.14, jitter: 0.03 });
      }
    }
    physics.addStaticBox({
      position: [(ax + bx) / 2, (world.heightAt(ax, az) + world.heightAt(bx, bz)) / 2 + 0.3, (az + bz) / 2],
      size: [0.7, 1.1, len + 0.3],
      quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      userData: { surface: 'stone' },
    });
  }
}

function greenhouse(ctx, parts, rand) {
  const { world, physics } = ctx;
  const { x: gx, z: gz, len, wid, wall, ridge } = GREENHOUSE;
  const { rustic: R, wood: Wd, glass: Gl, foliage: F, glow: G } = parts;
  let floor = -Infinity;
  let low = Infinity;
  for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
    const h = world.heightAt(gx + (cx * len) / 2, gz + (cz * wid) / 2);
    floor = Math.max(floor, h);
    low = Math.min(low, h);
  }
  floor += 0.04;
  const L = len / 2;
  const Wz = wid / 2;
  const knee = 0.58;
  const base = low - 0.25;
  const lean = (y) => (y - floor) * 0.022;
  const P = (lx, y, lz) => [gx + lx + lean(y), y, gz + lz];

  R.box(len - 0.1, 0.08, wid - 0.1, { radius: 0.03, pos: [gx, floor - 0.02, gz], color: '#57402c', vary: 0.3, jitter: 0.01 });
  const door = 0.68;
  const runs = [
    { a: [-L, -Wz], b: [L, -Wz] }, { a: [L, -Wz], b: [L, Wz] }, { a: [L, Wz], b: [-L, Wz] },
    { a: [-L, Wz], b: [-L, door] }, { a: [-L, -door], b: [-L, -Wz] },
  ];
  for (const run of runs) {
    const dx = run.b[0] - run.a[0];
    const dz = run.b[1] - run.a[1];
    const rl = Math.hypot(dx, dz);
    const ux = dx / rl;
    const uz = dz / rl;
    const rows = Math.ceil((floor + knee - base) / 0.095);
    for (let r = 0; r < rows; r++) {
      const y = base + r * 0.095 + 0.045;
      const shift = r % 2 ? 0.15 : 0;
      for (let d = -shift; d < rl; d += 0.3) {
        const d0 = Math.max(0, d);
        const d1 = Math.min(rl, d + 0.29);
        if (d1 - d0 < 0.05) continue;
        const m = (d0 + d1) / 2;
        const g = new THREE.BoxGeometry(d1 - d0, 0.087, 0.22);
        g.rotateY(Math.atan2(ux, uz) + PI / 2);
        const mossy = y < floor + 0.12 && rand() < 0.45;
        const col = mossy ? '#5f6b3a' : BRICKS[Math.floor(rand() * BRICKS.length)];
        R.add(g, { pos: [gx + run.a[0] + ux * m, y, gz + run.a[1] + uz * m], color: col, vary: 0.12, jitter: 0.004 });
      }
    }
    R.add(new THREE.BoxGeometry(rl + 0.05, 0.05, 0.27).rotateY(Math.atan2(ux, uz) + PI / 2), { pos: [gx + run.a[0] + dx / 2, floor + knee + 0.02, gz + run.a[1] + dz / 2], color: '#8f8a80', vary: 0.1 });
  }

  const paint = { color: '#c9c3b2', vary: 0.22, jitter: 0.004 };
  const yk = floor + knee + 0.05;
  const ye = floor + wall;
  const yr = floor + ridge;
  for (const sz of [-1, 1]) {
    beam(Wd, P(-L, yk + 0.05, sz * Wz), P(L, yk + 0.05, sz * Wz), 0.12, 0.1, paint);
    beam(Wd, P(-L - 0.05, ye, sz * Wz), P(L + 0.05, ye, sz * Wz), 0.12, 0.12, paint);
  }
  beam(Wd, P(-L - 0.25, yr, 0), P(L + 0.25, yr, 0), 0.12, 0.16, paint);
  const bays = 6;
  for (let i = 0; i <= bays; i++) {
    const lx = -L + (i / bays) * len;
    const tilt = (rand() - 0.5) * 0.05;
    for (const sz of [-1, 1]) {
      beam(Wd, P(lx, yk, sz * Wz), P(lx + tilt, ye, sz * Wz), 0.08, 0.08, paint);
      beam(Wd, P(lx, ye, sz * Wz), P(lx, yr, 0), 0.07, 0.09, paint);
    }
  }
  for (const ex of [-L, L]) {
    for (const lz of ex < 0 ? [-Wz, -door, door, Wz] : [-Wz, -1, 0, 1, Wz]) {
      const top = yr - (Math.abs(lz) / Wz) * (yr - ye);
      beam(Wd, P(ex, yk, lz), P(ex, top, lz), 0.08, 0.08, paint);
    }
  }
  beam(Wd, P(-L, floor + 2.3, -door - 0.05), P(-L, floor + 2.3, door + 0.05), 0.1, 0.1, paint);
  for (const lz of [-door, door]) beam(Wd, P(-L, floor, lz), P(-L, yk, lz), 0.09, 0.09, paint);

  const pane = (a, b, c, d, tint, opacity = 1) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(12), 2));
    Gl.add(g, { color: tint, vary: 0.12 * opacity });
  };
  const shard = (a, b, c) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2));
    Gl.add(g, { color: '#dfe8e2', vary: 0.05 });
  };
  const tint = () => (rand() < 0.3 ? '#9fb07a' : rand() < 0.5 ? '#dfe7e4' : '#cfdccf');
  const broken = new Set(['roof:1:2', 'roof:-1:4', 'wall:1:3']);
  for (let i = 0; i < bays; i++) {
    const x0 = -L + (i / bays) * len + 0.05;
    const x1 = -L + ((i + 1) / bays) * len - 0.05;
    for (const sz of [-1, 1]) {
      const z = sz * Wz;
      if (broken.has(`wall:${sz}:${i}`)) shard(P(x0, yk + 0.05, z), P(x0 + 0.4, yk + 0.05, z), P(x0, yk + 0.7, z));
      else pane(P(x0, yk + 0.05, z), P(x1, yk + 0.05, z), P(x1, ye - 0.05, z), P(x0, ye - 0.05, z), tint());
      const zr = sz * 0.06;
      if (broken.has(`roof:${sz}:${i}`)) {
        shard(P(x0, ye + 0.03, z * 0.98), P(x1, ye + 0.03, z * 0.98), P(x0 + 0.3, ye + 0.35, z * 0.82));
      } else pane(P(x0, ye + 0.03, z * 0.98), P(x1, ye + 0.03, z * 0.98), P(x1, yr - 0.04, zr), P(x0, yr - 0.04, zr), tint());
      if (rand() < 0.5) R.box(x1 - x0, 0.03, 0.04, { radius: 0.01, pos: [gx + (x0 + x1) / 2 + lean(yk), yk + 0.08, gz + z * 0.99], color: '#56692f', vary: 0.3 });
    }
  }
  for (const ex of [-L, L]) {
    const spans = ex < 0 ? [[-Wz, -door], [door, Wz]] : [[-Wz, -1], [-1, 0], [0, 1], [1, Wz]];
    for (const [z0, z1] of spans) {
      const t0 = yr - (Math.abs(z0) / Wz) * (yr - ye);
      const t1 = yr - (Math.abs(z1) / Wz) * (yr - ye);
      pane(P(ex, yk + 0.05, z0 + 0.04), P(ex, yk + 0.05, z1 - 0.04), P(ex, t1 - 0.05, z1 - 0.04), P(ex, t0 - 0.05, z0 + 0.04), tint());
    }
    if (ex < 0) pane(P(ex, floor + 2.36, -door), P(ex, floor + 2.36, door), P(ex, yr - 0.06, 0.1), P(ex, yr - 0.06, -0.1), tint());
  }

  const hinge = P(-L, floor, -door);
  const openA = -1.95;
  const dq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), openA);
  const dp = (u, y) => {
    const v = new THREE.Vector3(0, 0, u).applyQuaternion(dq);
    return [hinge[0] + v.x, floor + y, hinge[2] + v.z];
  };
  for (const u of [0.04, 1.28]) beam(Wd, dp(u, 0.02), dp(u, 2.24), 0.07, 0.07, paint);
  for (const y of [0.05, 0.85, 2.22]) beam(Wd, dp(0, y), dp(1.32, y), 0.07, 0.07, paint);
  pane(dp(0.08, 0.9), dp(1.24, 0.9), dp(1.24, 2.18), dp(0.08, 2.18), '#d4e0da');

  const bench = { x0: -1.9, x1: 2.6, z0: -Wz + 0.12, z1: -Wz + 0.85, y: floor + 0.86 };
  const bw = { color: '#8b6a45', vary: 0.2, jitter: 0.005 };
  for (let k = 0; k < 5; k++) {
    const z = bench.z0 + 0.07 + k * 0.145;
    Wd.box(bench.x1 - bench.x0, 0.045, 0.13, { radius: 0.012, pos: [gx + (bench.x0 + bench.x1) / 2, bench.y - 0.02, gz + z], ...bw });
  }
  for (const lx of [bench.x0 + 0.1, (bench.x0 + bench.x1) / 2, bench.x1 - 0.1]) {
    for (const lz of [bench.z0 + 0.06, bench.z1 - 0.06]) Wd.box(0.07, 0.84, 0.07, { radius: 0.01, pos: [gx + lx, floor + 0.42, gz + lz], ...bw });
  }
  Wd.box(bench.x1 - bench.x0, 0.03, 0.6, { radius: 0.01, pos: [gx + (bench.x0 + bench.x1) / 2, floor + 0.25, gz + (bench.z0 + bench.z1) / 2], ...bw });
  physics.addStaticBox({ position: [gx + (bench.x0 + bench.x1) / 2, floor + 0.43, gz + (bench.z0 + bench.z1) / 2], size: [bench.x1 - bench.x0, 0.86, bench.z1 - bench.z0], userData: { surface: 'wood' } });

  const pots = [-1.05, 0.25, 1.55].map((lx, i) => {
    const px = gx + lx;
    const pz = gz + (bench.z0 + bench.z1) / 2 + 0.02;
    const py = bench.y;
    R.add(lathe([[0, 0.0], [0.15, 0.0], [0.17, 0.02], [0.215, 0.3], [0.245, 0.31], [0.25, 0.38], [0.215, 0.385], [0.2, 0.33], [0.0, 0.33]], 32), { pos: [px, py, pz], color: ['#c0673d', '#b85f38', '#c97448'][i], vary: 0.14, jitter: 0.004 });
    R.add(new THREE.CircleGeometry(0.205, 24).rotateX(-PI / 2), { pos: [px, py + 0.335, pz], color: '#3e2b1d', vary: 0.3 });
    rod(Wd, [px + 0.17, py + 0.3, pz + 0.12], [px + 0.2, py + 0.62, pz + 0.16], 0.012, bw, 5);
    physics.addStaticCylinder({ position: [px, py + 0.165, pz], radius: 0.24, height: 0.33, userData: { surface: 'stone' } });
    return { index: i, soil: new THREE.Vector3(px, py + 0.335, pz), label: new THREE.Vector3(px + 0.2, py + 0.62, pz + 0.17) };
  });

  const shelf = { x: L - 0.2, z0: -0.7, z1: 1.55 };
  for (const y of [0.42, 1.02, 1.55]) Wd.box(0.32, 0.035, shelf.z1 - shelf.z0, { radius: 0.01, pos: [gx + shelf.x, floor + y, gz + (shelf.z0 + shelf.z1) / 2], ...bw });
  for (const lz of [shelf.z0, shelf.z1]) Wd.box(0.32, 1.6, 0.04, { radius: 0.01, pos: [gx + shelf.x, floor + 0.8, gz + lz], ...bw });
  physics.addStaticBox({ position: [gx + shelf.x, floor + 0.8, gz + (shelf.z0 + shelf.z1) / 2], size: [0.34, 1.6, shelf.z1 - shelf.z0 + 0.1] });
  const jams = ['#7a1f2b', '#b3422c', '#5a1838', '#c8792a', '#8f2a1e'];
  let empty = null;
  for (const [y, n] of [[0.44, 4], [1.04, 5], [1.57, 3]]) {
    for (let k = 0; k < n; k++) {
      const lz = shelf.z0 + 0.25 + k * ((shelf.z1 - shelf.z0 - 0.4) / Math.max(1, n - 1));
      const jx = gx + shelf.x + (rand() - 0.5) * 0.06;
      const jy = floor + y + 0.018;
      const jz = gz + lz;
      const isEmpty = y < 0.5 && k === 2;
      Gl.add(lathe([[0, 0], [0.055, 0], [0.06, 0.02], [0.06, 0.13], [0.05, 0.15], [0.045, 0.16]], 18), { pos: [jx, jy, jz], color: '#e8f0ec', vary: 0.05 });
      if (!isEmpty) R.add(lathe([[0, 0.005], [0.052, 0.005], [0.054, 0.11], [0, 0.11]], 14), { pos: [jx, jy, jz], color: jams[(k + Math.round(y * 3)) % jams.length], vary: 0.15 });
      R.add(lathe([[0, 0.155], [0.052, 0.155], [0.055, 0.175], [0, 0.18]], 14), { pos: [jx, jy, jz], color: isEmpty ? '#b8a77a' : ['#c33', '#e8d9b0', '#d9a441'][k % 3], vary: 0.1 });
      if (!isEmpty && rand() < 0.6) R.box(0.07, 0.05, 0.004, { radius: 0.002, pos: [jx - 0.0, jy + 0.07, jz + 0.061], color: '#f1e6c8' });
      if (isEmpty) empty = new THREE.Vector3(jx, floor + y + 0.02, jz);
    }
  }

  const potsFill = [[1.8, 1.2], [-0.4, 1.3], [0.9, 1.55]];
  for (const [lx, lz] of potsFill) {
    R.add(lathe([[0, 0], [0.11, 0], [0.12, 0.02], [0.15, 0.2], [0.17, 0.21], [0.17, 0.25], [0.14, 0.24], [0, 0.22]], 20), { pos: [gx + lx, floor, gz + lz], color: '#b8643c', vary: 0.15 });
  }
  R.box(1.3, 0.25, 0.5, { radius: 0.04, pos: [gx - 0.5, floor + 0.12, gz + Wz - 0.4], color: '#6b4b31', vary: 0.2 });
  R.box(1.24, 0.06, 0.44, { radius: 0.02, pos: [gx - 0.5, floor + 0.24, gz + Wz - 0.4], color: '#3d2a1c', vary: 0.3 });
  for (let k = 0; k < 7; k++) rosette(F, gx - 1.05 + k * 0.17, floor + 0.27, gz + Wz - 0.4 + (rand() - 0.5) * 0.2, 0.08, 5, LEAF, rand, 0.6);
  rod(Wd, [gx - 2.4, floor, gz + Wz - 0.2], [gx - 2.2, floor + 1.3, gz + Wz - 0.15], 0.018, bw, 5);
  rod(Wd, [gx - 2.3, floor, gz + Wz - 0.25], [gx - 2.25, floor + 1.35, gz + Wz - 0.1], 0.018, bw, 5);

  const hook = P(0.4, yr - 0.08, 0);
  rod(R, hook, [hook[0], hook[1] - 0.45, hook[2]], 0.008, { color: '#3a3530', metal: 0.6 }, 4);
  const lampY = hook[1] - 0.62;
  R.add(lathe([[0, -0.12], [0.09, -0.12], [0.1, -0.09], [0.07, -0.08], [0.07, 0.1], [0.1, 0.12], [0.03, 0.18], [0.02, 0.2], [0, 0.2]], 12), { pos: [hook[0], lampY, hook[2]], color: '#2f2b27', metal: 0.5 });
  Gl.add(lathe([[0.075, -0.08], [0.085, 0], [0.075, 0.1]], 12), { pos: [hook[0], lampY, hook[2]], color: '#ffe1a8' });
  G.add(lathe([[0, -0.03], [0.022, 0.0], [0.016, 0.05], [0, 0.08]], 10), { pos: [hook[0], lampY, hook[2]], color: '#ffb454', vary: 0 });

  const S = 0.24;
  const wallsY = (low + floor + wall) / 2;
  const wallsH = floor + wall - low + 0.3;
  physics.addStaticBox({ position: [gx, wallsY, gz - Wz], size: [len + 0.2, wallsH, S] });
  physics.addStaticBox({ position: [gx, wallsY, gz + Wz], size: [len + 0.2, wallsH, S] });
  physics.addStaticBox({ position: [gx + L, wallsY, gz], size: [S, wallsH, wid] });
  for (const side of [-1, 1]) physics.addStaticBox({ position: [gx - L, wallsY, gz + side * (door + (Wz - door) / 2)], size: [S, wallsH, Wz - door] });
  physics.addStaticBox({ position: [gx, floor - 0.06, gz], size: [len, 0.16, wid], userData: { surface: 'dirt' } });
  const doorMid = dp(0.66, 1.1);
  physics.addStaticBox({ position: doorMid, size: [0.08, 2.2, 1.32], quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), openA) });

  return { floor, pots, empty, lamp: new THREE.Vector3(hook[0], lampY + 0.02, hook[2]), door: new THREE.Vector3(gx - L - 1.2, floor, gz) };
}

function outdoor(ctx, parts, rand) {
  const { world, physics } = ctx;
  const { rustic: R, wood: Wd, foliage: F, stone: St } = parts;
  const bw = { color: '#8a6b47', vary: 0.22, jitter: 0.006 };
  const tomato = bed(world, R, 729.5, 37, 3.2, 1.3, 0.12);
  for (let i = 0; i < 6; i++) {
    const t = (i / 5) * 1.6 - 0.8;
    const [sx, sy, sz] = tomato(Math.abs(t), t < 0 ? PI : 0);
    const lean = [(rand() - 0.5) * 0.12, 0, (rand() - 0.5) * 0.12];
    rod(Wd, [sx, sy - 0.2, sz], [sx + lean[0], sy + 1.55, sz + lean[2]], 0.02, bw, 5);
    for (let k = 0; k < 6; k++) {
      const y = sy + 0.25 + k * 0.2;
      rosette(F, sx + lean[0] * (k / 6), y, sz + lean[2] * (k / 6), 0.22 - k * 0.015, 3, LEAF, rand, 0.1);
    }
    for (let k = 0; k < 4; k++) {
      const a = rand() * PI * 2;
      R.add(new THREE.SphereGeometry(0.045 + rand() * 0.02, 7, 5), { pos: [sx + Math.sin(a) * 0.14, sy + 0.4 + rand() * 0.7, sz + Math.cos(a) * 0.14], color: rand() < 0.65 ? '#c2281e' : '#7d9a2f', vary: 0.12 });
    }
  }
  const lettuce = bed(world, R, 731, 51, 2.6, 1.2, -0.25);
  for (let i = 0; i < 9; i++) {
    const [x, y, z] = lettuce(0.25 + (i % 3) * 0.3, Math.floor(i / 3) * 2.1 + 0.3);
    rosette(F, x, y - 0.03, z, 0.2 + rand() * 0.06, 9, ['#8fbf4a', '#79ad3c', '#a3cc5c'], rand, 0.55);
  }
  const beans = bed(world, R, 729.5, 41.2, 1.3, 1.2, 0);
  const [bx, by, bz] = beans(0, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    const foot = [bx + Math.sin(a) * 0.75, by - 0.15, bz + Math.cos(a) * 0.75];
    const top = [bx + Math.sin(a) * 0.06, by + 2.1, bz + Math.cos(a) * 0.06];
    rod(Wd, foot, top, 0.02, bw, 5);
    for (let k = 0; k < 9; k++) {
      const t = 0.1 + k * 0.09;
      const p = [foot[0] + (top[0] - foot[0]) * t, foot[1] + (top[1] - foot[1]) * t, foot[2] + (top[2] - foot[2]) * t];
      leaf(F, p, [Math.sin(a + k), 0.3, Math.cos(a + k)], 0.12, 0.09, LEAF[k % 4], 0.2);
    }
  }
  const flowers = bed(world, R, 749.5, 57, 3.6, 1.0, 0.35);
  for (let i = 0; i < 14; i++) {
    const [x, y, z] = flowers(rand() * 0.8, rand() * PI * 2);
    rosette(F, x, y - 0.02, z, 0.12, 5, ['#5f8f3a', '#6e9c44'], rand, 0.35);
    R.add(new THREE.SphereGeometry(0.05, 8, 6).scale(1, 0.45, 1), { pos: [x + 0.05, y + 0.12, z], color: rand() < 0.5 ? '#ff8a1e' : '#f2b01e', vary: 0.1 });
  }

  const can = new THREE.Vector3(735.5, 0, 48.6);
  can.y = world.heightAt(can.x, can.z);
  R.add(lathe([[0, 0], [0.16, 0], [0.17, 0.02], [0.17, 0.3], [0.13, 0.34], [0, 0.35]], 24), { pos: [can.x, can.y, can.z], color: '#5d7a5a', metal: 0.45, vary: 0.2 });
  rod(R, [can.x + 0.15, can.y + 0.1, can.z], [can.x + 0.48, can.y + 0.38, can.z], 0.022, { color: '#5d7a5a', metal: 0.45 }, 8);
  R.add(new THREE.ConeGeometry(0.05, 0.06, 12).rotateZ(-PI / 2 + 0.7), { pos: [can.x + 0.5, can.y + 0.4, can.z], color: '#6f8a6a', metal: 0.4 });
  const handle = new THREE.TorusGeometry(0.13, 0.016, 6, 16, PI);
  R.add(handle, { pos: [can.x - 0.02, can.y + 0.33, can.z], color: '#55704f', metal: 0.4 });

  const wb = { x: 744.2, z: 52.2, yaw: 0.6 };
  const wy = world.heightAt(wb.x, wb.z);
  const wq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), wb.yaw);
  const wl = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(wq).add(new THREE.Vector3(wb.x, wy, wb.z)).toArray();
  const tray = (g, p, rot) => {
    g.rotateX(rot[0]);
    g.rotateZ(rot[2]);
    g.applyQuaternion(wq);
    Wd.add(g, { pos: wl(...p), ...bw, color: '#7d6a4f' });
  };
  tray(new THREE.BoxGeometry(0.62, 0.04, 0.9), [0, 0.42, 0], [0, 0, 0]);
  tray(new THREE.BoxGeometry(0.04, 0.3, 0.9), [0.32, 0.55, 0], [0, 0, -0.25]);
  tray(new THREE.BoxGeometry(0.04, 0.3, 0.9), [-0.32, 0.55, 0], [0, 0, 0.25]);
  tray(new THREE.BoxGeometry(0.62, 0.3, 0.04), [0, 0.55, 0.47], [0.3, 0, 0]);
  tray(new THREE.BoxGeometry(0.62, 0.3, 0.04), [0, 0.55, -0.47], [-0.3, 0, 0]);
  for (const sx of [-0.22, 0.22]) {
    rod(Wd, wl(sx, 0.38, -0.55), wl(sx * 1.25, 0.62, 1.15), 0.025, bw, 6);
    rod(Wd, wl(sx, 0.42, 0.35), wl(sx, 0.0, 0.42), 0.025, bw, 6);
  }
  const wheel = new THREE.TorusGeometry(0.2, 0.05, 8, 20).rotateY(PI / 2);
  wheel.applyQuaternion(wq);
  R.add(wheel, { pos: wl(0, 0.22, -0.68), color: '#2d2a27', vary: 0.1 });
  R.add(new THREE.SphereGeometry(0.3, 12, 8).scale(1, 0.35, 1.3), { pos: wl(0, 0.5, 0), color: SOIL, vary: 0.3 });
  physics.addStaticBox({ position: wl(0, 0.4, 0.1), size: [0.75, 0.8, 1.7], quaternion: wq });

  const cb = { x: 752.2, z: 40.6 };
  const cy = world.heightAt(cb.x, cb.z);
  for (let k = 0; k < 6; k++) {
    for (const [ox, oz, w, d] of [[0, -0.7, 1.6, 0.05], [0, 0.7, 1.6, 0.05], [0.8, 0, 0.05, 1.4], [-0.8, 0, 0.05, 1.4]]) {
      Wd.box(w, 0.12, d, { radius: 0.01, pos: [cb.x + ox, cy + 0.08 + k * 0.15, cb.z + oz], ...bw, color: k % 2 ? '#7a5e40' : '#866646' });
    }
  }
  R.add(new THREE.SphereGeometry(0.85, 16, 10).scale(1, 0.32, 0.8), { pos: [cb.x, cy + 0.82, cb.z], color: '#4b3a26', vary: 0.35, jitter: 0.04 });
  for (let k = 0; k < 18; k++) R.add(new THREE.ConeGeometry(0.03, 0.4, 4).rotateZ(PI / 2 + (rand() - 0.5)).rotateY(rand() * PI), { pos: [cb.x + (rand() - 0.5) * 1.2, cy + 0.9, cb.z + (rand() - 0.5) * 1.0], color: STRAW, vary: 0.2 });
  physics.addStaticBox({ position: [cb.x, cy + 0.5, cb.z], size: [1.7, 1.0, 1.5] });

  const ry = world.heightAt(738.5, 47.6);
  rod(Wd, [738.5, ry - 0.05, 47.6], [738.85, ry + 1.5, 47.3], 0.02, { color: '#6d8f3a', vary: 0.1 }, 6);
  Wd.box(0.4, 0.05, 0.05, { radius: 0.01, pos: [738.87, ry + 1.53, 47.29], rot: [0, 0.6, 0], color: '#5f8a35' });

  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const x = 723.6 + t * 13.5 + Math.sin(i * 1.7) * 0.4;
    const z = 44.8 + Math.sin(t * 2.4) * 0.6;
    const st = new THREE.CylinderGeometry(0.34, 0.38, 0.12, 12).scale(1 + rand() * 0.25, 1, 0.8 + rand() * 0.2).rotateY(rand() * PI);
    St.add(st, { pos: [x, world.heightAt(x, z) + 0.08, z], color: '#a39d91', vary: 0.12, jitter: 0.02 });
  }
}

function scarecrow(ctx, parts, rand) {
  const { world, physics } = ctx;
  const { rustic: R, wood: Wd } = parts;
  const { x, z, yaw } = SCARECROW;
  const y = world.heightAt(x, z);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const L = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyQuaternion(q).add(new THREE.Vector3(x, y, z)).toArray();
  const bw = { color: '#7e6040', vary: 0.22, jitter: 0.006 };
  const coat = { color: '#56603f', vary: 0.25, jitter: 0.01 };
  rod(Wd, L(0, -0.4, 0), L(0.03, 2.55, 0), 0.06, bw, 8);
  rod(Wd, L(-0.95, 1.85, 0.02), L(0.95, 1.82, -0.02), 0.045, bw, 8);
  R.add(lathe([[0.22, 0], [0.3, 0.06], [0.33, 0.35], [0.3, 0.62], [0.2, 0.74], [0.08, 0.78]], 20), { pos: L(0, 1.12, 0), ...coat });
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * PI * 2;
    R.add(new THREE.ConeGeometry(0.06, 0.24, 4).rotateX(PI), { pos: L(Math.sin(a) * 0.24, 1.06, Math.cos(a) * 0.24), ...coat });
  }
  for (const sx of [-1, 1]) {
    rod(R, L(sx * 0.25, 1.8, 0), L(sx * 0.78, 1.75, 0), 0.12, { ...coat, taper: 0.85 }, 10);
    for (let k = 0; k < 7; k++) {
      const g = new THREE.ConeGeometry(0.025, 0.3 + rand() * 0.15, 4);
      g.rotateZ(sx * (PI / 2) + (rand() - 0.5) * 0.9);
      g.applyQuaternion(q);
      R.add(g, { pos: L(sx * 0.92, 1.76 + (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.12), color: STRAW, vary: 0.2 });
    }
  }
  R.box(0.12, 0.12, 0.02, { radius: 0.01, pos: L(0.12, 1.45, 0.31), rot: [0, yaw, 0], color: '#8a4b38' });
  R.box(0.1, 0.14, 0.02, { radius: 0.01, pos: L(-0.15, 1.62, 0.3), rot: [0, yaw, 0], color: '#3f4f66' });
  R.add(new THREE.SphereGeometry(0.21, 16, 12).scale(1, 1.1, 0.95), { pos: L(0, 2.16, 0), color: '#b59b6b', vary: 0.18, jitter: 0.012 });
  const hat = lathe([[0, 0], [0.42, 0.0], [0.44, 0.02], [0.2, 0.05], [0.18, 0.2], [0.12, 0.26], [0, 0.27]], 20).rotateZ(0.12);
  hat.applyQuaternion(q);
  R.add(hat, { pos: L(0, 2.3, 0), color: '#c9a55a', vary: 0.2, jitter: 0.01 });
  for (const sx of [-0.07, 0.07]) R.box(0.04, 0.04, 0.02, { radius: 0.005, pos: L(sx, 2.2, 0.2), rot: [0, yaw, 0], color: '#2b2118' });
  for (let k = 0; k < 10; k++) {
    const g = new THREE.ConeGeometry(0.02, 0.22, 4);
    g.rotateX(PI + (rand() - 0.5) * 0.6);
    R.add(g, { pos: L((rand() - 0.5) * 0.25, 1.96, (rand() - 0.5) * 0.2), color: STRAW, vary: 0.2 });
  }
  for (const sx of [-1, 1]) rod(R, L(sx * 0.25, 1.88, 0.2), L(sx * 0.22, 1.55, 0.33), 0.006, { color: '#3b3128' }, 4);
  physics.addStaticCylinder({ position: [x, y + 1.2, z], radius: 0.3, height: 2.4, userData: { surface: 'wood' } });
  return { sign: new THREE.Vector3(...L(0, 1.47, 0.345)), yaw, ground: y, local: (lx, ly, lz) => new THREE.Vector3(...L(lx, ly, lz)) };
}

export function balePile(ctx) {
  const { x, z } = BALES;
  const y = ctx.world.heightAt(x, z);
  const spots = [];
  for (const lx of [-1.6, 0, 1.6]) spots.push({ p: [x + lx, y + 0.62, z], stand: false });
  for (const lx of [-0.8, 0.8]) spots.push({ p: [x + lx, y + 1.53, z], stand: false });
  spots.push({ p: [x, y + 2.44, z], stand: false });
  for (const lz of [-1.25, 1.25]) spots.push({ p: [x + 0.8, y + 0.62, z + lz], stand: true });
  spots.push({ p: [x + 3.2, y + 0.62, z + 1.6], stand: false, yaw: 0.9 });
  spots.push({ p: [x - 2.9, y + 0.62, z - 1.9], stand: true });
  return { spots, seed: new THREE.Vector3(x + 0.8, y + 0.2, z) };
}

export function buildGarden(ctx, parts, scarecrowParts) {
  const rand = ctx.rng.seeded('farm:garden');
  stoneWall(ctx, parts.stone, rand);
  const gh = greenhouse(ctx, parts, rand);
  outdoor(ctx, parts, rand);
  const sc = scarecrow(ctx, { rustic: scarecrowParts, wood: scarecrowParts }, rand);
  return { greenhouse: gh, scarecrow: sc };
}

export function sproutGeometry() {
  const P = new Parts(701);
  rod(P, [0, -0.02, 0], [0.01, 0.16, 0], 0.008, { color: '#6c9a3a' }, 5);
  rod(P, [0.01, 0.16, 0], [0, 0.3, 0.01], 0.007, { color: '#6c9a3a' }, 5);
  const F = P;
  leaf(F, [0.01, 0.15, 0], [1, 0.25, 0], 0.09, 0.06, '#7fb043', 0.15);
  leaf(F, [0.01, 0.15, 0], [-1, 0.25, 0.1], 0.09, 0.06, '#7fb043', 0.15);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + 0.4;
    leaf(F, [0, 0.29, 0.01], [Math.sin(a), 0.6, Math.cos(a)], 0.12, 0.075, LEAF[i], 0.25);
  }
  return P.build();
}
