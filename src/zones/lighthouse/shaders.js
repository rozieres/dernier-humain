import * as THREE from 'three';
import { GLSL } from '../../core/glsl.js';

const HEAD = `${GLSL.envPars}\n${GLSL.noise}\n${GLSL.fog}`;
const TAIL = '#include <tonemapping_fragment>\n#include <colorspace_fragment>';

const GLOW_VERTEX = /* glsl */ `
${GLSL.envPars}
uniform float uSize;
uniform float uMinAngle;
uniform float uDepthBias;
uniform vec2 uBeam;
uniform float uBeamGain;
uniform float uBeamGrow;
varying vec2 vUv;
varying vec3 vCenter;
varying float vFlash;
void main() {
  vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float dist = max(-mv.z, 0.01);
  vec2 toCam = cameraPosition.xz - vCenter.xz;
  float tl = length(toCam);
  toCam = tl > 1e-3 ? toCam / tl : vec2(1.0, 0.0);
  float align = abs(dot(toCam, uBeam));
  float flash = uBeamGain > 0.0 ? pow(clamp(align, 0.0, 1.0), 90.0) : 0.0;
  vFlash = flash;
  float s = max(uSize, dist * uMinAngle) * (1.0 + uBeamGrow * flash);
  mv.xy += position.xy * s;
  mv.z += min(uDepthBias, dist * 0.5);
  vUv = position.xy;
  gl_Position = projectionMatrix * mv;
}
`;

const GLOW_FRAGMENT = /* glsl */ `
${HEAD}
uniform vec3 uColor;
uniform float uIntensity;
uniform float uFogKeep;
uniform float uNightGate;
uniform float uBeamGain;
uniform float uCore;
varying vec2 vUv;
varying vec3 vCenter;
varying float vFlash;
void main() {
  float r = length(vUv);
  float core = exp(-r * r * uCore);
  float halo = exp(-r * 4.0) * 0.4;
  float shape = (core + halo) * (1.0 - smoothstep(0.7, 1.0, r));
  float fog = fogFactor(vCenter);
  float keep = mix(1.0 - fog, 1.0, uFogKeep);
  float gate = mix(1.0, smoothstep(0.2, 0.85, uNight), uNightGate);
  vec3 col = uColor * uIntensity * shape * keep * gate * (1.0 + uBeamGain * vFlash);
  gl_FragColor = vec4(col, 1.0);
  ${TAIL}
}
`;

