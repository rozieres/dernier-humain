import * as THREE from 'three';
import { Parts, lathe, rod, beam, tube, pad, padRing, groundRange, rotY } from './kit.js';
import { SILOS, DECK, MAST, PLANT, HOPPERS, FANS, FAN, BOARDS, ENTRANCE, REVIEW, KIOSK } from './layout.js';

const PI = Math.PI;
const WHITE = '#f4f6fb';
const PEARL = '#e3e8f1';
const DARK = '#1b2029';
const GLASS = '#101722';
const STEEL = '#8d96a7';
const CYAN = '#5ce1e6';
const MAGENTA = '#ff5fa2';
const W = { color: WHITE, vary: 0.025 };
const M = { color: STEEL, metal: 0.65, vary: 0.05 };
const D = { color: DARK, metal: 0.35, vary: 0.04 };

function ringBand(r, y, h, segs = 48) {
  return new THREE.CylinderGeometry(r, r, h, segs, 1, true).translate(0, y, 0);
}

function ladder(P, cx, cz, r, angle, y0, y1, hoopFrom) {
  const nx = Math.sin(angle);
  const nz = Math.cos(angle);
  const tx = nz;
  const tz = -nx;
  const out = r + 0.42;
  const px = cx + nx * out;
  const pz = cz + nz * out;
  for (const s of [-0.24, 0.24]) {
    rod(P, [px + tx * s, y0, pz + tz * s], [px + tx * s, y1, pz + tz * s], 0.035, M, 6);
  }
  for (let y = y0 + 0.3; y < y1; y += 0.32) rod(P, [px - tx * 0.24, y, pz - tz * 0.24], [px + tx * 0.24, y, pz + tz * 0.24], 0.022, M, 4);
  for (let y = y0 + 0.3; y < y1 - 0.3; y += 1.6) {
    const arm = out - 0.42;
    rod(P, [cx + nx * arm, y, cz + nz * arm], [px, y, pz], 0.03, M, 5);
  }
  for (let y = hoopFrom; y < y1; y += 2.2) {
    const g = new THREE.TorusGeometry(0.5, 0.025, 4, 10, PI);
    g.rotateX(PI / 2);
    g.rotateY(angle + PI / 2);
    P.add(g.translate(px + nx * 0.12, y, pz + nz * 0.12), M);
  }
}

function silo(ctx, L, G, s) {
  const { world, physics } = ctx;
  const { min, max } = groundRange(world, s.x, s.z, s.r + 0.9);
  const yb = max;
  const low = min - 0.6 - yb;
  const place = (g) => g.translate(s.x, yb, s.z);
  L.add(place(lathe([[0, low], [s.r + 0.9, low], [s.r + 0.9, 0.42], [s.r + 0.7, 0.68], [s.r + 0.05, 0.74], [s.r + 0.02, 0.8]], 48)), { color: PEARL, vary: 0.03 });
  L.add(place(lathe([[s.r + 0.02, 0.8], [s.r, 0.95], [s.r, s.h]], 48)), W);
  for (let y = 3.2; y < s.h - 0.8; y += 3.2) {
    L.add(place(lathe([[s.r, y - 0.13], [s.r + 0.1, y - 0.09], [s.r + 0.12, y], [s.r + 0.1, y + 0.09], [s.r, y + 0.13]], 40)), { color: PEARL, vary: 0.02 });
  }
  const bands = [s.h * 0.36, s.h * 0.7];
  bands.forEach((y, i) => G.add(place(ringBand(s.r + 0.03, y, 0.32)), { color: i ? MAGENTA : CYAN, vary: 0 }));
  ladder(L, s.x, s.z, s.r, -2.4 + s.x * 0.01, yb + 0.8, yb + s.h + (s.tall ? 0.1 : 0.2), yb + 3);
  physics.addStaticCylinder({ position: [s.x, (yb + low + yb + s.h) / 2, s.z], radius: s.r + 0.05, height: s.h - low, userData: { surface: 'metal' } });
  if (s.tall) return { yb };
  const dome = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * (PI / 2);
    dome.push([s.r * Math.cos(a), s.h + s.r * 0.42 * Math.sin(a)]);
  }
  const domeGeo = place(lathe(dome, 48));
  physics.addStaticMesh(new THREE.Mesh(domeGeo), { userData: { surface: 'metal' } });
  L.add(domeGeo, W);
  L.add(place(lathe([[0.95, s.h + s.r * 0.42 - 0.1], [0.95, s.h + s.r * 0.42 + 0.55], [1.15, s.h + s.r * 0.42 + 0.62], [1.12, s.h + s.r * 0.42 + 0.78], [0, s.h + s.r * 0.42 + 0.84]], 32)), { color: PEARL, vary: 0.02 });
  G.add(place(ringBand(1.0, s.h + s.r * 0.42 + 0.3, 0.12, 32)), { color: CYAN, vary: 0 });
  return { yb, top: yb + s.h + s.r * 0.42 + 0.84 };
}

