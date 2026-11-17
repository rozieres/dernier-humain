import * as THREE from 'three';
import { GLSL } from '../../core/glsl.js';

const LENGTH = 0.22;
const RADIUS = 0.024;
const TRAIL = 8;

const BODY_VERTEX = /* glsl */ `
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vLocal = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const BODY_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.fog}
uniform vec3 uColor;
uniform float uGlow;
uniform float uSpeak;
uniform float uOpacity;
uniform float uSweep;
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vec3 toCam = cameraPosition - vWorld;
  vec3 V = toCam * inversesqrt(max(dot(toCam, toCam), 1e-8));
  vec3 N = vNormalW * inversesqrt(max(dot(vNormalW, vNormalW), 1e-8));
  float facing = clamp(abs(dot(N, V)), 0.0, 1.0);
  float along = clamp(vLocal.x / ${(LENGTH / 2).toFixed(3)}, -1.0, 1.0);
  float core = pow(facing, 2.2);
  float hot = smoothstep(0.35, 1.0, core);
  vec3 col = mix(uColor * 0.85, vec3(1.0) * (1.2 + 0.5 * uSpeak), hot * hot * 0.8);
  float grad = 0.78 + 0.22 * (1.0 - along * along);
  float sw = (along - uSweep) * 3.2;
  float wave = exp(-sw * sw) * 0.6;
  float energy = uGlow * (grad + wave * (0.3 + uSpeak)) * (1.0 + uSpeak * 0.5);
  float rimK = 1.0 - facing;
  vec3 outCol = col * energy + uColor * rimK * rimK * uGlow * 0.5;
  gl_FragColor = vec4(applyFog(outCol, vWorld), uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const HALO_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
uniform vec2 uSize;
void main() {
  vUv = uv * 2.0 - 1.0;
  vec4 center = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vWorld = center.xyz;
  vec4 view = viewMatrix * center;
  view.xy += position.xy * uSize;
  view.z += 0.06;
  gl_Position = projectionMatrix * view;
}
`;

const HALO_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.fog}
uniform vec3 uColor;
uniform float uGlow;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec2 p = vUv;
  float d = length(vec2(p.x * 0.55, p.y * 1.6));
  float g = exp(-d * d * 7.0) * 0.55 + exp(-d * 4.0) * 0.25;
  g *= smoothstep(1.0, 0.7, length(p));
  gl_FragColor = vec4(applyFogAdditive(uColor * g * uGlow, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createTiretMesh(ctx) {
  const { mat } = ctx;
  const cyan = new THREE.Color('#5ce1e6');
  const geo = new THREE.CapsuleGeometry(RADIUS, LENGTH - 2 * RADIUS, 6, 18, 4);
  geo.rotateZ(Math.PI / 2);
  geo.scale(1, 0.82, 0.92);

  const bodyMat = mat.shader({
    vertexShader: BODY_VERTEX,
    fragmentShader: BODY_FRAGMENT,
    uniforms: {
      uColor: { value: cyan.clone() },
      uGlow: { value: 2.4 },
      uSpeak: { value: 0 },
      uOpacity: { value: 1 },
      uSweep: { value: 0 },
    },
    transparent: true,
  });
  const body = new THREE.Mesh(geo, bodyMat);
  body.name = 'tiret:body';
  body.renderOrder = 2;

  const haloMat = mat.shader({
    vertexShader: HALO_VERTEX,
    fragmentShader: HALO_FRAGMENT,
    uniforms: { uColor: { value: cyan.clone() }, uGlow: { value: 1 }, uSize: { value: new THREE.Vector2(0.26, 0.1) } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), haloMat);
  halo.name = 'tiret:halo';
  halo.frustumCulled = false;
  halo.renderOrder = 3;

  const group = new THREE.Group();
  group.name = 'tiret';
  group.add(body, halo);

  const dashGeo = new THREE.CapsuleGeometry(0.008, 0.028, 2, 6, 1);
  dashGeo.rotateZ(Math.PI / 2);
  const trailMat = mat.basic({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const trail = new THREE.InstancedMesh(dashGeo, trailMat, TRAIL);
  trail.name = 'tiret:trail';
  trail.frustumCulled = false;
  trail.renderOrder = 1;
  const trailColor = new THREE.Color();
  for (let i = 0; i < TRAIL; i++) trail.setColorAt(i, trailColor.setRGB(0, 0, 0));

  const history = Array.from({ length: TRAIL }, () => ({ p: new THREE.Vector3(), q: new THREE.Quaternion(), age: 99 }));
  let head = 0;
  let emitAcc = 0;
  const m4 = new THREE.Matrix4();
  const s3 = new THREE.Vector3();

  return {
    group, body, halo, trail, bodyMat, haloMat,
    reset(position) {
      for (const h of history) {
        h.p.copy(position);
        h.age = 99;
      }
    },
    updateTrail(dt, position, quaternion, speed, brightness) {
      emitAcc += dt;
      const interval = speed > 0.4 ? 0.04 : 0.1;
      for (const h of history) h.age += dt;
      if (emitAcc >= interval) {
        emitAcc = 0;
        head = (head + 1) % TRAIL;
        history[head].p.copy(position);
        history[head].q.copy(quaternion);
        history[head].age = 0;
      }
      const life = 0.4;
      for (let i = 0; i < TRAIL; i++) {
        const h = history[i];
        const k = Math.max(0, 1 - h.age / life);
        const s = k > 0 ? 0.35 + 0.65 * k : 0;
        m4.compose(h.p, h.q, s3.set(s, s, s));
        trail.setMatrixAt(i, m4);
        const c = k * k * brightness * THREE.MathUtils.smoothstep(speed, 0.25, 1.6);
        trail.setColorAt(i, trailColor.setRGB(cyan.r * c, cyan.g * c, cyan.b * c));
      }
      trail.instanceMatrix.needsUpdate = true;
      trail.instanceColor.needsUpdate = true;
    },
  };
}
