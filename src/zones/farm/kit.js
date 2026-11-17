import * as THREE from 'three';
import { Parts, lathe } from '../../entities/props/kit.js';

export { Parts, lathe };

export const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export function rotY(x, z, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c];
}

export function rod(P, a, b, radius, opts = {}, radial = 8) {
  _a.fromArray(a);
  _b.fromArray(b);
  const len = _a.distanceTo(_b);
  if (len < 1e-4) return P;
  const g = new THREE.CylinderGeometry(radius * (opts.taper ?? 1), radius, len, radial, 1, opts.open ?? radius < 0.05);
  _v.subVectors(_b, _a).normalize();
  _q.setFromUnitVectors(UP, _v);
  g.applyQuaternion(_q);
  _v.addVectors(_a, _b).multiplyScalar(0.5);
  g.translate(_v.x, _v.y, _v.z);
  const rest = { ...opts };
  delete rest.taper;
  delete rest.open;
  return P.add(g, rest);
}

export function beam(P, a, b, w, h, opts = {}) {
  _a.fromArray(a);
  _b.fromArray(b);
  const len = _a.distanceTo(_b);
  const g = new THREE.BoxGeometry(w, h, len);
  _v.subVectors(_b, _a).normalize();
  const m = new THREE.Matrix4().lookAt(_a, _b, Math.abs(_v.y) > 0.98 ? new THREE.Vector3(1, 0, 0) : UP);
  g.applyMatrix4(m);
  _v.addVectors(_a, _b).multiplyScalar(0.5);
  g.translate(_v.x, _v.y, _v.z);
  return P.add(g, opts);
}

export function tube(P, points, radius, opts = {}, segments = 48, radial = 12) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3().fromArray(p)), false, 'centripetal');
  return P.add(new THREE.TubeGeometry(curve, segments, radius, radial, false), opts);
}

export function superellipse(a, b, theta, n = 4) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const r = (Math.abs(c / a) ** n + Math.abs(s / b) ** n) ** (-1 / n);
  return [c * r, s * r];
}

export function pad(world, { x, z, a, b, yaw = 0, lift = 0.07, rings = 7, segs = 72, n = 4, edge = 0.5 }) {
  const pos = [];
  const ring = (k) => k / rings;
  const pt = (t, theta, drop = 0, grow = 0) => {
    const [ex, ez] = superellipse(a + grow, b + grow, theta, n);
    const [rx, rz] = rotY(ex * t, ez * t, yaw);
    const wx = x + rx;
    const wz = z + rz;
    return [wx, world.heightAt(wx, wz) + lift - drop, wz];
  };
  for (let k = 1; k <= rings; k++) {
    for (let i = 0; i < segs; i++) {
      const th0 = (i / segs) * Math.PI * 2;
      const th1 = ((i + 1) / segs) * Math.PI * 2;
      const tIn = Math.sqrt(ring(k - 1));
      const tOut = Math.sqrt(ring(k));
      const p00 = pt(tIn, th0);
      const p01 = pt(tIn, th1);
      const p10 = pt(tOut, th0);
      const p11 = pt(tOut, th1);
      if (k === 1) pos.push(...p00, ...p11, ...p10);
      else pos.push(...p00, ...p01, ...p11, ...p00, ...p11, ...p10);
      if (k === rings) {
        const q0 = pt(1, th0, edge, 0.35);
        const q1 = pt(1, th1, edge, 0.35);
        pos.push(...p10, ...p11, ...q1, ...p10, ...q1, ...q0);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) {
    uv[i * 2] = pos[i * 3] * 0.25;
    uv[i * 2 + 1] = pos[i * 3 + 2] * 0.25;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export function padRing(world, { x, z, a, b, yaw = 0, lift = 0.1, width = 0.18, inset = 0.8, segs = 96, n = 4 }) {
  const pos = [];
  const pt = (theta, grow) => {
    const [ex, ez] = superellipse(a - inset + grow, b - inset + grow, theta, n);
    const [rx, rz] = rotY(ex, ez, yaw);
    return [x + rx, world.heightAt(x + rx, z + rz) + lift, z + rz];
  };
  for (let i = 0; i < segs; i++) {
    const t0 = (i / segs) * Math.PI * 2;
    const t1 = ((i + 1) / segs) * Math.PI * 2;
    const a0 = pt(t0, 0);
    const a1 = pt(t1, 0);
    const b0 = pt(t0, width);
    const b1 = pt(t1, width);
    pos.push(...a0, ...b1, ...b0, ...a0, ...a1, ...b1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}

export function groundRange(world, x, z, r, samples = 12) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i <= samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    const rr = i === samples ? 0 : r;
    const h = world.heightAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr);
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  return { min, max };
}

export function mesh(geometry, material, { shadow = true, receive = true, name } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = shadow;
  m.receiveShadow = receive;
  if (name) m.name = name;
  return m;
}