function tallSilo(ctx, L, G, s) {
  const { physics } = ctx;
  const { yb } = silo(ctx, L, G, s);
  const top = yb + s.h;
  const deckY = top + 0.1;
  const place = (g) => g.translate(s.x, 0, s.z);
  L.add(place(lathe([[0, top - 0.55], [DECK.r - 0.2, top - 0.55], [DECK.r, top - 0.4], [DECK.r + 0.04, top - 0.05], [DECK.r - 0.08, top + 0.1], [0, top + 0.1]], 56)), { color: PEARL, vary: 0.02 });
  G.add(place(ringBand(DECK.r + 0.05, top - 0.22, 0.14)), { color: CYAN, vary: 0 });
  const cr = DECK.crownR;
  const phi0 = DECK.open / 2;
  const phiL = PI * 2 - DECK.open;
  const crown = new THREE.LatheGeometry(
    [[cr, top + 0.05], [cr + 0.28, top + 0.05], [cr + 0.3, top + DECK.crownH - 0.15], [cr + 0.18, top + DECK.crownH + 0.05], [cr + 0.02, top + DECK.crownH - 0.05], [cr, top + 0.05]]
      .map(([x, y]) => new THREE.Vector2(x, y)), 64, phi0, phiL,
  );
  L.add(place(crown), W);
  G.add(place(new THREE.LatheGeometry([new THREE.Vector2(cr + 0.06, top + DECK.crownH - 0.4), new THREE.Vector2(cr + 0.06, top + DECK.crownH - 0.22)], 64, phi0, phiL)), { color: MAGENTA, vary: 0 });
  G.add(place(new THREE.LatheGeometry([new THREE.Vector2(cr - 0.01, top + DECK.crownH - 0.22), new THREE.Vector2(cr - 0.01, top + DECK.crownH - 0.4)], 64, phi0, phiL)), { color: MAGENTA, vary: 0 });
  for (const phi of [phi0, phi0 + phiL]) {
    const [ex, ez] = [Math.sin(phi) * (cr + 0.14), Math.cos(phi) * (cr + 0.14)];
    L.box(0.42, DECK.crownH + 0.1, 0.42, { radius: 0.12, segments: 3, pos: [s.x + ex, top + DECK.crownH / 2 + 0.05, s.z + ez], ...W });
  }
  const segs = 14;
  for (let i = 0; i < segs; i++) {
    const a0 = phi0 + (i / segs) * phiL;
    const a1 = phi0 + ((i + 1) / segs) * phiL;
    const am = (a0 + a1) / 2;
    const len = 2 * (cr + 0.15) * Math.sin((a1 - a0) / 2) + 0.35;
    physics.addStaticBox({
      position: [s.x + Math.sin(am) * (cr + 0.15), top + DECK.crownH / 2, s.z + Math.cos(am) * (cr + 0.15)],
      size: [len, DECK.crownH + 0.2, 0.36],
      quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), am),
      userData: { surface: 'metal' },
    });
  }
  const railR = DECK.r - 0.2;
  const rail = [];
  for (let i = 0; i <= 16; i++) {
    const a = -phi0 + (i / 16) * DECK.open;
    rail.push([s.x + Math.sin(a) * railR, top + 1.05, s.z + Math.cos(a) * railR]);
    if (i % 4 === 0) rod(L, [s.x + Math.sin(a) * railR, top + 0.08, s.z + Math.cos(a) * railR], [s.x + Math.sin(a) * railR, top + 1.05, s.z + Math.cos(a) * railR], 0.045, W, 8);
  }
  tube(L, rail, 0.05, W, 32, 8);
  tube(L, rail.map(([x, y, z]) => [x, y - 0.5, z]), 0.03, M, 32, 6);
  for (let i = 0; i < 3; i++) {
    const am = -phi0 + ((i + 0.5) / 3) * DECK.open;
    physics.addStaticBox({
      position: [s.x + Math.sin(am) * railR, top + 0.6, s.z + Math.cos(am) * railR],
      size: [2 * railR * Math.sin(DECK.open / 6) + 0.2, 1.0, 0.12],
      quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), am),
    });
  }
  physics.addStaticCylinder({ position: [s.x, top - 0.25, s.z], radius: DECK.r, height: 0.7, userData: { surface: 'metal' } });

  L.add(place(lathe([[1.75, top + 0.05], [1.75, top + 1.3], [1.55, top + 1.85], [1.1, top + 2.15], [0, top + 2.25]], 40)), { color: PEARL, vary: 0.02 });
  L.box(0.9, 1.5, 0.12, { radius: 0.05, pos: [s.x, top + 0.8, s.z - 1.72], ...D });
  physics.addStaticCylinder({ position: [s.x, top + 1.15, s.z], radius: 1.75, height: 2.2 });

  const mastTop = top + MAST.h;
  rod(L, [s.x, top + 2.1, s.z], [s.x, mastTop, s.z], 0.75, { ...W, taper: 0.3 }, 16);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + 0.5;
    rod(L, [s.x, top + MAST.h * 0.62, s.z], [s.x + Math.sin(a) * (DECK.crownR + 0.1), top + DECK.crownH, s.z + Math.cos(a) * (DECK.crownR + 0.1)], 0.045, M, 5);
  }
  for (let y = top + 4; y < mastTop - 1; y += 4.2) {
    const k = 1 - ((y - top) / MAST.h) * 0.68;
    L.add(place(lathe([[0.72 * k + 0.02, y - 0.1], [0.92 * k, y - 0.05], [0.92 * k, y + 0.05], [0.72 * k + 0.02, y + 0.1]], 16)), { color: PEARL, vary: 0.02 });
  }
  const holoY = top + MAST.holoY;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    for (const dy of [-MAST.holoH / 2 - 0.15, MAST.holoH / 2 + 0.15]) {
      rod(L, [s.x, holoY + dy, s.z], [s.x + Math.sin(a) * MAST.holoR, holoY + dy, s.z + Math.cos(a) * MAST.holoR], 0.07, W, 6);
    }
  }
  for (const dy of [-MAST.holoH / 2 - 0.15, MAST.holoH / 2 + 0.15]) {
    const g = new THREE.TorusGeometry(MAST.holoR, 0.32, 8, 96);
    g.rotateX(PI / 2);
    L.add(g.translate(s.x, holoY + dy, s.z), W);
  }
  G.add(new THREE.SphereGeometry(0.42, 16, 12).translate(s.x, mastTop + 0.3, s.z), { color: MAGENTA, vary: 0 });
  G.add(new THREE.SphereGeometry(0.22, 12, 8).translate(s.x, top + MAST.h * 0.55, s.z), { color: MAGENTA, vary: 0 });
  return { deckY, top, mastTop, holoY };
}

