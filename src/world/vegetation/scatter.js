import * as THREE from 'three';

const TREE_CAP = { low: 2400, medium: 4000, high: 6000, ultra: 6000 };
const SHRUB_CAP = { low: 1200, medium: 2200, high: 3200, ultra: 4000 };
const ROCK_CAP = { low: 900, medium: 1500, high: 2200, ultra: 2800 };

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const color = (hex, r, dh = 0.03, ds = 0.08, dl = 0.08) => {
  const c = new THREE.Color(hex);
  c.offsetHSL((r() - 0.5) * dh * 2, (r() - 0.5) * ds * 2, (r() - 0.5) * dl * 2);
  return c;
};

export function scatter(ctx) {
  const { world, rng, quality } = ctx;
  const tier = quality.tier;
  const fbm = rng.makeFbm2(rng.makeNoise2(4242));
  const zones = world.zones;
  const trees = [];
  const shrubs = [];
  const rocks = [];
  const blocked = [];

  const hubEnds = Object.values(zones).filter((z) => z.arrival).flatMap((z) => [z.arrival, z.hubEnd]);
  const nearPath = (x, z, d = 4) => {
    if (world.biomeAt(x, z).path > 0.02) return true;
    return world.biomeAt(x + d, z).path > 0.05 || world.biomeAt(x - d, z).path > 0.05
      || world.biomeAt(x, z + d).path > 0.05 || world.biomeAt(x, z - d).path > 0.05;
  };
  const isBlocked = (x, z) => blocked.some((b) => (x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r);
  const reserved = (x, z, r = 14) => {
    if (x * x + z * z < 60 * 60) return true;
    for (const p of hubEnds) if ((x - p[0]) ** 2 + (z - p[2]) ** 2 < r * r) return true;
    const hc = zones.hallu.center;
    if ((x - hc[0]) ** 2 + (z - hc[1]) ** 2 < 104 * 104) return true;
    const fc = zones.feed.center;
    if ((x - fc[0]) ** 2 + (z - fc[1]) ** 2 < 270 * 270) return true;
    const lc = zones.lighthouse.center;
    if ((x - lc[0]) ** 2 + (z - lc[1]) ** 2 < 40 * 40) return true;
    const pier = zones.lighthouse.pier;
    if ((x - pier[0]) ** 2 + (z - pier[2]) ** 2 < 30 * 30) return true;
    return false;
  };

  function plant(list, item) {
    item.y = world.heightAt(item.x, item.z);
    list.push(item);
    return item;
  }

  // Clone groves: identical trees on an exact grid, seen from the hub and along the paths.
  const groves = [];
  const r0 = rng.seeded('dh-groves');
  const cloneSpec = { h: 9.5, w: 9.5, color: new THREE.Color('#7fcf5e') };
  const flatEnough = (x, z, rad) => {
    for (let a = 0; a < 8; a++) {
      const px = x + Math.cos(a) * rad;
      const pz = z + Math.sin(a) * rad;
      if (world.slopeAt(px, pz) > 0.06 || world.heightAt(px, pz) < 3) return false;
      const b = world.biomeAt(px, pz);
      if (b.meadow < 0.7 || world.clearedAt(px, pz, 'trees')) return false;
    }
    return true;
  };
  for (const [to, side, dist] of [['farm', 1, 150], ['hallu', -1, 170], ['oldweb', 1, 160], ['forest', -1, 140], ['farm', -1, 260], ['hallu', 1, 290]]) {
    const path = world.paths.find((p) => p.to === to);
    if (!path) continue;
    let placed = false;
    for (let tryD = 0; tryD < 12 && !placed; tryD++) {
      const target = dist + (tryD % 2 ? -1 : 1) * Math.ceil(tryD / 2) * 18;
      const i = path.points.findIndex(([x, z]) => Math.hypot(x, z) > target);
      if (i < 1 || i >= path.points.length - 1) continue;
      const [ax, az] = path.points[i - 1];
      const [bx, bz] = path.points[i + 1];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const dir = [(bx - ax) / len, (bz - az) / len];
      const nrm = [-dir[1] * side, dir[0] * side];
      const [px, pz] = path.points[i];
      const cx = px + nrm[0] * 30;
      const cz = pz + nrm[1] * 30;
      if (!flatEnough(cx, cz, 22) || isBlocked(cx, cz) || reserved(cx, cz)) continue;
      const yaw = Math.atan2(dir[0], dir[1]);
      const rows = 4;
      const cols = 5;
      const sp = 8;
      for (let a = 0; a < cols; a++) {
        for (let b = 0; b < rows; b++) {
          const u = (a - (cols - 1) / 2) * sp;
          const v = (b - (rows - 1) / 2) * sp;
          const x = cx + dir[0] * u + nrm[0] * v;
          const z = cz + dir[1] * u + nrm[1] * v;
          plant(trees, { type: 'clone', x, z, yaw: 0, h: cloneSpec.h, w: cloneSpec.w, color: cloneSpec.color, bark: new THREE.Color('#6b5a48'), key: -1 });
        }
      }
      blocked.push({ x: cx, z: cz, r: 30 });
      groves.push({ x: cx, z: cz, dir, rows, cols, spacing: sp, path: to });
      placed = true;
    }
  }

  // Avenue of clones on the feed approach.
  const feedPath = world.paths.find((p) => p.to === 'feed');
  if (feedPath) {
    let lastD = -Infinity;
    for (let i = 1; i < feedPath.points.length - 1; i++) {
      const [x, z] = feedPath.points[i];
      const d = Math.hypot(x, z);
      if (d < 80 || d > 230 || d - lastD < 11) continue;
      lastD = d;
      const [ax, az] = feedPath.points[i - 1];
      const [bx, bz] = feedPath.points[i + 1];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      for (const s of [-1, 1]) {
        const tx = x - ((bz - az) / len) * 9 * s;
        const tz = z + ((bx - ax) / len) * 9 * s;
        if (world.slopeAt(tx, tz) > 0.12 || world.biomeAt(tx, tz).path > 0.05 || world.clearedAt(tx, tz, 'trees')) continue;
        plant(trees, { type: 'clone', x: tx, z: tz, yaw: 0, h: cloneSpec.h * 0.8, w: cloneSpec.w * 0.8, color: cloneSpec.color, bark: new THREE.Color('#6b5a48'), key: -1 });
        blocked.push({ x: tx, z: tz, r: 6 });
      }
    }
  }

  // Windbreak rows of poplars around the farm fields.
  const fc = zones.farm.center;
  for (const ang of [Math.PI * 0.9, Math.PI * 0.45, -Math.PI * 0.15]) {
    const cx = fc[0] + Math.cos(ang) * 222;
    const cz = fc[1] + Math.sin(ang) * 222;
    const dir = [-Math.sin(ang), Math.cos(ang)];
    for (let k = -6; k <= 6; k++) {
      const x = cx + dir[0] * k * 9;
      const z = cz + dir[1] * k * 9;
      const h = world.heightAt(x, z);
      if (h < 2 || world.slopeAt(x, z) > 0.15 || nearPath(x, z, 5) || world.clearedAt(x, z, 'trees') || reserved(x, z)) continue;
      plant(trees, { type: 'poplar', x, z, yaw: 0.3, h: 17, w: 7, color: new THREE.Color('#4f8a35'), bark: new THREE.Color('#5d4a36'), key: -1 });
      blocked.push({ x, z, r: 5 });
    }
  }

  // Natural scatter on a jittered 6 m grid: >= 3.6 m between trunks.
  const STEP = 6;
  const r = rng.seeded('dh-trees');
  const candidates = [];
  const shrubCand = [];
  for (let gz = -1000; gz <= 1000; gz += STEP) {
    for (let gx = -1220; gx <= 1000; gx += STEP) {
      const jx = (r() - 0.5) * 2.4;
      const jz = (r() - 0.5) * 2.4;
      const roll = r();
      const roll2 = r();
      const roll3 = r();
      const x = gx + jx;
      const z = gz + jz;
      const h = world.heightAt(x, z);
      if (h < 1.8) continue;
      const b = world.biomeAt(x, z);
      if (b.feed > 0.15 || b.rock > 0.35 || b.sand > 0.3 || b.farm > 0.12) continue;
      const slope = world.slopeAt(x, z);
      if (slope > 0.22) continue;
      if (reserved(x, z) || isBlocked(x, z)) continue;
      const cluster = smooth(0.0, 0.55, fbm(x / 170, z / 170, 3));
      const altitude = 1 - smooth(55, 125, h);
      const forest = b.forest;
      let type = null;
      let p = 0;
      if (forest > 0.15) {
        p = forest * (0.5 + 0.25 * smooth(-0.4, 0.5, fbm(x / 60 + 9, z / 60, 2)));
        type = forest > 0.5 || roll3 < forest ? 'conifer' : 'broad';
      } else if (b.oldweb > 0.3) {
        p = b.oldweb * 0.012;
        type = 'dead';
      } else if (b.hallu > 0.3) {
        p = b.hallu * 0.01;
        type = 'wrong';
      } else {
        p = b.meadow * (cluster * 0.32 + 0.006) * altitude;
        type = h > 70 && roll3 < 0.5 ? 'conifer' : 'broad';
      }
      if (p > 0 && roll < p && !nearPath(x, z) && !world.clearedAt(x, z, 'trees')) {
        candidates.push({ type, x, z, key: roll / p, roll2, cluster });
        continue;
      }
      let sp = 0;
      if (forest > 0.3) sp = forest * 0.22;
      else if (b.oldweb > 0.3) sp = b.oldweb * 0.035;
      else sp = b.meadow * cluster * 0.07 * altitude;
      if (roll2 < sp && !nearPath(x, z, 3) && !world.clearedAt(x, z, 'trees')) {
        shrubCand.push({ x, z, key: roll2 / sp, biome: forest > 0.3 ? 'forest' : b.oldweb > 0.3 ? 'dry' : 'meadow' });
      }
    }
  }
  candidates.sort((a, b) => a.key - b.key);
  const treeCap = (TREE_CAP[tier] || TREE_CAP.high) - trees.length;
  const rt = rng.seeded('dh-tree-shape');
  for (const c of candidates.slice(0, Math.max(0, treeCap))) {
    const t = { type: c.type, x: c.x, z: c.z, yaw: rt() * Math.PI * 2, key: c.key };
    if (c.type === 'conifer') {
      t.h = 14 + rt() * 10;
      t.w = t.h * (0.82 + rt() * 0.18);
      t.color = color('#1f3d27', rt, 0.02, 0.1, 0.05);
      t.bark = color('#3b2c22', rt);
    } else if (c.type === 'dead') {
      t.h = 6 + rt() * 5;
      t.w = t.h;
      t.bark = color('#8b8076', rt, 0.02, 0.05, 0.08);
    } else if (c.type === 'wrong') {
      t.h = 8 + rt() * 5;
      t.w = t.h * (0.9 + rt() * 0.3);
      t.color = rt() < 0.5 ? color('#7af5c8', rt, 0.02, 0.05, 0.05) : color('#c77dff', rt, 0.02, 0.05, 0.05);
      t.bark = color('#2a1d38', rt);
      t.lift = rt() < 0.6 ? 0.25 + rt() * 0.3 : 0;
    } else {
      const size = 0.75 + rt() * 0.55 + c.cluster * 0.2;
      t.h = 10 * size;
      t.w = t.h * (0.85 + rt() * 0.35);
      const hue = fbm(c.x / 300 + 4, c.z / 300, 2);
      t.color = color(hue > 0.1 ? '#5f9a34' : hue < -0.2 ? '#3f8a45' : '#4f8f36', rt, 0.025, 0.1, 0.07);
      t.bark = color('#5a4331', rt);
    }
    plant(trees, t);
  }

  shrubCand.sort((a, b) => a.key - b.key);
  const rs = rng.seeded('dh-shrubs');
  for (const c of shrubCand.slice(0, SHRUB_CAP[tier] || SHRUB_CAP.high)) {
    const s = c.biome === 'forest' ? 1.6 + rs() * 1.6 : c.biome === 'dry' ? 0.9 + rs() * 0.8 : 1.4 + rs() * 1.6;
    const hex = c.biome === 'forest' ? '#1b3322' : c.biome === 'dry' ? '#7d6c3d' : '#3f7a2c';
    plant(shrubs, { x: c.x, z: c.z, yaw: rs() * 6.28, s, color: color(hex, rs, 0.03, 0.1, 0.08) });
  }

  const rr = rng.seeded('dh-rocks');
  const rockCand = [];
  for (let gz = -1000; gz <= 1000; gz += 10) {
    for (let gx = -1220; gx <= 1000; gx += 10) {
      const x = gx + (rr() - 0.5) * 7;
      const z = gz + (rr() - 0.5) * 7;
      const roll = rr();
      const h = world.heightAt(x, z);
      if (h < -1.5) continue;
      const b = world.biomeAt(x, z);
      if (b.feed > 0.3 || b.farm > 0.3 || b.path > 0.05) continue;
      let p = 0.004 * b.meadow + 0.04 * b.oldweb + 0.05 * b.forest + 0.012 * b.hallu;
      if (b.rock > 0.08 && b.rock < 0.8) p += 0.22;
      if (b.sand > 0.4 && h < 4) p += 0.03;
      if (roll >= p || world.clearedAt(x, z, 'rocks') || reserved(x, z, 10) || isBlocked(x, z)) continue;
      rockCand.push({ x, z, key: roll / p, b, h });
    }
  }
  rockCand.sort((a, b) => a.key - b.key);
  for (const c of rockCand.slice(0, ROCK_CAP[tier] || ROCK_CAP.high)) {
    const big = c.b.rock > 0.08 ? 1.8 : 1;
    const s = (0.5 + Math.pow(rr(), 2.2) * 2.6) * big;
    const hex = c.b.oldweb > 0.4 ? '#a8664a' : c.b.hallu > 0.4 ? '#5a4d6e' : c.h < 4 ? '#7a7570' : '#84897d';
    plant(rocks, { x: c.x, z: c.z, yaw: rr() * 6.28, s, tilt: (rr() - 0.5) * 0.4, color: color(hex, rr, 0.01, 0.05, 0.08) });
  }

  const driftwood = [];
  const rd = rng.seeded('dh-drift');
  for (let a = 0; a < 720 && driftwood.length < 40; a++) {
    const ang = rd() * Math.PI * 2;
    for (let d = 1000; d > 800; d -= 3) {
      const x = Math.cos(ang) * d;
      const z = Math.sin(ang) * d;
      const h = world.heightAt(x, z);
      if (h > 0.7 && h < 1.8) {
        const b = world.biomeAt(x, z);
        if (b.sand > 0.5 && !reserved(x, z) && rd() < 0.5) plant(driftwood, { x, z, yaw: rd() * 6.28, h: 3 + rd() * 4, color: color('#a49a8c', rd, 0.01, 0.05, 0.1) });
        break;
      }
    }
  }

  return { trees, shrubs, rocks, driftwood, groves };
}
