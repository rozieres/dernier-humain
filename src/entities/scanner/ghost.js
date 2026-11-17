import * as THREE from 'three';
import { GLSL } from '../../core/glsl.js';

const VERTEX = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vec4 local = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    local = instanceMatrix * local;
    n = mat3(instanceMatrix) * n;
  #endif
  vec4 w = modelMatrix * local;
  vWorld = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.noise}
${GLSL.fog}
uniform vec3 uColor;
uniform float uFade;
uniform float uFlicker;
varying vec3 vWorld;
varying vec3 vNormalW;
float gridLine(float x, float w) {
  float d = abs(fract(x - 0.5) - 0.5);
  return 1.0 - smoothstep(0.0, w, d);
}
void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(clamp(1.0 - abs(dot(n, v)), 0.0, 1.0), 2.0);
  vec3 g = vWorld * 2.0;
  vec3 fw = max(fwidth(g) * 1.3, vec3(0.02));
  vec3 an = abs(n);
  float wire = max(max(gridLine(g.x, fw.x) * (1.0 - an.x), gridLine(g.y, fw.y) * (1.0 - an.y)), gridLine(g.z, fw.z) * (1.0 - an.z));
  float scan = 0.6 + 0.4 * sin(vWorld.y * 42.0 - uTime * 9.0);
  float band = smoothstep(0.92, 1.0, sin(vWorld.y * 1.3 - uTime * 2.4));
  float nz = vnoise(vWorld * 2.6 + vec3(0.0, uTime * 0.7, 0.0)) * 0.5 + 0.5;
  float cut = uFade * 1.12 - 0.06;
  if (nz > cut) discard;
  float edge = 1.0 - smoothstep(cut - 0.09, cut, nz);
  float body = 0.05 + fres * 0.45 + wire * 0.85 + band * 0.3;
  vec3 col = uColor * body * scan + uColor * (1.0 - edge) * 1.6;
  col *= uFlicker * (gl_FrontFacing ? 1.0 : 0.45);
  gl_FragColor = vec4(applyFogAdditive(col, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createGhostMaterial(mat, color, intensity = 2.2) {
  return mat.shader({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uColor: { value: new THREE.Color(color).multiplyScalar(intensity) },
      uFade: { value: 1 },
      uFlicker: { value: 1 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
