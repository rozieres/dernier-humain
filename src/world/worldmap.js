import * as THREE from 'three';
import { makeNoise2, makeFbm2, seeded } from '../core/rng.js';

const SIZE = 2560;
const HALF = 1280;
const GRID = 641;
const CELL = 4;
const SEA_LEVEL = 0;

const HUB = { center: [0, 0], y: 38, flatR: 46, falloffR: 120 };
const FEED = {
  center: [0, -640], mesaY: 124, topR: 170, footR: 255,
  pit: { radius: 34, floorY: 8, flatR: 30, wallR: 38 },
  ramp: { from: [0, -250], to: [0, -468], width: 18, startY: 48 },
};
const FARM = { center: [640, -60], y: 24 };
const HALLU = { center: [330, 600], rimY: 46, rimR: [100, 170], chasm: { r0: 34, r1: 92, floorY: 6 }, pillar: { r: 26, topY: 50 } };
const OLDWEB = { center: [-520, 520], floorY: 16 };
const FOREST = { center: [-620, -330] };
const LIGHTHOUSE = { center: [-1140, 170], plateauY: 14, flatR: 30, shoreR: 70 };
const PIER = [-915, 170];
const MASSIF = { peak: [470, -430] };

const ZONE_DEFS = [
  { id: 'hub', name: "Page d'accueil", center: [0, 0], radius: 110 },
  { id: 'feed', name: 'Le Fil', center: [0, -640], radius: 215, arrival: [0, -492], hubDir: [0, -1] },
  { id: 'farm', name: 'La Ferme à contenus', center: [640, -60], radius: 240, arrival: [452, -44], hubDir: [1, 0] },
  { id: 'hallu', name: 'Les Hallucinations', center: [330, 600], radius: 200, arrival: [262, 462], hubDir: [Math.SQRT1_2, Math.SQRT1_2] },
  { id: 'oldweb', name: 'Le Vieux Web', center: [-520, 520], radius: 220, arrival: [-392, 392], hubDir: [-Math.SQRT1_2, Math.SQRT1_2] },
  { id: 'forest', name: 'La Forêt Sombre', center: [-620, -330], radius: 250, arrival: [-436, -232], hubDir: [-Math.SQRT1_2, -Math.SQRT1_2] },
  { id: 'lighthouse', name: 'Le Phare', center: [-1140, 170], radius: 70, arrival: [-1096, 176], hubDir: [-1, 0] },
];

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const len2 = (x, z) => Math.sqrt(x * x + z * z);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function createWorld({ seed = 2031 } = {}) {
  const t0 = performance.now();
  const n = Array.from({ length: 11 }, (_, i) => makeNoise2(seed * 31 + i * 7919));
  const f = n.map(makeFbm2);
  const [fCoast, fWarpX, fWarpZ, fHills, fDetail, fCliff, fMassif, fZone, fBiome, fPath, fRim] = f;

  const oldwebButtes = makeButtes(seeded(seed + 7));
  const coastNeeds = ZONE_DEFS.filter((z) => z.id !== 'hub' && z.id !== 'lighthouse').map((z) => {
    const d = len2(z.center[0], z.center[1]);
    return { a: Math.atan2(z.center[1], z.center[0]), need: d + z.radius * 0.95 + 45, half: Math.asin(Math.min(1, (z.radius + 60) / d)) };
  });

  const LUT = 2048;
  const angleIndex = (x, z) => ((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * LUT;
  const coastLut = new Float32Array(LUT + 1);
  const cliffLut = new Float32Array(LUT + 1);
  for (let i = 0; i <= LUT; i++) {
    const a = (i / LUT) * 2 * Math.PI - Math.PI;
    let r = 935 + 85 * fCoast(Math.cos(a) * 1.5 + 5, Math.sin(a) * 1.5 + 5, 5);
    for (const c of coastNeeds) {
      let da = Math.abs(a - c.a);
      if (da > Math.PI) da = 2 * Math.PI - da;
      const w = 1 - smooth(c.half * 0.7, c.half * 1.25, da);
      if (w > 0) r = Math.max(r, lerp(r, c.need, w));
    }
    coastLut[i] = r;
    cliffLut[i] = smooth(0.18, 0.45, fCliff(Math.cos(a) * 2.4 - 3, Math.sin(a) * 2.4 + 1, 3));
  }
  let angleF = 0;
  const lut = (table, f) => {
    const i = Math.floor(f);
    return table[i] + (table[Math.min(LUT, i + 1)] - table[i]) * (f - i);
  };

  const field = (step, fn) => {
    const n = Math.round(SIZE / step) + 1;
    const data = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) data[j * n + i] = fn(-HALF + i * step, -HALF + j * step);
    return { n, step, data };
  };
  const readCoarse = ({ n, step, data }, x, z) => {
    const fx = Math.min(n - 1.0001, Math.max(0, (x + HALF) / step));
    const fz = Math.min(n - 1.0001, Math.max(0, (z + HALF) / step));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    let tx = fx - i;
    let tz = fz - j;
    tx = tx * tx * (3 - 2 * tx);
    tz = tz * tz * (3 - 2 * tz);
    const k = j * n + i;
    const a = data[k] + (data[k + 1] - data[k]) * tx;
    const b = data[k + n] + (data[k + n + 1] - data[k + n]) * tx;
    return a + (b - a) * tz;
  };
  const coarse = (fn) => field(16, fn);
  const coastWarpX = coarse((x, z) => 95 * fWarpX(x / 480, z / 480, 3));
  const coastWarpZ = coarse((x, z) => 95 * fWarpZ(x / 480 + 9, z / 480 - 4, 3));
  const hillWarpX = coarse((x, z) => 120 * fWarpX(x / 600 + 3, z / 600, 2));
  const hillWarpZ = coarse((x, z) => 120 * fWarpZ(x / 600, z / 600 + 3, 2));
  const seaNoise = coarse((x, z) => 2 * fDetail(x / 150, z / 150, 2));

  function coastDistance(x, z) {
    const wx = x + readCoarse(coastWarpX, x, z);
    const wz = z + readCoarse(coastWarpZ, x, z);
    angleF = angleIndex(wx, wz);
    let cd = lut(coastLut, angleF) - len2(wx, wz);
    const wPier = (1 - smooth(70, 190, Math.abs(z - PIER[1]))) * smooth(-600, -760, x);
    if (wPier > 0) cd = lerp(cd, x + 928 + 6 * fDetail(z / 60, 3.3, 2), wPier);
    return cd;
  }

  function baseHeight(x, z, cd) {
    if (cd < -260) return -40 + readCoarse(seaNoise, x, z);
    const pierCalm = 1 - (1 - smooth(60, 220, Math.abs(z - PIER[1]))) * smooth(-600, -780, x);
    const cliff = lut(cliffLut, angleF) * pierCalm;
    if (cd < 0) {
      const shelf = -2.5 * smooth(0, 40, -cd) - 37.5 * smooth(20, 240, -cd);
      const steep = -14 * smooth(0, 12, -cd) - 26 * smooth(12, 160, -cd);
      return lerp(shelf, steep, cliff) + 1.5 * fDetail(x / 90, z / 90, 2) * smooth(0, 60, -cd);
    }
    const beach = 3.2 * smooth(0, 70, cd);
    const profile = beach + cliff * 19 * (1 - Math.exp(-cd / 6)) * (1 - smooth(50, 260, cd));
    const inland = smooth(10, 320, cd);
    if (inland <= 0) return profile;
    const wx = x + readCoarse(hillWarpX, x, z);
    const wz = z + readCoarse(hillWarpZ, x, z);
    const hills = 0.5 + 0.5 * fHills(wx / 430, wz / 430, 5);
    const detail = fDetail(x / 70, z / 70, 2);
    return profile + inland * (5 + 34 * hills * hills + 2.2 * detail);
  }

  function massif(x, z) {
    const mx = x - MASSIF.peak[0];
    const mz = z - MASSIF.peak[1];
    const c = Math.cos(0.72);
    const s = Math.sin(0.72);
    const u = mx * c + mz * s;
    const v = -mx * s + mz * c;
    const d0 = Math.sqrt((u / 370) ** 2 + (v / 230) ** 2);
    if (d0 > 1.4) return 0;
    const d = d0 + 0.12 * fMassif(x / 300, z / 300, 2);
    if (d > 1.25) return 0;
    const core = 1 - smooth(0, 1.2, d);
    let ridged = 0;
    let amp = 0.5;
    let px = x / 210;
    let pz = z / 210;
    for (let o = 0; o < 4; o++) {
      const v = n[6](px, pz);
      const r = 1 - Math.sqrt(v * v + 0.035);
      ridged += amp * r * r;
      amp *= 0.45;
      const t = px * 0.8 - pz * 0.6;
      pz = (px * 0.6 + pz * 0.8) * 2.03 + 7;
      px = t * 2.03 + 1;
    }
    return 150 * core ** 1.6 + 120 * (ridged - 0.3) * core ** 0.9;
  }

  function hubShape(x, z, h) {
    const r = len2(x, z);
    if (r > 300) return h;
    h -= 9 * Math.exp(-(((r - 190) / 70) ** 2)) * smooth(-20, 140, Math.abs(z + 250) - 40 + Math.abs(x) * 0.3);
    const spur = 1 - smooth(70, 170, len2(x * 1.15, z + 225));
    if (spur > 0) h = lerp(h, Math.max(h, 46.5 + 1.2 * fZone(x / 50, z / 50, 2)), spur);
    const w = 1 - smooth(HUB.flatR, HUB.falloffR, r + 6 * fZone(x / 40, z / 40, 2) * smooth(HUB.flatR, HUB.flatR + 20, r));
    return lerp(h, HUB.y, w);
  }

  function rampHeight(z) {
    const { from, to, startY } = FEED.ramp;
    const t = (from[1] - z) / (from[1] - to[1]);
    if (t >= 1) return FEED.mesaY;
    return startY + (FEED.mesaY - startY) * t;
  }

  function feedShape(x, z, h) {
    const dx = x - FEED.center[0];
    const dz = z - FEED.center[1];
    const r = len2(dx, dz);
    if (r < FEED.footR + 40) {
      const a = Math.atan2(dz, dx);
      const rampCalm = dz > 0 ? smooth(18, 60, Math.abs(dx)) : 1;
      const gully = fRim(Math.cos(a) * 7 + 2, Math.sin(a) * 7 - 3, 2);
      const e = rampCalm * (10 * (0.5 + 0.5 * fRim(Math.cos(a) * 3, Math.sin(a) * 3, 3)) + 9 * Math.max(0, gully));
      const top = FEED.topR + e;
      const foot = Math.max(top + 65, FEED.footR + e * 1.3 + 12 * fRim(Math.cos(a) * 5 + 4, Math.sin(a) * 5, 2) + 10 * gully);
      const rr = r > top ? r + 9 * fRim(x / 38, z / 38, 2) * smooth(top, top + 25, r) : r;
      if (rr <= top) h = FEED.mesaY;
      else if (rr < foot) {
        const t = (rr - top) / (foot - top);
        const p = 1 - (1 - t) ** 2.6;
        h = FEED.mesaY + (h - FEED.mesaY) * p;
      }
      const { flatR, wallR, floorY } = FEED.pit;
      if (r < wallR) h = lerp(floorY, h, smooth(flatR, wallR, r));
    }
    if (z < -150 && z > FEED.ramp.to[1] - 4 && Math.abs(x) < 120) {
      const ramp = rampHeight(z) - Math.max(0, Math.abs(x) - FEED.ramp.width / 2) * 1.15;
      if (ramp > h) h = ramp;
    }
    return h;
  }

  function farmShape(x, z, h) {
    const r = len2(x - FARM.center[0], z - FARM.center[1]);
    if (r > 300) return h;
    const w = 1 - smooth(185, 285, r + 25 * fZone(x / 120, z / 120, 2));
    const target = FARM.y + 4 * fZone(x / 190 + 4, z / 190, 3);
    return lerp(h, target, w);
  }

  function halluShape(x, z, h) {
    const r = len2(x - HALLU.center[0], z - HALLU.center[1]);
    if (r > 270) return h;
    const { rimY, chasm, pillar } = HALLU;
    let c;
    if (r <= pillar.r) c = pillar.topY;
    else if (r < chasm.r0) c = lerp(pillar.topY, chasm.floorY, smooth(pillar.r, chasm.r0, r));
    else if (r <= chasm.r1) c = chasm.floorY + 0.6 * smooth(chasm.r0 + 4, chasm.r0 + 14, r) * (1 - smooth(chasm.r1 - 14, chasm.r1 - 4, r)) * fZone(x / 14, z / 14, 2);
    else if (r < 100) c = lerp(chasm.floorY, rimY, smooth(chasm.r1, 100, r));
    else c = rimY + 1.8 * fZone(x / 45, z / 45, 2) * smooth(100, 115, r) + 2.2 * Math.exp(-(((r - 150) / 14) ** 2));
    if (r <= 170) return c;
    return lerp(c, h, smooth(170, 250, r + 10 * fZone(x / 70, z / 70, 2)));
  }

  function oldwebShape(x, z, h) {
    const dx = x - OLDWEB.center[0];
    const dz = z - OLDWEB.center[1];
    const r = len2(dx, dz);
    if (r > 340) return h;
    const a = Math.atan2(dz, dx);
    let da = Math.abs(a + Math.PI / 4);
    if (da > Math.PI) da = 2 * Math.PI - da;
    const entrance = 1 - smooth(0.2, 0.42, da);
    const floor = OLDWEB.floorY + 1.4 * fZone(x / 60, z / 60, 2);
    const ring = 30 + 6 * fRim(x / 80, z / 80, 2);
    let target = r < 150 ? floor : lerp(floor, ring, smooth(150, 225, r) * (1 - entrance * 0.85));
    target = lerp(target, floor + 2, entrance * (1 - smooth(200, 300, r)) * smooth(140, 170, r));
    h = lerp(h, target, 1 - smooth(240, 335, r));
    const wobble = 6 * fRim(x / 30, z / 30, 1);
    for (const b of oldwebButtes) {
      const bx = x - b.x;
      const bz = z - b.z;
      const reach = b.r + 36;
      if (bx > reach || bx < -reach || bz > reach || bz < -reach) continue;
      const d = len2(bx, bz) + wobble;
      if (d > b.r + 30) continue;
      if (d <= b.r) h = Math.max(h, b.top);
      else {
        const t = (d - b.r) / 30;
        const p = 1 - (1 - t) ** 3;
        h = Math.max(h, b.top + (h - b.top) * p);
      }
    }
    return h;
  }

  function forestShape(x, z, h) {
    const r = len2(x - FOREST.center[0], z - FOREST.center[1]);
    if (r > 380) return h;
    h += 11 * Math.exp(-(((r - 300) / 45) ** 2));
    const w = 1 - smooth(200, 290, r + 20 * fZone(x / 90, z / 90, 2));
    const target = 24 + 6 * fZone(x / 85 + 2, z / 85, 3);
    return lerp(h, target, w);
  }

  function lighthouseShape(x, z, h) {
    const dx = x - LIGHTHOUSE.center[0];
    const dz = z - LIGHTHOUSE.center[1];
    if (dx > 150 || dx < -150 || dz > 150 || dz < -150) return h;
    const r = len2(dx, dz);
    if (r > 150) return h;
    const a = Math.atan2(dz, dx);
    const rr = r - 5 * fRim(Math.cos(a) * 2, Math.sin(a) * 2, 2) * smooth(30, 45, r);
    let i;
    if (rr <= LIGHTHOUSE.flatR) i = LIGHTHOUSE.plateauY;
    else if (rr < 50) i = lerp(LIGHTHOUSE.plateauY, 10.5, smooth(LIGHTHOUSE.flatR, 50, rr));
    else if (rr < 72) i = lerp(10.5, -0.6, smooth(50, 72, rr));
    else i = lerp(-0.6, -32, smooth(72, 140, rr));
    return Math.max(h, i);
  }

  const heights = new Float32Array(GRID * GRID);
  const coast = new Float32Array(GRID * GRID);
  for (let iz = 0; iz < GRID; iz++) {
    const z = -HALF + iz * CELL;
    for (let ix = 0; ix < GRID; ix++) {
      const x = -HALF + ix * CELL;
      const cd = coastDistance(x, z);
      let h = baseHeight(x, z, cd);
      if (cd > -200) {
        h += massif(x, z);
        h = hubShape(x, z, h);
        h = farmShape(x, z, h);
        h = halluShape(x, z, h);
        h = oldwebShape(x, z, h);
        h = forestShape(x, z, h);
        h = feedShape(x, z, h);
      }
      h = lighthouseShape(x, z, h);
      const k = iz * GRID + ix;
      heights[k] = h;
      coast[k] = cd;
    }
  }

  const sample = (x, z) => sampleGrid(heights, x, z);
  const paths = buildPaths(heights, sample, fPath);
  const pathMask = new Float32Array(GRID * GRID);
  flattenPaths(heights, paths, pathMask, fPath);

  const arrivals = {};
  for (const z of ZONE_DEFS) {
    if (!z.arrival) continue;
    const [ax, az] = z.arrival;
    flattenPad(heights, ax, az, 6, 16);
    arrivals[z.id] = [ax, sample(ax, az), az];
  }

  fillInlandSinks(heights, coast);

  const biomeEdge = field(8, (x, z) => 18 * fBiome(x / 70, z / 70, 2));
  const { biomeA, biomeB } = computeBiomes(heights, coast, pathMask, fBiome, (x, z) => readCoarse(biomeEdge, x, z));

  const zones = {};
  for (const def of ZONE_DEFS) {
    const entry = { id: def.id, name: def.name, center: Object.freeze([...def.center]), radius: def.radius };
    if (def.arrival) {
      entry.arrival = Object.freeze(arrivals[def.id]);
      entry.hubEnd = Object.freeze([def.hubDir[0] * 30, HUB.y, def.hubDir[1] * 30]);
    }
    zones[def.id] = entry;
  }
  Object.assign(zones.hub, { y: HUB.y, flatR: HUB.flatR, spawn: Object.freeze([0, HUB.y, 8, 0]) });
  Object.assign(zones.feed, {
    mesaY: FEED.mesaY, topR: FEED.topR, footR: FEED.footR,
    pit: Object.freeze({ center: Object.freeze([...FEED.center]), ...FEED.pit }),
    ramp: Object.freeze({ from: Object.freeze([0, FEED.ramp.startY, FEED.ramp.from[1]]), to: Object.freeze([0, FEED.mesaY, FEED.ramp.to[1]]), width: FEED.ramp.width }),
  });
  Object.assign(zones.farm, { y: FARM.y });
  Object.assign(zones.hallu, {
    rimY: HALLU.rimY, rimR: Object.freeze([...HALLU.rimR]),
    chasm: Object.freeze({ ...HALLU.chasm }), pillar: Object.freeze({ ...HALLU.pillar }),
  });
  Object.assign(zones.oldweb, { floorY: OLDWEB.floorY, mesas: Object.freeze(oldwebButtes.map((b) => Object.freeze({ x: b.x, z: b.z, r: b.r, top: b.top }))) });
  Object.assign(zones.lighthouse, {
    plateauY: LIGHTHOUSE.plateauY, flatR: LIGHTHOUSE.flatR, shoreR: LIGHTHOUSE.shoreR,
    pier: Object.freeze([PIER[0], sample(PIER[0], PIER[1]), PIER[1]]),
  });
  zones.feed.massifPeak = Object.freeze([MASSIF.peak[0], sample(MASSIF.peak[0], MASSIF.peak[1]), MASSIF.peak[1]]);
  for (const z of Object.values(zones)) Object.freeze(z);
  Object.freeze(zones);

  return assembleWorld({ heights, biomeA, biomeB, zones, paths, coast, generationMs: performance.now() - t0 });
}

function makeButtes(r) {
  const out = [];
  const [cx, cz] = OLDWEB.center;
  const ringAngles = [-2.6, -1.95, -1.25, 0.15, 0.75, 1.35, 1.95, 2.95];
  for (const base of ringAngles) {
    const a = base + (r() - 0.5) * 0.25;
    const d = 185 + r() * 60;
    out.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, r: 18 + r() * 24, top: 44 + r() * 16 });
  }
  for (const [a, d, rad, top] of [[0.9, 80, 12, 34], [-2.2, 95, 10, 30], [2.6, 70, 9, 38]]) {
    out.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, r: rad, top });
  }
  return out;
}

