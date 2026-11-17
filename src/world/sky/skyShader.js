import { GLSL } from '../../core/glsl.js';

export const SAT_PLANES = 9;

export const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

export const SKY_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.noise}
${GLSL.fog}

#define SAT_PLANES ${SAT_PLANES}

uniform vec3 uSunTrue;
uniform vec3 uMoonDir;
uniform vec3 uMoonLight;
uniform vec3 uMidA;
uniform vec3 uMidS;
uniform vec3 uHorS;
uniform vec3 uGlow;
uniform vec3 uDisc;
uniform float uHaze;
uniform float uZenLow;
uniform vec3 uMoonCol;
uniform float uMoonVis;
uniform vec3 uMoonSky;
uniform float uStars;
uniform mat3 uStarRot;
uniform float uAurora;
uniform float uCover;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec2 uCloudOffset;
uniform float uSkyDim;
uniform float uPixelAngle;
uniform vec3 uSatN[SAT_PLANES];
uniform vec3 uSatA[SAT_PLANES];
uniform vec3 uSatB[SAT_PLANES];
uniform vec4 uSatP[SAT_PLANES];
uniform vec3 uGround;

varying vec3 vDir;

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

float fbmN(vec2 p, int oct) {
  const mat2 R = mat2(0.8, -0.6, 0.6, 0.8);
  float s = 0.0;
  float a = 0.5;
  float n = 0.0;
  for (int i = 0; i < 5; i++) {
    if (i >= oct) break;
    s += a * snoise(p);
    n += a;
    p = R * p * 2.07 + 13.1;
    a *= 0.45;
  }
  return s / n;
}

vec3 skyGradient(vec3 d) {
  float e = max(d.y, 0.0);
  vec2 dh = normalize(d.xz + vec2(1e-5, 0.0));
  vec2 sh = normalize(uSunTrue.xz + vec2(1e-5, 0.0));
  float side = clamp(dot(dh, sh) * 0.5 + 0.5, 0.0, 1.0);
  vec3 hor = mix(uSkyHorizon, uHorS, pow(side, 3.5));
  vec3 mid = mix(uMidA, uMidS, pow(side, 2.6));
  vec3 col = mix(hor, mid, pow(clamp(e / 0.3, 1e-6, 1.0), 0.7));
  col = mix(col, uSkyZenith, pow(max(smoothstep(0.08 - 0.04 * uZenLow, 1.0 - 0.45 * uZenLow, e), 1e-6), 0.75 - 0.2 * uZenLow));
  float s = max(dot(d, uSunTrue), 0.0);
  float horizonBoost = 1.0 - 0.55 * smoothstep(0.0, 0.6, e);
  col += uGlow * (pow(s, 6.0) * 0.22 * horizonBoost + pow(s, 48.0) * 0.35 + pow(s, 3000.0) * 5.0);
  float m = max(dot(d, uMoonDir), 0.0);
  col += uMoonSky * (0.35 + pow(m, 4.0) * 0.8 + pow(m, 60.0) * 2.5) * uMoonVis;
  return col;
}

vec3 hazeAndGround(vec3 d, vec3 col) {
  vec3 haze = fogTint(cameraPosition + d * 1000.0);
  col = mix(haze, col, smoothstep(0.0, uHaze, d.y));
  #ifdef ENV_CAPTURE
  col = mix(col, uGround, smoothstep(-0.02, -0.25, d.y));
  #else
  col = mix(col, haze * 0.82, smoothstep(0.0, -0.3, d.y));
  #endif
  return col;
}

