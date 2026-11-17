import * as THREE from 'three';
import { Builder, lathe, nz, PI, smooth, ashlarTexture, graniteTexture } from './kit.js';
import { beamMaterial, sweepMaterial, lensMaterial, glowSprite } from './shaders.js';

export const TOWER = {
  shaftTop: 36,
  gallery: 38.2,
  lensY: 42.4,
  height: 46.4,
  knoll: 8,
  scale: 1.3,
};

const BEAM_LENGTH = 900;
const BEAM_TILT = 0.034;
const ROT_PERIOD = 20;

function shaftRadius(h) {
  const t = h / TOWER.shaftTop;
  return 4.35 - 1.45 * Math.pow(t, 0.82);
}

function seaTextTexture(ctx) {
  const lines = ctx.texts.SEA_LINES || [];
  const el = ctx.text.canvas({
    width: 1024,
    height: 512,
    draw(c, w, h) {
      c.fillStyle = '#000';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff';
      c.font = '500 22px "Inter"';
      let k = 0;
      for (let y = 26; y < h; y += 32) {
        let x = -((y * 37) % 160);
        while (x < w) {
          const line = lines[k++ % Math.max(1, lines.length)] || '';
          c.fillText(line, x, y);
          x += c.measureText(line).width + 40;
        }
      }
    },
  });
  const tex = new THREE.CanvasTexture(el);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function buildTower(ctx, { position }) {
  const { scene, physics, mat } = ctx;
  const root = new THREE.Group();
  root.position.copy(position);
  scene.add(root);

  const ashlar = ashlarTexture('lh-tower', { rows: 8, cols: 4 });
  const granite = graniteTexture('lh-knoll');
  const stoneMat = mat.standard({ map: ashlar, bumpMap: ashlar, bumpScale: 1.4, vertexColors: true, roughness: 0.9, metalness: 0 });
  const rockMat = mat.standard({ map: granite, bumpMap: granite, bumpScale: 2, vertexColors: true, roughness: 0.95, metalness: 0 });
  const paintMat = mat.standard({ vertexColors: true, roughness: 0.55, metalness: 0.25 });

  const kb = new Builder(301);
  const knollPts = [[16.5, -4.5], [15.2, -1.6], [13.6, 1.4], [11.2, 4.1], [9.0, 6.2], [7.6, 7.4], [6.9, TOWER.knoll], [0, TOWER.knoll]];
  const knoll = lathe(knollPts, 48);
  const kp = knoll.attributes.position;
  for (let i = 0; i < kp.count; i++) {
    const x = kp.getX(i);
    const y = kp.getY(i);
    const z = kp.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 7.0) continue;
    const a = Math.atan2(z, x);
    const k = smooth(7.0, 9, r) * smooth(0.18, 0.4, Math.abs(Math.atan2(z, x)));
    const bump = (1 - 0.12 * (1 - smooth(0.18, 0.4, Math.abs(Math.atan2(z, x)))) * smooth(7.0, 8, r)) + 0.14 * nz(Math.cos(a) * 3, Math.sin(a) * 3, y * 0.3, 1) * k + 0.07 * nz(x * 0.5, z * 0.5, y * 0.5, 1) * k;
    kp.setXYZ(i, x * bump, y + 0.9 * nz(x * 0.25, z * 0.25, 2, 1) * k, z * bump);
  }
  knoll.computeVertexNormals();
  kb.add(knoll, { color: '#9d978d', vary: 0.18, uvScale: [8, 3] });
  const boulder = (seed) => {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const k = 1 + 0.2 * nz(x * 1.3 + seed, y * 1.3, z * 1.3, 1) + 0.07 * nz(x * 4, y * 4 + seed, z * 4, 1);
      p.setXYZ(i, x * k, y * k, z * k);
    }
    g.computeVertexNormals();
    return g;
  };
  const br = (() => {
    let s = 77;
    return () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
  })();
  for (let i = 0; i < 16; i++) {
    const a = 0.45 + (i / 16) * (PI * 2 - 0.9) + (br() - 0.5) * 0.2;
    const rr = 10.5 + br() * 4.5;
    const sc = 2.2 + br() * 2.6;
    const y = 3.6 - (rr - 10.5) * 1.0 - sc * 0.35 + br() * 1.5;
    kb.add(boulder(i * 3.7), { pos: [Math.cos(a) * rr, y, Math.sin(a) * rr], rot: [br() * 3, br() * 3, br() * 3], scale: [sc * (1 + br() * 0.4), sc * (0.6 + br() * 0.3), sc], color: '#a19b90', vary: 0.2 });
  }
  const steps = [];
  for (let i = 0; i < 18; i++) {
    const h = (i + 1) * (TOWER.knoll / 18);
    const x = 14.4 - i * 0.46;
    steps.push({ x, h });
    kb.box(0.62, h + 1.6, 2.2, { radius: 0.07, segments: 2, pos: [x, h / 2 - 0.8, 0], color: '#aca79e', vary: 0.12, jitter: 0.015 });
  }
  const knollMesh = new THREE.Mesh(kb.build(), rockMat);
  knollMesh.castShadow = true;
  knollMesh.receiveShadow = true;
  root.add(knollMesh);

  const body = new THREE.Group();
  body.position.y = TOWER.knoll;
  body.scale.setScalar(TOWER.scale);
  root.add(body);

  const tb = new Builder(302);
  const prof = [[4.9, 0], [4.9, 1.1], [4.6, 1.35], [4.45, 1.5]];
  for (let i = 0; i <= 24; i++) {
    const h = 1.5 + (TOWER.shaftTop - 1.5) * (i / 24);
    prof.push([shaftRadius(h), h]);
  }
  prof.push([shaftRadius(TOWER.shaftTop) + 0.25, TOWER.shaftTop + 0.4], [3.55, TOWER.gallery - 0.9], [3.85, TOWER.gallery - 0.35], [3.95, TOWER.gallery], [0, TOWER.gallery]);
  const bands = [[9, 36.6, 0], [16.5, 21.5, 1], [26.5, 31.5, 1]];
  tb.add(lathe(prof, 48), {
    color: '#ffffff', vary: 0.05, uvScale: [6.5, 9.5],
    shade(c, x, y, z) {
      const a = Math.atan2(z, x);
      const streak = 0.5 + 0.5 * nz(Math.cos(a) * 9, Math.sin(a) * 9, y * 0.05, 1);
      const drip = 2.2 * (streak - 0.5);
      const stone = new THREE.Color('#948d82');
      const white = new THREE.Color('#f6f2e8').multiplyScalar(1.25 + 0.15 * streak);
      const black = new THREE.Color('#1c1d20').multiplyScalar(0.9 + 0.3 * streak);
      let k = smooth(bands[0][0] - 1, bands[0][0] + 1, y + drip) * (1 - smooth(bands[0][1], bands[0][1] + 0.4, y));
      c.copy(stone).lerp(white, k);
      for (const [y0, y1] of bands.slice(1)) {
        const b = smooth(y0 - 0.15, y0 + 0.15, y - drip * 0.15) * (1 - smooth(y1 - 0.15, y1 + 0.15, y - drip * 0.15));
        c.lerp(black, b * k);
      }
      const grime = smooth(0.6, 0.95, streak) * 0.3 * k;
      c.multiplyScalar(1 - grime);
    },
  });
  tb.add(lathe([[2.75, TOWER.gallery], [2.75, TOWER.gallery + 1.9], [2.55, TOWER.gallery + 2.1], [0, TOWER.gallery + 2.1]], 32), { color: '#e8e2d6', vary: 0.07, uvScale: [3, 0.6] });
  for (let i = 0; i < 6; i++) {
    const h = 6 + i * 5.2;
    const r = shaftRadius(h);
    const a = (i % 2 ? 0.25 : -0.2);
    tb.box(0.55, 1.05, 0.5, { radius: 0.08, pos: [Math.cos(a) * (r - 0.12), h, Math.sin(a) * (r - 0.12)], rot: [0, -a, 0], color: '#2a2622', vary: 0.05 });
    tb.box(0.75, 0.12, 0.62, { radius: 0.03, pos: [Math.cos(a) * (r - 0.05), h - 0.6, Math.sin(a) * (r - 0.05)], rot: [0, -a, 0], color: '#9a9389', vary: 0.1 });
  }
  tb.box(0.6, 2.2, 1.6, { radius: 0.12, segments: 2, pos: [4.55, 1.1 + 1.15, 0], color: '#a39d92' });
  tb.box(0.3, 2.0, 1.2, { radius: 0.05, pos: [4.75, 1.1 + 1.05, 0], color: '#5c2f26', vary: 0.12 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2;
    tb.box(0.45, 0.9, 0.36, { radius: 0.05, pos: [Math.cos(a) * 3.25, TOWER.gallery - 0.95, Math.sin(a) * 3.25], rot: [0, -a, 0], color: '#a49d91', vary: 0.1 });
  }
  const shaft = new THREE.Mesh(tb.build(), stoneMat);
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  body.add(shaft);

  const pb = new Builder(303);
  const red = '#7d2b22';
  const lb = TOWER.gallery + 2.1;
  pb.add(lathe([[2.5, lb], [2.5, lb + 0.75], [2.42, lb + 0.8], [0, lb + 0.8]], 32), { color: red, vary: 0.12 });
  const glassBottom = lb + 0.8;
  const glassTop = glassBottom + 3.3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * PI * 2 + PI / 12;
    pb.box(0.09, glassTop - glassBottom, 0.09, { radius: 0.02, pos: [Math.cos(a) * 2.38, (glassBottom + glassTop) / 2, Math.sin(a) * 2.38], rot: [0, -a, 0], color: red, vary: 0.1 });
  }
  for (const y of [glassBottom + 1.1, glassBottom + 2.2]) pb.add(new THREE.TorusGeometry(2.38, 0.035, 6, 48), { pos: [0, y, 0], rot: [PI / 2, 0, 0], color: red, vary: 0.1 });
  pb.add(lathe([[2.75, glassTop - 0.05], [2.8, glassTop + 0.15], [2.45, glassTop + 0.55], [1.7, glassTop + 1.25], [0.9, glassTop + 1.65], [0.35, glassTop + 1.85], [0, glassTop + 1.9]], 40), { color: red, vary: 0.14 });
  pb.add(new THREE.SphereGeometry(0.32, 16, 10), { pos: [0, glassTop + 2.05, 0], color: '#3a3532', vary: 0.1 });
  pb.cyl(0.035, 0.05, 2.2, { seg: 6, pos: [0, glassTop + 3.1, 0], color: '#2c2a28' });
  pb.add(new THREE.ConeGeometry(0.22, 0.5, 4), { pos: [0.18, glassTop + 3.5, 0], rot: [0, 0, PI / 2], color: '#2c2a28' });
  pb.add(new THREE.TorusGeometry(3.9, 0.05, 6, 64), { pos: [0, TOWER.gallery + 1.05, 0], rot: [PI / 2, 0, 0], color: '#1f2a26', vary: 0.08 });
  pb.add(new THREE.TorusGeometry(3.9, 0.035, 6, 64), { pos: [0, TOWER.gallery + 0.55, 0], rot: [PI / 2, 0, 0], color: '#1f2a26', vary: 0.08 });
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * PI * 2;
    pb.cyl(0.028, 0.028, 1.05, { seg: 5, pos: [Math.cos(a) * 3.9, TOWER.gallery + 0.525, Math.sin(a) * 3.9], color: '#1f2a26', vary: 0.08 });
  }
  const paint = new THREE.Mesh(pb.build(), paintMat);
  paint.castShadow = true;
  body.add(paint);

  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(2.36, 2.36, glassTop - glassBottom, 24, 1, true),
    mat.standard({ color: '#1a2428', roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 }),
  );
  glass.position.y = (glassTop + glassBottom) / 2;
  glass.renderOrder = 3;
  body.add(glass);

  const pivot = new THREE.Group();
  pivot.position.y = TOWER.lensY;
  body.add(pivot);

  const lensPts = [[0.25, -1.25], [0.9, -1.2]];
  for (let i = 0; i < 9; i++) {
    const y0 = -1.1 + i * 0.27;
    const bulge = 1 - Math.abs(y0 + 0.1) * 0.25;
    lensPts.push([1.12 * bulge, y0], [0.98 * bulge, y0 + 0.2]);
  }
  lensPts.push([0.95, 1.35], [0.5, 1.45], [0.2, 1.5]);
  const lensGeo = lathe(lensPts, 20);
  const lensMat = lensMaterial(ctx);
  const lens = new THREE.Mesh(lensGeo, lensMat);
  pivot.add(lens);
  const cage = new Builder(304);
  cage.cyl(0.9, 1.0, 0.25, { seg: 20, pos: [0, -1.38, 0], color: '#6d5a3a' });
  cage.cyl(0.18, 0.28, 2.6, { seg: 10, pos: [0, -2.6, 0], color: '#4a3f30' });
  cage.add(new THREE.TorusGeometry(1.0, 0.04, 6, 32), { pos: [0, 1.4, 0], rot: [PI / 2, 0, 0], color: '#8a7044' });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    cage.box(0.05, 2.8, 0.05, { pos: [Math.cos(a) * 1.08, 0.05, Math.sin(a) * 1.08], color: '#7a6440' });
  }
  const cageMesh = new THREE.Mesh(cage.build(), paintMat);
  pivot.add(cageMesh);

  const filamentMat = mat.glow('#ffcf8a', 0);
  const filament = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), filamentMat);
  pivot.add(filament);

  const beamGeo = (() => {
    const parts = [];
    for (const [r0, r1, gain] of [[0.55, 46, 0.32], [0.35, 16, 0.85]]) {
      const g = new THREE.CylinderGeometry(r0, r1, BEAM_LENGTH, 28, 20, true);
      g.translate(0, -BEAM_LENGTH / 2, 0);
      g.rotateZ(PI / 2);
      g.translate(0.8, 0, 0);
      const n = g.attributes.position.count;
      const t = new Float32Array(n);
      const k = new Float32Array(n).fill(gain);
      for (let i = 0; i < n; i++) t[i] = Math.max(0, g.attributes.position.getX(i) - 0.8) / BEAM_LENGTH;
      g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
      g.setAttribute('aGain', new THREE.BufferAttribute(k, 1));
      g.rotateZ(-BEAM_TILT);
      const back = g.clone();
      back.rotateY(PI);
      parts.push(g, back);
    }
    const merged = new THREE.BufferGeometry();
    const attrs = ['position', 'normal', 'aT', 'aGain'];
    for (const a of attrs) {
      const size = parts[0].attributes[a].itemSize;
      const total = parts.reduce((s, p) => s + p.attributes[a].count, 0);
      const arr = new Float32Array(total * size);
      let o = 0;
      for (const p of parts) {
        arr.set(p.attributes[a].array, o);
        o += p.attributes[a].array.length;
      }
      merged.setAttribute(a, new THREE.BufferAttribute(arr, size));
    }
    const idx = [];
    let base = 0;
    for (const p of parts) {
      for (const i of p.index.array) idx.push(i + base);
      base += p.attributes.position.count;
    }
    merged.setIndex(idx);
    merged.boundingSphere = new THREE.Sphere(new THREE.Vector3(), BEAM_LENGTH + 60);
    return merged;
  })();
  const beamMat = beamMaterial(ctx);
  const beams = new THREE.Mesh(beamGeo, beamMat);
  beams.frustumCulled = false;
  beams.renderOrder = 6;
  beams.visible = false;
  pivot.add(beams);

  const glare = glowSprite(ctx, { color: '#ffe0a6', intensity: 0, size: 3.2, minAngle: 0.012, fogKeep: 0.75, core: 9, depthBias: 4.5, beamGain: 7, beamGrow: 2.2 });
  glare.position.y = TOWER.lensY;
  body.add(glare);

  const sweepTex = seaTextTexture(ctx);
  const sweepMat = sweepMaterial(ctx, sweepTex);
  sweepMat.uniforms.uOrigin.value.set(position.x, position.z);
  const sweep = new THREE.Mesh(new THREE.RingGeometry(40, 1000, 160, 1), sweepMat);
  sweep.rotation.x = -PI / 2;
  sweep.position.set(position.x, 0.9, position.z);
  sweep.frustumCulled = false;
  sweep.renderOrder = 2;
  sweep.visible = false;
  scene.add(sweep);

  root.updateMatrixWorld(true);
  const lampWorld = pivot.getWorldPosition(new THREE.Vector3());
  const stairFoot = new THREE.Vector3(position.x + 15.2, 0, position.z);
  const sweepLightPos = new THREE.Vector3();
  const lampLight = ctx.env.lights.add({ position: lampWorld.clone(), color: '#ffd9a0', intensity: 0, distance: 40, decay: 1.4 });
  const sweepLight = ctx.env.lights.add({ position: sweepLightPos, color: '#ffe2b0', intensity: 0, distance: 70, decay: 1.2 });

  physics.addStaticTrimesh(
    new Float32Array(knollMesh.geometry.attributes.position.array.map((v, i) => v + (i % 3 === 0 ? position.x : i % 3 === 1 ? position.y : position.z))),
    new Uint32Array([...Array(knollMesh.geometry.attributes.position.count).keys()]),
    { userData: { kind: 'lighthouse', surface: 'stone' } },
  );
  const S = TOWER.scale;
  const r0 = [15.17, 0];
  const r1 = [6.89, TOWER.knoll];
  const rampA = -Math.atan2(r1[1] - r0[1], r0[0] - r1[0]);
  const nx = -Math.sin(rampA);
  const ny = Math.cos(rampA);
  physics.addStaticBox({
    position: new THREE.Vector3(position.x + (r0[0] + r1[0]) / 2 - nx * 0.1, position.y + (r0[1] + r1[1]) / 2 - ny * 0.1, position.z),
    size: [Math.hypot(r0[0] - r1[0], r1[1] - r0[1]), 0.2, 2.2],
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rampA),
    userData: { kind: 'lighthouse', surface: 'stone' },
  });
  physics.addStaticCylinder({ position: new THREE.Vector3(position.x, position.y + TOWER.knoll + 20 * S, position.z), radius: 4.6 * S, height: 40 * S, userData: { kind: 'lighthouse', surface: 'stone' } });
  physics.addStaticCylinder({ position: new THREE.Vector3(position.x, position.y + TOWER.knoll + (TOWER.gallery + 4) * S, position.z), radius: 3.95 * S, height: 8 * S, userData: { kind: 'lighthouse', surface: 'metal' } });

  const st = { lamp: 0, angle: 0.6, speed: 0, filament: 0, reduce: false };
  const beamDir = new THREE.Vector2();

  function setLamp(v) {
    st.lamp = Math.max(0, Math.min(1, v));
  }

  function update(dt) {
    const L = st.lamp;
    const targetSpeed = smooth(0.55, 1, L) * (PI * 2) / ROT_PERIOD;
    st.speed += (targetSpeed - st.speed) * Math.min(1, dt * 0.4);
    st.angle = (st.angle + st.speed * dt) % (PI * 2);
    pivot.rotation.y = st.angle;
    beamDir.set(Math.cos(st.angle), -Math.sin(st.angle));

    const fil = smooth(0, 0.25, L);
    const t = ctx.time.now;
    const flick = L < 0.3 && !st.reduce ? 0.55 + 0.45 * Math.abs(Math.sin(t * 23.0) * Math.sin(t * 7.3 + 1.0)) : 1;
    filamentMat.color.setRGB(1.0, 0.81, 0.54).multiplyScalar(fil * flick * 7);
    filament.scale.setScalar(0.6 + 0.8 * fil);
    lensMat.uniforms.uLamp.value = smooth(0.12, 0.7, L) * (L < 0.3 ? flick : 1);
    const beamK = smooth(0.5, 0.95, L);
    beams.visible = beamK > 0.001;
    beamMat.uniforms.uIntensity.value = beamK * 2.6;
    sweep.visible = beamK > 0.001;
    sweepMat.uniforms.uIntensity.value = beamK * 0.9;
    sweepMat.uniforms.uBeam.value.copy(beamDir);
    const gu = glare.material.uniforms;
    gu.uIntensity.value = fil * 0.9 * flick + smooth(0.3, 0.9, L) * 3.2;
    gu.uBeam.value.copy(beamDir);
    gu.uBeamGain.value = 7 * beamK;
    lampLight.intensity = (fil * 30 + smooth(0.3, 1, L) * 260) * flick;
    sweepLightPos.set(lampWorld.x + beamDir.x * 24, position.y + 13, lampWorld.z + beamDir.y * 24);
    sweepLight.intensity = beamK * 520;
  }

  return {
    root, body, pivot, glare, sweep, beams, lampWorld, stairFoot,
    meshes: { shaft, paint, glass, lens, knollMesh, cage: cageMesh, filament },
    steps,
    setLamp,
    get lamp() { return st.lamp; },
    set reduce(v) { st.reduce = v; },
    get angle() { return st.angle; },
    update,
  };
}
