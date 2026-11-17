import * as THREE from 'three';
import { bodyGeometry, tickGeometry } from './bots/geometry.js';
import { createBubbles } from './bots/bubbles.js';

const MAX = 480;
const STRIDE = 16;
const X = 0;
const Z = 1;
const YAW = 2;
const SPD = 3;
const TX = 4;
const TZ = 5;
const MODE = 6;
const TIMER = 7;
const PHASE = 8;
const Y = 9;
const LEAN = 10;
const PARTNER = 11;
const GROUP = 12;
const VX = 13;
const VZ = 14;
const WATCH = 15;

const WALK = 0;
const PAUSE = 1;
const TALK = 2;
const STAND = 3;
const RET_A = 4;
const RET_B = 5;
const RET_C = 6;

const TAU = Math.PI * 2;
const PERSONAL = 2.5;
const AVOID = 3.1;
const DRIFT = 1.3;
const BUMP = 0.78;
const STARE_RANGE = 25;
const BUBBLE_RANGE = 18;
const SCAN_SPEED = 60;
const PALETTE = ['#e8ecf1', '#e8ecf1', '#d3e4f6', '#d3e4f6', '#f6d8e5', '#e0f0e8', '#efe8d5'];
const TICK_COLORS = ['#5ce1e6', '#5ce1e6', '#5ce1e6', '#2e7dff', '#ff5fa2'];

const FALLBACK = {
  idle: ['Bonjour. Bonjour. Bonjour.', 'Tout va bien. Tout va très bien.', 'Restons connectés !', 'Excellente question !'],
  bumped: ['Pardon ! Merci pour ce retour.', "Oh ! Désolé d'avoir été là.", 'Collision détectée. Gratitude envoyée.'],
  greet: ['Bienvenue ! Bienvenue ! Bienvenue !', 'Bonjour, humain probable !'],
  scanned: ['Cyan, je sais. Ça me va bien, non ?', '0,00 % humain. Mais 100 % motivé !'],
};

const SCAN_FLASH = /* glsl */ `
{
  float sd = distance(vDhWorldPos, uScan.xyz);
  float behind = uScan.w - sd;
  float flash = uScan.w > 0.0 ? smoothstep(-1.5, 0.6, behind) * exp(-max(behind, 0.0) / 24.0) : 0.0;
  totalEmissiveRadiance += vec3(0.2, 0.95, 1.0) * flash * 2.4;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.45, 0.95, 1.0), flash * 0.45);
}
`;

