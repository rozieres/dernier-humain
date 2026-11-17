import * as THREE from 'three';

const FADE_TIME = 0.5;
const SELECT_EVERY = 3;
const byDistance = (a, b) => a._d - b._d;

export function createLightPool({ scene, camera, count }) {
  const handles = [];
  const slots = [];
  const ranked = [];
  let frame = 0;
  let clock = 0;

  function build(n) {
    for (const s of slots) {
      scene.remove(s.light);
      s.light.dispose();
      if (s.handle) s.handle._slot = -1;
    }
    slots.length = 0;
    for (let i = 0; i < n; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 2);
      light.name = `env:pool${i}`;
      light.position.set(0, -1e4, 0);
      scene.add(light);
      slots.push({ light, handle: null });
    }
  }
  build(count);

  function release(h) {
    if (h._slot < 0) return;
    const s = slots[h._slot];
    s.handle = null;
    s.light.intensity = 0;
    s.light.position.set(0, -1e4, 0);
    h._slot = -1;
  }

  function flickerFactor(h, t) {
    if (!h.flicker) return 1;
    const s = h._seed;
    const n = 0.5 + 0.25 * Math.sin(t * 11.3 + s) + 0.15 * Math.sin(t * 23.7 + s * 3.1) + 0.1 * Math.sin(t * 5.1 + s * 7.7);
    const dip = Math.max(0, Math.sin(t * 1.7 + s * 5.3) - 0.93) * 8;
    return Math.max(0, 1 - h.flicker * (0.55 * (1 - n) + dip));
  }

  const pool = {
    get size() {
      return slots.length;
    },
    get count() {
      return handles.length;
    },
    get active() {
      return slots.filter((s) => s.handle).length;
    },
    add({ position, color = '#ffb454', intensity = 1, distance = 12, flicker = 0, decay = 2 } = {}) {
      const h = {
        position: position?.isVector3 ? position : new THREE.Vector3().fromArray(position || [0, 0, 0]),
        color: new THREE.Color(color),
        intensity,
        distance,
        decay,
        flicker,
        enabled: true,
        _w: 0,
        _slot: -1,
        _want: false,
        _removed: false,
        _seed: handles.length * 12.9898 + 4.1,
        remove() {
          h._removed = true;
          h.enabled = false;
        },
      };
      handles.push(h);
      return h;
    },
    resize(n) {
      build(n);
    },
    update(dt) {
      clock += dt;
      frame++;
      const cam = camera.position;
      if (frame % SELECT_EVERY === 1) {
        ranked.length = 0;
        for (const h of handles) {
          h._want = false;
          if (!h.enabled || h.intensity <= 0) continue;
          h._d = h.position.distanceToSquared(cam);
          ranked.push(h);
        }
        ranked.sort(byDistance);
        const n = Math.min(slots.length, ranked.length);
        for (let i = 0; i < n; i++) ranked[i]._want = true;
      }
      const step = dt / FADE_TIME;
      for (let i = handles.length - 1; i >= 0; i--) {
        const h = handles[i];
        if (!h.enabled) h._want = false;
        if (h._want && h._slot < 0) {
          const free = slots.findIndex((s) => !s.handle);
          if (free >= 0) {
            slots[free].handle = h;
            h._slot = free;
          }
        }
        h._w = h._want && h._slot >= 0 ? Math.min(1, h._w + step) : Math.max(0, h._w - step);
        if (h._w <= 0 && h._slot >= 0 && !h._want) release(h);
        if (h._removed && h._slot < 0) handles.splice(i, 1);
      }
      for (const s of slots) {
        const h = s.handle;
        if (!h) continue;
        const w = h._w * h._w * (3 - 2 * h._w);
        s.light.position.copy(h.position);
        s.light.color.copy(h.color);
        s.light.distance = h.distance;
        s.light.decay = h.decay;
        s.light.intensity = h.intensity * w * flickerFactor(h, clock);
      }
    },
    dispose() {
      for (const s of slots) {
        scene.remove(s.light);
        s.light.dispose();
      }
      slots.length = 0;
      handles.length = 0;
    },
  };
  return pool;
}
