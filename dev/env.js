import * as THREE from 'three';
import '../src/core/fonts.js';
import { boot } from '../src/boot.js';
import { moonDirection } from '../src/world/sky/palette.js';

const params = new URLSearchParams(location.search);
const extraSystems = (params.get('with') || '').split(',').map((s) => s.trim()).filter(Boolean);

const HUB_EYE = [0, 39.7, 8];
const VIEWS = {
  west: { pos: HUB_EYE, look: [-1140, 150, 170] },
  east: { pos: HUB_EYE, look: [1000, 150, 0] },
  north: { pos: HUB_EYE, look: [0, 150, -1000] },
  south: { pos: HUB_EYE, look: [0, 150, 1000] },
  up: { pos: HUB_EYE, look: [-300, 900, -300] },
  sky: { pos: HUB_EYE, look: [200, 1100, -500] },
  moon: { pos: HUB_EYE, look: null },
  aerial: { pos: [420, 380, 820], look: [-300, 20, -200] },
  aerialWest: { pos: [300, 300, 300], look: [-1140, 40, 170] },
  crates: { pos: [2, 42.5, 44], look: [18, 38.5, 24] },
  lighthouse: { pos: [-1150, 17, 175], look: [0, 260, 0] },
  forest: { pos: [0, 39.7, 8], look: [0, 60, -1000] },
};

function harness(ctx) {
  const { scene, mat, world, env } = ctx;
  const hubY = world.zones.hub.y ?? 38;

  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  const crateMat = mat.standard({ color: '#c9a070', roughness: 0.75 });
  const crates = new THREE.InstancedMesh(crateGeo, crateMat, 36);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const r = ctx.rng.seeded('env-crates');
  for (let i = 0; i < 36; i++) {
    const size = 0.6 + r() * 1.2;
    const x = 10 + (i % 6) * 3.2 + r() * 0.8;
    const z = 18 + Math.floor(i / 6) * 3.2 + r() * 0.8;
    const stacked = i % 7 === 3;
    p.set(x, world.heightAt(x, z) + size / 2 + (stacked ? 1.2 : 0), z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI);
    s.setScalar(size);
    crates.setMatrixAt(i, m4.compose(p, q, s));
  }
  crates.castShadow = true;
  crates.receiveShadow = true;
  scene.add(crates);

  const pillarMat = mat.standard({ color: '#f4f6fb', roughness: 0.35, metalness: 0.0 });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 7, 24), pillarMat);
  pillar.position.set(16, hubY + 3.5, 14);
  pillar.castShadow = true;
  pillar.receiveShadow = true;
  scene.add(pillar);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.2, 48, 24), mat.standard({ color: '#5ce1e6', roughness: 0.15, metalness: 0.1 }));
  ball.position.set(8, hubY + 1.2, 24);
  ball.castShadow = true;
  ball.receiveShadow = true;
  scene.add(ball);
  const mirror = new THREE.Mesh(new THREE.SphereGeometry(1.0, 48, 24), mat.standard({ color: '#ffffff', roughness: 0.05, metalness: 1 }));
  mirror.position.set(6, hubY + 1.0, 30);
  mirror.castShadow = true;
  scene.add(mirror);

  const testLights = [];
  function addLights() {
    if (testLights.length) return testLights;
    const colors = ['#ffb454', '#5ce1e6', '#ff5fa2', '#9b6bff', '#7cff6b'];
    const bulbGeo = new THREE.SphereGeometry(0.15, 12, 8);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const rad = 16 + (i % 3) * 9;
      const x = Math.cos(a) * rad + 18;
      const z = Math.sin(a) * rad + 26;
      const y = world.heightAt(x, z) + 1.4;
      const color = colors[i % colors.length];
      const handle = env.lights.add({ position: [x, y, z], color, intensity: 12, distance: 14, flicker: i % 4 === 0 ? 0.6 : 0 });
      const bulb = new THREE.Mesh(bulbGeo, mat.glow(color, 6));
      bulb.position.copy(handle.position);
      scene.add(bulb);
      testLights.push(handle);
    }
    return testLights;
  }

  let forest = null;
  function addForest() {
    if (forest) return forest;
    forest = env.addAtmosphere({
      id: 'test-forest', center: [0, -90], radius: 45, falloff: 50, fogColor: '#2c4a40', fogDensity: 5,
      tint: [0.86, 1.0, 0.92], saturation: 0.8, exposure: 0.92, darkness: 0.6,
    });
    env.addAtmosphere({ id: 'test-hallu', center: [120, 40], radius: 30, falloff: 60, fogColor: '#c77dff', fogDensity: 2.2, tint: [1.05, 0.92, 1.12], saturation: 1.1 });
    return forest;
  }

  if (params.get('lights') === '1') addLights();
  if (params.get('atmos') === '1') addForest();
  if (params.has('time')) env.setTime(Number(params.get('time')));

  const fly = ctx.debug.flycam;
  function view(name) {
    const v = VIEWS[name];
    if (!v) throw new Error(`unknown view ${name}`);
    fly.setPose(v.pos[0], v.pos[1], v.pos[2]);
    if (v.look) fly.lookAt(...v.look);
    else {
      const d = moonDirection(env.time);
      fly.lookAt(v.pos[0] + d.x * 100, v.pos[1] + d.y * 100 - 18, v.pos[2] + d.z * 100);
    }
    return name;
  }

  window.addEventListener('keydown', (e) => {
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5));
      if (n <= 6) {
        ctx.state.applyStage(n);
        env.setStage(n, { instant: e.shiftKey });
      }
    }
    if (e.code === 'BracketLeft') env.setTime(env.time - (e.shiftKey ? 1 : 0.1));
    if (e.code === 'BracketRight') env.setTime(env.time + (e.shiftKey ? 1 : 0.1));
    if (e.code === 'KeyL') addLights();
    if (e.code === 'KeyG') addForest();
    if (e.code === 'KeyP') console.log(JSON.stringify(env.debugInfo()));
  });

  if (params.has('view')) view(params.get('view'));
  window.__envDev = { view, addLights, addForest, crates, VIEWS };
  return {};
}

await boot({ systems: ['env', ...extraSystems], nosave: true, freecam: true, extra: [{ name: 'envHarness', create: harness }] });