function plant(ctx, L, Dt, G) {
  const { world, physics } = ctx;
  const { x, z, w, d, h } = PLANT;
  const { min, max } = groundRange(world, x, z, w / 2, 16);
  const yb = max;
  const low = min - 0.6 - yb;
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, low);
  shape.lineTo(d / 2, low);
  shape.lineTo(d / 2, h - 3.2);
  shape.quadraticCurveTo(d * 0.12, h + 2.6, -d / 2, h - 3.2);
  shape.lineTo(-d / 2, low);
  const body = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 4, curveSegments: 24, steps: 1 });
  body.translate(0, 0, -w / 2);
  body.rotateY(PI / 2);
  L.add(body.translate(x, yb, z), W);
  const south = z + d / 2;
  const north = z - d / 2;
  for (let i = 0; i <= 11; i++) {
    const px = x - w / 2 + 1 + i * ((w - 2) / 11);
    for (const fz of [south + 0.3, north - 0.3]) {
      Dt.box(0.55, h - 3.6 - low, 0.4, { radius: 0.15, segments: 2, pos: [px, yb + (h - 3.6 + low) / 2, fz], color: PEARL, vary: 0.02 });
    }
  }
  for (const fz of [south + 0.32, north - 0.32]) {
    Dt.box(w - 3, 1.1, 0.12, { radius: 0.04, pos: [x, yb + 5.6, fz], color: GLASS, metal: 0.4, vary: 0.02 });
    G.add(new THREE.BoxGeometry(w - 1, 0.12, 0.08).translate(x, yb + 4.75, fz + Math.sign(fz - z) * 0.06), { color: CYAN, vary: 0 });
  }
  Dt.box(9, 6.2, 0.4, { radius: 0.2, segments: 2, pos: [x - 6, yb + 3.0, south + 0.12], color: '#262c37', metal: 0.3, vary: 0.02 });
  for (let i = 0; i < 9; i++) Dt.box(8.6, 0.06, 0.08, { radius: 0.02, pos: [x - 6, yb + 0.4 + i * 0.68, south + 0.34], color: '#3a4250', metal: 0.5 });
  G.add(new THREE.BoxGeometry(9.4, 0.14, 0.1).translate(x - 6, yb + 6.2, south + 0.38), { color: MAGENTA, vary: 0 });
  for (const sx of [-1, 1]) G.add(new THREE.BoxGeometry(0.14, 6.2, 0.1).translate(x - 6 + sx * 4.7, yb + 3.1, south + 0.38), { color: MAGENTA, vary: 0 });
  for (let i = 0; i < 5; i++) {
    const vx = x - w / 2 + 6 + i * ((w - 12) / 4);
    const vy = yb + h + 1.1;
    Dt.add(lathe([[0, -1.2], [0.9, -1.2], [0.9, 0.5], [1.15, 0.6], [1.2, 0.85], [0.6, 1.05], [0, 1.1]], 24).translate(vx, vy, z - 1.5), { color: PEARL, vary: 0.02 });
    G.add(ringBand(0.92, vy + 0.25, 0.1, 24).translate(vx, 0, z - 1.5), { color: CYAN, vary: 0 });
  }
  physics.addStaticBox({ position: [x, yb + (h - 2 + low) / 2, z], size: [w + 0.7, h - 2 - low, d + 0.7] });
  physics.addStaticBox({ position: [x, yb + h - 1.2, z], size: [w + 0.7, 2.8, d * 0.62] });

  const chutes = [];
  HOPPERS.forEach(([hx, hz]) => {
    const g = world.heightAt(hx, hz);
    for (const [lx, lz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) rod(Dt, [hx + lx, g - 0.4, hz + lz], [hx + lx * 0.7, g + 3.2, hz + lz * 0.7], 0.12, M, 8);
    Dt.add(lathe([[0.32, 2.7], [0.5, 2.9], [2.2, 5.7], [2.42, 5.95], [2.38, 6.1], [2.2, 6.05], [0.42, 3.05], [0.28, 2.9]], 40).translate(hx, g, hz), W);
    G.add(ringBand(2.35, g + 5.75, 0.14, 40).translate(hx, 0, hz), { color: CYAN, vary: 0 });
    physics.addStaticCylinder({ position: [hx, g + 3.05, hz], radius: 2.2, height: 6.1 });
    const startY = yb + h - 3.3;
    const a = [hx, startY, south + 0.2];
    const b = [hx, g + 7.2, hz - 1.2];
    beam(Dt, a, b, 1.2, 0.12, { color: PEARL, vary: 0.02 });
    for (const sx of [-0.6, 0.6]) beam(Dt, [a[0] + sx, a[1] + 0.3, a[2]], [b[0] + sx, b[1] + 0.3, b[2]], 0.08, 0.6, W);
    beam(G, [a[0] - 0.66, a[1] + 0.58, a[2]], [b[0] - 0.66, b[1] + 0.58, b[2]], 0.05, 0.06, { color: MAGENTA, vary: 0 });
    chutes.push(new THREE.Vector3(b[0], b[1] + 0.25, b[2] + 0.2));
  });

  const pipeY = yb + h + 0.2;
  const tall = SILOS.filter((s) => !s.tall).slice(0, 2);
  tall.forEach((s, i) => {
    const sy = world.heightAt(s.x, s.z) + s.h + s.r * 0.42 + 0.5;
    const ex = x - w / 2 + 5 + i * 6;
    tube(Dt, [[s.x, sy - 0.6, s.z], [s.x, sy + 1.6, s.z], [(s.x + ex) / 2, sy + 3.2, (s.z + z) / 2], [ex, pipeY + 1.5, z - 2], [ex, pipeY - 0.2, z - 2]], 0.38, W, 40, 12);
  });
  return { yb, chutes, south };
}

