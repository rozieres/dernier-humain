import * as THREE from 'three';
import { GLSL } from '../../core/glsl.js';

export const LANTERN_HEIGHT = 0.42;
const FOLDS = 14;
const RINGS = 8;

function radiusAt(v) {
  return 0.155 * (0.66 + 0.34 * Math.sin(v * Math.PI));
}

export function lanternGeometry() {
  const pos = [];
  const uv = [];
  const quad = (a, b, c, d) => {
    for (const p of [a, b, c, a, c, d]) {
      pos.push(p[0], p[1], p[2]);
      uv.push(p[3], p[4]);
    }
  };
  const ring = [];
  for (let i = 0; i <= RINGS; i++) {
    const v = i / RINGS;
    const row = [];
    for (let j = 0; j <= FOLDS; j++) {
      const a = (j / FOLDS) * Math.PI * 2;
      const r = radiusAt(v) * (j % 2 === 0 ? 1 : 0.8);
      row.push([Math.sin(a) * r, (v - 0.5) * LANTERN_HEIGHT, Math.cos(a) * r, j / FOLDS, v]);
    }
    ring.push(row);
  }
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < FOLDS; j++) quad(ring[i][j], ring[i][j + 1], ring[i + 1][j + 1], ring[i + 1][j]);
  }
  const SEG = 16;
  for (const v of [0, 1]) {
    const y = (v - 0.5) * LANTERN_HEIGHT;
    const r = radiusAt(v) * 0.92;
    const band = [[r, y - 0.012], [r + 0.012, y], [r, y + 0.012], [r - 0.012, y]];
    for (let k = 0; k < 4; k++) {
      const [r0, y0] = band[k];
      const [r1, y1] = band[(k + 1) % 4];
      for (let j = 0; j < SEG; j++) {
        const a0 = (j / SEG) * Math.PI * 2;
        const a1 = ((j + 1) / SEG) * Math.PI * 2;
        quad(
          [Math.sin(a0) * r0, y0, Math.cos(a0) * r0, -1, -1], [Math.sin(a1) * r0, y0, Math.cos(a1) * r0, -1, -1],
          [Math.sin(a1) * r1, y1, Math.cos(a1) * r1, -1, -1], [Math.sin(a0) * r1, y1, Math.cos(a0) * r1, -1, -1],
        );
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

const SPIN = /* glsl */ `
vec3 spinLocal(vec3 p, float seed) {
  float a = uTime * 0.32 + seed * 6.2831;
  float c = cos(a);
  float s = sin(a);
  p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  float tilt = sin(uTime * 0.7 + seed * 11.0) * 0.06;
  p = vec3(p.x, p.y * cos(tilt) - p.z * sin(tilt), p.y * sin(tilt) + p.z * cos(tilt));
  p.y += sin(uTime * 1.1 + seed * 17.0) * 0.045;
  return p;
}
`;

const LANTERN_VERTEX = /* glsl */ `
${GLSL.envPars}
${SPIN}
attribute vec4 aRect;
attribute vec4 aInfo;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vHeight;
varying vec4 vInfo;
varying float vRim;
void main() {
  vRim = uv.x < -0.5 ? 1.0 : 0.0;
  vUv = aRect.xy + max(uv, 0.0) * aRect.zw;
  vInfo = aInfo;
  vHeight = (position.y / ${LANTERN_HEIGHT.toFixed(3)}) + 0.5;
  vec3 p = spinLocal(position, aInfo.x);
  vec3 n = spinLocal(position + normal, aInfo.x) - p;
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const LANTERN_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.fog}
uniform sampler2D uAtlas;
uniform vec3 uAmber;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vHeight;
varying vec4 vInfo;
varying float vRim;
void main() {
  vec4 paper = texture2D(uAtlas, vUv);
  paper.rgb = mix(paper.rgb, vec3(0.16, 0.09, 0.045), vRim);
  float lum = dot(paper.rgb, vec3(0.3333));
  float ink = 1.0 - smoothstep(0.06, 0.45, lum);
  vec3 N = normalize(vNormalW) * (gl_FrontFacing ? 1.0 : -1.0);
  float ndl = max(dot(N, uSunDir), 0.0);
  float sky = 0.5 + 0.5 * N.y;
  vec3 lit = paper.rgb * (uSunColor * ndl * 0.32 + mix(uGroundColor, uSkyColor, sky) * 0.75);
  float found = vInfo.y;
  float flicker = 0.88 + 0.12 * sin(uTime * 7.3 + vInfo.x * 40.0) * sin(uTime * 3.1 + vInfo.x * 13.0);
  float glow = mix(1.0, 0.3, found) * flicker * mix(0.6, 1.15, uNight);
  float flame = 1.35 - vHeight * 0.75;
  vec3 warm = uAmber * glow * flame;
  vec3 trans = warm * mix(1.0, 0.04, ink) * (gl_FrontFacing ? 1.0 : 1.7) * (1.0 - vRim);
  vec3 col = lit * mix(0.85, 0.35, uNight) + trans + uAmber * vInfo.z * 4.0;
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const HALO_VERTEX = /* glsl */ `
${GLSL.envPars}
attribute vec4 aInfo;
varying vec2 vP;
varying vec3 vWorld;
varying vec4 vInfo;
void main() {
  vP = position.xy;
  vInfo = aInfo;
  vec4 center = modelMatrix * instanceMatrix * vec4(0.0, -0.04, 0.0, 1.0);
  center.y += sin(uTime * 1.1 + aInfo.x * 17.0) * 0.045;
  vWorld = center.xyz;
  vec4 view = viewMatrix * center;
  float dist = -view.z;
  float size = mix(0.5, 0.75, uNight) * max(1.0, dist * mix(0.016, 0.03, uNight));
  view.xy += position.xy * size;
  view.z += 0.25;
  gl_Position = projectionMatrix * view;
  if (dist > 420.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const HALO_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.fog}
uniform vec3 uAmber;
varying vec2 vP;
varying vec3 vWorld;
varying vec4 vInfo;
void main() {
  float d = length(vP);
  float g = exp(-d * d * 9.0) * 0.9 + exp(-d * 3.5) * 0.18;
  g *= smoothstep(1.0, 0.75, d);
  float dist = length(vWorld - cameraPosition);
  float near = smoothstep(1.2, 4.0, dist);
  float k = mix(0.32, 0.75, uNight) * mix(1.0, 0.3, vInfo.y) * mix(0.35, 1.0, near) + vInfo.z * 2.0;
  gl_FragColor = vec4(applyFogAdditive(uAmber * g * k, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const GLYPH_VERTEX = /* glsl */ `
${GLSL.envPars}
uniform float uScale;
attribute vec3 aCenter;
attribute vec4 aSeed;
attribute float aActive;
varying float vAlpha;
varying vec2 vCell;
varying vec3 vWorld;
void main() {
  float phase = fract(uTime * aSeed.w + aSeed.x);
  float a = aSeed.x * 6.2831 + uTime * 0.6 + phase * 2.4;
  float r = aSeed.z * (0.12 + phase * 0.35);
  vec3 p = aCenter + vec3(cos(a) * r, -0.12 + phase * 1.7, sin(a) * r);
  p.xz += uWind.xy * phase * phase * 0.25;
  vWorld = p;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  vAlpha = sin(phase * 3.14159) * aActive * smoothstep(90.0, 30.0, dist);
  float cell = floor(aSeed.y * 32.0);
  vCell = vec2(mod(cell, 8.0), floor(cell / 8.0));
  gl_PointSize = vAlpha > 0.001 ? 0.11 * uScale / max(dist, 0.1) : 0.0;
  gl_Position = projectionMatrix * mv;
}
`;

const GLYPH_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.fog}
uniform sampler2D uGlyphs;
uniform vec3 uAmber;
varying float vAlpha;
varying vec2 vCell;
varying vec3 vWorld;
void main() {
  vec2 uv = vec2((vCell.x + gl_PointCoord.x) / 8.0, 1.0 - (vCell.y + gl_PointCoord.y) / 4.0);
  float m = texture2D(uGlyphs, uv).a;
  vec3 col = uAmber * m * vAlpha * mix(1.4, 3.2, uNight);
  gl_FragColor = vec4(applyFogAdditive(col, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function glyphTexture(ctx) {
  const chars = 'aeilmnorstuvbdcpqéàçjfghkyzwx?,!';
  const canvas = ctx.text.canvas({
    width: 512, height: 256,
    draw(c) {
      c.fillStyle = '#ffffff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `700 52px "${ctx.text.FONTS.hand}"`;
      for (let i = 0; i < 32; i++) {
        const x = (i % 8) * 64 + 32;
        const y = Math.floor(i / 8) * 64 + 30;
        c.save();
        c.translate(x, y);
        c.rotate(((i * 37) % 11 - 5) * 0.05);
        c.fillText(chars[i], 0, 0);
        c.restore();
      }
    },
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function createTraceMaterials(ctx, atlasTexture) {
  const amber = new THREE.Color('#ffb454');
  const lantern = ctx.mat.shader({
    vertexShader: LANTERN_VERTEX,
    fragmentShader: LANTERN_FRAGMENT,
    uniforms: { uAtlas: { value: atlasTexture }, uAmber: { value: amber } },
    side: THREE.DoubleSide,
  });
  const halo = ctx.mat.shader({
    vertexShader: HALO_VERTEX,
    fragmentShader: HALO_FRAGMENT,
    uniforms: { uAmber: { value: amber } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glyphs = ctx.mat.shader({
    vertexShader: GLYPH_VERTEX,
    fragmentShader: GLYPH_FRAGMENT,
    uniforms: { uAmber: { value: amber }, uGlyphs: { value: glyphTexture(ctx) }, uScale: { value: 600 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return { lantern, halo, glyphs };
}
