import { Vector3 } from 'three';
import { h, typo } from './dom.js';

const BEHIND_HIDE_DISTANCE = 60;
const EDGE = 0.9;

export function createMarkers(layer, ctx) {
  const list = new Set();
  const view = new Vector3();
  const ndc = new Vector3();
  const camPos = new Vector3();

  function add({ position, kind = 'human', label, duration } = {}) {
    if (!position) throw new Error('ui.marker.add: position is required');
    const el = h(`div.marker.marker--${kind}`, null,
      h('div.marker-pin', null, h('span.marker-diamond'), h('span.marker-arrow')),
      h('div.marker-label', null,
        label ? h('span.marker-name', { text: typo(label) }) : null,
        h('span.marker-dist')));
    layer.append(el);
    const distEl = el.querySelector('.marker-dist');
    const entry = { el, distEl, position, life: duration ?? Infinity, age: 0, lastDist: -1, state: '' };
    list.add(entry);
    requestAnimationFrame(() => el.classList.add('is-in'));
    const handle = {
      remove() {
        if (!list.has(entry)) return;
        list.delete(entry);
        el.classList.remove('is-in');
        el.classList.add('is-out');
        setTimeout(() => el.remove(), 300);
      },
    };
    entry.handle = handle;
    return handle;
  }

  function setState(entry, state) {
    if (entry.state === state) return;
    entry.state = state;
    entry.el.dataset.state = state;
  }

  function frame(dt) {
    if (!list.size) return;
    const camera = ctx.camera;
    if (!camera) return;
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    camera.getWorldPosition(camPos);
    for (const entry of list) {
      entry.age += dt;
      if (entry.age >= entry.life) {
        entry.handle.remove();
        continue;
      }
      const p = entry.position;
      view.copy(p).applyMatrix4(camera.matrixWorldInverse);
      const dist = camPos.distanceTo(p);
      const behind = view.z > 0;
      if (behind && dist > BEHIND_HIDE_DISTANCE) {
        setState(entry, 'hidden');
        continue;
      }
      ndc.copy(p).project(camera);
      let x = ndc.x;
      let y = ndc.y;
      if (behind) {
        x = -x;
        y = -y;
      }
      const off = behind || Math.abs(x) > EDGE || Math.abs(y) > EDGE;
      let angle = 0;
      if (off) {
        const m = Math.max(Math.abs(x) / EDGE, Math.abs(y) / EDGE, 1e-6);
        if (behind && m < 1) {
          const s = 1 / Math.max(Math.abs(x), Math.abs(y), 1e-3);
          x *= s * EDGE;
          y *= s * EDGE;
        } else {
          x /= m;
          y /= m;
        }
        angle = Math.atan2(-y, x);
      }
      setState(entry, off ? 'edge' : 'on');
      const sx = (x * 0.5 + 0.5) * w;
      const sy = (-y * 0.5 + 0.5) * hgt;
      const align = sx > w - 140 ? 'right' : sx < 140 ? 'left' : 'center';
      if (entry.align !== align) {
        entry.align = align;
        entry.el.dataset.align = align;
      }
      entry.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
      if (off) entry.el.style.setProperty('--angle', `${angle.toFixed(3)}rad`);
      const d = Math.round(dist);
      if (d !== entry.lastDist) {
        entry.lastDist = d;
        entry.distEl.textContent = `${d} m`;
      }
    }
  }

  function clear() {
    for (const entry of [...list]) entry.handle.remove();
  }

  return { add, frame, clear, get count() { return list.size; } };
}
