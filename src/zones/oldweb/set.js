import * as THREE from 'three';
import { PI, lathe, rock, taperedSegment, euler, nz } from './kit.js';
import { REG, uvOf, pageUV, digitUV } from './textures.js';
import {
  CHAPEL, FOUNTAIN, CD_TREE, JUKEBOX, FLAME, CAPROCK, CAVE, ALCOVE, MAILBOX, SIGNPOSTS, BARRIERS, DEAD_TREES, AT, PEDESTAL_ORDER,
} from './layout.js';

const SANDSTONE = ['#c97e4c', '#d18c5a', '#bb7246', '#d59762', '#c47a4c'];
const SAND = '#b46e44';
const DEADWOOD = '#7a6553';
const BEIGE = '#d6cbb0';
const BEIGE_DARK = '#b7ab90';
const IRON = '#5a4a3e';
const ONE = new THREE.Vector3(1, 1, 1);
const _v = new THREE.Vector3();

export function frameAt(x, y, z, yaw = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), euler(0, yaw, 0), ONE);
}

export function local(M, x, y, z) {
  return new THREE.Vector3(x, y, z).applyMatrix4(M);
}

function roughBlock(w, h, d, seed, amp = 0.22) {
  const g = new THREE.BoxGeometry(w, h, d, Math.max(2, Math.round(w * 1.5)), Math.max(2, Math.round(h * 1.5)), Math.max(2, Math.round(d * 1.5)));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    const top = _v.y > h / 2 - 1e-3;
    const k = nz(_v.x + seed * 7, _v.y * 1.7, _v.z, 0.9) * 0.7 + nz(_v.x, _v.y * 3.1 + seed, _v.z, 2.3) * 0.3;
    const sx = Math.sign(_v.x) * (Math.abs(_v.x) > w / 2 - 1e-3 ? 1 : 0);
    const sz = Math.sign(_v.z) * (Math.abs(_v.z) > d / 2 - 1e-3 ? 1 : 0);
    _v.x += sx * k * amp + (top ? 0 : k * amp * 0.3);
    _v.z += sz * k * amp;
    const edge = Math.max(Math.abs(_v.x) / (w / 2), Math.abs(_v.z) / (d / 2));
    if (top) _v.y -= Math.max(0, edge - 0.85) * 0.9 + Math.abs(k) * 0.04;
    p.setXYZ(i, _v.x, _v.y, _v.z);
  }
  g.computeVertexNormals();
  return g;
}

function strokePolygon(pts, half) {
  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const l = Math.hypot(tx, ty) || 1;
    const nx = -ty / l;
    const ny = tx / l;
    left.push(new THREE.Vector2(pts[i].x + nx * half, pts[i].y + ny * half));
    right.push(new THREE.Vector2(pts[i].x - nx * half, pts[i].y - ny * half));
  }
  const cap = (p, from, steps = 6) => {
    const out = [];
    for (let i = 1; i < steps; i++) {
      const a = from - (i / steps) * PI;
      out.push(new THREE.Vector2(p.x + Math.cos(a) * half, p.y + Math.sin(a) * half));
    }
    return out;
  };
  const end = pts[pts.length - 1];
  const pe = pts[pts.length - 2];
  const dirStart = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
  const dirEnd = Math.atan2(end.y - pe.y, end.x - pe.x);
  return [...left, ...cap(end, dirEnd + PI / 2), ...right.reverse(), ...cap(pts[0], dirStart - PI / 2)];
}

