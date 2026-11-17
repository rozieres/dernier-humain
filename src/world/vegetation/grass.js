import * as THREE from 'three';
import { GLSL } from '../../core/glsl.js';
import { GROUND_COMMON } from '../terrain/palette.js';

const MASK_SIZE = 4096;
const MASK_EDGE = 0.5;

const VERTEX_PARS = /* glsl */ `
${GLSL.noise}
${GLSL.world}
${GROUND_COMMON}
uniform float uGrassN;
uniform float uSpacing;
uniform float uRadius;
uniform float uInner;
uniform float uWidthScale;
uniform sampler2D uClearMask;
varying vec3 vGrassCol;
varying float vGrassT;
varying float vGrassHead;

const vec3 C_FERN = vec3(0.016, 0.045, 0.022);
const vec3 C_FERN_TIP = vec3(0.045, 0.095, 0.035);
const vec3 C_STRAW = vec3(0.42, 0.31, 0.13);
const vec3 C_REED = vec3(0.36, 0.38, 0.17);
const vec3 C_REED_TIP = vec3(0.55, 0.45, 0.25);

vec3 flowerColor(float k) {
  if (k < 0.3) return vec3(0.95, 0.93, 0.85);
  if (k < 0.55) return vec3(1.0, 0.78, 0.12);
  if (k < 0.8) return vec3(0.98, 0.32, 0.52);
  return vec3(0.42, 0.36, 1.0);
}

float clearMask(vec2 p) {
  return textureLod(uClearMask, (p + uWorldHalf) / (2.0 * uWorldHalf), 0.0).r;
}
`;

