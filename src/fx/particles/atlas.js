import * as THREE from 'three';

export const ATLAS_GRID = 8;
export const LEAF_CELLS = [0, 4];
export const PAPER_CELLS = [4, 4];
export const GLYPH_CELLS = [8, 56];
const GLYPHS = 'abcdefghijklmnopqrstuvwxyzéèàçAEMNRST?!,;:.…"\'&()-—@#*';

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawLeaf(c, x, y, s, r) {
  const len = s * (0.78 + r() * 0.12);
  const wid = s * (0.3 + r() * 0.14);
  c.save();
  c.translate(x + s / 2, y + s / 2);
  c.rotate(-Math.PI / 4 + (r() - 0.5) * 0.4);
  const g = c.createLinearGradient(-wid, 0, wid, 0);
  g.addColorStop(0, '#c9c9c9');
  g.addColorStop(0.5, '#ffffff');
  g.addColorStop(1, '#b4b4b4');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, -len / 2);
  c.bezierCurveTo(wid * 1.1, -len * 0.25, wid * 0.9, len * 0.25, 0, len / 2);
  c.bezierCurveTo(-wid * 0.9, len * 0.25, -wid * 1.1, -len * 0.25, 0, -len / 2);
  c.fill();
  c.strokeStyle = 'rgba(90, 90, 90, 0.75)';
  c.lineWidth = s * 0.025;
  c.beginPath();
  c.moveTo(0, -len * 0.45);
  c.lineTo(0, len * 0.56);
  for (let i = 1; i < 5; i++) {
    const yy = -len * 0.35 + i * len * 0.16;
    c.moveTo(0, yy);
    c.lineTo(wid * 0.6, yy - len * 0.1);
    c.moveTo(0, yy);
    c.lineTo(-wid * 0.6, yy - len * 0.1);
  }
  c.stroke();
  c.restore();
}

function drawPaper(c, x, y, s, r) {
  const w = s * (0.56 + r() * 0.1);
  const h = s * (0.72 + r() * 0.1);
  c.save();
  c.translate(x + s / 2, y + s / 2);
  c.rotate((r() - 0.5) * 0.3);
  c.fillStyle = '#f3ecdc';
  c.beginPath();
  c.moveTo(-w / 2, -h / 2);
  c.lineTo(w / 2 - w * 0.16 * r(), -h / 2);
  c.lineTo(w / 2, -h / 2 + h * 0.12);
  c.lineTo(w / 2, h / 2);
  c.quadraticCurveTo(0, h / 2 - h * 0.05 * r(), -w / 2, h / 2);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(60, 48, 36, 0.55)';
  c.lineWidth = s * 0.018;
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const yy = -h * 0.32 + i * h * 0.12;
    const end = w * (0.2 + r() * 0.22);
    c.moveTo(-w * 0.36, yy);
    for (let xx = -w * 0.36; xx < end; xx += s * 0.04) c.lineTo(xx, yy + (r() - 0.5) * s * 0.012);
  }
  c.stroke();
  c.restore();
}

export function createAtlas({ font = 'Caveat', size = 1024 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  const cell = size / ATLAS_GRID;
  const r = rand(20311116);
  const at = (i) => [(i % ATLAS_GRID) * cell, Math.floor(i / ATLAS_GRID) * cell];
  for (let i = 0; i < LEAF_CELLS[1]; i++) drawLeaf(c, ...at(LEAF_CELLS[0] + i), cell, r);
  for (let i = 0; i < PAPER_CELLS[1]; i++) drawPaper(c, ...at(PAPER_CELLS[0] + i), cell, r);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#ffffff';
  for (let i = 0; i < GLYPH_CELLS[1]; i++) {
    const [x, y] = at(GLYPH_CELLS[0] + i);
    const ch = GLYPHS[i % GLYPHS.length];
    c.save();
    c.translate(x + cell / 2, y + cell / 2 + cell * 0.04);
    c.rotate((r() - 0.5) * 0.35);
    c.font = `${r() > 0.5 ? 700 : 400} ${Math.round(cell * (0.66 + r() * 0.12))}px "${font}"`;
    c.shadowColor = 'rgba(255, 255, 255, 0.55)';
    c.shadowBlur = cell * 0.06;
    c.fillText(ch, 0, 0);
    c.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.premultiplyAlpha = true;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  return tex;
}
