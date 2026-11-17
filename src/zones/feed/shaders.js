import * as THREE from 'three';
import { GLSL } from '../../core/glsl.js';

export const PIT = Object.freeze({ cx: 0, cz: -640, r: 27.6, rim: 124, floor: 8 });

const f = (v) => (Number.isInteger(v) ? `${v}.0` : `${v}`);

export const PIT_GLSL = /* glsl */ `
const vec2 PIT_C = vec2(${f(PIT.cx)}, ${f(PIT.cz)});
const float PIT_R = ${f(PIT.r)};
const float PIT_RIM = ${f(PIT.rim)};
const float PIT_FLOOR = ${f(PIT.floor)};
float pitSunVis(vec3 p, vec3 L) {
  vec2 o = p.xz - PIT_C;
  float rr = PIT_R + 0.6;
  if (p.y > PIT_RIM - 0.2 || dot(o, o) > rr * rr) return 1.0;
  vec2 d = L.xz;
  float a = dot(d, d);
  if (a < 1e-5) return 1.0;
  float b = dot(o, d);
  float c = dot(o, o) - PIT_R * PIT_R;
  float t = (-b + sqrt(max(b * b - a * c, 0.0))) / a;
  float yExit = p.y + max(t, 0.0) * L.y;
  return smoothstep(PIT_RIM - 2.0, PIT_RIM + 1.0, yExit);
}
float pitSky(vec3 p) {
  vec2 o = p.xz - PIT_C;
  float rr = PIT_R + 0.6;
  if (dot(o, o) > rr * rr) return 1.0;
  float d = max(PIT_RIM - p.y, 0.0);
  float k = PIT_R * PIT_R / (PIT_R * PIT_R + d * d * 1.4);
  return mix(0.035, 1.0, k);
}
`;

const POSTS_GLSL = /* glsl */ `
uniform sampler2D uPosts;
vec4 postCard(vec2 uv, float idx, vec2 gx, vec2 gy) {
  idx = mod(floor(idx), 16.0);
  vec2 cell = vec2(mod(idx, 4.0), floor(idx / 4.0));
  vec2 a = vec2((cell.x + uv.x) * 0.25, 1.0 - (cell.y + 1.0 - uv.y) * 0.25);
  return textureGrad(uPosts, a, gx * 0.25, gy * 0.25);
}
vec4 feedColumn(vec2 p, float colW, float speed, float seed) {
  float margin = colW * 0.07;
  float cw = colW - 2.0 * margin;
  float pitch = cw * 1.1;
  float v = p.y / pitch - uTime * speed;
  vec2 cont = vec2(p.x / cw, v * 1.1);
  vec2 gx = dFdx(cont);
  vec2 gy = dFdy(cont);
  float k = floor(v);
  float fy = fract(v) * 1.1;
  vec2 cuv = vec2((p.x - margin) / cw, fy);
  float idx = floor(hash11(k * 13.17 + seed * 7.31) * 16.0);
  vec4 t = postCard(clamp(cuv, 0.0, 1.0), idx, gx, gy);
  float inside = step(0.0, cuv.x) * step(cuv.x, 1.0) * step(fy, 1.0);
  return t * inside;
}
`;

function replaceLights(shader, sunExpr, skyExpr) {
  const begin = THREE.ShaderChunk.lights_fragment_begin.replace(
    'getDirectionalLightInfo( directionalLight, directLight );',
    `getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= ${sunExpr};`,
  );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <lights_fragment_begin>', begin)
    .replace('#include <lights_fragment_end>', `
#if defined( RE_IndirectDiffuse )
  irradiance *= ${skyExpr};
  iblIrradiance *= ${skyExpr};
#endif
#if defined( RE_IndirectSpecular )
  radiance *= ${skyExpr};
#endif
#include <lights_fragment_end>`);
}

