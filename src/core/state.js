const KEYS = { save: 'dhsi.save.v1', settings: 'dhsi.settings.v1', messages: 'dhsi.messages.v1' };
const MODES = new Set(['loading', 'title', 'intro', 'playing', 'reading', 'cinematic', 'paused', 'ending']);
export const BEACON_ZONES = ['feed', 'farm', 'hallu', 'oldweb', 'forest'];
export const DEFAULT_SETTINGS = Object.freeze({
  sensitivity: 1, invertY: false, fov: 70, master: 0.8, music: 0.7, sfx: 0.9,
  quality: 'high', subtitles: true, reduceFx: false,
});
const DEFAULT_CHECKPOINT = Object.freeze({ x: 0, y: 38, z: 8, yaw: 0 });

function refill(set, items) {
  set.clear();
  for (const item of items || []) set.add(item);
}

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function createState({ events, nosave = false }) {
  const write = (key, value) => {
    if (nosave) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.error('[state] save failed', err);
    }
  };

  const state = {
    mode: 'loading',
    beacons: Object.fromEntries(BEACON_ZONES.map((z) => [z, 'locked'])),
    traces: new Set(),
    flags: {},
    visitedLinks: new Set(),
    checkpoint: { ...DEFAULT_CHECKPOINT },
    settings: { ...DEFAULT_SETTINGS, ...(readJSON(KEYS.settings) || {}) },
    playerMessages: readJSON(KEYS.messages) || [],
    finaleDone: false,

    get stage() {
      if (state.finaleDone) return 6;
      return BEACON_ZONES.reduce((n, z) => n + (state.beacons[z] === 'active' ? 1 : 0), 0);
    },

    setMode(mode) {
      if (!MODES.has(mode)) throw new Error(`[state] unknown mode "${mode}"`);
      const from = state.mode;
      if (from === mode) return;
      state.mode = mode;
      events.emit('mode:change', { from, to: mode });
    },

    setBeacon(zone, status) {
      if (!(zone in state.beacons)) throw new Error(`[state] unknown beacon zone "${zone}"`);
      state.beacons[zone] = status;
    },

    addTrace(id) {
      if (state.traces.has(id)) return false;
      state.traces.add(id);
      return true;
    },

    flag(name) {
      return state.flags[name];
    },
    setFlag(name, value = true) {
      state.flags[name] = value;
    },

    setSetting(key, value) {
      state.settings[key] = value;
      write(KEYS.settings, state.settings);
      events.emit('settings:change', { key, value });
    },

    addPlayerMessage(text) {
      const entry = { text: String(text), date: new Date().toISOString() };
      state.playerMessages.push(entry);
      write(KEYS.messages, state.playerMessages);
      return entry;
    },

    hasSave() {
      try {
        return localStorage.getItem(KEYS.save) !== null;
      } catch {
        return false;
      }
    },

    save() {
      write(KEYS.save, {
        beacons: state.beacons, traces: [...state.traces], flags: state.flags,
        visitedLinks: [...state.visitedLinks], checkpoint: state.checkpoint, finaleDone: state.finaleDone,
      });
    },

    load() {
      const data = readJSON(KEYS.save);
      if (!data) return false;
      for (const z of BEACON_ZONES) state.beacons[z] = data.beacons?.[z] || 'locked';
      refill(state.traces, data.traces);
      refill(state.visitedLinks, data.visitedLinks);
      for (const k of Object.keys(state.flags)) delete state.flags[k];
      Object.assign(state.flags, data.flags || {});
      Object.assign(state.checkpoint, DEFAULT_CHECKPOINT, data.checkpoint || {});
      state.finaleDone = Boolean(data.finaleDone);
      return true;
    },

    reset() {
      for (const z of BEACON_ZONES) state.beacons[z] = 'locked';
      state.traces.clear();
      state.visitedLinks.clear();
      for (const k of Object.keys(state.flags)) delete state.flags[k];
      Object.assign(state.checkpoint, DEFAULT_CHECKPOINT);
      state.finaleDone = false;
      if (nosave) return;
      try {
        localStorage.removeItem(KEYS.save);
      } catch (err) {
        console.error('[state] reset failed', err);
      }
    },

    applyStage(n) {
      const stage = Math.max(0, Math.min(6, Math.floor(n)));
      BEACON_ZONES.forEach((z, i) => {
        state.beacons[z] = i < Math.min(stage, 5) ? 'active' : 'locked';
      });
      state.finaleDone = stage >= 6;
      return stage;
    },
  };
  return state;
}
