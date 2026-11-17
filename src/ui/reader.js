import { h, typo, sleep, clamp, hashString, keycap, percent } from './dom.js';
import { icon } from './icons.js';
import { READER, HUD } from './strings.js';

const CLOSE_KEYS = new Set(['KeyE', 'Enter', 'NumpadEnter']);

function compact(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',')} M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)} k`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace('.', ',')} k`;
  return String(n);
}

function paragraphs(body, tag = 'p', curly = true) {
  return (Array.isArray(body) ? body : [body]).filter(Boolean).map((line) => h(tag, { text: typo(line, { curly }) }));
}

function handleOf(doc) {
  const base = String(doc.author || doc.site || 'contenu').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return `@${base.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 18) || 'contenu'}`;
}

function skinSynthetic(doc) {
  const seed = hashString(doc.id || doc.title || doc.author || 'x');
  const n = (shift, max) => ((seed >>> shift) % max) + Math.floor(max / 9);
  const hue = seed % 360;
  return h('article.doc.doc--synthetic', null,
    h('header.syn-head', null,
      h('div.syn-avatar', { style: { '--h1': `${hue}`, '--h2': `${(hue + 70) % 360}` } }),
      h('div.syn-who', null,
        h('div.syn-name', null, h('span', { text: doc.author || doc.site }), icon('verified')),
        h('div.syn-handle', { text: `${handleOf(doc)} · ${doc.date || 'à l’instant'}` })),
      h('span.syn-more', null, icon('more'))),
    doc.title ? h('h2.syn-title', { text: typo(doc.title) }) : null,
    h('div.syn-body', null, paragraphs(doc.body)),
    h('div.syn-media', { style: { '--h1': `${(hue + 180) % 360}`, '--h2': `${(hue + 250) % 360}` } },
      h('span.syn-media-tag', { text: 'Image générée · 4K' })),
    h('footer.syn-stats', null,
      h('span', null, icon('comment'), compact(n(3, 4200))),
      h('span', null, icon('repost'), compact(n(7, 19000))),
      h('span.is-liked', null, icon('heart'), compact(n(11, 480000))),
      h('span', null, icon('views'), compact(n(2, 3900000))),
      h('span', null, icon('share'))),
    h('div.syn-site', null, h('span', { text: doc.site || '' }), h('span', { text: READER.sponsored })),
    doc.footer ? h('div.syn-footer', { text: typo(doc.footer) }) : null);
}

function skinHuman(doc) {
  return h('article.doc.doc--human', null,
    h('div.paper', null,
      h('span.paper-tape'),
      h('span.paper-stain'),
      h('header.hum-head', null,
        h('div.hum-site', { text: typo(doc.site || '') }),
        h('div.hum-meta', { text: [doc.author && `par ${doc.author}`, doc.date].filter(Boolean).join(' — ') })),
      doc.title ? h('h2.hum-title', { text: typo(doc.title) }) : null,
      h('div.hum-body', null, paragraphs(doc.body)),
      doc.footer ? h('footer.hum-foot', { text: typo(doc.footer) }) : null));
}

function counterDigits(doc) {
  const text = (doc.body || []).join(' ');
  const m = /n[°o]\s*([\d\s ]{3,})/i.exec(text);
  const digits = m ? m[1].replace(/\D/g, '') : String(hashString(doc.id || 'x') % 99999);
  return digits.padStart(6, '0').slice(-6);
}

function skinOldweb(doc) {
  const site = doc.site || '';
  return h('article.doc.doc--oldweb', null,
    h('div.ow-page', null,
      h('div.ow-marquee', null, h('span', { text: `★ ${site} ★ ${site} ★ ${site} ★` })),
      h('h1.ow-title', { text: typo(site) }),
      h('div.ow-construction', null, h('span.ow-stripe'), h('span', { text: READER.construction }), h('span.ow-stripe')),
      doc.title ? h('h2.ow-subtitle', { text: typo(doc.title) }) : null,
      h('p.ow-meta', { text: [doc.author, doc.date].filter(Boolean).join(' · ') }),
      h('div.ow-hr'),
      h('div.ow-body', null, paragraphs(doc.body, 'p', false)),
      doc.footer ? h('p.ow-foot', { text: typo(doc.footer) }) : null,
      h('div.ow-hr'),
      h('div.ow-counter', null,
        h('span', { text: READER.visitors }),
        h('span.ow-digits', null, [...counterDigits(doc)].map((d) => h('span', { text: d })))),
      h('div.ow-links', null,
        h('span.ow-link', null, icon('pen'), READER.guestbook),
        h('span.ow-link', { text: '[ Mes liens ]' }),
        h('span.ow-link', { text: '[ Mon chat ]' })),
      h('p.ow-best', { text: READER.bestViewed })));
}

