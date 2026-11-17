import * as THREE from 'three';
import { sharedUniforms } from '../core/glsl.js';
import { createSeaField } from './water/field.js';
import { createSeaGrid } from './water/grid.js';
import { buildTextAtlas, ATLAS } from './water/atlas.js';
import { createDetailNormals } from './water/detail.js';
import { createWaveSet, windFactors } from './water/waves.js';
import { seaShaders } from './water/shader.js';

const INNER = 0.5;
const LETTER_PX_PER_M = 48;
const MAIN_SEGS = 136;
const ISLE_SEGS = 12;
const SEAM_ANGLE = (140 * Math.PI) / 180;

export default async function create(ctx) {
  const { world, camera, renderer, quality } = ctx;
  const field = createSeaField(world);
  const lines = ctx.has('texts') && Array.isArray(ctx.texts.SEA_LINES) ? ctx.texts.SEA_LINES : [];
  const atlas = await buildTextAtlas(ctx, lines);
  const detail = createDetailNormals(ctx.rng);
  detail.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const wind = sharedUniforms.uWind.value;
  let waves = createWaveSet({ windDir: [wind.x, wind.y] });
  const segLen = ATLAS.width / LETTER_PX_PER_M;
  const rowPitch = ATLAS.row / LETTER_PX_PER_M;
  const { vertexShader, fragmentShader } = seaShaders({
    segLen, rowPitch, mainSegs: MAIN_SEGS, isleSegs: ISLE_SEGS, seamAngle: SEAM_ANGLE,
  });

  const uniforms = {
    uCoastTex: { value: field.texture },
    uWaveDirs: { value: waves.dirs.map(([x, z]) => new THREE.Vector2(x, z)) },
    uWindF: { value: new THREE.Vector2(1, 1) },
    uLightIsle: { value: field.isle },
    uGridScale: { value: 1 },
    uAtlas: { value: atlas },
    uDetail: { value: detail },
    uShallow: { value: new THREE.Color('#2bb7b3') },
    uDeep: { value: new THREE.Color('#0e3a4a') },
    uGlyph: { value: new THREE.Color('#5ce1e6').multiplyScalar(1.6) },
    uDrift: { value: new THREE.Vector2() },
  };
  const material = ctx.mat.shader({
    vertexShader, fragmentShader, uniforms,
    transparent: true, premultipliedAlpha: true, depthWrite: true,
  });
  const half = quality.tier === 'low' ? 96 : 128;
  const mesh = new THREE.Mesh(createSeaGrid({ half, inner: INNER, outer: 7000 }), material);
  mesh.name = 'water';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  ctx.scene.add(mesh);

  const windNow = { chop: 1, swell: 1 };
  const fld = {};
  const disp = { x: 0, y: 0, z: 0 };
  const H = world.HALF;
  const N = world.GRID;
  const heights = world.heights;

  function terrainBilinear(x, z) {
    const gx = Math.min(N - 1.0001, Math.max(0, (x + H) / world.CELL));
    const gz = Math.min(N - 1.0001, Math.max(0, (z + H) / world.CELL));
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const tx = gx - ix;
    const tz = gz - iz;
    const k = iz * N + ix;
    const a = heights[k] + (heights[k + 1] - heights[k]) * tx;
    const b = heights[k + N] + (heights[k + N + 1] - heights[k + N]) * tx;
    return a + (b - a) * tz;
  }

  function displaceAt(x, z, t) {
    field.sample(x, z, fld);
    return waves.displace(x, z, t, world.SEA_LEVEL - terrainBilinear(x, z), fld, windNow, disp);
  }

  function heightAt(x, z) {
    const t = sharedUniforms.uTime.value;
    let qx = x;
    let qz = z;
    for (let i = 0; i < 4; i++) {
      displaceAt(qx, qz, t);
      qx = x - disp.x;
      qz = z - disp.z;
    }
    return world.SEA_LEVEL + displaceAt(qx, qz, t).y;
  }

  function updateWind() {
    const f = windFactors(sharedUniforms.uWind.value.z);
    windNow.chop = f.chop;
    windNow.swell = f.swell;
    uniforms.uWindF.value.set(f.chop, f.swell);
  }
  updateWind();
  ctx.physics.setFluidSurface(heightAt);

  return {
    mesh,
    material,
    heightAt,
    start() {
      const w = sharedUniforms.uWind.value;
      waves = createWaveSet({ windDir: [w.x, w.y] });
      waves.dirs.forEach(([x, z], i) => uniforms.uWaveDirs.value[i].set(x, z));
      updateWind();
    },
    frame(dt) {
      const p = camera.position;
      const height = Math.max(1, p.y - world.SEA_LEVEL);
      const level = Math.min(5, Math.max(0, Math.floor(Math.log2(height / 14))));
      const scale = 2 ** level;
      const step = INNER * scale;
      mesh.position.set(Math.round(p.x / step) * step, 0, Math.round(p.z / step) * step);
      mesh.updateMatrixWorld();
      uniforms.uGridScale.value = scale;
      updateWind();
      const w = sharedUniforms.uWind.value;
      const speed = 0.25 + 0.06 * w.z;
      uniforms.uDrift.value.x += w.x * speed * dt;
      uniforms.uDrift.value.y += w.y * speed * dt;
    },
    dispose() {
      ctx.scene.remove(mesh);
      mesh.geometry.dispose();
      material.dispose();
      atlas.dispose();
      detail.dispose();
      field.texture.dispose();
      ctx.physics.setFluidSurface(null);
    },
  };
}
