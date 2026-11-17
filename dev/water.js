import * as THREE from 'three';
import '../src/core/fonts.js';
import { boot } from '../src/boot.js';
import { sharedUniforms } from '../src/core/glsl.js';

const params = new URLSearchParams(location.search);

const dir = (azimuthDeg, elevationDeg) => {
  const a = (azimuthDeg * Math.PI) / 180;
  const e = (elevationDeg * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
};
const col = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

const PRESETS = {
  afternoon: null,
  golden: {
    uSunDir: dir(250, 12), uSunColor: col('#ffc48a', 2.7), uSkyColor: col('#a9b9d4', 0.7), uGroundColor: col('#7a6a4a', 0.4),
    uSkyZenith: col('#4775b5'), uSkyHorizon: col('#f3c79c'), uFogColor: col('#e9c7a3'), uFogSunColor: col('#ffb36b'),
    uFogDensity: 0.0009, uNight: 0,
  },
  sunset: {
    uSunDir: dir(268, 2.5), uSunColor: col('#ff7d3e', 2.1), uSkyColor: col('#8a7a99', 0.5), uGroundColor: col('#5a4040', 0.3),
    uSkyZenith: col('#2c4a86'), uSkyHorizon: col('#ff9a5e'), uFogColor: col('#d88a6c'), uFogSunColor: col('#ff6a30'),
    uFogDensity: 0.001, uNight: 0.1,
  },
  blue: {
    uSunDir: dir(285, 6), uSunColor: col('#8a9ee0', 0.3), uSkyColor: col('#4a5a96', 0.45), uGroundColor: col('#252a40', 0.3),
    uSkyZenith: col('#17255a'), uSkyHorizon: col('#6273ad'), uFogColor: col('#4c5888'), uFogSunColor: col('#8a7ab0'),
    uFogDensity: 0.0009, uNight: 0.55,
  },
  night: {
    uSunDir: dir(150, 35), uSunColor: col('#a8bcff', 0.32), uSkyColor: col('#1d2a5a', 0.3), uGroundColor: col('#0c1020', 0.3),
    uSkyZenith: col('#03081a'), uSkyHorizon: col('#111c40'), uFogColor: col('#0c1430'), uFogSunColor: col('#2a3a70'),
    uFogDensity: 0.0008, uNight: 1,
  },
  dawn: {
    uSunDir: dir(85, 3), uSunColor: col('#ffb38a', 1.9), uSkyColor: col('#8c90b8', 0.5), uGroundColor: col('#4a4050', 0.3),
    uSkyZenith: col('#3a5898'), uSkyHorizon: col('#f6b49c'), uFogColor: col('#d7a9a2'), uFogSunColor: col('#ffbe8c'),
    uFogDensity: 0.0009, uNight: 0.25,
  },
};

const VIEWS = {
  beach: { pos: [-961, 1.68, -6], look: [-985, 0.2, 40] },
  surf: { pos: [-958, 1.68, 6], look: [-990, 0, 4] },
  open: { pos: [-1060, 1.5, -80], look: [-1200, 0, -100] },
  strait: { pos: [-985, 20, 260], look: [-1135, 6, 175] },
  hub: { pos: [-44, 42, 4], look: [-900, 0, 40] },
  aerial: { pos: [700, 1100, 1700], look: [-80, 0, 0] },
  horizon: { pos: [-1000, 2.5, -380], look: [-3000, 2.5, -700] },
  isle: { pos: [-1205, 1.7, 175], look: [-1260, 0, 230] },
  sunroad: { pos: [-150, 2.2, 893], look: [-260, 0, 1200] },
  moon: { pos: [-300, 3, 860], look: [-100, 0, 1200] },
  west: { pos: [-700, 120, 60], look: [-1000, 0, 40] },
};

function harness(ctx) {
  const { scene, physics, mat, world } = ctx;
  const crateMat = mat.standard({ color: '#c98a4b', roughness: 0.75 });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const crates = [];
  for (let i = 0; i < 12; i++) {
    const mesh = new THREE.Mesh(geo, crateMat);
    const s = 0.8 + (i % 3) * 0.25;
    mesh.scale.setScalar(s);
    mesh.position.set(-978 - (i % 4) * 5, 3 + (i % 2), -12 + Math.floor(i / 4) * 9);
    mesh.rotation.set(i, i * 0.7, 0);
    mesh.castShadow = true;
    scene.add(mesh);
    crates.push(physics.addDynamic(mesh, { shape: 'box', size: [s, s, s], density: 300 }));
  }

  const lights = { hemi: null, sun: null };
  scene.traverse((o) => {
    if (o.isHemisphereLight) lights.hemi = o;
    if (o.isDirectionalLight) lights.sun = o;
  });
  const base = Object.fromEntries(Object.entries(sharedUniforms).filter(([, u]) => u.value?.clone).map(([k, u]) => [k, u.value.clone()]));
  base.uFogDensity = sharedUniforms.uFogDensity.value;
  base.uNight = 0;
  let preset = null;

  function applyPreset() {
    const p = preset ? PRESETS[preset] || base : base;
    for (const [k, v] of Object.entries({ ...base, ...p })) {
      const u = sharedUniforms[k];
      if (!u || k === 'uTime' || k === 'uPlayerPos' || k === 'uScan' || k === 'uWind') continue;
      if (typeof v === 'number') u.value = v;
      else u.value.copy(v);
    }
    scene.background?.copy?.(sharedUniforms.uFogColor.value);
    if (lights.hemi) {
      lights.hemi.color.copy(sharedUniforms.uSkyColor.value);
      lights.hemi.groundColor.copy(sharedUniforms.uGroundColor.value);
    }
    if (lights.sun) lights.sun.color.copy(sharedUniforms.uSunColor.value);
  }

  const api = {
    crates,
    presets: Object.keys(PRESETS),
    views: Object.keys(VIEWS),
    view(name) {
      const v = VIEWS[name];
      ctx.debug.freecam(true);
      ctx.debug.flycam.setPose(...v.pos);
      ctx.debug.flycam.lookAt(...v.look);
    },
    preset(name) {
      preset = name;
      if (ctx.has('env')) {
        const stages = { afternoon: 0, golden: 1, sunset: 2, blue: 3, night: 4, dawn: 6 };
        ctx.env.setStage(stages[name] ?? 0, { instant: true });
        preset = null;
      } else applyPreset();
    },
    bob() {
      return crates.map((c) => +(c.position.y - ctx.water.heightAt(c.position.x, c.position.z)).toFixed(2));
    },
  };
  return {
    api,
    frame() {
      if (preset && !ctx.has('env')) applyPreset();
    },
    update() {
      const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
      keys.forEach((k, i) => {
        if (ctx.input.pressed(k) && api.views[i]) api.view(api.views[i]);
      });
      if (ctx.input.pressed('KeyP')) {
        const i = api.presets.indexOf(preset ?? 'afternoon');
        api.preset(api.presets[(i + 1) % api.presets.length]);
      }
    },
  };
}

const extraSystems = params.get('with');
const systems = ['water', ...(extraSystems ? extraSystems.split(',') : [])];
const ctx = await boot({ systems, zones: [], freecam: true, nosave: true, extra: [{ name: 'waterHarness', create: harness }] });
window.__water = ctx.waterHarness.api;
const start = params.get('view') || 'beach';
window.__water.view(start);
if (params.get('preset')) window.__water.preset(params.get('preset'));
