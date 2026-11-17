import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PIT } from './shaders.js';

export const DEG = Math.PI / 180;
export const polar = (az, r) => [PIT.cx + Math.sin(az) * r, PIT.cz - Math.cos(az) * r];
export const facingCenter = (az) => -az;

const tmpColor = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export class Parts {
  constructor(rand = Math.random) {
    this.list = [];
    this.rand = rand;
  }

  add(geometry, { color = '#ffffff', vary = 0, matrix = null, pos = null, rot = null, scale = null } = {}) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const m = matrix ? matrix.clone() : new THREE.Matrix4();
    if (pos || rot || scale) {
      const local = new THREE.Matrix4().compose(
        new THREE.Vector3(...(pos || [0, 0, 0])),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot || [0, 0, 0]), 'YXZ')),
        new THREE.Vector3(...(Array.isArray(scale) ? scale : [scale || 1, scale || 1, scale || 1])),
      );
      m.multiply(local);
    }
    g.applyMatrix4(m);
    tmpColor.set(color);
    if (vary) tmpColor.offsetHSL(0, 0, (this.rand() - 0.5) * vary);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = tmpColor.r;
      col[i * 3 + 1] = tmpColor.g;
      col[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.list.push(g);
    return g;
  }

  build() {
    const out = mergeGeometries(this.list, false);
    for (const g of this.list) g.dispose();
    this.list = [];
    out.computeBoundingSphere();
    return out;
  }
}

export function strutMatrix(a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
  return { matrix: new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), q, new THREE.Vector3(1, 1, 1)), len };
}

export function strut(parts, a, b, radius, opts) {
  const { matrix, len } = strutMatrix(a, b);
  parts.add(new THREE.CylinderGeometry(radius, radius * 1.15, len, 8, 1), { ...opts, matrix });
}

export function arcTube(r, y, az0, az1, radius, segments = 6) {
  const span = az1 - az0;
  const n = Math.max(4, Math.ceil(Math.abs(span) * r / 1.2));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const az = az0 + (span * i) / n;
    const [x, z] = polar(az, r);
    pts.push(new THREE.Vector3(x, y, z));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, radius, segments, false);
}

export function sectorGeometry({ rIn, rOut, az0, az1, thickness, bevel = 0.14, segments = 18 }) {
  const shape = new THREE.Shape();
  const pt = (az, r) => [Math.sin(az) * r, Math.cos(az) * r];
  const corner = 0.9;
  const dIn = corner / rIn;
  const dOut = corner / rOut;
  shape.moveTo(...pt(az0 + dOut, rOut));
  for (let i = 1; i <= segments; i++) shape.lineTo(...pt(az0 + dOut + ((az1 - az0 - 2 * dOut) * i) / segments, rOut));
  shape.quadraticCurveTo(...pt(az1, rOut), ...pt(az1, rOut - corner));
  shape.lineTo(...pt(az1, rIn + corner));
  shape.quadraticCurveTo(...pt(az1, rIn), ...pt(az1 - dIn, rIn));
  for (let i = 1; i <= segments; i++) shape.lineTo(...pt(az1 - dIn - ((az1 - az0 - 2 * dIn) * i) / segments, rIn));
  shape.quadraticCurveTo(...pt(az0, rIn), ...pt(az0, rIn + corner));
  shape.lineTo(...pt(az0, rOut - corner));
  shape.quadraticCurveTo(...pt(az0, rOut), ...pt(az0 + dOut, rOut));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  return g;
}

export const MONOLITHS = [
  { az: 0, d: 108, h: 140, w: 40, lean: 6, roll: -1.5 },
  { az: -38, d: 94, h: 112, w: 34, lean: 4, roll: 2 },
  { az: 38, d: 99, h: 122, w: 36, lean: 7, roll: -2.5 },
  { az: -76, d: 82, h: 86, w: 30, lean: 3, roll: 3 },
  { az: 77, d: 86, h: 96, w: 30, lean: 5, roll: -3 },
  { az: -116, d: 75, h: 62, w: 26, lean: 8, roll: 2.5 },
  { az: 118, d: 72, h: 70, w: 24, lean: 4, roll: -2 },
];

