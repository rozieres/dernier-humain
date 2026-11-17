export function createEvents() {
  const listeners = new Map();

  function on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => off(type, fn);
  }

  function off(type, fn) {
    listeners.get(type)?.delete(fn);
  }

  function once(type, fn) {
    const stop = on(type, (payload) => {
      stop();
      fn(payload);
    });
    return stop;
  }

  function emit(type, payload) {
    const set = listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[events] listener for "${type}" failed`, err);
      }
    }
  }

  function wait(type) {
    return new Promise((resolve) => once(type, resolve));
  }

  return { on, off, once, emit, wait };
}
