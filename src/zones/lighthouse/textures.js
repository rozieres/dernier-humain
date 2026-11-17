import * as THREE from 'three';
import { seeded } from '../../core/rng.js';

const SERIF = '"Instrument Serif"';
const MONO = '"IBM Plex Mono"';
const HAND = '"Caveat"';

function wrap(c, text, maxWidth) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(/ +/)) {
      const test = line ? `${line} ${w}` : w;
      if (c.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = w;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

function liveTexture(ctx, width, height, draw) {
  const el = ctx.text.canvas({ width, height });
  const tex = new THREE.CanvasTexture(el);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const redraw = (...args) => {
    const c = el.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, width, height);
    draw(c, width, height, ...args);
    tex.needsUpdate = true;
  };
  return { tex, redraw };
}

export function crtPage(ctx) {
  const { LIGHTHOUSE } = ctx.texts;
  const live = liveTexture(ctx, 640, 496, (c, w, h, { replies = 0 } = {}) => {
    c.fillStyle = '#7d7d7d';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#8f8f8f';
    c.fillRect(0, 0, w, 54);
    c.fillStyle = '#808080';
    c.fillRect(0, 53, w, 2);
    c.font = `500 15px ${MONO}`;
    c.fillStyle = '#000';
    c.fillText('Fichier  Édition  Affichage  Aller  Signets', 12, 20);
    c.fillStyle = '#a8a8a8';
    c.fillRect(70, 29, w - 82, 20);
    c.strokeStyle = '#7a7a7a';
    c.strokeRect(70.5, 29.5, w - 83, 19);
    c.fillStyle = '#000';
    c.font = `400 13px ${MONO}`;
    c.fillText('Adresse :', 8, 44);
    c.fillText(LIGHTHOUSE.final.url, 76, 44);
    c.fillStyle = '#9e9b92';
    c.fillRect(8, 62, w - 16, h - 70);
    const x = 26;
    let y = 104;
    c.fillStyle = '#111';
    c.font = `700 38px ${SERIF}`;
    c.fillText(LIGHTHOUSE.final.site, x, y);
    y += 16;
    c.fillStyle = '#555';
    c.fillRect(x, y, w - 2 * x, 2);
    y += 28;
    const recent = LIGHTHOUSE.log.slice(-4);
    for (const entry of recent) {
      c.font = `700 18px ${SERIF}`;
      c.fillStyle = '#111';
      c.fillText(entry.date, x, y);
      y += 22;
      c.font = `400 18px ${SERIF}`;
      for (const line of wrap(c, entry.text, w - 2 * x).slice(0, 2)) {
        c.fillText(line, x, y);
        y += 21;
      }
      y += 8;
    }
    c.font = `700 19px ${SERIF}`;
    c.fillText(LIGHTHOUSE.final.date, x, y);
    y += 22;
    c.font = `400 18px ${SERIF}`;
    c.fillText(LIGHTHOUSE.final.body[0], x, y);
    y += 21;
    c.fillText('[…]', x, y);
    y += 20;
    c.fillStyle = '#555';
    c.fillRect(x, y, w - 2 * x, 1);
    y += 24;
    c.font = `400 17px ${SERIF}`;
    c.fillStyle = '#1a0dab';
    c.fillText('Archives', x, y);
    c.fillRect(x, y + 3, c.measureText('Archives').width, 1);
    c.fillStyle = '#111';
    c.fillText('  |  ', x + c.measureText('Archives').width, y);
    const rx = x + c.measureText('Archives  |  ').width;
    if (replies > 0) {
      c.font = `700 19px ${SERIF}`;
      c.fillStyle = '#7a1408';
      c.fillText(replies === 1 ? '1 réponse.' : `${replies} réponses.`, rx, y);
    } else {
      c.fillStyle = '#1a0dab';
      c.fillText('Écrire', rx, y);
      c.fillRect(rx, y + 3, c.measureText('Écrire').width, 1);
    }
  });
  live.redraw({ replies: 0 });
  return live;
}

export function robotsSign(ctx) {
  const { LIGHTHOUSE } = ctx.texts;
  const r = seeded('robots');
  const el = ctx.text.canvas({
    width: 512,
    height: 352,
    draw(c, w, h) {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#6e4b2c');
      g.addColorStop(1, '#5a3c22');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        c.strokeStyle = `rgba(${r() < 0.6 ? '30,18,8' : '160,120,80'},${0.08 + r() * 0.15})`;
        c.lineWidth = 0.6 + r() * 1.6;
        const y0 = r() * h;
        c.beginPath();
        for (let x = 0; x <= w; x += 12) c.lineTo(x, y0 + Math.sin(x * 0.015 + i) * 2.5);
        c.stroke();
      }
      c.strokeStyle = 'rgba(25,14,6,0.7)';
      c.lineWidth = 6;
      c.strokeRect(8, 8, w - 16, h - 16);
      c.font = `500 21px ${MONO}`;
      let y = 46;
      for (const line of LIGHTHOUSE.robotsTxt.split('\n')) {
        if (line) {
          const comment = line.startsWith('#');
          c.fillStyle = comment ? 'rgba(236, 224, 196, 0.78)' : '#f4ead2';
          c.font = `${comment ? 400 : 500} ${comment ? 18 : 25}px ${MONO}`;
          for (const l of wrap(c, line, w - 56)) {
            c.fillText(l, 28 + (r() - 0.5) * 1.5, y);
            y += comment ? 25 : 31;
          }
        } else y += 12;
      }
    },
  });
  const tex = new THREE.CanvasTexture(el);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function calendarTexture(ctx) {
  const el = ctx.text.canvas({
    width: 256,
    height: 352,
    draw(c, w, h) {
      c.fillStyle = '#f1ead8';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#9c2b1f';
      c.fillRect(0, 0, w, 64);
      c.fillStyle = '#fff6e8';
      c.textAlign = 'center';
      c.font = `700 30px ${SERIF}`;
      c.fillText('NOVEMBRE 2031', w / 2, 42);
      c.fillStyle = '#2b2118';
      c.font = `700 150px ${SERIF}`;
      c.fillText('16', w / 2, 210);
      c.font = `400 34px ${SERIF}`;
      c.fillText('Dimanche', w / 2, 256);
      c.font = `400 19px ${SERIF}`;
      c.fillStyle = '#5a4a3a';
      c.fillText('Pleine mer 6 h 12 · 18 h 31', w / 2, 296);
      c.fillText('Coeff. 82', w / 2, 322);
      c.textAlign = 'left';
      c.font = `400 26px ${HAND}`;
      c.fillStyle = '#20307a';
      c.fillText('écrire', 150, 172);
    },
  });
  const tex = new THREE.CanvasTexture(el);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function frenchDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

const NOTE_SLOTS = [
  [0.4, 0.5], [0.64, 0.47], [0.38, 0.79], [0.63, 0.8], [0.16, 0.55], [0.86, 0.53],
  [0.15, 0.83], [0.86, 0.82], [0.4, 0.22], [0.64, 0.2], [0.86, 0.24], [0.17, 0.27],
];

export function boardTexture(ctx) {
  const { LIGHTHOUSE } = ctx.texts;
  const W = 1024;
  const H = 736;
  return liveTexture(ctx, W, H, (c, w, h, messages = []) => {
    const r = seeded('cork');
    c.fillStyle = '#a87a4c';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) {
      const t = r();
      c.fillStyle = t < 0.5 ? `rgba(70,40,15,${0.1 + r() * 0.3})` : `rgba(230,190,140,${0.08 + r() * 0.25})`;
      c.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5);
    }
    c.fillStyle = '#5a3b20';
    c.fillRect(0, 0, w, 20);
    c.fillRect(0, h - 20, w, 20);
    c.fillRect(0, 0, 20, h);
    c.fillRect(w - 20, 0, 20, h);
    const label = ctx.text.texture({ style: 'human', width: 384, height: 96, body: LIGHTHOUSE.board.title, seed: 7 });
    const lx = messages.length > 10 ? w * 0.5 : w * 0.24;
    c.save();
    c.translate(lx, 66);
    c.rotate(-0.025);
    c.shadowColor = 'rgba(0,0,0,0.35)';
    c.shadowBlur = 8;
    c.shadowOffsetY = 3;
    c.drawImage(label.image, -150, -36, 300, 75);
    c.restore();
    label.dispose();
    pin(c, lx, 40, '#c23a2a');
    const list = messages.slice(-12);
    if (!list.length) {
      const card = ctx.text.texture({ style: 'human', width: 384, height: 256, body: LIGHTHOUSE.board.empty, seed: 3 });
      c.save();
      c.translate(w * 0.5, h * 0.55);
      c.rotate(0.03);
      c.shadowColor = 'rgba(0,0,0,0.4)';
      c.shadowBlur = 12;
      c.shadowOffsetY = 5;
      c.drawImage(card.image, -190, -127, 380, 254);
      c.restore();
      card.dispose();
      pin(c, w * 0.5, h * 0.55 - 112, '#2a62c2');
      return;
    }
    list.forEach((m, i) => {
      const [sx, sy] = NOTE_SLOTS[i];
      const nr = seeded(`note${i}${m.date}`);
      const card = ctx.text.texture({ style: 'human', width: 256, height: 224, body: m.text || '…', meta: frenchDate(m.date), seed: i * 17 + 5, fontSize: 40 });
      const cw = 210;
      const ch = 184;
      c.save();
      c.translate(sx * w + (nr() - 0.5) * 14, sy * h + (nr() - 0.5) * 12);
      c.rotate((nr() - 0.5) * 0.14);
      c.shadowColor = 'rgba(0,0,0,0.45)';
      c.shadowBlur = 10;
      c.shadowOffsetY = 4;
      c.drawImage(card.image, -cw / 2, -ch / 2, cw, ch);
      c.restore();
      card.dispose();
      pin(c, sx * w, sy * h - ch / 2 + 12, ['#c23a2a', '#2a62c2', '#e0b030', '#3a9a52'][i % 4]);
    });
  });
}

