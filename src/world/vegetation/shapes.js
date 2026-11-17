import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise2, seeded } from '../../core/rng.js';

const n1 = makeNoise2(911);
const n2 = makeNoise2(377);
const n3 = (x, y, z) => n1(x + z * 0.71, y - z * 0.37) * 0.6 + n2(y + x * 0.43, z + y * 0.29) * 0.4;

function finish(g) {
  const out = g.index ? g : mergeVertices(g, 1e-4);
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

function clean(g) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  return g.index ? g.toNonIndexed() : g;
}

function lump(geo, center, radius, amount, freq, seed, { squashY = 1, flatBottom = -Infinity } = {}) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const nrm = [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const d = 1 + amount * n3(v.x * freq + seed, v.y * freq - seed, v.z * freq + seed * 0.5);
    const x = v.x * radius * d;
    let y = v.y * radius * d * squashY;
    const z = v.z * radius * d;
    if (y < flatBottom * radius) y = flatBottom * radius + (y - flatBottom * radius) * 0.25;
    p.setXYZ(i, center.x + x, center.y + y, center.z + z);
    nrm.push(v.x, v.y / squashY, v.z);
  }
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return geo;
}

function softNormals(geo, center, blend) {
  geo.deleteAttribute('normal');
  const g = mergeVertices(geo, 1e-4);
  g.computeVertexNormals();
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    s.fromBufferAttribute(p, i).sub(center).normalize();
    v.fromBufferAttribute(n, i).lerp(s, blend).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

export function trunkGeometry({ radial = 7, rings = 6, height = 1, r0 = 0.05, r1 = 0.022, bend = 0.06, flare = 0.03 } = {}) {
  const pos = [];
  const nor = [];
  const idx = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const y = t * height;
    const r = r0 + (r1 - r0) * Math.pow(t, 0.8) + flare * Math.pow(1 - t, 6);
    const ox = bend * Math.sin(t * 2.2) * t;
    const oz = bend * 0.5 * Math.sin(t * 3.1 + 1) * t;
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(ox + c * r, y, oz + s * r);
      nor.push(c, 0.15, s);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < radial; i++) {
      const a = j * (radial + 1) + i;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.normalizeNormals();
  return finish(g);
}

function branch(from, to, r0, r1, radial) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1, true).translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyQuaternion(q).translate(from.x, from.y, from.z);
  return clean(g);
}

// Broadleaf crown: unit tree is 1 m tall, crown centred near y = 0.68.
// One closed shell wrapped around the smooth union of the lobes (no hidden inner faces), so the
// triangles go into curvature instead of overlapping spheres.
export function broadleafCrown(detail, lobes, seed = 1) {
  const r = seeded(seed);
  const center = new THREE.Vector3(0, 0.64, 0);
  const balls = [];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + r() * 0.8;
    const d = i === 0 ? 0 : 0.15 + r() * 0.06;
    const c = new THREE.Vector3(Math.cos(a) * d, 0.62 + (i === 0 ? 0.06 : (r() - 0.55) * 0.16), Math.sin(a) * d);
    balls.push({ c: c.sub(center), r: i === 0 ? 0.29 : 0.18 + r() * 0.05 });
  }
  const g = new THREE.IcosahedronGeometry(1, [1, 3, 4][Math.min(detail, 2)]);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-4);
  const p = m.attributes.position;
  const v = new THREE.Vector3();
  const K = 19;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let sum = 0;
    for (const b of balls) {
      const along = v.dot(b.c);
      const disc = b.r * b.r - (b.c.lengthSq() - along * along);
      if (disc <= 0) continue;
      const t = along + Math.sqrt(disc);
      if (t > 0) sum += Math.exp(K * t);
    }
    let rad = sum > 0 ? Math.log(sum) / K : 0.2;
    rad *= 1 + 0.09 * n3(v.x * 1.8 + seed, v.y * 1.8 - seed, v.z * 1.8 + seed * 0.5) + 0.03 * n3(v.x * 3.4 - seed, v.y * 3.4, v.z * 3.4 + seed);
    let y = v.y * rad * 0.88;
    if (y < -0.16) y = -0.16 + (y + 0.16) * 0.3;
    p.setXYZ(i, center.x + v.x * rad, center.y + y, center.z + v.z * rad);
  }
  m.computeVertexNormals();
  const n = m.attributes.normal;
  const s = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    s.fromBufferAttribute(p, i).sub(center).normalize();
    v.fromBufferAttribute(n, i).lerp(s, 0.4).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return finish(m);
}

