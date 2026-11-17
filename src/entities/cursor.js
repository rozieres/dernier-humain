import * as THREE from 'three';
import { GLSL } from '../core/glsl.js';
import { createKeyEdges } from './player/keys.js';

const RANGE = 6;
const TETHER_SEGMENTS = 28;
const UP = new THREE.Vector3(0, 1, 0);
const AXES = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];

const RIM_VERTEX = /* glsl */ `
uniform vec3 uCenter;
uniform float uScale;
varying vec3 vWorld;
varying float vRim;
void main() {
  vec3 p = uCenter + (position - uCenter) * uScale + normal * 0.006;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vRim = 1.0 - abs(dot(n, normalize(cameraPosition - w.xyz)));
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const RIM_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.fog}
uniform vec3 uColor;
uniform float uPulse;
varying vec3 vWorld;
varying float vRim;
void main() {
  float pulse = 0.75 + 0.25 * sin(uTime * 5.5);
  vec3 col = uColor * (0.35 + 0.5 * vRim) * pulse * uPulse;
  gl_FragColor = vec4(applyFogAdditive(col, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
const TETHER_VERTEX = /* glsl */ `
attribute float aT;
varying float vT;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vT = aT;
  vUv = uv;
  vWorld = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;
const TETHER_FRAGMENT = /* glsl */ `
${GLSL.envPars}
${GLSL.fog}
uniform vec3 uColor;
uniform float uStrain;
varying float vT;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  float core = pow(clamp(1.0 - abs(vUv.y * 2.0 - 1.0), 0.0, 1.0), 1.6);
  float flow = 0.55 + 0.45 * sin(vT * 26.0 - uTime * 14.0);
  float fadeIn = smoothstep(0.0, 0.18, vT);
  vec3 col = mix(uColor, vec3(1.0, 0.42, 0.35) * 3.0, uStrain) * core * flow * fadeIn;
  gl_FragColor = vec4(applyFogAdditive(col, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export default async function create(ctx) {
  const { physics, camera, events, state, scene, mat } = ctx;
  const { GROUPS } = physics;
  const edge = createKeyEdges(ctx);

  const rimMaterial = mat.shader({
    vertexShader: RIM_VERTEX, fragmentShader: RIM_FRAGMENT,
    uniforms: {
      uColor: { value: new THREE.Color('#bfe6ff').multiplyScalar(1.6) }, uPulse: { value: 1 },
      uCenter: { value: new THREE.Vector3() }, uScale: { value: 1.028 },
    },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
  });
  const rimBeforeRender = (renderer, scene, cam, geometry, material) => {
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    material.uniforms.uCenter.value.copy(geometry.boundingSphere.center);
    material.uniformsNeedUpdate = true;
  };
  const GRAB_COLOR = new THREE.Color('#bfe6ff').multiplyScalar(1.2);
  const CLICK_COLOR = new THREE.Color('#ffb454').multiplyScalar(1.4);
  const overlays = [];
  let highlighted = null;

  const tetherPos = new Float32Array((TETHER_SEGMENTS + 1) * 2 * 3);
  const tetherT = new Float32Array((TETHER_SEGMENTS + 1) * 2);
  const tetherUv = new Float32Array((TETHER_SEGMENTS + 1) * 2 * 2);
  const tetherIdx = [];
  for (let i = 0; i <= TETHER_SEGMENTS; i++) {
    const t = i / TETHER_SEGMENTS;
    tetherT[i * 2] = t;
    tetherT[i * 2 + 1] = t;
    tetherUv.set([t, 0, t, 1], i * 4);
    if (i < TETHER_SEGMENTS) {
      const a = i * 2;
      tetherIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const tetherGeo = new THREE.BufferGeometry();
  const tetherAttr = new THREE.BufferAttribute(tetherPos, 3).setUsage(THREE.DynamicDrawUsage);
  tetherGeo.setAttribute('position', tetherAttr);
  tetherGeo.setAttribute('aT', new THREE.BufferAttribute(tetherT, 1));
  tetherGeo.setAttribute('uv', new THREE.BufferAttribute(tetherUv, 2));
  tetherGeo.setIndex(tetherIdx);
  const tetherMat = mat.shader({
    vertexShader: TETHER_VERTEX, fragmentShader: TETHER_FRAGMENT,
    uniforms: { uColor: { value: new THREE.Color('#8fd3ff').multiplyScalar(3.2) }, uStrain: { value: 0 } },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const tether = new THREE.Mesh(tetherGeo, tetherMat);
  tether.name = 'cursor:tether';
  tether.frustumCulled = false;
  tether.visible = false;
  tether.renderOrder = 5;
  scene.add(tether);

  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const right = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const holdTarget = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const p = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const side = new THREE.Vector3();
  const toCam = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const qYaw = new THREE.Quaternion();
  const qTarget = new THREE.Quaternion();
  const qCur = new THREE.Quaternion();
  const qTmp = new THREE.Quaternion();

  let reticle = '';
  let hold = null;

  const flycam = () => Boolean(ctx.debug.flycam?.enabled);
  const canUse = () => state.mode === 'playing' && !flycam() && !ctx.player.locked && !ctx.player.riding && !ctx.player.respawning;
  const valid = (e) => e && e.body && e.body.isValid() && e.collider.isValid();

  function setReticle(kind) {
    if (kind === reticle) return;
    reticle = kind;
    ctx.ui.reticle(kind);
  }

  function clearHighlight() {
    for (const o of overlays) if (o.parent) o.parent.remove(o);
    highlighted = null;
  }

  function highlight(object, color) {
    if (highlighted === object) {
      rimMaterial.uniforms.uColor.value.copy(color);
      return;
    }
    clearHighlight();
    if (!object) return;
    highlighted = object;
    rimMaterial.uniforms.uColor.value.copy(color);
    let n = 0;
    object.traverse((m) => {
      if (n >= 8 || !m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || !m.geometry?.attributes.normal || m === tether) return;
      if (m.name === 'cursor:rim') return;
      let o = overlays[n];
      if (!o) {
        o = new THREE.Mesh(m.geometry, rimMaterial);
        o.name = 'cursor:rim';
        o.renderOrder = 4;
        o.raycast = () => {};
        o.onBeforeRender = rimBeforeRender;
        overlays.push(o);
      }
      o.geometry = m.geometry;
      m.add(o);
      n++;
    });
  }

  function cameraYaw(out) {
    camera.getWorldDirection(tmp);
    return out.setFromAxisAngle(UP, Math.atan2(-tmp.x, -tmp.z));
  }

  function stablePose(entity, out) {
    const r = entity.body.rotation();
    qCur.set(r.x, r.y, r.z, r.w);
    let best = AXES[0];
    let bestDot = -2;
    for (const axis of AXES) {
      const d = tmp.copy(axis).applyQuaternion(qCur).y;
      if (d > bestDot) {
        bestDot = d;
        best = axis;
      }
    }
    tmp.copy(best).applyQuaternion(qCur);
    qTmp.setFromUnitVectors(tmp, UP);
    return out.copy(qCur).premultiply(qTmp);
  }

  function grab(entity) {
    if (!valid(entity) || !entity.body.isDynamic()) return false;
    if (hold) release();
    const saved = entity.collider.collisionGroups();
    const membership = (saved >>> 16) & 0xffff;
    entity.collider.setCollisionGroups(physics.groups(membership || GROUPS.DYNAMIC, 0xffff & ~GROUPS.PLAYER));
    const gravity = entity.body.gravityScale();
    entity.body.setGravityScale(0, true);
    entity.body.wakeUp();
    camera.getWorldPosition(origin);
    const t = entity.body.translation();
    const dist = origin.distanceTo(tmp.set(t.x, t.y, t.z));
    const r = entity.halfExtent || 0.4;
    const rel = new THREE.Quaternion();
    stablePose(entity, rel);
    cameraYaw(qYaw);
    rel.premultiply(qYaw.invert());
    hold = {
      entity, saved, gravity, rel, stuck: 0,
      mass: Math.max(0.5, entity.body.mass()),
      distance: THREE.MathUtils.clamp(dist, 1.8 + r, 2.6 + r),
    };
    cursor.held = entity;
    events.emit('grab:start', { entity });
    return true;
  }

  function release({ throw: thrown = false } = {}) {
    if (!hold) return null;
    const { entity, saved, gravity, mass } = hold;
    hold = null;
    cursor.held = null;
    tether.visible = false;
    if (valid(entity)) {
      entity.collider.setCollisionGroups(saved);
      entity.body.setGravityScale(gravity, true);
      const v = entity.body.linvel();
      if (thrown) {
        camera.getWorldDirection(dir);
        dir.addScaledVector(UP, 0.22).normalize();
        const speed = THREE.MathUtils.clamp(14 * (18 / mass) ** 0.25, 7, 22);
        const pv = ctx.player.velocity;
        entity.body.setLinvel({ x: dir.x * speed + pv.x * 0.5, y: dir.y * speed + Math.max(0, pv.y) * 0.5, z: dir.z * speed + pv.z * 0.5 }, true);
        right.crossVectors(dir, UP).normalize();
        entity.body.setAngvel({ x: right.x * 3, y: 0.6, z: right.z * 3 }, true);
      } else {
        tmp.set(v.x, v.y, v.z);
        if (tmp.length() > 7) tmp.setLength(7);
        entity.body.setLinvel({ x: tmp.x, y: tmp.y, z: tmp.z }, true);
      }
    }
    events.emit('grab:end', { entity, thrown });
    return entity;
  }

  function aim() {
    camera.getWorldPosition(origin);
    camera.getWorldDirection(dir);
    const exclude = hold ? [physics.playerEntity, hold.entity] : physics.playerEntity;
    const hit = physics.raycast(origin, dir, RANGE, { exclude });
    if (!hit) return null;
    const ud = hit.userData || {};
    if (ud.clickable && ud.clickable.enabled !== false) return { kind: 'click', entity: hit.entity, userData: ud, hit, object: hit.entity?.mesh || ud.clickable.object || ud.object || null };
    if (hit.entity?.grabbable && hit.entity.kind === 'dynamic') return { kind: 'grab', entity: hit.entity, userData: ud, hit, object: hit.entity.mesh };
    return null;
  }

  function updateTether(dt) {
    const e = hold.entity;
    camera.getWorldPosition(origin);
    camera.getWorldDirection(dir);
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    a.copy(origin).addScaledVector(dir, 0.6).addScaledVector(camUp, -0.17).addScaledVector(right, 0.1);
    b.copy(e.mesh ? e.mesh.getWorldPosition(tmp) : e.position);
    const len = a.distanceTo(b);
    c.lerpVectors(a, b, 0.5);
    c.y -= 0.12 * len + 0.05 * Math.sin(ctx.time.now * 3.1);
    c.addScaledVector(right, 0.04 * Math.sin(ctx.time.now * 2.3));
    for (let i = 0; i <= TETHER_SEGMENTS; i++) {
      const t = i / TETHER_SEGMENTS;
      const u = 1 - t;
      p.set(0, 0, 0).addScaledVector(a, u * u).addScaledVector(c, 2 * u * t).addScaledVector(b, t * t);
      tan.set(0, 0, 0).addScaledVector(c, 1).sub(a).multiplyScalar(2 * u).addScaledVector(tmp.subVectors(b, c), 2 * t);
      toCam.subVectors(origin, p);
      side.crossVectors(tan, toCam).normalize();
      const w = 0.006 + 0.016 * t;
      tetherPos[i * 6] = p.x + side.x * w;
      tetherPos[i * 6 + 1] = p.y + side.y * w;
      tetherPos[i * 6 + 2] = p.z + side.z * w;
      tetherPos[i * 6 + 3] = p.x - side.x * w;
      tetherPos[i * 6 + 4] = p.y - side.y * w;
      tetherPos[i * 6 + 5] = p.z - side.z * w;
    }
    tetherAttr.needsUpdate = true;
    tetherMat.uniforms.uStrain.value += (Math.min(1, hold.stuck * 3) - tetherMat.uniforms.uStrain.value) * Math.min(1, dt * 10);
    tether.visible = true;
  }

  const cursor = {
    held: null,
    target: null,
    grab,
    release,

    fixedUpdate(dt) {
      if (!hold) return;
      const e = hold.entity;
      if (!valid(e)) {
        release();
        return;
      }
      if (ctx.player.riding || ctx.player.respawning) {
        release();
        return;
      }
      camera.getWorldPosition(origin);
      camera.getWorldDirection(dir);
      const r = e.halfExtent || 0.4;
      camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      holdTarget.copy(origin).addScaledVector(dir, hold.distance).addScaledVector(camUp, -0.28);
      const floor = ctx.world.heightAt(holdTarget.x, holdTarget.z) + r;
      if (holdTarget.y < floor) holdTarget.y = floor;
      const t = e.body.translation();
      tmp.set(holdTarget.x - t.x, holdTarget.y - t.y, holdTarget.z - t.z);
      const dist = tmp.length();
      const v0 = e.body.linvel();
      const progress = dist > 1e-4 ? (v0.x * tmp.x + v0.y * tmp.y + v0.z * tmp.z) / dist : 0;
      const lag = 1 + hold.mass / 22;
      const omega = 13 / Math.sqrt(lag);
      tmp.multiplyScalar(omega).add(ctx.player.velocity);
      if (tmp.length() > 24) tmp.setLength(24);
      const v = e.body.linvel();
      const k = 1 - Math.exp((-dt * 34) / lag);
      e.body.setLinvel({ x: v.x + (tmp.x - v.x) * k, y: v.y + (tmp.y - v.y) * k, z: v.z + (tmp.z - v.z) * k }, true);

      cameraYaw(qYaw);
      qTarget.copy(qYaw).multiply(hold.rel);
      const q = e.body.rotation();
      qCur.set(q.x, q.y, q.z, q.w);
      qTmp.copy(qCur).invert().premultiply(qTarget);
      if (qTmp.w < 0) qTmp.set(-qTmp.x, -qTmp.y, -qTmp.z, -qTmp.w);
      const angle = 2 * Math.acos(Math.min(1, qTmp.w));
      const s = Math.sqrt(Math.max(1e-8, 1 - qTmp.w * qTmp.w));
      const gain = angle > 1e-4 ? (angle * 9) / lag / s : 0;
      const w = e.body.angvel();
      const kr = 1 - Math.exp((-dt * 20) / lag);
      e.body.setAngvel({
        x: w.x + (qTmp.x * gain - w.x) * kr,
        y: w.y + (qTmp.y * gain - w.y) * kr,
        z: w.z + (qTmp.z * gain - w.z) * kr,
      }, true);

      const tooFar = 1.1 + r;
      hold.stuck = dist > tooFar && progress < 1.5 ? hold.stuck + dt : Math.max(0, hold.stuck - dt * 2);
      if (hold.stuck > 0.45 || dist > 7) release();
    },

    update(dt) {
      if (!ctx.has('player')) return;
      const can = canUse();
      const fire = edge('Mouse0');
      const alt = edge('Mouse2');
      cursor.target = can ? aim() : null;
      const target = cursor.target;
      if (can) {
        if (fire) {
          if (hold) release();
          else if (target?.kind === 'click') {
            try {
              target.userData.clickable.onClick?.(ctx, target.hit);
            } catch (err) {
              console.error('[cursor] onClick failed', err);
            }
          } else if (target?.kind === 'grab') grab(target.entity);
        } else if (alt && hold) release({ throw: true });
      }
      if (hold) {
        updateTether(dt);
        highlight(hold.entity.mesh, GRAB_COLOR);
        rimMaterial.uniforms.uPulse.value = 0.55;
      } else if (target?.object) {
        highlight(target.object, target.kind === 'click' ? CLICK_COLOR : GRAB_COLOR);
        rimMaterial.uniforms.uPulse.value = 1;
      } else clearHighlight();

      if (ctx.player.riding) setReticle('none');
      else if (hold) setReticle('holding');
      else if (target) setReticle(target.kind);
      else if (state.mode === 'playing' && ctx.interact.current) setReticle('interact');
      else setReticle('default');
    },

    dispose() {
      release();
      clearHighlight();
      scene.remove(tether);
      tetherGeo.dispose();
      tetherMat.dispose();
      rimMaterial.dispose();
    },
  };
  return cursor;
}
