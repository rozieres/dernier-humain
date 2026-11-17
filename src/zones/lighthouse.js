import * as THREE from 'three';
import { buildTower } from './lighthouse/tower.js';
import { buildCottage, COTTAGE } from './lighthouse/cottage.js';
import { buildIsland } from './lighthouse/island.js';
import { glowSprite } from './lighthouse/shaders.js';
import { createFinale } from './lighthouse/finale.js';
import { crtPage, robotsSign, calendarTexture, boardTexture, kioskScreen, frenchDate } from './lighthouse/textures.js';
import { loadSaveOnce } from '../story/save.js';
import { rubbleTexture, plasterTexture, slateTexture, plankTexture, clothTexture, graniteTexture, smooth } from './lighthouse/kit.js';

const ID = 'lighthouse';
const NOTE = {
  id: 'lighthouse_door_note', kind: 'note', site: 'Mot punaisé sur la porte', url: null, secure: true, author: 'M.', date: null,
  body: ['La porte est coincée. Elle fait ça quand l\'Anneau est éteint.', 'Revenez avec de la lumière.'],
  analysis: { human: 0.98, verdict: 'Origine humaine', notes: ['Crayon à papier, punaise rouillée.', 'Signé d\'une seule lettre.'] },
};

function laundryShader(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uWind;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
float swayK = 1.0 - uv.y;
float gust = 0.6 + 0.4 * sin(uTime * 0.7 + position.x * 0.3);
transformed.x += uWind.x * 0.05 * swayK * gust * (1.0 + sin(uTime * 3.1 + position.x * 2.0));
transformed.z += uWind.y * 0.05 * swayK * gust * (1.0 + sin(uTime * 2.7 + position.z * 2.0));
transformed.y += 0.03 * swayK * sin(uTime * 4.0 + position.x * 5.0);`);
}

export default async function create(ctx) {
  await ctx.text.ready;
  loadSaveOnce(ctx);
  const { world, state, events, texts, mat, scene, camera } = ctx;
  const Z = world.zones.lighthouse;
  const center = new THREE.Vector3(Z.center[0], Z.plateauY, Z.center[1]);
  const [ax, , az] = Z.arrival;
  const landing = new THREE.Vector3(ax - 4.5, world.heightAt(ax - 4.5, az + 0.2), az + 0.2);

  const tex = {
    rubble: rubbleTexture('lh-rubble'),
    plaster: plasterTexture('lh-plaster'),
    slate: slateTexture('lh-slate'),
    planks: plankTexture('lh-planks', { boards: 6 }),
    grain: plankTexture('lh-grain', { boards: 1, base: '#cbbfae' }),
    cloth: clothTexture('lh-cloth'),
    granite: graniteTexture('lh-granite'),
  };
  const textMats = new Map();
  const mats = {
    rubble: mat.standard({ map: tex.rubble, bumpMap: tex.rubble, bumpScale: 2.2, vertexColors: true, roughness: 0.93, metalness: 0 }),
    plaster: mat.standard({ map: tex.plaster, bumpMap: tex.plaster, bumpScale: 0.6, vertexColors: true, roughness: 0.96, metalness: 0 }),
    slate: mat.standard({ map: tex.slate, bumpMap: tex.slate, bumpScale: 1.2, vertexColors: true, roughness: 0.62, metalness: 0.08 }),
    planks: mat.standard({ map: tex.planks, bumpMap: tex.planks, bumpScale: 0.8, vertexColors: true, roughness: 0.82, metalness: 0 }),
    wood: mat.standard({ map: tex.grain, bumpMap: tex.grain, bumpScale: 0.6, vertexColors: true, roughness: 0.78, metalness: 0 }),
    cloth: mat.standard({ map: tex.cloth, vertexColors: true, roughness: 1, metalness: 0 }),
    laundry: mat.standard({ map: tex.cloth, vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }, { onShader: laundryShader }),
    metal: mat.standard({ vertexColors: true, roughness: 0.45, metalness: 0.3 }),
    emissive: mat.basic({ vertexColors: true }),
    rock: mat.standard({ map: tex.granite, bumpMap: tex.granite, bumpScale: 1.5, roughness: 0.92, metalness: 0 }),
    flag: mat.standard({ map: tex.granite, bumpMap: tex.granite, bumpScale: 1.0, roughness: 0.88, metalness: 0 }),
    heather: mat.standard({ roughness: 1, metalness: 0, flatShading: true }),
    synth: mat.physical({ vertexColors: true, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 }),
    robots: robotsSign(ctx),
    calendar: calendarTexture(ctx),
    kiosk: kioskScreen(ctx),
    crt: crtPage(ctx),
    board: boardTexture(ctx),
    standardText(map) {
      if (!textMats.has(map)) textMats.set(map, mat.standard({ map, roughness: 0.85, metalness: 0 }));
      return textMats.get(map);
    },
  };

  const towerPos = new THREE.Vector3(-1172, 14, 166);
  const tower = buildTower(ctx, { position: towerPos });
  const cottage = buildCottage(ctx, { origin: new THREE.Vector3(-1140, 14.35, 180), rotationY: Math.PI / 2, mats });
  const kioskPos = new THREE.Vector3(-1081.2, 0, 142.6);
  const island = buildIsland(ctx, { cottage, tower, landing, mats, kioskPos });

  const windowGlow = glowSprite(ctx, { color: '#ffa44a', intensity: 7, size: 1.1, minAngle: 0.0055, fogKeep: 0.85, nightGate: 1, core: 8 });
  windowGlow.position.copy(cottage.windowWorld);
  scene.add(windowGlow);

  ctx.env.addAtmosphere({ id: 'lighthouse', center: [Z.center[0], Z.center[1]], radius: 75, falloff: 140, fogColor: '#8aa2b2', fogDensity: 0.85, saturation: 0.88, tint: [0.98, 1.0, 1.02] });
  ctx.env.addAtmosphere({ id: 'lighthouse-room', center: [cottage.group.position.x, cottage.group.position.z], radius: 2.2, falloff: 2.2, tint: [1.12, 1.0, 0.84], darkness: 0.45, exposure: 1.05, saturation: 1.05 });

  const crt = mats.crt;
  const board = {
    refresh() {
      mats.board.redraw(state.playerMessages);
    },
  };
  board.refresh();

  const lampLit = () => state.finaleDone || Boolean(state.flag('zone.lighthouse.lamp')) || Boolean(state.flag('story.finale.reply'));
  const setLampLit = () => state.setFlag('zone.lighthouse.lamp', true);
  if (lampLit()) tower.setLamp(1);
  const doorStartsOpen = state.finaleDone || (state.stage >= 5 && Boolean(state.flag('zone.lighthouse.door')));
  cottage.setDoor(doorStartsOpen, true);
  if (state.finaleDone) crt.redraw({ replies: 1 });

  const loops = {};
  const loopSpecs = {
    sea: { name: 'sea', position: center.clone().setY(4), volume: 0.9, refDistance: 40, maxDistance: 260 },
    wind: { name: 'wind', position: center.clone().setY(20), volume: 0.5, refDistance: 60, maxDistance: 240 },
    crt: { name: 'crt', position: cottage.crtWorld, volume: 0.35, refDistance: 1, maxDistance: 9 },
    radio: { name: 'radio.theme', position: cottage.radioWorld, volume: 0.55, refDistance: 1.4, maxDistance: 16 },
    fire: { name: 'fire', position: cottage.stoveWorld, volume: 0.5, refDistance: 1, maxDistance: 10 },
  };
  let radioOn = true;
  const radio = {
    stop(fadeTime = 1.5) {
      radioOn = false;
      loops.radio?.stop(fadeTime);
      loops.radio = null;
    },
    resume() {
      radioOn = true;
    },
  };

  const finale = createFinale(ctx, {
    tower, cottage, crt, board, radio, setLampLit,
    doorSpot: (() => {
      const p = cottage.tw(COTTAGE.doorOutside);
      return [p.x + 0.6, world.heightAt(p.x + 0.6, p.z), p.z];
    })(),
  });

  const logDoc = {
    id: 'lighthouse_log', kind: 'final', site: `${texts.LIGHTHOUSE.final.site} — archives`, url: texts.LIGHTHOUSE.final.url, secure: false,
    author: 'Maryvonne', date: texts.LIGHTHOUSE.log[texts.LIGHTHOUSE.log.length - 1].date,
    body: texts.LIGHTHOUSE.log.map((e) => `${e.date}. ${e.text}`),
    analysis: texts.LIGHTHOUSE.final.analysis,
  };

  async function readScreen() {
    if (finale.running) return;
    state.setFlag('story.finale.read', true);
    ctx.audio.sfx('crt.on', { position: cottage.crtWorld, volume: 0.6 });
    state.setMode('ending');
    for (;;) {
      const choice = await ctx.ui.reader.open({ ...texts.LIGHTHOUSE.final, actions: [{ id: 'reply', label: 'Répondre' }, { id: 'log', label: 'Archives' }] });
      if (choice === 'log') {
        await ctx.ui.reader.open(logDoc);
        continue;
      }
      if (choice === 'reply') {
        const text = await ctx.ui.reply.open(texts.LIGHTHOUSE.reply);
        await finale.reply(text);
      } else {
        state.setMode('playing');
        ctx.input.requestLock();
      }
      return;
    }
  }

  function openDoor() {
    cottage.setDoor(true);
    state.setFlag('zone.lighthouse.door', true);
    state.setFlag('story.finale.house', true);
    ctx.audio.sfx('door', { position: cottage.doorWorld });
  }

  function stuckDoor() {
    cottage.rattleDoor();
    ctx.audio.sfx('impact.soft', { position: cottage.doorWorld, volume: 0.8 });
    ctx.player.shake(0.12, 0.25);
    ctx.ui.reader.open(NOTE);
  }

  const doorHandle = ctx.interact.add({
    id: 'lighthouse:door', position: cottage.doorWorld, radius: 3, label: 'Entrer',
    enabled: () => !cottage.doorOpen,
    onInteract: () => (state.stage >= 5 ? openDoor() : stuckDoor()),
  });
  ctx.interact.add({
    id: 'lighthouse:crt', position: cottage.crtWorld, radius: 2.1, label: 'Lire', priority: 1,
    enabled: () => !finale.running && cottage.doorOpen,
    onInteract: () => {
      readScreen();
    },
  });
  ctx.interact.add({
    id: 'lighthouse:board', position: cottage.boardWorld, radius: 2.3, label: 'Lire',
    onInteract: () => {
      const list = state.playerMessages.slice(-12);
      ctx.ui.reader.open({
        id: 'lighthouse_board', kind: 'note', site: texts.LIGHTHOUSE.board.title, url: null, secure: true, author: null, date: null,
        body: list.length ? list.map((m) => `${frenchDate(m.date)} — ${m.text}`) : [texts.LIGHTHOUSE.board.empty],
        analysis: { human: 1, verdict: 'Origine humaine', notes: ['Punaises, papier, encre.', list.length ? `${list.length} mot${list.length > 1 ? 's' : ''} laissé${list.length > 1 ? 's' : ''}.` : 'Rien encore.'] },
      });
    },
  });
  ctx.interact.add({
    id: 'lighthouse:kiosk', position: island.kioskTop, radius: 3, label: 'Lire',
    onInteract: () => ctx.ui.reader.open(texts.SYNTH_DOCS.lighthouse_copy),
  });

  ctx.scanner.register({ position: cottage.crtWorld, kind: 'human', label: 'Le journal du phare' });
  ctx.scanner.register({ position: cottage.boardWorld, kind: 'human', label: texts.LIGHTHOUSE.board.title });
  ctx.scanner.register({ position: island.kioskTop, kind: 'synthetic', label: 'Journal du phare — édition optimisée' });
  ctx.scanner.register({ position: cottage.doorWorld, kind: 'human', label: 'robots.txt' });
  ctx.scanner.addSignal({ position: cottage.crtWorld, active: () => state.stage >= 5 && !state.finaleDone && !state.flag('story.finale.reply'), strength: 1 });

  const porch = cottage.tw(COTTAGE.porch);
  porch.y = world.heightAt(porch.x, porch.z) + 1.35;
  const visit = { arrive: false, robots: false, wait: false, near: false };
  let pendingResume = Boolean(state.flag('story.finale.reply')) && !state.finaleDone;
  let tiretStaying = false;

  function arrive() {
    if (visit.arrive) return;
    visit.arrive = true;
    if (state.stage >= 5) state.setFlag('story.finale.link', true);
    ctx.companion.say('lighthouse.arrive', { priority: 1 });
  }
  events.on('link:ride:end', ({ id } = {}) => {
    if (id === ID) arrive();
  });

  const interior = [cottage.meshes.plaster, cottage.meshes.wood, cottage.meshes.cloth, cottage.meshes.metal, cottage.meshes.glow, cottage.terminal.group, cottage.steam, cottage.boardMesh, cottage.calMesh];
  const nearGroups = [island.group, cottage.meshes.planks, cottage.noteMesh.parent, cottage.lantern.group, tower.meshes.glass, tower.meshes.cage, tower.meshes.filament];
  const midGroups = [cottage.meshes.stone, cottage.meshes.roof, cottage.meshes.panes, cottage.smoke];
  let lod = '';
  let interiorShown = true;
  const tmp = new THREE.Vector3();

  function setLod(level) {
    if (level === lod) return;
    lod = level;
    for (const o of nearGroups) if (o) o.visible = level === 'near';
    for (const o of midGroups) if (o) o.visible = level !== 'far';
  }

  function updateLoops(active) {
    for (const [key, spec] of Object.entries(loopSpecs)) {
      const want = active && (key !== 'radio' || radioOn);
      if (want && !loops[key]) loops[key] = ctx.audio.loop(spec.name, { position: spec.position, volume: spec.volume, refDistance: spec.refDistance, maxDistance: spec.maxDistance, fade: 1.5 });
      else if (!want && loops[key]) {
        loops[key].stop(1.5);
        loops[key] = null;
      }
    }
  }

  const zone = {
    id: ID,
    spawn: [landing.x, landing.y, landing.z, Math.atan2(-(center.x - landing.x), -(center.z - landing.z)) - 0.06],
    tower, cottage, island, finale,

    get state() {
      return {
        lamp: tower.lamp, doorOpen: cottage.doorOpen, tiret: ctx.companion.mode, running: finale.running, lod,
        inside: cottage.isInside(ctx.player.position), pendingResume,
      };
    },

    readScreen,

    async debugSolve(text = 'test') {
      cottage.setDoor(true, true);
      state.setFlag('zone.lighthouse.door', true);
      state.setFlag('story.finale.house', true);
      state.setFlag('story.finale.read', true);
      state.setMode('ending');
      return finale.reply(text, { fast: true });
    },

    update(dt) {
      finale.update(dt);
      const p = ctx.player.position;
      const d = Math.hypot(p.x - center.x, p.z - center.z);
      const active = d < Z.radius + 150;
      updateLoops(active || finale.running);
      if (!active) {
        if (visit.near) Object.assign(visit, { arrive: false, robots: false, wait: false, near: false });
        if (tiretStaying && !finale.running) {
          tiretStaying = false;
          ctx.companion.setMode('follow');
        }
        return;
      }
      visit.near = true;
      cottage.update(dt, ctx.time.now);
      island.update(dt);
      if (pendingResume && state.mode === 'playing') {
        pendingResume = false;
        finale.resume();
        return;
      }
      if (state.mode !== 'playing' || finale.running) return;
      doorHandle.label = state.stage >= 5 ? 'Entrer' : 'Pousser';
      cottage.noteMesh.visible = state.stage < 5;
      if (d < Z.shoreR + 4 && !ctx.links.riding) arrive();
      const dd = tmp.copy(cottage.doorWorld).sub(p).setY(0).length();
      if (dd < 5 && !visit.robots) {
        visit.robots = true;
        ctx.companion.say('lighthouse.robots', { priority: 1 });
      }
      if (visit.robots && !state.finaleDone) {
        const stay = dd < 38;
        if (stay !== tiretStaying) {
          tiretStaying = stay;
          ctx.companion.setMode(stay ? 'stay' : 'follow', stay ? porch : undefined);
        }
      }
      if (!visit.wait && cottage.doorOpen && cottage.isInside(p)) {
        visit.wait = true;
        state.setFlag('story.finale.house', true);
        ctx.companion.say('lighthouse.wait', { priority: 1 });
      }
    },

    frame(dt) {
      const cam = camera.position;
      const dc = Math.hypot(cam.x - center.x, cam.z - center.z);
      setLod(dc > 600 ? 'far' : dc > 350 ? 'mid' : 'near');
      const showInterior = cam.distanceTo(cottage.group.position) < 26;
      if (showInterior !== interiorShown) {
        interiorShown = showInterior;
        for (const o of interior) if (o) o.visible = showInterior;
      }
      tower.reduce = Boolean(state.settings.reduceFx);
      tower.update(dt);
      const dw = cam.distanceTo(cottage.windowWorld);
      const inside = dc < 6 && cottage.isInside(cam);
      windowGlow.visible = !inside;
      windowGlow.material.uniforms.uIntensity.value = 7 * smooth(8, 26, dw);
    },
  };
  return zone;
}
