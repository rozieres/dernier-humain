const HUB_LEAVE = 75;
const CRATES = [5.8, 5.0];
const CRATE_RADIUS = 4;
const GATE_RADIUS = 10;
const LINK_IDS = ['feed', 'farm', 'hallu', 'oldweb', 'forest'];

export function createTutorial(ctx, { safe, onGoal }) {
  const { state, events, world } = ctx;
  const flag = (k) => Boolean(state.flag(`story.tut.${k}`));
  const mark = (k) => state.setFlag(`story.tut.${k}`, true);
  const key = (code) => ctx.input.label?.(code) || code;
  const waits = new Set();
  let running = false;
  let aborted = false;
  let clock = 0;
  let scannedPending = false;

  const STEPS = ['hello', 'move', 'goal', 'scan', 'scanned', 'grab', 'links'];

  function until(cond, timeout) {
    if (aborted) return Promise.resolve(false);
    return new Promise((resolve) => {
      waits.add({ cond, end: clock + timeout, resolve });
    });
  }
  const sleep = (s) => until(() => false, s).then(() => true);

  function say(k, timeout = 12) {
    if (aborted) return Promise.resolve(false);
    const spoken = ctx.companion.say(k, { priority: 1 });
    return Promise.race([Promise.resolve(spoken), sleep(timeout)]);
  }

  function hubDistance() {
    if (!ctx.has('player')) return 0;
    const p = ctx.player.position;
    return Math.hypot(p.x, p.z);
  }

  function nearCrates() {
    if (!ctx.has('player')) return false;
    const p = ctx.player.position;
    return Math.hypot(p.x - CRATES[0], p.z - CRATES[1]) < CRATE_RADIUS;
  }

  function nearGate() {
    if (!ctx.has('player')) return false;
    const p = ctx.player.position;
    for (const id of LINK_IDS) {
      const e = world.zones[id]?.hubEnd;
      if (e && Math.hypot(p.x - e[0], p.z - e[2]) < GATE_RADIUS) return true;
    }
    return false;
  }

  function finishAll() {
    for (const s of STEPS) mark(s);
    mark('done');
    running = false;
    for (const w of waits) w.resolve(false);
    waits.clear();
    onGoal?.();
  }

  function abort() {
    if (aborted) return;
    aborted = true;
    finishAll();
  }

  function checkDone() {
    if (STEPS.every(flag)) {
      mark('done');
      running = false;
    }
  }

  async function sequence() {
    await sleep(1.6);
    if (!flag('hello')) {
      mark('hello');
      await say('intro.hello');
    }
    if (!flag('move')) {
      mark('move');
      ctx.ui.hint(['KeyW', 'KeyA', 'KeyS', 'KeyD'].map(key), 'Se déplacer', 6);
      const start = ctx.has('player') ? ctx.player.position.clone() : null;
      await until(() => start && ctx.player.position.distanceTo(start) > 4, 7);
      await sleep(1);
      ctx.ui.hint([key('Space'), key('ShiftLeft')], 'Sauter, planer · Courir', 6);
      await sleep(3);
    }
    if (!flag('goal')) {
      mark('goal');
      await say('intro.goal');
      onGoal?.();
    }
    if (!flag('scan') && !flag('scanned')) {
      mark('scan');
      await sleep(1.5);
      ctx.ui.hint([key('KeyF')], 'Sonder', 8);
      await say('intro.scan');
      await until(() => flag('scanned'), 40);
    }
    mark('scan');
    checkDone();
  }

  events.on('scan:end', safe(() => {
    if (!running || flag('scanned')) return;
    scannedPending = true;
  }));

  return {
    get running() {
      return running;
    },
    start() {
      if (flag('done')) return;
      running = true;
      aborted = false;
      sequence().catch((err) => console.error('[story] tutorial failed', err));
    },
    skip: abort,
    update(dt) {
      clock += dt;
      for (const w of waits) {
        let ok = false;
        try {
          ok = Boolean(w.cond());
        } catch {
          ok = false;
        }
        if (ok || clock >= w.end) {
          waits.delete(w);
          w.resolve(ok);
        }
      }
      if (!running || state.mode !== 'playing') return;
      if (hubDistance() > HUB_LEAVE || (ctx.has('links') && ctx.links.riding)) {
        abort();
        return;
      }
      if (scannedPending && !flag('scanned')) {
        scannedPending = false;
        mark('scanned');
        ctx.companion.say('intro.scanned', { priority: 1 });
      }
      if (flag('goal') && !flag('grab') && nearCrates()) {
        mark('grab');
        ctx.companion.say('intro.grab', { priority: 1 });
        ctx.ui.hint([key('Mouse0'), key('Mouse2')], 'Attraper · Lancer', 7);
      }
      if (flag('goal') && !flag('links') && nearGate()) {
        mark('links');
        ctx.companion.say('intro.links', { priority: 1 });
        ctx.ui.hint([key('KeyE')], 'Suivre le lien', 7);
      }
      checkDone();
    },
  };
}
