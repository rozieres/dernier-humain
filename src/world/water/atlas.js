import * as THREE from 'three';

export const ATLAS = { width: 2048, row: 64, rows: 64, fontSize: 40, baseline: 44 };

const PICTO = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

export async function buildTextAtlas(ctx, lines, seed = 'sea-atlas') {
  await ctx.text.ready;
  const { width: W, row: RH, rows: ROWS, fontSize, baseline } = ATLAS;
  const H = RH * ROWS;
  const clean = lines.map((l) => l.replace(PICTO, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const font = `600 ${fontSize}px "${ctx.text.FONTS.ui}"`;
  const gapMin = fontSize * 2.2;

  const el = ctx.text.canvas({
    width: W,
    height: H,
    draw(c) {
      c.fillStyle = '#000';
      c.fillRect(0, 0, W, H);
      c.font = font;
      c.fillStyle = '#fff';
      c.textBaseline = 'alphabetic';
      const rows = [];
      let pass = 0;
      while (rows.length < ROWS && clean.length) {
        const r = ctx.rng.seeded(`${seed}:${pass++}`);
        const order = clean.map((l) => [r(), l]).sort((a, b) => a[0] - b[0]).map(([, l]) => l);
        let cur = [];
        let used = 0;
        for (const line of order) {
          const w = Math.min(c.measureText(line).width, W - gapMin);
          if (cur.length && used + w + gapMin * (cur.length + 1) > W) {
            rows.push(cur);
            cur = [];
            used = 0;
            if (rows.length >= ROWS) break;
          }
          cur.push({ line, w });
          used += w;
        }
        if (cur.length && rows.length < ROWS) rows.push(cur);
      }
      rows.forEach((items, i) => {
        const used = items.reduce((a, it) => a + it.w, 0);
        const gap = (W - used) / items.length;
        let x = gap / 2;
        for (const it of items) {
          c.fillText(it.line, x, i * RH + baseline, W - gapMin);
          x += it.w + gap;
        }
      });
    },
  });

  const rgba = el.getContext('2d').getImageData(0, 0, W, H).data;
  const red = new Uint8Array(W * H);
  for (let i = 0; i < red.length; i++) red[i] = rgba[i * 4];
  const tex = new THREE.DataTexture(red, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = ctx.renderer.capabilities.getMaxAnisotropy();
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}
