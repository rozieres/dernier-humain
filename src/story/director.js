import { BEACON_ZONES } from '../core/state.js';
import { loadSaveOnce, pendingNewGame, setPendingNewGame } from './save.js';
import { createTracker } from './tracker.js';
import { createTutorial } from './tutorial.js';
import { createTitleCamera } from './titlecam.js';
import { createRingCinematic } from './ring.js';

const AUTOSAVE = 30;
const SIM_PLAY = new Set(['playing', 'reading', 'cinematic']);
const RING_MAX_WAIT = 30;
const BEACON_LINES = { 1: 'beacon.first', 2: 'beacon.any', 3: 'beacon.any', 4: 'stage.night', 5: 'beacon.all' };

export default async function create(ctx) {
  const { state, events, options = {} } = ctx;
  const loaded = loadSaveOnce(ctx);
  const safe = (fn) => (...args) => {
    try {
      return fn(...args);
    } catch (err) {
      console.error('[story] handler failed', err);
      return undefined;
    }
  };

  let newGame = false;
  const tracker = createTracker(ctx, { safe, gate: () => !newGame || Boolean(state.flag('story.tut.goal')) || Boolean(state.flag('story.tut.done')) });
  const tutorial = createTutorial(ctx, { safe, onGoal: () => tracker.refreshObjective() });
  const titleCam = createTitleCamera(ctx);
  const ring = createRingCinematic(ctx, { tracker });

  let begun = false;
  let saveTimer = AUTOSAVE;
  const pendingLines = [];
  let settle = 0;
  let playTime = Number(state.flag('story.playTime')) || 0;

  function save() {
    if (state.mode === 'title' || state.mode === 'intro' || state.mode === 'loading') return;
    state.setFlag('story.playTime', Math.round(playTime));
    state.save();
  }

  function applyLoadedStage() {
    const stage = state.stage;
    if (Number.isFinite(options.stage)) return;
    if (loaded || stage !== (ctx.env.stage ?? 0)) {
      ctx.env.setStage?.(stage, { instant: true });
      events.emit('stage:change', { stage, from: 0, instant: true });
    }
    ctx.ui.refresh?.();
  }

  function ensureLighthouseLink(animate = false) {
    if (!ctx.has('links') || state.stage < 5) return;
    const link = ctx.links.get('lighthouse');
    if (link && !link.enabled) ctx.links.setEnabled('lighthouse', true, { animate });
  }

  async function startPlaying(isNew) {
    newGame = isNew;
    titleCam.stop();
    state.setMode('playing');
    ctx.ui.hud(true);
    events.emit('game:start', { newGame: isNew });
    tracker.reset();
    tracker.setEnabled(true);
    tracker.sampleNow();
    if (isNew) {
      state.setFlag('story.started', true);
      tutorial.start();
    } else {
      ensureLighthouseLink(false);
      if (state.stage >= 5 && !state.flag('story.ring.done')) state.setFlag('story.ring.done', true);
    }
    tracker.refreshObjective();
    if (isNew) save();
  }

  async function playIntro() {
    state.setMode('intro');
    titleCam.start();
    const cards = ctx.has('texts') ? ctx.texts.INTRO_CARDS : [];
    await ctx.ui.intro.play(cards);
    ctx.postfx.fade?.(1, 0.01);
  }

  async function newGameFlow({ fromTitle }) {
    if (fromTitle && state.hasSave() && !options.nosave) {
      state.reset();
      if (setPendingNewGame(true)) {
        window.location.reload();
        return;
      }
    }
    if (!options.skipIntro) await playIntro();
    else ctx.postfx.fade?.(1, 0.01);
    await startPlaying(true);
    ctx.postfx.fade?.(0, 2.2);
  }

  async function begin() {
    if (begun) return;
    begun = true;
    applyLoadedStage();
    if (pendingNewGame()) {
      setPendingNewGame(false);
      if (state.hasSave()) state.reset();
      await newGameFlow({ fromTitle: false });
      return;
    }
    if (options.skipMenu) {
      if (state.hasSave() && loaded) await startPlaying(false);
      else {
        if (!options.skipIntro && !state.hasSave()) await playIntro();
        await startPlaying(!loaded);
        ctx.postfx.fade?.(0, 1.2);
      }
      return;
    }
    state.setMode('title');
    ctx.ui.hud(false);
    titleCam.start();
    const choice = await ctx.ui.title.show({ canContinue: state.hasSave() && loaded });
    if (choice === 'continue') {
      await ctx.postfx.fade?.(1, 0.9);
      await startPlaying(false);
      ctx.postfx.fade?.(0, 1.6);
    } else await newGameFlow({ fromTitle: true });
  }

  function onBeaconActivated({ zone, count } = {}) {
    const n = Number.isFinite(count) ? count : BEACON_ZONES.filter((z) => state.beacons[z] === 'active').length;
    events.emit('stage:change', { stage: n, from: Math.max(0, n - 1) });
    ctx.audio.sfx('stage.shift');
    ctx.ui.toast(`Balise rallumée ${n}/5`, { icon: 'beacon', duration: 5 });
    if (BEACON_LINES[n]) pendingLines.push({ key: BEACON_LINES[n], count: n, zone });
    settle = 0;
    save();
  }

  function flushPending(dt) {
    if (!pendingLines.length) return;
    const blocked = state.mode !== 'playing' || (ctx.has('beacons') && ctx.beacons.activating) || ring.active;
    if (blocked) {
      settle = 0;
      return;
    }
    settle += dt;
    if (settle < 0.8) return;
    const ring5 = pendingLines[0].count >= 5 && !state.flag('story.ring.done');
    if (ring5 && !pendingLines[0].spoken) {
      pendingLines[0].spoken = true;
      ctx.companion.say(pendingLines[0].key, { priority: 2 });
    }
    if (ring5 && ctx.has('env') && ctx.env.transitioning && settle < RING_MAX_WAIT) return;
    const next = pendingLines.shift();
    if (ring5) {
      ring.play().then(() => {
        tracker.refreshObjective();
        save();
      });
    } else ctx.companion.say(next.key, { priority: 2 });
  }

  events.on('beacon:activated', safe(onBeaconActivated));
  events.on('trace:found', safe(() => save()));
  events.on('link:ride:end', safe(() => save()));
  events.on('link:restored', safe(({ id } = {}) => {
    if (id === 'lighthouse') tracker.flashStatus('200 OK', 5);
  }));
  events.on('finale:done', safe(() => {
    tracker.finish();
    save();
  }));
  events.on('mode:change', safe(({ to } = {}) => {
    if (to === 'playing') tracker.refreshObjective();
  }));

  const story = {
    begin,
    save,
    get playTime() {
      return playTime;
    },
    get zone() {
      return tracker.current;
    },
    get tutorialRunning() {
      return tutorial.running;
    },
    get cinematic() {
      return ring.active;
    },
    update(dt) {
      if (SIM_PLAY.has(state.mode)) {
        playTime += dt;
        if (state.mode === 'playing') {
          saveTimer -= dt;
          if (saveTimer <= 0) {
            saveTimer = AUTOSAVE;
            save();
          }
        }
      }
      tracker.update(dt);
      tutorial.update(dt);
      flushPending(dt);
      ring.update(dt);
    },
    frame(dt) {
      titleCam.frame(dt);
    },
    debug: {
      skipTutorial() {
        tutorial.skip();
        tracker.refreshObjective();
      },
      setStage(n) {
        const stage = ctx.debug.setStage(n);
        if (stage >= 5) {
          ensureLighthouseLink(false);
          state.setFlag('story.ring.done', true);
        }
        tracker.refreshObjective();
        return stage;
      },
      tracker,
      tutorial,
      ring,
      titleCam,
      get pendingLines() {
        return pendingLines.map((l) => l.key);
      },
    },
  };
  return story;
}

