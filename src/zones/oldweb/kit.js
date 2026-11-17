import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLSL } from '../../core/glsl.js';
import { noise2, seeded } from '../../core/rng.js';

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const KEEP = ['position', 'normal', 'uv'];

export const PI = Math.PI;
export const nz = (x, y, z, k = 1) => noise2(x * k + z * 0.71 * k + 11.3, y * k - z * 1.13 * k + 4.1);
export const euler = (x, y, z, order = 'YXZ') => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, order));

export class Parts {
  constructor(seed = 1) {
    this.items = [];
    this.r = seeded(seed);
  }

  add(geo, { color = '#ffffff', metal = 0, glow = null, pos, rot, scale, quat, matrix, jitter = 0, jitterK = 9, vary = 0.12, varyK = 5, uvRect } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    _s.set(1, 1, 1);
    if (scale !== undefined) _s.fromArray(Array.isArray(scale) ? scale : [scale, scale, scale]);
    if (quat) _q.copy(quat);
    else if (rot) _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], rot[3] || 'XYZ'));
    else _q.identity();
    _m.compose(pos ? _v.fromArray(pos) : _v.set(0, 0, 0), _q, _s);
    if (matrix) _m.premultiply(matrix);
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    const n = p.count;
    if (jitter) {
      for (let i = 0; i < n; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        p.setXYZ(i, x + jitter * nz(x, y, z, jitterK), y + jitter * nz(x + 7, y, z, jitterK), z + jitter * nz(x, y + 3, z + 5, jitterK));
      }
    }
    g.applyMatrix4(_m);
    const col = new Float32Array(n * 3);
    const met = new Float32Array(n).fill(metal);
    const glw = new Float32Array(n * 3);
    const base = new THREE.Color(color);
    const shift = this.r() * 40;
    for (let i = 0; i < n; i++) {
      const v = 1 + vary * nz(p.getX(i) + shift, p.getY(i), p.getZ(i), varyK);
      _c.copy(base).multiplyScalar(v);
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
      if (glow) {
        glw[i * 3] = glow[0];
        glw[i * 3 + 1] = glow[1] || 0;
        glw[i * 3 + 2] = glow[2] || 0;
      }
      if (uvRect) uv.setXY(i, uvRect[0] + uv.getX(i) * (uvRect[2] - uvRect[0]), uvRect[1] + uv.getY(i) * (uvRect[3] - uvRect[1]));
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aMetal', new THREE.BufferAttribute(met, 1));
    g.setAttribute('aGlow', new THREE.BufferAttribute(glw, 3));
    this.items.push(g);
    return this;
  }

  box(w, h, d, { radius = 0.015, segments = 1, ...o } = {}) {
    return this.add(new RoundedBoxGeometry(w, h, d, segments, Math.min(radius, w / 2.01, h / 2.01, d / 2.01)), o);
  }

  get empty() {
    return this.items.length === 0;
  }

  build() {
    const g = mergeGeometries(this.items, false);
    for (const i of this.items) i.dispose();
    this.items = [];
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

export function lathe(points, segments = 24, phiStart = 0, phiLength = PI * 2) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments, phiStart, phiLength);
}

export function rock(radius = 1, { detail = 2, seed = 1, rough = 0.28, flatTop = null, stretch = [1, 1, 1] } = {}) {
  const ico = new THREE.IcosahedronGeometry(radius, detail);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const g = mergeVertices(ico);
  const p = g.attributes.position;
  const s = seed * 13.17;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    const n = nz(_v.x + s, _v.y, _v.z, 1.3 / radius) * 0.65 + nz(_v.x, _v.y + s, _v.z, 3.1 / radius) * 0.35;
    _v.multiplyScalar(1 + rough * n);
    if (flatTop !== null && _v.y > flatTop) _v.y = flatTop + (_v.y - flatTop) * 0.06;
    _v.set(_v.x * stretch[0], _v.y * stretch[1], _v.z * stretch[2]);
    p.setXYZ(i, _v.x, _v.y, _v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function taperedSegment(a, b, r0, r1, radial = 6) {
  const dir = _v.subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1, false);
  g.translate(0, len / 2, 0);
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyQuaternion(_q);
  g.translate(a.x, a.y, a.z);
  return g;
}

const METAL_GLOW = /* glsl */ `
#include <common>
attribute float aMetal;
attribute vec3 aGlow;
varying float vMetal;
varying vec3 vGlow;
`;

function patchVertex(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', METAL_GLOW)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMetal = aMetal;\nvGlow = aGlow;');
}

const FRAG_HEAD = `#include <common>\nvarying float vMetal;\nvarying vec3 vGlow;\n${GLSL.noise}`;
const METAL_FRAG = `#include <metalnessmap_fragment>
metalnessFactor = max(metalnessFactor, vMetal);
roughnessFactor = clamp(roughnessFactor * mix(1.0, 0.6, vMetal), 0.05, 1.0);`;
const GLOW_FRAG = `#include <emissivemap_fragment>
float dhBlink = vGlow.y > 0.0 ? step(0.45, fract(uTime * vGlow.y + vGlow.z)) : 1.0;
totalEmissiveRadiance += diffuseColor.rgb * vGlow.x * dhBlink;`;

