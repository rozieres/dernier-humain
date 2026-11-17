import * as THREE from 'three';

const W = 5.6;
const H = 3.4;
const T = 0.14;
const TEX_W = 1024;
const TEX_H = Math.round((TEX_W * H) / W);
const BTN = { w: 2.15, h: 0.52, y: -1.06, gap: 0.24 };

const stripEmoji = (s) => String(s).replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawCookie(c, x, y, r) {
  c.save();
  c.translate(x, y);
  c.fillStyle = '#d9a35b';
  c.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const k = r * (1 + 0.04 * Math.sin(a * 7) + 0.03 * Math.sin(a * 3 + 1));
    if (i === 0) c.moveTo(Math.cos(a) * k, Math.sin(a) * k);
    else c.lineTo(Math.cos(a) * k, Math.sin(a) * k);
  }
  c.fill();
  c.globalCompositeOperation = 'destination-out';
  c.beginPath();
  c.arc(r * 0.78, -r * 0.62, r * 0.42, 0, Math.PI * 2);
  c.fill();
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#5a3a22';
  for (const [u, v, s] of [[-0.4, -0.2, 0.13], [0.15, 0.3, 0.15], [-0.1, -0.55, 0.1], [0.45, 0.05, 0.11], [-0.5, 0.35, 0.1], [0.05, -0.05, 0.08]]) {
    c.beginPath();
    c.ellipse(u * r, v * r, s * r, s * r * 0.8, u * 3, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

function cardCanvas(ctx, popup) {
  return ctx.text.canvas({
    width: TEX_W,
    height: TEX_H,
    draw(c, w, h) {
      c.clearRect(0, 0, w, h);
      roundRect(c, 0, 0, w, h, 46);
      c.fillStyle = '#ffffff';
      c.fill();
      drawCookie(c, 96, 104, 46);
      c.fillStyle = '#111827';
      c.font = '600 46px Inter';
      c.textBaseline = 'middle';
      c.fillText(stripEmoji(popup.title), 172, 106);
      c.font = '400 31px Inter';
      c.fillStyle = '#3d4452';
      c.textBaseline = 'alphabetic';
      const lines = ctx.text.wrap(c, popup.body, w - 140);
      lines.forEach((l, i) => c.fillText(l, 70, 210 + i * 44));
      c.fillStyle = '#e6e9ef';
      c.fillRect(70, 186, w - 140, 2);
    },
  });
}

function buttonCanvas(ctx, label) {
  return ctx.text.canvas({
    width: 512,
    height: Math.round((512 * BTN.h) / BTN.w),
    draw(c, w, h) {
      roundRect(c, 0, 0, w, h, h / 2);
      c.fillStyle = '#2e7dff';
      c.fill();
      c.fillStyle = '#ffffff';
      c.font = '600 40px Inter';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(label, w / 2, h / 2 + 1);
    },
  });
}

function slabGeometry(w, h, depth, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(w / 2, h / 2 - r);
  s.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, false);
  s.lineTo(-w / 2 + r, h / 2);
  s.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-w / 2, -h / 2 + r);
  s.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, (Math.PI * 3) / 2, false);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}

