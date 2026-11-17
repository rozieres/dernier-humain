import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLSL } from '../../core/glsl.js';

export const PLAZA_R = 24;
export const FLOOR = 0.04;
export const DAIS = { r: 3.1, h: 0.32 };
export const ARCH = { z: 10.4, half: 4.8, leg: 4.4, tube: 0.3 };
const GATE_ANGLES = [-Math.PI / 2, 0, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, Math.PI];
const RINGS = [2.75, 3.75, 7.5, 12, 16.4, 20.6, 23.3];

const INLAY_PARS = /* glsl */ `
uniform float uInlay;
uniform float uWest;
float hubHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hubLine(float d, float w) {
  float fw = max(fwidth(d), 1e-4);
  return clamp(1.0 - (d - w) / fw, 0.0, 1.0);
}
`;

const INLAY_BODY = /* glsl */ `
{
  vec2 q = vDhWorldPos.xz;
  float r = length(q);
  float ang = atan(q.y, q.x);
  float lines = 0.0;
  ${RINGS.map((v) => `lines = max(lines, hubLine(abs(r - ${v.toFixed(2)}), 0.035));`).join('\n  ')}
  float west = 0.0;
  ${GATE_ANGLES.map((a, i) => `{
    float da = ang - ${a.toFixed(5)};
    float d = r * abs(sin(da));
    float on = step(0.0, cos(da)) * step(7.5, r) * step(r, 23.3);
    ${i === 5 ? 'west = hubLine(d, 0.03) * on;' : 'lines = max(lines, hubLine(d, 0.03) * on);'}
  }`).join('\n  ')}
  float band = floor(r / 1.85);
  float rm = (band + 0.5) * 1.85;
  float n = max(6.0, floor(6.2831 * rm / 1.7));
  float a01 = ang / 6.2831 + 0.5 + band * 0.137;
  float cell = floor(a01 * n);
  float seamR = abs(fract(r / 1.85 + 0.5) - 0.5) * 1.85;
  float seamA = abs(fract(a01 * n + 0.5) - 0.5) * 6.2831 * r / n;
  float seam = max(hubLine(seamR, 0.008), hubLine(seamA, 0.008)) * step(3.3, r);
  float tone = 0.965 + 0.05 * hubHash(vec2(band, cell));
  diffuseColor.rgb *= tone * (1.0 - 0.16 * seam) * (1.0 - 0.6 * lines);
  vec3 cyan = vec3(0.107, 0.753, 0.79);
  vec3 dead = vec3(1.0, 0.07, 0.045);
  vec3 alive = vec3(0.027, 0.2, 1.0);
  float flick = 0.55 + 0.45 * step(0.0, sin(uTime * 17.0 + r * 0.7));
  vec3 westCol = mix(dead * 0.35 * flick, mix(alive, cyan, 0.5), uWest);
  totalEmissiveRadiance += cyan * lines * uInlay + westCol * west * uInlay;
}
`;

function floorGeometry() {
  const y = FLOOR;
  const pts = [
    [0, DAIS.h], [DAIS.r - 0.25, DAIS.h], [DAIS.r - 0.08, DAIS.h - 0.03], [DAIS.r, DAIS.h - 0.12],
    [DAIS.r + 0.04, y + 0.02], [DAIS.r + 0.1, y], [PLAZA_R - 0.35, y], [PLAZA_R - 0.12, y - 0.01],
    [PLAZA_R, y - 0.05], [PLAZA_R + 0.1, y - 0.14], [PLAZA_R + 0.18, -0.3],
  ];
  const g = new THREE.LatheGeometry(pts.reverse().map(([r, h]) => new THREE.Vector2(r, h)), 180);
  return g;
}

function archCurve() {
  const { half, leg } = ARCH;
  const path = new THREE.CurvePath();
  path.add(new THREE.LineCurve3(new THREE.Vector3(-half, -0.3, 0), new THREE.Vector3(-half, leg, 0)));
  const arc = new THREE.EllipseCurve(0, leg, half, half * 0.92, Math.PI, 0, true);
  const arc3 = new THREE.CatmullRomCurve3(arc.getPoints(48).map((p) => new THREE.Vector3(p.x, p.y, 0)));
  path.add(arc3);
  path.add(new THREE.LineCurve3(new THREE.Vector3(half, leg, 0), new THREE.Vector3(half, -0.3, 0)));
  return path;
}

