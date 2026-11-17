import * as THREE from 'three';

const CONE = Math.cos(THREE.MathUtils.degToRad(28));

export function createInteract(ctx) {
  const items = new Set();
  const eye = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const to = new THREE.Vector3();
  let shownKey = null;
  let shownLabel = null;

  const isEnabled = (h) => (typeof h.enabled === 'function' ? h.enabled() : h.enabled !== false);

  function targetOf(h, out) {
    if (h.object) return h.object.getWorldPosition(out);
    if (h.position) return out.copy(h.position);
    return null;
  }

  function show(handle) {
    const key = handle ? ctx.input.label(handle.key) : null;
    const label = handle ? handle.label : null;
    if (key === shownKey && label === shownLabel) return;
    shownKey = key;
    shownLabel = label;
    ctx.ui.prompt(key, label ?? undefined);
  }

  const interact = {
    current: null,

    add({ id, object, position, radius = 3, label = '', key = 'KeyE', enabled = true, needsLook = true, priority = 0, onInteract }) {
      const handle = {
        id, object, position, radius, label, key, enabled, needsLook, priority, onInteract,
        remove() {
          items.delete(handle);
          if (interact.current === handle) {
            interact.current = null;
            show(null);
          }
        },
      };
      items.add(handle);
      return handle;
    },

    update() {
      const playing = ctx.state.mode === 'playing';
      let best = null;
      if (playing) {
        ctx.camera.getWorldPosition(eye);
        ctx.camera.getWorldDirection(fwd);
        let bestScore = -Infinity;
        for (const h of items) {
          if (!isEnabled(h) || !targetOf(h, to)) continue;
          to.sub(eye);
          const dist = to.length();
          if (dist > h.radius) continue;
          const facing = dist > 1e-3 ? to.dot(fwd) / dist : 1;
          if (h.needsLook && facing < CONE && dist > 0.9) continue;
          const score = h.priority * 100 + facing * 4 - dist / h.radius;
          if (score > bestScore) {
            bestScore = score;
            best = h;
          }
        }
      }
      interact.current = best;
      show(best);
      if (best && ctx.input.pressed(best.key)) {
        try {
          best.onInteract?.(ctx);
        } catch (err) {
          console.error(`[interact] "${best.id}" failed`, err);
        }
      }
    },
  };
  return interact;
}
