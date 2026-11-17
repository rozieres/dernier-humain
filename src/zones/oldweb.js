import * as THREE from 'three';
import { sharedUniforms } from '../core/glsl.js';
import { seeded } from '../core/rng.js';
import { Parts, PI, euler, createMaterials, pagesPatch, SIGN_VERTEX, SIGN_FRAGMENT, SCREEN_FRAGMENT } from './oldweb/kit.js';
import { pagesAtlas, signsAtlas, guestbookTexture, floppyLabel, cdSleeve } from './oldweb/textures.js';
import { buildCemetery } from './oldweb/steles.js';
import { buildSet, buildCrt, digitsUV } from './oldweb/set.js';
import { modemMesh, floppyMesh, cdMesh, gifMeshes, bookMeshes, tumbleweedGeometry } from './oldweb/pieces.js';
import { CENTER, RADIUS, SPAWN, SPAWN_YAW, CHAPEL } from './oldweb/layout.js';

const ID = 'oldweb';
const RELICS = ['modem', 'floppy', 'cdrom'];
const FAR = 420;
const ACTIVE = RADIUS + 150;
const RESPAWN_AFTER = 20;
const TUMBLEWEEDS = 5;
const FLAME_FRAMES = [[1, 1, 0], [0.9, 1.14, 0.07], [1.08, 0.92, -0.06], [0.95, 1.07, 0.03]];
const flag = (name) => `zone.${ID}.${name}`;

