export const LOOKAHEAD = 0.12;

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, k) => a + (b - a) * k;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;
export const expo = (mean) => -Math.log(1 - Math.random()) * mean;

export function smooth(a, b, x) {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
}

export function weighted(pairs) {
  let total = 0;
  for (let i = 0; i < pairs.length; i++) total += pairs[i][1];
  let r = Math.random() * total;
  for (let i = 0; i < pairs.length; i++) {
    r -= pairs[i][1];
    if (r <= 0) return pairs[i][0];
  }
  return pairs[pairs.length - 1][0];
}

export function hold(param, now) {
  if (param.cancelAndHoldAtTime) {
    param.cancelAndHoldAtTime(now);
  } else {
    const v = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(v, now);
  }
}

export function rampTo(param, value, now, dur) {
  hold(param, now);
  param.linearRampToValueAtTime(value, now + Math.max(dur, 0.005));
}

export function glideTo(param, value, now, tau) {
  hold(param, now);
  param.setTargetAtTime(value, now, Math.max(tau, 0.001));
}

export function env(param, t, a, peak, d, sustain = 0) {
  const p = Math.max(peak, 1e-5);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(p, t + a);
  if (sustain > 0) param.setValueAtTime(p, t + a + sustain);
  param.exponentialRampToValueAtTime(p * 0.001, t + a + sustain + d);
  param.linearRampToValueAtTime(0, t + a + sustain + d + 0.01);
  return t + a + sustain + d + 0.015;
}

export class Voice {
  constructor(eng, cat, dest, name = '') {
    this.eng = eng;
    this.cat = cat;
    this.name = name;
    this.nodes = [];
    this.srcs = [];
    this.links = [];
    this.pending = 0;
    this.end = 0;
    this.persistent = false;
    this.done = false;
    this.born = eng.ac.currentTime;
    this.onEnded = () => {
      if (--this.pending <= 0 && !this.persistent) this.dispose();
    };
    this.out = this.gain(1);
    if (dest) this.out.connect(dest);
  }

  node(n) {
    this.nodes.push(n);
    this.eng.count[this.cat]++;
    return n;
  }

  gain(value = 1, dest) {
    const n = this.node(this.eng.ac.createGain());
    n.gain.value = value;
    if (dest) n.connect(dest);
    return n;
  }

  filter(type, freq, q = 0.707, dest) {
    const n = this.node(this.eng.ac.createBiquadFilter());
    n.type = type;
    n.frequency.value = freq;
    n.Q.value = q;
    if (dest) n.connect(dest);
    return n;
  }

  shaper(curve, dest) {
    const n = this.node(this.eng.ac.createWaveShaper());
    n.curve = curve;
    n.oversample = 'none';
    if (dest) n.connect(dest);
    return n;
  }

  delay(time, max, dest) {
    const n = this.node(this.eng.ac.createDelay(max));
    n.delayTime.value = time;
    if (dest) n.connect(dest);
    return n;
  }

  panner(opts) {
    const n = this.node(this.eng.ac.createPanner());
    n.panningModel = 'equalpower';
    n.distanceModel = 'inverse';
    n.refDistance = opts.refDistance ?? 4;
    n.maxDistance = opts.maxDistance ?? 300;
    n.rolloffFactor = opts.rolloff ?? 1;
    return n;
  }

  mod(from, param) {
    from.connect(param);
    this.links.push(from, param);
  }

  src(n, t0, t1) {
    this.node(n);
    this.srcs.push(n);
    this.pending++;
    n.onended = this.onEnded;
    n.start(Math.max(t0, 0));
    if (t1 == null) {
      this.persistent = true;
    } else {
      n.stop(t1);
      if (t1 > this.end) this.end = t1;
    }
    return n;
  }

  osc(type, freq, t0, t1, dest) {
    const o = this.eng.ac.createOscillator();
    if (typeof type === 'string') o.type = type;
    else o.setPeriodicWave(type);
    o.frequency.value = freq;
    if (dest) o.connect(dest);
    return this.src(o, t0, t1);
  }

  constant(value, t0, t1, dest) {
    const c = this.eng.ac.createConstantSource();
    c.offset.value = value;
    if (dest) c.connect(dest);
    return this.src(c, t0, t1);
  }

