import * as THREE from 'three';
import '../src/core/fonts.js';
import { boot } from '../src/boot.js';
import { sharedUniforms } from '../src/core/glsl.js';

const params = new URLSearchParams(location.search);
const integration = params.get('integration');

const TIMES = {
  day: { el: 38, sun: ['#fff1dc', 3.2], sky: ['#9cc6ef', 0.85], ground: ['#6d7a52', 0.45], fog: '#c4d8ea', fogSun: '#ffe2b8', night: 0, density: 0.00085, grade: 'day' },
  golden: { el: 9, sun: ['#ffc074', 2.7], sky: ['#8eaad4', 0.55], ground: ['#6a5a40', 0.35], fog: '#e2bf98', fogSun: '#ffb466', night: 0, density: 0.0011, grade: 'golden' },
  dusk: { el: 2, sun: ['#ff8248', 1.5], sky: ['#5b6fa6', 0.32], ground: ['#40364a', 0.22], fog: '#b98377', fogSun: '#ff7a44', night: 0.25, density: 0.0012, grade: 'sunset' },
  night: { el: 42, sun: ['#a9bcff', 0.32], sky: ['#26375c', 0.22], ground: ['#1a1f2c', 0.12], fog: '#141d30', fogSun: '#2b3a5c', night: 1, density: 0.0011, grade: 'night' },
};

function testSet(ctx) {
  const { scene, mat, world, particles } = ctx;
  const hubY = world.zones.hub.y;
  const group = new THREE.Group();
  group.name = 'fx:test';
  scene.add(group);

  const ball = new THREE.SphereGeometry(0.35, 32, 16);
  const colors = ['#5ce1e6', '#ff5fa2', '#ffb454', '#f4f6fb'];
  [1, 2, 4, 8].forEach((intensity, ix) => {
    colors.forEach((c, iy) => {
      const m = new THREE.Mesh(ball, mat.glow(c, intensity));
      m.position.set(-4.5 + ix * 3, hubY + 0.6 + iy * 1.1, -7);
      group.add(m);
    });
  });
  const firefly = new THREE.SphereGeometry(0.03, 8, 6);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(firefly, mat.glow(i % 2 ? '#ffb454' : '#5ce1e6', 8));
    m.position.set(-6 + i * 0.9, hubY + 4.6 + Math.sin(i) * 0.3, -9);
    group.add(m);
  }

  const crateMat = mat.standard({ color: '#9a6b3f', roughness: 0.8 });
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(crateGeo, crateMat);
    const s = 0.8 + (i % 3) * 0.2;
    m.scale.setScalar(s);
    m.position.set(-9 + i * 3, hubY + s / 2, -2.5);
    m.rotation.y = i * 0.4;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  const poleMat = mat.standard({ color: '#3a3f47', roughness: 0.6, metalness: 0.4 });
  const cableMat = mat.standard({ color: '#15171a', roughness: 0.5 });
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 7, 10).translate(0, 3.5, 0);
  for (const x of [-14, 14]) {
    const p = new THREE.Mesh(poleGeo, poleMat);
    p.position.set(x, hubY, -13);
    p.castShadow = true;
    group.add(p);
  }
  for (let k = 0; k < 5; k++) {
    const y = hubY + 6.6 - k * 0.35;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-14, y, -13), new THREE.Vector3(0, y - 1.8 - k * 0.2, -13 + k * 0.15), new THREE.Vector3(14, y, -13),
    );
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.012 + k * 0.004, 5), cableMat);
    group.add(m);
  }

  const emitters = particles.SHAPES.map((shape, i) => {
    const base = { shape, position: new THREE.Vector3(-12.5 + i * 5, hubY + 0.8, -18), rate: 14, radius: 0.4 };
    const extra = {
      dot: { color: '#5ce1e6', intensity: 3, speed: [0.3, 1], gravity: 0.6, size: [0.06, 0.14], life: [1.5, 2.5] },
      spark: { color: '#ffd28a', intensity: 6, speed: [4, 8], direction: [0, 1, 0], spread: 0.5, gravity: -9, drag: 0.4, size: [0.03, 0.05], life: [0.5, 1], rate: 30 },
      glyph: { color: '#ffb454', intensity: 2.2, speed: [0.2, 0.5], direction: [0, 1, 0], spread: 0.4, gravity: 0.35, drag: 0.8, size: [0.16, 0.26], life: [3, 4.5], rate: 6 },
      leaf: { color: '#8aa83f', color2: '#c58a2e', speed: [0.5, 1.5], gravity: -0.6, drag: 1.5, size: [0.14, 0.22], life: [3, 5], rate: 6 },
      paper: { color: '#f3e9d2', speed: [0.5, 1.5], gravity: -0.4, drag: 1.6, size: [0.2, 0.3], life: [3, 5], rate: 4 },
      ember: { color: '#ffb454', intensity: 4, speed: [0.4, 1.2], direction: [0, 1, 0], spread: 0.5, gravity: 1.2, drag: 0.9, size: [0.04, 0.08], life: [1.5, 3], rate: 20 },
    }[shape];
    return particles.emitter({ ...base, ...extra });
  });

  let coast = null;
  for (let a = 0; a < 360; a += 6) {
    const dx = Math.sin(THREE.MathUtils.degToRad(a));
    const dz = Math.cos(THREE.MathUtils.degToRad(a));
    for (let r = 500; r < 1250; r += 2) {
      if (world.heightAt(dx * r, dz * r) < -0.5) {
        const inland = world.heightAt(dx * (r - 40), dz * (r - 40));
        if (inland > 0.5 && (!coast || inland < coast.inland)) coast = { x: dx * r, z: dz * r, dx, dz, inland };
        break;
      }
    }
  }
  if (coast) {
    const px = -coast.dz;
    const pz = coast.dx;
    for (let i = 0; i < 6; i++) {
      const along = -10 + i * 4;
      const back = 10 + (i % 2) * 4;
      const x = coast.x - coast.dx * back + px * along;
      const z = coast.z - coast.dz * back + pz * along;
      const m = new THREE.Mesh(crateGeo, crateMat);
      m.scale.setScalar(1.4);
      m.position.set(x, Math.max(world.heightAt(x, z), 0) + 0.7, z);
      m.castShadow = true;
      group.add(m);
    }
    const buoy = new THREE.Mesh(ball, mat.glow('#ff5fa2', 3));
    buoy.position.set(coast.x + coast.dx * 25, 0.5, coast.z + coast.dz * 25);
    group.add(buoy);
  }
  return { group, emitters, coast };
}

