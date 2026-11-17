import * as THREE from 'three';
import { loadSaveOnce } from '../story/save.js';
import { buildPlaza, PLAZA_R, FLOOR, ARCH } from './hub/plaza.js';
import { createSearchBar } from './hub/searchbar.js';
import { createCookieBanner } from './hub/cookie.js';
import { buildWilds } from './hub/wilds.js';

const NEAR = 350;
const ACTIVE = 110 + 150;
const CRATE_SPOT = [5.8, 5.0];
const KIOSKS = [[-7.4, 4.2, 0.55], [7.6, -4.6, -2.35]];

export default async function create(ctx) {
  loadSaveOnce(ctx);
  const { world, scene, state, events, camera } = ctx;
  const hub = world.zones.hub;
  const y0 = hub.y;
  const floorY = y0 + FLOOR;
  const rand = ctx.rng.seeded('hub');
  const colliders = [];
  const T = ctx.has('texts') ? ctx.texts : {};

  world.addClearing({ x: 0, z: 0, r: PLAZA_R + 2.5, trees: true, grass: true, rocks: true });
  world.addClearing({ x: 0, z: 0, r: 52, trees: true, grass: false, rocks: true });

  const plaza = buildPlaza(ctx, { y0, rand, colliders });
  scene.add(plaza.far, plaza.near);

  const bar = createSearchBar(ctx, { position: new THREE.Vector3(0, y0 + 5, 0) });
  scene.add(bar.group);
  ctx.scanner.register?.({ object: bar.body, kind: 'synthetic', label: 'Barre de recherche' });

  const homepage = T.SYNTH_DOCS?.hub_homepage;
  const kioskTex = homepage
    ? ctx.text.texture({
      style: 'post', width: 512, height: 1204, author: homepage.author, handle: '@accueil', meta: homepage.date,
      title: homepage.title, body: homepage.body.slice(0, 5), footer: '4 milliards de réactions',
    })
    : undefined;
  const kiosks = KIOSKS.map(([x, z, yaw], i) => {
    const k = ctx.props.terminal?.([x, floorY, z], yaw, { style: 'kiosk', texture: kioskTex });
    k?.group?.traverse?.((o) => {
      o.castShadow = false;
    });
    const at = new THREE.Vector3(x + Math.sin(yaw) * 0.5, floorY + 1.4, z + Math.cos(yaw) * 0.5);
    ctx.interact.add({
      id: `hub:kiosk:${i}`, position: at, radius: 2.8, label: 'Lire',
      onInteract: () => {
        if (homepage) ctx.ui.reader.open(homepage);
      },
    });
    ctx.scanner.register?.({ position: at, kind: 'synthetic', label: "Page d'accueil" });
    return k;
  });

  const props = [];
  if (ctx.has('props')) {
    const [cx, cz] = CRATE_SPOT;
    props.push(ctx.props.crate([cx - 0.55, floorY + 0.52, cz], { rotationY: 0.2 }));
    props.push(ctx.props.crate([cx + 0.55, floorY + 0.52, cz + 0.15], { rotationY: -0.15 }));
    props.push(ctx.props.crate([cx + 0.05, floorY + 1.54, cz + 0.05], { rotationY: 0.7, size: 0.9 }));
    props.push(ctx.props.pave([cx - 1.5, floorY + 0.17, cz - 0.6], { rotationY: 0.5 }));
  }
  const origins = props.map((e) => ({ entity: e, origin: e.position.clone(), quat: e.mesh?.quaternion.clone(), lost: 0 }));

  let cookieBanner = null;
  if (!state.flag('zone.hub.cookie')) {
    cookieBanner = createCookieBanner(ctx, {
      position: new THREE.Vector3(0, floorY + 2.2, 3.4), yaw: 0,
      onDismiss: () => ctx.companion.say('intro.cookie', { priority: 1 }),
    });
  }

  const wilds = buildWilds(ctx, { rand });
  world.addClearing({ x: wilds.peak[0], z: wilds.peak[2], r: 5, trees: true, grass: true, rocks: true });
  wilds.route.points.forEach(([x, , z], i) => {
    if (i % 3 === 0) world.addClearing({ x, z, r: 3, trees: true, grass: false, rocks: true });
  });
  world.addClearing({ x: (wilds.pier.x0 + wilds.pier.x1) / 2, z: wilds.pier.z, r: 18, trees: true, grass: false, rocks: true });
  world.addClearing({ x: wilds.pier.x0 + 3, z: wilds.pier.z, r: 5, trees: true, grass: true, rocks: true });

  if (ctx.has('traces')) {
    ctx.traces.add({ id: 'hub_welcome', position: [-ARCH.half + 0.9, floorY, ARCH.z - 1.1] });
    ctx.traces.add({ id: 'wilds_summit', position: wilds.summitTrace });
    ctx.traces.add({ id: 'wilds_pier', position: wilds.pierTrace });
  }

  const signs = [];
  for (const path of world.paths || []) {
    const pts = path.points;
    const i = pts.findIndex(([x, z]) => Math.hypot(x, z) >= 50);
    if (i < 1) continue;
    const [x, z] = pts[i];
    const [px, pz] = pts[i - 1];
    const dx = x - px;
    const dz = z - pz;
    const len = Math.hypot(dx, dz) || 1;
    const side = [-dz / len, dx / len];
    const sx = x + side[0] * ((path.width || 4) / 2 + 1.2);
    const sz = z + side[1] * ((path.width || 4) / 2 + 1.2);
    const yaw = Math.atan2(-sx, -sz);
    const zone = world.zones[path.to];
    const dist = zone?.arrival ? Math.round(Math.hypot(zone.arrival[0] - sx, zone.arrival[2] - sz) / 10) * 10 : 0;
    const name = T.ZONES?.[path.to]?.name || zone?.name || path.to;
    signs.push(ctx.props.sign?.([sx, null, sz], yaw, { text: [name, `${dist} m`] }));
  }

  if (ctx.has('bots')) {
    const greet = T.BOT_LINES?.greet || [];
    const idle = T.BOT_LINES?.idle || [];
    ctx.bots.spawn({ center: [0, 2], radius: 19, count: 34, behavior: 'wander', lines: [...greet, ...idle].slice(0, 24) });
    ctx.bots.spawn({ center: [0, -8], radius: 6.5, count: 16, behavior: 'mill', lines: greet });
  }

  ctx.env.addAtmosphere?.({ id: 'hub', center: [0, 0], radius: 70, falloff: 60, saturation: 1.05, exposure: 1.03, tint: [0.99, 1.0, 1.03] });
  const lights = [];
  if (ctx.has('env')) {
    lights.push({ h: ctx.env.lights.add({ position: new THREE.Vector3(0, y0 + 3.2, 0), color: '#dff4ff', intensity: 0, distance: 20 }), day: 0, night: 5 });
    lights.push({ h: ctx.env.lights.add({ position: new THREE.Vector3(0, y0 + 4.4, ARCH.z - 1.2), color: '#bdf5ff', intensity: 0, distance: 13 }), day: 0, night: 2.6 });
    lights.push({ h: ctx.env.lights.add({ position: new THREE.Vector3(0, y0 + 2.5, 4.8), color: '#e9f3ff', intensity: 0, distance: 10 }), day: 0, night: 1.6 });
  }

  if (!ctx.has('story') && cookieBanner) cookieBanner.show();
  events.on('game:start', ({ newGame } = {}) => {
    if (!cookieBanner) return;
    if (newGame && !state.flag('zone.hub.cookie')) setTimeout(() => cookieBanner?.show(), 900);
    else {
      cookieBanner.remove();
      cookieBanner = null;
    }
  });

  const detail = [...kiosks.map((k) => k?.group), ...signs, ...props.map((e) => e.mesh)].filter((o) => o && o.isObject3D);
  let shownNear = true;
  let west = ctx.has('links') && ctx.links.get('lighthouse')?.enabled ? 1 : 0;
  let propTimer = 1;

  function checkProps(dt) {
    propTimer -= dt;
    if (propTimer > 0) return;
    propTimer = 1;
    for (const o of origins) {
      const p = o.entity.position;
      const held = ctx.has('cursor') && ctx.cursor.held === o.entity;
      const lost = !held && (p.y < y0 - 20 || Math.hypot(p.x - o.origin.x, p.z - o.origin.z) > 70 || !Number.isFinite(p.y));
      o.lost = lost ? o.lost + 1 : 0;
      if (o.lost >= 8) {
        o.lost = 0;
        o.entity.setPosition(o.origin, o.quat);
        o.entity.setVelocity({ x: 0, y: 0, z: 0 });
      }
    }
  }

  return {
    id: 'hub',
    spawn: [hub.spawn[0], floorY, hub.spawn[2], hub.spawn[3] || 0],
    plaza,
    bar,
    wilds,
    kiosks,
    signs,
    props,
    get cookie() {
      return cookieBanner && cookieBanner.state !== 'gone' ? cookieBanner : null;
    },
    debugSolve() {
      if (cookieBanner && cookieBanner.state !== 'gone') {
        if (cookieBanner.state === 'hidden') cookieBanner.show();
        cookieBanner.dismiss();
        cookieBanner.update(1, 0);
        cookieBanner = null;
      }
      state.setFlag('zone.hub.cookie', true);
      ctx.story.debug?.skipTutorial?.();
      return true;
    },
    update(dt) {
      if (!ctx.has('player')) return;
      const p = ctx.player.position;
      if (Math.hypot(p.x, p.z) > ACTIVE) return;
      checkProps(dt);
    },
    frame(dt) {
      const night = ctx.has('env') ? ctx.env.night : 0;
      const target = ctx.has('links') && ctx.links.get('lighthouse')?.enabled ? 1 : 0;
      west += (target - west) * Math.min(1, dt * 0.6);
      const d = Math.hypot(camera.position.x, camera.position.z);
      const near = d < NEAR;
      if (near !== shownNear) {
        shownNear = near;
        plaza.near.visible = near;
        for (const o of detail) o.visible = near;
      }
      plaza.update(night, west);
      if (d < NEAR + 200) bar.update(dt, night);
      else bar.update(0, night);
      for (const l of lights) l.h.intensity = l.day + (l.night - l.day) * night;
      if (cookieBanner) {
        cookieBanner.update(dt, night);
        if (cookieBanner.state === 'gone') cookieBanner = null;
      }
      wilds.update(ctx.time.now, camera);
    },
  };
}
