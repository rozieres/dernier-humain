import * as THREE from 'three';
import { seeded, hash } from './rng.js';

const FONTS = { ui: 'Inter', serif: 'Instrument Serif', mono: 'IBM Plex Mono', hand: 'Caveat', pixel: 'VT323' };
const FACES = [
  '400 32px "Inter"', '500 32px "Inter"', '600 32px "Inter"', '700 32px "Inter"',
  '400 32px "Instrument Serif"', 'italic 400 32px "Instrument Serif"',
  '400 32px "IBM Plex Mono"', '500 32px "IBM Plex Mono"',
  '400 32px "Caveat"', '700 32px "Caveat"', '400 32px "VT323"',
];
const SAMPLE = 'AaZz09 éèàçœ ÉÀÇŒ «»—…"’';
const ALPHA_STYLES = new Set(['bubble', 'label']);
const INK = '#2b2118';

const font = (weight, size, family, style = '') => `${style} ${weight} ${Math.round(size)}px "${family}"`.trim();

function paragraphs(body) {
  if (body == null) return [];
  return (Array.isArray(body) ? body : [body]).map(String);
}

function wrap(c, string, maxWidth) {
  const out = [];
  const text = String(string).replace(/ ([%!?:;»€])/g, '\u00a0$1').replace(/(«) /g, '$1\u00a0').replace(/(\d) (\d{3})\b/g, '$1\u00a0$2');
  for (const para of text.split('\n')) {
    const words = para.split(/ +/);
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (c.measureText(test).width <= maxWidth || !line) {
        line = test;
        if (c.measureText(line).width > maxWidth) {
          let cut = '';
          for (const ch of line) {
            if (c.measureText(cut + ch + '-').width > maxWidth && cut) {
              out.push(`${cut}-`);
              cut = '';
            }
            cut += ch;
          }
          line = cut;
        }
      } else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

function layout(c, paras, { maxWidth, maxHeight, size, minSize = 10, lineHeight = 1.3, gap = 0.45, fontFor }) {
  let s = size;
  for (;;) {
    c.font = fontFor(s);
    const lines = [];
    paras.forEach((p, i) => {
      if (i > 0) lines.push(null);
      lines.push(...wrap(c, p, maxWidth));
    });
    const height = lines.reduce((h, l) => h + (l === null ? gap : 1) * s * lineHeight, 0);
    if (height <= maxHeight || s <= minSize) return { size: s, lines, height, lh: s * lineHeight, gapH: s * lineHeight * gap };
    s *= 0.93;
  }
}

function drawLines(c, block, x, y, { align = 'left', width = 0, jitter = null } = {}) {
  let cy = y;
  c.textAlign = align;
  const ax = align === 'center' ? x + width / 2 : align === 'right' ? x + width : x;
  for (const line of block.lines) {
    if (line === null) {
      cy += block.gapH;
      continue;
    }
    cy += block.lh;
    if (jitter) c.fillText(line, ax + jitter(), cy - block.lh * 0.25 + jitter());
    else c.fillText(line, ax, cy - block.lh * 0.25);
  }
  c.textAlign = 'left';
  return cy;
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function frenchCount(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',')} M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1).replace('.', ',')} k`;
  return n.toLocaleString('fr-FR').replace(/ | /g, ' ');
}

function drawPost(c, W, H, spec, r) {
  const s = W / 512;
  const pad = 30 * s;
  c.clearRect(0, 0, W, H);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, spec.bg || '#ffffff');
  g.addColorStop(1, spec.bg || '#eef1f8');
  roundRect(c, 4 * s, 4 * s, W - 8 * s, H - 8 * s, 30 * s);
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 2 * s;
  c.strokeStyle = '#dde3ee';
  c.stroke();
  const gloss = c.createLinearGradient(0, 0, W * 0.6, H * 0.5);
  gloss.addColorStop(0, 'rgba(255,255,255,0.9)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  c.save();
  c.clip();
  c.fillStyle = gloss;
  c.fillRect(0, 0, W, H * 0.4);
  c.restore();

  const av = 64 * s;
  const ax = pad + av / 2;
  const ay = pad + av / 2;
  const hues = ['#5ce1e6', '#ff5fa2', '#2e7dff', '#9b6bff', '#7af5c8'];
  const ag = c.createLinearGradient(ax - av / 2, ay - av / 2, ax + av / 2, ay + av / 2);
  ag.addColorStop(0, spec.accent || hues[Math.floor(r() * hues.length)]);
  ag.addColorStop(1, hues[Math.floor(r() * hues.length)]);
  c.beginPath();
  c.arc(ax, ay, av / 2, 0, Math.PI * 2);
  c.fillStyle = ag;
  c.fill();
  c.beginPath();
  c.arc(ax, ay - av * 0.1, av * 0.17, 0, Math.PI * 2);
  c.moveTo(ax + av * 0.3, ay + av * 0.33);
  c.ellipse(ax, ay + av * 0.33, av * 0.3, av * 0.2, 0, 0, Math.PI, true);
  c.fillStyle = 'rgba(255,255,255,0.88)';
  c.fill();

  const author = spec.author || 'Contenu Optimisé';
  const nx = pad + av + 16 * s;
  c.fillStyle = spec.fg || '#0b0d10';
  c.font = font(700, 25 * s, FONTS.ui);
  let name = author;
  while (c.measureText(name).width > W - nx - pad - 34 * s && name.length > 4) name = `${name.slice(0, -2)}…`;
  c.fillText(name, nx, pad + 27 * s);
  const bx = nx + c.measureText(name).width + 15 * s;
  const by = pad + 18 * s;
  c.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = (i % 2 ? 9.2 : 11) * s;
    c.lineTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = '#2e7dff';
  c.fill();
  c.beginPath();
  c.moveTo(bx - 4.5 * s, by);
  c.lineTo(bx - 1 * s, by + 3.6 * s);
  c.lineTo(bx + 5 * s, by - 3.6 * s);
  c.strokeStyle = '#fff';
  c.lineWidth = 2.4 * s;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.stroke();
  c.font = font(400, 19 * s, FONTS.ui);
  c.fillStyle = '#6b7385';
  const handle = spec.handle || `@${author.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 14)}`;
  c.fillText(`${handle} · ${spec.meta || 'il y a 2 min'}`, nx, pad + 54 * s);

  const top = pad + av + 22 * s;
  const footerH = 54 * s;
  const titleParas = spec.title ? [spec.title] : [];
  c.fillStyle = spec.fg || '#151a26';
  let y = top;
  if (titleParas.length) {
    const tb = layout(c, titleParas, { maxWidth: W - pad * 2, maxHeight: 90 * s, size: 28 * s, fontFor: (z) => font(700, z, FONTS.ui) });
    y = drawLines(c, tb, pad, y) + 6 * s;
  }
  const block = layout(c, paragraphs(spec.body), {
    maxWidth: W - pad * 2, maxHeight: H - y - footerH - pad, size: (spec.fontSize || 31) * s, lineHeight: 1.34,
    fontFor: (z) => font(400, z, FONTS.ui),
  });
  drawLines(c, block, pad, y, { align: spec.align || 'left', width: W - pad * 2 });

  const fy = H - pad - 10 * s;
  c.strokeStyle = '#e6eaf2';
  c.lineWidth = 2 * s;
  c.beginPath();
  c.moveTo(pad, fy - 30 * s);
  c.lineTo(W - pad, fy - 30 * s);
  c.stroke();
  const counts = [Math.floor(200 + r() * 4000), Math.floor(800 + r() * 30000), Math.floor(4000 + r() * 400000)];
  const icons = [drawCommentIcon, drawRepostIcon, drawHeartIcon];
  c.font = font(500, 19 * s, FONTS.ui);
  let ix = pad;
  icons.forEach((fn, i) => {
    fn(c, ix + 11 * s, fy - 7 * s, s);
    c.fillStyle = i === 2 ? '#ff5fa2' : '#6b7385';
    c.fillText(frenchCount(counts[i]), ix + 28 * s, fy);
    ix += (W - pad * 2) / (spec.footer ? 4.6 : 3.4);
  });
  if (spec.footer) {
    c.font = font(500, 17 * s, FONTS.ui);
    c.fillStyle = '#8a92a3';
    c.textAlign = 'right';
    c.fillText(spec.footer, W - pad, fy);
    c.textAlign = 'left';
  }
}

function drawCommentIcon(c, x, y, s) {
  c.beginPath();
  c.roundRect(x - 10 * s, y - 8 * s, 20 * s, 15 * s, 6 * s);
  c.moveTo(x - 5 * s, y + 7 * s);
  c.lineTo(x - 8 * s, y + 12 * s);
  c.lineTo(x + 1 * s, y + 7 * s);
  c.strokeStyle = '#6b7385';
  c.lineWidth = 2 * s;
  c.stroke();
}

function drawRepostIcon(c, x, y, s) {
  c.strokeStyle = '#6b7385';
  c.lineWidth = 2 * s;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(x - 10 * s, y + 2 * s);
  c.lineTo(x - 10 * s, y - 5 * s);
  c.lineTo(x + 6 * s, y - 5 * s);
  c.moveTo(x + 2 * s, y - 9 * s);
  c.lineTo(x + 6 * s, y - 5 * s);
  c.lineTo(x + 2 * s, y - 1 * s);
  c.moveTo(x + 10 * s, y - 2 * s);
  c.lineTo(x + 10 * s, y + 5 * s);
  c.lineTo(x - 6 * s, y + 5 * s);
  c.moveTo(x - 2 * s, y + 9 * s);
  c.lineTo(x - 6 * s, y + 5 * s);
  c.lineTo(x - 2 * s, y + 1 * s);
  c.stroke();
}

function drawHeartIcon(c, x, y, s) {
  c.beginPath();
  c.moveTo(x, y + 9 * s);
  c.bezierCurveTo(x - 14 * s, y - 1 * s, x - 9 * s, y - 13 * s, x, y - 5 * s);
  c.bezierCurveTo(x + 9 * s, y - 13 * s, x + 14 * s, y - 1 * s, x, y + 9 * s);
  c.fillStyle = '#ff5fa2';
  c.fill();
}

function paperGrain(c, W, H, r, base, dark) {
  c.fillStyle = base;
  c.fillRect(0, 0, W, H);
  const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, dark);
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
  const n = Math.floor((W * H) / 900);
  for (let i = 0; i < n; i++) {
    const x = r() * W;
    const y = r() * H;
    const l = 2 + r() * 7;
    const a = r() * Math.PI;
    c.strokeStyle = r() < 0.5 ? `rgba(120, 95, 60, ${0.05 + r() * 0.06})` : `rgba(255, 252, 240, ${0.12 + r() * 0.1})`;
    c.lineWidth = 0.6 + r() * 0.8;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    c.stroke();
  }
}

function inkBlot(c, x, y, size, r, color) {
  c.fillStyle = color;
  c.beginPath();
  const pts = 14;
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const rr = size * (0.75 + r() * 0.45);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) c.moveTo(px, py);
    else c.quadraticCurveTo(x + Math.cos(a - 0.2) * rr * 1.15, y + Math.sin(a - 0.2) * rr * 1.15, px, py);
  }
  c.fill();
  const drops = 3 + Math.floor(r() * 5);
  for (let i = 0; i < drops; i++) {
    const a = r() * Math.PI * 2;
    const d = size * (1.3 + r() * 1.8);
    c.beginPath();
    c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, size * (0.06 + r() * 0.16), 0, Math.PI * 2);
    c.fill();
  }
}

function drawHuman(c, W, H, spec, r) {
  const s = W / 512;
  paperGrain(c, W, H, r, spec.bg || '#f3e9d2', 'rgba(140, 105, 60, 0.32)');
  const pad = 38 * s;
  const ruleGap = 34 * s;
  c.strokeStyle = 'rgba(70, 105, 160, 0.2)';
  c.lineWidth = 1.2 * s;
  for (let y = pad + ruleGap * 1.6; y < H - 12 * s; y += ruleGap) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y + (r() - 0.5) * 1.5 * s);
    c.stroke();
  }
  c.strokeStyle = 'rgba(200, 70, 60, 0.35)';
  c.lineWidth = 1.6 * s;
  c.beginPath();
  c.moveTo(pad + 8 * s, 0);
  c.lineTo(pad + 8 * s, H);
  c.stroke();

  if (r() < 0.8) {
    c.strokeStyle = 'rgba(120, 80, 40, 0.16)';
    c.lineWidth = 7 * s;
    const cx = W * (0.62 + r() * 0.3);
    const cy = H * (0.6 + r() * 0.3);
    const cr = 62 * s;
    c.beginPath();
    c.arc(cx, cy, cr, r() * 2, r() * 2 + Math.PI * 1.7);
    c.stroke();
    c.lineWidth = 2 * s;
    c.beginPath();
    c.arc(cx + 2 * s, cy - 1 * s, cr - 5 * s, 0, Math.PI * 2);
    c.stroke();
  }

  c.save();
  const angle = (r() - 0.5) * 0.05;
  c.translate(W / 2, H / 2);
  c.rotate(angle);
  c.translate(-W / 2, -H / 2);
  c.fillStyle = spec.fg || INK;
  const jitter = () => (r() - 0.5) * 2.2 * s;
  let y = pad + ruleGap * 0.6 - ruleGap;
  const left = pad + 22 * s;
  const width = W - left - pad * 0.7;
  if (spec.meta) {
    c.font = font(400, 24 * s, FONTS.hand);
    c.textAlign = 'right';
    c.fillText(spec.meta, W - pad * 0.7, pad + 4 * s);
    c.textAlign = 'left';
  }
  if (spec.title) {
    const tb = layout(c, [spec.title], { maxWidth: width, maxHeight: ruleGap * 2.2, size: 40 * s, lineHeight: ruleGap / (40 * s), fontFor: (z) => font(700, z, FONTS.hand) });
    tb.lh = ruleGap;
    y = drawLines(c, tb, left, y + ruleGap, { jitter });
    c.strokeStyle = spec.fg || INK;
    c.lineWidth = 2 * s;
    c.beginPath();
    c.moveTo(left, y - ruleGap * 0.12);
    for (let x = left; x < left + Math.min(width, c.measureText(tb.lines[tb.lines.length - 1]).width); x += 12 * s) c.lineTo(x + 12 * s, y - ruleGap * 0.12 + (r() - 0.5) * 3 * s);
    c.stroke();
  } else {
    y += ruleGap;
  }
  const footer = spec.author ? 1.4 : 0.3;
  const bodySize = (spec.fontSize || 31) * s;
  const block = layout(c, paragraphs(spec.body), {
    maxWidth: width, maxHeight: H - y - pad * 0.4 - footer * ruleGap, size: bodySize, minSize: 13 * s,
    lineHeight: ruleGap / bodySize, gap: 1, fontFor: (z) => font(400, z, FONTS.hand),
  });
  y = drawLines(c, block, left, y, { jitter });
  if (spec.author) {
    c.font = font(700, 30 * s, FONTS.hand);
    c.textAlign = 'right';
    c.fillText(`— ${spec.author}`, W - pad, Math.min(H - pad * 0.5, y + ruleGap * 1.1));
    c.textAlign = 'left';
  }
  c.restore();
  const blots = 1 + Math.floor(r() * 2);
  for (let i = 0; i < blots; i++) {
    inkBlot(c, W * (0.1 + r() * 0.8), i === 0 ? H * (0.82 + r() * 0.12) : H * (0.05 + r() * 0.1), (4 + r() * 7) * s, r, 'rgba(43, 33, 24, 0.85)');
  }
}

let starTile = null;
function starPattern(c) {
  if (!starTile) {
    starTile = document.createElement('canvas');
    starTile.width = 96;
    starTile.height = 96;
    const t = starTile.getContext('2d');
    t.fillStyle = '#0a0a3c';
    t.fillRect(0, 0, 96, 96);
    const r = seeded(1999);
    for (let i = 0; i < 46; i++) {
      t.fillStyle = r() < 0.2 ? '#ffe600' : r() < 0.5 ? '#9fb4ff' : '#ffffff';
      const x = Math.floor(r() * 96);
      const y = Math.floor(r() * 96);
      t.fillRect(x, y, r() < 0.85 ? 1 : 2, 1);
    }
    for (let i = 0; i < 3; i++) {
      const x = 8 + Math.floor(r() * 80);
      const y = 8 + Math.floor(r() * 80);
      t.fillStyle = '#ffffff';
      t.fillRect(x - 3, y, 7, 1);
      t.fillRect(x, y - 3, 1, 7);
      t.fillStyle = '#ffe600';
      t.fillRect(x - 1, y - 1, 3, 3);
    }
  }
  return c.createPattern(starTile, 'repeat');
}

function drawOldweb(c, W, H, spec, r) {
  const s = W / 512;
  c.imageSmoothingEnabled = false;
  c.save();
  c.scale(Math.max(1, Math.round(s)), Math.max(1, Math.round(s)));
  c.fillStyle = spec.bg || starPattern(c);
  c.fillRect(0, 0, W, H);
  c.restore();
  const pad = 20 * s;
  let y = pad;
  if (spec.title) {
    const tb = layout(c, [spec.title], { maxWidth: W - pad * 2, maxHeight: 110 * s, size: 58 * s, lineHeight: 0.95, fontFor: (z) => font(400, z, FONTS.pixel) });
    c.font = font(400, tb.size, FONTS.pixel);
    let ty = y;
    for (const line of tb.lines) {
      ty += tb.lh;
      c.textAlign = 'center';
      c.fillStyle = '#c96f4a';
      c.fillText(line, W / 2 + 3 * s, ty + 3 * s);
      const grad = c.createLinearGradient(0, ty - tb.size, 0, ty);
      grad.addColorStop(0, spec.accent || '#ffe600');
      grad.addColorStop(1, '#ff9a1f');
      c.fillStyle = grad;
      c.fillText(line, W / 2, ty);
    }
    c.textAlign = 'left';
    y = ty + 12 * s;
  }
  const rainbow = c.createLinearGradient(pad, 0, W - pad, 0);
  ['#ff3b3b', '#ff9a1f', '#ffe600', '#3bff6b', '#3bb4ff', '#b45cff'].forEach((col, i) => rainbow.addColorStop(i / 5, col));
  c.fillStyle = rainbow;
  c.fillRect(pad, y, W - pad * 2, 5 * s);
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.fillRect(pad, y, W - pad * 2, 1.5 * s);
  y += 14 * s;

  const counterH = 64 * s;
  const stripeH = 30 * s;
  const footerH = spec.footer ? 26 * s : 0;
  const block = layout(c, paragraphs(spec.body), {
    maxWidth: W - pad * 2, maxHeight: H - y - counterH - stripeH - footerH - 14 * s, size: (spec.fontSize || 30) * s, lineHeight: 1.05, gap: 0.5,
    fontFor: (z) => font(400, z, FONTS.pixel),
  });
  c.fillStyle = spec.fg || '#e9ecff';
  c.font = font(400, block.size, FONTS.pixel);
  let cy = y;
  let li = 0;
  for (const line of block.lines) {
    if (line === null) {
      cy += block.gapH;
      continue;
    }
    cy += block.lh;
    const isLink = /^(>|→|\*)/.test(line);
    c.fillStyle = isLink ? '#5cf2ff' : li % 7 === 3 ? '#ffe600' : spec.fg || '#e9ecff';
    const tx = spec.align === 'center' ? W / 2 : pad;
    c.textAlign = spec.align === 'center' ? 'center' : 'left';
    c.fillText(line, tx, cy - block.lh * 0.2);
    if (isLink) {
      const w = c.measureText(line).width;
      const x0 = spec.align === 'center' ? tx - w / 2 : tx;
      c.fillRect(x0, cy - block.lh * 0.12, w, 2 * s);
    }
    li++;
  }
  c.textAlign = 'left';

  const by = H - stripeH - counterH - footerH;
  if (spec.footer) {
    c.font = font(400, 22 * s, FONTS.pixel);
    c.fillStyle = '#ff5fa2';
    c.textAlign = 'center';
    c.fillText(spec.footer, W / 2, by + 20 * s);
    c.textAlign = 'left';
  }
  const digits = String(spec.meta && /^\d+$/.test(spec.meta) ? spec.meta : Math.floor(r() * 99999)).padStart(6, '0');
  c.font = font(400, 20 * s, FONTS.pixel);
  c.fillStyle = '#c9cfff';
  const label = 'Vous êtes le visiteur n°';
  const cellW = 22 * s;
  const total = c.measureText(label).width + 10 * s + cellW * digits.length;
  let x = (W - total) / 2;
  const cyc = by + footerH + counterH / 2 + 6 * s;
  c.fillText(label, x, cyc + 6 * s);
  x += c.measureText(label).width + 10 * s;
  for (const d of digits) {
    c.fillStyle = '#000';
    c.fillRect(x, cyc - 16 * s, cellW - 2 * s, 30 * s);
    c.fillStyle = '#1a1a1a';
    c.fillRect(x, cyc - 2 * s, cellW - 2 * s, 1.5 * s);
    c.fillStyle = '#7cff6b';
    c.font = font(400, 28 * s, FONTS.pixel);
    c.fillText(d, x + 4 * s, cyc + 8 * s);
    x += cellW;
  }
  const sy = H - stripeH;
  c.save();
  c.beginPath();
  c.rect(0, sy, W, stripeH);
  c.clip();
  c.fillStyle = '#ffe600';
  c.fillRect(0, sy, W, stripeH);
  c.fillStyle = '#111';
  for (let i = -2; i < W / (18 * s) + 2; i++) {
    c.beginPath();
    c.moveTo(i * 36 * s, sy + stripeH);
    c.lineTo(i * 36 * s + 18 * s, sy + stripeH);
    c.lineTo(i * 36 * s + 18 * s + stripeH, sy);
    c.lineTo(i * 36 * s + stripeH, sy);
    c.fill();
  }
  c.fillStyle = '#111';
  c.fillRect(W / 2 - 112 * s, sy + 4 * s, 224 * s, stripeH - 8 * s);
  c.fillStyle = '#ffe600';
  c.font = font(400, 24 * s, FONTS.pixel);
  c.textAlign = 'center';
  c.fillText('EN CONSTRUCTION', W / 2, sy + stripeH * 0.72);
  c.textAlign = 'left';
  c.restore();
  c.imageSmoothingEnabled = true;
}

function drawTerminal(c, W, H, spec, r) {
  const s = W / 512;
  const phosphor = spec.accent || '#7cff6b';
  c.fillStyle = '#020402';
  c.fillRect(0, 0, W, H);
  const glass = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
  glass.addColorStop(0, spec.bg || '#0b1a0d');
  glass.addColorStop(0.75, '#050c06');
  glass.addColorStop(1, '#000');
  roundRect(c, 10 * s, 10 * s, W - 20 * s, H - 20 * s, 34 * s);
  c.fillStyle = glass;
  c.fill();
  c.save();
  c.clip();
  const pad = 36 * s;
  let y = pad - 6 * s;
  c.shadowColor = phosphor;
  c.shadowBlur = 9 * s;
  if (spec.title) {
    c.font = font(400, 26 * s, FONTS.pixel);
    c.fillStyle = phosphor;
    c.fillRect(pad - 6 * s, y, W - pad * 2 + 12 * s, 30 * s);
    c.shadowBlur = 0;
    c.fillStyle = '#031203';
    c.fillText(spec.title.toUpperCase(), pad, y + 22 * s);
    c.shadowBlur = 9 * s;
    y += 42 * s;
  }
  const footerH = spec.footer ? 36 * s : 0;
  const block = layout(c, paragraphs(spec.body), {
    maxWidth: W - pad * 2, maxHeight: H - y - pad - footerH, size: (spec.fontSize || 28) * s, lineHeight: 1.08, gap: 0.6,
    fontFor: (z) => font(400, z, FONTS.pixel),
  });
  c.fillStyle = spec.fg || phosphor;
  y = drawLines(c, block, pad, y, { align: spec.align || 'left', width: W - pad * 2 });
  const lastLine = block.lines[block.lines.length - 1] || '';
  c.font = font(400, block.size, FONTS.pixel);
  if (spec.footer) {
    c.font = font(400, 26 * s, FONTS.pixel);
    const fy = H - pad;
    c.fillText(spec.footer, pad, fy);
    const w = c.measureText(spec.footer).width;
    c.fillRect(pad + w + 6 * s, fy - 20 * s, 13 * s, 22 * s);
  } else {
    const w = c.measureText(lastLine).width;
    c.fillRect(pad + w + 6 * s, y - block.lh * 0.25 - block.size * 0.75, block.size * 0.5, block.size * 0.85);
  }
  c.shadowBlur = 0;
  c.fillStyle = 'rgba(0, 0, 0, 0.28)';
  for (let sy = 0; sy < H; sy += 3 * s) c.fillRect(0, sy, W, 1.2 * s);
  for (let i = 0; i < 260; i++) {
    c.fillStyle = `rgba(160, 255, 150, ${r() * 0.05})`;
    c.fillRect(r() * W, r() * H, 1.5 * s, 1.5 * s);
  }
  const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.65);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.6)');
  c.fillStyle = vg;
  c.fillRect(0, 0, W, H);
  const hl = c.createLinearGradient(0, 0, W * 0.5, H * 0.5);
  hl.addColorStop(0, 'rgba(220,255,220,0.08)');
  hl.addColorStop(1, 'rgba(220,255,220,0)');
  c.fillStyle = hl;
  c.fillRect(0, 0, W, H);
  c.restore();
}

function drawArrow(c, x, y, size, dir) {
  const rot = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir];
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.beginPath();
  c.moveTo(-size * 0.5, -size * 0.14);
  c.lineTo(size * 0.08, -size * 0.14);
  c.lineTo(size * 0.08, -size * 0.38);
  c.lineTo(size * 0.55, 0);
  c.lineTo(size * 0.08, size * 0.38);
  c.lineTo(size * 0.08, size * 0.14);
  c.lineTo(-size * 0.5, size * 0.14);
  c.closePath();
  c.fill();
  c.restore();
}

function drawSign(c, W, H, spec, r) {
  const s = Math.min(W, H) / 512;
  const board = spec.accent || spec.bg || '#1f5a44';
  const fg = spec.fg || '#f7f7f2';
  c.clearRect(0, 0, W, H);
  roundRect(c, 0, 0, W, H, 34 * s);
  c.fillStyle = board;
  c.fill();
  c.save();
  c.clip();
  const sheen = c.createLinearGradient(0, 0, W, H);
  sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.18)');
  c.fillStyle = sheen;
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    c.strokeStyle = `rgba(255,255,255,${0.03 + r() * 0.05})`;
    c.lineWidth = (0.5 + r()) * s;
    const x = r() * W;
    const y = r() * H;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + (r() - 0.5) * 40 * s, y + (r() - 0.5) * 6 * s);
    c.stroke();
  }
  const dirt = c.createLinearGradient(0, H * 0.6, 0, H);
  dirt.addColorStop(0, 'rgba(60,40,20,0)');
  dirt.addColorStop(1, 'rgba(60,40,20,0.25)');
  c.fillStyle = dirt;
  c.fillRect(0, 0, W, H);
  c.restore();
  const inset = 14 * s;
  roundRect(c, inset, inset, W - inset * 2, H - inset * 2, 24 * s);
  c.lineWidth = 7 * s;
  c.strokeStyle = fg;
  c.stroke();
  for (const [bx, by] of [[inset * 2.4, inset * 2.4], [W - inset * 2.4, inset * 2.4], [inset * 2.4, H - inset * 2.4], [W - inset * 2.4, H - inset * 2.4]]) {
    c.beginPath();
    c.arc(bx, by, 5 * s, 0, Math.PI * 2);
    c.fillStyle = '#c9ccd2';
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(bx - 3.5 * s, by - 0.6 * s, 7 * s, 1.2 * s);
  }
  const pad = 46 * s;
  c.fillStyle = fg;
  let y = pad;
  const lines = paragraphs(spec.body);
  const titleSize = (spec.fontSize || (lines.length ? 64 : 92)) * s;
  if (spec.title) {
    const maxH = lines.length ? (H - pad * 2) * 0.45 : H - pad * 2;
    const tb = layout(c, [spec.title], { maxWidth: W - pad * 2, maxHeight: maxH, size: titleSize, lineHeight: 1.05, fontFor: (z) => font(700, z, FONTS.ui) });
    const blockTop = lines.length ? y : (H - tb.height) / 2;
    y = drawLines(c, tb, pad, blockTop, { align: spec.align || (lines.length ? 'left' : 'center'), width: W - pad * 2 });
    if (lines.length) {
      c.fillRect(pad, y + 8 * s, W - pad * 2, 3 * s);
      y += 18 * s;
    }
  }
  if (lines.length) {
    const avail = H - y - pad;
    const size = Math.min(48 * s, avail / (lines.length * 1.3));
    for (const raw of lines) {
      const m = raw.match(/^(→|←|↑|↓|>|<|\^)\s*/);
      const dir = m ? { '→': 'right', '>': 'right', '←': 'left', '<': 'left', '↑': 'up', '^': 'up', '↓': 'down' }[m[1]] : null;
      const text = m ? raw.slice(m[0].length) : raw;
      y += size * 1.3;
      let x = pad;
      if (dir) {
        drawArrow(c, x + size * 0.45, y - size * 0.34, size * 0.9, dir);
        x += size * 1.15;
      }
      let fs = size;
      c.font = font(600, fs, FONTS.ui);
      while (c.measureText(text).width > W - pad - x && fs > 10 * s) {
        fs *= 0.94;
        c.font = font(600, fs, FONTS.ui);
      }
      c.fillText(text, x, y);
    }
  }
}

function drawBubble(c, W, H, spec) {
  const s = W / 512;
  c.clearRect(0, 0, W, H);
  const tail = 46 * s;
  const m = 10 * s;
  const bw = W - m * 2;
  const bh = H - m * 2 - tail;
  c.save();
  c.shadowColor = 'rgba(10, 20, 40, 0.28)';
  c.shadowBlur = 14 * s;
  c.shadowOffsetY = 4 * s;
  c.beginPath();
  c.roundRect(m, m, bw, bh, 40 * s);
  c.moveTo(m + bw * 0.2, m + bh - 1);
  c.lineTo(m + bw * 0.14, m + bh + tail);
  c.lineTo(m + bw * 0.36, m + bh - 1);
  c.closePath();
  c.fillStyle = spec.bg || '#ffffff';
  c.fill();
  c.restore();
  c.lineWidth = 4 * s;
  c.strokeStyle = spec.accent || '#5ce1e6';
  c.beginPath();
  c.roundRect(m + 2 * s, m + 2 * s, bw - 4 * s, bh - 4 * s, 38 * s);
  c.stroke();
  const pad = 34 * s;
  let y = m + pad * 0.7;
  if (spec.author) {
    c.font = font(600, 26 * s, FONTS.ui);
    c.fillStyle = spec.accent || '#1b9ea3';
    c.fillText(spec.author, m + pad, y + 22 * s);
    y += 38 * s;
  }
  const paras = paragraphs(spec.body ?? spec.title);
  const block = layout(c, paras, {
    maxWidth: bw - pad * 2, maxHeight: m + bh - y - pad * 0.6, size: (spec.fontSize || 46) * s, lineHeight: 1.22,
    fontFor: (z) => font(500, z, FONTS.ui),
  });
  c.fillStyle = spec.fg || '#0b0d10';
  const top = spec.author ? y : m + (bh - block.height) / 2 - 4 * s;
  drawLines(c, block, m + pad, top, { align: spec.align || (spec.author ? 'left' : 'center'), width: bw - pad * 2 });
}

function drawLabel(c, W, H, spec) {
  const s = H / 128;
  c.clearRect(0, 0, W, H);
  const m = 6 * s;
  c.beginPath();
  c.moveTo(m + 30 * s, m);
  c.lineTo(W - m - 16 * s, m);
  c.quadraticCurveTo(W - m, m, W - m, m + 16 * s);
  c.lineTo(W - m, H - m - 16 * s);
  c.quadraticCurveTo(W - m, H - m, W - m - 16 * s, H - m);
  c.lineTo(m + 30 * s, H - m);
  c.lineTo(m, H / 2);
  c.closePath();
  c.fillStyle = spec.accent || spec.bg || '#0b0d10';
  c.fill();
  c.globalCompositeOperation = 'destination-out';
  c.beginPath();
  c.arc(m + 34 * s, H / 2, 9 * s, 0, Math.PI * 2);
  c.fill();
  c.globalCompositeOperation = 'source-over';
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = 2 * s;
  c.beginPath();
  c.arc(m + 34 * s, H / 2, 11 * s, 0, Math.PI * 2);
  c.stroke();
  const text = String(spec.title ?? paragraphs(spec.body).join(' ')).toUpperCase();
  let fs = (spec.fontSize || 54) * s;
  c.font = font(600, fs, FONTS.ui);
  c.letterSpacing = `${3 * s}px`;
  const maxW = W - m * 2 - 70 * s;
  while (c.measureText(text).width > maxW && fs > 10) {
    fs *= 0.94;
    c.font = font(600, fs, FONTS.ui);
  }
  c.fillStyle = spec.fg || '#f2efe8';
  c.textBaseline = 'middle';
  c.fillText(text, m + 58 * s, H / 2 + 2 * s);
  c.textBaseline = 'alphabetic';
  c.letterSpacing = '0px';
}

function drawPlain(c, W, H, spec) {
  const s = Math.min(W, H) / 512;
  c.clearRect(0, 0, W, H);
  if (spec.bg) {
    c.fillStyle = spec.bg;
    c.fillRect(0, 0, W, H);
  }
  const pad = 30 * s;
  c.fillStyle = spec.fg || '#f2efe8';
  let y = pad;
  if (spec.title) {
    const tb = layout(c, [spec.title], { maxWidth: W - pad * 2, maxHeight: H * 0.4, size: 56 * s, lineHeight: 1.05, fontFor: (z) => font(400, z, FONTS.serif) });
    y = drawLines(c, tb, pad, y, { align: spec.align || 'left', width: W - pad * 2 }) + 10 * s;
  }
  const family = FONTS[spec.font] || FONTS.ui;
  const block = layout(c, paragraphs(spec.body), {
    maxWidth: W - pad * 2, maxHeight: H - y - pad - (spec.footer ? 30 * s : 0), size: (spec.fontSize || 28) * s, lineHeight: 1.35,
    fontFor: (z) => font(400, z, family),
  });
  drawLines(c, block, pad, y, { align: spec.align || 'left', width: W - pad * 2 });
  if (spec.footer) {
    c.font = font(500, 18 * s, FONTS.ui);
    c.globalAlpha = 0.7;
    c.fillText(spec.footer, pad, H - pad);
    c.globalAlpha = 1;
  }
}

const STYLES = { post: drawPost, human: drawHuman, oldweb: drawOldweb, terminal: drawTerminal, sign: drawSign, bubble: drawBubble, label: drawLabel, plain: drawPlain };

export function createText({ renderer, mat } = {}) {
  const ready = typeof document === 'undefined'
    ? Promise.resolve()
    : Promise.all(FACES.map((f) => document.fonts.load(f, SAMPLE))).then(() => document.fonts.ready).then(() => undefined);
  let fontsLoaded = false;
  ready.then(() => { fontsLoaded = true; });
  const anisotropy = Math.min(8, renderer?.capabilities.getMaxAnisotropy() || 1);
  const pending = new Set();

  function canvas({ width = 512, height = 512, draw } = {}) {
    const el = document.createElement('canvas');
    el.width = width;
    el.height = height;
    if (draw) draw(el.getContext('2d'), width, height);
    return el;
  }

  function render(el, spec) {
    const W = spec.width || 512;
    const H = spec.height || 512;
    if (el.width !== W) el.width = W;
    if (el.height !== H) el.height = H;
    const c = el.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, H);
    const r = seeded(spec.seed ?? hash(`${spec.style}|${spec.title || ''}|${paragraphs(spec.body).join('|')}`));
    (STYLES[spec.style] || drawPlain)(c, W, H, spec, r);
  }

  function texture(spec) {
    const el = document.createElement('canvas');
    render(el, spec);
    const tex = new THREE.CanvasTexture(el);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.premultiplyAlpha = ALPHA_STYLES.has(spec.style) || (spec.style === 'plain' && !spec.bg);
    tex.userData.spec = spec;
    if (!fontsLoaded) {
      pending.add(tex);
      ready.then(() => {
        if (!pending.delete(tex)) return;
        render(el, tex.userData.spec);
        tex.needsUpdate = true;
      });
    }
    return tex;
  }

  function update(tex, spec) {
    const el = tex.image;
    const resized = (spec.width || 512) !== el.width || (spec.height || 512) !== el.height;
    tex.userData.spec = spec;
    render(el, spec);
    if (resized) tex.dispose();
    tex.needsUpdate = true;
    return tex;
  }

  function panel({ size = [1, 1], emissive = 1, doubleSide = false, ...spec }) {
    const [w, h] = size;
    const full = { ...spec };
    if (!full.width && !full.height) {
      full.width = 512;
      full.height = Math.round((512 * h) / w / 4) * 4 || 512;
      if (full.height > 1024) {
        full.height = 1024;
        full.width = Math.round((1024 * w) / h / 4) * 4;
      }
    } else if (!full.height) full.height = Math.round((full.width * h) / w);
    else if (!full.width) full.width = Math.round((full.height * w) / h);
    const map = texture(full);
    const alpha = map.premultiplyAlpha;
    const params = {
      map,
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      transparent: alpha,
      premultipliedAlpha: alpha,
      alphaTest: alpha ? 0.004 : 0,
      depthWrite: !alpha,
    };
    const material = emissive > 0
      ? mat.basic({ ...params, color: new THREE.Color(1, 1, 1).multiplyScalar(emissive) })
      : mat.standard({ ...params, roughness: 0.82, metalness: 0 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.name = `text:${spec.style}`;
    mesh.userData.text = map;
    return mesh;
  }

  return { ready, FONTS, STYLES: Object.keys(STYLES), texture, panel, update, canvas, wrap };
}
