import * as THREE from 'three';
import { Kit, slabGeometry } from './hallu/geo.js';
import { createMaterials } from './hallu/mats.js';
import { createInstancedGhost } from './hallu/ghost.js';
import { createStones } from './hallu/stones.js';
import { createRopeBridge } from './hallu/ropebridge.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildGrandBridge, spandrelGeometry } from './hallu/bridge.js';
import { buildHand } from './hallu/hand.js';
import { buildMuseum } from './hallu/museum.js';
import { buildRotunda } from './hallu/rotunda.js';
import { buildMist } from './hallu/mist.js';
import {
  CENTER, PILLAR_Y, FALL_Y, ROUTE_A, ROUTE_B, ROUTE_C, STEP_SLOTS, STEPS_B, STEP_PITCH, SLAB_HALF, JETTY_B,
  ROPE_C, ROCK_C, HIDDEN_C, EDIT_STONE, BRIDGE_A,
} from './hallu/layout.js';

const ID = 'hallu';
const NEAR = 350;
const ACTIVE = 350;
const VISIT = 235;
const CHASM_IN = 24;
const CHASM_OUT = 99;
const RATE = 25;
const HAND = { r: 102, v: -26, scale: 1.22 };
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export default async function create(ctx) {
  const { scene, world, physics, state, events, scanner, beacons, traces, companion, rng } = ctx;
  const flag = (k) => state.flag(`zone.${ID}.${k}`);
  const setFlag = (k) => state.setFlag(`zone.${ID}.${k}`, true);
  const groundY = (x, z) => world.heightAt(x, z);
  const rand = rng.seeded('hallu');

  world.addClearing({ x: CENTER[0], z: CENTER[1], r: 112, trees: true, grass: false, rocks: true });
  world.addClearing({ x: CENTER[0], z: CENTER[1], r: 11.5, trees: true, grass: true, rocks: true });
  for (const F of [ROUTE_A, ROUTE_B, ROUTE_C]) {
    const [px, pz] = F.at(23);
    world.addClearing({ x: px, z: pz, r: 5, trees: true, grass: true, rocks: true });
    const [x, z] = F.at(118);
    world.addClearing({ x, z, r: 22, trees: true, grass: true, rocks: true });
  }

  const mats = createMaterials(ctx);
  mats.rope = ctx.mat.standard({ color: '#8a7350', roughness: 0.95, metalness: 0 });
  const ghostMat = createInstancedGhost(ctx.mat);
  const kits = {
    stone: new Kit(rand), rock: new Kit(rand), wood: new Kit(rand), iron: new Kit(rand),
    glowViolet: new Kit(rand), glowMint: new Kit(rand), glowWhite: new Kit(rand), statues: new Kit(rand), paving: new Kit(rand),
  };
  mats.statues = mats.pearl;
  mats.paving = mats.stone;
  const root = new THREE.Group();
  root.name = 'zone:hallu';
  const near = new THREE.Group();
  near.name = 'hallu:near';
  const far = new THREE.Group();
  far.name = 'hallu:far';
  root.add(near, far);
  scene.add(root);

  const colliders = [];
  const box = (o) => colliders.push(physics.addStaticBox({ ...o, userData: { surface: 'stone', ...(o.userData || {}) } }));
  const cylinder = (o) => colliders.push(physics.addStaticCylinder({ ...o, userData: { surface: 'stone', ...(o.userData || {}) } }));

  const bridge = buildGrandBridge(ctx, rand);
  kits.stone.merge(bridge.kits.real);
  kits.glowWhite.merge(bridge.kits.realGlow);
  for (const c of bridge.realColliders) box(c);
  for (let k = 1; k <= 5; k++) {
    const r = BRIDGE_A.from + 0.5 + k * 0.62;
    const top = bridge.y0 - k * 0.2;
    const [x, z] = ROUTE_A.at(r);
    if (top < groundY(x, z) - 0.05) break;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ROUTE_A.yawIn);
    kits.stone.add(new RoundedBoxGeometry(BRIDGE_A.width + 0.8 - k * 0.1, 1.6, 0.64, 1, 0.05), { pos: [x, top - 0.8, z], quat: q, color: k % 2 ? '#d6cab7' : '#ddd1bf', vary: 0.03 });
  }
  {
    const L = 3.6;
    const [lx, lz] = ROUTE_A.at(BRIDGE_A.from + L);
    const rise = Math.max(0.05, bridge.y0 - groundY(lx, lz) + 0.05);
    const pitch = Math.atan2(rise, L);
    const T = 1;
    const [mx, mz] = ROUTE_A.at(BRIDGE_A.from + L / 2);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, ROUTE_A.yawIn, 0, 'YXZ'));
    const off = new THREE.Vector3(0, -T / 2, 0).applyQuaternion(q);
    box({ position: [mx + off.x, bridge.y0 - rise / 2 + off.y, mz + off.z], size: [BRIDGE_A.width + 0.6, T, Math.hypot(L, rise) + 0.2], quaternion: q });
  }
  const fakeBridge = new THREE.Group();
  fakeBridge.name = 'hallu:bridge-fake';
  fakeBridge.position.copy(bridge.centerOfFake);
  const offset = new THREE.Matrix4().makeTranslation(-bridge.centerOfFake.x, -bridge.centerOfFake.y, -bridge.centerOfFake.z);
  const fakeStoneGeo = bridge.kits.fake.build().applyMatrix4(offset);
  const fakeGlowGeo = bridge.kits.fakeGlow.build().applyMatrix4(offset);
  const fakeStone = new THREE.Mesh(fakeStoneGeo, mats.stone);
  fakeStone.castShadow = true;
  fakeStone.receiveShadow = true;
  fakeBridge.add(fakeStone, new THREE.Mesh(fakeGlowGeo, mats.glowWhite));
  near.add(fakeBridge);
  const verifiedStrip = new THREE.Mesh(bridge.kits.verified.build(), mats.glowMint);
  verifiedStrip.visible = false;
  near.add(verifiedStrip);
  let bridgeFake = null;
  let bridgeColliders = [];

  const slabs = [];
  const F_B = ROUTE_B;
  let jettyY = 0;
  for (let r = 99; r <= JETTY_B.from; r += 1) {
    for (const v of [-1.6, 0, 1.6]) {
      const [x, z] = F_B.at(r, v);
      jettyY = Math.max(jettyY, groundY(x, z));
    }
  }
  jettyY += 0.18;
  const stepY = (k) => jettyY + (PILLAR_Y - jettyY) * ((k + 1) / (STEPS_B.length + 1));
  const stepR = (k) => JETTY_B.to - 2.0 - SLAB_HALF - k * STEP_PITCH;
  const realStepsB = [];
  STEPS_B.forEach((step, k) => {
    for (const slot of step.slots) {
      const v = STEP_SLOTS[slot] + (rand() - 0.5) * 0.3;
      const r = stepR(k) + (rand() - 0.5) * 0.3;
      const [x, z] = F_B.at(r, v);
      const kind = slot === step.real ? 'real' : 'fake';
      const y = stepY(k) + (rand() - 0.5) * 0.12;
      slabs.push({ pos: [x, y, z], yaw: F_B.yawIn + (rand() - 0.5) * 0.3, kind, group: `b${k}`, scale: 0.98 + rand() * 0.06 });
      if (kind === 'real') realStepsB.push([x, y, z]);
    }
  });
  const landingB = stepR(STEPS_B.length - 1) - SLAB_HALF - 2.0;

  const F_C = ROUTE_C;
  const [cax, caz] = F_C.at(ROPE_C.from);
  let ropeY = 0;
  for (const v of [-1, 0, 1]) {
    const [x, z] = F_C.at(ROPE_C.from + 0.6, v);
    ropeY = Math.max(ropeY, groundY(x, z));
  }
  ropeY += 0.02;
  const rockY = ropeY + 0.35;
  const [cbx, cbz] = F_C.at(ROPE_C.to);
  const hiddenY = (i) => rockY + (PILLAR_Y - rockY) * ((i + 1) / (HIDDEN_C.length + 1));
  HIDDEN_C.forEach((h, i) => {
    const [x, z] = F_C.at(h.r, h.v);
    slabs.push({ pos: [x, hiddenY(i), z], yaw: F_C.yawIn + (rand() - 0.5) * 0.4, kind: 'hidden', group: `c${i}`, scale: 0.98 });
  });
  const landingC = HIDDEN_C[HIDDEN_C.length - 1].r - SLAB_HALF - 2.0;
  const [ex, ez] = F_C.at(EDIT_STONE.r, EDIT_STONE.v);
  const [erx, erz] = F_C.at(101, EDIT_STONE.v);
  const editY = groundY(erx, erz) + 0.1;
  slabs.push({ pos: [ex, editY, ez], yaw: 0.4, kind: 'hidden', group: 'edit', scale: 0.92 });

  const stones = createStones(ctx, {
    material: mats.rock, ghostMaterial: ghostMat, slabs,
    onFirstReveal: () => sayOnce('zone.hallu.scan'),
  });
  near.add(...stones.meshes);

  const rope = createRopeBridge(ctx, {
    a: [cax, ropeY, caz], b: [cbx, rockY, cbz], segments: ROPE_C.segments, slack: ROPE_C.slack, width: ROPE_C.width,
    materials: mats, kits,
  });
  near.add(...rope.meshes);
  const ropeMid = rope.rest[Math.floor(rope.rest.length / 2)].position;
  events.on('player:land', ({ speed = 0 } = {}) => {
    if (active && speed > 2) rope.load(ctx.player.position, Math.min(14, speed) * 45);
  });
  {
    const [x, z] = F_C.at(ROPE_C.from + 0.75);
    box({ position: [x, ropeY - 0.19, z], size: [ROPE_C.width + 0.9, 0.36, 1.5], quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), F_C.yawIn) });
    const [px, pz] = F_C.at(ROPE_C.to - 0.35);
    box({ position: [px, rockY - 0.2, pz], size: [ROPE_C.width + 0.4, 0.4, 0.7], quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), F_C.yawIn) });
  }

  {
    const [x, z] = F_C.at(ROCK_C.r);
    const g = slabGeometry({ seed: 11, half: ROCK_C.radius, power: 2.4, depth: 7.5, rough: 0.12 });
    kits.rock.add(g, { pos: [x, rockY, z], rot: [0, 0.7, 0], color: '#8d8296' });
    colliders.push(physics.addStaticCylinder({ position: [x, rockY - 0.5, z], radius: ROCK_C.radius * 0.94, height: 1, userData: { surface: 'stone' } }));
  }

  function paved(F, rFrom, rTo, width, y, { curb = true, ruin = 0 } = {}) {
    const ROW = 0.82;
    const cols = Math.max(2, Math.round(width / 1.15));
    const yaw = F.yawIn;
    for (let r = rFrom - ROW / 2, row = 0; r > rTo + ROW / 2 - 0.01; r -= ROW, row++) {
      const end = Math.max(0, (rTo + ruin - r) / Math.max(ruin, 1e-3));
      const n = cols + (rand() < 0.4 ? 1 : 0) - (cols > 2 && rand() < 0.3 ? 1 : 0);
      const cuts = [0];
      for (let c = 1; c < n; c++) cuts.push((c + (rand() - 0.5) * 0.5) / n);
      cuts.push(1);
      for (let c = 0; c < n; c++) {
        if (end > 0 && rand() < end * 0.7) continue;
        const w0 = cuts[c] * width;
        const w1 = cuts[c + 1] * width;
        const v = -width / 2 + (w0 + w1) / 2;
        const [x, z] = F.at(r + (rand() - 0.5) * 0.04, v);
        kits.paving.add(new THREE.BoxGeometry(w1 - w0 - 0.05, 0.36, ROW - 0.05), {
          pos: [x, y - 0.17 + (rand() - 0.5) * 0.025, z], rot: [(rand() - 0.5) * 0.02, yaw + (rand() - 0.5) * 0.03, (rand() - 0.5) * 0.02],
          color: rand() < 0.5 ? '#ddd1bf' : '#cfc2ae', vary: 0.06,
        });
      }
      if (curb && (row % 6 !== 3 || rand() < 0.5)) {
        for (const sv of [-1, 1]) {
          const [x, z] = F.at(r, sv * (width / 2 + 0.18));
          kits.paving.add(new THREE.BoxGeometry(0.36, 0.42, ROW - 0.04), { pos: [x, y + 0.04, z], rot: [(rand() - 0.5) * 0.04, yaw + (rand() - 0.5) * 0.05, 0], color: '#c7b8a3', vary: 0.05 });
        }
      }
    }
    const len = rFrom - rTo;
    const [x, z] = F.at((rFrom + rTo) / 2);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    kits.stone.add(new RoundedBoxGeometry(width + 0.5, 0.9, len, 2, 0.12), { pos: [x, y - 0.8, z], quat: q, color: '#c4b6a2', vary: 0.03 });
    box({ position: [x, y - 0.5, z], size: [width, 1.0, len], quaternion: q });
    return q;
  }

  {
    paved(F_B, JETTY_B.from, JETTY_B.to, JETTY_B.width, jettyY, { ruin: 2.5 });
    const piers = [JETTY_B.to + 1.6, 88];
    for (const r of piers) {
      const [px, pz] = F_B.at(r);
      const top = jettyY - 1.2;
      const h = top - 4;
      kits.stone.add(new THREE.CylinderGeometry(1.1, 1.5, h, 8), { pos: [px, top - h / 2, pz], rot: [0, F_B.yawIn + Math.PI / 8, 0], scale: [1.9, 1, 1.1], color: '#c9bba7', vary: 0.05 });
    }
    const along = new THREE.Vector3(-F_B.c, 0, -F_B.s);
    const side = new THREE.Vector3().crossVectors(along, new THREE.Vector3(0, 1, 0));
    const basis = new THREE.Matrix4().makeBasis(along, new THREE.Vector3(0, 1, 0), side);
    const [ax, az] = F_B.at(88 - 1.2);
    const span = 88 - 1.2 - (JETTY_B.to + 1.6 + 1.2);
    kits.stone.add(spandrelGeometry(span, Math.min(8, span * 0.65), JETTY_B.width), { matrix: basis.clone().setPosition(ax, jettyY - 1.25, az), color: '#d3c6b3', vary: 0.03 });
    const [bx2, bz2] = F_B.at(99.5);
    kits.stone.add(spandrelGeometry(99.5 - 89.2, 6, JETTY_B.width), { matrix: basis.clone().setPosition(bx2, jettyY - 1.25, bz2), color: '#d3c6b3', vary: 0.03 });
  }

  function landing(F, rOut) {
    paved(F, rOut, 22, 5.2, PILLAR_Y + 0.05, { curb: true });
    const [bx, bz] = F.at(rOut - 2.2);
    kits.stone.add(new THREE.CylinderGeometry(0.3, 2.4, 9, 8), { pos: [bx, PILLAR_Y - 6, bz], rot: [0, F.yawIn, 0], scale: [1.4, 1, 0.8], color: '#bfb19d' });
  }
  landing(F_B, landingB);
  landing(F_C, landingC);

  const BEACON_POS = [CENTER[0], PILLAR_Y + 0.36, CENTER[1]];
  {
    const dais = new THREE.LatheGeometry([[0.001, 0], [3.1, 0], [3.1, 0.16], [2.5, 0.2], [2.5, 0.36], [0.001, 0.36]].map(([a, b]) => new THREE.Vector2(a, b)), 40);
    kits.stone.add(dais, { pos: [CENTER[0], PILLAR_Y - 0.02, CENTER[1]], color: '#e4d9c8' });
    colliders.push(physics.addStaticCylinder({ position: [CENTER[0], PILLAR_Y + 0.08, CENTER[1]], radius: 3.1, height: 0.16, userData: { surface: 'stone' } }));
    colliders.push(physics.addStaticCylinder({ position: [CENTER[0], PILLAR_Y + 0.18, CENTER[1]], radius: 2.5, height: 0.36, userData: { surface: 'stone' } }));
  }
  beacons.create(ID, { position: BEACON_POS, rotationY: ROUTE_A.yawIn + Math.PI });

  const teacherStone = realStepsB[4];
  traces.add({ id: 'hallu_teacher', position: [teacherStone[0], teacherStone[1], teacherStone[2]] });
  traces.add({ id: 'hallu_edit', position: [ex, editY, ez] });
  {
    const [mx, mz] = [CENTER[0] + 2.4, CENTER[1] + 2.6];
    traces.add({ id: 'hallu_map', position: [mx, PILLAR_Y, mz] });
    kits.stone.add(new THREE.BoxGeometry(1.2, 0.18, 0.8), { pos: [mx + 0.35, PILLAR_Y + 0.22, mz + 0.2], rot: [0.35, 0.8, 0.12], color: '#b9ab98' });
  }

  const hand = buildHand();
  const [hx, hz] = ROUTE_A.at(HAND.r, HAND.v);
  const [sx0, sz0] = ROUTE_A.at(141);
  const toSpawn = new THREE.Vector2(sx0 - hx, sz0 - hz).normalize();
  const toHub = new THREE.Vector2(-hx, -hz).normalize();
  const facing = toSpawn.multiplyScalar(0.55).add(toHub.multiplyScalar(0.45)).normalize();
  const handGroup = new THREE.Group();
  handGroup.name = 'hallu:hand';
  handGroup.position.set(hx, groundY(hx, hz) - 0.8, hz);
  handGroup.rotation.set(-0.1, Math.atan2(facing.x, facing.y), 0.07, 'YXZ');
  handGroup.scale.setScalar(HAND.scale);
  const handMesh = new THREE.Mesh(hand.body, mats.pearl);
  handMesh.castShadow = true;
  handMesh.receiveShadow = true;
  const palmLines = new THREE.Mesh(hand.glow, mats.glowViolet);
  handGroup.add(handMesh, palmLines);
  far.add(handGroup);
  colliders.push(physics.addStaticCylinder({ position: [hx, groundY(hx, hz) + 4, hz], radius: 3.2 * HAND.scale, height: 10 }));

  const museum = await buildMuseum(ctx, { kits, mats, near, rand, groundY, box, cylinder });
  near.add(...museum.extraMeshes);
  await buildRotunda(ctx, { kits, near, rand, box, cylinder });
  const mist = buildMist(ctx, { mats, near, far, rand, groundY });

  for (const [name, kit] of Object.entries(kits)) {
    if (kit.empty) continue;
    const mesh = new THREE.Mesh(kit.build(), mats[name]);
    mesh.name = `hallu:${name}`;
    mesh.castShadow = !name.startsWith('glow') && name !== 'paving';
    mesh.receiveShadow = !name.startsWith('glow');
    near.add(mesh);
  }

  const atmosphere = ctx.env.addAtmosphere({
    id: ID, center: CENTER, radius: 150, falloff: 90, fogColor: '#9d86c9', fogDensity: 1.35,
    tint: [1.02, 0.96, 1.06], saturation: 1.08,
  });

  const spoken = new Set();
  const lastSaid = new Map();
  function sayOnce(key, opts = {}) {
    if (spoken.has(key)) return false;
    spoken.add(key);
    lastSaid.set(key, ctx.time.now);
    companion.say(key, { priority: 1, ...opts });
    return true;
  }
  function sayRated(key) {
    const t = lastSaid.get(key);
    if (t !== undefined && ctx.time.now - t < RATE) return;
    lastSaid.set(key, ctx.time.now);
    companion.say(key, { priority: 1 });
  }

  function verifyBridge(animate) {
    if (bridgeColliders.length) return;
    if (bridgeFake) {
      bridgeFake.remove();
      bridgeFake = null;
    }
    for (const c of bridge.fakeColliders) bridgeColliders.push(physics.addStaticBox({ ...c, userData: { surface: 'stone' } }));
    verifiedStrip.visible = true;
    if (animate) {
      ctx.audio.sfx('hallu.reveal', { position: bridge.centerOfFake, volume: 1 });
      ctx.postfx.flash('#7af5c8', 0.5);
      for (let r = BRIDGE_A.realTo; r > BRIDGE_A.to; r -= 6) {
        const [x, z] = ROUTE_A.at(r);
        ctx.particles.burst({ position: new THREE.Vector3(x, bridge.deckY(r) + 0.4, z), count: 14, color: '#7af5c8', color2: '#c77dff', shape: 'glyph', speed: [0.5, 2], life: [1, 2.2], size: [0.08, 0.16], gravity: 0.6 });
      }
    }
  }

  function reachPillar() {
    if (flag('cross')) return false;
    setFlag('cross');
    beacons.setReady(ID);
    sayOnce('zone.hallu.solved', { priority: 2 });
    verifyBridge(true);
    return true;
  }

  function noteScan() {
    if (flag('scan')) return false;
    setFlag('scan');
    return true;
  }

  function syncFromState() {
    if (flag('cross') || state.beacons[ID] !== 'locked') {
      verifyBridge(false);
      if (state.beacons[ID] === 'locked') beacons.setReady(ID);
    } else if (!bridgeFake) bridgeFake = scanner.hallucination(fakeBridge, { duration: 9 });
    if (state.beacons[ID] === 'active' && !flag('beacon')) setFlag('beacon');
  }
  syncFromState();
  events.on('game:start', () => syncFromState());

  const pillarSensor = physics.addSensor({
    shape: 'cylinder', position: [CENTER[0], PILLAR_Y + 2.5, CENTER[1]], radius: 27, height: 5, filter: 'player',
    onEnter: () => reachPillar(),
  });
  const [sx, sz] = ROUTE_A.at(97);
  const sureSensor = physics.addSensor({
    shape: 'box', position: [sx, bridge.deckY(97) + 1, sz], size: [BRIDGE_A.width, 2, 8], filter: 'player',
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ROUTE_A.yawIn),
    onEnter: () => {
      if (!bridgeColliders.length) sayOnce('zone.hallu.sure');
    },
  });

  events.on('scan:start', ({ origin } = {}) => {
    if (!origin) return;
    if (Math.hypot(origin.x - CENTER[0], origin.z - CENTER[1]) < VISIT) noteScan();
  });
  events.on('scan:hit', ({ kind } = {}) => {
    if ((kind === 'hallucination' || kind === 'hidden') && inVisit) sayOnce('zone.hallu.scan');
  });
  events.on('beacon:activated', ({ zone } = {}) => {
    if (zone === ID) setFlag('beacon');
  });

  const [spx, spz] = ROUTE_A.at(141);
  const spawn = [spx, groundY(spx, spz), spz, ROUTE_A.yawIn];

  const P = ctx.player;
  const cam = ctx.camera;
  let inVisit = false;
  let falling = false;
  let respawnPending = false;
  let warpSent = -1;
  let glitchSent = -1;
  let windLoop = null;
  let active = false;

  async function fallBack() {
    respawnPending = true;
    try {
      const ok = await P.respawn('hallu');
      if (ok) {
        const pp = P.position;
        const r = Math.hypot(pp.x - CENTER[0], pp.z - CENTER[1]);
        if (!bridgeColliders.length && r < BRIDGE_A.realTo + 2.5 && r > BRIDGE_A.realTo - 1 && Math.abs(pp.y - bridge.deckY(r)) < 1) {
          const [bx, bz] = ROUTE_A.at(BRIDGE_A.realTo + 3.5);
          P.teleport(bx, bridge.deckY(BRIDGE_A.realTo + 3.5), bz, P.yaw);
        }
        const ra = Math.hypot(pp.x - CENTER[0], pp.z - CENTER[1]);
        const [rx, rz] = F_C.at(ra);
        if (ra > ROPE_C.to - 0.5 && ra < ROPE_C.from + 0.5 && Math.hypot(pp.x - rx, pp.z - rz) < 1.4) {
          const toRock = ra - ROPE_C.to < ROPE_C.from - ra;
          const [tx, tz] = F_C.at(toRock ? ROCK_C.r : ROPE_C.from + 3);
          P.teleport(tx, toRock ? rockY : groundY(tx, tz), tz, F_C.yawIn);
        }
        sayRated('zone.hallu.fall');
      }
    } finally {
      respawnPending = false;
      falling = false;
    }
  }

  function applyMood(d) {
    const k = 1 - smooth(70, 230, d);
    const warp = Math.round(0.25 * k * 200) / 200;
    const glitch = Math.round(0.05 * k * 200) / 200;
    if (warp !== warpSent) {
      warpSent = warp;
      ctx.postfx.setWarp(warp);
    }
    if (glitch !== glitchSent) {
      glitchSent = glitch;
      ctx.postfx.setGlitchBase(glitch);
    }
  }

  return {
    id: ID,
    spawn,
    stones,
    rope,
    bridge: { verify: verifyBridge, get real() { return bridgeColliders.length > 0; } },
    layout: {
      realStepsB, landingB, landingC, jettyY, rockY, ropeY, hiddenY, editStone: [ex, editY, ez], stepsB: STEPS_B.length,
      jettyStart: [...F_B.at(JETTY_B.from - 1)].flatMap((v, i) => (i === 0 ? [v, jettyY] : [v])),
      jettyEnd: [...F_B.at(JETTY_B.to + 0.9)].flatMap((v, i) => (i === 0 ? [v, jettyY] : [v])),
      landingBPoint: [...F_B.at(landingB - 1.8)].flatMap((v, i) => (i === 0 ? [v, PILLAR_Y + 0.05] : [v])),
      landingCPoint: [...F_C.at(landingC - 1.8)].flatMap((v, i) => (i === 0 ? [v, PILLAR_Y + 0.05] : [v])),
      rockPoint: [...F_C.at(ROCK_C.r)].flatMap((v, i) => (i === 0 ? [v, rockY] : [v])),
      ropeStart: [...F_C.at(ROPE_C.from + 3)].flatMap((v, i) => (i === 0 ? [v, ropeY] : [v])),
    },
    reachPillar,
    bridgeDeckY: (r) => bridge.deckY(r),

    debugSolve() {
      noteScan();
      stones.revealAll();
      reachPillar();
      return state.beacons[ID];
    },

    fixedUpdate(dt) {
      if (!active) return;
      const pp = P.position;
      const nearRope = Math.hypot(pp.x - ropeMid.x, pp.z - ropeMid.z) < 45;
      rope.fixedUpdate(dt, nearRope && P.grounded ? pp : null, nearRope);
    },

    update(dt) {
      const pp = P.position;
      const d = Math.hypot(pp.x - CENTER[0], pp.z - CENTER[1]);
      active = d < ACTIVE;
      if (!active) {
        if (inVisit) {
          inVisit = false;
          spoken.clear();
        }
        return;
      }
      if (d < VISIT) inVisit = true;
      else if (d > VISIT + 20 && inVisit) {
        inVisit = false;
        spoken.clear();
      }
      stones.update(dt);
      if (state.mode !== 'playing' || P.riding) return;
      if (d > CHASM_IN && d < CHASM_OUT) {
        if (!falling && !P.grounded && pp.y < PILLAR_Y - 9 && P.velocity.y < -6) {
          falling = true;
          ctx.audio.sfx('hallu.fall', { position: pp });
        }
        if (pp.y < FALL_Y && !respawnPending && !P.respawning) fallBack();
      } else if (P.grounded) falling = false;
    },

    frame() {
      const dc = Math.hypot(cam.position.x - CENTER[0], cam.position.z - CENTER[1]);
      near.visible = dc < NEAR;
      if (near.visible) {
        rope.frame();
        museum.update(Math.min(0.1, ctx.time.realDt));
      }
      if (dc < 900) mist.update(Math.min(0.1, ctx.time.realDt));
      mist.setActive(dc < 300);
      const pd = Math.hypot(P.position.x - CENTER[0], P.position.z - CENTER[1]);
      applyMood(pd);
      if (pd < 260 && !windLoop) windLoop = ctx.audio.loop('wind', { position: new THREE.Vector3(CENTER[0], 30, CENTER[1]), volume: 0.7, refDistance: 50, maxDistance: 260, fade: 2 });
      else if (pd > 280 && windLoop) {
        windLoop.stop(2);
        windLoop = null;
      }
    },

    dispose() {
      pillarSensor.remove();
      for (const c of colliders) c.remove();
      sureSensor.remove();
      atmosphere?.remove?.();
      ctx.postfx.setWarp(0);
      ctx.postfx.setGlitchBase(0);
    },
  };
}
