import * as THREE from 'three';
import { Parts, PI, lathe } from './kit.js';
import { seeded } from '../../core/rng.js';

const BEIGE = '#d9cfb3';

export function modemMesh(mats) {
  const P = new Parts(501);
  P.box(0.44, 0.075, 0.3, { radius: 0.025, segments: 3, pos: [0, 0, 0], color: BEIGE, vary: 0.05 });
  P.box(0.4, 0.03, 0.26, { radius: 0.02, segments: 2, pos: [0, 0.04, -0.01], color: '#e2d9c0', vary: 0.04 });
  P.box(0.4, 0.032, 0.03, { radius: 0.01, pos: [0, 0.008, 0.143], rot: [-0.35, 0, 0], color: '#2a2622', vary: 0 });
  const leds = ['#3bff6b', '#3bff6b', '#ffb020', '#3bff6b', '#ff3b2a', '#3bff6b', '#3bff6b', '#3bff6b'];
  leds.forEach((c, i) => {
    const blink = i === 2 || i === 4 || i === 5 ? [5, 2.2 + i * 0.7, i * 0.13] : [4, 0, 0];
    P.add(new THREE.SphereGeometry(0.0075, 8, 6), { pos: [-0.15 + i * 0.043, 0.012, 0.162], color: c, glow: blink, vary: 0 });
  });
  for (let i = 0; i < 7; i++) P.box(0.012, 0.006, 0.16, { radius: 0.002, pos: [-0.12 + i * 0.04, 0.057, -0.03], color: '#9c9178', vary: 0 });
  for (const [x, z] of [[-0.18, -0.11], [0.18, -0.11], [-0.18, 0.11], [0.18, 0.11]]) P.add(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 10), { pos: [x, -0.042, z], color: '#222222', vary: 0 });
  const pts = [];
  for (let i = 0; i <= 160; i++) {
    const t = i / 160;
    const a = t * PI * 2 * 9;
    const along = new THREE.Vector3(0.12 - t * 0.05, -0.02 - t * 0.02, -0.15 - t * 0.34);
    pts.push(along.add(new THREE.Vector3(Math.cos(a) * 0.016, Math.sin(a) * 0.016, 0)));
  }
  P.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 320, 0.004, 4, false), { color: '#d7d0c0', vary: 0 });
  P.box(0.03, 0.02, 0.045, { radius: 0.004, pos: [0.07, -0.04, -0.51], color: '#c8d8d8', vary: 0 });
  const mesh = new THREE.Mesh(P.build(), mats.plastic);
  mesh.castShadow = true;
  return { mesh, size: [0.44, 0.11, 0.3] };
}

export function floppyMesh(mats, ctx, labelTex) {
  const P = new Parts(502);
  P.box(0.35, 0.028, 0.35, { radius: 0.006, segments: 2, color: '#1b2236', vary: 0.04 });
  P.box(0.2, 0.031, 0.105, { radius: 0.004, pos: [0.02, 0, -0.12], color: '#b8bcc2', metal: 1, vary: 0.02 });
  P.box(0.045, 0.033, 0.065, { radius: 0.002, pos: [0.055, 0, -0.125], color: '#0b0c10', vary: 0 });
  P.box(0.025, 0.031, 0.025, { radius: 0.002, pos: [-0.15, 0, 0.15], color: '#0b0c10', vary: 0 });
  P.add(new THREE.CylinderGeometry(0.045, 0.045, 0.031, 20), { pos: [0, -0.0005, 0], color: '#a8acb2', metal: 1, vary: 0 });
  const mesh = new THREE.Mesh(P.build(), mats.plastic);
  mesh.castShadow = true;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.21), ctx.mat.standard({ map: labelTex, roughness: 0.8 }));
  label.rotation.x = -PI / 2;
  label.position.set(0, 0.0152, 0.055);
  mesh.add(label);
  return { mesh, size: [0.35, 0.03, 0.35] };
}

