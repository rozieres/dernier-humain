import * as THREE from 'three';

const lin = (hex) => {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`;
};

export const FARM = { angle: 0.52, period: 2.4, parcel: 74 };

export const PALETTE = /* glsl */ `
const vec3 C_MEADOW = ${lin('#6fae3c')};
const vec3 C_MEADOW_TIP = ${lin('#a8d05a')};
const vec3 C_MEADOW_YELLOW = ${lin('#a9c43e')};
const vec3 C_MEADOW_BLUE = ${lin('#3a9a6c')};
const vec3 C_MEADOW_DEEP = ${lin('#3f7f2a')};
const vec3 C_FEED = ${lin('#bcc3cf')};
const vec3 C_FEED_ALT = ${lin('#aeb6c4')};
const vec3 C_CYAN = ${lin('#5ce1e6')};
const vec3 C_MAGENTA = ${lin('#ff5fa2')};
const vec3 C_WHEAT = ${lin('#d9b44a')};
const vec3 C_WHEAT_GREEN = ${lin('#a7ad48')};
const vec3 C_FURROW = ${lin('#6a4a2a')};
const vec3 C_PLOUGH = ${lin('#7d5634')};
const vec3 C_HALLU_BASE = ${lin('#2a1740')};
const vec3 C_VIOLET = ${lin('#c77dff')};
const vec3 C_MINT = ${lin('#7af5c8')};
const vec3 C_TERRACOTTA = ${lin('#c96f4a')};
const vec3 C_OLDSAND = ${lin('#e2b47a')};
const vec3 C_CLAY = ${lin('#b8734c')};
const vec3 C_FOREST_BLACK = ${lin('#0f1d16')};
const vec3 C_MOSS = ${lin('#24432f')};
const vec3 C_LITTER = ${lin('#3d2e1f')};
const vec3 C_SAND = ${lin('#e4cc9c')};
const vec3 C_SAND_WET = ${lin('#9c8562')};
const vec3 C_ROCK = ${lin('#8d857b')};
const vec3 C_ROCK_DARK = ${lin('#5b544d')};
const vec3 C_ROCK_FEED = ${lin('#a4a6ad')};
const vec3 C_ROCK_HALLU = ${lin('#4d3f63')};
const vec3 C_ROCK_COAST = ${lin('#6f6a62')};
const vec3 C_PATH = ${lin('#a08562')};
const vec3 C_PATH_DARK = ${lin('#74614a')};
const vec3 C_PEBBLE = ${lin('#b5ab9c')};
const vec3 C_SEA_SHALLOW = ${lin('#2bb7b3')};
const vec3 C_SEA_DEEP = ${lin('#0e3a4a')};
const float FARM_ANGLE = ${FARM.angle.toFixed(4)};
const float FARM_PERIOD = ${FARM.period.toFixed(4)};
const float FARM_PARCEL = ${FARM.parcel.toFixed(4)};
`;

export const GROUND_COMMON = /* glsl */ `
${PALETTE}
float trSat(float x) { return clamp(x, 0.0, 1.0); }
float trFade(float scale, float fp) { return 1.0 - smoothstep(scale * 0.08, scale * 0.3, fp); }

float terrainHeightExact(vec2 xz) {
  vec2 f = clamp((xz + uWorldHalf) / 4.0, vec2(0.0), vec2(WORLD_GRID - 1.001));
  ivec2 i = ivec2(floor(f));
  vec2 t = f - vec2(i);
  float h00 = texelFetch(uHeightTex, i, 0).r;
  float h10 = texelFetch(uHeightTex, i + ivec2(1, 0), 0).r;
  float h01 = texelFetch(uHeightTex, i + ivec2(0, 1), 0).r;
  float h11 = texelFetch(uHeightTex, i + ivec2(1, 1), 0).r;
  if (t.x + t.y <= 1.0) return h00 + (h10 - h00) * t.x + (h01 - h00) * t.y;
  return h11 + (h01 - h11) * (1.0 - t.x) + (h10 - h11) * (1.0 - t.y);
}

vec2 biomeWarp(vec2 xz) {
  return vec2(snoise(xz * 0.021), snoise(xz * 0.021 + 17.3)) * 7.0
    + vec2(snoise(xz * 0.093 + 5.1), snoise(xz * 0.093 - 3.7)) * 2.0;
}

vec3 meadowMacro(vec2 xz) {
  float m1 = snoise(xz * 0.0024);
  float m2 = snoise(xz * 0.0068 + 3.1);
  float m3 = snoise(xz * 0.019 - 7.7);
  vec3 c = C_MEADOW;
  c = mix(c, C_MEADOW_YELLOW, smoothstep(0.0, 0.75, m1) * 0.7);
  c = mix(c, C_MEADOW_BLUE, smoothstep(0.05, 0.8, -m1) * 0.6);
  c = mix(c, C_MEADOW_YELLOW, smoothstep(0.35, 0.95, m2) * 0.35);
  c = mix(c, C_MEADOW_DEEP, smoothstep(0.3, 0.9, -m2) * 0.3);
  c *= 0.9 + 0.13 * m3;
  return c;
}

float cloverMask(vec2 xz) {
  float n = snoise(xz * 0.085) + 0.55 * snoise(xz * 0.23 + 9.0);
  return smoothstep(0.45, 1.0, n) * 0.8;
}

vec2 farmFrame(vec2 xz) {
  vec2 d = vec2(cos(FARM_ANGLE), sin(FARM_ANGLE));
  return vec2(dot(xz, d), dot(xz, vec2(-d.y, d.x)));
}

// x: crop kind (0 wheat ripe, 1 wheat green, 2 ploughed), y: parcel edge distance (m)
vec2 farmParcel(vec2 xz) {
  vec3 v = voronoi(xz / FARM_PARCEL + 0.37);
  float kind = v.z < 0.58 ? 0.0 : (v.z < 0.8 ? 1.0 : 2.0);
  return vec2(kind, (v.y - v.x) * FARM_PARCEL);
}
`;

export const TERRAIN_SURFACE = /* glsl */ `
struct TSurf { vec3 albedo; float rough; float bump; vec3 emissive; };

void addSurf(inout TSurf s, float w, vec3 albedo, float rough, float bump, vec3 emissive) {
  s.albedo += w * albedo;
  s.rough += w * rough;
  s.bump += w * bump;
  s.emissive += w * emissive;
}

float trGrid(vec2 uv, float lineWidth) {
  vec2 d = max(fwidth(uv), vec2(1e-5));
  vec2 drawW = clamp(vec2(lineWidth), d, vec2(0.5));
  vec2 aa = d * 1.5;
  vec2 g = 1.0 - abs(fract(uv) * 2.0 - 1.0);
  vec2 l = smoothstep(drawW + aa, drawW - aa, g);
  l *= clamp(lineWidth / drawW, 0.0, 1.0);
  l = mix(l, vec2(lineWidth), clamp(d * 2.0 - 1.0, 0.0, 1.0));
  return mix(l.x, 1.0, l.y);
}

void surfMeadow(inout TSurf s, float w, vec2 xz, float fp, float steep) {
  vec3 c = meadowMacro(xz);
  float fClover = trFade(14.0, fp);
  float clover = cloverMask(xz);
  c = mix(c, mix(c, C_MEADOW_BLUE, 0.3) * 0.78, clover * mix(0.35, 1.0, fClover));
  float fFine = trFade(1.2, fp);
  float fine = vnoise(xz * 1.9) * 0.6 + vnoise(xz * 4.3) * 0.4;
  c *= 1.0 + 0.14 * fine * fFine;
  c = mix(c, c * vec3(1.05, 0.95, 0.7), smoothstep(0.04, 0.14, steep) * 0.5);
  float bump = (0.05 * fine * fFine + 0.04 * clover * fClover);
  addSurf(s, w, c, 0.88, bump, vec3(0.0));
}

void surfFeed(inout TSurf s, float w, vec2 xz, float fp, float ndv) {
  vec2 uv = xz / 4.0;
  float seam = trGrid(uv, 0.018);
  float major = trGrid(xz / 24.0, 0.0045);
  vec2 id = floor(uv);
  vec2 f = abs(fract(uv) - 0.5);
  float bevel = smoothstep(0.43, 0.49, max(f.x, f.y)) * trFade(1.0, fp);
  float checker = mod(id.x + id.y, 2.0);
  vec3 c = mix(C_FEED, C_FEED_ALT, checker * 0.6);
  c *= 1.0 - 0.12 * bevel;
  seam = max(seam, major);
  vec3 pearl = 0.5 + 0.5 * cos(6.2831 * (ndv * 1.4 + vec3(0.0, 0.33, 0.67)));
  c = mix(c, c * (0.85 + 0.3 * pearl), 0.35 * (1.0 - ndv));
  c = mix(c, C_CYAN * 0.4, seam);
  float glow = 0.55 + 3.4 * uNight;
  vec3 e = C_CYAN * (seam + major * 1.5) * glow * mix(1.0, 0.45, smoothstep(0.4, 4.0, fp));
  e += C_MAGENTA * 0.02 * (1.0 - ndv) * pearl.x;
  addSurf(s, w, c, 0.16 + 0.05 * seam + 0.1 * bevel, -0.02 * seam - 0.01 * bevel, e);
}

void surfFarm(inout TSurf s, float w, vec2 xz, float fp) {
  vec2 fr = farmFrame(xz);
  vec2 parcel = farmParcel(xz);
  float row = 0.5 + 0.5 * cos(fr.y * 6.2831 / FARM_PERIOD);
  float fRow = trFade(FARM_PERIOD, fp);
  float rowF = mix(0.55, row, fRow);
  vec3 crop = parcel.x < 0.5 ? C_WHEAT : (parcel.x < 1.5 ? C_WHEAT_GREEN : C_PLOUGH * 1.15);
  float var = snoise(xz * 0.02) * 0.08 + snoise(xz * 0.31) * 0.05 * trFade(5.0, fp);
  vec3 c = mix(C_FURROW, crop * (1.0 + var), smoothstep(0.2, 0.8, rowF));
  float hedge = 1.0 - smoothstep(1.2, 3.2, parcel.y);
  c = mix(c, meadowMacro(xz) * 0.85, hedge);
  addSurf(s, w, c, 0.9, 0.14 * row * fRow * (1.0 - hedge), vec3(0.0));
}

void surfHallu(inout TSurf s, float w, vec2 xz, float fp, float ndv) {
  float t = uTime;
  float thick = 0.5 + 0.5 * snoise(vec3(xz * 0.035, t * 0.03)) + 0.25 * snoise(xz * 0.13);
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (thick * 1.6 + (1.0 - ndv) * 1.3 + vec3(0.0, 0.33, 0.67)));
  float graze = pow(1.0 - ndv, 2.0);
  float film = smoothstep(0.2, 0.9, 0.5 + 0.5 * snoise(xz * 0.018 - t * 0.01));
  vec3 c = C_HALLU_BASE * (0.85 + 0.3 * thick) + irid * (0.04 + 0.22 * graze) * (0.35 + 0.65 * film);
  vec2 q = xz * 0.045;
  q += vec2(snoise(q * 1.3 + t * 0.025), snoise(q * 1.3 + 7.0 - t * 0.02)) * 0.85;
  float v = abs(snoise(q * 2.2 + vec2(0.0, t * 0.01)));
  float vw = 0.025 + fp * 0.05;
  float vein = (1.0 - smoothstep(0.0, vw, v)) * trFade(9.0, fp);
  vec3 veinCol = mix(C_VIOLET, C_MINT, 0.5 + 0.5 * snoise(q * 0.7 + t * 0.05));
  vec3 e = veinCol * vein * (0.18 + 1.6 * uNight) + irid * graze * film * 0.03;
  c = mix(c, veinCol * 0.35, vein * 0.5);
  addSurf(s, w, c, 0.44, -0.03 * vein, e);
}

