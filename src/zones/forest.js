import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seeded } from '../core/rng.js';
import { woodTexture, stoneTexture } from '../entities/props/kit.js';
import { Builder } from './forest/builder.js';
import { buildCabin } from './forest/cabins.js';
import { createCrawlers, routeClearings } from './forest/crawlers.js';
import { resample, ribbon, fernGeometry, mushroomGeometry, windSway } from './forest/dressing.js';
import { windowMaterial, smokeMaterial, mistMaterial, waterMaterial, trailMaterial, fireMaterial } from './forest/shaders.js';
import {
  CENTER, FIRE, FIRE_R, CABINS, RIGHT, TRAILS, STREAM, BRIDGES, STUMP, EDGE, DETAIL_FAR, ACTIVE_FAR, INSIDE_R,
} from './forest/layout.js';

const PI = Math.PI;
const OFF_NEAR = 28;
const ON_FAR = 45;
const ON_DELAY = 22;
const FILL_TIME = 1.6;
const DRAIN_TIME = 3;
const REPEAT_GAP = 25;

export default async function create(ctx) {
  const { world, scene, state, events, mat } = ctx;
  const flag = (k) => Boolean(state.flag(`zone.forest.${k}`));
  const setFlag = (k, v = true) => state.setFlag(`zone.forest.${k}`, v);
  const rand = seeded('forest-zone');
  const groundY = (x, z) => world.heightAt(x, z);
  const [ax, , az] = world.zones.forest.arrival;

  const stream = STREAM.map(([x, z]) => {
    let best = [x, z];
    let bh = groundY(x, z);
    for (let dx = -10; dx <= 10; dx += 2.5) {
      for (let dz = -10; dz <= 10; dz += 2.5) {
        const h = groundY(x + dx, z + dz) + 0.02 * Math.hypot(dx, dz);
        if (h < bh) {
          bh = h;
          best = [x + dx, z + dz];
        }
      }
    }
    return [x + (best[0] - x) * 0.7, z + (best[1] - z) * 0.7];
  });
  const streamPts = resample(stream, 1.2);

  for (const c of CABINS) {
    world.addClearing({ x: c.x, z: c.z, r: 8.5, trees: true, grass: true, rocks: true });
    world.addClearing({ x: c.x, z: c.z, r: 15, trees: false, grass: true, rocks: false });
  }
  world.addClearing({ x: FIRE[0], z: FIRE[1], r: FIRE_R, trees: true, grass: true, rocks: true });
  world.addClearing({ x: FIRE[0], z: FIRE[1], r: FIRE_R + 6, trees: false, grass: true, rocks: false });
  const trailPts = TRAILS.map((t) => resample(t, 1.2));
  for (const pts of trailPts) for (let i = 0; i < pts.length; i += 2) world.addClearing({ x: pts[i].x, z: pts[i].z, r: 2.6, trees: true, grass: true, rocks: true });
  for (let i = 0; i < streamPts.length; i += 4) world.addClearing({ x: streamPts[i].x, z: streamPts[i].z, r: 2.6, trees: true, grass: true, rocks: false });
  for (const [x, z] of routeClearings(world)) world.addClearing({ x, z, r: 4.6, trees: true, grass: true, rocks: false });
  world.addClearing({ x: ax, z: az, r: 6, trees: true, grass: false, rocks: true });

  const detail = new THREE.Group();
  detail.name = 'forest:detail';
  const landmark = new THREE.Group();
  landmark.name = 'forest:landmark';
  scene.add(detail, landmark);

  const woodMap = woodTexture('forest-wood');
  const woodMat = mat.standard({ map: woodMap, vertexColors: true, roughness: 0.88, metalness: 0 });
  const roofMat = mat.standard({ map: woodMap, vertexColors: true, roughness: 0.92, metalness: 0 });
  const stoneMat = mat.standard({ map: stoneTexture('forest-stone'), vertexColors: true, roughness: 0.9, metalness: 0 }, {
    onShader(shader) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMossN;\nvarying vec3 vMossW;')
        .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvMossN = normalize(mat3(modelMatrix) * objectNormal);\nvMossW = (modelMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMossN;\nvarying vec3 vMossW;\nfloat mossHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 mp = vMossW.xz * 2.3;
          vec2 mi = floor(mp);
          vec2 mf = fract(mp);
          float mn = mix(mix(mossHash(mi), mossHash(mi + vec2(1.0, 0.0)), mf.x), mix(mossHash(mi + vec2(0.0, 1.0)), mossHash(mi + vec2(1.0, 1.0)), mf.x), mf.y);
          float moss = smoothstep(0.35, 0.75, vMossN.y + (mn - 0.5) * 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.2, 0.08) * (0.8 + 0.4 * mn), moss);`);
    },
  });

  const B = {
    wood: new Builder('forest-wood'),
    roof: new Builder('forest-roof'),
    stone: new Builder('forest-stone'),
    glass: new Builder('forest-glass', ['aCabin']),
  };
  const cabins = CABINS.map((cfg, i) => ({ cfg, i, ...buildCabin(cfg, i, B, world) }));
  for (const b of Object.values(B)) b.clearFrame();
  const { wood, stone } = B;

  for (const c of cabins) {
    for (const col of c.colliders) {
      ctx.physics.addStaticBox({
        position: col.pos, size: col.size, quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw), userData: { kind: 'cabin' },
      });
    }
  }

  const fireY = groundY(FIRE[0], FIRE[1]);
  const fireR = seeded('forest-fire');
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * PI * 2 + fireR() * 0.2;
    const x = FIRE[0] + Math.cos(a) * 0.95;
    const z = FIRE[1] + Math.sin(a) * 0.95;
    stone.add(new THREE.IcosahedronGeometry(0.22, 1), {
      world: true, pos: [x, groundY(x, z) + 0.06, z], scale: [1.2, 0.75 + fireR() * 0.3, 0.9], rot: [0, a, 0], displace: 0.05, dk: 5, color: '#5c5a55', vary: 0.2,
    });
  }
  stone.add(new THREE.CircleGeometry(0.85, 20), { world: true, pos: [FIRE[0], fireY + 0.04, FIRE[1]], rot: [-PI / 2, 0, 0], color: '#1d1a17', vary: 0.3 });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * PI * 2 + 0.4;
    wood.log(1.1, 0.07, {
      world: true, pos: [FIRE[0] + Math.cos(a) * 0.28, fireY + 0.22, FIRE[1] + Math.sin(a) * 0.28], rot: [0, -a, PI / 2 - 0.55, 'YXZ'], color: '#2a1d14', radial: 7,
    });
  }
  const benchR = 3.7;
  const benches = 5;
  for (let k = 0; k < benches; k++) {
    const a = (k / benches) * PI * 2 + 0.3 + (fireR() - 0.5) * 0.25;
    const x = FIRE[0] + Math.cos(a) * benchR;
    const z = FIRE[1] + Math.sin(a) * benchR;
    const y = groundY(x, z);
    const yawB = -a + PI / 2;
    wood.log(2.3, 0.23, { world: true, pos: [x, y + 0.36, z], rot: [0, yawB, PI / 2, 'YXZ'], color: '#5d4532', radial: 11, vary: 0.15 });
    wood.box(2.1, 0.05, 0.3, { world: true, pos: [x, y + 0.585, z], rot: [0, yawB, 0], color: '#8a6a4c', vary: 0.12 });
    for (const s of [-0.75, 0.75]) {
      wood.log(0.3, 0.09, { world: true, pos: [x + Math.cos(yawB) * s, y + 0.1, z - Math.sin(yawB) * s], color: '#4a3626', radial: 7 });
    }
    ctx.physics.addStaticBox({ position: [x, y + 0.3, z], size: [2.3, 0.6, 0.48], quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawB) });
  }
  const blanketA = 0.3 + (2 / benches) * PI * 2;
  {
    const x = FIRE[0] + Math.cos(blanketA) * benchR;
    const z = FIRE[1] + Math.sin(blanketA) * benchR;
    wood.add(new RoundedBoxGeometry(0.62, 0.1, 0.44, 2, 0.04), { world: true, pos: [x, groundY(x, z) + 0.66, z], rot: [0, -blanketA + PI / 2 + 0.2, 0], color: '#8c3b2c', vary: 0.25 });
    for (const o of [-0.55, 0.62]) {
      const mx = x + Math.cos(-blanketA + PI / 2) * o;
      const mz = z - Math.sin(-blanketA + PI / 2) * o;
      wood.add(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 10), { world: true, pos: [mx, groundY(x, z) + 0.66, mz], color: o < 0 ? '#c9c2b2' : '#2f4f63', vary: 0.05 });
    }
  }

  const stumpTop = groundY(STUMP[0], STUMP[1]) + 0.55;
  wood.log(0.62, 0.36, { world: true, pos: [STUMP[0], stumpTop - 0.31, STUMP[1]], color: '#4a3828', radial: 12, taper: 0.92, vary: 0.2 });
  wood.add(new THREE.CircleGeometry(0.33, 14), { world: true, pos: [STUMP[0], stumpTop + 0.005, STUMP[1]], rot: [-PI / 2, 0, 0], color: '#a08060', vary: 0.15 });
  ctx.physics.addStaticCylinder({ position: [STUMP[0], stumpTop - 0.3, STUMP[1]], radius: 0.36, height: 0.6 });

  const bridges = BRIDGES.map((b) => {
    let best = streamPts[0];
    let bi = 0;
    streamPts.forEach((p, i) => {
      if ((p.x - b.near[0]) ** 2 + (p.z - b.near[1]) ** 2 < (best.x - b.near[0]) ** 2 + (best.z - b.near[1]) ** 2) {
        best = p;
        bi = i;
      }
    });
    const t = new THREE.Vector3().subVectors(streamPts[Math.min(bi + 2, streamPts.length - 1)], streamPts[Math.max(bi - 2, 0)]).setY(0).normalize();
    const yawBr = Math.atan2(t.x, t.z) + PI / 2;
    const ca = Math.cos(yawBr);
    const sa = Math.sin(yawBr);
    const ends = [-2.1, 2.1].map((o) => groundY(best.x + sa * o, best.z + ca * o));
    const deckY = Math.max(...ends, groundY(best.x, best.z)) + 0.22;
    for (let k = 0; k < 11; k++) {
      const o = -2.25 + k * 0.45;
      wood.box(1.35 + (k % 3) * 0.05, 0.07, 0.4, {
        world: true, pos: [best.x + sa * o, deckY + (k % 2) * 0.01, best.z + ca * o], rot: [0, yawBr + (rand() - 0.5) * 0.05, 0], color: '#6b5440', vary: 0.18,
      });
    }
    for (const s of [-0.6, 0.6]) {
      wood.log(4.9, 0.1, { world: true, pos: [best.x + ca * s, deckY - 0.1, best.z - sa * s], rot: [0, yawBr, PI / 2, 'YXZ'], color: '#4d3a2a', radial: 8 });
    }
    ctx.physics.addStaticBox({ position: [best.x, deckY - 0.12, best.z], size: [1.4, 0.3, 4.9], quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawBr) });
    return { x: best.x, z: best.z, y: deckY };
  });

  const postX = -447.5;
  const postZ = -234;
  const postY = groundY(postX, postZ);
  wood.log(2.6, 0.075, { world: true, pos: [postX, postY + 1.2, postZ], color: '#4a3828', radial: 8, taper: 0.85 });
  wood.log(0.9, 0.045, { world: true, pos: [postX - 0.38, postY + 2.32, postZ - 0.22], rot: [0, -0.52, PI / 2, 'YXZ'], color: '#4a3828', radial: 7 });
  ctx.physics.addStaticCylinder({ position: [postX, postY + 1.2, postZ], radius: 0.1, height: 2.4 });

  const logR = seeded('forest-logs');
  const fallen = [];
  for (let k = 0; k < 16; k++) {
    const a = logR() * PI * 2;
    const d = 30 + logR() * 190;
    const x = CENTER[0] + Math.cos(a) * d;
    const z = CENTER[1] + Math.sin(a) * d;
    if (world.clearedAt(x, z, 'trees') || Math.hypot(x - FIRE[0], z - FIRE[1]) < 22 || Math.hypot(x - ax, z - az) < 30) continue;
    const len = 6 + logR() * 6;
    const yawL = logR() * PI;
    const dx = Math.sin(yawL) * len / 2;
    const dz = Math.cos(yawL) * len / 2;
    const r0 = 0.3 + logR() * 0.15;
    const y0 = groundY(x - dx, z - dz) + r0 * 0.75;
    const y1 = groundY(x + dx, z + dz) + r0 * 0.6;
    const pitch = Math.atan2(y1 - y0, len);
    const cy = (y0 + y1) / 2;
    if (cabins.some((c) => Math.hypot(c.cfg.x - x, c.cfg.z - z) < 14)) continue;
    wood.log(len, r0, {
      world: true, pos: [x, cy, z], rot: [PI / 2 + pitch, yawL, 0, 'YXZ'], color: '#3b2e24', radial: 11, rings: 6, taper: 0.7, displace: 0.04, dk: 2, vary: 0.25,
    });
    stone.add(new THREE.CylinderGeometry(r0 * 2.2, r0 * 2.4, 0.3, 12, 1), {
      world: true, pos: [x - dx * 1.02, y0 + 0.1, z - dz * 1.02], rot: [PI / 2 + pitch, yawL, 0, 'YXZ'], displace: 0.12, dk: 3, color: '#3a3026', vary: 0.3,
    });
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(PI / 2 + pitch, yawL, 0, 'YXZ'));
    ctx.physics.addStaticCylinder({ position: [x, cy, z], radius: r0 * 0.9, height: len, quaternion: q });
    fallen.push({ x, z });
  }

  const boulderR = seeded('forest-boulders');
  const boulderSpots = [];
  for (let k = 0; k < 34; k++) {
    const a = boulderR() * PI * 2;
    const d = 20 + boulderR() * 215;
    boulderSpots.push([CENTER[0] + Math.cos(a) * d, CENTER[1] + Math.sin(a) * d, 0.5 + boulderR() * 1.1]);
  }
  for (let i = 0; i < streamPts.length; i += 9) {
    const p = streamPts[i];
    const s = boulderR() < 0.5 ? -1 : 1;
    boulderSpots.push([p.x + s * (1.6 + boulderR()), p.z + (boulderR() - 0.5) * 2, 0.3 + boulderR() * 0.4]);
  }
  for (const [x, z, s] of boulderSpots) {
    if (cabins.some((c) => Math.hypot(c.cfg.x - x, c.cfg.z - z) < 9) || Math.hypot(x - FIRE[0], z - FIRE[1]) < 9) continue;
    if (bridges.some((b) => Math.hypot(b.x - x, b.z - z) < 4) || Math.hypot(x - ax, z - az) < 25) continue;
    stone.add(new THREE.IcosahedronGeometry(s, 2), {
      world: true, pos: [x, groundY(x, z) + s * 0.25, z], scale: [1.25, 0.72, 1], rot: [0, boulderR() * PI, 0], displace: s * 0.18, dk: 1.2 / s, color: '#646660', vary: 0.18,
    });
    if (s > 0.7) ctx.physics.addStaticSphere({ position: [x, groundY(x, z) + s * 0.2, z], radius: s * 0.75 });
  }

  const woodMesh = new THREE.Mesh(wood.build(), woodMat);
  const roofMesh = new THREE.Mesh(B.roof.build(), roofMat);
  const stoneMesh = new THREE.Mesh(stone.build(), stoneMat);
  const windowMat = windowMaterial(mat, cabins.length, RIGHT);
  const windowMesh = new THREE.Mesh(B.glass.build(), windowMat);
  for (const m of [woodMesh, roofMesh, stoneMesh]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  woodMesh.name = 'forest:wood';
  roofMesh.name = 'forest:roofs';
  stoneMesh.name = 'forest:stone';
  windowMesh.name = 'forest:windows';
  detail.add(woodMesh, roofMesh, stoneMesh, windowMesh);

  const signTex = [0, 1].map((half) => {
    const el = ctx.text.canvas({
      width: 512, height: 512,
      draw(c) {
        for (let k = 0; k < 4; k++) {
          const i = half * 4 + k;
          if (!cabins[i]) continue;
          const tex = ctx.text.texture({ style: 'human', width: 256, height: 170, body: ctx.texts.FOREST?.doorSigns?.[i] || '', fontSize: 60, seed: 40 + i });
          c.drawImage(tex.image, (k % 2) * 256, Math.floor(k / 2) * 256, 256, 170);
          tex.dispose();
        }
      },
    });
    const t = new THREE.CanvasTexture(el);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });
  [0, 1].forEach((half) => {
    const parts = [];
    for (let k = 0; k < 4; k++) {
      const c = cabins[half * 4 + k];
      if (!c) continue;
      const g = new THREE.PlaneGeometry(0.36, 0.24);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, ((k % 2) + uv.getX(i)) / 2, 1 - (Math.floor(k / 2) * 256 + (1 - uv.getY(i)) * 170) / 512);
      g.rotateZ(c.sign.tilt);
      g.rotateY(c.yaw);
      g.translate(c.sign.pos.x, c.sign.pos.y, c.sign.pos.z);
      parts.push(g);
    }
    const m = new THREE.Mesh(mergeGeo(parts), mat.standard({ map: signTex[half], emissiveMap: signTex[half], emissive: new THREE.Color(0.22, 0.2, 0.17), roughness: 0.85 }));
    m.name = `forest:signs${half}`;
    m.receiveShadow = true;
    detail.add(m);
  });

  const ferns = new THREE.InstancedMesh(fernGeometry(3), mat.standard({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }, { onShader: windSway }), 420);
  const mushrooms = new THREE.InstancedMesh(mushroomGeometry(), mat.standard({ vertexColors: true, roughness: 0.6 }), 140);
  {
    const r = seeded('forest-ferns');
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const anchors = [
      ...trailPts.flatMap((pts) => pts.filter((_, i) => i % 3 === 0).map((v) => [v.x, v.z, 3.2])),
      ...streamPts.filter((_, i) => i % 3 === 0).map((v) => [v.x, v.z, 3.0]),
      ...cabins.map((c) => [c.cfg.x, c.cfg.z, 9]),
      [FIRE[0], FIRE[1], 12],
    ];
    let nf = 0;
    let nm = 0;
    for (let k = 0; k < 2400 && (nf < ferns.count || nm < mushrooms.count); k++) {
      const a = anchors[Math.floor(r() * anchors.length)];
      const ang = r() * PI * 2;
      const d = a[2] * (0.6 + r() * 0.9);
      const x = a[0] + Math.cos(ang) * d;
      const z = a[1] + Math.sin(ang) * d;
      if (cabins.some((c) => Math.hypot(c.cfg.x - x, c.cfg.z - z) < 5.2) || Math.hypot(x - FIRE[0], z - FIRE[1]) < 6) continue;
      const y = groundY(x, z);
      if (r() < 0.78 && nf < ferns.count) {
        const sc = 0.8 + r() * 0.9;
        m4.compose(p.set(x, y - 0.03, z), q.setFromEuler(e.set((r() - 0.5) * 0.15, r() * PI * 2, (r() - 0.5) * 0.15)), s.set(sc, sc * (0.8 + r() * 0.4), sc));
        ferns.setMatrixAt(nf++, m4);
      } else if (nm < mushrooms.count) {
        const sc = 0.55 + r() * 0.45;
        m4.compose(p.set(x, y - 0.01, z), q.setFromEuler(e.set(0, r() * PI * 2, 0)), s.set(sc, sc, sc));
        mushrooms.setMatrixAt(nm++, m4);
      }
    }
    ferns.count = nf;
    mushrooms.count = nm;
    ferns.receiveShadow = true;
    mushrooms.receiveShadow = true;
    ferns.name = 'forest:ferns';
    mushrooms.name = 'forest:mushrooms';
    detail.add(ferns, mushrooms);
  }

  const water = new THREE.Mesh(ribbon(world, streamPts, { width: (t, p, d) => 1.7 + 0.6 * Math.sin(d * 0.11) + 0.3 * Math.sin(d * 0.37), cols: 5, lift: 0.06 }), waterMaterial(mat));
  water.name = 'forest:stream';
  water.renderOrder = 1;
  const trailGeos = trailPts.map((pts) => ribbon(world, pts, {
    width: (t, p, d) => 1.5 + 0.35 * Math.sin(d * 0.21), cols: 5, lift: 0.04, edgeAttr: true,
    colorFn: (c, x, z) => c.setRGB(0.11, 0.095, 0.075).multiplyScalar(0.85 + 0.3 * Math.sin(x * 0.7 + z * 0.4)),
  }));
  const trails = new THREE.Mesh(mergeGeo(trailGeos), trailMaterial(mat));
  trails.name = 'forest:trails';
  trails.receiveShadow = true;
  detail.add(water, trails);

  const mistR = seeded('forest-mist');
  const mistSpots = [];
  for (let k = 0; k < 34; k++) {
    const a = mistR() * PI * 2;
    const d = Math.sqrt(mistR()) * 220;
    mistSpots.push([CENTER[0] + Math.cos(a) * d, CENTER[1] + Math.sin(a) * d]);
  }
  for (let i = 0; i < streamPts.length; i += 14) mistSpots.push([streamPts[i].x, streamPts[i].z]);
  const mistGeo = new THREE.PlaneGeometry(1, 1);
  const mistAttr = new THREE.InstancedBufferAttribute(new Float32Array(mistSpots.length * 4), 4);
  mistGeo.setAttribute('aMist', mistAttr);
  const mistMat = mistMaterial(mat);
  const mist = new THREE.InstancedMesh(mistGeo, mistMat, mistSpots.length);
  {
    const m4 = new THREE.Matrix4();
    mistSpots.forEach(([x, z], i) => {
      m4.makeTranslation(x, groundY(x, z) - 0.6, z);
      mist.setMatrixAt(i, m4);
      mistAttr.setXYZW(i, 12 + mistR() * 14, 3.5 + mistR() * 3, mistR() * 40, 0);
    });
  }
  mist.name = 'forest:mist';
  mist.frustumCulled = false;
  mist.renderOrder = 8;
  detail.add(mist);

  const flameGeo = (() => {
    const parts = [];
    for (let k = 0; k < 3; k++) {
      const g = new THREE.PlaneGeometry(1.15 - k * 0.14, 1.85 - k * 0.25, 1, 1);
      g.translate(0, (1.85 - k * 0.25) / 2, 0);
      g.rotateY((k / 3) * PI);
      g.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(4).fill(k * 0.31), 1));
      parts.push(g);
    }
    const disc = new THREE.CircleGeometry(0.75, 20);
    disc.rotateX(-PI / 2);
    disc.translate(0, 0.07, 0);
    disc.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(disc.attributes.position.count).fill(2), 1));
    return mergeGeo(parts.concat(disc));
  })();
  const fireMat = fireMaterial(mat);
  const flames = new THREE.Mesh(flameGeo, fireMat);
  flames.position.set(FIRE[0], fireY + 0.05, FIRE[1]);
  flames.name = 'forest:fire';
  flames.renderOrder = 7;
  detail.add(flames);

  const smokeSources = cabins.map((c) => c.smoke).concat([new THREE.Vector3(FIRE[0], fireY + 1.2, FIRE[1])]);
  const COLUMN = smokeSources.length - 1;
  const puffs = [];
  smokeSources.forEach((p, s) => {
    const n = s === COLUMN ? 60 : 12;
    for (let k = 0; k < n; k++) puffs.push([p.x, p.y, p.z, s, k / n, rand(), rand(), s === COLUMN ? 1 : 0]);
  });
  const smokeGeo = new THREE.PlaneGeometry(1, 1);
  const srcAttr = new THREE.InstancedBufferAttribute(new Float32Array(puffs.length * 4), 4);
  const seedAttr = new THREE.InstancedBufferAttribute(new Float32Array(puffs.length * 4), 4);
  puffs.forEach((p, i) => {
    srcAttr.setXYZW(i, p[0], p[1], p[2], p[3]);
    seedAttr.setXYZW(i, p[4], p[5], p[6], p[7]);
  });
  smokeGeo.setAttribute('aSrc', srcAttr);
  smokeGeo.setAttribute('aSeed', seedAttr);
  const smokeMat = smokeMaterial(mat, smokeSources.length);
  const smoke = new THREE.InstancedMesh(smokeGeo, smokeMat, puffs.length);
  smoke.name = 'forest:smoke';
  smoke.frustumCulled = false;
  smoke.renderOrder = 9;
  landmark.add(smoke);

  const crawlers = createCrawlers(ctx, { detail, landmark });

  const trailLantern = ctx.props.lantern([postX - 0.72, postY + 2.3, postZ - 0.42], { hanging: true, intensity: 1.6 });
  const trailSign = ctx.props.sign([-445, null, -242.5], 1.05, { text: ctx.texts.ZONES?.forest?.tagline || '', style: 'sign' });

  const note = (() => {
    const g = new THREE.BufferGeometry();
    const p = [
      -0.12, 0, -0.08, 0.12, 0, -0.08, -0.12, 0.016, 0, 0.12, 0.016, 0, -0.12, 0, 0.08, 0.12, 0, 0.08,
    ];
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5]);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat.standard({ color: '#efe3c8', roughness: 0.9, side: THREE.DoubleSide, emissive: new THREE.Color('#3a3226') }));
    m.name = 'forest:note';
    return m;
  })();
  const right = cabins[RIGHT];
  note.rotation.y = right.yaw + 0.25;
  note.visible = false;
  detail.add(note);

  const fogTint = '#4f6a63';
  const atmosphere = ctx.env.addAtmosphere({
    id: 'forest', center: CENTER, radius: 215, falloff: 70, fogColor: fogTint, fogDensity: 5.5,
    tint: [0.9, 1.0, 0.96], saturation: 0.82, exposure: 0.9, darkness: 0.6,
  });

  const lights = cabins.map((c) => ctx.env.lights.add({ position: c.windows[0].light.clone(), color: '#ff9a45', intensity: 0, distance: 13, decay: 1.6 }));
  const fireLight = ctx.env.lights.add({ position: new THREE.Vector3(FIRE[0], fireY + 1.1, FIRE[1]), color: '#ff8a3a', intensity: 0, distance: 18, flicker: 0.7, decay: 1.5 });

  const crtTex = ctx.text.texture({
    style: 'terminal', width: 512, height: 400, title: 'Forum des Veilleurs — tty1', footer: 'C:\\VEILLE>',
    body: ['CONNEXION ÉTABLIE.', `${ctx.texts.FOREST?.forumPost?.title || ''}`, ...(ctx.texts.FOREST?.forumPost?.body || []).slice(0, 1)],
  });
  const termA = -2.1;
  const termPos = [FIRE[0] + Math.cos(termA) * 8.2, null, FIRE[1] + Math.sin(termA) * 8.2];
  const termYaw = Math.atan2(FIRE[0] - termPos[0], FIRE[1] - termPos[2]);
  const terminal = ctx.props.terminal(termPos, termYaw, { style: 'crt', texture: crtTex });
  terminal.group.updateMatrixWorld(true);
  const termScreen = terminal.screen.getWorldPosition(new THREE.Vector3());
  
  const beaconA = 0.2;
  const beaconPos = [FIRE[0] + Math.cos(beaconA) * 8.5, 0, FIRE[1] + Math.sin(beaconA) * 8.5];
  beaconPos[1] = groundY(beaconPos[0], beaconPos[2]);
  const beaconYaw = Math.atan2(FIRE[0] - beaconPos[0], FIRE[1] - beaconPos[2]);
  const beacon = ctx.beacons.create('forest', { position: beaconPos, rotationY: beaconYaw });

  const lullabyCabin = cabins.find((c) => c.cfg.lullaby) || cabins[4];
  const sill = lullabyCabin.windows[0].sill;
  ctx.traces.add({ id: 'forest_lullaby', position: [sill.x, sill.y + 0.12 - 1.3, sill.z] });
  ctx.traces.add({ id: 'forest_apology', position: [STUMP[0], stumpTop, STUMP[1]] });

  ctx.scanner.register({ position: termScreen.clone(), kind: 'human', label: 'Forum des Veilleurs' });
  for (const c of cabins) ctx.scanner.register({ position: c.murmur, kind: 'human', label: 'Présence humaine' });
  for (const d of crawlers.drones) ctx.scanner.register({ position: d.pos, kind: 'synthetic', label: "Robot d'indexation" });
  ctx.scanner.addSignal({ position: right.door, active: () => !flag('door'), strength: 0.8 });

  const cab = cabins.map((c) => ({
    life: 1, target: 1, on: true, far: 0, knocks: 0, lastKnock: -99, murmur: null, smoke: 1, watch: 0, offAt: -99, line: 0,
  }));
  const seq = { stage: 'idle', t: 0, slide: 1 };
  function sync() {
    if (seq.stage === 'done' || !(flag('door') || flag('noteOut') || state.beacons.forest !== 'locked')) return;
    seq.stage = 'done';
    note.visible = true;
    note.position.copy(right.noteTo);
  }
  sync();

  const visit = new Set();
  const lastSaid = {};
  let inside = false;
  let gauge = 0;
  let gaugeZero = 0;
  let gaugeShown = false;
  let grace = 0;
  let syncTimer = 0;
  let indexing = false;
  let wrongLine = 0;
  let loopsOn = false;
  let wind = null;
  let fireLoop = null;
  const crawlerLoops = [];
  const tmp = new THREE.Vector3();

  function say(key, { once = true, gap = 0, priority = 1 } = {}) {
    const now = ctx.time.now;
    if (once && visit.has(key)) return;
    if (gap && now - (lastSaid[key] ?? -1e9) < gap) return;
    visit.add(key);
    lastSaid[key] = now;
    ctx.companion.say(key, { priority });
  }

  function reachCampfire() {
    if (flag('campfire')) return;
    setFlag('campfire');
  }

  async function readForum({ open = true } = {}) {
    setFlag('forum');
    reachCampfire();
    if (open && ctx.texts.FOREST?.forumPost) await ctx.ui.reader.open(ctx.texts.FOREST.forumPost);
  }

  function knock(i) {
    const c = cab[i];
    const now = ctx.time.now;
    ctx.audio.sfx('knock', { position: cabins[i].doorFace });
    if (now - c.lastKnock > 5) c.knocks = 0;
    c.lastKnock = now;
    c.knocks++;
    if (i === RIGHT) {
      if (seq.stage === 'idle' && c.knocks >= 3) {
        seq.stage = 'wait';
        seq.t = 0;
        c.knocks = 0;
      }
      return;
    }
    if (c.knocks >= 3) {
      c.knocks = 0;
      c.line = 1.3;
    }
  }

  function advanceSequence(dt) {
    if (seq.stage === 'wait') {
      seq.t += dt;
      if (seq.t >= 2.1) {
        seq.stage = 'reply';
        seq.t = 0;
        ctx.audio.sfx('knock.reply', { position: right.doorFace });
        say('zone.forest.knock', { priority: 2 });
      }
    } else if (seq.stage === 'reply') {
      seq.t += dt;
      if (seq.t >= 2.8) slideNote();
    } else if (seq.stage === 'slide') {
      seq.slide = Math.min(1, seq.slide + dt / 1.5);
      const k = 1 - (1 - seq.slide) ** 3;
      note.position.lerpVectors(right.noteFrom, right.noteTo, k);
      if (seq.slide >= 1) seq.stage = 'done';
    }
  }

  function slideNote() {
    seq.stage = 'slide';
    seq.slide = 0;
    note.visible = true;
    note.position.copy(right.noteFrom);
    setFlag('noteOut');
    ctx.audio.sfx('note.slide', { position: right.noteTo });
  }

  function finishSequence() {
    if (seq.stage === 'idle') {
      for (let k = 0; k < 3; k++) knock(RIGHT);
    }
    if (seq.stage === 'wait') advanceSequence(2.2);
    if (seq.stage === 'reply') advanceSequence(3);
    while (seq.stage === 'slide') advanceSequence(0.5);
  }

  async function readNote({ open = true } = {}) {
    const first = !flag('door');
    setFlag('door');
    ctx.beacons.setReady('forest');
    if (open && ctx.texts.FOREST?.note) await ctx.ui.reader.open(ctx.texts.FOREST.note);
    if (first) say('zone.forest.note', { priority: 2 });
  }

  cabins.forEach((c, i) => {
    ctx.interact.add({
      id: `forest:door${i}`, position: c.door, radius: 3.4, label: 'Frapper', priority: 1,
      enabled: () => !(i === RIGHT && seq.stage !== 'idle'),
      onInteract: () => knock(i),
    });
  });
  ctx.interact.add({
    id: 'forest:note', position: note.position, radius: 2.4, label: 'Lire le mot', priority: 3, needsLook: false,
    enabled: () => seq.stage === 'done',
    onInteract: () => readNote(),
  });
  ctx.interact.add({
    id: 'forest:forum', position: termScreen, radius: 2.6, label: 'Lire', priority: 2,
    onInteract: () => readForum(),
  });

  events.on('beacon:activated', ({ zone }) => {
    if (zone === 'forest') setFlag('beacon');
  });

  function indexed() {
    if (indexing) return;
    indexing = true;
    ctx.audio.sfx('alarm');
    ctx.postfx.flash('#ff4b3e', 0.7);
    events.emit('player:indexed', {});
    const y = groundY(EDGE.x, EDGE.z);
    ctx.player.setCheckpoint([EDGE.x, y, EDGE.z], EDGE.yaw);
    Promise.resolve(ctx.player.respawn('indexed')).then(() => {
      say('zone.forest.indexed', { once: false, gap: REPEAT_GAP, priority: 2 });
    }).finally(() => {
      indexing = false;
      zone.pauseDetection(2.5);
    });
    gauge = 0;
    crawlers.resetAlerts();
  }

  function startLoops() {
    if (loopsOn) return;
    loopsOn = true;
    wind = ctx.audio.loop('wind', { volume: 0.55 });
    fireLoop = ctx.audio.loop('fire', { position: flames.position, refDistance: 3, maxDistance: 60 });
    for (const d of crawlers.drones) crawlerLoops.push(ctx.audio.loop('crawler', { position: d.pos, refDistance: 6, maxDistance: 70, volume: 0.8 }));
  }

  function stopLoops() {
    if (!loopsOn) return;
    loopsOn = false;
    wind?.stop(2);
    fireLoop?.stop(2);
    for (const l of crawlerLoops.splice(0)) l.stop(1.5);
    for (const c of cab) {
      c.murmur?.stop(1);
      c.murmur = null;
    }
  }

  function updateCabins(dt, px, pz, active) {
    for (const c of cabins) {
      const s = cab[c.i];
      const d = Math.hypot(px - c.cfg.x, pz - c.cfg.z);
      if (c.i === RIGHT) {
        s.on = true;
        s.watch += ((d < OFF_NEAR ? 1 : 0) - s.watch) * Math.min(1, dt * 0.8);
      } else if (s.on && d < OFF_NEAR && active) {
        s.on = false;
        s.far = 0;
        s.offAt = ctx.time.now;
        ctx.audio.sfx('cabin.off', { position: c.murmur });
        s.murmur?.stop(0.8);
        s.murmur = null;
        say('zone.forest.cabin');
      } else if (!s.on) {
        s.far = d > ON_FAR ? s.far + dt : 0;
        if (s.far > ON_DELAY) s.on = true;
      }
      if (s.on) s.life = Math.min(1, s.life + dt / 6);
      else {
        const t = ctx.time.now - s.offAt;
        const fade = Math.max(0, 1 - t / 1.7);
        const stutter = t < 0.9 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 23)) : 1;
        s.life = Math.min(s.life, fade * stutter);
      }
      s.smoke += ((s.on ? 1 : 0) - s.smoke) * Math.min(1, dt * (s.on ? 0.15 : 0.6));
      const wantMurmur = active && s.on && s.life > 0.6 && d < 70;
      if (wantMurmur && !s.murmur) s.murmur = ctx.audio.loop('cabin.murmur', { position: c.murmur, refDistance: 3, maxDistance: 45, volume: 0.6 });
      else if (!wantMurmur && s.murmur) {
        s.murmur.stop(1.2);
        s.murmur = null;
      }
      if (s.murmur && c.i === RIGHT) s.murmur.setVolume(0.6 - 0.45 * s.watch, 0.5);
      if (s.line > 0) {
        s.line -= dt;
        if (s.line <= 0) {
          const lines = ctx.texts.FOREST?.wrongDoor || [];
          if (lines.length) ctx.ui.subtitle({ text: lines[wrongLine++ % lines.length] });
        }
      }
    }
  }

  function updateGauge(dt, seen, nearest, active) {
    if (!active) {
      if (gaugeShown) ctx.ui.setIndexation(null);
      gaugeShown = false;
      gauge = 0;
      ctx.audio.setParam('danger', 0);
      return;
    }
    if (seen) gauge = Math.min(1, gauge + dt / FILL_TIME);
    else gauge = Math.max(0, gauge - dt / DRAIN_TIME);
    gaugeZero = gauge > 0 ? 0 : gaugeZero + dt;
    const show = gauge > 0 || gaugeZero < 2.5;
    if (show && (gauge > 0 || gaugeShown)) {
      ctx.ui.setIndexation(gauge);
      gaugeShown = true;
    } else if (gaugeShown) {
      ctx.ui.setIndexation(null);
      gaugeShown = false;
    }
    const prox = 1 - THREE.MathUtils.smoothstep(nearest, 5, 16);
    ctx.audio.setParam('danger', Math.max(gauge, prox * 0.3));
    if (gauge >= 1) indexed();
  }

  const camFwd = new THREE.Vector3();
  function noticeCrawlers(px, pz) {
    if (visit.has('zone.forest.crawler')) return;
    ctx.camera.getWorldDirection(camFwd);
    for (const d of crawlers.drones) {
      tmp.subVectors(d.pos, ctx.camera.position);
      const dist = tmp.length();
      if (dist < 42 && tmp.dot(camFwd) / dist > 0.75 && Math.hypot(d.pos.x - px, d.pos.z - pz) < 40) {
        say('zone.forest.crawler', { priority: 1 });
        return;
      }
    }
  }

  function solved() {
    return state.beacons.forest !== 'locked';
  }

  const zone = {
    id: 'forest',
    spawn: [ax - 2, groundY(ax - 2, az - 1), az - 1, EDGE.yaw],
    cabins,
    crawlers,
    beacon,
    beaconYaw,
    terminalScreen: termScreen,
    fire: FIRE,
    right: RIGHT,
    edge: EDGE,
    pauseDetection(seconds) {
      grace = seconds;
    },
    get gauge() {
      return gauge;
    },
    get sequence() {
      return seq.stage;
    },
    life: (i) => cab[i].life,
    knock,

    debugSolve() {
      reachCampfire();
      readForum({ open: false });
      finishSequence();
      readNote({ open: false });
      return state.beacons.forest;
    },

    start() {
      sync();
      let best = null;
      let bd = Infinity;
      for (const t of ctx.vegetation.treesNear(FIRE[0], FIRE[1], FIRE_R + 9)) {
        const d = Math.hypot(t.x - FIRE[0], t.z - FIRE[1]);
        const score = Math.abs(d - (FIRE_R + 1.5)) + Math.abs(Math.atan2(t.z - FIRE[1], t.x - FIRE[0]) - 2.6) * 2;
        if (d > FIRE_R - 1 && score < bd) {
          bd = score;
          best = t;
        }
      }
      const tx = best ? best.x : FIRE[0] + Math.cos(2.6) * (FIRE_R + 1.5);
      const tz = best ? best.z : FIRE[1] + Math.sin(2.6) * (FIRE_R + 1.5);
      const dir = new THREE.Vector2(FIRE[0] - tx, FIRE[1] - tz).normalize();
      const rad = best ? best.radius : 0.3;
      const px = tx + dir.x * (rad + 0.03);
      const pz = tz + dir.y * (rad + 0.03);
      const py = groundY(px, pz);
      const inv = ctx.text.panel({
        style: 'human', size: [0.32, 0.42], emissive: 0, title: ctx.texts.TRACES?.forest_invite?.title || '',
        body: (ctx.texts.TRACES?.forest_invite?.body || []).slice(0, 1), seed: 77, width: 256,
      });
      inv.position.set(px, py + 1.55, pz);
      inv.rotation.set(0, Math.atan2(dir.x, dir.y), (rand() - 0.5) * 0.15);
      inv.material.emissiveMap = inv.material.map;
      inv.material.emissive = new THREE.Color(0.18, 0.16, 0.13);
      inv.name = 'forest:invite';
      detail.add(inv);
      ctx.traces.add({ id: 'forest_invite', position: [px + dir.x * 0.5, py, pz + dir.y * 0.5] });
    },

    update(dt) {
      const p = ctx.player.position;
      const dist = Math.hypot(p.x - CENTER[0], p.z - CENTER[1]);
      const active = dist < ACTIVE_FAR && ctx.has('player');
      const playing = state.mode === 'playing' && !ctx.player.respawning && !indexing;
      const nowInside = dist < INSIDE_R;
      if (nowInside !== inside) {
        inside = nowInside;
        ctx.companion.setDim(inside ? 0.7 : 0);
        if (!inside && dist > INSIDE_R + 30) visit.clear();
      }
      if (!inside && dist > INSIDE_R + 30 && visit.size) visit.clear();
      if (active) startLoops();
      else stopLoops();
      if (grace > 0) grace -= dt;
      syncTimer -= dt;
      if (syncTimer <= 0) {
        syncTimer = 1;
        sync();
      }
      const { anySeen, nearest } = crawlers.patrol(dt, ctx.player, active && playing && grace <= 0);
      if (playing || !active) updateGauge(dt, anySeen, nearest, active);
      if (!active) return;
      if (playing) noticeCrawlers(p.x, p.z);
      updateCabins(dt, p.x, p.z, active);
      advanceSequence(dt);
      if (Math.hypot(p.x - FIRE[0], p.z - FIRE[1]) < FIRE_R + 1) reachCampfire();
      if (solved() && state.beacons.forest === 'ready' && Math.hypot(p.x - beaconPos[0], p.z - beaconPos[2]) < 20) say('zone.forest.solved', { priority: 1 });
    },

    frame(dt) {
      const cam = ctx.camera.position;
      const cd = Math.hypot(cam.x - CENTER[0], cam.z - CENTER[1]);
      const night = ctx.env.night ?? 0;
      atmosphere.darkness = 0.6 - 0.32 * night;
      atmosphere.exposure = 0.9 + 0.15 * night;
      const showDetail = cd < DETAIL_FAR;
      detail.visible = showDetail;
      terminal.group.visible = showDetail;
      trailLantern.group.visible = showDetail;
      trailSign.visible = showDetail;
      if (trailLantern.light) trailLantern.light.enabled = showDetail;
      const lifeArr = windowMat.uniforms.uLife.value;
      const smokeArr = smokeMat.uniforms.uSmoke.value;
      const t = ctx.time.now;
      cabins.forEach((c, i) => {
        const s = cab[i];
        lifeArr[i] = s.life;
        smokeArr[i] = s.smoke;
        lights[i].intensity = s.life * (7 + 9 * night) * (i === RIGHT ? 1.7 : 1) * (0.9 + 0.1 * Math.sin(t * 7.3 + i));
        lights[i].enabled = showDetail && s.life > 0.01;
      });
      smokeArr[COLUMN] = 1;
      smokeMat.uniforms.uGlow.value = 0.2 + 0.9 * night;
      smokeMat.uniforms.uFar.value = THREE.MathUtils.smoothstep(cd, 300, 600);
      fireLight.intensity = 26 + 34 * night;
      fireLight.enabled = showDetail;
      fireMat.uniforms.uFire.value = 1;
      mistMat.uniforms.uMist.value = 0.75 + 0.35 * night;
      for (const f of zone.flies) f.rate = 0.4 + 2.2 * night;
      crawlers.frame(dt, { camera: ctx.camera, night, showPools: showDetail, far: cd > ACTIVE_FAR - 40 });
    },
  };

  crawlers.isSafe = (pos) => Math.hypot(pos.x - right.door.x, pos.z - right.door.z) < 4;
  embers(ctx, fireY);
  const flies = fireflies(ctx, cabins, streamPts, trailPts);
  zone.flies = flies;
  return zone;
}

function mergeGeo(list) {
  const g = mergeGeometries(list);
  for (const p of list) p.dispose();
  return g;
}

function embers(ctx, fireY) {
  ctx.particles.emitter({
    position: [FIRE[0], fireY + 0.5, FIRE[1]], rate: 9, shape: 'ember', color: '#ffb454', color2: '#ff4a1a', speed: [0.6, 1.8],
    direction: [0, 1, 0], spread: 0.35, life: [1.2, 2.6], size: [0.025, 0.06], gravity: 0.6, drag: 0.4, intensity: 3, radius: 0.35, cullDistance: 110,
  });
}

function fireflies(ctx, cabins, streamPts, trailPts) {
  const spots = [
    [FIRE[0], FIRE[1], 10],
    ...cabins.map((c) => [c.cfg.x, c.cfg.z, 10]),
    ...streamPts.filter((_, i) => i % 28 === 6).map((p) => [p.x, p.z, 6]),
    ...trailPts.map((pts) => pts[Math.floor(pts.length / 2)]).map((p) => [p.x, p.z, 7]),
  ];
  return spots.map(([x, z, r]) => ctx.particles.emitter({
      position: [x, ctx.world.heightAt(x, z) + 1.4, z], rate: 1.6, shape: 'dot', color: '#d6ff7a', color2: '#ffcf5a', speed: [0.05, 0.25],
      life: [3, 6], size: [0.05, 0.09], gravity: 0.02, drag: 0.2, intensity: 4, radius: r, turbulence: 0.6, wind: 0.1, cullDistance: 80,
  }));
}
