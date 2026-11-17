import * as THREE from 'three';
import { GLSL } from '../../core/glsl.js';

const OUT = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;

const HEIGHT_EXACT = /* glsl */ `
float heightExact(vec2 xz) {
  vec2 f = (xz + uWorldHalf) / 4.0;
  f = clamp(f, vec2(0.0), vec2(WORLD_GRID - 1.001));
  ivec2 i = ivec2(floor(f));
  vec2 t = f - vec2(i);
  float h00 = texelFetch(uHeightTex, i, 0).r;
  float h10 = texelFetch(uHeightTex, i + ivec2(1, 0), 0).r;
  float h01 = texelFetch(uHeightTex, i + ivec2(0, 1), 0).r;
  float h11 = texelFetch(uHeightTex, i + ivec2(1, 1), 0).r;
  if (t.x + t.y <= 1.0) return h00 + (h10 - h00) * t.x + (h01 - h00) * t.y;
  return h11 + (h01 - h11) * (1.0 - t.x) + (h10 - h11) * (1.0 - t.y);
}
`;

export function windowMaterial(mat, count, bright) {
  return mat.shader({
    uniforms: { uLife: { value: new Float32Array(count).fill(1) } },
    vertexShader: /* glsl */ `
      attribute float aCabin;
      varying vec2 vUv;
      varying float vCabin;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      void main() {
        vUv = uv;
        vCabin = aCabin;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL.envPars}
      ${GLSL.noise}
      ${GLSL.fog}
      uniform float uLife[${count}];
      varying vec2 vUv;
      varying float vCabin;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      void main() {
        int idx = int(floor(vCabin + 0.01));
        float seed = fract(vCabin) * 7.0 + floor(vCabin) * 3.17;
        float life = uLife[idx];
        vec2 uv = vUv;
        float lampX = 0.5 + 0.18 * sin(seed * 2.3);
        float glow = exp(-6.0 * dot(uv - vec2(lampX, 0.28), uv - vec2(lampX, 0.28)));
        vec3 room = mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.72, 0.38), glow) * (0.55 + 0.75 * glow);
        float gate = smoothstep(0.55, 0.85, sin(uTime * 0.045 + seed * 3.1));
        float sx = 0.5 + 0.36 * sin(uTime * 0.13 + seed * 5.0);
        vec2 hd = (uv - vec2(sx, 0.66)) / vec2(0.075, 0.1);
        vec2 sh = (uv - vec2(sx, 0.2)) / vec2(0.2, 0.3);
        float person = max(1.0 - smoothstep(0.7, 1.0, dot(hd, hd)), 1.0 - smoothstep(0.7, 1.0, dot(sh, sh)));
        room *= 1.0 - 0.72 * person * gate;
        float tie = smoothstep(0.25, 0.55, uv.y) * smoothstep(1.0, 0.6, uv.y);
        float cw = 0.13 + 0.12 * (1.0 - tie) + 0.03 * sin(seed * 9.0);
        float left = 1.0 - smoothstep(cw - 0.02, cw + 0.02, uv.x);
        float right = smoothstep(1.0 - cw - 0.02, 1.0 - cw + 0.02, uv.x);
        float curtain = max(left, right);
        float fold = 0.65 + 0.35 * sin(uv.x * 70.0 + seed);
        vec3 cloth = mix(vec3(0.75, 0.24, 0.12), vec3(0.85, 0.6, 0.28), step(0.5, fract(seed * 0.37)));
        vec3 inside = mix(room, room * cloth * fold * 0.85, curtain);
        float flicker = 0.88 + 0.12 * vnoise(vec2(uTime * 2.7, seed * 11.0)) + 0.05 * sin(uTime * 17.0 + seed);
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - clamp(abs(dot(V, vNormalW)), 0.0, 1.0), 3.0);
        vec3 glass = uSkyHorizon * (0.05 + 0.3 * fres) + uSkyColor * 0.04;
        vec3 col = glass + inside * (idx == ${bright} ? 5.0 : 3.6) * life * flicker;
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
        ${OUT}
      }`,
  });
}

