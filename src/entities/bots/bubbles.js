import * as THREE from 'three';

const COLS = 5;
const ROWS = 16;
const CELL_W = 352;
const CELL_H = 176;
const POOL = 8;
const FADE_IN = 0.28;
const FADE_OUT = 0.55;
const WIDTH = 1.4;
const HEIGHT = WIDTH * (CELL_H / CELL_W);

function bubbleShader(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aRect;\nattribute float aFade;\nvarying float vFade;')
    .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vMapUv * aRect.zw + aRect.xy;\nvFade = aFade;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vFade;')
    .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor *= vFade;');
}

export function createBubbles(ctx) {
  const atlasCanvas = ctx.text.canvas({ width: COLS * CELL_W, height: ROWS * CELL_H });
  const atlas = new THREE.CanvasTexture(atlasCanvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.premultiplyAlpha = true;
  atlas.anisotropy = 4;
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  const c2d = atlasCanvas.getContext('2d');
  const scratch = ctx.text.texture({ style: 'bubble', body: ' ', width: CELL_W, height: CELL_H });
  const cells = new Map();
  let next = 0;

  function lineId(text) {
    if (cells.has(text)) return cells.get(text);
    if (next >= COLS * ROWS) return -1;
    const id = next++;
    ctx.text.update(scratch, { style: 'bubble', body: text, width: CELL_W, height: CELL_H });
    c2d.clearRect((id % COLS) * CELL_W, Math.floor(id / COLS) * CELL_H, CELL_W, CELL_H);
    c2d.drawImage(scratch.image, (id % COLS) * CELL_W, Math.floor(id / COLS) * CELL_H);
    atlas.needsUpdate = true;
    cells.set(text, id);
    return id;
  }

  const geometry = new THREE.PlaneGeometry(1, 1);
  const rect = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 4), 4);
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(POOL), 1);
  rect.setUsage(THREE.DynamicDrawUsage);
  fade.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aRect', rect);
  geometry.setAttribute('aFade', fade);
  const material = ctx.mat.basic({
    map: atlas, color: new THREE.Color(1.25, 1.25, 1.25), transparent: true, premultipliedAlpha: true, depthWrite: false,
  }, { onShader: bubbleShader });
  const mesh = new THREE.InstancedMesh(geometry, material, POOL);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.count = 0;
  mesh.name = 'bots:bubbles';

  const bot = new Int16Array(POOL).fill(-1);
  const cell = new Int16Array(POOL);
  const age = new Float32Array(POOL);
  const life = new Float32Array(POOL);
  const m = mesh.instanceMatrix.array;

  function show(botIndex, id, duration) {
    if (id < 0) return false;
    let slot = -1;
    for (let i = 0; i < POOL; i++) {
      if (bot[i] === botIndex) return false;
      if (bot[i] < 0 && slot < 0) slot = i;
    }
    if (slot < 0) return false;
    bot[slot] = botIndex;
    cell[slot] = id;
    age[slot] = 0;
    life[slot] = duration;
    return true;
  }

  function evictFor(botIndex, id, duration) {
    if (show(botIndex, id, duration)) return true;
    let oldest = 0;
    for (let i = 1; i < POOL; i++) if (age[i] > age[oldest]) oldest = i;
    bot[oldest] = -1;
    return show(botIndex, id, duration);
  }

  function has(botIndex) {
    for (let i = 0; i < POOL; i++) if (bot[i] === botIndex) return true;
    return false;
  }

  function free() {
    let n = 0;
    for (let i = 0; i < POOL; i++) if (bot[i] < 0) n++;
    return n;
  }

  function release(botIndex) {
    for (let i = 0; i < POOL; i++) if (bot[i] === botIndex) bot[i] = -1;
  }

  function update(dt, camera, headAt) {
    const e = camera.matrixWorld.elements;
    let n = 0;
    for (let i = 0; i < POOL; i++) {
      if (bot[i] < 0) continue;
      age[i] += dt;
      if (age[i] >= life[i] || !headAt(bot[i], i)) {
        bot[i] = -1;
        continue;
      }
      const t = age[i];
      const f = Math.min(1, t / FADE_IN) * Math.min(1, (life[i] - t) / FADE_OUT);
      const dx = headAt.x - camera.position.x;
      const dy = headAt.y - camera.position.y;
      const dz = headAt.z - camera.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const s = Math.min(2.4, 0.95 + dist * 0.075) * (0.9 + 0.1 * Math.min(1, t / FADE_IN));
      const w = WIDTH * s;
      const h = HEIGHT * s;
      const ox = w * 0.35;
      const oy = h * 0.47 + 0.05;
      const o = n * 16;
      m[o] = e[0] * w; m[o + 1] = e[1] * w; m[o + 2] = e[2] * w; m[o + 3] = 0;
      m[o + 4] = e[4] * h; m[o + 5] = e[5] * h; m[o + 6] = e[6] * h; m[o + 7] = 0;
      m[o + 8] = e[8]; m[o + 9] = e[9]; m[o + 10] = e[10]; m[o + 11] = 0;
      m[o + 12] = headAt.x + e[0] * ox + e[4] * oy;
      m[o + 13] = headAt.y + e[1] * ox + e[5] * oy;
      m[o + 14] = headAt.z + e[2] * ox + e[6] * oy;
      m[o + 15] = 1;
      const c = cell[i];
      rect.array[n * 4] = (c % COLS) / COLS;
      rect.array[n * 4 + 1] = 1 - (Math.floor(c / COLS) + 1) / ROWS;
      rect.array[n * 4 + 2] = 1 / COLS;
      rect.array[n * 4 + 3] = 1 / ROWS;
      fade.array[n] = f * f * (3 - 2 * f);
      n++;
    }
    mesh.count = n;
    if (n) {
      mesh.instanceMatrix.needsUpdate = true;
      rect.needsUpdate = true;
      fade.needsUpdate = true;
    }
  }

  return { mesh, bots: bot, lineId, show, evictFor, has, free, release, update, POOL };
}