export function atGeometry(R) {
  const path = [];
  const stemX = 0.31;
  for (let i = 0; i <= 8; i++) path.push(new THREE.Vector2(stemX, 0.34 - (i / 8) * 0.5));
  const c = new THREE.Vector2(0.53, -0.16);
  for (let i = 1; i <= 10; i++) {
    const a = PI - (i / 10) * (PI * 0.95);
    path.push(new THREE.Vector2(c.x + Math.cos(a) * 0.22, c.y - Math.sin(a) * 0.2));
  }
  const last = path[path.length - 1];
  const a0 = Math.atan2(last.y, last.x);
  const r0 = Math.hypot(last.x, last.y);
  const sweep = PI * 2 - 0.95;
  for (let i = 1; i <= 64; i++) {
    const t = i / 64;
    const a = a0 + t * sweep;
    const rr = r0 + (0.86 - r0) * Math.min(1, t * 5);
    path.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
  }
  const stroke = new THREE.Shape(strokePolygon(path, 0.095).map((p) => p.multiplyScalar(R)));
  const ring = new THREE.Shape();
  ring.absarc(-0.04 * R, 0.02 * R, 0.37 * R, 0, PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(-0.04 * R, 0.02 * R, 0.18 * R, 0, PI * 2, true);
  ring.holes.push(hole);
  const opts = { depth: 0.2 * R, bevelEnabled: true, bevelThickness: 0.035 * R, bevelSize: 0.03 * R, bevelSegments: 3, curveSegments: 40 };
  const g1 = new THREE.ExtrudeGeometry(stroke, opts);
  const g2 = new THREE.ExtrudeGeometry(ring, opts);
  g1.translate(0, 0, -0.1 * R);
  g2.translate(0, 0, -0.1 * R);
  return { stroke: g1, ring: g2, path };
}

export function buildSet(B) {
  const { world, rand: r, P } = B;
  const out = { lights: {}, positions: {} };
  const ground = (x, z) => world.heightAt(x, z);
  const sign = (M, region, pos, size, { rot, color = '#ffffff', glow = null, target = P.signs } = {}) => {
    target.add(new THREE.PlaneGeometry(size[0], size[1]), { matrix: M, pos, rot, uvRect: uvOf(region), color, glow, vary: 0 });
  };
  const lamp = (M, pos, radius, color, glow) => {
    P.signs.add(new THREE.SphereGeometry(radius, 7, 5), { matrix: M, pos, uvRect: uvOf(REG.white, 8), color, glow, vary: 0 });
  };

  // Chapel
  {
    const y0 = ground(CHAPEL.x, CHAPEL.z);
    const M = frameAt(CHAPEL.x, y0, CHAPEL.z, CHAPEL.yaw);
    const T = 0.62;
    const HW = 4.6;
    const HD = 6.6;
    const BELL = { y: 6.35, r: 0.5 };
    const ROSE = { x: 0, y: 4.9, r: 0.85 };
    const walls = [
      { a: [-HW, -HD], b: [HW, -HD], top: (s, L) => 5.6 + 2.2 * Math.max(0, 1 - Math.abs(s - L / 2) / 3.4), rose: true },
      { a: [-HW, HD], b: [-HW, -HD], top: (s, L) => 1.5 + 4.2 * (s / L) ** 1.4 + 0.3 * Math.sin(s * 1.9) },
      { a: [HW, -HD], b: [HW, HD], top: (s, L) => 5.4 - 0.9 * (s / L) - 4.2 * Math.exp(-(((s - L * 0.58) / 1.6) ** 2)) },
      { a: [HW, HD], b: [-HW, HD], top: (s, L) => 4.0 + 3.5 * Math.min(1, Math.max(0, 1 - (Math.abs(s - L / 2) - 1.0) / 2.2)), door: true },
    ];
    const stoneColor = () => SANDSTONE[Math.floor(r() * SANDSTONE.length)];
    for (const wall of walls) {
      const [ax, az] = wall.a;
      const [bx, bz] = wall.b;
      const L = Math.hypot(bx - ax, bz - az) + T;
      const dx = (bx - ax) / (L - T);
      const dz = (bz - az) / (L - T);
      const ang = Math.atan2(-dz, dx);
      let course = 0;
      let y = -0.45;
      while (y < 7.2) {
        const ch = 0.44 + r() * 0.16;
        let s = -(course % 2) * (0.3 + r() * 0.3);
        while (s < L) {
          const s0 = Math.max(s, 0);
          const s1 = Math.min(L, s + 0.75 + r() * 0.6);
          s = s1;
          const len = s1 - s0;
          const mid = (s0 + s1) / 2;
          if (len < 0.2) continue;
          const lx = ax - (dx * T) / 2 + dx * mid;
          const lz = az - (dz * T) / 2 + dz * mid;
          const cy = y + ch / 2;
          if (y + ch > wall.top(mid, L) + (r() - 0.5) * 0.8) continue;
          if (y > 1.0 && r() < 0.05 && !wall.door) continue;
          if (wall.door) {
            if (Math.abs(lx) - len / 2 < 1.05 && cy < 2.05) continue;
            if (lx * lx + (cy - 2.05) ** 2 < 1.5 ** 2 && cy >= 1.8) continue;
          }
          if (wall.rose && (lx - ROSE.x) ** 2 + (cy - ROSE.y) ** 2 < (ROSE.r + 0.42) ** 2) continue;
          if (wall.door && Math.abs(lx) - len / 2 < BELL.r && cy > BELL.y - 0.75 && (cy < BELL.y || lx * lx + (cy - BELL.y) ** 2 < (BELL.r + 0.3) ** 2)) continue;
          const inset = (r() - 0.5) * 0.08;
          P.stone.box(len - 0.04, ch - 0.02, T + (r() - 0.5) * 0.08, {
            radius: 0.07, segments: 1, matrix: M, pos: [lx - dz * inset, cy, lz + dx * inset], rot: [(r() - 0.5) * 0.04, ang + (r() - 0.5) * 0.04, (r() - 0.5) * 0.04],
            color: stoneColor(), vary: 0.14, jitter: 0.03, jitterK: 3,
          });
        }
        y += ch;
        course++;
      }
      const segs = wall.door ? 0 : 4;
      for (let k = 0; k < segs; k++) {
        let hmax = 0;
        for (let j = 0; j <= 6; j++) hmax = Math.max(hmax, wall.top(((k + j / 6) / segs) * L, L));
        const midS = ((k + 0.5) / segs) * L;
        B.box(M, [ax - (dx * T) / 2 + dx * midS, (hmax + 0.3) / 2 - 0.2, az - (dz * T) / 2 + dz * midS], [Math.abs(dx) * (L / segs) + Math.abs(dz) * T, hmax + 0.5, Math.abs(dz) * (L / segs) + Math.abs(dx) * T]);
      }
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * PI;
      P.stone.box(0.43, 0.42, 0.68, {
        radius: 0.05, matrix: M, pos: [Math.cos(a) * 1.27, 2.05 + Math.sin(a) * 1.27, HD], rot: [0, 0, a - PI / 2],
        color: i === 4 ? '#e8b888' : SANDSTONE[i % 5], vary: 0.1, jitter: 0.015, jitterK: 4,
      });
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * PI * 2;
      P.stone.box(0.36, 0.34, 0.68, {
        radius: 0.05, matrix: M, pos: [ROSE.x + Math.cos(a) * (ROSE.r + 0.17), ROSE.y + Math.sin(a) * (ROSE.r + 0.17), -HD], rot: [0, 0, a - PI / 2],
        color: SANDSTONE[(i + 2) % 5], vary: 0.1, jitter: 0.015, jitterK: 4,
      });
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * PI;
      P.stone.box(0.3, 0.3, 0.66, {
        radius: 0.05, matrix: M, pos: [Math.cos(a) * (BELL.r + 0.15), BELL.y + Math.sin(a) * (BELL.r + 0.15), HD], rot: [0, 0, a - PI / 2],
        color: SANDSTONE[(i + 1) % 5], vary: 0.1, jitter: 0.015, jitterK: 4,
      });
    }
    P.rust.add(lathe([[0, 0.42], [0.06, 0.41], [0.12, 0.36], [0.15, 0.22], [0.2, 0.06], [0.24, 0], [0.22, -0.01], [0.17, 0.04], [0.11, 0.2], [0.08, 0.33], [0, 0.35]], 18), {
      matrix: M, pos: [0, BELL.y - 0.42, HD], color: '#7a5a2c', metal: 1, vary: 0.12,
    });
    P.rust.box(0.7, 0.05, 0.05, { matrix: M, pos: [0, BELL.y + 0.02, HD], color: IRON, metal: 1 });
    const rubble = [[5.6, 1.0, 9], [5.2, 2.4, 5], [-5.6, 4.6, 5], [-3.0, -4.4, 3], [3.4, 0.8, 4], [6.0, -3.2, 3]];
    for (const [cx, cz, n] of rubble) {
      for (let i = 0; i < n; i++) {
        const lx = cx + (r() - 0.5) * 2.2;
        const lz = cz + (r() - 0.5) * 2.2;
        const wp = local(M, lx, 0, lz);
        P.stone.box(0.6 + r() * 0.4, 0.4, 0.55, {
          radius: 0.07, matrix: M, pos: [lx, ground(wp.x, wp.z) - y0 + 0.1 + (i > 3 ? 0.3 : 0), lz], rot: [(r() - 0.5) * 0.7, r() * PI, (r() - 0.5) * 0.6],
          color: stoneColor(), vary: 0.14, jitter: 0.03, jitterK: 3,
        });
      }
    }
    for (let ix = 0; ix < 6; ix++) {
      for (let iz = 0; iz < 8; iz++) {
        if (r() < 0.4) continue;
        const lx = -3.6 + ix * 1.45 + (r() - 0.5) * 0.15;
        const lz = -5.7 + iz * 1.6 + (r() - 0.5) * 0.15;
        const wp = local(M, lx, 0, lz);
        P.stone.box(1.12, 0.1, 1.22, {
          radius: 0.04, matrix: M, pos: [lx, ground(wp.x, wp.z) - y0 - 0.03, lz], rot: [(r() - 0.5) * 0.06, (r() - 0.5) * 0.12, (r() - 0.5) * 0.06],
          color: '#a96e48', vary: 0.12,
        });
      }
    }
    for (const [lx, lz, sx, sz] of [[-3.9, -5.9, 1.6, 1.0], [3.9, -5.8, 1.4, 1.2], [-4.0, 5.4, 1.0, 1.6], [5.8, 2.0, 1.8, 2.6], [-5.8, -1.0, 1.4, 3.0], [1.0, -7.4, 2.6, 1.1]]) {
      const wp = local(M, lx, 0, lz);
      P.wood.add(new THREE.SphereGeometry(1, 14, 5, 0, PI * 2, 0, PI / 2), { matrix: M, color: SAND, vary: 0.05, pos: [lx, ground(wp.x, wp.z) - y0 - 0.08, lz], scale: [sx, 0.32, sz], jitter: 0.08, jitterK: 1.5 });
    }
    B.box(M, [-3.15, 2.2, HD], [3.5, 4.4, T]);
    B.box(M, [3.15, 2.2, HD], [3.5, 4.4, T]);
    B.box(M, [0, 4.2, HD], [2.3, 2.3, T]);

    sign(M, REG.banner, [0, 4.0, HD + 0.455], [4.48, 0.56], { glow: [1.4, 0, 0] });
    P.rust.box(4.7, 0.78, 0.06, { matrix: M, pos: [0, 4.0, HD + 0.415], color: '#3a2a22', metal: 0.6 });
    for (const x of [-2.2, 2.2]) P.rust.box(0.05, 0.05, 0.12, { matrix: M, pos: [x, 4.0, HD + 0.36], color: IRON, metal: 1 });
    for (let i = 0; i < 16; i++) {
      const x = -2.25 + (i / 15) * 4.5;
      lamp(M, [x, 4.34, HD + 0.47], 0.035, '#ffd27a', [5, 1.4, (i % 2) * 0.5]);
      lamp(M, [x, 3.66, HD + 0.47], 0.035, '#ffd27a', [5, 1.4, ((i + 1) % 2) * 0.5]);
    }
    sign(M, REG.tagline, [2.4, 1.72, HD + 0.455], [1.2, 0.3], { glow: [0.5, 0, 0] });
    P.rust.box(1.28, 0.36, 0.04, { matrix: M, pos: [2.4, 1.72, HD + 0.425], color: '#2a2018', metal: 0.4 });
    out.lights.banner = local(M, 0, 3.4, HD + 1.4);

    P.wood.box(0.75, 0.07, 0.12, { matrix: M, pos: [0, 0.035, -3.0], color: '#5a4030' });
    P.wood.box(0.12, 0.07, 0.6, { matrix: M, pos: [0, 0.035, -3.0], color: '#5a4030' });
    P.wood.add(new THREE.CylinderGeometry(0.06, 0.085, 1.0, 8), { matrix: M, pos: [0, 0.55, -3.0], color: '#6a4a34' });
    const lect = new THREE.Matrix4().multiplyMatrices(M, new THREE.Matrix4().compose(new THREE.Vector3(0, 1.1, -3.0), euler(0.32, 0, 0, 'XYZ'), ONE));
    P.wood.box(0.9, 0.05, 0.62, { radius: 0.015, matrix: lect, color: '#6e4c33', vary: 0.18 });
    P.wood.box(0.9, 0.05, 0.04, { matrix: lect, pos: [0, 0.04, 0.3], color: '#5a3c28' });
    P.wood.box(0.38, 0.014, 0.48, { radius: 0.005, matrix: lect, pos: [0.09, 0.032, 0], color: '#6e1a16', vary: 0.12 });
    P.wood.box(0.36, 0.06, 0.46, { radius: 0.004, matrix: lect, pos: [0.09, 0.069, 0], color: '#efe2c4', vary: 0.04 });
    P.wood.box(0.02, 0.075, 0.48, { radius: 0.008, matrix: lect, pos: [-0.1, 0.069, 0], color: '#5a1412', vary: 0.1 });
    out.lectern = lect;
    out.positions.book = local(lect, 0, 0.1, 0);

    const col = local(M, -1.8, 0, -3.9);
    P.stone.add(lathe([[0, 0], [0.24, 0], [0.26, 0.08], [0.2, 0.14], [0.17, 0.3], [0.16, 0.9], [0.2, 0.98], [0.24, 1.05], [0, 1.05]], 14), {
      pos: [col.x, ground(col.x, col.z) - 0.05, col.z], color: '#d2ab84', vary: 0.1,
    });
    out.positions.lantern = new THREE.Vector3(col.x, ground(col.x, col.z) + 1.0, col.z);
    B.boxWorld([col.x, ground(col.x, col.z) + 0.5, col.z], [0.4, 1.0, 0.4]);
    const bp = local(M, 2.1, 0, -3.8);
    out.positions.beacon = [bp.x, ground(bp.x, bp.z), bp.z];

    out.pedestals = PEDESTAL_ORDER.map((id, i) => {
      const lx = (i - 1) * 2.9;
      const lz = 11.2 + (i === 1 ? 0.5 : 0);
      const wp = local(M, lx, 0, lz);
      const gy = ground(wp.x, wp.z);
      const pm = frameAt(wp.x, gy, wp.z, CHAPEL.yaw);
      const shape = new THREE.Shape();
      shape.moveTo(-0.5, 0);
      shape.lineTo(0.5, 0);
      shape.lineTo(0.5, 1.45);
      shape.absarc(0, 1.45, 0.5, 0, PI, false);
      shape.lineTo(-0.5, 0);
      const plaque = new THREE.ExtrudeGeometry(shape, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 10 });
      plaque.translate(0, -0.25, -0.12);
      P.stone.add(plaque, { matrix: pm, pos: [0, 0, -0.75], rot: [-0.06, 0, 0], color: '#d4ac84', vary: 0.1, jitter: 0.01, jitterK: 3 });
      B.box(pm, [0, 0.9, -0.75], [1.0, 1.9, 0.3]);
      P.riddle.add(new THREE.PlaneGeometry(0.84, 0.457), { matrix: pm, pos: [0, 1.32, -0.75 + 0.155], rot: [-0.06, 0, 0], uvRect: uvOf(REG[`riddle${i}`]), vary: 0, glow: [0.08, 0, 0] });
      return { id, position: new THREE.Vector3(wp.x, gy, wp.z), yaw: CHAPEL.yaw };
    });
  }

  // Fountain and visitor counter
  {
    const y0 = ground(FOUNTAIN.x, FOUNTAIN.z);
    const M = frameAt(FOUNTAIN.x, y0, FOUNTAIN.z, FOUNTAIN.yaw);
    const basin = lathe([[2.75, -0.45], [2.85, 0.5], [2.98, 0.56], [2.96, 0.7], [2.8, 0.76], [2.62, 0.7], [2.55, 0.28], [2.4, 0.18], [0.7, 0.18], [0.66, 0.2]], 40);
    P.stone.add(basin, { matrix: M, color: '#d0a47c', vary: 0.12, jitter: 0.02, jitterK: 3 });
    P.stone.add(lathe([[0, 0.15], [0.7, 0.15], [0.72, 0.3], [0.55, 0.4], [0.46, 0.6], [0.44, 0.95], [0.56, 1.05], [0.62, 1.18], [0, 1.18]], 20), { matrix: M, color: '#c99a70', vary: 0.1 });
    P.wood.add(lathe([[0, 0.34], [1.2, 0.3], [2.0, 0.24], [2.5, 0.2], [2.56, 0.17]], 30), { matrix: M, color: SAND, vary: 0.08, varyK: 1.5 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * PI * 2;
      B.box(M, [Math.cos(a) * 2.78, 0.3, Math.sin(a) * 2.78], [1.3, 0.9, 0.4], [0, -a + PI / 2, 0]);
    }
    B.box(M, [0, 1.2, 0], [2.5, 2.4, 1.0]);
    P.rust.box(2.5, 1.12, 0.62, { radius: 0.06, segments: 2, matrix: M, pos: [0, 1.72, 0], color: '#6a5a48', metal: 1 });
    P.rust.box(2.32, 0.6, 0.05, { radius: 0.02, matrix: M, pos: [0, 1.7, 0.3], color: '#151515', metal: 0.2 });
    P.rust.box(1.9, 0.08, 0.08, { matrix: M, pos: [0, 2.32, 0.18], color: IRON, metal: 1 });
    for (const x of [-0.85, 0.85]) P.rust.add(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8), { matrix: M, pos: [x, 2.4, 0.18], color: IRON, metal: 1 });
    sign(M, REG.counterLabel, [0, 2.58, 0.2], [1.8, 0.215], { glow: [0.9, 0, 0] });
    P.rust.box(1.9, 0.26, 0.04, { matrix: M, pos: [0, 2.58, 0.17], color: '#22201c', metal: 0.5 });
    out.digitSlots = [-0.84, -0.54, -0.24, 0.24, 0.54, 0.84].map((x) => [x, 1.7]);
    out.counterFrame = M;
    out.lights.counter = local(M, 0, 1.9, 1.0);
    out.positions.fountain = new THREE.Vector3(FOUNTAIN.x, y0, FOUNTAIN.z);
  }

  // Dead tree holding the CD
  {
    const gy = ground(CD_TREE.x, CD_TREE.z);
    const base = new THREE.Vector3(CD_TREE.x, gy - 0.2, CD_TREE.z);
    const fork = new THREE.Vector3(CD_TREE.x + 0.15, gy + 1.85, CD_TREE.z - 0.1);
    const knee = new THREE.Vector3(CD_TREE.x - 0.18, gy + 0.9, CD_TREE.z + 0.12);
    P.wood.add(taperedSegment(base, knee, 0.26, 0.21, 8), { color: DEADWOOD, vary: 0.2, jitter: 0.03, jitterK: 4 });
    P.wood.add(taperedSegment(knee, fork, 0.21, 0.17, 8), { color: DEADWOOD, vary: 0.2, jitter: 0.03, jitterK: 4 });
    P.wood.add(taperedSegment(knee, knee.clone().add(new THREE.Vector3(-0.7, 0.5, 0.35)), 0.06, 0.015, 5), { color: DEADWOOD, vary: 0.2 });
    const limbs = [
      [fork, new THREE.Vector3(fork.x - 0.9, fork.y + 1.5, fork.z + 0.3), 0.16, 0.08],
      [fork, new THREE.Vector3(fork.x + 0.8, fork.y + 1.3, fork.z - 0.5), 0.15, 0.07],
      [fork, new THREE.Vector3(fork.x + 0.2, fork.y + 0.9, fork.z + 0.8), 0.1, 0.05],
    ];
    for (const [a, b, r0, r1] of limbs) {
      P.wood.add(taperedSegment(a, b, r0, r1, 7), { color: DEADWOOD, vary: 0.2 });
      const tip = b.clone().add(new THREE.Vector3((r() - 0.5) * 1.4, 0.8 + r() * 0.5, (r() - 0.5) * 1.4));
      P.wood.add(taperedSegment(b, tip, r1, 0.02, 5), { color: DEADWOOD, vary: 0.2 });
      const twig = b.clone().lerp(tip, 0.4);
      P.wood.add(taperedSegment(twig, twig.clone().add(new THREE.Vector3((r() - 0.5) * 1.2, 0.4, (r() - 0.5) * 1.2)), 0.03, 0.01, 4), { color: DEADWOOD });
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + r();
      const rootEnd = new THREE.Vector3(base.x + Math.cos(a) * 1.1, gy - 0.15, base.z + Math.sin(a) * 1.1);
      P.wood.add(taperedSegment(new THREE.Vector3(base.x, gy + 0.3, base.z), rootEnd, 0.12, 0.03, 5), { color: DEADWOOD, vary: 0.2 });
    }
    B.boxWorld([base.x, gy + 0.9, base.z], [0.42, 1.8, 0.42]);
    const toPath = Math.atan2(FOUNTAIN.x - CD_TREE.x, FOUNTAIN.z - CD_TREE.z);
    const shelfQ = euler(0.55, toPath, 0);
    const out1 = new THREE.Vector3(Math.sin(toPath), 0, Math.cos(toPath));
    const shelfPos = fork.clone().addScaledVector(out1, 0.3).add(new THREE.Vector3(0, 0.22, 0));
    const twigEnd = shelfPos.clone().addScaledVector(out1, 0.5).add(new THREE.Vector3(0.15, -0.05, 0));
    P.wood.add(taperedSegment(fork.clone().add(new THREE.Vector3(0, 0.05, 0)), twigEnd, 0.07, 0.025, 5), { color: DEADWOOD, vary: 0.2 });
    B.boxWorld(shelfPos, [0.5, 0.06, 0.44], shelfQ);
    const lipPos = shelfPos.clone().add(new THREE.Vector3(0, -0.02, 0.24).applyQuaternion(shelfQ));
    B.boxWorld(lipPos, [0.5, 0.14, 0.04], shelfQ);
    out.cdOrigin = { position: shelfPos.clone().add(new THREE.Vector3(0, 0.055, 0).applyQuaternion(shelfQ)), quaternion: shelfQ.clone() };
  }

  for (const [i, t] of DEAD_TREES.entries()) deadTree(B, t.x, ground(t.x, t.z), t.z, t.h, 300 + i);

  // Jukebox PC
  {
    const gy = ground(JUKEBOX.x, JUKEBOX.z);
    const M = frameAt(JUKEBOX.x, gy, JUKEBOX.z, JUKEBOX.yaw);
    P.stone.add(roughBlock(2.5, 0.24, 1.05, 21, 0.05), { matrix: M, pos: [0, 0.8, 0], rot: [0, 0, 0.015], color: '#d49a68', vary: 0.1 });
    for (const x of [-0.85, 0.85]) P.stone.add(rock(1, { detail: 3, seed: 22 + x, rough: 0.18, stretch: [0.42, 0.5, 0.48] }), { matrix: M, pos: [x, 0.3, 0], color: '#c4875c', vary: 0.1 });
    B.box(M, [0, 0.46, 0], [2.5, 0.92, 1.0]);
    const top = new THREE.Matrix4().multiplyMatrices(M, new THREE.Matrix4().makeTranslation(0, 0.9, 0));
    B.crt(top, 15, { base: true, phase: 0.2, scale: 1.25 });
    P.plastic.box(0.62, 0.035, 0.2, { matrix: top, pos: [0, 0.02, 0.32], rot: [0.06, 0, 0], color: BEIGE_DARK });
    for (const side of [-1, 1]) {
      P.plastic.box(0.34, 0.56, 0.32, { radius: 0.03, segments: 2, matrix: top, pos: [side * 0.82, 0.28, 0], rot: [0, -side * 0.25, 0], color: '#2b2622', vary: 0.05 });
      for (const [y, rr] of [[0.38, 0.11], [0.15, 0.06]]) {
        P.plastic.add(lathe([[0, -0.03], [rr, 0], [rr * 1.1, 0.012], [rr * 0.35, 0.01], [0, 0.0]], 18), {
          matrix: top, pos: [side * 0.82 + Math.sin(-side * 0.25) * 0.165, y, Math.cos(-side * 0.25) * 0.165], rot: [PI / 2, -side * 0.25, 0, 'YXZ'], color: '#111111', vary: 0,
        });
      }
    }
    P.plastic.box(0.24, 0.5, 0.5, { radius: 0.02, matrix: M, pos: [1.45, 0.25, 0.05], rot: [0, 0.3, 0], color: BEIGE, vary: 0.06 });
    P.plastic.box(0.1, 0.02, 0.01, { matrix: M, pos: [1.45 + Math.sin(0.3) * 0.25, 0.42, 0.05 + Math.cos(0.3) * 0.25], rot: [0, 0.3, 0], color: '#3bff6b', glow: [3, 0, 0] });
    B.box(M, [1.45, 0.25, 0.05], [0.3, 0.5, 0.55], [0, 0.3, 0]);
    out.positions.jukebox = local(M, 0, 1.4, 0.3);
    out.lights.jukebox = local(M, 0, 1.6, 1.1);
  }

  // GIF flame on a pole
  {
    const gy = ground(FLAME.x, FLAME.z);
    P.rust.add(new THREE.CylinderGeometry(0.035, 0.05, 1.7, 8), { pos: [FLAME.x, gy + 0.85, FLAME.z], color: IRON, metal: 1 });
    P.rust.add(lathe([[0, 0], [0.16, 0], [0.2, 0.06], [0.14, 0.1], [0, 0.1]], 12), { pos: [FLAME.x, gy + 1.7, FLAME.z], color: IRON, metal: 1 });
    const M = frameAt(FLAME.x, gy, FLAME.z, JUKEBOX.yaw);
    sign(M, REG.hot, [0, 1.25, 0.045], [0.5, 0.18], { glow: [1.6, 0.9, 0.1] });
    P.rust.box(0.54, 0.22, 0.04, { matrix: M, pos: [0, 1.25, 0.02], color: '#2a2018', metal: 0.5 });
    B.boxWorld([FLAME.x, gy + 0.85, FLAME.z], [0.12, 1.7, 0.12]);
    out.positions.flame = new THREE.Vector3(FLAME.x, gy + 1.82, FLAME.z);
  }

  // Webring signposts
  for (const s of SIGNPOSTS) {
    const gy = ground(s.x, s.z);
    const M = frameAt(s.x, gy, s.z, s.yaw);
    P.wood.box(0.13, 2.8, 0.13, { radius: 0.03, matrix: M, pos: [0, 1.3, 0], color: '#7a5636', vary: 0.2, jitter: 0.006 });
    P.wood.add(new THREE.ConeGeometry(0.11, 0.14, 4), { matrix: M, pos: [0, 2.77, 0], rot: [0, PI / 4, 0], color: '#5c3f27' });
    for (const [dir, y, region] of [[-1, 2.0, REG.prev], [1, 1.55, REG.next]]) {
      const arrow = new THREE.Shape();
      const L = 0.62;
      arrow.moveTo(-L * dir, -0.15);
      arrow.lineTo(0.45 * dir, -0.15);
      arrow.lineTo(0.66 * dir, 0);
      arrow.lineTo(0.45 * dir, 0.15);
      arrow.lineTo(-L * dir, 0.15);
      arrow.lineTo(-L * dir, -0.15);
      const g = new THREE.ExtrudeGeometry(arrow, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1 });
      P.wood.add(g, { matrix: M, pos: [0.25 * dir, y, 0.07], color: '#8a6440', vary: 0.18 });
      sign(M, region, [0.18 * dir, y, 0.128], [1.0, 0.234]);
    }
    sign(M, REG.ring, [0, 2.48, 0.085], [1.15, 0.18], { glow: [0.35, 0, 0] });
    P.wood.box(1.22, 0.24, 0.04, { matrix: M, pos: [0, 2.48, 0.06], color: '#5c3f27' });
    B.box(M, [0, 1.4, 0], [0.16, 2.8, 0.16]);
  }

  // Under construction barriers
  for (const [i, b] of BARRIERS.entries()) {
    const gy = ground(b.x, b.z);
    const M = frameAt(b.x, gy, b.z, b.yaw);
    for (const side of [-1, 1]) {
      for (const lean of [-1, 1]) {
        const a = new THREE.Vector3(side * 1.05, 1.15, 0);
        const c = new THREE.Vector3(side * 1.05, -0.05, lean * 0.42);
        P.rust.add(taperedSegment(a.applyMatrix4(M), c.applyMatrix4(M), 0.03, 0.03, 6), { color: '#7a6a5a', metal: 1 });
      }
    }
    for (const y of [0.62, 0.98]) P.signs.box(2.5, 0.2, 0.035, { radius: 0.01, matrix: M, pos: [0, y, 0], uvRect: uvOf(REG.stripes), vary: 0, glow: [0.15, 0, 0] });
    sign(M, REG.construction, [0, 0.8, 0.03], [0.66, 0.325], { glow: [0.3, 0, 0] });
    lamp(M, [-1.05, 1.24, 0], 0.075, '#ffb020', [6, 1.1, i * 0.3]);
    lamp(M, [1.05, 1.24, 0], 0.075, '#ffb020', [6, 1.1, i * 0.3 + 0.5]);
    P.rust.add(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 10), { matrix: M, pos: [-1.05, 1.17, 0], color: '#222222', metal: 0.5 });
    P.rust.add(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 10), { matrix: M, pos: [1.05, 1.17, 0], color: '#222222', metal: 0.5 });
    B.box(M, [0, 0.6, 0], [2.4, 1.2, 0.3]);
    if (i === 0) out.lights.barrier = local(M, 0, 1.4, 0.5);
  }

  // Mailbox
  {
    const gy = ground(MAILBOX.x, MAILBOX.z);
    const M = frameAt(MAILBOX.x, gy, MAILBOX.z, MAILBOX.yaw);
    P.wood.box(0.13, 1.3, 0.13, { radius: 0.02, matrix: M, pos: [0, 0.55, 0], rot: [0.04, 0, -0.05], color: '#7a5636', vary: 0.2, jitter: 0.005 });
    P.wood.box(0.3, 0.05, 0.62, { radius: 0.01, matrix: M, pos: [0, 1.2, 0], color: '#6a4a2e', vary: 0.2 });
    const prof = new THREE.Shape();
    prof.moveTo(-0.24, 0);
    prof.lineTo(0.24, 0);
    prof.lineTo(0.24, 0.26);
    prof.absarc(0, 0.26, 0.24, 0, PI, false);
    prof.lineTo(-0.24, 0);
    const body = new THREE.ExtrudeGeometry(prof, { depth: 0.74, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1, curveSegments: 14 });
    body.translate(0, 0, -0.37);
    P.rust.add(body, { matrix: M, pos: [0, 1.23, 0], rot: [0, 0, 0.04], color: '#7d8a8f', metal: 1, vary: 0.1 });
    P.rust.add(new THREE.ShapeGeometry(prof, 10).scale(0.94, 0.94, 1), { matrix: M, pos: [0, 1.24, 0.38], rot: [0, 0, 0.04], color: '#0d0b0a', metal: 0, vary: 0 });
    const door = new THREE.ExtrudeGeometry(prof, { depth: 0.014, bevelEnabled: false, curveSegments: 14 });
    P.rust.add(door, { matrix: M, pos: [0, 1.23, 0.39], rot: [1.8, 0, 0.04], color: '#7d8a8f', metal: 1, vary: 0.1 });
    P.rust.box(0.025, 0.42, 0.025, { matrix: M, pos: [0.27, 1.48, 0.08], color: IRON, metal: 1 });
    P.rust.box(0.014, 0.13, 0.2, { matrix: M, pos: [0.28, 1.64, 0.17], color: '#c4241c', metal: 0.3 });
    sign(M, REG.mail, [0, 0.86, 0.072], [0.4, 0.146], { glow: [0.35, 0, 0] });
    B.box(M, [0, 0.75, 0], [0.5, 1.5, 0.8]);
    out.positions.mailbox = local(M, 0, 0, 0.66);
    out.positions.envelope = local(M, 0, 2.55, 0);
  }

  // Caprock, slab ramp, ledge and antenna
  {
    const gy = ground(CAPROCK.x, CAPROCK.z);
    const M = frameAt(CAPROCK.x, gy, CAPROCK.z, CAPROCK.yaw);
    const capTop = 4.4;
    const minAround = (lx, lz, rad) => {
      let m = Infinity;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * PI * 2;
        const wp = local(M, lx + Math.cos(a) * rad, 0, lz + Math.sin(a) * rad);
        m = Math.min(m, ground(wp.x, wp.z) - gy);
      }
      return Math.min(0, m);
    };
    const capBottom = minAround(0, 0, 4.2) - 1.0;
    const capH = capTop - capBottom;
    const split = capBottom + capH * 0.48;
    P.stone.add(rock(1, { detail: 3, seed: 3, rough: 0.16, stretch: [3.9, (split - capBottom) / 2 + 0.3, 3.8] }), { matrix: M, pos: [0.1, (split + capBottom) / 2, 0], color: '#b9714a', vary: 0.12 });
    P.stone.add(rock(1, { detail: 3, seed: 4, rough: 0.14, flatTop: 0.42, stretch: [3.45, (capTop - split) / 1.2 + 0.15, 3.4] }), { matrix: M, pos: [0, capTop - 0.42 * ((capTop - split) / 1.2 + 0.15), 0], color: '#c8804e', vary: 0.12 });
    B.cyl(M, [0, (capBottom + capTop) / 2, 0], 3.2, capH);
    const ledgeTop = 3.2;
    const ledgeBottom = minAround(4.6, 0.9, 1.8) - 0.8;
    const lh = ledgeTop - ledgeBottom;
    const lsy = lh / 1.5 + 0.1;
    P.stone.add(rock(1, { detail: 3, seed: 5, rough: 0.12, flatTop: 0.7, stretch: [1.5, lsy, 1.5] }), { matrix: M, pos: [4.6, ledgeTop - 0.7 * lsy, 0.9], color: '#cf8a58', vary: 0.12 });
    B.cyl(M, [4.6, ledgeBottom + lh / 2, 0.9], 1.35, lh);
    out.floppyOrigin = { position: local(M, 4.85, ledgeTop + 0.03, 0.35), quaternion: euler(0, CAPROCK.yaw + 0.5, 0) };

    const footW = local(M, 4.6, 0, 8.9);
    const footY = ground(footW.x, footW.z) - gy;
    const topY = 2.0;
    const run = 8.9 - 2.2;
    const rise = topY - footY;
    const len = Math.hypot(run, rise);
    const ang = Math.atan2(rise, run);
    const midZ = (8.9 + 2.2) / 2;
    const midY = (footY + topY) / 2 - 0.17 * Math.cos(ang);
    const slabQ = euler(ang, 0, 0, 'XYZ');
    const slab = new THREE.Matrix4().multiplyMatrices(M, new THREE.Matrix4().compose(new THREE.Vector3(4.6, midY, midZ), slabQ, ONE));
    P.stone.add(roughBlock(1.9, 0.34, len + 0.3, 9, 0.05), { matrix: slab, color: '#b5754c', vary: 0.12 });
    B.box(slab, [0, 0, 0], [1.9, 0.34, len + 0.3]);
    out.rampFoot = local(M, 4.6, footY, 9.4);
    out.rampTop = local(M, 4.6, topY, 2.5);
    out.ledgeTop = local(M, 4.6, ledgeTop, 0.9);
    const slab2 = new THREE.Matrix4().multiplyMatrices(M, new THREE.Matrix4().compose(new THREE.Vector3(6.1, footY + 0.5, 6.8), euler(0.2, 0.35, 1.1, 'XYZ'), ONE));
    P.stone.add(roughBlock(1.4, 0.3, 2.6, 11, 0.05), { matrix: slab2, color: '#b0704a' });
    for (let i = 0; i < 6; i++) {
      const lx = -4 + r() * 10;
      const lz = (r() < 0.5 ? -1 : 1) * (4.6 + r() * 2.5);
      const wp = local(M, lx, 0, lz);
      P.stone.add(rock(0.35 + r() * 0.4, { seed: i + 40, detail: 1, rough: 0.3 }), { pos: [wp.x, ground(wp.x, wp.z) + 0.05, wp.z], color: '#c49270', vary: 0.1 });
    }
    out.positions.capTop = local(M, 0, capTop, 0);
    const AM = new THREE.Matrix4().multiplyMatrices(M, new THREE.Matrix4().makeTranslation(0, capTop - 0.1, 0));
    antenna(P, AM);
    B.box(AM, [0, 7, 0], [0.5, 14, 0.5]);
    out.lights.antenna = local(AM, 0, 15.3, 0);
    out.positions.fanpage = local(M, 1.0, capTop, -1.1);
  }

  // Cave of the modem
  {
    const gy = ground(CAVE.x, CAVE.z);
    const M = frameAt(CAVE.x, gy, CAVE.z, CAVE.yaw);
    const rocks = [
      [[-2.05, 1.2, -2.6], [0.8, 1.7, 3.0], 61, '#b9845f'],
      [[2.05, 1.2, -2.6], [0.8, 1.8, 3.0], 62, '#c08a64'],
      [[0, 3.55, -2.7], [3.0, 0.75, 3.4], 63, '#c99670'],
      [[0, 1.6, -6.1], [2.4, 2.2, 1.0], 64, '#b17d58'],
      [[-2.9, 0.6, 0.4], [0.9, 0.9, 1.0], 65, '#c08a64'],
      [[2.7, 0.4, 0.7], [0.7, 0.6, 0.8], 66, '#bd8862'],
      [[-1.2, 4.3, -3.4], [1.6, 0.8, 1.8], 67, '#c99670'],
    ];
    for (const [pos, stretch, seed, color] of rocks) {
      P.stone.add(rock(1, { detail: 3, seed, rough: 0.22, stretch }), { matrix: M, pos, color, vary: 0.12 });
    }
    B.box(M, [-2.15, 1.5, -2.6], [1.3, 3.4, 5.6]);
    B.box(M, [2.15, 1.5, -2.6], [1.3, 3.4, 5.6]);
    B.box(M, [0, 3.55, -2.7], [5.2, 0.9, 5.8]);
    B.box(M, [0, 1.6, -6.0], [4, 3.6, 1.2]);
    P.wood.add(new THREE.SphereGeometry(1, 12, 5, 0, PI * 2, 0, PI / 2), { matrix: M, color: SAND, vary: 0.05, pos: [0.3, 0.05, -1.0], scale: [1.4, 0.2, 2.6] });
    const inner = local(M, 0, 0, -3.3);
    out.modemOrigin = { position: new THREE.Vector3(inner.x, ground(inner.x, inner.z) + 0.1, inner.z), quaternion: euler(0, CAVE.yaw + 0.25, 0) };
    out.lights.cave = local(M, 0, 0.6, -2.8);
    out.positions.cave = local(M, 0, 0, 1.5);
  }

  // NEW! alcove
  {
    const gy = ground(ALCOVE.x, ALCOVE.z);
    const M = frameAt(ALCOVE.x, gy, ALCOVE.z, ALCOVE.yaw);
    for (const side of [-1, 1]) {
      P.stone.add(roughBlock(0.34, 3.0, 1.9, 70 + side, 0.05), { matrix: M, pos: [side * 1.02, 1.2, -0.25], rot: [0, 0, side * -0.03], color: '#d1a47b' });
      B.box(M, [side * 1.02, 1.2, -0.25], [0.34, 3.0, 1.9]);
    }
    P.stone.add(roughBlock(2.75, 0.4, 2.2, 74, 0.06), { matrix: M, pos: [0, 2.9, -0.2], rot: [0.02, 0, 0.03], color: '#c99a70' });
    B.box(M, [0, 2.9, -0.2], [2.75, 0.4, 2.2]);
    P.stone.add(roughBlock(2.1, 3.0, 0.35, 75, 0.05), { matrix: M, pos: [0, 1.2, -1.25], color: '#bf8f68' });
    B.box(M, [0, 1.2, -1.25], [2.1, 3.0, 0.35]);
    sign(M, REG.newBanner, [0, 3.42, 0.98], [1.15, 0.43], { glow: [2.2, 1.6, 0] });
    P.rust.box(1.25, 0.52, 0.04, { matrix: M, pos: [0, 3.42, 0.95], color: '#2a1a14', metal: 0.4 });
    for (const x of [-0.5, 0.5]) P.rust.add(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), { matrix: M, pos: [x, 3.25, 0.8], color: IRON, metal: 1 });
    out.positions.alcove = local(M, 0, 0, -0.35);
    out.positions.star = local(M, 0, 4.45, 0.6);
    out.lights.alcove = local(M, 0, 2.0, 1.4);
  }

  // The "@"
  {
    const gy = ground(AT.x, AT.z);
    const R = 11.5;
    const q = euler(-0.14, AT.yaw, 0.18, 'YXZ');
    const M = new THREE.Matrix4().compose(new THREE.Vector3(AT.x, gy + R - 3.0, AT.z), q, ONE);
    const at = atGeometry(R);
    P.far.add(at.stroke, { matrix: M, color: '#8a5a3c', metal: 1, vary: 0.15, varyK: 0.3 });
    P.far.add(at.ring, { matrix: M, color: '#8a5a3c', metal: 1, vary: 0.15, varyK: 0.3 });
    const zFront = 0.1 * R + 0.035 * R + 0.12;
    const neonPath = at.path.map((p) => new THREE.Vector3(p.x * R, p.y * R, zFront));
    P.neon.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(neonPath), 220, 0.11, 6, false), { matrix: M, color: '#ffb454', vary: 0 });
    const ringPts = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * PI * 2;
      ringPts.push(new THREE.Vector3((-0.04 + Math.cos(a) * 0.275) * R, (0.02 + Math.sin(a) * 0.275) * R, zFront));
    }
    P.neon.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ringPts, true), 96, 0.11, 6, true), { matrix: M, color: '#ffb454', vary: 0 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2 + 0.4;
      P.stone.add(rock(1.2 + r() * 1.2, { seed: 90 + i, detail: 2, rough: 0.3, stretch: [1, 0.5, 1] }), {
        pos: [AT.x + Math.cos(a) * (3 + r() * 2), gy - 0.3, AT.z + Math.sin(a) * (3 + r() * 2)], color: '#c48d64',
      });
    }
  }
  return out;
}

