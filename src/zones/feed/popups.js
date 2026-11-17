import * as THREE from 'three';
import { createPopupMaterial } from './shaders.js';
import { POPUP_ASPECT } from './atlas.js';

const MAX = 24;
const X_U = 0.41;
const X_V = 0.396;
const UPV = new THREE.Vector3(0, 1, 0);

export function createPopups(ctx, { atlas, parent }) {
  const { physics, scene } = ctx;
  const material = createPopupMaterial(ctx.mat, atlas);
  const geo = new THREE.PlaneGeometry(1, 1);
  const cell = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
  geo.setAttribute('aCell', cell);
  geo.setAttribute('aFade', fade);
  const mesh = new THREE.InstancedMesh(geo, material, MAX);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.name = 'feed:popups';
  parent.add(mesh);

  const hidden = ctx.mat.basic({ visible: false });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const xGeo = new THREE.BoxGeometry(1, 1, 0.5);
  const holder = new THREE.Group();
  holder.name = 'feed:popup-proxies';
  scene.add(holder);

  const list = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const normal = new THREE.Vector3();

  function frameOf(pp, out) {
    q.setFromAxisAngle(UPV, pp.yaw);
    right.set(1, 0, 0).applyQuaternion(q);
    normal.set(0, 0, 1).applyQuaternion(q);
    return out;
  }

  function xPosition(pp, out) {
    frameOf(pp, out);
    return out.copy(pp.pos).addScaledVector(right, X_U * pp.w).addScaledVector(UPV, X_V * pp.h).addScaledVector(normal, 0.22);
  }

  function spawn({ position, yaw, width, cellIndex, dodges = 0, kind = 'shaft', appear = 0, onClose, lift = 0 }) {
    const w = width;
    const h = width * POPUP_ASPECT;
    const pp = {
      kind, w, h, yaw, cellIndex, dodges, onClose, lift,
      pos: new THREE.Vector3().copy(position), home: new THREE.Vector3().copy(position), from: new THREE.Vector3(), to: new THREE.Vector3(),
      state: appear > 0 ? 'appear' : 'idle', t: 0, appearT: appear, scale: appear > 0 ? 0 : 1, fade: appear > 0 ? 0 : 1,
      vel: new THREE.Vector3(), tilt: 0, spin: 0, bob: Math.random() * 6, body: null, x: null, cool: 0,
    };
    const proxy = new THREE.Mesh(boxGeo, hidden);
    proxy.position.copy(pp.pos);
    proxy.quaternion.setFromAxisAngle(UPV, yaw);
    holder.add(proxy);
    pp.body = physics.addKinematic(proxy, { shape: 'box', size: [w, h, 0.3], userData: { kind: 'popup' } });
    const xp = new THREE.Mesh(xGeo, hidden);
    xp.scale.set(0.95, 0.95, 1);
    xPosition(pp, xp.position);
    xp.quaternion.copy(proxy.quaternion);
    holder.add(xp);
    pp.xUserData = { kind: 'popup-x', clickable: { label: 'Fermer', object: xp, onClick: () => close(pp) } };
    pp.x = physics.addKinematic(xp, { shape: 'box', size: [0.95, 0.95, 0.5], userData: pp.xUserData });
    list.push(pp);
    if (appear > 0) ctx.audio.sfx('popup.open', { position: pp.pos, volume: 0.8 });
    return pp;
  }

  function dropBodies(pp) {
    for (const key of ['body', 'x']) {
      const e = pp[key];
      if (!e) continue;
      e.remove();
      holder.remove(e.mesh);
      pp[key] = null;
    }
  }

  function close(pp, { silent = false } = {}) {
    if (pp.state !== 'idle' && pp.state !== 'dodge' && pp.state !== 'appear') return false;
    dropBodies(pp);
    pp.t = 0;
    if (!silent) ctx.audio.sfx('popup.close', { position: pp.pos });
    ctx.particles.burst({
      position: xPosition(pp, tmp).clone(), count: 18, color: '#ff5fa2', color2: '#5ce1e6', shape: 'spark',
      speed: [2, 6], life: [0.3, 0.8], size: [0.04, 0.1], gravity: -4,
    });
    if (pp.kind === 'shaft') {
      pp.state = 'fall';
      pp.vel.set(0, 0.5, 0);
      pp.spin = (Math.random() - 0.5) * 1.6;
    } else {
      pp.state = 'burst';
      ctx.particles.burst({
        position: pp.pos.clone(), count: 40, color: '#ffffff', color2: '#ff5fa2', shape: 'glyph',
        speed: [1.5, 5], life: [0.5, 1.2], size: [0.08, 0.18], gravity: -1, spread: 1,
      });
    }
    pp.onClose?.(pp);
    return true;
  }

  function dodge(pp) {
    frameOf(pp, tmp);
    const side = Math.random() < 0.5 ? -1 : 1;
    pp.from.copy(pp.pos);
    pp.to.copy(pp.home).addScaledVector(right, side * pp.w * 0.75).addScaledVector(UPV, (Math.random() - 0.3) * pp.h * 0.4);
    pp.state = 'dodge';
    pp.t = 0;
    pp.dodges--;
    ctx.audio.sfx('popup.dodge', { position: pp.pos });
    ctx.postfx.glitch(0.15, 0.2);
  }

  function update(dt) {
    const target = ctx.cursor.target;
    for (const pp of list) {
      pp.t += dt;
      pp.cool = Math.max(0, pp.cool - dt);
      if (pp.state === 'appear') {
        const k = Math.min(1, pp.t / pp.appearT);
        pp.scale = 1 - (1 - k) ** 3;
        pp.fade = k;
        if (k >= 1) {
          pp.state = 'idle';
          pp.t = 0;
        }
      } else if (pp.state === 'idle') {
        if (pp.dodges > 0 && pp.cool <= 0 && target?.userData === pp.xUserData) dodge(pp);
      } else if (pp.state === 'dodge') {
        const k = Math.min(1, pp.t / 0.32);
        const e = 1 - (1 - k) ** 3;
        pp.pos.lerpVectors(pp.from, pp.to, e);
        if (k >= 1) {
          pp.home.copy(pp.to);
          pp.state = 'idle';
          pp.cool = 0.9;
        }
      } else if (pp.state === 'fall') {
        pp.vel.y -= 9 * dt;
        pp.pos.addScaledVector(pp.vel, dt);
        pp.tilt += pp.spin * dt;
        pp.fade = Math.max(0, 1 - pp.t / 3);
        if (pp.t > 3 || pp.pos.y < 9) pp.state = 'gone';
      } else if (pp.state === 'burst') {
        const k = pp.t / 0.28;
        pp.scale = k < 0.4 ? 1 + k * 0.35 : Math.max(0, 1.14 * (1 - (k - 0.4) / 0.6));
        pp.fade = 1 - k * 0.7;
        if (k >= 1) pp.state = 'gone';
      }
    }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].state === 'gone') list.splice(i, 1);
  }

  function fixedUpdate() {
    for (const pp of list) {
      if (!pp.body) continue;
      const bob = pp.kind === 'shaft' ? Math.sin(ctx.time.now * 0.6 + pp.bob) * 0.35 : 0;
      p.copy(pp.pos);
      p.y += bob;
      q.setFromAxisAngle(UPV, pp.yaw);
      pp.body.moveTo(p, q);
      frameOf(pp, tmp);
      tmp.copy(p).addScaledVector(right, X_U * pp.w).addScaledVector(UPV, X_V * pp.h).addScaledVector(normal, 0.22);
      pp.x.moveTo(tmp, q);
    }
  }

  function frame() {
    let n = 0;
    for (const pp of list) {
      if (n >= MAX) break;
      const src = pp.body ? pp.body.mesh.position : pp.pos;
      q.setFromAxisAngle(UPV, pp.yaw);
      if (pp.tilt) q.multiply(qTilt.setFromAxisAngle(tmp.set(1, 0, 0.3).normalize(), pp.tilt));
      s.set(pp.w * pp.scale, pp.h * pp.scale, 1);
      m4.compose(src, q, s);
      mesh.setMatrixAt(n, m4);
      cell.setXY(n, pp.cellIndex % 4, Math.floor(pp.cellIndex / 4) % 4);
      fade.setX(n, Math.max(0.001, pp.fade));
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    cell.needsUpdate = true;
    fade.needsUpdate = true;
  }

  return {
    list, mesh, spawn, close, update, fixedUpdate, frame,
    clear() {
      for (const pp of list) dropBodies(pp);
      list.length = 0;
    },
  };
}
