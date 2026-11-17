const G = 9.81;
const SLOWNESS = 0.8;

const FIELD_WAVES = [
  { length: 74, amp: 0.26, steep: 0.12, phase: 0 },
  { length: 43, amp: 0.1, steep: 0.08, phase: 2.1 },
];

const DIR_WAVES = [
  { length: 57, amp: 0.17, steep: 0.09, angle: -0.35, phase: 1.3, chop: 0 },
  { length: 33, amp: 0.07, steep: 0.06, angle: 1.15, phase: 3.4, chop: 0 },
  { length: 15.3, amp: 0.065, steep: 0.1, angle: 0.45, phase: 0.4, chop: 1 },
  { length: 11.1, amp: 0.045, steep: 0.09, angle: -0.6, phase: 4.1, chop: 1 },
  { length: 8.3, amp: 0.03, steep: 0.08, angle: 1.0, phase: 2.7, chop: 1 },
  { length: 6.0, amp: 0.02, steep: 0.07, angle: -0.25, phase: 5.3, chop: 1 },
  { length: 4.3, amp: 0.012, steep: 0.06, angle: 0.75, phase: 0.9, chop: 1 },
];

const k = (w) => (2 * Math.PI) / w.length;
const omega = (w) => Math.sqrt(G * k(w)) * SLOWNESS;
const f = (x) => {
  const s = x.toFixed(6);
  return s.includes('.') ? s : `${s}.0`;
};

export const SWELL_AMP = [...FIELD_WAVES, ...DIR_WAVES.filter((w) => !w.chop)].reduce((a, w) => a + w.amp, 0);
export const CHOP_AMP = DIR_WAVES.filter((w) => w.chop).reduce((a, w) => a + w.amp, 0);
export const LIGHTHOUSE_BLEND = 40;
export const SURGE = { amp: 0.14, depth: 2.6, period: 8, spacing: 16 };