function antenna(P, M) {
  const H = 15;
  const legs = [0, 1, 2].map((i) => (i / 3) * PI * 2 + 0.3);
  const at = (a, t) => {
    const rad = 1.25 * (1 - t) + 0.22 * t;
    return new THREE.Vector3(Math.cos(a) * rad, t * H, Math.sin(a) * rad).applyMatrix4(M);
  };
  const rust = { color: '#6b4632', metal: 1, vary: 0.2 };
  for (const a of legs) P.rust.add(taperedSegment(at(a, -0.02), at(a, 1), 0.07, 0.04, 6), rust);
  const N = 11;
  for (let k = 0; k < N; k++) {
    const t0 = k / N;
    const t1 = (k + 1) / N;
    for (let j = 0; j < 3; j++) {
      const a = legs[j];
      const b = legs[(j + 1) % 3];
      P.rust.add(taperedSegment(at(a, t0), at(b, t1), 0.022, 0.022, 4), rust);
      P.rust.add(taperedSegment(at(a, t1), at(b, t1), 0.022, 0.022, 4), rust);
    }
  }
  const top = new THREE.Vector3(0, H, 0).applyMatrix4(M);
  const mast = new THREE.Vector3(0, H + 1.6, 0).applyMatrix4(M);
  P.rust.add(taperedSegment(top, mast, 0.05, 0.03, 6), rust);
  for (let i = 0; i < 4; i++) {
    const y = H - 1.4 + i * 0.75;
    const a = new THREE.Vector3(-0.9 + i * 0.12, y, 0).applyMatrix4(M);
    const b = new THREE.Vector3(0.9 - i * 0.12, y, 0).applyMatrix4(M);
    P.rust.add(taperedSegment(a, b, 0.018, 0.018, 4), rust);
  }
  const dish = lathe([[0, 0], [0.25, 0.03], [0.48, 0.12], [0.6, 0.22], [0.58, 0.24], [0.46, 0.15], [0.24, 0.06], [0, 0.04]], 20);
  P.rust.add(dish, { matrix: M, pos: [0.5, H - 2.6, 0.3], rot: [PI / 2 - 0.3, 0.8, 0, 'YXZ'], color: '#9a9488', metal: 1 });
  P.signs.add(new THREE.SphereGeometry(0.12, 10, 8), { matrix: M, pos: [0, H + 1.65, 0], uvRect: uvOf(REG.white, 8), color: '#ff2a1a', glow: [8, 0.8, 0], vary: 0 });
}

