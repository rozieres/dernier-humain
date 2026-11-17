import RAPIER from '@dimforge/rapier3d-compat';
import { createWorld } from '../src/world/worldmap.js';
import { terrainHeightfieldDesc } from '../src/core/physics.js';
import { seeded } from '../src/core/rng.js';

let failures = 0;
const results = [];
function check(label, ok, detail = '') {
  results.push(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const f1 = (v) => (typeof v === 'number' ? v.toFixed(2) : v);

createWorld();
const t0 = performance.now();
const world = createWorld();
const genMs = performance.now() - t0;
const again = createWorld();
const { heightAt, zones } = world;
const deg = (slope01) => (Math.acos(1 - slope01) * 180) / Math.PI;

check('generation time < 400 ms', genMs < 400, `${genMs.toFixed(0)} ms`);
check('deterministic heights', world.heights.every((h, i) => h === again.heights[i]));
check('deterministic paths', JSON.stringify(world.paths) === JSON.stringify(again.paths));

function flatDisc(label, cx, cz, r, target, { tol = 0.6, inner = 0 } = {}) {
  let worst = 0;
  const { GRID: G, CELL: C, HALF: H, heights: hs } = world;
  for (let iz = Math.floor((cz - r + H) / C); iz <= Math.ceil((cz + r + H) / C); iz++) {
    for (let ix = Math.floor((cx - r + H) / C); ix <= Math.ceil((cx + r + H) / C); ix++) {
      const d = Math.hypot(-H + ix * C - cx, -H + iz * C - cz);
      if (d > r || d < inner) continue;
      worst = Math.max(worst, Math.abs(hs[iz * G + ix] - target));
    }
  }
  check(`${label} flat at y=${target} (${inner ? `${inner} ≤ ` : ''}r ≤ ${r}, grid samples)`, worst <= tol, `max deviation ${f1(worst)} m`);
}

flatDisc('hub hilltop', 0, 0, 46, 38);
flatDisc('feed mesa top', 0, -640, 170, 124, { inner: 38 });
flatDisc('feed pit floor', 0, -640, 30, 8);
flatDisc('hallu pillar top', 330, 600, 26, 50);
flatDisc('lighthouse plateau', -1140, 170, 30, 14);

const pitWall = [];
for (let a = 0; a < 32; a++) {
  const ang = (a / 32) * Math.PI * 2;
  pitWall.push(heightAt(Math.cos(ang) * 34, -640 + Math.sin(ang) * 34));
}
check('feed pit wall rises between r 30 and 38', heightAt(38, -640) > 110 && Math.min(...pitWall) > 20 && Math.max(...pitWall) < 110,
  `y(r=34) ${f1(Math.min(...pitWall))}..${f1(Math.max(...pitWall))}, y(r=38) ${f1(heightAt(38, -640))}`);
check('feed pit edge at mesa height', Math.abs(heightAt(0, -640 + 40) - 124) < 0.6, f1(heightAt(0, -600)));

let rampMax = 0;
let rampSideDev = 0;
for (let z = -250; z > -468; z -= 2) {
  const s = Math.abs(heightAt(0, z - 2) - heightAt(0, z)) / 2;
  rampMax = Math.max(rampMax, (Math.atan(s) * 180) / Math.PI);
  for (const x of [-8, 8]) rampSideDev = Math.max(rampSideDev, Math.abs(heightAt(x, z) - heightAt(0, z)));
}
check('feed ramp slope ≤ 20° along centerline', rampMax <= 20, `${f1(rampMax)}°`);
check('feed ramp 18 m wide (flat across ±8 m)', rampSideDev < 0.6, `max cross deviation ${f1(rampSideDev)} m`);
check('feed ramp reaches the mesa', Math.abs(heightAt(0, -468) - 124) < 0.6, f1(heightAt(0, -468)));

const hc = [330, 600];
const ring = (r) => Array.from({ length: 48 }, (_, a) => heightAt(hc[0] + Math.cos((a / 48) * 6.283) * r, hc[1] + Math.sin((a / 48) * 6.283) * r));
const chasm = [...ring(45), ...ring(60), ...ring(80)];
const rim = [...ring(110), ...ring(135), ...ring(160)];
check('hallu chasm floor y≈6', chasm.every((h) => Math.abs(h - 6) < 1.2), `${f1(Math.min(...chasm))}..${f1(Math.max(...chasm))}`);
check('hallu rim y≈46', rim.every((h) => Math.abs(h - 46) < 4), `${f1(Math.min(...rim))}..${f1(Math.max(...rim))}`);
check('hallu chasm walls steep', heightAt(hc[0] + 100, hc[1]) - heightAt(hc[0] + 92, hc[1]) > 30 && heightAt(hc[0] + 26, hc[1]) - heightAt(hc[0] + 34, hc[1]) > 35);

const farm = [];
for (let i = 0; i < 200; i++) {
  const r = seeded(5);
  const a = r() * 6.283;
  const d = Math.sqrt(r()) * 170;
  farm.push(heightAt(640 + Math.cos(a) * d, -60 + Math.sin(a) * d));
}
check('farm plain y≈24 ± 5', farm.every((h) => Math.abs(h - 24) <= 5), `${f1(Math.min(...farm))}..${f1(Math.max(...farm))}`);
const owFloor = [];
for (let i = 0; i < 400; i++) {
  const a = i * 2.39996;
  const d = Math.sqrt(i / 400) * 140;
  const x = -520 + Math.cos(a) * d;
  const z = 520 + Math.sin(a) * d;
  if (zones.oldweb.mesas.some((m) => Math.hypot(x - m.x, z - m.z) < m.r + 34)) continue;
  owFloor.push(heightAt(x, z));
}
check('oldweb basin floor y≈16 (r ≤ 140, away from buttes)', owFloor.every((h) => Math.abs(h - 16) < 3), `${f1(Math.min(...owFloor))}..${f1(Math.max(...owFloor))}`);
const mesaTops = zones.oldweb.mesas.map((m) => heightAt(m.x, m.z));
check('oldweb mesas up to ~60 around the basin', Math.max(...mesaTops) <= 61 && Math.max(...mesaTops) > 50, `${f1(Math.min(...mesaTops))}..${f1(Math.max(...mesaTops))}`);
const forest = Array.from({ length: 200 }, (_, i) => {
  const a = i * 2.39996;
  const d = Math.sqrt(i / 200) * 200;
  return heightAt(-620 + Math.cos(a) * d, -330 + Math.sin(a) * d);
});
check('forest basin y 18–30', forest.every((h) => h >= 17 && h <= 31), `${f1(Math.min(...forest))}..${f1(Math.max(...forest))}`);

let peak = -Infinity;
let peakAt = null;
for (let x = 250; x < 700; x += 4) for (let z = -650; z < -200; z += 4) if (heightAt(x, z) > peak) { peak = heightAt(x, z); peakAt = [x, z]; }
check('Monts du Cache peak ≈185 m near (470, -430)', Math.abs(peak - 185) < 12 && Math.hypot(peakAt[0] - 470, peakAt[1] + 430) < 90, `${f1(peak)} m at ${peakAt}`);

for (const z of Object.values(zones)) {
  if (z.id === 'hub') continue;
  const bad = [];
  for (let a = 0; a < 72; a++) {
    const ang = (a / 72) * Math.PI * 2;
    const x = z.center[0] + Math.cos(ang) * z.radius * 0.85;
    const zz = z.center[1] + Math.sin(ang) * z.radius * 0.85;
    const sw = z.id === 'oldweb' && Math.cos(ang) < -0.3 && Math.sin(ang) > 0.3;
    if (heightAt(x, zz) <= 0 && !sw) bad.push((ang * 180 / Math.PI).toFixed(0));
  }
  check(`${z.id}: center + 0.85·r on land`, bad.length === 0, bad.length ? `under sea at ${bad.join(', ')}°` : '');
}

for (const z of Object.values(zones)) {
  if (!z.arrival) continue;
  const [x, y, zz] = z.arrival;
  const slope = deg(world.slopeAt(x, zz));
  check(`${z.id} arrival on land, slope < 15°`, y > 0.5 && slope < 15 && Math.abs(heightAt(x, zz) - y) < 1e-4, `y ${f1(y)}, ${f1(slope)}°`);
}

const lh = zones.lighthouse;
let minGap = Infinity;
const lhLand = [];
const mainLand = [];
for (let x = -1250; x < -700; x += 4) {
  for (let z = -200; z < 540; z += 4) {
    if (heightAt(x, z) <= 0) continue;
    if (Math.hypot(x - lh.center[0], z - lh.center[1]) < 140) lhLand.push([x, z]);
    else mainLand.push([x, z]);
  }
}
for (const [a, b] of lhLand) for (const [c, d] of mainLand) minGap = Math.min(minGap, Math.hypot(a - c, b - d));
check('lighthouse island ≥ 100 m of sea from the main island', minGap >= 100, `${f1(minGap)} m`);
check('pier site on the west coast', heightAt(-915, 170) > -1.5 && heightAt(-915, 170) < 3 && heightAt(-960, 170) < 0, `y(-915) ${f1(heightAt(-915, 170))}, y(-960) ${f1(heightAt(-960, 170))}`);

const { GRID, CELL, HALF, heights } = world;
const ocean = new Uint8Array(GRID * GRID);
const stack = [];
for (let i = 0; i < GRID; i++) for (const k of [i, (GRID - 1) * GRID + i, i * GRID, i * GRID + GRID - 1]) if (heights[k] < 0 && !ocean[k]) { ocean[k] = 1; stack.push(k); }
while (stack.length) {
  const k = stack.pop();
  const ix = k % GRID;
  const iz = (k - ix) / GRID;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = ix + dx;
    const nz = iz + dz;
    if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID) continue;
    const n = nz * GRID + nx;
    if (!ocean[n] && heights[n] < 0) { ocean[n] = 1; stack.push(n); }
  }
}
const sinks = [];
for (let k = 0; k < heights.length; k++) {
  if (heights[k] >= 0 || ocean[k]) continue;
  const x = -HALF + (k % GRID) * CELL;
  const z = -HALF + Math.floor(k / GRID) * CELL;
  sinks.push([x, z]);
}
check('no inland point below sea level', sinks.length === 0, sinks.length ? `${sinks.length} cells, e.g. ${sinks.slice(0, 3).join(' | ')}` : '');

