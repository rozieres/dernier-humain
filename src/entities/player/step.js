export function createStepper({ RAPIER, rw, collider, radius, halfHeight, offset, maxHeight, minNormalY, groups }) {
  const shape = new RAPIER.Capsule(halfHeight - radius, radius);
  const rot = { x: 0, y: 0, z: 0, w: 1 };
  const pos = { x: 0, y: 0, z: 0 };
  const dir = { x: 0, y: 0, z: 0 };
  const flags = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS;
  const headroom = maxHeight + 2 * offset;
  const result = { x: 0, y: 0, z: 0, collider: null, nx: 0, ny: 1, nz: 0 };
  const probes = [0, 0];

  function cast(x, y, z, dx, dy, dz, max) {
    pos.x = x;
    pos.y = y;
    pos.z = z;
    dir.x = dx;
    dir.y = dy;
    dir.z = dz;
    return rw.castShape(pos, rot, dir, shape, offset, max, false, flags, groups, collider);
  }

  return function stepUp(center, mx, mz) {
    const d = Math.hypot(mx, mz);
    if (d < 1e-4) return null;
    const ux = mx / d;
    const uz = mz / d;
    const up = cast(center.x, center.y, center.z, 0, 1, 0, headroom);
    const lift = up ? up.time_of_impact : headroom;
    if (lift < 0.05) return null;
    const y = center.y + lift;
    let reach = d + radius + offset + 0.06;
    const ahead = cast(center.x, y, center.z, ux, 0, uz, reach);
    if (ahead) reach = ahead.time_of_impact - offset;
    if (reach < d) return null;
    let land = null;
    let gain = 0;
    probes[0] = Math.min(reach, radius + offset + 0.06);
    probes[1] = reach;
    for (const probe of probes) {
      const hit = cast(center.x + ux * probe, y, center.z + uz * probe, 0, -1, 0, lift);
      if (!hit) continue;
      const rise = lift - hit.time_of_impact;
      const parent = hit.collider.parent();
      if (rise < 0.02 || rise > maxHeight + offset || hit.normal1.y < minNormalY || (parent && parent.isDynamic())) continue;
      land = hit;
      gain = rise;
      break;
    }
    if (!land) return null;
    const here = cast(center.x + ux * d, y, center.z + uz * d, 0, -1, 0, lift);
    result.x = ux * d;
    result.y = here ? Math.max(gain, lift - here.time_of_impact) : gain;
    result.z = uz * d;
    result.collider = land.collider;
    result.nx = land.normal1.x;
    result.ny = land.normal1.y;
    result.nz = land.normal1.z;
    return result;
  };
}
