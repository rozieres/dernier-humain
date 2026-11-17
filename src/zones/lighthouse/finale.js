import * as THREE from 'three';

const TOAST = 'Contenu humain sur Internet : 0,010 000 1 %';

export function createFinale(ctx, parts) {
  const { state, events, ui, postfx, audio, player, companion, texts } = ctx;
  const { tower, cottage, crt, board, radio, setLampLit, doorSpot } = parts;
  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const timers = [];
  let running = false;
  let speed = 1;
  let shot = null;
  let lampAnim = null;

  const wait = (seconds) => new Promise((resolve) => timers.push({ left: seconds / speed, resolve }));
  const fade = (to, seconds, color = '#000') => {
    postfx.fade(to, seconds / speed, color);
    return wait(seconds);
  };
  const reduce = () => Boolean(state.settings.reduceFx);

  function cut(spec) {
    shot = spec;
    shot.t = 0;
    spec.pose(0, camPos, camTarget);
    player.cinematic({ position: camPos, target: camTarget, fov: spec.fov ?? 60, blend: 0.001 });
  }

  const T = tower.root.position;
  const lamp = tower.lampWorld;
  const crtW = cottage.crtWorld;
  const shots = {
    room: {
      fov: 52,
      pose(t, p, q) {
        const k = Math.min(1, t / 9);
        const e = k * k * (3 - 2 * k);
        p.set(crtW.x - 1.6 + 1.02 * e, crtW.y + 0.45 - 0.36 * e, crtW.z + 0.6 - 0.56 * e);
        q.set(crtW.x + 0.4 - 0.4 * e, crtW.y + 0.1 - 0.16 * e, crtW.z - 0.02);
      },
    },
    foot: {
      fov: 62,
      pose(t, p, q) {
        const k = Math.min(1, t / 18);
        const a = 0.42 + 0.1 * k;
        p.set(T.x + Math.cos(a) * 27, T.y + 1.4 + 1.5 * k, T.z + Math.sin(a) * 27);
        q.set(lamp.x, lamp.y - 9 + 6 * k, lamp.z);
      },
    },
    strait: {
      fov: 58,
      pose(t, p, q) {
        const k = Math.min(1, t / 15);
        p.set(T.x - 70 + 40 * k, 128 - 8 * k, T.z + 95 - 10 * k);
        q.set(T.x + 330, 4, T.z - 20);
      },
    },
    shore: {
      fov: 56,
      pose(t, p, q) {
        const k = Math.min(1, t / 32);
        const x = -1075.5 + 1.2 * k;
        p.set(x, Math.max(ctx.world.heightAt(x, 179), 0.6) + 1.5 + 0.3 * k, 179);
        q.set(-700, 26 + 8 * k, 108);
      },
    },
  };

  function playLamp(seconds) {
    return new Promise((resolve) => {
      lampAnim = { t: 0, dur: seconds / speed, resolve };
    });
  }

  function creditLines(text) {
    return texts.CREDITS.map((l) => (l.style === 'player' ? { ...l, text: text || '…' } : l));
  }

  async function credits(text) {
    state.setMode('ending');
    audio.music.play('credits');
    const choice = await ui.credits.play(creditLines(text));
    if (choice === 'restart') {
      state.reset();
      location.reload();
      return 'restart';
    }
    finish();
    return 'continue';
  }

  function finish() {
    state.finaleDone = true;
    state.setFlag('story.finale.done', true);
    setLampLit();
    tower.setLamp(1);
    cottage.setDoor(true, true);
    if (ctx.env.stage !== 6) events.emit('stage:change', { stage: 6, from: 5, instant: true });
    const [x, y, z] = doorSpot;
    player.cinematic({ position: camPos, target: camTarget, blend: 0.001 });
    player.teleport(x, y, z, -Math.PI / 2 + 0.25);
    player.setCheckpoint([x, y, z], -Math.PI / 2 + 0.25);
    player.cinematic(null);
    player.lock(false);
    shot = null;
    state.save();
    events.emit('finale:done', {});
    postfx.setLetterbox(0, 1.2);
    postfx.fade(0, 2.2);
    radio.resume();
    state.setMode('playing');
    ctx.input.requestLock();
    companion.setMode('follow');
    companion.say('freeroam', { priority: 1 });
    running = false;
    speed = 1;
  }

  async function sequence(text) {
    state.setMode('cinematic');
    companion.silence();
    player.lock(true);
    postfx.setLetterbox(1, 1.4 / speed);
    crt.redraw({ replies: 1 });
    cut(shots.room);
    await fade(0, 0.6);
    await wait(3.2);
    radio.stop(1.6);
    await wait(4.8);
    await fade(1, 1.6);
    await wait(0.6);

    cut(shots.foot);
    await fade(0, 2.2);
    await wait(0.8);
    setLampLit();
    audio.sfx('lamp.ignite', { position: lamp, volume: 1 });
    audio.music.play('finale');
    playLamp(10);
    if (!reduce()) player.shake(0.25, 1.2);
    await wait(16);

    await fade(1, 0.7);
    cut(shots.strait);
    await fade(0, 1.0);
    await wait(14);

    await fade(1, 0.8);
    cut(shots.shore);
    await fade(0, 1.4);
    events.emit('stage:change', { stage: 6, from: 5 });
    await wait(2.5);
    companion.say('finale.after', { priority: 3, interrupt: true });
    await wait(13);
    companion.say('finale.dawn', { priority: 3 });
    await wait(9);
    ui.toast(TOAST, { duration: 6 });
    await wait(7);
    await fade(1, 2.6);
    await wait(0.8);
    return credits(text);
  }

  async function reply(text, { fast = false } = {}) {
    if (running) return null;
    running = true;
    speed = fast ? 8 : 1;
    const clean = String(text ?? '').trim();
    if (clean) state.addPlayerMessage(clean);
    state.setFlag('zone.lighthouse.replied', clean ? 'text' : 'empty');
    state.setFlag('story.finale.reply', true);
    events.emit('finale:reply', { text: clean });
    state.save();
    board.refresh();
    return sequence(clean);
  }

  async function resume() {
    if (running) return null;
    running = true;
    speed = 1;
    const replied = state.flag('zone.lighthouse.replied');
    const last = state.playerMessages[state.playerMessages.length - 1];
    const text = replied === 'text' && last ? last.text : '';
    setLampLit();
    tower.setLamp(1);
    player.lock(true);
    postfx.fade(1, 0);
    postfx.setLetterbox(1, 0);
    return credits(text);
  }

  return {
    get running() {
      return running;
    },
    reply,
    resume,
    update(dt) {
      for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].left -= dt;
        if (timers[i].left <= 0) {
          const { resolve } = timers[i];
          timers.splice(i, 1);
          resolve();
        }
      }
      if (shot) {
        shot.t += dt * speed;
        shot.pose(shot.t, camPos, camTarget);
      }
      if (lampAnim) {
        lampAnim.t += dt;
        const k = Math.min(1, lampAnim.t / lampAnim.dur);
        tower.setLamp(k);
        if (k >= 1) {
          lampAnim.resolve();
          lampAnim = null;
        }
      }
    },
  };
}
