import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Parts, lathe, canvasTexture, speckle, resolvePosition, impactHandler } from './kit.js';
import { GLSL } from '../../core/glsl.js';
import { seeded } from '../../core/rng.js';

const PI = Math.PI;
const BEIGE = '#d2c8ad';
const BEIGE_DARK = '#b9ae92';
const IRON = '#46484f';

const SCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const SCREEN_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.fog}
uniform sampler2D uMap;
uniform float uPower;
uniform float uMode;
uniform vec2 uAspect;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(dot(normalize(vNormalW), V), 0.0, 1.0), 3.0);
  vec3 glass = mix(vec3(0.010, 0.014, 0.014), uSkyHorizon * 0.55, 0.06 + fres * 0.55);
  vec3 col = vec3(0.0);
  vec2 uv = vUv;
  if (uMode < 0.5) {
    vec2 c = uv - 0.5;
    uv = c * (1.0 + 0.16 * dot(c, c)) + 0.5;
    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
      vec2 px = vec2(1.6 / 512.0, 0.0);
      vec3 t = texture2D(uMap, uv).rgb * 0.62 + 0.19 * (texture2D(uMap, uv + px).rgb + texture2D(uMap, uv - px).rgb);
      float sl = 0.74 + 0.26 * sin(uv.y * 240.0 * 6.2831853);
      vec3 mask = 0.9 + 0.1 * sin(uv.x * 380.0 * 6.2831853 + vec3(0.0, 2.1, 4.2));
      float roll = 1.0 + 0.06 * sin(uv.y * 4.0 - uTime * 1.7);
      float flick = 1.0 + 0.02 * sin(uTime * 47.0) + 0.012 * sin(uTime * 13.0);
      float vig = smoothstep(0.78, 0.18, length(c * vec2(1.0, 1.1)));
      col = t * sl * mask * roll * flick * (0.35 + 0.65 * vig) * 1.45 * uPower;
    }
  } else {
    vec3 t = texture2D(uMap, uv).rgb;
    float sweep = smoothstep(0.0, 0.5, 1.0 - abs(uv.x * 0.7 + uv.y * 0.5 - 0.55 - 0.1 * sin(uTime * 0.4)) * 4.0) * 0.05;
    col = (t * 0.88 + sweep) * uPower;
  }
  gl_FragColor = vec4(applyFog(col + glass, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function lanternGeometry() {
  const P = new Parts(71);
  const I = { color: IRON, metal: 0.55, vary: 0.22 };
  P.add(lathe([[0, 0], [0.115, 0], [0.122, 0.012], [0.118, 0.03], [0.1, 0.036], [0, 0.036]], 20), I);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    P.box(0.02, 0.3, 0.02, { radius: 0.006, pos: [x * 0.09, 0.18, z * 0.09], ...I });
  }
  P.add(lathe([[0.1, 0.32], [0.112, 0.325], [0.115, 0.34], [0.108, 0.352], [0.1, 0.352]], 20), I);
  P.add(lathe([[0, 0.352], [0.11, 0.352], [0.12, 0.362], [0.095, 0.388], [0.06, 0.41], [0.03, 0.428], [0.018, 0.44], [0, 0.442]], 20), { ...I, jitter: 0.0015 });
  P.add(new THREE.TorusGeometry(0.04, 0.0075, 6, 14), { ...I, pos: [0, 0.474, 0], rot: [0, 0, 0] });
  P.add(new THREE.CylinderGeometry(0.02, 0.026, 0.025, 10), { ...I, pos: [0, 0.052, 0] });
  return P.build();
}

function glassGeometry() {
  const g = new THREE.CylinderGeometry(0.085, 0.092, 0.285, 4, 1, true);
  g.rotateY(PI / 4);
  g.translate(0, 0.19, 0);
  return g;
}

function flameGeometry() {
  return lathe([[0, 0], [0.018, 0.012], [0.03, 0.04], [0.027, 0.08], [0.016, 0.125], [0.006, 0.17], [0, 0.2]], 12);
}

function chainGeometry(length) {
  const P = new Parts(81);
  const n = Math.round(length / 0.045);
  for (let i = 0; i < n; i++) {
    P.add(new THREE.TorusGeometry(0.016, 0.0045, 5, 10), { pos: [0, -i * 0.045 - 0.02, 0], rot: [0, i % 2 ? PI / 2 : 0, 0], scale: [0.8, 1.35, 1], color: IRON, metal: 0.55 });
  }
  return P.build();
}

function keyboardTexture() {
  const r = seeded('keys');
  return canvasTexture(512, 192, (c, w, h) => {
    c.fillStyle = '#b4a98d';
    c.fillRect(0, 0, w, h);
    const rows = [14, 14, 13, 12];
    rows.forEach((count, row) => {
      const kw = (w - 24) / 14;
      let x = 12 + (row === 1 ? kw * 0.3 : row === 2 ? kw * 0.6 : row === 3 ? kw * 0.9 : 0);
      for (let i = 0; i < count; i++) {
        c.fillStyle = r() < 0.12 ? '#9b9078' : '#d9cfb4';
        c.beginPath();
        c.roundRect(x + 1.5, 12 + row * 30 + 1.5, kw - 3, 26, 4);
        c.fill();
        x += kw;
      }
    });
    c.fillStyle = '#d9cfb4';
    c.beginPath();
    c.roundRect(110, 12 + 4 * 30 + 1.5, 250, 26, 4);
    c.fill();
    speckle(c, w, h, r, { count: 600, alpha: 0.1 });
  }, { repeat: false });
}

function kioskTexture(text) {
  const el = text.canvas({
    width: 512, height: 1024,
    draw(c, w, h) {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#f7fbff');
      g.addColorStop(1, '#dff3f6');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.textAlign = 'center';
      c.fillStyle = '#0b0d10';
      c.font = '700 110px "Inter"';
      c.fillText('16:00', w / 2, 170);
      c.font = '500 28px "Inter"';
      c.fillStyle = '#5a6b73';
      c.fillText('Il est toujours 16 h.', w / 2, 220);
      c.fillStyle = '#5ce1e6';
      c.beginPath();
      c.arc(w / 2, 480, 190, 0, Math.PI * 2);
      c.fill();
      c.save();
      c.beginPath();
      c.arc(w / 2, 480, 190, 0, Math.PI * 2);
      c.clip();
      c.fillStyle = '#eef6f8';
      c.beginPath();
      c.arc(w / 2, 420, 62, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(w / 2, 640, 150, 130, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
      c.fillStyle = '#0b0d10';
      c.font = '600 54px "Inter"';
      c.fillText('Bienvenue.', w / 2, 780);
      c.font = '500 30px "Inter"';
      c.fillStyle = '#5a6b73';
      c.fillText('Bienvenue. Bienvenue.', w / 2, 826);
      c.fillStyle = '#ff5fa2';
      c.beginPath();
      c.roundRect(96, 890, w - 192, 80, 40);
      c.fill();
      c.fillStyle = '#ffffff';
      c.font = '600 32px "Inter"';
      c.fillText('Continuer', w / 2, 942);
    },
  });
  const tex = new THREE.CanvasTexture(el);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function glowGradient() {
  return canvasTexture(256, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const inset = w * 0.5 * (1 - 1 / 1.6);
    c.shadowColor = 'rgba(255,255,255,1)';
    c.shadowBlur = 34;
    c.lineWidth = 14;
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.beginPath();
    c.roundRect(inset, inset, w - inset * 2, h - inset * 2, 22);
    c.stroke();
    c.stroke();
  }, { repeat: false, srgb: false });
}

function roundedRectShape(w, h, rt, rb) {
  const s = new THREE.Shape();
  const x0 = -w / 2;
  const x1 = w / 2;
  s.moveTo(x0 + rb, 0);
  s.lineTo(x1 - rb, 0);
  s.absarc(x1 - rb, rb, rb, -PI / 2, 0);
  s.lineTo(x1, h - rt);
  s.absarc(x1 - rt, h - rt, rt, 0, PI / 2);
  s.lineTo(x0 + rt, h);
  s.absarc(x0 + rt, h - rt, rt, PI / 2, PI);
  s.lineTo(x0, rb);
  s.absarc(x0 + rb, rb, rb, PI, 1.5 * PI);
  return s;
}

function curvedScreenGeometry(w, h, bulge) {
  const g = new THREE.PlaneGeometry(w, h, 20, 20);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const nx = p.getX(i) / (w / 2);
    const ny = p.getY(i) / (h / 2);
    p.setZ(i, bulge * (1 - (nx * nx + ny * ny) * 0.5));
  }
  g.computeVertexNormals();
  return g;
}

export function createStaticProps(ctx, mats, anim) {
  const { scene, physics, world, text, mat } = ctx;
  const R = {};
  const quatY = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);

  const lanternBody = lanternGeometry();
  const lanternGlass = glassGeometry();
  const lanternFlame = flameGeometry();
  const glassMat = mat.standard({ color: '#f6e2b8', emissive: '#ff9a3c', emissiveIntensity: 0.55, transparent: true, opacity: 0.34, roughness: 0.15, side: THREE.DoubleSide, depthWrite: false });
  const flameMat = mat.glow('#ffb454', 4.2);
  const coreMat = mat.glow('#fff1c8', 6);
  const chains = new Map();
  const haloTex = glowGradient();

  const synth = mat.physical({ vertexColors: true, roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06 });
  const keysMat = mat.standard({ map: keyboardTexture(), roughness: 0.6 });
  const plateMat = mat.standard({ color: '#9f9a8e', roughness: 0.85 });
  const screenAspect = new THREE.Vector2(1, 1);
  function screenMaterial(texture, mode) {
    return mat.shader({
      vertexShader: SCREEN_VERTEX,
      fragmentShader: SCREEN_FRAGMENT,
      uniforms: { uMap: { value: texture }, uPower: { value: 1 }, uMode: { value: mode }, uAspect: { value: screenAspect } },
    });
  }

  function averageColor(tex) {
    const c = document.createElement('canvas');
    c.width = c.height = 4;
    const g = c.getContext('2d');
    g.drawImage(tex.image, 0, 0, 4, 4);
    const d = g.getImageData(0, 0, 4, 4).data;
    let r = 0;
    let gg = 0;
    let b = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      gg += d[i + 1];
      b += d[i + 2];
    }
    const k = 1 / (16 * 255);
    return new THREE.Color().setRGB(r * k, gg * k, b * k, THREE.SRGBColorSpace);
  }

  function terminalApi(group, screen, halo, led, defaults) {
    let power = 1;
    const api = {
      group,
      screen,
      setTexture(t) {
        screen.material.uniforms.uMap.value = t;
        if (halo && t?.image) {
          const avg = averageColor(t);
          const m = Math.max(avg.r, avg.g, avg.b, 0.05);
          halo.material.color.copy(avg).multiplyScalar(defaults.halo / m);
        }
      },
      setPower(v) {
        power = Math.min(1, Math.max(0, v));
        screen.material.uniforms.uPower.value = power;
        if (halo) halo.material.opacity = power * defaults.haloOpacity;
        if (led) led.visible = power > 0.02;
        group.userData.power = power;
      },
    };
    return api;
  }

  function haloMesh(w, h, opacity, z) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat.basic({ map: haloTex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, color: '#ffffff' }));
    m.position.z = z;
    m.renderOrder = 3;
    return m;
  }

  return {
    lantern(position, { color = '#ffb454', intensity = 1, hanging = false, rotationY = 0 } = {}) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(lanternBody, mats.iron);
      const glass = new THREE.Mesh(lanternGlass, glassMat);
      const flame = new THREE.Mesh(lanternFlame, color === '#ffb454' ? flameMat : mat.glow(color, 4.2));
      const core = new THREE.Mesh(lanternFlame, coreMat);
      core.scale.setScalar(0.5);
      flame.position.y = core.position.y = 0.075;
      body.castShadow = true;
      group.add(body, glass, flame, core);
      group.userData.kind = 'lantern';
      group.rotation.y = rotationY;
      const pivot = new THREE.Group();
      pivot.userData.kind = 'lantern';
      let root = group;
      const base = resolvePosition(position, world, 0);
      let reach = 0;
      if (hanging) {
        const length = 0.55;
        if (!chains.has(length)) chains.set(length, chainGeometry(length));
        const chain = new THREE.Mesh(chains.get(length), mats.iron);
        pivot.add(chain, group);
        group.position.y = -length - 0.5;
        pivot.position.copy(base);
        root = pivot;
        reach = -length - 0.5 + 0.075;
      } else group.position.copy(base);
      scene.add(root);

      let light = null;
      if (ctx.has('env')) {
        const at = new THREE.Vector3(base.x, base.y + (hanging ? reach : 0.14), base.z);
        light = ctx.env.lights.add({ position: at, color, intensity, distance: 12, flicker: 0.25 });
      }
      const seed = base.x * 0.37 + base.z * 0.91;
      const wp = new THREE.Vector3();
      anim.add((t) => {
        const f = 1 + 0.1 * Math.sin(t * 9.3 + seed) + 0.07 * Math.sin(t * 17.1 + seed * 2) + 0.05 * Math.sin(t * 31 + seed * 3);
        flame.scale.set(0.9 + (f - 1) * 0.6, f, 0.9 + (f - 1) * 0.6);
        core.scale.set(0.45, 0.5 * f, 0.45);
        flame.rotation.z = 0.06 * Math.sin(t * 5 + seed);
        if (hanging) {
          pivot.rotation.z = 0.07 * Math.sin(t * 0.9 + seed) + 0.02 * Math.sin(t * 2.3);
          pivot.rotation.x = 0.045 * Math.sin(t * 0.7 + seed * 1.7);
          if (light?.position) {
            group.localToWorld(wp.set(0, 0.14, 0));
            light.position.copy(wp);
          }
        }
      });
      return { group: root, light };
    },

    sign(position, rotationY = 0, { text: body, style = 'sign', swinging = false } = {}) {
      const root = new THREE.Group();
      const base = resolvePosition(position, world, 0);
      root.position.copy(base);
      root.rotation.y = rotationY;
      root.userData.kind = 'sign';
      const q = quatY(rotationY);
      const toWorld = (v) => v.clone().applyQuaternion(q).add(base);
      const lines = Array.isArray(body) ? body : [body ?? ''];
      const spec = { style, size: [1.5, 0.86], emissive: 0, doubleSide: false };
      if (lines.length === 1 && style !== 'sign') spec.body = lines;
      else Object.assign(spec, { title: lines[0], body: lines.slice(1) });
      const P = new Parts(91);
      const W = '#9a6c3e';
      if (!swinging) {
        P.box(0.15, 2.3, 0.15, { radius: 0.035, segments: 2, pos: [0, 1.15, 0], rot: [0, 0, 0], color: '#8a6038', jitter: 0.004, vary: 0.2 });
        P.add(new THREE.ConeGeometry(0.1, 0.1, 4), { pos: [0, 2.35, 0], rot: [0, PI / 4, 0], color: '#6f4c2c' });
        P.box(1.66, 1.02, 0.075, { radius: 0.03, segments: 2, pos: [0, 1.58, 0.115], color: W, jitter: 0.003 });
        for (const x of [-0.72, 0.72]) for (const y of [1.2, 1.96]) P.add(new THREE.SphereGeometry(0.02, 8, 6), { pos: [x, y, 0.158], color: IRON, metal: 0.55 });
        const board = new THREE.Mesh(P.build(), mats.wood);
        board.castShadow = true;
        board.receiveShadow = true;
        const face = text.panel(spec);
        face.position.set(0, 1.58, 0.1545);
        root.add(board, face);
        scene.add(root);
        physics.addStaticBox({ position: toWorld(new THREE.Vector3(0, 1.15, 0)), size: [0.15, 2.3, 0.15], quaternion: q, userData: { kind: 'sign' } });
        return root;
      }

      P.box(0.17, 2.7, 0.17, { radius: 0.04, segments: 2, pos: [-0.95, 1.35, 0], color: '#7d5733', jitter: 0.004, vary: 0.2 });
      P.box(2.0, 0.1, 0.1, { radius: 0.03, segments: 2, pos: [0.05, 2.62, 0], color: '#7d5733', jitter: 0.003 });
      P.box(0.75, 0.07, 0.07, { radius: 0.02, pos: [-0.66, 2.34, 0], rot: [0, 0, 0.78], color: '#6c4a2b' });
      P.add(new THREE.SphereGeometry(0.03, 8, 6), { pos: [1.02, 2.62, 0], color: IRON, metal: 0.55 });
      const frame = new THREE.Mesh(P.build(), mats.wood);
      frame.castShadow = true;
      frame.receiveShadow = true;
      root.add(frame);
      scene.add(root);
      const pivotLocal = new THREE.Vector3(0, 2.57, 0);
      const hang = 0.78;
      physics.addStaticBox({ position: toWorld(new THREE.Vector3(-0.95, 1.35, 0)), size: [0.17, 2.7, 0.17], quaternion: q, userData: { kind: 'sign' } });
      physics.addStaticBox({ position: toWorld(new THREE.Vector3(0.05, 2.62, 0)), size: [2.0, 0.1, 0.1], quaternion: q, userData: { kind: 'sign' } });

      const bp = new Parts(92);
      bp.box(1.66, 1.02, 0.075, { radius: 0.03, segments: 2, color: W, jitter: 0.003 });
      for (const x of [-0.55, 0.55]) {
        bp.box(0.025, 0.3, 0.025, { radius: 0.01, pos: [x, 0.64, 0], color: IRON, metal: 0.55 });
        bp.add(new THREE.TorusGeometry(0.03, 0.007, 6, 10), { pos: [x, 0.8, 0], rot: [0, PI / 2, 0], color: IRON, metal: 0.55 });
      }
      const boardGroup = new THREE.Group();
      const boardMesh = new THREE.Mesh(bp.build(), mats.wood);
      boardMesh.castShadow = true;
      boardGroup.add(boardMesh);
      const face = text.panel(spec);
      face.position.z = 0.0395;
      const back = text.panel(spec);
      back.position.z = -0.0395;
      back.rotation.y = PI;
      boardGroup.add(face, back);
      boardGroup.position.copy(toWorld(new THREE.Vector3(0.05, pivotLocal.y - hang, 0.0)));
      boardGroup.rotation.y = rotationY;
      boardGroup.userData.kind = 'sign';
      scene.add(boardGroup);
      const entity = physics.addDynamic(boardGroup, {
        shape: 'box', size: [1.66, 1.02, 0.08], mass: 9, friction: 0.5, restitution: 0.2, angularDamping: 1.5, linearDamping: 0.3, buoyant: false, userData: { kind: 'sign' },
      });
      entity.onCollision = impactHandler(ctx, entity, { hard: 99, volume: 0.7, min: 1.2 });
      const RAPIER = physics.RAPIER;
      const anchor = toWorld(new THREE.Vector3(0.05, pivotLocal.y, 0));
      const fixed = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(anchor.x, anchor.y, anchor.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
      const joint = physics.world.createImpulseJoint(
        RAPIER.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: hang, z: 0 }, { x: 1, y: 0, z: 0 }),
        fixed, entity.body, true,
      );
      root.userData.board = entity;
      root.userData.joint = joint;
      return root;
    },

    terminal(position, rotationY = 0, { style = 'crt', texture } = {}) {
      const base = resolvePosition(position, world, 0);
      const group = new THREE.Group();
      group.position.copy(base);
      group.rotation.y = rotationY;
      group.userData.kind = 'terminal';
      const q = quatY(rotationY);
      const toWorld = (v) => v.clone().applyQuaternion(q).add(base);
      const solids = [];
      if (style === 'kiosk') {
        const body = new THREE.ExtrudeGeometry(roundedRectShape(0.84, 2.3, 0.2, 0.1), {
          depth: 0.16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 5, curveSegments: 10,
        });
        body.translate(0, 0.1, -0.08);
        const P = new Parts(101);
        P.add(body, { color: '#f1f3f9', vary: 0.04 });
        P.add(lathe([[0, 0], [0.52, 0], [0.55, 0.02], [0.53, 0.05], [0.47, 0.075], [0, 0.08]], 40), { color: '#dfe3ec', vary: 0.04 });
        P.box(0.7, 1.58, 0.05, { radius: 0.05, segments: 3, pos: [0, 1.38, 0.15], color: '#0d1117', vary: 0 });
        const hood = new THREE.Mesh(P.build(), synth);
        hood.castShadow = true;
        hood.receiveShadow = true;
        group.add(hood);
        const tex = texture || kioskTexture(text);
        const screen = new THREE.Mesh(curvedScreenGeometry(0.62, 1.46, 0.025), screenMaterial(tex, 1));
        screen.position.set(0, 1.38, 0.178);
        const eye = new THREE.Mesh(new THREE.CircleGeometry(0.028, 20), mat.glow('#5ce1e6', 3));
        eye.position.set(0, 2.27, 0.182);
        const strip = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.028, 0.02, 2, 0.01), mat.glow('#ff5fa2', 2.6));
        strip.position.set(0, 0.45, 0.184);
        const halo = haloMesh(0.62 * 1.6, 1.46 * 1.6, 0.2, 0.2);
        halo.position.set(0, 1.38, 0.215);
        halo.material.color.set('#5ce1e6');
        group.add(screen, eye, strip, halo);
        scene.add(group);
        solids.push(physics.addStaticBox({ position: toWorld(new THREE.Vector3(0, 1.2, 0)), size: [0.92, 2.4, 0.34], quaternion: q, userData: { kind: 'terminal' } }));
        const api = terminalApi(group, screen, halo, null, { halo: 1, haloOpacity: 0.2 });
        api.setPower(1);
        return api;
      }

      const P = new Parts(111);
      const wood = { color: '#8d6439', jitter: 0.003, vary: 0.2 };
      P.box(1.12, 0.045, 0.64, { radius: 0.014, segments: 2, pos: [0, 0.755, 0], ...wood });
      for (const x of [-0.5, 0.5]) for (const z of [-0.26, 0.26]) P.box(0.055, 0.735, 0.055, { radius: 0.012, pos: [x, 0.3675, z], ...wood });
      P.box(0.99, 0.04, 0.04, { radius: 0.01, pos: [0, 0.2, -0.26], ...wood });
      P.box(0.04, 0.04, 0.5, { radius: 0.01, pos: [-0.5, 0.2, 0], ...wood });
      P.box(0.04, 0.04, 0.5, { radius: 0.01, pos: [0.5, 0.2, 0], ...wood });
      P.box(0.36, 0.1, 0.5, { radius: 0.012, pos: [0.3, 0.68, 0], ...wood });
      P.box(0.26, 0.03, 0.012, { radius: 0.006, pos: [0.3, 0.68, 0.255], color: IRON, metal: 0.55 });
      const Q = new Parts(112);
      const mx = -0.1;
      const my = 1.04;
      Q.add(lathe([[0, 0], [0.15, 0], [0.16, 0.012], [0.14, 0.03], [0.07, 0.04], [0.05, 0.07], [0, 0.07]], 24), { pos: [mx, 0.778, 0.02], color: BEIGE_DARK });
      Q.box(0.5, 0.42, 0.22, { radius: 0.045, segments: 3, pos: [mx, my, 0], color: BEIGE, vary: 0.08 });
      Q.box(0.44, 0.37, 0.14, { radius: 0.05, segments: 3, pos: [mx, my - 0.01, -0.17], color: BEIGE, vary: 0.08 });
      Q.box(0.34, 0.3, 0.14, { radius: 0.05, segments: 3, pos: [mx, my - 0.025, -0.28], color: BEIGE_DARK, vary: 0.08 });
      Q.box(0.3, 0.012, 0.012, { radius: 0.004, pos: [mx, my + 0.19, -0.14], color: '#7d745f' });
      for (let i = 0; i < 6; i++) Q.box(0.26, 0.007, 0.012, { radius: 0.003, pos: [mx, my + 0.168 - i * 0.012 + 0.03, -0.3], color: '#6e6652' });
      Q.box(0.41, 0.34, 0.012, { radius: 0.004, pos: [mx, my + 0.008, 0.108], color: '#0b0d0e', vary: 0 });
      Q.box(0.5, 0.062, 0.034, { radius: 0.014, segments: 2, pos: [mx, my + 0.179, 0.115], color: BEIGE, vary: 0.06 });
      Q.box(0.5, 0.062, 0.034, { radius: 0.014, segments: 2, pos: [mx, my - 0.169, 0.115], color: BEIGE, vary: 0.06 });
      Q.box(0.07, 0.3, 0.034, { radius: 0.014, segments: 2, pos: [mx - 0.215, my + 0.005, 0.115], color: BEIGE, vary: 0.06 });
      Q.box(0.07, 0.3, 0.034, { radius: 0.014, segments: 2, pos: [mx + 0.215, my + 0.005, 0.115], color: BEIGE, vary: 0.06 });
      Q.box(0.07, 0.016, 0.006, { radius: 0.003, pos: [mx - 0.14, my - 0.172, 0.134], color: '#4b4a4e' });
      Q.box(0.05, 0.05, 0.003, { radius: 0.001, pos: [mx + 0.2, my + 0.215, 0.1], rot: [0, 0, 0.12], color: '#f2e46a', vary: 0.05 });
      const tx = 0.78;
      Q.box(0.45, 0.024, 0.17, { radius: 0.008, segments: 2, pos: [mx, 0.792, 0.2], rot: [0.07, 0, 0], color: BEIGE_DARK });
      Q.box(0.21, 0.46, 0.44, { radius: 0.025, segments: 2, pos: [tx, 0.23, -0.04], color: BEIGE, vary: 0.08 });
      for (const [y, h] of [[0.37, 0.05], [0.31, 0.05], [0.23, 0.014]]) Q.box(0.15, h, 0.01, { radius: 0.003, pos: [tx, y, 0.18], color: '#2a2a2e', vary: 0 });
      Q.box(0.12, 0.016, 0.006, { radius: 0.002, pos: [tx, 0.285, 0.185], color: '#8d8470' });
      Q.add(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 14), { pos: [tx - 0.045, 0.1, 0.182], rot: [PI / 2, 0, 0], color: '#a99e84' });
      const furniture = new THREE.Mesh(P.build(), mats.wood);
      const casing = new THREE.Mesh(Q.build(), mats.plastic);
      for (const m of [furniture, casing]) {
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
      }

      const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.43, 0.155), keysMat);
      keys.position.set(mx, 0.8045, 0.2);
      keys.rotation.x = -PI / 2 + 0.07;
      group.add(keys);

      const tex = texture || text.texture({
        style: 'terminal', title: 'Forum des Veilleurs — tty1', footer: 'C:\\VEILLE>',
        body: ['CONNEXION ÉTABLIE.', '3 messages non lus.', 'Le forum public ferme ce soir. On continue ailleurs, entre nous.'],
      });
      const screen = new THREE.Mesh(curvedScreenGeometry(0.4, 0.31, 0.014), screenMaterial(tex, 0));
      screen.position.set(mx, my + 0.006, 0.118);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 8, 6), mat.glow('#7cff6b', 3));
      led.position.set(mx + 0.18, my - 0.169, 0.136);
      const halo = haloMesh(0.4 * 1.6, 0.31 * 1.6, 0.32, 0.2);
      halo.position.set(mx, my, 0.138);
      halo.material.color.set('#7cff6b');
      const tower = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 4), mat.glow('#ffb454', 2.5));
      tower.position.set(tx + 0.045, 0.1, 0.188);
      group.add(screen, led, tower, halo);
      scene.add(group);
      for (const [c, s] of [[[0, 0.38, 0], [1.14, 0.76, 0.66]], [[mx, my + 0.01, -0.12], [0.52, 0.42, 0.5]], [[tx, 0.23, -0.04], [0.22, 0.46, 0.44]]]) {
        solids.push(physics.addStaticBox({ position: toWorld(new THREE.Vector3(...c)), size: s, quaternion: q, userData: { kind: 'terminal' } }));
      }
      const api = terminalApi(group, screen, halo, led, { halo: 1.0, haloOpacity: 0.32 });
      api.setTexture(tex);
      api.setPower(1);
      return api;
    },

    pedestal(position, { label, rotationY = 0 } = {}) {
      const base = resolvePosition(position, world, 0);
      const group = new THREE.Group();
      group.position.copy(base);
      group.rotation.y = rotationY;
      group.userData.kind = 'pedestal';
      const P = new Parts(61);
      const S = { color: '#c9c4b8', vary: 0.16, jitter: 0.003 };
      P.box(0.66, 0.24, 0.66, { radius: 0.035, segments: 3, pos: [0, 0.12, 0], ...S });
      P.box(0.54, 0.1, 0.54, { radius: 0.03, segments: 3, pos: [0, 0.29, 0], ...S });
      P.add(lathe([
        [0.0, 0.34], [0.23, 0.34], [0.235, 0.365], [0.215, 0.385], [0.205, 0.41], [0.2, 0.5], [0.197, 0.62], [0.19, 0.74], [0.19, 0.81], [0.205, 0.825], [0.215, 0.85], [0, 0.85],
      ], 40), { ...S, uvScale: [3, 1] });
      P.add(lathe([
        [0.2, 0.84], [0.255, 0.86], [0.285, 0.895], [0.31, 0.93], [0.325, 0.96], [0.322, 0.985], [0.3, 0.99], [0.27, 0.975], [0.22, 0.962], [0.12, 0.954], [0, 0.952],
      ], 48), { ...S, jitter: 0.0025 });
      const stone = new THREE.Mesh(P.build(), mats.stone);
      stone.castShadow = true;
      stone.receiveShadow = true;
      group.add(stone);
      if (label) {
        const plate = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.15, 0.02, 2, 0.008), plateMat);
        plate.position.set(0, 0.12, 0.333);
        const panel = text.panel({ style: 'plain', body: label, font: 'serif', fontSize: 170, bg: '#8d887c', fg: '#26231f', size: [0.46, 0.12], width: 768, emissive: 0, align: 'center' });
        panel.position.set(0, 0.12, 0.3445);
        group.add(plate, panel);
      }
      scene.add(group);
      physics.addStaticCylinder({ position: [base.x, base.y + 0.4825, base.z], radius: 0.31, height: 0.965, userData: { kind: 'pedestal' } });
      return { group, top: new THREE.Vector3(base.x, base.y + 0.955, base.z) };
    },
  };
}
