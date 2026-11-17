import { BEACON_ZONES } from '../core/state.js';

const SAMPLE = 0.25;
const MARGIN = 14;
const CONFIRM = 2;
const CARD_COOLDOWN = 120;
const HINT_AFTER = 150;
const ARRIVAL_STATUS = 3.5;
const NEUTRAL = { url: 'https://www.accueil-accueil.net/decouvrir?page=2', secure: true };

export function createTracker(ctx, { safe, gate = () => true }) {
  const { state, world, events } = ctx;
  const T = () => (ctx.has('texts') ? ctx.texts : {});
  let current = null;
  let candidate = null;
  let confirms = 0;
  let timer = 0;
  let enabled = false;
  const lastCard = new Map();
  const address = { url: NEUTRAL.url, secure: true, status: null, until: 0, override: null };
  let shownAddress = '';
  let shownObjective;
  let riding = null;
  const hintClock = new Map();
  const hintSig = new Map();
  let clock = 0;
  let finished = false;

  const zoneDef = (id) => world.zones[id];
  const zoneText = (id) => T().ZONES?.[id] || { name: zoneDef(id)?.name || id, tagline: '', url: NEUTRAL.url, secure: true };

  function distTo(id, p) {
    const z = zoneDef(id);
    return z ? Math.hypot(p.x - z.center[0], p.z - z.center[1]) : Infinity;
  }

  function sampleZone(p) {
    const raw = world.zoneAt(p.x, p.z);
    if (raw === current) {
      candidate = null;
      confirms = 0;
      return;
    }
    if (current && raw !== current && distTo(current, p) < zoneDef(current).radius + MARGIN) return;
    if (raw && current === null && distTo(raw, p) > zoneDef(raw).radius - MARGIN * 0.5) return;
    if (candidate !== raw) {
      candidate = raw;
      confirms = 1;
    } else confirms++;
    if (confirms < CONFIRM) return;
    switchTo(raw);
  }

  function switchTo(id) {
    const prev = current;
    current = id;
    candidate = null;
    confirms = 0;
    if (prev) events.emit('zone:leave', { id: prev });
    if (id) {
      events.emit('zone:enter', { id });
      onEnter(id);
    }
    refreshAddress(true);
    refreshObjective();
  }

  function onEnter(id) {
    const now = clock;
    const t = zoneText(id);
    if (!lastCard.has(id) || now - lastCard.get(id) >= CARD_COOLDOWN) {
      lastCard.set(id, now);
      ctx.ui.zoneCard({ name: t.name, tagline: t.tagline });
    }
    if (BEACON_ZONES.includes(id) && !state.flag(`story.visited.${id}`)) {
      state.setFlag(`story.visited.${id}`, true);
      ctx.companion.say(`zone.${id}.enter`, { priority: 1 });
    }
    if (id === 'lighthouse' && state.stage >= 5) setFinaleStep('house');
  }

  function setFinaleStep(step) {
    if (state.flag(`story.finale.${step}`)) return;
    state.setFlag(`story.finale.${step}`, true);
    refreshObjective();
  }

  function baseAddress() {
    if (riding) return { url: zoneText(riding).url, secure: zoneText(riding).secure !== false };
    if (current) {
      const t = zoneText(current);
      return { url: t.url, secure: t.secure !== false };
    }
    return NEUTRAL;
  }

  function refreshAddress(force = false) {
    const base = address.override || baseAddress();
    const status = address.override?.status ?? (clock < address.until ? address.status : null);
    const key = `${base.url}|${base.secure}|${status || ''}`;
    if (!force && key === shownAddress) return;
    shownAddress = key;
    ctx.ui.setAddress({ url: base.url, secure: base.secure, ...(status ? { status } : {}) });
  }

  function flashStatus(status, seconds) {
    address.status = status;
    address.until = clock + seconds;
    refreshAddress();
  }

  function objectiveText() {
    const O = T().OBJECTIVES;
    if (!O) return null;
    if (state.finaleDone || state.stage >= 6) return null;
    if (current && BEACON_ZONES.includes(current) && state.beacons[current] !== 'active') {
      const steps = O.zones?.[current]?.steps || [];
      for (const s of steps) {
        if (s.id === 'beacon') return s.text;
        if (!state.flag(`zone.${current}.${s.id}`)) return s.text;
      }
    }
    if (state.stage >= 5) {
      for (const s of O.finale || []) if (!state.flag(`story.finale.${s.id}`)) return s.text;
      return null;
    }
    return O.main;
  }

  function refreshObjective() {
    const text = enabled && !finished && state.mode !== 'cinematic' && gate() ? objectiveText() : null;
    if (text === shownObjective) return;
    shownObjective = text;
    ctx.ui.objective(text);
  }

  function zoneSignature(id) {
    let s = '';
    for (const k of Object.keys(state.flags)) if (k.startsWith(`zone.${id}.`) && state.flags[k]) s += `${k};`;
    return s;
  }

  function finaleSignature() {
    let s = '';
    for (const k of Object.keys(state.flags)) if (k.startsWith('story.finale.') && state.flags[k]) s += `${k};`;
    return s;
  }

  function tickHints(dt) {
    let key = null;
    let lines = null;
    let sig = '';
    if (state.stage === 5 && !state.finaleDone) {
      key = 'finale';
      lines = T().HINTS?.finale;
      sig = finaleSignature();
    } else if (current && BEACON_ZONES.includes(current) && state.beacons[current] !== 'active') {
      key = current;
      lines = T().HINTS?.[current];
      sig = zoneSignature(current);
    }
    if (!key || !Array.isArray(lines) || !lines.length) return;
    if (hintSig.get(key) !== sig) {
      hintSig.set(key, sig);
      hintClock.set(key, 0);
      return;
    }
    const t = (hintClock.get(key) || 0) + dt;
    hintClock.set(key, t);
    if (t < HINT_AFTER) return;
    hintClock.set(key, 0);
    const level = Number(state.flag(`story.hint.${key}`)) || 0;
    if (level >= lines.length) return;
    state.setFlag(`story.hint.${key}`, level + 1);
    ctx.companion.say(lines[level], { priority: 0 });
  }

  function lookingAtDeadLink() {
    const link = ctx.has('links') ? ctx.links.get('lighthouse') : null;
    const end = world.zones.lighthouse?.hubEnd;
    if (!link || link.enabled || !end || !ctx.has('player')) return false;
    const p = ctx.player.position;
    const dx = end[0] - p.x;
    const dz = end[2] - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 16) return false;
    if (d < 3) return true;
    const f = ctx.player.forward();
    return (f.x * dx + f.z * dz) / d > 0.82;
  }

  events.on('link:ride:start', safe(({ id } = {}) => {
    const link = ctx.links.get?.(id);
    const p = ctx.player.position;
    let dest = id;
    if (link?.a && link?.b && p) {
      const da = Math.hypot(p.x - link.a[0], p.z - link.a[2]);
      const db = Math.hypot(p.x - link.b[0], p.z - link.b[2]);
      if (db < da) dest = 'hub';
    }
    riding = world.zones[dest] ? dest : null;
    address.status = 'chargement…';
    address.until = Infinity;
    if (id === 'lighthouse') setFinaleStep('link');
    refreshAddress();
  }));
  events.on('link:ride:end', safe(({ id } = {}) => {
    riding = null;
    if (id === 'lighthouse') setFinaleStep('link');
    flashStatus('200 OK', ARRIVAL_STATUS);
  }));

  return {
    get current() {
      return current;
    },
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = Boolean(on);
      refreshObjective();
    },
    reset() {
      current = null;
      candidate = null;
      confirms = 0;
      timer = SAMPLE;
    },
    sampleNow() {
      if (!ctx.has('player')) return;
      const p = ctx.player.position;
      const raw = world.zoneAt(p.x, p.z);
      if (raw !== current) switchTo(raw);
    },
    flashStatus,
    refreshObjective,
    finish() {
      finished = true;
      refreshObjective();
    },
    refreshAddress,
    setFinaleStep,
    update(dt) {
      clock += dt;
      if (!enabled || !ctx.has('player')) return;
      timer -= dt;
      if (timer <= 0) {
        timer = SAMPLE;
        sampleZone(ctx.player.position);
        address.override = lookingAtDeadLink()
          ? { url: zoneText('lighthouse').url, secure: zoneText('lighthouse').secure !== false, status: '404' }
          : null;
        refreshAddress();
        refreshObjective();
      }
      if (state.mode === 'playing') tickHints(dt);
    },
  };
}
