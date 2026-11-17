import * as THREE from 'three';
import '../src/core/fonts.js';
import { boot } from '../src/boot.js';
import { GLSL } from '../src/core/glsl.js';

const params = new URLSearchParams(location.search);
const scenario = params.get('case') || 'demo';

const PANELS = [
  {
    style: 'post', author: 'Lumière Bien-Être', handle: '@lumiere.officiel', meta: 'il y a 3 s', footer: '4 000 réponses',
    body: "Voici 7 astuces que personne ne vous dit pour être enfin authentique. La numéro 4 va changer votre façon de respirer.",
  },
  {
    style: 'human', title: 'Mardi soir', meta: '3 octobre', author: 'Jocelyne',
    body: ["Onze tomates cette semaine, dont deux mangées par les limaces.", "Si quelqu'un lit ça : bonjour. Ça fait du bien d'écrire pour de vrai."],
  },
  {
    style: 'oldweb', title: 'Bienvenue chez Mathieu !!', meta: '214', footer: "Signez mon livre d'or !",
    body: ['Ma page perso sur les dinosaures, les modems et mon chat Pixel.', '> Mes liens préférés', '> Ma collection de GIF', 'Meilleure résolution : 800 × 600'],
  },
  {
    style: 'terminal', title: 'Forum des Veilleurs — tty1', footer: 'C:\\VEILLE>',
    body: ['CONNEXION ÉTABLIE.', '3 messages non lus.', 'Le forum public ferme ce soir. On continue ailleurs, entre nous.'],
  },
  { style: 'sign', title: "Page d'accueil", body: ['↑ Le Fil', '→ La Ferme à contenus', '← Le Vieux Web'] },
  { style: 'bubble', author: 'Tiret', body: 'Excellente question ! Il est important de noter que je suis sûr à 97 %.' },
  { style: 'label', title: 'Fragile — humain', accent: '#c96f4a', size: [2.4, 0.6] },
  {
    style: 'plain', title: 'Texte brut', bg: '#0b0d10', footer: 'style plain · Inter + Instrument Serif',
    body: 'Sans décor, pour les écrans et les cartels. Accents : éèàçœ. Des "guillemets droits", jamais de chevrons.',
  },
];

