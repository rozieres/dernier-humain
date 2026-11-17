import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { noise2, seeded } from '../../core/rng.js';

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _f = new THREE.Matrix4();

export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function metalMask(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aMetal;\nvarying float vMetal;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMetal = aMetal;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vMetal;')
    .replace(
      '#include <metalnessmap_fragment>',
      '#include <metalnessmap_fragment>\nmetalnessFactor = vMetal;\nroughnessFactor = clamp(roughnessFactor * mix(1.0, 0.55, vMetal), 0.05, 1.0);',
    );
}

export function canvasTexture(w, h, draw, { repeat = true, srgb = true, anisotropy = 8 } = {}) {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  draw(el.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(el);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function speckle(c, w, h, r, { count, light = '255,255,255', dark = '0,0,0', size = 1.6, alpha = 0.16 }) {
  for (let i = 0; i < count; i++) {
    const x = r() * w;
    const y = r() * h;
    const s = (0.3 + r() * size) * (r() < 0.05 ? 2.2 : 1);
    c.fillStyle = `rgba(${r() < 0.5 ? light : dark},${(r() * alpha).toFixed(3)})`;
    c.beginPath();
    c.arc(x, y, s, 0, Math.PI * 2);
    c.fill();
    if (x < s) c.fillRect(x + w, y, s, s);
    if (y < s) c.fillRect(x, y + h, s, s);
  }
}

export function woodTexture(seed = 'wood', { w = 512, h = 256 } = {}) {
  const r = seeded(seed);
  return canvasTexture(w, h, (c) => {
    c.fillStyle = '#c8c0b6';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const y0 = r() * h;
      const amp = 1 + r() * 4;
      const f = 0.004 + r() * 0.01;
      const ph = r() * 6;
      c.strokeStyle = `rgba(${r() < 0.7 ? '60,40,24' : '255,246,230'},${(0.05 + r() * 0.17).toFixed(3)})`;
      c.lineWidth = 0.5 + r() * 2.2;
      c.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = y0 + Math.sin(x * f * 6.283 + ph) * amp;
        if (x === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
    for (let k = 0; k < 2; k++) {
      const kx = r() * w;
      const ky = h * (0.2 + 0.6 * r());
      for (let i = 5; i > 0; i--) {
        c.strokeStyle = `rgba(55,34,18,${0.1 + (5 - i) * 0.05})`;
        c.lineWidth = 1.4;
        c.beginPath();
        c.ellipse(kx, ky, i * 5, i * 2.6, 0, 0, Math.PI * 2);
        c.stroke();
      }
    }
    speckle(c, w, h, r, { count: 700, size: 1.2, alpha: 0.2 });
  });
}

export function stoneTexture(seed = 'stone', size = 256) {
  const r = seeded(seed);
  return canvasTexture(size, size, (c, w, h) => {
    c.fillStyle = '#b9b6b0';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const g = c.createRadialGradient(r() * w, r() * h, 2, r() * w, r() * h, 50 + r() * 70);
      g.addColorStop(0, `rgba(${r() < 0.5 ? '255,255,255' : '40,40,44'},0.07)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
    speckle(c, w, h, r, { count: 5200, size: 1.5, alpha: 0.34 });
  });
}

export function plainTexture(seed = 'plain', size = 128, base = '#d8d4cc') {
  const r = seeded(seed);
  return canvasTexture(size, size, (c, w, h) => {
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    speckle(c, w, h, r, { count: 900, size: 1, alpha: 0.12 });
  });
}

export function nz(x, y, z, k = 1) {
  return noise2(x * k + z * 0.71 * k + 11.3, y * k - z * 1.13 * k + 4.1);
}

export class Parts {
  constructor(seed = 1) {
    this.items = [];
    this.r = seeded(seed);
  }

  add(geo, { color = '#ffffff', metal = 0, pos, rot, scale, frame, jitter = 0, vary = 0.12, uvScale, uvOffset } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    _s.set(1, 1, 1);
    if (scale) _s.fromArray(Array.isArray(scale) ? scale : [scale, scale, scale]);
    _m.compose(pos ? _v.fromArray(pos) : _v.set(0, 0, 0), rot ? _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])) : _q.identity(), _s);
    if (frame) _m.premultiply(_f.makeRotationFromEuler(_e.set(frame[0], frame[1], frame[2])));
    g.applyMatrix4(_m);
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    const n = p.count;
    const col = new Float32Array(n * 3);
    const met = new Float32Array(n).fill(metal);
    const base = new THREE.Color(color);
    const shift = this.r() * 40;
    for (let i = 0; i < n; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const v = 1 + vary * nz(x + shift, y, z, 5);
      _c.copy(base).multiplyScalar(v);
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
      if (jitter) p.setXYZ(i, x + jitter * nz(x, y, z, 9), y + jitter * nz(x + 7, y, z, 9), z + jitter * nz(x, y + 3, z + 5, 9));
      if (uvScale) uv.setXY(i, uv.getX(i) * uvScale[0] + (uvOffset?.[0] ?? 0), uv.getY(i) * uvScale[1] + (uvOffset?.[1] ?? 0));
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aMetal', new THREE.BufferAttribute(met, 1));
    this.items.push(g);
    return this;
  }

  box(w, h, d, { radius = 0.015, segments = 1, ...o } = {}) {
    return this.add(new RoundedBoxGeometry(w, h, d, segments, Math.min(radius, w / 2.01, h / 2.01, d / 2.01)), o);
  }

  build() {
    const g = mergeGeometries(this.items, false);
    for (const i of this.items) i.dispose();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

export function lathe(points, segments = 32) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
}

export function resolvePosition(pos, world, rest = 0) {
  const x = Array.isArray(pos) ? pos[0] : pos.x;
  const y = Array.isArray(pos) ? pos[1] : pos.y;
  const z = Array.isArray(pos) ? pos[2] : pos.z;
  return new THREE.Vector3(x, y === null || y === undefined ? world.heightAt(x, z) + rest : y, z);
}

export function impactHandler(ctx, entity, { hard = 5, volume = 1, gap = 140, min = 1.6 } = {}) {
  let last = 0;
  return (other, speed) => {
    if (speed < min) return;
    const now = performance.now();
    if (now - last < gap) return;
    last = now;
    ctx.audio.sfx(speed > hard ? 'impact.hard' : 'impact.soft', { position: entity.position, volume: Math.min(1, speed / 9) * volume });
  };
}
