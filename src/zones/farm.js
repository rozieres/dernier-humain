import * as THREE from 'three';
import { buildIndustry, fanRotorGeometry } from './farm/industry.js';
import { createHarvesters, HALF } from './farm/harvesters.js';
import { buildGarden, balePile, sproutGeometry } from './farm/garden.js';
import { createMaterials, ledBoards, hologram, airColumns, reviewAtlas, signAtlas, labelAtlas } from './farm/fx.js';
import { Parts, lathe, mesh } from './farm/kit.js';
import {
  CENTER, RADIUS, SPAWN, CLEARINGS, FAN, MAST, BEACON, SCARECROW, DECK, GARDEN,
} from './farm/layout.js';

const ID = 'farm';
const ACTIVE_RANGE = RADIUS + 150;
const DETAIL_RANGE = 430;
const GARDEN_RANGE = 230;
const HARVESTER_RANGE = 200;
const LIFT_MARGIN = 6.5;
const RESPAWN_AFTER = 20;
const HIT_LINE_GAP = 25;

function seedGeometry() {
  const g = lathe([[0, -0.17], [0.06, -0.155], [0.105, -0.11], [0.135, -0.04], [0.14, 0.02], [0.125, 0.08], [0.09, 0.13], [0.045, 0.17], [0.012, 0.2], [0, 0.205]], 28);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.07 * Math.sin(a * 7) + 0.03 * Math.sin(p.getY(i) * 40 + a * 2);
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  g.rotateZ(0.35);
  return g;
}

function labelQuads(pots, yaw) {
  const P = new Parts(801);
  pots.forEach((pot, i) => {
    const g = new THREE.PlaneGeometry(0.26, 0.26);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (i + uv.getX(k)) / 3, uv.getY(k));
    g.rotateX(-0.25);
    g.rotateY(yaw + (i - 1) * 0.12);
    P.add(g, { pos: pot.label.toArray(), color: '#ffffff', vary: 0 });
  });
  return P.build();
}

