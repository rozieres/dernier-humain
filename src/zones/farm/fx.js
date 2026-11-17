import * as THREE from 'three';
import { GLSL } from '../../core/glsl.js';
import { metalMask, woodTexture, stoneTexture, plainTexture } from '../../entities/props/kit.js';

const chase = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    'outgoingLight *= 0.74 + 0.26 * sin(vDhWorldPos.y * 0.85 + vDhWorldPos.x * 0.21 + vDhWorldPos.z * 0.17 - uTime * 3.1);\n#include <opaque_fragment>',
  );
};

export function createMaterials(ctx) {
  const { mat } = ctx;
  const synth = mat.physical({ vertexColors: true, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.07 }, { onShader: metalMask });
  const glow = mat.basic({ color: new THREE.Color(4, 4, 4), vertexColors: true }, { onShader: chase });
  const ground = mat.standard({
    vertexColors: true, roughness: 0.5, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6,
  });
  const rustic = mat.standard({ map: plainTexture('farm-rustic', 128, '#e8e4dc'), vertexColors: true, roughness: 0.92, metalness: 0 }, { onShader: metalMask });
  const wood = mat.standard({ map: woodTexture('farm-wood'), vertexColors: true, roughness: 0.86, metalness: 0 }, { onShader: metalMask });
  const stone = mat.standard({ map: stoneTexture('farm-stone'), vertexColors: true, roughness: 0.94, metalness: 0 });
  const foliage = mat.standard({ vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
  const glass = mat.physical({
    vertexColors: true, transparent: true, opacity: 0.3, roughness: 0.06, metalness: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  return { synth, glow, ground, rustic, wood, stone, foliage, glass };
}

const INSTANCED_VERTEX = /* glsl */ `
attribute vec2 aInfo;
varying vec2 vUv;
varying vec2 vInfo;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vUv = uv;
  vInfo = aInfo;
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  n = mat3(instanceMatrix) * n;
  #endif
  vec4 w = modelMatrix * p;
  vWorld = w.xyz;
  vNormalW = mat3(modelMatrix) * n;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const PLAIN_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormalW = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const LED_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.fog}
uniform sampler2D uMap;
uniform float uWidths[16];
varying vec2 vUv;
varying vec2 vInfo;
varying vec3 vWorld;
void main() {
  float aspect = vInfo.y;
  vec2 grid = vec2(18.0 * aspect, 18.0);
  vec2 g = vUv * grid;
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  vec2 q = (cell + 0.5) / grid;
  float t = uTime + vInfo.x * 53.0;
  float period = 12.0;
  float k = floor(t / period);
  float idx = mod(k * 5.0 + floor(vInfo.x * 16.0), 16.0);
  float w = uWidths[int(idx)];
  float win = 64.0 * aspect;
  float px = mix(-win, w, fract(t / period)) + q.x * win;
  float py = idx * 64.0 + (1.0 - q.y) * 64.0;
  vec2 auv = vec2(px / 2048.0, 1.0 - py / 1024.0);
  float lit = (px >= 0.0 && px < w) ? texture2D(uMap, auv).r : 0.0;
  float dotm = smoothstep(0.5, 0.26, length(f));
  vec3 colA = vec3(0.36, 0.88, 0.9);
  vec3 colB = vec3(1.0, 0.37, 0.64);
  vec3 col = mix(colA, colB, smoothstep(0.15, 0.95, q.x + 0.2 * sin(uTime * 0.4 + vInfo.x * 6.0)));
  float edge = smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.97, vUv.x) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
  vec3 c = vec3(0.012, 0.015, 0.022) + dotm * edge * (0.02 + col * lit * 3.4);
  gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const HOLO_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.fog}
uniform sampler2D uMap;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  float u = fract(vUv.x * 2.0 + uTime * 0.018);
  float v = clamp((vUv.y - 0.16) / 0.68, 0.0, 1.0);
  float text = (vUv.y > 0.16 && vUv.y < 0.84) ? texture2D(uMap, vec2(u, v)).r : 0.0;
  float bands = smoothstep(0.035, 0.0, abs(vUv.y - 0.07)) + smoothstep(0.035, 0.0, abs(vUv.y - 0.93));
  float scan = 0.72 + 0.28 * sin(vUv.y * 150.0 - uTime * 9.0);
  float flicker = 1.0 - 0.35 * step(0.965, fract(sin(floor(uTime * 14.0)) * 43758.5));
  vec3 col = mix(vec3(0.36, 0.88, 0.9), vec3(1.0, 0.37, 0.64), 0.5 + 0.5 * sin(vUv.x * 12.566 + uTime * 0.6));
  float side = gl_FrontFacing ? 1.0 : 0.3;
  vec3 c = col * (text * (4.0 + 3.0 * uNight) * scan + bands * (2.4 + 2.0 * uNight) + 0.06) * flicker * side;
  gl_FragColor = vec4(applyFogAdditive(c, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const COLUMN_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.fog}
${GLSL.noise}
uniform float uGain;
varying vec2 vUv;
varying vec2 vInfo;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dc = length(toCam);
  vec3 view = dc > 1e-4 ? toCam / dc : vec3(0.0, 1.0, 0.0);
  float nl = length(vNormalW);
  vec3 n = nl > 1e-4 ? vNormalW / nl : vec3(0.0, 0.0, 1.0);
  float rim = 1.0 - abs(dot(n, view));
  float t = uTime + vInfo.x * 10.0;
  float s1 = smoothstep(0.62, 0.95, vnoise(vec2(vUv.x * 46.0, vUv.y * 7.0 - t * 2.4)));
  float s2 = smoothstep(0.6, 0.95, vnoise(vec2(vUv.x * 21.0 + 7.0, vUv.y * 3.5 - t * 1.5)));
  float fade = smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.62, 1.0, vUv.y));
  float near = smoothstep(2.0, 9.0, dc);
  vec3 c = vec3(0.72, 0.95, 1.0) * (0.012 + 0.5 * s1 + 0.24 * s2) * fade * (0.2 + 0.9 * pow(clamp(rim, 0.0, 1.0), 1.6)) * near * uGain;
  gl_FragColor = vec4(applyFogAdditive(c, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function fitFont(c, text, weight, size, family, maxWidth) {
  let s = size;
  c.font = `${weight} ${s}px "${family}"`;
  while (c.measureText(text).width > maxWidth && s > 10) {
    s -= 1;
    c.font = `${weight} ${s}px "${family}"`;
  }
  return s;
}

export function ledBoards(ctx, boards, headlines) {
  const el = ctx.text.canvas({ width: 2048, height: 1024 });
  const c = el.getContext('2d');
  c.fillStyle = '#000';
  c.fillRect(0, 0, 2048, 1024);
  c.fillStyle = '#fff';
  c.textBaseline = 'middle';
  const widths = [];
  headlines.slice(0, 16).forEach((line, i) => {
    const text = line.toUpperCase();
    fitFont(c, text, 700, 42, ctx.text.FONTS.ui, 2030);
    c.fillText(text, 4, i * 64 + 33);
    widths.push(Math.ceil(c.measureText(text).width) + 8);
  });
  const map = new THREE.CanvasTexture(el);
  map.colorSpace = THREE.NoColorSpace;
  map.minFilter = THREE.LinearFilter;
  map.generateMipmaps = false;
  const material = ctx.mat.shader({
    vertexShader: INSTANCED_VERTEX, fragmentShader: LED_FRAGMENT,
    uniforms: { uMap: { value: map }, uWidths: { value: widths } },
  });
  const geo = new THREE.PlaneGeometry(1, 1);
  const info = new Float32Array(boards.length * 2);
  boards.forEach((b, i) => {
    info[i * 2] = (i * 0.37 + 0.11) % 1;
    info[i * 2 + 1] = b.w / b.h;
  });
  geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 2));
  const mesh = new THREE.InstancedMesh(geo, material, boards.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  boards.forEach((b, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw);
    m.compose(new THREE.Vector3(b.cx, b.cy, b.cz), q, new THREE.Vector3(b.w, b.h, 1));
    mesh.setMatrixAt(i, m);
  });
  mesh.computeBoundingSphere();
  mesh.name = 'farm:led';
  return mesh;
}

export function hologram(ctx, { radius, height, slogan }) {
  const el = ctx.text.canvas({ width: 4096, height: 256 });
  const c = el.getContext('2d');
  c.fillStyle = '#000';
  c.fillRect(0, 0, 4096, 256);
  c.fillStyle = '#fff';
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  fitFont(c, slogan, 800, 150, ctx.text.FONTS.ui, 4000);
  c.fillText(slogan, 2048, 136);
  const map = new THREE.CanvasTexture(el);
  map.colorSpace = THREE.NoColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.anisotropy = 8;
  const material = ctx.mat.shader({
    vertexShader: PLAIN_VERTEX, fragmentShader: HOLO_FRAGMENT, uniforms: { uMap: { value: map } },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 72, 1, true), material);
  mesh.name = 'farm:hologram';
  mesh.renderOrder = 6;
  return mesh;
}

export function airColumns(ctx, fans, { radius, height }) {
  const geo = new THREE.CylinderGeometry(radius, radius * 1.15, height, 40, 1, true).translate(0, height / 2, 0);
  const info = new Float32Array(fans.length * 2);
  fans.forEach((f, i) => {
    info[i * 2] = i * 0.31;
  });
  geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 2));
  const material = ctx.mat.shader({
    vertexShader: INSTANCED_VERTEX, fragmentShader: COLUMN_FRAGMENT, uniforms: { uGain: { value: 1 } },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geo, material, fans.length);
  const m = new THREE.Matrix4();
  fans.forEach((f, i) => {
    m.makeTranslation(f.x, f.y, f.z);
    mesh.setMatrixAt(i, m);
  });
  mesh.computeBoundingSphere();
  mesh.renderOrder = 7;
  mesh.name = 'farm:updrafts';
  return mesh;
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function stars(c, x, y, size, n, on = '#ffb800', off = '#d8dce6') {
  for (let i = 0; i < 5; i++) {
    c.fillStyle = i < n ? on : off;
    const cx = x + i * size * 1.15 + size / 2;
    const cy = y + size / 2;
    c.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const r = k % 2 ? size * 0.22 : size * 0.5;
      c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
  }
}

export function reviewAtlas(ctx, reviews, gerard) {
  const { FONTS } = ctx.text;
  const el = ctx.text.canvas({ width: 2048, height: 2048 });
  const c = el.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 2048);
  g.addColorStop(0, '#f6f8fd');
  g.addColorStop(1, '#e7ecf6');
  c.fillStyle = g;
  c.fillRect(0, 0, 2048, 2048);
  const hg = c.createLinearGradient(0, 0, 1536, 0);
  hg.addColorStop(0, '#5ce1e6');
  hg.addColorStop(1, '#ff5fa2');
  c.fillStyle = hg;
  c.fillRect(0, 0, 1536, 256);
  c.fillStyle = '#ffffff';
  c.textBaseline = 'alphabetic';
  c.font = `800 92px "${FONTS.ui}"`;
  c.fillText('Avis clients', 48, 112);
  stars(c, 52, 140, 62, 5, '#ffffff', 'rgba(255,255,255,0.4)');
  c.font = `600 44px "${FONTS.ui}"`;
  c.fillText('4,9 / 5 · 48 213 907 avis vérifiés', 440, 192);

  c.fillStyle = '#efe6cf';
  c.fillRect(1536, 0, 512, 256);
  c.save();
  c.translate(1792, 128);
  c.rotate(-0.025);
  c.fillStyle = '#fbf6e8';
  c.fillRect(-236, -110, 472, 220);
  stars(c, -210, -92, 38, 1, '#c96f4a', '#e3dccb');
  c.fillStyle = '#2b2118';
  c.font = `700 30px "${FONTS.ui}"`;
  c.fillText(gerard.title.replace(/^[★☆\s]+/, ''), -210, -12);
  c.font = `400 22px "${FONTS.ui}"`;
  const lines = ctx.text.wrap(c, gerard.text, 420).slice(0, 3);
  lines.forEach((l, i) => c.fillText(l, -210, 22 + i * 27));
  c.fillStyle = '#7a6d5c';
  c.font = `500 20px "${FONTS.ui}"`;
  c.fillText(gerard.author, -210, 102);
  c.restore();

  const cols = 4;
  const rows = 5;
  const cw = 512;
  const ch = (2048 - 256) / rows;
  reviews.slice(0, cols * rows).forEach((rv, i) => {
    const x = (i % cols) * cw + 14;
    const y = 256 + Math.floor(i / cols) * ch + 14;
    const w = cw - 28;
    const h = ch - 28;
    c.fillStyle = 'rgba(20,30,60,0.08)';
    roundRect(c, x + 4, y + 8, w, h, 22);
    c.fill();
    c.fillStyle = '#ffffff';
    roundRect(c, x, y, w, h, 22);
    c.fill();
    stars(c, x + 26, y + 24, 40, rv.stars);
    c.fillStyle = '#0b0d10';
    fitFont(c, rv.title, 700, 34, FONTS.ui, w - 52);
    c.fillText(rv.title, x + 26, y + 112);
    c.fillStyle = '#3c4250';
    c.font = `400 23px "${FONTS.ui}"`;
    const body = ctx.text.wrap(c, rv.text, w - 52).slice(0, 5);
    body.forEach((l, k) => c.fillText(k === 4 ? `${l.slice(0, -1)}…` : l, x + 26, y + 150 + k * 29));
    c.fillStyle = '#8a92a3';
    c.font = `500 21px "${FONTS.ui}"`;
    c.fillText(`${rv.author} · achat vérifié ✓`, x + 26, y + h - 22);
  });
  const map = new THREE.CanvasTexture(el);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

export function signAtlas(ctx, lines, kiosk) {
  const { FONTS } = ctx.text;
  const el = ctx.text.canvas({ width: 2048, height: 2048 });
  const c = el.getContext('2d');
  c.fillStyle = '#0d1117';
  c.fillRect(0, 1024, 1024, 1024);
  const screen = ctx.text.texture({ style: 'post', width: 512, height: 1024, ...kiosk });
  c.drawImage(screen.image, 256, 1024);
  screen.dispose();
  lines.slice(0, 4).forEach((line, i) => {
    const x = (i % 2) * 1024;
    const y = Math.floor(i / 2) * 512;
    const g = c.createLinearGradient(x, y, x, y + 512);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#e9eef7');
    c.fillStyle = g;
    c.fillRect(x, y, 1024, 512);
    const bar = c.createLinearGradient(x, y, x, y + 512);
    bar.addColorStop(0, '#5ce1e6');
    bar.addColorStop(1, '#ff5fa2');
    c.fillStyle = bar;
    c.fillRect(x, y, 34, 512);
    c.fillStyle = '#0b0d10';
    c.textBaseline = 'alphabetic';
    const parts = line.split(/ — | : /);
    const head = parts[0];
    const tail = line.slice(head.length).replace(/^ — |^ : /, '');
    const size = fitFont(c, head, 800, 96, FONTS.ui, 900);
    const tailLines = tail ? (() => {
      c.font = `500 54px "${FONTS.ui}"`;
      return ctx.text.wrap(c, tail, 900).slice(0, 3);
    })() : [];
    const total = size + tailLines.length * 66;
    let cy = y + 256 - total / 2 + size * 0.8;
    c.font = `800 ${size}px "${FONTS.ui}"`;
    c.fillText(head, x + 80, cy);
    c.fillStyle = '#4a5160';
    c.font = `500 54px "${FONTS.ui}"`;
    for (const l of tailLines) {
      cy += 66;
      c.fillText(l, x + 80, cy);
    }
  });
  const map = new THREE.CanvasTexture(el);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

export function labelAtlas(ctx, labels) {
  const el = ctx.text.canvas({ width: 1536, height: 512 });
  const c = el.getContext('2d');
  labels.slice(0, 3).forEach((label, i) => {
    const x = i * 512;
    c.fillStyle = '#efe3c4';
    c.fillRect(x, 0, 512, 512);
    c.strokeStyle = 'rgba(120,90,50,0.35)';
    c.lineWidth = 6;
    c.strokeRect(x + 10, 10, 492, 492);
    c.fillStyle = '#2b2118';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    let size = 96;
    let lines;
    do {
      c.font = `700 ${size}px "${ctx.text.FONTS.hand}"`;
      lines = ctx.text.wrap(c, label, 440);
      size -= 4;
    } while (lines.length * size * 1.05 > 440 && size > 30);
    const lh = (size + 4) * 1.05;
    lines.forEach((l, k) => c.fillText(l, x + 256 + (k % 2 ? 6 : -4), 256 + (k - (lines.length - 1) / 2) * lh));
  });
  const map = new THREE.CanvasTexture(el);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}
