import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noise2, seeded } from '../../core/rng.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export const nz = (x, y, z, k = 1) => noise2(x * k + z * 0.71 * k + 11.3, y * k - z * 1.13 * k + 4.1);

export class Builder {
  constructor(seed, extra = []) {
    this.items = [];
    this.r = seeded(seed);
    this.extra = extra;
    this.frame = new THREE.Matrix4();
    this.tags = {};
  }

  setFrame(x, y, z, yaw) {
    this.frame.compose(_v.set(x, y, z), _q.setFromAxisAngle(_s.set(0, 1, 0), yaw), _s.set(1, 1, 1));
    return this;
  }

  clearFrame() {
    this.frame.identity();
    return this;
  }

  add(geo, { color = '#ffffff', pos, rot, scale, vary = 0.12, jitter = 0, displace = 0, dk = 3, world = false, tags, colorFn } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const p = g.attributes.position;
    const n = p.count;
    if (displace) {
      g.computeVertexNormals();
      const nr = g.attributes.normal;
      const shift = this.r() * 50;
      for (let i = 0; i < n; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        const d = displace * (nz(x + shift, y, z, dk) + 0.5 * nz(x, y + shift, z, dk * 2.3));
        p.setXYZ(i, x + nr.getX(i) * d, y + nr.getY(i) * d, z + nr.getZ(i) * d);
      }
    }
    _s.set(1, 1, 1);
    if (scale !== undefined) _s.fromArray(Array.isArray(scale) ? scale : [scale, scale, scale]);
    _m.compose(pos ? _v.fromArray(pos) : _v.set(0, 0, 0), rot ? _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], rot[3] || 'XYZ')) : _q.identity(), _s);
    if (!world) _m.premultiply(this.frame);
    g.applyMatrix4(_m);
    if (displace) g.computeVertexNormals();
    const col = new Float32Array(n * 3);
    const base = new THREE.Color(color);
    const shift = this.r() * 40;
    for (let i = 0; i < n; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      if (jitter) p.setXYZ(i, x + jitter * nz(x, y, z, 9), y + jitter * nz(x + 7, y, z, 9), z + jitter * nz(x, y + 3, z + 5, 9));
      _c.copy(base);
      if (colorFn) colorFn(_c, x, y, z, i);
      _c.multiplyScalar(1 + vary * nz(x + shift, y, z, 4));
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const name of this.extra) {
      const v = tags?.[name] ?? this.tags[name] ?? 0;
      g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(n).fill(v), 1));
    }
    this.items.push(g);
    return g;
  }

  box(w, h, d, o = {}) {
    const seg = o.seg || [1, 1, 1];
    return this.add(new THREE.BoxGeometry(w, h, d, seg[0], seg[1], seg[2]), o);
  }

  log(len, r, o = {}) {
    const g = new THREE.CylinderGeometry(r * (o.taper ?? 1), r, len, o.radial ?? 9, o.rings ?? 1, o.open ?? false);
    return this.add(g, o);
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