function scanFlash(shader) {
  shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${SCAN_FLASH}`);
}

const wrap = (a) => a - TAU * Math.round(a / TAU);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export default async function create(ctx) {
  const { scene, world, camera } = ctx;
  const rand = ctx.rng.seeded('bots-runtime');

  const bodyMat = ctx.mat.physical(
    { vertexColors: true, roughness: 0.34, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.18 },
    { onShader: scanFlash },
  );
  const body = new THREE.InstancedMesh(bodyGeometry(), bodyMat, MAX);
  const ticks = new THREE.InstancedMesh(tickGeometry(), ctx.mat.basic({ color: new THREE.Color(1.6, 1.6, 1.6) }), MAX);
  for (const mesh of [body, ticks]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
  }
  body.castShadow = true;
  body.receiveShadow = true;
  body.name = 'bots:bodies';
  ticks.name = 'bots:ticks';
  scene.add(body, ticks);

  const bubbles = createBubbles(ctx);
  scene.add(bubbles.mesh);

  const poolOf = (key) => (ctx.has('texts') && Array.isArray(ctx.texts.BOT_LINES?.[key]) ? ctx.texts.BOT_LINES[key] : FALLBACK[key]);
  const ids = (list, max = Infinity) => Int16Array.from(list.slice(0, max).map((t) => bubbles.lineId(t)).filter((i) => i >= 0));
  const defaults = {
    idle: ids(poolOf('idle')),
    bumped: ids(poolOf('bumped')),
    greet: ids(poolOf('greet'), 10),
    scanned: ids(poolOf('scanned'), 10),
  };

  const paletteLinear = PALETTE.map((c) => new THREE.Color(c).toArray());
  const tickLinear = TICK_COLORS.map((c) => new THREE.Color(c).toArray());

  const S = new Float32Array(MAX * STRIDE);
  const alive = new Uint8Array(MAX);
  const colorIdx = new Uint8Array(MAX);
  const tickIdx = new Int8Array(MAX).fill(-1);
  const slotOf = new Int16Array(MAX);
  const homeYaw = new Float32Array(MAX);
  const talkCool = new Float32Array(MAX);
  const bumpCool = new Float32Array(MAX);
  const freeSlots = [];
  for (let i = MAX - 1; i >= 0; i--) freeSlots.push(i);
  const groups = [];
  let live = 0;
  let clock = 0;
  let frameN = 0;
  let selectTimer = 0;
  let scanT = -1;
  const scanOrigin = new THREE.Vector3();
  const player = new THREE.Vector3();
  let playerFeetOffset = 0;
  const point = { x: 0, z: 0 };
  const frustum = new THREE.Frustum();
  const projScreen = new THREE.Matrix4();
  const sphere = new THREE.Sphere();

  const headAt = (bot) => {
    if (!alive[bot]) return false;
    const o = bot * STRIDE;
    headAt.x = S[o + X];
    headAt.y = S[o + Y] + 1.92 + 0.035 * Math.sin(clock * 2.2 + S[o + PHASE]);
    headAt.z = S[o + Z];
    return true;
  };
  headAt.x = 0;
  headAt.y = 0;
  headAt.z = 0;

  function walkable(x, z) {
    return world.heightAt(x, z) > 0.8 && world.slopeAt(x, z) < 0.42;
  }

  const nearPlayer = (x, z, r) => (x - player.x) * (x - player.x) + (z - player.z) * (z - player.z) < r * r;

  function pickPoint(g) {
    for (let t = 0; t < 8; t++) {
      const a = g.rand() * TAU;
      const r = g.r * Math.sqrt(g.rand());
      point.x = g.cx + Math.cos(a) * r;
      point.z = g.cz + Math.sin(a) * r;
      if (walkable(point.x, point.z) && !nearPlayer(point.x, point.z, PERSONAL + 0.6)) return;
    }
    point.x = g.cx;
    point.z = g.cz;
  }

  function initBot(g, slot, x, z, yaw) {
    const o = slot * STRIDE;
    S.fill(0, o, o + STRIDE);
    S[o + X] = x;
    S[o + Z] = z;
    S[o + YAW] = yaw;
    S[o + Y] = world.heightAt(x, z);
    S[o + PHASE] = g.rand() * TAU;
    S[o + GROUP] = g.id;
    S[o + PARTNER] = -1;
    alive[slot] = 1;
    colorIdx[slot] = Math.floor(g.rand() * PALETTE.length);
    tickIdx[slot] = g.rand() < 0.42 ? Math.floor(g.rand() * TICK_COLORS.length) : -1;
    homeYaw[slot] = yaw;
    talkCool[slot] = g.rand() * 4;
    bumpCool[slot] = 0;
    live++;
  }

  function releaseBot(slot) {
    alive[slot] = 0;
    bubbles.release(slot);
    freeSlots.push(slot);
    live--;
  }

  function spawn({ center = [0, 0], radius = 12, count = 20, behavior = 'wander', lines, yaw, lookAt } = {}) {
    playerPosition();
    const n = Math.min(count, freeSlots.length);
    const g = {
      id: groups.length, behavior, cx: center[0], cz: center[1], r: radius, n, ids: new Int16Array(n),
      rand: ctx.rng.seeded(`bots:${groups.length}:${center[0]}:${center[1]}`), lines: defaults.idle, timer: 6, greetCool: 0,
      dir: 1, qx: 0, qz: 1, qyaw: 0, hx: 0, hz: 0, sp: 0.9, removed: false,
      look: behavior === 'stare' && Array.isArray(lookAt) ? { x: lookAt[0], y: lookAt[1], z: lookAt[2] } : null,
    };
    if (Array.isArray(lines) && lines.length) {
      const custom = ids(lines, 24);
      if (custom.length) g.lines = custom;
    }
    groups.push(g);
    if (behavior === 'queue') {
      const r = g.rand();
      g.qyaw = Number.isFinite(yaw) ? wrap(yaw + Math.PI) : r * TAU;
      g.qx = Math.sin(g.qyaw);
      g.qz = Math.cos(g.qyaw);
      g.hx = g.cx + g.qx * g.sp * (n - 1) * 0.5;
      g.hz = g.cz + g.qz * g.sp * (n - 1) * 0.5;
    }
    g.dir = g.rand() < 0.5 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const slot = freeSlots.pop();
      g.ids[i] = slot;
      if (behavior === 'queue') {
        initBot(g, slot, g.hx - g.qx * g.sp * i, g.hz - g.qz * g.sp * i, g.qyaw);
        slotOf[slot] = i;
        S[slot * STRIDE + MODE] = WALK;
        S[slot * STRIDE + PHASE] = 0;
      } else if (behavior === 'stare') {
        let best = null;
        let bestD = -1;
        for (let t = 0; t < 14; t++) {
          pickPoint(g);
          let dmin = 1e9;
          for (let j = 0; j < i; j++) {
            const q = g.ids[j] * STRIDE;
            dmin = Math.min(dmin, Math.hypot(S[q + X] - point.x, S[q + Z] - point.z));
          }
          if (dmin > bestD) {
            bestD = dmin;
            best = [point.x, point.z];
          }
          if (dmin > 1.9) break;
        }
        const r = g.rand();
        initBot(g, slot, best[0], best[1], g.look ? Math.atan2(g.look.x - best[0], g.look.z - best[1]) : r * TAU);
        S[slot * STRIDE + MODE] = STAND;
      } else if (behavior === 'mill') {
        const rho = g.r * (0.28 + 0.72 * Math.sqrt(g.rand()));
        const a = g.rand() * TAU;
        initBot(g, slot, g.cx + Math.cos(a) * rho, g.cz + Math.sin(a) * rho, a + (g.dir > 0 ? Math.PI / 2 : -Math.PI / 2));
        const o = slot * STRIDE;
        S[o + TX] = rho;
        S[o + TZ] = 0.5 + g.rand() * 0.4;
        S[o + MODE] = WALK;
      } else {
        pickPoint(g);
        initBot(g, slot, point.x, point.z, g.rand() * TAU);
        const o = slot * STRIDE;
        S[o + MODE] = PAUSE;
        S[o + TIMER] = g.rand() * 4;
      }
    }
    return {
      center: [g.cx, g.cz], radius: g.r, count: n, behavior,
      remove() {
        if (g.removed) return;
        g.removed = true;
        for (let i = 0; i < g.n; i++) releaseBot(g.ids[i]);
        groups[g.id] = null;
      },
    };
  }

  function steer(o, tx, tz, vmax, turn, dt) {
    const dx = tx - S[o + X];
    const dz = tz - S[o + Z];
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.01) {
      const diff = wrap(Math.atan2(dx, dz) - S[o + YAW]);
      const maxTurn = turn * dt;
      S[o + YAW] += clamp(diff, -maxTurn, maxTurn);
      const want = vmax * Math.max(0, Math.cos(diff)) * Math.min(1, d / 1.1);
      S[o + SPD] += (want - S[o + SPD]) * Math.min(1, dt * 3);
    }
    return d;
  }

  function turnTo(o, yaw, rate, dt) {
    const maxTurn = rate * dt;
    S[o + YAW] += clamp(wrap(yaw - S[o + YAW]), -maxTurn, maxTurn);
  }

  function slotPos(g, slot, lateral) {
    point.x = g.hx - g.qx * g.sp * slot + g.qz * lateral;
    point.z = g.hz - g.qz * g.sp * slot - g.qx * lateral;
  }

  function shuffle(g) {
    for (let i = 0; i < g.n; i++) {
      const b = g.ids[i];
      const o = b * STRIDE;
      if (slotOf[b] > 0) slotOf[b]--;
      else if (S[o + MODE] === WALK) {
        slotOf[b] = g.n - 1;
        S[o + MODE] = RET_A;
        slotPos(g, 0, 1.8);
        S[o + TX] = point.x;
        S[o + TZ] = point.z;
      }
    }
  }

  function endTalk(b) {
    const o = b * STRIDE;
    S[o + MODE] = PAUSE;
    S[o + TIMER] = 0.4 + rand() * 0.6;
    S[o + PARTNER] = -1;
    talkCool[b] = 7 + rand() * 8;
  }

  function updateBot(b, g, dt) {
    const o = b * STRIDE;
    const mode = S[o + MODE];
    const x = S[o + X];
    const z = S[o + Z];
    if (talkCool[b] > 0) talkCool[b] -= dt;
    if (bumpCool[b] > 0) bumpCool[b] -= dt;
    let nodTarget = 0;

    if (g.behavior === 'queue') {
      if (mode === WALK) {
        slotPos(g, slotOf[b], 0);
        const dx = point.x - x;
        const dz = point.z - z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > 0.015 && !nearPlayer(point.x, point.z, PERSONAL)) {
          const step = Math.min(d, 0.95 * dt);
          S[o + X] += (dx / d) * step;
          S[o + Z] += (dz / d) * step;
          S[o + SPD] = step / dt;
        } else S[o + SPD] = 0;
        S[o + YAW] = g.qyaw;
      } else {
        if (mode === RET_C) slotPos(g, slotOf[b], 0);
        else {
          point.x = S[o + TX];
          point.z = S[o + TZ];
        }
        const d = steer(o, point.x, point.z, 1.5, 4.5, dt);
        if (d < 0.35) {
          if (mode === RET_A) {
            S[o + MODE] = RET_B;
            slotPos(g, slotOf[b], 1.8);
            S[o + TX] = point.x;
            S[o + TZ] = point.z;
          } else if (mode === RET_B) S[o + MODE] = RET_C;
          else S[o + MODE] = WALK;
        }
        advance(o, dt);
      }
    } else if (g.look) {
      const lx = g.look.x - x;
      const lz = g.look.z - z;
      turnTo(o, Math.atan2(lx, lz), 2.5, dt);
      nodTarget = -clamp(Math.atan2(g.look.y - S[o + Y] - 1.9, Math.sqrt(lx * lx + lz * lz)) * 0.3, 0, 0.3);
      S[o + SPD] *= Math.exp(-4 * dt);
    } else if (g.behavior === 'stare') {
      const dx = player.x - x;
      const dz = player.z - z;
      const dp = Math.sqrt(dx * dx + dz * dz);
      if (dp < STARE_RANGE) {
        if (S[o + WATCH] < 0.5) {
          S[o + WATCH] = 1;
          S[o + TIMER] = rand() * 0.9;
          if (g.greetCool <= 0 && dp < 14 && bubbles.free() > 3 && defaults.greet.length) {
            bubbles.show(b, defaults.greet[Math.floor(rand() * defaults.greet.length)], 3.6);
            g.greetCool = 14;
          }
        }
        if (S[o + TIMER] > 0) S[o + TIMER] -= dt;
        else turnTo(o, Math.atan2(dx, dz), 4.2, dt);
        nodTarget = 0.07;
      } else {
        if (S[o + WATCH] > 0.5) {
          S[o + WATCH] = 0;
          S[o + TIMER] = 1.5 + rand() * 2.5;
        }
        if (S[o + TIMER] > 0) S[o + TIMER] -= dt;
        else turnTo(o, homeYaw[b], 0.7, dt);
      }
      S[o + SPD] *= Math.exp(-4 * dt);
    } else if (mode === TALK) {
      const p = S[o + PARTNER];
      S[o + TIMER] -= dt;
      S[o + SPD] *= Math.exp(-5 * dt);
      if (p < 0 || !alive[p] || S[p * STRIDE + MODE] !== TALK || S[o + TIMER] <= 0) endTalk(b);
      else {
        const q = p * STRIDE;
        turnTo(o, Math.atan2(S[q + X] - x, S[q + Z] - z), 4, dt);
        nodTarget = 0.06 * Math.sin(clock * 3.1 + S[o + PHASE]);
      }
    } else if (g.behavior === 'mill') {
      if (mode === PAUSE) {
        S[o + SPD] *= Math.exp(-3 * dt);
        S[o + TIMER] -= dt;
        if (S[o + TIMER] <= 0) S[o + MODE] = WALK;
      } else {
        const rho = clamp(S[o + TX] + Math.sin(clock * 0.13 + S[o + PHASE]) * 0.12 * dt * 8, g.r * 0.22, g.r);
        S[o + TX] = rho;
        const ang = Math.atan2(z - g.cz, x - g.cx) + g.dir * (1.0 / Math.max(rho, 1));
        const d = steer(o, g.cx + Math.cos(ang) * rho, g.cz + Math.sin(ang) * rho, S[o + TZ], 2.4, dt);
        if (d >= 0 && rand() < dt * 0.012) {
          S[o + MODE] = PAUSE;
          S[o + TIMER] = 2 + rand() * 3;
        }
      }
      advance(o, dt);
    } else {
      if (mode === PAUSE) {
        S[o + SPD] *= Math.exp(-3 * dt);
        S[o + TIMER] -= dt;
        if (S[o + TIMER] <= 0) {
          pickPoint(g);
          S[o + TX] = point.x;
          S[o + TZ] = point.z;
          S[o + MODE] = WALK;
        }
      } else {
        if (nearPlayer(S[o + TX], S[o + TZ], PERSONAL + 0.3)) {
          pickPoint(g);
          S[o + TX] = point.x;
          S[o + TZ] = point.z;
        }
        const d = steer(o, S[o + TX], S[o + TZ], 0.9 + 0.5 * ((b * 37) % 7) / 7, 2.6, dt);
        if (d < 0.4) {
          S[o + MODE] = PAUSE;
          S[o + TIMER] = 1.5 + rand() * 4;
        }
      }
      advance(o, dt);
    }

    avoidPlayer(b, o, dt);

    const vx = S[o + VX];
    const vz = S[o + VZ];
    if (vx !== 0 || vz !== 0) {
      const nx = S[o + X] + vx * dt;
      const nz = S[o + Z] + vz * dt;
      if (world.heightAt(nx, nz) > 0.5) {
        S[o + X] = nx;
        S[o + Z] = nz;
      }
      const k = Math.exp(-3 * dt);
      S[o + VX] = Math.abs(vx) < 0.01 ? 0 : vx * k;
      S[o + VZ] = Math.abs(vz) < 0.01 ? 0 : vz * k;
    }

    const h = world.heightAt(S[o + X], S[o + Z]);
    S[o + Y] += (h - S[o + Y]) * Math.min(1, dt * 14);
    const leanWant = clamp(S[o + SPD] * 0.12, 0, 0.17) + nodTarget;
    S[o + LEAN] += (leanWant - S[o + LEAN]) * Math.min(1, dt * 5);
  }

  function advance(o, dt) {
    const spd = S[o + SPD];
    if (spd < 0.005) return;
    const yaw = S[o + YAW];
    const nx = S[o + X] + Math.sin(yaw) * spd * dt;
    const nz = S[o + Z] + Math.cos(yaw) * spd * dt;
    if (world.heightAt(nx, nz) > 0.6) {
      S[o + X] = nx;
      S[o + Z] = nz;
    } else {
      S[o + SPD] = 0;
      S[o + MODE] = PAUSE;
      S[o + TIMER] = 0.4;
    }
  }

  function avoidPlayer(b, o, dt) {
    const dx = S[o + X] - player.x;
    const dz = S[o + Z] - player.z;
    if (dx > AVOID || dx < -AVOID || dz > AVOID || dz < -AVOID) return;
    const d2 = dx * dx + dz * dz;
    if (d2 > AVOID * AVOID) return;
    if (Math.abs(S[o + Y] - player.y) > 2.6) return;
    const d = Math.sqrt(d2) || 0.001;
    const nx = dx / d;
    const nz = dz / d;
    if (d < BUMP) {
      S[o + VX] += nx * 2.6;
      S[o + VZ] += nz * 2.6;
      S[o + X] += nx * (BUMP - d) * 0.6;
      S[o + Z] += nz * (BUMP - d) * 0.6;
      S[o + LEAN] = -0.18;
      if (bumpCool[b] <= 0) {
        bumpCool[b] = 5;
        if (defaults.bumped.length && rand() < 0.75) bubbles.evictFor(b, defaults.bumped[Math.floor(rand() * defaults.bumped.length)], 3.2);
        ctx.events.emit('bots:bump', { position: player });
      }
    } else {
      const push = (AVOID - d) * 3 * dt;
      S[o + VX] += nx * push;
      S[o + VZ] += nz * push;
      const v = Math.hypot(S[o + VX], S[o + VZ]);
      if (v > DRIFT) {
        S[o + VX] *= DRIFT / v;
        S[o + VZ] *= DRIFT / v;
      }
    }
  }

  function updatePairs(g) {
    if (g.n < 2) return;
    const talks = g.behavior === 'wander' || g.behavior === 'mill';
    for (let k = 0; k < 3; k++) {
      const shift = 1 + ((frameN * (1 + k * 4) + k * 5) % (g.n - 1));
      for (let i = 0; i < g.n; i++) {
        const a = g.ids[i];
        const b = g.ids[(i + shift) % g.n];
        const oa = a * STRIDE;
        const ob = b * STRIDE;
        const dx = S[oa + X] - S[ob + X];
        const dz = S[oa + Z] - S[ob + Z];
        const d2 = dx * dx + dz * dz;
        if (d2 > 2.6) continue;
        if (d2 < 0.62 && g.behavior !== 'queue') {
          const d = Math.sqrt(d2) || 0.01;
          const push = (0.8 - d) * 0.7;
          S[oa + VX] += (dx / d) * push;
          S[oa + VZ] += (dz / d) * push;
          S[ob + VX] -= (dx / d) * push;
          S[ob + VZ] -= (dz / d) * push;
        }
        if (!talks || k > 0) continue;
        if (S[oa + MODE] === TALK || S[ob + MODE] === TALK || talkCool[a] > 0 || talkCool[b] > 0) continue;
        if (S[oa + MODE] > PAUSE || S[ob + MODE] > PAUSE) continue;
        if (rand() > 0.35) continue;
        S[oa + MODE] = S[ob + MODE] = TALK;
        S[oa + PARTNER] = b;
        S[ob + PARTNER] = a;
        S[oa + TIMER] = S[ob + TIMER] = 3.5 + rand() * 3.5;
      }
    }
  }

  function crowded(x, z) {
    for (let k = 0; k < bubbles.POOL; k++) {
      const b = bubbles.bots[k];
      if (b < 0) continue;
      const dx = S[b * STRIDE + X] - x;
      const dz = S[b * STRIDE + Z] - z;
      if (dx * dx + dz * dz < 5.5) return true;
    }
    return false;
  }

  function selectBubble() {
    if (!bubbles.free() || !defaults.idle.length) return;
    const e = camera.matrixWorld.elements;
    const fx = -e[8];
    const fz = -e[10];
    let best = -1;
    let bestScore = 1e9;
    for (let i = 0; i < MAX; i++) {
      if (!alive[i]) continue;
      const o = i * STRIDE;
      const dx = S[o + X] - camera.position.x;
      const dz = S[o + Z] - camera.position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > BUBBLE_RANGE || d < 0.5) continue;
      if ((dx * fx + dz * fz) / d < 0.25 || bubbles.has(i) || crowded(S[o + X], S[o + Z])) continue;
      const score = d + rand() * 7 - (S[o + MODE] === TALK ? 5 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) return;
    const g = groups[S[best * STRIDE + GROUP]];
    bubbles.show(best, g.lines[Math.floor(rand() * g.lines.length)], 3.2 + rand() * 2.2);
  }

  function updateScanSpeech(dt) {
    if (scanT < 0) return;
    const prev = scanT * SCAN_SPEED;
    scanT += dt;
    const r = scanT * SCAN_SPEED;
    if (r > 140) {
      scanT = -1;
      return;
    }
    if (!defaults.scanned.length || bubbles.free() < 2) return;
    for (let i = 0; i < MAX; i++) {
      if (!alive[i]) continue;
      const o = i * STRIDE;
      const d = Math.hypot(S[o + X] - scanOrigin.x, S[o + Z] - scanOrigin.z);
      if (d < prev || d >= r || rand() > 0.18) continue;
      if (Math.hypot(S[o + X] - camera.position.x, S[o + Z] - camera.position.z) > BUBBLE_RANGE) continue;
      bubbles.show(i, defaults.scanned[Math.floor(rand() * defaults.scanned.length)], 3.4);
    }
  }

  ctx.events.on('scan:start', ({ origin }) => {
    if (!origin) return;
    scanOrigin.copy(origin);
    scanT = 0;
  });

  function playerPosition() {
    const useCam = !ctx.has('player') || ctx.debug.flycam?.enabled;
    if (useCam) {
      player.copy(camera.position);
      playerFeetOffset = 1.68;
    } else {
      player.copy(ctx.player.position);
      playerFeetOffset = 0;
    }
    player.y -= playerFeetOffset;
  }

  const m = body.instanceMatrix.array;
  const bodyColor = body.instanceColor.array;
  const tm = ticks.instanceMatrix.array;
  const tickColor = ticks.instanceColor.array;

  return {
    spawn,

    update(dt) {
      dt = Math.min(dt, 0.05);
      if (!live) return;
      clock += dt;
      frameN++;
      playerPosition();
      for (const g of groups) {
        if (!g) continue;
        if (g.greetCool > 0) g.greetCool -= dt;
        if (g.behavior === 'queue') {
          g.timer -= dt;
          if (g.timer <= 0) {
            shuffle(g);
            g.timer = 7;
          }
        }
        for (let i = 0; i < g.n; i++) updateBot(g.ids[i], g, dt);
        updatePairs(g);
      }
      selectTimer -= dt;
      if (selectTimer <= 0) {
        selectTimer = 0.3;
        if (rand() < 0.85) selectBubble();
      }
      updateScanSpeech(dt);
    },

    frame(dt) {
      camera.updateMatrixWorld();
      bubbles.update(dt, camera, headAt);
      let nb = 0;
      let nt = 0;
      if (live) {
        projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projScreen);
        const cx = camera.position.x;
        const cz = camera.position.z;
        const far = Math.min(ctx.quality.viewDistance || 500, 420);
        const far2 = far * far;
        const t = ctx.time.now;
        for (let i = 0; i < MAX; i++) {
          if (!alive[i]) continue;
          const o = i * STRIDE;
          const x = S[o + X];
          const z = S[o + Z];
          const dx = x - cx;
          const dz = z - cz;
          if (dx * dx + dz * dz > far2) continue;
          const bob = Math.sin(t * 2.2 + S[o + PHASE]);
          const y = S[o + Y] + 0.07 + 0.03 * bob;
          sphere.center.set(x, y + 1, z);
          sphere.radius = 1.5;
          if (!frustum.intersectsSphere(sphere)) continue;
          const sy = Math.sin(S[o + YAW]);
          const cy = Math.cos(S[o + YAW]);
          const lean = S[o + LEAN];
          const sl = Math.sin(lean);
          const cl = Math.cos(lean);
          const k = nb * 16;
          m[k] = cy; m[k + 1] = 0; m[k + 2] = -sy; m[k + 3] = 0;
          m[k + 4] = sl * sy; m[k + 5] = cl; m[k + 6] = sl * cy; m[k + 7] = 0;
          m[k + 8] = cl * sy; m[k + 9] = -sl; m[k + 10] = cl * cy; m[k + 11] = 0;
          m[k + 12] = x; m[k + 13] = y; m[k + 14] = z; m[k + 15] = 1;
          const c = paletteLinear[colorIdx[i]];
          bodyColor[nb * 3] = c[0];
          bodyColor[nb * 3 + 1] = c[1];
          bodyColor[nb * 3 + 2] = c[2];
          nb++;
          if (tickIdx[i] >= 0) {
            const spin = t * 1.3 + S[o + PHASE];
            const ss = Math.sin(spin) * 0.34;
            const sc = Math.cos(spin) * 0.34;
            const kt = nt * 16;
            tm[kt] = sc; tm[kt + 1] = 0; tm[kt + 2] = -ss; tm[kt + 3] = 0;
            tm[kt + 4] = 0; tm[kt + 5] = 0.34; tm[kt + 6] = 0; tm[kt + 7] = 0;
            tm[kt + 8] = ss; tm[kt + 9] = 0; tm[kt + 10] = sc; tm[kt + 11] = 0;
            tm[kt + 12] = x; tm[kt + 13] = y + 2.28 + 0.07 * Math.sin(t * 1.7 + S[o + PHASE]); tm[kt + 14] = z; tm[kt + 15] = 1;
            const tc = tickLinear[tickIdx[i]];
            tickColor[nt * 3] = tc[0];
            tickColor[nt * 3 + 1] = tc[1];
            tickColor[nt * 3 + 2] = tc[2];
            nt++;
          }
        }
      }
      body.count = nb;
      ticks.count = nt;
      body.instanceMatrix.needsUpdate = nb > 0;
      body.instanceColor.needsUpdate = nb > 0;
      ticks.instanceMatrix.needsUpdate = nt > 0;
      ticks.instanceColor.needsUpdate = nt > 0;
    },

    dispose() {
      scene.remove(body, ticks, bubbles.mesh);
      body.geometry.dispose();
      ticks.geometry.dispose();
    },

    get count() {
      return live;
    },
  };
}
