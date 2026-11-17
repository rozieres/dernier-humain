import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLSL } from '../../core/glsl.js';
import { ANCHOR } from './curve.js';

export const MAX_SLOTS = 24;
const RADIAL = 6;

const CABLE_VERTEX = /* glsl */ `
attribute vec3 aData;
uniform vec3 uColors[${MAX_SLOTS}];
uniform float uGrow[${MAX_SLOTS}];
uniform float uFlicker[${MAX_SLOTS}];
uniform float uSway[${MAX_SLOTS}];
uniform float uTime;
varying vec3 vColor;
varying float vS;
varying float vCut;
varying float vFlicker;
varying float vT;
varying float vTip;
varying vec3 vWorld;
void main() {
  int i = int(aData.y + 0.5);
  vec3 c = position;
  float sway = uSway[i] * aData.z * aData.z;
  c.x += sway * sin(uTime * 1.3 + aData.z * 2.0);
  c.z += sway * 0.6 * cos(uTime * 1.1);
  float dist = length(cameraPosition - c);
  float r = max(mix(0.022, 0.075, smoothstep(1.5, 8.0, dist)), dist * 0.0021);
  vec3 w = c + normal * r;
  vColor = uColors[i];
  vCut = uGrow[i] - aData.z;
  vFlicker = uFlicker[i];
  vS = aData.x;
  vT = aData.z;
  vTip = step(uGrow[i], 0.999) * (1.0 - step(0.5, uFlicker[i]));
  vWorld = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

const CABLE_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.noise}
${GLSL.fog}
varying vec3 vColor;
varying float vS;
varying float vCut;
varying float vFlicker;
varying float vT;
varying float vTip;
varying vec3 vWorld;
void main() {
  if (vCut < 0.0) discard;
  float p = fract((vS - uTime * 46.0) / 72.0);
  float pulse = smoothstep(0.0, 0.02, p) * (1.0 - smoothstep(0.02, 0.14, p));
  float p2 = fract((vS + uTime * 21.0) / 37.0);
  float pulse2 = smoothstep(0.0, 0.05, p2) * (1.0 - smoothstep(0.05, 0.2, p2));
  float n = hash11(floor(uTime * 18.0) + floor(vT * 4.0) * 7.0);
  float flick = mix(1.0, 0.22 + 0.78 * step(0.32, n) * (0.55 + 0.45 * n), vFlicker);
  float tip = vTip * (1.0 - smoothstep(0.0, 0.006, vCut));
  vec3 col = vColor * (1.0 + pulse * 2.2 + pulse2 * 0.5) * flick;
  col += vec3(1.0, 0.95, 0.9) * tip * 8.0;
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const LABEL_VERTEX = /* glsl */ `
attribute vec3 aOffset;
attribute vec4 aUv;
attribute vec3 aColor;
attribute vec2 aSize;
attribute float aFlicker;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vWorld;
varying float vFlicker;
void main() {
  vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
  right = normalize(vec3(right.x, 0.0, right.z) + vec3(1e-5, 0.0, 0.0));
  float dist = length(cameraPosition - aOffset);
  float k = clamp(dist / 30.0, 1.0, 5.0);
  vec3 w = aOffset + right * position.x * aSize.x * k + vec3(0.0, 1.0, 0.0) * position.y * aSize.y * k;
  vUv = vec2(aUv.x + uv.x * aUv.z, aUv.y + uv.y * aUv.w);
  vColor = aColor;
  vFlicker = aFlicker;
  vWorld = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

const LABEL_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.noise}
${GLSL.fog}
uniform sampler2D uAtlas;
uniform vec3 uCard;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vWorld;
varying float vFlicker;
void main() {
  vec4 t = texture2D(uAtlas, vUv);
  if (t.a < 0.01) discard;
  float ink = clamp(1.0 - t.r, 0.0, 1.0);
  float n = hash11(floor(uTime * 15.0) + 7.0);
  float flick = mix(1.0, 0.3 + 0.7 * step(0.3, n) * (0.5 + 0.5 * n), vFlicker);
  vec3 col = mix(uCard, vColor * flick, ink);
  gl_FragColor = vec4(applyFog(col, vWorld), t.a * 0.96);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createCableMaterial(mat) {
  return mat.shader({
    vertexShader: CABLE_VERTEX,
    fragmentShader: CABLE_FRAGMENT,
    uniforms: {
      uColors: { value: Array.from({ length: MAX_SLOTS }, () => new THREE.Color()) },
      uGrow: { value: new Array(MAX_SLOTS).fill(1) },
      uFlicker: { value: new Array(MAX_SLOTS).fill(0) },
      uSway: { value: new Array(MAX_SLOTS).fill(0) },
    },
  });
}

export function buildCableGeometry(strands) {
  let verts = 0;
  let tris = 0;
  for (const s of strands) {
    verts += s.points.length * RADIAL;
    tris += (s.points.length - 1) * RADIAL * 2;
  }
  const position = new Float32Array(verts * 3);
  const normal = new Float32Array(verts * 3);
  const data = new Float32Array(verts * 3);
  const index = new Uint32Array(tris * 3);
  const tan = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const bin = new THREE.Vector3();
  const ref = new THREE.Vector3();
  const r = new THREE.Vector3();
  let v = 0;
  let k = 0;
  for (const s of strands) {
    const pts = s.points;
    const base = v;
    let along = s.offset || 0;
    const total = s.length;
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) along += pts[i].distanceTo(pts[i - 1]);
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[Math.min(pts.length - 1, i + 1)];
      tan.subVectors(p1, p0).normalize();
      ref.set(0, 1, 0);
      if (Math.abs(tan.y) > 0.95) ref.set(1, 0, 0);
      nrm.crossVectors(tan, ref).normalize();
      bin.crossVectors(tan, nrm).normalize();
      const t = s.tOf ? s.tOf(along, i) : along / total;
      for (let j = 0; j < RADIAL; j++) {
        const a = (j / RADIAL) * Math.PI * 2;
        r.copy(nrm).multiplyScalar(Math.cos(a)).addScaledVector(bin, Math.sin(a));
        position.set([pts[i].x, pts[i].y, pts[i].z], v * 3);
        normal.set([r.x, r.y, r.z], v * 3);
        data.set([along, s.slot, t], v * 3);
        v++;
      }
      if (i < pts.length - 1) {
        const row = base + i * RADIAL;
        for (let j = 0; j < RADIAL; j++) {
          const a0 = row + j;
          const a1 = row + ((j + 1) % RADIAL);
          const b0 = a0 + RADIAL;
          const b1 = a1 + RADIAL;
          index.set([a0, b0, a1, a1, b0, b1], k);
          k += 6;
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geo.setAttribute('aData', new THREE.BufferAttribute(data, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  geo.boundingSphere.radius += 40;
  return geo;
}

function archCurve(inset = 0) {
  const w = 1.72 - inset;
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(-w, 0, 0),
    new THREE.Vector3(-w * 0.94, 2.6, 0),
    new THREE.Vector3(-w * 0.8, 5.0, 0),
    new THREE.Vector3(-w * 0.48, 6.85, 0),
    new THREE.Vector3(0, ANCHOR - inset * 0.6, 0),
    new THREE.Vector3(w * 0.48, 6.85, 0),
    new THREE.Vector3(w * 0.8, 5.0, 0),
    new THREE.Vector3(w * 0.94, 2.6, 0),
    new THREE.Vector3(w, 0, 0),
  ], false, 'centripetal');
}

const strip = (g) => {
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) if (name !== 'position' && name !== 'normal') out.deleteAttribute(name);
  return out;
};

function taperedTube(curve, segments, radial, r0, r1) {
  const geo = new THREE.TubeGeometry(curve, segments, 1, radial, false);
  const pos = geo.attributes.position;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, c);
    const r = r0 + (r1 - r0) * Math.sin(Math.PI * t) ** 0.7;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

export function buildArchGeometry() {
  const frame = taperedTube(archCurve(0), 96, 10, 0.2, 0.085);
  const footL = new THREE.CylinderGeometry(0.24, 0.4, 0.34, 16).translate(-1.72, 0.17, 0);
  const footR = new THREE.CylinderGeometry(0.24, 0.4, 0.34, 16).translate(1.72, 0.17, 0);
  const crown = new THREE.SphereGeometry(0.17, 16, 10).translate(0, ANCHOR, 0);
  return mergeGeometries([frame, footL, footR, crown].map(strip));
}

export function buildArchGlowGeometry() {
  const pts = archCurve(0).getPoints(96);
  const inner = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => p.clone().setZ(0.16))), 96, 0.03, 5, false);
  const inner2 = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => p.clone().setZ(-0.16))), 96, 0.03, 5, false);
  const ring = new THREE.TorusGeometry(0.34, 0.045, 8, 28).translate(0, ANCHOR, 0);
  const padL = new THREE.TorusGeometry(0.46, 0.035, 6, 24).rotateX(Math.PI / 2).translate(-1.72, 0.05, 0);
  const padR = new THREE.TorusGeometry(0.46, 0.035, 6, 24).rotateX(Math.PI / 2).translate(1.72, 0.05, 0);
  return mergeGeometries([inner, inner2, ring, padL, padR].map(strip));
}

