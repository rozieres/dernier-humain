import * as THREE from 'three';
import { buildCurve, ANCHOR } from './links/curve.js';
import {
  MAX_SLOTS, createCableMaterial, buildCableGeometry, buildArchGeometry, buildArchGlowGeometry,
  createLabelMaterial, drawAtlas, buildPortalGeometry, createPortalMaterial,
} from './links/visuals.js';

const WORLD_LINKS = ['feed', 'farm', 'hallu', 'oldweb', 'forest', 'lighthouse'];
const BLUE = new THREE.Color('#2e7dff');
const PURPLE = new THREE.Color('#9b6bff');
const RED = new THREE.Color('#ff4b3e');
const HANG = 2.35;
const ACCEL = 22;
const DECEL = 24;
const ATTACH = 0.9;
const DETACH = 1.25;
const RESTORE = 6;
const CUT = 38;
const DEAD_LABEL = '404';
const CABLE_GLOW = 1.7;
const ARCH_GLOW = 2.4;
const LABEL_GLOW = 1.5;

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export default async function create(ctx) {
  const { scene, world, state, events, mat, text, interact } = ctx;
  const links = new Map();
  const cableMat = createCableMaterial(mat);
  const archBodyMat = mat.standard({ color: '#eef1f8', roughness: 0.28, metalness: 0.15 });
  const archGlowMat = mat.basic({ color: '#ffffff' });
  const archGeo = buildArchGeometry();
  const archGlowGeo = buildArchGlowGeometry();
  const portalGeo = buildPortalGeometry();
  const portalMat = createPortalMaterial(mat);
  const group = new THREE.Group();
  group.name = 'links';
  scene.add(group);

  let cable = null;
  let arches = null;
  let glows = null;
  let portals = null;
  let labels = null;
  let labelMat = null;
  let atlas = null;
  let ends = [];
  let legColliders = [];
  let dirty = true;
  let ride = null;
  let dangleEmitter = null;
  const color = new THREE.Color();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const UP = new THREE.Vector3(0, 1, 0);
  const dangleTip = new THREE.Vector3();

  const zoneName = (id) => (ctx.has('texts') && ctx.texts.ZONES?.[id]?.name) || world.zones[id]?.name || id;

  function horizontalDir(curve, s, sign, out) {
    curve.tangent(s, out).multiplyScalar(sign);
    out.y = 0;
    return out.normalize();
  }

  function add({ id, a, b, label, labelBack, enabled = true, zone = null }) {
    if (links.has(id)) throw new Error(`[links] duplicate link "${id}"`);
    const link = {
      id, a: [...a], b: [...b], label, labelBack: labelBack ?? zoneName('hub'), zone,
      enabled, dead: !enabled, anim: null, curve: null, slot: -1, dangleSlot: -1,
      dangle: null, interacts: [],
    };
    links.set(id, link);
    dirty = true;
    for (const side of ['a', 'b']) {
      const p = link[side];
      const pos = new THREE.Vector3(p[0], p[1] + 1.2, p[2]);
      const h = interact.add({
        id: `link:${id}:${side}`,
        position: pos,
        radius: 4.5,
        priority: 1,
        label: '',
        enabled: () => !ride && (link.enabled || (side === 'a' && link.dead)),
        onInteract: () => {
          if (link.dead) ctx.companion.say('link.dead');
          else ride_(id, side);
        },
      });
      link.interacts.push({ side, handle: h });
    }
    refreshPrompts(link);
    return describe(link);
  }

  function refreshPrompts(link) {
    for (const { side, handle } of link.interacts) {
      handle.label = link.dead
        ? `Lien brisé — ${DEAD_LABEL}`
        : side === 'a' ? `Suivre le lien — ${link.label}` : `Retour — ${link.labelBack}`;
    }
  }

  function describe(link) {
    return { id: link.id, a: link.a, b: link.b, enabled: link.enabled, visited: state.visitedLinks.has(link.id), label: link.label };
  }

  function buildDangle(link) {
    const c = link.curve;
    const pts = [];
    const p = c.at(CUT, new THREE.Vector3());
    const dir = c.tangent(CUT, new THREE.Vector3());
    for (let i = 0; i <= 14; i++) {
      pts.push(p.clone());
      dir.y -= 0.28;
      dir.normalize();
      p.addScaledVector(dir, 1.25);
    }
    dangleTip.copy(pts[pts.length - 1]);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
    return { points: pts, length: len };
  }

  function rebuild() {
    dirty = false;
    for (const o of [cable, arches, glows, portals, labels]) {
      if (!o) continue;
      group.remove(o);
      if (o.geometry !== archGeo && o.geometry !== archGlowGeo && o.geometry !== portalGeo) o.geometry.dispose();
    }
    if (atlas) atlas.texture.dispose();
    labelMat?.dispose();

    const strands = [];
    let slot = 0;
    ends = [];
    const rows = new Map();
    const rowOf = (s) => {
      if (!rows.has(s)) rows.set(s, rows.size);
      return rows.get(s);
    };
    rowOf(DEAD_LABEL);
    for (const link of links.values()) {
      if (!link.curve) link.curve = buildCurve(world, link.a, link.b, { seed: ctx.rng.hash(link.id) });
      const curve = link.curve;
      link.slot = slot++;
      strands.push({ points: curve.points, slot: link.slot, length: curve.length });
      if (link.id === 'lighthouse' || link.dead) {
        link.dangle = buildDangle(link);
        link.dangleSlot = slot++;
        strands.push({ points: link.dangle.points, slot: link.dangleSlot, length: link.dangle.length });
      }
      for (const side of ['a', 'b']) {
        const p = link[side];
        const s = side === 'a' ? 0 : curve.length;
        const dir = horizontalDir(curve, s, side === 'a' ? 1 : -1, new THREE.Vector3());
        const name = side === 'a' ? link.label : link.labelBack;
        ends.push({
          link, side, position: new THREE.Vector3(p[0], p[1], p[2]), dir,
          yaw: Math.atan2(dir.x, dir.z), row: rowOf(name), deadRow: rowOf(DEAD_LABEL),
        });
      }
    }
    if (slot > MAX_SLOTS) throw new Error(`[links] too many links (${slot} slots > ${MAX_SLOTS})`);

    cable = new THREE.Mesh(buildCableGeometry(strands), cableMat);
    cable.name = 'links:cables';
    cable.frustumCulled = false;
    group.add(cable);

    arches = new THREE.InstancedMesh(archGeo, archBodyMat, ends.length);
    glows = new THREE.InstancedMesh(archGlowGeo, archGlowMat, ends.length);
    portals = new THREE.InstancedMesh(portalGeo, portalMat, ends.length);
    portals.name = 'links:portals';
    portals.renderOrder = 2;
    arches.name = 'links:arches';
    glows.name = 'links:arch-glow';
    arches.castShadow = true;
    arches.receiveShadow = true;
    ends.forEach((e, i) => {
      q.setFromAxisAngle(UP, e.yaw);
      m4.compose(e.position, q, one);
      arches.setMatrixAt(i, m4);
      glows.setMatrixAt(i, m4);
      glows.setColorAt(i, color.setRGB(1, 1, 1));
      portals.setMatrixAt(i, m4);
      portals.setColorAt(i, color);
    });
    for (const h of legColliders) h.remove();
    legColliders = [];
    ends.forEach((e) => {
      for (const sx of [-1.62, 1.62]) {
        legColliders.push(ctx.physics.addStaticCylinder({
          position: [e.position.x + Math.cos(e.yaw) * sx, e.position.y + 2.8, e.position.z - Math.sin(e.yaw) * sx],
          radius: 0.16, height: 5.6, userData: { surface: 'metal' },
        }));
      }
    });
    arches.computeBoundingSphere();
    glows.computeBoundingSphere();
    portals.computeBoundingSphere();
    group.add(arches, glows, portals);

    atlas = drawAtlas(text, [...rows.keys()]);
    const geo = new THREE.InstancedBufferGeometry();
    const plane = new THREE.PlaneGeometry(1, 1);
    geo.index = plane.index;
    geo.setAttribute('position', plane.attributes.position);
    geo.setAttribute('uv', plane.attributes.uv);
    const n = ends.length;
    const offset = new Float32Array(n * 3);
    const uv = new Float32Array(n * 4);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n * 2);
    const flick = new Float32Array(n);
    ends.forEach((e, i) => {
      offset.set([e.position.x - e.dir.x * 0.9, e.position.y + ANCHOR + 1.95, e.position.z - e.dir.z * 0.9], i * 3);
    });
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offset, 3));
    geo.setAttribute('aUv', new THREE.InstancedBufferAttribute(uv, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aFlicker', new THREE.InstancedBufferAttribute(flick, 1).setUsage(THREE.DynamicDrawUsage));
    geo.instanceCount = n;
    labelMat = createLabelMaterial(mat, atlas.texture);
    labels = new THREE.Mesh(geo, labelMat);
    labels.name = 'links:labels';
    labels.frustumCulled = false;
    labels.renderOrder = 3;
    group.add(labels);
    for (const e of ends) e.shownRow = -1;
    for (const link of links.values()) refreshPrompts(link);
  }

  function linkColor(link, out) {
    if (link.anim) return out.copy(RED).lerp(BLUE, easeInOut(clamp(link.anim.t / RESTORE, 0, 1)));
    if (link.dead) return out.copy(RED);
    return out.copy(state.visitedLinks.has(link.id) ? PURPLE : BLUE);
  }

  function updateVisuals() {
    const u = cableMat.uniforms;
    const t = ctx.time.now;
    for (const link of links.values()) {
      linkColor(link, color);
      const anim = link.anim ? clamp(link.anim.t / RESTORE, 0, 1) : 0;
      const cutT = CUT / link.curve.length;
      const flicker = link.dead ? (link.anim ? 1 - anim : 1) : 0;
      u.uColors.value[link.slot].copy(color).multiplyScalar(CABLE_GLOW * (link.dead && !link.anim ? 0.8 : 1));
      u.uGrow.value[link.slot] = link.dead ? cutT + (1 - cutT) * easeInOut(anim) + (link.anim ? 0.0005 : 0) : 1.001;
      u.uFlicker.value[link.slot] = link.anim ? 0 : flicker;
      u.uSway.value[link.slot] = 0;
      if (link.dangleSlot >= 0) {
        u.uColors.value[link.dangleSlot].copy(RED).multiplyScalar(CABLE_GLOW * 0.8);
        u.uGrow.value[link.dangleSlot] = link.dead && !link.anim ? 1.001 : -1;
        u.uFlicker.value[link.dangleSlot] = 1;
        u.uSway.value[link.dangleSlot] = 0.5;
      }
    }
    if (!ends.length) return;
    const lc = labels.geometry.attributes;
    ends.forEach((e, i) => {
      const link = e.link;
      linkColor(link, color);
      const dead = link.dead && !(link.anim && link.anim.t > RESTORE * 0.85);
      const flick = dead ? (link.anim ? 1 - clamp(link.anim.t / RESTORE, 0, 1) : 1) : 0;
      const pulse = flick > 0 ? (Math.sin(t * 23 + i) > -0.2 ? 1 : 0.25) : 1;
      tmp.set(color.r, color.g, color.b).multiplyScalar(ARCH_GLOW * pulse);
      glows.instanceColor.setXYZ(i, tmp.x, tmp.y, tmp.z);
      const veil = pulse * (dead ? 0.3 : 1);
      portals.instanceColor.setXYZ(i, color.r * veil, color.g * veil, color.b * veil);
      lc.aColor.setXYZ(i, color.r * LABEL_GLOW, color.g * LABEL_GLOW, color.b * LABEL_GLOW);
      lc.aFlicker.setX(i, flick);
      const row = dead ? e.deadRow : e.row;
      if (row !== e.shownRow) {
        e.shownRow = row;
        const l = atlas.layout[row];
        lc.aUv.setXYZW(i, l.u, l.v, l.du, l.dv);
        lc.aSize.setXY(i, 1.4 * l.aspect, 1.4);
        lc.aUv.needsUpdate = true;
        lc.aSize.needsUpdate = true;
      }
    });
    glows.instanceColor.needsUpdate = true;
    portals.instanceColor.needsUpdate = true;
    lc.aColor.needsUpdate = true;
    lc.aFlicker.needsUpdate = true;
  }

  function sparks(position, tint = BLUE, count = 26) {
    ctx.particles.burst({
      position, count, color: tint.getStyle(), color2: '#e8f0ff', shape: 'spark',
      speed: [2, 7], spread: 1, life: [0.35, 1.0], size: [0.04, 0.1], gravity: -7, drag: 0.8,
    });
  }

  function groundAt(x, z, fallback) {
    const hit = ctx.physics.raycast(tmp2.set(x, fallback + 6, z), tmp.set(0, -1, 0), 14, { exclude: ctx.physics.playerEntity });
    return hit ? hit.point.y : Math.max(world.heightAt(x, z), fallback - 2);
  }

  function ride_(id, from = 'a') {
    const link = links.get(id);
    if (!link || !link.enabled || link.dead || ride || !ctx.has('player')) return Promise.resolve(false);
    if (dirty) rebuild();
    const P = ctx.player;
    const curve = link.curve;
    const sign = from === 'a' ? 1 : -1;
    const L = curve.length;
    const s0 = from === 'a' ? 1.2 : L - 1.2;
    const s1 = from === 'a' ? L - 1.2 : 1.2;
    const hangStart = curve.at(s0, new THREE.Vector3());
    hangStart.y -= HANG;
    const hangEnd = curve.at(s1, new THREE.Vector3());
    hangEnd.y -= HANG;
    const endDir = horizontalDir(curve, s1, sign, new THREE.Vector3());
    const endPoint = from === 'a' ? link.b : link.a;
    const land = new THREE.Vector3(endPoint[0], endPoint[1], endPoint[2]).addScaledVector(endDir, 4.5);
    land.y = groundAt(land.x, land.z, endPoint[1]);
    let facing = Math.atan2(-endDir.x, -endDir.z);
    const zone = from === 'a' && world.zones[link.zone];
    if (zone) facing = Math.atan2(-(zone.center[0] - land.x), -(zone.center[1] - land.z));
    const pose = { position: P.position.clone(), forward: horizontalDir(curve, s0, sign, new THREE.Vector3()), bank: 0, cone: 1.15 };
    const vmax = clamp(L / 12, 60, 95);
    return new Promise((resolve) => {
      ride = {
        link, from, sign, s: s0, s1, v: 0, t: 0, travelT: 0, phase: 'attach', vmax, pose, resolve,
        startFeet: P.position.clone(), hangStart, hangEnd, land, facing, endDir,
      };
      P.lock(true);
      P.ride(pose);
      events.emit('link:ride:start', { id });
      sparks(curve.at(s0, new THREE.Vector3()), state.visitedLinks.has(id) ? PURPLE : BLUE);
    });
  }

  function finishRide() {
    const r = ride;
    ride = null;
    const P = ctx.player;
    P.ride(null);
    P.yaw = r.facing;
    P.teleport(r.land.x, r.land.y, r.land.z);
    P.lock(false);
    P.setCheckpoint(r.land, r.facing);
    state.visitedLinks.add(r.link.id);
    ctx.audio.setParam('speed', 0);
    events.emit('link:ride:end', { id: r.link.id });
    sparks(r.link.curve.at(r.s1, new THREE.Vector3()), PURPLE, 20);
    r.resolve(true);
  }

  function stepRide(dt) {
    const r = ride;
    const { pose, link } = r;
    const curve = link.curve;
    r.t += dt;
    if (r.phase === 'attach') {
      const k = easeInOut(clamp(r.t / ATTACH, 0, 1));
      pose.position.lerpVectors(r.startFeet, r.hangStart, k);
      pose.position.y += Math.sin(k * Math.PI) * 0.6;
      horizontalDir(curve, r.s, r.sign, pose.forward);
      if (r.t >= ATTACH) {
        r.phase = 'travel';
        r.t = 0;
      }
      return;
    }
    if (r.phase === 'travel') {
      const remaining = (r.s1 - r.s) * r.sign;
      const brake = (r.v * r.v) / (2 * DECEL);
      if (remaining <= brake + 0.5) r.v = Math.max(5, r.v - DECEL * dt);
      else r.v = Math.min(r.vmax, r.v + ACCEL * Math.min(1, 0.25 + r.t / 1.2) * dt);
      r.s += r.sign * Math.min(r.v * dt, Math.max(0, remaining));
      curve.at(r.s, pose.position);
      pose.position.y -= HANG;
      curve.tangent(r.s, pose.forward).multiplyScalar(r.sign);
      const h0 = Math.atan2(pose.forward.x, pose.forward.z);
      curve.tangent(r.s + r.sign * 10, tmp).multiplyScalar(r.sign);
      const turn = Math.atan2(Math.sin(Math.atan2(tmp.x, tmp.z) - h0), Math.cos(Math.atan2(tmp.x, tmp.z) - h0)) / 10;
      pose.bank += (clamp(turn * r.v * 0.55, -0.32, 0.32) - pose.bank) * Math.min(1, dt * 3);
      ctx.audio.setParam('speed', clamp(r.v / 80, 0, 1));
      if (remaining <= 0.01) {
        r.phase = 'detach';
        r.t = 0;
        r.hangEnd.copy(pose.position);
      }
      return;
    }
    const k = clamp(r.t / DETACH, 0, 1);
    const kh = easeOut(k);
    pose.position.x = r.hangEnd.x + (r.land.x - r.hangEnd.x) * kh;
    pose.position.z = r.hangEnd.z + (r.land.z - r.hangEnd.z) * kh;
    pose.position.y = r.hangEnd.y + (r.land.y - r.hangEnd.y) * easeInOut(k);
    pose.position.y = Math.max(pose.position.y, r.land.y, world.heightAt(pose.position.x, pose.position.z));
    pose.bank *= 1 - Math.min(1, dt * 4);
    tmp.set(-Math.sin(r.facing), 0, -Math.cos(r.facing));
    pose.forward.lerp(tmp, Math.min(1, dt * 4)).normalize();
    if (r.t >= DETACH) finishRide();
  }

  function setEnabled(id, enabled, { animate = true } = {}) {
    const link = links.get(id);
    if (!link) return Promise.resolve(false);
    if (!enabled) {
      link.enabled = false;
      link.dead = true;
      link.anim = null;
      if (!link.dangle) dirty = true;
      refreshPrompts(link);
      return Promise.resolve(true);
    }
    if (link.enabled && !link.dead) return Promise.resolve(true);
    if (!animate) {
      restoreNow(link);
      events.emit('link:restored', { id });
      return Promise.resolve(true);
    }
    if (link.anim) return link.anim.promise;
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    link.anim = { t: 0, promise, resolve };
    if (link.dangle) sparks(link.curve.at(CUT, new THREE.Vector3()), RED, 40);
    return promise;
  }

  function restoreNow(link) {
    link.anim = null;
    link.dead = false;
    link.enabled = true;
    refreshPrompts(link);
  }

  function syncFromState() {
    const lh = links.get('lighthouse');
    if (!lh || lh.anim) return;
    if (state.stage >= 5 && lh.dead) restoreNow(lh);
    else if (state.stage < 5 && !lh.dead) {
      lh.enabled = false;
      lh.dead = true;
      refreshPrompts(lh);
    }
  }

  for (const id of WORLD_LINKS) {
    const z = world.zones[id];
    if (!z?.hubEnd || !z.arrival) continue;
    add({ id, a: z.hubEnd, b: z.arrival, label: zoneName(id), labelBack: zoneName('hub'), zone: id, enabled: id !== 'lighthouse' || state.stage >= 5 });
  }

  events.on('game:start', ({ newGame } = {}) => {
    if (!newGame) syncFromState();
  });
  events.on('stage:change', ({ instant } = {}) => {
    if (instant) syncFromState();
  });

  return {
    get(id) {
      const link = links.get(id);
      return link ? describe(link) : null;
    },
    add,
    setEnabled,
    ride: ride_,
    get riding() {
      return ride ? ride.link.id : null;
    },
    curveOf(id) {
      if (dirty) rebuild();
      return links.get(id)?.curve || null;
    },

    start() {
      if (dirty) rebuild();
      if (ctx.has('particles')) {
        dangleEmitter = ctx.particles.emitter({
          position: dangleTip, rate: 7, color: '#ff4b3e', color2: '#ffd36b', shape: 'spark',
          speed: [1, 4], spread: 0.8, life: [0.25, 0.8], size: [0.03, 0.08], gravity: -9, drag: 0.4,
        });
      }
    },

    fixedUpdate(dt) {
      if (ride) stepRide(dt);
    },

    update(dt) {
      for (const link of links.values()) {
        if (!link.anim) continue;
        link.anim.t += dt;
        if (link.anim.t >= RESTORE) {
          const { resolve } = link.anim;
          restoreNow(link);
          events.emit('link:restored', { id: link.id });
          resolve(true);
        }
      }
      if (dangleEmitter) {
        const lh = links.get('lighthouse');
        dangleEmitter.enabled = Boolean(lh && lh.dead && !lh.anim);
      }
    },

    frame() {
      if (dirty) rebuild();
      updateVisuals();
    },

    dispose() {
      dangleEmitter?.stop();
      for (const link of links.values()) link.interacts.forEach(({ handle }) => handle.remove());
      scene.remove(group);
    },
  };
}