function fillInlandSinks(heights, coast) {
  const ocean = new Uint8Array(GRID * GRID);
  const stack = [];
  const seed = (k) => {
    if (!ocean[k] && heights[k] < 0) {
      ocean[k] = 1;
      stack.push(k);
    }
  };
  for (let i = 0; i < GRID; i++) {
    seed(i);
    seed((GRID - 1) * GRID + i);
    seed(i * GRID);
    seed(i * GRID + GRID - 1);
  }
  while (stack.length) {
    const k = stack.pop();
    const ix = k % GRID;
    if (ix > 0) seed(k - 1);
    if (ix < GRID - 1) seed(k + 1);
    if (k >= GRID) seed(k - GRID);
    if (k < GRID * (GRID - 1)) seed(k + GRID);
  }
  for (let k = 0; k < heights.length; k++) {
    if (ocean[k]) continue;
    const floor = coast[k] > 25 ? 1.2 : 0.4;
    if (heights[k] >= floor) continue;
    const x = -HALF + (k % GRID) * CELL;
    const z = -HALF + Math.floor(k / GRID) * CELL;
    if (!inDesignedHole(x, z)) heights[k] = floor + (heights[k] - floor) * 0.1;
  }
}

function inDesignedHole(x, z) {
  const rp = len2(x - FEED.center[0], z - FEED.center[1]);
  const rh = len2(x - HALLU.center[0], z - HALLU.center[1]);
  return rp < FEED.pit.wallR + 2 || (rh > HALLU.pillar.r - 2 && rh < 102);
}