function skinTerminal(doc) {
  const lines = [
    h('div.term-sys', { text: `${(doc.site || 'TERMINAL').toUpperCase()} — connexion 2400 bauds` }),
    h('div.term-sys', { text: `${doc.url || ''}` }),
    h('div.term-rule'),
    doc.title ? h('div.term-line', { text: typo(`SUJET : ${doc.title}`, { curly: false }) }) : null,
    h('div.term-line.term-dim', { text: typo([`DE : ${doc.author || 'inconnu'}`, doc.date].filter(Boolean).join(' · '), { curly: false }) }),
    h('div.term-rule'),
    ...paragraphs(doc.body, 'div.term-p', false),
    doc.footer ? h('div.term-line.term-dim', { text: typo(doc.footer) }) : null,
    h('div.term-line', null, '> ', h('span.term-caret')),
  ];
  return h('article.doc.doc--terminal', null,
    h('div.crt', null, h('div.crt-inner', null, lines), h('div.crt-scan'), h('div.crt-glare')));
}

function skinNote(doc) {
  return h('article.doc.doc--note', null,
    h('div.note-paper', null,
      h('div.note-body', null, paragraphs(doc.body)),
      doc.author ? h('div.note-sign', { text: `— ${doc.author}` }) : null));
}

function skinFinal(doc) {
  const m = /^([a-z]+:\/\/)?(.*)$/i.exec(doc.url || '');
  return h('article.doc.doc--final', null,
    h('div.f-window', null,
      h('div.f-chrome', null,
        h('div.f-nav', null, icon('back'), icon('forward'), icon('reload')),
        h('div.f-addr', null,
          h('span.f-insecure', null, icon('warning'), h('span', { text: HUD.notSecure })),
          h('span.f-sep'),
          h('span.f-url', null, h('span.f-scheme', { text: m[1] || 'http://' }), h('span', { text: m[2] || '' })))),
      h('div.f-page', null,
        h('h1', { text: typo(doc.site || doc.title || '') }),
        doc.date ? h('p', null, h('b', { text: doc.date })) : null,
        ...paragraphs(doc.body, 'p', false),
        doc.author ? h('p', { text: doc.author }) : null,
        h('hr'),
        h('p', null, h('a', { text: READER.archives }), ' | ', h('a', { text: READER.top })),
        h('address', { text: typo(`${READER.lastUpdate} : ${doc.date || ''}`) }))));
}

const SKINS = {
  synthetic: skinSynthetic,
  human: skinHuman,
  oldweb: skinOldweb,
  terminal: skinTerminal,
  note: skinNote,
  final: skinFinal,
};

function gaugeColor(v) {
  const t = clamp((v - 0.3) / 0.4);
  const a = [92, 225, 230];
  const b = [255, 180, 84];
  return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * t)).join(',')})`;
}

function buildReadout(doc, alive) {
  const analysis = doc.analysis || {};
  const known = typeof analysis.human === 'number';
  const value = known ? clamp(analysis.human) : 0;
  const valueEl = h('span.scan-value', { text: known ? percent(0) : READER.undetermined });
  const bar = h('i.scan-bar-fill');
  const notes = h('ol.scan-notes');
  const el = h(`aside.scan${known ? '' : '.is-unknown'}`, { style: { '--gauge': known ? gaugeColor(value) : '#f2efe8' } },
    h('div.scan-head', null, icon('scan'), h('span', { text: READER.analysis }), h('span.scan-id', { text: `#${(hashString(doc.id || doc.url || '') % 0xffff).toString(16).padStart(4, '0')}` })),
    h('div.scan-gauge', null,
      h('div.scan-gauge-row', null, h('span.scan-gauge-label', { text: READER.humanOrigin }), valueEl),
      h('div.scan-bar', null, bar, h('span.scan-bar-ticks'))),
    h('div.scan-scale', null, h('span', { text: 'synthétique' }), h('span', { text: 'humain' })),
    analysis.verdict ? h('div.scan-verdict', { text: typo(analysis.verdict) }) : null,
    (analysis.notes || []).length ? h('div.scan-notes-head', { text: READER.notes }) : null,
    notes);

  async function play(sfx, fast) {
    await sleep(fast ? 50 : 260);
    if (known) {
      const t0 = performance.now();
      const dur = fast ? 1 : 900;
      while (alive()) {
        const t = clamp((performance.now() - t0) / dur);
        const e = 1 - Math.pow(1 - t, 3);
        bar.style.transform = `scaleX(${(value * e).toFixed(4)})`;
        valueEl.textContent = percent(value * e);
        if (t >= 1) break;
        await new Promise((r) => requestAnimationFrame(r));
      }
    } else {
      bar.style.transform = 'scaleX(1)';
      if (!fast) await sleep(500);
    }
    for (const note of analysis.notes || []) {
      if (!alive()) return;
      const li = h('li', null, h('span.scan-note-text'));
      notes.append(li);
      const span = li.firstChild;
      const text = typo(note);
      if (fast) {
        span.textContent = text;
        continue;
      }
      li.classList.add('is-typing');
      for (let i = 1; i <= text.length; i++) {
        if (!alive()) return;
        span.textContent = text.slice(0, i);
        if (i % 4 === 0) sfx('ui.type', { volume: 0.35 });
        await sleep(16);
      }
      li.classList.remove('is-typing');
      await sleep(180);
    }
  }

  return { el, play };
}