export function cdMesh(mats, ctx, sleeveTex) {
  const sleeveMat = ctx.mat.standard({ map: sleeveTex, roughness: 0.6 });
  const g = new THREE.BoxGeometry(0.31, 0.012, 0.31);
  const mesh = new THREE.Mesh(g, sleeveMat);
  mesh.castShadow = true;
  const disc = new THREE.Mesh(
    lathe([[0.022, -0.0025], [0.145, -0.0025], [0.148, 0], [0.145, 0.0025], [0.022, 0.0025], [0.02, 0], [0.022, -0.0025]], 48),
    ctx.mat.physical({ color: '#e8e8f0', metalness: 1, roughness: 0.12, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessMinimum: 180, iridescenceThicknessMaximum: 520, clearcoat: 1 }),
  );
  disc.position.set(0.1, 0.009, 0.01);
  disc.castShadow = true;
  mesh.add(disc);
  return { mesh, size: [0.31, 0.022, 0.31] };
}

export function gifMeshes(mats) {
  const star = new THREE.Shape();
  for (let i = 0; i <= 10; i++) {
    const a = PI / 2 + (i / 10) * PI * 2;
    const rr = i % 2 ? 0.26 : 0.6;
    if (i === 0) star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const S = new Parts(601);
  S.add(new THREE.ExtrudeGeometry(star, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 2 }).translate(0, 0, -0.06), { color: '#ffd21a', glow: [1.1, 0, 0], vary: 0.04 });
  for (const z of [0.1, -0.1]) S.add(new THREE.ExtrudeGeometry(star, { depth: 0.02, bevelEnabled: false }).scale(0.55, 0.55, 1).translate(0, 0, z - 0.01), { color: '#ff3a1a', glow: [1.6, 0, 0], vary: 0 });
  const starMesh = new THREE.Mesh(S.build(), mats.plastic);

  const F = new Parts(602);
  const prof = [[0, 0], [0.14, 0.05], [0.2, 0.18], [0.17, 0.36], [0.1, 0.56], [0.035, 0.76], [0, 0.84]];
  F.add(lathe(prof, 14), { color: '#ff3b10', glow: [3, 0, 0], vary: 0.1 });
  F.add(lathe(prof, 12), { color: '#ff9a1f', glow: [4.5, 0, 0], scale: [0.72, 0.8, 0.72], pos: [0, 0.015, 0.03], vary: 0.05 });
  F.add(lathe(prof, 10), { color: '#ffe680', glow: [7, 0, 0], scale: [0.42, 0.55, 0.42], pos: [0, 0.03, 0.06], vary: 0 });
  for (const [x, s] of [[-0.16, 0.5], [0.15, 0.42]]) F.add(lathe(prof, 8), { color: '#ff6a10', glow: [4, 0, 0], scale: [s, s, s], pos: [x, 0, 0], vary: 0 });
  const flameMesh = new THREE.Mesh(F.build(), mats.plastic);

  const E = new Parts(603);
  E.box(0.62, 0.42, 0.06, { radius: 0.012, color: '#f4efe0', glow: [0.25, 0, 0], vary: 0.03 });
  const flap = new THREE.Shape();
  flap.moveTo(-0.31, 0.21);
  flap.lineTo(0.31, 0.21);
  flap.lineTo(0, -0.04);
  flap.lineTo(-0.31, 0.21);
  for (const z of [0.031, -0.031]) {
    E.add(new THREE.ExtrudeGeometry(flap, { depth: 0.01, bevelEnabled: false }).translate(0, 0, z > 0 ? z : z - 0.01), { color: '#ddd3bb', glow: [0.25, 0, 0], vary: 0 });
  }
  E.add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 20).rotateX(PI / 2), { pos: [0, -0.03, 0.042], color: '#d4141c', glow: [1.5, 0, 0], vary: 0 });
  E.add(new THREE.CylinderGeometry(0.05, 0.05, 0.075, 18).rotateX(PI / 2), { pos: [0.29, 0.2, 0], color: '#ffd400', glow: [2.4, 2, 0], vary: 0 });
  const envMesh = new THREE.Mesh(E.build(), mats.plastic);
  for (const m of [starMesh, flameMesh, envMesh]) m.castShadow = true;
  return { star: starMesh, flame: flameMesh, envelope: envMesh };
}

