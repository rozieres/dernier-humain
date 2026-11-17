import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import '../src/core/fonts.js';
import { boot } from '../src/boot.js';
import { sharedUniforms } from '../src/core/glsl.js';
import { createFallbackEnv } from '../src/core/fallback.js';
import { BEACON_ZONES } from '../src/core/state.js';
import { lineIndex } from '../src/entities/actors/speech.js';

const params = new URLSearchParams(location.search);
const bare = params.has('bare');
const scenario = params.get('case') || 'scene';

const NIGHT = {
  uNight: 1,
  uSunDir: new THREE.Vector3(0.35, 0.55, -0.6).normalize(),
  uSunColor: new THREE.Color('#9fb4ff').multiplyScalar(0.22),
  uSkyColor: new THREE.Color('#1c2a4a').multiplyScalar(0.35),
  uGroundColor: new THREE.Color('#141a22').multiplyScalar(0.3),
  uSkyZenith: new THREE.Color('#040814'),
  uSkyHorizon: new THREE.Color('#0d1830'),
  uFogColor: new THREE.Color('#0b1426'),
  uFogSunColor: new THREE.Color('#1d2c4a'),
  uFogDensity: 0.0011,
};
const DAY = Object.fromEntries(Object.keys(NIGHT).map((k) => {
  const v = sharedUniforms[k].value;
  return [k, typeof v === 'number' ? v : v.clone()];
}));

function envShim(ctx) {
  const fb = createFallbackEnv(ctx);
  const pool = [];
  for (let i = 0; i < 6; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 1, 2);
    ctx.scene.add(l);
    pool.push(l);
  }
  const handles = new Set();
  const cam = new THREE.Vector3();
  return {
    sun: fb.sun,
    hemi: fb.hemi,
    get night() {
      return sharedUniforms.uNight.value;
    },
    lights: {
      add({ position, color, intensity = 1, distance = 8 }) {
        const h = {
          position: new THREE.Vector3().copy(position), color: new THREE.Color(color), intensity, distance, enabled: true,
          remove: () => handles.delete(h),
        };
        handles.add(h);
        return h;
      },
    },
    frame(dt) {
      fb.frame(dt);
      ctx.camera.getWorldPosition(cam);
      const sorted = [...handles].filter((h) => h.enabled && h.intensity > 0)
        .sort((a, b) => a.position.distanceToSquared(cam) - b.position.distanceToSquared(cam));
      pool.forEach((l, i) => {
        const h = sorted[i];
        l.intensity = h ? h.intensity * 3 : 0;
        if (!h) return;
        l.position.copy(h.position);
        l.color.copy(h.color);
        l.distance = h.distance;
      });
    },
  };
}

function postfxShim(ctx) {
  const { renderer, scene, camera } = ctx;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.55, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  ctx.events.on('resize', ({ width, height }) => composer.setSize(width, height));
  const bar = (top) => {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;left:0;right:0;${top ? 'top' : 'bottom'}:0;height:0;background:#000;z-index:5;pointer-events:none;transition:height 0.6s ease`;
    document.body.appendChild(el);
    return el;
  };
  const bars = [bar(true), bar(false)];
  const flashEl = document.createElement('div');
  flashEl.style.cssText = 'position:fixed;inset:0;opacity:0;pointer-events:none;z-index:4;mix-blend-mode:screen';
  document.body.appendChild(flashEl);
  return {
    render() {
      composer.render();
    },
    setLetterbox(amount, duration = 0.6) {
      for (const b of bars) {
        b.style.transitionDuration = `${duration}s`;
        b.style.height = `${amount * 10.5}vh`;
      }
    },
    flash(color, duration = 0.4) {
      flashEl.style.transition = 'none';
      flashEl.style.background = color;
      flashEl.style.opacity = '0.75';
      requestAnimationFrame(() => {
        flashEl.style.transition = `opacity ${duration}s ease-out`;
        flashEl.style.opacity = '0';
      });
    },
  };
}

const TRACE_SPOTS = {
  hub_welcome: [-2.6, 3],
  feed_reply: [6, -3],
  farm_recipe: [-9, -9],
  hallu_edit: [14, 6],
  oldweb_guestbook: [-16, 10],
  forest_lullaby: [3.5, -12],
};
const BEACON_SPOTS = { feed: [-11, -24, 0.35], farm: [0, -30, 0], hallu: [11, -24, -0.35] };