const VERTEX_BLADE = /* glsl */ `
float gN = uGrassN;
int gid = gl_InstanceID;
vec2 lat = vec2(float(gid % int(gN)), float(gid / int(gN)));
vec2 camL = cameraPosition.xz / uSpacing;
vec2 K = lat + gN * floor((camL - lat) / gN + 0.5);
vec2 hj = hash22(K);
vec2 root = (K + hj) * uSpacing;
float r1 = hash21(K + 17.31);
float r2 = hash21(K + 41.7);
float r3 = hash21(K - 9.2);

float dist = length(root - cameraPosition.xz);
float fade = 1.0 - smoothstep(uRadius * 0.6, uRadius * 0.96, dist);
if (uInner > 0.0) fade *= smoothstep(uInner * 0.55, uInner * 0.95, dist);

vec2 warp = biomeWarp(root);
vec4 bA = biomeA(root + warp);
vec4 bB = biomeB(root + warp);
float pathW = biomeB(root + warp * 0.12).w;
float hC = terrainHeight(root);
vec2 grad = vec2(terrainHeight(root + vec2(2.0, 0.0)) - terrainHeight(root - vec2(2.0, 0.0)), terrainHeight(root + vec2(0.0, 2.0)) - terrainHeight(root - vec2(0.0, 2.0))) / 4.0;
float steep = 1.0 - inversesqrt(1.0 + dot(grad, grad));
float meadow = max(0.0, 1.0 - dot(bA, vec4(1.0)) - bB.x - bB.y - bB.z);
float block = (1.0 - smoothstep(0.1, 0.17, steep)) * (1.0 - smoothstep(0.15, 0.45, pathW + 0.18 * snoise(root * 0.35))) * (1.0 - smoothstep(0.05, 0.25, bA.x)) * smoothstep(0.25, 0.9, hC);
float clr = clearMask(root);
block *= 1.0 - smoothstep(0.82, 0.97, clr);

vec2 fr = farmFrame(root);
vec2 parcel = farmParcel(root);
float wheatOk = parcel.x < 1.5 && parcel.y > 2.5 ? 1.0 : 0.0;
float reedZone = smoothstep(0.4, 0.8, bB.y) * (1.0 - smoothstep(1.2, 2.6, hC)) * smoothstep(0.1, 0.6, snoise(root * 0.05));
float wM = meadow * 1.0;
float wF = bA.y * wheatOk * 1.0;
float wFo = bB.x * 0.11;
float wH = bA.z * 0.14;
float wO = bA.w * 0.045;
float wR = reedZone * 0.45 * (1.0 - smoothstep(0.1, 0.4, bB.z));
float pick = r1;
float kind = -1.0;
float acc = wM * block;
if (pick < acc) kind = 0.0;
else if (pick < (acc += wF * block)) kind = 1.0;
else if (pick < (acc += wFo * block)) kind = 2.0;
else if (pick < (acc += wH * block)) kind = 3.0;
else if (pick < (acc += wO * block)) kind = 4.0;
else if (pick < (acc += wR * smoothstep(0.1, 0.4, hC))) kind = 5.0;
if (kind < 0.0) fade = 0.0;

vec2 fd = vec2(cos(FARM_ANGLE), sin(FARM_ANGLE));
if (kind == 1.0) {
  float rowC = (floor(fr.y / FARM_PERIOD) + 0.5) * FARM_PERIOD - FARM_PERIOD * 0.5;
  float across = rowC + (r2 - 0.5) * 0.55;
  root += vec2(-fd.y, fd.x) * (across - fr.y);
  clr = max(clr, clearMask(root));
  if (clr > 0.9) fade = 0.0;
}
float y0 = terrainHeightExact(root);

vec3 macro = meadowMacro(root);
float clover = cloverMask(root);
macro = mix(macro, mix(macro, C_MEADOW_BLUE, 0.35) * 0.68, clover);
float H = 0.0;
float W = 0.07;
float stiff = 1.0;
float head = 0.0;
vec3 cBase = macro;
vec3 cTip = macro;
float tall = smoothstep(-0.2, 0.7, snoise(root * 0.04 + 3.0));
if (kind == 0.0) {
  H = mix(0.32, 0.62, r2) * mix(0.75, 1.35, tall);
  W = mix(0.04, 0.065, r3);
  cBase = macro * 0.62;
  cTip = mix(macro * 1.3, C_MEADOW_TIP, 0.2) * mix(0.9, 1.12, r3);
  float fpatch = smoothstep(0.62, 0.85, snoise(root * 0.045 - 11.0));
  if (hash21(K + 3.3) < fpatch * 0.16) {
    head = 1.0;
    cTip = flowerColor(hash21(floor(root / 9.0) + hash21(K) * 0.35));
    H *= 1.15;
  }
} else if (kind == 1.0) {
  H = mix(0.85, 1.12, r2) * (parcel.x < 0.5 ? 1.0 : 0.82);
  W = 0.032;
  stiff = 2.2;
  head = 1.0;
  vec3 crop = parcel.x < 0.5 ? C_WHEAT : C_WHEAT_GREEN;
  cBase = mix(C_FURROW, crop, 0.5) * 0.7;
  cTip = crop * mix(0.8, 1.05, r3) * vec3(1.0, 0.9, 0.7);
} else if (kind == 2.0) {
  H = mix(0.24, 0.44, r2);
  W = 0.3;
  stiff = 0.45;
  cBase = C_FERN * 0.45;
  cTip = C_FERN_TIP * mix(0.55, 0.85, r3);
} else if (kind == 3.0) {
  H = mix(0.35, 0.7, r2);
  W = 0.055;
  cBase = C_HALLU_BASE;
  cTip = r3 < 0.5 ? C_MINT * 0.9 : C_VIOLET * 0.9;
} else if (kind == 4.0) {
  H = mix(0.18, 0.36, r2);
  W = 0.06;
  cBase = C_STRAW * 0.55;
  cTip = C_STRAW * 1.3;
} else if (kind == 5.0) {
  H = mix(1.1, 1.8, r2);
  W = 0.035;
  stiff = 1.6;
  head = r3 < 0.35 ? 1.0 : 0.0;
  cBase = C_REED * 0.6;
  cTip = head > 0.5 ? vec3(0.16, 0.09, 0.05) : C_REED_TIP;
}
H *= fade * (1.0 - clr);
W *= mix(0.4, 1.0, fade) * uWidthScale;

vec2 wd = normalize(uWind.xy + 1e-4);
float ws = uWind.z;
float speed = 2.5 + ws * 0.9;
float gust = 0.5 + 0.5 * snoise((root - wd * uTime * speed) / 34.0);
gust = gust * gust;
float sway = sin(uTime * (3.5 + r3 * 2.0) + r1 * 6.2831 + dot(root, wd) * 0.5);
vec2 bendDir = wd;
float bend = ((0.1 + 0.85 * gust) * clamp(ws / 4.0, 0.0, 1.6) + 0.07 * sway) / stiff;
if (kind == 3.0) {
  float a = r2 * 6.2831;
  bendDir = vec2(cos(a), sin(a));
  bend = 0.35 * sin(uTime * 1.3 - r1 * 9.0) + 0.15 * sin(uTime * 3.1 + r3 * 7.0);
}
vec2 b = bendDir * bend + (vec2(r2, r3) - 0.5) * 0.35;
vec2 pd = root - uPlayerPos.xz;
float pl = length(pd);
float push = (1.0 - smoothstep(0.25, 1.3, pl)) * (1.0 - smoothstep(1.5, 2.5, abs(y0 - uPlayerPos.y + 0.5)));
b += (pd / max(pl, 0.01)) * push * 1.4;
if (kind == 2.0) b += vec2(-sin(r3 * 6.2831), cos(r3 * 6.2831)) * 0.9;
float m = min(length(b), 1.4);
b = b / max(length(b), 1e-4) * m;

float t = position.y;
float yaw = r3 * 6.2831;
vec3 side = vec3(cos(yaw), 0.0, sin(yaw));
float wt = pow(max(1.0 - t, 0.0), 0.7);
if (head > 0.5 && t > 0.7) wt = (kind == 0.0 ? 1.6 : 1.4) * (1.0 - smoothstep(0.85, 1.0, t)) + 0.3;
if (kind == 2.0) {
  wt = smoothstep(0.0, 0.35, t) * pow(max(1.0 - t, 0.0), 0.5) * 1.5 + 0.08;
}
float droop = head > 0.5 && kind == 1.0 ? 0.25 : 0.0;
vec3 gPos = vec3(root.x, y0, root.y)
  + side * position.x * W * wt
  + vec3(0.0, H * t * (1.0 - 0.32 * m * m * t), 0.0)
  + vec3(b.x, 0.0, b.y) * H * (t * t * 0.85 + droop * t * t * t);
if (fade <= 0.0) gPos = vec3(root.x, y0 - 50.0, root.y);
vec3 tang = normalize(vec3(b.x * H * 1.7 * t, H, b.y * H * 1.7 * t));
vec3 bladeN = normalize(cross(side, tang));
vec3 objectNormal = normalize(mix(bladeN, vec3(0.0, 1.0, 0.0), 0.6));
vGrassT = t;
vGrassHead = head > 0.5 && t > 0.7 ? 1.0 : 0.0;
vGrassCol = mix(cBase, cTip, smoothstep(0.0, 1.0, t));
if (vGrassHead > 0.5) vGrassCol = cTip;
`;

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vGrassCol;
varying float vGrassT;
varying float vGrassHead;
`;

const FRAGMENT_MAP = /* glsl */ `
diffuseColor.rgb = vGrassCol;
vec3 gView = normalize(vDhWorldPos - cameraPosition);
float gBack = pow(max(dot(gView, uSunDir), 0.0), 3.0) * smoothstep(0.0, 0.2, uSunDir.y + 0.05);
`;

function onShader(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <clipping_planes_pars_vertex>', `#include <clipping_planes_pars_vertex>\n${GLSL.envPars}\n${VERTEX_PARS}`)
    .replace('#include <beginnormal_vertex>', VERTEX_BLADE)
    .replace('#include <begin_vertex>', 'vec3 transformed = gPos;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <clipping_planes_pars_fragment>', `#include <clipping_planes_pars_fragment>\n${FRAGMENT_PARS}`)
    .replace('#include <map_fragment>', FRAGMENT_MAP)
    .replace('#include <normal_fragment_maps>', 'normal = normalize(vNormal);')
    .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += vGrassCol * uSunColor * gBack * (0.25 + 0.35 * vGrassT) + vGrassCol * vGrassHead * 0.04 * (1.0 - uNight);');
}