export function createReader(root, ctx, { stack, sfx, reduceFx }) {
  let current = null;

  function open(doc) {
    if (current) current.close(null);
    if (!doc) return Promise.resolve(null);
    return new Promise((resolve) => {
      const kind = SKINS[doc.kind] ? doc.kind : 'human';
      const prevMode = ctx.state?.mode;
      if (prevMode !== 'reading') ctx.state?.setMode?.('reading');
      ctx.input?.exitLock?.();

      let alive = true;
      const armed = new Set();
      const skin = SKINS[kind](doc);
      const scroller = h('div.reader-scroll', { tabindex: '-1' }, skin);
      const readout = buildReadout(doc, () => alive);
      const urlLine = kind === 'final' || !doc.url ? null : h(`div.reader-url${doc.secure === false ? '.is-insecure' : ''}`, null,
        doc.secure === false ? icon('warning') : icon('lock'),
        doc.secure === false ? h('span.reader-url-warn', { text: HUD.notSecure }) : null,
        h('span', { text: doc.url || '' }));
      const actionsBar = h('div.reader-actions');
      for (const action of doc.actions || []) {
        actionsBar.append(h('button.btn.btn--action', {
          type: 'button',
          onclick: () => close(action.id),
          onmouseenter: () => sfx('ui.hover'),
        }, typo(action.label)));
      }
      const closeBtn = h('button.btn.btn--ghost', { type: 'button', onclick: () => close(null), onmouseenter: () => sfx('ui.hover') },
        keycap(ctx.input?.label?.('KeyE') || 'E'), h('span', { text: READER.close }));
      actionsBar.append(closeBtn);
      const more = h('div.reader-more', null, h('span', { text: READER.scroll }), h('span.reader-more-arrow'));
      const frame = h('div.reader-frame', null, scroller, more);
      const docCol = h('div.reader-doc', null, urlLine, frame);
      const el = h(`div.reader.layer.reader--${kind}`, { role: 'dialog', 'aria-label': doc.title || doc.site || 'Document' },
        h('div.reader-scrim'),
        h('div.reader-stage', null, docCol, h('div.reader-side', null, readout.el, actionsBar)));

      function updateMore() {
        const rest = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
        more.classList.toggle('is-on', rest > 8);
        frame.classList.toggle('has-more', rest > 8);
      }
      scroller.addEventListener('scroll', updateMore, { passive: true });

      function close(result) {
        if (!alive) return;
        alive = false;
        stack.remove(layer);
        if (current === entry) current = null;
        sfx('ui.close');
        el.classList.add('is-leaving');
        setTimeout(() => el.remove(), 320);
        if (prevMode && prevMode !== 'reading') ctx.state?.setMode?.(prevMode);
        if (prevMode === 'playing') ctx.input?.requestLock?.();
        resolve(result ?? null);
      }

      const layer = {
        el,
        keydown(e) {
          if (e.code === 'Escape') {
            e.preventDefault();
            close(null);
          } else if (CLOSE_KEYS.has(e.code)) {
            if (e.target instanceof HTMLButtonElement) return;
            e.preventDefault();
            armed.add(e.code);
          } else if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Space', 'Home', 'End'].includes(e.code)) {
            e.preventDefault();
            const page = scroller.clientHeight * 0.85;
            const d = { ArrowDown: 60, ArrowUp: -60, PageDown: page, Space: page, PageUp: -page, Home: -1e6, End: 1e6 }[e.code];
            scroller.scrollBy({ top: d, behavior: reduceFx() ? 'auto' : 'smooth' });
          } else if (e.code === 'Tab') {
            e.preventDefault();
          }
        },
        keyup(e) {
          if (armed.has(e.code)) close(null);
        },
      };
      const entry = { close };
      current = entry;
      stack.push(layer);
      root.append(el);
      sfx('ui.open');
      if (kind === 'human' || kind === 'note' || kind === 'final') sfx('page');
      requestAnimationFrame(() => {
        el.classList.add('is-in');
        updateMore();
        scroller.focus({ preventScroll: true });
      });
      readout.play(sfx, reduceFx());
    });
  }

  return {
    open,
    get isOpen() { return Boolean(current); },
    close() { current?.close(null); },
  };
}