void surfOldweb(inout TSurf s, float w, vec2 xz, float fp, float steep) {
  float m = snoise(xz * 0.011);
  vec3 c = mix(C_TERRACOTTA, C_OLDSAND, smoothstep(-0.4, 0.6, m));
  c *= 0.92 + 0.1 * snoise(xz * 0.05 + 2.0);
  vec2 d = vec2(0.8, 0.6);
  float rp = sin((dot(xz, d) + 0.9 * snoise(xz * 0.07)) * 6.2831 / 0.85);
  float fR = trFade(0.85, fp);
  c *= 1.0 + 0.05 * rp * fR;
  float flat_ = (1.0 - smoothstep(0.01, 0.05, steep)) * smoothstep(-0.1, 0.35, snoise(xz * 0.017 + 4.0));
  vec3 vor = voronoi(xz * 0.8 + 0.25 * vec2(snoise(xz * 0.6), snoise(xz * 0.6 + 4.0)));
  float fC = trFade(1.3, fp);
  float crack = (1.0 - smoothstep(0.02, 0.07, vor.y - vor.x)) * fC;
  vec3 clay = mix(C_CLAY * 1.15, C_OLDSAND, 0.25) * (0.94 + 0.08 * vor.z);
  c = mix(c, clay, flat_);
  c = mix(c, c * 0.45, crack * flat_);
  float bump = 0.035 * rp * fR * (1.0 - flat_) + (0.04 * (1.0 - crack) - 0.02) * flat_ * fC;
  addSurf(s, w, c, 0.92, bump, vec3(0.0));
}

