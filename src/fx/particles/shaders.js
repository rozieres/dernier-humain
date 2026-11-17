import { GLSL } from '../../core/glsl.js';

export const PARTICLE_VERTEX = /* glsl */ `
${GLSL.envPars}
${GLSL.noise}
attribute vec4 iA;
attribute vec4 iB;
attribute vec4 iC;
attribute vec4 iD;
attribute vec4 iE;
attribute vec4 iF;
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vCell;
varying vec3 vWorld;

void main() {
  float age = uTime - iA.w;
  float life = max(iB.w, 1e-3);
  if (age < 0.0 || age > life) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vColor = vec4(0.0);
    return;
  }
  float t = age / life;
  float k = iC.w;
  vec3 acc = vec3(0.0, iC.z, 0.0);
  vec3 p;
  vec3 vel;
  if (k > 1e-3) {
    float e = exp(-k * age);
    vec3 term = acc / k;
    p = iA.xyz + (iB.xyz - term) * (1.0 - e) / k + term * age;
    vel = (iB.xyz - term) * e + term;
  } else {
    p = iA.xyz + iB.xyz * age + 0.5 * acc * age * age;
    vel = iB.xyz + acc * age;
  }
  vec3 windVel = vec3(uWind.x, 0.0, uWind.y) * uWind.z * iF.y;
  float kw = max(k, 0.6);
  p += windVel * (age - (1.0 - exp(-kw * age)) / kw);
  vel += windVel * (1.0 - exp(-kw * age));

  float seed = iD.w;
  if (iF.x > 0.0) {
    vec3 q = iA.xyz * 0.35 + vec3(seed * 17.0, uTime * 0.3, seed * 31.0);
    vec3 n = vec3(vnoise(q), vnoise(q + vec3(19.1, 7.3, 3.7)), vnoise(q + vec3(5.9, 23.2, 11.4)));
    p += n * iF.x * (1.0 - exp(-age * 0.9)) * 1.6;
  }

  float shape = iE.w;
  float size = iC.x * mix(1.0, iC.y, t);
  float alpha = smoothstep(0.0, 0.07, t) * (1.0 - smoothstep(0.62, 1.0, t)) * iF.z;
  if (shape > 4.5) {
    alpha *= 0.72 + 0.28 * sin(uTime * 23.0 + seed * 60.0);
    size *= 0.85 + 0.15 * sin(uTime * 17.0 + seed * 40.0);
  }
  if (shape > 1.5 && shape < 2.5) size *= 1.0 + 0.08 * sin(age * 2.0 + seed * 9.0);

  vec4 mv = viewMatrix * vec4(p, 1.0);
  vec2 c = position.xy;
  vec2 offset;
  if (shape > 0.5 && shape < 1.5) {
    vec3 vv = (viewMatrix * vec4(vel, 0.0)).xyz;
    vec2 sv = vv.xy / max(-mv.z, 0.5);
    float sl2 = dot(sv, sv);
    vec2 axis = sl2 > 1e-8 ? sv * inversesqrt(max(sl2, 1e-8)) : vec2(0.0, 1.0);
    vec2 perp = vec2(axis.y, -axis.x);
    float len = size + min(length(vv.xy), 60.0) * 0.045;
    offset = axis * c.y * len * 2.0 + perp * c.x * size * 0.6;
  } else {
    float ang = seed * 6.2831;
    if (shape > 1.5 && shape < 2.5) ang = (seed - 0.5) * 0.7 + sin(age * 1.3 + seed * 12.0) * 0.25;
    ang += age * iF.w;
    if (shape > 2.5 && shape < 4.5) c.x *= cos(age * iF.w * 1.4 + seed * 10.0);
    float cs = cos(ang);
    float sn = sin(ang);
    offset = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * size;
  }
  mv.xy += offset;
  gl_Position = projectionMatrix * mv;

  vUv = position.xy + 0.5;
  vShape = shape;
  vCell = floor(seed * 4096.0);
  vColor = vec4(mix(iD.rgb, iE.rgb, t), alpha);
  vWorld = p;
}
`;

export const PARTICLE_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.fog}
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vCell;
varying vec3 vWorld;

vec4 atlas(float idx) {
  float cx = mod(idx, 8.0);
  float cy = floor(idx / 8.0);
  vec2 uv = vec2((cx + vUv.x) / 8.0, 1.0 - (cy + 1.0 - vUv.y) / 8.0);
  return texture2D(uAtlas, uv);
}

void main() {
  if (vColor.a <= 0.002) discard;
  vec2 q = vUv * 2.0 - 1.0;
  float a;
  vec3 shade = vec3(1.0);
  if (vShape < 0.5) {
    float r2 = dot(q, q);
    a = exp(-r2 * 3.5) * (1.0 - smoothstep(0.6, 1.0, r2));
  } else if (vShape < 1.5) {
    float across = exp(-q.x * q.x * 6.0);
    float along = 1.0 - smoothstep(0.35, 1.0, abs(q.y));
    a = across * along;
    shade += vec3(0.6) * exp(-q.x * q.x * 30.0) * along;
  } else if (vShape > 4.5) {
    float r2 = dot(q, q);
    a = exp(-r2 * 3.0) * (1.0 - smoothstep(0.5, 1.0, r2));
    shade += vec3(1.6, 1.1, 0.6) * exp(-r2 * 22.0);
  } else {
    float idx = vShape < 2.5 ? 8.0 + mod(vCell, 56.0) : (vShape < 3.5 ? mod(vCell, 4.0) : 4.0 + mod(vCell, 4.0));
    vec4 tex = atlas(idx);
    a = tex.a;
    shade = tex.a > 1e-3 ? clamp(tex.rgb / max(tex.a, 1e-3), 0.0, 1.0) : vec3(1.0);
  }
  a *= vColor.a;
  if (a < 0.004) discard;
  vec3 col = clamp(vColor.rgb, 0.0, 64.0) * shade;
#ifdef PARTICLE_LIT
  vec3 lit = uSkyColor * 0.9 + uSunColor * 0.42 * clamp(uSunDir.y * 2.0 + 0.25, 0.0, 1.0);
  col *= lit;
  vec3 rel = vWorld - cameraPosition;
  vec3 fogPos = dot(rel, rel) > 1e-6 ? vWorld : cameraPosition + vec3(0.0, 1e-3, 0.0);
  gl_FragColor = vec4(applyFog(col, fogPos), a);
#else
  gl_FragColor = vec4(applyFogAdditive(col, vWorld), a);
#endif
}
`;