const options = { nosave: true, freecam: true };
if (!integration) options.systems = params.has('nopost') ? ['particles'] : ['particles', 'postfx'];
else options.systems = ['env', 'terrain', 'water', 'vegetation', 'particles', 'postfx', 'player', 'scanner'];
options.extra = [{ name: 'fxTest', create: testSet }];
const ctx = await boot(options);
const { camera, postfx, particles, world, scene, debug, quality, state } = ctx;
const hubY = world.zones.hub.y;
const test = ctx.fxTest;

let hemi = null;
let sunLight = null;
scene.traverse((o) => {
  if (o.isHemisphereLight) hemi = o;
  if (o.isDirectionalLight && !sunLight) sunLight = o;
});

let azimuth = 200;
function sunDir(az, el, target) {
  const a = THREE.MathUtils.degToRad(az);
  const e = THREE.MathUtils.degToRad(el);
  return target.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

function setTime(name, { az = azimuth, el, duration = 0 } = {}) {
  const t = TIMES[name];
  azimuth = az;
  if (!ctx.has('env')) {
    const u = sharedUniforms;
    sunDir(az, el ?? t.el, u.uSunDir.value);
    u.uSunColor.value.set(t.sun[0]).multiplyScalar(t.sun[1]);
    u.uSkyColor.value.set(t.sky[0]).multiplyScalar(t.sky[1]);
    u.uGroundColor.value.set(t.ground[0]).multiplyScalar(t.ground[1]);
    u.uFogColor.value.set(t.fog);
    u.uFogSunColor.value.set(t.fogSun);
    u.uNight.value = t.night;
    u.uFogDensity.value = t.density;
    if (scene.background?.isColor) scene.background.copy(u.uFogColor.value);
    if (hemi) {
      hemi.color.copy(u.uSkyColor.value);
      hemi.groundColor.copy(u.uGroundColor.value);
    }
    if (sunLight) sunLight.color.copy(u.uSunColor.value);
  }
  postfx.setGrade(t.grade, duration);
}

const VIEWS = {
  hub: () => debug.flycam.setPose(0, hubY + 2.2, 9, 0, -0.06),
  wide: () => debug.flycam.setPose(0, hubY + 14, 48, 0, -0.2),
  mesa: () => debug.flycam.setPose(0, 52, -170, 0, 0.1),
  coast: () => {
    const c = test.coast;
    const x = c.x - c.dx * 45 - c.dz * 20;
    const z = c.z - c.dz * 45 + c.dx * 20;
    debug.flycam.setPose(x, Math.max(world.heightAt(x, z), 0) + 7, z, 0, 0);
    debug.flycam.lookAt(c.x + c.dx * 10, 0, c.z + c.dz * 10);
  },
};

function scanHere(opts) {
  const p = camera.position;
  const ground = Math.max(world.heightAt(p.x, p.z), world.SEA_LEVEL);
  postfx.scanPulse(new THREE.Vector3(p.x, Math.min(p.y - 1.68, ground + 0.1), p.z), opts);
}

const toggles = { warp: 0, speed: 0, letterbox: 0, fade: 0, glitchBase: 0 };
function burst(shape) {
  const fwd = camera.getWorldDirection(new THREE.Vector3());
  const at = camera.position.clone().addScaledVector(fwd, 6);
  const o = {
    dot: { color: '#5ce1e6', intensity: 4, count: 80, speed: [1, 4], gravity: -1, size: [0.05, 0.12] },
    spark: { color: '#ffd28a', intensity: 8, count: 120, speed: [5, 12], gravity: -9.8, drag: 0.6, size: [0.03, 0.05], life: [0.4, 1] },
    glyph: { color: '#ffb454', intensity: 2.5, count: 40, speed: [0.3, 1.2], direction: [0, 1, 0], spread: 0.8, gravity: 0.4, drag: 1, size: [0.18, 0.3], life: [2, 3.5] },
    leaf: { color: '#7f9a3a', color2: '#c58a2e', count: 50, speed: [1, 3], gravity: -1.2, drag: 1.4, size: [0.14, 0.24], life: [2.5, 4] },
    paper: { color: '#f3e9d2', count: 40, speed: [1, 3], gravity: -0.8, drag: 1.5, size: [0.22, 0.34], life: [2.5, 4] },
    ember: { color: '#ffb454', intensity: 5, count: 90, speed: [0.5, 2.5], direction: [0, 1, 0], spread: 0.7, gravity: 1.5, drag: 0.8, size: [0.04, 0.09], life: [1, 2.5] },
  }[shape];
  particles.burst({ shape, position: at, ...o });
}

const ACTIONS = {
  scan: () => scanHere(),
  glitch: () => postfx.glitch(0.8, 0.45),
  glitchBase: () => postfx.setGlitchBase((toggles.glitchBase = toggles.glitchBase ? 0 : 0.25)),
  warp: () => postfx.setWarp((toggles.warp = toggles.warp ? 0 : 1)),
  speed: () => postfx.setSpeed((toggles.speed = toggles.speed ? 0 : 1)),
  letterbox: () => postfx.setLetterbox((toggles.letterbox = toggles.letterbox ? 0 : 1), 0.8),
  fade: () => postfx.fade((toggles.fade = toggles.fade ? 0 : 1), 1.2, '#000'),
  flash: () => postfx.flash('#ffffff', 0.5),
  reduceFx: () => state.setSetting('reduceFx', !state.settings.reduceFx),
  ...Object.fromEntries(Object.keys(TIMES).map((k) => [k, () => setTime(k, { duration: 2 })])),
  ...Object.fromEntries(Object.keys(VIEWS).map((k) => [`view:${k}`, VIEWS[k]])),
  ...Object.fromEntries(particles.SHAPES.map((s) => [`burst:${s}`, () => burst(s)])),
  ...Object.fromEntries(['low', 'medium', 'high', 'ultra'].map((t) => [`tier:${t}`, () => quality.setTier(t)])),
};
const KEYS = {
  Digit1: 'day', Digit2: 'golden', Digit3: 'dusk', Digit4: 'night', KeyF: 'scan', KeyG: 'glitch', KeyH: 'warp', KeyJ: 'speed',
  KeyL: 'letterbox', KeyK: 'fade', KeyX: 'flash', KeyV: 'view:hub', KeyB: 'view:mesa', KeyN: 'view:coast',
};
window.addEventListener('keydown', (e) => {
  if (ACTIONS[KEYS[e.code]]) ACTIONS[KEYS[e.code]]();
});

const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;top:8px;right:8px;z-index:20;display:flex;flex-wrap:wrap;gap:4px;max-width:420px;justify-content:flex-end;pointer-events:auto;font:11px/1 ui-monospace,monospace';
for (const name of Object.keys(ACTIONS)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.style.cssText = 'background:rgba(11,13,16,.72);color:#f2efe8;border:1px solid rgba(242,239,232,.25);padding:4px 6px;border-radius:3px;cursor:pointer';
  b.addEventListener('click', ACTIONS[name]);
  panel.appendChild(b);
}
if (!params.has('nopanel')) document.body.appendChild(panel);

VIEWS.hub();
setTime('day');

window.__fx = {
  ctx, ACTIONS, VIEWS, TIMES, test,
  setTime, scanHere, burst,
  setSun(az, el) {
    azimuth = az;
    sunDir(az, el, sharedUniforms.uSunDir.value);
  },
  frames(n = 1) {
    return new Promise((resolve) => {
      let k = 0;
      const tick = () => (++k >= n ? resolve() : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    });
  },
};
