import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLSL } from '../../core/glsl.js';

export const RING_Y = 2.82;
export const RING_R = 0.34;
export const SCREEN = { y: 1.42, w: 0.44, h: 0.33, z: 0 };
export const BEAM_HEIGHT = 1500;

const SEGMENTS = 8;
const PHI = Math.PI / SEGMENTS;

function lathe(profile, kind) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), SEGMENTS, PHI).toNonIndexed();
  g.computeVertexNormals();
  return tag(g, kind);
}

function tag(geo, kind) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(kind), 1));
  return g;
}

function arm(from, to, radius) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(radius * 0.8, radius, len, 6, 1);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  g.translate(a.x, a.y, a.z);
  return tag(g, 1);
}

export function pylonGeometry() {
  const stone = lathe([
    [0.001, 0], [0.82, 0], [0.84, 0.05], [0.84, 0.2], [0.74, 0.3], [0.56, 0.32], [0.54, 0.4],
    [0.53, 0.42], [0.47, 1.9], [0.46, 2.02], [0.55, 2.08], [0.56, 2.22], [0.44, 2.3], [0.3, 2.34], [0.001, 2.35],
  ], 0);
  const collarLow = lathe([[0.53, 0.42], [0.575, 0.44], [0.575, 0.56], [0.52, 0.58]], 1);
  const collarHigh = lathe([[0.47, 1.84], [0.51, 1.86], [0.51, 1.94], [0.465, 1.96]], 1);
  const crown = lathe([[0.001, 2.34], [0.22, 2.34], [0.24, 2.38], [0.2, 2.44], [0.12, 2.47], [0.001, 2.48]], 1);

  const apothem = 0.49 * Math.cos(PHI);
  const outer = new THREE.Shape();
  const w = SCREEN.w + 0.11;
  const h = SCREEN.h + 0.11;
  outer.moveTo(-w / 2 + 0.04, -h / 2);
  outer.lineTo(w / 2 - 0.04, -h / 2);
  outer.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + 0.04);
  outer.lineTo(w / 2, h / 2 - 0.04);
  outer.quadraticCurveTo(w / 2, h / 2, w / 2 - 0.04, h / 2);
  outer.lineTo(-w / 2 + 0.04, h / 2);
  outer.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - 0.04);
  outer.lineTo(-w / 2, -h / 2 + 0.04);
  outer.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + 0.04, -h / 2);
  const hole = new THREE.Path();
  hole.moveTo(-SCREEN.w / 2, -SCREEN.h / 2);
  hole.lineTo(-SCREEN.w / 2, SCREEN.h / 2);
  hole.lineTo(SCREEN.w / 2, SCREEN.h / 2);
  hole.lineTo(SCREEN.w / 2, -SCREEN.h / 2);
  hole.lineTo(-SCREEN.w / 2, -SCREEN.h / 2);
  outer.holes.push(hole);
  const bezelGeo = new THREE.ExtrudeGeometry(outer, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 3 });
  bezelGeo.translate(0, SCREEN.y, apothem - 0.03);
  const bezel = tag(bezelGeo, 1);
  const back = tag(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h).translate(0, SCREEN.y, apothem + 0.005), 2);
  SCREEN.z = apothem + 0.012;

  const ringCenter = [0, RING_Y, 0];
  const at = (deg) => [Math.cos(THREE.MathUtils.degToRad(deg)) * (RING_R + 0.02), ringCenter[1] + Math.sin(THREE.MathUtils.degToRad(deg)) * (RING_R + 0.02), 0];
  const arms = [
    arm([0.14, 2.42, 0], at(-58), 0.035),
    arm([-0.14, 2.42, 0], at(-122), 0.035),
  ];
  const geo = mergeGeometries([stone, collarLow, collarHigh, crown, bezel, back, ...arms]);
  geo.computeBoundingSphere();
  return geo;
}

export function ringGeometry() {
  const g = new THREE.TorusGeometry(RING_R, 0.05, 14, 56);
  const inner = new THREE.TorusGeometry(RING_R * 0.62, 0.018, 8, 40);
  const spokes = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.CylinderGeometry(0.014, 0.014, RING_R * 0.4, 6);
    s.translate(0, RING_R * 0.81, 0);
    s.rotateZ((i / 3) * Math.PI * 2);
    spokes.push(s);
  }
  const merged = mergeGeometries([g, inner, ...spokes].map((x) => {
    const n = x.toNonIndexed();
    n.deleteAttribute('uv');
    return n;
  }));
  return merged;
}

