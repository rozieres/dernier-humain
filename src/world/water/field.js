import * as THREE from 'three';
import { LIGHTHOUSE_BLEND } from './waves.js';

export function createSeaField(world) {
  const { GRID: N, HALF, CELL } = world;
  const cd = world.coastDistance;
  const data = new Float32Array(N * N * 4);
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const k = iz * N + ix;
      const xa = cd[iz * N + Math.max(0, ix - 1)];
      const xb = cd[iz * N + Math.min(N - 1, ix + 1)];
      const za = cd[Math.max(0, iz - 1) * N + ix];
      const zb = cd[Math.min(N - 1, iz + 1) * N + ix];
      const sx = (ix > 0 && ix < N - 1 ? 2 : 1) * CELL;
      const sz = (iz > 0 && iz < N - 1 ? 2 : 1) * CELL;
      data[k * 4] = cd[k];
      data[k * 4 + 1] = (xb - xa) / sx;
      data[k * 4 + 2] = (zb - za) / sz;
      data[k * 4 + 3] = 1;
    }
  }
  const texture = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.FloatType);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  const isle = world.zones.lighthouse;
  const isleX = isle.center[0];
  const isleZ = isle.center[1];
  const isleR = isle.shoreR ?? isle.radius;
  const K = LIGHTHOUSE_BLEND;

  function main(x, z, out) {
    const cx = Math.min(HALF, Math.max(-HALF, x));
    const cz = Math.min(HALF, Math.max(-HALF, z));
    const gx = (cx + HALF) / CELL;
    const gz = (cz + HALF) / CELL;
    const ix = Math.min(Math.floor(gx), N - 2);
    const iz = Math.min(Math.floor(gz), N - 2);
    const tx = gx - ix;
    const tz = gz - iz;
    const a = (iz * N + ix) * 4;
    const b = a + 4;
    const c = a + N * 4;
    const d = c + 4;
    for (let i = 0; i < 3; i++) {
      const top = data[a + i] + (data[b + i] - data[a + i]) * tx;
      const bot = data[c + i] + (data[d + i] - data[c + i]) * tx;
      out[i] = top + (bot - top) * tz;
    }
    const extra = Math.hypot(x, z) - Math.hypot(cx, cz);
    if (extra > 0) {
      out[0] -= extra;
      const r = Math.hypot(x, z);
      const gl = Math.hypot(out[1], out[2]) || 1;
      const w = Math.min(1, extra / 300);
      const mx = (out[1] / gl) * (1 - w) - (x / r) * w;
      const mz = (out[2] / gl) * (1 - w) - (z / r) * w;
      const ml = Math.hypot(mx, mz) || 1;
      out[1] = mx / ml;
      out[2] = mz / ml;
    }
    return out;
  }

  const m = [0, 0, 0];
  function sample(x, z, out = {}) {
    main(x, z, m);
    const dx = x - isleX;
    const dz = z - isleZ;
    const rl = Math.max(Math.hypot(dx, dz), 1e-3);
    const cl = isleR - rl;
    const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (m[0] - cl)) / K));
    out.cd = cl + (m[0] - cl) * h + K * h * (1 - h);
    out.gx = -dx / rl + (m[1] + dx / rl) * h;
    out.gz = -dz / rl + (m[2] + dz / rl) * h;
    out.h = h;
    return out;
  }

  return { texture, sample, isle: new THREE.Vector3(isleX, isleZ, isleR) };
}