  noise(color, t0, t1, dest, rate = 1) {
    const s = this.eng.ac.createBufferSource();
    const buf = this.eng.noise[color] || this.eng.noise.white;
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rate;
    if (dest) s.connect(dest);
    this.node(s);
    this.srcs.push(s);
    this.pending++;
    s.onended = this.onEnded;
    s.start(Math.max(t0, 0), Math.random() * (buf.duration - 0.1));
    if (t1 == null) this.persistent = true;
    else {
      s.stop(t1);
      if (t1 > this.end) this.end = t1;
    }
    return s;
  }

  send(amount, bus = 'sfx') {
    if (amount <= 0) return;
    const g = this.gain(amount);
    this.out.connect(g);
    g.connect(this.eng.buses[bus].verb);
  }

  commit() {
    if (this.srcs.length === 0 && !this.persistent) this.end = this.eng.ac.currentTime;
    this.eng.track(this);
    return this;
  }

  stop(fade = 0.05, at) {
    if (this.done) return;
    const now = this.eng.ac.currentTime;
    const t = Math.max(at ?? now, now);
    rampTo(this.out.gain, 0, t, fade);
    const stopAt = t + fade + 0.01;
    for (let i = 0; i < this.srcs.length; i++) {
      try {
        this.srcs[i].stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    this.persistent = false;
    this.end = stopAt;
    if (this.srcs.length === 0) this.end = stopAt;
  }

  dispose() {
    if (this.done) return;
    this.done = true;
    for (let i = 0; i < this.links.length; i += 2) {
      try {
        this.links[i].disconnect(this.links[i + 1]);
      } catch {
        /* already disconnected */
      }
    }
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (n.onended) n.onended = null;
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.eng.count[this.cat] -= this.nodes.length;
    this.nodes.length = 0;
    this.srcs.length = 0;
    this.links.length = 0;
    this.eng.untrack(this);
  }
}

function noiseBuffers(ac) {
  const len = Math.floor(ac.sampleRate * 3);
  const make = (fill) => {
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    fill(buf.getChannelData(0));
    return buf;
  };
  const white = make((d) => {
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  });
  const pink = make((d) => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  });
  const brown = make((d) => {
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
  });
  for (const buf of [pink, brown]) {
    const d = buf.getChannelData(0);
    const step = d[d.length - 1] - d[0];
    let mean = 0;
    for (let i = 0; i < d.length; i++) {
      d[i] -= (step * i) / (d.length - 1);
      mean += d[i];
    }
    mean /= d.length;
    for (let i = 0; i < d.length; i++) d[i] -= mean;
  }
  return { white, pink, brown };
}

function impulse(ac, seconds) {
  const rate = ac.sampleRate;
  const len = Math.floor(rate * seconds);
  const pre = Math.floor(rate * 0.018);
  const buf = ac.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const k = (i - pre) / (len - pre);
      const c = 0.85 - 0.75 * k;
      lp += c * (Math.random() * 2 - 1 - lp);
      const attack = Math.min(1, (i - pre) / (rate * 0.03));
      d[i] = (lp / Math.sqrt(c)) * Math.pow(1 - k, 2.4) * attack;
    }
    for (let r = 0; r < 7; r++) {
      const at = pre + Math.floor(rate * rand(0.004, 0.06));
      d[at] += rand(-0.5, 0.5);
    }
  }
  return buf;
}

function harmonicWave(ac, amps, cosine = false) {
  const real = new Float32Array(amps.length + 1);
  const imag = new Float32Array(amps.length + 1);
  for (let i = 0; i < amps.length; i++) (cosine ? real : imag)[i + 1] = amps[i];
  return ac.createPeriodicWave(real, imag);
}

