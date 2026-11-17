export const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const SANITIZE = /* glsl */ `
float finite(float x, float ceiling) {
  return (floatBitsToUint(x) & 0x7f800000u) == 0x7f800000u ? 0.0 : clamp(x, 0.0, ceiling);
}
vec3 sanitize(vec3 c, float ceiling) {
  return vec3(finite(c.r, ceiling), finite(c.g, ceiling), finite(c.b, ceiling));
}
`;

export const SANITIZE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform float uCeiling;
${SANITIZE}
void main() {
  gl_FragColor = vec4(sanitize(texture2D(tColor, vUv).rgb, uCeiling), 1.0);
}
`;

const DEPTH_HELPERS = /* glsl */ `
uniform sampler2D tDepth;
uniform float uNear;
uniform float uFar;
float rawDepth(vec2 uv) {
  return texture2D(tDepth, uv).x;
}
float linearDepth(float d) {
  return uNear * uFar / (uFar - d * (uFar - uNear));
}
`;

export const SCAN_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
${DEPTH_HELPERS}
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform vec2 uTexel;
uniform float uPixelAngle;
uniform vec3 uOrigin;
uniform vec3 uOriginUV;
uniform float uRadius;
uniform float uTrail;
uniform float uStrength;
uniform float uSea;
uniform vec3 uScanColor;

vec3 viewPos(vec2 uv, float d) {
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return v.xyz / v.w;
}

float lineMask(vec2 coord, float widthPx) {
  vec2 w = fwidth(coord);
  vec2 g = abs(fract(coord - 0.5) - 0.5) / max(w, vec2(1e-5));
  vec2 fade = 1.0 - smoothstep(0.18, 0.45, w);
  vec2 l = (1.0 - clamp(g / widthPx, 0.0, 1.0)) * fade;
  return max(l.x, l.y);
}

float lineMask1(float coord, float widthPx) {
  float w = fwidth(coord);
  float g = abs(fract(coord - 0.5) - 0.5) / max(w, 1e-5);
  return (1.0 - clamp(g / widthPx, 0.0, 1.0)) * (1.0 - smoothstep(0.18, 0.45, w));
}

void main() {
  vec2 uv = vUv;
  float d = rawDepth(uv);
  bool sky = d >= 0.999999;
  vec3 vp = viewPos(uv, sky ? 0.5 : d);
  vec3 rayDir = normalize((uCamWorld * vec4(vp, 0.0)).xyz);
  float camDist = sky ? 1e9 : length(vp);
  vec3 wp = uCamPos + rayDir * camDist;
  bool water = false;
  if (uCamPos.y > uSea && rayDir.y < -1e-4) {
    float t = (uSea - uCamPos.y) / rayDir.y;
    if (t < camDist) {
      camDist = t;
      wp = uCamPos + rayDir * t;
      water = true;
    }
  }
  vec3 base = texture2D(tColor, uv).rgb;
  if (camDist > 1e8) {
    gl_FragColor = vec4(base, 1.0);
    return;
  }

  float dist = length(wp - uOrigin);
  float f = uRadius - dist;
  float px = camDist * uPixelAngle;
  float edgeW = max(0.18, px * 1.6);
  if (f < -edgeW * 10.0 || f > uTrail + 4.0) {
    gl_FragColor = vec4(base, 1.0);
    return;
  }

  float ahead = exp(-max(-f, 0.0) / (edgeW * 0.55));
  float behind = exp(-max(f, 0.0) / (edgeW * 2.2));
  float lead = ahead * behind;
  float glow = exp(-max(f, 0.0) / 3.5) * step(0.0, f);
  float band = f > 0.0 ? pow(1.0 - clamp(f / uTrail, 0.0, 1.0), 1.6) : 0.0;

  vec2 dirS = uv - uOriginUV.xy;
  dirS = uOriginUV.z > 0.5 && dot(dirS, dirS) > 1e-6 ? normalize(dirS) : normalize(uv - 0.5 + 1e-4);
  float wobble = exp(-pow(f / (edgeW * 4.0 + 0.6), 2.0));
  vec2 ruv = uv - dirS * wobble * 0.006 * uStrength;
  vec3 col = wobble > 0.01 ? texture2D(tColor, ruv).rgb : base;

  float contour = lineMask1(wp.y + 0.37, 0.9);
  float major = lineMask1(wp.y / 5.0 + 0.137, 1.1);
  float grid = lineMask(wp.xz / 4.0, 0.8);
  float waterGrid = water ? lineMask(wp.xz / 2.0, 0.8) : 0.0;
  if (water) {
    contour = 0.0;
    major = 0.0;
  }

  float edge = 0.0;
  if (!water && band > 0.0) {
    float lc = 1.0 / linearDepth(d);
    float l1 = 1.0 / linearDepth(rawDepth(uv + vec2(uTexel.x, 0.0)));
    float l2 = 1.0 / linearDepth(rawDepth(uv - vec2(uTexel.x, 0.0)));
    float l3 = 1.0 / linearDepth(rawDepth(uv + vec2(0.0, uTexel.y)));
    float l4 = 1.0 / linearDepth(rawDepth(uv - vec2(0.0, uTexel.y)));
    float lap = abs(l1 + l2 + l3 + l4 - 4.0 * lc) / lc;
    edge = smoothstep(0.06, 0.25, lap);
  }

  float s = uStrength;
  float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
  float day = 0.55 + 0.9 * clamp(lum, 0.0, 2.0);
  float echo = f > 0.0 ? exp(-abs(f - uTrail * 0.32) / (edgeW * 1.4)) * (1.0 - f / uTrail) : 0.0;
  col *= 1.0 - 0.38 * band * s;
  vec3 scan = uScanColor * (
    band * (contour * 0.9 + major * 1.6 + grid * 0.8 + waterGrid * 0.9 + edge * 0.7 + 0.05) * day
    + glow * 0.6 * day
    + echo * 0.9 * day
    + lead * (4.0 + 2.5 * day)
  );
  scan += vec3(0.75, 1.0, 1.0) * lead * lead * 3.0;
  gl_FragColor = vec4(col + scan * s, 1.0);
}
`;

