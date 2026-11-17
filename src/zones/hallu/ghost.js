import * as THREE from 'three';
import { GLSL } from '../../core/glsl.js';

const VERTEX = /* glsl */ `
attribute vec3 aGhost;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vGhost;
void main() {
  vec4 local = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    local = instanceMatrix * local;
    n = mat3(instanceMatrix) * n;
  #endif
  vec4 w = modelMatrix * local;
  vWorld = w.xyz;
  vec3 nw = mat3(modelMatrix) * n;
  vNormalW = nw / max(length(nw), 1e-4);
  vGhost = aGhost;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.noise}
${GLSL.fog}
uniform vec3 uViolet;
uniform vec3 uMint;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vGhost;
float gridLine(float x, float w) {
  float d = abs(fract(x - 0.5) - 0.5);
  return 1.0 - smoothstep(0.0, w, d);
}
void main() {
  float fade = vGhost.x;
  if (fade <= 0.001) discard;
  vec3 n = normalize(vNormalW + vec3(0.0, 1e-5, 0.0));
  vec3 toCam = cameraPosition - vWorld;
  vec3 v = toCam / max(length(toCam), 1e-4);
  float fres = pow(clamp(1.0 - abs(dot(n, v)), 0.0, 1.0), 2.0);
  vec3 g = vWorld * 2.0;
  vec3 fw = max(fwidth(g) * 1.3, vec3(0.02));
  vec3 an = abs(n);
  float wire = max(max(gridLine(g.x, fw.x) * (1.0 - an.x), gridLine(g.y, fw.y) * (1.0 - an.y)), gridLine(g.z, fw.z) * (1.0 - an.z));
  float scan = 0.6 + 0.4 * sin(vWorld.y * 42.0 - uTime * 9.0);
  float band = smoothstep(0.92, 1.0, sin(vWorld.y * 1.3 - uTime * 2.4));
  float nz = vnoise(vWorld * 2.6 + vec3(0.0, uTime * 0.7, 0.0)) * 0.5 + 0.5;
  float cut = fade * 1.12 - 0.06;
  if (nz > cut) discard;
  float edge = 1.0 - smoothstep(cut - 0.09, cut, nz);
  float body = 0.05 + fres * 0.45 + wire * 0.85 + band * 0.3;
  vec3 color = mix(uViolet, uMint, vGhost.z);
  vec3 col = color * body * scan + color * (1.0 - edge) * 1.6;
  col *= vGhost.y * (gl_FrontFacing ? 1.0 : 0.45);
  gl_FragColor = vec4(applyFogAdditive(col, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createInstancedGhost(mat) {
  return mat.shader({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uViolet: { value: new THREE.Color('#c77dff').multiplyScalar(1.1) },
      uMint: { value: new THREE.Color('#7af5c8').multiplyScalar(0.95) },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
