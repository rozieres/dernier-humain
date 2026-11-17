import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const col = new THREE.Color();

export function composeMatrix({ pos = [0, 0, 0], rot = [0, 0, 0], scale = 1, quat = null, order = 'XYZ' } = {}) {
  tmpP.fromArray(pos);
  if (quat) tmpQ.copy(quat);
  else tmpQ.setFromEuler(tmpE.set(rot[0], rot[1], rot[2], order));
  if (typeof scale === 'number') tmpS.setScalar(scale);
  else tmpS.fromArray(scale);
  return new THREE.Matrix4().compose(tmpP, tmpQ, tmpS);
}

function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

export function noise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), ux), l(c(0, 1, 0), c(1, 1, 0), ux), uy),
    l(l(c(0, 0, 1), c(1, 0, 1), ux), l(c(0, 1, 1), c(1, 1, 1), ux), uy),
    uz,
  ) * 2 - 1;
}

export function fbm3(x, y, z, oct = 3) {
  let a = 0.5;
  let s = 0;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * noise3(x * f, y * f, z * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}

export function prepare(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

export class Kit {
  constructor(rand = Math.random) {
    this.parts = [];
    this.rand = rand;
  }

  add(geo, { pos, rot, scale, quat, matrix, color = '#ffffff', vary = 0, order } = {}) {
    const g = prepare(geo);
    g.applyMatrix4(matrix || composeMatrix({ pos, rot, scale, quat, order }));
    const n = g.attributes.position.count;
    if (!g.attributes.color) {
      col.set(color);
      if (vary) col.multiplyScalar(1 + (this.rand() - 0.5) * 2 * vary);
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.toArray(arr, i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    this.parts.push(g);
    return g;
  }

  merge(other) {
    for (const p of other.parts) this.parts.push(p);
  }

  get empty() {
    return this.parts.length === 0;
  }

  build() {
    const g = mergeGeometries(this.parts);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export function sweep(points, radii, { radial = 14, capStart = false, capEnd = true, flatten = 1, up = new THREE.Vector3(0, 0, 1) } = {}) {
  const n = points.length;
  const tangents = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    tangents.push(new THREE.Vector3().subVectors(b, a).normalize());
  }
  const normals = [];
  const binormals = [];
  let normal = new THREE.Vector3().crossVectors(tangents[0], up);
  if (normal.lengthSq() < 1e-6) normal = new THREE.Vector3().crossVectors(tangents[0], new THREE.Vector3(1, 0, 0));
  normal.normalize();
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const axis = new THREE.Vector3().crossVectors(tangents[i - 1], tangents[i]);
      const s = axis.length();
      if (s > 1e-6) {
        axis.divideScalar(s);
        const ang = Math.acos(THREE.MathUtils.clamp(tangents[i - 1].dot(tangents[i]), -1, 1));
        normal = normal.clone().applyAxisAngle(axis, ang);
      } else normal = normal.clone();
    }
    normals.push(normal);
    binormals.push(new THREE.Vector3().crossVectors(tangents[i], normal).normalize());
  }
  const pos = [];
  const idx = [];
  const ring = radial + 1;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const r = radii[i];
      const c = Math.cos(a) * r;
      const s = Math.sin(a) * r * flatten;
      pos.push(
        points[i].x + normals[i].x * c + binormals[i].x * s,
        points[i].y + normals[i].y * c + binormals[i].y * s,
        points[i].z + normals[i].z * c + binormals[i].z * s,
      );
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ring + j;
      const b = a + ring;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const cap = (i, dir) => {
    const center = pos.length / 3;
    pos.push(points[i].x + tangents[i].x * 0.001 * dir, points[i].y + tangents[i].y * 0.001 * dir, points[i].z + tangents[i].z * 0.001 * dir);
    for (let j = 0; j < radial; j++) {
      const a = i * ring + j;
      if (dir > 0) idx.push(a, a + 1, center);
      else idx.push(a + 1, a, center);
    }
  };
  if (capEnd) cap(n - 1, 1);
  if (capStart) cap(0, -1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function rockGeometry({ seed = 1, detail = 2, scale = [1, 1, 1], rough = 0.28, freq = 1.6 } = {}) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm3(v.x * freq + seed * 3.1, v.y * freq + seed, v.z * freq - seed * 1.7, 3);
    v.multiplyScalar(1 + n * rough);
    v.set(v.x * scale[0], v.y * scale[1], v.z * scale[2]);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function slabGeometry({ seed = 1, half = 1.4, power = 4, depth = 3.2, segs = 28, rough = 0.08, colors = { top: '#cbc2cf', side: '#a89fb2', bottom: '#6f6680' } } = {}) {
  const levels = [
    [0, 0.97], [-0.1, 1.02], [-0.32, 1.0], [-0.7, 0.9], [-1.3, 0.74], [-2.0, 0.52], [-2.7, 0.3],
  ];
  const ring = segs + 1;
  const pos = [];
  const idx = [];
  const shape = (a) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const k = (Math.abs(c) ** power + Math.abs(s) ** power) ** (-1 / power);
    return [c * k, s * k];
  };
  for (let l = 0; l < levels.length; l++) {
    const [y, sc] = levels[l];
    const yy = y * (depth / 3.2);
    for (let j = 0; j <= segs; j++) {
      const a = ((j % segs) / segs) * Math.PI * 2;
      const [x, z] = shape(a);
      const n = 1 + fbm3(x * 1.3 + seed, yy * 0.9, z * 1.3 - seed, 3) * rough * (l === 0 ? 0.4 : 1 + l * 0.4);
      pos.push(x * half * sc * n, yy + (l === 0 ? 0 : fbm3(x + seed, z, l, 2) * 0.12), z * half * sc * n);
    }
  }
  for (let l = 0; l < levels.length - 1; l++) {
    for (let j = 0; j < segs; j++) {
      const a = l * ring + j;
      const b = a + ring;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const tip = pos.length / 3;
  pos.push(fbm3(seed, 0, 0) * 0.3, -depth * 0.98, fbm3(0, seed, 0) * 0.3);
  const last = (levels.length - 1) * ring;
  for (let j = 0; j < segs; j++) idx.push(last + j, last + j + 1, tip);
  const side = new THREE.BufferGeometry();
  side.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  side.setIndex(idx);
  side.computeVertexNormals();

  const top = [];
  const tIdx = [];
  top.push(0, 0.02, 0);
  for (let j = 0; j <= segs; j++) top.push(pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]);
  for (let j = 0; j < segs; j++) tIdx.push(0, j + 2, j + 1);
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
  cap.setIndex(tIdx);
  cap.computeVertexNormals();
  const g = mergeGeometries([prepare(side), prepare(cap)]);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  const cTop = new THREE.Color(colors.top);
  const mid = new THREE.Color(colors.side);
  const low = new THREE.Color(colors.bottom);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > -0.04) c.copy(cTop);
    else c.copy(mid).lerp(low, Math.min(1, -y / depth));
    c.toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function heightRibbon(points, width, heightAt, lift = 0.03) {
  const pos = [];
  const idx = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const w = width * (points[i][2] ?? 1);
    for (const s of [-1, 1]) {
      const x = points[i][0] - dz * w * 0.5 * s;
      const z = points[i][1] + dx * w * 0.5 * s;
      pos.push(x, heightAt(x, z) + lift, z);
    }
    if (i > 0) {
      const o = (i - 1) * 2;
      idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