const PYLON_PARS = /* glsl */ `
varying float vKind;
varying float vUp;
varying vec3 vLocalPos;
`;

export function pylonMaterial(ctx) {
  return ctx.mat.standard({ color: 0xffffff, roughness: 0.9, metalness: 0 }, {
    onShader(shader) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nattribute float aKind;\n${PYLON_PARS}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vKind = aKind;
vLocalPos = position;
mat3 dhNormalM = mat3(modelMatrix);
#ifdef USE_INSTANCING
dhNormalM = dhNormalM * mat3(instanceMatrix);
#endif
vUp = normalize(dhNormalM * normal).y;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${PYLON_PARS}\n${GLSL.noise}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
vec3 wp = vDhWorldPos;
float dhRough = 0.9;
float dhMetal = 0.0;
if (vKind < 0.5) {
  float n1 = fbm(wp * 1.6);
  float strata = vnoise(vec2((wp.x + wp.z) * 2.0, wp.y * 9.0));
  vec3 stone = mix(vec3(0.34, 0.31, 0.27), vec3(0.52, 0.48, 0.41), 0.5 + 0.5 * n1);
  stone *= 0.9 + 0.12 * strata;
  float streak = smoothstep(0.35, 0.8, vnoise(vec2((wp.x - wp.z) * 6.0, wp.y * 0.7))) * smoothstep(2.3, 0.6, vLocalPos.y);
  stone *= 1.0 - 0.28 * streak;
  float grime = smoothstep(0.7, 0.0, vLocalPos.y);
  stone *= 1.0 - 0.3 * grime;
  float lichenN = fbm(wp * 3.1 + 4.0) + vUp * 0.45 + grime * 0.25;
  float lichen = smoothstep(0.32, 0.5, lichenN);
  float spots = smoothstep(0.62, 0.7, vnoise(wp.xz * 9.0 + wp.y * 5.0));
  vec3 lichenCol = mix(vec3(0.26, 0.3, 0.12), vec3(0.42, 0.42, 0.17), vnoise(wp.xy * 11.0) * 0.5 + 0.5);
  stone = mix(stone, lichenCol, lichen * 0.85);
  stone = mix(stone, vec3(0.62, 0.36, 0.12), spots * (1.0 - lichen) * 0.6);
  diffuseColor.rgb = stone;
} else if (vKind < 1.5) {
  float p = fbm(wp * 4.0 + 9.0) + (1.0 - vUp) * 0.15;
  float patina = smoothstep(0.12, 0.55, p) * 0.85;
  vec3 bronze = vec3(0.5, 0.32, 0.14) * (0.85 + 0.3 * vnoise(wp.xy * 30.0));
  vec3 verdigris = mix(vec3(0.2, 0.33, 0.27), vec3(0.3, 0.44, 0.37), vnoise(wp.yz * 14.0) * 0.5 + 0.5);
  diffuseColor.rgb = mix(bronze, verdigris, patina);
  dhRough = mix(0.38, 0.85, patina);
  dhMetal = mix(0.75, 0.1, patina);
} else {
  diffuseColor.rgb = vec3(0.012, 0.014, 0.012);
  dhRough = 0.2;
}`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = dhRough;')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = dhMetal;');
    },
  });
}

export function ringMaterial(ctx) {
  return ctx.mat.standard({ color: new THREE.Color('#7a5a30'), roughness: 0.35, metalness: 0.55 }, {
    onShader(shader) {
      shader.uniforms.uRingAmber = { value: new THREE.Color('#ffb454') };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aGlow;\nvarying vec2 vGlow;\nvarying vec3 vRingLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;\nvRingLocal = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform vec3 uRingAmber;\nvarying vec2 vGlow;\nvarying vec3 vRingLocal;\n${GLSL.noise}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float rr = length(vRingLocal.xy);
float groove = smoothstep(0.03, 0.0, abs(rr - ${RING_R.toFixed(3)}) - 0.035) ;
float run = 0.75 + 0.25 * sin(atan(vRingLocal.y, vRingLocal.x) * 3.0 - uTime * 2.0);
float ember = 0.8 + 0.2 * vnoise(vRingLocal.xy * 20.0 + uTime * 0.5);
totalEmissiveRadiance += uRingAmber * vGlow.x * ember * mix(1.0, run, vGlow.y) * (0.45 + 0.55 * groove);
diffuseColor.rgb *= 1.0 - min(vGlow.x, 1.0) * 0.6;`);
    },
  });
}

