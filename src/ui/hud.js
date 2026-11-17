import { h, svg, typo, clamp, keycap, percent } from './dom.js';
import { icon, hasIcon } from './icons.js';
import { createSignalMeter } from './signal.js';
import { createMarkers } from './markers.js';
import { HUD, RING_ORDER, ZONES } from './strings.js';

const RING = { cx: 60, cy: 60, R: 54, r: 41, gap: 7 };

function polar(radius, deg) {
  const a = (deg * Math.PI) / 180;
  return `${(RING.cx + radius * Math.cos(a)).toFixed(2)} ${(RING.cy + radius * Math.sin(a)).toFixed(2)}`;
}

function sectorPath(a0, a1) {
  const { R, r } = RING;
  return `M${polar(R, a0)} A${R} ${R} 0 0 1 ${polar(R, a1)} L${polar(r, a1)} A${r} ${r} 0 0 0 ${polar(r, a0)} Z`;
}

function ringSvg() {
  const parts = RING_ORDER.map((id, i) => {
    const mid = -90 + i * 72;
    const a0 = mid - 36 + RING.gap / 2;
    const a1 = mid + 36 - RING.gap / 2;
    return `<path class="ring-seg" data-zone="${id}" d="${sectorPath(a0, a1)}"/>`;
  });
  const ticks = RING_ORDER.map((id, i) => {
    const [x, y] = polar(RING.R + 5.5, -90 + i * 72).split(' ');
    return `<circle class="ring-tick" data-zone="${id}" cx="${x}" cy="${y}" r="1.3"/>`;
  });
  return `<svg class="ring-svg" viewBox="-4 -4 128 128" aria-hidden="true">
    <circle class="ring-guide" cx="60" cy="60" r="${RING.r - 6}"/>
    ${parts.join('')}${ticks.join('')}</svg>`;
}

function eyeSvg() {
  const almond = 'M4 20 C 28 2, 92 2, 116 20 C 92 38, 28 38, 4 20 Z';
  return `<svg class="index-svg" viewBox="0 0 120 40" aria-hidden="true">
    <defs><clipPath id="ui-eye-clip"><path d="${almond}"/></clipPath></defs>
    <g clip-path="url(#ui-eye-clip)">
      <rect class="index-bg" x="0" y="0" width="120" height="40"/>
      <rect class="index-fill" x="0" y="0" width="120" height="40"/>
    </g>
    <path class="index-outline" d="${almond}"/>
    <circle class="index-iris" cx="60" cy="20" r="9"/>
    <circle class="index-pupil" cx="60" cy="20" r="3.4"/>
  </svg>`;
}