function fanUnit(ctx, Dt, G, f) {
  const { world, physics } = ctx;
  const { min, max } = groundRange(world, f.x, f.z, FAN.r + 0.3);
  const y = (min + max) / 2;
  const R = FAN.r;
  const T = FAN.top;
  Dt.add(lathe([[R - 0.32, T - 0.04], [R - 0.3, 0.06], [R + 0.18, min - y - 0.4], [R + 0.32, min - y - 0.4], [R + 0.36, T - 0.1], [R + 0.22, T + 0.02], [R - 0.2, T + 0.04], [R - 0.32, T - 0.04]], 64).translate(f.x, y, f.z), W);
  G.add(ringBand(R + 0.37, y + T - 0.17, 0.09, 64).translate(f.x, 0, f.z), { color: CYAN, vary: 0 });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * PI * 2;
    beam(Dt, [f.x + Math.sin(a) * 0.5, y + T - 0.04, f.z + Math.cos(a) * 0.5], [f.x + Math.sin(a) * (R - 0.25), y + T - 0.04, f.z + Math.cos(a) * (R - 0.25)], 0.07, 0.07, { ...M, color: '#5d6574' });
  }
  for (const rr of [1.0, 1.65, 2.3, 2.95]) {
    const g = new THREE.TorusGeometry(rr, 0.04, 4, 40);
    g.rotateX(PI / 2);
    Dt.add(g.translate(f.x, y + T - 0.04, f.z), { ...M, color: '#5d6574' });
  }
  Dt.add(lathe([[0, T - 0.2], [0.5, T - 0.2], [0.55, T - 0.12], [0.5, T + 0.03], [0, T + 0.06]], 24).translate(f.x, y, f.z), { color: PEARL, vary: 0.02 });
  Dt.add(new THREE.CircleGeometry(R - 0.3, 48).rotateX(-PI / 2).translate(f.x, y + 0.08, f.z), { color: '#14181f', vary: 0.02 });
  physics.addStaticCylinder({ position: [f.x, (y + T + min - 0.4) / 2, f.z], radius: R + 0.34, height: y + T - (min - 0.4), userData: { surface: 'metal' } });
  return { x: f.x, y: y + T, z: f.z, base: y };
}