vec3 starLayer(vec3 p, float K, float density, float bright) {
  vec3 q = p * K;
  vec3 c = floor(q);
  vec3 h = hash33(c);
  if (h.x > density) return vec3(0.0);
  vec3 sp = c + 0.3 + 0.4 * hash33(c + 17.31);
  float dist = length(q - sp);
  float px = uPixelAngle * K * 0.62;
  float sig = max(px, 0.035);
  float b = exp(-dist * dist / (sig * sig)) * (px / sig);
  float mag = pow(h.y, 7.0) * bright + 0.06;
  float tw = 0.75 + 0.25 * sin(uTime * (2.0 + h.z * 6.0) + h.y * 40.0);
  vec3 tintc = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.82, 0.62), h.z);
  return tintc * b * mag * mix(1.0, tw, smoothstep(0.3, 0.9, h.y));
}

vec3 stars(vec3 d) {
  vec3 sd = uStarRot * d;
  vec3 mwN = normalize(vec3(0.42, 0.18, 0.89));
  float x = dot(sd, mwN);
  float band = exp(-x * x / 0.035);
  vec3 col = vec3(0.0);
  if (band > 0.02) {
    float n = fbm(sd * 3.2) * 0.5 + 0.5;
    float n2 = fbm(sd * 9.0 + 4.0) * 0.5 + 0.5;
    float lane = smoothstep(0.012, 0.07, abs(x + 0.05 * (n - 0.5) + 0.02));
    float core = exp(-x * x / 0.008);
    vec3 mw = mix(vec3(0.42, 0.5, 0.75), vec3(0.85, 0.72, 0.6), core * n);
    col += mw * band * (0.35 + 0.65 * n) * (0.5 + 0.5 * n2) * mix(0.3, 1.0, lane) * 0.09;
  }
  col += starLayer(sd, 95.0, 0.12, 7.0);
  col += starLayer(sd, 230.0, 0.05 + 0.3 * band, 2.5) * 0.7;
  col += starLayer(sd.zxy, 420.0, 0.025 + 0.4 * band, 1.2) * 0.32;
  return col;
}

float satellites(vec3 d) {
  float acc = 0.0;
  float sig = max(uPixelAngle * 0.75, 0.0006);
  for (int i = 0; i < SAT_PLANES; i++) {
    float dn = dot(d, uSatN[i]);
    if (abs(dn) > sig * 4.0) continue;
    vec4 P = uSatP[i];
    float ang = atan(dot(d, uSatB[i]), dot(d, uSatA[i]));
    float spacing = 6.2831853 / P.x;
    float ph = ang - uTime * P.y - P.z;
    float k = floor(ph / spacing + 0.5);
    float off = ph - k * spacing;
    if (P.w > 0.0 && mod(k, P.x) >= P.w) continue;
    float dd = off * off + dn * dn;
    acc += exp(-dd / (sig * sig));
  }
  return acc;
}

vec3 aurora(vec3 d) {
  if (d.y < 0.0) return vec3(0.0);
  float phi = atan(d.x, -d.z);
  float envl = smoothstep(1.9, 0.5, abs(phi));
  if (envl <= 0.0) return vec3(0.0);
  float el = asin(clamp(d.y, 0.0, 1.0));
  vec3 acc = vec3(0.0);
  vec3 cyan = vec3(0.12, 0.9, 0.85);
  vec3 magenta = vec3(1.0, 0.2, 0.62);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float t = uTime * 0.025 + fi * 3.1;
    float w = snoise(vec2(phi * 0.9 + fi * 5.3, t));
    float w2 = snoise(vec2(phi * 2.6 - fi * 2.1, t * 1.7 + 4.0));
    float base = 0.04 + fi * 0.045 + 0.14 * (w * 0.5 + 0.5) + 0.03 * w2;
    float h = el - base;
    if (h < -0.01) continue;
    float patchy = smoothstep(-0.1, 0.6, snoise(vec2(phi * 1.2 + fi * 9.7, t * 0.8)));
    float fold = phi * (6.0 + fi * 3.0) + w * 3.0 + w2 * 1.2;
    float rays = 0.6 + 0.4 * snoise(vec2(fold * 5.0, t * 2.0 + fi * 7.0));
    rays *= 0.85 + 0.15 * snoise(vec2(fold * 17.0, t * 3.0));
    float knots = pow(snoise(vec2(phi * 3.2 + fi * 4.0, t * 1.3)) * 0.5 + 0.5, 2.0) * 1.7 + 0.2;
    float height = 0.05 + 0.07 * (snoise(vec2(phi * 1.3 + 9.0, t * 0.6 + fi)) * 0.5 + 0.5);
    float prof = smoothstep(-0.008, 0.01, h) * exp(-max(h, 0.0) / height) * (1.0 + 1.5 * exp(-max(h, 0.0) / 0.012)) * (1.0 - smoothstep(height * 1.2, height * 3.5, h));
    float column = floor(fold * 9.0);
    float packet = smoothstep(0.92, 1.0, fract(h * 22.0 - uTime * 0.45 + hash11(column + fi * 31.0) * 9.0));
    packet *= step(0.6, hash11(column * 1.7 + floor(uTime * 0.2) + fi));
    vec3 c = mix(cyan, magenta, smoothstep(0.02, 0.11, h) * 0.9);
    acc += c * prof * rays * patchy * knots * (1.0 + packet * 1.2) * (0.7 - fi * 0.17);
  }
  return acc * envl * uAurora;
}