const PORTAL_VERTEX = /* glsl */ `
varying vec2 vLocal;
varying vec3 vColor;
varying vec3 vWorld;
void main() {
  vLocal = position.xy;
  vColor = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
    vColor = instanceColor;
  #endif
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const PORTAL_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.noise}
${GLSL.fog}
varying vec2 vLocal;
varying vec3 vColor;
varying vec3 vWorld;
void main() {
  float h = vLocal.y / ${ANCHOR.toFixed(2)};
  float base = pow(clamp(1.0 - h, 0.0, 1.0), 2.2) * 0.55 + 0.04;
  float lines = 0.5 + 0.5 * sin(vLocal.y * 9.0 - uTime * 3.0);
  float shimmer = vnoise(vec3(vLocal * 1.6, uTime * 0.4)) * 0.5 + 0.5;
  float a = base * (0.55 + 0.45 * lines) * (0.6 + 0.4 * shimmer);
  float dist = length(cameraPosition - vWorld);
  a *= smoothstep(1.2, 4.0, dist);
  gl_FragColor = vec4(applyFogAdditive(vColor * a * 0.4, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function buildPortalGeometry() {
  const pts = archCurve(0.1).getPoints(64);
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)));
  const geo = new THREE.ShapeGeometry(shape, 1);
  for (const name of Object.keys(geo.attributes)) if (name !== 'position') geo.deleteAttribute(name);
  return geo;
}

export function createPortalMaterial(mat) {
  return mat.shader({
    vertexShader: PORTAL_VERTEX,
    fragmentShader: PORTAL_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function createLabelMaterial(mat, atlas) {
  return mat.shader({
    vertexShader: LABEL_VERTEX,
    fragmentShader: LABEL_FRAGMENT,
    uniforms: {
      uAtlas: { value: atlas },
      uCard: { value: new THREE.Color('#f2efe8').multiplyScalar(0.95) },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export const ROW_H = 128;
export const ATLAS_W = 1024;

export function drawAtlas(text, labels) {
  const rows = Math.max(1, labels.length);
  const height = THREE.MathUtils.ceilPowerOfTwo(rows * ROW_H);
  const layout = [];
  const canvas = text.canvas({
    width: ATLAS_W,
    height,
    draw(c) {
      c.clearRect(0, 0, ATLAS_W, height);
      labels.forEach((label, i) => {
        const y0 = i * ROW_H;
        c.font = `600 62px ${text.FONTS.ui}, sans-serif`;
        const w = Math.min(ATLAS_W - 80, c.measureText(label).width);
        const pad = 34;
        const cardW = Math.min(ATLAS_W - 4, w + pad * 2);
        const x0 = 2;
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.roundRect(x0, y0 + 10, cardW, ROW_H - 20, 22);
        c.fill();
        c.fillStyle = '#000000';
        c.textBaseline = 'alphabetic';
        c.fillText(label, x0 + pad, y0 + 82, ATLAS_W - 80);
        c.fillRect(x0 + pad, y0 + 92, w, 6);
        layout.push({ u: x0 / ATLAS_W, v: 1 - (y0 + ROW_H) / height, du: cardW / ATLAS_W, dv: ROW_H / height, aspect: cardW / ROW_H });
      });
    },
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return { texture: tex, layout };
}
