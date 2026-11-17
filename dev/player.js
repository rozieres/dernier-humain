import * as THREE from 'three';
import '../src/core/fonts.js';
import { boot } from '../src/boot.js';

const params = new URLSearchParams(location.search);
const extra = (params.get('with') || '').split(',').map((s) => s.trim()).filter(Boolean);

function testbed(ctx) {
  const { scene, physics, mat, world } = ctx;
  const Y = world.zones.hub.y;
  const add = (mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const staticBox = (size, position, color, { rotation, userData } = {}) => {
    const mesh = add(new THREE.Mesh(new THREE.BoxGeometry(...size), mat.standard({ color, roughness: 0.7 })));
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.updateMatrixWorld();
    const handle = physics.addStaticBox({ position: mesh.position, size, quaternion: mesh.quaternion, userData });
    return { mesh, handle };
  };

  const crateMats = ['#c9a36b', '#b8875a', '#d7b98a', '#9c7449'].map((c) => mat.standard({ color: c, roughness: 0.8 }));
  const crates = [
    { mass: 4, size: 0.6, at: [-5, 0.3, 2] },
    { mass: 8, size: 0.75, at: [-6.2, 0.4, 2.4] },
    { mass: 12, size: 0.85, at: [-5.4, 1.1, 2.2] },
    { mass: 25, size: 1.0, at: [-7.4, 0.5, 1.2] },
  ].map(({ mass, size, at }, i) => {
    const mesh = add(new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMats[i]));
    mesh.position.set(at[0], Y + at[1], at[2]);
    const e = physics.addDynamic(mesh, { shape: 'box', mass, grabbable: true, userData: { surface: 'wood', name: `crate${mass}` } });
    e.mass = mass;
    return e;
  });

  const paveMesh = add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.26, 0.3), mat.standard({ color: '#7d7a76', roughness: 0.95 })));
  paveMesh.position.set(-3, Y + 0.15, 4);
  const pave = physics.addDynamic(paveMesh, { shape: 'box', mass: 18, grabbable: true, userData: { surface: 'stone', name: 'pave' } });

  const platformMesh = add(new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 4), mat.standard({ color: '#5ce1e6', roughness: 0.35, metalness: 0.1 })));
  platformMesh.position.set(10, Y + 0.6, -4);
  const platform = physics.addKinematic(platformMesh, { shape: 'box', userData: { surface: 'metal' } });

  staticBox([4, 0.3, 9], [15, Y + 2.6, 12], '#8a8f99', { rotation: [-THREE.MathUtils.degToRad(55), 0, 0] });
  staticBox([4, 0.3, 10], [9, Y + 1.8, 13], '#a7adb7', { rotation: [-THREE.MathUtils.degToRad(28), 0, 0] });
  staticBox([0.4, 0.3, 4], [20, Y + 0.15, 8], '#a7adb7');
  staticBox([0.6, 0.45, 0.6], [20, Y + 0.22, 4], '#a7adb7');
  staticBox([6, 4, 0.08], [-12, Y + 2, -8], '#3a3f47');
  staticBox([6, 4, 0.08], [-12, Y + 2, -11], '#3a3f47');
  staticBox([0.08, 4, 3], [-15, Y + 2, -9.5], '#3a3f47');

  staticBox([0.7, 1.0, 0.7], [3, Y + 0.5, -7], '#e9e6df');
  const buttonMesh = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 24), mat.standard({ color: '#ff5fa2', roughness: 0.4, emissive: '#ff5fa2', emissiveIntensity: 0.4 })));
  buttonMesh.position.set(3, Y + 1.06, -7);
  const button = { clicks: 0, mesh: buttonMesh };
  physics.addStaticCylinder({
    position: buttonMesh.position, radius: 0.22, height: 0.12,
    userData: {
      surface: 'metal',
      clickable: {
        label: 'Bouton',
        object: buttonMesh,
        onClick() {
          button.clicks++;
          buttonMesh.material.color.set(button.clicks % 2 ? '#7af5c8' : '#ff5fa2');
          buttonMesh.material.emissive.copy(buttonMesh.material.color);
          buttonMesh.position.y = Y + 1.02;
          setTimeout(() => { buttonMesh.position.y = Y + 1.06; }, 140);
        },
      },
    },
  });

  staticBox([6, 3, 6], [-16, Y + 1.5, 9], '#c96f4a', { userData: { surface: 'stone' } });
  staticBox([6, 3, 6], [-16, Y + 1.5, -3], '#c96f4a', { userData: { surface: 'stone' } });
  const bridgeGeo = new THREE.BoxGeometry(2, 0.25, 6.4);
  const halluBridge = add(new THREE.Mesh(bridgeGeo, mat.standard({ color: '#d9d4c7', roughness: 0.6 })));
  halluBridge.position.set(-17.6, Y + 2.88, 3);
  const hiddenBridge = add(new THREE.Mesh(bridgeGeo, mat.standard({ color: '#9fc9b8', roughness: 0.6 })));
  hiddenBridge.position.set(-14.4, Y + 2.88, 3);
  physics.addStaticBox({ position: hiddenBridge.position, size: [2, 0.25, 6.4], userData: { surface: 'wood' } });
  const statue = add(new THREE.Mesh(new THREE.TorusKnotGeometry(0.7, 0.24, 120, 16), mat.standard({ color: '#f4f6fb', roughness: 0.25, metalness: 0.2 })));
  statue.position.set(-7, Y + 1.6, -9);
  const scanner = ctx.scanner;
  const hallu = [scanner.hallucination(halluBridge, { duration: 8 }), scanner.hallucination(statue, { duration: 8 })];
  const hidden = [scanner.hidden(hiddenBridge, { duration: 10 })];

  const orb = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 3), mat.glow('#ffb454', 3)));
  orb.position.set(20, Y + 1.6, -14);
  scanner.addSignal({ position: orb.position, strength: 1 });
  scanner.register({ object: orb, kind: 'human', label: 'Trace' });
  scanner.addSignal({ position: new THREE.Vector3(0, 130, -640), strength: 0.8 });
  const synthMat = mat.glow('#5ce1e6', 2);
  const synth = [[6, -14], [-20, -18], [24, -24], [-40, 30], [60, 10]].map(([x, z]) => {
    const m = add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 2.4, 12), synthMat));
    m.position.set(x, world.heightAt(x, z) + 1.2, z);
    scanner.register({ object: m, kind: 'synthetic' });
    return m;
  });

  const stairMat = mat.standard({ color: '#b9b3a6', roughness: 0.8 });
  const stairBoxes = (x, z0, riser, { steps = 4, tread = 0.5, landing = 2, width = 3 } = {}) => {
    const boxes = [];
    const run = steps * tread;
    for (let i = 1; i <= steps; i++) {
      const h = i * riser;
      boxes.push({ size: [width, h, tread], position: [x, Y + h / 2, z0 - (i - 0.5) * tread] });
      boxes.push({ size: [width, h, tread], position: [x, Y + h / 2, z0 - 2 * run - landing + (i - 0.5) * tread] });
    }
    const top = steps * riser;
    boxes.push({ size: [width, top, landing], position: [x, Y + top / 2, z0 - run - landing / 2] });
    return { boxes, start: z0, end: z0 - 2 * run - landing, top };
  };
  const stairs = [];
  const buildStairs = (name, x, riser, { trimesh = false, ...opts } = {}) => {
    const s = stairBoxes(x, 6, riser, opts);
    const group = new THREE.Group();
    for (const b of s.boxes) {
      const mesh = add(new THREE.Mesh(new THREE.BoxGeometry(...b.size), stairMat));
      mesh.position.set(...b.position);
      group.add(mesh);
      if (!trimesh) physics.addStaticBox({ position: mesh.position, size: b.size, userData: { surface: 'stone' } });
    }
    scene.add(group);
    if (trimesh) physics.addStaticMesh(group, { userData: { surface: 'stone' } });
    stairs.push({ name, x, riser, start: s.start, end: s.end, top: s.top, trimesh });
  };
  buildStairs('box 0.2', 27, 0.2);
  buildStairs('box 0.3', 31, 0.3);
  buildStairs('box 0.4', 35, 0.4);
  buildStairs('trimesh 0.3', 39, 0.3, { trimesh: true });
  buildStairs('trimesh 0.4', 43, 0.4, { trimesh: true });
  staticBox([3, 0.32, 1.2], [31, Y + 0.16, -8.6], '#b9b3a6', { userData: { surface: 'stone' } });
  stairs.push({ name: 'doorstep 0.32', x: 31, riser: 0.32, start: -8, end: -9.2, top: 0.32, trimesh: false });

  const kinematicRampMesh = add(new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 8), mat.standard({ color: '#5ce1e6', roughness: 0.5 })));
  kinematicRampMesh.position.set(37, Y + 1.2, -10);
  kinematicRampMesh.rotation.set(THREE.MathUtils.degToRad(20), 0, 0);
  const kinematicRamp = physics.addKinematic(kinematicRampMesh, { shape: 'box', userData: { surface: 'metal' } });

  let t = 0;
  const yawQ = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const platformPos = new THREE.Vector3();
  return {
    crates, pave, platform, kinematicRamp, button, stairs, hallu, hidden, statue, halluBridge, hiddenBridge, orb, synth,
    platformSpeed: 1,
    fixedUpdate(dt) {
      t += dt * this.platformSpeed;
      if (this.platformPath) this.platformPath(t, platformPos);
      else platformPos.set(13 + Math.sin(t * 0.6) * 4, Y + 0.6 + Math.max(0, Math.sin(t * 0.3)) * 1.5, -4);
      yawQ.setFromAxisAngle(up, t * 0.25);
      platform.moveTo(platformPos, yawQ);
    },
  };
}

const ctx = await boot({
  systems: ['ui', 'audio', 'player', 'cursor', 'scanner', 'links', ...extra],
  nosave: true,
  extra: [{ name: 'playerTestbed', create: testbed }],
});
window.__player = ctx.playerTestbed;
