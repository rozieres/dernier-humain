import { h, svg, typo, sleep } from './dom.js';
import { REPLY, CREDITS, TITLE } from './strings.js';

const MAX_REPLY = 600;
const HOLD_MS = 1500;

export function createReply(root, ctx, { stack, sfx }) {
  function open({ prompt = '', placeholder = '', note = '' } = {}) {
    ctx.input?.exitLock?.();
    return new Promise((resolve) => {
      const area = h('textarea.reply-area', { maxlength: MAX_REPLY, placeholder: typo(placeholder), rows: 6, spellcheck: 'false', 'aria-label': prompt });
      const count = h('span.reply-count', { text: `0 / ${MAX_REPLY}` });
      const send = h('button.btn.btn--send', { type: 'button', disabled: true, onmouseenter: () => sfx('ui.hover') }, REPLY.send);
      const nothing = h('button.reply-nothing', { type: 'button' }, REPLY.nothing);
      const el = h('div.reply.layer', { role: 'dialog', 'aria-label': prompt },
        h('div.reply-scrim'),
        h('div.reply-sheet', null,
          h('div.reply-to', { text: REPLY.to }),
          h('h2.reply-prompt', { text: typo(prompt) }),
          h('div.reply-lines', null, area),
          h('div.reply-meta', null, count, h('span.reply-kbd', { text: REPLY.hint })),
          note ? h('p.reply-note', { text: typo(note) }) : null,
          h('div.reply-actions', null, nothing, send)));

      const update = () => {
        const len = area.value.length;
        count.textContent = `${len} / ${MAX_REPLY}`;
        count.classList.toggle('is-near', len > MAX_REPLY - 60);
        send.disabled = area.value.trim().length === 0;
      };
      area.addEventListener('input', update);
      area.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
          e.preventDefault();
          if (!send.disabled) finish(area.value.trim());
        }
      });
      send.addEventListener('click', () => finish(area.value.trim()));
      nothing.addEventListener('click', () => finish(''));

      let done = false;
      function finish(text) {
        if (done) return;
        done = true;
        sfx('ui.click');
        stack.remove(layer);
        area.disabled = true;
        el.classList.add('is-sent');
        setTimeout(() => {
          el.classList.add('is-leaving');
          setTimeout(() => el.remove(), 1200);
        }, 500);
        resolve(text.slice(0, MAX_REPLY));
      }

      const layer = {
        el,
        keydown(e) {
          if (e.code === 'Tab' && e.target === area) {
            e.preventDefault();
            area.setRangeText('\t', area.selectionStart, area.selectionEnd, 'end');
          }
        },
      };
      stack.push(layer);
      root.append(el);
      sfx('page');
      requestAnimationFrame(() => {
        el.classList.add('is-in');
        setTimeout(() => area.focus({ preventScroll: true }), 400);
      });
    });
  }

  return { open };
}

