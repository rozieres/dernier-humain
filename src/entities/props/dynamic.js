import * as THREE from 'three';
import { Parts, lathe, canvasTexture, speckle, smooth, resolvePosition, impactHandler } from './kit.js';
import { seeded } from '../../core/rng.js';

const PI = Math.PI;
const WOODS = ['#b57d4b', '#a87444', '#bc8853', '#9f6d3f'];
const IRON = '#4b4d54';

function crateGeometry() {
  const P = new Parts(11);
  const r = P.r;
  const frames = [[0, 0, 0], [0, PI, 0], [0, PI / 2, 0], [0, -PI / 2, 0], [-PI / 2, 0, 0], [PI / 2, 0, 0]];
  frames.forEach((frame, f) => {
    for (let i = 0; i < 4; i++) {
      const w = 0.83 + r() * 0.03;
      P.box(w, 0.188, 0.05, { radius: 0.014, pos: [(r() - 0.5) * 0.012, -0.3 + i * 0.2, 0.44], frame, color: WOODS[(f + i * 3 + Math.floor(r() * 2)) % 4], jitter: 0.004, vary: 0.16 });
    }
    P.box(1.04, 0.1, 0.036, { radius: 0.014, pos: [0, 0, 0.482], rot: [0, 0, f % 2 ? -PI / 4 : PI / 4], frame, color: '#c49560', jitter: 0.003 });
  });
  for (const a of [-0.45, 0.45]) {
    for (const b of [-0.45, 0.45]) {
      P.box(1, 0.1, 0.1, { radius: 0.022, pos: [0, a, b], color: '#946334', jitter: 0.003 });
      P.box(1, 0.1, 0.1, { radius: 0.022, pos: [a, 0, b], rot: [0, 0, PI / 2], color: '#946334', jitter: 0.003 });
      P.box(1, 0.1, 0.1, { radius: 0.022, pos: [a, b, 0], rot: [0, PI / 2, 0], color: '#946334', jitter: 0.003 });
    }
  }
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        P.box(0.17, 0.17, 0.17, { radius: 0.04, segments: 2, pos: [x * 0.415, y * 0.415, z * 0.415], color: IRON, metal: 0.55, vary: 0.25 });
      }
    }
  }
  return P.build();
}