vec4 cloudLayer(vec3 d, float alt, float scale, float drift, float cov, float alphaMax, int oct, float stretch) {
  float R = 40000.0;
  float hRel = max(alt - cameraPosition.y, 50.0);
  float b = R * d.y;
  float t = sqrt(b * b + 2.0 * R * hRel + hRel * hRel) - b;
  vec2 wp = cameraPosition.xz + d.xz * t + uCloudOffset * drift;
  vec2 wdir = normalize(uWind.xy + vec2(1e-4, 0.0));
  vec2 wperp = vec2(-wdir.y, wdir.x);
  vec2 p = vec2(dot(wp, wdir), dot(wp, wperp)) * scale;
  p.y *= stretch;
  p += vec2(snoise(p * 0.3 + 3.7), snoise(p * 0.3 - 8.1)) * 0.18;
  float th = mix(0.8, 0.42, cov) - 0.12 * snoise(p * 0.17 + 21.0);
  float base = fbmN(p, 2) * 0.5 + 0.5;
  float near = smoothstep(th - 0.16, th, base);
  if (near <= 0.0) return vec4(0.0);
  float v = base + fbmN(p * 3.1 + 5.0, oct - 2) * 0.16 * near;
  float dens = smoothstep(th, th + 0.13, v);
  if (dens <= 0.001) return vec4(0.0);
  float thick = smoothstep(th, th + 0.32, v);
  vec2 ls = normalize(vec2(dot(uSunDir.xz, wdir), dot(uSunDir.xz, wperp)) + vec2(1e-4, 0.0));
  float v2 = fbmN(p + ls * 0.14, 2) * 0.5 + 0.5 + fbmN(p * 3.1 + 5.0 + ls * 0.43, 2) * 0.16 * near;
  float sunward = clamp((v2 - v) * 5.0, -1.0, 1.0);
  float lit = clamp(0.8 - sunward * 0.7 - thick * 0.5, 0.0, 1.0);
  float s = max(dot(d, uSunDir), 0.0);
  float silver = (pow(s, 8.0) * 0.7 + pow(s, 40.0) * 1.6) * (1.0 - thick) * dens;
  vec3 col = mix(uCloudShade, uCloudLit, lit) + uCloudLit * silver;
  float fade = exp(-t / 26000.0) * smoothstep(0.0, 0.05, d.y);
  return vec4(col, dens * alphaMax * fade);
}