export function createHud(root, ctx, { sfx, reduceFx }) {
  const hudEl = h('div.hud');
  const markerLayer = h('div.markers');

  const objective = h('div.hud-objective', null, h('span.hud-label', { text: HUD.objective }), h('span.hud-objective-text'));
  const objectiveText = objective.querySelector('.hud-objective-text');

  const address = h('div.address');
  const addressNav = h('div.address-nav', null, icon('back'), icon('forward'), icon('reload'));
  const addressBar = h('div.address-bar');
  const addressSecurity = h('span.address-security');
  const addressUrl = h('span.address-url');
  const addressStatus = h('span.address-status');
  addressBar.append(addressSecurity, addressUrl, addressStatus);
  address.append(addressNav, addressBar);

  const index = h('div.index', null, svg(eyeSvg()), h('div.index-label', null, h('span', { text: HUD.indexation }), h('span.index-value')));
  const indexValue = index.querySelector('.index-value');
  const indexFill = index.querySelector('.index-fill');

  const center = h('div.hud-center');
  const reticle = h('div.reticle', { dataset: { kind: 'default' } },
    h('span.ret-dot'), h('span.ret-ring'),
    h('span.ret-br.ret-br--l'), h('span.ret-br.ret-br--r'),
    svg('<svg class="ret-pointer" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5v15l4-3.6 2.6 5.6 2.4-1.1-2.6-5.5 5.3-.4Z"/></svg>'));
  const prompt = h('div.prompt');
  center.append(reticle, prompt);

  const signal = h('div.signal', null,
    h('div.signal-head', null, h('span.hud-label', { text: HUD.signal }), h('span.signal-value')),
    h('canvas.signal-canvas'));
  const signalValue = signal.querySelector('.signal-value');
  const meter = createSignalMeter(signal.querySelector('canvas'), { reduce: reduceFx });

  const ring = h('div.ring', null,
    svg(ringSvg()),
    h('div.ring-center', null,
      h('span.ring-count', null, h('span.ring-found', { text: '0' }), h('span.ring-total', { text: '/18' })),
      h('span.ring-label', { text: HUD.traces })),
    h('div.ring-caption', { text: HUD.ring }));
  const ringFound = ring.querySelector('.ring-found');
  const ringTotal = ring.querySelector('.ring-total');

  const hintSlot = h('div.hint-slot');

  hudEl.append(markerLayer, objective, address, index, center, signal, ring);

  const toasts = h('div.toasts');
  const zoneCard = h('div.zonecard');
  const subtitles = h('div.subtitles');
  root.append(hudEl, zoneCard, h('div.bottom-stack', null, hintSlot, subtitles), toasts);

  const markers = createMarkers(markerLayer, ctx);

  let hudVisible = true;
  function setVisible(v) {
    hudVisible = Boolean(v);
    hudEl.classList.toggle('is-hidden', !hudVisible);
  }

  function setObjective(text) {
    if (!text) {
      objective.classList.remove('is-on');
      return;
    }
    const changed = objectiveText.textContent !== typo(text);
    objectiveText.textContent = typo(text);
    objective.classList.add('is-on');
    if (changed) {
      objective.classList.remove('is-new');
      void objective.offsetWidth;
      objective.classList.add('is-new');
    }
  }

  function setAddress({ url = '', secure = true, status } = {}) {
    const m = /^([a-z]+:\/\/)?([^/?#]*)(.*)$/i.exec(url) || [];
    addressSecurity.replaceChildren(secure ? icon('lock') : icon('warning'));
    if (!secure) addressSecurity.append(h('span.address-warn', { text: HUD.notSecure }));
    addressUrl.replaceChildren(
      h('span.url-scheme', { text: m[1] || '' }),
      h('span.url-host', { text: m[2] || '' }),
      h('span.url-path', { text: m[3] || '' }));
    address.classList.toggle('is-insecure', !secure);
    address.classList.add('is-on');
    if (status) {
      const s = String(status);
      const kind = /^[45]\d\d/.test(s) ? 'error' : /charg/i.test(s) ? 'loading' : 'ok';
      addressStatus.dataset.kind = kind;
      addressStatus.replaceChildren(h('span.status-dot'), h('span', { text: s }));
      addressStatus.hidden = false;
    } else {
      addressStatus.hidden = true;
    }
    address.classList.remove('is-pulse');
    void address.offsetWidth;
    address.classList.add('is-pulse');
  }

  function setSignal(value) {
    const v = clamp(Number(value) || 0);
    meter.set(v);
    signal.classList.toggle('is-live', v > 0);
    signalValue.textContent = v > 0 ? percent(v) : HUD.signalNone;
  }

  function setIndexation(value) {
    if (value == null) {
      index.classList.remove('is-on');
      return;
    }
    const v = clamp(Number(value) || 0);
    index.classList.add('is-on');
    index.classList.toggle('is-high', v >= 0.75);
    index.classList.toggle('is-full', v >= 1);
    indexFill.setAttribute('width', (v * 120).toFixed(1));
    indexValue.textContent = v >= 1 ? HUD.indexed : percent(v);
  }

  function setReticle(kind = 'default') {
    reticle.dataset.kind = kind || 'default';
  }

  function setPrompt(keyLabel, text = '') {
    if (keyLabel == null) {
      prompt.classList.remove('is-on');
      return;
    }
    prompt.replaceChildren(keycap(String(keyLabel)), h('span.prompt-text', { text: typo(text) }));
    prompt.classList.add('is-on');
  }

  let currentSub = null;
  function subtitle({ speaker, text, duration } = {}) {
    if (currentSub) currentSub.finish();
    const secs = duration ?? clamp(1.8 + String(text || '').length * 0.06, 2.4, 9);
    const show = ctx.state?.settings?.subtitles !== false;
    return new Promise((resolve) => {
      const el = h('div.subtitle', null,
        speaker ? h(`span.sub-speaker${/tiret/i.test(speaker) ? '.is-tiret' : ''}`, { text: speaker }) : null,
        h('span.sub-text', { text: typo(text) }));
      if (show) subtitles.append(el);
      requestAnimationFrame(() => el.classList.add('is-in'));
      let done = false;
      const entry = {
        finish() {
          if (done) return;
          done = true;
          clearTimeout(timer);
          el.classList.remove('is-in');
          el.classList.add('is-out');
          setTimeout(() => el.remove(), 350);
          if (currentSub === entry) currentSub = null;
          resolve();
        },
      };
      const timer = setTimeout(() => entry.finish(), secs * 1000);
      currentSub = entry;
    });
  }

  function toast(text, { icon: iconName, duration = 4 } = {}) {
    const el = h('div.toast', null,
      h('span.toast-icon', null, iconName && hasIcon(iconName) ? icon(iconName) : h('span.toast-dot')),
      h('span.toast-text', { text: typo(text) }));
    toasts.append(el);
    while (toasts.children.length > 4) toasts.firstElementChild.remove();
    requestAnimationFrame(() => el.classList.add('is-in'));
    setTimeout(() => {
      el.classList.remove('is-in');
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 450);
    }, duration * 1000);
  }

  let zoneTimer = 0;
  function showZoneCard({ name, tagline } = {}) {
    clearTimeout(zoneTimer);
    zoneCard.replaceChildren(
      h('div.zonecard-rule'),
      h('div.zonecard-name', { text: typo(name) }),
      tagline ? h('div.zonecard-tagline', { text: typo(tagline) }) : null);
    zoneCard.classList.remove('is-playing');
    void zoneCard.offsetWidth;
    zoneCard.classList.add('is-playing');
    zoneTimer = setTimeout(() => zoneCard.classList.remove('is-playing'), 4200);
  }

  let hintTimer = 0;
  function hint(keys = [], text = '', duration = 6) {
    clearTimeout(hintTimer);
    const caps = [];
    keys.forEach((k, i) => {
      if (i) caps.push(h('span.hint-sep'));
      caps.push(keycap(String(k)));
    });
    const el = h('div.hint', null, h('span.hint-keys', null, caps), h('span.hint-text', { text: typo(text) }));
    const old = hintSlot.firstElementChild;
    if (old) {
      old.classList.remove('is-in');
      setTimeout(() => old.remove(), 300);
    }
    hintSlot.append(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    hintTimer = setTimeout(() => {
      el.classList.remove('is-in');
      setTimeout(() => el.remove(), 400);
    }, duration * 1000);
  }

  function refreshRing() {
    const beacons = ctx.state?.beacons || {};
    for (const id of RING_ORDER) {
      const status = beacons[id] || 'locked';
      for (const el of ring.querySelectorAll(`[data-zone="${id}"]`)) el.dataset.status = status;
    }
    const traces = ctx.state?.traces;
    const found = traces?.size ?? 0;
    ringFound.textContent = String(found);
    const total = ctx.has?.('traces') && ctx.traces.total ? ctx.traces.total : 18;
    ringTotal.textContent = `/${total}`;
  }

  function setTraceCount(found, total) {
    ringFound.textContent = String(found);
    if (total) ringTotal.textContent = `/${total}`;
    ring.classList.remove('is-bump');
    void ring.offsetWidth;
    ring.classList.add('is-bump');
  }

  setAddress({ url: 'https://accueil.web/', secure: true });
  address.classList.remove('is-on');
  setSignal(0);
  setReticle('default');

  return {
    el: hudEl,
    markers,
    zoneNames: ZONES,
    setVisible,
    get visible() { return hudVisible; },
    setObjective,
    setAddress,
    setSignal,
    setIndexation,
    setReticle,
    setPrompt,
    subtitle,
    toast,
    showZoneCard,
    hint,
    refreshRing,
    setTraceCount,
    frame(dt) {
      if (!hudVisible) return;
      meter.frame(dt);
      markers.frame(dt);
    },
  };
}
