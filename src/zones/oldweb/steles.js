import * as THREE from 'three';
import { PI, euler } from './kit.js';
import { pageUV } from './textures.js';
import { CLUSTERS, KEEP_OUT, pathDistance, FACE_NE } from './layout.js';

const STONES = ['#c97e4e', '#bf7448', '#d08c5a', '#b86f46', '#c98458', '#cf9264'];
const SAND = '#b46e44';
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const ONE = new THREE.Vector3(1, 1, 1);

function outline(type, w, h) {
  const s = new THREE.Shape();
  const hw = w / 2;
  s.moveTo(-hw, 0);
  s.lineTo(hw, 0);
  let top;
  if (type === 'round') {
    top = h - hw;
    s.lineTo(hw, top);
    s.absarc(0, top, hw, 0, PI, false);
  } else if (type === 'gothic') {
    top = h - w * 0.8;
    s.lineTo(hw, top);
    s.quadraticCurveTo(hw, h - w * 0.22, 0, h);
    s.quadraticCurveTo(-hw, h - w * 0.22, -hw, top);
  } else {
    top = h - 0.16;
    s.lineTo(hw, top);
    s.lineTo(hw - 0.16, h);
    s.lineTo(-hw + 0.16, h);
    s.lineTo(-hw, top);
  }
  s.lineTo(-hw, 0);
  return { shape: s, top };
}

function extrude(points, d) {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(points), {
    depth: d, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 8,
  });
  g.translate(0, 0, -d / 2);
  return g;
}

function crackLine(r, hw, yc) {
  const pts = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const x = -hw + (2 * hw * i) / n;
    pts.push(new THREE.Vector2(x, yc + (r() - 0.5) * 0.26 + (i === 0 || i === n ? 0 : (r() - 0.5) * 0.12)));
  }
  return pts;
}

function crackY(crack, x) {
  for (let i = 0; i < crack.length - 1; i++) {
    const a = crack[i];
    const b = crack[i + 1];
    if (x >= a.x && x <= b.x) return a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
  }
  return crack[x < 0 ? 0 : crack.length - 1].y;
}

function facePoly(fx0, fx1, fy0, fy1, crack, part) {
  if (!crack) return [new THREE.Vector2(fx0, fy0), new THREE.Vector2(fx1, fy0), new THREE.Vector2(fx1, fy1), new THREE.Vector2(fx0, fy1)];
  const inner = crack.filter((p) => p.x > fx0 && p.x < fx1);
  const a = new THREE.Vector2(fx0, crackY(crack, fx0));
  const b = new THREE.Vector2(fx1, crackY(crack, fx1));
  if (part === 'low') return [new THREE.Vector2(fx0, fy0), new THREE.Vector2(fx1, fy0), b, ...inner.slice().reverse(), a];
  return [a, ...inner, b, new THREE.Vector2(fx1, fy1), new THREE.Vector2(fx0, fy1)];
}

function faceGeometry(points, [fx0, fx1, fy0, fy1], uv, z) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(points));
  const p = g.attributes.position;
  const t = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const u = (p.getX(i) - fx0) / (fx1 - fx0);
    const v = (p.getY(i) - fy0) / (fy1 - fy0);
    t.setXY(i, uv[0] + u * (uv[2] - uv[0]), uv[1] + v * (uv[3] - uv[1]));
    p.setZ(i, z);
  }
  return g;
}

