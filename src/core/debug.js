export function createDebug(ctx, { simulate, setFreecam }) {
  let fps = 60;
  let overlay = null;
  let overlayTimer = 0;

  function resolveSpawn(target) {
    if (Array.isArray(target)) return [target[0], target[1], target[2], target[3] ?? 0];
    const zone = ctx.zones[target];
    if (ctx.has(`zone:${target}`) && Array.isArray(zone.spawn)) return zone.spawn;
    const def = ctx.world.zones[target];
    if (!def) return null;
    if (def.spawn) return def.spawn;
    const [x, , z] = def.arrival || [def.center[0], 0, def.center[1]];
    return [x, ctx.world.heightAt(x, z), z, 0];
  }

  const debug = {
    resolveSpawn,
    flycam: null,

    teleport(target, y, z, yaw) {
      const spot = typeof target === 'number' ? [target, y, z, yaw ?? 0] : resolveSpawn(target);
      if (!spot) throw new Error(`[debug] unknown teleport target "${target}"`);
      const [px, py, pz, pyaw = 0] = spot;
      if (ctx.has('player') && !debug.flycam?.enabled) ctx.player.teleport(px, py, pz, pyaw);
      else debug.flycam?.setPose(px, py + 1.68, pz, pyaw, 0);
      return spot;
    },

    advance(seconds) {
      const steps = Math.round(seconds * 60);
      for (let i = 0; i < steps; i++) {
        ctx.input.poll();
        simulate(1 / 60);
        ctx.input.endFrame();
      }
      return Promise.resolve(steps);
    },

    press(code, ms = 50) {
      ctx.input.simulate(code, true);
      return new Promise((resolve) => {
        setTimeout(() => {
          ctx.input.simulate(code, false);
          requestAnimationFrame(() => resolve());
        }, ms);
      });
    },

    solve(zoneId) {
      if (!ctx.has(`zone:${zoneId}`)) throw new Error(`[debug] zone "${zoneId}" is not loaded`);
      return ctx.zones[zoneId].debugSolve();
    },

    setStage(n) {
      const from = ctx.state.stage;
      const stage = ctx.state.applyStage(n);
      ctx.env.setStage(stage, { instant: true });
      ctx.events.emit('stage:change', { stage, from, instant: true });
      return stage;
    },

    stats() {
      const info = ctx.renderer.info;
      return { fps: Math.round(fps), calls: info.render.calls, triangles: info.render.triangles, bodies: ctx.physics.bodyCount };
    },

    freecam(on = true) {
      setFreecam(on);
      return on;
    },

    sample(realDt) {
      if (realDt > 0) fps += (1 / realDt - fps) * 0.05;
      if (!overlay) return;
      overlayTimer -= realDt;
      if (overlayTimer > 0) return;
      overlayTimer = 0.25;
      const s = debug.stats();
      const p = ctx.camera.position;
      overlay.textContent = `${s.fps} fps · ${s.calls} draws · ${(s.triangles / 1000).toFixed(0)} k tris · ${s.bodies} bodies · ${ctx.state.mode}\n${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)} · ${ctx.world.zoneAt(p.x, p.z) || '—'}`;
    },

    showOverlay() {
      if (overlay) return;
      overlay = document.createElement('pre');
      overlay.className = 'dh-debug';
      Object.assign(overlay.style, {
        position: 'fixed', left: '8px', bottom: '8px', margin: '0', padding: '6px 8px', zIndex: '9999',
        font: '11px/1.4 "IBM Plex Mono", monospace', color: '#f2efe8', background: 'rgba(11,13,16,0.72)',
        borderRadius: '4px', pointerEvents: 'none', whiteSpace: 'pre',
      });
      document.body.appendChild(overlay);
    },
  };
  return debug;
}