export function coneMaterial(mat) {
  return mat.shader({
    uniforms: { uBeam: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec2 aBeam;
      varying float vT;
      varying vec2 vBeam;
      varying vec3 vWorld;
      varying vec3 vN;
      void main() {
        vT = -position.y;
        vBeam = aBeam;
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL.envPars}
      ${GLSL.noise}
      ${GLSL.fog}
      uniform float uBeam;
      varying float vT;
      varying vec2 vBeam;
      varying vec3 vWorld;
      varying vec3 vN;
      void main() {
        vec3 V = cameraPosition - vWorld;
        float vl = length(V);
        V = V / max(vl, 1e-3);
        float facing = abs(dot(normalize(vN + vec3(1e-5)), V));
        float core = pow(clamp(facing, 0.0, 1.0), 2.6);
        float along = pow(clamp(1.0 - vT, 0.0, 1.0), 1.4) * smoothstep(0.0, 0.04, vT);
        float dust = 0.7 + 0.3 * vnoise(vWorld * 0.7 + vec3(0.0, uTime * 0.35, uTime * 0.2));
        float nearFade = smoothstep(2.0, 12.0, vl);
        vec3 c = mix(vec3(0.78, 0.93, 1.0), vec3(1.0, 0.16, 0.1), vBeam.x);
        vec3 col = c * core * along * dust * nearFade * uBeam * vBeam.y * 0.42;
        gl_FragColor = vec4(applyFogAdditive(col, vWorld), 1.0);
        ${OUT}
      }`,
  });
}

export function poolMaterial(mat, drones, trunks) {
  return mat.shader({
    uniforms: {
      uTrunks: { value: Array.from({ length: drones * trunks }, () => new THREE.Vector4(0, 0, 0, -1e3)) },
      uPool: { value: 1 },
      uCos: { value: new THREE.Vector2(0.95, 0.97) },
      uRange: { value: 26 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    vertexShader: /* glsl */ `
      ${GLSL.envPars}
      ${GLSL.world}
      ${HEIGHT_EXACT}
      attribute vec3 aApex;
      attribute vec4 aAxis;
      varying vec3 vWorld;
      varying vec3 vN;
      flat varying vec3 vApex;
      flat varying vec4 vAxis;
      flat varying int vInst;
      void main() {
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        float h = heightExact(w.xz);
        float hx = heightExact(w.xz + vec2(0.7, 0.0)) - heightExact(w.xz - vec2(0.7, 0.0));
        float hz = heightExact(w.xz + vec2(0.0, 0.7)) - heightExact(w.xz - vec2(0.0, 0.7));
        vN = normalize(vec3(-hx / 1.4, 1.0, -hz / 1.4));
        w.y = h + 0.07;
        vWorld = w.xyz;
        vApex = aApex;
        vAxis = aAxis;
        vInst = gl_InstanceID;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL.envPars}
      ${GLSL.noise}
      ${GLSL.fog}
      uniform vec4 uTrunks[${drones * trunks}];
      uniform float uPool;
      uniform vec2 uCos;
      uniform float uRange;
      varying vec3 vWorld;
      varying vec3 vN;
      flat varying vec3 vApex;
      flat varying vec4 vAxis;
      flat varying int vInst;
      void main() {
        vec3 v = vWorld - vApex;
        float d = length(v);
        vec3 dir = v / max(d, 1e-3);
        float c = dot(dir, vAxis.xyz);
        float spot = smoothstep(uCos.x, uCos.x + 0.006, c) * (0.55 + 0.45 * smoothstep(uCos.x, uCos.y, c));
        float atten = 1.0 - smoothstep(uRange * 0.72, uRange * 1.04, d);
        float ndl = clamp(dot(vN, -dir), 0.0, 1.0);
        float lit = spot * atten * (0.35 + 0.65 * ndl);
        if (lit < 0.002) discard;
        float shade = 1.0;
        vec2 a = vWorld.xz;
        vec2 ab = vApex.xz - a;
        float ab2 = max(dot(ab, ab), 1e-4);
        for (int i = 0; i < ${trunks}; i++) {
          vec4 t = uTrunks[vInst * ${trunks} + i];
          if (t.z <= 0.0) continue;
          float s = clamp(dot(t.xy - a, ab) / ab2, 0.0, 1.0);
          float dist = length(t.xy - (a + ab * s));
          float y = vWorld.y + (vApex.y - vWorld.y) * s;
          if (y < t.w && s > 0.001) shade = min(shade, smoothstep(t.z * 0.75, t.z * 1.25, dist));
        }
        float grit = 0.8 + 0.2 * vnoise(vWorld.xz * 1.7);
        vec3 col = mix(vec3(0.8, 0.94, 1.0), vec3(1.0, 0.16, 0.1), vAxis.w) * lit * shade * grit * uPool;
        gl_FragColor = vec4(applyFogAdditive(col, vWorld), 1.0);
        ${OUT}
      }`,
  });
}

export function smokeMaterial(mat, sources) {
  return mat.shader({
    uniforms: {
      uSmoke: { value: new Float32Array(sources).fill(1) },
      uFireGlow: { value: new THREE.Color('#ff8f3a') },
      uGlow: { value: 0 },
      uFar: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      ${GLSL.envPars}
      ${GLSL.noise}
      uniform float uSmoke[${sources}];
      uniform float uFar;
      attribute vec4 aSrc;
      attribute vec4 aSeed;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vRise;
      varying float vKind;
      varying vec3 vWorld;
      varying float vSeed;
      void main() {
        float kind = aSeed.w;
        float life = mix(7.0, 26.0, kind);
        float t = fract(uTime / life + aSeed.x);
        float rise = mix(1.25, 2.7 + 1.3 * uFar, kind) * life * t;
        float s0 = mix(0.5, 0.7, kind);
        float s1 = mix(3.2, 10.0, kind);
        float size = mix(s0, s1, sqrt(t)) * (0.8 + 0.4 * aSeed.y) * (1.0 + uFar * 1.6 * kind);
        vec3 drift = vec3(uWind.x, 0.0, uWind.y) * (uWind.z * mix(0.55, 0.32, kind) * t * t * life);
        vec3 wob = vec3(vnoise(vec2(aSeed.z * 9.0, t * 3.0)), 0.0, vnoise(vec2(t * 3.0, aSeed.y * 7.0))) * mix(0.4, 3.5, kind) * t;
        vec3 center = aSrc.xyz + vec3(0.0, rise, 0.0) + drift + wob;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float a = aSeed.z * 6.28 + t * (aSeed.y - 0.5) * 2.0;
        vec2 p = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy;
        vec3 w = center + (right * p.x + up * p.y) * size;
        vUv = uv;
        vRise = rise;
        vKind = kind;
        vSeed = aSeed.y * 13.0 + aSeed.z * 7.0;
        float intensity = uSmoke[int(aSrc.w + 0.5)];
        vAlpha = smoothstep(0.0, mix(0.06, 0.12, kind), t) * pow(1.0 - t, mix(1.3, 1.0 - 0.6 * uFar, kind)) * intensity * (1.0 + uFar * 1.6 * kind);
        vWorld = w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL.envPars}
      ${GLSL.noise}
      ${GLSL.fog}
      uniform vec3 uFireGlow;
      uniform float uGlow;
      uniform float uFar;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vRise;
      varying float vKind;
      varying vec3 vWorld;
      varying float vSeed;
      void main() {
        vec2 q = vUv * 2.0 - 1.0;
        float n = fbm(q * 1.6 + vSeed);
        float r = length(q) + n * 0.35;
        float m = 1.0 - smoothstep(0.35, 1.0, r);
        float alpha = min(m * vAlpha * mix(0.42, 0.3, vKind), 0.85);
        if (alpha < 0.003) discard;
        vec3 albedo = vec3(0.62, 0.64, 0.66) * (1.0 - 0.5 * uFar * vKind);
        float shade = 0.75 + 0.25 * n;
        vec3 col = albedo * shade * (uSkyColor * 0.9 + uGroundColor * 0.25 + uSunColor * 0.32);
        col += uFireGlow * uGlow * exp(-vRise / mix(1.5, 7.0 + 30.0 * uFar, vKind)) * mix(0.2, 0.6, vKind);
        gl_FragColor = vec4(applyFog(col, vWorld), alpha);
        ${OUT}
      }`,
  });
}

export function mistMaterial(mat) {
  return mat.shader({
    uniforms: { uMist: { value: 1 } },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec4 aMist;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vSeed;
      varying float vDist;
      void main() {
        vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 toCam = cameraPosition - center;
        toCam.y = 0.0;
        float l = length(toCam);
        vec3 right = l > 1e-3 ? vec3(toCam.z, 0.0, -toCam.x) / l : vec3(1.0, 0.0, 0.0);
        vec3 w = center + right * position.x * aMist.x + vec3(0.0, (position.y + 0.5) * aMist.y, 0.0);
        vUv = uv;
        vSeed = aMist.z;
        vWorld = w;
        vDist = length(cameraPosition - w);
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL.envPars}
      ${GLSL.noise}
      ${GLSL.fog}
      uniform float uMist;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vSeed;
      varying float vDist;
      void main() {
        float n = fbm(vec2(vUv.x * 2.2 + uTime * 0.025 + vSeed, vUv.y * 1.3 - uTime * 0.01));
        float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x) * smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
        float a = edge * clamp(0.45 + 0.75 * n, 0.0, 1.0) * smoothstep(3.0, 14.0, vDist) * uMist;
        if (a < 0.003) discard;
        vec3 col = uFogColor * 1.05 + uSkyColor * 0.1;
        gl_FragColor = vec4(applyFog(col, vWorld), a * 0.26);
        ${OUT}
      }`,
  });
}

export function waterMaterial(mat) {
  return mat.shader({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL.envPars}
      ${GLSL.noise}
      ${GLSL.fog}
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vec2 p = vec2(vUv.x * 1.6, vUv.y * 0.55 - uTime * 0.7);
        float e = 0.08;
        float n0 = fbm(p);
        float nx = fbm(p + vec2(e, 0.0));
        float ny = fbm(p + vec2(0.0, e));
        vec3 N = normalize(vec3((n0 - nx) * 1.6, 1.0, (n0 - ny) * 1.6));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uSkyHorizon, uSkyZenith, clamp(R.y, 0.0, 1.0)) * 0.6;
        float spec = pow(max(dot(R, uSunDir), 0.0), 90.0);
        vec3 deep = vec3(0.018, 0.035, 0.034) * (uSkyColor + uSunColor * 0.2) * 3.0;
        float foam = smoothstep(0.55, 0.85, fbm(vec2(vUv.x * 5.0, vUv.y * 1.6 - uTime * 1.1))) * 0.25;
        vec3 col = mix(deep, sky, fres) + uSunColor * spec * 0.7 + foam * (uSkyColor + uSunColor * 0.3);
        float edge = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
        gl_FragColor = vec4(applyFog(col, vWorld), edge * 0.92);
        ${OUT}
      }`,
  });
}

