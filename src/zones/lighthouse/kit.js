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

export const PI = Math.PI;
export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const nz = (x, y, z, k = 1) => noise2(x * k + z * 0.71 * k + 11.3, y * k - z * 1.13 * k + 4.1);

export class Builder {
  constructor(seed = 1) {
    this.items = [];
    this.r = seeded(seed);
  }

  add(geo, { color = '#ffffff', pos, rot, scale, matrix, jitter = 0, vary = 0.1, uvScale, worldUV, shade } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const local = shade ? g.attributes.position.array.slice() : null;
    if (matrix) g.applyMatrix4(matrix);
    else {
      _s.set(1, 1, 1);
      if (scale !== undefined) _s.fromArray(Array.isArray(scale) ? scale : [scale, scale, scale]);
      _m.compose(pos ? _v.fromArray(pos) : _v.set(0, 0, 0), rot ? _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], rot[3] || 'XYZ')) : _q.identity(), _s);
      g.applyMatrix4(_m);
    }
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    const n = p.count;
    const col = new Float32Array(n * 3);
    const base = new THREE.Color(color);
    const shift = this.r() * 40;
    for (let i = 0; i < n; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      _c.copy(base).multiplyScalar(1 + vary * nz(x + shift, y, z, 5));
      if (shade) shade(_c, x, y, z, local[i * 3], local[i * 3 + 1], local[i * 3 + 2]);
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
      if (jitter) p.setXYZ(i, x + jitter * nz(x, y, z, 7), y + jitter * nz(x + 7, y, z, 7), z + jitter * nz(x, y + 3, z + 5, 7));
      if (uvScale) uv.setXY(i, uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1]);
    }
    if (jitter) g.computeVertexNormals();
    if (worldUV) {
      const nrm = g.attributes.normal;
      for (let i = 0; i < n; i++) {
        const ax = Math.abs(nrm.getX(i));
        const ay = Math.abs(nrm.getY(i));
        const az = Math.abs(nrm.getZ(i));
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        if (ay >= ax && ay >= az) uv.setXY(i, x / worldUV, z / worldUV);
        else if (ax >= az) uv.setXY(i, z / worldUV, y / worldUV);
        else uv.setXY(i, x / worldUV, y / worldUV);
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.items.push(g);
    geo.dispose?.();
    return this;
  }

  box(w, h, d, { radius = 0.02, segments = 1, ...o } = {}) {
    return this.add(new RoundedBoxGeometry(w, h, d, segments, Math.max(0.0005, Math.min(radius, w / 2.01, h / 2.01, d / 2.01))), o);
  }

  cyl(rt, rb, h, { seg = 12, ...o } = {}) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), o);
  }

  get empty() {
    return this.items.length === 0;
  }

  build() {
    const g = mergeGeometries(this.items, false);
    for (const i of this.items) i.dispose();
    this.items = [];
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

export function lathe(points, segments = 32, phi = 0, length = PI * 2) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(Math.max(0, x), y)), segments, phi, length);
}

export function canvasTex(w, h, draw, { repeat = true, srgb = true } = {}) {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  draw(el.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(el);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

function speckle(c, w, h, r, count, colors, size = 1.4) {
  for (let i = 0; i < count; i++) {
    c.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = 0.4 + r() * size;
    const x = r() * w;
    const y = r() * h;
    c.fillRect(x, y, s, s * (0.6 + r() * 0.8));
  }
}

function blotches(c, w, h, r, count, tones, rad = [20, 90]) {
  for (let i = 0; i < count; i++) {
    const x = r() * w;
    const y = r() * h;
    const rr = rad[0] + r() * (rad[1] - rad[0]);
    const g = c.createRadialGradient(x, y, 1, x, y, rr);
    g.addColorStop(0, tones[Math.floor(r() * tones.length)]);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      if (x + ox + rr < 0 || x + ox - rr > w || y + oy + rr < 0 || y + oy - rr > h) continue;
      c.save();
      c.translate(ox, oy);
      c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      c.restore();
    }
  }
}

const GRANITE_DOTS = ['rgba(30,28,30,0.55)', 'rgba(255,250,240,0.5)', 'rgba(190,150,130,0.45)', 'rgba(90,86,84,0.5)'];

export function graniteTexture(seed = 'granite') {
  const r = seeded(seed);
  return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = '#b8b3aa';
    c.fillRect(0, 0, w, h);
    blotches(c, w, h, r, 60, ['rgba(255,255,255,0.1)', 'rgba(40,40,44,0.12)', 'rgba(150,120,90,0.1)']);
    speckle(c, w, h, r, 16000, GRANITE_DOTS, 1.8);
  });
}

