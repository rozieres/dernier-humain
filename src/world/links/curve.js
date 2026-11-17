import * as THREE from 'three';

export const ANCHOR = 7.65;
const CLEARANCE = 12;
const END_ZONE = 70;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function buildCurve(world, a, b, { seed = 1 } = {}) {
  const A = new THREE.Vector3(a[0], a[1] + ANCHOR, a[2]);
  const B = new THREE.Vector3(b[0], b[1] + ANCHOR, b[2]);
  const dx = B.x - A.x;
  const dz = B.z - A.z;
  const flat = Math.hypot(dx, dz);
  const sideX = -dz / flat;
  const sideZ = dx / flat;
  const sway = Math.min(flat * 0.045, 36) * (seed % 2 ? 1 : -1);
  const n = Math.max(64, Math.ceil(flat / 2));
  const xs = new Float32Array(n + 1);
  const zs = new Float32Array(n + 1);
  const lin = new Float32Array(n + 1);
  const need = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const lateral = sway * Math.sin(Math.PI * 2 * t) * Math.sin(Math.PI * t);
    const x = A.x + dx * t + sideX * lateral;
    const z = A.z + dz * t + sideZ * lateral;
    xs[i] = x;
    zs[i] = z;
    lin[i] = A.y + (B.y - A.y) * t;
    const d = Math.min(t, 1 - t) * flat;
    const clear = ANCHOR - 0.4 + (CLEARANCE - ANCHOR + 0.4) * smooth(0, END_ZONE, d);
    need[i] = Math.max(world.heightAt(x, z), world.SEA_LEVEL) + clear;
  }
  let H = Math.max(14, flat * 0.07);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const bump = 4 * t * (1 - t);
    H = Math.max(H, (need[i] - lin[i]) / bump);
  }
  H = Math.min(H, Math.max(30, flat * 0.16));
  const raw = new Float32Array(n + 1);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    raw[i] = Math.max(0, need[i] - (lin[i] + H * 4 * t * (1 - t)));
  }
  const W = 14;
  const dilated = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    let m = 0;
    for (let k = Math.max(0, i - W); k <= Math.min(n, i + W); k++) m = Math.max(m, raw[k]);
    dilated[i] = m;
  }
  const lift = new Float32Array(n + 1);
  for (let i = 1; i < n; i++) {
    let sum = 0;
    let cnt = 0;
    for (let k = Math.max(0, i - W / 2); k <= Math.min(n, i + W / 2); k++) {
      sum += dilated[k];
      cnt++;
    }
    lift[i] = Math.max(raw[i], sum / cnt);
  }
  const points = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    points.push(new THREE.Vector3(xs[i], lin[i] + H * 4 * t * (1 - t) + lift[i], zs[i]));
  }
  return createPath(points);
}

export function createPath(points) {
  const n = points.length;
  const pos = new Float32Array(n * 3);
  const cum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = points[i].x;
    pos[i * 3 + 1] = points[i].y;
    pos[i * 3 + 2] = points[i].z;
    if (i > 0) cum[i] = cum[i - 1] + points[i].distanceTo(points[i - 1]);
  }
  const length = cum[n - 1];

  function locate(s) {
    const x = Math.min(length, Math.max(0, s));
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= x) lo = mid;
      else hi = mid;
    }
    const seg = cum[hi] - cum[lo];
    return [lo, hi, seg > 0 ? (x - cum[lo]) / seg : 0];
  }

  return {
    points, length, count: n,
    at(s, out = new THREE.Vector3()) {
      const [i, j, f] = locate(s);
      return out.set(
        pos[i * 3] + (pos[j * 3] - pos[i * 3]) * f,
        pos[i * 3 + 1] + (pos[j * 3 + 1] - pos[i * 3 + 1]) * f,
        pos[i * 3 + 2] + (pos[j * 3 + 2] - pos[i * 3 + 2]) * f,
      );
    },
    tangent(s, out = new THREE.Vector3()) {
      const h = 3;
      const s0 = Math.max(0, s - h);
      const s1 = Math.min(length, s + h);
      const [i0, j0, f0] = locate(s0);
      const [i1, j1, f1] = locate(s1);
      const x0 = pos[i0 * 3] + (pos[j0 * 3] - pos[i0 * 3]) * f0;
      const y0 = pos[i0 * 3 + 1] + (pos[j0 * 3 + 1] - pos[i0 * 3 + 1]) * f0;
      const z0 = pos[i0 * 3 + 2] + (pos[j0 * 3 + 2] - pos[i0 * 3 + 2]) * f0;
      const x1 = pos[i1 * 3] + (pos[j1 * 3] - pos[i1 * 3]) * f1;
      const y1 = pos[i1 * 3 + 1] + (pos[j1 * 3 + 1] - pos[i1 * 3 + 1]) * f1;
      const z1 = pos[i1 * 3 + 2] + (pos[j1 * 3 + 2] - pos[i1 * 3 + 2]) * f1;
      return out.set(x1 - x0, y1 - y0, z1 - z0).normalize();
    },
  };
}
