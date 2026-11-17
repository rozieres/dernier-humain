import * as THREE from 'three';

export function createSeaGrid({ half = 128, inner = 0.5, outer = 7000 } = {}) {
  const reach = (b) => (inner * (Math.exp(b * half) - 1)) / b;
  let lo = 1e-4;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (reach(mid) > outer) hi = mid;
    else lo = mid;
  }
  const b = (lo + hi) / 2;
  const radius = (m) => (inner * (Math.exp(b * m) - 1)) / b;

  const side = half * 2 + 1;
  const pos = new Float32Array(side * side * 3);
  const cell = new Float32Array(side * side);
  for (let iz = -half; iz <= half; iz++) {
    for (let ix = -half; ix <= half; ix++) {
      const k = (iz + half) * side + (ix + half);
      const m = Math.max(Math.abs(ix), Math.abs(iz));
      const r = m === 0 ? 0 : radius(m) / m;
      pos[k * 3] = ix * r;
      pos[k * 3 + 2] = iz * r;
      cell[k] = inner * Math.exp(b * m);
    }
  }
  const quads = (side - 1) * (side - 1);
  const idx = new Uint32Array(quads * 6);
  let n = 0;
  for (let j = 0; j < side - 1; j++) {
    for (let i = 0; i < side - 1; i++) {
      const a = j * side + i;
      const c = a + side;
      const flip = (i < half) !== (j < half);
      if (flip) idx.set([a, c, a + 1, a + 1, c, c + 1], n);
      else idx.set([a, c, c + 1, a, c + 1, a + 1], n);
      n += 6;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aCell', new THREE.BufferAttribute(cell, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), outer * 1.5);
  return geo;
}