function bladeGeometry(rows) {
  const pos = [];
  for (const t of rows) pos.push(-0.5, t, 0, 0.5, t, 0);
  pos.push(0, 1, 0);
  const idx = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const last = (rows.length - 1) * 2;
  idx.push(last, last + 1, last + 2);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

export function createGrass(ctx) {
  const { mat, scene, quality, world, events } = ctx;
  const maskData = new Uint8Array(MASK_SIZE * MASK_SIZE);
  const mask = new THREE.DataTexture(maskData, MASK_SIZE, MASK_SIZE, THREE.RedFormat, THREE.UnsignedByteType);
  mask.minFilter = THREE.LinearFilter;
  mask.magFilter = THREE.LinearFilter;
  mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping;
  mask.generateMipmaps = false;
  mask.needsUpdate = true;
  const clearMask = { value: mask };
  const rings = [
    { share: 0.52, radius: 24, inner: 0, rows: [0, 0.45, 0.8], widthScale: 1 },
    { share: 0.48, radius: 72, inner: 24, rows: [0, 0.62], widthScale: 1.9 },
  ].map((def) => {
    const uniforms = {
      uGrassN: { value: 1 }, uSpacing: { value: 1 }, uRadius: { value: def.radius }, uInner: { value: def.inner },
      uWidthScale: { value: def.widthScale }, uClearMask: clearMask,
    };
    const geometry = bladeGeometry(def.rows);
    const material = mat.standard(
      { color: 0xffffff, roughness: 0.78, metalness: 0, side: THREE.DoubleSide },
      { onShader: (shader) => onShader(shader, uniforms) },
    );
    material.name = `grass:${def.radius}`;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = material.name;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    return { def, uniforms, geometry, material, mesh };
  });

  function applyCount() {
    const total = Math.max(0, quality.grassBlades | 0);
    for (const r of rings) {
      const n = Math.max(2, Math.floor(Math.sqrt(total * r.def.share)));
      r.uniforms.uGrassN.value = n;
      r.uniforms.uSpacing.value = (r.def.radius * 2) / n;
      r.geometry.instanceCount = n * n;
      r.mesh.visible = total > 0;
    }
  }
  applyCount();
  events.on('quality:change', applyCount);

  return {
    rings: rings.map((r) => r.mesh),
    setClearings() {
      maskData.fill(0);
      const texel = world.SIZE / MASK_SIZE;
      for (const c of world.clearings) {
        if (!c.grass) continue;
        const outer = c.r + MASK_EDGE;
        const cx = (c.x + world.HALF) / texel - 0.5;
        const cz = (c.z + world.HALF) / texel - 0.5;
        const ro = outer / texel;
        const i0 = Math.max(0, Math.floor(cx - ro));
        const i1 = Math.min(MASK_SIZE - 1, Math.ceil(cx + ro));
        const j0 = Math.max(0, Math.floor(cz - ro));
        const j1 = Math.min(MASK_SIZE - 1, Math.ceil(cz + ro));
        for (let j = j0; j <= j1; j++) {
          const dz = (j - cz) * texel;
          const row = j * MASK_SIZE;
          for (let i = i0; i <= i1; i++) {
            const dx = (i - cx) * texel;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d >= outer) continue;
            const v = Math.round(255 * Math.min(1, (outer - d) / MASK_EDGE));
            if (v > maskData[row + i]) maskData[row + i] = v;
          }
        }
      }
      mask.needsUpdate = true;
    },
    stats() {
      return rings.map((r) => ({ blades: r.geometry.instanceCount, spacing: r.uniforms.uSpacing.value }));
    },
  };
}
