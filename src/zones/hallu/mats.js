import * as THREE from 'three';
import { GLSL } from '../../core/glsl.js';

const VEIN_COMMON = `
${GLSL.noise}
uniform vec3 uVeinA;
uniform vec3 uVeinB;
uniform float uVeinGain;
float halluVein(vec3 p) {
  vec3 v = voronoi(p.xz * 0.55 + vec2(p.y * 0.35, -p.y * 0.21));
  float edge = clamp(v.y - v.x, 0.0, 1.0);
  float line = 1.0 - smoothstep(0.015, 0.075, edge);
  float mask = smoothstep(-0.15, 0.35, snoise(p * 0.21));
  return line * mask;
}
`;

function veinShader(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${VEIN_COMMON}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      float halluMottle = fbm(vDhWorldPos * 0.45);
      diffuseColor.rgb *= 0.82 + 0.32 * halluMottle;`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float halluV = halluVein(vDhWorldPos);
      float halluPulse = 0.65 + 0.35 * sin(uTime * 1.3 + vDhWorldPos.x * 0.21 + vDhWorldPos.z * 0.17);
      vec3 halluTint = mix(uVeinA, uVeinB, smoothstep(-0.4, 0.4, snoise(vDhWorldPos * 0.05 + vec3(0.0, uTime * 0.04, 0.0))));
      totalEmissiveRadiance += halluTint * halluV * halluPulse * uVeinGain * (0.55 + 0.45 * uNight);`);
}

function mottleShader(shader) {
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${GLSL.noise}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      float stoneMottle = fbm(vDhWorldPos * 0.8) * 0.6 + fbm(vDhWorldPos * 3.1) * 0.4;
      diffuseColor.rgb *= 0.86 + 0.26 * stoneMottle;`);
}

function pearlShader(shader) {
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${GLSL.noise}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      float pearlNv = abs(dot(normalize(vNormal), normalize(vViewPosition)));
      float pearlHue = pearlNv * 1.6 + snoise(vDhWorldPos * 0.08) * 0.35;
      vec3 pearlRainbow = 0.5 + 0.5 * cos(6.2832 * (pearlHue + vec3(0.0, 0.33, 0.67)));
      diffuseColor.rgb *= mix(vec3(1.0), 0.62 + pearlRainbow * 0.5, 0.42 * (1.0 - pearlNv * 0.6));`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float pearlF = pow(clamp(1.0 - abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.5);
      float pearlN = snoise(vDhWorldPos * 0.06 + vec3(0.0, uTime * 0.05, 0.0));
      vec3 pearlC = mix(vec3(0.78, 0.49, 1.0), vec3(0.48, 0.96, 0.78), smoothstep(-0.5, 0.5, pearlN));
      totalEmissiveRadiance += pearlC * (pearlF * (0.55 + 2.6 * uNight) + 0.12 * uNight);`);
}

export function createMaterials(ctx) {
  const { mat } = ctx;
  const veinUniforms = (a, b, gain) => ({
    uVeinA: { value: new THREE.Color(a) },
    uVeinB: { value: new THREE.Color(b) },
    uVeinGain: { value: gain },
  });
  const rockU = veinUniforms('#c77dff', '#7af5c8', 3.2);
  const rock = mat.standard({ vertexColors: true, roughness: 0.82, metalness: 0 }, { onShader: (s) => veinShader(s, rockU) });
  const stone = mat.standard({ vertexColors: true, roughness: 0.78, metalness: 0 }, { onShader: mottleShader });
  const pearl = mat.physical({
    color: '#f4ece8', roughness: 0.2, metalness: 0, vertexColors: true,
    iridescence: 1, iridescenceIOR: 1.55, iridescenceThicknessMinimum: 180, iridescenceThicknessMaximum: 720,
    clearcoat: 1, clearcoatRoughness: 0.18, sheen: 0.8, sheenColor: new THREE.Color('#d6b8ff'), sheenRoughness: 0.5,
  }, { onShader: pearlShader });
  const wood = mat.standard({ vertexColors: true, roughness: 0.86, metalness: 0 });
  const iron = mat.standard({ vertexColors: true, roughness: 0.45, metalness: 0.65 });
  const glowViolet = mat.glow('#c77dff', 3.2);
  const glowMint = mat.glow('#7af5c8', 2.8);
  const glowWhite = mat.glow('#f6efff', 3.0);
  return { rock, stone, pearl, wood, iron, glowViolet, glowMint, glowWhite };
}
