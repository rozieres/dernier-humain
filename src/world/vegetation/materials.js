import { GLSL } from '../../core/glsl.js';

const SWAY_PARS = /* glsl */ `
${GLSL.noise}
varying vec3 vVegLocal;
varying vec3 vVegSeed;
`;

function swayChunk(amount, flutter) {
  return /* glsl */ `
vVegLocal = position;
#ifdef USE_INSTANCING
  vec3 vegRoot = instanceMatrix[3].xyz;
  mat3 vegM = mat3(instanceMatrix);
#else
  vec3 vegRoot = vec3(0.0);
  mat3 vegM = mat3(1.0);
#endif
vVegSeed = vegRoot;
{
  vec2 wd = normalize(uWind.xy + 1e-4);
  float ws = clamp(uWind.z / 4.0, 0.0, 2.0);
  float hgt = length(vegM[1]);
  float gust = 0.5 + 0.5 * snoise((vegRoot.xz - wd * uTime * (2.5 + uWind.z * 0.9)) / 34.0);
  float ph = dot(vegRoot.xz, vec2(0.37, 0.61));
  float k = position.y * position.y;
  float sway = (${amount.toFixed(3)}) * hgt * ws * (0.35 + 0.65 * gust + 0.25 * sin(uTime * 1.3 + ph));
  vec3 off = vec3(wd.x, 0.0, wd.y) * sway * k;
  off += ${flutter.toFixed(3)} * hgt * ws * k * vec3(sin(uTime * 4.1 + ph + position.x * 30.0), 0.0, cos(uTime * 3.7 + ph + position.z * 30.0));
  transformed += vec3(dot(vegM[0], off) / dot(vegM[0], vegM[0]), dot(vegM[1], off) / dot(vegM[1], vegM[1]), dot(vegM[2], off) / dot(vegM[2], vegM[2]));
}
`;
}

const FOLIAGE_FRAG_PARS = /* glsl */ `
${GLSL.noise}
varying vec3 vVegLocal;
varying vec3 vVegSeed;
`;

function foliageColor(clumps) {
  return /* glsl */ `
#include <color_fragment>
{
  float under = smoothstep(${clumps ? '0.25' : '0.45'}, 0.95, vVegLocal.y / max(0.001, 0.7)) ;
  ${clumps ? `float cl = snoise(vVegLocal * 16.0 + vVegSeed * 0.13) * 0.6 + snoise(vVegLocal * 41.0 + vVegSeed * 0.07) * 0.4;
  diffuseColor.rgb *= 0.78 + 0.34 * cl;
  diffuseColor.rgb = mix(diffuseColor.rgb * 0.55, diffuseColor.rgb * vec3(1.06, 1.08, 0.9), under);` : 'diffuseColor.rgb *= mix(0.8, 1.05, under);'}
}
`;
}

const FOLIAGE_LIGHT = /* glsl */ `
{
  vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  vec3 vW = normalize(cameraPosition - vDhWorldPos);
  float ndl = dot(nW, uSunDir);
  float wrap = max(0.0, (ndl + 0.6) / 1.6) - max(0.0, ndl);
  float rim = pow(1.0 - clamp(dot(nW, vW), 0.0, 1.0), 3.0);
  float back = pow(max(dot(-vW, uSunDir), 0.0), 2.0);
  totalEmissiveRadiance += diffuseColor.rgb * uSunColor * (wrap * 0.16 + rim * (0.08 + 0.5 * back)) * smoothstep(-0.05, 0.15, uSunDir.y + 0.1);
}
`;

const BARK_COLOR = /* glsl */ `
#include <color_fragment>
{
  float a = atan(vVegLocal.z, vVegLocal.x);
  float s = snoise(vec2(a * 3.0, vVegLocal.y * 9.0) + vVegSeed.xz) * 0.5 + snoise(vec2(a * 9.0, vVegLocal.y * 30.0)) * 0.3;
  diffuseColor.rgb *= 0.8 + 0.3 * s;
  diffuseColor.rgb *= mix(0.6, 1.0, smoothstep(0.0, 0.12, vVegLocal.y));
}
`;

const ROCK_COLOR = /* glsl */ `
#include <color_fragment>
{
  vec3 p = vDhWorldPos;
  float n = snoise(p * 0.7) * 0.5 + snoise(p * 2.3) * 0.3 + snoise(vec3(p.x, p.y * 4.0, p.z) * 0.4) * 0.3;
  diffuseColor.rgb *= 0.82 + 0.3 * n;
  vec3 nW = normalize((vec4(vNormal, 0.0) * viewMatrix).xyz);
  float moss = smoothstep(0.55, 0.85, nW.y + 0.25 * snoise(p * 0.9)) * vVegMoss;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.16, 0.035), moss * 0.8);
  diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(-0.2, 0.25, vVegLocal.y));
}
`;

function patch(shader, { sway = 0, flutter = 0, color = null, light = false, rock = false }) {
  const vPars = `${GLSL.envPars}\n${SWAY_PARS}${rock ? '\nvarying float vVegMoss;' : ''}`;
  shader.vertexShader = shader.vertexShader
    .replace('#include <clipping_planes_pars_vertex>', `#include <clipping_planes_pars_vertex>\n${vPars}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${swayChunk(sway, flutter)}${rock ? '\n#ifdef USE_INSTANCING_COLOR\nvVegMoss = instanceColor.g > instanceColor.r ? 1.0 : 0.0;\n#else\nvVegMoss = 0.0;\n#endif' : ''}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <clipping_planes_pars_fragment>', `#include <clipping_planes_pars_fragment>\n${FOLIAGE_FRAG_PARS}${rock ? '\nvarying float vVegMoss;' : ''}`);
  if (color) shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', color);
  if (light) shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FOLIAGE_LIGHT}`);
}

export function createVegetationMaterials(mat) {
  const foliage = mat.standard({ color: 0xffffff, roughness: 0.82, metalness: 0 }, {
    onShader: (s) => patch(s, { sway: 0.012, flutter: 0.0025, color: foliageColor(true), light: true }),
  });
  foliage.name = 'veg:foliage';
  const conifer = mat.standard({ color: 0xffffff, roughness: 0.86, metalness: 0 }, {
    onShader: (s) => patch(s, { sway: 0.008, flutter: 0.0015, color: foliageColor(true), light: true }),
  });
  conifer.name = 'veg:conifer';
  const clone = mat.standard({ color: 0xffffff, roughness: 0.32, metalness: 0 }, {
    onShader: (s) => patch(s, { sway: 0.0, flutter: 0.0, color: foliageColor(false), light: true }),
  });
  clone.name = 'veg:clone';
  const bark = mat.standard({ color: 0xffffff, roughness: 0.92, metalness: 0 }, {
    onShader: (s) => patch(s, { sway: 0.004, flutter: 0, color: BARK_COLOR }),
  });
  bark.name = 'veg:bark';
  const rock = mat.standard({ color: 0xffffff, roughness: 0.9, metalness: 0 }, {
    onShader: (s) => patch(s, { color: ROCK_COLOR, rock: true }),
  });
  rock.name = 'veg:rock';
  return { foliage, conifer, clone, bark, rock };
}