function deadTree(B, x, y, z, h, seed) {
  const { P } = B;
  const r = B.rng(seed);
  const segs = [];
  const grow = (from, dir, len, rad, depth) => {
    const steps = depth === 0 ? 4 : 2;
    let p = from;
    let d = dir.clone();
    for (let i = 0; i < steps; i++) {
      d.add(new THREE.Vector3((r() - 0.5) * 0.5, 0.08, (r() - 0.5) * 0.5)).normalize();
      const q = p.clone().addScaledVector(d, len / steps);
      const r1 = rad * (1 - (i + 1) / (steps + 1.2));
      segs.push([p, q, rad * (1 - i / (steps + 1.2)), r1]);
      if (depth < 2 && i >= steps - 2 + (depth ? 0 : 1)) {
        const n = depth === 0 ? 3 : 2;
        for (let k = 0; k < n; k++) {
          const bd = d.clone().add(new THREE.Vector3((r() - 0.5) * 1.8, 0.2 + r() * 0.4, (r() - 0.5) * 1.8)).normalize();
          grow(q, bd, len * (0.45 + r() * 0.2), r1 * 0.75, depth + 1);
        }
      }
      p = q;
    }
  };
  grow(new THREE.Vector3(x, y - 0.3, z), new THREE.Vector3((r() - 0.5) * 0.4, 1, (r() - 0.5) * 0.4).normalize(), h * 0.7, 0.2 + h * 0.02, 0);
  for (const [a, b, r0, r1] of segs) P.wood.add(taperedSegment(a, b, Math.max(0.015, r0), Math.max(0.01, r1), r0 > 0.08 ? 7 : 4), { color: DEADWOOD, vary: 0.22, varyK: 2 });
  B.boxWorld([x, y + 1, z], [0.4, 2, 0.4]);
}