export function cloneCrown(detail) {
  const g = new THREE.IcosahedronGeometry(0.27, detail).translate(0, 0.7, 0);
  return finish(clean(g));
}

// Conifer: unit tree 1 m tall, layered drooping cones.
export function coniferCrown(radial, layers, seed = 3) {
  const r = seeded(seed);
  const parts = [];
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const y0 = 0.16 + t * 0.62;
    const h = 0.34 - t * 0.12;
    const rad = 0.2 * (1 - t * 0.78) + 0.02;
    const g = new THREE.ConeGeometry(rad, h, radial, 2, true);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k);
      const y = p.getY(k);
      const z = p.getZ(k);
      const rr = Math.hypot(x, z);
      if (rr > 1e-4) {
        const a = Math.atan2(z, x);
        const jag = 1 + 0.18 * Math.sin(a * radial * 0.5 + i * 1.7) * (rr / rad) + 0.08 * (r() - 0.5);
        const u = rr / rad;
        p.setXYZ(k, x * jag, y - u * u * 0.06, z * jag);
      }
    }
    g.translate(0, y0 + h / 2, 0);
    g.rotateY(r() * Math.PI);
    parts.push(clean(g));
  }
  return finish(softNormals(mergeGeometries(parts), new THREE.Vector3(0, 0.35, 0), 0.45));
}

export function deadTree(radial, seed = 5) {
  const r = seeded(seed);
  const parts = [clean(trunkGeometry({ radial, rings: 4, r0: 0.04, r1: 0.012, bend: 0.08 }))];
  const top = new THREE.Vector3(0.05, 1, 0);
  for (let i = 0; i < 5; i++) {
    const y = 0.42 + i * 0.12;
    const a = i * 2.4 + r();
    const from = new THREE.Vector3(Math.sin(y * 2.2) * 0.06 * y, y, 0);
    const to = from.clone().add(new THREE.Vector3(Math.cos(a) * (0.32 - i * 0.04), 0.18 + r() * 0.12, Math.sin(a) * (0.32 - i * 0.04)));
    parts.push(branch(from, to, 0.016 - i * 0.002, 0.004, Math.max(3, radial - 2)));
    const mid = from.clone().lerp(to, 0.6);
    const tip = mid.clone().add(new THREE.Vector3(Math.cos(a + 1) * 0.1, 0.12, Math.sin(a + 1) * 0.1));
    parts.push(branch(mid, tip, 0.006, 0.002, 3));
  }
  parts.push(branch(new THREE.Vector3(0.05, 0.95, 0), top.add(new THREE.Vector3(0.02, 0.1, 0.03)), 0.012, 0.003, 3));
  return finish(mergeGeometries(parts));
}

export function shrubGeometry(detail, seed = 7) {
  const r = seeded(seed);
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Vector3((r() - 0.5) * 0.5, 0.32 + r() * 0.1, (r() - 0.5) * 0.5);
    parts.push(clean(lump(new THREE.IcosahedronGeometry(1, detail), c, 0.4 + r() * 0.15, 0.3, 2.5, seed + i * 5.1, { squashY: 0.75, flatBottom: -0.55 })));
  }
  return finish(softNormals(mergeGeometries(parts), new THREE.Vector3(0, 0.3, 0), 0.6));
}

export function rockGeometry(detail, seed = 9) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = 1 + 0.28 * n3(v.x * 1.3 + seed, v.y * 1.3, v.z * 1.3 - seed) + 0.08 * n3(v.x * 4 - seed, v.y * 4, v.z * 4);
    let y = v.y * d * 0.62;
    if (y < -0.25) y = -0.25 + (y + 0.25) * 0.3;
    const cut = Math.max(0, v.x * 0.6 + v.z * 0.8 - 0.55);
    p.setXYZ(i, v.x * d * (1 - cut * 0.5), y, v.z * d * (1 - cut * 0.4));
  }
  const m = mergeVertices(clean(g), 1e-3);
  m.computeVertexNormals();
  m.computeBoundingSphere();
  m.computeBoundingBox();
  return m;
}