export function ashlarTexture(seed = 'ashlar', { rows = 8, cols = 4, mortar = 'rgba(70,64,58,0.75)', base = '#bdb7ac' } = {}) {
  const r = seeded(seed);
  return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    const rh = h / rows;
    for (let i = 0; i < rows; i++) {
      const off = (i % 2) * 0.5 + (r() - 0.5) * 0.2;
      const cw = w / cols;
      for (let j = -1; j <= cols; j++) {
        const x0 = (j + off) * cw;
        const tone = 0.86 + r() * 0.24;
        const warm = r() * 14;
        c.fillStyle = `rgb(${Math.round(189 * tone + warm)},${Math.round(183 * tone + warm * 0.6)},${Math.round(172 * tone)})`;
        c.beginPath();
        c.roundRect(x0 + 2, i * rh + 2, cw - 4, rh - 4, 5);
        c.fill();
      }
    }
    speckle(c, w, h, r, 14000, GRANITE_DOTS, 1.6);
    c.strokeStyle = mortar;
    c.lineWidth = 3;
    for (let i = 0; i <= rows; i++) {
      c.beginPath();
      c.moveTo(0, i * rh);
      for (let x = 0; x <= w; x += 16) c.lineTo(x, i * rh + (r() - 0.5) * 2);
      c.stroke();
    }
    for (let i = 0; i < rows; i++) {
      const off = (i % 2) * 0.5;
      for (let j = 0; j <= cols; j++) {
        const x = (j + off) * (w / cols) + (r() - 0.5) * 6;
        c.beginPath();
        c.moveTo(x, i * rh);
        c.lineTo(x + (r() - 0.5) * 4, (i + 1) * rh);
        c.stroke();
      }
    }
    blotches(c, w, h, r, 40, ['rgba(40,50,30,0.18)', 'rgba(255,255,255,0.08)', 'rgba(120,90,60,0.12)'], [30, 110]);
  });
}

export function rubbleTexture(seed = 'rubble') {
  const r = seeded(seed);
  return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = '#5c5650';
    c.fillRect(0, 0, w, h);
    let y = 0;
    while (y < h) {
      const rowH = 26 + r() * 30;
      let x = -r() * 40;
      while (x < w) {
        const sw = 34 + r() * 60;
        const tone = 0.75 + r() * 0.35;
        c.fillStyle = `rgb(${Math.round(176 * tone + r() * 12)},${Math.round(170 * tone)},${Math.round(160 * tone)})`;
        c.beginPath();
        c.ellipse(x + sw / 2, y + rowH / 2, sw / 2 - 2, rowH / 2 - 2, (r() - 0.5) * 0.2, 0, PI * 2);
        c.fill();
        if (x + sw > w) {
          c.beginPath();
          c.ellipse(x + sw / 2 - w, y + rowH / 2, sw / 2 - 2, rowH / 2 - 2, 0, 0, PI * 2);
          c.fill();
        }
        x += sw;
      }
      y += rowH;
    }
    speckle(c, w, h, r, 12000, GRANITE_DOTS, 1.5);
    blotches(c, w, h, r, 30, ['rgba(60,80,40,0.2)', 'rgba(230,220,190,0.12)'], [30, 120]);
  });
}

