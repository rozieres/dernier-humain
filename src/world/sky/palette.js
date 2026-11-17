import * as THREE from 'three';

export const STAGE_HOURS = [16.0, 18.2, 19.6, 20.6, 23.0, 1.0, 6.4];

const DEG = Math.PI / 180;
const LATITUDE = 46 * DEG;
const SUN_DECLINATION = -6 * DEG;
const MOON_DECLINATION = 3 * DEG;
const SOLAR_NOON = 12.935;
const DAY_WARP = 16.8 * DEG;

export function hourAngle(hours) {
  let h = ((hours - SOLAR_NOON) % 24 + 24) % 24;
  if (h > 12) h -= 24;
  const x = (h / 24) * Math.PI * 2;
  return x - DAY_WARP * Math.sin(x);
}

function celestial(H, dec, target) {
  const sl = Math.sin(LATITUDE);
  const cl = Math.cos(LATITUDE);
  const east = -Math.cos(dec) * Math.sin(H);
  const up = sl * Math.sin(dec) + cl * Math.cos(dec) * Math.cos(H);
  const north = cl * Math.sin(dec) - sl * Math.cos(dec) * Math.cos(H);
  return target.set(east, up, -north).normalize();
}

export function sunDirection(hours, target = new THREE.Vector3()) {
  return celestial(hourAngle(hours), SUN_DECLINATION, target);
}

export function moonDirection(hours, target = new THREE.Vector3()) {
  return celestial(hourAngle(hours) - 190 * DEG, MOON_DECLINATION, target);
}

const POLE = new THREE.Vector3(0, Math.sin(LATITUDE), -Math.cos(LATITUDE));
const _m = new THREE.Matrix4();
export function starRotation(hours, target = new THREE.Matrix3()) {
  _m.makeRotationAxis(POLE, (hours / 24) * Math.PI * 2);
  return target.setFromMatrix4(_m);
}