export const RAYS_MASK_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uSunUV;
uniform float uAspect;
uniform vec2 uTexel;
uniform vec2 uThreshold;
float skyAt(vec2 uv) {
  return step(0.999999, texture2D(tDepth, uv).x);
}
void main() {
  vec2 o = uTexel * 0.5;
  float sky = 0.25 * (skyAt(vUv + vec2(o.x, o.y)) + skyAt(vUv + vec2(-o.x, o.y)) + skyAt(vUv + vec2(o.x, -o.y)) + skyAt(vUv - o));
  vec3 c = min(texture2D(tColor, vUv).rgb, vec3(6.0));
  vec2 dv = (vUv - uSunUV) * vec2(uAspect, 1.0);
  float r = length(dv);
  float edge = clamp(1.0 - r / 0.6, 0.0, 1.0);
  float fall = edge * edge * (0.06 + 2.5 * exp(-r * r * 140.0));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(sky * fall * mix(vec3(l), c, 0.4) * smoothstep(uThreshold.x, uThreshold.y, l), 1.0);
}
`;

export const RAYS_BLUR_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tInput;
uniform vec2 uSunUV;
uniform float uLength;
uniform float uDecay;
uniform float uFalloff;
uniform float uAspect;
uniform sampler2D tDepth;
uniform float uGround;
uniform float uSamples;
const int MAX_SAMPLES = 24;
void main() {
  vec2 delta = (uSunUV - vUv) * uLength / uSamples;
  vec2 p = vUv + delta * 0.5;
  vec3 sum = vec3(0.0);
  float w = 1.0;
  float total = 0.0;
  for (int i = 0; i < MAX_SAMPLES; i++) {
    if (float(i) >= uSamples) break;
    sum += texture2D(tInput, p).rgb * w;
    total += w;
    w *= uDecay;
    p += delta;
  }
  vec3 res = sum / total;
  if (uFalloff > 0.0) {
    float r = length((vUv - uSunUV) * vec2(uAspect, 1.0));
    res *= pow(clamp(1.0 - r / uFalloff, 0.0, 1.0), 1.6);
    float sky = step(0.999999, texture2D(tDepth, vUv).x);
    res *= mix(uGround, 1.0, sky);
  }
  gl_FragColor = vec4(res, 1.0);
}
`;