function sampleGrid(arr, x, z) {
  let fx = (x + HALF) / CELL;
  let fz = (z + HALF) / CELL;
  fx = fx < 0 ? 0 : fx > GRID - 1 ? GRID - 1 : fx;
  fz = fz < 0 ? 0 : fz > GRID - 1 ? GRID - 1 : fz;
  let ix = Math.floor(fx);
  let iz = Math.floor(fz);
  if (ix > GRID - 2) ix = GRID - 2;
  if (iz > GRID - 2) iz = GRID - 2;
  const tx = fx - ix;
  const tz = fz - iz;
  const k = iz * GRID + ix;
  const h00 = arr[k];
  const h10 = arr[k + 1];
  const h01 = arr[k + GRID];
  const h11 = arr[k + GRID + 1];
  if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
  return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
}

function buildPaths(heights, sample, fPath) {
  const STEP = 16;
  const N = Math.floor(SIZE / STEP) + 1;
  const hAt = (i, j) => sample(-HALF + i * STEP, -HALF + j * STEP);
  const nodeH = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) nodeH[j * N + i] = hAt(i, j);
  const wiggle = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) wiggle[j * N + i] = 0.5 + 0.5 * fPath((-HALF + i * STEP) / 160, (-HALF + j * STEP) / 160, 2);

  const toNode = (x, z) => [Math.round((x + HALF) / STEP), Math.round((z + HALF) / STEP)];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  function astar(from, to) {
    const [si, sj] = toNode(...from);
    const [ti, tj] = toNode(...to);
    const g = new Float32Array(N * N).fill(Infinity);
    const came = new Int32Array(N * N).fill(-1);
    const closed = new Uint8Array(N * N);
    const heap = [];
    const push = (k, fScore) => {
      heap.push([fScore, k]);
      let c = heap.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (heap[p][0] <= heap[c][0]) break;
        [heap[p], heap[c]] = [heap[c], heap[p]];
        c = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let c = 0;
        for (;;) {
          const l = c * 2 + 1;
          const r = l + 1;
          let m = c;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === c) break;
          [heap[m], heap[c]] = [heap[c], heap[m]];
          c = m;
        }
      }
      return top;
    };
    const start = sj * N + si;
    const goal = tj * N + ti;
    g[start] = 0;
    push(start, 0);
    while (heap.length) {
      const [, k] = pop();
      if (k === goal) break;
      if (closed[k]) continue;
      closed[k] = 1;
      const i = k % N;
      const j = (k - i) / N;
      for (const [di, dj] of DIRS) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni;
        if (closed[nk]) continue;
        const h = nodeH[nk];
        if (h < 1.5) continue;
        const len = STEP * (di && dj ? Math.SQRT2 : 1);
        const s = Math.abs(h - nodeH[k]) / len;
        if (s > 0.9) continue;
        const cost = len * (1 + 60 * s * s + 1.4 * wiggle[nk]);
        const ng = g[k] + cost;
        if (ng < g[nk]) {
          g[nk] = ng;
          came[nk] = k;
          push(nk, ng + len2(ni - ti, nj - tj) * STEP * 1.05);
        }
      }
    }
    const pts = [];
    for (let k = goal; k !== -1; k = came[k]) pts.push([-HALF + (k % N) * STEP, -HALF + Math.floor(k / N) * STEP]);
    pts.reverse();
    pts[0] = [...from];
    pts[pts.length - 1] = [...to];
    return pts;
  }

  function chaikin(pts, iterations) {
    let p = pts;
    for (let it = 0; it < iterations; it++) {
      const q = [p[0]];
      for (let i = 0; i < p.length - 1; i++) {
        const [ax, az] = p[i];
        const [bx, bz] = p[i + 1];
        q.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
      }
      q.push(p[p.length - 1]);
      p = q;
    }
    return p;
  }

  function resample(pts, spacing) {
    const out = [pts[0]];
    let carry = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = len2(bx - ax, bz - az);
      let d = spacing - carry;
      while (d < len) {
        const t = d / len;
        out.push([ax + (bx - ax) * t, az + (bz - az) * t]);
        d += spacing;
      }
      carry = len - (d - spacing);
    }
    const last = pts[pts.length - 1];
    const prev = out[out.length - 1];
    if (len2(prev[0] - last[0], prev[1] - last[1]) < spacing * 0.5) out.pop();
    out.push(last);
    return out;
  }

  const result = [];
  for (const def of ZONE_DEFS) {
    if (!def.arrival || def.id === 'lighthouse') continue;
    const start = [def.hubDir[0] * 30, def.hubDir[1] * 30];
    let pts;
    let fixedFrom = Infinity;
    if (def.id === 'feed') {
      const join = [0, FEED.ramp.from[1] + 18];
      const free = resample(chaikin(astar(start, join), 3), 4);
      const straight = [];
      for (let z = join[1] - 4; z >= def.arrival[1]; z -= 4) straight.push([0, z]);
      if (straight[straight.length - 1][1] !== def.arrival[1]) straight.push([0, def.arrival[1]]);
      fixedFrom = free.length - 1;
      pts = free.concat(straight);
    } else {
      pts = resample(chaikin(astar(start, def.arrival), 3), 4);
    }
    const raw = pts.map(([x, z]) => sample(x, z));
    const ys = raw.map((y, i) => {
      if (i >= fixedFrom) return y;
      const w = Math.min(6, i, raw.length - 1 - i);
      let s = 0;
      for (let k = -w; k <= w; k++) s += raw[i + k];
      return s / (2 * w + 1);
    });
    result.push({ to: def.id, points: pts, ys, width: 4 });
  }
  return result;
}

