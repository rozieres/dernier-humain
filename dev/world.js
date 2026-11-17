import * as THREE from 'three';
import { boot } from '../src/boot.js';
import { sharedUniforms } from '../src/core/glsl.js';

const params = new URLSearchParams(location.search);
const EYE = 1.68;

const PRESETS = {
  afternoon: {
    stage: 0, sunDir: [-0.52, 0.62, 0.58], sun: ['#fff1dc', 3.2], sky: ['#9cc6ef', 0.85], ground: ['#6d7a52', 0.45],
    zenith: '#3f7fd0', horizon: '#bcd9f2', fog: '#c4d8ea', fogSun: '#ffe2b8', density: 0.00085, night: 0,
  },
  golden: {
    stage: 1, sunDir: [-0.93, 0.16, 0.33], sun: ['#ffb36b', 2.7], sky: ['#8aa6d6', 0.6], ground: ['#6b5a3e', 0.4],
    zenith: '#3c64b0', horizon: '#f2c493', fog: '#e7c39f', fogSun: '#ffb25e', density: 0.0009, night: 0.05,
  },
  dusk: {
    stage: 3, sunDir: [-0.9, 0.06, 0.42], sun: ['#7d86c8', 0.55], sky: ['#41569a', 0.55], ground: ['#2a2b3a', 0.35],
    zenith: '#1d2a5c', horizon: '#c48a8f', fog: '#5b6491', fogSun: '#d58a7a', density: 0.0011, night: 0.55,
  },
  night: {
    stage: 4, sunDir: [0.35, 0.62, -0.45], sun: ['#9db4e8', 0.9], sky: ['#2a3a6e', 0.45], ground: ['#0b0e16', 0.3],
    zenith: '#050a1c', horizon: '#18233f', fog: '#111a2e', fogSun: '#2b3a5e', density: 0.0012, night: 1,
  },
};

function fakeClearings(ctx) {
  const { world } = ctx;
  world.addClearing({ x: 0, z: 0, r: 52, trees: true, grass: false, rocks: true });
  world.addClearing({ x: 0, z: 0, r: 14, trees: true, grass: true, rocks: true });
  world.addClearing({ x: -600, z: -300, r: 18, trees: true, grass: false });
  world.addClearing({ x: -560, z: -380, r: 10, trees: true, grass: false });
  world.addClearing({ x: 640, z: -60, r: 40, trees: true, grass: true });
  world.addClearing({ x: -520, z: 520, r: 24, trees: true, grass: true });
  return {};
}

const ctx = await boot({
  systems: (params.get('only') || 'terrain,vegetation').split(',').filter(Boolean),
  zones: [], nosave: true, freecam: true,
  extra: [{ name: 'worldTestClearings', create: fakeClearings }],
});
const { world, camera, scene } = ctx;
const fly = ctx.debug.flycam;

const ground = (x, z) => Math.max(world.heightAt(x, z), 0);

function pose(x, z, tx, tz, { up = EYE, ty = null, y = null } = {}) {
  const cy = y ?? ground(x, z) + up;
  const targetY = ty ?? ground(tx, tz) + up * 0.6;
  fly.setPose(x, cy, z);
  fly.lookAt(tx, targetY, tz);
}

function closeup(x, z, dir = [0, -1]) {
  const cx = x - dir[0] * 4;
  const cz = z - dir[1] * 4;
  fly.setPose(cx, ground(cx, cz) + EYE, cz);
  fly.lookAt(x, ground(x, z), z);
}