function baleTextures() {
  const r = seeded('bale');
  const straw = ['#e3c777', '#d1ab55', '#efd990', '#c29a46', '#dcbd6a', '#ead58f'];
  return canvasTexture(2048, 512, (c, w, h) => {
    c.fillStyle = '#d2b366';
    c.fillRect(0, 0, w, h);
    c.save();
    c.beginPath();
    c.rect(0, 0, 512, 512);
    c.clip();
    c.translate(256, 256);
    c.fillStyle = '#a98238';
    c.fillRect(-256, -256, 512, 512);
    for (let s = 0; s < 1100; s++) {
      const rad0 = r() * 290;
      const ang0 = r() * 6.283;
      const span = 0.25 + r() * 1.4;
      c.strokeStyle = straw[Math.floor(r() * straw.length)];
      c.globalAlpha = 0.5 + r() * 0.5;
      c.lineWidth = 2 + r() * 5;
      c.lineCap = 'round';
      c.beginPath();
      const drift = (r() - 0.5) * 0.5;
      for (let t = 0; t <= 1; t += 0.1) {
        const ang = ang0 + t * span;
        const rad = rad0 + (t * span / 6.283) * 62 + drift * t * 40 + Math.sin(t * 5 + s) * 2.5;
        const x = Math.cos(ang) * rad;
        const y = Math.sin(ang) * rad;
        if (t === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
    for (let s = 0; s < 2200; s++) {
      const ang = r() * 6.283;
      const rad = r() * 280;
      c.strokeStyle = straw[Math.floor(r() * straw.length)];
      c.globalAlpha = 0.5;
      c.lineWidth = 1 + r() * 2;
      c.beginPath();
      c.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
      const da = ang + (r() - 0.5) * 2.4;
      c.lineTo(Math.cos(ang) * rad + Math.cos(da) * (10 + r() * 22), Math.sin(ang) * rad + Math.sin(da) * (10 + r() * 22));
      c.stroke();
    }
    c.restore();
    c.globalAlpha = 1;
    for (let s = 0; s < 7000; s++) {
      const x = 512 + r() * 1024;
      const y = r() * h;
      const len = 30 + r() * 140;
      const slope = (r() - 0.5) * 0.18;
      c.strokeStyle = straw[Math.floor(r() * straw.length)];
      c.globalAlpha = 0.28 + r() * 0.5;
      c.lineWidth = 0.8 + r() * 2.4;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + len, y + len * slope);
      c.stroke();
      if (x + len > 1536) {
        c.beginPath();
        c.moveTo(x - 1024, y);
        c.lineTo(x - 1024 + len, y + len * slope);
        c.stroke();
      }
    }
    c.globalAlpha = 1;
    c.fillStyle = '#8c7a54';
    c.fillRect(1536, 0, 512, 512);
    for (let s = 0; s < 80; s++) {
      c.strokeStyle = `rgba(${r() < 0.5 ? '40,30,15' : '200,185,140'},0.3)`;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(1536 + r() * 512, 0);
      c.lineTo(1536 + r() * 512, 512);
      c.stroke();
    }
    speckle(c, w, h, r, { count: 2000, size: 1.5, alpha: 0.22 });
  });
}

const ATLAS = { cap: [0, 0.25], side: [0.25, 0.75], twine: [0.75, 1] };

function baleGeometry() {
  const R = 0.6;
  const H = 0.6;
  const profile = [
    [0, -H + 0.035], [0.22, -H + 0.04], [0.42, -H + 0.018], [0.52, -H], [0.575, -H + 0.022], [0.605, -H + 0.075], [0.615, -0.4],
    [R + 0.012, -0.15], [R + 0.014, 0], [R + 0.012, 0.15], [0.615, 0.4], [0.605, H - 0.075], [0.575, H - 0.022], [0.52, H],
    [0.42, H - 0.018], [0.22, H - 0.04], [0, H - 0.035],
  ];
  const lg = lathe(profile, 56);
  const p = lg.attributes.position;
  const n = lg.attributes.normal;
  const uv = lg.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    if (Math.abs(n.getY(i)) > 0.55) {
      uv.setXY(i, ATLAS.cap[0] + ((x / (R * 2)) + 0.5) * 0.25, (z / (R * 2)) + 0.5);
    } else {
      const ang = Math.atan2(z, x) / (2 * PI) + 0.5;
      uv.setXY(i, ATLAS.side[0] + ang * 0.5, (y + H) / (2 * H));
    }
  }
  const P = new Parts(5);
  P.add(lg, { rot: [PI / 2, 0, 0], color: '#efe0b0', jitter: 0.011, vary: 0.14 });
  for (const y of [-0.33, 0.33]) {
    const band = lathe([[R - 0.02, y - 0.045], [R + 0.025, y - 0.038], [R + 0.03, y], [R + 0.025, y + 0.038], [R - 0.02, y + 0.045]], 56);
    const bu = band.attributes.uv;
    for (let i = 0; i < bu.count; i++) bu.setXY(i, ATLAS.twine[0] + bu.getX(i) * 0.25, bu.getY(i));
    P.add(band, { rot: [PI / 2, 0, 0], color: '#a89268', vary: 0.1, jitter: 0.002 });
  }
  return P.build();
}

function barrelGeometry() {
  const P = new Parts(23);
  const H = 0.46;
  const rad = (y) => 0.335 + 0.075 * (1 - (y / H) ** 2);
  const prof = [];
  for (let i = 0; i <= 16; i++) {
    const y = -H + (i / 16) * 2 * H;
    prof.push([rad(y), y]);
  }
  const body = lathe([[0, -H + 0.03], [0.285, -H + 0.03], [0.292, -H + 0.005], ...prof, [0.292, H - 0.005], [0.285, H - 0.03], [0.255, H - 0.03], [0.255, H - 0.075], [0, H - 0.075]], 56);
  const p = body.attributes.position;
  const uv = body.attributes.uv;
  const nrm = body.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const rr = Math.hypot(x, z);
    const ang = Math.atan2(z, x);
    const t = (ang / (2 * PI) + 0.5) * 14;
    const f = t - Math.floor(t);
    const groove = (1 - smooth(0.0, 0.1, f)) + smooth(0.9, 1, f);
    if (rr > 0.28 && Math.abs(nrm.getY(i)) < 0.5) {
      const k = 1 - (groove * 0.016) / rr;
      p.setXYZ(i, x * k, y, z * k);
    }
    if (Math.abs(nrm.getY(i)) > 0.7) uv.setXY(i, x * 0.9 + 0.5, z * 0.9 + 0.5);
    else uv.setXY(i, (y + H) * 1.1 + Math.floor(t) * 0.37, f * 0.5 + Math.floor(t) * 0.173);
  }
  P.add(body, { color: '#a87848', vary: 0.22, jitter: 0.003 });
  for (const [y, w] of [[-0.37, 0.04], [-0.19, 0.035], [0.19, 0.035], [0.37, 0.04]]) {
    const rr = rad(y) + 0.006;
    P.add(lathe([[rr - 0.01, y - w], [rr + 0.008, y - w + 0.006], [rr + 0.012, y], [rr + 0.008, y + w - 0.006], [rr - 0.01, y + w]], 56), { color: '#4a4c52', metal: 0.55, vary: 0.3 });
  }
  return P.build();
}

