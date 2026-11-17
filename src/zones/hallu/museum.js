import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLSL } from '../../core/glsl.js';
import { Kit } from './geo.js';
import { makeAtlas, QuadKit } from './atlas.js';
import { frame, ROUTE_A } from './layout.js';

const UP = new THREE.Vector3(0, 1, 0);
const STONE = '#ddd1bf';
const STONE_D = '#c3b5a1';
const WOOD = '#8c6844';
const IRON = '#2c2830';
const SIGN_COLORS = ['#1f5a44', '#2a3f7a', '#5a2a6e', '#24525e', '#6e2a45'];

const quatY = (yaw) => new THREE.Quaternion().setFromAxisAngle(UP, yaw);
const local = (x, z, yaw, dx, dz) => [x + Math.cos(yaw) * dx + Math.sin(yaw) * dz, z - Math.sin(yaw) * dx + Math.cos(yaw) * dz];

function benchParts(K, x, y, z, yaw, { doubleBack = false } = {}) {
  const P = (dx, dy, dz) => {
    const [px, pz] = local(x, z, yaw, dx, dz);
    return [px, y + dy, pz];
  };
  for (const dx of [-0.85, 0.85]) {
    K.add(new RoundedBoxGeometry(0.12, 0.46, 0.5, 1, 0.03), { pos: P(dx, 0.23, 0), rot: [0, yaw, 0], color: IRON });
    K.add(new RoundedBoxGeometry(0.1, 0.06, 0.55, 1, 0.02), { pos: P(dx, 0.68, 0.02), rot: [0, yaw, 0], color: IRON });
  }
  for (let i = 0; i < 4; i++) K.add(new RoundedBoxGeometry(2.0, 0.05, 0.11, 1, 0.02), { pos: P(0, 0.47, -0.18 + i * 0.12), rot: [0, yaw, 0], color: WOOD, vary: 0.08 });
  const backs = doubleBack ? [-1, 1] : [-1];
  for (const sd of backs) {
    for (let i = 0; i < 3; i++) K.add(new RoundedBoxGeometry(2.0, 0.1, 0.05, 1, 0.02), { pos: P(0, 0.62 + i * 0.15, sd * 0.3), rot: [sd * 0.12, yaw, 0], order: 'YXZ', color: WOOD, vary: 0.08 });
  }
}

function figure(K, x, y, z, yaw, variant) {
  const P = (dx, dy, dz) => {
    const [px, pz] = local(x, z, yaw, dx, dz);
    return [px, y + dy, pz];
  };
  const limb = (from, to, r) => {
    const a = new THREE.Vector3(...P(...from));
    const b = new THREE.Vector3(...P(...to));
    const d = b.clone().sub(a);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
    K.add(new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2), 4, 10), { pos: a.clone().lerp(b, 0.5).toArray(), quat: q, color: '#f1e8e3' });
  };
  const legs = variant === 'legs' ? [-0.3, -0.1, 0.1, 0.3] : [-0.17, 0.17];
  for (const lx of legs) limb([lx, 0.05, 0], [lx * 0.8, 1.45, 0], 0.13);
  K.add(new THREE.CapsuleGeometry(0.36, 0.7, 6, 14), { pos: P(0, 1.95, 0), scale: [1, 1, 0.68], rot: [0, yaw, 0], color: '#f1e8e3' });
  K.add(new THREE.SphereGeometry(0.27, 16, 12), { pos: P(0, 2.82, 0), scale: [0.9, 1.1, 0.95], color: '#f3ebe6' });
  if (variant === 'faces') {
    K.add(new THREE.SphereGeometry(0.25, 16, 12), { pos: P(0.28, 2.84, 0), scale: [0.9, 1.1, 0.95], color: '#f3ebe6' });
    K.add(new THREE.SphereGeometry(0.22, 14, 10), { pos: P(-0.27, 2.78, 0.02), scale: [0.9, 1.1, 0.95], color: '#f3ebe6' });
  }
  if (variant === 'heads') K.add(new THREE.SphereGeometry(0.2, 14, 10), { pos: P(0, 3.25, 0), color: '#f3ebe6' });
  const arms = variant === 'arms' ? [[-0.42, 1], [0.42, 1], [0.42, -1]] : variant === 'oneSide' ? [[0.42, 1], [0.42, -1]] : [[-0.42, 1], [0.42, 1]];
  for (const [ax, dir] of arms) {
    const up = dir > 0 ? 2.25 : 1.85;
    limb([ax, up, 0], [ax * 1.6 + (dir < 0 ? 0.25 : 0), up - 0.55, 0.32 * dir], 0.095);
    limb([ax * 1.6 + (dir < 0 ? 0.25 : 0), up - 0.55, 0.32 * dir], [ax * 1.5, up - 1.05, 0.55 * dir], 0.085);
  }
}

