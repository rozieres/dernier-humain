import { h, typo, isObject, keycap } from './dom.js';
import { icon } from './icons.js';
import { JOURNAL, ZONES, RING_ORDER, BEACON_STATUS } from './strings.js';

const MAP_RES = 512;
const WASH = {
  feed: [92, 225, 230],
  farm: [217, 180, 74],
  hallu: [199, 125, 255],
  oldweb: [201, 111, 74],
  forest: [31, 58, 43],
  sand: [226, 180, 122],
};
const PAPER = [242, 236, 222];
const INK = [43, 33, 24];

function zoneList(world) {
  const zones = world?.zones;
  if (!zones) return [];
  return (Array.isArray(zones) ? zones : Object.entries(zones).map(([id, z]) => ({ id, ...z }))).filter((z) => z && z.center);
}

function renderStaticMap(world) {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_RES;
  canvas.height = MAP_RES;
  const c2d = canvas.getContext('2d');
  const img = c2d.createImageData(MAP_RES, MAP_RES);
  const data = img.data;
  const grid = world.GRID;
  const heights = world.heights;
  const res = MAP_RES;
  const hAt = (i, j) => {
    const ix = Math.min(grid - 1, Math.round(((i + 0.5) / res) * (grid - 1)));
    const iz = Math.min(grid - 1, Math.round(((j + 0.5) / res) * (grid - 1)));
    return heights[iz * grid + ix];
  };
  const H = new Float32Array(res * res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) H[j * res + i] = hAt(i, j);

  const washRes = 128;
  const wash = new Float32Array(washRes * washRes * 4);
  if (typeof world.biomeAt === 'function') {
    const size = world.SIZE || world.HALF * 2;
    for (let j = 0; j < washRes; j++) {
      for (let i = 0; i < washRes; i++) {
        const x = -world.HALF + ((i + 0.5) / washRes) * size;
        const z = -world.HALF + ((j + 0.5) / washRes) * size;
        const b = world.biomeAt(x, z) || {};
        let r = 0;
        let g = 0;
        let bl = 0;
        let a = 0;
        for (const [key, col] of Object.entries(WASH)) {
          const w = b[key] || 0;
          r += col[0] * w;
          g += col[1] * w;
          bl += col[2] * w;
          a += w;
        }
        const k = (j * washRes + i) * 4;
        if (a > 0) {
          wash[k] = r / a;
          wash[k + 1] = g / a;
          wash[k + 2] = bl / a;
        }
        wash[k + 3] = Math.min(1, a);
      }
    }
  }

  const step = 15;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const k = (j * res + i) * 4;
      const hv = H[j * res + i];
      let col = PAPER.slice();
      const sea = hv <= 0;
      if (sea) {
        const depth = Math.min(1, -hv / 40);
        const t = 0.06 + depth * 0.05;
        col = col.map((c, n) => c + ([200, 214, 214][n] - c) * t * 3);
        if (j % 5 === 0 && ((i + j * 7) % 23) < 17 && depth > 0.08) col = col.map((c, n) => c + (INK[n] - c) * 0.14);
      } else {
        const wi = Math.min(washRes - 1, (i * washRes / res) | 0);
        const wj = Math.min(washRes - 1, (j * washRes / res) | 0);
        const wk = (wj * washRes + wi) * 4;
        const wa = wash[wk + 3] * 0.32;
        if (wa > 0) col = col.map((c, n) => c + (wash[wk + n] - c) * wa);
        const shade = Math.min(1, hv / 200) * 0.12;
        col = col.map((c, n) => c + (INK[n] - c) * shade);
      }
      const level = sea ? -1 : Math.floor(hv / step);
      const right = i < res - 1 ? H[j * res + i + 1] : hv;
      const down = j < res - 1 ? H[(j + 1) * res + i] : hv;
      const lr = right <= 0 ? -1 : Math.floor(right / step);
      const ld = down <= 0 ? -1 : Math.floor(down / step);
      if (level !== lr || level !== ld) {
        const coast = (level === -1) !== (lr === -1) || (level === -1) !== (ld === -1);
        const major = !coast && Math.max(level, lr, ld) % 4 === 0;
        const a = coast ? 0.92 : major ? 0.42 : 0.2;
        col = col.map((c, n) => c + (INK[n] - c) * a);
      }
      data[k] = col[0];
      data[k + 1] = col[1];
      data[k + 2] = col[2];
      data[k + 3] = 255;
    }
  }
  c2d.putImageData(img, 0, 0);

  const toMap = (x, z) => [((x + world.HALF) / (world.HALF * 2)) * res, ((z + world.HALF) / (world.HALF * 2)) * res];
  c2d.strokeStyle = 'rgba(43,33,24,0.55)';
  c2d.lineWidth = 1.2;
  c2d.setLineDash([3, 3]);
  for (const path of world.paths || []) {
    c2d.beginPath();
    path.points.forEach(([x, z], n) => {
      const [px, py] = toMap(x, z);
      if (n) c2d.lineTo(px, py);
      else c2d.moveTo(px, py);
    });
    c2d.stroke();
  }
  c2d.setLineDash([]);
  return { canvas, toMap };
}

