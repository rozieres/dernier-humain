import * as THREE from 'three';
import { GLSL } from '../core/glsl.js';
import { GROUND_COMMON, TERRAIN_SURFACE } from './terrain/palette.js';

const CHUNK_CELLS = 80;
const LOD_STEPS = [1, 2, 4, 8];
const LOD_RANGES = [360, 820, 1500];
const HYSTERESIS = 30;
const SHADOW_RANGE = 230;

const VERTEX_PARS = /* glsl */ `
varying vec3 vTerrN;
varying float vTerrSkirt;
`;

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vTerrN;
varying float vTerrSkirt;
${GLSL.noise}
${GLSL.world}
${GROUND_COMMON}
${TERRAIN_SURFACE}
`;

const FRAGMENT_MAP = /* glsl */ `
vec3 tWp = vDhWorldPos;
vec3 tN = normalize(vTerrN);
vec3 tView = normalize(cameraPosition - tWp);
float tFp = max(length(dFdx(tWp)), length(dFdy(tWp)));
TSurf tS = terrainSurface(tWp, tN, tView, tFp);
diffuseColor.rgb = tS.albedo;
`;

const FRAGMENT_NORMAL = /* glsl */ `
vec3 tNb = vTerrSkirt > 0.5 ? tN : bumpNormal(tWp, tN, tS.bump);
normal = normalize((viewMatrix * vec4(tNb, 0.0)).xyz);
`;

const FRAGMENT_SKY = /* glsl */ `
#ifndef USE_ENVMAP
{
  vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  vec3 r = reflect(-tView, nW);
  vec3 sky = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.6, r.y));
  float fres = pow(1.0 - trSat(dot(nW, tView)), 5.0);
  float gloss = 1.0 - smoothstep(0.1, 0.6, tS.rough);
  reflectedLight.indirectSpecular += sky * gloss * (0.03 + 0.6 * fres) * 0.7;
}
#endif
`;

function onShader(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <clipping_planes_pars_vertex>', `#include <clipping_planes_pars_vertex>\n${VERTEX_PARS}`)
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvTerrN = objectNormal;\nvTerrSkirt = uv.x < 0.0 ? 1.0 : 0.0;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <clipping_planes_pars_fragment>', `#include <clipping_planes_pars_fragment>\n${FRAGMENT_PARS}`)
    .replace('#include <map_fragment>', FRAGMENT_MAP)
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tS.rough;')
    .replace('#include <normal_fragment_maps>', FRAGMENT_NORMAL)
    .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += tS.emissive;')
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${FRAGMENT_SKY}`);
}

export default async function create(ctx) {
  const { world, mat, scene, quality, camera, events } = ctx;
  const { HALF, CELL, GRID, heights } = world;
  const material = mat.standard({ color: 0xffffff, roughness: 0.9, metalness: 0 }, { onShader });
  material.name = 'terrain';

  const group = new THREE.Group();
  group.name = 'terrain';
  scene.add(group);

  const span = CHUNK_CELLS * CELL;
  const perSide = Math.ceil((GRID - 1) / CHUNK_CELLS);
  let stepScale = Math.max(1, quality.terrainStep || 1);
  const chunks = [];

  const h = (ix, iz) => heights[Math.min(GRID - 1, iz) * GRID + Math.min(GRID - 1, ix)];

  function edgeError(i0, j0, di, dj, n, step) {
    let err = 0;
    for (let k = 0; k <= n; k += step) {
      const a = h(i0 + di * k, j0 + dj * k);
      const kk = Math.min(n, k + step);
      const b = h(i0 + di * kk, j0 + dj * kk);
      for (let m = k + 1; m < kk; m++) {
        const t = (m - k) / (kk - k);
        err = Math.max(err, Math.abs(h(i0 + di * m, j0 + dj * m) - (a + (b - a) * t)));
      }
    }
    return err;
  }

  function addSkirt(geo, depth) {
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const uv = geo.attributes.uv;
    const index = geo.index.array;
    const count = pos.count;
    let nx = 0;
    while (nx < count - 1 && pos.getZ(nx + 1) === pos.getZ(0)) nx++;
    nx += 1;
    const nz = count / nx;
    const ring = [];
    for (let a = 0; a < nx; a++) ring.push(a);
    for (let b = 1; b < nz; b++) ring.push(b * nx + nx - 1);
    for (let a = nx - 2; a >= 0; a--) ring.push((nz - 1) * nx + a);
    for (let b = nz - 2; b > 0; b--) ring.push(b * nx);
    const m = ring.length;
    const P = new Float32Array((count + m) * 3);
    const N = new Float32Array((count + m) * 3);
    const U = new Float32Array((count + m) * 2);
    P.set(pos.array);
    N.set(nor.array);
    U.set(uv.array);
    ring.forEach((v, k) => {
      const o = count + k;
      P[o * 3] = pos.getX(v);
      P[o * 3 + 1] = pos.getY(v) - depth;
      P[o * 3 + 2] = pos.getZ(v);
      N[o * 3] = nor.getX(v);
      N[o * 3 + 1] = nor.getY(v);
      N[o * 3 + 2] = nor.getZ(v);
      U[o * 2] = -1;
      U[o * 2 + 1] = uv.getY(v);
    });
    const I = new Uint32Array(index.length + m * 6);
    I.set(index);
    let o = index.length;
    for (let k = 0; k < m; k++) {
      const a = ring[k];
      const b = ring[(k + 1) % m];
      const a2 = count + k;
      const b2 = count + ((k + 1) % m);
      I[o++] = a; I[o++] = b; I[o++] = a2;
      I[o++] = b; I[o++] = b2; I[o++] = a2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    g.setIndex(new THREE.BufferAttribute(I, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    geo.dispose();
    return g;
  }

  for (let cj = 0; cj < perSide; cj++) {
    for (let ci = 0; ci < perSide; ci++) {
      const i0 = ci * CHUNK_CELLS;
      const j0 = cj * CHUNK_CELLS;
      const n = Math.min(CHUNK_CELLS, GRID - 1 - i0);
      const x0 = -HALF + i0 * CELL;
      const z0 = -HALF + j0 * CELL;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let j = j0; j <= j0 + n; j++) {
        for (let i = i0; i <= i0 + n; i++) {
          const y = h(i, j);
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      const mesh = new THREE.Mesh(undefined, material);
      mesh.name = `terrain:${ci},${cj}`;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      chunks.push({
        mesh, i0, j0, n, x0, z0, x1: x0 + n * CELL, z1: z0 + n * CELL, minY, maxY,
        levels: new Map(), level: -1, skirt: null,
      });
    }
  }

  function skirtDepth(c) {
    if (c.skirt !== null) return c.skirt;
    const coarse = Math.min(c.n, LOD_STEPS[LOD_STEPS.length - 1] * stepScale);
    const e = Math.max(
      edgeError(c.i0, c.j0, 1, 0, c.n, coarse), edgeError(c.i0, c.j0 + c.n, 1, 0, c.n, coarse),
      edgeError(c.i0, c.j0, 0, 1, c.n, coarse), edgeError(c.i0 + c.n, c.j0, 0, 1, c.n, coarse),
    );
    c.skirt = e + 1.5;
    return c.skirt;
  }

  function geometryFor(c, level) {
    const step = Math.min(c.n, LOD_STEPS[level] * stepScale);
    let g = c.levels.get(step);
    if (!g) {
      g = world.terrainGeometry({ step, bounds: [c.x0, c.z0, c.x1, c.z1] });
      g = addSkirt(g, skirtDepth(c));
      c.levels.set(step, g);
    }
    return g;
  }

  function distanceTo(c, p) {
    const dx = Math.max(c.x0 - p.x, 0, p.x - c.x1);
    const dz = Math.max(c.z0 - p.z, 0, p.z - c.z1);
    const dy = Math.max(c.minY - p.y, 0, p.y - c.maxY);
    return Math.sqrt(dx * dx + dz * dz + dy * dy);
  }

  const eye = new THREE.Vector3();
  function refresh(force = false) {
    camera.getWorldPosition(eye);
    for (const c of chunks) {
      const d = distanceTo(c, eye);
      let level = 0;
      while (level < LOD_RANGES.length && d > LOD_RANGES[level] + (c.level > level ? -HYSTERESIS : HYSTERESIS)) level++;
      if (level !== c.level || force) {
        c.level = level;
        c.mesh.geometry = geometryFor(c, level);
      }
      c.mesh.castShadow = quality.shadows && d < SHADOW_RANGE;
    }
  }
  refresh(true);

  events.on('quality:change', () => {
    const next = Math.max(1, quality.terrainStep || 1);
    if (next === stepScale) return;
    stepScale = next;
    for (const c of chunks) {
      for (const g of c.levels.values()) g.dispose();
      c.levels.clear();
      c.skirt = null;
    }
    refresh(true);
  });

  return {
    mesh: group,
    material,
    chunks: chunks.map((c) => c.mesh),
    frame() {
      refresh(false);
    },
    stats() {
      const levels = [0, 0, 0, 0];
      for (const c of chunks) levels[c.level]++;
      return { chunks: chunks.length, levels };
    },
    dispose() {
      for (const c of chunks) for (const g of c.levels.values()) g.dispose();
      material.dispose();
      scene.remove(group);
    },
  };
}