function benchGeometry() {
  const parts = [];
  const color = (g, c) => {
    const col = new THREE.Color(c);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  };
  const slab = (w, h, d, r) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -d / 2);
    s.lineTo(w / 2 - r, -d / 2);
    s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
    s.lineTo(w / 2, d / 2 - r);
    s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
    s.lineTo(-w / 2 + r, d / 2);
    s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
    s.lineTo(-w / 2, -d / 2 + r);
    s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 6 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -h / 2, 0);
    return g;
  };
  const seat = slab(1.9, 0.06, 0.46, 0.08);
  seat.translate(0, 0.46, 0);
  parts.push(color(seat, '#eef0f5'));
  const back = slab(1.9, 0.05, 0.34, 0.08);
  back.rotateX(Math.PI / 2 - 0.22);
  back.translate(0, 0.8, -0.24);
  parts.push(color(back, '#eef0f5'));
  for (const x of [-0.72, 0.72]) {
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 0.0, 0.2), new THREE.Vector3(x, 0.42, 0.16), new THREE.Vector3(x, 0.44, -0.12),
      new THREE.Vector3(x, 0.66, -0.24), new THREE.Vector3(x, 0.98, -0.31),
    ]);
    parts.push(color(new THREE.TubeGeometry(c, 20, 0.028, 8), '#9aa3b4'));
    const foot = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 0.0, -0.22), new THREE.Vector3(x, 0.24, -0.12), new THREE.Vector3(x, 0.43, -0.02)]);
    parts.push(color(new THREE.TubeGeometry(foot, 10, 0.026, 8), '#9aa3b4'));
  }
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
}