export function trailMaterial(mat) {
  return mat.standard({ vertexColors: true, roughness: 0.95, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }, {
    onShader(shader) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aEdge;\nvarying float vEdge;\nvarying vec3 vTrailW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = aEdge;\nvTrailW = (modelMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying float vEdge;\nvarying vec3 vTrailW;\n${GLSL.noise}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float tn = fbm(vTrailW.xz * 0.45);
          float needles = vnoise(vTrailW.xz * 9.0);
          diffuseColor.rgb *= 0.8 + 0.25 * needles;
          diffuseColor.a *= 1.0 - smoothstep(0.35, 0.95, vEdge + tn * 0.35);`);
    },
  });
}

export function fireMaterial(mat) {
  return mat.shader({
    uniforms: { uFire: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aKind;
      varying vec2 vUv;
      varying float vKind;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vKind = aKind;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL.envPars}
      ${GLSL.noise}
      ${GLSL.fog}
      uniform float uFire;
      varying vec2 vUv;
      varying float vKind;
      varying vec3 vWorld;
      void main() {
        vec3 col;
        if (vKind > 1.5) {
          vec2 q = vUv * 2.0 - 1.0;
          float r = length(q);
          float n = fbm(q * 3.0 + vec2(uTime * 0.2, -uTime * 0.15));
          float heat = smoothstep(1.0, 0.0, r) * (0.55 + 0.45 * n);
          col = mix(vec3(0.5, 0.06, 0.01), vec3(1.0, 0.45, 0.08), heat) * heat * 2.2;
        } else {
          float seed = vKind * 17.0;
          vec2 uv = vUv;
          float n = fbm(vec2(uv.x * 2.4 + seed, uv.y * 1.7 - uTime * 1.9));
          float n2 = vnoise(vec2(uv.x * 6.0 - seed, uv.y * 4.0 - uTime * 3.3));
          float x = (uv.x - 0.5) * 2.0 + (n - 0.0) * 0.35 * uv.y;
          float width = pow(clamp(1.0 - uv.y, 0.0, 1.0), 0.9) * (0.75 + 0.25 * n2);
          float shape = 1.0 - smoothstep(width * 0.55, width, abs(x));
          shape *= smoothstep(0.0, 0.08, uv.y) * (1.0 - smoothstep(0.55 + 0.35 * n, 1.0, uv.y));
          float core = 1.0 - smoothstep(width * 0.1, width * 0.55, abs(x));
          vec3 hot = mix(vec3(1.0, 0.3, 0.05), vec3(1.0, 0.75, 0.3), core * (1.0 - uv.y));
          col = hot * shape * (2.4 + 2.2 * core * (1.0 - uv.y));
        }
        gl_FragColor = vec4(applyFogAdditive(col * uFire, vWorld), 1.0);
        ${OUT}
      }`,
  });
}
