import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seeded } from '../../core/rng.js';

const PI = Math.PI;

export function resample(points, step = 1) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const n = Math.max(2, Math.round(curve.getLength() / step));
  return curve.getSpacedPoints(n);
}

export function ribbon(world, samples, { width, cols = 4, lift = 0.05, edgeAttr = false, colorFn }) {
  const pos = [];
  const uv = [];
  const edge = [];
  const col = [];
  const idx = [];
  const t = new THREE.Vector3();
  let dist = 0;
  const c = new THREE.Color();
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    const a = samples[Math.max(0, i - 1)];
    const b = samples[Math.min(samples.length - 1, i + 1)];
    t.subVectors(b, a).setY(0).normalize();
    if (i > 0) dist += p.distanceTo(samples[i - 1]);
    const w = width(i / (samples.length - 1), p, dist);
    for (let k = 0; k < cols; k++) {
      const f = k / (cols - 1);
      const off = (f - 0.5) * w;
      const x = p.x - t.z * off;
      const z = p.z + t.x * off;
      pos.push(x, world.heightAt(x, z) + lift, z);
      uv.push(f, dist);
      if (edgeAttr) edge.push(Math.abs(f - 0.5) * 2);
      if (colorFn) {
        colorFn(c, x, z, f);
        col.push(c.r, c.g, c.b);
      }
    }
    if (i > 0) {
      const r0 = (i - 1) * cols;
      const r1 = i * cols;
      for (let k = 0; k < cols - 1; k++) idx.push(r0 + k, r0 + k + 1, r1 + k, r0 + k + 1, r1 + k + 1, r1 + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (edgeAttr) g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  if (colorFn) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function fernGeometry(seed = 1) {
  const r = seeded(`fern${seed}`);
  const parts = [];
  const fronds = 6;
  for (let f = 0; f < fronds; f++) {
    const len = 0.55 + r() * 0.35;
    const rows = 5;
    const pos = [];
    const col = [];
    const idx = [];
    const bend = 0.5 + r() * 0.35;
    for (let j = 0; j <= rows; j++) {
      const t = j / rows;
      const along = t * len;
      const y = Math.sin(t * PI * bend) * 0.42 * len - t * t * 0.12;
      const w = (j % 2 ? 0.11 : 0.15) * (1 - t * 0.85) * (t < 0.08 ? 0.3 : 1);
      for (const s of [-1, 0, 1]) {
        pos.push(s * w, y + (s === 0 ? 0.02 : -0.015), along);
        const k = 0.55 + 0.45 * t;
        col.push(0.16 * k, 0.32 * k, 0.14 * k);
      }
      if (j > 0) {
        const a = (j - 1) * 3;
        const b = j * 3;
        idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.rotateY((f / fronds) * PI * 2 + r() * 0.5);
    parts.push(g.toNonIndexed());
  }
  const m = mergeGeometries(parts);
  m.computeVertexNormals();
  return m;
}

export function mushroomGeometry() {
  const parts = [];
  const r = seeded('mush');
  for (let k = 0; k < 3; k++) {
    const h = 0.07 + r() * 0.1;
    const cap = 0.04 + r() * 0.05;
    const stem = new THREE.CylinderGeometry(cap * 0.22, cap * 0.3, h, 5);
    stem.translate(0, h / 2, 0);
    const pts = [];
    for (let i = 0; i <= 3; i++) {
      const a = (i / 3) * PI * 0.5;
      pts.push(new THREE.Vector2(Math.sin(a) * cap + 0.001, Math.cos(a) * cap * 0.55));
    }
    const top = new THREE.LatheGeometry(pts.reverse(), 7);
    top.translate(0, h, 0);
    const ox = (r() - 0.5) * 0.2;
    const oz = (r() - 0.5) * 0.2;
    const tilt = (r() - 0.5) * 0.3;
    for (const [g, color] of [[stem, [0.78, 0.74, 0.62]], [top, [0.62, 0.38, 0.2]]]) {
      g.rotateZ(tilt);
      g.translate(ox, 0, oz);
      const n = g.index ? g.toNonIndexed() : g;
      n.deleteAttribute('uv');
      const c = new Float32Array(n.attributes.position.count * 3);
      for (let i = 0; i < c.length; i += 3) c.set(color, i);
      n.setAttribute('color', new THREE.BufferAttribute(c, 3));
      parts.push(n);
    }
  }
  const m = mergeGeometries(parts);
  m.computeVertexNormals();
  return m;
}

export function windSway(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uWind;\nuniform float uTime;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 swayBase = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
      #else
        vec3 swayBase = vec3(0.0);
      #endif
      float swayK = max(transformed.y, 0.0);
      float swayP = uTime * 1.3 + swayBase.x * 0.37 + swayBase.z * 0.29;
      transformed.xz += vec2(uWind.x, uWind.y) * (0.03 + 0.02 * sin(swayP)) * uWind.z * swayK * swayK * 2.0;`);
}