function placements(world, r) {
  const out = [];
  const taken = [];
  for (const cl of CLUSTERS) {
    const facing = FACE_NE + (r() - 0.5) * 0.5;
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    const rowX = fz;
    const rowZ = -fx;
    for (let a = -cl.r; a <= cl.r; a += 3.3) {
      for (let b = -cl.r; b <= cl.r; b += 5.2) {
        if (a * a + b * b > cl.r * cl.r) continue;
        if (r() < 0.3) continue;
        const x = cl.x + rowX * a + fx * b + (r() - 0.5) * 1.3;
        const z = cl.z + rowZ * a + fz * b + (r() - 0.5) * 1.3;
        if (pathDistance(x, z) < 4.2) continue;
        if (KEEP_OUT.some((k) => (x - k.x) ** 2 + (z - k.z) ** 2 < k.r * k.r)) continue;
        if (world.slopeAt(x, z) > 0.12 || world.heightAt(x, z) > 19.5) continue;
        if (taken.some((t) => (x - t[0]) ** 2 + (z - t[1]) ** 2 < 6.5)) continue;
        taken.push([x, z]);
        out.push({ x, z, yaw: facing + (r() - 0.5) * 0.35 });
      }
    }
  }
  return out;
}

export function buildCemetery(B) {
  const { world, rand: r, P } = B;
  const spots = placements(world, r);
  const crtSlots = new Set();
  for (let i = 0; i < 7 && spots.length > 20; i++) crtSlots.add(Math.floor((i + 0.5) * (spots.length / 7)));
  const crts = [];
  let count = 0;
  spots.forEach((s, i) => {
    if (crtSlots.has(i)) {
      crts.push(s);
      return;
    }
    count++;
    const roll = r();
    const state = roll < 0.5 ? 'stand' : roll < 0.64 ? 'lean' : roll < 0.75 ? 'buried' : roll < 0.87 ? 'fallen' : 'cracked';
    const tr = r();
    const type = tr < 0.5 ? 'round' : tr < 0.72 ? 'gothic' : 'slab';
    const w = 1.05 + r() * 0.6;
    const h = Math.max(w * 1.45, 1.9 + r() * 1.35 + (r() < 0.12 ? 0.6 : 0));
    const d = 0.22 + r() * 0.1;
    const color = STONES[Math.floor(r() * STONES.length)];
    const { shape, top } = outline(type, w, h);
    const lift = type === 'round' ? w * 0.2 : type === 'gothic' ? w * 0.28 : 0;
    const fh = Math.min((w - 0.16) * 1.25, top - 0.34 + lift);
    const fw = fh * 0.8;
    const fy0 = Math.max(0.3, top + lift - fh - 0.04);
    const rect = [-fw / 2, fw / 2, fy0, fy0 + fh];
    const uv = pageUV(Math.floor(r() * 16));
    const zf = d / 2 + 0.034;
    let ground = Infinity;
    for (const [ox, oz] of [[-w / 2, -d], [w / 2, -d], [-w / 2, d], [w / 2, d]]) {
      const c = Math.cos(s.yaw);
      const sn = Math.sin(s.yaw);
      ground = Math.min(ground, world.heightAt(s.x + ox * c + oz * sn, s.z - ox * sn + oz * c));
    }

    const leanX = state === 'lean' ? -(0.14 + r() * 0.16) * (r() < 0.6 ? 1 : -1) : (r() - 0.5) * 0.1;
    const leanZ = state === 'lean' ? (r() - 0.5) * 0.3 : (r() - 0.5) * 0.12;
    let sink = 0.08 + r() * 0.12;
    let quat;
    if (state === 'fallen') {
      const up = r() < 0.75;
      quat = euler(up ? -PI / 2 + (r() - 0.5) * 0.08 : PI / 2, s.yaw + (r() - 0.5) * 1.2, (r() - 0.5) * 0.06);
      sink = -(d / 2) + 0.06;
    } else if (state === 'buried') {
      quat = euler(-(0.2 + r() * 0.2), s.yaw, (r() - 0.5) * 0.4);
      sink = h * (0.35 + r() * 0.15);
    } else quat = euler(leanX, s.yaw, leanZ);
    const pos = new THREE.Vector3(s.x, ground - sink, s.z);
    const M = new THREE.Matrix4().compose(pos, quat, ONE);
    const stone = { color, vary: 0.14, jitter: 0.012, jitterK: 3 };

    const yc = Math.min(top - 0.35, fy0 + fh * (0.35 + r() * 0.3));
    if (state === 'cracked' && yc > fy0 + 0.25) {
      const crack = crackLine(r, w / 2, yc);
      const pts = shape.getPoints(8);
      const low = [new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), ...crack.slice().reverse()];
      const high = [...crack, ...pts.filter((p) => p.y > yc + 0.3 && !(p.y <= 0.001))];
      P.stone.add(extrude(low, d), { ...stone, matrix: M });
      P.pages.add(faceGeometry(facePoly(rect[0], rect[1], rect[2], rect[3], crack, 'low'), rect, uv, zf), { matrix: M, vary: 0 });
      B.box(M, [0, yc / 2, 0], [w, yc, d]);
      const yaw2 = s.yaw + (r() - 0.5) * 2;
      const off = 0.9 + r() * 0.8;
      const side = r() < 0.5 ? 1 : -1;
      const px = s.x + Math.cos(yaw2) * off * side + Math.sin(s.yaw) * 1.2;
      const pz = s.z - Math.sin(yaw2) * off * side + Math.cos(s.yaw) * 1.2;
      const gy = world.heightAt(px, pz);
      const centerY = (yc + h) / 2;
      const q2 = euler(-PI / 2 + (r() - 0.5) * 0.25, yaw2, (r() - 0.5) * 0.2);
      const M2 = new THREE.Matrix4().compose(new THREE.Vector3(px, gy + d / 2 - 0.04, pz), q2, ONE).multiply(_m.makeTranslation(0, -centerY, 0));
      P.stone.add(extrude(high, d), { ...stone, matrix: M2 });
      P.pages.add(faceGeometry(facePoly(rect[0], rect[1], rect[2], rect[3], crack, 'high'), rect, uv, zf), { matrix: M2, vary: 0 });
      B.box(M2, [0, centerY, 0], [w, h - yc, d]);
    } else {
      P.stone.add(new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 8 }).translate(0, 0, -d / 2), { ...stone, matrix: M });
      P.pages.add(faceGeometry(facePoly(...rect), rect, uv, zf), { matrix: M, vary: 0 });
      B.box(M, [0, h / 2, 0], [w, h, d]);
    }

    if (state !== 'fallen') {
      const windSide = r() < 0.7 ? 1 : -1;
      _v.set((r() - 0.5) * 0.3, 0, windSide * (d / 2 + 0.18)).applyQuaternion(_q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw));
      const sx = s.x + _v.x;
      const sz = s.z + _v.z;
      P.wood.add(new THREE.SphereGeometry(1, 9, 3, 0, PI * 2, 0, PI / 2), {
        color: SAND, vary: 0.05, pos: [sx, world.heightAt(sx, sz) - 0.06, sz], rot: [0, s.yaw, 0],
        scale: [w * (0.5 + r() * 0.5), 0.1 + r() * 0.2, 0.35 + r() * 0.45], jitter: 0.09, jitterK: 1.6,
      });
    }
  });

  crts.forEach((s, i) => {
    const gy = world.heightAt(s.x, s.z);
    const buried = i % 3 === 1;
    const quat = buried ? euler(-0.35, s.yaw, 0.25) : euler(-0.05, s.yaw + (r() - 0.5) * 0.4, (r() - 0.5) * 0.1);
    const M = new THREE.Matrix4().compose(new THREE.Vector3(s.x, gy - (buried ? 0.28 : 0.02), s.z), quat, ONE);
    B.crt(M, (i * 5 + 3) % 16, { base: !buried, phase: i * 0.37 });
    B.box(M, [0, 0.33, -0.12], [0.66, 0.66, 0.6]);
    P.wood.add(new THREE.SphereGeometry(1, 9, 3, 0, PI * 2, 0, PI / 2), {
      color: SAND, vary: 0.05, pos: [s.x, gy - 0.05, s.z], scale: [0.8, 0.25, 0.7],
    });
  });
  return { count, crts };
}
