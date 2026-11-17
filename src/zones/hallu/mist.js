import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLSL } from '../../core/glsl.js';
import { rockGeometry, heightRibbon } from './geo.js';
import { CENTER } from './layout.js';

const MIST_VERTEX = /* glsl */ `
attribute float aLayer;
varying vec3 vWorld;
varying float vLayer;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vLayer = aLayer;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const MIST_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.noise}
${GLSL.fog}
uniform vec2 uCenter;
varying vec3 vWorld;
varying float vLayer;
void main() {
  float r = length(vWorld.xz - uCenter);
  float edge = smoothstep(26.0, 36.0, r) * (1.0 - smoothstep(88.0, 99.0, r));
  vec2 p = vWorld.xz * (0.028 + vLayer * 0.006);
  float t = uTime * (0.012 + vLayer * 0.006);
  float n = fbm(p + vec2(t, -t * 0.7) + vLayer * 3.1);
  float n2 = fbm(p * 2.3 - vec2(t * 1.6, t) + 7.0);
  float dens = smoothstep(-0.35, 0.55, n * 0.75 + n2 * 0.35 + 0.15);
  float alpha = dens * edge * mix(0.62, 0.42, vLayer / 3.0);
  vec3 base = mix(uFogColor, uSkyHorizon, 0.35) * mix(1.0, 0.35, uNight);
  vec3 tintA = vec3(0.78, 0.49, 1.0);
  vec3 tintB = vec3(0.48, 0.96, 0.78);
  vec3 glow = mix(tintA, tintB, smoothstep(-0.3, 0.4, n2)) * (0.25 + 0.55 * uNight) * (0.4 + 0.6 * dens);
  vec3 col = base * (0.85 + 0.25 * n) + glow * 0.5;
  gl_FragColor = vec4(applyFog(col, vWorld), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function buildMist(ctx, { mats, near, far, rand, groundY }) {
  const layers = [];
  const heights = [10, 15.5, 21, 26.5];
  heights.forEach((h, i) => {
    const g = new THREE.RingGeometry(26, 100, 96, 8);
    g.rotateX(-Math.PI / 2);
    g.translate(CENTER[0], h, CENTER[1]);
    const n = g.attributes.position.count;
    g.setAttribute('aLayer', new THREE.Float32BufferAttribute(new Float32Array(n).fill(i), 1));
    g.deleteAttribute('uv');
    layers.push(g);
  });
  const mistMat = ctx.mat.shader({
    vertexShader: MIST_VERTEX,
    fragmentShader: MIST_FRAGMENT,
    uniforms: { uCenter: { value: new THREE.Vector2(CENTER[0], CENTER[1]) } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mist = new THREE.Mesh(mergeGeometries(layers), mistMat);
  mist.name = 'hallu:mist';
  mist.renderOrder = 2;
  near.add(mist);

  const emitters = [];
  if (ctx.has('particles')) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const pos = new THREE.Vector3(CENTER[0] + Math.cos(a) * 62, 18, CENTER[1] + Math.sin(a) * 62);
      emitters.push(ctx.particles.emitter({
        position: pos, radius: 30, rate: 3, shape: 'dot', color: '#cdb8ff', color2: '#8ff0cf', size: [1.6, 3.2], sizeEnd: 4,
        life: [7, 11], speed: [0.1, 0.35], gravity: 0.08, drag: 0.3, intensity: 0.35, opacity: 0.35, turbulence: 0.3, cullDistance: 240,
      }));
    }
  }

  const ROCKS = 26;
  const geo = rockGeometry({ seed: 21, detail: 3, scale: [1.2, 1, 1], rough: 0.32, freq: 1.3 });
  {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setY(i, y > 0 ? y * 0.32 : y * 1.35);
    }
    geo.computeVertexNormals();
    const n = pos.count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const top = pos.getY(i) > 0.05;
      c.set(top ? '#cfc6d6' : '#9a8fa6');
      c.toArray(col, i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const rocks = new THREE.InstancedMesh(geo, mats.rock, ROCKS);
  rocks.name = 'hallu:floating-rocks';
  rocks.castShadow = true;
  rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const items = [];
  for (let i = 0; i < ROCKS; i++) {
    const lowBand = i % 4 === 0;
    items.push({
      r: 36 + rand() * 54, a: rand() * Math.PI * 2, y: lowBand ? 30 + rand() * 12 : 54 + rand() * 26,
      s: 0.8 + rand() * (lowBand ? 2.0 : 3.0), w: (0.006 + rand() * 0.012) * (rand() < 0.5 ? -1 : 1),
      spin: (rand() - 0.5) * 0.08, yaw: rand() * 6.28, bob: rand() * 6.28, tilt: (rand() - 0.5) * 0.25,
    });
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  let clock = 0;
  const writeRocks = () => {
    for (let i = 0; i < ROCKS; i++) {
      const it = items[i];
      const a = it.a + clock * it.w;
      p.set(CENTER[0] + Math.cos(a) * it.r, it.y + Math.sin(clock * 0.3 + it.bob) * 0.6, CENTER[1] + Math.sin(a) * it.r);
      q.setFromEuler(e.set(it.tilt, it.yaw + clock * it.spin, it.tilt * 0.5));
      m4.compose(p, q, sc.set(it.s, it.s * 0.9, it.s));
      rocks.setMatrixAt(i, m4);
    }
    rocks.instanceMatrix.needsUpdate = true;
  };
  writeRocks();
  rocks.boundingSphere = new THREE.Sphere(new THREE.Vector3(CENTER[0], 60, CENTER[1]), 110);
  far.add(rocks);

  const dashes = [];
  const N = 70;
  for (let i = 0; i < N; i++) {
    if (rand() < 0.22) continue;
    const a0 = (i / N) * Math.PI * 2;
    const a1 = a0 + ((1 / N) * Math.PI * 2) * (0.45 + rand() * 0.45);
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const a = a0 + ((a1 - a0) * k) / 4;
      const r = 100.4 + Math.sin(a * 13) * 0.3;
      pts.push([CENTER[0] + Math.cos(a) * r, CENTER[1] + Math.sin(a) * r, k === 0 || k === 4 ? 0.3 : 1]);
    }
    dashes.push(heightRibbon(pts, 0.32, groundY, 0.06));
  }
  const lip = new THREE.Mesh(mergeGeometries(dashes), mats.glowViolet);
  lip.name = 'hallu:lip';
  far.add(lip);

  return {
    update(dt) {
      clock += dt;
      writeRocks();
    },
    setActive(on) {
      for (const em of emitters) em.enabled = on;
    },
  };
}