export function fanRotorGeometry() {
  const P = new Parts(77);
  P.add(lathe([[0, -0.14], [0.38, -0.12], [0.42, 0], [0.36, 0.1], [0, 0.12]], 20), { color: '#c3cad6', metal: 0.5, vary: 0.02 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2;
    const g = new THREE.BoxGeometry(0.5, 0.035, 2.5, 1, 1, 6);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const zz = p.getZ(k);
      const t = (zz + 1.25) / 2.5;
      p.setX(k, p.getX(k) * (1.2 - 0.35 * t));
    }
    g.computeVertexNormals();
    g.rotateZ(0.42);
    g.translate(0, 0, 1.6);
    g.rotateY(a);
    P.add(g, { color: '#9aa3b2', metal: 0.75, vary: 0.04 });
  }
  return P.build();
}

function cabinets(ctx, Dt, G) {
  const { world, physics } = ctx;
  const zRow = -106.5;
  for (const cx of [549, 573, 597, 621]) {
    const g = world.heightAt(cx, zRow);
    for (let i = 0; i < 5; i++) {
      const x = cx + (i - 2) * 1.12;
      Dt.box(1.06, 2.3, 1.25, { radius: 0.08, segments: 2, pos: [x, g + 1.05, zRow], color: WHITE, vary: 0.02 });
      Dt.box(0.86, 1.9, 0.05, { radius: 0.02, pos: [x, g + 1.12, zRow - 0.63], color: '#232934', metal: 0.3 });
      for (const sx of [-0.3, 0.3]) G.add(new THREE.BoxGeometry(0.03, 1.7, 0.03).translate(x + sx, g + 1.12, zRow - 0.67), { color: (i + (sx > 0 ? 1 : 0)) % 2 ? CYAN : MAGENTA, vary: 0 });
      for (let k = 0; k < 6; k++) G.add(new THREE.BoxGeometry(0.035, 0.035, 0.03).translate(x - 0.12 + (k % 3) * 0.12, g + 1.75 - Math.floor(k / 3) * 0.12, zRow - 0.67), { color: k % 2 ? '#bfffd9' : CYAN, vary: 0 });
    }
    Dt.box(5.8, 0.22, 1.4, { radius: 0.08, pos: [cx, g + 2.33, zRow], color: PEARL, vary: 0.02 });
    physics.addStaticBox({ position: [cx, g + 1.1, zRow], size: [5.7, 2.5, 1.35] });
    const fan = FANS.reduce((best, f) => (Math.abs(f.x - cx) < Math.abs(best.x - cx) ? f : best), FANS[0]);
    const fy = world.heightAt(fan.x, fan.z);
    tube(Dt, [[cx, g + 0.15, zRow - 0.8], [cx, g + 0.12, zRow - 3], [(cx + fan.x) / 2, (g + fy) / 2 + 0.12, (zRow + fan.z) / 2], [fan.x + Math.sign(cx - fan.x || 1) * 1.2, fy + 0.12, fan.z + FAN.r + 0.6]], 0.16, { color: '#3b4250', metal: 0.4 }, 24, 8);
  }
}