function texOf(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function createCookieBanner(ctx, { position, yaw, onDismiss }) {
  const { mat, physics, scene, state } = ctx;
  const popup = ctx.has('texts') && ctx.texts.POPUPS?.[0] ? ctx.texts.POPUPS[0] : { title: 'Cookies', body: '', cta: 'OK', cta2: 'OK' };
  const root = new THREE.Group();
  root.name = 'hub:cookie';
  root.position.copy(position);
  root.rotation.y = yaw;
  root.visible = false;
  scene.add(root);

  const shell = mat.physical({ color: '#ffffff', roughness: 0.3, metalness: 0, clearcoat: 0.6, emissive: '#ffffff', emissiveIntensity: 0.05 });
  const body = new THREE.Mesh(slabGeometry(W, H, T, 0.22), shell);
  body.castShadow = true;
  const cardTex = texOf(cardCanvas(ctx, popup));
  const faceMat = mat.basic({ map: cardTex, transparent: true });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), faceMat);
  face.position.z = T / 2 + 0.032;
  root.add(body, face);

  const buttons = [];
  const colliders = [];
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const toWorld = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(q).add(position);
  let phase = 'hidden';
  let t = 0;
  let hinted = false;

  function dismiss() {
    if (phase !== 'shown' && phase !== 'appearing') return;
    phase = 'closing';
    t = 0;
    ctx.audio.sfx('popup.close', { position: root.position });
    for (const b of buttons) b.handle.userData.clickable.enabled = false;
  }

  [popup.cta, popup.cta2 || popup.cta].forEach((label, i) => {
    const x = (i === 0 ? -1 : 1) * (BTN.w / 2 + BTN.gap / 2);
    const tex = texOf(buttonCanvas(ctx, label));
    tex.repeat.set(1 / BTN.w, 1 / BTN.h);
    tex.offset.set(0.5, 0.5);
    const geo = slabGeometry(BTN.w, BTN.h, 0.05, BTN.h / 2 - 0.01);
    const btnMat = mat.standard({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.18, roughness: 0.35, metalness: 0 });
    const mesh = new THREE.Mesh(geo, btnMat);
    mesh.position.set(x, BTN.y, T / 2 + 0.05);
    root.add(mesh);
    const handle = physics.addStaticBox({
      position: toWorld(x, BTN.y, T / 2 + 0.06), size: [BTN.w, BTN.h, 0.12], quaternion: q,
      userData: { kind: 'popup', clickable: { label, object: mesh, enabled: true, onClick: dismiss } },
    });
    buttons.push({ mesh, handle, base: mesh.position.clone() });
    colliders.push(handle);
  });
  const ground = ctx.world.heightAt(position.x, position.z);
  const top = position.y + H / 2;
  colliders.push(physics.addStaticBox({
    position: toWorld(0, (ground + top) / 2 - position.y, 0), size: [W, top - ground, T + 0.1], quaternion: q, userData: { kind: 'popup' },
  }));

  const scanHandle = ctx.scanner.register?.({ object: root, kind: 'synthetic', label: stripEmoji(popup.title) });

  function remove() {
    phase = 'gone';
    for (const c of colliders) c.remove();
    colliders.length = 0;
    scanHandle?.remove?.();
    scene.remove(root);
    root.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.map?.dispose();
        if (o.material !== shell) o.material.dispose();
      }
    });
    cardTex.dispose();
  }

  function burst() {
    const c = root.position;
    ctx.particles.burst({
      position: c, count: 110, color: '#ffffff', color2: '#dfe6f2', shape: 'paper', speed: [2, 7], spread: 1,
      life: [1.4, 2.8], size: [0.1, 0.24], gravity: -4, drag: 0.7, radius: 1.6, spin: 6,
    });
    ctx.particles.burst({
      position: c, count: 26, color: '#d9a35b', color2: '#5a3a22', shape: 'paper', speed: [1.5, 4.5], spread: 1,
      life: [1.0, 2.2], size: [0.06, 0.12], gravity: -6, drag: 0.6, radius: 1.0,
    });
    ctx.particles.burst({ position: c, count: 30, color: '#5ce1e6', color2: '#ffffff', shape: 'spark', speed: [3, 8], spread: 1, life: [0.3, 0.8], size: [0.03, 0.08], gravity: -2, drag: 0.8 });
  }

  return {
    root,
    get state() {
      return phase;
    },
    buttons,
    show() {
      if (phase !== 'hidden') return;
      phase = 'appearing';
      t = 0;
      root.visible = true;
      root.scale.setScalar(0.001);
    },
    dismiss,
    remove() {
      if (phase !== 'gone') remove();
    },
    update(dt, night) {
      if (phase === 'hidden' || phase === 'gone') return;
      t += dt;
      shell.emissiveIntensity = 0.03 + 0.18 * night;
      faceMat.color.setScalar(1 + 0.12 * night);
      if (phase === 'appearing') {
        if (t > 0 && !root.userData.sounded) {
          root.userData.sounded = true;
          ctx.audio.sfx('popup.open', { position: root.position });
        }
        const k = Math.min(1, t / 0.45);
        const s = 1 + 1.70158 * (k - 1) ** 3 + 0.70158 * (k - 1) ** 2;
        root.scale.setScalar(Math.max(0.001, s));
        if (k >= 1) phase = 'shown';
      } else if (phase === 'shown') {
        root.position.y = position.y + Math.sin(t * 1.3) * 0.04;
        if (!hinted && ctx.has('cursor') && buttons.some((b) => ctx.cursor.target?.object === b.mesh)) {
          hinted = true;
          ctx.ui.hint([ctx.input.label('Mouse0')], 'Cliquer', 5);
        }
      } else if (phase === 'closing') {
        const k = Math.min(1, t / 0.16);
        root.scale.set(1 + 0.08 * k, 1 - 0.85 * k, 1);
        if (k >= 1) {
          burst();
          remove();
          state.setFlag('zone.hub.cookie', true);
          onDismiss?.();
        }
      }
    },
  };
}
