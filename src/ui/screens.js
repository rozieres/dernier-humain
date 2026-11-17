import { h, typo, sleep, clamp, keycap } from './dom.js';
import { TITLE_WORDS, SUBTITLE, MENU, LOADING_CAPTIONS, LOADING_DONE, TITLE_HINTS, INTRO, TITLE } from './strings.js';

export function createLoading(root) {
  let el = null;
  let fill = null;
  let caption = null;
  let pct = null;
  let timer = 0;
  let captionIndex = 0;
  let explicitLabel = false;
  let done = false;

  function setCaption(text) {
    const span = h('span.loading-caption-line', { text: typo(text) });
    const old = caption.firstElementChild;
    if (old) {
      old.classList.add('is-out');
      setTimeout(() => old.remove(), 500);
    }
    caption.append(span);
    requestAnimationFrame(() => span.classList.add('is-in'));
  }

  function build() {
    fill = h('i.loading-fill');
    caption = h('div.loading-caption');
    pct = h('span.loading-pct', { text: '00' });
    el = h('div.loading.layer', { 'aria-busy': 'true' },
      h('div.loading-center', null,
        h('div.loading-title', { text: TITLE }),
        h('div.loading-bar', null, fill),
        h('div.loading-row', null, caption, pct)));
    root.append(el);
    document.getElementById('boot-loader')?.remove();
    setCaption(LOADING_CAPTIONS[0]);
    timer = setInterval(() => {
      if (explicitLabel) return;
      captionIndex = (captionIndex + 1) % LOADING_CAPTIONS.length;
      setCaption(LOADING_CAPTIONS[captionIndex]);
    }, 2400);
    requestAnimationFrame(() => el.classList.add('is-in'));
  }

  return function loading(progress = 0, label) {
    if (done) return;
    if (!el) build();
    const p = clamp(Number(progress) || 0);
    fill.style.transform = `scaleX(${p.toFixed(4)})`;
    pct.textContent = String(Math.floor(p * 100)).padStart(2, '0');
    if (label) {
      explicitLabel = true;
      if (caption.lastElementChild?.textContent !== typo(label)) setCaption(label);
    }
    if (p >= 1) {
      done = true;
      clearInterval(timer);
      setCaption(LOADING_DONE);
      pct.textContent = '100';
      const node = el;
      setTimeout(() => {
        node.classList.add('is-leaving');
        setTimeout(() => node.remove(), 900);
      }, 650);
    }
  };
}

export function createTitle(root, ctx, { stack, sfx, settings }) {
  function show({ canContinue = false } = {}) {
    ctx.input?.exitLock?.();
    return new Promise((resolve) => {
      let sub = null;
      const items = [];
      const mk = (id, label, index) => {
        const btn = h('button.title-item', {
          type: 'button',
          dataset: { id },
          onmouseenter: () => {
            if (document.activeElement !== btn) btn.focus({ preventScroll: true });
          },
          onfocus: () => sfx('ui.hover'),
          onclick: () => choose(id),
        }, h('span.title-item-index', { text: String(index).padStart(2, '0') }), h('span.title-item-label', { text: label }), h('span.title-item-rule'));
        items.push(btn);
        return btn;
      };
      let n = 1;
      const menu = h('nav.title-menu', null,
        mk('new', MENU.start, n++),
        canContinue ? mk('continue', MENU.continue, n++) : null,
        mk('settings', MENU.settings, n++));

      const hints = TITLE_HINTS.map(({ keys, label }) =>
        h('span.title-hint', null, keys.map((k) => keycap(ctx.input?.label?.(k) || k)), h('span', { text: label })));

      const el = h('div.title.layer', null,
        h('div.title-scrim'),
        h('div.title-block', null,
          h('h1.title-name', null,
            h('span.title-line', { text: TITLE_WORDS[0] }),
            h('span.title-line', null, TITLE_WORDS[1], h('span.title-caret'))),
          h('div.title-sub', { text: SUBTITLE }),
          menu),
        h('footer.title-foot', null,
          h('span.title-privacy', { text: MENU.privacy }),
          h('span.title-hints', null, hints, h('span.title-hint', { text: MENU.headphones }))));

      function choose(id) {
        if (sub) return;
        sfx('ui.click');
        if (id === 'settings') {
          sub = settings.open(el, () => {
            sub = null;
            items.find((b) => b.dataset.id === 'settings')?.focus({ preventScroll: true });
          });
          return;
        }
        ctx.audio?.unlock?.();
        ctx.input?.requestLock?.();
        stack.remove(layer);
        el.classList.add('is-leaving');
        setTimeout(() => el.remove(), 900);
        resolve(id);
      }

      const layer = {
        el,
        keydown(e) {
          if (sub) {
            sub.keydown?.(e);
            return;
          }
          const i = items.indexOf(document.activeElement);
          if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
            e.preventDefault();
            const d = e.code === 'ArrowDown' ? 1 : -1;
            const next = items[(i + d + items.length) % items.length] || items[0];
            next.focus({ preventScroll: true });
          } else if ((e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') && i < 0) {
            e.preventDefault();
            choose(items[0].dataset.id);
          } else if (e.code === 'Tab') {
            e.preventDefault();
          }
        },
      };
      stack.push(layer);
      root.append(el);
      requestAnimationFrame(() => {
        el.classList.add('is-in');
        items[0].focus({ preventScroll: true });
      });
    });
  }

  return { show };
}

export function createIntro(root, ctx, { stack, sfx, reduceFx }) {
  async function play(cards = []) {
    const text = h('div.intro-text');
    const counter = h('div.intro-count');
    const el = h('div.intro.layer', null, h('div.intro-card', null, text), h('div.intro-foot', null, counter, h('span', { text: INTRO.skip })));
    let skip = null;
    const trigger = () => skip?.();
    const layer = {
      el,
      keydown(e) {
        if (e.repeat) return;
        e.preventDefault();
        trigger();
      },
    };
    el.addEventListener('pointerdown', trigger);
    stack.push(layer);
    root.append(el);
    await sleep(30);
    el.classList.add('is-in');
    await sleep(reduceFx() ? 200 : 700);

    for (let c = 0; c < cards.length; c++) {
      const card = typo(cards[c]);
      counter.textContent = `${c + 1} / ${cards.length}`;
      const typed = h('span.intro-typed');
      const caret = h('span.intro-caret');
      const rest = h('span.intro-rest', { text: card });
      text.replaceChildren(typed, caret, rest);
      text.classList.remove('is-out');
      let skipped = false;
      const skipPromise = new Promise((r) => { skip = () => { skipped = true; r(); }; });
      let lastSfx = 0;
      for (let i = 1; i <= card.length && !skipped; i++) {
        typed.textContent = card.slice(0, i);
        rest.textContent = card.slice(i);
        const ch = card[i - 1];
        const now = performance.now();
        if (ch.trim() && now - lastSfx > 55) {
          sfx('ui.type', { volume: 0.6, pitch: 0.9 + Math.random() * 0.2 });
          lastSfx = now;
        }
        const delay = /[.,:;!?—]/.test(ch) ? 190 : ch === ' ' ? 28 : 38;
        await Promise.race([sleep(delay), skipPromise]);
      }
      if (!skipped) {
        rest.textContent = '';
        caret.classList.add('is-idle');
        await Promise.race([sleep(1500 + card.length * 32), skipPromise]);
      }
      skip = null;
      text.classList.add('is-out');
      await sleep(skipped ? 260 : 600);
    }
    stack.remove(layer);
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 1400);
  }

  return { play };
}