function boardFrames(ctx, Dt, G) {
  const { world, physics } = ctx;
  return BOARDS.map((b) => {
    const g = world.heightAt(b.x, b.z);
    const cy = g + b.y;
    const nx = Math.sin(b.yaw);
    const nz = Math.cos(b.yaw);
    Dt.box(b.w + 0.6, b.h + 0.6, 0.4, { radius: 0.18, segments: 3, pos: [0, 0, 0], ...W });
    const back = Dt.items[Dt.items.length - 1];
    back.rotateY(b.yaw);
    back.translate(b.x, cy, b.z);
    const strip = new THREE.BoxGeometry(b.w + 0.2, 0.08, 0.06).translate(0, -b.h / 2 - 0.18, 0.21);
    strip.rotateY(b.yaw);
    G.add(strip.translate(b.x, cy, b.z), { color: CYAN, vary: 0 });
    if (b.legs) {
      for (const sx of [-1, 1]) {
        const [lx, lz] = rotY(sx * (b.w / 2 - 1.4), -0.1, b.yaw);
        const gy = world.heightAt(b.x + lx, b.z + lz);
        Dt.box(0.5, cy - b.h / 2 - gy + 0.4, 0.5, { radius: 0.14, segments: 2, pos: [b.x + lx, (cy - b.h / 2 + gy - 0.4) / 2, b.z + lz], ...W });
        Dt.add(lathe([[0, -0.4], [0.75, -0.4], [0.75, 0.12], [0.55, 0.25], [0, 0.25]], 20).translate(b.x + lx, gy, b.z + lz), { color: PEARL, vary: 0.02 });
        physics.addStaticBox({ position: [b.x + lx, (cy + gy) / 2, b.z + lz], size: [0.6, cy - gy + b.h / 2, 0.6] });
      }
      physics.addStaticBox({ position: [b.x, cy, b.z], size: [b.w + 0.6, b.h + 0.6, 0.4], quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw) });
    }
    return { cx: b.x + nx * 0.215, cy, cz: b.z + nz * 0.215, w: b.w, h: b.h, yaw: b.yaw };
  });
}

function quad(w, h, [u0, v0, u1, v1]) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g;
}

export const SIGN_CELLS = [
  [0, 0.75, 0.5, 1], [0.5, 0.75, 1, 1], [0, 0.5, 0.5, 0.75], [0.5, 0.5, 1, 0.75],
];
export const KIOSK_CELL = [0.125, 0, 0.375, 0.5];

function placeQuad(S, g, x, y, z, yaw) {
  g.rotateY(yaw);
  g.translate(x, y, z);
  S.push(g);
}

