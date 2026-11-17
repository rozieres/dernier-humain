import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { coneMaterial, poolMaterial } from './shaders.js';
import { ROUTES, SPEED, BEAM, FIRE, SAFE_FIRE_R } from './layout.js';

const TRUNKS = 14;
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const COS_HALF = Math.cos(THREE.MathUtils.degToRad(BEAM.half));
const TRACK_RATE = 0.62;
const LOSE_AFTER = 2.2;
const POOL_SIZE = 24;

function bodyGeometry() {
  const parts = [];
  const hull = new THREE.LatheGeometry([
    [0, -0.34], [0.34, -0.3], [0.6, -0.08], [0.56, 0.1], [0.32, 0.24], [0, 0.29],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 6);
  hull.scale(1, 1, 1.25);
  parts.push(hull);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const arm = new THREE.BoxGeometry(0.8, 0.07, 0.11);
    arm.translate(0.85, 0, 0);
    arm.rotateY(a);
    parts.push(arm);
    const ring = new THREE.TorusGeometry(0.3, 0.035, 5, 14);
    ring.rotateX(Math.PI / 2);
    ring.translate(Math.cos(a) * 1.28, 0.02, -Math.sin(a) * 1.28);
    parts.push(ring);
    const hub = new THREE.CylinderGeometry(0.06, 0.08, 0.14, 6);
    hub.translate(Math.cos(a) * 1.28, 0.02, -Math.sin(a) * 1.28);
    parts.push(hub);
  }
  const pod = new THREE.CylinderGeometry(0.2, 0.15, 0.22, 8);
  pod.translate(0, -0.42, 0);
  parts.push(pod);
  for (const s of [-1, 1]) {
    const fin = new THREE.BoxGeometry(0.04, 0.24, 0.5);
    fin.rotateZ(s * 0.5);
    fin.translate(s * 0.16, 0.34, -0.05);
    parts.push(fin);
  }
  const merged = mergeGeometries(parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    return n;
  }));
  merged.computeVertexNormals();
  return merged;
}

function glowGeometry() {
  const lens = new THREE.CircleGeometry(0.13, 16);
  lens.rotateX(Math.PI / 2);
  lens.translate(0, -0.535, 0);
  const eye = new THREE.CircleGeometry(0.08, 12);
  eye.rotateY(Math.PI);
  eye.translate(0, -0.06, -0.72);
  const parts = [lens, eye];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const led = new THREE.BoxGeometry(0.12, 0.03, 0.03);
    led.rotateY(a);
    led.translate(Math.cos(a) * 1.6, 0.02, -Math.sin(a) * 1.6);
    parts.push(led);
  }
  return mergeGeometries(parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    return n;
  }));
}

function buildRoute(def, world) {
  const pts = def.ring
    ? Array.from({ length: def.ring.n }, (_, i) => {
      const a = (i / def.ring.n) * Math.PI * 2;
      return new THREE.Vector3(def.ring.c[0] + Math.cos(a) * def.ring.r, 0, def.ring.c[1] + Math.sin(a) * def.ring.r);
    })
    : def.pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const length = curve.getLength();
  const n = Math.max(32, Math.round(length / 2));
  const samples = curve.getSpacedPoints(n);
  samples.pop();
  const ground = samples.map((p) => world.heightAt(p.x, p.z));
  const ys = ground.map((_, i) => {
    let m = -Infinity;
    for (let k = -4; k <= 4; k++) m = Math.max(m, ground[(i + k + n) % n]);
    return m;
  });
  const smooth = ys.map((_, i) => {
    let s = 0;
    for (let k = -3; k <= 3; k++) s += ys[(i + k + n) % n];
    return s / 7;
  });
  for (let i = 0; i < n; i++) samples[i].y = smooth[i] + def.alt;
  return { samples, length, n, curve };
}

function sampleRoute(route, s, out, tangent) {
  const u = (((s / route.length) % 1) + 1) % 1 * route.n;
  const i = Math.floor(u);
  const f = u - i;
  const a = route.samples[i];
  const b = route.samples[(i + 1) % route.n];
  out.lerpVectors(a, b, f);
  if (tangent) tangent.subVectors(b, a).setY(0).normalize();
  return out;
}