export function buildMonoliths(rand) {
  const bodies = new Parts(rand);
  const screens = [];
  const colliders = [];
  MONOLITHS.forEach((m, i) => {
    const az = m.az * DEG;
    const [x, z] = polar(az, m.d);
    const base = new THREE.Matrix4().compose(new THREE.Vector3(x, PIT.rim - 0.6, z), new THREE.Quaternion().setFromAxisAngle(UP, facingCenter(az)), new THREE.Vector3(1, 1, 1));
    const lean = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-m.lean * DEG, 0, m.roll * DEG, 'YXZ'));
    const slab = base.clone().multiply(new THREE.Matrix4().makeTranslation(0, 2.4, 0)).multiply(lean);
    bodies.add(new RoundedBoxGeometry(m.w + 8, 3.4, 10, 3, 1.4), { color: '#e9edf5', vary: 0.03, matrix: base, pos: [0, 1.1, -0.5] });
    bodies.add(new RoundedBoxGeometry(m.w + 3, 1.6, 6.5, 3, 0.7), { color: '#f6f8fc', matrix: base, pos: [0, 3.4, -0.4] });
    bodies.add(new RoundedBoxGeometry(m.w, m.h, 2.6, 4, 1.05), { color: '#f2f4fa', vary: 0.03, matrix: slab, pos: [0, m.h / 2, 0] });
    for (const fx of [-0.3, 0.3]) {
      bodies.add(new RoundedBoxGeometry(1.6, m.h * 0.9, 2.4, 3, 0.7), { color: '#dfe4ee', matrix: slab, pos: [fx * m.w, m.h * 0.47, -1.9] });
    }
    bodies.add(new RoundedBoxGeometry(m.w * 0.5, 0.6, 1.2, 2, 0.25), { color: '#ff5fa2', matrix: slab, pos: [0, m.h + 0.1, 0] });
    const sw = m.w - 1.6;
    const sh = m.h - 1.6;
    const sg = new THREE.PlaneGeometry(sw, sh, 1, 1);
    sg.applyMatrix4(slab.clone().multiply(new THREE.Matrix4().makeTranslation(0, m.h / 2, 1.33)));
    const n = sg.attributes.position.count;
    sg.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(n).fill(i + 1), 1));
    const size = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) {
      size[k * 2] = sw;
      size[k * 2 + 1] = sh;
    }
    sg.setAttribute('aSize', new THREE.BufferAttribute(size, 2));
    screens.push(sg);
    const center = new THREE.Vector3(0, m.h / 2, 0).applyMatrix4(slab);
    const q = new THREE.Quaternion().setFromRotationMatrix(slab);
    colliders.push({ position: center, size: [m.w, m.h, 2.6], quaternion: q });
    const pc = new THREE.Vector3(0, 1.4, -0.5).applyMatrix4(base);
    colliders.push({ position: pc, size: [m.w + 8, 4, 10], quaternion: new THREE.Quaternion().setFromRotationMatrix(base) });
  });
  const screenGeo = mergeGeometries(screens, false);
  for (const g of screens) g.dispose();
  return { bodies: bodies.build(), screens: screenGeo, colliders };
}

export function buildRimCap() {
  const R = PIT.r;
  const y = PIT.rim;
  const prof = [
    [R + 0.05, y - 1.6], [R - 0.22, y - 1.45], [R - 0.3, y - 0.3], [R - 0.15, y - 0.02], [R + 0.25, y + 0.06],
    [41.5, y + 0.06], [42.6, y + 0.02], [43.4, y - 0.4],
  ].reverse().map(([r, h]) => new THREE.Vector2(r, h));
  const lathe = new THREE.LatheGeometry(prof, 160);
  lathe.translate(PIT.cx, 0, PIT.cz);
  return lathe;
}

export function annulusTrimesh(rIn, rOut, y, segments = 64) {
  const verts = [];
  const idx = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    for (const r of [rIn, rOut]) verts.push(PIT.cx + Math.sin(a) * r, y, PIT.cz - Math.cos(a) * r);
  }
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
  }
  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}

export function wallTrimesh(r, y0, y1, segments = 72, rows = 4) {
  const verts = [];
  const idx = [];
  for (let k = 0; k <= rows; k++) {
    const y = y0 + ((y1 - y0) * k) / rows;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      verts.push(PIT.cx + Math.sin(a) * r, y, PIT.cz - Math.cos(a) * r);
    }
  }
  for (let k = 0; k < rows; k++) {
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      const a = k * segments + i;
      const b = k * segments + j;
      const c = (k + 1) * segments + i;
      const d = (k + 1) * segments + j;
      idx.push(a, b, c, c, b, d);
    }
  }
  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}

export function buildDrone() {
  const body = new Parts(() => 0.5);
  const glow = new Parts(() => 0.5);
  const shell = new THREE.LatheGeometry([
    [0, -0.42], [0.45, -0.4], [0.86, -0.3], [1.1, -0.12], [1.16, 0.02], [1.08, 0.16], [0.84, 0.3], [0.46, 0.4], [0, 0.44],
  ].map(([a, b]) => new THREE.Vector2(a, b)), 48);
  body.add(shell, { color: '#f4f6fb' });
  body.add(new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), { color: '#1a1d26', pos: [0, 0.36, 0], scale: [1, 0.5, 1] });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const px = Math.cos(a) * 1.45;
    const pz = Math.sin(a) * 1.45;
    body.add(new THREE.CapsuleGeometry(0.07, 0.75, 4, 8), { color: '#dfe3ec', pos: [Math.cos(a) * 1.0, 0.08, Math.sin(a) * 1.0], rot: [Math.PI / 2, -a + Math.PI / 2, 0] });
    body.add(new THREE.TorusGeometry(0.42, 0.075, 8, 28), { color: '#f4f6fb', pos: [px, 0.12, pz], rot: [Math.PI / 2, 0, 0] });
    body.add(new THREE.CylinderGeometry(0.38, 0.38, 0.015, 24), { color: '#5b6070', pos: [px, 0.14, pz] });
    body.add(new THREE.CylinderGeometry(0.08, 0.1, 0.16, 10), { color: '#1a1d26', pos: [px, 0.16, pz] });
    glow.add(new THREE.TorusGeometry(0.43, 0.02, 6, 28), { color: '#5ce1e6', pos: [px, 0.05, pz], rot: [Math.PI / 2, 0, 0] });
  }
  body.add(new THREE.SphereGeometry(0.28, 20, 14), { color: '#11131a', pos: [0, -0.38, 0.62] });
  glow.add(new THREE.TorusGeometry(1.15, 0.035, 6, 64), { color: '#ff5fa2', pos: [0, 0.03, 0], rot: [Math.PI / 2, 0, 0] });
  glow.add(new THREE.TorusGeometry(0.27, 0.04, 8, 24), { color: '#ff5fa2', pos: [0, -0.4, 0.66], rot: [0.5, 0, 0] });
  glow.add(new THREE.SphereGeometry(0.13, 14, 10), { color: '#ffd1e6', pos: [0, -0.43, 0.82] });
  return { body: body.build(), glow: glow.build() };
}
