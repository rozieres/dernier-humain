import * as THREE from 'three';

function finish(canvas, renderer) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1);
  return tex;
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

export const POST_GRID = 4;

export function buildPostAtlas(ctx) {
  const S = 512;
  const N = POST_GRID;
  const rand = ctx.rng.seeded('feed:posts');
  const canvas = ctx.text.canvas({ width: N * S, height: N * S });
  const c = canvas.getContext('2d');
  const accents = ['#5ce1e6', '#ff5fa2', '#2e7dff', '#9b6bff'];
  for (let i = 0; i < N * N; i++) {
    const p = ctx.texts.slopPost(rand);
    const tex = ctx.text.texture({
      style: 'post', width: S, height: S, author: p.author, handle: p.handle, body: p.text, meta: p.age,
      accent: accents[i % accents.length], seed: 9100 + i, fontSize: 27,
    });
    c.drawImage(tex.image, (i % N) * S, Math.floor(i / N) * S);
    tex.dispose();
  }
  return finish(canvas, ctx.renderer);
}

export const POPUP_GRID = [4, 4];
export const POPUP_ASPECT = 384 / 512;

export function buildPopupAtlas(ctx) {
  const W = 512;
  const H = 384;
  const [nx, ny] = POPUP_GRID;
  const { FONTS } = ctx.text;
  const canvas = ctx.text.canvas({ width: nx * W, height: ny * H });
  const c = canvas.getContext('2d');
  const list = ctx.texts.POPUPS;
  for (let i = 0; i < nx * ny; i++) {
    const p = list[i % list.length];
    c.save();
    c.translate((i % nx) * W, Math.floor(i / nx) * H);
    roundRect(c, 6, 6, W - 12, H - 12, 26);
    c.fillStyle = '#fbfcff';
    c.fill();
    c.save();
    c.clip();
    const g = c.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, i % 2 ? '#ff5fa2' : '#5ce1e6');
    g.addColorStop(1, i % 2 ? '#9b6bff' : '#2e7dff');
    c.fillStyle = g;
    c.fillRect(0, 0, W, 74);
    const gloss = c.createLinearGradient(0, 0, 0, H);
    gloss.addColorStop(0, 'rgba(255,255,255,0.35)');
    gloss.addColorStop(0.3, 'rgba(255,255,255,0)');
    c.fillStyle = gloss;
    c.fillRect(0, 0, W, H);
    c.restore();
    c.lineWidth = 4;
    c.strokeStyle = '#dfe4f0';
    roundRect(c, 6, 6, W - 12, H - 12, 26);
    c.stroke();
    c.fillStyle = '#ffffff';
    c.font = `700 27px "${FONTS.ui}"`;
    let title = p.title;
    while (c.measureText(title).width > W - 130 && title.length > 4) title = `${title.slice(0, -2)}…`;
    c.fillText(title, 30, 48);
    c.beginPath();
    c.arc(W - 46, 40, 24, 0, Math.PI * 2);
    c.fillStyle = '#ffffff';
    c.fill();
    c.strokeStyle = '#ff4b3e';
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(W - 55, 31);
    c.lineTo(W - 37, 49);
    c.moveTo(W - 37, 31);
    c.lineTo(W - 55, 49);
    c.stroke();
    c.fillStyle = '#20263a';
    c.font = `400 25px "${FONTS.ui}"`;
    const lines = ctx.text.wrap(c, p.body, W - 64).slice(0, 5);
    lines.forEach((l, k) => c.fillText(l, 32, 122 + k * 33));
    const bw = Math.min(W - 64, c.measureText(p.cta).width + 90);
    roundRect(c, (W - bw) / 2, H - 82, bw, 52, 26);
    const b = c.createLinearGradient(0, H - 82, 0, H - 30);
    b.addColorStop(0, '#ff7ab4');
    b.addColorStop(1, '#ff4f97');
    c.fillStyle = b;
    c.fill();
    c.fillStyle = '#ffffff';
    c.font = `700 24px "${FONTS.ui}"`;
    c.textAlign = 'center';
    c.fillText(p.cta, W / 2, H - 47);
    c.textAlign = 'left';
    c.restore();
  }
  return finish(canvas, ctx.renderer);
}

export const NUMERAL_GRID = [4, 6];

export function buildNumeralAtlas(ctx) {
  const W = 512;
  const H = 256;
  const [nx, ny] = NUMERAL_GRID;
  const canvas = ctx.text.canvas({ width: nx * W, height: ny * H });
  const c = canvas.getContext('2d');
  const years = ctx.texts.FEED.years;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (let i = 0; i < nx * ny; i++) {
    const year = years[i % years.length];
    const x = (i % nx) * W + W / 2;
    const y = Math.floor(i / nx) * H + H / 2 + 8;
    c.font = `700 236px "${ctx.text.FONTS.ui}"`;
    let size = 236;
    while (c.measureText(year).width > W - 30 && size > 60) {
      size -= 6;
      c.font = `700 ${size}px "${ctx.text.FONTS.ui}"`;
    }
    c.lineWidth = 14;
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.strokeText(year, x, y);
    c.fillStyle = '#ffffff';
    c.fillText(year, x, y);
  }
  return finish(canvas, ctx.renderer);
}

export const SIGN_GRID = [2, 4];

export function buildSignAtlas(ctx) {
  const W = 512;
  const H = 256;
  const [nx, ny] = SIGN_GRID;
  const canvas = ctx.text.canvas({ width: nx * W, height: ny * H });
  const c = canvas.getContext('2d');
  const signs = ctx.texts.FEED.signage;
  for (let i = 0; i < nx * ny; i++) {
    const tex = ctx.text.texture({
      style: 'sign', width: W, height: H, title: signs[i % signs.length], accent: i % 3 === 2 ? '#ff5fa2' : '#101626',
      fg: i % 3 === 2 ? '#ffffff' : '#bff6f8', seed: 400 + i, fontSize: 116,
    });
    c.drawImage(tex.image, (i % nx) * W, Math.floor(i / nx) * H);
    tex.dispose();
  }
  return finish(canvas, ctx.renderer);
}

export function atlasRect(index, [nx, ny]) {
  const col = index % nx;
  const row = Math.floor(index / nx) % ny;
  return [col / nx, 1 - (row + 1) / ny, 1 / nx, 1 / ny];
}