function waves(ac) {
  const series = (n, fn) => Array.from({ length: n }, (_, i) => fn(i + 1));
  const pulse = (duty) => {
    const real = new Float32Array(40);
    const imag = new Float32Array(40);
    for (let n = 1; n < 40; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    return ac.createPeriodicWave(real, imag);
  };
  return {
    warm: harmonicWave(ac, series(28, (n) => (1 / n) * Math.exp(-n / 9))),
    glossy: harmonicWave(ac, series(24, (n) => (1 / n) * (n === 2 ? 1.6 : 1) * Math.exp(-n / 16))),
    piano: harmonicWave(ac, [1, 0.42, 0.24, 0.13, 0.09, 0.05, 0.035, 0.02, 0.014, 0.008]),
    flute: harmonicWave(ac, [1, 0.16, 0.06, 0.02]),
    organ: harmonicWave(ac, [1, 0.5, 0.0, 0.25, 0.0, 0.12, 0, 0.06]),
    pulse25: pulse(0.25),
    pulse12: pulse(0.125),
    reed: harmonicWave(ac, series(14, (n) => (n % 2 ? 1 / n : 0.3 / n))),
  };
}

function softClipCurve(amount) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

export class Engine {
  constructor(ac) {
    this.ac = ac;
    this.count = { sfx: 0, music: 0, loop: 0, core: 0 };
    this.live = [];
    this.byName = new Map();
    this.sweepAt = 0;
    const g = (v = 1) => {
      const n = ac.createGain();
      n.gain.value = v;
      this.count.core++;
      return n;
    };
    this.master = g(1);
    this.tap = g(1);
    this.comp = ac.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 10;
    this.comp.ratio.value = 2.5;
    this.comp.attack.value = 0.015;
    this.comp.release.value = 0.3;
    this.limiter = ac.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.75;
    this.count.core += 3;
    this.master.connect(this.tap);
    this.tap.connect(this.comp);
    this.comp.connect(this.limiter);
    this.limiter.connect(ac.destination);
    this.limiter.connect(this.analyser);

    this.noise = noiseBuffers(ac);
    this.waves = waves(ac);
    this.curves = { soft: softClipCurve(1.6), hard: softClipCurve(4) };
    const ir = impulse(ac, 3.4);

    const bus = (verbLevel, withDelay) => {
      const b = { in: g(1), vol: g(1), duck: g(1), verb: g(1) };
      const conv = ac.createConvolver();
      conv.buffer = ir;
      const pre = ac.createBiquadFilter();
      pre.type = 'highpass';
      pre.frequency.value = 220;
      const ret = g(verbLevel);
      this.count.core += 2;
      b.verb.connect(pre);
      pre.connect(conv);
      conv.connect(ret);
      ret.connect(b.in);
      if (withDelay) {
        b.delay = g(1);
        b.delayNode = ac.createDelay(2);
        b.delayNode.delayTime.value = 0.62;
        const fb = g(0.34);
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2600;
        const hp = ac.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 280;
        this.count.core += 3;
        b.delay.connect(b.delayNode);
        b.delayNode.connect(lp);
        lp.connect(hp);
        hp.connect(fb);
        fb.connect(b.delayNode);
        hp.connect(b.in);
        hp.connect(b.verb);
      }
      b.in.connect(b.vol);
      b.vol.connect(b.duck);
      b.duck.connect(this.master);
      return b;
    };
    this.buses = { music: bus(0.9, true), sfx: bus(0.8, false) };
    this.amb = g(0.9);
    this.amb.connect(this.buses.sfx.in);
    this.ambVerb = g(0.18);
    this.amb.connect(this.ambVerb);
    this.ambVerb.connect(this.buses.sfx.verb);
    this.baseCore = this.count.core;
  }

  voice(cat, dest, name) {
    return new Voice(this, cat, dest, name);
  }

  track(v) {
    this.live.push(v);
    if (v.name) {
      let list = this.byName.get(v.name);
      if (!list) {
        list = [];
        this.byName.set(v.name, list);
      }
      list.push(v);
    }
  }

  untrack(v) {
    const i = this.live.indexOf(v);
    if (i >= 0) this.live.splice(i, 1);
    if (v.name) {
      const list = this.byName.get(v.name);
      const j = list ? list.indexOf(v) : -1;
      if (j >= 0) list.splice(j, 1);
    }
  }

  limit(name, max) {
    const list = this.byName.get(name);
    if (!list) return;
    let alive = 0;
    for (let i = 0; i < list.length; i++) if (list[i].persistent || list[i].end > this.ac.currentTime) alive++;
    for (let i = 0; alive >= max && i < list.length; i++) {
      const v = list[i];
      if (v.stealing) continue;
      v.stealing = true;
      v.stop(0.03);
      alive--;
    }
  }

  sweep(now) {
    if (now < this.sweepAt) return;
    this.sweepAt = now + 0.5;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const v = this.live[i];
      if (v && !v.persistent && v.end + 0.4 < now) v.dispose();
    }
  }

  nodeCount() {
    return this.count.sfx + this.count.music + this.count.loop;
  }
}