function topiaryGeometry() {
  const g = mergeVertices(new THREE.IcosahedronGeometry(0.6, 3).deleteAttribute('normal').deleteAttribute('uv'));
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + 0.018 * Math.sin(v.x * 23 + v.y * 17) * Math.sin(v.z * 19 - v.y * 11);
    v.multiplyScalar(k);
    v.y *= 0.96;
    pos.setXYZ(i, v.x, v.y + 1.12, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function leafy(shader) {
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${GLSL.noise}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec3 lp = vDhWorldPos * 9.0;
    float n = vnoise(lp) * 0.6 + vnoise(lp * 2.7) * 0.4;
    diffuseColor.rgb *= 0.78 + 0.34 * clamp(n * 0.5 + 0.5, 0.0, 1.0);
  }`);
}

function potGeometry() {
  const pts = [[0, 0], [0.3, 0], [0.33, 0.02], [0.36, 0.42], [0.4, 0.46], [0.41, 0.52], [0.36, 0.53], [0.3, 0.5], [0, 0.5]];
  return new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), 28);
}

function postGeometry() {
  const pts = [[0, 0], [0.16, 0], [0.17, 0.04], [0.11, 0.12], [0.07, 0.5], [0.045, 4.0], [0.06, 4.05], [0, 4.06]];
  return new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), 16);
}

function headGeometry() {
  const g = new THREE.CapsuleGeometry(0.12, 0.42, 6, 14);
  g.translate(0, 4.36, 0);
  return g;
}

function bannerTexture(ctx, tagline) {
  const W = 1024;
  const H = 160;
  const canvas = ctx.text.canvas({
    width: W,
    height: H,
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#eef2f8');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#5ce1e6';
      c.fillRect(0, H - 8, W, 8);
      c.fillStyle = '#1b2030';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      let size = 74;
      c.font = `600 ${size}px Inter`;
      while (c.measureText(tagline).width > W - 90 && size > 30) {
        size -= 2;
        c.font = `600 ${size}px Inter`;
      }
      c.fillText(tagline, W / 2, H / 2 - 2);
    },
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const MAST_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec3 base = (modelMatrix * vec4(0.0, position.y, 0.0, 1.0)).xyz;
  vec3 toCam = cameraPosition - base;
  toCam.y = 0.0;
  float d = length(toCam);
  vec3 side = d > 1e-3 ? normalize(vec3(toCam.z, 0.0, -toCam.x)) : vec3(1.0, 0.0, 0.0);
  float width = max(2.6, d * 0.008);
  vec3 w = base + side * position.x * width;
  vWorld = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

const MAST_FRAG = /* glsl */ `
uniform float uPower;
uniform vec3 uColor;
varying vec2 vUv;
varying vec3 vWorld;
${GLSL.envPars}
${GLSL.fog}
void main() {
  float x = abs(vUv.x - 0.5) * 2.0;
  float core = exp(-x * x * 40.0);
  float halo = exp(-x * x * 5.0) * 0.35;
  float h = vUv.y;
  float fade = pow(clamp(1.0 - h, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.06, h);
  float pulse = 0.75 + 0.25 * sin(h * 60.0 - uTime * 2.2);
  float k = (core + halo) * fade * pulse * uPower * (1.0 + clamp(length(cameraPosition.xz) / 500.0, 0.0, 2.0));
  vec3 col = uColor * k;
  gl_FragColor = vec4(applyFogAdditive(col, vWorld) + col * 0.35 * fogFactor(vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function buildPlaza(ctx, { y0, rand, colliders }) {
  const { mat, physics } = ctx;
  const near = new THREE.Group();
  near.name = 'hub:near';
  const far = new THREE.Group();
  far.name = 'hub:far';

  const inlayUniforms = { uInlay: { value: 1 }, uWest: { value: 0 } };
  const floorMat = mat.standard({ color: '#eceef3', roughness: 0.62, metalness: 0 }, {
    onShader(shader) {
      Object.assign(shader.uniforms, inlayUniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${INLAY_PARS}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${INLAY_BODY}`);
    },
  });
  const floor = new THREE.Mesh(floorGeometry(), floorMat);
  floor.position.set(0, y0, 0);
  floor.receiveShadow = true;
  floor.name = 'hub:floor';
  far.add(floor);
  colliders.push(physics.addStaticCylinder({ position: [0, y0 + FLOOR - 0.3, 0], radius: PLAZA_R, height: 0.6, userData: { surface: 'stone' } }));
  colliders.push(physics.addStaticCylinder({ position: [0, y0 + DAIS.h - 0.3, 0], radius: DAIS.r, height: 0.6, userData: { surface: 'stone' } }));

  const white = mat.physical({ color: '#f4f6fb', roughness: 0.22, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.12 });
  const archGeo = new THREE.TubeGeometry(archCurve(), 160, ARCH.tube, 20, false);
  const inner = new THREE.TubeGeometry(archCurve(), 160, 0.045, 8, false);
  const arch = new THREE.Mesh(archGeo, white);
  arch.position.set(0, y0, ARCH.z);
  arch.castShadow = true;
  arch.receiveShadow = true;
  far.add(arch);
  const archGlowMat = mat.glow('#5ce1e6', 1);
  inner.scale(1 - 0.012, 1 - 0.006, 1);
  const archGlow = new THREE.Mesh(mergeGeometries([-1, 1].map((side) => inner.clone().translate(0, 0, side * (ARCH.tube - 0.02)))), archGlowMat);
  archGlow.position.set(0, y0, ARCH.z);
  near.add(archGlow);
  for (const x of [-ARCH.half, ARCH.half]) {
    colliders.push(physics.addStaticCylinder({ position: [x, y0 + 2.5, ARCH.z], radius: ARCH.tube + 0.05, height: 5, userData: { surface: 'metal' } }));
  }

  const tagline = (ctx.has('texts') && ctx.texts.ZONES?.hub?.tagline) || 'Bienvenue. Bienvenue. Bienvenue.';
  const bannerMap = bannerTexture(ctx, tagline);
  const bannerMat = mat.standard({ map: bannerMap, emissive: '#ffffff', emissiveMap: bannerMap, emissiveIntensity: 0.1, roughness: 0.4, metalness: 0 });
  const bw = ARCH.half * 2 - 1.1;
  const bh = bw * (160 / 1024);
  const bannerBody = new THREE.Mesh(mergeGeometries([
    new THREE.BoxGeometry(bw + 0.1, bh + 0.1, 0.12),
    ...[-1, 1].map((s) => new THREE.CylinderGeometry(0.018, 0.018, 1.2, 6).translate(s * (bw / 2 - 0.4), 0.6 + bh / 2, 0)),
  ].map((g) => g.toNonIndexed())), white);
  bannerBody.position.set(0, y0 + ARCH.leg + 0.55, ARCH.z);
  bannerBody.castShadow = true;
  near.add(bannerBody);
  const bannerGeo = mergeGeometries([
    new THREE.PlaneGeometry(bw, bh).translate(0, 0, 0.061),
    new THREE.PlaneGeometry(bw, bh).rotateY(Math.PI).translate(0, 0, -0.061),
  ]);
  const banner = new THREE.Mesh(bannerGeo, bannerMat);
  banner.position.copy(bannerBody.position);
  near.add(banner);

  const benchGeo = benchGeometry();
  const benchMat = mat.physical({ vertexColors: true, roughness: 0.3, metalness: 0.1, clearcoat: 0.5 });
  const benchAngles = [-112, -68, -22, 22, 68, 112, 158, -158].map((d) => (d * Math.PI) / 180);
  const benches = new THREE.InstancedMesh(benchGeo, benchMat, benchAngles.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s1 = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  benchAngles.forEach((a, i) => {
    const r = 17.6;
    p.set(Math.cos(a) * r, y0 + FLOOR, Math.sin(a) * r);
    const yaw = Math.atan2(-p.x, -p.z);
    q.setFromAxisAngle(UP, yaw);
    benches.setMatrixAt(i, m4.compose(p, q, s1));
    colliders.push(physics.addStaticBox({ position: [p.x, p.y + 0.45, p.z], size: [1.95, 0.9, 0.55], quaternion: q.clone(), userData: { surface: 'metal' } }));
  });
  benches.castShadow = true;
  benches.receiveShadow = true;
  near.add(benches);

  const spots = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2 + Math.PI / 24;
    const gate = GATE_ANGLES.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.2);
    const south = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.42;
    if (gate || south) continue;
    spots.push([Math.cos(a) * 21.2, Math.sin(a) * 21.2]);
  }
  for (const x of [-3.4, 3.4]) for (let z = 13; z <= 21.5; z += 2.1) spots.push([x, z]);
  const topiary = new THREE.InstancedMesh(topiaryGeometry(), mat.standard({ color: '#ffffff', roughness: 0.78, metalness: 0 }, { onShader: leafy }), spots.length);
  const pots = new THREE.InstancedMesh(potGeometry(), white, spots.length);
  const tint = new THREE.Color();
  spots.forEach(([x, z], i) => {
    p.set(x, y0 + FLOOR, z);
    q.setFromAxisAngle(UP, rand() * Math.PI * 2);
    const s = 0.96 + rand() * 0.06;
    m4.compose(p, q, new THREE.Vector3(s, s, s));
    topiary.setMatrixAt(i, m4);
    pots.setMatrixAt(i, m4);
    topiary.setColorAt(i, tint.setHSL(0.27 + rand() * 0.02, 0.48, 0.36 + rand() * 0.03));
    colliders.push(physics.addStaticCylinder({ position: [x, y0 + FLOOR + 0.85, z], radius: 0.45, height: 1.7, userData: { surface: 'stone' } }));
  });
  topiary.castShadow = true;
  topiary.receiveShadow = true;
  pots.castShadow = true;
  pots.receiveShadow = true;
  near.add(topiary, pots);

  const posts = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + Math.PI / 12;
    posts.push([Math.cos(a) * 23.0, Math.sin(a) * 23.0]);
  }
  const postMesh = new THREE.InstancedMesh(postGeometry(), white, posts.length);
  const headMat = mat.glow('#e9fbff', 1);
  const heads = new THREE.InstancedMesh(headGeometry(), headMat, posts.length);
  posts.forEach(([x, z], i) => {
    m4.compose(p.set(x, y0 + FLOOR, z), q.identity(), s1);
    postMesh.setMatrixAt(i, m4);
    heads.setMatrixAt(i, m4);
    colliders.push(physics.addStaticCylinder({ position: [x, y0 + 2.1, z], radius: 0.14, height: 4.2, userData: { surface: 'metal' } }));
  });
  postMesh.castShadow = true;
  near.add(postMesh, heads);

  const mastUniforms = { uPower: { value: 1 }, uColor: { value: new THREE.Color('#d8f6ff') } };
  const mastGeo = new THREE.PlaneGeometry(1, 1, 1, 24).translate(0, 0.5, 0);
  mastGeo.scale(1, 250, 1);
  const mast = new THREE.Mesh(mastGeo, mat.shader({
    vertexShader: MAST_VERT, fragmentShader: MAST_FRAG, uniforms: mastUniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  mast.position.set(0, y0 + 6.1, 0);
  mast.frustumCulled = false;
  mast.renderOrder = 3;
  far.add(mast);

  return {
    near,
    far,
    inlayUniforms,
    benches: benchAngles.map((a) => [Math.cos(a) * 17.6, Math.sin(a) * 17.6]),
    update(night, west) {
      inlayUniforms.uInlay.value = 1.1 + 2.1 * night;
      inlayUniforms.uWest.value = west;
      archGlowMat.color.set('#5ce1e6').multiplyScalar(1.4 + 3.2 * night);
      headMat.color.set('#e9fbff').multiplyScalar(1.1 + 2.4 * night);
      bannerMat.emissiveIntensity = 0.06 + 0.45 * night;
      mastUniforms.uPower.value = 0.9 + 1.3 * night;
    },
  };
}
