import * as THREE from 'three';
import { Builder, lathe, PI } from './kit.js';
import { seeded } from '../../core/rng.js';
import { paneMaterial, plume } from './shaders.js';

export const COTTAGE = {
  ext: { x: 3.5, z: 2.5 },
  int: { x: 3.0, z: 2.0 },
  eave: 2.6,
  pitch: THREE.MathUtils.degToRad(38),
  door: { x0: -2.25, x1: -0.95, h: 2.35 },
  eastWindow: { x0: 1.1, x1: 2.1, y0: 1.0, y1: 2.0 },
  westWindow: { x0: 0.5, x1: 1.3, y0: 1.1, y1: 1.9 },
  terminal: [1.6, 0, 1.66],
  crt: [1.7, 1.05, 1.54],
  board: [-0.6, 1.62, -1.985],
  porch: [-0.4, 1.35, 3.9],
  doorOutside: [-1.6, 0, 3.4],
  doorInside: [-1.6, 0, 1.3],
  center: [0.1, 0, 0.2],
};
const TAN = Math.tan(COTTAGE.pitch);
const RIDGE = COTTAGE.eave + COTTAGE.ext.z * TAN;
const roofY = (z) => COTTAGE.eave + (COTTAGE.ext.z - Math.abs(z)) * TAN;

function rects(span, height, openings) {
  const out = [];
  const xs = [span[0]];
  for (const o of openings) xs.push(o.x0, o.x1);
  xs.push(span[1]);
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i];
    const b = xs[i + 1];
    if (b - a < 1e-3) continue;
    const o = openings.find((op) => Math.abs(op.x0 - a) < 1e-6 && Math.abs(op.x1 - b) < 1e-6);
    if (!o) out.push({ x0: a, x1: b, y0: 0, y1: height });
    else {
      if (o.y0 > 0) out.push({ x0: a, x1: b, y0: 0, y1: o.y0 });
      if (o.y1 < height) out.push({ x0: a, x1: b, y0: o.y1, y1: height });
    }
  }
  return out;
}

