import * as THREE from 'three';
import './core/fonts.js';
import { createEvents } from './core/events.js';
import { createState } from './core/state.js';
import { createQuality, QUALITY_TIERS } from './core/quality.js';
import { createInput } from './core/input.js';
import { createPhysics } from './core/physics.js';
import { createMaterials } from './core/materials.js';
import { createText } from './core/textpanel.js';
import { createInteract } from './core/interact.js';
import { createDebug } from './core/debug.js';
import { rng } from './core/rng.js';
import { sharedUniforms } from './core/glsl.js';
import { createStub } from './core/stub.js';
import { createFallbackEnv, createFallbackTerrain, createFallbackSea, createFlyCam } from './core/fallback.js';
import { createWorld } from './world/worldmap.js';

export const ZONE_IDS = ['hub', 'feed', 'farm', 'hallu', 'oldweb', 'forest', 'lighthouse'];
export const BOOT_ORDER = [
  'env', 'terrain', 'water', 'vegetation', 'particles', 'postfx', 'audio', 'ui', 'player', 'cursor', 'scanner', 'links', 'props',
  'bots', 'companion', 'traces', 'beacons', ...ZONE_IDS.map((z) => `zone:${z}`), 'story',
];
const PATHS = {
  env: './world/env.js', terrain: './world/terrain.js', water: './world/water.js', vegetation: './world/vegetation.js',
  particles: './fx/particles.js', postfx: './fx/postfx.js', audio: './audio/audio.js', ui: './ui/ui.js',
  player: './entities/player.js', cursor: './entities/cursor.js', scanner: './entities/scanner.js', links: './world/links.js',
  props: './entities/props.js', bots: './entities/bots.js', companion: './entities/companion.js', traces: './entities/traces.js',
  beacons: './entities/beacons.js', story: './story/director.js',
  ...Object.fromEntries(ZONE_IDS.map((z) => [`zone:${z}`, `./zones/${z}.js`])),
};
const MODULES = import.meta.glob([
  './world/env.js', './world/terrain.js', './world/water.js', './world/vegetation.js', './world/links.js',
  './fx/postfx.js', './fx/particles.js', './audio/audio.js', './ui/ui.js',
  './entities/player.js', './entities/cursor.js', './entities/scanner.js', './entities/props.js', './entities/bots.js',
  './entities/companion.js', './entities/traces.js', './entities/beacons.js',
  './zones/*.js', './story/director.js',
]);
const TEXTS = import.meta.glob('./data/texts.js');
const SIM_MODES = new Set(['playing', 'reading', 'cinematic', 'ending']);
const CORE = ['renderer', 'scene', 'camera', 'canvas', 'uiRoot', 'events', 'input', 'physics', 'world', 'state', 'quality', 'mat', 'text', 'interact', 'rng', 'debug'];
const STEP = 1 / 60;
const MAX_STEPS = 5;
const SAVE_LOADED = Symbol.for('dhsi.story.loaded');

function pendingNewGame() {
  try {
    return sessionStorage.getItem('dhsi.story.newgame') === '1';
  } catch {
    return false;
  }
}

const list = (v) => (v === null || v === undefined ? undefined : String(v).split(',').map((s) => s.trim()).filter(Boolean));

function readParams() {
  if (typeof location === 'undefined') return {};
  const p = new URLSearchParams(location.search);
  const flag = (k) => (p.has(k) ? p.get(k) !== '0' && p.get(k) !== 'false' : undefined);
  const out = {
    systems: p.has('only') ? list(p.get('only')) : undefined,
    zones: p.has('zones') ? list(p.get('zones')) : undefined,
    debug: flag('debug'),
    quality: QUALITY_TIERS.includes(p.get('quality')) ? p.get('quality') : undefined,
    skipIntro: flag('skipIntro'),
    skipMenu: flag('skipMenu'),
    mute: flag('mute'),
    freecam: flag('freecam'),
    nosave: flag('nosave'),
    stage: p.has('stage') ? Number(p.get('stage')) : undefined,
  };
  if (p.has('spawn')) {
    const s = list(p.get('spawn'));
    out.spawn = s.length >= 3 && s.every((v) => Number.isFinite(Number(v))) ? s.map(Number) : s[0];
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}

function selection({ systems, zones }) {
  const set = new Set();
  const base = systems ?? BOOT_ORDER.filter((n) => !n.startsWith('zone:'));
  for (const n of base) {
    if (n.startsWith('zone:')) continue;
    if (n === 'zones') ZONE_IDS.forEach((z) => set.add(`zone:${z}`));
    else set.add(n);
  }
  const zoneList = zones ?? (systems ? systems.filter((n) => n.startsWith('zone:')).map((n) => n.slice(5)) : ZONE_IDS);
  for (const z of zoneList) set.add(`zone:${z}`);
  return set;
}

function ensureElement(id, tag) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement(tag);
    el.id = id;
    document.body.appendChild(el);
  }
  return el;
}