export function slateTexture(seed = 'slate') {
  const r = seeded(seed);
  return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = '#2c3036';
    c.fillRect(0, 0, w, h);
    const rows = 12;
    const rh = h / rows;
    for (let i = 0; i < rows; i++) {
      const cols = 8;
      const cw = w / cols;
      const off = (i % 2) * cw * 0.5;
      for (let j = -1; j <= cols; j++) {
        const tone = 0.75 + r() * 0.4;
        c.fillStyle = `rgb(${Math.round(78 * tone)},${Math.round(84 * tone)},${Math.round(94 * tone)})`;
        const x0 = j * cw + off + (r() - 0.5) * 3;
        c.beginPath();
        c.moveTo(x0 + 1.5, i * rh);
        c.lineTo(x0 + cw - 1.5, i * rh);
        c.lineTo(x0 + cw - 2, (i + 1) * rh - 1);
        c.quadraticCurveTo(x0 + cw / 2, (i + 1) * rh + 3, x0 + 2, (i + 1) * rh - 1);
        c.fill();
        if (r() < 0.25) {
          c.fillStyle = `rgba(${150 + r() * 60},${150 + r() * 50},90,${0.15 + r() * 0.25})`;
          c.beginPath();
          c.arc(x0 + r() * cw, i * rh + r() * rh, 3 + r() * 9, 0, PI * 2);
          c.fill();
        }
      }
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(0, (i + 1) * rh - 3, w, 3);
    }
    speckle(c, w, h, r, 5000, ['rgba(255,255,255,0.08)', 'rgba(0,0,0,0.18)'], 1.2);
  });
}

export function plasterTexture(seed = 'plaster') {
  const r = seeded(seed);
  return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = '#efe8da';
    c.fillRect(0, 0, w, h);
    blotches(c, w, h, r, 70, ['rgba(180,160,120,0.06)', 'rgba(255,255,255,0.18)', 'rgba(140,120,100,0.04)'], [20, 120]);
    speckle(c, w, h, r, 4000, ['rgba(120,100,80,0.12)', 'rgba(255,255,255,0.2)'], 1.2);
  });
}

export function plankTexture(seed = 'planks', { boards = 6, base = '#c9bdaa' } = {}) {
  const r = seeded(seed);
  return canvasTex(512, 512, (c, w, h) => {
    const bh = h / boards;
    for (let i = 0; i < boards; i++) {
      const tone = 0.82 + r() * 0.3;
      const b = new THREE.Color(base).multiplyScalar(tone);
      c.fillStyle = `#${b.getHexString()}`;
      c.fillRect(0, i * bh, w, bh);
      for (let k = 0; k < 26; k++) {
        const y0 = i * bh + r() * bh;
        const amp = 0.5 + r() * 2.5;
        const ph = r() * 6;
        c.strokeStyle = `rgba(${r() < 0.7 ? '70,45,25' : '255,240,220'},${(0.05 + r() * 0.14).toFixed(3)})`;
        c.lineWidth = 0.6 + r() * 1.8;
        c.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const y = Math.min(i * bh + bh - 1, Math.max(i * bh + 1, y0 + Math.sin(x * 0.02 + ph) * amp));
          if (x === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }
      const cut = r() * w;
      c.fillStyle = 'rgba(40,25,12,0.55)';
      c.fillRect(cut, i * bh, 2, bh);
      c.fillStyle = 'rgba(30,18,8,0.6)';
      c.fillRect(0, i * bh, w, 2);
    }
    speckle(c, w, h, r, 2500, ['rgba(40,25,10,0.15)', 'rgba(255,255,255,0.1)'], 1.2);
  });
}

export function clothTexture(seed = 'cloth') {
  const r = seeded(seed);
  return canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#d8d2c6';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 3) {
      c.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`;
      c.fillRect(i, 0, 1, h);
      c.fillRect(0, i, w, 1);
    }
    speckle(c, w, h, r, 1500, ['rgba(255,255,255,0.12)', 'rgba(0,0,0,0.1)'], 1.2);
  });
}