export function buildCrt(P, M, page, { base = true, phase = 0, scale = 1 } = {}) {
  const S = new THREE.Matrix4().multiplyMatrices(M, new THREE.Matrix4().makeScale(scale, scale, scale));
  const o = base ? 0.07 : 0;
  if (base) P.plastic.add(lathe([[0, 0], [0.2, 0], [0.22, 0.015], [0.19, 0.035], [0.08, 0.05], [0.06, 0.08], [0, 0.08]], 20), { matrix: S, pos: [0, 0, -0.05], color: BEIGE_DARK, vary: 0.05 });
  P.plastic.box(0.62, 0.52, 0.1, { radius: 0.04, segments: 1, matrix: S, pos: [0, 0.29 + o, 0.03], color: BEIGE, vary: 0.06 });
  P.plastic.box(0.55, 0.47, 0.26, { radius: 0.05, segments: 1, matrix: S, pos: [0, 0.285 + o, -0.14], color: BEIGE, vary: 0.06 });
  P.plastic.box(0.4, 0.34, 0.22, { radius: 0.06, segments: 1, matrix: S, pos: [0, 0.27 + o, -0.34], color: BEIGE_DARK, vary: 0.06 });
  P.plastic.box(0.52, 0.41, 0.02, { radius: 0.008, matrix: S, pos: [0, 0.3 + o, 0.075], color: '#0c0d0d', vary: 0 });
  P.plastic.box(0.03, 0.012, 0.01, { matrix: S, pos: [0.25, 0.06 + o, 0.082], color: '#3bff6b', glow: [4, 0, 0], vary: 0 });
  const uv = pageUV(page);
  const crop = [uv[0], uv[3] - (uv[3] - uv[1]) * 0.6, uv[2], uv[3]];
  P.screens.add(new THREE.PlaneGeometry(0.48, 0.36, 1, 1), { matrix: S, pos: [0, 0.3 + o, 0.087], uvRect: crop, color: '#ffffff', glow: [1.7, 0.07, phase], vary: 0 });
}

export function digitsUV(attr, slots, value) {
  const str = String(value).padStart(6, '0');
  for (let i = 0; i < slots; i++) {
    const [u0, v0, u1, v1] = digitUV(Number(str[i]));
    const base = i * 6;
    const quad = [[u0, v1], [u0, v0], [u1, v1], [u0, v0], [u1, v0], [u1, v1]];
    for (let k = 0; k < 6; k++) attr.setXY(base + k, quad[k][0], quad[k][1]);
  }
  attr.needsUpdate = true;
}
