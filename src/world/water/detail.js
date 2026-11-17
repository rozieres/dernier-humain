import * as THREE from 'three';

export function createDetailNormals(rng, { size = 256, count = 56, slope = 0.42 } = {}) {
  const r = rng.seeded('sea-detail');
  const waves = [];
  for (let i = 0; i < count; i++) {
    const kmag = 2 + Math.pow(r(), 1.6) * 22;
    const a = r() * Math.PI * 2;
    const kx = Math.round(Math.cos(a) * kmag);
    const ky = Math.round(Math.sin(a) * kmag);
    if (!kx && !ky) continue;
    const len = Math.hypot(kx, ky);
    waves.push({ kx, ky, amp: Math.pow(len, -1.7), phase: r() * Math.PI * 2 });
  }
  const gx = new Float32Array(size * size);
  const gy = new Float32Array(size * size);
  const tau = (Math.PI * 2) / size;
  const cosX = new Float32Array(size);
  for (const w of waves) {
    const ax = w.amp * w.kx * Math.PI * 2;
    const ay = w.amp * w.ky * Math.PI * 2;
    for (let y = 0; y < size; y++) {
      const py = w.ky * y * tau + w.phase;
      for (let x = 0; x < size; x++) cosX[x] = Math.cos(w.kx * x * tau + py);
      const row = y * size;
      for (let x = 0; x < size; x++) {
        gx[row + x] += ax * cosX[x];
        gy[row + x] += ay * cosX[x];
      }
    }
  }
  let max = 0;
  for (let i = 0; i < gx.length; i++) max = Math.max(max, Math.hypot(gx[i], gy[i]));
  const s = slope / (max * 0.55);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < gx.length; i++) {
    const nx = -gx[i] * s;
    const nz = -gy[i] * s;
    const l = Math.hypot(nx, nz, 1);
    data[i * 4] = Math.round(((nx / l) * 0.5 + 0.5) * 255);
    data[i * 4 + 1] = Math.round(((nz / l) * 0.5 + 0.5) * 255);
    data[i * 4 + 2] = Math.round(((1 / l) * 0.5 + 0.5) * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