function entrance(ctx, Dt, G, S, R) {
  const { world, physics } = ctx;
  const { x, z, yaw } = ENTRANCE;
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const H = 11;
  let top = 0;
  for (const sx of [-1, 1]) {
    const [lx, lz] = rotY(sx * 6.5, 0, yaw);
    const gy = world.heightAt(x + lx, z + lz);
    top = Math.max(top, gy + H);
    const g = new THREE.CylinderGeometry(0.55, 0.85, H + 0.8, 28, 8);
    g.translate(0, (H + 0.8) / 2 - 0.8, 0);
    Dt.add(g.translate(x + lx, gy, z + lz), W);
    const off = new THREE.Vector3(0, 0, 0.68).applyQuaternion(qy);
    G.add(new THREE.BoxGeometry(0.08, H - 2, 0.08).translate(x + lx + off.x, gy + H / 2, z + lz + off.z), { color: CYAN, vary: 0 });
    physics.addStaticCylinder({ position: [x + lx, gy + H / 2, z + lz], radius: 0.8, height: H });
  }
  const beamGeo = new THREE.BoxGeometry(15, 1.0, 0.8);
  beamGeo.rotateY(yaw);
  Dt.add(beamGeo.translate(x, top - 0.4, z), W);
  const slab = new THREE.BoxGeometry(8.2, 4.3, 0.3);
  slab.rotateY(yaw);
  Dt.add(slab.translate(x, top - 3.2, z), { color: PEARL, vary: 0.02 });
  const [fx, fz] = rotY(0, 0.17, yaw);
  placeQuad(S, quad(7.8, 3.9, SIGN_CELLS[0]), x + fx, top - 3.2, z + fz, yaw);
  placeQuad(S, quad(7.8, 3.9, SIGN_CELLS[0]), x - fx, top - 3.2, z - fz, yaw + PI);

  const rb = REVIEW;
  const gb = world.heightAt(rb.x, rb.z);
  const qr = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rb.yaw);
  const local = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyQuaternion(qr).add(new THREE.Vector3(rb.x, gb, rb.z));
  for (const sx of [-1, 1]) {
    const p = local(sx * 3.85, 0, 0);
    const gy = world.heightAt(p.x, p.z);
    Dt.box(0.55, 10.8 + (gb - gy) + 0.5, 0.55, { radius: 0.16, segments: 2, pos: [p.x, (gb + 10.8 + gy - 0.5) / 2, p.z], ...W });
    physics.addStaticBox({ position: [p.x, gb + 5.3, p.z], size: [0.6, 11, 0.6] });
  }
  const backing = new THREE.BoxGeometry(7.4, 8.8, 0.35);
  backing.applyQuaternion(qr);
  const bc = local(0, 5.9, -0.05);
  Dt.add(backing.translate(bc.x, bc.y, bc.z), { color: PEARL, vary: 0.02 });
  const bar = new THREE.BoxGeometry(7.4, 0.5, 0.3);
  bar.applyQuaternion(qr);
  const lb = local(0, 0.6, 0);
  Dt.add(bar.translate(lb.x, lb.y, lb.z), W);
  physics.addStaticBox({ position: [lb.x, lb.y, lb.z], size: [7.6, 1.2, 0.4], quaternion: qr });
  physics.addStaticBox({ position: [bc.x, bc.y, bc.z], size: [7.4, 8.8, 0.4], quaternion: qr });
  const card = local(0, 5.5, 0.14);
  const rg = quad(7, 7 * (1792 / 2048), [0, 0, 1, 1792 / 2048]);
  rg.applyQuaternion(qr);
  R.push(rg.translate(card.x, card.y, card.z));
  const head = local(0, 9.65, 0.14);
  const hg = quad(5.6, 0.95, [0, 1792 / 2048, 0.75, 1]);
  hg.applyQuaternion(qr);
  R.push(hg.translate(head.x, head.y, head.z));
  const ger = local(1.6, 0.62, 0.17);
  const gg = quad(0.9, 0.45, [0.75, 1792 / 2048, 1, 1]);
  gg.rotateZ(-0.06);
  gg.applyQuaternion(qr);
  R.push(gg.translate(ger.x, ger.y, ger.z));
  const glowBar = new THREE.BoxGeometry(7.2, 0.08, 0.06);
  glowBar.applyQuaternion(qr);
  const gbp = local(0, 1.6, 0.16);
  G.add(glowBar.translate(gbp.x, gbp.y, gbp.z), { color: MAGENTA, vary: 0 });
  const review = { base: local(1.6, 0, 0.75), card: ger };
  review.base.y = world.heightAt(review.base.x, review.base.z);

  const k = KIOSK;
  const gk = world.heightAt(k.x, k.z);
  const qk = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), k.yaw);
  const shape = new THREE.Shape();
  shape.moveTo(-0.55, 0);
  shape.lineTo(0.55, 0);
  shape.lineTo(0.55, 2.3);
  shape.quadraticCurveTo(0.55, 2.6, 0.25, 2.6);
  shape.lineTo(-0.25, 2.6);
  shape.quadraticCurveTo(-0.55, 2.6, -0.55, 2.3);
  shape.lineTo(-0.55, 0);
  const kb = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 4, curveSegments: 10 });
  kb.translate(0, 0.1, -0.1);
  kb.applyQuaternion(qk);
  Dt.add(kb.translate(k.x, gk, k.z), W);
  Dt.add(lathe([[0, -0.3], [0.7, -0.3], [0.72, 0.06], [0.6, 0.12], [0, 0.12]], 32).translate(k.x, gk, k.z), { color: PEARL, vary: 0.02 });
  const kc = new THREE.Vector3(0, 1.55, 0.175).applyQuaternion(qk).add(new THREE.Vector3(k.x, gk, k.z));
  const ks = quad(0.86, 1.72, KIOSK_CELL);
  ks.applyQuaternion(qk);
  S.push(ks.translate(kc.x, kc.y, kc.z));
  const strip = new THREE.BoxGeometry(0.5, 0.04, 0.03);
  strip.applyQuaternion(qk);
  const sp = new THREE.Vector3(0, 0.45, 0.18).applyQuaternion(qk).add(new THREE.Vector3(k.x, gk, k.z));
  G.add(strip.translate(sp.x, sp.y, sp.z), { color: MAGENTA, vary: 0 });
  physics.addStaticBox({ position: [k.x, gk + 1.3, k.z], size: [1.2, 2.6, 0.45], quaternion: qk });
  const kiosk = { screen: kc, front: new THREE.Vector3(0, 1.5, 1.2).applyQuaternion(qk).add(new THREE.Vector3(k.x, gk, k.z)) };
  return { review, kiosk };
}