const SCREEN_VERTEX = /* glsl */ `
attribute vec4 aRect;
attribute vec4 aScreen;
varying vec2 vUv;
varying vec2 vRaw;
varying vec4 vScreen;
varying vec3 vWorld;
void main() {
  vRaw = uv;
  vUv = aRect.xy + uv * aRect.zw;
  vScreen = aScreen;
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const SCREEN_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.noise}
${GLSL.fog}
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec2 vRaw;
varying vec4 vScreen;
varying vec3 vWorld;
void main() {
  float bright = vScreen.x;
  float staticAmt = vScreen.y;
  float roll = fract(vRaw.y * 0.5 - uTime * 0.23);
  vec2 uv = vUv;
  uv.x += (hash21(vec2(floor(vRaw.y * 90.0), floor(uTime * 24.0))) - 0.5) * 0.004 * staticAmt;
  vec3 tex = texture2D(uAtlas, uv).rgb;
  float snow = hash21(floor(vRaw * vec2(160.0, 120.0)) + floor(uTime * 30.0) * 7.31);
  vec3 col = tex * bright * (0.9 + 0.1 * smoothstep(0.0, 0.05, roll));
  col += vec3(0.5, 0.62, 0.55) * snow * staticAmt * 0.16;
  col *= 0.92 + 0.08 * sin(uTime * 60.0 + vRaw.y * 3.0);
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function screenMaterial(ctx, atlas) {
  return ctx.mat.shader({ vertexShader: SCREEN_VERTEX, fragmentShader: SCREEN_FRAGMENT, uniforms: { uAtlas: { value: atlas } } });
}

export function beamGeometry() {
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 28, 40, true);
  cyl.translate(0, 0.5, 0);
  const quad = new THREE.PlaneGeometry(2, 2);
  const parts = [cyl.toNonIndexed(), quad.toNonIndexed()];
  parts[0].setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(parts[0].attributes.position.count).fill(0), 1));
  parts[1].setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(parts[1].attributes.position.count).fill(1), 1));
  const geo = mergeGeometries(parts);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, BEAM_HEIGHT / 2, 0), BEAM_HEIGHT * 0.6);
  return geo;
}

const BEAM_VERTEX = /* glsl */ `
${GLSL.envPars}
attribute float aPart;
attribute vec4 aBeam;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vHeight;
varying float vPart;
varying vec2 vQuad;
varying vec4 vBeam;
varying float vWiden;
varying vec3 vBase;
void main() {
  vPart = aPart;
  vBeam = aBeam;
  vec3 base = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vBase = base;
  vQuad = position.xy;
  vWiden = 1.0;
  if (aPart > 0.5) {
    vec4 view = viewMatrix * vec4(base, 1.0);
    float s = (1.3 + aBeam.w * 3.0) * max(1.0, -view.z * 0.012);
    view.xy += position.xy * s;
    view.z += 1.0;
    vWorld = base;
    vHeight = 0.0;
    vNormalW = vec3(0.0, 0.0, 1.0);
    gl_Position = projectionMatrix * view;
    return;
  }
  float h = position.y * ${BEAM_HEIGHT.toFixed(1)} * aBeam.x;
  vHeight = h;
  float r = 0.3 + 0.32 * exp(-h / 4.0) + h * 0.0035;
  vec3 axis = base + vec3(0.0, h, 0.0);
  float d = length(cameraPosition - axis);
  float minR = d * 0.0036;
  vWiden = max(1.0, minR / r);
  r = max(r, minR);
  vec3 w = axis + vec3(position.x, 0.0, position.z) * r;
  vWorld = w;
  vNormalW = normalize(vec3(position.x, 0.0, position.z));
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

const BEAM_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.noise}
${GLSL.fog}
uniform vec3 uAmber;
uniform vec3 uCore;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vHeight;
varying float vPart;
varying vec2 vQuad;
varying vec4 vBeam;
varying float vWiden;
varying vec3 vBase;
void main() {
  float power = vBeam.y;
  float dayK = mix(1.0, 1.6, uNight);
  if (vPart > 0.5) {
    float d = length(vQuad);
    float g = exp(-d * d * 10.0) * 1.2 + exp(-d * 3.0) * 0.25;
    float streak = exp(-abs(vQuad.y) * 30.0) * exp(-abs(vQuad.x) * 2.2) * 0.5;
    g = (g + streak) * smoothstep(1.0, 0.8, d);
    vec3 col = mix(uAmber, uCore, exp(-d * 6.0)) * g * (power * mix(0.32, 0.8, uNight) + vBeam.w * 1.6);
    gl_FragColor = vec4(applyFogAdditive(col, vWorld), 0.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }
  vec3 toCam = cameraPosition - vWorld;
  vec3 V = normalize(vec3(toCam.x, 0.0, toCam.z));
  float facing = abs(dot(V, vNormalW));
  float core = pow(facing, 7.0);
  float soft = pow(facing, 1.6);
  float len = ${BEAM_HEIGHT.toFixed(1)} * vBeam.x;
  float a = atan(vNormalW.z, vNormalW.x);
  float rise = vHeight * 0.025 - uTime * 0.55;
  float n = vnoise(vec2(a * 2.0 + vBeam.z * 10.0, rise)) * 0.5 + vnoise(vec2(a * 5.0, rise * 2.7 + 3.0)) * 0.25;
  float streaks = 0.72 + 0.4 * n;
  float topFade = 1.0 - smoothstep(len * 0.45, len, vHeight);
  float baseHot = 1.0 + 0.7 * exp(-vHeight / 4.0);
  float head = vBeam.x < 0.999 ? exp(-max(len - vHeight, 0.0) / 14.0) * 3.0 : 0.0;
  float energy = (core * 1.0 + soft * 0.2 * streaks) * topFade * baseHot + head * soft;
  energy /= mix(1.0, vWiden, 0.8);
  vec3 tint = mix(vec3(1.0, 0.5, 0.16), uAmber, uNight);
  vec3 col = mix(tint, uCore, core * 0.3) * energy * power * dayK * mix(0.85, 1.1, uNight);
  float fog = fogFactor(vWorld);
  col *= 1.0 - fog * 0.82;
  float cover = clamp(energy * power * (1.0 - fog) * 0.45, 0.0, 0.55) * (1.0 - uNight * 0.8);
  gl_FragColor = vec4(col, cover);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function beamMaterial(ctx) {
  return ctx.mat.shader({
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
    uniforms: { uAmber: { value: new THREE.Color('#ffb454') }, uCore: { value: new THREE.Color('#fff1d6') } },
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
}

const EMBER_VERTEX = /* glsl */ `
${GLSL.envPars}
uniform float uScale;
attribute vec4 aSeed;
attribute float aAmount;
varying float vAlpha;
varying vec3 vWorld;
void main() {
  float speed = 0.22 + aSeed.w * 0.25;
  float phase = fract(uTime * speed + aSeed.x);
  float ang = aSeed.y * 6.2831 + uTime * (0.4 + aSeed.z);
  float r = 0.2 + aSeed.z * 0.35 + phase * 0.5;
  vec3 p = position + vec3(cos(ang) * r, phase * (2.6 + aSeed.z * 2.0) - 0.3, sin(ang) * r);
  p.xz += uWind.xy * phase * phase * 0.8;
  vWorld = p;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  vAlpha = smoothstep(0.0, 0.15, phase) * (1.0 - phase) * min(aAmount, 3.0) * smoothstep(160.0, 60.0, dist);
  float flick = 0.7 + 0.3 * sin(uTime * 13.0 + aSeed.x * 50.0);
  vAlpha *= flick;
  gl_PointSize = vAlpha > 0.001 ? (0.05 + aSeed.w * 0.04) * uScale / max(dist, 0.1) : 0.0;
  gl_Position = projectionMatrix * mv;
}
`;

const EMBER_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.fog}
uniform vec3 uAmber;
varying float vAlpha;
varying vec3 vWorld;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float g = exp(-d * d * 4.0) * smoothstep(1.0, 0.6, d);
  vec3 col = mix(uAmber, vec3(1.0, 0.85, 0.6), g) * g * vAlpha * mix(2.0, 4.0, uNight);
  gl_FragColor = vec4(applyFogAdditive(col, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function emberMaterial(ctx) {
  return ctx.mat.shader({
    vertexShader: EMBER_VERTEX,
    fragmentShader: EMBER_FRAGMENT,
    uniforms: { uAmber: { value: new THREE.Color('#ffb454') }, uScale: { value: 600 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