export function windFactors(strength) {
  return {
    chop: Math.min(1.3, Math.max(0.35, strength / 3)),
    swell: Math.min(1.15, Math.max(0.85, 0.8 + strength / 15)),
  };
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function shoreOffset(x, z) {
  return 0.25 * Math.sin(x * 0.021 + z * 0.013) + 0.2 * Math.sin(z * 0.031 - x * 0.007 + 1.3);
}

function group(x, z, t) {
  const a = Math.sin(0.0123 * x - 0.0079 * z + 0.06 * t);
  const b = Math.sin(-0.0061 * x - 0.0137 * z + 1.7 + 0.045 * t);
  const c = Math.sin(0.0157 * x + 0.0042 * z + 4.1 - 0.03 * t);
  return 0.62 + 0.28 * a * b + 0.2 * c;
}

function surgeShape(g) {
  const c = 0.5 + 0.5 * Math.cos(2 * Math.PI * (g - 0.1));
  return c * c - 0.375;
}

export function wavesGLSL() {
  const field = FIELD_WAVES.map((w) => `  seaWave(fld.x * ${f(k(w))} - t * ${f(omega(w))} + ${f(w.phase)}, ${f(k(w))}, ${f(w.amp)} * aF * grp, ${f(w.steep)} * aF * grp, ${f(w.length)}, fadeLen, fieldDir, s);`).join('\n');
  const dir = DIR_WAVES.map((w, i) => {
    const a = w.chop ? 'aC' : 'aD';
    return `  { vec2 d = uWaveDirs[${i}]; seaWave(dot(d, p) * ${f(k(w))} - t * ${f(omega(w))} + ${f(w.phase)}, ${f(k(w))}, ${f(w.amp)} * ${a}, ${f(w.steep)} * ${a}, ${f(w.length)}, fadeLen, d, s); }`;
  }).join('\n');
  return /* glsl */ `
uniform sampler2D uCoastTex;
uniform vec2 uWaveDirs[${DIR_WAVES.length}];
uniform vec2 uWindF;
uniform vec3 uLightIsle;

struct SeaState {
  vec3 disp;
  vec3 n;
  float swell;
  float chop;
  float variance;
};

float seaSmooth(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

vec3 coastMain(vec2 xz) {
  vec2 c = clamp(xz, -uWorldHalf, uWorldHalf);
  vec2 g = (c + uWorldHalf) / 4.0;
  vec2 i0 = min(floor(g), vec2(WORLD_GRID - 2.0));
  vec2 t = g - i0;
  ivec2 i = ivec2(i0);
  vec3 a = texelFetch(uCoastTex, i, 0).xyz;
  vec3 b = texelFetch(uCoastTex, i + ivec2(1, 0), 0).xyz;
  vec3 cc = texelFetch(uCoastTex, i + ivec2(0, 1), 0).xyz;
  vec3 d = texelFetch(uCoastTex, i + ivec2(1, 1), 0).xyz;
  vec3 r = mix(mix(a, b, t.x), mix(cc, d, t.x), t.y);
  float extra = length(xz) - length(c);
  if (extra > 0.0) {
    r.x -= extra;
    vec2 radial = -normalize(xz);
    r.yz = normalize(mix(normalize(r.yz + 1e-5), radial, clamp(extra / 300.0, 0.0, 1.0)));
  }
  return r;
}

// x: smooth coast distance (positive inland), yz: its gradient, w: weight of the main island
vec4 seaField(vec2 xz) {
  vec3 m = coastMain(xz);
  vec2 dl = xz - uLightIsle.xy;
  float rl = max(length(dl), 1e-3);
  float cl = uLightIsle.z - rl;
  vec2 gl = -dl / rl;
  const float K = ${f(LIGHTHOUSE_BLEND)};
  float h = clamp(0.5 + 0.5 * (m.x - cl) / K, 0.0, 1.0);
  float cd = mix(cl, m.x, h) + K * h * (1.0 - h);
  vec2 g = mix(gl, m.yz, h);
  return vec4(cd, g, h);
}

vec4 seaFld;

float seaGroup(vec2 p, float t) {
  float a = sin(0.0123 * p.x - 0.0079 * p.y + 0.06 * t);
  float b = sin(-0.0061 * p.x - 0.0137 * p.y + 1.7 + 0.045 * t);
  float c = sin(0.0157 * p.x + 0.0042 * p.y + 4.1 - 0.03 * t);
  return 0.62 + 0.28 * a * b + 0.2 * c;
}

void seaWave(float th, float kk, float amp, float steep, float len, float fadeLen, vec2 d, inout SeaState s) {
  float fade = 1.0 - seaSmooth(len * 0.12, len * 0.3, fadeLen);
  float slope = kk * amp;
  s.variance += (1.0 - fade) * slope * slope * 0.5;
  amp *= fade;
  steep *= fade;
  float sn = sin(th);
  float cs = cos(th);
  s.disp.xz += d * (steep / kk) * cs;
  s.disp.y += amp * sn;
  s.n.xz -= d * kk * amp * cs;
  s.n.y -= steep * sn;
}

SeaState seaWaves(vec2 p, float rest, float fadeLen, float t) {
  SeaState s;
  s.disp = vec3(0.0);
  s.n = vec3(0.0, 1.0, 0.0);
  s.variance = 0.0;
  vec4 fld = seaField(p);
  seaFld = fld;
  vec2 fieldDir = normalize(fld.yz + 1e-5);
  float wet = seaSmooth(-0.3, 0.6, rest);
  float aF = seaSmooth(0.5, 9.0, rest) * uWindF.y;
  float aD = seaSmooth(1.0, 12.0, rest) * uWindF.y;
  float aC = (0.25 + 0.75 * seaSmooth(0.3, 4.0, rest)) * wet * uWindF.x;
  float grp = seaGroup(p, t);
${field}
${dir.split('\n').slice(0, 2).join('\n')}
  s.swell = (s.disp.y) / ${f(SWELL_AMP)};
  float before = s.disp.y;
${dir.split('\n').slice(2).join('\n')}
  s.chop = (s.disp.y - before) / ${f(CHOP_AMP)};
  float sz = ${f(SURGE.amp)} * (1.0 - seaSmooth(0.2, ${f(SURGE.depth)}, rest)) * seaSmooth(-1.2, -0.2, rest);
  if (sz > 0.0) {
    float off = 0.25 * sin(p.x * 0.021 + p.y * 0.013) + 0.2 * sin(p.y * 0.031 - p.x * 0.007 + 1.3);
    float g = fract(-fld.x / ${f(SURGE.spacing)} + t / ${f(SURGE.period)} + off);
    float c = 0.5 + 0.5 * cos(6.2831853 * (g - 0.1));
    s.disp.y += sz * (c * c - 0.375);
  }
  return s;
}
`;
}

export function createWaveSet({ windDir }) {
  const angle0 = Math.atan2(windDir[1], windDir[0]);
  const dirs = DIR_WAVES.map((w) => [Math.cos(angle0 + w.angle), Math.sin(angle0 + w.angle)]);
  const fieldK = FIELD_WAVES.map(k);
  const fieldW = FIELD_WAVES.map(omega);
  const dirK = DIR_WAVES.map(k);
  const dirW = DIR_WAVES.map(omega);

  function displace(x, z, t, rest, fld, wind, out) {
    let dx = 0;
    let dy = 0;
    let dz = 0;
    const wet = smooth(-0.3, 0.6, rest);
    const aF = smooth(0.5, 9, rest) * wind.swell;
    const aD = smooth(1, 12, rest) * wind.swell;
    const aC = (0.25 + 0.75 * smooth(0.3, 4, rest)) * wet * wind.chop;
    const grp = group(x, z, t);
    const gl = Math.hypot(fld.gx, fld.gz) || 1;
    const fx = fld.gx / gl;
    const fz = fld.gz / gl;
    for (let i = 0; i < FIELD_WAVES.length; i++) {
      const w = FIELD_WAVES[i];
      const th = fld.cd * fieldK[i] - t * fieldW[i] + w.phase;
      const h = (w.steep * aF * grp) / fieldK[i] * Math.cos(th);
      dx += fx * h;
      dz += fz * h;
      dy += w.amp * aF * grp * Math.sin(th);
    }
    for (let i = 0; i < DIR_WAVES.length; i++) {
      const w = DIR_WAVES[i];
      const a = w.chop ? aC : aD;
      const [ux, uz] = dirs[i];
      const th = (ux * x + uz * z) * dirK[i] - t * dirW[i] + w.phase;
      const h = (w.steep * a) / dirK[i] * Math.cos(th);
      dx += ux * h;
      dz += uz * h;
      dy += w.amp * a * Math.sin(th);
    }
    const sz = SURGE.amp * (1 - smooth(0.2, SURGE.depth, rest)) * smooth(-1.2, -0.2, rest);
    if (sz > 0) {
      let g = -fld.cd / SURGE.spacing + t / SURGE.period + shoreOffset(x, z);
      g -= Math.floor(g);
      dy += sz * surgeShape(g);
    }
    out.x = dx;
    out.y = dy;
    out.z = dz;
    return out;
  }

  return { dirs, displace };
}
