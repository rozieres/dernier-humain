import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import { createWorld } from '../src/world/worldmap.js';

await Promise.all(['italic 26px "Instrument Serif"', '34px "Instrument Serif"', '600 13px Inter', '13px Inter'].map((f) => document.fonts.load(f, 'éà▲')));
const world = createWorld();
const PX = Math.min(window.innerWidth, window.innerHeight) || 1400;
const canvas = document.getElementById('map');
canvas.width = PX;
canvas.height = PX;
const c = canvas.getContext('2d');

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const COLORS = {
  meadow: hex('#7fae4a'), feed: hex('#c9ccd6'), farm: hex('#d9b44a'), hallu: hex('#9a86b8'),
  oldweb: hex('#c98a5a'), forest: hex('#2b4a36'), sand: hex('#e6d3a3'), rock: hex('#8a8178'), path: hex('#a07a52'),
};
const SEA_DEEP = hex('#0e3a4a');
const SEA_SHALLOW = hex('#2bb7b3');

const params = new URLSearchParams(location.search);
const SPAN = Number(params.get('span') || world.SIZE);
const CX = Number(params.get('cx') || 0);
const CZ = Number(params.get('cz') || 0);
const toWorld = (p, c0 = CX) => c0 - SPAN / 2 + (p / PX) * SPAN;
const toPx = (w, c0 = CX) => ((w - c0 + SPAN / 2) / SPAN) * PX;

const img = c.createImageData(PX, PX);
const light = [-0.55, 0.62, -0.55];
const ll = Math.hypot(...light);
const step = Math.max(world.CELL, SPAN / PX);
for (let py = 0; py < PX; py++) {
  const z = toWorld(py + 0.5, CZ);
  for (let px = 0; px < PX; px++) {
    const x = toWorld(px + 0.5);
    const h = world.heightAt(x, z);
    let col;
    if (h < 0) {
      const t = Math.min(1, -h / 30);
      col = SEA_SHALLOW.map((v, i) => v + (SEA_DEEP[i] - v) * Math.sqrt(t));
    } else {
      const b = world.biomeAt(x, z);
      col = [0, 0, 0];
      for (const k of ['meadow', 'feed', 'farm', 'hallu', 'oldweb', 'forest', 'sand', 'rock']) {
        for (let i = 0; i < 3; i++) col[i] += COLORS[k][i] * b[k];
      }
      const sum = b.meadow + b.feed + b.farm + b.hallu + b.oldweb + b.forest + b.sand + b.rock || 1;
      col = col.map((v) => v / sum);
      col = col.map((v, i) => v + (COLORS.path[i] - v) * b.path * 0.85);
      const tint = 0.85 + 0.25 * Math.min(1, h / 180);
      col = col.map((v) => v * tint);
    }
    const hx = (world.heightAt(x + step, z) - world.heightAt(x - step, z)) / (2 * step);
    const hz = (world.heightAt(x, z + step) - world.heightAt(x, z - step)) / (2 * step);
    const nl = Math.hypot(hx, 1, hz);
    const dot = (-hx * light[0] + light[1] - hz * light[2]) / (nl * ll);
    const shade = h < 0 ? 0.92 + 0.08 * dot : 0.45 + 0.75 * Math.max(0, dot);
    let contour = 1;
    if (h > 0.5) {
      const iv = h % 50 < 1.6 ? 0.72 : h % 10 < 0.5 ? 0.88 : 1;
      contour = iv;
    }
    const o = (py * PX + px) * 4;
    img.data[o] = Math.min(255, col[0] * shade * contour);
    img.data[o + 1] = Math.min(255, col[1] * shade * contour);
    img.data[o + 2] = Math.min(255, col[2] * shade * contour);
    img.data[o + 3] = 255;
  }
}
c.putImageData(img, 0, 0);

c.lineCap = 'round';
c.lineJoin = 'round';
for (const p of world.paths) {
  c.strokeStyle = 'rgba(60, 35, 15, 0.55)';
  c.lineWidth = 2.2;
  c.setLineDash([]);
  c.beginPath();
  p.points.forEach(([x, z], i) => (i ? c.lineTo(toPx(x), toPx(z, CZ)) : c.moveTo(toPx(x), toPx(z, CZ))));
  c.stroke();
}

const zones = Object.values(world.zones);
c.setLineDash([6, 6]);
c.lineWidth = 2;
for (const z of zones) {
  if (!z.arrival) continue;
  c.strokeStyle = z.id === 'lighthouse' ? 'rgba(255, 75, 62, 0.9)' : 'rgba(46, 125, 255, 0.95)';
  c.beginPath();
  c.moveTo(toPx(z.hubEnd[0]), toPx(z.hubEnd[2], CZ));
  c.lineTo(toPx(z.arrival[0]), toPx(z.arrival[2], CZ));
  c.stroke();
}
c.setLineDash([]);

for (const z of zones) {
  c.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(toPx(z.center[0]), toPx(z.center[1], CZ), (z.radius / SPAN) * PX, 0, Math.PI * 2);
  c.stroke();
  if (z.arrival) {
    c.fillStyle = '#2e7dff';
    c.beginPath();
    c.arc(toPx(z.arrival[0]), toPx(z.arrival[2], CZ), 5, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5;
    c.stroke();
  }
  const label = z.name;
  c.font = 'italic 26px "Instrument Serif"';
  const w = c.measureText(label).width;
  const lx = toPx(z.center[0]) - w / 2;
  const ly = toPx(z.center[1], CZ) - (z.radius / SPAN) * PX - 8;
  c.fillStyle = 'rgba(11, 13, 16, 0.55)';
  c.fillRect(lx - 6, ly - 22, w + 12, 30);
  c.fillStyle = '#f2efe8';
  c.fillText(label, lx, ly);
}

const peak = world.zones.feed.massifPeak;
c.fillStyle = '#f2efe8';
c.font = '600 13px Inter';
c.fillText(`▲ Monts du Cache ${peak[1].toFixed(0)} m`, toPx(peak[0]) - 4, toPx(peak[2], CZ) + 4);
const pier = world.zones.lighthouse.pier;
c.fillText('◆ ponton', toPx(pier[0]) - 4, toPx(pier[2], CZ) + 4);

c.fillStyle = 'rgba(11, 13, 16, 0.7)';
c.fillRect(16, 16, 330, 74);
c.fillStyle = '#f2efe8';
c.font = '34px "Instrument Serif"';
c.fillText("L'île", 28, 52);
c.font = '13px Inter';
c.fillText(`génération ${world.generationMs.toFixed(0)} ms · 641² · 4 m · N en haut`, 28, 76);

window.__map = { ready: true, ms: world.generationMs };