function pin(c, x, y, color) {
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.5)';
  c.shadowBlur = 4;
  c.shadowOffsetX = 3;
  c.shadowOffsetY = 3;
  const g = c.createRadialGradient(x - 3, y - 3, 1, x, y, 10);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.3, color);
  g.addColorStop(1, '#1a1a1a');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, 9, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

export function kioskScreen(ctx) {
  const doc = ctx.texts.SYNTH_DOCS.lighthouse_copy;
  const tex = ctx.text.texture({ style: 'post', width: 512, height: 768, author: 'Maryvonne', handle: '@gardienne.storyteller', meta: doc.date, title: doc.title, body: doc.body, footer: '#résilience', accent: '#5ce1e6', fontSize: 30 });
  return tex;
}

export function crackTexture() {
  const r = seeded('crack');
  const el = document.createElement('canvas');
  el.width = 256;
  el.height = 384;
  const c = el.getContext('2d');
  c.clearRect(0, 0, 256, 384);
  const cx = 170;
  const cy = 120;
  c.strokeStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 9; i++) {
    let x = cx;
    let y = cy;
    const a0 = r() * Math.PI * 2;
    c.lineWidth = 1 + r() * 1.5;
    c.beginPath();
    c.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      const a = a0 + (r() - 0.5) * 0.8;
      x += Math.cos(a) * (14 + r() * 26);
      y += Math.sin(a) * (14 + r() * 26);
      c.lineTo(x, y);
    }
    c.stroke();
  }
  c.fillStyle = 'rgba(10,12,16,0.92)';
  c.beginPath();
  c.moveTo(0, 300);
  c.lineTo(256, 250);
  c.lineTo(256, 384);
  c.lineTo(0, 384);
  c.fill();
  const tex = new THREE.CanvasTexture(el);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
