import * as THREE from 'three';
import { seeded } from '../../core/rng.js';
import { PEDESTAL_ORDER } from './layout.js';

export const PAGE_COLS = 4;
export const PAGE_ROWS = 4;
const PAGE_W = 512;
const PAGE_H = 640;
const PAGE_BGS = [null, '#000066', null, '#2a2a2a', '#3a0040', null, '#000000', '#5a0a3c', '#00303a', null, '#0a2a0a', '#400000', '#101010', '#000044', null, '#1a0033'];

const SIGN_SIZE = 2048;
export const REG = {
  banner: [0, 0, 2048, 256],
  prev: [0, 264, 512, 120],
  next: [520, 264, 512, 120],
  ring: [1040, 264, 760, 120],
  white: [1816, 272, 48, 48],
  counterLabel: [0, 392, 1016, 120],
  newBanner: [1024, 392, 512, 192],
  construction: [1544, 392, 504, 248],
  stripes: [0, 520, 1016, 96],
  riddle0: [0, 648, 676, 368],
  riddle1: [684, 648, 676, 368],
  riddle2: [1368, 648, 676, 368],
  digits: [0, 1024, 1280, 192],
  tagline: [1288, 1024, 760, 192],
  hot: [0, 1224, 504, 184],
  mail: [512, 1224, 504, 184],
};

function canvasTex(el, { mips = true } = {}) {
  const tex = new THREE.CanvasTexture(el);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = mips;
  tex.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  return tex;
}

export function uvOf([x, y, w, h], inset = 3, size = SIGN_SIZE) {
  return [(x + inset) / size, 1 - (y + h - inset) / size, (x + w - inset) / size, 1 - (y + inset) / size];
}

export function digitUV(d) {
  const [x, y, , h] = REG.digits;
  return uvOf([x + d * 128, y, 128, h], 4);
}

export function pageUV(i) {
  const col = i % PAGE_COLS;
  const row = Math.floor(i / PAGE_COLS) % PAGE_ROWS;
  const du = 2 / (PAGE_W * PAGE_COLS);
  const dv = 2 / (PAGE_H * PAGE_ROWS);
  return [col / PAGE_COLS + du, 1 - (row + 1) / PAGE_ROWS + dv, (col + 1) / PAGE_COLS - du, 1 - row / PAGE_ROWS - dv];
}

export function pagesAtlas(ctx) {
  const { text, texts } = ctx;
  const pages = texts.OLDWEB?.pages || [];
  const el = text.canvas({ width: PAGE_W * PAGE_COLS, height: PAGE_H * PAGE_ROWS });
  const c = el.getContext('2d');
  c.fillStyle = '#000033';
  c.fillRect(0, 0, el.width, el.height);
  pages.slice(0, PAGE_COLS * PAGE_ROWS).forEach((p, i) => {
    const t = text.texture({
      style: 'oldweb', width: PAGE_W, height: PAGE_H, title: p.title, body: p.lines,
      meta: String(p.counter), footer: `Dernière mise à jour : ${p.year}`, bg: PAGE_BGS[i] || undefined, seed: 40 + i,
    });
    c.drawImage(t.image, (i % PAGE_COLS) * PAGE_W, Math.floor(i / PAGE_COLS) * PAGE_H);
    t.dispose();
  });
  return canvasTex(el);
}

function speck(c, x, y, w, h, r, n, color, alpha = 0.2, size = 2) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = color;
    c.globalAlpha = r() * alpha;
    c.fillRect(x + r() * w, y + r() * h, 1 + r() * size, 1 + r() * size);
  }
  c.globalAlpha = 1;
}

function fitFont(c, str, family, weight, size, maxW, style = '') {
  let s = size;
  do {
    c.font = `${style} ${weight} ${Math.round(s)}px "${family}"`.trim();
    if (c.measureText(str).width <= maxW) break;
    s *= 0.95;
  } while (s > 10);
  return s;
}