let spikes = 0;
for (let iz = 1; iz < GRID - 1; iz++) {
  for (let ix = 1; ix < GRID - 1; ix++) {
    const k = iz * GRID + ix;
    const h = heights[k];
    const nb = [k - 1, k + 1, k - GRID, k + GRID, k - GRID - 1, k - GRID + 1, k + GRID - 1, k + GRID + 1].map((n) => heights[n]);
    if (nb.every((n) => h - n > 4) || nb.every((n) => n - h > 4)) spikes++;
  }
}
check('no needle spikes or single-cell pits', spikes === 0, `${spikes}`);
const minH = heights.reduce((m, h) => Math.min(m, h), Infinity);
check('sea floor reaches about −40', minH > -45 && heights[0] < -30, `min ${f1(minH)}`);
check('paths reach every arrival', world.paths.length === 5 && world.paths.every((p) => {
  const last = p.points[p.points.length - 1];
  const arr = zones[p.to].arrival;
  return Math.hypot(last[0] - arr[0], last[1] - arr[2]) < 0.01;
}));
const feedPath = world.paths.find((p) => p.to === 'feed');
check('feed path climbs the ramp', feedPath.points.filter(([x, z]) => z < -260 && z > -460).every(([x]) => Math.abs(x) < 0.01));

await RAPIER.init();
const rw = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
rw.createCollider(terrainHeightfieldDesc(world));
rw.step();
const r = seeded(42);
let worst = 0;
let misses = 0;
let bilinearWorst = 0;
for (let i = 0; i < 300; i++) {
  const x = (r() * 2 - 1) * (HALF - 2);
  const z = (r() * 2 - 1) * (HALF - 2);
  const hit = rw.castRay(new RAPIER.Ray({ x, y: 400, z }, { x: 0, y: -1, z: 0 }), 1000, true);
  if (!hit) {
    misses++;
    continue;
  }
  const y = 400 - hit.timeOfImpact;
  worst = Math.max(worst, Math.abs(y - heightAt(x, z)));
  const fx = (x + HALF) / CELL;
  const fz = (z + HALF) / CELL;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const h = (a, b) => heights[(iz + b) * GRID + ix + a];
  const bil = (h(0, 0) * (1 - tx) + h(1, 0) * tx) * (1 - tz) + (h(0, 1) * (1 - tx) + h(1, 1) * tx) * tz;
  bilinearWorst = Math.max(bilinearWorst, Math.abs(y - bil));
}
check('300 Rapier raycasts hit within 0.15 m of heightAt', misses === 0 && worst <= 0.15, `worst ${worst.toFixed(4)} m, misses ${misses} (bilinear would differ by up to ${f1(bilinearWorst)} m)`);

console.log(results.join('\n'));
console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'} · generation ${genMs.toFixed(0)} ms`);
process.exit(failures ? 1 : 0);