void main() {
  vec3 d = normalize(vDir);
  vec3 col = skyGradient(d);

  #ifndef ENV_CAPTURE
  float skyL = lum(col);
  float starVis = uStars * smoothstep(0.03, 0.004, skyL) * smoothstep(-0.02, 0.12, d.y);
  if (starVis > 0.001) {
    col += stars(d) * starVis;
    col += vec3(0.8, 0.95, 1.0) * satellites(d) * 1.1 * starVis;
  }
  #endif

  if (uAurora > 0.001) col += aurora(d) * 1.6;

  col = hazeAndGround(d, col);
  float above = smoothstep(-0.002, 0.003, d.y);
  float tr = mix(0.4, 1.0, smoothstep(0.0, 0.1, d.y)) * above;

  float md = dot(d, uMoonDir);
  if (uMoonVis > 0.0 && md > 0.9993) {
    vec3 T = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
    vec3 B = cross(T, uMoonDir);
    vec2 uv = vec2(dot(d, T), dot(d, B)) / 0.033;
    float r2 = dot(uv, uv);
    if (r2 < 1.2) {
      float fw = fwidth(r2) + 1e-4;
      float mask = 1.0 - smoothstep(1.0 - fw, 1.0 + fw, r2);
      vec3 n = T * uv.x + B * uv.y - uMoonDir * sqrt(max(1.0 - r2, 0.0));
      float lit = smoothstep(-0.04, 0.12, dot(n, uMoonLight));
      #ifdef ENV_CAPTURE
      float albedo = 0.85;
      #else
      float albedo = 0.84 + 0.1 * fbmN(uv * 3.0 + 3.0, 4) - 0.24 * smoothstep(0.0, 0.45, snoise(uv * 1.4 + 7.0)) - 0.1 * smoothstep(0.2, 0.6, snoise(uv * 3.1 - 2.0));
      #endif
      vec3 moon = uMoonCol * (lit * albedo + 0.025);
      col = mix(col, col * 0.3 + moon * tr, mask * uMoonVis * above);
    }
  }

  #ifndef ENV_CAPTURE
  float sd = dot(d, uSunTrue);
  if (sd > 0.9997) {
    const float SUN_COS = 0.99984;
    float x = clamp((1.0 - sd) / (1.0 - SUN_COS), 0.0, 1.0);
    float fw = fwidth(x) + 1e-3;
    float disc = 1.0 - smoothstep(1.0 - fw, 1.0, x);
    float limb = 1.0 - 0.45 * (1.0 - sqrt(max(1.0 - x, 0.0)));
    col += uDisc * disc * limb * tr;
  }
  #endif

  if (d.y > -0.01 && uCover > 0.0) {
    #ifdef ENV_CAPTURE
    vec4 c3 = cloudLayer(d, 7000.0, 1.0 / 9000.0, 1.8, uCover * 0.8, 0.28, 3, 2.6);
    vec4 c2 = vec4(0.0);
    vec4 c1 = cloudLayer(d, 1500.0, 1.0 / 3200.0, 1.0, uCover, 0.95, 3, 1.0);
    #else
    vec4 c3 = cloudLayer(d, 7000.0, 1.0 / 9000.0, 1.8, uCover * 0.8, 0.28, 3, 2.6);
    vec4 c2 = cloudLayer(d, 3200.0, 1.0 / 2400.0, 1.35, uCover * 0.4, 0.42, 4, 1.0);
    vec4 c1 = cloudLayer(d, 1500.0, 1.0 / 3200.0, 1.0, uCover, 0.95, 5, 1.0);
    #endif
    float aer = smoothstep(0.0, 0.3, d.y);
    vec3 haze = fogTint(cameraPosition + d * 1000.0);
    col = mix(col, mix(haze, c3.rgb, aer * 0.7 + 0.3), c3.a);
    col = mix(col, mix(haze, c2.rgb, aer * 0.7 + 0.3), c2.a);
    col = mix(col, mix(haze, c1.rgb, aer * 0.7 + 0.3), c1.a);
  }

  col *= 1.0 - uSkyDim;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #ifdef DITHER_OUT
  gl_FragColor.rgb += (hash21(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  #endif
}
`;