function stars(c, x, y, w, h, r, n) {
  for (let i = 0; i < n; i++) {
    const sx = x + r() * w;
    const sy = y + r() * h;
    const s = r() < 0.15 ? 3 : 1.5;
    c.fillStyle = r() < 0.3 ? '#ffe600' : '#ffffff';
    c.globalAlpha = 0.4 + r() * 0.6;
    c.fillRect(sx, sy, s, s);
    if (s > 2) {
      c.fillRect(sx - 4, sy + 1, 11, 1);
      c.fillRect(sx + 1, sy - 4, 1, 11);
    }
  }
  c.globalAlpha = 1;
}

function rainbow(c, x0, x1) {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  ['#ff3b3b', '#ff9a1f', '#ffe600', '#3bff6b', '#3bb4ff', '#b45cff', '#ff5fa2'].forEach((col, i) => g.addColorStop(i / 6, col));
  return g;
}

function drawBanner(c, [x, y, w, h], r, F) {
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#0a0a3c');
  g.addColorStop(1, '#2a0a5c');
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  stars(c, x, y, w, h, r, 260);
  c.strokeStyle = '#ffe600';
  c.lineWidth = 8;
  c.setLineDash([18, 12]);
  c.strokeRect(x + 10, y + 10, w - 20, h - 20);
  c.setLineDash([]);
  const str = 'Bienvenue sur ma page !!';
  const s = fitFont(c, str, F.pixel, 400, 200, w - 140);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#c96f4a';
  c.fillText(str, x + w / 2 + 7, y + h / 2 + 9);
  c.fillStyle = rainbow(c, x + 80, x + w - 80);
  c.fillText(str, x + w / 2, y + h / 2 + 2);
  c.font = `400 ${Math.round(s * 0.6)}px "${F.pixel}"`;
  c.fillStyle = '#ffffff';
  c.fillText('*', x + 50, y + h / 2);
  c.fillText('*', x + w - 50, y + h / 2);
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
}

function drawBoard(c, [x, y, w, h], str, F, dir) {
  c.fillStyle = '#10204a';
  c.fillRect(x, y, w, h);
  c.strokeStyle = '#ffe600';
  c.lineWidth = 6;
  c.strokeRect(x + 6, y + 6, w - 12, h - 12);
  c.fillStyle = '#ffffff';
  const ax = dir < 0 ? x + 50 : x + w - 50;
  c.beginPath();
  c.moveTo(ax + dir * 28, y + h / 2);
  c.lineTo(ax - dir * 18, y + h / 2 - 28);
  c.lineTo(ax - dir * 18, y + h / 2 + 28);
  c.closePath();
  c.fillStyle = '#5cf2ff';
  c.fill();
  fitFont(c, str, F.pixel, 400, 92, w - 150);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#ffffff';
  c.fillText(str, x + w / 2 + (dir < 0 ? 28 : -28), y + h / 2 + 4);
  c.fillRect(x + 110, y + h / 2 + 34, w - 220, 3);
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
}

function drawCentered(c, [x, y, w, h], str, F, { bg, fg, family = F.pixel, weight = 400, size = 90, style = '', stroke } = {}) {
  if (bg) {
    c.fillStyle = bg;
    c.fillRect(x, y, w, h);
  }
  fitFont(c, str, family, weight, size, w - 40, style);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if (stroke) {
    c.lineWidth = stroke[1];
    c.strokeStyle = stroke[0];
    c.lineJoin = 'round';
    c.strokeText(str, x + w / 2, y + h / 2 + 4);
  }
  c.fillStyle = fg;
  c.fillText(str, x + w / 2, y + h / 2 + 4);
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
}

