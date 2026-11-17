import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BODY_HEIGHT = 1.7;

function tint(geo, value) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3).fill(value);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export function bodyGeometry() {
  const profile = [
    [0.0, 0.03], [0.05, 0.035], [0.12, 0.08], [0.2, 0.2], [0.3, 0.38], [0.4, 0.6], [0.47, 0.8], [0.51, 0.95], [0.5, 1.05],
    [0.43, 1.13], [0.31, 1.18], [0.17, 1.205], [0.0, 1.215],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = new THREE.LatheGeometry(profile, 20);
  torso.scale(1.1, 1, 0.6);
  const head = new THREE.SphereGeometry(0.255, 22, 14);
  head.scale(1, 1.04, 0.96);
  head.translate(0, 1.455, 0.02);
  const geo = mergeGeometries([tint(torso.toNonIndexed(), 0.9), tint(head.toNonIndexed(), 1)], false);
  geo.computeBoundingSphere();
  return geo;
}

export function tickGeometry() {
  const badge = new THREE.Shape();
  const lobes = 8;
  const steps = 96;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = 0.5 + 0.045 * Math.cos(a * lobes);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) badge.moveTo(x, y);
    else badge.lineTo(x, y);
  }
  const check = new THREE.Path();
  [[-0.29, -0.01], [-0.21, 0.07], [-0.07, -0.06], [0.2, 0.23], [0.28, 0.15], [-0.07, -0.23]].forEach(([x, y], i) => (i ? check.lineTo(x, y) : check.moveTo(x, y)));
  check.closePath();
  badge.holes.push(check);
  const geo = new THREE.ExtrudeGeometry(badge, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, curveSegments: 4 });
  geo.translate(0, 0, -0.03);
  geo.computeBoundingSphere();
  return geo;
}
