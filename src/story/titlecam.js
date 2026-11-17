import * as THREE from 'three';

const CENTER = new THREE.Vector3(0, 38, 0);
const SPEED = (Math.PI * 2) / 300;

export function createTitleCamera(ctx) {
  const { camera } = ctx;
  const params = { radius: 76, height: 20, start: 5.9, lead: -0.36, reach: 90, aimY: 12, fov: 50 };
  const pos = new THREE.Vector3();
  const target = new THREE.Vector3();
  let active = false;
  let t = 0;
  let savedFov = camera.fov;

  function pose(time, outPos, outTarget) {
    const P = params;
    const a = P.start + time * SPEED;
    const r = P.radius + 8 * Math.sin(time * 0.09);
    outPos.set(CENTER.x + Math.sin(a) * r, CENTER.y + P.height + 4 * Math.sin(time * 0.07 + 1), CENTER.z + Math.cos(a) * r);
    outPos.y = Math.max(outPos.y, ctx.world.heightAt(outPos.x, outPos.z) + 10);
    const aim = a + Math.PI - P.lead;
    outTarget.set(outPos.x + Math.sin(aim) * P.reach, CENTER.y + P.aimY, outPos.z + Math.cos(aim) * P.reach);
  }

  return {
    get active() {
      return active;
    },
    params,
    pose,
    start() {
      if (active) return;
      active = true;
      t = 0;
      savedFov = camera.fov;
    },
    stop() {
      if (!active) return;
      active = false;
      camera.fov = savedFov;
      camera.updateProjectionMatrix();
    },
    frame(dt) {
      if (!active) return;
      const mode = ctx.state.mode;
      if (mode !== 'title' && mode !== 'intro' && mode !== 'loading') return;
      t += dt;
      pose(t, pos, target);
      camera.position.copy(pos);
      camera.lookAt(target);
      if (Math.abs(camera.fov - params.fov) > 1e-3) {
        camera.fov = params.fov;
        camera.updateProjectionMatrix();
      }
    },
  };
}
