const LOADED = Symbol.for('dhsi.story.loaded');
export const NEW_GAME_KEY = 'dhsi.story.newgame';

export function loadSaveOnce(ctx) {
  const { state, options = {} } = ctx;
  if (state[LOADED] !== undefined) return state[LOADED];
  let loaded = false;
  if (!options.nosave && !Number.isFinite(options.stage) && !pendingNewGame()) {
    try {
      loaded = state.hasSave() && state.load();
    } catch (err) {
      console.error('[story] load failed', err);
    }
  }
  state[LOADED] = loaded;
  return loaded;
}

export function pendingNewGame() {
  try {
    return sessionStorage.getItem(NEW_GAME_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPendingNewGame(on) {
  try {
    if (on) sessionStorage.setItem(NEW_GAME_KEY, '1');
    else sessionStorage.removeItem(NEW_GAME_KEY);
  } catch {
    return false;
  }
  return true;
}