function drawNew(c, [x, y, w, h], F) {
  c.fillStyle = '#d4141c';
  c.fillRect(x, y, w, h);
  const cx = x + w / 2;
  const cy = y + h / 2;
  c.beginPath();
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const rr = i % 2 ? h * 0.36 : h * 0.62;
    c.lineTo(cx + Math.cos(a) * rr * 1.9, cy + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = '#ffe600';
  c.fill();
  drawCentered(c, [x, y, w, h], 'NEW !', F, { fg: '#d4141c', family: F.ui, weight: 900, size: 140, style: 'italic', stroke: ['#ffffff', 12] });
}

function drawConstruction(c, [x, y, w, h], F) {
  c.fillStyle = '#ffd400';
  c.fillRect(x, y, w, h);
  c.strokeStyle = '#111111';
  c.lineWidth = 10;
  c.strokeRect(x + 8, y + 8, w - 16, h - 16);
  fitFont(c, 'EN CONSTRUCTION', F.pixel, 400, 76, w - 60);
  c.fillStyle = '#111111';
  c.textAlign = 'center';
  c.fillText('EN CONSTRUCTION', x + w / 2, y + 72);
  c.textAlign = 'left';
  const gx = x + w / 2 - 20;
  const gy = y + 200;
  c.lineCap = 'round';
  c.lineWidth = 12;
  c.beginPath();
  c.arc(gx - 30, gy - 92, 15, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.moveTo(gx - 34, gy - 72);
  c.lineTo(gx - 20, gy - 30);
  c.lineTo(gx - 44, gy + 4);
  c.moveTo(gx - 20, gy - 30);
  c.lineTo(gx + 2, gy + 2);
  c.moveTo(gx - 30, gy - 62);
  c.lineTo(gx + 14, gy - 48);
  c.lineTo(gx + 40, gy - 6);
  c.stroke();
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(gx - 6, gy - 70);
  c.lineTo(gx + 44, gy + 2);
  c.stroke();
  c.beginPath();
  c.ellipse(gx + 80, gy + 8, 52, 22, 0, Math.PI, 0);
  c.fill();
}

function drawStripes(c, [x, y, w, h]) {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.fillStyle = '#ffd400';
  c.fillRect(x, y, w, h);
  c.fillStyle = '#141414';
  const step = w / 8;
  for (let i = -1; i < 9; i++) {
    c.beginPath();
    c.moveTo(x + i * step, y + h);
    c.lineTo(x + i * step + step / 2, y + h);
    c.lineTo(x + i * step + step / 2 + h, y);
    c.lineTo(x + i * step + h, y);
    c.fill();
  }
  c.restore();
}

function drawRiddle(c, [x, y, w, h], str, numeral, r, F, wrap) {
  c.fillStyle = '#c99a6b';
  c.fillRect(x, y, w, h);
  speck(c, x, y, w, h, r, 2600, '#5a3a22', 0.25, 2);
  speck(c, x, y, w, h, r, 1200, '#fff1d6', 0.2, 2);
  const engrave = (draw) => {
    c.fillStyle = 'rgba(255,236,200,0.55)';
    c.strokeStyle = 'rgba(255,236,200,0.55)';
    c.save();
    c.translate(2.5, 2.5);
    draw();
    c.restore();
    c.fillStyle = '#3a2214';
    c.strokeStyle = '#3a2214';
    draw();
  };
  engrave(() => {
    c.lineWidth = 3;
    c.strokeRect(x + 18, y + 18, w - 36, h - 36);
  });
  c.textAlign = 'center';
  c.font = `400 44px "${F.serif}"`;
  engrave(() => c.fillText(`— ${numeral} —`, x + w / 2, y + 74));
  let size = 74;
  let lines;
  do {
    c.font = `italic 400 ${size}px "${F.serif}"`;
    lines = wrap(c, str, w - 90);
    size -= 2;
  } while (lines.length * size * 1.1 > h - 130 && size > 30);
  const lh = (size + 2) * 1.08;
  const top = y + 110 + (h - 140 - lines.length * lh) / 2 + lh * 0.8;
  lines.forEach((ln, i) => engrave(() => c.fillText(ln, x + w / 2, top + i * lh)));
  c.textAlign = 'left';
}

function drawDigits(c, [x, y, , h], F) {
  for (let d = 0; d < 10; d++) {
    const cx = x + d * 128;
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#2a2a2a');
    g.addColorStop(0.5, '#141414');
    g.addColorStop(0.5, '#0c0c0c');
    g.addColorStop(1, '#202020');
    c.fillStyle = '#050505';
    c.fillRect(cx, y, 128, h);
    c.fillStyle = g;
    c.beginPath();
    c.roundRect(cx + 6, y + 6, 116, h - 12, 10);
    c.fill();
    c.font = `400 190px "${F.pixel}"`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#f3e9d2';
    c.fillText(String(d), cx + 64, y + h / 2 + 8);
    c.fillStyle = '#000000';
    c.fillRect(cx + 6, y + h / 2 - 2, 116, 4);
    c.fillStyle = '#555555';
    c.fillRect(cx + 2, y + h / 2 - 8, 8, 16);
    c.fillRect(cx + 118, y + h / 2 - 8, 8, 16);
  }
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
}

export function signsAtlas(ctx) {
  const { text, texts } = ctx;
  const F = text.FONTS;
  const r = seeded('oldweb-signs');
  const el = text.canvas({ width: SIGN_SIZE, height: SIGN_SIZE });
  const c = el.getContext('2d');
  c.fillStyle = '#808080';
  c.fillRect(0, 0, SIGN_SIZE, SIGN_SIZE);
  drawBanner(c, REG.banner, r, F);
  drawBoard(c, REG.prev, 'précédent', F, -1);
  drawBoard(c, REG.next, 'suivant', F, 1);
  drawCentered(c, REG.ring, "L'Anneau des pages perso", F, { bg: '#3a0a5c', fg: '#ffe600', size: 84 });
  c.fillStyle = '#ffffff';
  c.fillRect(...REG.white);
  drawCentered(c, REG.counterLabel, 'Vous êtes le visiteur n°', F, { bg: '#0c1a10', fg: '#7cff6b', size: 92 });
  drawNew(c, REG.newBanner, F);
  drawConstruction(c, REG.construction, F);
  drawStripes(c, REG.stripes);
  const riddles = texts.OLDWEB?.riddles || {};
  PEDESTAL_ORDER.forEach((k, i) => drawRiddle(c, REG[`riddle${i}`], riddles[k] || '', ['I', 'II', 'III'][i], r, F, text.wrap));
  drawDigits(c, REG.digits, F);
  drawCentered(c, REG.tagline, texts.ZONES?.oldweb?.tagline || '', F, { bg: '#111111', fg: '#ffd400', size: 80 });
  drawCentered(c, REG.hot, 'HOT !', F, { bg: '#1a0500', fg: '#ff9a1f', family: F.ui, weight: 900, size: 130, style: 'italic', stroke: ['#ffe600', 6] });
  drawCentered(c, REG.mail, 'Écrivez-moi !', F, { bg: '#0a0a3c', fg: '#5cf2ff', size: 104 });
  return canvasTex(el);
}

export function guestbookTexture(ctx) {
  const { text, texts } = ctx;
  const F = text.FONTS;
  const entries = texts.OLDWEB?.guestbook || [];
  const r = seeded('oldweb-book');
  const el = text.canvas({ width: 1024, height: 640 });
  const c = el.getContext('2d');
  c.fillStyle = '#efe2c4';
  c.fillRect(0, 0, 1024, 640);
  speck(c, 0, 0, 1024, 640, r, 3000, '#7a5a30', 0.12, 2);
  const g = c.createLinearGradient(472, 0, 552, 0);
  g.addColorStop(0, 'rgba(60,40,20,0)');
  g.addColorStop(0.5, 'rgba(60,40,20,0.35)');
  g.addColorStop(1, 'rgba(60,40,20,0)');
  c.fillStyle = g;
  c.fillRect(472, 0, 80, 640);
  c.strokeStyle = 'rgba(70,110,170,0.25)';
  c.lineWidth = 2;
  for (let yy = 92; yy < 620; yy += 34) {
    c.beginPath();
    c.moveTo(30, yy);
    c.lineTo(482, yy);
    c.moveTo(542, yy);
    c.lineTo(994, yy);
    c.stroke();
  }
  c.fillStyle = '#7a1f1a';
  c.font = `700 52px "${F.hand}"`;
  c.textAlign = 'center';
  c.fillText("Livre d'or", 256, 64);
  c.textAlign = 'left';
  c.font = `400 27px "${F.hand}"`;
  const inks = ['#1d2a6b', '#2b2118', '#5a1a5a', '#14482a'];
  let col = 0;
  let yy = 118;
  entries.forEach((e, i) => {
    const lines = text.wrap(c, e, 430);
    if (yy + lines.length * 34 > 620 && col === 0) {
      col = 1;
      yy = 84;
    }
    c.fillStyle = inks[i % inks.length];
    lines.forEach((ln) => {
      c.fillText(ln, (col ? 548 : 40) + (r() - 0.5) * 6, yy);
      yy += 34;
    });
    yy += 6;
  });
  return canvasTex(el);
}

export function floppyLabel(ctx) {
  const F = ctx.text.FONTS;
  const el = ctx.text.canvas({ width: 512, height: 384 });
  const c = el.getContext('2d');
  c.fillStyle = '#f4f1e8';
  c.fillRect(0, 0, 512, 384);
  c.fillStyle = '#2a4aa0';
  c.fillRect(0, 0, 512, 46);
  c.fillStyle = '#ffffff';
  c.font = `700 30px "${F.ui}"`;
  c.fillText('HD  1.44 MB', 20, 34);
  c.strokeStyle = 'rgba(42,74,160,0.35)';
  c.lineWidth = 2;
  for (let y = 110; y < 384; y += 62) {
    c.beginPath();
    c.moveTo(16, y);
    c.lineTo(496, y);
    c.stroke();
  }
  c.fillStyle = '#1b2b8a';
  c.font = `700 58px "${F.hand}"`;
  c.fillText('RAPPORT DE STAGE', 22, 102);
  c.fillStyle = '#b01818';
  c.font = `700 52px "${F.hand}"`;
  c.fillText('NE PAS EFFACER', 30, 166);
  c.fillStyle = '#1b2b8a';
  c.font = `400 50px "${F.hand}"`;
  c.fillText('(v4 finale)', 150, 228);
  c.font = `400 40px "${F.hand}"`;
  c.fillText('v5 ?', 380, 300);
  c.strokeStyle = '#1b2b8a';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(372, 288);
  c.lineTo(462, 276);
  c.stroke();
  return canvasTex(el);
}

export function cdSleeve(ctx) {
  const F = ctx.text.FONTS;
  const el = ctx.text.canvas({ width: 512, height: 512 });
  const c = el.getContext('2d');
  const g = c.createLinearGradient(0, 0, 512, 512);
  g.addColorStop(0, '#0b3fbf');
  g.addColorStop(1, '#2fb7ff');
  c.fillStyle = g;
  c.fillRect(0, 0, 512, 512);
  const r = seeded('cd');
  stars(c, 0, 0, 512, 512, r, 120);
  c.beginPath();
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const rr = i % 2 ? 120 : 175;
    c.lineTo(330 + Math.cos(a) * rr, 190 + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = '#ffe600';
  c.fill();
  c.textAlign = 'center';
  c.fillStyle = '#d4141c';
  c.font = `900 italic 112px "${F.ui}"`;
  c.fillText('50', 330, 196);
  c.font = `900 italic 40px "${F.ui}"`;
  c.fillText('HEURES', 330, 238);
  c.fillText('GRATUITES !', 330, 278);
  c.fillStyle = '#ffffff';
  c.font = `800 44px "${F.ui}"`;
  c.textAlign = 'left';
  c.fillText('Internet', 26, 380);
  c.font = `600 32px "${F.ui}"`;
  c.fillText('en 5 minutes', 26, 420);
  c.font = `500 22px "${F.ui}"`;
  c.fillStyle = '#cfe8ff';
  c.fillText('CD-ROM de connexion — Win 95/98 — Mac', 26, 482);
  return canvasTex(el);
}
