import { h, typo, keycap } from './dom.js';
import { SETTINGS, PAUSE, CONTROLS, RING_ORDER } from './strings.js';

const DEFAULTS = { sensitivity: 1, invertY: false, fov: 75, master: 0.8, music: 0.7, sfx: 0.8, quality: 'high', subtitles: true, reduceFx: false };

const fmtNumber = (v, digits) => v.toFixed(digits).replace('.', ',');

export function createSettings(ctx, { sfx }) {
  function get(key) {
    const s = ctx.state?.settings;
    return s && s[key] !== undefined ? s[key] : DEFAULTS[key];
  }
  function set(key, value) {
    ctx.state?.setSetting?.(key, value);
  }

  function slider(key, label, { min, max, step, format }) {
    const out = h('span.set-value');
    const input = h('input.set-range', { type: 'range', min, max, step, value: get(key), 'aria-label': label });
    const paint = () => {
      const v = Number(input.value);
      out.textContent = format(v);
      input.style.setProperty('--p', `${((v - min) / (max - min)) * 100}%`);
    };
    input.addEventListener('input', () => {
      paint();
      set(key, Number(input.value));
    });
    input.addEventListener('change', () => sfx('ui.click'));
    paint();
    return h('label.set-row', null, h('span.set-label', { text: label }), h('span.set-control', null, input, out));
  }

  function toggle(key, label) {
    const btn = h('button.set-toggle', { type: 'button', 'aria-label': label });
    const paint = () => {
      const on = Boolean(get(key));
      btn.setAttribute('aria-pressed', String(on));
      btn.replaceChildren(h('span.set-toggle-track', null, h('span.set-toggle-knob')), h('span', { text: on ? SETTINGS.on : SETTINGS.off }));
    };
    btn.addEventListener('click', () => {
      set(key, !get(key));
      sfx('ui.click');
      paint();
    });
    btn.addEventListener('mouseenter', () => sfx('ui.hover'));
    paint();
    return h('div.set-row', null, h('span.set-label', { text: label }), h('span.set-control', null, btn));
  }

  function segmented(key, label, options) {
    const wrap = h('span.set-seg', { role: 'radiogroup', 'aria-label': label });
    const paint = () => {
      for (const b of wrap.children) b.setAttribute('aria-checked', String(b.dataset.value === get(key)));
    };
    for (const [value, text] of Object.entries(options)) {
      wrap.append(h('button.set-seg-item', {
        type: 'button',
        role: 'radio',
        dataset: { value },
        onclick: () => {
          set(key, value);
          sfx('ui.click');
          paint();
        },
        onmouseenter: () => sfx('ui.hover'),
      }, text));
    }
    paint();
    return h('div.set-row', null, h('span.set-label', { text: label }), h('span.set-control', null, wrap));
  }

  function open(parent, onBack) {
    const pct = (v) => `${Math.round(v * 100)} %`;
    const back = h('button.btn.btn--ghost.set-back', { type: 'button', onclick: () => close(), onmouseenter: () => sfx('ui.hover') },
      keycap(ctx.input?.label?.('Escape') || 'Échap'), h('span', { text: SETTINGS.back }));
    const panel = h('section.settings', { role: 'dialog', 'aria-label': SETTINGS.title },
      h('header.settings-head', null, h('h2.settings-title', { text: SETTINGS.title }), back),
      h('div.settings-cols', null,
        h('div.set-group', null,
          h('h3.set-group-title', { text: SETTINGS.groups.controls }),
          slider('sensitivity', SETTINGS.sensitivity, { min: 0.2, max: 3, step: 0.05, format: (v) => `${fmtNumber(v, 2)} ×` }),
          toggle('invertY', SETTINGS.invertY),
          h('h3.set-group-title', { text: SETTINGS.groups.display }),
          slider('fov', SETTINGS.fov, { min: 60, max: 100, step: 1, format: (v) => `${v}°` }),
          segmented('quality', SETTINGS.quality, SETTINGS.qualities),
          toggle('subtitles', SETTINGS.subtitles),
          toggle('reduceFx', SETTINGS.reduceFx)),
        h('div.set-group', null,
          h('h3.set-group-title', { text: SETTINGS.groups.sound }),
          slider('master', SETTINGS.master, { min: 0, max: 1, step: 0.01, format: pct }),
          slider('music', SETTINGS.music, { min: 0, max: 1, step: 0.01, format: pct }),
          slider('sfx', SETTINGS.sfx, { min: 0, max: 1, step: 0.01, format: pct }))));
    parent.classList.add('has-settings');
    parent.append(panel);
    sfx('ui.open');
    requestAnimationFrame(() => {
      panel.classList.add('is-in');
      panel.querySelector('.set-range')?.focus({ preventScroll: true });
    });
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      sfx('ui.close');
      parent.classList.remove('has-settings');
      panel.classList.add('is-leaving');
      setTimeout(() => panel.remove(), 260);
      onBack?.();
    }
    return {
      close,
      keydown(e) {
        if (e.code === 'Escape') {
          e.preventDefault();
          close();
        }
      },
    };
  }

  return { open };
}