function flattenPaths(heights, paths, pathMask, fPath) {
  const INNER = 3;
  const OUTER = 9;
  const best = new Float32Array(GRID * GRID).fill(1e9);
  const bestY = new Float32Array(GRID * GRID);
  for (const p of paths) {
    for (let i = 0; i < p.points.length - 1; i++) {
      const [ax, az] = p.points[i];
      const [bx, bz] = p.points[i + 1];
      const ay = p.ys[i];
      const by = p.ys[i + 1];
      const minX = Math.max(0, Math.floor((Math.min(ax, bx) - OUTER + HALF) / CELL));
      const maxX = Math.min(GRID - 1, Math.ceil((Math.max(ax, bx) + OUTER + HALF) / CELL));
      const minZ = Math.max(0, Math.floor((Math.min(az, bz) - OUTER + HALF) / CELL));
      const maxZ = Math.min(GRID - 1, Math.ceil((Math.max(az, bz) + OUTER + HALF) / CELL));
      const ex = bx - ax;
      const ez = bz - az;
      const ll = ex * ex + ez * ez || 1;
      for (let iz = minZ; iz <= maxZ; iz++) {
        const z = -HALF + iz * CELL;
        for (let ix = minX; ix <= maxX; ix++) {
          const x = -HALF + ix * CELL;
          const t = clamp01(((x - ax) * ex + (z - az) * ez) / ll);
          const d = len2(x - ax - ex * t, z - az - ez * t);
          const k = iz * GRID + ix;
          if (d < best[k]) {
            best[k] = d;
            bestY[k] = ay + (by - ay) * t;
          }
        }
      }
    }
  }
  for (let k = 0; k < best.length; k++) {
    const d = best[k];
    if (d >= OUTER) continue;
    const x = -HALF + (k % GRID) * CELL;
    const z = -HALF + Math.floor(k / GRID) * CELL;
    const w = (1 - smooth(INNER, OUTER, d)) * smooth(HUB.flatR + 2, HUB.flatR + 14, len2(x, z));
    heights[k] = lerp(heights[k], bestY[k], w);
    const edge = 2.1 + 0.7 * fPath(x / 9, z / 9, 2);
    pathMask[k] = 1 - smooth(edge - 0.6, edge + 1.2, d);
  }
}

