import * as THREE from 'three';

const DURATION = 12.5;
const RESTORE_AT = 1.6;
const CUT_AT = 5.2;
const RETURN_AT = 10.6;
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp3 = (out, a, b, k) => out.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);

const SHOT_A = { from: [820, 360, 760], to: [740, 330, 690], lookFrom: [-240, -40, -170], lookTo: [-330, -50, -120] };
const SHOT_B = { from: [70, 92, 34], to: [-40, 86, 26], lookFrom: [-330, 22, 120], lookTo: [-1060, 10, 175] };

export function createRingCinematic(ctx, { tracker }) {
  const { state } = ctx;
  const pos = new THREE.Vector3();
  const target = new THREE.Vector3();
  let seq = null;

  function shot(spec, k) {
    lerp3(pos, spec.from, spec.to, k);
    lerp3(target, spec.lookFrom, spec.lookTo, k);
  }

  function play() {
    if (seq) return seq.promise;
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    seq = { t: 0, phase: 0, prevMode: state.mode, resolve, promise };
    state.setFlag('story.ring.done', true);
    state.setMode('cinematic');
    if (ctx.has('player')) ctx.player.lock(true);
    ctx.postfx.setLetterbox?.(1, 0.9);
    tracker.refreshObjective();
    shot(SHOT_A, 0);
    ctx.player.cinematic?.({ position: pos, target, fov: 60, blend: 2.2 });
    return promise;
  }

  function finish() {
    const s = seq;
    seq = null;
    if (s.phase < 3) ctx.player.cinematic?.(null);
    ctx.postfx.setLetterbox?.(0, 0.9);
    if (ctx.has('player')) ctx.player.lock(false);
    if (state.mode === 'cinematic') state.setMode('playing');
    tracker.refreshObjective();
    ctx.companion.say('link.restored', { priority: 2 });
    s.resolve(true);
  }

  return {
    get active() {
      return Boolean(seq);
    },
    get time() {
      return seq ? seq.t : -1;
    },
    play,
    update(dt) {
      if (!seq) return;
      seq.t += dt;
      const t = seq.t;
      if (seq.phase === 0 && t >= RESTORE_AT) {
        seq.phase = 1;
        if (ctx.has('links')) ctx.links.setEnabled('lighthouse', true, { animate: true });
      }
      if (seq.phase === 1 && t >= CUT_AT) {
        seq.phase = 2;
        shot(SHOT_B, 0);
        ctx.player.cinematic?.({ position: pos, target, fov: 46, blend: 0.001 });
        tracker.flashStatus('200 OK', 6);
      }
      if (seq.phase === 2 && t >= RETURN_AT) {
        seq.phase = 3;
        ctx.player.cinematic?.(null);
      }
      if (seq.phase <= 1) shot(SHOT_A, ease(t / CUT_AT));
      else if (seq.phase === 2) shot(SHOT_B, ease((t - CUT_AT) / (RETURN_AT - CUT_AT)));
      if (t >= DURATION) finish();
    },
  };
}