export function createCredits(root, ctx, { stack, sfx, reduceFx }) {
  function play(lines = []) {
    return new Promise((resolve) => {
      const column = h('div.credits-column');
      const holdRing = h('div.credits-hold', null,
        svg('<svg viewBox="0 0 20 20" aria-hidden="true"><circle class="hold-track" cx="10" cy="10" r="8"/><circle class="hold-fill" cx="10" cy="10" r="8" pathLength="1"/></svg>'),
        h('span', { text: CREDITS.hold }));
      const end = h('div.credits-end');
      const el = h('div.credits.layer', null, column, end, holdRing);

      let skipped = false;
      let skipResolve;
      const skipP = new Promise((r) => { skipResolve = r; });
      const wait = (ms) => Promise.race([sleep(reduceFx() ? ms * 0.6 : ms), skipP]);

      let holdStart = 0;
      let holdRaf = 0;
      const holdFill = () => holdRing.querySelector('.hold-fill');
      function holdTick() {
        const t = Math.min(1, (performance.now() - holdStart) / HOLD_MS);
        holdFill().style.strokeDashoffset = String(1 - t);
        if (t >= 1) {
          releaseHold();
          skip();
          return;
        }
        holdRaf = requestAnimationFrame(holdTick);
      }
      function pressHold() {
        if (skipped || holdStart) return;
        holdStart = performance.now();
        holdRing.classList.add('is-holding');
        holdRaf = requestAnimationFrame(holdTick);
      }
      function releaseHold() {
        holdStart = 0;
        cancelAnimationFrame(holdRaf);
        holdRing.classList.remove('is-holding');
        holdFill().style.strokeDashoffset = '1';
      }

      const layer = {
        el,
        keydown(e) {
          if (e.target instanceof HTMLButtonElement && (e.code === 'Enter' || e.code === 'Space')) return;
          e.preventDefault();
          if (!e.repeat) pressHold();
        },
        keyup: () => releaseHold(),
      };
      el.addEventListener('pointerdown', (e) => {
        if (!(e.target instanceof HTMLButtonElement)) pressHold();
      });
      el.addEventListener('pointerup', releaseHold);

      function add(text, style) {
        const node = h(`div.credit.credit--${style}`, { text: typo(text) });
        column.append(node);
        requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('is-in')));
        return node;
      }

      async function clear() {
        if (!column.children.length) return;
        for (const node of column.children) node.classList.add('is-out');
        await wait(1400);
        column.replaceChildren();
      }

      function playerText(line) {
        const own = line.text && line.text.trim();
        if (own) return own;
        const list = ctx.state?.playerMessages || [];
        const last = list[list.length - 1]?.text?.trim();
        return last || CREDITS.empty;
      }

      async function sequence() {
        await wait(1800);
        for (const line of lines) {
          if (skipped) return;
          const style = line.style || 'line';
          if (style === 'gap') {
            await clear();
            await wait(900);
          } else if (style === 'player') {
            await clear();
            const node = add(playerText(line), 'player');
            if (node.textContent.length > 220) node.classList.add('is-long');
            await wait(7000);
            await clear();
          } else if (style === 'title') {
            await clear();
            add(line.text || TITLE, 'title');
            await wait(3200);
          } else if (style === 'final') {
            add(line.text, 'final');
            await wait(3600);
          } else {
            add(line.text, style);
            await wait(style === 'small' ? 2000 : 2400 + String(line.text).length * 35);
          }
        }
      }

      function showEnd() {
        holdRing.classList.add('is-gone');
        const finish = (id) => {
          sfx('ui.click');
          stack.remove(layer);
          el.classList.add('is-leaving');
          setTimeout(() => el.remove(), 1200);
          resolve(id);
        };
        end.replaceChildren(
          h('button.btn.btn--ghost', { type: 'button', onclick: () => finish('continue'), onmouseenter: () => sfx('ui.hover') }, CREDITS.explore),
          h('button.btn.btn--ghost', { type: 'button', onclick: () => finish('restart'), onmouseenter: () => sfx('ui.hover') }, CREDITS.restart));
        end.classList.add('is-in');
        setTimeout(() => end.querySelector('button')?.focus({ preventScroll: true }), 600);
      }

      function skip() {
        if (skipped) return;
        skipped = true;
        skipResolve();
        column.replaceChildren();
        const title = lines.find((l) => l.style === 'title');
        const fin = lines.find((l) => l.style === 'final');
        add(title?.text || TITLE, 'title');
        if (fin) add(fin.text, 'final');
        showEnd();
      }

      stack.push(layer);
      root.append(el);
      ctx.input?.exitLock?.();
      requestAnimationFrame(() => el.classList.add('is-in'));
      sequence().then(async () => {
        if (skipped) return;
        await sleep(1200);
        if (!skipped) {
          skipped = true;
          showEnd();
        }
      });
    });
  }

  return { play };
}