function flattenPad(heights, cx, cz, inner, outer) {
  const y = sampleGrid(heights, cx, cz);
  const r0 = Math.floor((cx - outer + HALF) / CELL);
  const r1 = Math.ceil((cx + outer + HALF) / CELL);
  const c0 = Math.floor((cz - outer + HALF) / CELL);
  const c1 = Math.ceil((cz + outer + HALF) / CELL);
  for (let iz = c0; iz <= c1; iz++) {
    for (let ix = r0; ix <= r1; ix++) {
      const d = len2(-HALF + ix * CELL - cx, -HALF + iz * CELL - cz);
      if (d >= outer) continue;
      const k = iz * GRID + ix;
      heights[k] = lerp(heights[k], y, 1 - smooth(inner, outer, d));
    }
  }
}

function computeBiomes(heights, coast, pathMask, fBiome, edgeAt) {
  const biomeA = new Uint8Array(GRID * GRID * 4);
  const biomeB = new Uint8Array(GRID * GRID * 4);
  const zoneMask = (x, z, c, r0, r1, e) => {
    const dx = x - c[0];
    const dz = z - c[1];
    const reach = r1 + 20;
    if (dx > reach || dx < -reach || dz > reach || dz < -reach) return 0;
    return 1 - smooth(r0, r1, len2(dx, dz) + e);
  };
  for (let iz = 0; iz < GRID; iz++) {
    const z = -HALF + iz * CELL;
    for (let ix = 0; ix < GRID; ix++) {
      const x = -HALF + ix * CELL;
      const k = iz * GRID + ix;
      const h = heights[k];
      const hx = heights[iz * GRID + Math.min(GRID - 1, ix + 1)] - heights[iz * GRID + Math.max(0, ix - 1)];
      const hz = heights[Math.min(GRID - 1, iz + 1) * GRID + ix] - heights[Math.max(0, iz - 1) * GRID + ix];
      const gx = hx / (2 * CELL);
      const gz = hz / (2 * CELL);
      const slope = 1 - 1 / Math.sqrt(1 + gx * gx + gz * gz);
      const land = h > -1;
      const e = land ? edgeAt(x, z) : 0;
      let feed = zoneMask(x, z, FEED.center, 240, 290, e);
      let farm = zoneMask(x, z, FARM.center, 200, 265, e);
      let hallu = zoneMask(x, z, HALLU.center, 180, 235, e);
      let oldweb = zoneMask(x, z, OLDWEB.center, 235, 300, e);
      let forest = zoneMask(x, z, FOREST.center, 235, 300, e);
      const coastal = 1 - smooth(120, 200, coast[k]);
      let sand = !land ? 1 : (1 - smooth(2.4 + 1.2 * fBiome(x / 25, z / 25, 1), 4.6, h)) * (1 - smooth(0.06, 0.16, slope)) * coastal;
      let rock = smooth(0.09, 0.2, slope + (land ? 0.03 * fBiome(x / 18 + 3, z / 18, 1) : 0)) + smooth(135, 165, h) * 0.6;
      rock = Math.min(1, rock);
      sand *= 1 - rock;
      const sum = feed + farm + hallu + oldweb + forest + sand + rock;
      if (sum > 1) {
        const s = 1 / sum;
        feed *= s; farm *= s; hallu *= s; oldweb *= s; forest *= s; sand *= s; rock *= s;
      }
      const o = k * 4;
      biomeA[o] = feed * 255 + 0.5;
      biomeA[o + 1] = farm * 255 + 0.5;
      biomeA[o + 2] = hallu * 255 + 0.5;
      biomeA[o + 3] = oldweb * 255 + 0.5;
      biomeB[o] = forest * 255 + 0.5;
      biomeB[o + 1] = sand * 255 + 0.5;
      biomeB[o + 2] = rock * 255 + 0.5;
      biomeB[o + 3] = pathMask[k] * 255 + 0.5;
    }
  }
  return { biomeA, biomeB };
}

