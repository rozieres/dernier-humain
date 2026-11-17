import { boot, BOOT_ORDER } from '/src/boot.js';

export function bootZone(id, options = {}) {
  const systems = BOOT_ORDER.filter((n) => !n.startsWith('zone:') && n !== 'story');
  return boot({ systems, zones: [id], skipMenu: true, spawn: id, ...options });
}
