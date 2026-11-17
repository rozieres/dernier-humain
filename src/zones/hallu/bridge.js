import * as THREE from 'three';
import { Kit } from './geo.js';
import { ROUTE_A, BRIDGE_A, PILLAR_Y } from './layout.js';

const DECK_T = 0.9;
const RAIL_H = 1.12;
const PIERS = [100, 84, 68, 52, 36];
const DECK_SEG = 4;

function balusterGeometry() {
  const pts = [[0.11, 0.0], [0.08, 0.09], [0.06, 0.2], [0.1, 0.36], [0.06, 0.58], [0.09, 0.68], [0.09, 0.74]];
  return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 5);
}

export function spandrelGeometry(L, D, width) {
  const R = D - 0.75;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(L, 0);
  s.lineTo(L, -D);
  const n = 20;
  for (let i = 1; i <= n; i++) {
    const a = (i / n) * Math.PI;
    s.lineTo(L / 2 + Math.cos(a) * (L / 2), -D + Math.sin(a) * R);
  }
  s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -width / 2);
  return g;
}

export function buildGrandBridge(ctx, rand) {
  const { world } = ctx;
  const F = ROUTE_A;
  let y0 = 0;
  for (let r = 99; r <= BRIDGE_A.from; r += 1) {
    for (const v of [-3.4, 0, 3.4]) {
      const [x, z] = F.at(r, v);
      y0 = Math.max(y0, world.heightAt(x, z));
    }
  }
  y0 += 0.22;
  const y1 = PILLAR_Y + 0.22;
  const r0 = BRIDGE_A.from;
  const r1 = BRIDGE_A.to;
  const deckY = (r) => y0 + (y1 - y0) * ((r0 - r) / (r0 - r1));
  const pitch = Math.atan2(y1 - y0, r0 - r1);
  const yaw = F.yawIn;
  const W = BRIDGE_A.width;
  const along = new THREE.Vector3(-F.c, 0, -F.s);
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(along, up);
  const basis = new THREE.Matrix4().makeBasis(along, up, side);

  const real = new Kit(rand);
  const fake = new Kit(rand);
  const realGlow = new Kit(rand);
  const fakeGlow = new Kit(rand);
  const verified = new Kit(rand);
  const STONE = '#e6dccd';
  const STONE_D = '#cfc2b0';
  const pick = (r) => (r > BRIDGE_A.realTo ? real : fake);
  const pickGlow = (r) => (r > BRIDGE_A.realTo ? realGlow : fakeGlow);
  const P = (r, v, dy = 0) => {
    const [x, z] = F.at(r, v);
    return [x, deckY(r) + dy, z];
  };
  const rotDeck = [pitch, yaw, 0];

  const cut = BRIDGE_A.realTo;
  const pieces = [];
  for (let r = r0; r > r1 + 0.01;) {
    const next = r > cut && r - DECK_SEG < cut ? cut : Math.max(r1, r - DECK_SEG);
    pieces.push([r, next]);
    r = next;
  }
  const baluster = balusterGeometry();
  for (const [ra, rb] of pieces) {
    const len = ra - rb;
    const rm = (ra + rb) / 2;
    const K = pick(rm);
    const L = len / Math.cos(pitch) + 0.02;
    K.add(new THREE.BoxGeometry(W, DECK_T, L), { pos: P(rm, 0, -DECK_T / 2), rot: rotDeck, order: 'YXZ', color: STONE, vary: 0.04 });
    K.add(new THREE.BoxGeometry(W + 0.5, 0.28, L), { pos: P(rm, 0, -DECK_T - 0.08), rot: rotDeck, order: 'YXZ', color: STONE_D });
    K.add(new THREE.BoxGeometry(W - 1.6, 0.04, L), { pos: P(rm, 0, 0.0), rot: rotDeck, order: 'YXZ', color: '#d8cdbd', vary: 0.03 });
    for (const sv of [-1, 1]) {
      const v = sv * (W / 2 - 0.22);
      K.add(new THREE.BoxGeometry(0.44, 0.22, L), { pos: P(rm, v, 0.11), rot: rotDeck, order: 'YXZ', color: STONE_D });
      K.add(new THREE.BoxGeometry(0.36, 0.16, L), { pos: P(rm, v, RAIL_H - 0.08), rot: rotDeck, order: 'YXZ', color: STONE });
      for (let b = 0.28; b < len; b += 0.56) {
        const rr = ra - b;
        K.add(baluster, { pos: P(rr, v, 0.22), color: STONE, vary: 0.03 });
      }
    }
  }
  for (let r = r0 - 0.3; r > r1; r -= 8) {
    if (PIERS.some((p) => Math.abs(p - r) < 3)) continue;
    for (const sv of [-1, 1]) {
      const v = sv * (W / 2 - 0.22);
      const K = pick(r - 0.3);
      K.add(new THREE.BoxGeometry(0.56, RAIL_H + 0.14, 0.56), { pos: P(r, v, (RAIL_H + 0.14) / 2), rot: [0, yaw, 0], color: STONE });
      K.add(new THREE.BoxGeometry(0.7, 0.14, 0.7), { pos: P(r, v, RAIL_H + 0.2), rot: [0, yaw, 0], color: STONE_D });
    }
  }
  const lampAt = PIERS;
  for (const r of lampAt) {
    for (const sv of [-1, 1]) {
      const v = sv * (W / 2 - 0.22);
      const K = pick(r + 0.5);
      const G = pickGlow(r + 0.5);
      K.add(new THREE.BoxGeometry(0.62, RAIL_H + 0.2, 0.62), { pos: P(r, v, (RAIL_H + 0.2) / 2), rot: [0, yaw, 0], color: STONE });
      K.add(new THREE.CylinderGeometry(0.07, 0.11, 2.6, 8), { pos: P(r, v, RAIL_H + 1.5), color: '#2f2a33' });
      K.add(new THREE.CylinderGeometry(0.34, 0.05, 0.12, 10), { pos: P(r, v, RAIL_H + 2.78), color: '#2f2a33' });
      G.add(new THREE.SphereGeometry(0.3, 14, 10), { pos: P(r, v, RAIL_H + 3.1), color: '#ffffff' });
    }
  }
  for (let i = 0; i < PIERS.length; i++) {
    const r = PIERS[i];
    const K = i === 0 ? real : fake;
    const top = deckY(r) - DECK_T - 0.2;
    const bottom = 2;
    const h = top - bottom;
    K.add(new THREE.CylinderGeometry(1, 1.35, h, 8), { pos: P(r, 0, -DECK_T - 0.2 - h / 2), rot: [0, yaw + Math.PI / 8, 0], scale: [3.9, 1, 1.3], color: STONE_D, vary: 0.05 });
    K.add(new THREE.CylinderGeometry(1.08, 1.08, 0.5, 8), { pos: P(r, 0, -DECK_T - 9.5), rot: [0, yaw + Math.PI / 8, 0], scale: [3.95, 1, 1.35], color: STONE });
    for (let k = 1; k < 4; k++) {
      K.add(new THREE.CylinderGeometry(1.1 + k * 0.03, 1.1 + k * 0.03, 0.3, 8), { pos: P(r, 0, -DECK_T - 9.5 - k * 8.5), rot: [0, yaw + Math.PI / 8, 0], scale: [3.95, 1, 1.35], color: '#bfb19d' });
    }
  }
  const spans = [[100, 84], [84, 68], [68, 52], [52, 36], [36, 26]];
  for (const [ra, rb] of spans) {
    const L = ra - rb - 2.4;
    const start = ra - 1.2;
    const topY = deckY(start) - DECK_T - 0.2;
    const D = Math.min(9.5, (ra - rb) * 0.6);
    const g = spandrelGeometry(L, D, W - 0.3);
    const [x, z] = F.at(start, 0);
    const m = basis.clone().setPosition(x, topY, z);
    fake.add(g, { matrix: m, color: STONE, vary: 0.03 });
  }
  for (let r = cut; r > r1 + 0.5; r -= 0.9) {
    const rr = r - 0.45;
    verified.add(new THREE.BoxGeometry(0.1, 0.03, 0.62), { pos: P(rr, 0, 0.035), rot: rotDeck, order: 'YXZ', color: '#ffffff' });
  }
  const abut = [];
  for (let r = BRIDGE_A.from; r > 100; r -= 3) abut.push(r);
  for (const r of abut) {
    real.add(new THREE.BoxGeometry(W + 0.2, 3.2, 3.1), { pos: P(r - 1.5, 0, -DECK_T - 1.6), rot: [0, yaw, 0], color: STONE_D, vary: 0.05 });
  }
  for (const sv of [-1, 1]) {
    real.add(new THREE.BoxGeometry(0.9, 1.6, 0.9), { pos: P(r0 + 0.2, sv * (W / 2 + 0.2), 0.8), rot: [0, yaw, 0], color: STONE });
    real.add(new THREE.SphereGeometry(0.42, 14, 10), { pos: P(r0 + 0.2, sv * (W / 2 + 0.2), 1.95), color: STONE });
  }

  const colliders = (from, to) => {
    const len = (from - to) / Math.cos(pitch);
    const rm = (from + to) / 2;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    const list = [{ position: P(rm, 0, -0.4), size: [W, 0.8, len], quaternion: q }];
    for (const sv of [-1, 1]) list.push({ position: P(rm, sv * (W / 2 - 0.2), 0.75), size: [0.4, 1.5, len], quaternion: q });
    return list;
  };

  return {
    kits: { real, fake, realGlow, fakeGlow, verified },
    y0, y1, deckY, pitch, yaw,
    realColliders: colliders(r0 + 0.5, cut),
    fakeColliders: colliders(cut, r1),
    centerOfFake: new THREE.Vector3(...P((cut + r1) / 2, 0, -6)),
  };
}