const Z = world.zones;
const centerOf = (id) => Z[id].center;
const VIEWS = {
  hubN: () => pose(0, -36, 0, -600, { ty: 70 }),
  hubE: () => pose(36, 0, 640, -40, { ty: 30 }),
  hubS: () => pose(0, 36, 0, 600, { ty: 25 }),
  hubW: () => pose(-36, 0, -800, 120, { ty: 20 }),
  hubNE: () => pose(28, -28, 470, -430, { ty: 120 }),
  arriveFeed: () => pose(...Z.feed.arrival.filter((_, i) => i !== 1), 0, -640, { ty: 128 }),
  arriveFarm: () => pose(Z.farm.arrival[0], Z.farm.arrival[2], ...centerOf('farm')),
  arriveHallu: () => pose(Z.hallu.arrival[0], Z.hallu.arrival[2], ...centerOf('hallu'), { ty: 40 }),
  arriveOldweb: () => pose(Z.oldweb.arrival[0], Z.oldweb.arrival[2], ...centerOf('oldweb')),
  arriveForest: () => pose(Z.forest.arrival[0], Z.forest.arrival[2], ...centerOf('forest')),
  arriveLighthouse: () => pose(Z.lighthouse.arrival[0], Z.lighthouse.arrival[2], -915, 170, { ty: 20 }),
  pier: () => pose(-900, 170, -1140, 170, { ty: 12 }),
  cuMeadow: () => closeup(150, 80, [0.6, -0.8]),
  cuFeed: () => closeup(40, -580, [0.7, -0.7]),
  cuFarm: () => closeup(660, -40, [0.8, 0.6]),
  cuHallu: () => closeup(330, 470, [0, 1]),
  cuOldweb: () => closeup(-520, 470, [0, 1]),
  cuForest: () => closeup(-640, -320, [0.7, 0.7]),
  cuSand: () => {
    for (let a = 0; a < Math.PI * 2; a += 0.02) {
      for (let d = 1000; d > 760; d -= 2) {
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const h = world.heightAt(x, z);
        if (h > 0.6 && h < 1.4 && world.biomeAt(x, z).sand > 0.8 && world.slopeAt(x, z) < 0.03) {
          const dir = [Math.cos(a), Math.sin(a)];
          return pose(x - dir[0] * 6, z - dir[1] * 6, x + dir[0] * 30, z + dir[1] * 30, { ty: -2 });
        }
      }
    }
    return null;
  },
  cuRock: () => pose(150, -470, 150, -560, { ty: 90 }),
  cuPath: () => {
    const p = world.paths.find((q) => q.to === 'farm').points[30];
    return closeup(p[0], p[1], [1, 0]);
  },
  forestIn: () => pose(-640, -300, -700, -380),
  pitRim: () => pose(4, -603, 0, -676, { y: 126, ty: 40 }),
  meadowWide: () => pose(150, 80, 420, 260, { ty: 20 }),
  meadowLow: () => pose(-200, 160, -260, 260, { up: 1.2, ty: 15 }),
  chasmRim: () => pose(330, 492, 330, 600, { ty: 20 }),
  cache: () => pose(300, -260, 470, -430, { ty: 140 }),
  aerial: () => pose(0, 1150, 0, -40, { y: 1250, ty: 0 }),
  lowAerial: () => pose(160, 260, -60, -240, { y: 160, ty: 40 }),
  grove: () => {
    const g = ctx.vegetation?.groves?.[0];
    if (!g || !ctx.has('vegetation')) return pose(60, 60, 200, 200);
    const d = 34;
    const back = [g.x - g.dir[0] * d - g.dir[1] * 14, g.z - g.dir[1] * d + g.dir[0] * 14];
    return pose(back[0], back[1], g.x, g.z, { ty: ground(g.x, g.z) + 5 });
  },
};

const sunLight = scene.children.find((o) => o.isDirectionalLight);
const hemiLight = scene.children.find((o) => o.isHemisphereLight);

function setPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  if (ctx.has('env')) {
    ctx.debug.setStage(p.stage);
    current.preset = name;
    return;
  }
  const u = sharedUniforms;
  u.uSunDir.value.set(...p.sunDir).normalize();
  u.uSunColor.value.set(p.sun[0]).multiplyScalar(p.sun[1]);
  u.uSkyColor.value.set(p.sky[0]).multiplyScalar(p.sky[1]);
  u.uGroundColor.value.set(p.ground[0]).multiplyScalar(p.ground[1]);
  u.uSkyZenith.value.set(p.zenith);
  u.uSkyHorizon.value.set(p.horizon);
  u.uFogColor.value.set(p.fog);
  u.uFogSunColor.value.set(p.fogSun);
  u.uFogDensity.value = p.density;
  u.uNight.value = p.night;
  if (sunLight) sunLight.color.copy(u.uSunColor.value);
  if (hemiLight) {
    hemiLight.color.copy(u.uSkyColor.value);
    hemiLight.groundColor.copy(u.uGroundColor.value);
  }
  if (scene.background?.isColor && !current.crack) scene.background.copy(u.uFogColor.value);
  current.preset = name;
}

const current = { view: null, preset: 'afternoon' };
function setView(name) {
  if (!VIEWS[name]) return false;
  VIEWS[name]();
  current.view = name;
  return true;
}

