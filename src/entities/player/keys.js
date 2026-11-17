export function createKeyEdges(ctx) {
  const prev = new Map();
  const consumed = new Set();
  return function edge(code) {
    const { input } = ctx;
    const down = input.isDown(code);
    const was = prev.get(code) || false;
    prev.set(code, down);
    const pressed = input.pressed(code);
    if (!pressed) consumed.delete(code);
    if (down && !was) {
      if (pressed) consumed.add(code);
      return true;
    }
    if (pressed && !consumed.has(code)) {
      consumed.add(code);
      return true;
    }
    return false;
  };
}
