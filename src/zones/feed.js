import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  PIT, pitLitShader, wallShader, floorShader, createScreenMaterial, createStreamMaterial, createBeamMaterial,
} from './feed/shaders.js';
import {
  buildPostAtlas, buildPopupAtlas, buildNumeralAtlas, buildSignAtlas, atlasRect, SIGN_GRID,
} from './feed/atlas.js';
import {
  Parts, DEG, polar, facingCenter, buildMonoliths, buildRimCap, annulusTrimesh, wallTrimesh, sectorGeometry, arcTube, strut, buildDrone,
} from './feed/geometry.js';
import { createPopups } from './feed/popups.js';

const ID = 'feed';
const R = PIT.r;
const RIM = PIT.rim + 0.06;
const FLOOR = PIT.floor;
const CENTER = new THREE.Vector3(PIT.cx, FLOOR, PIT.cz);
const NEAR = 350;
const ACTIVE = 365;
const VISIT_RESET = 300;
const SPAWN = [0, PIT.rim, -497, 0];

const LEDGES = [
  { y: 112, az: 205, depth: 5, span: 24 },
  { y: 100, az: 300, depth: 6, span: 24 },
  { y: 88, az: 40, depth: 6.5, span: 30 },
  { y: 76, az: 190, depth: 5, span: 22 },
  { y: 64, az: 285, depth: 6, span: 26 },
  { y: 52, az: 30, depth: 5.5, span: 22 },
  { y: 41, az: 115, depth: 6, span: 24 },
  { y: 30, az: 175, depth: 7, span: 30 },
  { y: 19, az: 270, depth: 5.5, span: 24 },
];
const FAKE_LEDGES = [
  { y: 95, az: 100, depth: 6, span: 22 },
  { y: 58, az: 0, depth: 6, span: 24 },
  { y: 25, az: 330, depth: 5.5, span: 22 },
];
const SHAFT_POPUPS = [
  { y: 106, az: 250, r: 15, w: 7, dodges: 0, cell: 1 },
  { y: 83, az: 110, r: 14, w: 6.5, dodges: 2, cell: 3 },
  { y: 70, az: 330, r: 15, w: 7, dodges: 0, cell: 4 },
  { y: 57, az: 200, r: 13, w: 6, dodges: 1, cell: 8 },
  { y: 46, az: 60, r: 15, w: 7, dodges: 0, cell: 13 },
  { y: 24, az: 230, r: 14, w: 6.5, dodges: 0, cell: 9 },
];
const LEVEL_AZ = [190, 290, 40, 130, 230, 330, 175];
const RING_AZ = 200;
const BOARDS = [180, 60, 300];
const TERRACE_AZ = 150;
const RAIL_GAPS = [[180, 4], [150, 8], [60, 4], [300, 4], [245, 5], [20, 4]];
const DRONE_SLOTS = 9;
const DRONE_ORBIT = 2.6;
const DRONE_Y = FLOOR + 6.6;
const HIT_RADIUS = 1.6;
const HIT_SPEED = 4;
const PAVES = [[120, 8], [175, 10], [215, 8.5], [250, 11], [95, 12.5], [290, 9]];
const TOTEMS = [
  { x: -6, z: -521, rot: 0.1, front: 0, back: 6 },
  { x: 9, z: -547, rot: -0.15, front: 3, back: 4 },
  { x: -10, z: -576, rot: 0.2, front: 5, back: 7 },
  { x: 4.5, z: -606, rot: 0, front: 2, back: 1 },
];

