import { clamp } from './dom.js';

function beatShape(t) {
  const g = (c, w, a) => a * Math.exp(-((t - c) * (t - c)) / (2 * w * w));
  return g(0.1, 0.035, 0.14) + g(0.215, 0.018, -0.18) + g(0.25, 0.02, 1) + g(0.29, 0.02, -0.32) + g(0.48, 0.06, 0.26);
}

export function createSignalMeter(canvas, { color = '#ffb454', reduce = () => false } = {}) {
  const c2d = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let dpr = 1;
  let samples = new Float32Array(1);
  let head = 0;
  let carry = 0;
  let phase = 0;
  let target = 0;
  let level = 0;
  let dirty = true;
  let flatDrawn = false;
  let warm = false;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const r = Math.min(2, window.devicePixelRatio || 1);
    if (w === width && h === height && r === dpr) return;
    width = w;
    height = h;
    dpr = r;
    canvas.width = Math.round(w * r);
    canvas.height = Math.round(h * r);
    samples = new Float32Array(w + 1);
    head = 0;
    dirty = true;
    flatDrawn = false;
  }

  function sample() {
    const noise = (Math.random() - 0.5) * 0.05 * level;
    return beatShape(phase) * Math.sqrt(level) + noise;
  }

  function step(dt) {
    level += (target - level) * Math.min(1, dt * 3);
    if (Math.abs(level - target) < 0.002) level = target;
    const rate = 0.7 + 1.5 * level;
    const speed = reduce() ? 40 : 56;
    carry += speed * dt;
    const n = samples.length;
    while (carry >= 1) {
      carry -= 1;
      phase += rate / speed;
      if (phase >= 1) phase -= 1;
      samples[head] = sample();
      head = (head + 1) % n;
      dirty = true;
    }
  }

  function draw() {
    const w = width * dpr;
    const h = height * dpr;
    c2d.setTransform(1, 0, 0, 1, 0, 0);
    c2d.clearRect(0, 0, w, h);
    const mid = h * 0.74;
    const amp = h * 0.7;
    const n = samples.length;
    const dx = w / (n - 1);

    c2d.strokeStyle = 'rgba(242,239,232,0.10)';
    c2d.lineWidth = dpr;
    c2d.setLineDash([2 * dpr, 4 * dpr]);
    c2d.beginPath();
    c2d.moveTo(0, mid + 0.5);
    c2d.lineTo(w, mid + 0.5);
    c2d.stroke();
    c2d.setLineDash([]);

    const grad = c2d.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(255,180,84,0)');
    grad.addColorStop(0.55, 'rgba(255,180,84,0.55)');
    grad.addColorStop(1, color);
    c2d.strokeStyle = level > 0.001 ? grad : 'rgba(242,239,232,0.42)';
    c2d.lineWidth = 1.5 * dpr;
    c2d.lineJoin = 'round';
    c2d.beginPath();
    let lastY = mid;
    for (let i = 0; i < n; i++) {
      const v = samples[(head + i) % n];
      const y = mid - v * amp;
      if (i === 0) c2d.moveTo(0, y);
      else c2d.lineTo(i * dx, y);
      lastY = y;
    }
    c2d.stroke();

    if (level > 0.001) {
      c2d.fillStyle = color;
      c2d.shadowColor = color;
      c2d.shadowBlur = 8 * dpr;
      c2d.beginPath();
      c2d.arc(w - 2 * dpr, lastY, 2.2 * dpr, 0, Math.PI * 2);
      c2d.fill();
      c2d.shadowBlur = 0;
    }
  }

  return {
    set(value) {
      const next = clamp(Number(value) || 0);
      if (level === 0 && next > 0) warm = true;
      target = next;
      flatDrawn = false;
    },
    get value() {
      return target;
    },
    frame(dt) {
      resize();
      if (target === 0 && level === 0) {
        if (flatDrawn) return;
        samples.fill(0);
        flatDrawn = true;
        draw();
        return;
      }
      if (warm) {
        warm = false;
        level = target;
        for (let i = 0; i < samples.length; i++) step(1 / 56);
      }
      step(Math.min(dt, 0.1));
      if (dirty) {
        draw();
        dirty = false;
      }
    },
  };
}