export const BLOOM_DOWN_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tInput;
uniform vec2 uTexel;
uniform float uPrefilter;
uniform vec4 uThreshold;
${SANITIZE}
vec3 tap(vec2 o) {
  return sanitize(texture2D(tInput, vUv + o * uTexel).rgb, 256.0);
}
float lum(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
vec3 filt(vec3 c) {
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold.y, 0.0, uThreshold.z);
  soft = soft * soft * uThreshold.w;
  float contrib = max(soft, br - uThreshold.x) / max(br, 1e-4);
  return c * contrib;
}
vec3 karis(vec3 a, vec3 b, vec3 c, vec3 d) {
  float wa = 1.0 / (1.0 + lum(a));
  float wb = 1.0 / (1.0 + lum(b));
  float wc = 1.0 / (1.0 + lum(c));
  float wd = 1.0 / (1.0 + lum(d));
  return (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
}
void main() {
  vec3 a = tap(vec2(-2.0, 2.0));
  vec3 b = tap(vec2(0.0, 2.0));
  vec3 c = tap(vec2(2.0, 2.0));
  vec3 d = tap(vec2(-2.0, 0.0));
  vec3 e = tap(vec2(0.0, 0.0));
  vec3 f = tap(vec2(2.0, 0.0));
  vec3 g = tap(vec2(-2.0, -2.0));
  vec3 h = tap(vec2(0.0, -2.0));
  vec3 i = tap(vec2(2.0, -2.0));
  vec3 j = tap(vec2(-1.0, 1.0));
  vec3 k = tap(vec2(1.0, 1.0));
  vec3 l = tap(vec2(-1.0, -1.0));
  vec3 m = tap(vec2(1.0, -1.0));
  vec3 res;
  if (uPrefilter > 0.5) {
    res = karis(j, k, l, m) * 0.5
      + karis(a, b, d, e) * 0.125
      + karis(b, c, e, f) * 0.125
      + karis(d, e, g, h) * 0.125
      + karis(e, f, h, i) * 0.125;
    res = filt(min(res, vec3(64.0)));
  } else {
    res = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  gl_FragColor = vec4(max(res, vec3(0.0)), 1.0);
}
`;

export const BLOOM_UP_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tInput;
uniform vec2 uTexel;
uniform float uWeight;
vec3 tap(vec2 o) {
  return texture2D(tInput, vUv + o * uTexel).rgb;
}
void main() {
  vec3 s = tap(vec2(0.0)) * 4.0;
  s += (tap(vec2(-1.0, 0.0)) + tap(vec2(1.0, 0.0)) + tap(vec2(0.0, -1.0)) + tap(vec2(0.0, 1.0))) * 2.0;
  s += tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0));
  gl_FragColor = vec4(s / 16.0 * uWeight, 1.0);
}
`;

export const COMPOSITE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform vec2 uResolution;
uniform float uTime;
uniform float uFrame;
uniform float uBloomOn;
uniform float uBloom;
uniform float uRaysOn;
uniform vec3 uRaysColor;
uniform float uExposure;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uTint;
uniform vec3 uLift;
uniform float uVignette;
uniform float uAberration;
uniform float uGrain;
uniform float uGlitch;
uniform float uWarp;
uniform float uSpeed;
uniform float uLetterbox;
uniform vec3 uFadeColor;
uniform float uFade;
uniform vec3 uFlashColor;
uniform float uFlash;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 acesFitted(vec3 c) {
  const mat3 ACESIn = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 ACESOut = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  c = ACESIn * c;
  c = (c * (c + 0.0245786) - 0.000090537) / (c * (0.983729 * c + 0.4329510) + 0.238081);
  return clamp(ACESOut * c, 0.0, 1.0);
}

vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

float sCurve(float x, float k) {
  return x < 0.5 ? 0.5 * pow(2.0 * x, k) : 1.0 - 0.5 * pow(2.0 - 2.0 * x, k);
}

vec3 hdrAt(vec2 uv) {
  vec3 c = texture2D(tColor, uv).rgb;
  if (uBloomOn > 0.5) c += texture2D(tBloom, uv).rgb * uBloom;
  return c;
}

void main() {
  vec2 uv = vUv;
  vec2 res = uResolution;
  float t = uTime;

  if (uWarp > 0.001) {
    vec2 w = vec2(
      sin(uv.y * 7.0 + t * 1.3 + sin(uv.x * 5.0 - t * 0.7) * 1.5),
      cos(uv.x * 6.0 - t * 1.1 + sin(uv.y * 4.0 + t * 0.9) * 1.5)
    );
    uv += w * 0.011 * uWarp;
  }

  float glitchRow = 0.0;
  if (uGlitch > 0.001) {
    float step20 = floor(t * 24.0);
    vec2 block = floor(uv * vec2(10.0, 28.0));
    float hb = hash12(block + step20 * 1.37);
    float hr = hash12(vec2(block.y, step20));
    if (hr > 1.0 - uGlitch * 0.45) uv.x += (hash12(vec2(block.y * 3.1, step20 + 7.0)) - 0.5) * 0.12 * uGlitch;
    if (hb > 1.0 - uGlitch * 0.12) uv += (vec2(hash12(block + 3.0), hash12(block + 9.0)) - 0.5) * 0.06 * uGlitch;
    float line = floor(uv.y * res.y / 3.0);
    float tear = step(1.0 - uGlitch * 0.08, hash12(vec2(line, step20 * 0.71)));
    uv.x += tear * (hash12(vec2(line, step20)) - 0.5) * 0.08;
    glitchRow = hr;
  }

  vec2 fromC = uv - 0.5;
  float r2 = dot(fromC, fromC);
  if (uSpeed > 0.001) {
    uv = 0.5 + fromC * (1.0 - uSpeed * 0.06 * r2 * 2.0);
    fromC = uv - 0.5;
  }

  vec3 col;
  float ab = uAberration + uGlitch * 0.012;
  if (uSpeed > 0.001) {
    vec2 dir = fromC * uSpeed * 0.09;
    float jitter = hash12(gl_FragCoord.xy + fract(uFrame * 0.618) * 97.0);
    col = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float k = (float(i) + jitter) / 12.0;
      col += hdrAt(uv - dir * k);
    }
    col /= 12.0;
  } else if (ab > 0.0004) {
    vec2 o = fromC * ab * (0.6 + 1.6 * r2);
    col = vec3(hdrAt(uv + o).r, hdrAt(uv).g, hdrAt(uv - o).b);
  } else {
    col = hdrAt(uv);
  }

  if (uRaysOn > 0.5) col += texture2D(tRays, uv).rgb * uRaysColor;

  col *= uTint * uExposure;
  col = acesFitted(col / 0.6);

  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float mx = max(col.r, max(col.g, col.b));
  float sat = (mx - min(col.r, min(col.g, col.b))) / max(mx, 1e-4);
  float satK = uSaturation > 1.0 ? 1.0 + (uSaturation - 1.0) * (1.0 - sat) * 1.6 : uSaturation;
  col = max(mix(vec3(l), col, satK * (1.0 - 0.12 * smoothstep(0.55, 0.95, sat))), 0.0);
  col = col + uLift * (1.0 - col);

  vec3 s = toSRGB(col);
  float k = uContrast * 1.06;
  s = vec3(sCurve(s.r, k), sCurve(s.g, k), sCurve(s.b, k));

  vec2 vc = (vUv - 0.5) * vec2(res.x / res.y, 1.0);
  float vig = 1.0 - uVignette * smoothstep(0.25, 1.05, length(vc) * 1.1);
  s *= vig;

  if (uGlitch > 0.001) {
    float step20 = floor(t * 30.0);
    vec2 cell = floor(gl_FragCoord.xy / vec2(14.0, 6.0));
    float n = hash12(cell + step20 * 3.7);
    if (glitchRow > 1.0 - uGlitch * 0.22 && n > 1.0 - uGlitch * 0.14) s = mix(s, vec3(hash12(cell + 1.0) > 0.5 ? 0.36 : 1.0, 0.37 + hash12(cell) * 0.5, 0.9), 0.85);
    float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 1.7 + t * 40.0);
    s *= 1.0 - uGlitch * 0.12 * scan;
    s += (hash12(gl_FragCoord.xy + step20) - 0.5) * 0.18 * uGlitch * step(0.7, glitchRow);
  }

  vec2 gp = gl_FragCoord.xy + vec2(fract(uFrame * 0.7548776662), fract(uFrame * 0.5698402910)) * 1024.0;
  float n1 = hash12(gp);
  float n2 = hash12(gp + 31.7);
  float tri = n1 + n2 - 1.0;
  float sl = dot(s, vec3(0.2126, 0.7152, 0.0722));
  float grainAmp = uGrain * (0.35 + 0.65 * (1.0 - abs(sl * 2.0 - 1.0)));
  s += tri * (grainAmp + 1.0 / 255.0);

  s = mix(s, uFlashColor, clamp(uFlash, 0.0, 1.0));
  s = mix(s, uFadeColor, clamp(uFade, 0.0, 1.0));

  if (uLetterbox > 0.0) {
    float bar = uLetterbox * 0.128;
    float py = min(vUv.y, 1.0 - vUv.y);
    float edge = 1.0 / res.y;
    s *= smoothstep(bar - edge, bar + edge, py);
  }

  gl_FragColor = vec4(clamp(s, 0.0, 1.0), 1.0);
}
`;