export default async function create(ctx) {
  const { scene, world, physics, state, events, camera } = ctx;
  const T = ctx.texts;
  const FARM = T.FARM;
  for (const c of CLEARINGS) world.addClearing({ x: c.x, z: c.z, r: c.r, trees: true, grass: true, rocks: true });

  const mats = createMaterials(ctx);
  const ind = buildIndustry(ctx);
  const tall = ind.tall;

  const landmark = new THREE.Group();
  landmark.name = 'farm:landmark';
  const detail = new THREE.Group();
  detail.name = 'farm:detail';
  scene.add(landmark, detail);
  landmark.add(mesh(ind.geometry.landmark, mats.synth, { name: 'farm:silos' }));
  landmark.add(mesh(ind.geometry.landmarkGlow, mats.glow, { shadow: false, receive: false }));
  const holo = hologram(ctx, { radius: MAST.holoR, height: MAST.holoH, slogan: '  FERME À CONTENUS  ·  RÉCOLTE TOUTES LES 0,3 SECONDE  ·  48 213 907 ARTICLES AUJOURD\'HUI  ·' });
  holo.position.set(tall.x, tall.holoY, tall.z);
  landmark.add(holo);

  detail.add(mesh(ind.geometry.detail, mats.synth, { shadow: false, name: 'farm:industry' }));
  detail.add(mesh(ind.geometry.glow, mats.glow, { shadow: false, receive: false }));
  detail.add(mesh(ind.geometry.ground, mats.ground, { shadow: false }));
  const headlines = [];
  const hr = ctx.rng.seeded('farm:headlines');
  while (headlines.length < 16) {
    const h = T.slopHeadline(hr);
    if (!headlines.includes(h)) headlines.push(h);
  }
  detail.add(ledBoards(ctx, ind.boards, headlines));

  const rr = ctx.rng.seeded('farm:reviews');
  const reviews = Array.from({ length: 20 }, () => T.slopReview(rr));
  const gerardDoc = T.TRACES.farm_review;
  const reviewMap = reviewAtlas(ctx, reviews, { title: gerardDoc.title, text: gerardDoc.body[0], author: gerardDoc.author });
  detail.add(mesh(ind.geometry.review, ctx.mat.basic({ map: reviewMap, color: new THREE.Color(1.08, 1.08, 1.08) }), { shadow: false }));
  const copy = T.SYNTH_DOCS.farm_copy;
  const signMap = signAtlas(ctx, [FARM.signs[0], FARM.signs[1], FARM.signs[3], FARM.signs[7]], {
    author: 'Le Potager Parfait', handle: '@jocelyne.redaction', meta: 'il y a 0,3 s', title: copy.title,
    body: [copy.title, copy.body[0], copy.body[1]], footer: 'Lire la suite →', accent: '#ff5fa2',
  });
  detail.add(mesh(ind.geometry.signs, ctx.mat.basic({ map: signMap, color: new THREE.Color(1.12, 1.12, 1.12), side: THREE.DoubleSide }), { shadow: false }));

  const fanTops = ind.fans;
  const columns = airColumns(ctx, fanTops, { radius: FAN.column, height: FAN.height });
  detail.add(columns);
  const rotors = new THREE.InstancedMesh(fanRotorGeometry(), mats.synth, fanTops.length);
  rotors.name = 'farm:rotors';
  detail.add(rotors);

  const harvesters = createHarvesters(ctx, mats);
  detail.add(harvesters.group);

  const gParts = { rustic: new Parts(901), wood: new Parts(902), stone: new Parts(903), foliage: new Parts(904), glass: new Parts(905), glow: new Parts(906) };
  const scParts = new Parts(907);
  const garden = buildGarden(ctx, gParts, scParts);
  const gardenGroup = new THREE.Group();
  gardenGroup.name = 'farm:garden';
  detail.add(gardenGroup);
  detail.add(mesh(scParts.build(), mats.rustic, { name: 'farm:scarecrow' }));
  gardenGroup.add(mesh(gParts.rustic.build(), mats.rustic, { name: 'farm:rustic' }));
  gardenGroup.add(mesh(gParts.wood.build(), mats.wood, { name: 'farm:wood' }));
  gardenGroup.add(mesh(gParts.stone.build(), mats.stone, { shadow: false, name: 'farm:stone' }));
  gardenGroup.add(mesh(gParts.foliage.build(), mats.foliage, { shadow: false, name: 'farm:foliage' }));
  const glassMesh = mesh(gParts.glass.build(), mats.glass, { shadow: false, name: 'farm:glass' });
  glassMesh.renderOrder = 2;
  gardenGroup.add(glassMesh);
  gardenGroup.add(mesh(gParts.glow.build(), ctx.mat.glow('#ffffff', 5, { vertexColors: true }), { shadow: false, receive: false }));

  const gh = garden.greenhouse;
  const labels = mesh(labelQuads(gh.pots, 0), ctx.mat.standard({ map: labelAtlas(ctx, FARM.pots), roughness: 0.85 }), { shadow: false });
  gardenGroup.add(labels);
  const strawSign = ctx.text.panel({ style: 'human', title: 'MONSIEUR PAILLE', body: ['il garde les fraises'], size: [0.6, 0.44], emissive: 0, seed: 7, bg: '#c9a878' });
  strawSign.position.copy(garden.scarecrow.sign);
  strawSign.rotation.set(0, SCARECROW.yaw, 0.05);
  detail.add(strawSign);

  const sprouts = new THREE.InstancedMesh(sproutGeometry(), mats.foliage, 3);
  sprouts.name = 'farm:sprouts';
  gardenGroup.add(sprouts);

  if (ctx.has('env')) {
    ctx.env.addAtmosphere({ id: ID, center: CENTER, radius: RADIUS - 20, falloff: 90, tint: [0.97, 1.0, 1.04], saturation: 1.03 });
    ctx.env.lights.add({ position: [585, fanTops[1].y + 7, -112], color: '#9fefff', intensity: 3, distance: 34 });
    ctx.env.lights.add({ position: [640, ind.plant.yb + 5, -157], color: '#c8f6ff', intensity: 2.4, distance: 26 });
    ctx.env.lights.add({ position: [ind.review.base.x, ind.review.base.y + 4, ind.review.base.z], color: '#e6f4ff', intensity: 1.6, distance: 16 });
    ctx.env.lights.add({ position: [tall.x, tall.deckY + 2.5, tall.z], color: '#9fefff', intensity: 1.6, distance: 14 });
    ctx.env.lights.add({ position: gh.lamp, color: '#ffb454', intensity: 2.6, distance: 13, flicker: 0.18 });
  }

  const pile = balePile(ctx);
  const bales = pile.spots.map((s) => {
    const e = ctx.props.bale(s.p, { rotationY: s.yaw ?? 0 });
    if (s.stand && e?.setPosition) e.setPosition(s.p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    return e;
  });

  const signRoot = [];
  const sign = (p, yaw, lines) => signRoot.push(ctx.props.sign(p, yaw, { text: lines }));
  sign([491, null, -61], -Math.PI / 2 - 0.2, ['Attention', 'Moissonneuses en service.', 'Ne dépassez pas.']);
  const gardenSigns = signRoot.length;
  sign([753.4, null, 38.2], -0.3, ['Zone de compostage', 'Republication en cours']);
  sign([719.6, null, 49.6], -Math.PI / 2 - 0.12, ['Interdit de semer à la main', 'Rendement insuffisant.']);
  sign([738.2, null, 41.6], -Math.PI / 2 + 0.25, ['Serre désaffectée', 'Rendement : 0']);

  const beaconY = world.heightAt(BEACON.x, BEACON.z);
  ctx.beacons.create(ID, { position: [BEACON.x, beaconY, BEACON.z], rotationY: BEACON.yaw });

  ctx.traces.add({ id: 'farm_review', position: ind.review.base.toArray() });
  ctx.traces.add({ id: 'farm_recipe', position: gh.empty.toArray() });
  const scTrace = garden.scarecrow.local(-0.55, 0, 0.75);
  scTrace.y = world.heightAt(scTrace.x, scTrace.z);
  ctx.traces.add({ id: 'farm_scarecrow', position: scTrace.toArray() });

  ctx.interact.add({
    id: 'farm:kiosk', position: ind.kiosk.screen, radius: 3.2, label: 'Lire',
    onInteract: () => ctx.ui.reader.open(copy),
  });
  ctx.scanner.register({ position: ind.kiosk.screen, kind: 'synthetic' });
  ctx.scanner.register({ position: new THREE.Vector3(gh.door.x + 2.2, gh.floor + 1.6, gh.door.z), kind: 'human', label: 'La serre de Jocelyne' });
  for (const h of harvesters.list) ctx.scanner.register({ object: h.proxy, kind: 'synthetic' });

  const lines = T.BOT_LINES.farm;
  ctx.bots.spawn({ center: [662, -139], radius: 7, count: 11, behavior: 'queue', lines });
  ctx.bots.spawn({ center: [591, -171], radius: 8, count: 12, behavior: 'mill', lines });
  ctx.bots.spawn({ center: [482, -44], radius: 4.5, count: 8, behavior: 'stare', lines });

  const seedGeo = seedGeometry();
  const seedMat = ctx.mat.standard({ color: '#c98a3a', emissive: new THREE.Color('#ff9a3c'), emissiveIntensity: 2.4, roughness: 0.42, metalness: 0 });
  const sc = garden.scarecrow;
  const fieldOrigin = sc.local(0.5, 0, 0.6);
  fieldOrigin.y = world.heightAt(fieldOrigin.x, fieldOrigin.z) + 0.2;
  const origins = {
    silo: new THREE.Vector3(tall.x + 2.1, tall.deckY + 0.2, tall.z - 2.9),
    field: fieldOrigin,
    bales: pile.seed,
  };
  const pots = gh.pots.map((p) => ({ ...p, seed: null, grow: 0, sensor: null }));
  const seeds = FARM.seeds.map((def) => ({
    id: def.id, name: def.name, origin: origins[def.id].clone(), mesh: null, entity: null,
    picked: Boolean(state.flag(`zone.farm.seed.${def.id}`)), planted: false, pot: -1, bad: 0, scan: null, signal: null, light: null, pulse: Math.random() * 6,
  }));
  const seedById = new Map(seeds.map((s) => [s.id, s]));

  function spawnSeed(seed) {
    seed.mesh = new THREE.Mesh(seedGeo, seedMat);
    seed.mesh.castShadow = true;
    seed.mesh.name = `farm:seed:${seed.id}`;
    seed.mesh.position.copy(seed.origin);
    seed.mesh.userData.kind = 'seed';
    detail.add(seed.mesh);
    seed.entity = physics.addDynamic(seed.mesh, {
      shape: 'box', size: [0.28, 0.4, 0.28], mass: 0.5, friction: 1, restitution: 0.1, linearDamping: 0.4, angularDamping: 2.5,
      ccd: true, grabbable: true, buoyant: true, userData: { kind: 'seed', seed: seed.id },
    });
    seed.scan = ctx.scanner.register({ object: seed.mesh, kind: 'human', label: seed.name });
    seed.signal = ctx.scanner.addSignal({ position: seed.mesh.position, active: () => !seed.planted && seed.mesh.visible, strength: 0.85 });
    if (ctx.has('env')) seed.light = ctx.env.lights.add({ position: seed.mesh.position, color: '#ffb454', intensity: 0.9, distance: 5 });
  }
  seeds.forEach(spawnSeed);

  function markPicked(seed) {
    if (seed.picked) return;
    seed.picked = true;
    state.setFlag(`zone.farm.seed.${seed.id}`, true);
    ctx.audio.sfx('seed.pick', { position: seed.mesh.position });
    ctx.companion.say('zone.farm.seed', { priority: 1 });
    if (seeds.every((s) => s.picked)) state.setFlag('zone.farm.seeds', true);
  }

  function solved() {
    state.setFlag('zone.farm.plant', true);
    if (!seeds.every((s) => s.picked)) {
      for (const s of seeds) {
        s.picked = true;
        state.setFlag(`zone.farm.seed.${s.id}`, true);
      }
      state.setFlag('zone.farm.seeds', true);
    }
    if (state.beacons[ID] === 'locked') ctx.beacons.setReady(ID);
  }

  function plant(seed, pot, { instant = false } = {}) {
    if (seed.planted || pot.seed) return false;
    if (seed.entity && ctx.cursor.held === seed.entity) ctx.cursor.release();
    seed.planted = true;
    seed.pot = pot.index;
    pot.seed = seed;
    seed.entity?.remove();
    seed.entity = null;
    seed.scan?.remove();
    seed.scan = null;
    seed.mesh.position.copy(pot.soil);
    seed.mesh.position.y += 0.02;
    seed.mesh.quaternion.setFromEuler(new THREE.Euler(0.2, pot.index * 1.3, 1.25));
    seed.mesh.scale.setScalar(0.5);
    if (seed.light) seed.light.intensity = 0.45;
    pot.grow = instant ? 1 : 0;
    state.setFlag(`zone.farm.pot.${seed.id}`, pot.index);
    const done = seeds.every((s) => s.planted);
    if (!instant) {
      ctx.audio.sfx('seed.plant', { position: pot.soil });
      ctx.particles.burst({ position: pot.soil, count: 26, color: '#ffb454', color2: '#fff1d6', shape: 'ember', speed: [0.4, 1.6], direction: [0, 1, 0], spread: 0.6, life: [0.6, 1.4], size: [0.02, 0.05], gravity: 0.5, drag: 0.8 });
      ctx.particles.burst({ position: pot.soil, count: 10, color: '#4a3526', shape: 'leaf', speed: [0.4, 1.2], direction: [0, 1, 0], spread: 0.8, life: [0.5, 1], size: [0.03, 0.06], gravity: -6 });
      if (!done) ctx.companion.say('zone.farm.planted', { priority: 1 });
    }
    if (done) {
      solved();
      if (!instant) ctx.companion.say('zone.farm.solved', { priority: 2, interrupt: true });
    }
    return true;
  }

  function respawnSeed(seed) {
    if (!seed.entity) return;
    if (ctx.cursor.held === seed.entity) ctx.cursor.release();
    seed.entity.setPosition(seed.origin, new THREE.Quaternion());
    seed.entity.setVelocity([0, 0, 0]);
    seed.entity.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    seed.bad = 0;
    ctx.particles.burst({ position: seed.origin, count: 24, color: '#ffb454', shape: 'glyph', speed: [0.5, 1.8], spread: 1, life: [0.8, 1.6], size: [0.05, 0.1], gravity: 0.4 });
  }

  pots.forEach((pot) => {
    pot.sensor = physics.addSensor({ shape: 'sphere', position: pot.soil.clone().add(new THREE.Vector3(0, 0.16, 0)), radius: 0.4, filter: 'dynamic' });
  });

  const restore = () => {
    for (const seed of seeds) {
      const idx = state.flag(`zone.farm.pot.${seed.id}`);
      if (Number.isInteger(idx) && pots[idx] && !pots[idx].seed) plant(seed, pots[idx], { instant: true });
    }
    if (state.beacons[ID] !== 'locked') {
      for (const seed of seeds) {
        if (!seed.planted) plant(seed, pots.find((p) => !p.seed), { instant: true });
      }
    }
    if (state.beacons[ID] === 'active') state.setFlag('zone.farm.beacon', true);
  };
  restore();

  events.on('grab:start', ({ entity }) => {
    const id = entity?.userData?.kind === 'seed' ? entity.userData.seed : null;
    const seed = id && seedById.get(id);
    if (seed) markPicked(seed);
  });
  events.on('beacon:activated', ({ zone }) => {
    if (zone === ID) state.setFlag('zone.farm.beacon', true);
  });

  const loops = { on: false, list: [] };
  function startLoops() {
    if (loops.on) return;
    loops.on = true;
    for (const h of harvesters.list) {
      h.sound = ctx.audio.loop('harvester', { position: h.proxy.position, volume: 0.8, refDistance: 7, maxDistance: 110, fade: 1.5 });
      loops.list.push(h.sound);
    }
    for (const f of fanTops) loops.list.push(ctx.audio.loop('fan', { position: new THREE.Vector3(f.x, f.y + 1, f.z), volume: 0.7, refDistance: 6, maxDistance: 70, fade: 1.5 }));
  }
  function stopLoops() {
    if (!loops.on) return;
    loops.on = false;
    for (const l of loops.list) l?.stop?.(1.5);
    loops.list.length = 0;
  }

  const emitters = [];
  for (const f of fanTops) {
    emitters.push(ctx.particles.emitter({ position: new THREE.Vector3(f.x, f.y + 0.3, f.z), radius: 2.6, rate: 16, shape: 'dot', color: '#c8f6ff', direction: [0, 1, 0], spread: 0.08, speed: [7, 11], life: [2.4, 3.4], size: [0.05, 0.11], gravity: 1.5, drag: 0.04, cullDistance: 190 }));
    emitters.push(ctx.particles.emitter({ position: new THREE.Vector3(f.x, f.y + 0.3, f.z), radius: 2.4, rate: 4, shape: 'leaf', color: '#e2c46a', color2: '#b8913a', direction: [0, 1, 0], spread: 0.18, speed: [6, 9], life: [3, 4.2], size: [0.07, 0.13], gravity: 1, drag: 0.05, cullDistance: 160 }));
  }
  for (const c of ind.chutes) {
    emitters.push(ctx.particles.emitter({ position: c, rate: 7, shape: 'paper', color: '#f4f6fb', color2: '#dfe6f2', direction: [0, -0.6, 1], spread: 0.35, speed: [1.2, 2.6], life: [1.1, 1.7], size: [0.12, 0.2], gravity: -6, drag: 0.4, cullDistance: 150 }));
  }
  for (const h of harvesters.list) {
    emitters.push(ctx.particles.emitter({ position: h.chute, direction: h.chuteDir, rate: 22, shape: 'leaf', color: '#e8cf7a', color2: '#b08a3a', spread: 0.4, speed: [2.5, 5], life: [1.2, 2.2], size: [0.05, 0.1], gravity: -2.5, drag: 0.6, cullDistance: 160 }));
  }

  const playerCenter = new THREE.Vector3();
  const local = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const topY = tall.deckY + LIFT_MARGIN;
  let lastHitLine = -Infinity;
  let active = true;
  let detailOn = true;
  let gardenOn = true;
  let respawnTimer = 0;

  function knockback(h) {
    const p = ctx.player.position;
    tmp.set(p.x - h.position.x, 0, p.z - h.position.z);
    fwd.set(0, 0, -1).applyQuaternion(h.quaternion);
    fwd.y = 0;
    if (tmp.lengthSq() < 1e-4) tmp.copy(fwd);
    tmp.normalize();
    if (local.z < -HALF.z + 0.4) tmp.addScaledVector(fwd, 0.8).normalize();
    ctx.player.addImpulse({ x: tmp.x * 9.5, y: 7.2, z: tmp.z * 9.5 });
    ctx.player.shake(0.55, 0.35);
    if (ctx.cursor.held) ctx.cursor.release();
    ctx.audio.sfx('harvester.hit', { position: h.position });
    ctx.postfx.flash('#ffffff', 0.12);
    events.emit('farm:hit', { index: h.index });
    h.hitCooldown = 1.2;
    const now = ctx.time.now;
    if (now - lastHitLine >= HIT_LINE_GAP) {
      lastHitLine = now;
      ctx.companion.say('zone.farm.hit', { priority: 1 });
    }
  }

  function harvesterContacts() {
    const p = ctx.player.position;
    playerCenter.set(p.x, p.y + 0.9, p.z);
    for (const h of harvesters.list) {
      harvesters.toLocal(h, playerCenter, local);
      if (h.hitCooldown <= 0 && Math.abs(local.x) < HALF.x + 0.45 && local.y > -HALF.y - 0.4 && local.y < HALF.y - 0.05 && local.z > -HALF.z - 1.1 && local.z < HALF.z + 0.65) knockback(h);
      for (const seed of seeds) {
        if (!seed.entity || ctx.cursor.held === seed.entity) continue;
        harvesters.toLocal(h, seed.entity.position, tmp);
        if (Math.abs(tmp.x) < HALF.x + 0.4 && tmp.y < HALF.y && tmp.z > -HALF.z - 1.2 && tmp.z < HALF.z + 0.4) {
          const side = tmp.x >= 0 ? 1 : -1;
          fwd.set(side, 0, 0).applyQuaternion(h.quaternion);
          seed.entity.setVelocity([fwd.x * 5.5, 3.2, fwd.z * 5.5]);
        }
      }
    }
  }

  function updraft(dt) {
    const p = ctx.player.position;
    const v = ctx.player.velocity;
    for (const f of fanTops) {
      const dx = p.x - f.x;
      const dz = p.z - f.z;
      const r2 = dx * dx + dz * dz;
      if (r2 > FAN.column * FAN.column || p.y < f.y - 0.7 || p.y > topY + 5) continue;
      if (ctx.player.grounded) {
        if (r2 < (FAN.r + 0.4) ** 2 && p.y > f.y - 0.25) ctx.player.addImpulse({ x: 0, y: 8, z: 0 });
        return;
      }
      if (ctx.player.gliding) return;
      const space = ctx.input.isDown('Space');
      let vt = THREE.MathUtils.clamp((topY - p.y) * 1.4, -2, 9.5);
      if (space && p.y > topY - 2.5) vt = -1.6;
      ctx.player.applyLift(24);
      ctx.player.addImpulse({ x: (-dx * 1.1 - v.x * 1.4) * dt, y: THREE.MathUtils.clamp(6 * (vt - v.y), -30, 30) * dt, z: (-dz * 1.1 - v.z * 1.4) * dt });
      return;
    }
  }

  function seedWatch(dt) {
    for (const seed of seeds) {
      if (!seed.entity) continue;
      if (ctx.cursor.held === seed.entity) {
        seed.bad = 0;
        continue;
      }
      const sp = seed.entity.position;
      const ground = world.heightAt(sp.x, sp.z);
      const out = Math.hypot(sp.x - CENTER[0], sp.z - CENTER[1]) > RADIUS + 25;
      const sunk = sp.y < ground - 1.2 || sp.y < world.SEA_LEVEL + 0.2 || !Number.isFinite(sp.y);
      const onDeck = Math.hypot(sp.x - tall.x, sp.z - tall.z) < DECK.r + 0.6 && sp.y > tall.deckY - 1;
      const high = sp.y - ground > 3.2 && !onDeck;
      seed.bad = out || sunk || high ? seed.bad + dt : 0;
      if (sp.y < -40 || !Number.isFinite(sp.x)) seed.bad = RESPAWN_AFTER;
      if (seed.bad >= RESPAWN_AFTER) respawnSeed(seed);
    }
  }

  function checkPots() {
    for (const pot of pots) {
      if (pot.seed) continue;
      for (const seed of seeds) {
        if (!seed.entity || ctx.cursor.held === seed.entity) continue;
        if (!pot.sensor.contains(seed.entity)) continue;
        const lv = seed.entity.body.linvel();
        if (lv.x * lv.x + lv.y * lv.y + lv.z * lv.z > 6.5) continue;
        plant(seed, pot);
        break;
      }
    }
  }

  const m4 = new THREE.Matrix4();
  const q4 = new THREE.Quaternion();
  const s4 = new THREE.Vector3();
  const p4 = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  let rotorAngle = 0;

  function writeSprouts(t) {
    pots.forEach((pot, i) => {
      const g = pot.seed ? pot.grow : 0;
      const e = g <= 0 ? 0.0001 : 1 - (1 - g) ** 3;
      const sway = pot.seed ? 0.06 * Math.sin(t * 1.3 + i) : 0;
      q4.setFromEuler(new THREE.Euler(sway, i * 2.1, sway * 0.6));
      s4.set(e, e * (0.85 + 0.3 * e), e);
      p4.copy(pot.soil);
      m4.compose(p4, q4, s4);
      sprouts.setMatrixAt(i, m4);
    });
    sprouts.instanceMatrix.needsUpdate = true;
  }

  const zone = {
    id: ID,
    spawn: [SPAWN[0], world.heightAt(SPAWN[0], SPAWN[1]), SPAWN[1], SPAWN[2]],
    seeds,
    pots,
    harvesters: harvesters.list,
    fans: fanTops,
    deck: { x: tall.x, y: tall.deckY, z: tall.z },
    liftTop: topY,
    plant: (id, potIndex) => plant(seedById.get(id), pots[potIndex]),
    respawnSeed: (id) => respawnSeed(seedById.get(id)),

    debugSolve() {
      for (const seed of seeds) {
        if (seed.planted) continue;
        markPicked(seed);
        const pot = pots.find((p) => !p.seed);
        plant(seed, pot);
      }
      solved();
      return state.beacons[ID];
    },

    fixedUpdate(dt) {
      if (!active) return;
      harvesters.fixedUpdate(dt);
      if (ctx.has('player') && state.mode === 'playing' && !ctx.player.respawning && !ctx.player.riding) {
        harvesterContacts();
        updraft(dt);
      }
      checkPots();
    },

    update(dt) {
      const p = ctx.has('player') ? ctx.player.position : camera.position;
      const d = Math.hypot(p.x - CENTER[0], p.z - CENTER[1]);
      active = d < ACTIVE_RANGE;
      if (d < RADIUS + 60) startLoops();
      else if (d > RADIUS + 100) stopLoops();
      if (!active) return;
      respawnTimer -= dt;
      if (respawnTimer <= 0) {
        seedWatch(0.5 - respawnTimer);
        respawnTimer = 0.5;
      }
      for (const pot of pots) if (pot.seed && pot.grow < 1) pot.grow = Math.min(1, pot.grow + dt / 4.5);
    },

    frame(dt) {
      const d = Math.hypot(camera.position.x - CENTER[0], camera.position.z - CENTER[1]);
      const near = d < DETAIL_RANGE;
      if (near !== detailOn) {
        detailOn = near;
        detail.visible = near;
        signRoot.forEach((r, i) => {
          if (r && i < gardenSigns) r.visible = near;
        });
        for (const e of emitters) e.enabled = near;
      }
      const gNear = near && Math.hypot(camera.position.x - GARDEN.x, camera.position.z - GARDEN.z) < GARDEN_RANGE;
      if (gNear !== gardenOn) {
        gardenOn = gNear;
        gardenGroup.visible = gNear;
        for (const b of bales) if (b?.mesh) b.mesh.visible = gNear;
        signRoot.forEach((r, i) => {
          if (r && i >= gardenSigns) r.visible = gNear;
        });
      }
      harvesters.group.visible = near && Math.hypot(camera.position.x - SCARECROW.x, camera.position.z - SCARECROW.z) < HARVESTER_RANGE;
      if (!near) return;
      rotorAngle += dt * 7.5;
      fanTops.forEach((f, i) => {
        q4.setFromAxisAngle(yAxis, rotorAngle + i * 0.7);
        p4.set(f.x, f.y - 0.2, f.z);
        s4.set(1, 1, 1);
        m4.compose(p4, q4, s4);
        rotors.setMatrixAt(i, m4);
      });
      rotors.instanceMatrix.needsUpdate = true;
      harvesters.frame(dt);
      writeSprouts(ctx.time.now);
      for (const seed of seeds) {
        if (seed.planted || !seed.mesh) continue;
        seed.pulse += dt;
        if (seed.light) seed.light.intensity = 0.75 + 0.25 * Math.sin(seed.pulse * 2.4);
      }
      for (const h of harvesters.list) h.sound?.setPosition?.(h.proxy.position);
    },
  };
  return zone;
}