function plankGeometry(length) {
  const w = 0.28;
  const t = 0.045;
  const rr = 0.012;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + rr, -t / 2);
  shape.lineTo(w / 2 - rr, -t / 2);
  shape.absarc(w / 2 - rr, -t / 2 + rr, rr, -PI / 2, 0);
  shape.lineTo(w / 2, t / 2 - rr);
  shape.absarc(w / 2 - rr, t / 2 - rr, rr, 0, PI / 2);
  shape.lineTo(-w / 2 + rr, t / 2);
  shape.absarc(-w / 2 + rr, t / 2 - rr, rr, PI / 2, PI);
  shape.lineTo(-w / 2, -t / 2 + rr);
  shape.absarc(-w / 2 + rr, -t / 2 + rr, rr, PI, 1.5 * PI);
  const ex = new THREE.ExtrudeGeometry(shape, { depth: length, steps: Math.max(4, Math.ceil(length * 6)), bevelEnabled: false, curveSegments: 2 });
  ex.translate(0, 0, -length / 2);
  ex.rotateY(PI / 2);
  const p = ex.attributes.position;
  const uv = ex.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const u = uv.getX(i);
    const v = uv.getY(i);
    uv.setXY(i, x * 1.1 + 0.5, (u + v) * 0.5);
    p.setY(i, p.getY(i) + 0.014 * Math.sin((x / length + 0.5) * PI) + 0.004 * Math.sin(x * 3.7));
  }
  const P = new Parts(31);
  P.add(ex, { color: '#8e7c66', vary: 0.28, jitter: 0.004 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      P.add(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 8), { pos: [sx * (length / 2 - 0.12), t / 2 + 0.002, sz * 0.08], color: '#4a3d33', metal: 0.5 });
    }
  }
  return P.build();
}

function paveGeometry() {
  const P = new Parts(41);
  P.box(0.45, 0.28, 0.3, { radius: 0.045, segments: 3, color: '#e6e0d6', jitter: 0.007, vary: 0.1 });
  const g = P.build();
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    if (az >= ax && az >= ay) uv.setXY(i, z > 0 ? (x + 0.225) / 0.45 : 1 - (x + 0.225) / 0.45, (y + 0.14) / 0.28);
    else if (ax >= ay) uv.setXY(i, ((z + 0.15) / 0.3) * 0.667, (y + 0.14) / 0.28);
    else uv.setXY(i, (x + 0.225) / 0.45, (z + 0.15) / 0.3);
  }
  return g;
}

