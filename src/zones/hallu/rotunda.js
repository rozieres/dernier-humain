import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeAtlas, QuadKit } from './atlas.js';
import { CENTER, PILLAR_Y } from './layout.js';

const PAGES = [
  'Non. Annulé.', 'Source ? Merci.', 'Vérifié sur place.', 'Je repasse demain relire.', "Faux. J'y étais.",
  '[réf. nécessaire]', 'Qui a écrit ça ?', 'Relu. Rien à signaler.', 'Annulé, encore.', 'Pas de source, pas de phrase.',
  "Quelqu'un relit encore ?", 'Vérifiez.',
];
const STONE = '#e2d7c6';
const STONE_D = '#c8baa6';
const BOOKS = ['#6b2f3a', '#2f4a6b', '#4d5a2f', '#7a5a2a', '#3f2f5a', '#8a7a5a', '#5a3a2a', '#2a5a55'];

function columnGeometry(h) {
  const prof = [
    [0.001, 0], [0.62, 0], [0.62, 0.18], [0.55, 0.24], [0.5, 0.3], [0.46, 0.42], [0.47, h * 0.35], [0.44, h * 0.7], [0.4, h - 0.55],
    [0.44, h - 0.48], [0.5, h - 0.36], [0.6, h - 0.24], [0.66, h - 0.2], [0.66, h], [0.001, h],
  ];
  return new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 16);
}

function sectorGeometry(r0, r1, a0, a1, h) {
  const s = new THREE.Shape();
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const fn = i === 0 ? 'moveTo' : 'lineTo';
    s[fn](Math.cos(a) * r1, Math.sin(a) * r1);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    s.lineTo(Math.cos(a) * r0, Math.sin(a) * r0);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.04, bevelSegments: 1, curveSegments: 2 });
  g.rotateX(-Math.PI / 2);
  return g;
}

