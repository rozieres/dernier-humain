import * as THREE from 'three';

const ONE = [1, 1, 1];

export function createAtmospheres() {
  const list = [];
  const out = {
    fogColor: new THREE.Color(),
    fogWeight: 0,
    fogDensity: 1,
    tint: new THREE.Color(1, 1, 1),
    saturation: 1,
    exposure: 1,
    darkness: 0,
  };
  const target = {
    fogColor: new THREE.Color(),
    fogWeight: 0,
    fogDensity: 1,
    tint: [1, 1, 1],
    saturation: 1,
    exposure: 1,
    darkness: 0,
  };
  let first = true;

  function weightAt(a, x, z) {
    const d = Math.hypot(x - a.center[0], z - a.center[1]);
    if (d <= a.radius) return 1;
    const t = Math.min(1, (d - a.radius) / Math.max(a.falloff, 1e-3));
    return 1 - t * t * (3 - 2 * t);
  }

  function sampleTargets(x, z) {
    target.fogColor.setRGB(0, 0, 0);
    let fogSum = 0;
    let fogKeep = 1;
    let dens = 1;
    let sat = 1;
    let expo = 1;
    let dark = 1;
    const tint = target.tint;
    tint[0] = tint[1] = tint[2] = 1;
    for (const a of list) {
      if (!a.enabled) continue;
      const w = weightAt(a, x, z);
      a.weight = w;
      if (w <= 0) continue;
      if (a.fogColor) {
        target.fogColor.r += a.fogColor.r * w;
        target.fogColor.g += a.fogColor.g * w;
        target.fogColor.b += a.fogColor.b * w;
        fogSum += w;
        fogKeep *= 1 - w;
      }
      dens *= 1 + (a.fogDensity - 1) * w;
      sat *= 1 + (a.saturation - 1) * w;
      expo *= 1 + (a.exposure - 1) * w;
      dark *= 1 - a.darkness * w;
      const t = a.tint || ONE;
      tint[0] *= 1 + (t[0] - 1) * w;
      tint[1] *= 1 + (t[1] - 1) * w;
      tint[2] *= 1 + (t[2] - 1) * w;
    }
    if (fogSum > 0) target.fogColor.multiplyScalar(1 / fogSum);
    target.fogWeight = 1 - fogKeep;
    target.fogDensity = dens;
    target.saturation = sat;
    target.exposure = expo;
    target.darkness = 1 - dark;
  }

  return {
    list,
    state: out,
    add({ id, center, radius, falloff = 80, fogColor, fogDensity = 1, tint, saturation = 1, exposure = 1, darkness = 0 }) {
      const a = {
        id, center: [center[0], center[1]], radius, falloff,
        fogColor: fogColor !== undefined && fogColor !== null ? new THREE.Color(fogColor) : null,
        fogDensity, tint: tint ? [tint[0], tint[1], tint[2]] : null, saturation, exposure, darkness,
        enabled: true,
        weight: 0,
        remove() {
          const i = list.indexOf(a);
          if (i >= 0) list.splice(i, 1);
        },
      };
      list.push(a);
      return a;
    },
    update(x, z, dt) {
      sampleTargets(x, z);
      const k = first ? 1 : 1 - Math.exp(-dt / 0.35);
      first = false;
      if (target.fogWeight > 0.001) out.fogColor.lerp(target.fogColor, out.fogWeight < 0.001 ? 1 : k);
      out.fogWeight += (target.fogWeight - out.fogWeight) * k;
      out.fogDensity += (target.fogDensity - out.fogDensity) * k;
      out.saturation += (target.saturation - out.saturation) * k;
      out.exposure += (target.exposure - out.exposure) * k;
      out.darkness += (target.darkness - out.darkness) * k;
      out.tint.r += (target.tint[0] - out.tint.r) * k;
      out.tint.g += (target.tint[1] - out.tint.g) * k;
      out.tint.b += (target.tint[2] - out.tint.b) * k;
      return out;
    },
  };
}