function demo(ctx) {
  const { scene, physics, mat, text, world } = ctx;
  const hubY = world.zones.hub.y;
  const r = ctx.rng.seeded('core-demo');
  const palette = ['#f4f6fb', '#5ce1e6', '#ff5fa2', '#ffb454', '#c96f4a', '#9b6bff'];
  const mats = palette.map((c) => mat.standard({ color: c, roughness: 0.45, metalness: 0.05 }));
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const ballGeo = new THREE.IcosahedronGeometry(0.5, 3);
  const bodies = [];
  for (let i = 0; i < 40; i++) {
    const sphere = i % 3 === 0;
    const mesh = new THREE.Mesh(sphere ? ballGeo : boxGeo, mats[i % mats.length]);
    const s = sphere ? 0.7 + r() * 0.9 : 0.6 + r() * 1.1;
    mesh.scale.setScalar(s);
    if (i < 4) mesh.position.set(-13 + (r() - 0.5) * 2, hubY + 6 + i * 2.2, 9 + (r() - 0.5) * 2);
    else mesh.position.set(-9 + (i % 8) * 2.4 + r() * 0.5, hubY + 8 + Math.floor(i / 8) * 2.6, 6 + r() * 6);
    mesh.rotation.set(r() * 3, r() * 3, r() * 3);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const e = physics.addDynamic(mesh, { shape: sphere ? 'sphere' : 'box', grabbable: true, restitution: sphere ? 0.35 : 0.1 });
    e.onCollision = (_, speed) => {
      if (speed > 6) impacts.count++;
    };
    bodies.push(e);
  }
  const impacts = { count: 0 };

  const paddleMesh = new THREE.Mesh(new THREE.BoxGeometry(9, 0.8, 0.8), mat.standard({ color: '#2e7dff', roughness: 0.3 }));
  paddleMesh.position.set(0, hubY + 0.6, 9);
  paddleMesh.castShadow = true;
  scene.add(paddleMesh);
  const paddle = physics.addKinematic(paddleMesh, { shape: 'box' });

  const liftMesh = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 4), mat.standard({ color: '#7af5c8', roughness: 0.35 }));
  liftMesh.position.set(16, hubY + 1, 8);
  liftMesh.castShadow = true;
  liftMesh.receiveShadow = true;
  scene.add(liftMesh);
  const lift = physics.addKinematic(liftMesh, { shape: 'box' });

  const sensorMat = mat.standard({ color: '#5ce1e6', transparent: true, opacity: 0.22, roughness: 0.2, depthWrite: false });
  const sensorMesh = new THREE.Mesh(new THREE.SphereGeometry(3.2, 32, 16), sensorMat);
  sensorMesh.position.set(-13, hubY + 1.5, 9);
  scene.add(sensorMesh);
  const sensor = physics.addSensor({
    shape: 'sphere', position: sensorMesh.position, radius: 3.2, filter: 'dynamic',
    onEnter: () => sensorMat.color.set(sensor.inside.size ? '#ffb454' : '#5ce1e6'),
    onLeave: () => sensorMat.color.set(sensor.inside.size ? '#ffb454' : '#5ce1e6'),
  });

  const wallZ = -22;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(30, 4.6, 0.5), mat.standard({ color: '#3a3f47', roughness: 0.85 }));
  wall.position.set(0, hubY + 2.3, wallZ - 0.3);
  wall.receiveShadow = true;
  wall.castShadow = true;
  scene.add(wall);
  physics.addStaticBox({ position: wall.position, size: [30, 4.6, 0.5] });

  const panels = PANELS.map((spec, i) => {
    const size = spec.size || (spec.style === 'sign' ? [3.2, 2.4] : [3.1, 3.1]);
    const mesh = text.panel({ ...spec, size, emissive: spec.style === 'human' || spec.style === 'sign' ? 0 : 1 });
    const x = -13.1 + i * 3.75;
    mesh.position.set(x, hubY + 2.3 + (spec.style === 'label' ? -0.6 : 0), wallZ);
    scene.add(mesh);
    return mesh;
  });

  const noiseBoard = new THREE.Mesh(new THREE.PlaneGeometry(26, 3.2), mat.shader({
    vertexShader: NOISE_VERTEX, fragmentShader: NOISE_FRAGMENT, uniforms: {},
  }));
  noiseBoard.position.set(0, hubY + 6.6, wallZ - 0.1);
  scene.add(noiseBoard);

  const obelisk = new THREE.CylinderGeometry(1.2, 2.2, 18, 6);
  obelisk.translate(0, 9, 0);
  const ring = new THREE.InstancedMesh(obelisk, mat.standard({ color: '#f4f6fb', roughness: 0.3 }), 24);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = Math.cos(a) * 150;
    const z = Math.sin(a) * 150;
    ring.setMatrixAt(i, m4.makeTranslation(x, world.heightAt(x, z) - 1, z));
  }
  ring.castShadow = true;
  scene.add(ring);

  const batched = new THREE.BatchedMesh(6, 2000, 4000, mat.standard({ color: '#ff5fa2', roughness: 0.5 }));
  const g1 = batched.addGeometry(new THREE.TorusKnotGeometry(0.6, 0.2, 64, 8));
  const g2 = batched.addGeometry(new THREE.BoxGeometry(1, 1, 1));
  for (let i = 0; i < 6; i++) {
    const id = batched.addInstance(i % 2 ? g2 : g1);
    batched.setMatrixAt(id, m4.makeTranslation(-20 + i * 1.8, hubY + 1.2, 18));
  }
  scene.add(batched);

  const skinGeo = new THREE.CylinderGeometry(0.35, 0.35, 4, 8, 8).translate(0, 2, 0);
  const skinIndex = [];
  const skinWeight = [];
  const sp = skinGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const w = Math.min(1, sp.getY(i) / 4);
    skinIndex.push(0, 1, 0, 0);
    skinWeight.push(1 - w, w, 0, 0);
  }
  skinGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  skinGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  const root = new THREE.Bone();
  const tip = new THREE.Bone();
  tip.position.y = 2;
  root.add(tip);
  const skinned = new THREE.SkinnedMesh(skinGeo, mat.standard({ color: '#ffb454', roughness: 0.6 }));
  skinned.add(root);
  skinned.bind(new THREE.Skeleton([root, tip]));
  skinned.position.set(20, hubY, 16);
  skinned.castShadow = true;
  scene.add(skinned);

  const drape = new THREE.Mesh(new THREE.PlaneGeometry(120, 120, 60, 60).rotateX(-Math.PI / 2), mat.shader({
    vertexShader: DRAPE_VERTEX, fragmentShader: DRAPE_FRAGMENT, uniforms: {}, wireframe: true, transparent: true,
  }));
  drape.position.set(70, 0, -60);
  drape.frustumCulled = false;
  scene.add(drape);

  return {
    bodies, sensor, impacts, panels, paddle, lift, ring, batched, skinned, drape,
    update() {
      tip.rotation.z = Math.sin(ctx.time.now * 1.5) * 0.8;
    },
    fixedUpdate() {
      const t = ctx.time.now;
      paddle.moveTo([0, hubY + 0.6, 9], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t * 0.7));
      lift.moveTo([16, hubY + 1 + (Math.sin(t * 0.8) * 0.5 + 0.5) * 4, 8]);
    },
    summary() {
      return {
        settled: bodies.filter((b) => b.sleeping).length,
        maxSpeed: Math.max(...bodies.map((b) => b.body.linvel().y)),
        lowest: Math.min(...bodies.map((b) => b.position.y - world.heightAt(b.position.x, b.position.z))),
        inSensor: sensor.inside.size,
        impacts: impacts.count,
      };
    },
  };
}