export function pitLitShader(shader) {
  shader.fragmentShader = shader.fragmentShader
      .replace('#include <dithering_pars_fragment>', `#include <dithering_pars_fragment>\n${GLSL.noise}\n${PIT_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  float pitDepth = clamp((PIT_RIM - vDhWorldPos.y) / (PIT_RIM - PIT_FLOOR), 0.0, 1.0);
  vec2 pitO = vDhWorldPos.xz - PIT_C;
  float pitIn = 1.0 - smoothstep(PIT_R + 0.5, PIT_R + 2.0, length(pitO));
  float pitDust = clamp(pitDepth * 1.15 + vnoise(vDhWorldPos.xz * 1.7 + vDhWorldPos.y) * 0.3 - 0.25, 0.0, 0.85) * pitIn;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.2, 0.18), pitDust);
  float capR = length(pitO);
  float onCap = step(abs(vDhWorldPos.y - (PIT_RIM + 0.06)), 0.02) * step(PIT_R + 0.3, capR) * step(capR, 41.4);
  float capA = atan(pitO.x, -pitO.y) * 36.0 / 3.14159265;
  vec2 capT = vec2(fract(capR / 2.4), fract(capA + floor(capR / 2.4) * 0.5));
  float capSeam = 1.0 - smoothstep(0.012, 0.035, min(min(capT.x, 1.0 - capT.x), min(capT.y, 1.0 - capT.y) * 0.5));
  diffuseColor.rgb *= 1.0 - onCap * (capSeam * 0.35 + 0.06 * hash21(floor(vec2(capR / 2.4, capA))));
  vec3 capGlow = vec3(0.36, 0.88, 0.9) * onCap * capSeam * uNight * 1.6;
  float pitSunK = pitSunVis(vDhWorldPos, uSunDir);
  float pitSkyK = pitSky(vDhWorldPos);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.92, pitDust);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += capGlow;');
  replaceLights(shader, 'pitSunK', 'pitSkyK');
}

export function wallShader(uniforms) {
  return (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <dithering_pars_fragment>', `#include <dithering_pars_fragment>
${GLSL.noise}
${PIT_GLSL}
${POSTS_GLSL}
uniform sampler2D uNumerals;
uniform float uLevelAz[7];
uniform float uRingAz;
const float W_TAU = 6.28318530718;
vec4 numeral(float idx, vec2 uv, vec2 gx, vec2 gy) {
  vec2 cell = vec2(mod(idx, 4.0), floor(idx / 4.0));
  vec2 a = vec2((cell.x + clamp(uv.x, 0.0, 1.0)) * 0.25, 1.0 - (cell.y + 1.0 - clamp(uv.y, 0.0, 1.0)) / 6.0);
  return textureGrad(uNumerals, a, gx * vec2(0.25, 1.0 / 6.0), gy * vec2(0.25, 1.0 / 6.0));
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 P = vDhWorldPos;
  vec2 O = P.xz - PIT_C;
  float olen = max(length(O), 1e-3);
  vec2 T = vec2(-O.y, O.x) / olen;
  vec3 dpx = dFdx(P);
  vec3 dpy = dFdy(P);
  vec2 gU = vec2(dot(dpx.xz, T), dot(dpy.xz, T));
  vec2 gY = vec2(dpx.y, dpy.y);
  float az = atan(O.x, -O.y);
  float az01 = az / W_TAU + 0.5;
  float depth = clamp((PIT_RIM - P.y) / (PIT_RIM - PIT_FLOOR), 0.0, 1.0);
  float band = floor(max(PIT_RIM - P.y, 0.0) / 14.0);
  const float NCOL = 48.0;
  float colW = W_TAU * PIT_R / NCOL;
  float rowH = 2.5;
  float row = floor(P.y / rowH);
  float cu = az01 * NCOL + hash11(row * 1.37 + 3.0);
  float col = mod(floor(cu), NCOL);
  vec2 cellM = vec2(fract(cu) * colW, fract(P.y / rowH) * rowH);
  float edge = min(min(cellM.x, colW - cellM.x), min(cellM.y, rowH - cellM.y));
  float h = hash21(vec2(col, row));
  float h2 = hash21(vec2(col + 17.0, row - 5.0));
  float litP = max(0.95 * pow(0.62, band), 0.07);
  float lit = step(h, litP);
  float frame = 1.0 - smoothstep(0.1, 0.17, edge);
  float n = fbm(P * vec3(0.3, 0.55, 0.3));
  float dust = clamp(depth * 1.1 + n * 0.35 - 0.2, 0.0, 1.0);
  vec3 frameCol = mix(vec3(0.16, 0.17, 0.2), vec3(0.3, 0.28, 0.26), smoothstep(0.15, 0.85, depth));
  vec3 glass = mix(vec3(0.010, 0.013, 0.02), vec3(0.2, 0.18, 0.16), dust * 0.6);
  vec3 wAlbedo = mix(glass, frameCol, frame);
  float wRough = mix(mix(0.06, 0.7, dust), 0.3 + 0.45 * depth, frame);
  float wMetal = frame * 0.35;
  vec3 wEmit = vec3(0.0);
  float socket = step(h2, (depth - 0.5) * 1.3) * (1.0 - lit);
  wAlbedo = mix(wAlbedo, vec3(0.15, 0.14, 0.13) * (0.75 + 0.5 * n), socket);
  wRough = mix(wRough, 0.95, socket);
  float crack = step(0.82, h2) * step(0.3, depth) * (1.0 - lit) * (1.0 - frame);
  vec3 vc = voronoi(cellM * 1.3 + h * 20.0);
  wAlbedo += vec3(0.08) * crack * (1.0 - smoothstep(0.0, 0.05, vc.y - vc.x));

  vec2 inner = vec2(colW, rowH) - 0.34;
  vec2 sp = cellM - 0.17;
  float halfW = inner.x * 0.5;
  float ci = floor(clamp(sp.x / halfW, 0.0, 1.999));
  vec4 card = feedColumn(vec2(sp.x - ci * halfW, sp.y), halfW, 0.05 + 0.2 * hash11(h * 91.0 + ci), h * 50.0 + ci);
  vec3 scr = mix(vec3(0.02, 0.025, 0.06), card.rgb * vec3(0.8, 0.86, 0.95), card.a);
  float vid = step(0.62, hash11(h * 47.0 + 5.0));
  vec2 vq = cellM / vec2(colW, rowH);
  vec3 vcol = mix(vec3(1.0, 0.37, 0.63), vec3(0.36, 0.88, 0.9), 0.5 + 0.5 * sin(vq.x * 3.0 + vq.y * 2.0 + uTime * (0.4 + h)));
  vcol *= 0.35 + 0.65 * smoothstep(0.2, 0.8, vnoise(vq * 3.0 + vec2(uTime * 0.3, h * 9.0)) * 0.5 + 0.5);
  vcol = mix(vcol, vec3(1.0), smoothstep(0.08, 0.0, abs(length((vq - 0.5) * vec2(1.4, 1.0)) - 0.16)) * 0.9);
  scr = mix(scr, vcol * 0.8, vid);
  float warm = smoothstep(2.5, 6.5, band);
  scr *= mix(vec3(1.0), vec3(1.3, 0.82, 0.45), warm);
  float flick = mix(1.0, step(0.22, hash11(floor(uTime * 8.0) + h * 300.0)), step(3.0, band));
  float inten = mix(1.7, 0.75, depth) * flick * (1.0 + 0.5 * uNight);
  float screenOn = lit * (1.0 - frame);
  wEmit += scr * inten * screenOn;
  wAlbedo = mix(wAlbedo, vec3(0.01), screenOn);
  wRough = mix(wRough, 0.18, screenOn);
  wEmit += frame * vec3(0.36, 0.88, 0.9) * 0.9 * (1.0 - smoothstep(0.0, 0.16, depth)) * (1.0 + uNight);

  float k = floor((128.0 - P.y) / 14.0);
  float yk = 121.0 - 14.0 * k;
  float lvl = step(0.0, k) * step(k, 6.0) * step(abs(P.y - yk), 3.3);
  float base = uLevelAz[int(clamp(k, 0.0, 6.0))];
  float da = mod(az - base + W_TAU / 6.0, W_TAU / 3.0) - W_TAU / 6.0;
  float du = da * PIT_R;
  vec2 nuv = vec2(du / 14.0 + 0.5, (P.y - yk) / 6.6 + 0.5);
  vec4 num = numeral(clamp(k, 0.0, 6.0), nuv, vec2(gU.x / 14.0, gY.x / 6.6), vec2(gU.y / 14.0, gY.y / 6.6));
  float plate = lvl * step(abs(du), 7.4);
  float ringSlot = W_TAU / 17.0;
  float rj = floor(mod(az - uRingAz + ringSlot * 0.5, W_TAU) / ringSlot);
  float rda = mod(az - uRingAz + ringSlot * 0.5, ringSlot) - ringSlot * 0.5;
  float rdu = rda * PIT_R;
  vec2 ruv = vec2(rdu / 4.4 + 0.5, (P.y - 10.0) / 2.0 + 0.5);
  vec4 rnum = numeral(7.0 + rj, ruv, vec2(gU.x / 4.4, gY.x / 2.0), vec2(gU.y / 4.4, gY.y / 2.0));
  float rplate = step(abs(P.y - 10.0), 1.2) * step(abs(rdu), 2.5);
  float anyPlate = max(plate, rplate);
  vec3 plateCol = mix(vec3(0.05, 0.055, 0.07), vec3(0.11, 0.1, 0.09), depth);
  wAlbedo = mix(wAlbedo, plateCol, anyPlate);
  wRough = mix(wRough, 0.55, anyPlate);
  wMetal = mix(wMetal, 0.2, anyPlate);
  wEmit *= 1.0 - anyPlate;
  vec3 numCol = mix(vec3(0.42, 0.95, 1.0), vec3(1.0, 0.62, 0.25), clamp(k / 6.0, 0.0, 1.0));
  float plateEdge = plate * (1.0 - smoothstep(0.05, 0.14, min(7.4 - abs(du), 3.3 - abs(P.y - yk))));
  wEmit += numCol * (num.a * plate * 3.4 + plateEdge * 1.2);
  wEmit += vec3(1.0, 0.66, 0.32) * rnum.a * rplate * 2.4;
  diffuseColor.rgb = wAlbedo;
  float pitSunK = pitSunVis(P, uSunDir);
  float pitSkyK = pitSky(P);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = wRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = wMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += wEmit;');
    replaceLights(shader, 'pitSunK', 'pitSkyK');
  };
}

export function floorShader(uniforms) {
  return (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <dithering_pars_fragment>', `#include <dithering_pars_fragment>\n${GLSL.noise}\n${PIT_GLSL}\nuniform vec3 uPool;\nuniform float uPoolPower;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 P = vDhWorldPos;
  vec2 tile = fract(P.xz / 2.4);
  float seam = 1.0 - smoothstep(0.015, 0.05, min(min(tile.x, 1.0 - tile.x), min(tile.y, 1.0 - tile.y)));
  float n = fbm(vec3(P.xz * 0.35, 1.3));
  float n2 = vnoise(P.xz * 3.1);
  vec3 dustCol = mix(vec3(0.16, 0.145, 0.13), vec3(0.27, 0.24, 0.2), smoothstep(-0.4, 0.6, n));
  vec3 tileCol = mix(vec3(0.42, 0.44, 0.48), vec3(0.3, 0.31, 0.34), hash21(floor(P.xz / 2.4)));
  float cover = smoothstep(-0.35, 0.25, n + n2 * 0.25);
  diffuseColor.rgb = mix(tileCol * (1.0 - seam * 0.6), dustCol, cover);
  float fRough = mix(0.45, 0.95, cover);
  float dPool = length(P.xz - uPool.xz);
  vec3 fEmit = vec3(1.0, 0.56, 0.2) * uPoolPower * (0.4 * exp(-dPool * dPool / 30.0) + 0.07 * exp(-dPool * dPool / 220.0));
  float pitSunK = pitSunVis(P, uSunDir);
  float pitSkyK = pitSky(P);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = fRough;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += fEmit;');
    replaceLights(shader, 'pitSunK', 'pitSkyK');
  };
}

const SCREEN_VERTEX = /* glsl */ `
attribute float aSeed;
attribute vec2 aSize;
varying vec2 vUv;
varying vec3 vWorld;
varying float vSeed;
varying vec2 vSize;
void main() {
  vUv = uv;
  vSeed = aSeed;
  vSize = aSize;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const SCREEN_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.noise}
${GLSL.fog}
${POSTS_GLSL}
varying vec2 vUv;
varying vec3 vWorld;
varying float vSeed;
varying vec2 vSize;
void main() {
  vec2 m = vUv * vSize;
  float border = 0.6;
  vec2 im = m - border;
  vec2 isz = vSize - 2.0 * border;
  float nCols = max(2.0, floor(isz.x / 12.0));
  float colW = isz.x / nCols;
  float ci = floor(clamp(im.x / colW, 0.0, nCols - 0.001));
  float sp = 0.05 + 0.2 * hash11(ci * 3.1 + vSeed * 11.0);
  vec4 card = feedColumn(vec2(im.x - ci * colW, im.y), colW, sp, ci + vSeed * 10.0);
  vec3 bg = mix(vec3(0.02, 0.07, 0.32), vec3(0.24, 0.04, 0.3), vUv.y) * mix(1.0, 0.35, uNight);
  bg += vec3(0.02, 0.05, 0.08) * (1.0 - smoothstep(0.0, 0.25, abs(fract(im.x / colW) - 0.5) * 2.0 - 0.75));
  vec3 col = mix(bg, card.rgb * vec3(0.86, 0.9, 1.0), card.a);
  float head = smoothstep(isz.y - 4.5, isz.y - 4.2, im.y);
  vec3 grad = mix(vec3(0.36, 0.88, 0.9), vec3(1.0, 0.37, 0.63), vUv.x);
  col = mix(col, grad, head * 0.85);
  float flash = step(0.985, hash11(floor(uTime * 1.7) + ci * 7.0 + vSeed * 31.0));
  col += card.rgb * card.a * flash * 0.6;
  col *= 0.94 + 0.06 * sin(m.y * 30.0);
  float b = min(min(m.x, vSize.x - m.x), min(m.y, vSize.y - m.y));
  float rim = 1.0 - smoothstep(0.0, border, b);
  col = mix(col, grad * 1.6, rim);
  col = mix(mix(col * 1.5, col * col * 1.75, 0.65), col * 0.42, uNight);
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createScreenMaterial(mat, posts) {
  return mat.shader({
    vertexShader: SCREEN_VERTEX,
    fragmentShader: SCREEN_FRAGMENT,
    uniforms: { uPosts: { value: posts } },
  });
}

const POPUP_VERTEX = /* glsl */ `
attribute vec2 aCell;
attribute float aFade;
varying vec2 vUv;
varying vec3 vWorld;
varying float vFade;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vUv = vec2((aCell.x + uv.x) * 0.25, 1.0 - (aCell.y + 1.0 - uv.y) * 0.25);
  vFade = aFade;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const POPUP_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.noise}
