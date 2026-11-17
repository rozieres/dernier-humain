import { GLSL } from '../../core/glsl.js';
import { ATLAS } from './atlas.js';
import { wavesGLSL, SURGE } from './waves.js';

const f = (x) => {
  const s = Number(x).toFixed(6);
  return s.includes('.') ? s : `${s}.0`;
};

export function seaShaders({ segLen, rowPitch, mainSegs, isleSegs, seamAngle }) {
  const common = `${GLSL.envPars}\n${GLSL.world}\n${wavesGLSL()}`;

  const vertexShader = /* glsl */ `
${common}
attribute float aCell;
uniform float uGridScale;
varying vec3 vWorld;
varying vec2 vP0;
void main() {
  vec2 p0 = position.xz * uGridScale + vec2(modelMatrix[3].x, modelMatrix[3].z);
  float rest = uSeaLevel - terrainHeight(p0);
  SeaState s = seaWaves(p0, rest, aCell * uGridScale, uTime);
  vec3 w = vec3(p0.x + s.disp.x, uSeaLevel + s.disp.y, p0.y + s.disp.z);
  vP0 = p0;
  vWorld = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

  const fragmentShader = /* glsl */ `
${common}
${GLSL.noise}
${GLSL.fog}
uniform sampler2D uAtlas;
uniform sampler2D uDetail;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uGlyph;
uniform vec2 uDrift;
varying vec3 vWorld;
varying vec2 vP0;

const float PI = 3.14159265;
const float TAU = 6.2831853;
const float SEG = ${f(segLen)};
const float ROWP = ${f(rowPitch)};
const float AROWS = ${f(ATLAS.rows)};
const float MAIN_SEGS = ${f(mainSegs)};
const float ISLE_SEGS = ${f(isleSegs)};
const float SEAM = ${f(seamAngle)};

vec2 glyphs(float u, float v, vec2 du, vec2 dv, float scale, float nSeg, float salt, float halo) {
  float segLen = SEG * scale;
  float pitch = ROWP * scale;
  float rc = v / pitch;
  float row = floor(rc);
  float fy = rc - row;
  float spd = (hash11(row * 0.618 + salt) - 0.5) * 1.3;
  float shift = hash11(row * 2.71 + salt + 0.5) * segLen * nSeg;
  float us = u + mod(spd * uTime + shift, segLen * nSeg);
  float sc = us / segLen;
  float seg = floor(sc);
  float fx = sc - seg;
  seg = mod(seg, nSeg);
  float pick = floor(hash21(vec2(row + salt * 13.0, seg)) * AROWS);
  float blank = step(0.8, hash11(row * 1.37 + salt + 3.1));
  vec2 uv = vec2(fx, (pick + 1.0 - fy) / AROWS);
  vec2 gx = vec2(du.x / segLen, -dv.x / (pitch * AROWS));
  vec2 gy = vec2(du.y / segLen, -dv.y / (pitch * AROWS));
  float sharp = textureGrad(uAtlas, uv, gx, gy).r;
  float soft = textureGrad(uAtlas, uv, gx * halo + vec2(0.004, 0.0), gy * halo + vec2(0.0, 0.25 / AROWS)).r;
  return vec2(sharp, soft) * (1.0 - blank);
}

vec3 detailSlope(vec2 uv, mat2 back, out float len) {
  vec3 n = texture(uDetail, uv).xyz * 2.0 - 1.0;
  len = length(n);
  vec2 sl = n.xy / max(n.z, 0.25);
  return vec3(back * sl, 0.0);
}

void main() {
  vec2 p = vP0;
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 dpx = dFdx(p);
  vec2 dpy = dFdy(p);
  float foot = max(length(dpx), length(dpy));
  float t = uTime;

  float rest = uSeaLevel - terrainHeight(p);
  SeaState s = seaWaves(p, rest, foot, t);
  vec4 fld = seaFld;
  float depth = vWorld.y - terrainHeight(vWorld.xz);
  float v = -fld.x;
  float vText = v + 0.32 * t;
  vec2 dv = vec2(dFdx(vText), dFdy(vText));

  float lenA;
  float lenB;
  const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);
  const mat2 ROT2 = mat2(-0.28, 0.96, -0.96, -0.28);
  vec2 wq = p * 0.0137;
  vec2 warp = vec2(vnoise(wq + vec2(1.7, t * 0.011)), vnoise(wq + vec2(-4.3, 2.9 - t * 0.009))) * 9.0;
  float lay = seaSmooth(-0.3, 0.3, vnoise(p * 0.0191 + warp * 0.03 + 7.7));
  float lenA2;
  vec3 sA = detailSlope((p + warp + uDrift) / 7.3, mat2(1.0), lenA);
  vec3 sA2 = detailSlope((ROT2 * (p - warp) + uDrift * 0.85) / 9.7 + 0.31, transpose(ROT2), lenA2);
  sA = mix(sA, sA2, lay);
  lenA = mix(lenA, lenA2, lay);
  vec3 sB = detailSlope((ROT * (p + warp * 0.6) - uDrift * 0.7) / 2.7, transpose(ROT), lenB);
  float patchy = 0.7 + 0.6 * seaSmooth(-0.5, 0.5, vnoise(p * 0.0083 - warp * 0.02 + 2.3));
  float detailAmp = (0.42 + 0.22 * uWindF.x) * patchy * mix(1.0, 0.55, seaSmooth(90.0, 700.0, dist));
  float calm = 0.6 + 0.4 * seaSmooth(0.0, 2.5, rest);
  vec2 slope = (sA.xy * 0.62 + sB.xy * 0.38) * detailAmp * calm;
  vec3 Ng = normalize(s.n);
  vec3 N = normalize(vec3(s.n.x - slope.x, s.n.y, s.n.z - slope.y));
  float variance = s.variance + (2.0 - lenA - lenB) * 0.06 * detailAmp;

  vec3 L = normalize(uSunDir);
  float sunUp = seaSmooth(-0.06, 0.06, L.y);
  float NdV = max(dot(N, V), 1e-3);
  float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  F = min(F, 0.92);
  vec3 R = reflect(-V, N);
  float ry = clamp(R.y, 0.0, 1.0);
  vec3 sky = mix(uSkyHorizon, uSkyZenith, pow(ry, 0.5));
  sky += uFogSunColor * pow(max(dot(normalize(vec3(R.x, max(R.y, 0.0), R.z)), L), 0.0), 10.0) * 0.5 * sunUp * (1.0 - uNight);

  float deepness = 1.0 - exp(-max(rest, 0.0) / 9.0);
  vec3 base = mix(uShallow, uDeep, deepness);
  vec3 lit = uSkyColor * 0.5 + uSkyZenith * 0.2 + uSunColor * max(L.y, 0.0) * 0.22;
  float crestN = 0.5 + 0.5 * (vnoise(p * 0.0067 + warp * 0.025 + 1.9) + 0.5 * vnoise(p * 0.0183 - 3.3));
  float crest = clamp(s.swell, -1.0, 1.0) * mix(0.25, 1.15, seaSmooth(0.15, 0.85, crestN));
  vec3 body = base * lit * mix(0.7, 1.1, crest * 0.5 + 0.5) * mix(0.75, 1.0, deepness);

  vec3 Lh = normalize(vec3(L.x, 0.0, L.z) + 1e-4);
  vec3 Vh = normalize(vec3(V.x, 0.0, V.z) + 1e-4);
  float toward = pow(clamp(dot(-Vh, Lh), 0.0, 1.0), 3.0);
  float crestN2 = seaSmooth(-0.35, 0.45, vnoise(p * 0.043 + warp * 0.11 - 5.1));
  float graze = (1.0 - V.y) * (1.0 - V.y);
  float sss = seaSmooth(0.1, 0.9, crest * mix(0.3, 1.1, crestN2)) * graze * (toward * 0.8 + 0.3 * max(dot(Ng, L), 0.0)) * sunUp;
  vec3 glow = uShallow * uSunColor * sss * 0.3 * (1.0 - uNight) * seaSmooth(0.3, 3.0, rest);

  vec3 H = normalize(L + V);
  float NdH = max(dot(N, H), 1e-3);
  float m2 = 0.0018 + variance * 1.6 + foot * 0.0008;
  float c2 = NdH * NdH;
  float D = exp(-(1.0 - c2) / (c2 * m2)) / (PI * m2 * c2 * c2);
  float Fh = 0.02 + 0.98 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  float spec = min(D * Fh / (4.0 * NdV), mix(40.0, 2.5, seaSmooth(80.0, 1200.0, dist))) * seaSmooth(0.0, 0.15, dot(N, L)) * (1.0 - 0.85 * seaSmooth(900.0, 3500.0, dist));
  vec3 specCol = uSunColor * spec * sunUp;

  vec3 col = mix(body, sky, F) + glow;

  float wf = uWindF.x;
  float n1 = vnoise(p * 0.09 + vec2(t * 0.05, -t * 0.03)) * 0.5 + 0.5;
  float n2 = vnoise(p * 0.031 - vec2(t * 0.015, t * 0.02)) * 0.5 + 0.5;
  float crestFoam = seaSmooth(0.38, 0.9, s.swell) * (0.45 + 0.35 * wf) + seaSmooth(0.55, 1.0, s.chop) * 0.3 * wf;
  crestFoam *= seaSmooth(0.42, 0.8, n1 * 0.6 + n2 * 0.4) * seaSmooth(0.0, 4.0, rest);
  float off = 0.25 * sin(p.x * 0.021 + p.y * 0.013) + 0.2 * sin(p.y * 0.031 - p.x * 0.007 + 1.3);
  float g = fract(v / ${f(SURGE.spacing)} + t / ${f(SURGE.period)} + off);
  float zone = seaSmooth(6.0, 1.4, rest) * seaSmooth(-1.5, -0.2, rest);
  float bands = exp(-g * 4.0) * zone * (0.5 + 0.5 * seaSmooth(0.25, 0.7, n2));
  float contact = (1.0 - seaSmooth(0.0, 0.7, depth)) * (0.5 + 0.5 * n1) * seaSmooth(-2.0, 0.0, rest + 0.4);
  float mask = clamp(max(max(crestFoam, bands), max(contact, 0.06)), 0.0, 1.0);

  float textA = 0.0;
  float haloA = 0.0;
  float hs = fld.w;
  bool onMain = hs > 0.5;
  vec2 rel = onMain ? p : p - uLightIsle.xy;
  float rr = max(dot(rel, rel), 1.0);
  float nSeg = onMain ? MAIN_SEGS : ISLE_SEGS;
  float radius = nSeg * SEG / TAU;
  float ang = mod(atan(rel.y, rel.x) - (onMain ? SEAM : PI), TAU);
  float u = ang * radius;
  vec2 gu = vec2(-rel.y, rel.x) / rr * radius;
  vec2 du = vec2(dot(gu, dpx), dot(gu, dpy));
  float seamFade = seaSmooth(0.02, 0.1, abs(hs - 0.5));
  float far = seaSmooth(120.0, 700.0, dist);
  vec2 cq = p * 0.0094 + warp * 0.012;
  float covN = vnoise(cq + vec2(3.1, -1.7)) + 0.5 * vnoise(cq * 2.17 + vec2(-8.3, 5.9));
  float cov = mix(1.0, seaSmooth(-0.25, 0.55, covN), seaSmooth(18.0, 70.0, dist));
  float farBase = 0.3 * mix(0.25, 1.0, seaSmooth(-0.4, 0.6, covN));
  if (dist < 900.0) {
    vec2 gl = glyphs(u, vText, du, dv, 1.0, nSeg, 0.0, 5.0);
    float gain = mix(1.0, 1.8, seaSmooth(25.0, 200.0, dist));
    float wu = 9.0 * vnoise(p * 0.017 + 4.1);
    float wv = 3.5 * vnoise(p * 0.013 - 2.6);
    vec2 duW = du * 0.25 + vec2(dFdx(wu), dFdy(wu));
    vec2 dvW = dv * 0.25 + vec2(dFdx(wv), dFdy(wv));
    vec2 st = glyphs(u * 0.25 + wu, (v + 0.55 * t) * 0.25 + wv, duW, dvW, 1.0, nSeg * 0.25, 7.0, 2.0);
    float footG = sqrt(length(dpx) * length(dpy));
    float legNear = 1.0 - seaSmooth(0.14, 0.55, footG);
    float legMid = 1.0 - seaSmooth(0.35, 1.1, footG);
    float mid = seaSmooth(30.0, 160.0, dist) * (1.0 - seaSmooth(200.0, 460.0, dist)) * legMid;
    textA = mix(farBase, max(gl.x * gain, gl.y * 0.5), legNear);
    textA = mix(textA, farBase, far);
    textA = max(textA, st.y * 1.4 * mid);
    haloA = max(gl.y * legNear, st.y * mid);
    textA = mix(farBase, textA * cov, seamFade);
    haloA *= cov;
  } else {
    textA = farBase;
  }
  float dissolve = seaSmooth(0.0, 0.16, depth + (n1 - 0.5) * 0.1);
  float foamA = clamp(textA * mask, 0.0, 1.0) * dissolve;
  float hazeA = clamp(haloA * mask * 0.6, 0.0, 0.5) * dissolve * (1.0 - far) * seamFade;

  vec3 foamLit = (uSkyColor * 0.95 + uSunColor * max(L.y, 0.0) * (0.45 + 0.35 * max(dot(Ng, L), 0.0))) * mix(1.0, 0.25, uNight);
  col = mix(col, foamLit * 0.92, max(foamA, hazeA * 0.5));
  float ghostGlow = textA * dissolve * (1.0 - far) * seaSmooth(0.5, 3.0, rest) * 0.05;
  vec3 emit = uGlyph * uNight * (foamA * (0.2 + 1.0 * mask) + hazeA * 0.3 * mask + ghostGlow);

  float clarity = 0.35 * seaSmooth(0.0, 0.35, depth) + 0.65 * seaSmooth(0.3, 4.5, depth);
  float alpha = clamp(max(clarity, foamA * 0.95), 0.0, 1.0);

  float edge = seaSmooth(1800.0, 5200.0, dist);
  float fogK = fogFactor(vWorld);
  col = mix(col, fogTint(vWorld), fogK);
  vec3 extra = (specCol * (1.0 - foamA) + emit) * (1.0 - max(fogK, edge));
  alpha *= 1.0 - edge;
  gl_FragColor = vec4(col * alpha + extra, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
  return { vertexShader, fragmentShader };
}
