import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/caveat/400.css';
import '@fontsource/caveat/700.css';
import '@fontsource/vt323/400.css';
import './css/base.css';
import './css/hud.css';
import './css/reader.css';
import './css/screens.css';
import './css/menus.css';

import { h } from './dom.js';
import { createHud } from './hud.js';
import { createReader } from './reader.js';
import { createLoading, createTitle, createIntro } from './screens.js';
import { createSettings, createPause } from './menus.js';
import { createJournal } from './journal.js';
import { createReply, createCredits } from './ending.js';

export default async function create(ctx) {
  let host = ctx.uiRoot || document.getElementById('ui');
  if (!host) {
    host = h('div', { id: 'ui' });
    document.body.append(host);
  }
  const root = h('div.ui-root');
  host.append(root);

  const reduceFx = () => Boolean(ctx.state?.settings?.reduceFx);
  const applyReduce = () => root.classList.toggle('reduce-fx', reduceFx());
  applyReduce();

  let lastHover = 0;
  const sfx = (name, opts) => {
    if (name === 'ui.hover') {
      const now = performance.now();
      if (now - lastHover < 60) return;
      lastHover = now;
    }
    try {
      ctx.audio?.sfx?.(name, opts);
    } catch (err) {
      console.error('[ui] sfx failed', err);
    }
  };

  const layers = [];
  const stack = {
    push(layer) {
      layers.push(layer);
      root.classList.add('has-layer');
    },
    remove(layer) {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
      root.classList.toggle('has-layer', layers.length > 0);
    },
    get top() {
      return layers[layers.length - 1] || null;
    },
  };

  const deps = { stack, sfx, reduceFx };
  const hud = createHud(root, ctx, deps);
  const settings = createSettings(ctx, deps);
  const reader = createReader(root, ctx, deps);
  const loading = createLoading(root);
  const title = createTitle(root, ctx, { ...deps, settings });
  const intro = createIntro(root, ctx, deps);
  const pause = createPause(root, ctx, { ...deps, settings });
  const journal = createJournal(root, ctx, { ...deps, reader });
  const reply = createReply(root, ctx, deps);
  const credits = createCredits(root, ctx, deps);

  function onKeyDown(e) {
    const top = stack.top;
    if (top) {
      top.keydown?.(e);
      return;
    }
    const mode = ctx.state?.mode;
    if (mode !== 'playing') return;
    if (e.code === 'Tab') {
      e.preventDefault();
      if (!e.repeat) journal.open();
    } else if (e.code === 'Escape' && !ctx.input?.locked) {
      e.preventDefault();
      pause.open();
    }
  }
  function onKeyUp(e) {
    stack.top?.keyup?.(e);
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  function syncMode(mode) {
    root.dataset.mode = mode || '';
  }
  syncMode(ctx.state?.mode);

  const unsubs = [
    ctx.events.on('mode:change', ({ to }) => {
      syncMode(to);
      if (to !== 'playing') hud.setPrompt(null);
    }),
    ctx.events.on('input:unlock', () => {
      if (ctx.state?.mode === 'playing' && !stack.top) pause.open();
    }),
    ctx.events.on('settings:change', ({ key }) => {
      if (key === 'reduceFx') applyReduce();
    }),
    ctx.events.on('trace:found', ({ found, total } = {}) => {
      if (typeof found === 'number') hud.setTraceCount(found, total);
      else hud.refreshRing();
    }),
    ctx.events.on('beacon:ready', () => hud.refreshRing()),
    ctx.events.on('beacon:activated', () => hud.refreshRing()),
    ctx.events.on('stage:change', () => hud.refreshRing()),
    ctx.events.on('game:start', () => hud.refreshRing()),
  ];

  hud.refreshRing();

  return {
    start() {
      hud.refreshRing();
    },
    frame(dt) {
      hud.frame(dt);
    },
    dispose() {
      unsubs.forEach((off) => off());
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      hud.markers.clear();
      root.remove();
    },

    loading,
    title,
    intro,
    hud: (visible) => hud.setVisible(visible),
    prompt: (keyLabel, text) => hud.setPrompt(keyLabel, text),
    reticle: (kind) => hud.setReticle(kind),
    subtitle: (opts) => hud.subtitle(opts),
    toast: (text, opts) => hud.toast(text, opts),
    zoneCard: (opts) => hud.showZoneCard(opts),
    objective: (text) => hud.setObjective(text),
    setAddress: (opts) => hud.setAddress(opts),
    setSignal: (value) => hud.setSignal(value),
    setIndexation: (value) => hud.setIndexation(value),
    marker: { add: (opts) => hud.markers.add(opts) },
    reader: { open: (doc) => reader.open(doc) },
    reply: { open: (opts) => reply.open(opts) },
    credits: { play: (lines) => credits.play(lines) },
    journal: { toggle: () => journal.toggle(), open: () => journal.open(), close: () => journal.close() },
    pause: { open: () => pause.open(), resume: () => pause.resume() },
    hint: (keys, text, duration) => hud.hint(keys, text, duration),
    refresh: () => hud.refreshRing(),
  };
}