function setup(ctx) {
  const { world, state } = ctx;
  const ground = (x, z) => world.heightAt(x, z);
  const traceHandles = {};

  if (scenario === 'budget') {
    const r = ctx.rng.seeded('budget');
    Object.keys(ctx.texts.TRACES).forEach((id, i) => {
      const a = (i / 18) * Math.PI * 2;
      const d = 20 + r() * 260;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      traceHandles[id] = ctx.traces.add({ id, position: [x, ground(x, z), z] });
    });
    BEACON_ZONES.forEach((zone) => {
      state.setBeacon(zone, 'active');
      const c = world.zones[zone].center;
      ctx.beacons.create(zone, { position: [c[0], ground(c[0], c[1]), c[1]] });
    });
  } else {
    state.addTrace('forest_lullaby');
    state.setBeacon('farm', 'ready');
    state.setBeacon('hallu', 'active');
    for (const [id, [x, z]] of Object.entries(TRACE_SPOTS)) traceHandles[id] = ctx.traces.add({ id, position: [x, ground(x, z), z] });
    for (const [zone, [x, z, rot]] of Object.entries(BEACON_SPOTS)) ctx.beacons.create(zone, { position: [x, ground(x, z), z], rotationY: rot });
  }

  const fly = ctx.debug.flycam;
  const lights = [];
  ctx.scene.traverse((o) => {
    if (o.isHemisphereLight || o.isDirectionalLight) lights.push({ o, intensity: o.intensity, color: o.color.clone() });
  });

  function setNight(on) {
    for (const [k, v] of Object.entries(on ? NIGHT : DAY)) {
      const u = sharedUniforms[k];
      if (typeof v === 'number') u.value = v;
      else u.value.copy(v);
    }
    if (!on) sharedUniforms.uNight.value = 0;
    if (ctx.scene.background?.isColor) ctx.scene.background.copy(sharedUniforms.uFogColor.value);
    for (const l of lights) {
      if (l.o.isHemisphereLight) {
        l.o.intensity = on ? 0.5 : l.intensity;
        l.o.color.copy(on ? sharedUniforms.uSkyColor.value : l.color);
        l.o.groundColor.copy(sharedUniforms.uGroundColor.value);
      } else {
        l.o.intensity = on ? 1 : l.intensity;
        l.o.color.copy(on ? sharedUniforms.uSunColor.value : l.color);
      }
    }
  }

  function pose(x, y, z, tx, ty, tz) {
    fly.setPose(x, y, z);
    fly.lookAt(tx, ty, tz);
  }

  const tiretKeys = Object.keys(ctx.texts.TIRET);
  let keyIndex = 0;
  const modes = ['follow', 'stay', 'hidden'];
  let modeIndex = 0;
  let dim = 0;
  let night = false;
  const emotes = ['nod', 'shake', 'shy', 'spin'];
  let emoteIndex = 0;
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyT') ctx.companion.say(tiretKeys[keyIndex++ % tiretKeys.length]);
    if (e.code === 'KeyY') ctx.companion.say(tiretKeys[keyIndex++ % tiretKeys.length], { priority: 3, interrupt: true });
    if (e.code === 'KeyM') {
      modeIndex = (modeIndex + 1) % modes.length;
      ctx.companion.setMode(modes[modeIndex], ctx.camera.position.clone().add(new THREE.Vector3(0, -0.3, -2)));
    }
    if (e.code === 'KeyB') ctx.companion.setDim((dim = dim ? 0 : 1));
    if (e.code === 'KeyN') setNight((night = !night));
    if (e.code === 'KeyJ') ctx.companion.emote(emotes[emoteIndex++ % emotes.length]);
    if (e.code === 'KeyG') {
      const zone = BEACON_ZONES.find((z) => ctx.beacons.get(z) && state.beacons[z] === 'ready');
      if (zone) ctx.beacons.activate(zone);
    }
    if (e.code === 'KeyH') {
      const zone = BEACON_ZONES.find((z) => ctx.beacons.get(z) && state.beacons[z] === 'locked');
      if (zone) ctx.beacons.setReady(zone);
    }
    if (e.code === 'KeyK') {
      const id = Object.keys(traceHandles).find((i) => !traceHandles[i].found);
      if (id) ctx.traces.markFound(id);
    }
  });

  const frames = (n = 2) => new Promise((resolve) => {
    const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });
  const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
  const isMine = (o) => /^(tiret|traces:|beacons:)/.test(o.name);

  async function drawCalls() {
    await frames(3);
    const all = { ...ctx.renderer.info.render };
    const mine = ctx.scene.children.filter(isMine);
    mine.forEach((o) => (o.visible = false));
    await frames(3);
    const without = { ...ctx.renderer.info.render };
    mine.forEach((o) => (o.visible = true));
    await frames(2);
    return { calls: all.calls - without.calls, triangles: all.triangles - without.triangles, total: all.calls };
  }

  async function closeReader() {
    await frames(2);
    const btn = document.querySelector('.reader:not(.is-leaving) .reader-actions .btn--ghost');
    if (btn) btn.click();
    await frames(2);
    return Boolean(btn);
  }

  async function selfTest() {
    const results = [];
    const check = (name, ok, info) => results.push({ name, ok: Boolean(ok), info });
    const C = ctx.companion;
    const T = ctx.texts.TIRET;
    const seen = [];
    const off = ['trace:found', 'beacon:activated', 'beacon:ready'].map((type) => ctx.events.on(type, (p) => seen.push({ type, ...p })));
    let saves = 0;
    const realSave = state.save;
    state.save = () => {
      saves++;
      return realSave.call(state);
    };
    const flagCount = (k) => Number(state.flag(`story.tiret.${k}`)) || 0;

    check('lineIndex rotation', [0, 1, 2, 3, 1, 2, 3].every((v, i) => lineIndex(i, 4) === v)
      && [0, 1, 0, 1].every((v, i) => lineIndex(i, 2) === v) && lineIndex(5, 1) === 0);

    C.silence();
    state.setFlag('story.tiret.intro.hello', 0);
    let prio = 10;
    C.say('intro.hello', { priority: prio++ });
    await frames(1);
    check('first line is index 0', C.speaking === T['intro.hello'][0], C.speaking);
    check('count persisted in flag', flagCount('intro.hello') === 1);
    C.say('intro.hello', { priority: prio++ });
    check('second time index 1', C.speaking === T['intro.hello'][1], C.speaking);
    C.say('intro.hello', { priority: prio++ });
    check('third time index 2', C.speaking === T['intro.hello'][2]);
    C.say('intro.hello', { priority: prio++ });
    check('fourth time index 1 (no index 0, no immediate repeat)', C.speaking === T['intro.hello'][1]);

    const hiLine = C.speaking;
    const low = C.say('intro.goal', { priority: 0 });
    check('lower priority queues', C.speaking === hiLine && C.queueLength === 1);
    const same = C.say('intro.scan', { priority: prio - 1 });
    check('equal priority queues ahead of lower', C.speaking === hiLine && C.queueLength === 2);
    C.say('Ligne urgente.', { priority: prio + 5 });
    check('higher priority interrupts', C.speaking === 'Ligne urgente.');
    C.silence();
    check('silence clears queue', C.speaking === null && C.queueLength === 0 && (await low) === false && (await same) === false);

    state.setMode('reading');
    const blocked = C.say('Pendant la lecture.');
    await frames(3);
    check('nothing said while reading', C.speaking === null && C.queueLength === 1);
    state.setMode('playing');
    await frames(2);
    check('queue resumes after reading', C.speaking === 'Pendant la lecture.');
    C.silence();
    await blocked;

    state.setMode('paused');
    const stale = C.say('Vieille ligne.', { priority: 0 });
    const important = C.say('Ligne importante.', { priority: 1 });
    await sleep(8.4);
    state.setMode('playing');
    await frames(2);
    check('priority line survives the wait', C.speaking === 'Ligne importante.');
    C.silence();
    await important;
    await frames(2);
    check('stale low-priority line dropped (> 8 s)', (await stale) === false && C.speaking === null);

    state.setSetting('subtitles', false);
    const subsBefore = document.querySelectorAll('.subtitle').length;
    C.say('Sans sous-titres.', { priority: 50 });
    await frames(2);
    check('subtitles off: no subtitle, line still runs', document.querySelectorAll('.subtitle').length === subsBefore && C.speaking === 'Sans sous-titres.');
    state.setSetting('subtitles', true);
    C.silence();
    C.say('Avec sous-titres.', { priority: 50 });
    await frames(2);
    check('subtitle shown with speaker Tiret', [...document.querySelectorAll('.subtitle')].some((el) => /Tiret/.test(el.textContent) && /Avec sous-titres/.test(el.textContent)));
    C.silence();

    const bark = async (emit, expectKey, label) => {
      C.silence();
      await frames(1);
      emit();
      await frames(2);
      const ok = expectKey ? T[expectKey].includes(C.speaking) : C.speaking === null;
      check(label, ok, C.speaking);
    };
    await bark(() => ctx.events.emit('player:respawn', { reason: 'water' }), 'sea.drown', 'respawn water → sea.drown');
    await bark(() => ctx.events.emit('player:respawn', { reason: 'fall' }), 'fall', 'respawn fall → fall');
    await bark(() => ctx.events.emit('link:ride:start', { id: 'feed' }), 'link.first', 'first link ride → link.first');
    ctx.events.emit('link:ride:end', { id: 'feed' });
    await bark(() => {
      ctx.events.emit('scan:start', {});
      ctx.events.emit('scan:end', {});
    }, 'scan.nothing', 'empty scan → scan.nothing');
    await bark(() => {
      ctx.events.emit('scan:start', {});
      ctx.events.emit('scan:end', {});
    }, null, 'second empty scan within 90 s → silent');
    for (let i = 0; i < 4; i++) {
      await bark(() => {
        ctx.events.emit('scan:start', {});
        ctx.events.emit('scan:hit', { kind: 'human', distance: 10 });
        ctx.events.emit('scan:end', {});
      }, i < 3 ? 'scan.human' : null, `human scan #${i + 1} → ${i < 3 ? 'scan.human' : 'silent'}`);
    }
    C.silence();

    const id = 'hub_welcome';
    const handle = traceHandles[id];
    const before = state.traces.size;
    handle.read();
    await frames(3);
    check('trace read opens reader', state.mode === 'reading' && Boolean(document.querySelector('.reader')));
    await closeReader();
    await frames(2);
    const ev = seen.find((e) => e.type === 'trace:found' && e.id === id);
    check('trace found on first close', state.traces.has(id) && handle.found && ev && ev.found === before + 1 && ev.total === 18, ev);
    check('toast "Trace humaine n/18"', [...document.querySelectorAll('.toast')].some((el) => el.textContent.includes(`Trace humaine ${before + 1}/18`)));
    check('trace.first said for the first trace', ev?.found === 1 ? T['trace.first'].includes(C.speaking) : true, C.speaking);
    C.silence();
    handle.read();
    await frames(3);
    await closeReader();
    check('second read: no second event', seen.filter((e) => e.type === 'trace:found' && e.id === id).length === 1 && state.mode === 'playing');
    check('traces.total / found', ctx.traces.total === 18 && ctx.traces.found === state.traces.size);

    check('setReady ignored unless locked', ctx.beacons.setReady('hallu') === false && state.beacons.hallu === 'active');

    const feed = ctx.beacons.get('feed');
    fly.setPose(feed.position.x, feed.position.y + 1.6, feed.position.z + 2.2);
    fly.lookAt(feed.position.x, feed.position.y + 1.4, feed.position.z);
    await frames(3);
    C.silence();
    await ctx.debug.press('KeyE', 60);
    await frames(2);
    check('locked beacon interact → Tiret says first hint', C.speaking === ctx.texts.HINTS.feed[0], C.speaking);
    C.silence();

    const zone = 'farm';
    const t0 = performance.now();
    const run = ctx.beacons.activate(zone);
    await frames(1);
    check('activation: state active at once', state.beacons[zone] === 'active');
    check('activation: mode cinematic', state.mode === 'cinematic');
    await new Promise((resolve) => {
      const offA = ctx.events.on('beacon:activated', () => {
        offA();
        resolve();
      });
    });
    const act = seen.find((e) => e.type === 'beacon:activated');
    check('beacon:activated {zone, count}', act && act.zone === zone && act.count === BEACON_ZONES.filter((z) => state.beacons[z] === 'active').length, act);
    check('still cinematic at the event (wide shot held)', state.mode === 'cinematic');
    while (state.mode !== 'reading') await frames(1);
    const elapsed = (performance.now() - t0) / 1000;
    check('sequence ≈ 9 s then reader', elapsed > 8.2 && elapsed < 10.5, elapsed.toFixed(2));
    const readerText = document.querySelector('.reader')?.textContent || '';
    check('reader shows the beacon document', readerText.includes(ctx.texts.BEACON_DOCS[zone].body[0].slice(0, 30)));
    const savesBefore = saves;
    await closeReader();
    await run;
    check('state.save after reader closes', saves === savesBefore + 1 && state.mode === 'playing');
    check('beacon status active after sequence', ctx.beacons.get(zone).status === 'active');

    const readyEvents = seen.filter((e) => e.type === 'beacon:ready').length;
    check('setReady on locked emits beacon:ready', ctx.beacons.setReady('feed') === true && state.beacons.feed === 'ready'
      && seen.filter((e) => e.type === 'beacon:ready').length === readyEvents + 1);

    off.forEach((f) => f());
    state.save = realSave;
    return { pass: results.every((r) => r.ok), failed: results.filter((r) => !r.ok), count: results.length, results };
  }

  window.__actors = { setNight, pose, traceHandles, drawCalls, selfTest, closeReader, frames, sleep };
  return {};
}

const options = {
  systems: ['audio', 'ui', 'companion', 'traces', 'beacons'],
  zones: [],
  nosave: true,
  extra: [
    ...(bare ? [] : [{ name: 'env', create: envShim }, { name: 'postfx', create: postfxShim }]),
    { name: 'actorsDev', create: setup },
  ],
};
await boot(options);