export async function buildRotunda(ctx, { kits, near, rand, box, cylinder }) {
  const { text, texts, props, interact, ui, physics } = ctx;
  const [cx, cz] = CENTER;
  const Y = PILLAR_Y;
  const at = (r, a) => [cx + Math.cos(a) * r, cz + Math.sin(a) * r];

  const rings = [[3.15, 5.4, 10], [5.5, 8.0, 16], [8.1, 11.2, 22]];
  for (const [r0, r1, n] of rings) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + 0.02 + r0 * 0.3;
      const a1 = ((i + 1) / n) * Math.PI * 2 - 0.02 + r0 * 0.3;
      if (rand() < 0.06) continue;
      const tilt = rand() < 0.15 ? (rand() - 0.5) * 0.05 : 0;
      kits.stone.add(sectorGeometry(r0, r1, a0, a1, 0.14), { pos: [cx, Y - 0.1 + rand() * 0.03, cz], rot: [tilt, 0, tilt], color: rand() < 0.5 ? '#d9cdb9' : '#cbbca6', vary: 0.05 });
    }
  }
  physics.addStaticCylinder({ position: [cx, Y - 0.04, cz], radius: 11.2, height: 0.16, userData: { surface: 'stone' } });

  const N = 11;
  const H = 5.4;
  const colGeo = columnGeometry(H);
  const tops = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.15;
    const [x, z] = at(10.2, a);
    const broken = i === 3 || i === 8;
    const lean = i % 3 === 1 ? 0.09 + rand() * 0.07 : rand() * 0.03;
    const axis = new THREE.Vector3(Math.cos(a + Math.PI / 2), 0, Math.sin(a + Math.PI / 2));
    const q = new THREE.Quaternion().setFromAxisAngle(axis, lean * (rand() < 0.5 ? -1 : 1));
    if (broken) {
      const g = columnGeometry(H);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) if (p.getY(k) > 2.3) p.setY(k, 2.3 + Math.sin(p.getX(k) * 7 + p.getZ(k) * 5) * 0.15);
      g.computeVertexNormals();
      kits.stone.add(g, { pos: [x, Y, z], quat: q, color: STONE });
      const [fx, fz] = at(11.6, a + 0.12);
      kits.stone.add(new THREE.CylinderGeometry(0.42, 0.44, 1.6, 14), { pos: [fx, Y + 0.38, fz], rot: [Math.PI / 2, a, 0.2], order: 'YXZ', color: STONE_D });
      tops.push(null);
    } else {
      kits.stone.add(colGeo, { pos: [x, Y, z], quat: q, color: i % 2 ? STONE : '#d8ccb9', vary: 0.03 });
      const top = new THREE.Vector3(0, H, 0).applyQuaternion(q).add(new THREE.Vector3(x, Y, z));
      tops.push(top);
    }
    cylinder({ position: [x, Y + 1.5, z], radius: 0.55, height: 3 });
  }
  for (let i = 0; i < N; i++) {
    const a = tops[i];
    const b = tops[(i + 1) % N];
    if (!a || !b || i % 4 === 2) continue;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const d = b.clone().sub(a);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize());
    kits.stone.add(new RoundedBoxGeometry(len + 0.9, 0.55, 1.0, 1, 0.08), { pos: [mid.x, mid.y + 0.27, mid.z], quat: q, color: STONE_D, vary: 0.03 });
    kits.stone.add(new RoundedBoxGeometry(len + 1.1, 0.16, 1.2, 1, 0.05), { pos: [mid.x, mid.y + 0.62, mid.z], quat: q, color: STONE });
  }

  await text.ready;
  const atlas = makeAtlas(ctx, PAGES.map((t) => ({ style: 'human', body: [t], fontSize: 54 })), { cols: 4, rows: 3, cellW: 256, cellH: 340 });
  const pages = new QuadKit();
  const pageMat = ctx.mat.standard({ map: atlas.texture, emissiveMap: atlas.texture, emissive: new THREE.Color(0.18, 0.15, 0.11), roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  let pi = 0;
  const nextPage = () => atlas.rects[pi++ % atlas.rects.length];
  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  const placePage = (pos, rx, ry, rz, s = 1) => {
    m.compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(e.set(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, s, s));
    pages.add(nextPage(), 0.42, 0.56, m);
  };

  const shelves = [1.0, 2.5, 4.0, 5.3];
  for (const [k, a] of shelves.entries()) {
    const [x, z] = at(8.6, a);
    const yaw = Math.atan2(cx - x, cz - z);
    const lean = 0.06 + k * 0.025;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-lean, yaw, (rand() - 0.5) * 0.06, 'YXZ'));
    const base = new THREE.Vector3(x, Y, z);
    const L = (dx, dy, dz) => new THREE.Vector3(dx, dy, dz).applyQuaternion(q).add(base).toArray();
    kits.stone.add(new RoundedBoxGeometry(3.2, 3.6, 0.18, 1, 0.04), { pos: L(0, 1.8, -0.42), quat: q, color: STONE_D });
    for (const sx of [-1.6, 1.6]) kits.stone.add(new RoundedBoxGeometry(0.2, 3.7, 0.95, 1, 0.04), { pos: L(sx, 1.85, 0), quat: q, color: STONE });
    for (let lv = 0; lv < 5; lv++) {
      const sy = 0.15 + lv * 0.82;
      kits.stone.add(new RoundedBoxGeometry(3.2, 0.12, 0.9, 1, 0.03), { pos: L(0, sy, 0), quat: q, color: STONE });
      if (lv === 4) continue;
      let bx = -1.45;
      while (bx < 1.4) {
        const w = 0.07 + rand() * 0.07;
        const h = 0.5 + rand() * 0.2;
        if (rand() < 0.12) {
          bx += w + 0.15;
          continue;
        }
        const tilt = rand() < 0.1 ? 0.25 : (rand() - 0.5) * 0.06;
        const bq = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt));
        kits.wood.add(new THREE.BoxGeometry(w, h, 0.55), { pos: L(bx + w / 2, sy + 0.06 + h / 2, 0.02), quat: bq, color: BOOKS[Math.floor(rand() * BOOKS.length)], vary: 0.15 });
        bx += w + 0.01;
      }
    }
    placePage(L(0.3, 0.27, 0.35), -Math.PI / 2, yaw + 0.4, 0, 0.8);
    box({ position: L(0, 1.8, -0.1), size: [3.3, 3.7, 1.0], quaternion: q });
  }

  const lecterns = [[5.4, 0.3], [5.6, 2.2], [5.2, 4.6]];
  const lecternTops = [];
  for (const [r, a] of lecterns) {
    const [x, z] = at(r, a);
    const yaw = Math.atan2(x - cx, z - cz);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const base = new THREE.Vector3(x, Y, z);
    const L = (dx, dy, dz) => new THREE.Vector3(dx, dy, dz).applyQuaternion(q).add(base).toArray();
    kits.wood.add(new THREE.CylinderGeometry(0.32, 0.42, 0.12, 12), { pos: L(0, 0.06, 0), color: '#5b4330' });
    kits.wood.add(new THREE.CylinderGeometry(0.07, 0.09, 1.05, 8), { pos: L(0, 0.6, 0), color: '#6d5139' });
    kits.wood.add(new RoundedBoxGeometry(0.75, 0.05, 0.55, 1, 0.02), { pos: L(0, 1.15, 0), quat: q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.38)), color: '#7a5a3e' });
    const top = new THREE.Vector3(...L(0, 1.2, 0));
    lecternTops.push({ top, yaw });
    for (const side of [-1, 1]) {
      const p = L(side * 0.19, 1.19, 0.0);
      m.compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(e.set(-Math.PI / 2 + 0.38, yaw, side * 0.06, 'YXZ')), new THREE.Vector3(0.85, 0.85, 0.85));
      pages.add(nextPage(), 0.42, 0.56, m);
    }
    cylinder({ position: [x, Y + 0.6, z], radius: 0.35, height: 1.2 });
  }
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const r = 3.6 + rand() * 6;
    const [x, z] = at(r, a);
    placePage([x, Y + 0.07 + i * 0.002, z], -Math.PI / 2 + (rand() - 0.5) * 0.1, rand() * Math.PI * 2, (rand() - 0.5) * 0.1, 0.9);
  }
  const pageMesh = new THREE.Mesh(pages.build(), pageMat);
  pageMesh.name = 'hallu:pages';
  pageMesh.receiveShadow = true;
  near.add(pageMesh);

  const L0 = lecternTops[1];
  const lamp = props.lantern([L0.top.x + Math.sin(L0.yaw + 1.6) * 0.32, L0.top.y + 0.1, L0.top.z + Math.cos(L0.yaw + 1.6) * 0.32], { intensity: 1.6, rotationY: L0.yaw });
  if (lamp?.group?.isObject3D) near.add(lamp.group);

  const article = texts.SYNTH_DOCS?.hallu_article;
  const [kx, kz] = at(7.2, 5.9);
  const kyaw = Math.atan2(cx - kx, cz - kz);
  const kioskTex = text.texture({
    style: 'post', width: 320, height: 752, author: "L'Encyclopédie libre", handle: '@encyclo-libre',
    body: [article?.title || 'Tour Eiffel', article?.body?.[0] || ''], meta: article?.date || '',
  });
  const kiosk = props.terminal([kx, Y, kz], kyaw, { style: 'kiosk', texture: kioskTex });
  if (kiosk?.group?.isObject3D) near.add(kiosk.group);
  interact.add({
    id: 'hallu:kiosk', position: new THREE.Vector3(kx, Y + 1.4, kz), radius: 2.6, label: 'Lire',
    onInteract: () => {
      if (article) ui.reader.open(article);
    },
  });
}