function siloSigns(ctx, S, plantInfo) {
  const { world } = ctx;
  const s = SILOS.find((v) => v.label);
  const a = 0.75;
  const g = world.heightAt(s.x, s.z);
  const span = 6.4 / (s.r + 0.08);
  const curved = new THREE.CylinderGeometry(s.r + 0.08, s.r + 0.08, 3.2, 40, 1, true, a - span / 2, span);
  const [u0, v0, u1, v1] = SIGN_CELLS[2];
  const uv = curved.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  S.push(curved.translate(s.x, g + s.h * 0.53, s.z));
  const { x, w } = PLANT;
  placeQuad(S, quad(7.2, 3.6, SIGN_CELLS[1]), x - w / 2 - 0.5, plantInfo.yb + 6.4, PLANT.z, -PI / 2);
  placeQuad(S, quad(5.6, 2.8, SIGN_CELLS[3]), x + 12.5, plantInfo.yb + 3.6, plantInfo.south + 0.56, 0);
}

function pads(ctx, Gr, G) {
  const { world } = ctx;
  const list = [
    { x: 585, z: -118, a: 42, b: 17 },
    { x: 585, z: -170, a: 33, b: 27 },
    { x: 646, z: -151.5, a: 31, b: 8 },
    { x: 481.6, z: -52.9, a: 15, b: 11, yaw: ENTRANCE.yaw },
  ];
  for (const p of list) {
    Gr.add(pad(world, p), { color: '#d2d8e2', vary: 0.06 });
    G.add(padRing(world, p), { color: CYAN, vary: 0 });
  }
  Gr.add(pad(world, { x: 742, z: 45.5, a: 20.5, b: 17.5, n: 2.6, lift: 0.045, rings: 9, segs: 80, edge: 0.3 }), { color: '#6d8f42', vary: 0.35 });
}

export function buildIndustry(ctx) {
  const L = new Parts(501);
  const LG = new Parts(502);
  const Dt = new Parts(503);
  const G = new Parts(504);
  const Gr = new Parts(505);
  const S = [];
  const R = [];
  let tall = null;
  for (const s of SILOS) {
    if (s.tall) tall = { ...tallSilo(ctx, L, LG, s), x: s.x, z: s.z };
    else silo(ctx, L, LG, s);
  }
  const plantInfo = plant(ctx, L, Dt, G);
  const fans = FANS.map((f) => fanUnit(ctx, Dt, G, f));
  cabinets(ctx, Dt, G);
  const boards = boardFrames(ctx, Dt, G);
  const { review, kiosk } = entrance(ctx, Dt, G, S, R);
  siloSigns(ctx, S, plantInfo);
  pads(ctx, Gr, G);
  const merge = (list) => {
    const P = new Parts(1);
    for (const g of list) P.add(g, { color: '#ffffff', vary: 0 });
    return P.build();
  };
  return {
    geometry: {
      landmark: L.build(), landmarkGlow: LG.build(), detail: Dt.build(), glow: G.build(), ground: Gr.build(),
      signs: merge(S), review: merge(R),
    },
    tall, fans, boards, chutes: plantInfo.chutes, review, kiosk, plant: plantInfo,
  };
}