void surfForest(inout TSurf s, float w, vec2 xz, float fp, float hollow) {
  float m = snoise(xz * 0.045) + 0.5 * snoise(xz * 0.16);
  vec3 c = mix(C_FOREST_BLACK, C_MOSS, smoothstep(-0.4, 0.6, m));
  float fN = trFade(0.8, fp);
  float needles = vnoise(xz * 3.3) * 0.5 + 0.5;
  c = mix(c, C_LITTER, smoothstep(0.55, 0.85, needles) * 0.55 * fN + 0.12 * (1.0 - fN));
  c *= mix(1.0, 0.7, hollow);
  addSurf(s, w, c, mix(0.86, 0.38, hollow), 0.03 * needles * fN, vec3(0.0));
}

void surfSand(inout TSurf s, float w, vec2 xz, float y, float fp) {
  vec3 c = C_SAND * (0.94 + 0.08 * snoise(xz * 0.03));
  float fR = trFade(0.6, fp);
  float rp = sin((dot(xz, vec2(0.3, 0.95)) + 0.7 * snoise(xz * 0.12)) * 6.2831 / 0.6);
  c *= 1.0 + 0.035 * rp * fR;
  float wet = 1.0 - smoothstep(0.35, 1.7, y + 0.35 * snoise(xz * 0.09));
  c = mix(c, C_SAND_WET, wet);
  addSurf(s, w, c, mix(0.92, 0.22, wet), 0.02 * rp * fR * (1.0 - wet), vec3(0.0));
}