export function createPause(root, ctx, { stack, sfx, settings }) {
  let current = null;

  function controlsList() {
    const label = (code) => ctx.input?.label?.(code) || code;
    return h('ul.controls', null, CONTROLS.map(({ keys, label: text }) =>
      h('li', null, h('span.controls-keys', null, keys.map((k) => keycap(label(k)))), h('span.controls-label', { text: typo(text) }))));
  }

  function open() {
    if (current) return;
    const prevMode = ctx.state?.mode;
    ctx.state?.setMode?.('paused');
    ctx.input?.exitLock?.();
    let sub = null;
    let confirming = false;
    const menu = h('nav.pause-menu');
    const beacons = ctx.state?.beacons || {};
    const lit = RING_ORDER.filter((id) => beacons[id] === 'active').length;
    const traces = ctx.state?.traces?.size ?? 0;

    const el = h('div.pause.layer', { role: 'dialog', 'aria-label': PAUSE.title },
      h('div.pause-scrim'),
      h('div.pause-grid', null,
        h('div.pause-main', null,
          h('div.pause-kicker', { text: `${PAUSE.stage} ${lit}/5 · Traces ${traces}` }),
          h('h2.pause-title', { text: PAUSE.title }),
          menu),
        h('aside.pause-side', null, h('h3.pause-side-title', { text: PAUSE.controls }), controlsList())));

    const item = (label, onClick, extra = '') => h(`button.menu-item${extra}`, {
      type: 'button',
      onclick: () => {
        sfx('ui.click');
        onClick();
      },
      onmouseenter: (e) => {
        e.currentTarget.focus({ preventScroll: true });
        sfx('ui.hover');
      },
    }, h('span.menu-item-label', { text: typo(label) }), h('span.menu-item-rule'));

    function renderMenu() {
      confirming = false;
      menu.replaceChildren(
        item(PAUSE.resume, resume),
        item(PAUSE.settings, () => {
          sub = settings.open(el, () => {
            sub = null;
            menu.querySelector('button')?.focus({ preventScroll: true });
          });
        }),
        item(PAUSE.restart, renderConfirm, '.is-danger'));
    }

    function renderConfirm() {
      confirming = true;
      menu.replaceChildren(
        h('p.pause-confirm', { text: typo(PAUSE.confirm) }),
        h('div.pause-confirm-row', null,
          h('button.btn.btn--danger', { type: 'button', onclick: restart, onmouseenter: () => sfx('ui.hover') }, PAUSE.confirmYes),
          h('button.btn.btn--ghost', { type: 'button', onclick: () => { sfx('ui.click'); renderMenu(); }, onmouseenter: () => sfx('ui.hover') }, PAUSE.confirmNo)));
      menu.querySelector('.btn--ghost').focus({ preventScroll: true });
    }

    function restart() {
      sfx('ui.click');
      ctx.state?.reset?.();
      window.location.reload();
    }

    function close() {
      if (!current) return;
      current = null;
      stack.remove(layer);
      sfx('ui.close');
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 300);
    }

    function resume() {
      close();
      ctx.state?.setMode?.(prevMode && prevMode !== 'paused' ? prevMode : 'playing');
      ctx.input?.requestLock?.();
    }

    const layer = {
      el,
      keydown(e) {
        if (sub) {
          sub.keydown(e);
          return;
        }
        if (e.code === 'Escape') {
          e.preventDefault();
          if (confirming) renderMenu();
          else resume();
        } else if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
          e.preventDefault();
          const buttons = [...menu.querySelectorAll('button')];
          const i = buttons.indexOf(document.activeElement);
          const d = e.code === 'ArrowDown' ? 1 : -1;
          buttons[(i + d + buttons.length) % buttons.length]?.focus({ preventScroll: true });
        } else if (e.code === 'Tab') {
          e.preventDefault();
        }
      },
    };
    current = { close, resume };
    renderMenu();
    stack.push(layer);
    root.append(el);
    sfx('ui.open');
    requestAnimationFrame(() => {
      el.classList.add('is-in');
      menu.querySelector('button')?.focus({ preventScroll: true });
    });
  }

  return {
    open,
    resume: () => current?.resume(),
    get isOpen() { return Boolean(current); },
  };
}