function bootLoader() {
  const el = document.getElementById('boot-loader');
  return {
    progress(p, label) {
      if (!el) return;
      const bar = el.querySelector('[data-progress]');
      if (bar) bar.style.transform = `scaleX(${Math.max(0, Math.min(1, p))})`;
      const text = el.querySelector('[data-label]');
      if (text && label) text.textContent = label;
    },
    hide() {
      if (!el || !el.isConnected) return;
      el.classList.add('is-done');
      setTimeout(() => el.remove(), 700);
    },
  };
}

export async function boot(options = {}) {
  const opts = { ...options, ...readParams() };
  const canvas = ensureElement('game', 'canvas');
  const uiRoot = ensureElement('ui', 'div');
  const loader = bootLoader();
  loader.progress(0.05, 'Initialisation');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 6000);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  const real = new Set(CORE);
  const ctx = {
    renderer, scene, camera, canvas, uiRoot, options: opts,
    time: { now: 0, dt: 0, realDt: 0, frame: 0 },
    ready: false,
    zones: {},
    has: (name) => real.has(name),
  };
  for (const name of BOOT_ORDER) {
    if (name.startsWith('zone:')) ctx.zones[name.slice(5)] = createStub(name);
    else ctx[name] = createStub(name);
  }
  window.__game = ctx;

  ctx.events = createEvents();
  ctx.rng = rng;
  ctx.state = createState({ events: ctx.events, nosave: Boolean(opts.nosave) });
  ctx.quality = createQuality({ tier: opts.quality || ctx.state.settings.quality, events: ctx.events, renderer });
  camera.fov = ctx.state.settings.fov || 70;
  camera.updateProjectionMatrix();

  ctx.events.on('settings:change', ({ key, value }) => {
    if (key === 'quality') ctx.quality.setTier(value);
    if (key === 'fov') {
      camera.fov = value;
      camera.updateProjectionMatrix();
    }
  });

  loader.progress(0.1, "Génération de l'île");
  ctx.world = createWorld();
  sharedUniforms.uHeightTex.value = ctx.world.heightTexture;
  sharedUniforms.uBiomeTexA.value = ctx.world.biomeTextureA;
  sharedUniforms.uBiomeTexB.value = ctx.world.biomeTextureB;
  sharedUniforms.uWorldHalf.value = ctx.world.HALF;
  sharedUniforms.uSeaLevel.value = ctx.world.SEA_LEVEL;

  const selected = selection(opts);
  const imports = new Map();
  for (const name of BOOT_ORDER) {
    const load = selected.has(name) && MODULES[PATHS[name]];
    if (load) imports.set(name, load().then((mod) => ({ mod }), (err) => ({ err })));
  }
  const textsImport = TEXTS['./data/texts.js'] ? TEXTS['./data/texts.js']().then((mod) => ({ mod }), (err) => ({ err })) : null;

  ctx.mat = createMaterials();
  ctx.text = createText({ renderer, mat: ctx.mat });
  const [physics] = await Promise.all([createPhysics({ world: ctx.world, scene }), ctx.text.ready]);
  ctx.physics = physics;
  ctx.input = createInput({ canvas, events: ctx.events, getMode: () => ctx.state.mode });
  ctx.interact = createInteract(ctx);
  const flycam = createFlyCam(ctx);
  ctx.debug = createDebug(ctx, { simulate, setFreecam });
  ctx.debug.flycam = flycam;
  if (opts.debug) ctx.debug.showOverlay();

  if (textsImport) {
    const { mod, err } = await textsImport;
    if (err) console.error('[boot] system "texts" failed', err);
    else {
      ctx.texts = mod;
      real.add('texts');
    }
  } else ctx.texts = createStub('texts');

  let saveLoaded = false;
  if (Number.isFinite(opts.stage)) ctx.state.applyStage(opts.stage);
  else if (!opts.nosave && !pendingNewGame() && ctx.state.hasSave()) saveLoaded = ctx.state.load();
  ctx.state[SAVE_LOADED] = saveLoaded;

  const systems = [];
  let fixedHooks = [];
  let updateHooks = [];
  let frameHooks = [];
  const total = BOOT_ORDER.length;
  async function install(name, pending) {
    try {
      const { mod, err } = await pending;
      if (err) throw err;
      const create = typeof mod === 'function' ? mod : mod.default;
      if (typeof create !== 'function') throw new Error('module has no default create(ctx) export');
      const sys = (await create(ctx)) || {};
      if (name.startsWith('zone:')) ctx.zones[name.slice(5)] = sys;
      else if (BOOT_ORDER.includes(name) || !(name in ctx)) ctx[name] = sys;
      real.add(name);
      systems.push({ name, sys });
    } catch (err) {
      console.error(`[boot] system "${name}" failed`, err);
    }
  }

  for (let i = 0; i < total; i++) {
    const name = BOOT_ORDER[i];
    const pending = imports.get(name);
    if (!pending) continue;
    const progress = 0.2 + 0.75 * (i / total);
    if (real.has('ui')) ctx.ui.loading(progress);
    else loader.progress(progress, 'Chargement');
    await install(name, pending);
    if (name === 'ui' && real.has('ui')) ctx.ui.loading(progress);
  }
  for (const [i, extra] of (opts.extra || []).entries()) {
    const create = typeof extra === 'function' ? extra : extra.create;
    await install(extra.name || `extra${i}`, Promise.resolve({ mod: create }));
  }

  if (real.has('ui')) ctx.ui.loading(1);
  else loader.progress(1, 'Prêt');

  const internal = [];
  if (!real.has('env')) internal.push(createFallbackEnv(ctx));
  if (!real.has('terrain')) createFallbackTerrain(ctx);
  if (!real.has('water')) internal.push(createFallbackSea(ctx));
  const failures = new Set();
  const call = (name, sys, hook, arg) => {
    try {
      sys[hook](arg);
    } catch (err) {
      const key = `${name}.${hook}`;
      if (failures.has(key)) return;
      failures.add(key);
      console.error(`[boot] ${key} failed`, err);
    }
  };
  const hooks = (hook) => systems.filter(({ sys }) => typeof sys[hook] === 'function');
  for (const { name, sys } of hooks('start')) {
    try {
      await sys.start();
    } catch (err) {
      console.error(`[boot] ${name}.start failed`, err);
    }
  }
  fixedHooks = hooks('fixedUpdate');
  updateHooks = hooks('update');
  frameHooks = hooks('frame');

  function fixed() {
    for (const { name, sys } of fixedHooks) call(name, sys, 'fixedUpdate', STEP);
    ctx.physics.step(STEP);
  }

  function update(dt) {
    ctx.time.dt = dt;
    ctx.time.now += dt;
    for (const { name, sys } of updateHooks) call(name, sys, 'update', dt);
    ctx.interact.update(dt);
  }

  function simulate(dt) {
    fixed();
    ctx.physics.sync(1);
    update(dt);
  }

  function setFreecam(on) {
    flycam.enabled = Boolean(on) || !real.has('player');
    if (real.has('player')) ctx.player.lock?.(flycam.enabled);
    if (flycam.enabled) {
      flycam.yaw = camera.rotation.y;
      flycam.pitch = camera.rotation.x;
    }
  }

  const spawn = ctx.debug.resolveSpawn(opts.spawn ?? 'hub') || ctx.world.zones.hub.spawn;
  camera.position.set(spawn[0], spawn[1] + 1.68, spawn[2]);
  camera.rotation.set(0, spawn[3] || 0, 0);
  flycam.setPose(spawn[0], spawn[1] + 1.68, spawn[2], spawn[3] || 0, 0);
  setFreecam(Boolean(opts.freecam));

  if (real.has('story')) {
    Promise.resolve()
      .then(() => ctx.story.begin())
      .catch((err) => console.error('[boot] story.begin failed', err));
  } else {
    if (real.has('player')) ctx.player.teleport(spawn[0], spawn[1], spawn[2], spawn[3] || 0);
    ctx.state.setMode('playing');
  }
  if (Number.isFinite(opts.stage)) {
    ctx.env.setStage(ctx.state.stage, { instant: true });
    ctx.events.emit('stage:change', { stage: ctx.state.stage, from: 0, instant: true });
  }

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    ctx.events.emit('resize', { width: w, height: h, pixelRatio: renderer.getPixelRatio() });
  });

  let last = performance.now();
  let acc = 0;
  renderer.setAnimationLoop((t) => {
    const realDt = Math.min(0.1, Math.max(0, (t - last) / 1000));
    last = t;
    renderer.info.reset();
    ctx.input.poll();
    ctx.time.realDt = realDt;
    ctx.time.frame++;
    sharedUniforms.uTime.value += realDt;

    if (SIM_MODES.has(ctx.state.mode)) {
      acc += realDt;
      let n = 0;
      while (acc >= STEP && n < MAX_STEPS) {
        fixed();
        acc -= STEP;
        n++;
      }
      if (n === MAX_STEPS) acc = Math.min(acc, STEP);
      ctx.physics.sync(acc / STEP);
      update(realDt);
    } else {
      ctx.time.dt = 0;
      ctx.interact.update(0);
    }

    flycam.frame(realDt);
    for (const { name, sys } of frameHooks) call(name, sys, 'frame', realDt);
    for (const f of internal) f.frame(realDt);
    sharedUniforms.uPlayerPos.value.copy(real.has('player') && !flycam.enabled ? ctx.player.position : camera.position);

    if (real.has('postfx')) call('postfx', ctx.postfx, 'render', realDt);
    else renderer.render(scene, camera);

    ctx.input.endFrame();
    ctx.quality.sample(realDt);
    ctx.debug.sample(realDt);
    if (!ctx.ready) {
      ctx.ready = true;
      if (!real.has('ui')) loader.hide();
      ctx.events.emit('game:ready', {});
    }
  });

  return ctx;
}