function toOklab(c) {
  const l = Math.cbrt(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b);
  const m = Math.cbrt(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b);
  const s = Math.cbrt(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab(L, A, B, out) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return out.setRGB(
    Math.max(0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    THREE.LinearSRGBColorSpace,
  );
}

const COLOR_KEYS = ['zen', 'midA', 'midS', 'horA', 'horS', 'glow', 'disc', 'sun', 'sky', 'ground', 'tint', 'cloudLit', 'cloudShade'];
const NUMBER_KEYS = ['fogD', 'fogH', 'haze', 'exposure', 'sat', 'contrast', 'vignette', 'cover', 'stars', 'wind', 'zenLow'];

function key(e, d) {
  const out = { e };
  const skyMul = d.skyMul ?? 1;
  for (const k of COLOR_KEYS) {
    const [hex, mul = 1] = Array.isArray(d[k]) ? d[k] : [d[k], 1];
    const scale = ['zen', 'midA', 'midS', 'horA', 'horS', 'glow'].includes(k) ? mul * skyMul : mul;
    out[k] = toOklab(new THREE.Color(hex).multiplyScalar(scale));
  }
  for (const k of NUMBER_KEYS) out[k] = d[k] ?? 0;
  return out;
}

const NIGHT_DEEP = {
  zen: '#03081d', midA: '#071430', midS: '#081530', horA: '#0d1d38', horS: '#0e1e3a', glow: ['#1a2238', 0.3], disc: ['#000000', 0],
  sun: ['#000000', 0], sky: ['#26365e', 1.5], ground: ['#1a2028', 0.9], tint: '#dde6ff',
  cloudLit: ['#4a5878', 0.22], cloudShade: ['#070b16', 0.6], skyMul: 0.28,
  fogD: 0.0006, fogH: 130, haze: 0.12, exposure: 2.05, sat: 0.9, contrast: 1.05, vignette: 0.42, cover: 0.32, stars: 1, wind: 3.4,
};
const NIGHT = {
  ...NIGHT_DEEP, zen: '#050c26', midA: '#0a1838', midS: '#0b1a3a', horA: '#10223f', horS: '#12243f', skyMul: 0.3,
  exposure: 1.95, cover: 0.38, wind: 2.6,
};
const DUSK_DEEP = {
  zen: '#0a1238', midA: '#132650', midS: '#172a52', horA: '#1a3458', horS: '#1e3456', glow: ['#262848', 0.4], disc: ['#000000', 0],
  sun: ['#000000', 0], sky: ['#2a3a66', 1.7], ground: ['#1e2630', 0.9], tint: '#e2eaff',
  cloudLit: ['#2c3654', 0.2], cloudShade: ['#0b1020', 0.55], skyMul: 0.34,
  fogD: 0.0009, fogH: 110, haze: 0.14, exposure: 1.9, sat: 0.95, contrast: 1.04, vignette: 0.4, cover: 0.38, stars: 0.85, wind: 2.0,
};

const EVENING = [
  key(-55, NIGHT_DEEP),
  key(-30, NIGHT),
  key(-18, DUSK_DEEP),
  key(-11, {
    zen: '#121d52', midA: '#2a4176', midS: '#3a4c7e', horA: '#2e6488', horS: '#5c6a8e', glow: ['#5a4266', 0.5], disc: ['#000000', 0],
    sun: ['#000000', 0], sky: ['#3a5288', 2.8], ground: ['#28323e', 1.2], tint: '#e6eeff',
    cloudLit: ['#46557e', 0.35], cloudShade: ['#151a34', 0.45], skyMul: 0.45,
    fogD: 0.0014, fogH: 95, haze: 0.18, exposure: 1.75, sat: 1.05, contrast: 1.02, vignette: 0.36, cover: 0.4, stars: 0.5, wind: 1.5,
  }),
  key(-6, {
    zen: '#1a285e', midA: '#4c4f86', midS: '#966884', horA: '#3f5784', horS: '#c46a50', glow: ['#a04a44', 0.6], disc: ['#000000', 0],
    sun: ['#000000', 0], sky: ['#4f5a88', 1.8], ground: ['#3a3438', 0.8], tint: '#f2eeff',
    cloudLit: ['#c07070', 0.45], cloudShade: ['#3a3458', 0.35], skyMul: 0.55,
    fogD: 0.0014, fogH: 120, haze: 0.18, exposure: 1.4, sat: 1.1, contrast: 1.02, vignette: 0.33, cover: 0.45, stars: 0.2, wind: 1.8,
  }),
  key(-2.5, {
    zen: '#24346e', midA: '#7a6a98', midS: '#d07a78', horA: '#56608e', horS: '#f07a46', glow: ['#e0602e', 0.8], disc: ['#ff5020', 0],
    sun: ['#ff7040', 0.25], sky: ['#6a6a92', 1.5], ground: ['#4a3c3a', 0.7], tint: '#fff0ec',
    cloudLit: ['#ff8a68', 0.8], cloudShade: ['#6e4868', 0.42], skyMul: 0.72,
    fogD: 0.0013, fogH: 140, haze: 0.16, exposure: 1.25, sat: 1.15, contrast: 1.02, vignette: 0.31, cover: 0.48, stars: 0.05, wind: 2.0,
  }),
  key(0.2, {
    zen: '#2c3f82', midA: '#a27fa8', midS: '#f08a62', horA: '#7a7aa4', horS: '#ff7a2e', glow: ['#ff6a20', 1.0], disc: ['#ff6a2a', 7],
    sun: ['#ff8a48', 1.1], sky: ['#8a7a9a', 1.35], ground: ['#5a4a40', 0.65], tint: '#fff0e4',
    cloudLit: ['#ffa070', 1.25], cloudShade: ['#a0607a', 0.5], skyMul: 0.9,
    fogD: 0.0012, fogH: 160, haze: 0.14, exposure: 1.15, sat: 1.18, contrast: 1.03, vignette: 0.3, cover: 0.5, stars: 0, wind: 2.0,
  }),
  key(6, {
    zen: '#3a5fae', midA: '#9a9ec6', midS: '#f2b07a', horA: '#cdbcc4', horS: '#ffb062', glow: ['#ffa24a', 1.0], disc: ['#ffb070', 9],
    sun: ['#ffb878', 2.0], sky: ['#a8a0b0', 1.15], ground: ['#6a5c46', 0.55], tint: '#fff0e0',
    cloudLit: ['#ffc890', 1.35], cloudShade: ['#a08aa0', 0.6], skyMul: 1,
    fogD: 0.0012, fogH: 170, haze: 0.16, exposure: 1.05, sat: 1.15, contrast: 1.02, vignette: 0.25, cover: 0.48, stars: 0, wind: 2.3,
  }),
  key(14, {
    zen: '#2654a8', midA: '#6d98d0', midS: '#f0b080', horA: '#b8c4d4', horS: '#ffb060', glow: ['#ff9a38', 0.3], disc: ['#ffd8a0', 11],
    sun: ['#ffd49a', 2.8], sky: ['#b8b8c0', 1.05], ground: ['#7a7448', 0.45], tint: '#fff4e6',
    cloudLit: ['#ffd8a0', 1.1], cloudShade: ['#8e90aa', 0.6], skyMul: 0.75,
    fogD: 0.0011, fogH: 170, haze: 0.14, exposure: 1.0, sat: 1.12, contrast: 1.0, vignette: 0.22, cover: 0.5, stars: 0, wind: 2.6,
  }),
  key(30, {
    zen: '#2a62cc', midA: '#5a94dc', midS: '#86b0e0', horA: '#bad3ea', horS: '#e8e4da', glow: ['#ffeccc', 0.4], disc: ['#fff4e2', 14],
    sun: ['#fff1dc', 3.4], sky: ['#a7c4e6', 1.25], ground: ['#7d8a5a', 0.5], tint: '#ffffff',
    cloudLit: ['#ffffff', 1.6], cloudShade: ['#9fb2cc', 0.78], skyMul: 1,
    fogD: 0.0008, fogH: 150, haze: 0.1, exposure: 1.0, sat: 1.05, contrast: 1.0, vignette: 0.18, cover: 0.44, stars: 0, wind: 3.5,
  }),
  key(70, {
    zen: '#2c6bd4', midA: '#5f9ae0', midS: '#7aa9e2', horA: '#bcd6ee', horS: '#dfe6ea', glow: ['#fff1d6', 0.5], disc: ['#fff6ea', 14],
    sun: ['#fff4e6', 3.6], sky: ['#a9c8ec', 1.3], ground: ['#7d8a5a', 0.55], tint: '#ffffff',
    cloudLit: ['#ffffff', 1.7], cloudShade: ['#a4b6ce', 0.8], skyMul: 1,
    fogD: 0.0008, fogH: 150, haze: 0.1, exposure: 1.0, sat: 1.05, contrast: 1.0, vignette: 0.18, cover: 0.34, stars: 0, wind: 3.5,
  }),
];

const MORNING = [
  EVENING[0],
  EVENING[1],
  EVENING[2],
  key(-11, {
    zen: '#111b4c', midA: '#283066', midS: '#54487a', horA: '#2a3e68', horS: '#8a5a6a', glow: ['#7a4a50', 0.5], disc: ['#000000', 0],
    sun: ['#000000', 0], sky: ['#3a4a80', 1.9], ground: ['#262c38', 0.9], tint: '#eceaff',
    cloudLit: ['#6a4a6a', 0.35], cloudShade: ['#151a34', 0.45], skyMul: 0.45,
    fogD: 0.0015, fogH: 70, haze: 0.18, exposure: 1.6, sat: 1.05, contrast: 1.02, vignette: 0.36, cover: 0.32, stars: 0.75, wind: 1.0,
  }),
  key(-4.5, {
    zen: '#17225a', midA: '#3c3a72', midS: '#b07080', horA: '#4a4c7c', horS: '#e0805a', glow: ['#c86a48', 0.7], disc: ['#000000', 0],
    sun: ['#ff7040', 0.05], sky: ['#55588a', 1.9], ground: ['#3a3236', 0.8], tint: '#fff0f0',
    cloudLit: ['#e08a7a', 0.6], cloudShade: ['#3c3460', 0.4], skyMul: 0.62,
    fogD: 0.0016, fogH: 60, haze: 0.18, exposure: 1.42, sat: 1.12, contrast: 1.02, vignette: 0.32, cover: 0.32, stars: 0.62, wind: 1.0, zenLow: 0.9,
  }),
  key(1.6, {
    zen: '#18225a', midA: '#4c4a88', midS: '#eca08c', horA: '#8a82aa', horS: '#ffc066', glow: ['#ffa848', 0.9], disc: ['#ffb060', 7],
    sun: ['#ffa860', 1.3], sky: ['#8a86b0', 1.3], ground: ['#5a4c48', 0.65], tint: '#fff2ea',
    cloudLit: ['#ffb890', 1.3], cloudShade: ['#7a6a9a', 0.52], skyMul: 0.88,
    fogD: 0.0016, fogH: 55, haze: 0.16, exposure: 1.25, sat: 1.16, contrast: 1.03, vignette: 0.28, cover: 0.34, stars: 0.45, wind: 1.2, zenLow: 1,
  }),
  key(6, {
    zen: '#2a4a9a', midA: '#8a90c0', midS: '#f6c49a', horA: '#c0b8c8', horS: '#ffd08a', glow: ['#ffc070', 1.0], disc: ['#ffc890', 9],
    sun: ['#ffc890', 2.0], sky: ['#a8a4c0', 1.1], ground: ['#6a5c4a', 0.55], tint: '#fff4ea',
    cloudLit: ['#ffd0a8', 1.4], cloudShade: ['#9a90b0', 0.6], skyMul: 0.96,
    fogD: 0.0013, fogH: 80, haze: 0.14, exposure: 1.1, sat: 1.12, contrast: 1.02, vignette: 0.24, cover: 0.38, stars: 0.08, wind: 1.6, zenLow: 0.4,
  }),
  key(14, {
    zen: '#3068c0', midA: '#78a2d8', midS: '#d8d0b8', horA: '#c4d4e4', horS: '#ffe2b0', glow: ['#ffe0b0', 0.9], disc: ['#ffe8c8', 12],
    sun: ['#ffe2bc', 2.9], sky: ['#b0c0dc', 1.1], ground: ['#7a8054', 0.48], tint: '#fffaf2',
    cloudLit: ['#fff0dc', 1.55], cloudShade: ['#a0aec6', 0.74], skyMul: 1,
    fogD: 0.001, fogH: 120, haze: 0.12, exposure: 1.0, sat: 1.08, contrast: 1.0, vignette: 0.2, cover: 0.42, stars: 0, wind: 2.5,
  }),
  EVENING[EVENING.length - 2],
  EVENING[EVENING.length - 1],
];

function emptyLab() {
  const o = {};
  for (const k of COLOR_KEYS) o[k] = [0, 0, 0];
  for (const k of NUMBER_KEYS) o[k] = 0;
  return o;
}

function sampleTable(table, e, out) {
  let i = 0;
  while (i < table.length - 2 && e > table[i + 1].e) i++;
  const a = table[i];
  const b = table[i + 1];
  let t = (e - a.e) / (b.e - a.e);
  t = Math.max(0, Math.min(1, t));
  t = t * t * (3 - 2 * t);
  for (const k of COLOR_KEYS) {
    const o = out[k];
    o[0] = a[k][0] + (b[k][0] - a[k][0]) * t;
    o[1] = a[k][1] + (b[k][1] - a[k][1]) * t;
    o[2] = a[k][2] + (b[k][2] - a[k][2]) * t;
  }
  for (const k of NUMBER_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

export function createPaletteSampler() {
  const ev = emptyLab();
  const mo = emptyLab();
  const out = {};
  for (const k of COLOR_KEYS) out[k] = new THREE.Color();
  for (const k of NUMBER_KEYS) out[k] = 0;
  return function sample(elevationDeg, morning) {
    sampleTable(EVENING, elevationDeg, ev);
    if (morning > 0) sampleTable(MORNING, elevationDeg, mo);
    for (const k of COLOR_KEYS) {
      const a = ev[k];
      const b = mo[k];
      if (morning > 0) fromOklab(a[0] + (b[0] - a[0]) * morning, a[1] + (b[1] - a[1]) * morning, a[2] + (b[2] - a[2]) * morning, out[k]);
      else fromOklab(a[0], a[1], a[2], out[k]);
    }
    for (const k of NUMBER_KEYS) out[k] = morning > 0 ? ev[k] + (mo[k] - ev[k]) * morning : ev[k];
    return out;
  };
}
