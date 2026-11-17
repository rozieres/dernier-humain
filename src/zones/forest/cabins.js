import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { seeded, hash } from '../../core/rng.js';

const PI = Math.PI;
const LR = 0.15;
const STEP = 0.27;
const ROWS = 9;

const hash3 = (a, b, c) => {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

export function masonry(base, mortar, size = 0.32, course = 0.24) {
  const b = new THREE.Color(base);
  const m = new THREE.Color(mortar);
  return (c, x, y, z) => {
    const row = Math.floor(y / course);
    const fy = y / course - row;
    const u = (x + z * 0.93) / size + row * 0.5;
    const cell = Math.floor(u);
    const fu = u - cell;
    const edge = Math.min(fy, 1 - fy) * course < 0.025 || Math.min(fu, 1 - fu) * size < 0.025;
    if (edge) c.copy(m);
    else c.copy(b).multiplyScalar(0.72 + 0.5 * hash3(cell, row, 3.1));
  };
}

function subtract(range, holes) {
  let segs = [range];
  for (const [a, b] of holes) {
    const next = [];
    for (const [s, e] of segs) {
      if (b <= s || a >= e) next.push([s, e]);
      else {
        if (a > s) next.push([s, a]);
        if (b < e) next.push([b, e]);
      }
    }
    segs = next;
  }
  return segs.filter(([s, e]) => e - s > 0.12);
}

export function buildCabin(cfg, index, B, world) {
  const r = seeded(`forest-cabin-${cfg.seed}`);
  const W = 5.7 + r() * 0.6;
  const D = 4.6 + r() * 0.5;
  const pitch = THREE.MathUtils.degToRad(34 + r() * 7);
  const yaw = Math.atan2(cfg.face[0] - cfg.x, cfg.face[1] - cfg.z);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const toWorld = (lx, lz) => [cfg.x + lx * cos + lz * sin, cfg.z - lx * sin + lz * cos];

  const front2 = cfg.windows.includes('front2');
  const doorX = front2 ? 0 : -0.95 + r() * 0.25;
  const porchW = 2.3;
  const porchD = 1.35;
  let maxG = -Infinity;
  let minG = Infinity;
  for (const [lx, lz] of [[-W / 2 - 0.3, -D / 2 - 0.3], [W / 2 + 0.3, -D / 2 - 0.3], [-W / 2 - 0.3, D / 2 + 0.3], [W / 2 + 0.3, D / 2 + 0.3], [0, 0],
    [doorX - porchW / 2, D / 2 + porchD], [doorX + porchW / 2, D / 2 + porchD]]) {
    const [wx, wz] = toWorld(lx, lz);
    const h = world.heightAt(wx, wz);
    maxG = Math.max(maxG, h);
    minG = Math.min(minG, h);
  }
  const floorY = maxG + 0.32;
  const low = minG - floorY - 0.35;
  for (const b of Object.values(B)) {
    b.setFrame(cfg.x, floorY, cfg.z, yaw);
    b.tags.aCabin = index;
  }
  const { wood, roof, stone, glass } = B;

  const wallTop = 0.12 + (ROWS - 1) * STEP + LR;
  const rise = (D / 2 + 0.1) * Math.tan(pitch);
  const ridgeY = wallTop + rise;
  const logTone = new THREE.Color(cfg.right ? '#6e4a2f' : ['#5f4431', '#6a4c33', '#574035', '#64482e'][index % 4]);

  const windowSpecs = [];
  const dw = 0.92;
  const wy0 = 0.86;
  const wy1 = 1.76;
  if (front2) {
    windowSpecs.push({ side: 'front', c: -1.75, w: dw });
    windowSpecs.push({ side: 'front', c: 1.75, w: dw });
  } else windowSpecs.push({ side: 'front', c: doorX + 1.95, w: dw });
  const sideX = -cfg.chimney;
  if (cfg.windows.includes('side')) windowSpecs.push({ side: 'side', c: 0.1, w: 0.8, sx: sideX });

  const holes = { front: [[doorX - 0.56, doorX + 0.56, -1, 2.1]], back: [], left: [], right: [] };
  for (const w of windowSpecs) {
    const key = w.side === 'front' ? 'front' : w.sx > 0 ? 'right' : 'left';
    holes[key].push([w.c - w.w / 2 - 0.03, w.c + w.w / 2 + 0.03, wy0, wy1]);
  }

  const logColor = (row, k) => logTone.clone().multiplyScalar((row < 2 ? 0.72 : 1) * (0.88 + 0.24 * hash3(row, k, index)));
  const walls = [
    { key: 'front', axis: 'x', at: D / 2, len: W + 0.55, off: 0 },
    { key: 'back', axis: 'x', at: -D / 2, len: W + 0.55, off: 0 },
    { key: 'right', axis: 'z', at: W / 2, len: D + 0.55, off: STEP / 2 },
    { key: 'left', axis: 'z', at: -W / 2, len: D + 0.55, off: STEP / 2 },
  ];
  for (const wall of walls) {
    for (let i = 0; i < ROWS; i++) {
      const y = 0.12 + i * STEP + wall.off;
      if (y > wallTop + 0.05) continue;
      const hs = holes[wall.key].filter(([, , y0, y1]) => y > y0 - 0.06 && y < y1 + 0.04).map(([a, b]) => [a, b]);
      const segs = subtract([-wall.len / 2, wall.len / 2], hs);
      segs.forEach(([s, e], k) => {
        const len = e - s;
        const mid = (s + e) / 2;
        const rr = LR * (0.92 + 0.14 * hash3(i, k, wall.at));
        const pos = wall.axis === 'x' ? [mid, y, wall.at] : [wall.at, y, mid];
        const rot = wall.axis === 'x' ? [0, 0, PI / 2] : [PI / 2, 0, 0];
        wood.log(len, rr, { pos, rot, color: logColor(i, k + (wall.axis === 'x' ? 0 : 7)), vary: 0.1, radial: 10, taper: 0.97 });
      });
    }
  }

  for (const sx of [-1, 1]) {
    for (let k = 0; ; k++) {
      const y = wallTop + 0.02 + k * STEP;
      const t = (y - wallTop) / rise;
      if (t > 0.92) break;
      const hw = (D / 2 + 0.12) * (1 - t);
      wood.log(hw * 2, LR * 0.9, { pos: [sx * (W / 2), y, 0], rot: [PI / 2, 0, 0], color: logColor(ROWS + k, sx), vary: 0.1, radial: 9 });
    }
  }

  const over = 0.55;
  const span = D / 2 + over;
  const slope = span / Math.cos(pitch);
  const roofLen = W + 1.1;
  const top = ridgeY + 0.14;
  const roofTone = new THREE.Color(['#4a4038', '#433b36', '#4d4134', '#3f3a35'][index % 4]);
  const moss = new THREE.Color('#3b4a2a');
  for (const s of [-1, 1]) {
    const mid = slope / 2;
    roof.box(roofLen, 0.07, slope, {
      pos: [0, top - mid * Math.sin(pitch) - 0.06, s * mid * Math.cos(pitch)], rot: [s * pitch, 0, 0], color: '#2d2621', vary: 0.05,
    });
    const rows = 10;
    const rowH = slope / rows;
    for (let j = 0; j < rows; j++) {
      const u = slope - (j + 0.5) * rowH;
      let x = -roofLen / 2 + (j % 2 ? 0.18 : 0);
      let k = 0;
      while (x < roofLen / 2 - 0.05) {
        const w = Math.min(0.34 + r() * 0.22, roofLen / 2 - x);
        const lift = 0.02 + 0.012 * r();
        const c = r() < 0.16 + 0.1 * (j < 3 ? 1 : 0) ? moss : roofTone;
        const len = rowH * 1.55;
        const uc = u - rowH * 0.25;
        roof.box(w - 0.025, 0.03, len, {
          pos: [x + w / 2, top - uc * Math.sin(pitch) + lift, s * uc * Math.cos(pitch)],
          rot: [s * (pitch - 0.045 - 0.03 * r()), (r() - 0.5) * 0.04, (r() - 0.5) * 0.04],
          color: c.clone().multiplyScalar(0.8 + 0.35 * r()), vary: 0.08,
        });
        x += w;
        k++;
      }
    }
  }
  wood.log(roofLen + 0.25, 0.13, { pos: [0, top + 0.05, 0], rot: [0, 0, PI / 2], color: logTone, radial: 10 });
  for (const s of [-1, 1]) {
    const u = slope * 0.55;
    wood.log(roofLen + 0.15, 0.11, { pos: [0, top - u * Math.sin(pitch) - 0.17, s * u * Math.cos(pitch)], rot: [0, 0, PI / 2], color: logTone.clone().multiplyScalar(0.9), radial: 9 });
  }

  const cs = cfg.chimney;
  const cx = cs * (W / 2 + 0.43);
  const cz = -0.55 + r() * 0.4;
  const chimTop = top + 0.95;
  const masonryA = masonry('#7d7a72', '#3a3833');
  const lowH = wallTop - low;
  stone.add(new THREE.BoxGeometry(0.98, lowH, 1.08, 5, 12, 5), {
    pos: [cx + cs * 0.03, low + lowH / 2, cz], displace: 0.025, dk: 4, colorFn: masonryA, vary: 0.06,
  });
  const upH = chimTop - wallTop + 0.05;
  stone.add(new THREE.BoxGeometry(0.72, upH, 0.78, 4, 14, 4), {
    pos: [cx, wallTop - 0.05 + upH / 2, cz], displace: 0.022, dk: 4, colorFn: masonryA, vary: 0.06,
  });
  stone.add(new RoundedBoxGeometry(0.86, 0.1, 0.92, 2, 0.03), { pos: [cx, chimTop + 0.05, cz], color: '#6d6a63', vary: 0.1 });
  stone.add(new THREE.CylinderGeometry(0.15, 0.17, 0.32, 12, 1, true), { pos: [cx, chimTop + 0.26, cz], color: '#8a5a44', vary: 0.1 });
  const smokeLocal = [cx, chimTop + 0.45, cz];

  const footH = -low + 0.06;
  stone.add(new THREE.BoxGeometry(W + 0.3, footH, D + 0.3, 14, 4, 12), {
    pos: [0, low + footH / 2 - 0.02, 0], displace: 0.03, dk: 3, colorFn: masonry('#6f6c66', '#34322e', 0.4, 0.22), vary: 0.08,
  });

  const doorZ = D / 2 + 0.04;
  const doorTone = new THREE.Color(cfg.right ? '#5b3a22' : ['#4c3626', '#553a26', '#4a3828', '#523b2b'][index % 4]);
  for (let k = 0; k < 4; k++) {
    wood.add(new RoundedBoxGeometry(0.245, 2.0 - (k % 2) * 0.012, 0.06, 1, 0.012), {
      pos: [doorX - 0.375 + k * 0.25, 1.0, doorZ], color: doorTone.clone().multiplyScalar(0.9 + 0.2 * hash3(k, index, 1)), vary: 0.12,
    });
  }
  for (const y of [0.42, 1.6]) wood.add(new RoundedBoxGeometry(0.9, 0.12, 0.05, 1, 0.012), { pos: [doorX, y, doorZ + 0.05], color: doorTone.clone().multiplyScalar(0.85) });
  const brace = Math.atan2(1.18, 0.78);
  wood.add(new RoundedBoxGeometry(0.1, 1.42, 0.045, 1, 0.012), { pos: [doorX, 1.01, doorZ + 0.05], rot: [0, 0, -(PI / 2 - brace)], color: doorTone.clone().multiplyScalar(0.82) });
  wood.add(new THREE.TorusGeometry(0.05, 0.011, 6, 14), { pos: [doorX + 0.32, 1.02, doorZ + 0.1], color: '#26231f', vary: 0 });
  wood.box(0.05, 0.12, 0.03, { pos: [doorX + 0.32, 1.07, doorZ + 0.07], color: '#26231f', vary: 0 });
  for (const sx of [-1, 1]) wood.add(new RoundedBoxGeometry(0.13, 2.12, 0.1, 1, 0.02), { pos: [doorX + sx * 0.57, 1.04, D / 2 + 0.12], color: logTone.clone().multiplyScalar(1.1) });
  wood.add(new RoundedBoxGeometry(1.4, 0.18, 0.12, 1, 0.025), { pos: [doorX, 2.16, D / 2 + 0.13], color: logTone.clone().multiplyScalar(1.1) });

  const windows = [];
  windowSpecs.forEach((w, k) => {
    const isFront = w.side === 'front';
    const sx = w.sx || 0;
    const at = isFront ? D / 2 : sx * W / 2;
    const place = (along, y, out) => (isFront ? [along, y, at + out] : [at + sx * out, y, along]);
    const rotY = isFront ? 0 : sx * PI / 2;
    const ww = w.w;
    const wh = wy1 - wy0;
    const cy = (wy0 + wy1) / 2;
    const frameC = logTone.clone().multiplyScalar(1.25);
    wood.add(new RoundedBoxGeometry(ww + 0.26, 0.1, 0.16, 1, 0.02), { pos: place(w.c, wy1 + 0.05, 0.12), rot: [0, rotY, 0], color: frameC });
    wood.add(new RoundedBoxGeometry(ww + 0.34, 0.07, 0.3, 1, 0.02), { pos: place(w.c, wy0 - 0.04, 0.17), rot: [0, rotY, 0], color: frameC.clone().multiplyScalar(0.95) });
    for (const e of [-1, 1]) wood.add(new RoundedBoxGeometry(0.1, wh + 0.12, 0.14, 1, 0.02), { pos: place(w.c + e * (ww / 2 + 0.05), cy, 0.11), rot: [0, rotY, 0], color: frameC });
    wood.box(0.045, wh, 0.04, { pos: place(w.c, cy, 0.075), rot: [0, rotY, 0], color: frameC.clone().multiplyScalar(0.8) });
    wood.box(ww, 0.045, 0.04, { pos: place(w.c, cy + 0.08, 0.075), rot: [0, rotY, 0], color: frameC.clone().multiplyScalar(0.8) });
    if ((index + k) % 3 === 0) {
      for (const e of [-1, 1]) {
        const hinge = w.c + e * (ww / 2 + 0.1);
        const open = e * 1.25;
        const center = place(hinge + e * 0.24 * Math.cos(open * 0.45), cy, 0.2);
        wood.add(new RoundedBoxGeometry(0.46, wh + 0.1, 0.04, 1, 0.012), { pos: center, rot: [0, rotY - e * 0.35, 0], color: doorTone.clone().multiplyScalar(1.15) });
      }
    }
    glass.tags.aCabin = index + k * 0.25;
    glass.add(new THREE.PlaneGeometry(ww, wh), { pos: place(w.c, cy, 0.05), rot: [0, rotY, 0], color: '#ffffff', vary: 0 });
    glass.tags.aCabin = index;
    windows.push({ local: place(w.c, cy, 0.9), sill: place(w.c, wy0 + 0.02, 0.32), front: isFront });
  });

  const deckZ0 = D / 2 + LR;
  const deckY = -0.05;
  for (let k = 0; k < 5; k++) {
    const z = deckZ0 + 0.13 + k * 0.26;
    wood.add(new RoundedBoxGeometry(porchW + (k % 2) * 0.04, 0.055, 0.24, 1, 0.015), { pos: [doorX, deckY, z], color: logTone.clone().multiplyScalar(1.15 + 0.15 * hash3(k, 2, index)), vary: 0.12 });
  }
  const deckFront = deckZ0 + porchD;
  const groundAt = (lx, lz) => {
    const [wx, wz] = toWorld(lx, lz);
    return world.heightAt(wx, wz) - floorY;
  };
  for (const sx of [-1, 1]) {
    const px = doorX + sx * (porchW / 2 - 0.12);
    const g = groundAt(px, deckFront - 0.12);
    const h = deckY - g + 0.3;
    wood.log(h, 0.08, { pos: [px, g - 0.3 + h / 2, deckFront - 0.12], color: logTone, radial: 8 });
  }
  const colliders = [
    { pos: [0, (low + top) / 2, 0], size: [W + 0.4, top - low, D + 0.4] },
    { pos: [cx, (low + chimTop) / 2, cz], size: [1.0, chimTop - low, 1.1] },
    { pos: [doorX, (low + deckY) / 2, deckZ0 + porchD / 2], size: [porchW, deckY - low, porchD] },
  ];
  const gFront = groundAt(doorX, deckFront + 0.35);
  const steps = Math.max(0, Math.ceil((deckY - gFront - 0.12) / 0.22));
  for (let k = 1; k <= steps; k++) {
    const y = deckY - k * 0.22;
    const z = deckFront + 0.15 + (k - 1) * 0.3;
    const sh = y - gFront + 0.25;
    wood.add(new RoundedBoxGeometry(1.4, Math.max(0.08, sh), 0.32, 1, 0.02), { pos: [doorX, y - sh / 2 + 0.03, z], color: logTone.clone().multiplyScalar(1.1), vary: 0.1 });
    colliders.push({ pos: [doorX, y - sh / 2 + 0.03, z], size: [1.4, Math.max(0.08, sh), 0.32] });
  }

  if (cfg.woodpile) {
    const px = -cs * (W / 2 - 0.9);
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 6 - row; k++) {
        wood.log(0.85, 0.11 + 0.02 * hash3(row, k, 4), {
          pos: [px - 1.1 + k * 0.23 + row * 0.115, groundAt(px, -D / 2 - 0.62) + 0.11 + row * 0.2, -D / 2 - 0.62],
          rot: [PI / 2, 0, 0], color: '#7a5a3a', vary: 0.2, radial: 8,
        });
      }
    }
  }
  if (cfg.barrel) {
    const bx = doorX + (doorX < 0 ? 1.35 : -1.35);
    const bz = deckZ0 + 0.45;
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector2(0.26 + 0.05 * Math.sin(t * PI), t * 0.8));
    }
    wood.add(new THREE.LatheGeometry(pts, 14), { pos: [bx, deckY + 0.03, bz], color: '#5b4330', vary: 0.15 });
    wood.add(new THREE.CircleGeometry(0.26, 14), { pos: [bx, deckY + 0.81, bz], rot: [-PI / 2, 0, 0], color: '#3f3024' });
    for (const y of [0.12, 0.68]) wood.add(new THREE.TorusGeometry(0.28 + 0.03 * Math.sin((y / 0.8) * PI), 0.012, 4, 18), { pos: [bx, deckY + 0.03 + y, bz], rot: [PI / 2, 0, 0], color: '#2a2622', vary: 0 });
  }

  const local = (lx, ly, lz) => {
    const [wx, wz] = toWorld(lx, lz);
    return new THREE.Vector3(wx, floorY + ly, wz);
  };
  return {
    yaw, floorY, W, D, top: floorY + top,
    door: local(doorX, 1.1, D / 2 + 0.35),
    doorFace: local(doorX, 1.45, doorZ + 0.04),
    sign: { pos: local(doorX + 0.02, 1.55, doorZ + 0.08), tilt: (r() - 0.5) * 0.12 },
    noteFrom: local(doorX + 0.05, deckY + 0.04, D / 2 - 0.1),
    noteTo: local(doorX + 0.12, deckY + 0.04, D / 2 + 0.75),
    smoke: local(...smokeLocal),
    murmur: local(0, 1.2, 0),
    windows: windows.map((w) => ({ light: local(...w.local), sill: local(...w.sill), front: w.front })),
    colliders: colliders.map((c) => ({ pos: local(...c.pos), size: c.size })),
    seed: hash(`cabin${cfg.seed}`),
  };
}
