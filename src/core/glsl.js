import * as THREE from 'three';

export const sharedUniforms = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(-0.52, 0.62, 0.58).normalize() },
  uSunColor: { value: new THREE.Color('#fff1dc').multiplyScalar(3.2) },
  uSkyColor: { value: new THREE.Color('#9cc6ef').multiplyScalar(0.85) },
  uGroundColor: { value: new THREE.Color('#6d7a52').multiplyScalar(0.45) },
  uSkyZenith: { value: new THREE.Color('#3f7fd0') },
  uSkyHorizon: { value: new THREE.Color('#bcd9f2') },
  uWind: { value: new THREE.Vector3(0.83, 0.55, 3.0) },
  uFogColor: { value: new THREE.Color('#c4d8ea') },
  uFogSunColor: { value: new THREE.Color('#ffe2b8') },
  uFogDensity: { value: 0.00085 },
  uFogHeight: { value: 140 },
  uNight: { value: 0 },
  uPlayerPos: { value: new THREE.Vector3(0, 38, 0) },
  uScan: { value: new THREE.Vector4(0, 0, 0, -1) },
  uHeightTex: { value: null },
  uBiomeTexA: { value: null },
  uBiomeTexB: { value: null },
  uWorldHalf: { value: 1280 },
  uSeaLevel: { value: 0 },
};

const noise = /* glsl */ `
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 ga = hash22(i) * 2.0 - 1.0;
  vec2 gb = hash22(i + vec2(1.0, 0.0)) * 2.0 - 1.0;
  vec2 gc = hash22(i + vec2(0.0, 1.0)) * 2.0 - 1.0;
  vec2 gd = hash22(i + vec2(1.0, 1.0)) * 2.0 - 1.0;
  float a = dot(ga, f);
  float b = dot(gb, f - vec2(1.0, 0.0));
  float c = dot(gc, f - vec2(0.0, 1.0));
  float d = dot(gd, f - vec2(1.0, 1.0));
  return 1.4 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(hash33(i) * 2.0 - 1.0, f);
  float n100 = dot(hash33(i + vec3(1.0, 0.0, 0.0)) * 2.0 - 1.0, f - vec3(1.0, 0.0, 0.0));
  float n010 = dot(hash33(i + vec3(0.0, 1.0, 0.0)) * 2.0 - 1.0, f - vec3(0.0, 1.0, 0.0));
  float n110 = dot(hash33(i + vec3(1.0, 1.0, 0.0)) * 2.0 - 1.0, f - vec3(1.0, 1.0, 0.0));
  float n001 = dot(hash33(i + vec3(0.0, 0.0, 1.0)) * 2.0 - 1.0, f - vec3(0.0, 0.0, 1.0));
  float n101 = dot(hash33(i + vec3(1.0, 0.0, 1.0)) * 2.0 - 1.0, f - vec3(1.0, 0.0, 1.0));
  float n011 = dot(hash33(i + vec3(0.0, 1.0, 1.0)) * 2.0 - 1.0, f - vec3(0.0, 1.0, 1.0));
  float n111 = dot(hash33(i + vec3(1.0, 1.0, 1.0)) * 2.0 - 1.0, f - vec3(1.0, 1.0, 1.0));
  return 1.2 * mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
vec3 dhPermute(vec3 x) { return mod(((x * 34.0) + 10.0) * x, 289.0); }
vec4 dhPermute(vec4 x) { return mod(((x * 34.0) + 10.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = dhPermute(dhPermute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p = dhPermute(dhPermute(dhPermute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = inversesqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm(vec2 p) {
  const mat2 R = mat2(0.8, -0.6, 0.6, 0.8);
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * snoise(p);
    p = R * p * 2.03 + 11.7;
    a *= 0.5;
  }
  return s / 0.96875;
}
float fbm(vec3 p) {
  const mat3 R = mat3(0.0, 0.8, 0.6, -0.8, 0.36, -0.48, -0.6, -0.48, 0.64);
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * snoise(p);
    p = R * p * 2.03 + 7.3;
    a *= 0.5;
  }
  return s / 0.9375;
}
vec3 voronoi(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  float id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash21(n + g);
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return vec3(sqrt(f1), sqrt(f2), id);
}
`;

const envPars = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uWind;
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform float uFogDensity;
uniform float uFogHeight;
uniform float uNight;
uniform vec3 uPlayerPos;
uniform vec4 uScan;
uniform sampler2D uHeightTex;
uniform sampler2D uBiomeTexA;
uniform sampler2D uBiomeTexB;
uniform float uWorldHalf;
uniform float uSeaLevel;
`;

const fog = /* glsl */ `
float fogFactor(vec3 worldPos) {
  vec3 ray = worldPos - cameraPosition;
  float dist = length(ray);
  float k = 1.0 / max(uFogHeight, 1.0);
  float h0 = max(cameraPosition.y - uSeaLevel, -40.0);
  float dy = ray.y * k;
  float base = uFogDensity * exp(-k * h0) * dist;
  float integral = abs(dy) > 1e-3 ? base * (1.0 - exp(-dy)) / dy : base;
  return clamp(1.0 - exp(-integral), 0.0, 1.0);
}
vec3 fogTint(vec3 worldPos) {
  vec3 dir = normalize(worldPos - cameraPosition);
  float s = max(dot(dir, uSunDir), 0.0);
  return mix(uFogColor, uFogSunColor, pow(s, 6.0) * 0.85);
}
vec3 applyFog(vec3 color, vec3 worldPos) {
  return mix(color, fogTint(worldPos), fogFactor(worldPos));
}
vec3 applyFogAdditive(vec3 color, vec3 worldPos) {
  return color * (1.0 - fogFactor(worldPos));
}
`;

const world = /* glsl */ `
const float WORLD_GRID = 641.0;
vec2 worldTexUV(vec2 xz) {
  return ((xz + uWorldHalf) / (2.0 * uWorldHalf) * (WORLD_GRID - 1.0) + 0.5) / WORLD_GRID;
}
float terrainHeight(vec2 xz) {
  return texture(uHeightTex, worldTexUV(xz)).r;
}
vec4 biomeA(vec2 xz) {
  return texture(uBiomeTexA, worldTexUV(xz));
}
vec4 biomeB(vec2 xz) {
  return texture(uBiomeTexB, worldTexUV(xz));
}
`;

export const GLSL = { noise, envPars, fog, world };
