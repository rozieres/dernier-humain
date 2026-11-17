import * as THREE from 'three';

export function makeAtlas(ctx, specs, { cols, rows, cellW, cellH, pad = 6 }) {
  const W = cols * cellW;
  const H = rows * cellH;
  const rects = [];
  const canvas = ctx.text.canvas({
    width: W,
    height: H,
    draw(c) {
      specs.forEach((spec, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const tex = ctx.text.texture({ ...spec, width: cellW - pad * 2, height: cellH - pad * 2 });
        c.drawImage(tex.image, col * cellW + pad, row * cellH + pad);
        tex.dispose();
        rects.push({
          u0: (col * cellW + pad) / W,
          u1: ((col + 1) * cellW - pad) / W,
          v0: 1 - ((row + 1) * cellH - pad) / H,
          v1: 1 - (row * cellH + pad) / H,
        });
      });
    },
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, rects };
}

export class QuadKit {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.nrm = [];
  }

  add(rect, w, h, matrix) {
    const corners = [[-w / 2, -h / 2, rect.u0, rect.v0], [w / 2, -h / 2, rect.u1, rect.v0], [w / 2, h / 2, rect.u1, rect.v1], [-w / 2, h / 2, rect.u0, rect.v1]];
    const v = new THREE.Vector3();
    const n = new THREE.Vector3(0, 0, 1).transformDirection(matrix);
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const [x, y, u, vv] = corners[k];
      v.set(x, y, 0).applyMatrix4(matrix);
      this.pos.push(v.x, v.y, v.z);
      this.uv.push(u, vv);
      this.nrm.push(n.x, n.y, n.z);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}
