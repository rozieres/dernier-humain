import * as THREE from 'three';
import { sharedUniforms } from '../core/glsl.js';
import { createAtlas } from './particles/atlas.js';
import { PARTICLE_VERTEX, PARTICLE_FRAGMENT } from './particles/shaders.js';

const STRIDE = 24;
const CAPACITY = 16384;
const SHAPES = {
  dot: { id: 0, sizeEnd: 0.6, turbulence: 0, wind: 0.25, spin: 0, additive: true },
  spark: { id: 1, sizeEnd: 0.5, turbulence: 0, wind: 0, spin: 0, additive: true },
  glyph: { id: 2, sizeEnd: 1.2, turbulence: 0.45, wind: 0.35, spin: 0, additive: true },
  leaf: { id: 3, sizeEnd: 1, turbulence: 0.8, wind: 1, spin: 2.4, additive: false },
  paper: { id: 4, sizeEnd: 1, turbulence: 0.9, wind: 0.9, spin: 1.8, additive: false },
  ember: { id: 5, sizeEnd: 0.25, turbulence: 0.7, wind: 0.6, spin: 0, additive: true },
};
const DEFAULT_COLOR = { dot: '#ffffff', spark: '#ffd28a', glyph: '#ffb454', leaf: '#7f9a3a', paper: '#f3e9d2', ember: '#ff9a3c' };
const DEFAULT_COLOR2 = { ember: '#7a1e08' };

function range(v, fallback) {
  if (v === undefined || v === null) return fallback;
  return typeof v === 'number' ? [v, v] : v;
}

function setColor(target, v, intensity = 1) {
  if (Array.isArray(v)) target.setRGB(v[0], v[1], v[2]);
  else target.set(v);
  return target.multiplyScalar(intensity);
}