function assembleWorld({ heights, biomeA, biomeB, zones, paths, coast, generationMs }) {
  const heightAt = (x, z) => sampleGrid(heights, x, z);

  function normalAt(x, z, target = new THREE.Vector3()) {
    const e = CELL * 0.5;
    const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
    const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    return target.set(-gx, 1, -gz).normalize();
  }

  const tmpN = new THREE.Vector3();
  const slopeAt = (x, z) => 1 - normalAt(x, z, tmpN).y;

  function biomeRead(arr, x, z, c) {
    let fx = (x + HALF) / CELL;
    let fz = (z + HALF) / CELL;
    fx = Math.min(GRID - 1.001, Math.max(0, fx));
    fz = Math.min(GRID - 1.001, Math.max(0, fz));
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const k = (iz * GRID + ix) * 4 + c;
    const a = arr[k] + (arr[k + 4] - arr[k]) * tx;
    const b = arr[k + GRID * 4] + (arr[k + GRID * 4 + 4] - arr[k + GRID * 4]) * tx;
    return (a + (b - a) * tz) / 255;
  }

  function biomeAt(x, z) {
    const out = {
      feed: biomeRead(biomeA, x, z, 0), farm: biomeRead(biomeA, x, z, 1),
      hallu: biomeRead(biomeA, x, z, 2), oldweb: biomeRead(biomeA, x, z, 3),
      forest: biomeRead(biomeB, x, z, 0), sand: biomeRead(biomeB, x, z, 1),
      rock: biomeRead(biomeB, x, z, 2), path: biomeRead(biomeB, x, z, 3),
    };
    out.meadow = clamp01(1 - (out.feed + out.farm + out.hallu + out.oldweb + out.forest + out.sand + out.rock));
    return out;
  }

  function surfaceAt(x, z) {
    if (heightAt(x, z) < 0.3) return 'sand';
    const b = biomeAt(x, z);
    if (b.path > 0.5) return 'dirt';
    let best = 'grass';
    let w = b.meadow + b.farm + b.forest;
    if (b.rock + b.feed + b.hallu > w) { best = 'stone'; w = b.rock + b.feed + b.hallu; }
    if (b.sand + b.oldweb > w) best = 'sand';
    return best;
  }

  const zoneList = Object.values(zones);
  function zoneAt(x, z) {
    let best = null;
    let bestD = 1;
    for (const zone of zoneList) {
      const d = len2(x - zone.center[0], z - zone.center[1]) / zone.radius;
      if (d < bestD) {
        bestD = d;
        best = zone.id;
      }
    }
    return best;
  }

  const clearings = [];
  function addClearing({ x, z, r, trees = true, grass = false, rocks = true }) {
    const c = Object.freeze({ x, z, r, trees, grass, rocks });
    clearings.push(c);
    return c;
  }
  function clearedAt(x, z, kind = 'trees') {
    for (const c of clearings) {
      if (c[kind] && (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true;
    }
    return false;
  }

  const heightTexture = new THREE.DataTexture(heights, GRID, GRID, THREE.RedFormat, THREE.FloatType);
  const biomeTextureA = new THREE.DataTexture(biomeA, GRID, GRID, THREE.RGBAFormat, THREE.UnsignedByteType);
  const biomeTextureB = new THREE.DataTexture(biomeB, GRID, GRID, THREE.RGBAFormat, THREE.UnsignedByteType);
  for (const t of [heightTexture, biomeTextureA, biomeTextureB]) {
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = false;
    t.needsUpdate = true;
  }

  function terrainGeometry({ step = 1, bounds = null } = {}) {
    const [x0, z0, x1, z1] = bounds || [-HALF, -HALF, HALF, HALF];
    const i0 = Math.max(0, Math.round((x0 + HALF) / CELL));
    const j0 = Math.max(0, Math.round((z0 + HALF) / CELL));
    const i1 = Math.min(GRID - 1, Math.round((x1 + HALF) / CELL));
    const j1 = Math.min(GRID - 1, Math.round((z1 + HALF) / CELL));
    const nx = Math.floor((i1 - i0) / step) + 1;
    const nz = Math.floor((j1 - j0) / step) + 1;
    const pos = new Float32Array(nx * nz * 3);
    const nor = new Float32Array(nx * nz * 3);
    const uvs = new Float32Array(nx * nz * 2);
    const n = new THREE.Vector3();
    for (let b = 0; b < nz; b++) {
      for (let a = 0; a < nx; a++) {
        const ix = i0 + a * step;
        const iz = j0 + b * step;
        const x = -HALF + ix * CELL;
        const z = -HALF + iz * CELL;
        const v = b * nx + a;
        pos[v * 3] = x;
        pos[v * 3 + 1] = heights[iz * GRID + ix];
        pos[v * 3 + 2] = z;
        normalAt(x, z, n);
        nor[v * 3] = n.x;
        nor[v * 3 + 1] = n.y;
        nor[v * 3 + 2] = n.z;
        uvs[v * 2] = (x + HALF) / SIZE;
        uvs[v * 2 + 1] = (z + HALF) / SIZE;
      }
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let o = 0;
    for (let b = 0; b < nz - 1; b++) {
      for (let a = 0; a < nx - 1; a++) {
        const v00 = b * nx + a;
        const v10 = v00 + 1;
        const v01 = v00 + nx;
        const v11 = v01 + 1;
        idx[o++] = v00; idx[o++] = v01; idx[o++] = v10;
        idx[o++] = v10; idx[o++] = v01; idx[o++] = v11;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  return {
    SIZE, HALF, GRID, CELL, SEA_LEVEL,
    heights, coastDistance: coast, generationMs,
    heightAt, normalAt, slopeAt, biomeAt, surfaceAt, zoneAt,
    zones, paths: Object.freeze(paths.map((p) => Object.freeze({ to: p.to, width: p.width, points: p.points }))),
    uv: (x, z) => [(x + HALF) / SIZE, (z + HALF) / SIZE],
    heightTexture, biomeTextureA, biomeTextureB,
    addClearing, clearedAt, clearings,
    terrainGeometry,
  };
}
