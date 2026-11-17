const TIERS = {
  low: { pixelRatio: 0.75, shadows: false, shadowMapSize: 1024, grassBlades: 25000, terrainStep: 2, maxLights: 4, bloom: false, msaa: 0, particles: 0.4, viewDistance: 1600 },
  medium: { pixelRatio: 1, shadows: true, shadowMapSize: 2048, grassBlades: 60000, terrainStep: 1, maxLights: 6, bloom: true, msaa: 0, particles: 0.7, viewDistance: 2600 },
  high: { pixelRatio: 1.5, shadows: true, shadowMapSize: 2048, grassBlades: 120000, terrainStep: 1, maxLights: 8, bloom: true, msaa: 4, particles: 1, viewDistance: 4000 },
  ultra: { pixelRatio: 2, shadows: true, shadowMapSize: 4096, grassBlades: 200000, terrainStep: 1, maxLights: 12, bloom: true, msaa: 4, particles: 1, viewDistance: 6000 },
};
export const QUALITY_TIERS = Object.keys(TIERS);

const TARGET_MS = 1000 / 60;
const MIN_RATIO = 0.5;

export function createQuality({ tier = 'high', events, renderer }) {
  const quality = {
    tier: 'high',
    basePixelRatio: 1,
    dynamicResolution: true,
    setTier(next) {
      const t = TIERS[next] ? next : 'high';
      Object.assign(quality, TIERS[t]);
      quality.tier = t;
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      quality.basePixelRatio = Math.max(MIN_RATIO, Math.min(dpr, TIERS[t].pixelRatio));
      quality.pixelRatio = quality.basePixelRatio;
      if (renderer) {
        renderer.shadowMap.enabled = quality.shadows;
        renderer.setPixelRatio(quality.pixelRatio);
      }
      settle = 3;
      events.emit('quality:change', { tier: t, pixelRatio: quality.pixelRatio });
    },
    sample(realDt) {
      if (!quality.dynamicResolution || !renderer) return;
      if (settle > 0) {
        settle -= realDt;
        ema = TARGET_MS;
        return;
      }
      const ms = Math.min(100, realDt * 1000);
      ema += (ms - ema) * 0.05;
      slow = ema > TARGET_MS * 1.35 ? slow + realDt : 0;
      fast = ema < TARGET_MS * 1.08 ? fast + realDt : 0;
      let next = quality.pixelRatio;
      if (slow > 2) next = Math.max(MIN_RATIO, quality.pixelRatio * 0.85);
      else if (fast > 6 && quality.pixelRatio < quality.basePixelRatio) next = Math.min(quality.basePixelRatio, quality.pixelRatio * 1.1);
      if (Math.abs(next - quality.pixelRatio) > 0.01) {
        quality.pixelRatio = next;
        renderer.setPixelRatio(next);
        slow = 0;
        fast = 0;
        settle = 1;
        events.emit('quality:change', { tier: quality.tier, pixelRatio: next });
      }
    },
  };
  let ema = TARGET_MS;
  let slow = 0;
  let fast = 0;
  let settle = 3;
  quality.setTier(tier);
  return quality;
}