function createPool(ctx, additive, atlas) {
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const data = new Float32Array(CAPACITY * STRIDE);
  const buffer = new THREE.InstancedInterleavedBuffer(data, STRIDE);
  buffer.setUsage(THREE.DynamicDrawUsage);
  ['iA', 'iB', 'iC', 'iD', 'iE', 'iF'].forEach((name, i) => {
    quad.setAttribute(name, new THREE.InterleavedBufferAttribute(buffer, 4, i * 4));
  });
  for (let i = 0; i < CAPACITY; i++) data[i * STRIDE + 7] = -1;
  quad.instanceCount = 0;
  const material = ctx.mat.shader({
    vertexShader: PARTICLE_VERTEX,
    fragmentShader: PARTICLE_FRAGMENT,
    uniforms: { uAtlas: { value: atlas } },
    defines: additive ? {} : { PARTICLE_LIT: '' },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(quad, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = additive ? 20 : 19;
  mesh.name = additive ? 'particles:additive' : 'particles:alpha';
  ctx.scene.add(mesh);
  return { mesh, data, buffer, geometry: quad, head: 0, used: 0, dirtyStart: -1, dirtyEnd: -1, dirtyCount: 0 };
}

export default async function create(ctx) {
  const { camera, quality } = ctx;
  await ctx.text.ready;
  const atlas = createAtlas({ font: ctx.text.FONTS?.hand || 'Caveat' });
  const pools = { add: createPool(ctx, true, atlas), alpha: createPool(ctx, false, atlas) };
  const emitters = [];

  const cA = new THREE.Color();
  const cB = new THREE.Color();
  const dir = new THREE.Vector3();
  const rnd = new THREE.Vector3();
  const origin = new THREE.Vector3();

  function flush(pool) {
    if (pool.dirtyStart < 0) return;
    const s = pool.dirtyStart;
    const e = pool.dirtyEnd;
    if (pool.dirtyCount >= CAPACITY) pool.buffer.addUpdateRange(0, CAPACITY * STRIDE);
    else if (e >= s) pool.buffer.addUpdateRange(s * STRIDE, (e - s + 1) * STRIDE);
    else {
      pool.buffer.addUpdateRange(s * STRIDE, (CAPACITY - s) * STRIDE);
      pool.buffer.addUpdateRange(0, (e + 1) * STRIDE);
    }
    pool.buffer.needsUpdate = true;
    pool.dirtyStart = -1;
    pool.dirtyCount = 0;
  }

  function randomUnit(v) {
    const z = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    return v.set(r * Math.cos(a), z, r * Math.sin(a));
  }

  function spawn(o, shape, pool, count, basePos, timeJitter) {
    const now = sharedUniforms.uTime.value;
    const speed = range(o.speed, [1, 3]);
    const life = range(o.life, [0.5, 1.5]);
    const size = range(o.size, [0.05, 0.15]);
    const spread = o.spread ?? 1;
    const radius = o.radius ?? 0;
    const gravity = o.gravity ?? -2;
    const drag = o.drag ?? 0.5;
    const sizeEnd = o.sizeEnd ?? shape.sizeEnd;
    const turbulence = o.turbulence ?? shape.turbulence;
    const wind = o.wind ?? shape.wind;
    const opacity = o.opacity ?? 1;
    const spin = o.spin ?? shape.spin;
    const hasDir = Boolean(o.direction);
    const data = pool.data;
    for (let n = 0; n < count; n++) {
      const i = pool.head;
      pool.head = (pool.head + 1) % CAPACITY;
      pool.used = Math.min(CAPACITY, pool.used + 1);
      if (pool.dirtyStart < 0) pool.dirtyStart = i;
      pool.dirtyEnd = i;
      pool.dirtyCount++;
      if (hasDir) {
        if (Array.isArray(o.direction)) dir.fromArray(o.direction);
        else dir.copy(o.direction);
        dir.normalize().addScaledVector(randomUnit(rnd), spread).normalize();
      } else randomUnit(dir);
      const sp = speed[0] + (speed[1] - speed[0]) * Math.random();
      const b = i * STRIDE;
      if (radius > 0) randomUnit(rnd).multiplyScalar(radius * Math.cbrt(Math.random()));
      else rnd.set(0, 0, 0);
      data[b] = basePos.x + rnd.x;
      data[b + 1] = basePos.y + rnd.y;
      data[b + 2] = basePos.z + rnd.z;
      data[b + 3] = now - Math.random() * timeJitter;
      data[b + 4] = dir.x * sp;
      data[b + 5] = dir.y * sp;
      data[b + 6] = dir.z * sp;
      data[b + 7] = life[0] + (life[1] - life[0]) * Math.random();
      data[b + 8] = size[0] + (size[1] - size[0]) * Math.random();
      data[b + 9] = sizeEnd;
      data[b + 10] = gravity;
      data[b + 11] = drag;
      data[b + 12] = cA.r;
      data[b + 13] = cA.g;
      data[b + 14] = cA.b;
      data[b + 15] = Math.random();
      data[b + 16] = cB.r;
      data[b + 17] = cB.g;
      data[b + 18] = cB.b;
      data[b + 19] = shape.id;
      data[b + 20] = turbulence;
      data[b + 21] = wind;
      data[b + 22] = opacity;
      data[b + 23] = spin * (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.8);
    }
    pool.geometry.instanceCount = pool.used;
  }

  function resolve(o) {
    const name = SHAPES[o.shape] ? o.shape : 'dot';
    const shape = SHAPES[name];
    const additive = o.additive ?? shape.additive;
    return { name, shape, pool: additive ? pools.add : pools.alpha };
  }

  function loadColors(o, name, target1 = cA, target2 = cB) {
    const intensity = o.intensity ?? 1;
    setColor(target1, o.color ?? DEFAULT_COLOR[name], intensity);
    const c2 = o.color2 ?? DEFAULT_COLOR2[name];
    if (c2 !== undefined) setColor(target2, c2, intensity);
    else target2.copy(target1);
  }

  function readPosition(p, target) {
    if (Array.isArray(p)) return target.fromArray(p);
    return target.copy(p);
  }

  const api = {
    SHAPES: Object.keys(SHAPES),
    get alive() { return pools.add.used + pools.alpha.used; },

    burst(o = {}) {
      const { name, shape, pool } = resolve(o);
      const count = Math.max(1, Math.round((o.count ?? 20) * (quality.particles ?? 1)));
      loadColors(o, name);
      readPosition(o.position ?? [0, 0, 0], origin);
      spawn(o, shape, pool, count, origin, 0);
    },

    emitter(o = {}) {
      const { name, shape, pool } = resolve(o);
      const c1 = new THREE.Color();
      const c2 = new THREE.Color();
      loadColors(o, name, c1, c2);
      const position = o.position && o.position.isVector3 ? o.position : readPosition(o.position ?? [0, 0, 0], new THREE.Vector3());
      const handle = {
        rate: o.rate ?? 10,
        enabled: true,
        position,
        cullDistance: o.cullDistance ?? 140,
        options: { ...o, speed: range(o.speed, [1, 3]), life: range(o.life, [0.5, 1.5]), size: range(o.size, [0.05, 0.15]) },
        stop() {
          const i = emitters.indexOf(entry);
          if (i >= 0) emitters.splice(i, 1);
        },
      };
      const entry = { handle, shape, pool, c1, c2, acc: 0 };
      emitters.push(entry);
      return handle;
    },

    clear() {
      for (const pool of Object.values(pools)) {
        for (let i = 0; i < CAPACITY; i++) pool.data[i * STRIDE + 7] = -1;
        pool.buffer.addUpdateRange(0, CAPACITY * STRIDE);
        pool.buffer.needsUpdate = true;
        pool.used = 0;
        pool.head = 0;
        pool.geometry.instanceCount = 0;
      }
    },

    frame(dt) {
      const scale = quality.particles ?? 1;
      for (let k = 0; k < emitters.length; k++) {
        const e = emitters[k];
        const h = e.handle;
        if (!h.enabled || h.rate <= 0) {
          e.acc = 0;
          continue;
        }
        const far = h.position.distanceToSquared(camera.position) > h.cullDistance * h.cullDistance;
        if (far) {
          e.acc = 0;
          continue;
        }
        e.acc += h.rate * scale * dt;
        const n = Math.floor(e.acc);
        if (n <= 0) continue;
        e.acc -= n;
        cA.copy(e.c1);
        cB.copy(e.c2);
        spawn(h.options, e.shape, e.pool, Math.min(n, 512), h.position, dt);
      }
      flush(pools.add);
      flush(pools.alpha);
    },

    dispose() {
      for (const pool of Object.values(pools)) {
        ctx.scene.remove(pool.mesh);
        pool.geometry.dispose();
        pool.mesh.material.dispose();
      }
      atlas.dispose();
      emitters.length = 0;
    },
  };
  return api;
}
