import * as THREE from 'three';
import { sharedUniforms, GLSL } from './glsl.js';
import { makeNoise2 } from './rng.js';

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const SKY_FRAGMENT = /* glsl */ `
${GLSL.envPars}
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, -1.0, 1.0);
  vec3 zenith = uSkyColor * vec3(0.55, 0.75, 1.25);
  vec3 col = mix(uFogColor, zenith, pow(smoothstep(0.0, 0.85, up), 0.6));
  col = mix(col, uFogColor * 0.82, smoothstep(0.0, -0.25, up));
  float s = max(dot(d, uSunDir), 0.0);
  col += uFogSunColor * (pow(s, 12.0) * 0.45 + pow(s, 160.0) * 0.9) * (1.0 - uNight);
  col += uSunColor * smoothstep(0.9994, 0.9998, s) * 4.0;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createFallbackEnv(ctx) {
  const { scene, quality } = ctx;
  scene.background = sharedUniforms.uFogColor.value.clone();
  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.7);
  hemi.color.copy(sharedUniforms.uSkyColor.value);
  hemi.groundColor.copy(sharedUniforms.uGroundColor.value);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.color.copy(sharedUniforms.uSunColor.value);
  sun.castShadow = quality.shadows;
  sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  const sc = sun.shadow.camera;
  sc.left = -140;
  sc.right = 140;
  sc.top = 140;
  sc.bottom = -140;
  sc.near = 1;
  sc.far = 1400;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(5000, 48, 24),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, uniforms: sharedUniforms,
      side: THREE.BackSide, depthWrite: false, toneMapped: true,
    }),
  );
  sky.name = 'fallback:sky';
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  const focus = new THREE.Vector3();
  return {
    sun, hemi, sky,
    frame() {
      ctx.camera.getWorldPosition(focus);
      sky.position.copy(focus);
      const texel = (sc.right - sc.left) / sun.shadow.mapSize.x;
      focus.x = Math.round(focus.x / texel) * texel;
      focus.z = Math.round(focus.z / texel) * texel;
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(sharedUniforms.uSunDir.value, 600);
      sun.castShadow = quality.shadows;
    },
  };
}

const BIOME_COLORS = {
  feed: '#d6d9e1', farm: '#c9a648', hallu: '#8e80ad', oldweb: '#c4865a',
  forest: '#24402d', sand: '#dcc89c', rock: '#7c756d', path: '#94704b',
};

export function createFallbackTerrain(ctx) {
  const { world, mat, quality } = ctx;
  const geo = world.terrainGeometry({ step: quality.terrainStep });
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const C = Object.fromEntries(Object.entries(BIOME_COLORS).map(([k, v]) => [k, new THREE.Color(v)]));
  const meadowA = new THREE.Color('#5d9634');
  const meadowB = new THREE.Color('#93bb4c');
  const deep = new THREE.Color('#1d4a52');
  const noise = makeNoise2(77);
  const c = new THREE.Color();
  const m = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const b = world.biomeAt(x, z);
    const n = noise(x / 60, z / 60) * 0.5 + 0.5;
    m.copy(meadowA).lerp(meadowB, n * 0.8 + 0.1 * noise(x / 9, z / 9));
    c.setRGB(0, 0, 0);
    c.r += m.r * b.meadow;
    c.g += m.g * b.meadow;
    c.b += m.b * b.meadow;
    for (const k of ['feed', 'farm', 'hallu', 'oldweb', 'forest', 'sand', 'rock']) {
      c.r += C[k].r * b[k];
      c.g += C[k].g * b[k];
      c.b += C[k].b * b[k];
    }
    c.lerp(C.path, b.path * 0.9);
    const v = 0.88 + 0.24 * noise(x / 23 + 7, z / 23);
    c.multiplyScalar(v);
    if (y < 0) c.lerp(deep, Math.min(1, -y / 18));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, mat.standard({ vertexColors: true, roughness: 0.94, metalness: 0 }));
  mesh.name = 'fallback:terrain';
  mesh.receiveShadow = true;
  ctx.scene.add(mesh);
  return { mesh };
}

export function createFallbackSea(ctx) {
  const geo = new THREE.PlaneGeometry(14000, 14000, 1, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, ctx.mat.standard({
    color: '#1b6c78', roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.86, depthWrite: false,
  }));
  mesh.name = 'fallback:sea';
  mesh.renderOrder = 2;
  ctx.scene.add(mesh);
  ctx.physics.setFluidSurface(() => 0);
  return {
    mesh,
    frame() {
      mesh.position.x = Math.round(ctx.camera.position.x / 100) * 100;
      mesh.position.z = Math.round(ctx.camera.position.z / 100) * 100;
    },
  };
}

export function createFlyCam(ctx) {
  const { camera, canvas, input, world } = ctx;
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const move = new THREE.Vector3();
  let dragging = false;
  let dragMoved = 0;
  let lastX = 0;
  let lastY = 0;

  const fly = {
    enabled: false,
    yaw: 0,
    pitch: 0,
    speed: 28,
    setPose(x, y, z, yaw = fly.yaw, pitch = fly.pitch) {
      camera.position.set(x, y, z);
      fly.yaw = yaw;
      fly.pitch = pitch;
      fly.apply();
    },
    lookAt(x, y, z) {
      const dx = x - camera.position.x;
      const dy = y - camera.position.y;
      const dz = z - camera.position.z;
      fly.yaw = Math.atan2(-dx, -dz);
      fly.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      fly.apply();
    },
    apply() {
      fly.pitch = Math.max(-1.55, Math.min(1.55, fly.pitch));
      euler.set(fly.pitch, fly.yaw, 0);
      camera.quaternion.setFromEuler(euler);
    },
    frame(dt) {
      if (!fly.enabled) return;
      const sens = 0.0022 * (ctx.state.settings.sensitivity || 1);
      fly.yaw -= input.look.dx * sens;
      fly.pitch -= input.look.dy * sens;
      if (input.wheel) fly.speed = Math.max(4, Math.min(400, fly.speed * (input.wheel > 0 ? 0.85 : 1.18)));
      fly.apply();
      const boost = input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? 5 : 1;
      const up = (input.isDown('Space') || input.isDown('KeyR') ? 1 : 0) - (input.isDown('KeyC') || input.isDown('ControlLeft') ? 1 : 0);
      move.set(input.move.x, up, input.move.z);
      if (move.lengthSq() > 0) {
        move.applyQuaternion(camera.quaternion);
        if (up) move.y += up * 0.6;
        camera.position.addScaledVector(move, fly.speed * boost * Math.min(dt, 0.1));
      }
      const ground = world.heightAt(camera.position.x, camera.position.z);
      camera.position.y = Math.max(camera.position.y, Math.max(ground, world.SEA_LEVEL) + 0.6);
    },
  };

  canvas.addEventListener('mousedown', (e) => {
    if (!fly.enabled || e.button !== 0 || input.locked) return;
    dragging = true;
    dragMoved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging || input.locked) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    input.simulateLook(dx, dy);
  });
  window.addEventListener('mouseup', () => {
    if (dragging && dragMoved < 3 && fly.enabled && !ctx.has('ui')) input.requestLock();
    dragging = false;
  });
  return fly;
}
