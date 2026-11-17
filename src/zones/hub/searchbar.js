import * as THREE from 'three';
import { GLSL } from '../../core/glsl.js';

const W = 12;
const H = 2;
const DEPTH = 0.5;
const BEVEL = 0.16;
const ATLAS_W = 2048;
const ROW = 96;
const FONT = 72;
const PX = 0.0084;
const FIELD = [-4.15, 5.25];
const DROP_ROWS = 4;
const DROP_ROW_H = 0.72;
const DROP_PX = 0.0062;
const DROP_TOP = -1.32;
const PREFIX_SPEED = 11;

function pillShape(w, h) {
  const r = h / 2;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -r);
  s.lineTo(w / 2 - r, -r);
  s.absarc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-w / 2 + r, r);
  s.absarc(-w / 2 + r, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
  return s;
}

function buildAtlas(ctx, lines) {
  const rows = lines.length;
  const height = Math.ceil((rows * ROW) / 64) * 64;
  const widths = [];
  const canvas = ctx.text.canvas({
    width: ATLAS_W,
    height,
    draw(c) {
      c.clearRect(0, 0, ATLAS_W, height);
      c.fillStyle = '#ffffff';
      c.textBaseline = 'alphabetic';
      c.font = `500 ${FONT}px Inter`;
      lines.forEach((line, i) => {
        c.fillText(line, 8, i * ROW + 70);
        const w = [];
        for (let k = 0; k <= line.length; k++) w.push(8 + c.measureText(line.slice(0, k)).width);
        widths.push(w);
      });
    },
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, widths, height };
}

const VERT = /* glsl */ `
attribute float aPart;
attribute vec2 aLocal;
varying vec2 vLocal;
varying float vPart;
varying vec3 vWorld;
void main() {
  vLocal = aLocal;
  vPart = aPart;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec2 uAtlasSize;
uniform float uRow;
uniform float uTyped;
uniform float uGhost;
uniform float uScroll;
uniform float uCaret;
uniform float uDrop;
uniform vec4 uRows;
uniform float uGlow;
uniform float uPrefix;
varying vec2 vLocal;
varying float vPart;
varying vec3 vWorld;
${GLSL.envPars}
${GLSL.fog}

float sdPill(vec2 p, vec2 hs) {
  float r = hs.y;
  p.x = abs(p.x) - (hs.x - r);
  p.x = max(p.x, 0.0);
  return length(p) - r;
}
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float aa(float d) {
  float w = max(fwidth(d), 1e-4);
  return clamp(0.5 - d / w, 0.0, 1.0);
}
float glyph(vec2 p, float s) {
  float ring = abs(length(p - vec2(-0.08, 0.08) * s) - 0.2 * s) - 0.045 * s;
  vec2 q = p - vec2(0.17, -0.17) * s;
  vec2 dir = normalize(vec2(1.0, -1.0));
  float t = clamp(dot(q, dir), 0.0, 0.2 * s);
  float handle = length(q - dir * t) - 0.055 * s;
  return min(ring, handle);
}
float atlasMask(float px, float row, float py) {
  if (px < 0.0 || px > uAtlasSize.x || py < 0.0 || py > ${ROW.toFixed(1)}) return 0.0;
  vec2 uv = vec2(px / uAtlasSize.x, 1.0 - (row * ${ROW.toFixed(1)} + py) / uAtlasSize.y);
  return texture2D(uAtlas, uv).a;
}

void main() {
  vec3 ink = vec3(0.014, 0.015, 0.018);
  vec3 ghost = vec3(0.33, 0.35, 0.38);
  vec3 blue = vec3(0.027, 0.2, 1.0);
  vec4 col = vec4(0.0);
  vec2 p = vLocal;
  if (vPart < 0.5) {
    float pill = sdPill(p, vec2(${(W / 2).toFixed(3)}, ${(H / 2).toFixed(3)}));
    float ring = aa(abs(pill + 0.06) - 0.035) * (0.55 + 0.45 * uDrop);
    col = vec4(blue * (1.0 + uGlow * 2.5), ring);
    float g = aa(glyph(p - vec2(-5.0, 0.0), 1.15));
    col = mix(col, vec4(mix(ghost, blue, uDrop), 1.0), g);
    float fx = (p.x - ${FIELD[0].toFixed(3)}) / ${PX} + uScroll;
    float fy = (0.41 - p.y) / ${PX};
    float inField = step(${FIELD[0].toFixed(3)}, p.x) * step(p.x, ${FIELD[1].toFixed(3)});
    float m = atlasMask(fx, uRow, fy) * inField;
    m *= mix(1.0, smoothstep(${FIELD[0].toFixed(3)}, ${(FIELD[0] + 0.45).toFixed(3)}, p.x), clamp(uScroll / 40.0, 0.0, 1.0));
    vec3 tc = fx < uTyped ? ink : ghost;
    float vis = fx < uGhost ? m : 0.0;
    col = mix(col, vec4(tc, 1.0), vis);
    float cx = ${FIELD[0].toFixed(3)} + (uTyped - uScroll) * ${PX};
    float caret = aa(abs(p.x - cx) - 0.03) * aa(abs(p.y + 0.02) - 0.36) * uCaret;
    col = mix(col, vec4(ink, 1.0), caret);
  } else {
    float h = ${(DROP_ROWS * DROP_ROW_H + 0.24).toFixed(3)};
    vec2 c = vec2(0.35, ${DROP_TOP.toFixed(3)} - h * 0.5);
    float open = smoothstep(0.0, 1.0, uDrop);
    float cut = ${DROP_TOP.toFixed(3)} - h * open;
    if (p.y < cut) discard;
    float box = sdRoundBox(p - c, vec2(5.45, h * 0.5), 0.32);
    float a = aa(box);
    if (a <= 0.0) discard;
    vec3 bg = vec3(0.93, 0.94, 0.96) * (1.0 - 0.45 * uGlow);
    col = vec4(bg, 0.94 * a);
    float rowF = (${(DROP_TOP - 0.12).toFixed(3)} - p.y) / ${DROP_ROW_H.toFixed(3)};
    float ri = floor(rowF);
    if (ri >= 0.0 && ri < ${DROP_ROWS.toFixed(1)}) {
      float ry = fract(rowF);
      float row = ri < 0.5 ? uRows.x : ri < 1.5 ? uRows.y : ri < 2.5 ? uRows.z : uRows.w;
      float hl = (ri < 0.5 ? 1.0 : 0.0) * aa(sdRoundBox(vec2(p.x - 0.35, (ry - 0.5) * ${DROP_ROW_H.toFixed(3)}), vec2(5.25, ${(DROP_ROW_H * 0.46).toFixed(3)}), 0.2));
      col.rgb = mix(col.rgb, vec3(0.78, 0.83, 0.9) * (1.0 - 0.45 * uGlow), hl);
      float gy = (ry - 0.5) * ${DROP_ROW_H.toFixed(3)};
      float g = aa(glyph(vec2(p.x + 4.6, -gy), 0.62));
      col.rgb = mix(col.rgb, ghost, g);
      float fx = (p.x + 4.15) / ${DROP_PX};
      float fy = ry * ${DROP_ROW_H.toFixed(3)} / ${DROP_PX} - 6.0;
      float m = atlasMask(fx, row, fy) * step(p.x, 5.4);
      vec3 tc = fx < uPrefix ? vec3(0.11, 0.12, 0.14) : ink;
      col.rgb = mix(col.rgb, tc, m);
    }
    col.a *= open;
  }
  if (col.a < 0.003) discard;
  vec3 rgb = col.rgb;
  gl_FragColor = vec4(applyFog(rgb, vWorld), col.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createSearchBar(ctx, { position }) {
  const { mat } = ctx;
  const lines = (ctx.has('texts') && ctx.texts.SEARCH_SUGGESTIONS?.length ? ctx.texts.SEARCH_SUGGESTIONS : ['dernier message humain']).slice(0, 16);
  const prefix = commonPrefix(lines);
  const group = new THREE.Group();
  group.name = 'hub:searchbar';
  group.position.copy(position);

  const bodyGeo = new THREE.ExtrudeGeometry(pillShape(W - BEVEL * 2, H - BEVEL * 2), {
    depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 6, curveSegments: 40,
  });
  bodyGeo.translate(0, 0, -DEPTH / 2);
  const bodyMat = mat.physical({
    color: '#f6f8fc', roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06,
    emissive: '#ffffff', emissiveIntensity: 0.05,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  group.add(body);

  const atlas = buildAtlas(ctx, lines);
  const face = DEPTH / 2 + BEVEL + 0.012;
  const parts = [];
  const barPlane = new THREE.PlaneGeometry(W + 0.1, H + 0.1, 1, 1);
  const dropH = DROP_ROWS * DROP_ROW_H + 0.24;
  const dropPlane = new THREE.PlaneGeometry(11.2, dropH + 0.1, 1, 1).translate(0.35, DROP_TOP - dropH / 2, 0);
  for (const [geo, part] of [[barPlane, 0], [dropPlane, 1]]) {
    for (const side of [1, -1]) {
      const g = geo.clone();
      const pos = g.attributes.position;
      const local = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        local[i * 2] = pos.getX(i);
        local[i * 2 + 1] = pos.getY(i);
      }
      g.setAttribute('aLocal', new THREE.BufferAttribute(local, 2));
      if (side < 0) g.rotateY(Math.PI);
      g.translate(0, 0, side * (part === 0 ? face : 0.02));
      g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(pos.count).fill(part), 1));
      parts.push(g);
    }
  }
  const textGeo = mergeSimple(parts);
  const uniforms = {
    uAtlas: { value: atlas.tex },
    uAtlasSize: { value: new THREE.Vector2(ATLAS_W, atlas.height) },
    uRow: { value: 0 },
    uTyped: { value: 0 },
    uGhost: { value: 0 },
    uScroll: { value: 0 },
    uCaret: { value: 1 },
    uDrop: { value: 0 },
    uRows: { value: new THREE.Vector4(0, 1, 2, 3) },
    uGlow: { value: 0 },
    uPrefix: { value: atlas.widths[0]?.[prefix.length] ?? 0 },
  };
  const textMat = mat.shader({
    vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false,
    side: THREE.FrontSide,
  });
  const textMesh = new THREE.Mesh(textGeo, textMat);
  textMesh.renderOrder = 2;
  textMesh.frustumCulled = true;
  group.add(textMesh);

  const machine = { index: 0, phase: 'type', typed: 0, ghost: 0, t: 0, rate: PREFIX_SPEED, eraseTo: 0 };

  function widthsOf(i) {
    return atlas.widths[i] || [0];
  }

  function step(dt) {
    const m = machine;
    const line = lines[m.index];
    const w = widthsOf(m.index);
    m.t += dt;
    if (m.phase === 'type') {
      m.typed = Math.min(prefix.length, m.typed + dt * m.rate * (0.7 + 0.6 * Math.abs(Math.sin(m.t * 7.3))));
      m.ghost = m.typed;
      if (m.typed >= prefix.length) {
        m.phase = line.length > prefix.length ? 'suggest' : 'hold';
        m.t = 0;
      }
    } else if (m.phase === 'suggest') {
      m.ghost = Math.min(line.length, prefix.length + m.t * 60);
      if (m.t > 1.3) {
        m.phase = 'accept';
        m.t = 0;
      }
    } else if (m.phase === 'accept') {
      m.typed = Math.min(line.length, m.typed + dt * 34);
      m.ghost = line.length;
      if (m.typed >= line.length) {
        m.phase = 'hold';
        m.t = 0;
      }
    } else if (m.phase === 'hold') {
      m.ghost = m.typed;
      if (m.t > 2.1) {
        m.phase = 'erase';
        m.t = 0;
        m.eraseTo = m.index % 4 === 3 ? 0 : prefix.length;
      }
    } else if (m.phase === 'erase') {
      m.typed = Math.max(m.eraseTo, m.typed - dt * 26);
      m.ghost = m.typed;
      if (m.typed <= m.eraseTo) {
        m.index = (m.index + 1) % lines.length;
        m.phase = m.typed < prefix.length ? 'type' : (lines[m.index].length > prefix.length ? 'suggest' : 'hold');
        m.t = 0;
      }
    }
    const n = Math.floor(m.typed);
    const typedPx = w[Math.min(n, w.length - 1)];
    const ghostPx = w[Math.min(Math.ceil(m.ghost), w.length - 1)];
    const field = (FIELD[1] - FIELD[0]) / PX;
    const scroll = Math.max(0, typedPx - field + 70);
    uniforms.uScroll.value += (scroll - uniforms.uScroll.value) * Math.min(1, dt * 10);
    uniforms.uRow.value = m.index;
    uniforms.uTyped.value = m.typed >= line.length ? w[w.length - 1] + 1 : typedPx;
    uniforms.uGhost.value = Math.max(ghostPx, typedPx) + (m.ghost >= line.length ? 40 : 0);
    const dropping = m.phase === 'suggest' || m.phase === 'accept' || (m.phase === 'type' && m.typed > 8);
    uniforms.uDrop.value += ((dropping ? 1 : 0) - uniforms.uDrop.value) * Math.min(1, dt * (dropping ? 6 : 4));
    const blinking = m.phase === 'hold' || m.phase === 'suggest';
    uniforms.uCaret.value = blinking ? (Math.sin(m.t * Math.PI * 2 * 0.9) > -0.1 ? 1 : 0) : 1;
    const r = uniforms.uRows.value;
    r.set(m.index, (m.index + 1) % lines.length, (m.index + 2) % lines.length, (m.index + 3) % lines.length);
  }

  return {
    group,
    body,
    bodyMat,
    uniforms,
    lines,
    machine,
    update(dt, night) {
      step(Math.min(dt, 0.1));
      uniforms.uGlow.value = night;
      bodyMat.emissiveIntensity = 0.03 + 0.42 * night;
    },
  };
}

function commonPrefix(lines) {
  let p = lines[0] || '';
  for (const l of lines) while (!l.startsWith(p)) p = p.slice(0, -1);
  return p;
}

function mergeSimple(geos) {
  let vCount = 0;
  let iCount = 0;
  for (const g of geos) {
    vCount += g.attributes.position.count;
    iCount += g.index.count;
  }
  const pos = new Float32Array(vCount * 3);
  const part = new Float32Array(vCount);
  const local = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    part.set(g.attributes.aPart.array, vo);
    local.set(g.attributes.aLocal.array, vo * 2);
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
    vo += g.attributes.position.count;
    io += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  out.setAttribute('aLocal', new THREE.BufferAttribute(local, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
