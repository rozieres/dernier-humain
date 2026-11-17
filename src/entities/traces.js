import * as THREE from 'three';
import { sharedUniforms } from '../core/glsl.js';
import { createAtlas } from './actors/atlas.js';
import { lanternGeometry, createTraceMaterials } from './actors/trace-gfx.js';

const CAPACITY = 24;
const GLYPHS_PER_TRACE = 12;
const FLOAT_HEIGHT = 1.3;

function excerpt(doc) {
  const first = String(doc.body?.[0] || doc.title || '');
  const words = first.split(/\s+/);
  let out = '';
  for (const w of words) {
    if ((out + ' ' + w).length > 70) return `${out}…`;
    out = out ? `${out} ${w}` : w;
  }
  return out;
}

export default async function create(ctx) {
  const { scene, state, events } = ctx;
  const atlas = createAtlas(ctx, { cols: 4, rows: 6, cellW: 512, cellH: 224 });
  const mats = createTraceMaterials(ctx, atlas.texture);
  const total = Object.keys(ctx.texts.TRACES || {}).length;

  const rects = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
  const infos = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
  infos.setUsage(THREE.DynamicDrawUsage);

  const lanternGeo = lanternGeometry();
  lanternGeo.setAttribute('aRect', rects);
  lanternGeo.setAttribute('aInfo', infos);
  const lanterns = new THREE.InstancedMesh(lanternGeo, mats.lantern, CAPACITY);
  lanterns.name = 'traces:lanterns';
  lanterns.count = 0;

  const haloGeo = new THREE.PlaneGeometry(2, 2);
  haloGeo.setAttribute('aInfo', infos);
  const halos = new THREE.InstancedMesh(haloGeo, mats.halo, CAPACITY);
  halos.name = 'traces:halos';
  halos.count = 0;
  halos.frustumCulled = false;
  halos.renderOrder = 4;

  const nGlyphs = CAPACITY * GLYPHS_PER_TRACE;
  const glyphGeo = new THREE.BufferGeometry();
  glyphGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nGlyphs * 3), 3));
  const glyphCenter = new THREE.BufferAttribute(new Float32Array(nGlyphs * 3), 3);
  const glyphSeed = new THREE.BufferAttribute(new Float32Array(nGlyphs * 4), 4);
  const glyphActive = new THREE.BufferAttribute(new Float32Array(nGlyphs), 1);
  glyphGeo.setAttribute('aCenter', glyphCenter);
  glyphGeo.setAttribute('aSeed', glyphSeed);
  glyphGeo.setAttribute('aActive', glyphActive);
  glyphGeo.setDrawRange(0, 0);
  const glyphs = new THREE.Points(glyphGeo, mats.glyphs);
  glyphs.name = 'traces:glyphs';
  glyphs.frustumCulled = false;
  glyphs.renderOrder = 5;

  scene.add(lanterns, halos, glyphs);

  const list = [];
  const byId = new Map();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const size = new THREE.Vector2();
  let animating = 0;

  function writeInfo(t) {
    infos.setXYZW(t.index, t.seed, t.read, t.flare, 0);
    infos.needsUpdate = true;
  }

  function writeGlyphs(t) {
    const v = t.found ? 0.12 : 1;
    for (let k = 0; k < GLYPHS_PER_TRACE; k++) glyphActive.setX(t.index * GLYPHS_PER_TRACE + k, v);
    glyphActive.needsUpdate = true;
  }

  function markFound(t) {
    if (t.found) return;
    t.found = true;
    state.addTrace(t.id);
    t.scan?.remove?.();
    t.scan = null;
    t.flare = 1;
    animating = 2.5;
    writeGlyphs(t);
    const found = traces.found;
    events.emit('trace:found', { id: t.id, found, total });
    ctx.ui.toast(`Trace humaine ${found}/${total}`, { icon: 'trace' });
    ctx.particles.burst({
      position: t.position, count: 36, color: '#ffb454', color2: '#ffe2b0', shape: 'glyph',
      speed: [0.6, 2.2], spread: 1, life: [1, 2.4], size: [0.06, 0.14], gravity: 0.6, drag: 0.8,
    });
  }

  async function read(t) {
    if (t.reading) return;
    t.reading = true;
    try {
      await ctx.ui.reader.open(t.doc);
    } finally {
      t.reading = false;
    }
    markFound(t);
  }

  const traces = {
    total,
    get found() {
      return state.traces.size;
    },
    get(id) {
      return byId.get(id) || null;
    },

    add({ id, position }) {
      const doc = ctx.texts.TRACES?.[id];
      if (!doc) throw new Error(`[traces] unknown trace "${id}"`);
      if (byId.has(id)) throw new Error(`[traces] trace "${id}" added twice`);
      if (list.length >= CAPACITY) throw new Error('[traces] capacity reached');
      const index = list.length;
      const p = Array.isArray(position) ? new THREE.Vector3().fromArray(position) : new THREE.Vector3().copy(position);
      p.y += FLOAT_HEIGHT;
      const found = state.traces.has(id);
      const t = {
        id, doc, index, position: p, found, read: found ? 1 : 0, flare: 0, reading: false,
        seed: (ctx.rng.hash(id) % 1000) / 1000, scan: null, signal: null, light: null, interact: null,
      };
      list.push(t);
      byId.set(id, t);

      atlas.draw(index, { style: 'human', body: excerpt(doc), author: doc.author || undefined, seed: ctx.rng.hash(id), fontSize: 40 });
      const r = atlas.rect(index);
      rects.setXYZW(index, r.x, r.y, r.z, r.w);
      rects.needsUpdate = true;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.seed * Math.PI * 2);
      m4.compose(p, q, one);
      lanterns.setMatrixAt(index, m4);
      halos.setMatrixAt(index, m4);
      lanterns.count = halos.count = list.length;
      lanterns.instanceMatrix.needsUpdate = true;
      halos.instanceMatrix.needsUpdate = true;
      lanterns.computeBoundingSphere();
      writeInfo(t);

      const rand = ctx.rng.seeded(`glyphs:${id}`);
      for (let k = 0; k < GLYPHS_PER_TRACE; k++) {
        const g = index * GLYPHS_PER_TRACE + k;
        glyphCenter.setXYZ(g, p.x, p.y, p.z);
        glyphSeed.setXYZW(g, (k + rand()) / GLYPHS_PER_TRACE, rand(), 0.6 + rand() * 0.8, 0.16 + rand() * 0.12);
      }
      glyphCenter.needsUpdate = true;
      glyphSeed.needsUpdate = true;
      writeGlyphs(t);
      glyphGeo.setDrawRange(0, list.length * GLYPHS_PER_TRACE);

      if (!found) t.scan = ctx.scanner.register({ position: p, kind: 'human', label: 'Trace humaine' });
      t.signal = ctx.scanner.addSignal({ position: p, active: () => !t.found, strength: 1 });
      t.light = ctx.env.lights.add({ position: p.clone(), color: '#ffb454', intensity: 0, distance: 7, flicker: 0.15 });
      t.interact = ctx.interact.add({ id: `trace:${id}`, position: p, radius: 3, label: 'Lire', onInteract: () => read(t) });

      return {
        id, position: p,
        get found() {
          return t.found;
        },
        read: () => read(t),
        remove() {
          t.scan?.remove?.();
          t.signal?.remove?.();
          t.light?.remove?.();
          t.interact?.remove();
        },
      };
    },

    markFound(id) {
      const t = byId.get(id);
      if (t) markFound(t);
    },

    frame(dt) {
      ctx.renderer.getDrawingBufferSize(size);
      const fov = THREE.MathUtils.degToRad(ctx.camera.fov);
      mats.glyphs.uniforms.uScale.value = size.y / (2 * Math.tan(fov / 2));
      const night = sharedUniforms.uNight.value;
      if (animating > 0) {
        animating -= dt;
        for (const t of list) {
          const goal = t.found ? 1 : 0;
          if (t.read === goal && t.flare === 0) continue;
          t.read += Math.sign(goal - t.read) * Math.min(Math.abs(goal - t.read), dt / 1.6);
          t.flare = Math.max(0, t.flare - dt / 1.2);
          writeInfo(t);
        }
      }
      for (const t of list) {
        if (t.light) t.light.intensity = (0.06 + night * 0.4) * (t.found ? 0.35 : 1) + t.flare * 3;
      }
    },
  };
  return traces;
}
