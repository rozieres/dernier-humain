import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const easeInOut = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function createCameraRig(ctx) {
  const { camera } = ctx;
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const m4 = new THREE.Matrix4();
  const playerPos = new THREE.Vector3();
  const playerQuat = new THREE.Quaternion();
  const cinPos = new THREE.Vector3();
  const cinTarget = new THREE.Vector3();
  const cinQuat = new THREE.Quaternion();
  const fromPos = new THREE.Vector3();
  const fromQuat = new THREE.Quaternion();
  let fromFov = 70;
  let cin = null;
  let blendT = 1;
  let blendDur = 1.2;
  let returning = false;
  let shakeAmount = 0;
  let shakeLeft = 0;
  let shakeDur = 1;
  let shakeTime = 0;
  let dipOffset = 0;
  let dipVel = 0;

  const read = (v, out) => (Array.isArray(v) ? out.fromArray(v) : out.copy(v));

  function snapshot() {
    fromPos.copy(camera.position);
    fromQuat.copy(camera.quaternion);
    fromFov = camera.fov;
  }

  function cinematicPose() {
    read(cin.position, cinPos);
    read(cin.target, cinTarget);
    m4.lookAt(cinPos, cinTarget, UP);
    cinQuat.setFromRotationMatrix(m4);
  }

  return {
    get active() {
      return Boolean(cin);
    },
    get busy() {
      return Boolean(cin) || returning;
    },

    shake(amount = 0.5, duration = 0.5) {
      const reduce = ctx.state.settings.reduceFx ? 0.4 : 1;
      const a = Math.max(0, amount) * reduce;
      if (a >= shakeAmount * (shakeLeft / shakeDur)) {
        shakeAmount = a;
        shakeDur = Math.max(0.05, duration);
        shakeLeft = shakeDur;
      }
    },

    dip(speed) {
      if (ctx.state.settings.reduceFx) return;
      dipVel -= Math.min(4.2, speed * 0.24);
    },

    cinematic(spec) {
      snapshot();
      if (spec) {
        cin = { blend: 1.2, ...spec };
        blendDur = Math.max(0.001, cin.blend);
        returning = false;
      } else {
        if (!cin) return;
        blendDur = Math.max(0.001, cin.blend);
        cin = null;
        returning = true;
      }
      blendT = 0;
    },

    apply({ eye, yaw, pitch, roll = 0, fov, dt, write = true }) {
      dipVel += (-dipOffset * 140 - dipVel * 2 * Math.sqrt(140)) * dt;
      dipOffset += dipVel * dt;
      dipOffset = Math.max(-0.6, Math.min(0.2, dipOffset));
      let sx = 0;
      let sy = 0;
      if (shakeLeft > 0) {
        shakeLeft = Math.max(0, shakeLeft - dt);
        shakeTime += dt;
        const k = shakeAmount * (shakeLeft / shakeDur) ** 2;
        sx = (Math.sin(shakeTime * 37.1) + Math.sin(shakeTime * 61.7 + 1.3) * 0.6) * 0.022 * k;
        sy = (Math.sin(shakeTime * 43.3 + 2.1) + Math.sin(shakeTime * 71.9) * 0.5) * 0.022 * k;
      }
      playerPos.copy(eye);
      playerPos.y += dipOffset;
      euler.set(pitch + sx, yaw + sy, roll);
      playerQuat.setFromEuler(euler);
      if (!write) return;

      blendT = Math.min(1, blendT + dt / blendDur);
      let targetFov = fov;
      if (cin) {
        cinematicPose();
        const w = easeInOut(blendT);
        camera.position.lerpVectors(fromPos, cinPos, w);
        camera.quaternion.slerpQuaternions(fromQuat, cinQuat, w);
        targetFov = fromFov + ((cin.fov ?? fov) - fromFov) * ease(blendT);
      } else if (returning) {
        const w = easeInOut(blendT);
        camera.position.lerpVectors(fromPos, playerPos, w);
        camera.quaternion.slerpQuaternions(fromQuat, playerQuat, w);
        targetFov = fromFov + (fov - fromFov) * ease(blendT);
        if (blendT >= 1) returning = false;
      } else {
        camera.position.copy(playerPos);
        camera.quaternion.copy(playerQuat);
      }
      camera.rotation.setFromQuaternion(camera.quaternion, 'YXZ');
      if (Math.abs(camera.fov - targetFov) > 1e-3) {
        camera.fov = targetFov;
        camera.updateProjectionMatrix();
      }
    },
  };
}