export function plainPatch(shader) {
  patchVertex(shader);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', FRAG_HEAD)
    .replace('#include <metalnessmap_fragment>', METAL_FRAG)
    .replace('#include <emissivemap_fragment>', GLOW_FRAG);
}

export function sandstonePatch(shader) {
  patchVertex(shader);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', FRAG_HEAD)
    .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 wp = vDhWorldPos;
  float warp = fbm(wp.xz * 0.045) * 1.6;
  float band = sin(wp.y * 2.6 + warp * 3.0);
  float grain = vnoise(wp * 7.0) * 0.5 + vnoise(wp * 23.0) * 0.25;
  float blot = smoothstep(0.15, 0.7, fbm(wp.xz * 0.35 + wp.y * 0.2));
  diffuseColor.rgb *= 0.9 + 0.07 * band + 0.1 * grain;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 0.86, 0.72), blot * 0.35);
  float low = 1.0 - smoothstep(0.0, 0.7, wp.y - terrainHeight(wp.xz));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.2, 0.1), low * 0.45);
}`)
    .replace('#include <metalnessmap_fragment>', METAL_FRAG)
    .replace('#include <emissivemap_fragment>', GLOW_FRAG)
    .replace('void main() {', `${GLSL.world}\nvoid main() {`);
}

export function rustPatch(shader) {
  patchVertex(shader);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', FRAG_HEAD)
    .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 wp = vDhWorldPos;
  float r = fbm(wp * 1.7) * 0.5 + 0.5;
  float pits = smoothstep(0.55, 0.85, vnoise(wp * 9.0) * 0.5 + 0.5);
  vec3 rust = mix(vec3(0.42, 0.13, 0.04), vec3(0.75, 0.33, 0.1), r);
  float amount = smoothstep(0.25, 0.75, r + 0.2 * vnoise(wp * 4.0)) * vMetal;
  diffuseColor.rgb = mix(diffuseColor.rgb, rust, amount * 0.85);
  diffuseColor.rgb *= 1.0 - pits * 0.35 * vMetal;
}`)
    .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
{
  float rr = fbm(vDhWorldPos * 1.7) * 0.5 + 0.5;
  float bare = (1.0 - smoothstep(0.25, 0.75, rr)) * vMetal;
  metalnessFactor = bare * 0.7;
  roughnessFactor = mix(0.95, 0.45, bare);
}`)
    .replace('#include <emissivemap_fragment>', GLOW_FRAG);
}

export function pagesPatch(shader) {
  patchVertex(shader);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', FRAG_HEAD)
    .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 wp = vDhWorldPos;
  float cellV = fract(vMapUv.y * 4.0);
  float dust = smoothstep(0.35, 0.95, fbm(wp.xz * 1.3 + wp.y * 0.9) * 0.5 + 0.5 + (0.32 - cellV) * 0.9);
  float scratch = smoothstep(0.9, 0.98, vnoise(vec2(wp.x * 40.0 + wp.z * 40.0, wp.y * 3.0)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.55, 0.38), clamp(dust * 0.5 + scratch * 0.35, 0.0, 1.0));
}`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * (0.3 + 0.42 * uNight);`);
}

export function createMaterials(ctx) {
  const { mat } = ctx;
  return {
    sandstone: mat.standard({ vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.25 }, { onShader: sandstonePatch }),
    rust: mat.standard({ vertexColors: true, roughness: 0.8, metalness: 0, envMapIntensity: 0.6 }, { onShader: rustPatch }),
    wood: mat.standard({ vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.25 }, { onShader: plainPatch }),
    plastic: mat.standard({ vertexColors: true, roughness: 0.55, metalness: 0, envMapIntensity: 0.6 }, { onShader: plainPatch }),
  };
}

export const SIGN_VERTEX = /* glsl */ `
attribute vec3 aGlow;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vGlow;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vColor = color;
  vGlow = aGlow;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormalW = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const SIGN_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.fog}
uniform sampler2D uMap;
uniform float uLit;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vGlow;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vec3 base = texture2D(uMap, vUv).rgb * vColor;
  float nl = length(vNormalW);
  vec3 N = nl > 1e-5 ? vNormalW / nl : vec3(0.0, 1.0, 0.0);
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 amb = mix(uGroundColor, uSkyColor, N.y * 0.5 + 0.5);
  vec3 lit = base * (uSunColor * ndl * 0.3 + amb * 0.75) * uLit;
  float blink = vGlow.y > 0.0 ? step(0.45, fract(uTime * vGlow.y + vGlow.z)) : 1.0;
  vec3 col = lit + base * vGlow.x * blink;
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const SCREEN_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.fog}
uniform sampler2D uMap;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vGlow;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vec3 t = texture2D(uMap, vUv).rgb;
  float sl = 0.78 + 0.22 * sin(vWorld.y * 900.0);
  float roll = 1.0 + 0.08 * sin(vWorld.y * 9.0 - uTime * 2.1 + vGlow.z * 6.0);
  float flick = 1.0 + 0.03 * sin(uTime * 47.0 + vGlow.z * 9.0);
  float power = vGlow.y > 0.0 ? mix(0.25, 1.0, step(0.08, fract(uTime * vGlow.y + vGlow.z))) : 1.0;
  vec3 col = t * sl * roll * flick * vGlow.x * power * vColor;
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