const NOISE_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const NOISE_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.noise}
${GLSL.fog}
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec2 p = vec2(vUv.x * 26.0 / 3.2, vUv.y) * 3.0;
  float panel = floor(vUv.x * 4.0);
  vec3 col;
  if (panel < 1.0) col = vec3(fbm(p) * 0.5 + 0.5);
  else if (panel < 2.0) col = vec3(vnoise(p * 2.0) * 0.5 + 0.5);
  else if (panel < 3.0) col = vec3(fbm(vec3(p, uTime * 0.2)) * 0.5 + 0.5);
  else {
    vec3 v = voronoi(p * 1.5);
    col = mix(vec3(0.36, 0.88, 0.9), vec3(1.0, 0.37, 0.64), v.z) * (0.35 + 0.65 * smoothstep(0.0, 0.08, v.y - v.x));
  }
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const DRAPE_VERTEX = /* glsl */ `
${GLSL.envPars}
${GLSL.world}
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  w.y = terrainHeight(w.xz) + 0.25;
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const DRAPE_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.world}
${GLSL.fog}
varying vec3 vWorld;
void main() {
  vec4 b = biomeB(vWorld.xz);
  vec3 col = mix(vec3(1.0, 0.95, 0.4), vec3(1.0, 0.3, 0.2), b.z);
  gl_FragColor = vec4(applyFog(col, vWorld), 0.7);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function throwing() {
  throw new Error('deliberate failure for the boot test');
}

const options = { systems: [], nosave: true };
if (scenario === 'demo') options.extra = [{ name: 'coreDemo', create: demo }];
if (scenario === 'throw') options.extra = [{ name: 'broken', create: throwing }];

const ctx = await boot(options);
window.__core = { scenario, demo: ctx.has('coreDemo') ? ctx.coreDemo : null };
