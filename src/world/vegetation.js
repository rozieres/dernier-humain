import * as THREE from 'three';
import { createGrass } from './vegetation/grass.js';
import { scatter } from './vegetation/scatter.js';
import { createVegetationMaterials } from './vegetation/materials.js';
import {
  trunkGeometry, broadleafCrown, cloneCrown, coniferCrown, deadTree, shrubGeometry, rockGeometry,
} from './vegetation/shapes.js';

const CELL = 64;
const NEAR = 120;
const ALWAYS = 70;
const LOOKUP = 32;
const TRUNK = { r0: 0.032, r1: 0.013, flare: 0.028 };
const CROWN_BASE = { broad: 0.55, poplar: 0.55, clone: 0.62, wrong: 0.55, conifer: 0.75 };

export default async function create(ctx) {
  const { scene, mat, quality, camera, physics, events } = ctx;
  const materials = createVegetationMaterials(mat);
  const grass = createGrass(ctx);

  const KINDS = {
    trunk: { material: materials.bark, near: trunkGeometry({ radial: 7, rings: 6, ...TRUNK }), far: trunkGeometry({ radial: 4, rings: 2, bend: 0.03, ...TRUNK }) },
    broad: { material: materials.foliage, near: broadleafCrown(2, 5, 11), far: broadleafCrown(0, 5, 11) },
    conifer: { material: materials.conifer, near: coniferCrown(13, 6, 3), far: coniferCrown(6, 4, 3) },
    clone: { material: materials.clone, near: cloneCrown(3), far: cloneCrown(1) },
    dead: { material: materials.bark, near: deadTree(5), far: deadTree(3) },
    shrub: { material: materials.foliage, near: shrubGeometry(2), far: shrubGeometry(0) },
    rock: { material: materials.rock, near: rockGeometry(2), far: rockGeometry(0) },
  };
  const kindNames = Object.keys(KINDS);

  const group = new THREE.Group();
  group.name = 'vegetation';
  scene.add(group);

  const cells = new Map();
  const lookup = new Map();
  const counts = Object.fromEntries(kindNames.map((k) => [k, 0]));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  function cellOf(x, z) {
    const ci = Math.floor(x / CELL);
    const cj = Math.floor(z / CELL);
    const key = `${ci},${cj}`;
    let c = cells.get(key);
    if (!c) {
      c = { x0: ci * CELL, z0: cj * CELL, minY: Infinity, maxY: -Infinity, parts: {} };
      cells.set(key, c);
    }
    return c;
  }

  function addInstance(kind, x, y, z, rotation, scale, color, top) {
    const c = cellOf(x, z);
    let p = c.parts[kind];
    if (!p) p = c.parts[kind] = { m: [], c: [] };
    m4.compose(pos.set(x, y, z), q.setFromEuler(rotation), scale);
    p.m.push(...m4.elements);
    p.c.push(color.r, color.g, color.b);
    c.minY = Math.min(c.minY, y - 2);
    c.maxY = Math.max(c.maxY, y + top);
    counts[kind]++;
  }

  function register(x, z, radius, height, y) {
    const key = `${Math.floor(x / LOOKUP)},${Math.floor(z / LOOKUP)}`;
    let list = lookup.get(key);
    if (!list) lookup.set(key, (list = []));
    list.push({ x, z, radius, height, y });
  }

  const colliders = [];
  let groves = [];
  let built = false;

  function build() {
    const { trees, shrubs, rocks, driftwood, groves: g } = scatter(ctx);
    groves = g;
    for (const t of trees) {
      const k = t.type === 'conifer' ? 0.62 : t.type === 'poplar' ? 0.75 : 1;
      const y = t.y - 0.25;
      const trunkH = t.h * (CROWN_BASE[t.type] || 0.62) + (t.lift ? 0 : 0.1 * t.h);
      if (t.type === 'dead') {
        addInstance('dead', t.x, y, t.z, e.set(0, t.yaw, 0), scl.set(t.h, t.h, t.h), t.bark, t.h);
      } else {
        addInstance('trunk', t.x, y, t.z, e.set(0, t.yaw, 0), scl.set(t.h * k, trunkH, t.h * k), t.bark, trunkH);
        const crown = t.type === 'clone' ? 'clone' : t.type === 'conifer' ? 'conifer' : 'broad';
        const lift = (t.lift || 0) * t.h;
        addInstance(crown, t.x, y + lift, t.z, e.set(0, t.yaw, 0), scl.set(t.w, t.h, t.w), t.color, t.h + lift);
      }
      const radius = Math.max(0.18, (TRUNK.r0 + TRUNK.flare * 0.4) * t.h * (t.type === 'dead' ? 1.2 : k));
      const hh = t.type === 'dead' ? t.h * 0.6 : trunkH;
      colliders.push(physics.addStaticCylinder({ position: [t.x, y + hh / 2, t.z], radius, height: hh, userData: { kind: 'tree' } }));
      register(t.x, t.z, radius, t.h, t.y);
    }
    for (const s of shrubs) {
      addInstance('shrub', s.x, s.y - 0.15 * s.s, s.z, e.set(0, s.yaw, 0), scl.set(s.s, s.s * 0.85, s.s), s.color, s.s);
    }
    for (const r of rocks) {
      const sy = r.s * (0.7 + 0.3 * Math.abs(Math.sin(r.yaw * 3)));
      addInstance('rock', r.x, r.y - 0.12 * r.s, r.z, e.set(r.tilt, r.yaw, r.tilt * 0.5), scl.set(r.s, sy, r.s * 0.9), r.color, sy);
      if (r.s > 0.8) colliders.push(physics.addStaticCylinder({ position: [r.x, r.y + sy * 0.2, r.z], radius: r.s * 0.8, height: sy * 0.9, userData: { kind: 'rock' } }));
    }
    for (const d of driftwood) {
      addInstance('trunk', d.x, d.y + 0.12, d.z, e.set(Math.PI / 2 - 0.06, d.yaw, 0, 'YXZ'), scl.set(d.h * 1.3, d.h, d.h * 1.3), d.color, 1);
    }
    for (const c of cells.values()) {
      for (const p of Object.values(c.parts)) {
        p.m = new Float32Array(p.m);
        p.c = new Float32Array(p.c);
      }
    }
    built = true;
  }

  const meshes = {};
  function createMeshes() {
    for (const name of kindNames) {
      const def = KINDS[name];
      const cap = Math.max(1, counts[name]);
      meshes[name] = ['near', 'far'].map((lod) => {
        const mesh = new THREE.InstancedMesh(def[lod], def.material, cap);
        mesh.name = `veg:${name}:${lod}`;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.count = 0;
        mesh.receiveShadow = true;
        mesh.castShadow = lod === 'near' && quality.shadows;
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
        return mesh;
      });
    }
  }

  const frustum = new THREE.Frustum();
  const projView = new THREE.Matrix4();
  const box = new THREE.Box3();
  const eye = new THREE.Vector3();
  const lastEye = new THREE.Vector3(Infinity, 0, 0);
  const lastQuat = new THREE.Quaternion();
  let lastFov = 0;
  const fill = {};

  function refresh(force) {
    camera.getWorldPosition(eye);
    if (!force && eye.distanceToSquared(lastEye) < 1 && Math.abs(camera.quaternion.dot(lastQuat)) > 0.99995 && camera.fov === lastFov) return;
    lastEye.copy(eye);
    lastQuat.copy(camera.quaternion);
    lastFov = camera.fov;
    camera.updateMatrixWorld();
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
    const far = Math.min(1600, quality.viewDistance * 0.5);
    for (const name of kindNames) fill[name] = [0, 0];
    for (const c of cells.values()) {
      const dx = Math.max(c.x0 - eye.x, 0, eye.x - c.x0 - CELL);
      const dz = Math.max(c.z0 - eye.z, 0, eye.z - c.z0 - CELL);
      const d = Math.hypot(dx, dz);
      if (d > far) continue;
      box.min.set(c.x0 - 8, c.minY, c.z0 - 8);
      box.max.set(c.x0 + CELL + 8, c.maxY + 4, c.z0 + CELL + 8);
      if (!frustum.intersectsBox(box) && !(d <= ALWAYS && quality.shadows)) continue;
      const lod = d < NEAR ? 0 : 1;
      for (const name in c.parts) {
        const p = c.parts[name];
        const mesh = meshes[name][lod];
        const n = fill[name][lod];
        mesh.instanceMatrix.array.set(p.m, n * 16);
        mesh.instanceColor.array.set(p.c, n * 3);
        fill[name][lod] = n + p.c.length / 3;
      }
    }
    for (const name of kindNames) {
      for (let lod = 0; lod < 2; lod++) {
        const mesh = meshes[name][lod];
        const n = fill[name][lod];
        mesh.count = n;
        if (n) {
          mesh.instanceMatrix.clearUpdateRanges();
          mesh.instanceMatrix.addUpdateRange(0, n * 16);
          mesh.instanceMatrix.needsUpdate = true;
          mesh.instanceColor.clearUpdateRanges();
          mesh.instanceColor.addUpdateRange(0, n * 3);
          mesh.instanceColor.needsUpdate = true;
        }
      }
    }
  }

  events.on('quality:change', () => {
    if (!built) return;
    for (const name of kindNames) meshes[name][0].castShadow = quality.shadows;
    refresh(true);
  });

  return {
    group,
    grass,
    get groves() {
      return groves;
    },
    start() {
      build();
      createMeshes();
      grass.setClearings();
      refresh(true);
    },
    frame() {
      if (built) refresh(false);
    },
    treesNear(x, z, r, target = []) {
      target.length = 0;
      const i0 = Math.floor((x - r) / LOOKUP);
      const i1 = Math.floor((x + r) / LOOKUP);
      const j0 = Math.floor((z - r) / LOOKUP);
      const j1 = Math.floor((z + r) / LOOKUP);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const list = lookup.get(`${i},${j}`);
          if (!list) continue;
          for (const t of list) if ((t.x - x) ** 2 + (t.z - z) ** 2 <= r * r) target.push(t);
        }
      }
      return target;
    },
    stats() {
      const visible = {};
      for (const name of kindNames) visible[name] = meshes[name].map((m) => m.count);
      return { counts: { ...counts }, visible, grass: grass.stats(), colliders: colliders.length, groves: groves.length };
    },
    dispose() {
      for (const c of colliders) c.remove();
      for (const name of kindNames) {
        KINDS[name].near.dispose();
        KINDS[name].far.dispose();
        for (const m of meshes[name] || []) m.dispose();
      }
      for (const m of Object.values(materials)) m.dispose();
      scene.remove(group);
    },
  };
}