const at = (azDeg, r, y) => {
  const [x, z] = polar(azDeg * DEG, r);
  return new THREE.Vector3(x, y, z);
};

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export default async function create(ctx) {
  const { scene, physics, world, state, mat, texts, events } = ctx;
  const rand = ctx.rng.seeded('feed:zone');
  const root = new THREE.Group();
  root.name = 'zone:feed';
  const far = new THREE.Group();
  far.name = 'feed:landmark';
  const near = new THREE.Group();
  near.name = 'feed:detail';
  root.add(far, near);
  scene.add(root);

  const smoothTrimesh = (vertices, indices) => {
    const { RAPIER } = physics;
    const desc = RAPIER.ColliderDesc.trimesh(vertices, indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
      .setFriction(0.9).setCollisionGroups(physics.groups(physics.GROUPS.STATIC));
    return physics.world.createCollider(desc);
  };

  world.addClearing({ x: PIT.cx, z: PIT.cz, r: 185, trees: true, grass: true, rocks: true });

  const zoneAtm = ctx.env.addAtmosphere({
    id: 'feed', center: [PIT.cx, PIT.cz], radius: 175, falloff: 90, fogColor: '#d4e2f4', fogDensity: 0.9, tint: [0.98, 1.0, 1.04], saturation: 1.05,
  });
  const pitAtm = ctx.env.addAtmosphere({
    id: 'feed:pit', center: [PIT.cx, PIT.cz], radius: R - 1, falloff: 5, fogColor: '#2b2117', fogDensity: 1, darkness: 0, exposure: 1,
  });

  const postAtlas = buildPostAtlas(ctx);
  const popupAtlas = buildPopupAtlas(ctx);
  const numeralAtlas = buildNumeralAtlas(ctx);
  const signAtlas = buildSignAtlas(ctx);

  // --- landmark: the seven monoliths -------------------------------------------------------
  const mono = buildMonoliths(rand);
  const monoBodies = new THREE.Mesh(mono.bodies, mat.standard({ vertexColors: true, roughness: 0.22, metalness: 0.08 }));
  monoBodies.castShadow = true;
  monoBodies.receiveShadow = true;
  monoBodies.name = 'feed:monoliths';
  const monoScreens = new THREE.Mesh(mono.screens, createScreenMaterial(mat, postAtlas));
  monoScreens.name = 'feed:screens';
  far.add(monoBodies, monoScreens);
  for (const c of mono.colliders) physics.addStaticBox({ position: c.position, size: c.size, quaternion: c.quaternion, userData: { kind: 'monolith' } });

  // --- plaza, rim, pit structures (one synthetic mesh, one glow mesh) ------------------------
  const synth = new Parts(rand);
  const glow = new Parts(rand);
  const synthMat = mat.standard({ vertexColors: true, roughness: 0.3, metalness: 0.06 }, { onShader: pitLitShader });
  const glowMat = mat.glow('#ffffff', 2.4, { vertexColors: true });

  synth.add(buildRimCap(), { color: '#eceff5' });
  glow.add(arcTube(R - 0.33, PIT.rim - 0.75, 0, Math.PI * 2, 0.05, 5), { color: '#5ce1e6' });

  const inGap = (azDeg) => RAIL_GAPS.some(([g, w]) => Math.abs(((azDeg - g + 540) % 360) - 180) < w);
  const railR = R + 0.9;
  const arcs = [];
  let start = null;
  for (let a = 0; a <= 360; a += 0.5) {
    const open = !inGap(a % 360) && a < 360;
    if (open && start === null) start = a;
    if ((!open || a === 360) && start !== null) {
      arcs.push([start, a]);
      start = null;
    }
  }
  const railColliderVerts = [];
  const railColliderIdx = [];
  for (const [a0, a1] of arcs) {
    glow.add(arcTube(railR, RIM + 1.05, a0 * DEG, a1 * DEG, 0.055, 6), { color: '#5ce1e6' });
    glow.add(arcTube(railR, RIM + 0.55, a0 * DEG, a1 * DEG, 0.03, 5), { color: '#ff5fa2' });
    for (let a = a0; a <= a1 + 0.01; a += 2.5) {
      const [x, z] = polar(a * DEG, railR);
      synth.add(new THREE.CylinderGeometry(0.045, 0.06, 1.1, 8), { color: '#dfe3ec', pos: [x, RIM + 0.55, z] });
    }
    const n = Math.max(2, Math.ceil((a1 - a0) / 3));
    const base = railColliderVerts.length / 3;
    for (let i = 0; i <= n; i++) {
      const [x, z] = polar((a0 + ((a1 - a0) * i) / n) * DEG, railR);
      railColliderVerts.push(x, RIM - 0.1, z, x, RIM + 1.15, z);
    }
    for (let i = 0; i < n; i++) {
      const k = base + i * 2;
      railColliderIdx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  physics.addStaticTrimesh(new Float32Array(railColliderVerts), new Uint32Array(railColliderIdx), { userData: { kind: 'rail' } });
  {
    const top = annulusTrimesh(R - 0.3, 41.5, RIM, RIM, 120);
    smoothTrimesh(top.vertices, top.indices);
  }

  for (const azDeg of BOARDS) {
    const az = azDeg * DEG;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facingCenter(az));
    const m = (r, y) => {
      const [x, z] = polar(az, r);
      return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
    };
    synth.add(new RoundedBoxGeometry(1.5, 0.24, 9.5, 2, 0.1), { color: '#f6f8fc', matrix: m(26.4, RIM - 0.06) });
    for (const side of [-1, 1]) {
      glow.add(new THREE.BoxGeometry(0.05, 0.05, 9.2), { color: '#ff5fa2', matrix: m(26.4, RIM + 0.07), pos: [side * 0.74, 0, 0] });
      synth.add(new THREE.CylinderGeometry(0.05, 0.06, 1.0, 8), { color: '#dfe3ec', matrix: m(30.3, RIM + 0.5), pos: [side * 0.95, 0, 0] });
    }
    const [x, z] = polar(az, 26.4);
    physics.addStaticBox({ position: [x, RIM - 0.06, z], size: [1.5, 0.24, 9.5], quaternion: q, userData: { kind: 'board' } });
  }

  const terraceGeo = sectorGeometry({ rIn: 22.6, rOut: R + 1.6, az0: (TERRACE_AZ - 8) * DEG, az1: (TERRACE_AZ + 8) * DEG, thickness: 0.9, segments: 12 });
  terraceGeo.translate(PIT.cx, RIM - 0.9, PIT.cz);
  synth.add(terraceGeo, { color: '#e6eaf2' });
  glow.add(arcTube(22.75, RIM - 0.45, (TERRACE_AZ - 7.4) * DEG, (TERRACE_AZ + 7.4) * DEG, 0.05, 5), { color: '#5ce1e6' });
  physics.addStaticMesh(new THREE.Mesh(terraceGeo), { userData: { kind: 'terrace' } });

  for (const t of TOTEMS) {
    const mtx = new THREE.Matrix4().compose(new THREE.Vector3(t.x, PIT.rim, t.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot), new THREE.Vector3(1, 1, 1));
    synth.add(new RoundedBoxGeometry(1.3, 0.4, 1.0, 2, 0.15), { color: '#e3e7ef', matrix: mtx, pos: [0, 0.2, 0] });
    synth.add(new RoundedBoxGeometry(0.34, 3.2, 0.34, 2, 0.12), { color: '#f4f6fb', matrix: mtx, pos: [0, 1.9, 0] });
    synth.add(new RoundedBoxGeometry(2.9, 1.55, 0.2, 3, 0.08), { color: '#f4f6fb', matrix: mtx, pos: [0, 3.85, 0] });
    glow.add(new THREE.BoxGeometry(2.6, 0.04, 0.24), { color: '#ff5fa2', matrix: mtx, pos: [0, 3.05, 0] });
    physics.addStaticBox({ position: new THREE.Vector3(0, 2.2, 0).applyMatrix4(mtx), size: [0.6, 4.4, 0.6] });
  }

  // --- pit wall ---------------------------------------------------------------------------
  const wallMat = mat.standard({ color: '#ffffff', roughness: 1, metalness: 0, side: THREE.BackSide }, {
    onShader: wallShader({
      uPosts: { value: postAtlas },
      uNumerals: { value: numeralAtlas },
      uLevelAz: { value: LEVEL_AZ.map((a) => a * DEG) },
      uRingAz: { value: RING_AZ * DEG },
    }),
  });
  const wallGeo = new THREE.CylinderGeometry(R, R, PIT.rim - 6, 128, 40, true);
  wallGeo.translate(PIT.cx, (PIT.rim + 6) / 2, PIT.cz);
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.name = 'feed:wall';
  wall.receiveShadow = false;
  near.add(wall);
  {
    const w = wallTrimesh(R, 4, RIM - 0.35, 96, 8);
    physics.addStaticTrimesh(w.vertices, w.indices, { userData: { kind: 'pit-wall' } });
  }

  // --- ledges -------------------------------------------------------------------------------
  const ledgeColor = (y) => new THREE.Color('#eef1f7').lerp(new THREE.Color('#6d6760'), smooth(110, 20, y)).getStyle();
  const glowColor = (y) => new THREE.Color('#5ce1e6').lerp(new THREE.Color('#ffb454'), smooth(100, 25, y)).multiplyScalar(0.55 + 0.45 * smooth(20, 100, y)).getStyle();
  function ledgeGeometry(l) {
    const g = sectorGeometry({ rIn: R - l.depth, rOut: R + 0.5, az0: (l.az - l.span / 2) * DEG, az1: (l.az + l.span / 2) * DEG, thickness: 0.7 });
    g.translate(PIT.cx, l.y - 0.7, PIT.cz);
    return g;
  }
  for (const l of LEDGES) {
    const g = ledgeGeometry(l);
    synth.add(g, { color: ledgeColor(l.y) });
    physics.addStaticMesh(new THREE.Mesh(g), { userData: { kind: 'ledge' } });
    glow.add(arcTube(R - l.depth + 0.12, l.y + 0.03, (l.az - l.span / 2 + 1.5) * DEG, (l.az + l.span / 2 - 1.5) * DEG, 0.045, 5), { color: glowColor(l.y) });
    for (const side of [-0.3, 0.3]) {
      const az = (l.az + side * l.span) * DEG;
      const [x0, z0] = polar(az, R + 0.1);
      const [x1, z1] = polar(az, R - l.depth * 0.75);
      strut(synth, new THREE.Vector3(x0, l.y - 3.6, z0), new THREE.Vector3(x1, l.y - 0.6, z1), 0.13, { color: ledgeColor(l.y - 10) });
    }
  }
  const niche = LEDGES[7];
  {
    const az = niche.az * DEG;
    const [x, z] = polar(az, R - 3.6);
    const mtx = new THREE.Matrix4().compose(new THREE.Vector3(x, niche.y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facingCenter(az) + 0.12), new THREE.Vector3(1, 1, 1));
    synth.add(new RoundedBoxGeometry(4.4, 2.9, 0.28, 3, 0.1), { color: '#3a3d44', matrix: mtx, pos: [0, 1.75, 0] });
    synth.add(new THREE.PlaneGeometry(4.0, 2.5), { color: '#08090c', matrix: mtx, pos: [0, 1.75, 0.15] });
    synth.add(new RoundedBoxGeometry(0.9, 0.35, 0.7, 2, 0.1), { color: '#2b2d33', matrix: mtx, pos: [-1.2, 0.17, 0] });
    synth.add(new RoundedBoxGeometry(0.9, 0.35, 0.7, 2, 0.1), { color: '#2b2d33', matrix: mtx, pos: [1.2, 0.17, 0] });
    const q = new THREE.Quaternion().setFromRotationMatrix(mtx);
    physics.addStaticBox({ position: new THREE.Vector3(0, 1.6, 0).applyMatrix4(mtx), size: [4.4, 3.2, 0.3], quaternion: q });
  }
  const fakeLedges = FAKE_LEDGES.map((l) => {
    const g = ledgeGeometry(l);
    const tint = new Float32Array(g.attributes.position.count * 3);
    const c = new THREE.Color(ledgeColor(l.y));
    for (let i = 0; i < tint.length; i += 3) {
      tint[i] = c.r;
      tint[i + 1] = c.g;
      tint[i + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(tint, 3));
    const m = new THREE.Mesh(g, synthMat);
    m.name = 'feed:fake-ledge';
    near.add(m);
    return m;
  });

  // --- cables -------------------------------------------------------------------------------
  const cableRand = ctx.rng.seeded('feed:cables');
  for (let i = 0; i < 9; i++) {
    const az0 = (i / 9) * Math.PI * 2 + cableRand() * 0.4;
    const pts = [];
    let y = PIT.rim - 0.5 - cableRand() * 20;
    let az = az0;
    pts.push(at(az / DEG, R - 0.2, y));
    while (y > FLOOR + 4) {
      const drop = 9 + cableRand() * 8;
      const mid = y - drop * 0.6;
      az += (cableRand() - 0.5) * 0.12;
      const [mx, mz] = polar(az, R - 0.8 - cableRand() * 0.8);
      pts.push(new THREE.Vector3(mx, mid, mz));
      y -= drop;
      az += (cableRand() - 0.5) * 0.12;
      const [x, z] = polar(az, R - 0.18);
      pts.push(new THREE.Vector3(x, Math.max(y, FLOOR + 1.5), z));
    }
    let r = R - 0.6;
    let fy = FLOOR + 0.12;
    for (let k = 0; k < 4; k++) {
      r -= 2 + cableRand() * 3;
      az += (cableRand() - 0.5) * 0.35;
      const [x, z] = polar(az, r);
      pts.push(new THREE.Vector3(x, fy, z));
      fy = FLOOR + 0.1;
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    synth.add(new THREE.TubeGeometry(curve, Math.ceil(curve.getLength() / 1.4), 0.08 + cableRand() * 0.07, 5, false), { color: i % 3 ? '#1d1f24' : '#3a2c2a' });
  }

  // --- the bottom ---------------------------------------------------------------------------
  const floorUniforms = { uPool: { value: CENTER.clone() }, uPoolPower: { value: 1 } };
  const floorMat = mat.standard({ color: '#ffffff', roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, { onShader: floorShader(floorUniforms) });
  const floorGeo = new THREE.CircleGeometry(R + 0.4, 96);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(PIT.cx, FLOOR + 0.02, PIT.cz);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  floor.name = 'feed:floor';
  near.add(floor);

  const skirt = new THREE.LatheGeometry([[R + 0.05, FLOOR + 1.1], [R - 0.7, FLOOR + 0.6], [R - 1.6, FLOOR + 0.25], [R - 2.6, FLOOR - 0.1]].map(([a, b]) => new THREE.Vector2(a, b)), 96);
  skirt.translate(PIT.cx, 0, PIT.cz);
  synth.add(skirt, { color: '#4a443d' });

  const debrisRand = ctx.rng.seeded('feed:debris');
  const placed = [];
  const clear = (x, z, rr) => Math.hypot(x - CENTER.x, z - CENTER.z) > 6 + rr
    && placed.every(([px, pz, pr]) => Math.hypot(x - px, z - pz) > pr + rr)
    && PAVES.every(([a, r]) => {
      const [px, pz] = polar(a * DEG, r);
      return Math.hypot(x - px, z - pz) > rr + 1.2;
    });
  for (const [a, r] of [[TERRACE_AZ, 11.5], [TERRACE_AZ, 15.5], [RING_AZ, R - 1.4]]) placed.push([...polar(a * DEG, r), 2.4]);
  for (let i = 0, tries = 0; i < 11 && tries < 200; tries++) {
    const leaning = i < 4;
    const az = debrisRand() * Math.PI * 2;
    const r = leaning ? R - 0.9 : 8 + debrisRand() * 15;
    const [x, z] = polar(az, r);
    if (!clear(x, z, 2.1)) continue;
    placed.push([x, z, 2.1]);
    const w = 2.6 + debrisRand() * 1.6;
    const h = w * 0.62;
    const yaw = leaning ? facingCenter(az) : debrisRand() * Math.PI * 2;
    const tilt = leaning ? -0.28 : -Math.PI / 2 + (debrisRand() - 0.5) * 0.3;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, (debrisRand() - 0.5) * 0.15, 'YXZ'));
    const pos = new THREE.Vector3(x, FLOOR + (leaning ? h * 0.48 : 0.12), z);
    const mtx = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1));
    synth.add(new RoundedBoxGeometry(w, h, 0.16, 2, 0.05), { color: '#2f3238', vary: 0.1, matrix: mtx });
    synth.add(new THREE.PlaneGeometry(w - 0.24, h - 0.24), { color: '#07080b', matrix: mtx, pos: [0, 0, 0.085] });
    physics.addStaticBox({ position: pos, size: [w, h, 0.16], quaternion: q, userData: { kind: 'debris' } });
    i++;
  }
  for (let i = 0; i < 26; i++) {
    const az = debrisRand() * Math.PI * 2;
    const r = 6 + debrisRand() * (R - 7);
    const [x, z] = polar(az, r);
    if (!clear(x, z, 0.5)) continue;
    const s = 0.25 + debrisRand() * 0.45;
    synth.add(new THREE.DodecahedronGeometry(s, 1), { color: '#575049', vary: 0.12, pos: [x, FLOOR + s * 0.2, z], rot: [(debrisRand() - 0.5) * 0.3, debrisRand() * 6, 0], scale: [1.3, 0.45, 1] });
  }

  const synthMesh = new THREE.Mesh(synth.build(), synthMat);
  synthMesh.name = 'feed:structures';
  synthMesh.castShadow = true;
  synthMesh.receiveShadow = true;
  const glowMesh = new THREE.Mesh(glow.build(), glowMat);
  glowMesh.name = 'feed:glow';
  near.add(synthMesh, glowMesh);

  // --- signage faces ---------------------------------------------------------------------------
  {
    const faces = [];
    for (const t of TOTEMS) {
      for (const [idx, side] of [[t.front, 1], [t.back, -1]]) {
        const g = new THREE.PlaneGeometry(2.6, 1.3);
        const [u, v, du, dv] = atlasRect(idx, SIGN_GRID);
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, u + uv.getX(i) * du, v + uv.getY(i) * dv);
        if (side < 0) g.rotateY(Math.PI);
        g.translate(0, 3.85, 0.112 * side);
        g.rotateY(t.rot);
        g.translate(t.x, PIT.rim, t.z);
        faces.push(g);
      }
    }
    const parts = new Parts();
    for (const g of faces) {
      parts.add(g);
      g.dispose();
    }
    const faceGeo = parts.build();
    const faceMesh = new THREE.Mesh(faceGeo, mat.basic({ map: signAtlas, color: new THREE.Color(1, 1, 1).multiplyScalar(1.35) }));
    faceMesh.name = 'feed:signs';
    near.add(faceMesh);
  }

  // --- card streams sucked into the pit ----------------------------------------------------
  {
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    const streams = [160, 200, 125, 240, 20, 305, 70];
    const perStream = 64;
    const count = streams.length * perStream;
    const seeds = new Float32Array(count * 4);
    const ang = new Float32Array(count);
    const sr = ctx.rng.seeded('feed:stream');
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < 4; k++) seeds[i * 4 + k] = sr();
      ang[i] = streams[Math.floor(i / perStream)] * DEG;
    }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    g.setAttribute('aStream', new THREE.InstancedBufferAttribute(ang, 1));
    g.instanceCount = count;
    const stream = new THREE.Mesh(g, createStreamMaterial(mat, postAtlas));
    stream.frustumCulled = false;
    stream.renderOrder = 2;
    stream.name = 'feed:stream';
    near.add(stream);
  }

  // --- kiosks ----------------------------------------------------------------------------------
  const trending = texts.SYNTH_DOCS.feed_trending;
  const kioskTex = ctx.text.texture({
    style: 'post', width: 432, height: 1024, title: trending.title, author: trending.author, body: trending.body, meta: trending.date,
    footer: trending.footer, accent: '#ff5fa2', fontSize: 30,
  });
  const otherPost = texts.slopPost(ctx.rng.seeded('feed:kiosk2'));
  const kiosk2Tex = ctx.text.texture({ style: 'post', width: 432, height: 1024, title: 'Pour vous', author: otherPost.author, handle: otherPost.handle, body: otherPost.text, meta: otherPost.age, fontSize: 28 });
  const kiosks = [
    ctx.props.terminal([-12, PIT.rim, -560], 0.35, { style: 'kiosk', texture: kioskTex }),
    ctx.props.terminal([13, PIT.rim, -574], -0.4, { style: 'kiosk', texture: kiosk2Tex }),
  ];
  const kioskPos = new THREE.Vector3(-12, PIT.rim + 1.4, -560);
  ctx.interact.add({
    id: 'feed:trending', position: kioskPos, radius: 2.8, label: 'Lire — Tendances',
    onInteract: () => ctx.ui.reader.open(trending),
  });
  ctx.scanner.register({ position: kioskPos, kind: 'synthetic' });

  // --- bots ------------------------------------------------------------------------------------
  const botLines = texts.BOT_LINES.feed;
  ctx.bots.spawn({ center: [-30, -551], radius: 15, count: 45, behavior: 'mill', lines: botLines });
  ctx.bots.spawn({ center: [22, -538], radius: 20, count: 25, behavior: 'wander', lines: botLines });
  ctx.bots.spawn({ center: [6, -599], radius: 8, count: 24, behavior: 'queue', lines: botLines, yaw: Math.atan2(6 - PIT.cx, -599 - PIT.cz) });
  ctx.bots.spawn({ center: [-46, -699], radius: 8, count: 26, behavior: 'stare', lines: botLines, lookAt: [polar(-38 * DEG, 94)[0], PIT.rim + 58, polar(-38 * DEG, 94)[1]] });

  // --- lights ----------------------------------------------------------------------------------
  const lights = {
    plazaA: ctx.env.lights.add({ position: new THREE.Vector3(-4, PIT.rim + 4, -566), color: '#ff5fa2', intensity: 6, distance: 26 }),
    plazaB: ctx.env.lights.add({ position: new THREE.Vector3(0, PIT.rim + 3, -604), color: '#5ce1e6', intensity: 5, distance: 18 }),
    pool: ctx.env.lights.add({ position: new THREE.Vector3(CENTER.x, FLOOR + 4.5, CENTER.z), color: '#ffb454', intensity: 14, distance: 24, decay: 1.4 }),
    ring: ctx.env.lights.add({ position: at(RING_AZ, R - 3, FLOOR + 2.6), color: '#ffb454', intensity: 4, distance: 10, flicker: 0.2 }),
    reply: ctx.env.lights.add({ position: at(40, R - 3, 90.5), color: '#9fe9ff', intensity: 4, distance: 13 }),
    draft: ctx.env.lights.add({ position: at(175, R - 2.5, 32.5), color: '#ffc47a', intensity: 3.5, distance: 10, flicker: 0.1 }),
    drone: ctx.env.lights.add({ position: new THREE.Vector3(CENTER.x, DRONE_Y, CENTER.z), color: '#ff5fa2', intensity: 6, distance: 13 }),
  };
  const dust = ctx.particles.emitter({
    position: new THREE.Vector3(CENTER.x, FLOOR + 2.5, CENTER.z), radius: 16, rate: 7, color: '#ffd29a', shape: 'dot',
    size: [0.02, 0.05], life: [4, 8], speed: [0.03, 0.15], gravity: 0.02, drag: 0.8, cullDistance: 70,
  });

  // --- traces, beacon, link -------------------------------------------------------------------
  const tracePos = (azDeg, r, y) => at(azDeg, r, y).toArray();
  ctx.traces.add({ id: 'feed_reply', position: tracePos(40, R - 2.4, 88) });
  ctx.traces.add({ id: 'feed_draft', position: tracePos(175, R - 1.5, 30) });
  ctx.traces.add({ id: 'feed_bio', position: tracePos(RING_AZ, R - 1.5, FLOOR) });

  ctx.beacons.create(ID, { position: [CENTER.x, FLOOR, CENTER.z], rotationY: Math.PI - TERRACE_AZ * DEG });

  const linkA = tracePos(TERRACE_AZ, 24.6, RIM);
  const linkB = tracePos(TERRACE_AZ, 15.5, FLOOR);
  ctx.links.add({ id: 'feed-top', a: linkA, b: linkB, label: 'Le fond du Fil', labelBack: texts.FEED.backToTop });

  // --- popups -----------------------------------------------------------------------------------
  const popups = createPopups(ctx, { atlas: popupAtlas, parent: near });
  for (const s of SHAFT_POPUPS) {
    const [x, z] = polar(s.az * DEG, s.r);
    popups.spawn({ position: new THREE.Vector3(x, s.y, z), yaw: facingCenter(s.az * DEG), width: s.w, cellIndex: s.cell, dodges: s.dodges });
  }

  // --- pavés --------------------------------------------------------------------------------------
  const paves = PAVES.map(([a, r], i) => {
    const [x, z] = polar(a * DEG, r);
    const origin = new THREE.Vector3(x, FLOOR + 0.2, z);
    const entity = ctx.props.pave([x, null, z], { rotationY: rand() * Math.PI * 2 });
    return { entity, origin, yaw: i * 1.3 };
  });
  const paveSet = new Set(paves.map((p) => p.entity));
  let lostTimer = 0;

  // --- drone -------------------------------------------------------------------------------------
  const droneGeo = buildDrone();
  const droneMat = mat.standard({ vertexColors: true, roughness: 0.2, metalness: 0.1 });
  const droneMesh = new THREE.Mesh(droneGeo.body, droneMat);
  droneMesh.name = 'feed:drone';
  droneMesh.castShadow = true;
  const droneGlow = new THREE.Mesh(droneGeo.glow, mat.glow('#ffffff', 4, { vertexColors: true }));
  droneMesh.add(droneGlow);
  scene.add(droneMesh);
  const beamGeo = new THREE.BufferGeometry();
  const beamPos = new Float32Array(DRONE_SLOTS * 4 * 3);
  const beamUv = new Float32Array(DRONE_SLOTS * 4 * 2);
  const beamIdx = [];
  for (let i = 0; i < DRONE_SLOTS; i++) {
    beamUv.set([0, 0, 1, 0, 0, 1, 1, 1], i * 8);
    const k = i * 4;
    beamIdx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
  }
  beamGeo.setAttribute('position', new THREE.BufferAttribute(beamPos, 3));
  beamGeo.setAttribute('uv', new THREE.BufferAttribute(beamUv, 2));
  beamGeo.setIndex(beamIdx);
  const beams = new THREE.Mesh(beamGeo, createBeamMaterial(mat));
  beams.frustumCulled = false;
  beams.name = 'feed:beams';
  near.add(beams);

  const drone = {
    state: 'flying', angle: 0, entity: null, slots: new Array(DRONE_SLOTS).fill(null), pending: [], fallT: 0, landed: false, loop: null,
    pos: new THREE.Vector3(CENTER.x + DRONE_ORBIT, DRONE_Y, CENTER.z), quat: new THREE.Quaternion(), eye: new THREE.Vector3(),
  };
  const scanDrone = ctx.scanner.register({ object: droneMesh, kind: 'synthetic', label: 'Drone publicitaire' });

  const visit = { pit: false, bottom: false, pave: false, popups: false, inside: false };
  let solvedSaid = false;

  function slotPosition(j, out) {
    const az = (j * 360) / DRONE_SLOTS * DEG + 0.35;
    const r = j % 2 ? 3.55 : 3.15;
    const [x, z] = polar(az, r);
    return out.set(x, FLOOR + 1.95, z);
  }

  function openSlot(appear = 0.45) {
    const free = [];
    drone.slots.forEach((s, j) => {
      if (!s) free.push(j);
    });
    if (!free.length) return null;
    const j = free[Math.floor(Math.random() * free.length)];
    const az = (j * 360) / DRONE_SLOTS * DEG + 0.35;
    const pp = popups.spawn({
      position: slotPosition(j, new THREE.Vector3()), yaw: Math.PI - az, width: 3.1, cellIndex: (j * 5 + drone.pending.length + 3) % 16,
      kind: 'drone', appear, onClose: (p) => onDronePopupClosed(p, j),
    });
    drone.slots[j] = pp;
    return pp;
  }

  function onDronePopupClosed(pp, j) {
    if (drone.slots[j] === pp) drone.slots[j] = null;
    if (drone.state !== 'flying') return;
    drone.pending.push(0.6 + Math.random() * 0.5, 1.3 + Math.random() * 0.6);
    if (!visit.popups) {
      visit.popups = true;
      ctx.companion.say('zone.feed.popups', { priority: 1 });
    }
  }

  function placeDroneDown() {
    const [x, z] = polar(62 * DEG, 5.2);
    droneMesh.position.set(x, FLOOR + 0.62, z);
    droneMesh.quaternion.setFromEuler(new THREE.Euler(0.32, 1.1, -0.18));
    makeDroneDynamic();
  }

  function makeDroneDynamic() {
    drone.entity = physics.addDynamic(droneMesh, {
      shape: 'sphere', size: [2.1, 2.1, 2.1], mass: 32, friction: 0.8, restitution: 0.25, angularDamping: 0.8, linearDamping: 0.15, ccd: true, grabbable: true, buoyant: true,
      userData: { kind: 'drone' },
    });
    drone.entity.onCollision = (other, speed) => {
      if (speed < 2) return;
      ctx.audio.sfx(speed > 5 ? 'impact.hard' : 'impact.soft', { position: drone.entity.position, volume: Math.min(1, speed / 8) });
      if (drone.state === 'falling' && !drone.landed && (other === physics.terrain || other?.kind === 'static')) land();
    };
  }

  function burstAll() {
    const live = drone.slots.filter(Boolean);
    live.forEach((pp, i) => setTimeout(() => popups.close(pp, { silent: i % 2 === 1 }), 160 + i * 220));
    drone.slots.fill(null);
    drone.pending.length = 0;
  }

  function hitDrone(by) {
    if (drone.state !== 'flying') return false;
    drone.state = 'falling';
    drone.fallT = 0;
    const at = droneMesh.position.clone();
    ctx.audio.sfx('drone.hit', { position: at });
    ctx.particles.burst({ position: at, count: 60, color: '#ffffff', color2: '#ff5fa2', shape: 'spark', speed: [3, 9], life: [0.3, 0.9], size: [0.04, 0.12], gravity: -6 });
    ctx.particles.burst({ position: at, count: 24, color: '#5ce1e6', shape: 'glyph', speed: [1, 4], life: [0.6, 1.4], size: [0.08, 0.16], gravity: -2 });
    ctx.postfx.glitch(0.7, 0.6);
    ctx.postfx.flash('#ff5fa2', 0.25);
    ctx.player.shake(0.25, 0.3);
    if (drone.loop) {
      drone.loop.stop(0.6);
      drone.loop = null;
    }
    if (drone.kin) {
      drone.kin.remove();
      drone.kin = null;
    }
    makeDroneDynamic();
    const v = new THREE.Vector3(1, 0, 0.3);
    if (by?.lastVelocity && by.lastVelocity.lengthSq() > 0.01) v.copy(by.lastVelocity).setY(0);
    if (v.lengthSq() < 1e-4) v.set(1, 0, 0);
    v.normalize().multiplyScalar(2.5);
    drone.entity.setVelocity([v.x, -1, v.z]);
    drone.entity.body.setAngvel({ x: 2.2, y: 3, z: -1.4 }, true);
    scanDrone.enabled = false;
    burstAll();
    state.setFlag(`zone.${ID}.drone`, true);
    setTimeout(() => ctx.audio.sfx('drone.down', { position: droneMesh.position }), 250);
    return true;
  }

  function land() {
    drone.landed = true;
    ctx.particles.burst({ position: droneMesh.position.clone(), count: 40, color: '#b9a58c', shape: 'dot', speed: [1, 3], life: [0.8, 2], size: [0.05, 0.14], gravity: -0.5, additive: false });
    ctx.player.shake(0.15, 0.25);
    finishSolve();
  }

  function finishSolve() {
    if (drone.state === 'down') return;
    drone.state = 'down';
    lights.drone.intensity = 0;
    if (state.beacons[ID] === 'locked') ctx.beacons.setReady(ID);
    if (!solvedSaid) {
      solvedSaid = true;
      ctx.companion.say('zone.feed.solved', { priority: 2, interrupt: true });
    }
  }

  const solved = state.flag(`zone.${ID}.drone`) || state.beacons[ID] !== 'locked';
  if (solved) {
    drone.state = 'down';
    drone.landed = true;
    solvedSaid = true;
    scanDrone.enabled = false;
    lights.drone.intensity = 0;
    placeDroneDown();
    if (state.beacons[ID] === 'locked') ctx.beacons.setReady(ID);
  } else {
    droneMesh.position.copy(drone.pos);
    drone.kin = physics.addKinematic(droneMesh, { shape: 'sphere', size: [2.3, 2.3, 2.3], userData: { kind: 'drone' } });
    for (let i = 0; i < 6; i++) openSlot(0);
  }

  const hallus = fakeLedges.map((m) => ctx.scanner.hallucination(m, { duration: 9 }));

  // --- per-frame ----------------------------------------------------------------------------------
  const pp = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const side = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const UP = new THREE.Vector3(0, 1, 0);
  let chatter = null;
  let lastDepth = -1;
  let active = true;
  let nearShown = true;
  let checkT = 0;

  function setNear(on) {
    if (on === nearShown) return;
    nearShown = on;
    near.visible = on;
    droneMesh.visible = on;
    for (const k of kiosks) k.group.visible = on;
    for (const p of paves) if (p.entity.mesh) p.entity.mesh.visible = on;
    dust.enabled = on;
  }

  function respawnPave(p) {
    if (ctx.cursor.held === p.entity) ctx.cursor.release();
    p.entity.setPosition(p.origin.clone().setY(FLOOR + 0.6), new THREE.Quaternion().setFromAxisAngle(UP, p.yaw));
    p.entity.setVelocity([0, 0, 0]);
    p.entity.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    ctx.particles.burst({ position: p.origin.clone().setY(FLOOR + 0.5), count: 14, color: '#ffb454', shape: 'glyph', speed: [0.5, 2], life: [0.6, 1.2], size: [0.06, 0.12], gravity: 0.5 });
  }

  function checkPaves(dt) {
    let available = 0;
    for (const p of paves) {
      const e = p.entity;
      if (!e.body.isValid()) continue;
      const y = e.position.y;
      if (y < -20 || y < FLOOR - 4) {
        respawnPave(p);
        continue;
      }
      const r = Math.hypot(e.position.x - CENTER.x, e.position.z - CENTER.z);
      if (ctx.cursor.held === e || (y < FLOOR + 3 && r < R - 0.3)) available++;
    }
    lostTimer = available > 0 ? 0 : lostTimer + dt;
    if (lostTimer > 3) {
      lostTimer = 0;
      for (const p of paves) respawnPave(p);
    }
  }

  function droneHits() {
    const center = drone.kin ? drone.kin.position : droneMesh.position;
    const near = physics.overlapSphere(center, HIT_RADIUS);
    for (const e of near) {
      if (e === drone.kin || e.kind !== 'dynamic' || e === ctx.cursor.held) continue;
      const v = e.lastVelocity;
      if (v && v.length() > HIT_SPEED) {
        hitDrone(e);
        return;
      }
    }
  }

  function updateBeams() {
    camPos.copy(ctx.camera.position);
    tmp.set(0, -0.43, 0.82).applyQuaternion(droneMesh.quaternion).add(droneMesh.position);
    drone.eye.copy(tmp);
    let n = 0;
    if (drone.state === 'flying') {
      for (const s of drone.slots) {
        if (!s || !s.body) continue;
        const t = s.body.mesh.position;
        tmp2.subVectors(t, drone.eye);
        side.subVectors(camPos, drone.eye).cross(tmp2);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        side.normalize();
        const w0 = 0.04;
        const w1 = 0.9 * s.scale;
        const o = n * 12;
        beamPos[o] = drone.eye.x - side.x * w0; beamPos[o + 1] = drone.eye.y - side.y * w0; beamPos[o + 2] = drone.eye.z - side.z * w0;
        beamPos[o + 3] = drone.eye.x + side.x * w0; beamPos[o + 4] = drone.eye.y + side.y * w0; beamPos[o + 5] = drone.eye.z + side.z * w0;
        beamPos[o + 6] = t.x - side.x * w1; beamPos[o + 7] = t.y - side.y * w1; beamPos[o + 8] = t.z - side.z * w1;
        beamPos[o + 9] = t.x + side.x * w1; beamPos[o + 10] = t.y + side.y * w1; beamPos[o + 11] = t.z + side.z * w1;
        n++;
      }
    }
    beamGeo.setDrawRange(0, n * 6);
    beamGeo.attributes.position.needsUpdate = n > 0;
    beams.visible = n > 0 && nearShown;
  }

  function fixedUpdate(dt) {
    if (!active) return;
    if (drone.state === 'flying' && drone.kin) {
      drone.angle += dt * 0.3;
      const bob = Math.sin(ctx.time.now * 1.3) * 0.35;
      drone.pos.set(CENTER.x + Math.cos(drone.angle) * DRONE_ORBIT, DRONE_Y + bob, CENTER.z + Math.sin(drone.angle) * DRONE_ORBIT);
      const yaw = Math.atan2(CENTER.x - drone.pos.x, CENTER.z - drone.pos.z);
      drone.quat.setFromEuler(euler.set(0.12 + 0.05 * Math.sin(ctx.time.now * 0.9), yaw, 0.08 * Math.sin(ctx.time.now * 0.7)));
      drone.kin.moveTo(drone.pos, drone.quat);
      droneHits();
    }
    popups.fixedUpdate(dt);
  }

  function update(dt) {
    const p = ctx.player.position;
    const dist = Math.hypot(p.x - CENTER.x, p.z - CENTER.z);
    setNear(dist < NEAR);
    active = dist < ACTIVE;
    if (dist > VISIT_RESET) Object.assign(visit, { pit: false, bottom: false, pave: false, popups: false });

    const inPit = dist < R + 0.5;
    const depth = inPit ? Math.min(1, Math.max(0, (RIM - p.y) / (RIM - FLOOR))) : 0;
    if (Math.abs(depth - lastDepth) > 0.004) {
      lastDepth = depth;
      ctx.audio.setParam('depth', depth);
      pitAtm.darkness = 0.78 * smooth(0.03, 0.85, depth);
      pitAtm.exposure = 1 - 0.08 * depth;
      pitAtm.fogDensity = 1 + 3 * depth * depth;
      pitAtm.saturation = 1 - 0.25 * depth;
    }
    if (!active) {
      if (chatter) {
        chatter.stop(2);
        chatter = null;
      }
      if (drone.loop) {
        drone.loop.stop(1);
        drone.loop = null;
      }
      return;
    }

    if (!chatter && dist < 320) chatter = ctx.audio.loop('feed.chatter', { position: new THREE.Vector3(0, PIT.rim + 3, -585), volume: 0.8, refDistance: 30, maxDistance: 260, fade: 2 });
    else if (chatter && dist > 340) {
      chatter.stop(2);
      chatter = null;
    }
    chatter?.setVolume(0.8 * (1 - depth * 0.9), 0.3);

    if (!visit.pit && dist < R + 9 && p.y > RIM - 5) {
      visit.pit = true;
      ctx.companion.say('zone.feed.pit', { priority: 1 });
    }
    if (inPit && p.y < FLOOR + 2 && ctx.player.grounded) {
      if (!state.flag(`zone.${ID}.descend`)) state.setFlag(`zone.${ID}.descend`, true);
      if (!visit.bottom) {
        visit.bottom = true;
        ctx.companion.say('zone.feed.bottom', { priority: 1 });
      }
    }

    if (drone.state === 'flying') {
      for (let i = drone.pending.length - 1; i >= 0; i--) {
        drone.pending[i] -= dt;
        if (drone.pending[i] <= 0) {
          drone.pending.splice(i, 1);
          openSlot(0.5);
        }
      }
      const dd = droneMesh.position.distanceTo(p);
      if (!drone.loop && dd < 80) drone.loop = ctx.audio.loop('drone', { position: droneMesh.position, volume: 0.9, refDistance: 4, maxDistance: 70, fade: 1 });
      else if (drone.loop && dd > 90) {
        drone.loop.stop(1);
        drone.loop = null;
      }
      drone.loop?.setPosition(droneMesh.position);
      lights.drone.position.copy(droneMesh.position).y -= 0.8;
    } else if (drone.state === 'falling') {
      drone.fallT += dt;
      lights.drone.intensity = Math.random() < 0.3 ? 4 : 0.5;
      if (drone.fallT > 2.6) finishSolve();
    }

    checkT += dt;
    if (checkT > 0.5) {
      checkPaves(checkT);
      checkT = 0;
    }
    popups.update(dt);
  }

  function frame() {
    popups.frame();
    if (nearShown) updateBeams();
    floorUniforms.uPoolPower.value = 0.85 + 0.15 * Math.sin(ctx.time.now * 0.7);
  }

  events.on('grab:start', ({ entity }) => {
    if (!paveSet.has(entity)) return;
    if (!state.flag(`zone.${ID}.pave`)) state.setFlag(`zone.${ID}.pave`, true);
    if (!visit.pave) {
      visit.pave = true;
      ctx.companion.say('zone.feed.pave', { priority: 1 });
    }
  });

  return {
    id: ID,
    spawn: SPAWN,
    get drone() {
      return { state: drone.state, position: droneMesh.position.clone(), popups: drone.slots.filter(Boolean).length };
    },
    paves: paves.map((p) => p.entity),
    get objects() {
      return [root, droneMesh, ...kiosks.map((k) => k.group), ...paves.map((p) => p.entity.mesh)];
    },
    popups,
    hallucinations: hallus,
    atmosphere: zoneAtm,
    debugSolve() {
      if (drone.state === 'flying') hitDrone(paves[0].entity);
      finishSolve();
    },
    fixedUpdate,
    update,
    frame,
  };
}