export function glowMaterial(ctx, { color = '#ffb454', intensity = 3, size = 1, minAngle = 0.005, fogKeep = 0.6, nightGate = 0, core = 10, depthBias = 0, beamGain = 0, beamGrow = 0 } = {}) {
  return ctx.mat.shader({
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uSize: { value: size },
      uMinAngle: { value: minAngle },
      uFogKeep: { value: fogKeep },
      uNightGate: { value: nightGate },
      uCore: { value: core },
      uDepthBias: { value: depthBias },
      uBeam: { value: new THREE.Vector2(1, 0) },
      uBeamGain: { value: beamGain },
      uBeamGrow: { value: beamGrow },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function glowSprite(ctx, opts) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), glowMaterial(ctx, opts));
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

const BEAM_VERTEX = /* glsl */ `
attribute float aT;
attribute float aGain;
varying vec3 vWorld;
varying vec3 vN;
varying float vT;
varying float vGain;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = mat3(modelMatrix) * normal;
  vT = aT;
  vGain = aGain;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const BEAM_FRAGMENT = /* glsl */ `
${HEAD}
uniform vec3 uColor;
uniform float uIntensity;
varying vec3 vWorld;
varying vec3 vN;
varying float vT;
varying float vGain;
void main() {
  vec3 V = cameraPosition - vWorld;
  float d = length(V);
  V = d > 1e-3 ? V / d : vec3(0.0, 1.0, 0.0);
  float nl = length(vN);
  vec3 N = nl > 1e-4 ? vN / nl : vec3(0.0, 1.0, 0.0);
  float f = clamp(abs(dot(N, V)), 0.0, 1.0);
  float edge = pow(f, 1.6);
  float t = clamp(vT, 0.0, 1.0);
  float along = pow(1.0 - t, 2.0) * smoothstep(0.0, 0.02, t);
  float dust = 0.72 + 0.4 * vnoise(vWorld * 0.03 + vec3(uTime * 0.15, -uTime * 0.35, uTime * 0.1));
  float near = smoothstep(1.5, 14.0, d);
  float day = 1.0 - 0.75 * (1.0 - smoothstep(0.1, 0.7, uNight));
  vec3 col = uColor * uIntensity * vGain * edge * along * dust * near * day;
  col *= 1.0 - 0.6 * fogFactor(vWorld);
  gl_FragColor = vec4(col, 1.0);
  ${TAIL}
}
`;

export function beamMaterial(ctx, color = '#ffe2a8') {
  return ctx.mat.shader({
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

const SWEEP_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const SWEEP_FRAGMENT = /* glsl */ `
${HEAD}
uniform vec3 uColor;
uniform float uIntensity;
uniform vec2 uOrigin;
uniform vec2 uBeam;
uniform sampler2D uText;
varying vec3 vWorld;
void main() {
  vec2 d = vWorld.xz - uOrigin;
  float r = length(d);
  vec2 dir = r > 1e-3 ? d / r : vec2(1.0, 0.0);
  float lateral = abs(dir.x * uBeam.y - dir.y * uBeam.x) * r;
  float width = 5.0 + r * 0.05;
  float lat = exp(-(lateral * lateral) / (width * width));
  float reach = smoothstep(60.0, 520.0, r) * (1.0 - smoothstep(720.0, 980.0, r));
  vec2 tuv = vec2(vWorld.x / 46.0, vWorld.z / 23.0 + uTime * 0.012);
  float glyph = texture2D(uText, tuv).r;
  float lift = 0.25 + 0.75 * reach;
  vec3 col = uColor * uIntensity * lat * lift * (0.18 + 2.2 * glyph) * (0.2 + 0.8 * smoothstep(0.1, 0.7, uNight));
  col *= 1.0 - 0.7 * fogFactor(vWorld);
  gl_FragColor = vec4(col, 1.0);
  ${TAIL}
}
`;

export function sweepMaterial(ctx, textTexture) {
  return ctx.mat.shader({
    vertexShader: SWEEP_VERTEX,
    fragmentShader: SWEEP_FRAGMENT,
    uniforms: {
      uColor: { value: new THREE.Color('#ffd27a') },
      uIntensity: { value: 0 },
      uOrigin: { value: new THREE.Vector2() },
      uBeam: { value: new THREE.Vector2(1, 0) },
      uText: { value: textTexture },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

const LENS_VERTEX = /* glsl */ `
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vN;
void main() {
  vLocal = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const LENS_FRAGMENT = /* glsl */ `
${HEAD}
uniform float uLamp;
uniform vec3 uGold;
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vN;
void main() {
  vec3 V = cameraPosition - vWorld;
  float d = length(V);
  V = d > 1e-3 ? V / d : vec3(0.0, 1.0, 0.0);
  float nl = length(vN);
  vec3 N = nl > 1e-4 ? vN / nl : vec3(0.0, 1.0, 0.0);
  float fres = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 3.0);
  float ring = 0.5 + 0.5 * sin(vLocal.y * 34.0);
  float rl = length(vLocal.xz);
  vec2 dir = rl > 1e-4 ? vLocal.xz / rl : vec2(1.0, 0.0);
  float bull = pow(clamp(abs(dir.x), 0.0, 1.0), 14.0);
  float panel = 0.6 + 0.4 * pow(clamp(abs(cos(atan(dir.y, dir.x) * 4.0)), 0.0, 1.0), 6.0);
  vec3 glass = vec3(0.03, 0.045, 0.042) * (0.6 + 0.4 * ring) + fres * uSkyHorizon * 0.7 + uSkyColor * 0.05;
  float catchLight = clamp(uLamp * 1.6, 0.0, 1.0);
  float full = smoothstep(0.45, 1.0, uLamp);
  vec3 glow = uGold * (catchLight * (0.8 + 1.4 * ring) * panel + full * 5.5 * bull * (0.7 + 0.3 * ring));
  vec3 col = glass + glow;
  col = mix(col, fogTint(vWorld), fogFactor(vWorld) * (1.0 - 0.6 * full));
  gl_FragColor = vec4(col, 1.0);
  ${TAIL}
}
`;

export function lensMaterial(ctx) {
  return ctx.mat.shader({
    vertexShader: LENS_VERTEX,
    fragmentShader: LENS_FRAGMENT,
    uniforms: { uLamp: { value: 0 }, uGold: { value: new THREE.Color('#ffd89a') } },
  });
}

const PANE_VERTEX = /* glsl */ `
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vUv;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = mat3(modelMatrix) * normal;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const PANE_FRAGMENT = /* glsl */ `
${HEAD}
uniform vec3 uWarm;
uniform float uLit;
varying vec3 vWorld;
varying vec3 vN;
varying vec2 vUv;
void main() {
  vec3 V = cameraPosition - vWorld;
  float d = length(V);
  V = d > 1e-3 ? V / d : vec3(0.0, 1.0, 0.0);
  float nl = length(vN);
  vec3 N = nl > 1e-4 ? vN / nl : vec3(0.0, 1.0, 0.0);
  float outside = step(0.0, dot(cameraPosition - vWorld, N));
  float far = outside * smoothstep(9.0, 26.0, d);
  float night = smoothstep(0.15, 0.8, uNight);
  float fres = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 4.0);
  vec3 refl = mix(uSkyHorizon, uSkyZenith, 0.4) * (0.25 + 0.75 * fres);
  vec2 c = vUv - 0.5;
  float inner = 1.0 - smoothstep(0.1, 0.75, length(c * vec2(1.0, 1.25)));
  vec3 lamp = uWarm * uLit * (0.35 + 0.65 * inner) * mix(0.25, 4.8, night);
  vec3 col = mix(refl * 0.6, lamp + refl * 0.15, far);
  float alpha = mix(0.08 + 0.35 * fres, 0.96, far);
  if (outside < 0.5) { col = refl * 0.5; alpha = 0.05 + 0.2 * fres; }
  col = applyFog(col, vWorld);
  gl_FragColor = vec4(col, alpha);
  ${TAIL}
}
`;

export function paneMaterial(ctx) {
  return ctx.mat.shader({
    vertexShader: PANE_VERTEX,
    fragmentShader: PANE_FRAGMENT,
    uniforms: { uWarm: { value: new THREE.Color('#ffae55') }, uLit: { value: 1 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

const PLUME_VERTEX = /* glsl */ `
${GLSL.envPars}
uniform float uWidth;
uniform float uHeight;
uniform float uLean;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 toCam = cameraPosition - center;
  toCam.y = 0.0;
  float tl = length(toCam);
  toCam = tl > 1e-4 ? toCam / tl : vec3(0.0, 0.0, 1.0);
  vec3 right = vec3(toCam.z, 0.0, -toCam.x);
  float y = uv.y;
  float spread = uWidth * (0.35 + 1.4 * y);
  vec3 wind = vec3(uWind.x, 0.0, uWind.y) * uLean * y * y * (0.6 + 0.15 * uWind.z);
  float sway = sin(uTime * 0.9 + y * 3.0) * 0.12 * y * uWidth;
  vec3 w = center + right * ((uv.x - 0.5) * spread + sway) + vec3(0.0, y * uHeight, 0.0) + wind;
  vUv = uv;
  vWorld = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

const PLUME_FRAGMENT = /* glsl */ `
${HEAD}
uniform vec3 uColor;
uniform float uOpacity;
uniform float uSpeed;
uniform float uSeed;
uniform float uLit;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  float y = vUv.y;
  float x = vUv.x - 0.5;
  vec2 p = vec2(x * 2.4 + uSeed, y * 2.2 - uTime * uSpeed);
  float n = fbm(p * 1.6) * 0.5 + 0.5;
  float n2 = fbm(p * 3.7 + 4.0) * 0.5 + 0.5;
  float body = 1.0 - smoothstep(0.12, 0.5, abs(x + 0.12 * (n - 0.5)));
  float a = body * smoothstep(0.35, 0.75, n * 0.7 + n2 * 0.45) * smoothstep(0.0, 0.12, y) * pow(clamp(1.0 - y, 0.0, 1.0), 1.4);
  vec3 lit = uColor * (uSkyColor * 0.7 + uSunColor * 0.25 * max(uSunDir.y, 0.0) + vec3(uLit));
  gl_FragColor = vec4(applyFog(lit, vWorld), clamp(a * uOpacity, 0.0, 1.0));
  ${TAIL}
}
`;

export function plume(ctx, { width = 0.4, height = 2, color = '#d8d4cc', opacity = 0.5, speed = 0.3, lean = 0.4, lit = 0, seed = 0 } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1, 1, 12);
  const material = ctx.mat.shader({
    vertexShader: PLUME_VERTEX,
    fragmentShader: PLUME_FRAGMENT,
    uniforms: {
      uWidth: { value: width }, uHeight: { value: height }, uLean: { value: lean },
      uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uSpeed: { value: speed }, uSeed: { value: seed }, uLit: { value: lit },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  return mesh;
}
