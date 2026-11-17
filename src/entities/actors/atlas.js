import * as THREE from 'three';

export function createAtlas(ctx, { cols, rows, cellW, cellH, pad = 6 }) {
  const canvas = ctx.text.canvas({ width: cols * cellW, height: rows * cellH });
  const c2d = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy());
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;

  return {
    texture,
    capacity: cols * rows,
    draw(slot, spec) {
      const x = (slot % cols) * cellW;
      const y = Math.floor(slot / cols) * cellH;
      const tex = ctx.text.texture({ ...spec, width: cellW, height: cellH });
      c2d.clearRect(x, y, cellW, cellH);
      c2d.drawImage(tex.image, x, y);
      tex.dispose();
      texture.needsUpdate = true;
    },
    rect(slot, out = new THREE.Vector4()) {
      const W = cols * cellW;
      const H = rows * cellH;
      const x = (slot % cols) * cellW + pad;
      const y = Math.floor(slot / cols) * cellH + pad;
      return out.set(x / W, 1 - (y + cellH - 2 * pad) / H, (cellW - 2 * pad) / W, (cellH - 2 * pad) / H);
    },
  };
}