function prism(points, depth) {
  const shape = new THREE.Shape(points.map(([u, v]) => new THREE.Vector2(u, v)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.rotateY(-PI / 2);
  return g;
}

export function buildCottage(ctx, { origin, rotationY, mats }) {
  const { scene, physics, props } = ctx;
  const group = new THREE.Group();
  group.position.copy(origin);
  group.rotation.y = rotationY;
  scene.add(group);
  group.updateMatrixWorld();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
  const toWorld = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(q).add(origin);
  const tw = (a) => toWorld(a[0], a[1], a[2]);
  const solids = [];
  const box = (cx, cy, cz, sx, sy, sz, extraQ, userData = { kind: 'cottage', surface: 'stone' }) => {
    const quat = extraQ ? q.clone().multiply(extraQ) : q;
    const h = physics.addStaticBox({ position: toWorld(cx, cy, cz), size: [sx, sy, sz], quaternion: quat, userData });
    solids.push(h);
    return h;
  };

  const S = new Builder(401);
  const P = new Builder(402);
  const R = new Builder(403);
  const K = new Builder(404);
  const W = new Builder(405);
  const C = new Builder(406);
  const M = new Builder(407);
  const E = new Builder(408);
  const G = new Builder(409);
  const { ext, int, eave } = COTTAGE;
  const stoneC = { color: '#c4beb2', vary: 0.12, worldUV: 1.5 };
  const plasterC = { color: '#fbf3e3', vary: 0.04, worldUV: 1.8 };

  const east = rects([-ext.x, ext.x], eave, [{ ...COTTAGE.door, y0: 0, y1: COTTAGE.door.h }, COTTAGE.eastWindow]);
  const west = rects([-ext.x, ext.x], eave, [COTTAGE.westWindow]);
  for (const [list, side] of [[east, 1], [west, -1]]) {
    for (const r of list) {
      const w = r.x1 - r.x0;
      const h = r.y1 - r.y0;
      const cz = side * (int.z + 0.03 + (ext.z - int.z - 0.03) / 2);
      S.box(w, h, ext.z - int.z - 0.03, { radius: 0.02, pos: [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, cz], ...stoneC });
      box((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, side * (int.z + (ext.z - int.z) / 2), w, h, ext.z - int.z);
      const px0 = Math.max(r.x0, -int.x);
      const px1 = Math.min(r.x1, int.x);
      if (px1 - px0 > 0.01) P.box(px1 - px0, h, 0.03, { radius: 0.004, pos: [(px0 + px1) / 2, (r.y0 + r.y1) / 2, side * (int.z + 0.015)], ...plasterC });
    }
    const cap = prism([[side * (int.z + 0.03), eave], [side * ext.z, eave], [side * ext.z, eave + 0.02], [side * (int.z + 0.03), roofY(int.z + 0.03)]], 2 * ext.x);
    cap.translate(ext.x, 0, 0);
    S.add(cap, stoneC);
    P.box(2 * int.x, roofY(int.z) - eave + 0.02, 0.03, { radius: 0.004, pos: [0, (eave + roofY(int.z)) / 2, side * (int.z + 0.015)], ...plasterC });
  }
  for (const side of [1, -1]) {
    const pts = [[-int.z, 0], [int.z, 0], [int.z, eave], [ext.z + 0.001, eave], [0, RIDGE], [-ext.z - 0.001, eave], [-int.z, eave]];
    const g = prism(pts, ext.x - int.x);
    g.translate(side > 0 ? ext.x : -int.x, 0, 0);
    S.add(g, stoneC);
    box(side * (int.x + (ext.x - int.x) / 2), RIDGE / 2, 0, ext.x - int.x, RIDGE, 2 * ext.z);
    const ip = prism([[-int.z, 0], [int.z, 0], [int.z, roofY(int.z)], [0, RIDGE - 0.01], [-int.z, roofY(int.z)]], 0.03);
    ip.translate(side > 0 ? int.x : -int.x + 0.03, 0, 0);
    P.add(ip, plasterC);
  }

  const over = 0.4;
  const run = ext.z + over;
  const slope = run / Math.cos(COTTAGE.pitch) + 0.06;
  for (const side of [1, -1]) {
    const zm = side * run / 2;
    const ym = RIDGE - (run / 2) * TAN;
    const nz = side * Math.sin(COTTAGE.pitch);
    const ny = Math.cos(COTTAGE.pitch);
    R.box(2 * ext.x + 0.7, 0.16, slope, { radius: 0.03, pos: [0, ym + ny * 0.08, zm + nz * 0.08], rot: [side * COTTAGE.pitch, 0, 0], color: '#9aa0aa', vary: 0.14, uvScale: [3.6, 1.9] });
    box(0, ym + ny * 0.08, zm + nz * 0.08, 2 * ext.x + 0.7, 0.16, slope, new THREE.Quaternion().setFromEuler(new THREE.Euler(side * COTTAGE.pitch, 0, 0)));
    const ziM = side * int.z / 2;
    const yiM = RIDGE - (int.z / 2) * TAN - 0.012;
    K.box(2 * int.x, 0.024, int.z / Math.cos(COTTAGE.pitch) + 0.02, { radius: 0.004, pos: [0, yiM - ny * 0.0, ziM], rot: [side * COTTAGE.pitch, 0, 0], color: '#a88a68', vary: 0.08, uvScale: [5, 2.4] });
  }
  R.add(new THREE.CylinderGeometry(0.12, 0.12, 2 * ext.x + 0.72, 10), { pos: [0, RIDGE + 0.13, 0], rot: [0, 0, PI / 2], color: '#6a6f78', vary: 0.1 });

  for (const x of [-1.6, 0.0, 1.6]) {
    W.box(0.16, 0.2, 2 * int.z + 0.1, { radius: 0.02, pos: [x, eave + 0.1, 0], color: '#6b4a2e', vary: 0.18, jitter: 0.008 });
    W.box(0.1, roofY(0) - eave - 0.25, 0.1, { radius: 0.015, pos: [x, (eave + roofY(0)) / 2, 0], color: '#6b4a2e', vary: 0.18 });
  }
  W.box(2 * int.x, 0.16, 0.14, { radius: 0.02, pos: [0, RIDGE - 0.2, 0], color: '#5f4128', vary: 0.18, jitter: 0.008 });

  K.box(2 * int.x, 0.06, 2 * int.z, { radius: 0.01, pos: [0, -0.03, 0], color: '#b38a62', vary: 0.1, worldUV: 1.1 });
  box(0, -0.2, 0, 2 * int.x, 0.4, 2 * int.z, null, { kind: 'cottage', surface: 'wood' });
  S.box(COTTAGE.door.x1 - COTTAGE.door.x0, 0.12, ext.z - int.z + 0.05, { radius: 0.02, pos: [(COTTAGE.door.x0 + COTTAGE.door.x1) / 2, -0.06, (int.z + ext.z) / 2], color: '#aaa49a', ...{ vary: 0.1, worldUV: 1.4 } });
  box((COTTAGE.door.x0 + COTTAGE.door.x1) / 2, -0.2, (int.z + ext.z) / 2, COTTAGE.door.x1 - COTTAGE.door.x0, 0.4, ext.z - int.z);
  S.box(1.7, 0.42, 0.7, { radius: 0.05, segments: 2, pos: [(COTTAGE.door.x0 + COTTAGE.door.x1) / 2, -0.21, ext.z + 0.32], color: '#a59f94', vary: 0.12, worldUV: 1.4, jitter: 0.01 });
  const rampLen = 1.3;
  const rampA = Math.atan2(0.4, rampLen);
  box((COTTAGE.door.x0 + COTTAGE.door.x1) / 2, -0.2 - 0.05 * Math.cos(rampA), ext.z + 0.05 + rampLen / 2 - 0.05 * Math.sin(rampA), 1.9, 0.1, Math.hypot(rampLen, 0.4), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rampA));
  S.box(ext.x * 2 + 0.1, 0.4, ext.z * 2 + 0.1, { radius: 0.04, pos: [0, -0.22, 0], color: '#8f897f', vary: 0.12, worldUV: 2 });

  const chimX = -ext.x + 0.42;
  S.box(0.84, 2.3, 0.84, { radius: 0.03, pos: [chimX, RIDGE + 0.55, 0], color: '#bdb6aa', vary: 0.12, worldUV: 2.2, jitter: 0.008 });
  S.box(0.96, 0.12, 0.96, { radius: 0.03, pos: [chimX, RIDGE + 1.72, 0], color: '#a49e93', vary: 0.1 });
  R.add(lathe([[0.15, 0], [0.17, 0.04], [0.14, 0.3], [0.16, 0.36], [0.12, 0.36], [0.1, 0.05], [0.0, 0.05]], 14), { pos: [chimX - 0.12, RIDGE + 1.78, 0.12], color: '#d8704a', vary: 0.12 });
  R.add(lathe([[0.13, 0], [0.15, 0.04], [0.12, 0.26], [0.14, 0.3], [0.1, 0.3], [0.08, 0.05], [0.0, 0.05]], 14), { pos: [chimX + 0.16, RIDGE + 1.78, -0.14], color: '#c9643f', vary: 0.12 });
  const breastX = -int.x + 0.22;
  P.box(0.44, 4.45, 1.1, { radius: 0.03, pos: [breastX, 2.225, 0], ...plasterC });
  S.box(0.5, 0.04, 1.16, { radius: 0.01, pos: [breastX + 0.02, 0.02, 0], color: '#6f6a62', vary: 0.1, worldUV: 1 });
  box(breastX, 2.225, 0, 0.44, 4.45, 1.1);

  const frame = (o, side) => {
    const z = side * (int.z + 0.12);
    const w = o.x1 - o.x0;
    const h = o.y1 - o.y0;
    const cx = (o.x0 + o.x1) / 2;
    const cy = (o.y0 + o.y1) / 2;
    const col = '#e9e2d0';
    K.box(w, 0.07, 0.09, { pos: [cx, o.y0 + 0.035, z], color: col, vary: 0.06 });
    K.box(w, 0.07, 0.09, { pos: [cx, o.y1 - 0.035, z], color: col, vary: 0.06 });
    K.box(0.07, h, 0.09, { pos: [o.x0 + 0.035, cy, z], color: col, vary: 0.06 });
    K.box(0.07, h, 0.09, { pos: [o.x1 - 0.035, cy, z], color: col, vary: 0.06 });
    K.box(0.04, h - 0.1, 0.05, { pos: [cx, cy, z], color: col, vary: 0.06 });
    K.box(w - 0.1, 0.04, 0.05, { pos: [cx, cy + h * 0.08, z], color: col, vary: 0.06 });
    S.box(w + 0.24, 0.08, 0.32, { radius: 0.02, pos: [cx, o.y0 - 0.04, side * (ext.z + 0.06)], color: '#a8a296', vary: 0.1, worldUV: 1.4 });
    K.box(w + 0.06, 0.05, 0.3, { radius: 0.01, pos: [cx, o.y0 - 0.02, side * (int.z - 0.1)], color: '#7a5636', vary: 0.12 });
    const pane = new THREE.PlaneGeometry(w - 0.1, h - 0.1);
    if (side < 0) pane.rotateY(PI);
    G.add(pane, { pos: [cx, cy, z + side * 0.02], vary: 0 });
    box(cx, cy, z, w, h, 0.12);
  };
  frame(COTTAGE.eastWindow, 1);
  frame(COTTAGE.westWindow, -1);

  const ew = COTTAGE.eastWindow;
  const shutterW = (ew.x1 - ew.x0) / 2 + 0.04;
  for (const [x, a] of [[ew.x0 - shutterW / 2 - 0.04, 1], [ew.x1 + shutterW / 2 + 0.04, -1]]) {
    for (let i = 0; i < 4; i++) K.box(shutterW / 4 - 0.008, ew.y1 - ew.y0 + 0.1, 0.035, { radius: 0.006, pos: [x - shutterW / 2 + (i + 0.5) * shutterW / 4, (ew.y0 + ew.y1) / 2, ext.z + 0.03], color: '#4f7f9c', vary: 0.14 });
    K.box(shutterW, 0.06, 0.03, { pos: [x, ew.y0 + 0.2, ext.z + 0.06], color: '#456f88', vary: 0.12 });
    K.box(shutterW, 0.06, 0.03, { pos: [x, ew.y1 - 0.15, ext.z + 0.06], color: '#456f88', vary: 0.12 });
    M.box(0.03, 0.03, 0.08, { pos: [x + a * shutterW * 0.45, ew.y0 + 0.5, ext.z + 0.06], color: '#222' });
  }

  const D = COTTAGE.door;
  const doorW = D.x1 - D.x0;
  K.box(0.09, D.h + 0.05, 0.14, { pos: [D.x0 + 0.045, D.h / 2, int.z + 0.07], color: '#5a3d26', vary: 0.12 });
  K.box(0.09, D.h + 0.05, 0.14, { pos: [D.x1 - 0.045, D.h / 2, int.z + 0.07], color: '#5a3d26', vary: 0.12 });
  K.box(doorW, 0.12, 0.16, { pos: [(D.x0 + D.x1) / 2, D.h + 0.03, int.z + 0.08], color: '#5a3d26', vary: 0.12 });
  S.box(doorW + 0.5, 0.32, 0.5, { radius: 0.03, pos: [(D.x0 + D.x1) / 2, D.h + 0.18, ext.z - 0.22], color: '#a59f93', vary: 0.08, worldUV: 1.6 });

  const doorPivot = new THREE.Group();
  doorPivot.position.set(D.x0 + 0.09, 0, int.z + 0.1);
  group.add(doorPivot);
  const DL = new Builder(410);
  const leafW = doorW - 0.18;
  const leafH = D.h - 0.04;
  for (let i = 0; i < 6; i++) DL.box(leafW / 6 - 0.006, leafH, 0.055, { radius: 0.008, pos: [(i + 0.5) * leafW / 6, leafH / 2 + 0.02, 0], color: '#45789a', vary: 0.12 });
  for (const y of [0.35, leafH - 0.35]) DL.box(leafW - 0.06, 0.13, 0.04, { radius: 0.01, pos: [leafW / 2, y, -0.045], color: '#3f6d8c', vary: 0.1 });
  const diag = Math.hypot(leafW - 0.2, leafH - 0.7);
  DL.box(0.12, diag, 0.035, { radius: 0.01, pos: [leafW / 2, leafH / 2, -0.045], rot: [0, 0, -Math.atan2(leafW - 0.2, leafH - 0.7)], color: '#3f6d8c', vary: 0.1 });
  DL.box(0.05, 0.22, 0.05, { radius: 0.01, pos: [leafW - 0.12, 1.02, 0.05], color: '#1e1c1a', vary: 0.1 });
  DL.box(0.14, 0.035, 0.03, { radius: 0.01, pos: [leafW - 0.15, 1.1, 0.06], color: '#2a2724', vary: 0.1 });
  for (const y of [0.35, leafH - 0.35]) DL.box(0.5, 0.05, 0.012, { radius: 0.004, pos: [0.25, y, 0.034], color: '#1e1c1a', vary: 0.1 });
  const doorLeaf = new THREE.Mesh(DL.build(), mats.planks);
  doorLeaf.castShadow = false;
  doorLeaf.receiveShadow = true;
  doorPivot.add(doorLeaf);
  const signFace = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.43), mats.standardText(mats.robots));
  signFace.position.set(leafW / 2, 1.58, 0.045);
  doorPivot.add(signFace);
  const noteMesh = ctx.text.panel({ style: 'human', size: [0.3, 0.26], emissive: 0, body: ['La porte est coincée. Elle fait ça quand l\'Anneau est éteint.', 'Revenez avec de la lumière.'], author: 'M.', seed: 11, fontSize: 36 });
  noteMesh.position.set(leafW / 2 + 0.06, 1.12, 0.032);
  noteMesh.rotation.z = -0.06;
  doorPivot.add(noteMesh);
  let doorSolid = box((D.x0 + D.x1) / 2, D.h / 2, int.z + 0.1, doorW - 0.12, D.h, 0.1, null, { kind: 'door', surface: 'wood' });

  const crtSpot = COTTAGE.terminal;
  const lampBase = [2.0, 0.78, 1.82];
  M.cyl(0.07, 0.09, 0.03, { seg: 16, pos: [lampBase[0], lampBase[1] + 0.015, lampBase[2]], color: '#8a6a2c', vary: 0.1 });
  M.cyl(0.012, 0.012, 0.36, { seg: 6, pos: [lampBase[0], lampBase[1] + 0.2, lampBase[2]], color: '#8a6a2c' });
  M.add(lathe([[0.17, 0], [0.16, 0.02], [0.08, 0.16], [0.05, 0.17], [0.0, 0.17]], 18), { pos: [lampBase[0], lampBase[1] + 0.28, lampBase[2] - 0.02], color: '#2f5a3a', vary: 0.08 });
  E.add(new THREE.SphereGeometry(0.045, 10, 8), { pos: [lampBase[0], lampBase[1] + 0.31, lampBase[2] - 0.02], color: new THREE.Color('#ffd9a0').multiplyScalar(5), vary: 0 });

  const cup = [2.1, 0.78, 1.43];
  M.add(lathe([[0, 0], [0.034, 0], [0.04, 0.012], [0.044, 0.07], [0.047, 0.085], [0.041, 0.085], [0.038, 0.012], [0, 0.012]], 18), { pos: cup, color: '#f2ece0', vary: 0.03 });
  M.add(new THREE.TorusGeometry(0.022, 0.006, 6, 12, PI * 1.2), { pos: [cup[0] + 0.048, cup[1] + 0.045, cup[2]], rot: [0, 0, -PI * 0.6], color: '#f2ece0', vary: 0.03 });
  M.add(new THREE.CylinderGeometry(0.039, 0.039, 0.004, 16), { pos: [cup[0], cup[1] + 0.07, cup[2]], color: '#6e3a14', vary: 0.05 });
  M.add(lathe([[0, 0], [0.075, 0], [0.078, 0.006], [0.07, 0.008], [0, 0.008]], 18), { pos: [cup[0], cup[1], cup[2]], color: '#efe6d6', vary: 0.03 });
  const glasses = [1.27, 0.785, 1.42];
  for (const dx of [-0.032, 0.032]) M.add(new THREE.TorusGeometry(0.024, 0.0035, 6, 16), { pos: [glasses[0] + dx, glasses[1] + 0.004, glasses[2]], rot: [PI / 2 - 0.15, 0, 0.2], color: '#3a2a1c' });
  M.box(0.012, 0.004, 0.004, { pos: [glasses[0], glasses[1] + 0.008, glasses[2] + 0.005], color: '#3a2a1c' });
  for (const s of [-1, 1]) M.box(0.004, 0.003, 0.11, { pos: [glasses[0] + s * 0.055, glasses[1] + 0.006, glasses[2] - 0.05], rot: [0, s * 0.25, 0], color: '#3a2a1c' });
  C.box(0.15, 0.012, 0.21, { radius: 0.003, pos: [1.15, 0.785, 1.7], rot: [0, 0.3, 0], color: '#d9cfa9', vary: 0.06 });
  C.box(0.14, 0.004, 0.2, { radius: 0.002, pos: [1.15, 0.794, 1.7], rot: [0, 0.32, 0], color: '#2c4f7a', vary: 0.06 });

  const chair = { x: 1.42, z: 0.92, a: 0.45 };
  const ch = new THREE.Matrix4().makeRotationY(chair.a).setPosition(chair.x, 0, chair.z);
  const cw = (pos, size, color = '#7b5534') => {
    const m = new THREE.Matrix4().makeTranslation(pos[0], pos[1], pos[2]);
    W.box(size[0], size[1], size[2], { radius: 0.012, matrix: ch.clone().multiply(m), color, vary: 0.14 });
  };
  cw([0, 0.45, 0], [0.44, 0.04, 0.42]);
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) cw([x, 0.215, z], [0.04, 0.43, 0.04]);
  for (const x of [-0.19, 0.19]) cw([x, 0.72, -0.19], [0.04, 0.55, 0.04]);
  for (const y of [0.62, 0.78, 0.94]) cw([0, y, -0.19], [0.38, 0.05, 0.025]);
  C.box(0.38, 0.05, 0.36, { radius: 0.02, segments: 2, matrix: ch.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.49, 0.01)), color: '#9b3b2c', vary: 0.1 });
  const chairC = new THREE.Vector3(chair.x, 0.4, chair.z);
  box(chairC.x, 0.4, chairC.z, 0.46, 0.8, 0.46, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), chair.a), { kind: 'cottage', surface: 'wood' });


  const sx = int.x - 0.19;
  const shelfZ0 = -1.85;
  const shelfZ1 = -0.25;
  const shelfH = 2.05;
  W.box(0.38, shelfH, 0.035, { pos: [sx, shelfH / 2, shelfZ0], color: '#6e4c2e', vary: 0.12 });
  W.box(0.38, shelfH, 0.035, { pos: [sx, shelfH / 2, shelfZ1], color: '#6e4c2e', vary: 0.12 });
  W.box(0.03, shelfH, shelfZ1 - shelfZ0, { pos: [int.x - 0.015, shelfH / 2, (shelfZ0 + shelfZ1) / 2], color: '#5d3f25', vary: 0.12 });
  const bookColors = ['#7a2a22', '#2c4a6b', '#3d5a35', '#b48a3c', '#5c3d5e', '#8a7a5c', '#1f2a36', '#a0522d', '#d9cfb0', '#6b2e2e'];
  const r = seeded(4242);
  for (let i = 0; i < 5; i++) {
    const y = 0.08 + i * 0.42;
    W.box(0.37, 0.03, shelfZ1 - shelfZ0 - 0.04, { pos: [sx, y, (shelfZ0 + shelfZ1) / 2], color: '#6e4c2e', vary: 0.1 });
    if (i === 4) continue;
    let z = shelfZ0 + 0.04;
    while (z < shelfZ1 - 0.08) {
      const t = 0.025 + r() * 0.045;
      const h = 0.2 + r() * 0.14;
      const d = 0.16 + r() * 0.1;
      const lean = r() < 0.08 ? 0.25 : 0;
      if (r() < 0.07) {
        z += 0.06;
        continue;
      }
      if (i === 2 && z > shelfZ0 + 0.7 && z < shelfZ0 + 1.1) {
        C.box(0.26, 0.03, 0.2, { radius: 0.004, pos: [sx - 0.02, y + 0.03 + (z - shelfZ0 - 0.7) * 0.25, z + 0.08], color: r() < 0.5 ? '#e8e0c8' : '#cfc49e', vary: 0.05 });
        z += 0.06;
        continue;
      }
      C.box(d, h, t, { radius: 0.006, pos: [sx + 0.18 - d / 2 - 0.02, y + 0.015 + h / 2, z + t / 2], rot: [lean, 0, 0], color: bookColors[Math.floor(r() * bookColors.length)], vary: 0.1 });
      z += t + 0.003;
    }
  }
  box(sx, shelfH / 2, (shelfZ0 + shelfZ1) / 2, 0.4, shelfH, shelfZ1 - shelfZ0, null, { kind: 'cottage', surface: 'wood' });

  const baro = [int.x - 0.03, 1.62, 0.72];
  const bm = new THREE.Matrix4().makeRotationY(-PI / 2).setPosition(baro[0], baro[1], baro[2]);
  W.add(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 28), { matrix: bm.clone().multiply(new THREE.Matrix4().makeRotationX(PI / 2)), color: '#6b4426', vary: 0.1 });
  M.add(new THREE.TorusGeometry(0.135, 0.012, 8, 28), { matrix: bm.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.028)), color: '#b08a3a', vary: 0.06 });
  M.add(new THREE.CircleGeometry(0.13, 28), { matrix: bm.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.027)), color: '#efe7d2', vary: 0.02 });
  M.box(0.004, 0.11, 0.003, { matrix: bm.clone().multiply(new THREE.Matrix4().makeRotationZ(-0.7)).multiply(new THREE.Matrix4().makeTranslation(0, 0.04, 0.031)), color: '#111' });
  for (let i = 0; i < 11; i++) {
    const a = -PI * 0.75 + i * PI * 0.15;
    M.box(0.003, 0.018, 0.002, { matrix: bm.clone().multiply(new THREE.Matrix4().makeRotationZ(a)).multiply(new THREE.Matrix4().makeTranslation(0, 0.105, 0.029)), color: '#3a3026' });
  }

  const stove = [-int.x + 0.42, 0, 0];
  M.box(0.52, 0.06, 0.68, { radius: 0.02, pos: [stove[0], 0.75, 0], color: '#1d1c1c', vary: 0.08 });
  M.box(0.48, 0.5, 0.62, { radius: 0.03, segments: 2, pos: [stove[0], 0.47, 0], color: '#262424', vary: 0.08 });
  M.box(0.46, 0.05, 0.6, { radius: 0.01, pos: [stove[0], 0.2, 0], color: '#1d1c1c', vary: 0.08 });
  for (const [x, z] of [[-0.19, -0.26], [0.19, -0.26], [-0.19, 0.26], [0.19, 0.26]]) M.cyl(0.025, 0.02, 0.2, { seg: 8, pos: [stove[0] + x, 0.1, z], color: '#1a1919' });
  M.box(0.03, 0.3, 0.38, { radius: 0.01, pos: [stove[0] + 0.245, 0.47, 0], color: '#2e2b29', vary: 0.06 });
  E.box(0.02, 0.2, 0.28, { radius: 0.005, pos: [stove[0] + 0.255, 0.46, 0], color: new THREE.Color('#ff7a2a').multiplyScalar(3.2), vary: 0.25 });
  M.box(0.05, 0.03, 0.03, { pos: [stove[0] + 0.28, 0.58, 0.14], color: '#8a7a5a' });
  M.cyl(0.075, 0.075, 0.95, { seg: 12, pos: [stove[0] - 0.05, 0.78 + 0.47, 0], color: '#222' });
  M.cyl(0.085, 0.085, 0.04, { seg: 12, pos: [stove[0] - 0.05, 1.0, 0], color: '#3a3836' });
  M.add(lathe([[0, 0], [0.11, 0], [0.13, 0.04], [0.13, 0.12], [0.1, 0.16], [0.04, 0.17], [0.04, 0.2], [0, 0.2]], 16), { pos: [stove[0] + 0.05, 0.78, 0.17], color: '#8c3b26', vary: 0.08 });
  M.add(new THREE.TorusGeometry(0.07, 0.008, 6, 14, PI), { pos: [stove[0] + 0.05, 0.98, 0.17], rot: [0, PI / 2, 0], color: '#222' });
  M.cyl(0.012, 0.02, 0.12, { seg: 6, pos: [stove[0] + 0.17, 0.87, 0.17], rot: [0, 0, -0.9], color: '#8c3b26' });
  box(stove[0], 0.4, 0, 0.56, 0.8, 0.7, null, { kind: 'cottage', surface: 'metal' });
  const logbox = [-int.x + 0.35, 0, -1.25];
  W.box(0.55, 0.42, 0.5, { radius: 0.015, pos: [logbox[0], 0.21, logbox[2]], color: '#7d5a38', vary: 0.12 });
  for (let i = 0; i < 9; i++) {
    const lx = logbox[0] - 0.18 + (i % 3) * 0.16;
    const ly = 0.42 + Math.floor(i / 3) * 0.1;
    W.add(new THREE.CylinderGeometry(0.055, 0.06, 0.45, 8), { pos: [lx + r() * 0.03, ly, logbox[2]], rot: [PI / 2, r() * 0.4, 0], color: i % 2 ? '#8b6a48' : '#6f5236', vary: 0.2, jitter: 0.008 });
  }
  box(logbox[0], 0.3, logbox[2], 0.55, 0.6, 0.5, null, { kind: 'cottage', surface: 'wood' });

  const arm = { x: -1.75, z: -1.32, a: -0.45 };
  const am = new THREE.Matrix4().makeRotationY(arm.a).setPosition(arm.x, 0, arm.z);
  const at = (x, y, z) => am.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z));
  C.box(0.7, 0.18, 0.66, { radius: 0.06, segments: 3, matrix: at(0, 0.36, 0.02), color: '#8f3f2e', vary: 0.1 });
  C.box(0.72, 0.62, 0.18, { radius: 0.07, segments: 3, matrix: at(0, 0.76, -0.27), color: '#8f3f2e', vary: 0.1 });
  for (const s of [-1, 1]) C.box(0.14, 0.3, 0.64, { radius: 0.06, segments: 3, matrix: at(s * 0.37, 0.52, 0.0), color: '#86392a', vary: 0.1 });
  W.box(0.8, 0.27, 0.72, { radius: 0.03, matrix: at(0, 0.135, 0), color: '#5a3a22', vary: 0.12 });
  C.box(0.62, 0.06, 0.32, { radius: 0.025, segments: 2, matrix: at(-0.36, 0.69, 0.06).multiply(new THREE.Matrix4().makeRotationZ(-0.25)), color: '#c9b27a', vary: 0.18 });
  C.add(new THREE.IcosahedronGeometry(0.075, 1), { matrix: at(0.12, 0.5, 0.22), color: '#b8402e', vary: 0.18, jitter: 0.01 });
  M.cyl(0.004, 0.004, 0.34, { seg: 4, matrix: at(0.0, 0.52, 0.12).multiply(new THREE.Matrix4().makeRotationZ(1.2)), color: '#b0b0b0' });
  M.cyl(0.004, 0.004, 0.34, { seg: 4, matrix: at(0.02, 0.52, 0.16).multiply(new THREE.Matrix4().makeRotationZ(1.35)), color: '#b0b0b0' });
  C.box(0.32, 0.03, 0.26, { radius: 0.012, matrix: at(-0.05, 0.47, 0.12).multiply(new THREE.Matrix4().makeRotationY(0.4)), color: '#c9b27a', vary: 0.2 });
  box(arm.x, 0.5, arm.z, 0.8, 1.0, 0.75, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), arm.a), { kind: 'cottage', surface: 'wood' });

  const side = [-0.72, 0, -1.7];
  W.box(0.5, 0.03, 0.4, { radius: 0.01, pos: [side[0], 0.62, side[2]], color: '#6e4b2c', vary: 0.12 });
  for (const [x, z] of [[-0.21, -0.16], [0.21, -0.16], [-0.21, 0.16], [0.21, 0.16]]) W.box(0.03, 0.61, 0.03, { pos: [side[0] + x, 0.305, side[2] + z], color: '#6e4b2c', vary: 0.12 });
  W.box(0.44, 0.02, 0.34, { pos: [side[0], 0.18, side[2]], color: '#6e4b2c', vary: 0.12 });
  const radio = [side[0] - 0.06, 0.635, side[2] + 0.02];
  W.box(0.34, 0.22, 0.16, { radius: 0.04, segments: 3, pos: [radio[0], radio[1] + 0.11, radio[2]], color: '#7a4a24', vary: 0.1 });
  C.box(0.15, 0.13, 0.01, { radius: 0.01, pos: [radio[0] - 0.07, radio[1] + 0.12, radio[2] + 0.08], color: '#c7b48a', vary: 0.12 });
  E.box(0.11, 0.04, 0.008, { radius: 0.004, pos: [radio[0] + 0.09, radio[1] + 0.15, radio[2] + 0.082], color: new THREE.Color('#ffc46a').multiplyScalar(2.2), vary: 0.05 });
  for (const dx of [0.06, 0.12]) M.cyl(0.018, 0.018, 0.02, { seg: 10, pos: [radio[0] + dx, radio[1] + 0.07, radio[2] + 0.085], rot: [PI / 2, 0, 0], color: '#2a1d14' });
  const sideLamp = [side[0] + 0.15, 0.635, side[2] - 0.05];
  M.cyl(0.05, 0.06, 0.03, { seg: 12, pos: [sideLamp[0], sideLamp[1] + 0.015, sideLamp[2]], color: '#d8cbb0' });
  M.cyl(0.012, 0.012, 0.22, { seg: 6, pos: [sideLamp[0], sideLamp[1] + 0.13, sideLamp[2]], color: '#d8cbb0' });
  C.add(lathe([[0.11, 0], [0.07, 0.15], [0.0, 0.15]], 14), { pos: [sideLamp[0], sideLamp[1] + 0.2, sideLamp[2]], color: '#f0dcb0', vary: 0.04 });
  E.add(new THREE.SphereGeometry(0.03, 8, 6), { pos: [sideLamp[0], sideLamp[1] + 0.24, sideLamp[2]], color: new THREE.Color('#ffcf8f').multiplyScalar(3), vary: 0 });
  box(side[0], 0.35, side[2], 0.52, 0.7, 0.42, null, { kind: 'cottage', surface: 'wood' });

  const bd = COTTAGE.board;
  W.box(1.5, 1.08, 0.04, { radius: 0.01, pos: [bd[0], bd[1], -int.z + 0.02], color: '#5a3b20', vary: 0.1 });
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 1.035), mats.standardText(mats.board.tex));
  boardMesh.position.set(bd[0], bd[1], -int.z + 0.042);
  group.add(boardMesh);

  const cal = [0.12, 1.62, int.z - 0.012];
  const calMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.36), mats.standardText(mats.calendar));
  calMesh.position.set(cal[0], cal[1], cal[2]);
  calMesh.rotation.y = PI;
  group.add(calMesh);
  M.cyl(0.006, 0.006, 0.02, { seg: 6, pos: [cal[0], cal[1] + 0.2, cal[2] - 0.01], rot: [PI / 2, 0, 0], color: '#333' });

  const oil = [-int.x + 0.08, 0, 1.35];
  W.box(0.05, 0.08, 0.6, { radius: 0.01, pos: [oil[0], 1.78, oil[2]], color: '#5a3b20', vary: 0.1 });
  for (const dz of [-0.18, 0.18]) W.cyl(0.015, 0.015, 0.1, { seg: 6, pos: [oil[0] + 0.06, 1.8, oil[2] + dz], rot: [0, 0, PI / 2], color: '#4a3020' });
  C.add(lathe([[0.0, 0], [0.24, 0.02], [0.26, 0.4], [0.2, 0.75], [0.12, 0.92], [0.06, 1.0], [0.0, 1.0]], 12), { pos: [oil[0] + 0.14, 0.78, oil[2] - 0.18], scale: [0.55, 1, 1], color: '#f2c018', vary: 0.1, jitter: 0.01 });
  C.add(lathe([[0.0, 0], [0.2, 0.02], [0.22, 0.38], [0.17, 0.62], [0.08, 0.72], [0.0, 0.72]], 12), { pos: [oil[0] + 0.12, 1.08, oil[2] + 0.2], scale: [0.5, 1, 1], color: '#e9b412', vary: 0.1, jitter: 0.01 });
  C.add(lathe([[0, 0], [0.19, 0.0], [0.2, 0.02], [0.12, 0.05], [0.1, 0.14], [0.0, 0.15]], 14), { pos: [oil[0] + 0.13, 1.84, oil[2] + 0.2], rot: [0, 0, 0.3], color: '#e0b02a', vary: 0.1 });
  for (const dz of [-0.1, 0.1]) {
    M.add(lathe([[0, 0], [0.06, 0], [0.065, 0.03], [0.055, 0.34], [0.0, 0.34]], 10), { pos: [oil[0] + 0.25, 0, oil[2] + dz], scale: [1, 1, 1.4], color: '#2d3a2a', vary: 0.1 });
  }

  const rugBands = ['#7d3a2c', '#c9a46a', '#3f5a6e', '#a8553a', '#e0cfa8', '#5d6b45'];
  C.add(new THREE.RingGeometry(0.0, 1, 48, 22), { pos: [-0.55, 0.006, 0.15], rot: [-PI / 2, 0, 0], scale: [1.2, 0.75, 1], color: '#7d3a2c', vary: 0.12, shade(c, x, y, z, lx, ly) {
    const d = Math.hypot(lx, ly);
    c.set(rugBands[Math.floor(d * 11) % rugBands.length]).multiplyScalar(0.9 + 0.2 * Math.sin(Math.atan2(ly, lx) * 18));
  } });

  const sillW = COTTAGE.westWindow;
  M.add(lathe([[0, 0], [0.07, 0], [0.09, 0.12], [0.08, 0.13], [0, 0.13]], 12), { pos: [(sillW.x0 + sillW.x1) / 2 + 0.15, sillW.y0 + 0.005, -int.z + 0.12], color: '#b4583a', vary: 0.1 });
  C.add(new THREE.IcosahedronGeometry(0.12, 1), { pos: [(sillW.x0 + sillW.x1) / 2 + 0.15, sillW.y0 + 0.22, -int.z + 0.12], scale: [1, 0.8, 1], color: '#3e6b34', vary: 0.25, jitter: 0.03 });
  for (let i = 0; i < 5; i++) C.add(new THREE.IcosahedronGeometry(0.025, 0), { pos: [(sillW.x0 + sillW.x1) / 2 + 0.15 + (r() - 0.5) * 0.2, sillW.y0 + 0.26 + r() * 0.08, -int.z + 0.12 + (r() - 0.5) * 0.16], color: '#d8384a', vary: 0.1 });
  M.add(new THREE.SphereGeometry(0.035, 8, 6), { pos: [(sillW.x0 + sillW.x1) / 2 - 0.2, sillW.y0 + 0.02, -int.z + 0.1], scale: [1, 0.5, 1.3], color: '#e8d8c0', vary: 0.1 });

  const lantern = props.lantern(toWorld(-0.4, 2.35, ext.z + 0.32), { hanging: true, intensity: 3.5, color: '#ffb454' });
  M.box(0.05, 0.05, 0.42, { radius: 0.01, pos: [-0.4, 2.42, ext.z + 0.16], color: '#1e1c1a' });

  const mk = (b, material, shadow = true) => {
    if (b.empty) return null;
    const m = new THREE.Mesh(b.build(), material);
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const meshes = {
    stone: mk(S, mats.rubble),
    plaster: mk(P, mats.plaster, false),
    roof: mk(R, mats.slate),
    planks: mk(K, mats.planks, false),
    wood: mk(W, mats.wood, false),
    cloth: mk(C, mats.cloth, false),
    metal: mk(M, mats.metal, false),
    glow: mk(E, mats.emissive, false),
    panes: mk(G, paneMaterial(ctx), false),
  };
  meshes.panes.renderOrder = 3;

  const crtWorld = tw(COTTAGE.crt);
  const terminal = props.terminal(tw(crtSpot), rotationY + PI, { style: 'crt', texture: mats.crt.tex });

  const steam = plume(ctx, { width: 0.05, height: 0.32, color: '#ffffff', opacity: 0.5, speed: 0.45, lean: 0.02, lit: 0.9, seed: 2.3 });
  steam.position.copy(tw([cup[0], cup[1] + 0.085, cup[2]]));
  scene.add(steam);
  const smoke = plume(ctx, { width: 0.5, height: 7, color: '#9a9690', opacity: 0.55, speed: 0.12, lean: 0.6, lit: 0.05, seed: 7.1 });
  smoke.position.copy(toWorld(chimX - 0.12, RIDGE + 2.12, 0.12));
  scene.add(smoke);

  const lights = {
    desk: ctx.env.lights.add({ position: tw([lampBase[0], lampBase[1] + 0.28, lampBase[2] - 0.15]), color: '#ffc27a', intensity: 3.2, distance: 7, decay: 1.6 }),
    stove: ctx.env.lights.add({ position: tw([stove[0] + 0.45, 0.45, 0]), color: '#ff8a3a', intensity: 1.6, distance: 4.5, decay: 1.6, flicker: 0.5 }),
    fill: ctx.env.lights.add({ position: tw([sideLamp[0], sideLamp[1] + 0.35, sideLamp[2] + 0.2]), color: '#ffcf8f', intensity: 1.4, distance: 5, decay: 1.6 }),
    spill: ctx.env.lights.add({ position: toWorld((ew.x0 + ew.x1) / 2, 1.3, ext.z + 0.9), color: '#ffa850', intensity: 7, distance: 9, decay: 1.5 }),
  };

  let doorAngle = 0;
  let doorTarget = 0;
  let rattle = 0;
  const setDoor = (open, instant = false) => {
    doorTarget = open ? 1.72 : 0;
    if (instant) doorAngle = doorTarget;
    doorPivot.rotation.y = doorAngle;
    if (open && doorSolid) {
      doorSolid.remove();
      doorSolid = null;
      box(D.x0 + 0.12, D.h / 2, int.z - 0.55, 0.08, D.h, 1.1, null, { kind: 'door', surface: 'wood' });
    }
  };

  return {
    group, toWorld, tw, solids, meshes, terminal, crtWorld, steam, smoke, lights, lantern,
    noteMesh, signFace, boardMesh, calMesh,
    doorWorld: tw([(D.x0 + D.x1) / 2, 1.1, ext.z + 0.1]),
    windowWorld: toWorld((ew.x0 + ew.x1) / 2, (ew.y0 + ew.y1) / 2, ext.z + 0.25),
    radioWorld: tw(radio),
    stoveWorld: tw(stove),
    boardWorld: toWorld(bd[0], bd[1], -int.z + 0.06),
    cupWorld: tw(cup),
    setDoor,
    rattleDoor() {
      rattle = 0.6;
    },
    get doorOpen() {
      return doorTarget > 0;
    },
    isInside(p) {
      const l = p.clone().sub(origin).applyQuaternion(q.clone().invert());
      return Math.abs(l.x) < int.x + 0.05 && Math.abs(l.z) < int.z + 0.05 && l.y > -1 && l.y < 4;
    },
    update(dt, t) {
      doorAngle += (doorTarget - doorAngle) * Math.min(1, dt * 2.2);
      let wobble = 0;
      if (rattle > 0) {
        rattle = Math.max(0, rattle - dt);
        wobble = Math.sin(t * 60) * 0.012 * (rattle / 0.6);
      }
      doorPivot.rotation.y = doorAngle + wobble;
    },
  };
}