export async function buildMuseum(ctx, { kits, mats, near, rand, groundY, box, cylinder }) {
  const { text, texts, physics, interact, scanner, props, bots } = ctx;
  const facts = texts.FALSE_FACTS;
  const P = (r, deg, v = 0) => frame(deg).at(r, v);
  const gy = (x, z) => groundY(x, z);
  const fakes = [];
  const animated = [];
  const extraMeshes = [];

  await text.ready;
  const signFacts = [0, 1, 4, 8, 13, 20, 21, 26, 30, 35, 39, 41, 43, 2, 17, 29];
  const atlas = makeAtlas(ctx, signFacts.map((i, k) => ({
    style: 'sign', title: facts[i % facts.length], accent: SIGN_COLORS[k % SIGN_COLORS.length], fontSize: 52,
  })), { cols: 4, rows: 4, cellW: 512, cellH: 256 });
  const faces = new QuadKit();
  const signSpots = [
    [124, -150, 0.3], [133, -141, -0.2], [119, -127, 0.15], [137, -108, 0.1], [121, -95, -0.25], [130, -83, 0.2],
    [118, -69, -0.1], [135, -57, 0.25], [124, -44, -0.2], [118, -16, 0.15], [127, 140, -0.1], [121, 160, 0.2],
    [133, 177, -0.15], [119, -168, 0.1], [140, 106, -0.2], [126, 92, 0.15],
  ];
  signSpots.forEach(([r, deg, lean], i) => {
    const [x, z] = P(r, deg);
    const y = gy(x, z);
    const F = frame(deg);
    const yaw = F.yawOut + (rand() - 0.5) * 1.2 + (i % 2 ? 0.5 : -0.5);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, lean * 0.4, 'YXZ'));
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
    const part = (geo, dx, dy, dz, color) => {
      const mm = m.clone().multiply(new THREE.Matrix4().makeTranslation(dx, dy, dz));
      kits.wood.add(geo, { matrix: mm, color, vary: 0.1 });
    };
    part(new THREE.CylinderGeometry(0.075, 0.095, 2.9, 8), 0, 1.2, -0.06, '#6f5236');
    part(new RoundedBoxGeometry(1.84, 0.98, 0.07, 1, 0.03), 0, 1.95, 0, '#7a5a3a');
    const rect = atlas.rects[i % atlas.rects.length];
    faces.add(rect, 1.72, 0.86, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.95, 0.037)));
    faces.add(rect, 1.72, 0.86, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.95, -0.037)).multiply(new THREE.Matrix4().makeRotationY(Math.PI)));
    cylinder({ position: [x, y + 1.2, z], radius: 0.12, height: 2.4 });
  });
  const faceMat = ctx.mat.standard({ map: atlas.texture, emissiveMap: atlas.texture, emissive: new THREE.Color(0.32, 0.3, 0.36), roughness: 0.75, metalness: 0 });
  const signFaces = new THREE.Mesh(faces.build(), faceMat);
  signFaces.name = 'hallu:sign-faces';
  signFaces.receiveShadow = true;
  near.add(signFaces);

  for (const [v, body] of [[-5.6, ['Ce pont existe.']], [5.6, ['Le saviez-vous ?', 'Ce pont a été vérifié à 97 %.', 'Source : ce panneau.']]]) {
    const [x, z] = ROUTE_A.at(117, v);
    const root = props.sign([x, gy(x, z), z], ROUTE_A.yawOut + (v > 0 ? -0.35 : 0.35), { text: body, swinging: v < 0 });
    if (root?.isObject3D) near.add(root);
    const board = root?.userData?.board?.mesh;
    if (board?.isObject3D) extraMeshes.push(board);
  }

  {
    const deg = -80;
    const F = frame(deg);
    const yaw = F.yawIn;
    const [x0, z0] = F.at(127);
    const y0 = gy(x0, z0);
    const RISE = 0.34;
    const RUN = 0.55;
    const N = 15;
    for (let i = 0; i < N; i++) {
      const [x, z] = F.at(127 - i * RUN);
      const top = y0 + (i + 1) * RISE;
      const h = top - (gy(x, z) - 1.5);
      kits.stone.add(new RoundedBoxGeometry(2.6, h, RUN + 0.06, 1, 0.04), { pos: [x, top - h / 2, z], rot: [0, yaw, 0], color: i % 2 ? STONE : '#d4c7b3', vary: 0.03 });
      box({ position: [x, top - h / 2, z], size: [2.6, h, RUN], quaternion: quatY(yaw) });
      if (i % 2 === 0) {
        const [bx, bz] = F.at(127 - i * RUN, 1.18);
        kits.stone.add(new THREE.CylinderGeometry(0.06, 0.08, 0.95, 8), { pos: [bx, top + 0.5, bz], color: STONE });
      }
    }
    const [ax, az] = F.at(127 - (N - 1) * RUN / 2, 1.18);
    const L = Math.hypot(N * RUN, N * RISE);
    kits.stone.add(new THREE.BoxGeometry(0.18, 0.12, L), { pos: [ax, y0 + (N * RISE) / 2 + 1.0, az], rot: [Math.atan2(N * RISE, N * RUN), yaw, 0], order: 'YXZ', color: STONE_D });
    const [lx, lz] = F.at(127 - N * RUN + 0.1);
    kits.glowViolet.add(new THREE.TorusGeometry(0.5, 0.03, 6, 24), { pos: [lx, y0 + N * RISE + 1.6, lz], rot: [0, yaw, 0], color: '#ffffff' });
  }

  const leafGeo = (() => {
    const K = new Kit(rand);
    K.add(new RoundedBoxGeometry(1.3, 2.4, 0.1, 1, 0.03), { pos: [0.65, 1.2, 0], color: '#6a4a75' });
    for (const [py, ph] of [[0.6, 0.8], [1.65, 0.9]]) K.add(new RoundedBoxGeometry(0.95, ph, 0.03, 1, 0.01), { pos: [0.65, py, 0.06], color: '#7c5a88' });
    K.add(new THREE.SphereGeometry(0.055, 10, 8), { pos: [1.15, 1.1, 0.1], color: '#e8c070' });
    return K.build();
  })();
  const doorSpots = [
    { r: 101.4, deg: -101, yawOff: 0, void: true },
    { r: 113, deg: -93, yawOff: 0.6 },
    { r: 124, deg: -97.5, yawOff: -0.9 },
  ];
  const leaves = new THREE.InstancedMesh(leafGeo, mats.wood, doorSpots.length);
  leaves.name = 'hallu:doors';
  leaves.castShadow = true;
  const doors = doorSpots.map((d, i) => {
    const F = frame(d.deg);
    const [x, z] = F.at(d.r);
    const y = gy(x, z) + (d.void ? 0.05 : 0);
    const yaw = F.yawIn + d.yawOff;
    const hinge = local(x, z, yaw, -0.65, 0);
    const Pd = (dx, dy, dz = 0) => {
      const [px, pz] = local(x, z, yaw, dx, dz);
      return [px, y + dy, pz];
    };
    for (const sd of [-1, 1]) kits.stone.add(new RoundedBoxGeometry(0.36, 2.9, 0.42, 1, 0.04), { pos: Pd(sd * 0.85, 1.35), rot: [0, yaw, 0], color: STONE });
    kits.stone.add(new RoundedBoxGeometry(2.2, 0.42, 0.5, 1, 0.05), { pos: Pd(0, 2.92), rot: [0, yaw, 0], color: STONE_D });
    kits.stone.add(new RoundedBoxGeometry(2.0, 0.12, 0.6, 1, 0.03), { pos: Pd(0, 0.03), rot: [0, yaw, 0], color: STONE_D });
    for (const sd of [-1, 1]) box({ position: Pd(sd * 0.85, 1.4), size: [0.36, 2.9, 0.42], quaternion: quatY(yaw) });
    const door = { i, x, y, z, yaw, hinge, open: 0, target: 0, collider: null, void: d.void };
    door.collider = physics.addStaticBox({ position: Pd(0, 1.2), size: [1.3, 2.4, 0.12], quaternion: quatY(yaw), userData: { surface: 'wood' } });
    door.handle = interact.add({
      id: `hallu:door:${i}`, position: new THREE.Vector3(...Pd(0, 1.3)), radius: 2.4,
      label: 'Ouvrir',
      onInteract: () => {
        door.target = door.target ? 0 : 1;
        door.handle.label = door.target ? 'Fermer' : 'Ouvrir';
        ctx.audio.sfx('door', { position: new THREE.Vector3(x, y + 1.2, z), pitch: door.void ? 0.8 : 1 });
        if (door.target) {
          door.collider?.remove();
          door.collider = null;
        } else if (!door.collider) {
          door.collider = physics.addStaticBox({ position: Pd(0, 1.2), size: [1.3, 2.4, 0.12], quaternion: quatY(yaw), userData: { surface: 'wood' } });
        }
      },
    });
    return door;
  });
  const m4 = new THREE.Matrix4();
  const writeDoors = () => {
    for (const d of doors) {
      m4.compose(new THREE.Vector3(d.hinge[0], d.y, d.hinge[1]), quatY(d.yaw - d.open * 1.75), new THREE.Vector3(1, 1, 1));
      leaves.setMatrixAt(d.i, m4);
    }
    leaves.instanceMatrix.needsUpdate = true;
  };
  writeDoors();
  leaves.computeBoundingSphere();
  leaves.boundingSphere.radius += 3;
  near.add(leaves);
  animated.push((dt) => {
    let moved = false;
    for (const d of doors) {
      const k = d.target - d.open;
      if (Math.abs(k) < 1e-3) continue;
      d.open += Math.sign(k) * Math.min(Math.abs(k), dt * 1.6);
      moved = true;
    }
    if (moved) writeDoors();
  });

  let clockHands = null;
  {
    const deg = -133;
    const F = frame(deg);
    const [x, z] = F.at(152);
    const y = gy(x, z) - 0.4;
    const yaw = F.yawIn;
    const T = (dx, dy, dz) => {
      const [px, pz] = local(x, z, yaw, dx, dz);
      return [px, y + dy, pz];
    };
    kits.stone.add(new THREE.CylinderGeometry(2.5, 2.9, 1.2, 8), { pos: T(0, 0.6, 0), rot: [0, yaw + Math.PI / 8, 0], color: STONE_D });
    kits.stone.add(new THREE.CylinderGeometry(1.95, 2.35, 12, 8), { pos: T(0, 7.2, 0), rot: [0, yaw + Math.PI / 8, 0], color: STONE, vary: 0.03 });
    for (let k = 0; k < 3; k++) kits.stone.add(new THREE.CylinderGeometry(2.05 - k * 0.12, 2.05 - k * 0.12, 0.25, 8), { pos: T(0, 4 + k * 3.4, 0), rot: [0, yaw + Math.PI / 8, 0], color: STONE_D });
    kits.stone.add(new RoundedBoxGeometry(4.4, 4.0, 4.4, 2, 0.15), { pos: T(0, 15.1, 0), rot: [0, yaw, 0], color: STONE });
    kits.stone.add(new RoundedBoxGeometry(4.9, 0.4, 4.9, 2, 0.1), { pos: T(0, 17.2, 0), rot: [0, yaw, 0], color: STONE_D });
    kits.stone.add(new RoundedBoxGeometry(4.8, 0.35, 4.8, 2, 0.1), { pos: T(0, 13.1, 0), rot: [0, yaw, 0], color: STONE_D });
    kits.iron.add(new THREE.ConeGeometry(3.5, 5.5, 4, 1), { pos: T(0, 20.15, 0), rot: [0, yaw + Math.PI / 4, 0], color: '#4a3f5c' });
    kits.iron.add(new THREE.SphereGeometry(0.22, 10, 8), { pos: T(0, 23.1, 0), color: '#c9a35a' });
    kits.iron.add(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), { pos: T(0, 23.9, 0), color: '#c9a35a' });
    cylinder({ position: T(0, 7, 0), radius: 2.5, height: 14 });
    const dial = text.canvas({
      width: 512, height: 512,
      draw(c, W) {
        const R = W / 2;
        c.fillStyle = '#f1e9d8';
        c.beginPath();
        c.arc(R, R, R - 4, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#2b2118';
        c.lineWidth = 10;
        c.beginPath();
        c.arc(R, R, R - 14, 0, Math.PI * 2);
        c.stroke();
        c.lineWidth = 3;
        for (let i = 0; i < 65; i++) {
          const a = (i / 65) * Math.PI * 2 - Math.PI / 2;
          const r0 = i % 5 === 0 ? R - 52 : R - 38;
          c.beginPath();
          c.moveTo(R + Math.cos(a) * r0, R + Math.sin(a) * r0);
          c.lineTo(R + Math.cos(a) * (R - 26), R + Math.sin(a) * (R - 26));
          c.stroke();
        }
        const numerals = ['XIII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
        c.fillStyle = '#2b2118';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        numerals.forEach((n, i) => {
          const a = (i / 13) * Math.PI * 2 - Math.PI / 2;
          c.font = `400 ${n.length > 3 ? 42 : 50}px "Instrument Serif"`;
          c.fillText(n, R + Math.cos(a) * (R - 100), R + Math.sin(a) * (R - 100));
        });
        c.font = 'italic 400 30px "Instrument Serif"';
        c.fillStyle = 'rgba(43, 33, 24, 0.75)';
        c.fillText('exacte à 97 %', R, R + 92);
      },
    });
    const dialTex = new THREE.CanvasTexture(dial);
    dialTex.colorSpace = THREE.SRGBColorSpace;
    dialTex.anisotropy = 8;
    const dialMat = ctx.mat.basic({ map: dialTex, color: new THREE.Color(1.15, 1.1, 1.05) });
    const dialGeo = new THREE.CircleGeometry(1.55, 40);
    const faceList = [];
    for (const side of [1, -1]) {
      const g = dialGeo.clone();
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...T(0, 15.2, side * 2.215)), quatY(yaw + (side > 0 ? 0 : Math.PI)), new THREE.Vector3(1, 1, 1)));
      faceList.push(g);
      kits.iron.add(new THREE.TorusGeometry(1.6, 0.09, 6, 40), { pos: T(0, 15.2, side * 2.22), rot: [0, yaw, 0], color: '#c9a35a' });
    }
    near.add(new THREE.Mesh(mergeGeometries(faceList), dialMat));
    const handGeo = new THREE.BoxGeometry(0.09, 1, 0.04).translate(0, 0.4, 0);
    clockHands = new THREE.InstancedMesh(handGeo, mats.iron, 4);
    clockHands.name = 'hallu:clock-hands';
    const hands = [];
    for (const side of [1, -1]) {
      for (const [len, w] of [[0.85, 1.4], [1.3, 1]]) hands.push({ side, len, w, pos: new THREE.Vector3(...T(0, 15.2, side * 2.26)), yaw: yaw + (side > 0 ? 0 : Math.PI) });
    }
    const hq = new THREE.Quaternion();
    const hz = new THREE.Quaternion();
    const Z = new THREE.Vector3(0, 0, 1);
    let tick = 0;
    let minute = 0.37;
    const writeHands = () => {
      hands.forEach((h, i) => {
        const turn = h.len < 1 ? minute / 13 + 0.31 : minute;
        hq.copy(quatY(h.yaw)).multiply(hz.setFromAxisAngle(Z, -turn * Math.PI * 2 * (h.side > 0 ? 1 : 1)));
        m4.compose(h.pos, hq, new THREE.Vector3(h.w, h.len, 1));
        clockHands.setMatrixAt(i, m4);
      });
      clockHands.instanceMatrix.needsUpdate = true;
    };
    writeHands();
    clockHands.computeBoundingSphere();
    near.add(clockHands);
    animated.push((dt) => {
      tick += dt;
      if (tick < 1) return;
      tick -= 1;
      minute = (minute + (rand() < 0.12 ? -2 : 1) / 65 + 1) % 1;
      writeHands();
    });
    ctx.env.lights.add({ position: new THREE.Vector3(...T(0, 15.2, 3.4)), color: '#fff2d8', intensity: 2.2, distance: 12 });
  }

  {
    const deg = -61;
    const F = frame(deg);
    const variants = ['arms', 'faces', 'normal', 'oneSide', 'legs', 'heads'];
    const fakeKit = new Kit(rand);
    variants.forEach((variant, i) => {
      const v = (i - (variants.length - 1) / 2) * 4.2;
      const [x, z] = F.at(127, v);
      const y = gy(x, z);
      const yaw = F.yawOut + (variant === 'normal' ? Math.PI : 0);
      kits.stone.add(new RoundedBoxGeometry(1.5, 1.25, 1.5, 1, 0.06), { pos: [x, y + 0.5, z], rot: [0, yaw, 0], color: STONE_D });
      kits.stone.add(new RoundedBoxGeometry(1.7, 0.18, 1.7, 1, 0.05), { pos: [x, y + 1.18, z], rot: [0, yaw, 0], color: STONE });
      box({ position: [x, y + 0.6, z], size: [1.5, 1.35, 1.5], quaternion: quatY(yaw) });
      const isFake = variant === 'heads';
      figure(isFake ? fakeKit : kits.statues, x, y + 1.27, z, yaw, variant);
      if (!isFake) cylinder({ position: [x, y + 2.9, z], radius: 0.45, height: 3.2 });
    });
    const g = fakeKit.build();
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    g.translate(-c.x, -c.y, -c.z);
    const mesh = new THREE.Mesh(g, mats.pearl);
    mesh.position.copy(c);
    mesh.castShadow = true;
    const grp = new THREE.Group();
    grp.add(mesh);
    near.add(grp);
    fakes.push(grp);
  }

  {
    const F = frame(-103);
    const [x1, z1] = F.at(136, -1.3);
    const [x2, z2] = F.at(136, 1.3);
    benchParts(kits.wood, x1, gy(x1, z1), z1, F.yawOut + Math.PI);
    box({ position: [x1, gy(x1, z1) + 0.4, z1], size: [2.0, 0.8, 0.6], quaternion: quatY(F.yawOut + Math.PI) });
    const K = new Kit(rand);
    benchParts(K, 0, 0, 0, F.yawOut + Math.PI, { doubleBack: true });
    const mesh = new THREE.Mesh(K.build(), mats.wood);
    mesh.castShadow = true;
    const grp = new THREE.Group();
    grp.position.set(x2, gy(x2, z2), z2);
    grp.add(mesh);
    near.add(grp);
    fakes.push(grp);
  }

  {
    const F = frame(-38);
    const [x, z] = F.at(126);
    const y = gy(x, z);
    const yaw = F.yawIn + Math.PI / 2;
    const K = new Kit(rand);
    for (let i = -4; i <= 4; i++) {
      const h = 3.2 - Math.abs(i) * 0.18 + (rand() - 0.5) * 0.5;
      for (let row = 0; row < 6; row++) {
        const bh = h / 6;
        K.add(new RoundedBoxGeometry(0.98, bh - 0.03, 0.7, 1, 0.05), { pos: [i * 1.0 + (row % 2) * 0.5 - 0.25, row * bh + bh / 2 - 0.3, 0], color: row % 2 ? STONE : '#cdbfaa', vary: 0.06 });
      }
    }
    K.add(new RoundedBoxGeometry(1.4, 4.0, 1.1, 1, 0.08), { pos: [-4.9, 1.7, 0], color: STONE_D });
    K.add(new RoundedBoxGeometry(1.4, 4.0, 1.1, 1, 0.08), { pos: [4.9, 1.7, 0], color: STONE_D });
    const mesh = new THREE.Mesh(K.build(), mats.stone);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    grp.rotation.y = yaw;
    grp.add(mesh);
    near.add(grp);
    fakes.push(grp);
  }

  const lampSpots = [
    { r: 133, deg: -112 }, { r: 128, deg: -99 }, { r: 127, deg: -86 }, { r: 128, deg: -73.5 }, { r: 128, deg: -72, flip: true },
    { r: 130, deg: -130 }, { r: 131, deg: -150 }, { r: 127, deg: -50 },
  ];
  const coneMat = ctx.mat.shader({
    vertexShader: `
      attribute vec3 color;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vNormalW = normal;
        vColor = color;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      ${GLSL.envPars}
      ${GLSL.fog}
      varying vec3 vColor;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      void main() {
        vec3 toCam = cameraPosition - vWorld;
        vec3 v = toCam / max(length(toCam), 1e-4);
        vec3 n = vNormalW / max(length(vNormalW), 1e-4);
        float soft = smoothstep(0.05, 0.7, abs(dot(n, v)));
        float fade = pow(clamp(vColor.r, 0.0, 1.0), 1.6);
        vec3 tint = mix(vec3(0.93, 0.88, 1.0), vec3(0.75, 0.55, 1.0), vColor.g);
        vec3 col = tint * fade * soft * (0.03 + 0.16 * uNight);
        gl_FragColor = vec4(applyFogAdditive(col, vWorld), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const coneGeo = (rTop, rBottom, h, lampAtTop, violet) => {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, 20, 6, true);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + h / 2) / h;
      col[i * 3] = lampAtTop ? t : 1 - t;
      col[i * 3 + 1] = violet ? 1 : 0;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };
  const cones = new Kit(rand);
  lampSpots.forEach((l, i) => {
    const F = frame(l.deg);
    const [x, z] = F.at(l.r);
    const y = gy(x, z);
    const yaw = F.yawIn + Math.PI / 2;
    const H = 4.4;
    const [hx, hz] = local(x, z, yaw, 0, 0.9);
    if (l.flip) {
      kits.iron.add(new THREE.CylinderGeometry(0.08, 0.11, H, 8), { pos: [x, y + H / 2, z], color: IRON });
      kits.iron.add(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), { pos: [(x + hx) / 2, y + 0.45, (z + hz) / 2], rot: [Math.PI / 2, yaw, 0], order: 'YXZ', color: IRON });
      kits.iron.add(new THREE.ConeGeometry(0.32, 0.4, 10), { pos: [hx, y + 0.65, hz], color: IRON });
      kits.glowWhite.add(new THREE.SphereGeometry(0.17, 10, 8), { pos: [hx, y + 0.42, hz], color: '#ffffff' });
    } else {
      kits.iron.add(new THREE.CylinderGeometry(0.08, 0.11, H, 8), { pos: [x, y + H / 2, z], color: IRON });
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, y + H - 0.1, z), new THREE.Vector3(x, y + H + 0.6, z), new THREE.Vector3(hx, y + H + 0.45, hz));
      kits.iron.add(new THREE.TubeGeometry(curve, 10, 0.05, 6), { color: IRON });
      kits.iron.add(new THREE.CylinderGeometry(0.06, 0.34, 0.32, 10), { pos: [hx, y + H + 0.3, hz], color: IRON });
      kits.glowWhite.add(new THREE.SphereGeometry(0.16, 10, 8), { pos: [hx, y + H + 0.13, hz], color: '#ffffff' });
      kits.glowViolet.add(new THREE.SphereGeometry(0.12, 10, 8), { pos: [hx, y + H + 0.48, hz], color: '#ffffff' });
      cones.add(coneGeo(0.2, 1.7, H, true, false), { pos: [hx, y + H / 2 + 0.05, hz] });
      cones.add(coneGeo(1.25, 0.12, 7, false, true), { pos: [hx, y + H + 0.5 + 3.5, hz] });
    }
    cylinder({ position: [x, y + H / 2, z], radius: 0.14, height: H });
    if (i < 2) ctx.env.lights.add({ position: new THREE.Vector3(hx, y + H - 0.4, hz), color: '#efe2ff', intensity: 2.0, distance: 14 });
  });
  const coneMesh = new THREE.Mesh(cones.build(), coneMat);
  coneMesh.name = 'hallu:light-cones';
  coneMesh.renderOrder = 3;
  near.add(coneMesh);

  const BOT_SPOTS = [
    { r: 103, deg: -125, n: 3, rad: 2.2 }, { r: 104, deg: 128, n: 3, rad: 2.4 },
    { r: 8, deg: 40, n: 2, rad: 1.2 }, { r: 149, deg: -128, n: 2, rad: 3 }, { r: 112, deg: -30, n: 2, rad: 2 },
  ];
  const lines = facts.filter((_, i) => i % 3 === 0).slice(0, 14);
  for (const b of BOT_SPOTS) bots.spawn({ center: P(b.r, b.deg), radius: b.rad, count: b.n, behavior: 'stare', lines });

  for (const grp of fakes) scanner.hallucination(grp, { duration: 9 });

  return {
    extraMeshes,
    update(dt) {
      for (const fn of animated) fn(dt);
    },
  };
}