const viewNames = Object.keys(VIEWS);
const presetNames = Object.keys(PRESETS);
window.addEventListener('keydown', (e) => {
  if (e.code === 'BracketRight' || e.code === 'PageDown') setView(viewNames[(viewNames.indexOf(current.view) + 1) % viewNames.length]);
  if (e.code === 'BracketLeft' || e.code === 'PageUp') setView(viewNames[(viewNames.indexOf(current.view) - 1 + viewNames.length) % viewNames.length]);
  if (e.code === 'KeyL') setPreset(presetNames[(presetNames.indexOf(current.preset) + 1) % presetNames.length]);
  const digit = /^Digit([1-4])$/.exec(e.code);
  if (digit) setPreset(presetNames[Number(digit[1]) - 1]);
});

const hud = document.getElementById('hud');
if (params.get('clean') === '1') document.body.classList.add('clean');
const pos = new THREE.Vector3();
setInterval(() => {
  const s = ctx.debug.stats();
  camera.getWorldPosition(pos);
  hud.textContent = `${s.fps} fps · ${s.calls} draws · ${(s.triangles / 1000).toFixed(0)}k tris\n`
    + `${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)} · ${current.view || '—'} · ${current.preset}\n`
    + '[ ] views · L / 1-4 lighting · WASD + drag';
}, 250);

setPreset(params.get('preset') || 'afternoon');
setView(params.get('view') || 'hubN');

function measure(frames = 120) {
  return new Promise((resolve) => {
    const times = [];
    let last = performance.now();
    const tick = (t) => {
      times.push(t - last);
      last = t;
      if (times.length < frames) requestAnimationFrame(tick);
      else {
        times.sort((a, b) => a - b);
        const s = ctx.debug.stats();
        resolve({ medianMs: times[Math.floor(frames / 2)], p95Ms: times[Math.floor(frames * 0.95)], calls: s.calls, triangles: s.triangles });
      }
    };
    requestAnimationFrame(tick);
  });
}

function gpuTime(frames = 60) {
  const gl = ctx.renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return Promise.resolve(null);
  const results = [];
  return new Promise((resolve) => {
    let n = 0;
    const pending = [];
    const loop = () => {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      ctx.renderer.render(scene, camera);
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(q);
      for (let i = pending.length - 1; i >= 0; i--) {
        const pq = pending[i];
        if (gl.getQueryParameter(pq, gl.QUERY_RESULT_AVAILABLE)) {
          results.push(gl.getQueryParameter(pq, gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(pq);
          pending.splice(i, 1);
        }
      }
      n++;
      if (n < frames || (pending.length && n < frames * 4)) requestAnimationFrame(loop);
      else {
        results.sort((a, b) => a - b);
        resolve({ gpuMedianMs: results[Math.floor(results.length / 2)] ?? null, samples: results.length });
      }
    };
    requestAnimationFrame(loop);
  });
}

function benchmark(frames = 40) {
  const { renderer } = ctx;
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  renderer.render(scene, camera);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  renderer.info.reset();
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) renderer.render(scene, camera);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const info = renderer.info.render;
  return { msPerFrame: (performance.now() - t0) / frames, size: [renderer.domElement.width, renderer.domElement.height], calls: info.calls / frames, triangles: info.triangles / frames };
}

function breakdown() {
  const { renderer } = ctx;
  const groups = {
    terrain: ctx.terrain.mesh,
    grass: ctx.vegetation.grass ? { set visible(v) { ctx.vegetation.grass.rings.forEach((m) => { m.visible = v; }); } } : null,
    trees: ctx.vegetation.group,
  };
  const out = {};
  const all = Object.entries(groups).filter(([, g]) => g);
  for (const [name] of all) {
    for (const [other, g] of all) g.visible = other === name;
    renderer.info.reset();
    renderer.render(scene, camera);
    out[name] = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  }
  for (const [, g] of all) g.visible = true;
  return out;
}

function crackMode() {
  for (const o of scene.children) if (/fallback:(sky|sea)/.test(o.name)) o.visible = false;
  scene.background = new THREE.Color('#ff00ff');
  current.crack = true;
  ctx.vegetation.group && (ctx.vegetation.group.visible = false);
  ctx.vegetation.grass?.rings.forEach((m) => { m.visible = false; });
}

window.__world = { benchmark, breakdown, crackMode, ctx, setView, setPreset, views: viewNames, presets: presetNames, measure, gpuTime, current };
