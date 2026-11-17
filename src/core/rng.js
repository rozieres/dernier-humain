export function hash(string) {
  let h = 0x811c9dc5;
  const s = String(string);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function seeded(seed = 1) {
  let a = (typeof seed === 'number' ? seed : hash(seed)) >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(r, a, b) {
  return a + (b - a) * r();
}

export function pick(r, array) {
  return array[Math.floor(r() * array.length) % array.length];
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = new Float32Array([
  1, 0, 0.9239, 0.3827, 0.7071, 0.7071, 0.3827, 0.9239, 0, 1, -0.3827, 0.9239, -0.7071, 0.7071, -0.9239, 0.3827,
  -1, 0, -0.9239, -0.3827, -0.7071, -0.7071, -0.3827, -0.9239, 0, -1, 0.3827, -0.9239, 0.7071, -0.7071, 0.9239, -0.3827,
]);

export function makeNoise2(seed = 0) {
  const r = seeded(seed ^ 0x9e3779b9);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  return function noise2(x, y) {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - i + t;
    const y0 = y - j + t;
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = (perm[ii + perm[jj]] & 15) * 2;
      t0 *= t0;
      n += t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = (perm[ii + i1 + perm[jj + j1]] & 15) * 2;
      t1 *= t1;
      n += t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = (perm[ii + 1 + perm[jj + 1]] & 15) * 2;
      t2 *= t2;
      n += t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2);
    }
    return 99.2 * n;
  };
}

export function makeFbm2(noise) {
  return function fbm2(x, y, octaves = 5, lacunarity = 2, gain = 0.5) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let px = x;
    let py = y;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(px, py);
      norm += amp;
      amp *= gain;
      const nx = (px * 0.8 - py * 0.6) * lacunarity;
      py = (px * 0.6 + py * 0.8) * lacunarity + 17.3;
      px = nx + 3.1;
    }
    return sum / norm;
  };
}

export const noise2 = makeNoise2(1337);
export const fbm2 = makeFbm2(noise2);

export const rng = { seeded, range, pick, noise2, fbm2, hash, makeNoise2, makeFbm2 };