export function routeClearings(world) {
  const out = [];
  for (const def of ROUTES) {
    const route = buildRoute(def, world);
    const step = 5;
    for (let s = 0; s < route.length; s += step) {
      const p = sampleRoute(route, s, new THREE.Vector3());
      out.push([p.x, p.z]);
    }
  }
  return out;
}

export function createCrawlers(ctx, { detail, landmark }) {
  const { world, physics, scene } = ctx;
  const count = ROUTES.length;
  const bodyMat = ctx.mat.standard({ color: '#14171b', roughness: 0.38, metalness: 0.65, flatShading: true });
  const bodies = new THREE.InstancedMesh(bodyGeometry(), bodyMat, count);
  bodies.name = 'forest:crawlers';
  bodies.castShadow = true;
  bodies.frustumCulled = false;
  const glowMat = ctx.mat.glow('#ffffff', 1);
  const glows = new THREE.InstancedMesh(glowGeometry(), glowMat, count);
  glows.name = 'forest:crawler-lights';
  glows.frustumCulled = false;
  glows.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);

  const coneGeo = new THREE.CylinderGeometry(0, 1, 1, 28, 10, true);
  coneGeo.translate(0, -0.5, 0);
  const beamAttr = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
  coneGeo.setAttribute('aBeam', beamAttr);
  const coneMat = coneMaterial(ctx.mat);
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, count);
  cones.name = 'forest:beams';
  cones.frustumCulled = false;
  cones.renderOrder = 6;

  const poolGeo = new THREE.PlaneGeometry(1, 1, 30, 30).rotateX(-Math.PI / 2);
  const apexAttr = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const axisAttr = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
  poolGeo.setAttribute('aApex', apexAttr);
  poolGeo.setAttribute('aAxis', axisAttr);
  const poolMat = poolMaterial(ctx.mat, count, TRUNKS);
  poolMat.uniforms.uCos.value.set(COS_HALF, Math.cos(THREE.MathUtils.degToRad(BEAM.half * 0.55)));
  poolMat.uniforms.uRange.value = BEAM.range;
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, count);
  pools.name = 'forest:pools';
  pools.frustumCulled = false;
  pools.renderOrder = 2;

  landmark.add(bodies, glows, cones);
  detail.add(pools);

  const spot = new THREE.SpotLight('#d8f1ff', 0, 34, THREE.MathUtils.degToRad(BEAM.half + 2), 0.45, 1.3);
  spot.name = 'forest:spot';
  scene.add(spot, spot.target);

  const drones = ROUTES.map((def, i) => {
    const route = buildRoute(def, world);
    const d = {
      i, route, s: def.phase * route.length, pos: new THREE.Vector3(), tangent: new THREE.Vector3(1, 0, 0),
      axis: new THREE.Vector3(0, -1, 0), sweep: new THREE.Vector3(), heading: 0, alert: 0, tracking: false, lost: 0,
      seen: false, lens: new THREE.Vector3(), pool: new THREE.Vector3(), farLift: 0, sweepPhase: def.phase * 11.3,
      trunkTimer: i * 0.05, audio: null, scan: null,
    };
    sampleRoute(route, d.s, d.pos, d.tangent);
    d.heading = Math.atan2(d.tangent.x, d.tangent.z);
    return d;
  });

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qa = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  const side = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const scl = new THREE.Vector3();
  const target = new THREE.Vector3();
  const ray = new THREE.Vector3();
  const pts = [new THREE.Vector3(), new THREE.Vector3()];
  const trees = [];
  const mask = physics.GROUPS.STATIC | physics.GROUPS.TERRAIN;
  let clock = 0;
  let farK = 0;

  function sweepAxis(d, t, out) {
    const theta = 0.6 * Math.sin(t * 0.47 + d.sweepPhase) + 0.18 * Math.sin(t * 1.13 + d.sweepPhase * 2.1);
    side.crossVectors(d.tangent, UP).normalize();
    return out.copy(DOWN).addScaledVector(side, Math.tan(theta)).addScaledVector(d.tangent, 0.2 + 0.08 * Math.sin(t * 0.31 + d.i)).normalize();
  }

  function rotateToward(cur, goal, maxAngle) {
    const ang = cur.angleTo(goal);
    if (ang < 1e-4) return cur.copy(goal);
    const k = Math.min(1, maxAngle / ang);
    qa.setFromUnitVectors(cur, goal);
    q.identity().slerp(qa, k);
    return cur.applyQuaternion(q).normalize();
  }

  function canSee(d, p, range) {
    ray.subVectors(p, d.lens);
    const dist = ray.length();
    if (dist > range || dist < 0.5) return false;
    ray.multiplyScalar(1 / dist);
    if (ray.dot(d.axis) < COS_HALF) return false;
    return !physics.raycast(d.lens, ray, dist - 0.25, { groups: mask });
  }

  function lineOfSight(d, p) {
    ray.subVectors(p, d.lens);
    const dist = ray.length();
    ray.multiplyScalar(1 / Math.max(dist, 1e-3));
    return !physics.raycast(d.lens, ray, dist - 0.25, { groups: mask });
  }

  function poolPoint(d, out) {
    const g = world.heightAt(d.lens.x, d.lens.z);
    const drop = Math.max(0.5, d.lens.y - g);
    const t = Math.min(BEAM.range * 0.85, drop / Math.max(0.2, -d.axis.y));
    out.copy(d.lens).addScaledVector(d.axis, t);
    out.y = world.heightAt(out.x, out.z);
    return out;
  }

  function updateTrunks(d) {
    v.addVectors(d.pool, d.lens).multiplyScalar(0.5);
    ctx.vegetation.treesNear(v.x, v.z, 16, trees);
    trees.sort((a, b) => ((a.x - v.x) ** 2 + (a.z - v.z) ** 2) - ((b.x - v.x) ** 2 + (b.z - v.z) ** 2));
    const arr = poolMat.uniforms.uTrunks.value;
    for (let k = 0; k < TRUNKS; k++) {
      const t = trees[k];
      const slot = arr[d.i * TRUNKS + k];
      if (t) slot.set(t.x, t.z, t.radius, (t.y ?? world.heightAt(t.x, t.z)) + t.height * 0.9);
      else slot.set(0, 0, 0, -1e3);
    }
  }

  const api = {
    drones,
    count,
    bodies,
    cones,
    pools,
    spot,

    patrol(dt, player, active) {
      clock += dt;
      let anySeen = false;
      let nearest = Infinity;
      for (const d of drones) {
        if (!d.tracking) {
          d.s += SPEED * dt;
          sampleRoute(d.route, d.s, d.pos, d.tangent);
          const h = Math.atan2(d.tangent.x, d.tangent.z);
          let dh = h - d.heading;
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          d.heading += dh * Math.min(1, dt * 2.5);
        }
        d.lens.copy(d.pos);
        d.lens.y += d.farLift - 0.55;
        sweepAxis(d, clock, d.sweep);
        d.seen = false;
        if (active && player) {
          const hx = player.position.x - d.pos.x;
          const hz = player.position.z - d.pos.z;
          const hd = Math.hypot(hx, hz);
          const safe = (player.position.x - FIRE[0]) ** 2 + (player.position.z - FIRE[1]) ** 2 < SAFE_FIRE_R * SAFE_FIRE_R || api.isSafe?.(player.position);
          if (hd < BEAM.range + 4 && !safe) {
            pts[0].copy(player.eye);
            pts[1].copy(player.position).y += 1.0;
            d.seen = canSee(d, pts[0], BEAM.range) || canSee(d, pts[1], BEAM.range);
            if (!d.seen && d.tracking) d.seen = lineOfSight(d, pts[1]) && w.subVectors(pts[1], d.lens).normalize().dot(d.axis) > Math.cos(THREE.MathUtils.degToRad(BEAM.half * 1.6)) && hd < BEAM.range;
          }
          d.pool.copy(poolPoint(d, w));
          nearest = Math.min(nearest, Math.hypot(player.position.x - d.pool.x, player.position.z - d.pool.z));
        }
        if (d.seen) {
          d.tracking = true;
          d.lost = 0;
          anySeen = true;
        } else if (d.tracking) {
          d.lost += dt;
          if (d.lost > LOSE_AFTER) d.tracking = false;
        }
        if (d.tracking && player) {
          target.copy(player.position).y += 1.0;
          w.subVectors(target, d.lens).normalize();
          rotateToward(d.axis, w, TRACK_RATE * dt);
        } else rotateToward(d.axis, d.sweep, 2.4 * dt);
        d.alert += ((d.tracking ? 1 : 0) - d.alert) * Math.min(1, dt * (d.tracking ? 6 : 1.5));
      }
      return { anySeen, nearest };
    },

    groundUnder(d) {
      return poolPoint(d, new THREE.Vector3());
    },

    resetAlerts() {
      for (const d of drones) {
        d.tracking = false;
        d.lost = 0;
        d.seen = false;
      }
    },

    frame(dt, { camera, night, showPools, far }) {
      farK += ((far ? 1 : 0) - farK) * Math.min(1, dt * 0.8);
      bodies.castShadow = !far;
      const lift = farK * 17;
      let best = null;
      let bestD = 70 * 70;
      for (const d of drones) {
        d.farLift = lift;
        d.lens.copy(d.pos);
        d.lens.y += lift - 0.55;
        const bob = Math.sin(clock * 1.7 + d.i) * 0.12;
        const bank = -Math.sin(clock * 0.47 + d.sweepPhase) * 0.08;
        m4.compose(v.set(d.pos.x, d.pos.y + lift + bob, d.pos.z), q.setFromEuler(e.set(0.06, d.heading + Math.PI, bank, 'YXZ')), one);
        bodies.setMatrixAt(d.i, m4);
        glows.setMatrixAt(d.i, m4);
        const a = d.alert;
        glows.instanceColor.setXYZ(d.i, 4.5 + 2.5 * a, 5.2 * (1 - a) + 0.5 * a, 5.8 * (1 - a) + 0.35 * a);
        const len = BEAM.range * (1 + farK * 0.9);
        const r = len * Math.tan(THREE.MathUtils.degToRad(BEAM.half)) * (1 + farK * 0.6);
        qa.setFromUnitVectors(DOWN, d.axis);
        m4.compose(d.lens, qa, scl.set(r, len, r));
        cones.setMatrixAt(d.i, m4);
        beamAttr.setXY(d.i, a, 1 + farK * 1.6);
        if (showPools) {
          poolPoint(d, d.pool);
          m4.compose(v.set(d.pool.x, 0, d.pool.z), q.identity(), scl.set(POOL_SIZE, 1, POOL_SIZE));
          pools.setMatrixAt(d.i, m4);
          apexAttr.setXYZ(d.i, d.lens.x, d.lens.y, d.lens.z);
          axisAttr.setXYZW(d.i, d.axis.x, d.axis.y, d.axis.z, a);
          d.trunkTimer -= dt;
          const cd = camera.position.distanceToSquared(d.pool);
          if (d.trunkTimer <= 0 && cd < 160 * 160) {
            d.trunkTimer = 0.18;
            updateTrunks(d);
          }
        }
        const dc = camera.position.distanceToSquared(d.lens);
        if (dc < bestD) {
          bestD = dc;
          best = d;
        }
      }
      bodies.instanceMatrix.needsUpdate = true;
      glows.instanceMatrix.needsUpdate = true;
      glows.instanceColor.needsUpdate = true;
      cones.instanceMatrix.needsUpdate = true;
      beamAttr.needsUpdate = true;
      if (showPools) {
        pools.instanceMatrix.needsUpdate = true;
        apexAttr.needsUpdate = true;
        axisAttr.needsUpdate = true;
      }
      coneMat.uniforms.uBeam.value = 3.2 - 2.6 * night + farK * (1.0 + 5.0 * night);
      poolMat.uniforms.uPool.value = 2.0 - 1.1 * night;
      if (best && showPools) {
        spot.position.copy(best.lens);
        spot.target.position.copy(best.lens).add(best.axis);
        spot.target.updateMatrixWorld();
        spot.color.setRGB(0.85 + 0.15 * best.alert, 0.95 * (1 - best.alert) + 0.15 * best.alert, 1.0 * (1 - best.alert) + 0.1 * best.alert);
        spot.intensity = (55 - 30 * night) * (1 - smoothFade(Math.sqrt(bestD), 50, 70));
      } else spot.intensity = 0;
    },
  };
  return api;
}

function smoothFade(x, a, b) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