void surfRock(inout TSurf s, float w, vec3 p, float fp, float cav, vec4 bA, float coastal, float steep) {
  float warp = 1.8 * snoise(p * 0.018) + 0.6 * snoise(p * 0.07);
  float strata = p.y * 0.3 + warp;
  float layer = floor(strata);
  float f = fract(strata);
  float lh = mix(hash11(layer * 7.13 + 1.7), hash11(layer * 7.13 + 8.83), smoothstep(0.75, 1.0, f));
  float macro = snoise(p.xz * 0.004);
  vec3 tone = mix(C_ROCK, C_ROCK * vec3(1.12, 1.0, 0.84), smoothstep(-0.2, 0.6, macro));
  tone = mix(tone, C_ROCK * vec3(0.9, 0.97, 1.08), smoothstep(-0.2, -0.7, macro));
  float bank = (1.0 - smoothstep(0.3, 0.48, steep)) * (1.0 - smoothstep(0.1, 0.4, dot(bA, vec4(1.0))));
  tone = mix(tone, mix(C_PATH_DARK, C_ROCK, 0.4) * 1.1, bank * 0.6);
  tone = mix(tone, C_ROCK_FEED, smoothstep(0.1, 0.5, bA.x));
  tone = mix(tone, C_TERRACOTTA * 0.95, smoothstep(0.1, 0.5, bA.w));
  tone = mix(tone, C_ROCK_HALLU, smoothstep(0.1, 0.5, bA.z));
  tone = mix(tone, C_ROCK_COAST, coastal);
  vec3 c = tone * (0.8 + 0.3 * lh);
  float ledge = smoothstep(0.0, 0.35, f) * (1.0 - smoothstep(0.82, 1.0, f));
  float fS = trFade(3.0, fp);
  c *= mix(1.0, 0.9 + 0.1 * ledge, fS);
  float fD = trFade(2.5, fp);
  float det = snoise(p * 0.45) * 0.7 + snoise(p * 1.1) * 0.3 * trFade(1.0, fp);
  c *= 1.0 + 0.12 * det * fD;
  c = mix(c, C_ROCK_DARK * tone / C_ROCK, trSat(-cav * 0.35));
  float bump = 0.35 * ledge * fS + 0.12 * det * fD;
  addSurf(s, w, c, 0.78, bump, vec3(0.0));
}