${GLSL.fog}
uniform sampler2D uPopups;
varying vec2 vUv;
varying vec3 vWorld;
varying float vFade;
void main() {
  vec4 t = texture2D(uPopups, vUv);
  if (t.a < 0.5) discard;
  float g = hash21(vec2(floor(gl_FragCoord.y / 3.0), floor(uTime * 30.0)));
  if (vFade < 0.999 && g > vFade) discard;
  vec3 col = gl_FrontFacing ? t.rgb : vec3(0.82, 0.85, 0.92);
  col *= mix(1.05, 2.1, uNight) * (gl_FrontFacing ? 1.0 : 0.45);
  col += vec3(1.0, 0.37, 0.63) * (1.0 - vFade) * 2.0;
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createPopupMaterial(mat, atlas) {
  return mat.shader({
    vertexShader: POPUP_VERTEX,
    fragmentShader: POPUP_FRAGMENT,
    uniforms: { uPopups: { value: atlas } },
    side: THREE.DoubleSide,
  });
}

const STREAM_VERTEX = /* glsl */ `
uniform float uTime;
attribute vec4 aSeed;
attribute float aStream;
varying vec2 vUv;
varying vec3 vWorld;
varying float vAlpha;
varying float vIdx;
const float TAU = 6.28318530718;
const vec2 C = vec2(${f(PIT.cx)}, ${f(PIT.cz)});
void main() {
  float speed = 1.0 / (26.0 + 18.0 * aSeed.y);
  float t = fract(uTime * speed + aSeed.x);
  float a0 = aStream + (aSeed.w - 0.5) * 0.12;
  float r0 = 58.0 + 40.0 * aSeed.z;
  vec3 p;
  float alpha;
  float split = 0.5;
  if (t < split) {
    float s = t / split;
    float r = mix(r0, 25.5, s * s * (3.0 - 2.0 * s));
    float a = a0 + 0.5 * s * s;
    float hgt = 126.0 + 1.5 + 4.0 * aSeed.y + 1.2 * sin(s * 9.0 + aSeed.x * 20.0);
    p = vec3(C.x + sin(a) * r, hgt, C.y - cos(a) * r);
    alpha = smoothstep(0.0, 0.12, s);
  } else {
    float s = (t - split) / (1.0 - split);
    float r = mix(25.5, 4.0 + 6.0 * aSeed.w, pow(s, 0.7));
    float a = a0 + 0.5 + s * (5.0 + 3.0 * aSeed.y);
    float hgt = mix(126.0 + 1.5 + 4.0 * aSeed.y, 14.0, pow(s, 0.85));
    p = vec3(C.x + sin(a) * r, hgt, C.y - cos(a) * r);
    alpha = 1.0 - smoothstep(0.15, 0.7, s);
  }
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float spin = sin(uTime * (0.6 + aSeed.y) + aSeed.z * 30.0) * 0.5;
  vec2 q = vec2(position.x * cos(spin) - position.y * sin(spin), position.x * sin(spin) + position.y * cos(spin));
  float dist = length(cameraPosition - p);
  float grow = clamp(dist / 60.0, 1.0, 3.0);
  vec3 w = p + (right * q.x * 1.1 + up * q.y * 1.3) * grow;
  vUv = uv;
  vWorld = w;
  vAlpha = alpha;
  vIdx = floor(aSeed.z * 16.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

const STREAM_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.noise}
${GLSL.fog}
uniform sampler2D uPosts;
varying vec2 vUv;
varying vec3 vWorld;
varying float vAlpha;
varying float vIdx;
void main() {
  vec2 cell = vec2(mod(vIdx, 4.0), floor(vIdx / 4.0));
  vec2 a = vec2((cell.x + vUv.x) * 0.25, 1.0 - (cell.y + 1.0 - vUv.y) * 0.25);
  vec4 t = texture2D(uPosts, a);
  vec3 tint = mix(vec3(0.5, 0.95, 1.0), vec3(1.0, 0.5, 0.8), step(0.5, fract(vIdx * 0.37)));
  vec3 col = (t.rgb * 0.5 + tint * 0.5) * t.a * vAlpha * mix(0.45, 1.1, uNight);
  gl_FragColor = vec4(applyFogAdditive(col, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createStreamMaterial(mat, posts) {
  return mat.shader({
    vertexShader: STREAM_VERTEX,
    fragmentShader: STREAM_FRAGMENT,
    uniforms: { uPosts: { value: posts } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

const BEAM_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.noise}
${GLSL.fog}
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
  float scan = 0.65 + 0.35 * sin(vUv.y * 40.0 - uTime * 12.0);
  vec3 col = vec3(1.0, 0.37, 0.63) * pow(max(across, 0.0), 2.0) * scan * (0.35 + 0.65 * vUv.y) * 1.6;
  gl_FragColor = vec4(applyFogAdditive(col, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const BEAM_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vWorld = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;

export function createBeamMaterial(mat) {
  return mat.shader({
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}