export function bookMeshes(mats, ctx, spreadTex) {
  const cover = new Parts(701);
  cover.box(0.38, 0.014, 0.48, { radius: 0.005, pos: [0.19, 0.037, 0], color: '#6e1a16', vary: 0.12 });
  cover.box(0.2, 0.002, 0.07, { pos: [0.21, 0.045, -0.12], color: '#c9a24a', metal: 1, vary: 0 });
  const coverPivot = new THREE.Group();
  const coverMesh = new THREE.Mesh(cover.build(), mats.wood);
  coverMesh.castShadow = true;
  coverPivot.add(coverMesh);

  const left = new Parts(702);
  left.box(0.36, 0.055, 0.46, { radius: 0.004, pos: [-0.28, 0.068, 0], color: '#efe2c4', vary: 0.04 });
  const openGroup = new THREE.Group();
  const leftMesh = new THREE.Mesh(left.build(), mats.wood);
  const spread = new THREE.Mesh(new THREE.PlaneGeometry(0.73, 0.46), ctx.mat.standard({ map: spreadTex, roughness: 0.9, emissive: '#ffffff', emissiveMap: spreadTex, emissiveIntensity: 0.12 }));
  spread.rotation.x = -PI / 2;
  spread.position.set(-0.095, 0.1015, 0);
  openGroup.add(leftMesh, spread);
  openGroup.visible = false;

  const C = new Parts(703);
  const iron = { color: '#5a4636', metal: 1, vary: 0.15 };
  for (const z of [-0.12, 0.12]) {
    const rect = [[-0.12, 0.02], [0.3, 0.02], [0.3, 0.125], [-0.12, 0.125]];
    let k = 0;
    for (let e = 0; e < 4; e++) {
      const [ax, ay] = rect[e];
      const [bx, by] = rect[(e + 1) % 4];
      const len = Math.hypot(bx - ax, by - ay);
      const n = Math.max(1, Math.round(len / 0.04));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const ang = Math.atan2(by - ay, bx - ax);
        C.add(new THREE.TorusGeometry(0.018, 0.0055, 5, 10), {
          ...iron, pos: [ax + (bx - ax) * t, ay + (by - ay) * t, z + (k % 2 ? 0.004 : -0.004)], rot: [k % 2 ? PI / 2 : 0, 0, ang], scale: [1.35, 0.85, 1],
        });
        k++;
      }
    }
  }
  C.box(0.075, 0.085, 0.032, { radius: 0.01, pos: [0.33, 0.06, 0.0], color: '#7a6a3a', metal: 1 });
  C.add(new THREE.TorusGeometry(0.026, 0.007, 6, 12, PI), { ...iron, pos: [0.33, 0.1, 0] });
  const chain = new THREE.Mesh(C.build(), mats.rust);
  chain.castShadow = true;
  return { coverPivot, openGroup, chain };
}

export function tumbleweedGeometry() {
  const r = seeded('tumbleweed');
  const P = new Parts(801);
  for (let i = 0; i < 36; i++) {
    const pts = [];
    const ax = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    const start = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    const q = new THREE.Quaternion();
    const span = 1.2 + r() * 1.6;
    for (let k = 0; k < 5; k++) {
      q.setFromAxisAngle(ax, (k / 4) * span);
      pts.push(start.clone().applyQuaternion(q).multiplyScalar(0.3 + r() * 0.14));
    }
    P.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.011, 3, false), { color: r() < 0.5 ? '#9a7e58' : '#7d6446', vary: 0.15 });
  }
  return P.build();
}
