import * as THREE from 'three';
import { sharedUniforms } from '../core/glsl.js';
import { createCameraRig } from './player/camera.js';
import { createKeyEdges } from './player/keys.js';
import { createStepper } from './player/step.js';

const RADIUS = 0.35;
const HEIGHT = 1.8;
const CENTER = HEIGHT / 2;
const EYE = 1.68;
const STEP = 1 / 60;
const WALK = 5.5;
const SPRINT = 9;
const ACCEL = 46;
const FRICTION = 40;
const AIR_ACCEL = 13;
const GRAVITY = 24;
const JUMP_V = Math.sqrt(2 * GRAVITY * 1.6);
const JUMP_CUT = 0.45;
const COYOTE = 0.12;
const BUFFER = 0.14;
const MAX_FALL = 55;
const SLOPE = THREE.MathUtils.degToRad(47);
const OFFSET = 0.03;
const STEP_HEIGHT = 0.45;
const STEP_HOLD = 0.12;
const SNAP = 0.45;
const SAFE_SLOPE = Math.cos(THREE.MathUtils.degToRad(34));
const GLIDE_SPEED = 16;
const GLIDE_SINK = 2.5;
const GLIDE_CLEARANCE = 2.2;
const GLIDE_OPEN = 0.35;
const STRIDE_WALK = 2.15;
const STRIDE_SPRINT = 2.8;
const LOOK_SENS = 0.0022;
const PITCH_LIMIT = 1.52;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export default async function create(ctx) {
  const { physics, input, events, state, world, camera, canvas } = ctx;
  const { RAPIER, world: rw, GROUPS } = physics;
  const rig = createCameraRig(ctx);
  const edge = createKeyEdges(ctx);

  const hub = world.zones.hub.spawn;
  const center = new THREE.Vector3(hub[0], hub[1] + CENTER + 0.02, hub[2]);
  const prevCenter = center.clone();
  const body = rw.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x, center.y, center.z));
  const collider = rw.createCollider(
    RAPIER.ColliderDesc.capsule(CENTER - RADIUS, RADIUS).setFriction(0).setCollisionGroups(physics.groups(GROUPS.PLAYER)),
    body,
  );
  const kcc = rw.createCharacterController(OFFSET);
  kcc.setUp({ x: 0, y: 1, z: 0 });
  kcc.setMaxSlopeClimbAngle(SLOPE);
  kcc.setMinSlopeSlideAngle(SLOPE);
  kcc.enableSnapToGround(SNAP);
  kcc.setSlideEnabled(true);
  kcc.setApplyImpulsesToDynamicBodies(true);
  kcc.setCharacterMass(55);
  const moveGroups = physics.groups(GROUPS.PLAYER, GROUPS.TERRAIN | GROUPS.STATIC | GROUPS.DYNAMIC | GROUPS.KINEMATIC);
  const probeGroups = physics.groups(0xffff, GROUPS.TERRAIN | GROUPS.STATIC | GROUPS.DYNAMIC | GROUPS.KINEMATIC);
  physics.playerEntity = { isPlayer: true, body, collider };
  const stepUp = createStepper({
    RAPIER, rw, collider, radius: RADIUS, halfHeight: CENTER, offset: OFFSET, maxHeight: STEP_HEIGHT, minNormalY: Math.cos(SLOPE), groups: moveGroups,
  });

  const position = new THREE.Vector3(center.x, center.y - CENTER, center.z);
  const eye = new THREE.Vector3(position.x, position.y + EYE, position.z);
  const velocity = new THREE.Vector3();
  const hv = new THREE.Vector2();
  const desired = { x: 0, y: 0, z: 0 };
  const carry = new THREE.Vector3();
  const moved3 = new THREE.Vector3();
  const groundBodyPos = new THREE.Vector3();
  const groundNormal = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpQ2 = new THREE.Quaternion();
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  const DOWN = new THREE.Vector3(0, -1, 0);
  const settle = { x: 0, y: 0, z: 0 };
  const capsule = new RAPIER.Capsule(CENTER - RADIUS, RADIUS);
  const capsulePos = { x: 0, y: 0, z: 0 };
  const carryDir = { x: 0, y: 0, z: 0 };
  const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
  const notGround = (c) => c.parent()?.handle !== groundBody?.handle;
  let collision = null;

  let yaw = hub[3] || 0;
  let pitch = 0;
  let roll = 0;
  let vy = 0;
  let grounded = false;
  let coyote = 0;
  let jumpBuffer = 0;
  let jumpCut = false;
  let jumping = false;
  let airTime = 0;
  let fallSpeed = 0;
  let gliding = false;
  let glideAmt = 0;
  let glideSpeed = 0;
  let heading = 0;
  let glideRoll = 0;
  let liftAccel = 0;
  let liftHold = 0;
  let stepHold = 0;
  let stepEye = 0;
  let prevStepEye = 0;
  let lockedUser = false;
  let respawning = false;
  let ride = null;
  let pendingTeleport = false;
  let groundBody = null;
  const groundBodyQuat = new THREE.Quaternion();
  let groundKind = 'terrain';
  let surface = 'grass';
  let probeTimer = 0;
  let safeTimer = 0;
  let checkpointTimer = 0;
  let saveTimer = 0;
  const safe = { x: hub[0], y: hub[1], z: hub[2], yaw: hub[3] || 0 };
  let solidUnder = true;
  let stepDist = 0;
  let bobAmt = 0;
  let sprintAmt = 0;
  let speedFx = 0;
  let sentSpeedFx = -1;
  let sentGlide = -1;
  let simTime = 0;
  let renderTime = 0;
  let fovSmoothed = state.settings.fov || 70;

  const control = () => state.mode === 'playing' && !lockedUser && !respawning && !ride && !pendingTeleport;
  const waterAt = (x, z) => (ctx.has('water') ? ctx.water.heightAt(x, z) : world.SEA_LEVEL);
  const flycam = () => Boolean(ctx.debug.flycam?.enabled);

  canvas.addEventListener('mousedown', () => {
    if (state.mode === 'playing' && !input.locked && !flycam()) input.requestLock();
  });

  function clearance(maxDist) {
    ray.origin = { x: center.x, y: center.y - CENTER + 0.05, z: center.z };
    ray.dir = { x: 0, y: -1, z: 0 };
    const hit = rw.castRay(ray, maxDist, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, probeGroups, undefined, body);
    return hit ? hit.timeOfImpact : Infinity;
  }

  function floorNormal(x, y, z) {
    ray.origin = { x, y, z };
    ray.dir = { x: 0, y: -1, z: 0 };
    const hit = rw.castRayAndGetNormal(ray, CENTER + 0.6, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, probeGroups, undefined, body);
    return hit && hit.normal.y > 0.3 ? hit.normal : null;
  }

  function setGlide(on) {
    if (gliding === on) return;
    gliding = on;
    if (on) {
      glideSpeed = Math.max(hv.length(), 6);
      heading = hv.lengthSq() > 1 ? Math.atan2(-hv.x, -hv.y) : yaw;
      glideAmt = 0;
    }
    events.emit('player:glide', { active: on });
  }

  function land(speed) {
    events.emit('player:land', { speed });
    if (speed > 4) rig.dip(speed);
    if (speed > 15) rig.shake(Math.min(1, (speed - 12) / 20), 0.35);
  }

  function step() {
    stepDist = 0;
    events.emit('player:step', { surface });
  }

  function groundCarry() {
    if (!groundBody || !groundBody.isValid() || !groundBody.isKinematic()) {
      carry.set(0, 0, 0);
      return 0;
    }
    const t = groundBody.translation();
    const q = groundBody.rotation();
    tmpQ.set(q.x, q.y, q.z, q.w);
    tmpQ2.copy(groundBodyQuat).invert().premultiply(tmpQ);
    tmp.copy(center).sub(groundBodyPos).applyQuaternion(tmpQ2);
    carry.set(t.x, t.y, t.z).add(tmp).sub(center);
    groundBodyPos.set(t.x, t.y, t.z);
    groundBodyQuat.copy(tmpQ);
    const fwd = tmp.set(0, 0, -1).applyQuaternion(tmpQ2);
    return Math.atan2(-fwd.x, -fwd.z);
  }

  function rideGround() {
    const len = carry.length();
    capsulePos.x = center.x;
    capsulePos.y = center.y;
    capsulePos.z = center.z;
    carryDir.x = carry.x / len;
    carryDir.y = carry.y / len;
    carryDir.z = carry.z / len;
    const hit = rw.castShape(capsulePos, IDENTITY, carryDir, capsule, OFFSET, len, false, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, moveGroups, collider, undefined, notGround);
    if (hit) carry.multiplyScalar(hit.time_of_impact / len);
    center.add(carry);
    body.setTranslation({ x: center.x, y: center.y, z: center.z }, false);
    rw.propagateModifiedBodyPositionsToColliders();
  }

  function trackGround(c) {
    const b = c?.parent?.() || null;
    if (b === groundBody) return;
    groundBody = b && b.isKinematic() ? b : null;
    if (groundBody) {
      const t = groundBody.translation();
      const q = groundBody.rotation();
      groundBodyPos.set(t.x, t.y, t.z);
      groundBodyQuat.set(q.x, q.y, q.z, q.w);
    }
  }

  function glideStep(dt) {
    glideAmt = Math.min(1, glideAmt + dt / GLIDE_OPEN);
    const dh = wrap(yaw - heading);
    const turn = clamp(dh * (1 - Math.exp(-4 * dt)), -2.6 * dt, 2.6 * dt);
    heading = wrap(heading + turn);
    glideRoll = clamp((turn / dt) * 0.2, -0.3, 0.3);
    const dive = clamp(-pitch / 0.7, -1, 1);
    const down = Math.max(0, dive);
    const flare = Math.max(0, -dive);
    const target = GLIDE_SPEED + 16 * down - 7 * flare;
    let rate = down > 0 ? 6 + 4 * down : flare > 0 ? 3 + 8 * flare : 3.5;
    rate += 10 * (1 - glideAmt);
    glideSpeed += clamp(target - glideSpeed, -rate * dt, rate * dt);
    const targetVy = -GLIDE_SINK - 11 * down + Math.max(0, glideSpeed - 12) * 0.85 * flare + liftAccel * 0.8;
    const k = 1 - Math.exp(-(2.5 + 4 * (1 - glideAmt)) * dt);
    vy += (targetVy - vy) * k + liftAccel * dt;
    hv.set(-Math.sin(heading) * glideSpeed, -Math.cos(heading) * glideSpeed);
  }

  function applyTeleport() {
    pendingTeleport = false;
    body.setTranslation({ x: center.x, y: center.y, z: center.z }, true);
    body.setNextKinematicTranslation({ x: center.x, y: center.y, z: center.z });
    prevCenter.copy(center);
  }

  function fixedUpdate(dt) {
    simTime += dt;
    liftHold -= dt;
    if (liftHold <= 0) liftAccel = 0;
    stepHold = Math.max(0, stepHold - dt);
    prevCenter.copy(center);
    prevStepEye = stepEye;
    if (stepEye !== 0) {
      const ease = Math.max(0.3 * dt, Math.abs(stepEye) * (1 - Math.exp(-20 * dt)));
      stepEye = Math.abs(stepEye) <= ease ? 0 : stepEye - Math.sign(stepEye) * ease;
    }
    if (pendingTeleport) {
      applyTeleport();
      return;
    }
    if (ride) {
      center.copy(ride.position);
      center.y += CENTER;
      velocity.subVectors(center, prevCenter).divideScalar(dt);
      body.setNextKinematicTranslation({ x: center.x, y: center.y, z: center.z });
      grounded = false;
      vy = 0;
      hv.set(0, 0);
      groundBody = null;
      return;
    }
    if (respawning) {
      hv.set(0, 0);
      vy = 0;
      velocity.set(0, 0, 0);
      body.setNextKinematicTranslation({ x: center.x, y: center.y, z: center.z });
      return;
    }

    const can = control();
    coyote = grounded ? COYOTE : Math.max(0, coyote - dt);
    jumpBuffer = Math.max(0, jumpBuffer - dt);
    const sprint = can && (input.isDown('ShiftLeft') || input.isDown('ShiftRight'));
    const mx = can ? input.move.x : 0;
    const mz = can ? -input.move.z : 0;
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    const wishX = cy * mx - sy * mz;
    const wishZ = -sy * mx - cy * mz;
    const wishLen = Math.hypot(wishX, wishZ);
    const feetY = center.y - CENTER;
    const inWater = feetY < waterAt(center.x, center.z);
    const maxSpeed = (sprint && mz > 0.2 ? SPRINT : WALK) * (inWater ? 0.6 : 1);

    if (gliding) glideStep(dt);
    else if (grounded) {
      const tx = wishX * maxSpeed;
      const tz = wishZ * maxSpeed;
      const rate = (wishLen > 0.01 ? ACCEL : FRICTION) * dt;
      const dx = tx - hv.x;
      const dz = tz - hv.y;
      const d = Math.hypot(dx, dz);
      if (d <= rate) hv.set(tx, tz);
      else hv.set(hv.x + (dx / d) * rate, hv.y + (dz / d) * rate);
    } else if (wishLen > 0.01) {
      const before = Math.max(hv.length(), maxSpeed);
      hv.x += wishX * AIR_ACCEL * dt;
      hv.y += wishZ * AIR_ACCEL * dt;
      const after = hv.length();
      if (after > before) hv.multiplyScalar(before / after);
    }

    if (jumpBuffer > 0 && can && !gliding && (grounded || coyote > 0)) {
      vy = JUMP_V;
      grounded = false;
      coyote = 0;
      jumpBuffer = 0;
      jumping = true;
      airTime = 0;
      groundBody = null;
      stepHold = 0;
      events.emit('player:jump', {});
    }
    if (jumpCut) {
      if (jumping && vy > 0) vy *= JUMP_CUT;
      jumping = false;
      jumpCut = false;
    }

    const vyOld = vy;
    if (!grounded && !gliding) {
      vy -= GRAVITY * dt;
      vy += liftAccel * dt;
      if (inWater) vy = Math.max(vy, -4);
    }
    vy = Math.max(vy, -MAX_FALL);

    const spaceDown = input.isDown('Space');
    if (!grounded && !gliding && can && spaceDown && !inWater && vy < -0.5 && clearance(GLIDE_CLEARANCE) > GLIDE_CLEARANCE - 0.01) setGlide(true);
    else if (gliding && (!spaceDown || !can || inWater)) setGlide(false);

    const spin = groundCarry();
    if (spin) yaw += spin;
    if (carry.lengthSq() > 1e-12) rideGround();
    const holding = grounded && stepHold > 0;
    const dy = grounded ? (holding ? 0 : -0.05) : ((vyOld + vy) / 2) * dt;
    desired.x = hv.x * dt;
    desired.y = dy;
    desired.z = hv.y * dt;
    if (holding) kcc.disableSnapToGround();
    if (groundBody && grounded) {
      settle.y = dy;
      kcc.computeColliderMovement(collider, settle, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, moveGroups);
      const implicit = kcc.computedMovement();
      desired.x -= implicit.x;
      desired.z -= implicit.z;
    }
    kcc.computeColliderMovement(collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, moveGroups);
    if (holding) kcc.enableSnapToGround(SNAP);
    const computed = kcc.computedMovement();
    const mv = moved3.set(computed.x, computed.y, computed.z);
    const wasGrounded = grounded;
    const kccGrounded = kcc.computedGrounded();
    grounded = (kccGrounded || holding) && !(jumping && vy > 0);
    if (kccGrounded) stepHold = 0;

    let groundCollider = null;
    groundNormal.set(0, 1, 0);
    let stepped = null;
    const wish = Math.hypot(desired.x, desired.z);
    const blocked = wish > 1e-4 && (mv.x * desired.x + mv.z * desired.z) / wish < 0.7 * wish;
    if (wasGrounded && grounded && !gliding && blocked) {
      stepped = stepUp(center, desired.x, desired.z);
      if (stepped) {
        mv.set(stepped.x, stepped.y, stepped.z);
        groundCollider = stepped.collider;
        groundNormal.set(stepped.nx, stepped.ny, stepped.nz);
        stepHold = STEP_HOLD;
        stepEye -= stepped.y;
      }
    }

    const n = stepped ? 0 : kcc.numComputedCollisions();
    for (let i = 0; i < n; i++) {
      collision = kcc.computedCollision(i, collision ?? undefined);
      if (!collision) continue;
      const nx = collision.normal1.x;
      const ny = collision.normal1.y;
      const nz = collision.normal1.z;
      if (ny > 0.5) {
        if (!groundCollider || ny > groundNormal.y) {
          groundCollider = collision.collider;
          groundNormal.set(nx, ny, nz);
        }
      } else if (ny < 0.7 && ny > -0.7) {
        if (grounded && !blocked) continue;
        const h = Math.hypot(nx, nz) || 1;
        const dot = (hv.x * nx + hv.y * nz) / h;
        if (dot < 0) {
          hv.x -= (nx / h) * dot;
          hv.y -= (nz / h) * dot;
          if (gliding) glideSpeed = Math.max(4, hv.length());
        }
      } else if (ny <= -0.7 && vy > 0) vy = 0;
    }

    const realDy = mv.y;
    if (grounded) {
      if (!wasGrounded) {
        if (gliding) setGlide(false);
        if (airTime > 0.12 || fallSpeed > 3) land(fallSpeed);
        if (hv.lengthSq() > 1) stepDist = Math.max(stepDist, 1.2);
      }
      vy = 0;
      jumping = false;
      airTime = 0;
      fallSpeed = 0;
      trackGround(groundCollider);
    } else {
      airTime += dt;
      if (vy < 0 && realDy > dy + 1e-4 && !gliding) vy = Math.max(vy, realDy / dt);
      if (vy > 0 && realDy < dy * 0.5) vy = 0;
      fallSpeed = Math.max(0, -vy);
      if (!gliding) groundBody = null;
    }

    let hop = stepped ? stepped.y : 0;
    if (grounded && wasGrounded && !stepped) {
      const under = floorNormal(center.x + mv.x, center.y + mv.y, center.z + mv.z);
      if (under) {
        const rise = mv.y + (under.x * mv.x + under.z * mv.z) / under.y;
        hop = rise - clamp(rise, -0.01, 0.01);
      }
      stepEye -= hop;
    }
    stepEye = clamp(stepEye, -0.6, 0.6);
    center.x += mv.x;
    center.y += mv.y;
    center.z += mv.z;
    velocity.set((mv.x + carry.x) / dt, (mv.y - hop + carry.y) / dt, (mv.z + carry.z) / dt);
    body.setNextKinematicTranslation({ x: center.x, y: center.y, z: center.z });

    if (grounded) {
      const moved = Math.hypot(mv.x, mv.z);
      if (moved > 1e-4) {
        const stride = THREE.MathUtils.lerp(STRIDE_WALK, STRIDE_SPRINT, clamp((hv.length() - WALK) / (SPRINT - WALK), 0, 1));
        stepDist += moved;
        if (stepDist >= stride) step();
      }
    }

    probeTimer -= dt;
    if (probeTimer <= 0) {
      probeTimer = 0.1;
      probe();
    }
    safeTimer -= dt;
    if (safeTimer <= 0 && grounded && solidUnder && groundNormal.y > SAFE_SLOPE && feetY > waterAt(center.x, center.z) + 0.5 && !groundBody) {
      safeTimer = 0.25;
      safe.x = center.x;
      safe.y = feetY;
      safe.z = center.z;
      safe.yaw = yaw;
    }
  }

  function probe() {
    const hit = physics.raycast(tmp.set(center.x, center.y - CENTER + 0.3, center.z), DOWN, 1.2, { exclude: physics.playerEntity, groups: GROUPS.TERRAIN | GROUPS.STATIC | GROUPS.DYNAMIC | GROUPS.KINEMATIC });
    if (!hit) {
      solidUnder = false;
      surface = world.surfaceAt(center.x, center.z);
      return;
    }
    groundKind = hit.entity ? hit.entity.kind : hit.userData?.terrain ? 'terrain' : 'static';
    solidUnder = groundKind === 'terrain' || groundKind === 'static';
    surface = hit.userData?.surface || (groundKind === 'terrain' ? world.surfaceAt(center.x, center.z) : groundKind === 'dynamic' ? 'wood' : 'stone');
  }

  function update(dt) {
    renderTime += dt;
    if (renderTime - simTime > STEP || renderTime < simTime) renderTime = simTime + Math.min(STEP, Math.max(0, renderTime - simTime));
    const alpha = clamp((renderTime - simTime) / STEP, 0, 1);

    const can = control();
    if (edge('Space') && can) jumpBuffer = BUFFER;
    if (!input.isDown('Space') && jumping) jumpCut = true;

    const settings = state.settings;
    if (state.mode === 'playing' && !flycam() && (!rig.active)) {
      const sens = LOOK_SENS * (settings.sensitivity || 1);
      yaw -= input.look.dx * sens;
      pitch -= input.look.dy * sens * (settings.invertY ? -1 : 1);
    }
    if (ride) {
      const f = ride.forward;
      const fy = Math.atan2(-f.x, -f.z);
      const fp = Math.asin(clamp(f.y, -1, 1));
      const cone = ride.cone ?? 1.1;
      const k = 1 - Math.exp(-7 * dt);
      const idle = input.look.dx === 0 && input.look.dy === 0;
      const recenter = idle ? 1 - Math.exp(-1.2 * dt) : 0;
      let dyaw = wrap(yaw - fy);
      dyaw += (clamp(dyaw, -cone, cone) - dyaw) * k;
      dyaw -= dyaw * recenter;
      yaw = fy + dyaw;
      let dp = pitch - fp;
      dp += (clamp(dp, -cone * 0.6, cone * 0.6) - dp) * k;
      dp -= (dp + 0.12) * recenter;
      pitch = fp + dp;
    }
    yaw = wrap(yaw);
    pitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);

    position.lerpVectors(prevCenter, center, alpha);
    position.y -= CENTER;

    const hspeed = Math.hypot(velocity.x, velocity.z);
    const speed = velocity.length();
    const reduce = settings.reduceFx;
    bobAmt += ((grounded && !reduce ? Math.min(1.4, hspeed / WALK) : 0) - bobAmt) * (1 - Math.exp(-8 * dt));
    sprintAmt += ((grounded && hspeed > WALK + 1 ? 1 : 0) - sprintAmt) * (1 - Math.exp(-4 * dt));
    const stride = THREE.MathUtils.lerp(STRIDE_WALK, STRIDE_SPRINT, sprintAmt);
    const phase = (stepDist / stride) * Math.PI * 2;
    eye.copy(position);
    eye.y += EYE + THREE.MathUtils.lerp(prevStepEye, stepEye, alpha) - 0.042 * bobAmt * (0.5 - 0.5 * Math.cos(phase));
    const bobRoll = 0.004 * bobAmt * Math.sin(phase * 0.5);

    glideAmt = gliding ? glideAmt : Math.max(0, glideAmt - dt / GLIDE_OPEN);
    const rollTarget = ride ? ride.bank || 0 : gliding ? glideRoll : 0;
    roll += (rollTarget - roll) * (1 - Math.exp(-4 * dt));

    speedFx += (clamp((speed - 11) / 45, 0, 1) - speedFx) * (1 - Math.exp(-3 * dt));
    const fov = (settings.fov || 70) + 16 * Math.pow(speedFx, 0.8) + 3 * sprintAmt;
    fovSmoothed = fov;
    if (Math.abs(speedFx - sentSpeedFx) > 0.01) {
      sentSpeedFx = speedFx;
      ctx.postfx.setSpeed(reduce ? speedFx * 0.4 : speedFx * 0.9);
    }
    const glideParam = glideAmt * clamp(glideSpeed / 24, 0.4, 1);
    if (Math.abs(glideParam - sentGlide) > 0.01) {
      sentGlide = glideParam;
      ctx.audio.setParam('glide', glideParam);
    }

    rig.apply({ eye, yaw, pitch, roll: roll + bobRoll, fov: fovSmoothed, dt, write: !flycam() });
    sharedUniforms.uPlayerPos.value.copy(position);

    if (!respawning && !ride && !pendingTeleport) {
      if (eye.y < waterAt(eye.x, eye.z)) player.respawn('water');
      else if (position.y < -60) player.respawn('fall');
    }

    if (state.mode === 'playing') {
      checkpointTimer -= dt;
      if (checkpointTimer <= 0) {
        checkpointTimer = 2;
        Object.assign(state.checkpoint, { x: safe.x, y: safe.y, z: safe.z, yaw: safe.yaw });
      }
      saveTimer -= dt;
      if (saveTimer <= 0) {
        saveTimer = 30;
        if (state.hasSave()) state.save();
      }
    }
  }

  const player = {
    position, eye, velocity,
    get yaw() {
      return yaw;
    },
    set yaw(v) {
      yaw = v;
    },
    get pitch() {
      return pitch;
    },
    set pitch(v) {
      pitch = clamp(v, -PITCH_LIMIT, PITCH_LIMIT);
    },
    get grounded() {
      return grounded;
    },
    get gliding() {
      return gliding;
    },
    get speed() {
      return velocity.length();
    },
    get surface() {
      return surface;
    },
    get locked() {
      return lockedUser;
    },
    get riding() {
      return Boolean(ride);
    },
    get respawning() {
      return respawning;
    },
    get safePosition() {
      return safe;
    },
    body, collider,

    forward(target = new THREE.Vector3()) {
      return target.set(0, 0, -1).applyQuaternion(camera.quaternion);
    },

    teleport(x, y, z, yawValue) {
      center.set(x, y + CENTER + 0.02, z);
      prevCenter.copy(center);
      position.set(x, y + 0.02, z);
      eye.copy(position).y += EYE;
      if (Number.isFinite(yawValue)) {
        yaw = yawValue;
        pitch = 0;
      }
      hv.set(0, 0);
      vy = 0;
      velocity.set(0, 0, 0);
      grounded = false;
      airTime = 0;
      fallSpeed = 0;
      groundBody = null;
      jumping = false;
      stepHold = 0;
      stepEye = 0;
      prevStepEye = 0;
      if (gliding) setGlide(false);
      pendingTeleport = true;
      body.setTranslation({ x: center.x, y: center.y, z: center.z }, true);
      renderTime = simTime;
      if (!flycam() && !rig.busy) rig.apply({ eye, yaw, pitch, roll: 0, fov: fovSmoothed, dt: 0 });
    },

    setCheckpoint(p, yawValue = yaw) {
      const v = Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p;
      safe.x = v.x;
      safe.y = v.y;
      safe.z = v.z;
      safe.yaw = yawValue;
      safeTimer = 3;
      Object.assign(state.checkpoint, { x: v.x, y: v.y, z: v.z, yaw: yawValue });
    },

    async respawn(reason = 'fall') {
      if (respawning || ride) return false;
      respawning = true;
      if (gliding) setGlide(false);
      try {
        await ctx.postfx.fade(1, 0.35, '#000');
        player.teleport(safe.x, safe.y, safe.z, safe.yaw);
        safeTimer = 1;
        events.emit('player:respawn', { reason });
        await ctx.postfx.fade(0, 0.6, '#000');
      } finally {
        respawning = false;
      }
      return true;
    },

    lock(locked) {
      lockedUser = Boolean(locked);
      if (lockedUser && gliding) setGlide(false);
    },

    addImpulse(v) {
      const p = Array.isArray(v) ? { x: v[0], y: v[1], z: v[2] } : v;
      hv.x += p.x;
      hv.y += p.z;
      vy += p.y;
      if (p.y > 0) {
        grounded = false;
        coyote = 0;
        groundBody = null;
      }
    },

    applyLift(accel) {
      liftAccel = accel;
      liftHold = 0.1;
    },

    shake: (amount, duration) => rig.shake(amount, duration),
    cinematic: (spec) => rig.cinematic(spec),

    ride(pose) {
      if (pose) {
        if (gliding) setGlide(false);
        ride = pose;
      } else {
        ride = null;
      }
    },

    fixedUpdate,
    update,

    start() {
      const spawn = ctx.options.spawn;
      if (spawn === undefined && state.hasSave()) {
        const c = state.checkpoint;
        player.teleport(c.x, c.y, c.z, c.yaw);
      } else {
        const s = ctx.debug.resolveSpawn(spawn ?? 'hub') || hub;
        player.teleport(s[0], s[1], s[2], s[3] || 0);
      }
      safe.x = position.x;
      safe.y = position.y;
      safe.z = position.z;
      safe.yaw = yaw;
    },

    dispose() {
      rw.removeCharacterController(kcc);
      rw.removeRigidBody(body);
      physics.playerEntity = null;
    },
  };

  events.on('game:start', ({ newGame } = {}) => {
    if (ctx.options.spawn !== undefined) return;
    const c = newGame ? { x: hub[0], y: hub[1], z: hub[2], yaw: hub[3] || 0 } : state.checkpoint;
    player.teleport(c.x, c.y, c.z, c.yaw);
    player.setCheckpoint([c.x, c.y, c.z], c.yaw);
  });

  return player;
}