export function createJournal(root, ctx, { stack, sfx, reader }) {
  let current = null;
  let mapCache = null;

  function texts() {
    return isObject(ctx.texts) ? ctx.texts : null;
  }

  function objectivesColumn() {
    const t = texts();
    const obj = t && isObject(t.OBJECTIVES) && isObject(t.OBJECTIVES.zones) ? t.OBJECTIVES : null;
    const beacons = ctx.state?.beacons || {};
    const flag = (name) => Boolean(ctx.state?.flag?.(name));
    const col = h('section.j-col.j-objectives', null, h('h3.j-col-title', { text: JOURNAL.objectives }));
    col.append(h('p.j-main', { text: typo(obj?.main || JOURNAL.main) }));
    const list = h('ol.j-zones');
    for (const id of RING_ORDER) {
      const status = beacons[id] || 'locked';
      const zone = obj?.zones?.[id];
      const steps = Array.isArray(zone?.steps) ? zone.steps : [];
      const item = h(`li.j-zone.is-${status}`, null,
        h('div.j-zone-head', null,
          h('span.j-zone-mark'),
          h('span.j-zone-name', { text: typo(zone?.title || ZONES[id].name) }),
          h('span.j-zone-status', { text: BEACON_STATUS[status] })));
      if (steps.length && status !== 'active') {
        item.append(h('ul.j-steps', null, steps.map((s, i) => {
          const done = flag(`zone.${id}.${s.id}`) || (status === 'ready' && i < steps.length - 1);
          return h(`li${done ? '.is-done' : ''}`, { text: typo(s.text) });
        })));
      }
      list.append(item);
    }
    const lit = RING_ORDER.filter((id) => beacons[id] === 'active').length;
    const fin = h(`li.j-zone.j-finale.is-${lit >= 5 ? 'ready' : 'locked'}`, null,
      h('div.j-zone-head', null, h('span.j-zone-mark'), h('span.j-zone-name', { text: JOURNAL.finale }), h('span.j-zone-status', { text: `${lit}/5` })));
    const finSteps = Array.isArray(obj?.finale) ? obj.finale : [];
    if (lit < 5) fin.append(h('ul.j-steps', null, h('li', { text: typo(JOURNAL.finaleLocked) })));
    else if (finSteps.length) fin.append(h('ul.j-steps', null, finSteps.map((s) => h('li', { text: typo(s.text) }))));
    list.append(fin);
    col.append(list);
    return col;
  }

  function drawMap(canvas) {
    const world = ctx.world;
    const c2d = canvas.getContext('2d');
    if (!mapCache) mapCache = renderStaticMap(world);
    const { toMap } = mapCache;
    const scale = canvas.width / MAP_RES;
    c2d.setTransform(1, 0, 0, 1, 0, 0);
    c2d.drawImage(mapCache.canvas, 0, 0, canvas.width, canvas.height);
    c2d.setTransform(scale, 0, 0, scale, 0, 0);

    const beacons = ctx.state?.beacons || {};
    for (const zone of zoneList(world)) {
      const [x, y] = toMap(zone.center[0], zone.center[1]);
      const name = zone.name || ZONES[zone.id]?.name || zone.id;
      const status = beacons[zone.id];
      const bpos = ctx.has?.('beacons') ? ctx.beacons.get?.(zone.id)?.group?.position : null;
      const [bx, by] = bpos ? toMap(bpos.x, bpos.z) : [x, y];
      if (status === 'active') {
        const g = c2d.createRadialGradient(bx, by, 0, bx, by, 18);
        g.addColorStop(0, 'rgba(255,180,84,0.85)');
        g.addColorStop(1, 'rgba(255,180,84,0)');
        c2d.fillStyle = g;
        c2d.beginPath();
        c2d.arc(bx, by, 18, 0, Math.PI * 2);
        c2d.fill();
        c2d.fillStyle = '#c4731f';
        c2d.beginPath();
        c2d.arc(bx, by, 3.2, 0, Math.PI * 2);
        c2d.fill();
      } else if (status) {
        c2d.strokeStyle = status === 'ready' ? '#c4731f' : 'rgba(43,33,24,0.6)';
        c2d.lineWidth = 1.2;
        c2d.beginPath();
        c2d.arc(bx, by, 3.2, 0, Math.PI * 2);
        c2d.stroke();
      }
      c2d.font = `italic ${zone.id === 'hub' ? 15 : 17}px "Instrument Serif"`;
      c2d.textAlign = 'center';
      c2d.textBaseline = 'top';
      c2d.lineWidth = 3;
      c2d.strokeStyle = 'rgba(242,236,222,0.9)';
      const half = c2d.measureText(name).width / 2 + 8;
      const lx = Math.min(MAP_RES - half, Math.max(half, x));
      c2d.strokeText(name, lx, y + 9);
      c2d.fillStyle = 'rgb(43,33,24)';
      c2d.fillText(name, lx, y + 9);
    }

    let pos = null;
    let dir = null;
    if (ctx.has?.('player') && ctx.player.position) {
      pos = ctx.player.position;
      dir = ctx.player.forward?.();
    } else if (ctx.camera) {
      pos = ctx.camera.position;
      dir = ctx.camera.getWorldDirection?.(ctx.camera.position.clone());
    }
    if (pos) {
      const [px, py] = toMap(pos.x, pos.z);
      const a = dir ? Math.atan2(dir.z, dir.x) : -Math.PI / 2;
      c2d.save();
      c2d.translate(px, py);
      c2d.rotate(a);
      c2d.fillStyle = '#d2452f';
      c2d.strokeStyle = 'rgba(242,236,222,0.95)';
      c2d.lineWidth = 2;
      c2d.beginPath();
      c2d.moveTo(9, 0);
      c2d.lineTo(-6, 5.5);
      c2d.lineTo(-3, 0);
      c2d.lineTo(-6, -5.5);
      c2d.closePath();
      c2d.stroke();
      c2d.fill();
      c2d.restore();
    }

    c2d.font = '500 10px "IBM Plex Mono"';
    c2d.fillStyle = 'rgba(43,33,24,0.7)';
    c2d.textAlign = 'left';
    c2d.textBaseline = 'alphabetic';
    c2d.fillText('N', 16, 30);
    c2d.strokeStyle = 'rgba(43,33,24,0.7)';
    c2d.lineWidth = 1;
    c2d.beginPath();
    c2d.moveTo(19.5, 12);
    c2d.lineTo(19.5, 20);
    c2d.stroke();
    c2d.beginPath();
    c2d.moveTo(16, 470);
    c2d.lineTo(16 + 40, 470);
    c2d.moveTo(16, 466);
    c2d.lineTo(16, 474);
    c2d.moveTo(56, 466);
    c2d.lineTo(56, 474);
    c2d.stroke();
    const metersPer40 = Math.round((40 / MAP_RES) * (ctx.world.HALF * 2));
    c2d.fillText(`${metersPer40} m`, 62, 474);
  }

  function mapColumn() {
    const col = h('section.j-col.j-map', null, h('h3.j-col-title', { text: JOURNAL.map }));
    if (!ctx.world?.heights || !ctx.world.GRID) {
      col.append(h('p.j-empty', { text: JOURNAL.mapNoData }));
      return col;
    }
    const canvas = h('canvas.j-map-canvas', { width: 1024, height: 1024 });
    col.append(h('div.j-map-sheet', null, canvas));
    requestAnimationFrame(() => drawMap(canvas));
    return col;
  }

  function tracesColumn() {
    const t = texts();
    const docs = t && isObject(t.TRACES) ? t.TRACES : {};
    const found = [...(ctx.state?.traces || [])];
    const total = ctx.has?.('traces') && ctx.traces.total ? ctx.traces.total : 18;
    const col = h('section.j-col.j-traces', null, h('h3.j-col-title', null, JOURNAL.traces, h('span.j-count', { text: `${found.length}/${total}` })));
    if (!found.length) {
      col.append(h('p.j-empty', { text: typo(JOURNAL.none) }));
      return col;
    }
    const list = h('ul.j-trace-list');
    for (const id of found) {
      const doc = isObject(docs[id]) ? docs[id] : null;
      const zone = doc?.zone && ZONES[doc.zone] ? ZONES[doc.zone].name : '';
      const btn = h(`button.j-trace.kind-${doc?.kind || 'human'}`, {
        type: 'button',
        disabled: !doc,
        onmouseenter: () => sfx('ui.hover'),
        onclick: () => {
          sfx('ui.click');
          if (doc) reader.open(doc);
        },
      },
      icon('trace'),
      h('span.j-trace-text', null,
        h('span.j-trace-title', { text: typo(doc?.title || doc?.site || id) }),
        h('span.j-trace-meta', { text: typo([doc?.place, zone].filter(Boolean).join(' · ') || doc?.author || '') })));
      list.append(h('li', null, btn));
    }
    col.append(list);
    return col;
  }

  function open() {
    if (current) return;
    const prevMode = ctx.state?.mode;
    if (prevMode !== 'reading') ctx.state?.setMode?.('reading');
    ctx.input?.exitLock?.();
    const closeBtn = h('button.btn.btn--ghost', { type: 'button', onclick: () => close(), onmouseenter: () => sfx('ui.hover') },
      keycap(ctx.input?.label?.('Tab') || 'Tab'), h('span', { text: JOURNAL.close }));
    const el = h('div.journal.layer', { role: 'dialog', 'aria-label': JOURNAL.title },
      h('div.journal-scrim'),
      h('div.journal-sheet', null,
        h('header.journal-head', null, h('h2.journal-title', { text: JOURNAL.title }), closeBtn),
        h('div.journal-cols', null, objectivesColumn(), mapColumn(), tracesColumn())));

    function close() {
      if (!current) return;
      current = null;
      stack.remove(layer);
      sfx('ui.close');
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 300);
      if (prevMode && prevMode !== 'reading') ctx.state?.setMode?.(prevMode);
      if (prevMode === 'playing') ctx.input?.requestLock?.();
    }

    const layer = {
      el,
      keydown(e) {
        if (e.code === 'Tab' || e.code === 'Escape') {
          e.preventDefault();
          close();
        }
      },
    };
    current = { close };
    stack.push(layer);
    root.append(el);
    sfx('ui.open');
    requestAnimationFrame(() => el.classList.add('is-in'));
  }

  return {
    open,
    close: () => current?.close(),
    toggle: () => (current ? current.close() : open()),
    get isOpen() { return Boolean(current); },
  };
}