function paveTexture(ctx, text) {
  const W = 1280;
  const H = 800;
  return canvasTexture(W, H, (c) => {
    const r = seeded('pave');
    c.fillStyle = '#948f88';
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 50; i++) {
      const g = c.createRadialGradient(r() * W, r() * H, 4, r() * W, r() * H, 80 + r() * 140);
      g.addColorStop(0, `rgba(${r() < 0.5 ? '255,255,255' : '50,48,52'},0.08)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    }
    speckle(c, W, H, r, { count: 22000, size: 1.5, alpha: 0.4, light: '240,236,228', dark: '38,36,38' });
    const fs = 28;
    c.font = `400 ${fs}px "Inter"`;
    const margin = 34;
    const lines = ctx.text.wrap(c, text, W - margin * 2);
    const lh = fs * 1.2;
    c.textBaseline = 'alphabetic';
    lines.forEach((line, i) => {
      const y = margin + (i + 1) * lh;
      if (y > H - margin + 6) return;
      const words = line.split(' ');
      const last = i === lines.length - 1 || words.length < 3;
      const natural = c.measureText(words.join(' ')).width;
      const gap = last ? c.measureText(' ').width : (c.measureText(' ').width + (W - margin * 2 - natural) / (words.length - 1));
      let x = margin;
      for (const word of words) {
        c.fillStyle = 'rgba(238,234,226,0.3)';
        c.fillText(word, x + 0.9, y + 0.9);
        c.fillStyle = 'rgba(30,28,32,0.86)';
        c.fillText(word, x, y);
        x += c.measureText(word).width + gap;
      }
    });
  }, { anisotropy: 16 });
}

const DEFAULT_PAVE = [
  "Dans un monde où tout est écrit, il est important de noter que plus personne ne lit. Voici donc un texte long, dense et soigneusement généré, pour que cette pierre pèse son poids de mots.",
  "Les experts s'accordent à dire que la valeur d'un contenu se mesure à sa vitesse de production, jamais à sa pertinence. Excellente question. Voici une réponse optimisée, structurée en trois points.",
  "En conclusion, il convient de rappeler que ce pavé a été entièrement rédigé sans intervention humaine, ce qui le rend à la fois très solide et très léger. Lancez-le avec précaution : il pourrait contenir un argument.",
];

export function createDynamicProps(ctx, mats) {
  const { scene, physics, world } = ctx;
  const R = { crate: crateGeometry(), bale: baleGeometry(), barrel: barrelGeometry(), pave: paveGeometry(), planks: new Map() };
  const paveMats = new Map();

  const baleMat = ctx.mat.standard({ map: baleTextures(), vertexColors: true, roughness: 0.96, metalness: 0 }, { onShader: mats.metalMask });
  baleMat.map.repeat.set(1, 1);
  baleMat.map.wrapS = baleMat.map.wrapT = THREE.ClampToEdgeWrapping;
  baleMat.bumpMap = baleMat.map;
  baleMat.bumpScale = 1.2;

  function paveMat(text) {
    const key = text ?? '';
    if (!paveMats.has(key)) {
      const body = text || (ctx.has('texts') && Array.isArray(ctx.texts.SEA_LINES) ? ctx.texts.SEA_LINES.slice(0, 40).join(' ') : DEFAULT_PAVE.join(' '));
      const map = paveTexture(ctx, body);
      paveMats.set(key, ctx.mat.standard({ map, bumpMap: map, bumpScale: 1.3, vertexColors: true, roughness: 0.68, metalness: 0 }));
    }
    return paveMats.get(key);
  }

  const baleHull = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 20).rotateX(PI / 2));

  function spawn(kind, geometry, material, position, rest, opts, physicsOptions) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.copy(resolvePosition(position, world, rest));
    mesh.rotation.y = opts.rotationY || 0;
    mesh.userData.kind = kind;
    if (opts.scale) mesh.scale.setScalar(opts.scale);
    scene.add(mesh);
    const { proxy, ...options } = physicsOptions;
    if (proxy) {
      proxy.position.copy(mesh.position);
      proxy.quaternion.copy(mesh.quaternion);
    }
    const entity = physics.addDynamic(proxy || mesh, { grabbable: true, userData: { kind }, ...options });
    entity.mesh = mesh;
    entity.onCollision = impactHandler(ctx, entity, opts.sound);
    return entity;
  }

  return {
    crate(position, { size = 1, ...opts } = {}) {
      return spawn('crate', R.crate, mats.wood, position, size * 0.5 + 0.02, { ...opts, scale: size, sound: { hard: 6, volume: 0.9 } }, {
        shape: 'box', size: [size, size, size], mass: 25 * size ** 3, friction: 0.8, restitution: 0.08, angularDamping: 0.6, linearDamping: 0.08,
      });
    },

    bale(position, opts = {}) {
      return spawn('bale', R.bale, baleMat, position, 0.64, { ...opts, sound: { hard: 99, volume: 0.8 } }, {
        shape: 'hull', proxy: baleHull, mass: 32, friction: 0.85, restitution: 0.3, angularDamping: 2.2, linearDamping: 0.3,
      });
    },

    pave(position, { text, ...opts } = {}) {
      return spawn('pave', R.pave, paveMat(text), position, 0.16, { ...opts, sound: { hard: 2.5, volume: 1 } }, {
        shape: 'box', size: [0.45, 0.28, 0.3], mass: 18, friction: 0.9, restitution: 0, ccd: true, angularDamping: 0.7, linearDamping: 0.1,
      });
    },

    barrel(position, opts = {}) {
      return spawn('barrel', R.barrel, mats.wood, position, 0.47, { ...opts, sound: { hard: 5, volume: 1 } }, {
        shape: 'cylinder', size: [0.8, 0.92, 0.8], mass: 28, friction: 0.7, restitution: 0.12, angularDamping: 0.45, linearDamping: 0.08,
      });
    },

    plank(position, { length = 3, ...opts } = {}) {
      if (!R.planks.has(length)) R.planks.set(length, plankGeometry(length));
      return spawn('plank', R.planks.get(length), mats.wood, position, 0.05, { ...opts, sound: { hard: 7, volume: 0.8 } }, {
        shape: 'box', size: [length, 0.05, 0.28], mass: Math.max(3, length * 5), friction: 0.75, restitution: 0.1, angularDamping: 0.7, linearDamping: 0.08,
      });
    },
  };
}
