export const HMR_STUB = `const hot = { accept() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {}, data: {} };
export const createHotContext = () => hot;
export const injectQuery = (url) => url;
export function updateStyle(id, css) {
  let el = document.querySelector(\`style[data-vite-dev-id="\${id}"]\`);
  if (!el) {
    el = document.createElement('style');
    el.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(el);
  }
  el.textContent = css;
}
export function removeStyle() {}
export class ErrorOverlay {}`;

export const PAGE_HELPERS = () => {
  const g = window.__game;
  if (window.__T) return true;
  const V = g.camera.position.constructor;
  const T = {
    events: [],
    count(type, pred = () => true) {
      return T.events.filter((e) => e.type === type && pred(e.p || {})).length;
    },
    frames: (n = 2) => new Promise((r) => {
      const f = () => (--n <= 0 ? r() : requestAnimationFrame(f));
      requestAnimationFrame(f);
    }),
    groundY(x, z, hint) {
      const hit = g.physics.raycast(new V(x, hint + 6, z), new V(0, -1, 0), 16, { exclude: g.physics.playerEntity });
      return hit ? hit.point.y : Math.max(g.world.heightAt(x, z), hint - 2);
    },
    place(x, z, yaw = 0, hint, exactY = false) {
      const y = exactY ? hint : T.groundY(x, z, hint ?? g.world.heightAt(x, z));
      g.player.teleport(x, y + 0.05, z, yaw);
    },
    aimAt(x, y, z) {
      const e = g.player.eye;
      g.player.yaw = Math.atan2(-(x - e.x), -(z - e.z));
      g.player.pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z));
    },
    linkSpot(id, side) {
      const link = g.links.get(id);
      const curve = g.links.curveOf(id);
      const v = new V();
      curve.tangent(side === 'a' ? 0 : curve.length, v);
      v.y = 0;
      v.normalize();
      const end = side === 'a' ? link.a : link.b;
      const k = side === 'a' ? -3 : 3;
      return { x: end[0] + v.x * k, z: end[2] + v.z * k, hint: end[1], target: [end[0], end[1] + 1.2, end[2]] };
    },
    beaconSpot(id) {
      const b = g.beacons.get(id);
      const f = new V(0, 0, 1).applyQuaternion(b.group.quaternion);
      f.y = 0;
      f.normalize();
      const p = b.position;
      return { x: p.x + f.x * 2, z: p.z + f.z * 2, hint: p.y, target: [p.x + f.x * 0.6, p.y + 1.4, p.z + f.z * 0.6] };
    },
    docText: (sel = '.reader') => document.querySelector(sel)?.textContent || '',
    norm: (s) => String(s || '').normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase(),
  };
  for (const type of ['zone:enter', 'zone:leave', 'stage:change', 'game:start', 'link:restored', 'link:ride:start', 'link:ride:end', 'mode:change',
    'scan:start', 'scan:end', 'trace:found', 'beacon:activated', 'beacon:ready', 'finale:reply', 'finale:done']) {
    g.events.on(type, (p) => T.events.push({ type, p, t: g.time.now }));
  }
  window.__T = T;
  return true;
};
