import * as THREE from 'three';
import '../src/core/fonts.js';
import { boot } from '../src/boot.js';
import { sharedUniforms } from '../src/core/glsl.js';

const params = new URLSearchParams(location.search);
const BOT_COUNT = Number(params.get('bots') || 30);

function showroom(ctx) {
  const { scene, props, bots, world, text } = ctx;
  const Y = world.zones.hub.y;
  const items = {};
  const at = (x, z, y = null) => new THREE.Vector3(x, y, z);
  const label = (name, x, z, h = 2.9) => {
    const m = text.panel({ style: 'label', title: name, size: [1.8, 0.45], accent: '#0b0d10', emissive: 1 });
    m.position.set(x, world.heightAt(x, z) + h, z);
    scene.add(m);
  };
  const reg = (name, pos, h = 1) => {
    items[name] = { pos: pos.clone(), h };
  };

  const Z = -20;
  const row = [
    ['crate', -9], ['bale', -7], ['pave', -5.2], ['barrel', -3.6], ['plank', -1.8],
    ['lantern', 0], ['sign', 1.8], ['crt', 4.2], ['kiosk', 6.2], ['pedestal', 8.2],
  ];
  const spot = Object.fromEntries(row);
  for (const [name, x] of row) {
    label(name, x, Z, name === 'kiosk' || name === 'sign' ? 3.2 : 2.6);
    reg(name, at(x, Z, world.heightAt(x, Z)), name === 'kiosk' || name === 'sign' ? 1.5 : 0.5);
  }
  props.crate(at(spot.crate, Z), { rotationY: 0.3 });
  props.bale(at(spot.bale, Z), { rotationY: 0.4 });
  props.pave(at(spot.pave, Z), { rotationY: -0.35 });
  props.barrel(at(spot.barrel, Z));
  props.plank(at(spot.plank, Z), { length: 2.2, rotationY: 0.5 });
  props.lantern(at(spot.lantern, Z), { color: '#ffb454', intensity: 1 });
  props.sign(at(spot.sign, Z), 0, { text: ["Page d'accueil", '↑ Le Fil', '→ La Ferme à contenus', '← Le Vieux Web'] });
  props.terminal(at(spot.crt, Z - 0.3), 0, { style: 'crt' });
  props.terminal(at(spot.kiosk, Z), 0, { style: 'kiosk' });
  const showPed = props.pedestal(at(spot.pedestal, Z), { label: 'Ouvrage humain' });
  items.pedestal.top = showPed.top;

  const pedPos = at(12, -32);
  const ped = props.pedestal(pedPos, { label: 'Un pavé' });
  const resting = props.pave(ped.top.clone().setY(ped.top.y + 0.16), { rotationY: 0.4 });
  reg('pedestal2', at(12, -32, world.heightAt(12, -32)), 0.6);

  const stackBase = at(24, -20);
  const crates = [];
  let n = 0;
  for (let layer = 0; layer < 3; layer++) {
    const count = [5, 4, 3][layer];
    for (let i = 0; i < count; i++) {
      const x = stackBase.x + (i - (count - 1) / 2) * 1.35;
      crates.push(props.crate(at(x, stackBase.z, Y + 3 + layer * 1.15 + (n++ % 2) * 0.04), { size: 1, rotationY: (n * 0.37) % 1 }));
    }
  }
  reg('stack', at(24, -20, Y), 0.8);

  const bales = [];
  for (let i = 0; i < 6; i++) {
    const layer = i < 3 ? 0 : i < 5 ? 1 : 2;
    const idx = layer === 0 ? i : layer === 1 ? i - 3 : 0;
    const x = -26 + (idx - (layer === 0 ? 1 : layer === 1 ? 0.5 : 0)) * 1.5;
    bales.push(props.bale(at(x, -20, Y + 3 + layer * 1.3), { rotationY: 0.2 * i }));
  }
  reg('bales', at(-26, -20, Y), 0.8);

  const paves = [];
  for (let i = 0; i < 5; i++) paves.push(props.pave(at(-2 + i * 0.7, -30, Y + 1.5 + i * 0.1), { rotationY: i * 0.5 }));
  reg('paves', at(0, -30, Y), 0.3);

  const swingPos = at(-8, -32);
  const swing = props.sign(swingPos, 0, { text: ['Vérifié', '✓ 100 % authentique'], swinging: true });
  reg('swing', at(-8, -32, world.heightAt(-8, -32)), 1.6);

  const pairTex = [
    { style: 'oldweb', title: 'Bienvenue chez Mathieu !!', meta: '214', footer: "Signez mon livre d'or !", body: ['Ma page perso sur les dinosaures, les modems et mon chat Pixel.', '> Mes liens préférés', '> Ma collection de GIF'] },
    { style: 'post', author: 'Lumière Bien-Être', handle: '@lumiere.officiel', meta: 'il y a 3 s', footer: '4 000 réponses', body: 'Voici 7 astuces que personne ne vous dit pour être enfin authentique.', width: 512, height: 1024 },
  ];
  const termA = props.terminal(at(4, -32), 0.3, { style: 'crt', texture: text.texture({ ...pairTex[0], width: 512, height: 400 }) });
  const termB = props.terminal(at(7.5, -32), -0.3, { style: 'kiosk', texture: text.texture(pairTex[1]) });
  reg('terminalA', at(4, -32, world.heightAt(4, -32)), 0.9);
  reg('terminalB', at(7.5, -32, world.heightAt(7.5, -32)), 1.4);

  const gx = -14;
  const gz = -32;
  const gy = world.heightAt(gx, gz);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 10), ctx.mat.standard({ color: '#7d5733', roughness: 0.9 }));
  post.position.set(gx, gy + 1.6, gz);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.1), post.material);
  arm.position.set(gx + 0.6, gy + 3.2, gz);
  scene.add(post, arm);
  ctx.physics.addStaticBox({ position: post.position, size: [0.2, 3.2, 0.2] });
  props.lantern(new THREE.Vector3(gx + 1.1, gy + 3.15, gz), { hanging: true, color: '#ffb454' });
  reg('hanging', new THREE.Vector3(gx + 1.1, gy + 2.2, gz), 0.2);

  const groups = [
    { center: [-30, 12], behavior: 'wander', name: 'wander' },
    { center: [30, 12], behavior: 'mill', name: 'mill' },
    { center: [-16, 34], behavior: 'queue', name: 'queue' },
    { center: [18, 34], behavior: 'stare', name: 'stare' },
  ];
  const botGroups = groups.map((g) => {
    reg(`bots-${g.name}`, new THREE.Vector3(g.center[0], world.heightAt(g.center[0], g.center[1]), g.center[1]), 1.5);
    return bots.spawn({ center: g.center, radius: 11, count: BOT_COUNT, behavior: g.behavior });
  });

  let scanning = false;
  const scan = {
    fire(origin) {
      const o = origin || ctx.camera.position;
      sharedUniforms.uScan.value.set(o.x, o.y, o.z, 0);
      scanning = true;
    },
    setRadius(r, origin) {
      const o = origin || ctx.camera.position;
      sharedUniforms.uScan.value.set(o.x, o.y, o.z, r);
      scanning = false;
    },
  };
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyF') scan.fire();
    if (e.code === 'KeyV') props.crate(new THREE.Vector3(swingPos.x + 0.2, world.heightAt(swingPos.x, swingPos.z) + 1.9, swingPos.z + 3.2), { size: 0.7 }).setVelocity([0, 0.5, -7]);
  });

  return {
    items, crates, bales, paves, resting, swing, termA, termB, botGroups, scan,
    update(dt) {
      if (!scanning) return;
      const u = sharedUniforms.uScan.value;
      u.w += 60 * dt;
      if (u.w > 140) {
        u.w = -1;
        scanning = false;
      }
    },
    view(name, { dist = 2.6, side = 0.35, up = 0.4, from = 'south' } = {}) {
      const it = items[name];
      const fly = ctx.debug.flycam;
      const p = it.pos;
      const dir = from === 'south' ? new THREE.Vector3(side, 0, 1).normalize() : new THREE.Vector3(Math.sin(side), 0, Math.cos(side));
      fly.setPose(p.x + dir.x * dist, p.y + it.h + up, p.z + dir.z * dist);
      fly.lookAt(p.x, p.y + it.h * 0.9, p.z);
    },
    pose(x, y, z, tx, ty, tz) {
      const fly = ctx.debug.flycam;
      fly.setPose(x, y, z);
      fly.lookAt(tx, ty, tz);
    },
    summary() {
      const all = [...crates, ...bales, ...paves, resting];
      return { total: all.length, asleep: all.filter((e) => e.sleeping).length, awake: all.filter((e) => !e.sleeping).map((e) => e.userData.kind) };
    },
    stats: () => ctx.debug.stats(),
  };
}

const ctx = await boot({ systems: ['props', 'bots'], nosave: true, freecam: true, extra: [{ name: 'propsDemo', create: showroom }], spawn: [0, 38, -8, 0] });
window.__props = ctx.propsDemo;
ctx.propsDemo.pose(0, ctx.world.zones.hub.y + 2.2, -12, 0, ctx.world.zones.hub.y + 1, -20);
