const NAMED = {
  Space: 'Espace', ShiftLeft: 'Maj', ShiftRight: 'Maj', ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
  AltLeft: 'Alt', AltRight: 'Alt Gr', Tab: 'Tab', Escape: 'Échap', Enter: 'Entrée', Backspace: 'Retour',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', CapsLock: 'Verr. maj',
  Mouse0: 'Clic gauche', Mouse1: 'Clic molette', Mouse2: 'Clic droit',
};
const AZERTY = {
  KeyQ: 'A', KeyW: 'Z', KeyA: 'Q', KeyZ: 'W', KeyM: ',', Semicolon: 'M', Comma: ';', Period: ':', Slash: '!',
  Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9', Digit0: '0',
};
const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

const isEditable = (el) => el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');

export function createInput({ canvas, events, getMode }) {
  const down = new Set();
  const pressedSet = new Set();
  const releasedSet = new Set();
  const lookAcc = { dx: 0, dy: 0 };
  let wheelAcc = 0;
  let layoutMap = null;
  const french = typeof navigator !== 'undefined' && /^fr/i.test(navigator.language || '');

  navigator.keyboard?.getLayoutMap?.().then((m) => { layoutMap = m; }).catch(() => {});

  const press = (code) => {
    if (!down.has(code)) {
      down.add(code);
      pressedSet.add(code);
    }
  };
  const release = (code) => {
    if (down.delete(code)) releasedSet.add(code);
  };

  const onKeyDown = (e) => {
    if (isEditable(e.target)) return;
    if (e.code === 'Tab' && getMode() === 'playing') e.preventDefault();
    if (PREVENT.has(e.code) && (e.target === document.body || e.target === canvas)) e.preventDefault();
    if (!e.repeat) press(e.code);
  };
  const onKeyUp = (e) => release(e.code);
  const onMouseDown = (e) => {
    if (getMode() === 'playing' && document.pointerLockElement !== canvas && !navigator.webdriver) {
      input.requestLock();
      return;
    }
    press(`Mouse${e.button}`);
  };
  const onMouseUp = (e) => release(`Mouse${e.button}`);
  const onMouseMove = (e) => {
    if (document.pointerLockElement !== canvas) return;
    lookAcc.dx += e.movementX;
    lookAcc.dy += e.movementY;
  };
  const onWheel = (e) => { wheelAcc += Math.sign(e.deltaY); };
  const onBlur = () => {
    for (const code of [...down]) release(code);
  };
  const onLockChange = () => {
    const locked = document.pointerLockElement === canvas;
    input.locked = locked;
    events.emit(locked ? 'input:lock' : 'input:unlock');
  };
  const onContext = (e) => e.preventDefault();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('wheel', onWheel, { passive: true });
  canvas.addEventListener('contextmenu', onContext);
  window.addEventListener('blur', onBlur);
  document.addEventListener('pointerlockchange', onLockChange);

  const axis = (pos, neg) => (down.has(pos[0]) || down.has(pos[1]) ? 1 : 0) - (down.has(neg[0]) || down.has(neg[1]) ? 1 : 0);

  const input = {
    move: { x: 0, z: 0 },
    look: { dx: 0, dy: 0 },
    wheel: 0,
    locked: false,

    isDown: (code) => down.has(code),
    pressed: (code) => pressedSet.has(code),
    released: (code) => releasedSet.has(code),

    poll() {
      input.look.dx = lookAcc.dx;
      input.look.dy = lookAcc.dy;
      lookAcc.dx = 0;
      lookAcc.dy = 0;
      input.wheel = wheelAcc;
      wheelAcc = 0;
      const x = axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
      const z = axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
      const len = Math.hypot(x, z) || 1;
      input.move.x = x / len;
      input.move.z = z / len;
    },

    endFrame() {
      pressedSet.clear();
      releasedSet.clear();
    },

    requestLock() {
      if (document.pointerLockElement === canvas) return Promise.resolve(true);
      const attempt = (opts) => {
        try {
          return Promise.resolve(opts ? canvas.requestPointerLock(opts) : canvas.requestPointerLock());
        } catch (err) {
          return Promise.reject(err);
        }
      };
      return attempt({ unadjustedMovement: true })
        .catch(() => attempt())
        .then(() => true, () => false);
    },

    exitLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },

    label(code) {
      if (NAMED[code]) return NAMED[code];
      const fromLayout = layoutMap?.get(code);
      if (fromLayout) return fromLayout.toUpperCase();
      if (french && AZERTY[code]) return AZERTY[code];
      if (code.startsWith('Key')) return code.slice(3);
      if (code.startsWith('Digit')) return code.slice(5);
      return code;
    },

    simulate(code, isDown) {
      if (isDown) press(code);
      else release(code);
    },

    simulateLook(dx, dy) {
      lookAcc.dx += dx;
      lookAcc.dy += dy;
    },

    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('pointerlockchange', onLockChange);
    },
  };
  return input;
}
