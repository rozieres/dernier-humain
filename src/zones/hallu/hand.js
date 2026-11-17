import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sweep, prepare } from './geo.js';

const SKIN = new THREE.Color('#f6e9e4');
const DEEP = new THREE.Color('#f0e0e2');

function colorize(geo, color) {
  const g = prepare(geo);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(arr, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function loft(sections, segs = 36) {
  const ring = segs + 1;
  const pos = [];
  const idx = [];
  for (const s of sections) {
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const p = s.p ?? 3;
      const k = (Math.abs(c) ** p + Math.abs(sn) ** p) ** (-1 / p);
      const cup = sn > 0 ? -s.cup * Math.max(0, 1 - Math.abs(c) * 1.4) : 0;
      pos.push((s.x ?? 0) + c * k * s.w, s.y, (s.z ?? 0) + sn * k * s.t + cup);
    }
  }
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * ring + j;
      const b = a + ring;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function digit({ base, dir, lengths, r0, r1, bends, splayAxis = new THREE.Vector3(0, 0, 1), bendAxis = new THREE.Vector3(1, 0, 0), embed = 1.6, flatten = 0.88 }) {
  const joints = [base.clone().addScaledVector(dir, -embed)];
  let d = dir.clone().normalize();
  joints.push(base.clone());
  let p = base.clone();
  for (let i = 0; i < lengths.length; i++) {
    d = d.clone().applyAxisAngle(bendAxis, bends[i]).normalize();
    p = p.clone().addScaledVector(d, lengths[i]);
    joints.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(joints, false, 'centripetal');
  const total = curve.getLength();
  const knuckles = [];
  let acc = embed;
  knuckles.push(acc);
  for (let i = 0; i < lengths.length - 1; i++) {
    acc += lengths[i];
    knuckles.push(acc);
  }
  const N = 46;
  const pts = [];
  const radii = [];
  const tipR = r1;
  for (let i = 0; i <= N; i++) {
    const s = (i / N) * total;
    const u = curve.getPointAt(Math.min(1, s / total));
    let r = THREE.MathUtils.lerp(r0, r1, Math.max(0, (s - embed) / (total - embed)));
    for (const kpos of knuckles) r *= 1 + 0.085 * Math.exp(-(((s - kpos) / (r0 * 0.55)) ** 2));
    for (let k = 1; k < knuckles.length; k++) {
      const mid = (knuckles[k - 1] + knuckles[k]) / 2;
      r *= 1 - 0.035 * Math.exp(-(((s - mid) / (r0 * 0.9)) ** 2));
    }
    const fromTip = total - s;
    if (fromTip < tipR) r *= Math.sqrt(Math.max(0.02, 1 - ((tipR - fromTip) / tipR) ** 2));
    pts.push(u);
    radii.push(r);
  }
  const geo = sweep(pts, radii, { radial: 18, capEnd: true, flatten, up: splayAxis });
  return { geo };
}

export function buildHand() {
  const parts = [];
  parts.push(colorize(loft([
    { y: -16, w: 3.6, t: 2.9, p: 2.2, cup: 0 },
    { y: -4, w: 3.3, t: 2.6, p: 2.2, cup: 0 },
    { y: 3, w: 3.0, t: 2.2, p: 2.3, cup: 0 },
    { y: 6.5, w: 2.9, t: 2.0, p: 2.4, cup: 0 },
    { y: 8.2, w: 3.3, t: 2.05, p: 2.5, cup: 0 },
    { y: 10, w: 4.6, t: 2.0, p: 2.7, cup: 0.15 },
    { y: 12, w: 5.6, t: 1.85, p: 3.0, cup: 0.32 },
    { y: 14.5, w: 6.15, t: 1.7, p: 3.3, cup: 0.38 },
    { y: 16.8, w: 6.4, t: 1.6, p: 3.4, cup: 0.32 },
    { y: 18.3, w: 6.3, t: 1.5, p: 3.2, cup: 0.18 },
    { y: 19.2, w: 5.9, t: 1.32, p: 2.8, cup: 0.05 },
    { y: 19.8, w: 5.0, t: 1.0, p: 2.4, cup: 0 },
    { y: 20.1, w: 3.2, t: 0.6, p: 2.2, cup: 0 },
    { y: 20.2, w: 0.5, t: 0.1, p: 2, cup: 0 },
  ]), SKIN));

  const fingers = [
    { x: -4.8, splay: 0.3, len: 11.2, r0: 1.36 },
    { x: -2.4, splay: 0.13, len: 12.6, r0: 1.42 },
    { x: 0, splay: -0.01, len: 12.1, r0: 1.4 },
    { x: 2.4, splay: -0.15, len: 11.1, r0: 1.33 },
    { x: 4.8, splay: -0.32, len: 9.2, r0: 1.22 },
  ];
  for (const [i, f] of fingers.entries()) {
    const dir = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), f.splay);
    const bendAxis = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), f.splay);
    const base = new THREE.Vector3(f.x, 18.9 - Math.abs(f.x) * 0.16, 0.05);
    const L = f.len;
    const wobble = (i % 2 ? 1 : -1) * 0.025;
    const d = digit({
      base, dir, lengths: [L * 0.45, L * 0.31, L * 0.24], r0: f.r0, r1: f.r0 * 0.76,
      bends: [0.1 + wobble, 0.16, 0.12], bendAxis, flatten: 0.86,
    });
    parts.push(colorize(d.geo, SKIN));
  }
  const thumbDir = new THREE.Vector3(-0.78, 0.6, 0.28).normalize();
  const thumbBend = new THREE.Vector3().crossVectors(thumbDir, new THREE.Vector3(0, 0, -1)).normalize();
  const thumb = digit({
    base: new THREE.Vector3(-4.6, 11.0, 0.7), dir: thumbDir, lengths: [4.6, 3.5, 3.0], r0: 1.85, r1: 1.3,
    bends: [0.12, 0.22, 0.14], bendAxis: thumbBend, embed: 3.4, flatten: 0.9, splayAxis: new THREE.Vector3(0, 0, 1),
  });
  parts.push(colorize(thumb.geo, SKIN));
  parts.push(colorize(new THREE.SphereGeometry(1, 24, 16).scale(2.4, 3.2, 1.25).translate(-3.4, 11.3, 0.1), DEEP));

  const body = mergeGeometries(parts);
  body.computeBoundingSphere();

  const ring = new THREE.TorusGeometry(1, 0.11, 8, 64);
  ring.rotateX(Math.PI / 2);
  const glow = mergeGeometries([
    prepare(ring.clone().scale(3.15, 1, 2.25).translate(0, 5.2, 0)),
    prepare(ring.clone().scale(3.25, 1, 2.35).translate(0, 4.4, 0)),
  ]);
  return { body, glow };
}