export default async function create(ctx) {
  const { scene, physics, world, state, mat, text, events, camera } = ctx;
  const texts = ctx.texts;
  const OLD = texts.OLDWEB || { pages: [], riddles: {}, artifacts: {}, guestbook: [] };
  const artifact = (id) => OLD.artifacts?.[id] || { name: id, description: '' };

  const mats = createMaterials(ctx);
  const pagesTex = pagesAtlas(ctx);
  const signsTex = signsAtlas(ctx);
  mats.pages = mat.standard({ map: pagesTex, vertexColors: true, roughness: 0.86 }, { onShader: pagesPatch });
  mats.signs = mat.shader({ vertexShader: SIGN_VERTEX, fragmentShader: SIGN_FRAGMENT, uniforms: { uMap: { value: signsTex }, uLit: { value: 1 } }, vertexColors: true });
  mats.screens = mat.shader({ vertexShader: SIGN_VERTEX, fragmentShader: SCREEN_FRAGMENT, uniforms: { uMap: { value: pagesTex } }, vertexColors: true });

  const near = new THREE.Group();
  near.name = 'oldweb:near';
  const far = new THREE.Group();
  far.name = 'oldweb:far';
  scene.add(near, far);

  const P = {
    stone: new Parts(1), pages: new Parts(2), screens: new Parts(3), plastic: new Parts(4), wood: new Parts(5),
    rust: new Parts(6), signs: new Parts(7), riddle: new Parts(8), far: new Parts(9), digits: new Parts(10), neon: new Parts(11),
  };
  const B = {
    world, physics, P, rand: seeded('oldweb-layout'), rng: seeded,
    box(M, center, size, rot) {
      const q = new THREE.Quaternion();
      const pos = new THREE.Vector3();
      M.decompose(pos, q, new THREE.Vector3());
      const c = new THREE.Vector3(...center).applyMatrix4(M);
      if (rot) q.multiply(euler(rot[0], rot[1], rot[2], 'XYZ'));
      return physics.addStaticBox({ position: c, size, quaternion: q, userData: { kind: 'oldweb' } });
    },
    cyl(M, center, radius, height) {
      return physics.addStaticCylinder({ position: new THREE.Vector3(...center).applyMatrix4(M), radius, height, userData: { kind: 'oldweb' } });
    },
    boxWorld(position, size, quaternion) {
      return physics.addStaticBox({ position: Array.isArray(position) ? position : position.clone(), size, quaternion, userData: { kind: 'oldweb' } });
    },
    crt(M, page, opts) {
      buildCrt(P, M, page, opts);
    },
  };

  const cemetery = buildCemetery(B);
  const set = buildSet(B);

  const digitsFrame = new THREE.Matrix4().copy(set.counterFrame);
  for (const [x, y] of set.digitSlots) P.digits.add(new THREE.PlaneGeometry(0.28, 0.42), { pos: [x, y, 0.33], vary: 0, glow: [0.6, 0, 0] });

  const meshes = {};
  const addMesh = (name, parts, material, { shadow = true, group = near } = {}) => {
    if (parts.empty) return null;
    const m = new THREE.Mesh(parts.build(), material);
    m.name = `oldweb:${name}`;
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
    meshes[name] = m;
    return m;
  };
  addMesh('stone', P.stone, mats.sandstone);
  addMesh('pages', P.pages, mats.pages, { shadow: false });
  addMesh('wood', P.wood, mats.wood);
  addMesh('rust', P.rust, mats.rust);
  addMesh('plastic', P.plastic, mats.plastic);
  addMesh('signs', P.signs, mats.signs, { shadow: false });
  addMesh('screens', P.screens, mats.screens, { shadow: false });
  const riddleMesh = addMesh('riddle', P.riddle, mats.signs, { shadow: false });
  const atMesh = addMesh('at', P.far, mats.rust, { group: far });
  addMesh('neon', P.neon, mat.glow('#ffb454', 4.5), { group: far, shadow: false });
  const digitsMesh = addMesh('digits', P.digits, mats.signs, { shadow: false });
  digitsFrame.decompose(digitsMesh.position, digitsMesh.quaternion, digitsMesh.scale);
  physics.addStaticMesh(atMesh, { userData: { kind: 'oldweb' } });

  world.addClearing({ x: CENTER[0], z: CENTER[1], r: 125, trees: true, grass: false, rocks: true });
  world.addClearing({ x: CHAPEL.x, z: CHAPEL.z, r: 20, trees: true, grass: true, rocks: true });
  world.addClearing({ x: set.positions.cave.x, z: set.positions.cave.z, r: 10, trees: true, grass: false, rocks: true });
  world.addClearing({ x: set.positions.capTop.x, z: set.positions.capTop.z, r: 14, trees: true, grass: false, rocks: true });
  world.addClearing({ x: SPAWN[0], z: SPAWN[1], r: 12, trees: true, grass: false, rocks: true });

  const atmo = ctx.has('env') ? ctx.env.addAtmosphere({ id: ID, center: CENTER, radius: 190, falloff: 120, fogColor: '#e8c49a', fogDensity: 1.4, tint: [1.03, 1.0, 0.95], saturation: 1.02 }) : null;
  const FOG_DAY = new THREE.Color('#e8c49a');
  const FOG_GOLD = new THREE.Color('#f0a868');
  const FOG_NIGHT = new THREE.Color('#2c2632');
  const lights = {};
  const addLight = (key, position, color, intensity, distance, flicker = 0) => {
    if (!position || !ctx.has('env')) return;
    lights[key] = ctx.env.lights.add({ position, color, intensity, distance, flicker });
  };
  addLight('banner', set.lights.banner, '#ffb46a', 1.1, 11, 0.05);
  addLight('counter', set.lights.counter, '#7cff6b', 0.5, 6);
  addLight('jukebox', set.lights.jukebox, '#a8d4ff', 0.7, 8, 0.1);
  addLight('alcove', set.lights.alcove, '#ff6a4a', 0.8, 7);
  addLight('cave', set.lights.cave, '#7cff6b', 0.9, 6, 0.2);
  addLight('antenna', set.lights.antenna, '#ff3020', 1.4, 20);
  addLight('barrier', set.lights.barrier, '#ffb020', 0.7, 7);
  if (cemetery.crts[2]) addLight('crt', new THREE.Vector3(cemetery.crts[2].x, world.heightAt(cemetery.crts[2].x, cemetery.crts[2].z) + 0.8, cemetery.crts[2].z), '#8fd3ff', 0.6, 8, 0.15);

  near.add(ctx.props.lantern(set.positions.lantern, { intensity: 1.4 }).group);

  const gifs = gifMeshes(mats);
  gifs.star.position.copy(set.positions.star);
  gifs.flame.position.copy(set.positions.flame);
  gifs.envelope.position.copy(set.positions.envelope);
  near.add(gifs.star, gifs.flame, gifs.envelope);
  gifs.star.rotation.y = gifs.flame.rotation.y = gifs.envelope.rotation.y = 0;
  const envelopeY = gifs.envelope.position.y;

  const book = bookMeshes(mats, ctx, guestbookTexture(ctx));
  for (const obj of [book.coverPivot, book.openGroup, book.chain]) {
    set.lectern.decompose(obj.position, obj.quaternion, obj.scale);
    near.add(obj);
  }
  const lecternQ = book.coverPivot.quaternion.clone();
  const coverHinge = new THREE.Vector3(-0.1, 0.069, 0).applyMatrix4(set.lectern);
  book.coverPivot.position.copy(coverHinge);
  const chainHome = { pos: book.chain.position.clone(), quat: book.chain.quaternion.clone() };
  const chainRest = {
    pos: new THREE.Vector3(0.35, 0, 0.55).applyMatrix4(set.lectern),
    quat: euler(-0.12, CHAPEL.yaw + 0.8, 0.05),
  };
  chainRest.pos.y = world.heightAt(chainRest.pos.x, chainRest.pos.z) - 0.03 - 0.02;
  const tmpQ = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1);

  const counter = { value: 214, shake: 0 };
  digitsUV(digitsMesh.geometry.attributes.uv, 6, counter.value);
  const digitsHome = digitsMesh.position.clone();

  const ringGeo = new THREE.TorusGeometry(0.34, 0.025, 8, 40);
  ringGeo.rotateX(PI / 2);
  const rings = new THREE.InstancedMesh(ringGeo, mat.glow('#ffb454', 4.5), 3);
  rings.name = 'oldweb:rings';
  near.add(rings);
  const pedestals = set.pedestals.map((p, i) => {
    const ped = ctx.props.pedestal([p.position.x, p.position.y, p.position.z], { rotationY: p.yaw });
    near.add(ped.group);
    const top = ped.top.clone();
    const sensor = physics.addSensor({ shape: 'cylinder', position: [top.x, top.y + 0.32, top.z], radius: 0.55, height: 0.72, filter: 'dynamic' });
    rings.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(top.x, top.y - 0.01, top.z), new THREE.Quaternion(), new THREE.Vector3(0.001, 0.001, 0.001)));
    return { id: p.id, index: i, top, yaw: p.yaw, sensor, occupied: null, glow: 0 };
  });
  rings.instanceMatrix.needsUpdate = true;
  const pedestalFor = (id) => pedestals.find((p) => p.id === id);
  addLight('pedestals', pedestals[1].top.clone().add(new THREE.Vector3(0, 0.6, 0)), '#ffb454', 0, 8);

  const labelTex = {};
  const labelMat = {};
  for (const id of RELICS) {
    labelTex[id] = text.texture({ style: 'label', title: artifact(id).name, width: 512, height: 96, accent: '#2b2118', fg: '#ffd9a0' });
    labelMat[id] = mat.basic({ map: labelTex[id], transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: false });
  }
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.178), labelMat.modem);
  label.renderOrder = 20;
  label.visible = false;
  near.add(label);

  const relicBuild = {
    modem: () => modemMesh(mats),
    floppy: () => floppyMesh(mats, ctx, floppyLabel(ctx)),
    cdrom: () => cdMesh(mats, ctx, cdSleeve(ctx)),
  };
  const origins = { modem: set.modemOrigin, floppy: set.floppyOrigin, cdrom: set.cdOrigin };
  const relics = RELICS.map((id) => {
    const { mesh, size } = relicBuild[id]();
    mesh.name = `oldweb:relic:${id}`;
    const origin = origins[id];
    mesh.position.copy(origin.position).y += size[1] / 2;
    mesh.quaternion.copy(origin.quaternion);
    near.add(mesh);
    const entity = physics.addDynamic(mesh, {
      shape: 'box', size, density: 160, friction: 0.8, restitution: 0.15, angularDamping: 0.6, ccd: true, grabbable: true,
      userData: { kind: 'relic', relic: id },
    });
    const relic = {
      id, entity, mesh, size, origin: { position: mesh.position.clone(), quaternion: mesh.quaternion.clone() },
      caught: id === 'cdrom', placed: false, picked: Boolean(state.flag(flag(`picked.${id}`))), rest: 0, cooldown: 0, away: 0, snap: null,
    };
    let lastImpact = 0;
    entity.onCollision = (other, speed) => {
      if (speed < 1.4 || ctx.time.now - lastImpact < 0.15) return;
      lastImpact = ctx.time.now;
      ctx.audio.sfx(speed > 5 ? 'impact.hard' : 'impact.soft', { position: entity.position, volume: Math.min(1, speed / 8) });
    };
    entity.userData.clickable = {
      label: artifact(id).name, object: mesh, enabled: false,
      onClick: () => takeRelic(relic),
    };
    relic.scan = ctx.scanner.register({ object: mesh, kind: 'human', label: artifact(id).name });
    relic.signal = ctx.scanner.addSignal({ position: entity.position, active: () => !relic.placed && active, strength: 0.9 });
    relic.interact = ctx.interact.add({
      id: `oldweb:relic:${id}`, object: mesh, radius: 2.4, label: `Ramasser : ${artifact(id).name}`, priority: 1,
      enabled: () => !relic.placed && ctx.cursor.held !== entity,
      onInteract: () => takeRelic(relic),
    });
    return relic;
  });
  const relicOf = (entity) => relics.find((r) => r.entity === entity) || null;

  function setCaught(relic, caught) {
    relic.caught = caught;
    const { RAPIER } = physics;
    relic.entity.body.setBodyType(caught ? RAPIER.RigidBodyType.Fixed : RAPIER.RigidBodyType.Dynamic, true);
    relic.entity.userData.clickable.enabled = caught;
  }
  setCaught(relics[2], true);

  function takeRelic(relic) {
    if (relic.placed) return;
    if (relic.caught) setCaught(relic, false);
    ctx.cursor.grab(relic.entity);
  }

  let active = false;
  let solved = false;
  let solveIn = 0;
  let lastArtifactLine = -Infinity;
  let lastWrongLine = -Infinity;
  const anim = { chain: -1, cover: -1 };

  function markPicked(relic) {
    if (relic.picked) return;
    relic.picked = true;
    state.setFlag(flag(`picked.${relic.id}`), true);
    const a = artifact(relic.id);
    ctx.ui.toast(`${a.name} — ${a.description}`, { duration: 6 });
    if (ctx.time.now - lastArtifactLine > 25) {
      lastArtifactLine = ctx.time.now;
      ctx.companion.say('zone.oldweb.artifact');
    }
    if (relics.every((r) => r.picked)) state.setFlag(flag('relics'), true);
  }

  function displayPose(relic, p) {
    const q = euler(0, p.yaw, 0);
    const pos = p.top.clone();
    if (relic.id === 'modem') {
      pos.y += relic.size[1] / 2 - 0.035;
      q.multiply(euler(-0.12, 0, 0, 'XYZ'));
    } else {
      q.multiply(euler(PI / 2 - 0.32, 0, 0, 'XYZ'));
      pos.y += 0.17;
      pos.addScaledVector(new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw)), -0.03);
    }
    return { pos, q };
  }

  function place(relic, p, { instant = false } = {}) {
    if (relic.placed) return;
    if (ctx.cursor.held === relic.entity) ctx.cursor.release();
    if (relic.caught) setCaught(relic, false);
    relic.placed = true;
    p.occupied = relic;
    relic.entity.grabbable = false;
    relic.entity.userData.clickable.enabled = false;
    relic.scan.enabled = false;
    relic.entity.setVelocity([0, 0, 0]);
    relic.entity.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    relic.entity.body.setBodyType(physics.RAPIER.RigidBodyType.Fixed, true);
    const to = displayPose(relic, p);
    if (instant) {
      relic.entity.setPosition(to.pos, to.q);
      p.glow = 1;
    } else {
      relic.snap = { t: 0, fromPos: relic.entity.position.clone(), fromQ: relic.entity.quaternion.clone(), to };
      ctx.audio.sfx('pedestal.ok', { position: p.top });
      ctx.particles.burst({ position: p.top.clone().add(new THREE.Vector3(0, 0.2, 0)), count: 26, color: '#ffb454', color2: '#fff1d6', shape: 'ember', speed: [0.6, 2.2], spread: 1, life: [0.6, 1.4], size: [0.03, 0.08], gravity: -0.6 });
      if (relic.id === 'modem') {
        ctx.audio.sfx('modem', { position: p.top });
        ctx.companion.say('zone.oldweb.modem', { priority: 1 });
      }
    }
    state.setFlag(flag(`placed.${relic.id}`), true);
    if (relics.every((r) => r.placed)) {
      state.setFlag(flag('pedestals'), true);
      if (!solved) {
        if (instant) solve({ instant: true });
        else solveIn = relic.id === 'modem' ? 2.6 : 1.2;
      }
    }
  }

  function eject(relic, p) {
    relic.cooldown = 1.4;
    const out = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    relic.entity.setVelocity([out.x * 2.4, 3.4, out.z * 2.4]);
    relic.entity.body.setAngvel({ x: 2, y: 3, z: 1 }, true);
    ctx.audio.sfx('pedestal.wrong', { position: p.top });
    ctx.particles.burst({ position: p.top.clone().add(new THREE.Vector3(0, 0.15, 0)), count: 14, color: '#e2bd8a', shape: 'dot', speed: [0.5, 1.5], spread: 1, life: [0.4, 0.9], size: [0.03, 0.06], gravity: -2, additive: false });
    if (ctx.time.now - lastWrongLine > 25) {
      lastWrongLine = ctx.time.now;
      ctx.companion.say('zone.oldweb.wrong');
    }
  }

  function setRiddleGlow() {
    const attr = riddleMesh.geometry.attributes.aGlow;
    const colors = riddleMesh.geometry.attributes.color;
    for (const p of pedestals) {
      const g = 0.08 + p.glow * 1.1;
      for (let k = 0; k < 6; k++) {
        attr.setX(p.index * 6 + k, g);
        colors.setXYZ(p.index * 6 + k, 1, 1 - p.glow * 0.18, 1 - p.glow * 0.45);
      }
    }
    attr.needsUpdate = true;
    colors.needsUpdate = true;
  }

  function setCounter(value) {
    counter.value = value;
    digitsUV(digitsMesh.geometry.attributes.uv, 6, value);
  }

  function solve({ instant = false } = {}) {
    if (solved) return;
    solved = true;
    solveIn = 0;
    bookInteract.label = "Lire le livre d'or";
    state.setFlag(flag('pedestals'), true);
    if (instant) {
      anim.chain = 1;
      anim.cover = 1;
      applyBook();
      setCounter(215);
    } else {
      anim.chain = 0;
      anim.cover = -0.6;
      ctx.audio.sfx('guestbook.open', { position: set.positions.book });
      ctx.companion.say('zone.oldweb.solved', { priority: 1 });
    }
    ctx.beacons.setReady(ID);
  }

  function applyBook() {
    const c = Math.max(0, Math.min(1, anim.chain));
    const e = c * c;
    book.chain.position.lerpVectors(chainHome.pos, chainRest.pos, e);
    book.chain.quaternion.slerpQuaternions(chainHome.quat, chainRest.quat, Math.min(1, c * 1.4));
    const o = Math.max(0, Math.min(1, anim.cover));
    const k = o < 0.5 ? 2 * o * o : 1 - (-2 * o + 2) ** 2 / 2;
    tmpQ.setFromAxisAngle(zAxis, k * PI);
    book.coverPivot.quaternion.copy(lecternQ).multiply(tmpQ);
    book.openGroup.visible = o > 0.55;
  }

  const bookInteract = ctx.interact.add({
    id: 'oldweb:guestbook', position: set.positions.book, radius: 2.6, label: "Livre d'or (enchaîné)",
    onInteract: () => {
      if (solved) readBook();
      else ctx.ui.toast(texts.HINTS?.oldweb?.[0] || '', { duration: 5 });
    },
  });
  ctx.scanner.register({ position: set.positions.book, kind: 'human', label: "Livre d'or" });

  async function readBook() {
    const doc = {
      id: 'oldweb_livredor', kind: 'oldweb', site: "Chez Mathieu — livre d'or", url: 'http://membres.lanterne-perso.fr/~mathieu/livredor.htm', secure: false,
      author: null, date: '2001 — 2008', title: "SIGNEZ MON LIVRE D'OR !!!", body: [...(OLD.guestbook || [])],
      footer: `Vous êtes le visiteur n° 000 ${counter.value}`,
      analysis: {
        human: 0.99, verdict: 'Origine humaine',
        notes: ["Douze signatures en sept ans. Aucune n'a été optimisée.", 'Une mère, un chat, une fille du bus 22 : panel non représentatif, entièrement réel.', 'Dernière entrée : une question. Réponse en attente depuis 2008.'],
      },
    };
    ctx.audio.sfx('page');
    await ctx.ui.reader.open(doc);
    state.setFlag(flag('guestbook'), true);
  }

  events.on('grab:start', ({ entity }) => {
    const relic = relicOf(entity);
    if (relic) markPicked(relic);
  });
  events.on('beacon:activated', ({ zone }) => {
    if (zone === ID) state.setFlag(flag('beacon'), true);
  });

  ctx.traces.add({ id: 'oldweb_email', position: [set.positions.mailbox.x, set.positions.mailbox.y - 0.05, set.positions.mailbox.z] });
  ctx.traces.add({ id: 'oldweb_fanpage', position: [set.positions.fanpage.x, set.positions.fanpage.y, set.positions.fanpage.z] });
  const ap = set.positions.alcove;
  ctx.traces.add({ id: 'oldweb_guestbook', position: [ap.x, world.heightAt(ap.x, ap.z), ap.z] });
  ctx.beacons.create(ID, { position: set.positions.beacon, rotationY: CHAPEL.yaw });

  const twGeo = tumbleweedGeometry();
  const tumble = new THREE.InstancedMesh(twGeo, mats.wood, TUMBLEWEEDS);
  tumble.name = 'oldweb:tumbleweeds';
  tumble.castShadow = true;
  tumble.frustumCulled = false;
  near.add(tumble);
  const twRand = seeded('oldweb-tumble');
  const tumbleweeds = [];
  const windDir = new THREE.Vector2();
  function windNow() {
    const w = sharedUniforms.uWind.value;
    windDir.set(w.x, w.y);
    if (windDir.lengthSq() < 1e-4) windDir.set(0.83, 0.55);
    windDir.normalize();
    return Math.max(1.5, w.z);
  }
  function tumbleSpawn(t, scatter) {
    windNow();
    const side = (twRand() - 0.5) * 140;
    const back = scatter ? (twRand() - 0.5) * 160 : -95;
    const x = CENTER[0] + windDir.x * back - windDir.y * side;
    const z = CENTER[1] + windDir.y * back + windDir.x * side;
    t.entity.setPosition([x, world.heightAt(x, z) + 0.6, z]);
    t.entity.setVelocity([windDir.x * 2, 0, windDir.y * 2]);
    t.stuck = 0;
  }
  for (let i = 0; i < TUMBLEWEEDS; i++) {
    const proxy = new THREE.Object3D();
    proxy.position.set(CENTER[0], 30, CENTER[1]);
    const entity = physics.addDynamic(proxy, {
      shape: 'sphere', size: 0.42, mass: 0.7, friction: 0.5, restitution: 0.35, linearDamping: 0.35, angularDamping: 0.1,
      grabbable: true, canSleep: false, userData: { kind: 'tumbleweed' },
    });
    const t = { proxy, entity, stuck: 0, gust: twRand() * 10, scale: 0.85 + twRand() * 0.4 };
    tumbleSpawn(t, true);
    tumbleweeds.push(t);
  }

  const restored = state.beacons[ID] !== 'locked';
  for (const relic of relics) {
    if (restored || state.flag(flag(`placed.${relic.id}`))) {
      relic.picked = true;
      place(relic, pedestalFor(relic.id), { instant: true });
    }
  }
  setRiddleGlow();
  if (restored && !solved) solve({ instant: true });

  let midi = null;
  const jukePos = set.positions.jukebox;
  const camPos = new THREE.Vector3();
  const labelPos = new THREE.Vector3();
  const impulse = new THREE.Vector3();

  function resetRelic(relic) {
    relic.away = 0;
    if (ctx.cursor.held === relic.entity) return;
    relic.entity.setVelocity([0, 0, 0]);
    relic.entity.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    relic.entity.setPosition(relic.origin.position, relic.origin.quaternion);
    if (relic.id === 'cdrom') setCaught(relic, true);
    ctx.particles.burst({ position: relic.origin.position.clone(), count: 16, color: '#ffb454', shape: 'glyph', speed: [0.4, 1.2], spread: 1, life: [0.6, 1.2], size: [0.05, 0.1], gravity: 0.5 });
  }

  function updateRelics(dt) {
    for (const relic of relics) {
      if (relic.snap) {
        const s = relic.snap;
        s.t = Math.min(1, s.t + dt / 0.55);
        const k = 1 - (1 - s.t) ** 3;
        tmpV.lerpVectors(s.fromPos, s.to.pos, k);
        tmpV.y += Math.sin(s.t * PI) * 0.25;
        tmpQ.slerpQuaternions(s.fromQ, s.to.q, k);
        relic.entity.body.setTranslation({ x: tmpV.x, y: tmpV.y, z: tmpV.z }, true);
        relic.entity.body.setRotation({ x: tmpQ.x, y: tmpQ.y, z: tmpQ.z, w: tmpQ.w }, true);
        const p = pedestalFor(relic.id);
        p.glow = Math.max(p.glow, k);
        if (s.t >= 1) relic.snap = null;
        continue;
      }
      if (relic.placed || relic.caught) continue;
      relic.cooldown = Math.max(0, relic.cooldown - dt);
      const held = ctx.cursor.held === relic.entity;
      const pos = relic.entity.position;
      if (!held && relic.cooldown <= 0) {
        const v = relic.entity.body.linvel();
        const speed = Math.hypot(v.x, v.y, v.z);
        let on = null;
        for (const p of pedestals) if (p.sensor.inside.has(relic.entity)) on = p;
        if (on && speed < 0.4) {
          relic.rest += dt;
          if (relic.rest > 0.3) {
            relic.rest = 0;
            if (on.id === relic.id && !on.occupied) place(relic, on);
            else eject(relic, on);
          }
        } else relic.rest = 0;
      }
      const g = world.heightAt(pos.x, pos.z);
      const out = Math.hypot(pos.x - CENTER[0], pos.z - CENTER[1]) > RADIUS - 8 || pos.y < g - 2 || g < 1 || g > 40;
      relic.away = !held && out ? relic.away + dt : 0;
      if (relic.away > RESPAWN_AFTER) resetRelic(relic);
    }
  }

  function updateTumbleweeds(dt) {
    const strength = windNow();
    for (const t of tumbleweeds) {
      if (ctx.cursor.held === t.entity) continue;
      const p = t.entity.position;
      t.gust += dt;
      const gust = 0.7 + 0.6 * Math.max(0, Math.sin(t.gust * 0.7)) + 0.3 * Math.sin(t.gust * 2.3);
      const a = strength * 0.45 * gust * 0.7 * dt;
      impulse.set(windDir.x * a, 0, windDir.y * a);
      const v = t.entity.body.linvel();
      const hs = Math.hypot(v.x, v.z);
      const g = world.heightAt(p.x, p.z);
      if (p.y - g < 0.5 && hs > 1.2 && Math.random() < 0.012) impulse.y += 0.7 * 1.6;
      t.entity.applyImpulse(impulse);
      t.stuck = hs < 0.15 ? t.stuck + dt : 0;
      const far2 = Math.hypot(p.x - CENTER[0], p.z - CENTER[1]) > 175;
      if (far2 || t.stuck > 10 || p.y < g - 3) tumbleSpawn(t, false);
    }
  }

  const m4 = new THREE.Matrix4();
  const sc = new THREE.Vector3();
  let gifClock = 0;

  return {
    id: ID,
    spawn: [SPAWN[0], world.heightAt(SPAWN[0], SPAWN[1]), SPAWN[1], SPAWN_YAW],

    fixedUpdate(dt) {
      const p = ctx.has('player') ? ctx.player.position : camera.position;
      active = Math.hypot(p.x - CENTER[0], p.z - CENTER[1]) < ACTIVE;
      if (!active) return;
      updateRelics(dt);
      updateTumbleweeds(dt);
      if (solveIn > 0) {
        solveIn -= dt;
        if (solveIn <= 0) solve();
      }
    },

    update(dt) {
      if (!active) {
        if (midi) {
          midi.stop(1.5);
          midi = null;
        }
        return;
      }
      const d = ctx.player.position.distanceTo(jukePos);
      if (!midi && d < 140) midi = ctx.audio.loop('midi', { position: jukePos, volume: 0.8, refDistance: 4, maxDistance: 70, fade: 2 });
      else if (midi && d > 170) {
        midi.stop(1.5);
        midi = null;
      }
      if (anim.chain >= 0 && anim.chain < 1) anim.chain = Math.min(1, anim.chain + dt / 0.9);
      if (anim.cover < 1 && anim.chain >= 0) {
        anim.cover = Math.min(1, anim.cover + dt / 1.6);
        if (anim.cover > 0.35 && counter.value === 214) {
          counter.shake = 0.4;
          ctx.audio.sfx('ui.type', { position: set.positions.fountain });
          setCounter(215);
        }
        applyBook();
      }
    },

    frame(dt) {
      camera.getWorldPosition(camPos);
      const dist = Math.hypot(camPos.x - CENTER[0], camPos.z - CENTER[1]);
      near.visible = dist < FAR;
      if (!near.visible) return;
      gifClock += dt;
      if (atmo) {
        const night = sharedUniforms.uNight.value;
        const sunY = sharedUniforms.uSunDir.value.y;
        const gold = Math.min(1, Math.max(0, (0.42 - sunY) / 0.36)) * (1 - night);
        atmo.exposure = 1 + 0.18 * gold + 0.05 * night;
        atmo.saturation = 1.02 + 0.12 * gold;
        atmo.tint[0] = 1.03 + 0.06 * gold;
        atmo.tint[2] = 0.95 - 0.07 * gold + 0.04 * night;
        atmo.fogColor.copy(FOG_DAY).lerp(FOG_GOLD, gold).lerp(FOG_NIGHT, night);
      }
      const step8 = Math.floor(gifClock * 8);
      gifs.star.rotation.y = (step8 % 12) * (PI / 6);
      const f = FLAME_FRAMES[Math.floor(gifClock * 7) % FLAME_FRAMES.length];
      gifs.flame.scale.set(f[0], f[1], f[0]);
      gifs.flame.rotation.z = f[2];
      gifs.envelope.rotation.y = (Math.floor(gifClock * 6) % 8) * (PI / 4);
      gifs.envelope.position.y = envelopeY + (Math.floor(gifClock * 3) % 2) * 0.06;

      let changed = false;
      for (const p of pedestals) {
        const target = p.occupied && !p.occupied.snap ? 1 : p.occupied ? p.glow : 0;
        const s = 0.001 + target * (1 + 0.04 * Math.sin(gifClock * 3 + p.index));
        m4.compose(sc.set(p.top.x, p.top.y - 0.01, p.top.z), tmpQ.identity(), tmpV.set(s, s, s));
        rings.setMatrixAt(p.index, m4);
        if (Math.abs(target - (p.shown ?? -1)) > 0.01) {
          p.shown = target;
          changed = true;
        }
      }
      rings.instanceMatrix.needsUpdate = true;
      if (changed) setRiddleGlow();
      if (lights.pedestals) lights.pedestals.intensity = pedestals.reduce((n, p) => n + (p.occupied ? 0.5 : 0), 0);
      if (lights.antenna) lights.antenna.intensity = (sharedUniforms.uTime.value * 0.8) % 1 >= 0.45 ? 1.6 : 0.08;
      if (counter.shake > 0) {
        counter.shake = Math.max(0, counter.shake - dt);
        digitsMesh.position.copy(digitsHome).y += Math.sin(counter.shake * 80) * 0.012 * counter.shake;
      }

      for (let i = 0; i < tumbleweeds.length; i++) {
        const t = tumbleweeds[i];
        m4.compose(t.proxy.position, t.proxy.quaternion, sc.set(t.scale, t.scale, t.scale));
        tumble.setMatrixAt(i, m4);
      }
      tumble.instanceMatrix.needsUpdate = true;

      const target = ctx.cursor.held ? relicOf(ctx.cursor.held) : ctx.cursor.target?.entity ? relicOf(ctx.cursor.target.entity) : null;
      if (target && !target.placed && state.mode === 'playing') {
        label.material = labelMat[target.id];
        labelPos.copy(target.mesh.position);
        labelPos.y += 0.42;
        label.position.copy(labelPos);
        label.quaternion.copy(camera.quaternion);
        label.visible = true;
      } else label.visible = false;
    },

    inspect() {
      return {
        solved, counter: counter.value, active,
        relics: relics.map((r) => ({ id: r.id, position: r.entity.position.toArray(), origin: r.origin.position.toArray(), placed: r.placed, picked: r.picked, caught: r.caught })),
        pedestals: pedestals.map((p) => ({ id: p.id, top: p.top.toArray(), yaw: p.yaw, occupied: p.occupied?.id || null })),
        book: set.positions.book.toArray(), beacon: set.positions.beacon, chapel: [CHAPEL.x, CHAPEL.z, CHAPEL.yaw],
        caprock: set.positions.capTop.toArray(), rampFoot: set.rampFoot.toArray(), rampTop: set.rampTop.toArray(), ledgeTop: set.ledgeTop.toArray(),
        cave: set.positions.cave.toArray(), traces: { email: set.positions.mailbox.toArray(), fanpage: set.positions.fanpage.toArray(), guestbook: set.positions.alcove.toArray() },
      };
    },

    debugSolve() {
      for (const relic of relics) {
        markPicked(relic);
        place(relic, pedestalFor(relic.id));
      }
      if (!solved) solve();
      return true;
    },
  };
}