void surfPath(inout TSurf s, float w, vec2 xz, float fp) {
  vec3 c = mix(C_PATH, C_PATH_DARK, smoothstep(-0.2, 0.7, snoise(xz * 0.25)) * 0.5);
  float fP = trFade(0.5, fp);
  vec3 v = voronoi(xz * 5.5);
  float peb = (1.0 - smoothstep(0.08, 0.22, v.x + 0.1 * vnoise(xz * 23.0))) * step(0.78, v.z) * fP;
  c = mix(c, C_PEBBLE * (0.75 + 0.3 * hash11(v.z * 91.0)), peb * 0.5);
  vec3 light = uSunColor + uSkyColor * 0.6;
  float lightLum = dot(light, vec3(0.2126, 0.7152, 0.0722));
  vec3 tint = light / max(lightLum, 1e-4);
  c /= clamp(mix(vec3(1.0), tint, 0.6), vec3(0.6), vec3(1.7));
  addSurf(s, w, c, 0.9, 0.008 * peb + 0.02 * vnoise(xz * 2.0) * fP, vec3(0.0));
}

TSurf terrainSurface(vec3 wp, vec3 nGeo, vec3 viewDir, float fp) {
  vec2 xz = wp.xz;
  vec2 warp = biomeWarp(xz);
  vec4 bA = biomeA(xz + warp);
  vec4 bB = biomeB(xz + warp);
  float pathW = biomeB(xz + warp * 0.12).w;
  float steep = 1.0 - nGeo.y;
  float hc = terrainHeight(xz);
  float ring = 0.25 * (terrainHeight(xz + vec2(7.0, 0.0)) + terrainHeight(xz - vec2(7.0, 0.0)) + terrainHeight(xz + vec2(0.0, 7.0)) + terrainHeight(xz - vec2(0.0, 7.0)));
  float cav = hc - ring;
  float hollow = smoothstep(0.0, -1.2, cav);
  float ndv = trSat(dot(nGeo, viewDir));
  float coastal = 1.0 - smoothstep(4.0, 14.0, wp.y);

  float rockN = snoise(wp * 0.05) * 0.035;
  float rockW = max(smoothstep(0.5, 0.95, bB.z), smoothstep(0.25, 0.4, steep + rockN));
  vec4 wA = bA * (1.0 - rockW);
  vec4 wB = vec4(bB.xy * (1.0 - rockW), rockW, 0.0);
  wB.w = max(0.0, 1.0 - dot(wA, vec4(1.0)) - wB.x - wB.y - wB.z);
  float hn = snoise(xz * 0.14) * 0.5 + snoise(xz * 0.47) * 0.25;
  vec4 hA = vec4(0.25, 0.25, 0.35 + 0.3 * hn, 0.3 - 0.3 * hn);
  vec4 hB = vec4(0.3 + 0.4 * hn, 0.3 - 0.4 * hn, 0.25 + 0.5 * snoise(wp * 0.11) * 0.5, 0.3 + 0.35 * hn);
  wA = wA * (1.0 + hA * 2.0);
  wB = wB * (1.0 + hB * 2.0);
  float top = max(max(max(wA.x, wA.y), max(wA.z, wA.w)), max(max(wB.x, wB.y), max(wB.z, wB.w)));
  float sharp = top * 0.55;
  wA = max(wA - sharp, 0.0);
  wB = max(wB - sharp, 0.0);
  float sum = dot(wA, vec4(1.0)) + dot(wB, vec4(1.0));
  wA /= sum;
  wB /= sum;

  TSurf s = TSurf(vec3(0.0), 0.0, 0.0, vec3(0.0));
  if (wB.w > 0.001) surfMeadow(s, wB.w, xz, fp, steep);
  if (wA.x > 0.001) surfFeed(s, wA.x, xz, fp, ndv);
  if (wA.y > 0.001) surfFarm(s, wA.y, xz, fp);
  if (wA.z > 0.001) surfHallu(s, wA.z, xz, fp, ndv);
  if (wA.w > 0.001) surfOldweb(s, wA.w, xz, fp, steep);
  if (wB.x > 0.001) surfForest(s, wB.x, xz, fp, hollow);
  if (wB.y > 0.001) surfSand(s, wB.y, xz, wp.y, fp);
  if (wB.z > 0.001) surfRock(s, wB.z, wp, fp, cav, bA, coastal, steep);

  float pw = smoothstep(0.32, 0.62, pathW + 0.18 * snoise(xz * 0.35)) * (1.0 - wB.z) * (1.0 - wA.x);
  if (pw > 0.001) {
    TSurf ps = TSurf(vec3(0.0), 0.0, 0.0, vec3(0.0));
    surfPath(ps, 1.0, xz, fp);
    s.albedo = mix(s.albedo, ps.albedo, pw);
    s.rough = mix(s.rough, ps.rough, pw);
    s.bump = mix(s.bump, ps.bump, pw);
    s.emissive *= 1.0 - pw;
  }

  float ao = clamp(1.0 + cav * 0.07, 0.6, 1.08);
  s.albedo *= ao;

  if (wp.y < 0.3) {
    float depth = max(0.0, -wp.y);
    vec3 seabed = C_SAND_WET * (0.9 + 0.1 * snoise(xz * 0.05));
    s.albedo = mix(s.albedo, seabed, smoothstep(0.3, -1.5, wp.y) * 0.8);
    vec3 tint = mix(vec3(1.0), C_SEA_SHALLOW * 1.4, smoothstep(0.0, 4.0, depth));
    tint = mix(tint, C_SEA_DEEP * 0.8, smoothstep(3.0, 28.0, depth));
    s.albedo *= tint;
    vec3 cv = voronoi(xz * 0.45 + vec2(uTime * 0.11, uTime * 0.07));
    vec3 cv2 = voronoi(xz * 0.62 - vec2(uTime * 0.08, -uTime * 0.05) + 3.0);
    float caustic = pow(1.0 - smoothstep(0.0, 0.5, cv.y - cv.x), 3.0) + pow(1.0 - smoothstep(0.0, 0.5, cv2.y - cv2.x), 3.0);
    float cw = smoothstep(0.0, 0.8, depth) * (1.0 - smoothstep(2.0, 9.0, depth)) * trFade(3.0, fp) * (1.0 - uNight * 0.8);
    s.emissive += uSunColor * C_SEA_SHALLOW * caustic * cw * 0.05;
    s.rough = mix(s.rough, 0.6, smoothstep(0.0, 1.0, depth));
  }
  s.bump *= 1.0 - smoothstep(25.0, 120.0, length(wp - cameraPosition)) * 0.6;
  return s;
}

vec3 bumpNormal(vec3 p, vec3 n, float b) {
  vec3 dpdx = dFdx(p);
  vec3 dpdy = dFdy(p);
  float dbx = dFdx(b);
  float dby = dFdy(b);
  vec3 r1 = cross(dpdy, n);
  vec3 r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dbx * r1 + dby * r2);
  vec3 o = abs(det) * n - grad;
  float l = dot(o, o);
  if (!(l > 1e-20) || l > 1e20 || dot(o, n) <= 0.0) return n;
  return o * inversesqrt(l);
}
`;
