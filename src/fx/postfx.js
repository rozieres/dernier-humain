import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { sharedUniforms } from '../core/glsl.js';
import {
  FULLSCREEN_VERTEX, SANITIZE_FRAGMENT, SCAN_FRAGMENT, RAYS_MASK_FRAGMENT, RAYS_BLUR_FRAGMENT,
  BLOOM_DOWN_FRAGMENT, BLOOM_UP_FRAGMENT, COMPOSITE_FRAGMENT,
} from './post/shaders.js';
import { createGpuTimer } from './post/timer.js';

export const GRADES = {
  day: { exposure: 1, saturation: 1.08, contrast: 1.04, tint: [1, 1, 1], lift: [0.002, 0.003, 0.005], vignette: 0.26, aberration: 0.0012, bloom: 1 },
  golden: { exposure: 1.05, saturation: 1.12, contrast: 1.06, tint: [1.06, 0.99, 0.9], lift: [0.005, 0.003, 0.004], vignette: 0.32, aberration: 0.0014, bloom: 1.2 },
  sunset: { exposure: 1.12, saturation: 1.1, contrast: 1.06, tint: [1.07, 0.95, 0.92], lift: [0.006, 0.003, 0.007], vignette: 0.36, aberration: 0.0014, bloom: 1.3 },
  dusk: { exposure: 1.3, saturation: 1.02, contrast: 1.04, tint: [0.97, 0.96, 1.07], lift: [0.003, 0.004, 0.009], vignette: 0.4, aberration: 0.0015, bloom: 1.35 },
  night: { exposure: 1.7, saturation: 0.9, contrast: 1.04, tint: [0.86, 0.95, 1.16], lift: [0.002, 0.004, 0.009], vignette: 0.46, aberration: 0.0016, bloom: 1.5 },
};
const SCALAR_KEYS = ['exposure', 'saturation', 'contrast', 'vignette', 'aberration', 'bloom'];
const VECTOR_KEYS = ['tint', 'lift'];
const SCAN_COLOR = new THREE.Color('#5ce1e6');
const BLOOM_THRESHOLD = 1.15;
const BLOOM_KNEE = 0.65;
const BLOOM_GAIN = 0.2;
const SCAN_TRAIL = 25;
const FADE_TRAIL_START = 0.72;
const HDR_CEILING = 256;
const RAY_PASSES = [[1, 24, 0.96], [1 / 24, 12, 1], [1 / 288, 12, 1]];

function writeVec3(target, v) {
  if (Array.isArray(v)) return target.set(v[0], v[1], v[2]);
  if (v && v.isVector3) return target.copy(v);
  const c = v && v.isColor ? v : new THREE.Color(v);
  return target.set(c.r, c.g, c.b);
}

function makeGrade(src = GRADES.day) {
  const g = { tint: new THREE.Vector3(1, 1, 1), lift: new THREE.Vector3() };
  for (const k of SCALAR_KEYS) g[k] = src[k] ?? GRADES.day[k];
  for (const k of VECTOR_KEYS) writeVec3(g[k], src[k] ?? GRADES.day[k]);
  return g;
}

function copyGrade(dst, src) {
  for (const k of SCALAR_KEYS) dst[k] = src[k];
  for (const k of VECTOR_KEYS) dst[k].copy(src[k]);
  return dst;
}

const smooth = (t) => t * t * (3 - 2 * t);
const srgbOf = (color, target) => {
  const c = new THREE.Color(color);
  return target.set(...c.convertLinearToSRGB().toArray());
};

function hdrTarget(w, h, extra = {}) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, ...extra,
  });
}

function pass(fragmentShader, uniforms, params = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERTEX, fragmentShader, uniforms,
    depthTest: false, depthWrite: false, toneMapped: false, ...params,
  });
}

export default async function create(ctx) {
  const { renderer, scene, camera, quality, events, state } = ctx;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;

  const size = new THREE.Vector2();
  const quad = new FullScreenQuad(null);
  let width = 0;
  let height = 0;
  let samples = -1;
  let sceneRT = null;
  let cleanRT = null;
  let hdrRT = null;
  let ldrRT = null;
  let raysA = null;
  let raysB = null;
  const mips = [];

  const sanitizeMat = pass(SANITIZE_FRAGMENT, { tColor: { value: null }, uCeiling: { value: HDR_CEILING } });
  const scanMat = pass(SCAN_FRAGMENT, {
    tColor: { value: null }, tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 6000 },
    uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
    uTexel: { value: new THREE.Vector2() }, uPixelAngle: { value: 0.001 },
    uOrigin: { value: new THREE.Vector3() }, uOriginUV: { value: new THREE.Vector3() },
    uRadius: { value: 0 }, uTrail: { value: SCAN_TRAIL }, uStrength: { value: 1 }, uSea: { value: 0 },
    uScanColor: { value: new THREE.Vector3(SCAN_COLOR.r, SCAN_COLOR.g, SCAN_COLOR.b) },
  });
  const raysMaskMat = pass(RAYS_MASK_FRAGMENT, {
    tColor: { value: null }, tDepth: { value: null }, uSunUV: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: new THREE.Vector2(1.1, 4) },
  });
  const raysBlurMat = pass(RAYS_BLUR_FRAGMENT, {
    tInput: { value: null }, uSunUV: { value: new THREE.Vector2() }, uLength: { value: 1 }, uSamples: { value: 24 }, uDecay: { value: 0.97 }, uFalloff: { value: 0 }, uAspect: { value: 1 }, tDepth: { value: null }, uGround: { value: 0.35 },
  });
  const downMat = pass(BLOOM_DOWN_FRAGMENT, {
    tInput: { value: null }, uTexel: { value: new THREE.Vector2() }, uPrefilter: { value: 0 }, uThreshold: { value: new THREE.Vector4() },
  });
  const upMat = pass(BLOOM_UP_FRAGMENT, {
    tInput: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 },
  }, { blending: THREE.AdditiveBlending });
  const cu = {
    tColor: { value: null }, tBloom: { value: null }, tRays: { value: null },
    uResolution: { value: new THREE.Vector2() }, uTime: { value: 0 }, uFrame: { value: 0 },
    uBloomOn: { value: 0 }, uBloom: { value: 0 }, uRaysOn: { value: 0 }, uRaysColor: { value: new THREE.Vector3() },
    uExposure: { value: 1 }, uSaturation: { value: 1 }, uContrast: { value: 1 }, uTint: { value: new THREE.Vector3(1, 1, 1) },
    uLift: { value: new THREE.Vector3() }, uVignette: { value: 0 }, uAberration: { value: 0 }, uGrain: { value: 0 },
    uGlitch: { value: 0 }, uWarp: { value: 0 }, uSpeed: { value: 0 }, uLetterbox: { value: 0 },
    uFadeColor: { value: new THREE.Vector3() }, uFade: { value: 0 }, uFlashColor: { value: new THREE.Vector3(1, 1, 1) }, uFlash: { value: 0 },
  };
  const compositeMat = pass(COMPOSITE_FRAGMENT, cu);
  const fxaaMat = new THREE.ShaderMaterial({
    ...FXAAShader, uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms), depthTest: false, depthWrite: false, toneMapped: false,
  });
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  black.needsUpdate = true;

  function disposeTargets() {
    for (const t of [sceneRT, cleanRT, hdrRT, ldrRT, raysA, raysB, ...mips]) t?.dispose();
    sceneRT?.depthTexture?.dispose();
    mips.length = 0;
  }

  function build() {
    renderer.getDrawingBufferSize(size);
    const w = Math.max(1, Math.floor(size.x));
    const h = Math.max(1, Math.floor(size.y));
    const s = quality.msaa || (quality.tier === 'medium' ? 2 : 0);
    if (w === width && h === height && s === samples && sceneRT) return;
    disposeTargets();
    width = w;
    height = h;
    samples = s;
    const depthTexture = new THREE.DepthTexture(w, h, THREE.FloatType);
    sceneRT = hdrTarget(w, h, { depthBuffer: true, samples: s, depthTexture });
    cleanRT = hdrTarget(w, h);
    hdrRT = hdrTarget(w, h);
    ldrRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const rw = Math.max(1, Math.round(w / 4));
    const rh = Math.max(1, Math.round(h / 4));
    raysA = hdrTarget(rw, rh);
    raysB = hdrTarget(rw, rh);
    let mw = Math.max(1, Math.round(w / 2));
    let mh = Math.max(1, Math.round(h / 2));
    for (let i = 0; i < 7 && Math.min(mw, mh) >= 6; i++) {
      mips.push(hdrTarget(mw, mh));
      mw = Math.max(1, Math.round(mw / 2));
      mh = Math.max(1, Math.round(mh / 2));
    }
    cu.uResolution.value.set(w, h);
    fxaaMat.uniforms.resolution.value.set(1 / w, 1 / h);
    scanMat.uniforms.uTexel.value.set(1 / w, 1 / h);
  }
  build();
  events.on('resize', build);
  events.on('quality:change', build);

  const grade = makeGrade(GRADES.day);
  const gradeFrom = makeGrade(GRADES.day);
  const gradeTo = makeGrade(GRADES.day);
  const gradeAnim = { t: 1, dur: 0 };

  const anim = (value) => ({ value, from: value, to: value, t: 1, dur: 0 });
  const letterbox = anim(0);
  const fade = anim(0);
  const fadeColor = new THREE.Vector3();
  let fadeResolve = null;
  const flash = { color: new THREE.Vector3(1, 1, 1), t: 1, dur: 1 };
  const glitch = { base: 0, amount: 0, t: 0, dur: 0 };
  const speed = { value: 0, target: 0 };
  const warp = { value: 0, target: 0 };

  const scan = { active: false, origin: new THREE.Vector3(), radius: 0, speed: 60, max: 140 };

  const sunWorld = new THREE.Vector3();
  const sunNdc = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const toOrigin = new THREE.Vector3();
  const raysColor = new THREE.Vector3();
  const timer = createGpuTimer(renderer);
  let frame = 0;

  function step(a, dt) {
    if (a.t >= 1) return;
    a.t = a.dur > 0 ? Math.min(1, a.t + dt / a.dur) : 1;
    a.value = a.from + (a.to - a.from) * smooth(a.t);
  }

  function animate(dt) {
    if (gradeAnim.t < 1) {
      gradeAnim.t = gradeAnim.dur > 0 ? Math.min(1, gradeAnim.t + dt / gradeAnim.dur) : 1;
      const k = smooth(gradeAnim.t);
      for (const key of SCALAR_KEYS) grade[key] = gradeFrom[key] + (gradeTo[key] - gradeFrom[key]) * k;
      for (const key of VECTOR_KEYS) grade[key].lerpVectors(gradeFrom[key], gradeTo[key], k);
    }
    step(letterbox, dt);
    step(fade, dt);
    if (fade.t >= 1 && fadeResolve) {
      const r = fadeResolve;
      fadeResolve = null;
      r();
    }
    if (flash.t < 1) flash.t = Math.min(1, flash.t + dt / Math.max(flash.dur, 1e-3));
    if (glitch.t < glitch.dur) glitch.t += dt;
    const ease = 1 - Math.exp(-dt * 7);
    speed.value += (speed.target - speed.value) * ease;
    warp.value += (warp.target - warp.value) * (1 - Math.exp(-dt * 2.5));
    if (scan.active) {
      scan.radius += scan.speed * dt;
      if (scan.radius >= scan.max) scan.active = false;
    }
  }

  function computeSun() {
    const dir = sharedUniforms.uSunDir.value;
    const sunColor = sharedUniforms.uSunColor.value;
    const lum = sunColor.r * 0.2126 + sunColor.g * 0.7152 + sunColor.b * 0.0722;
    if (lum < 0.02 || dir.y < -0.08) return 0;
    camera.getWorldDirection(camDir);
    if (camDir.dot(dir) < 0.05) return 0;
    sunWorld.copy(camera.position).addScaledVector(dir, 1000);
    sunNdc.copy(sunWorld).project(camera);
    const edge = Math.max(Math.abs(sunNdc.x), Math.abs(sunNdc.y));
    if (edge > 1.45) return 0;
    const onScreen = 1 - THREE.MathUtils.smoothstep(edge, 1.0, 1.45);
    const low = 1 - THREE.MathUtils.smoothstep(dir.y, 0.04, 0.5);
    const high = THREE.MathUtils.smoothstep(dir.y, 0.03, 0.25);
    raysMaskMat.uniforms.uThreshold.value.set(1.1 + 1.9 * high, 4 + 6 * high);
    const horizon = THREE.MathUtils.smoothstep(dir.y, -0.08, 0.02);
    const night = sharedUniforms.uNight.value;
    const strength = onScreen * horizon * (0.2 + 0.95 * low) * (1 - night * 0.6);
    raysColor.set(sunColor.r, sunColor.g, sunColor.b).multiplyScalar(strength * 1.4 / Math.max(lum, 0.6));
    const out = raysColor.x * 0.2126 + raysColor.y * 0.7152 + raysColor.z * 0.0722;
    return out > 0.01 ? 1 : 0;
  }

  function draw(material, target) {
    quad.material = material;
    renderer.setRenderTarget(target);
    quad.render(renderer);
  }

  function renderScan() {
    const u = scanMat.uniforms;
    u.tColor.value = cleanRT.texture;
    u.tDepth.value = sceneRT.depthTexture;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    u.uPixelAngle.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / (height * camera.zoom);
    u.uOrigin.value.copy(scan.origin);
    u.uRadius.value = scan.radius;
    u.uSea.value = sharedUniforms.uSeaLevel.value;
    const k = scan.radius / scan.max;
    u.uStrength.value = 1 - THREE.MathUtils.smoothstep(k, FADE_TRAIL_START, 1);
    tmp.copy(scan.origin).project(camera);
    const inFront = toOrigin.copy(scan.origin).sub(u.uCamPos.value).dot(camera.getWorldDirection(fwd)) > 0;
    u.uOriginUV.value.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5, inFront ? 1 : 0);
    draw(scanMat, hdrRT);
  }

  function renderRays() {
    const sunU = sunNdc.x * 0.5 + 0.5;
    const sunV = sunNdc.y * 0.5 + 0.5;
    const m = raysMaskMat.uniforms;
    m.tColor.value = cleanRT.texture;
    m.tDepth.value = sceneRT.depthTexture;
    m.uSunUV.value.set(sunU, sunV);
    m.uAspect.value = width / height;
    m.uTexel.value.set(1 / raysA.width, 1 / raysA.height);
    draw(raysMaskMat, raysA);
    const b = raysBlurMat.uniforms;
    b.uSunUV.value.set(sunU, sunV);
    b.tDepth.value = sceneRT.depthTexture;
    b.uAspect.value = width / height;
    let src = raysA;
    let dst = raysB;
    for (let i = 0; i < RAY_PASSES.length; i++) {
      const [length, count, decay] = RAY_PASSES[i];
      b.tInput.value = src.texture;
      b.uLength.value = length;
      b.uSamples.value = count;
      b.uDecay.value = decay;
      b.uFalloff.value = i === RAY_PASSES.length - 1 ? 1.5 : 0;
      draw(raysBlurMat, dst);
      [src, dst] = [dst, src];
    }
    return src.texture;
  }

  function renderBloom(source) {
    const d = downMat.uniforms;
    const th = BLOOM_THRESHOLD / Math.max(grade.exposure, 0.05);
    const knee = BLOOM_KNEE / Math.max(grade.exposure, 0.05);
    d.uThreshold.value.set(th, th - knee, 2 * knee, 0.25 / knee);
    let input = source;
    let iw = width;
    let ih = height;
    for (let i = 0; i < mips.length; i++) {
      d.tInput.value = input;
      d.uTexel.value.set(1 / iw, 1 / ih);
      d.uPrefilter.value = i === 0 ? 1 : 0;
      draw(downMat, mips[i]);
      input = mips[i].texture;
      iw = mips[i].width;
      ih = mips[i].height;
    }
    const up = upMat.uniforms;
    for (let i = mips.length - 1; i > 0; i--) {
      up.tInput.value = mips[i].texture;
      up.uTexel.value.set(1 / mips[i].width, 1 / mips[i].height);
      up.uWeight.value = 1;
      draw(upMat, mips[i - 1]);
    }
    return mips[0].texture;
  }

  const api = {
    GRADES,
    get grade() { return grade; },
    get stats() { return timer.stats; },
    get targets() { return { scene: sceneRT, clean: cleanRT, width, height, samples }; },
    profile(on = true) {
      timer.enabled = Boolean(on);
      timer.reset();
    },

    render(dt = 0) {
      frame++;
      animate(dt);
      if (renderer.getDrawingBufferSize(size).x !== width || size.y !== height) build();
      const reduce = state.settings?.reduceFx ? 0.5 : 1;

      const uScan = sharedUniforms.uScan.value;
      if (scan.active) uScan.set(scan.origin.x, scan.origin.y, scan.origin.z, scan.radius);
      else uScan.set(0, 0, 0, -1);

      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.toneMapping = THREE.NoToneMapping;

      timer.begin('scene');
      renderer.setRenderTarget(sceneRT);
      renderer.clear(true, true, false);
      renderer.render(scene, camera);
      timer.end();

      timer.begin('post');
      sanitizeMat.uniforms.tColor.value = sceneRT.texture;
      draw(sanitizeMat, cleanRT);
      let source = cleanRT.texture;
      if (scan.active) {
        renderScan();
        source = hdrRT.texture;
      }
      const heavy = quality.bloom !== false && quality.tier !== 'low';
      const rays = heavy && computeSun();
      const raysTex = rays ? renderRays() : black;
      const bloom = heavy && mips.length ? renderBloom(source) : black;

      cu.tColor.value = source;
      cu.tBloom.value = bloom;
      cu.tRays.value = raysTex;
      cu.uBloomOn.value = heavy ? 1 : 0;
      cu.uBloom.value = BLOOM_GAIN * grade.bloom;
      cu.uRaysOn.value = rays ? 1 : 0;
      cu.uRaysColor.value.copy(raysColor);
      cu.uTime.value = sharedUniforms.uTime.value;
      cu.uFrame.value = frame % 4096;
      cu.uExposure.value = grade.exposure;
      cu.uSaturation.value = grade.saturation;
      cu.uContrast.value = grade.contrast;
      cu.uTint.value.copy(grade.tint);
      cu.uLift.value.copy(grade.lift);
      cu.uVignette.value = grade.vignette;
      const g = Math.min(1, glitch.base + (glitch.t < glitch.dur ? glitch.amount * (1 - glitch.t / glitch.dur) : 0));
      cu.uGlitch.value = g * reduce;
      cu.uAberration.value = (grade.aberration + speed.value * 0.006) * reduce;
      cu.uWarp.value = warp.value * reduce;
      cu.uSpeed.value = speed.value * reduce;
      cu.uGrain.value = reduce < 1 ? 0 : 0.028;
      cu.uLetterbox.value = letterbox.value;
      cu.uFade.value = fade.value;
      cu.uFadeColor.value.copy(fadeColor);
      cu.uFlash.value = flash.t < 1 ? (1 - flash.t) * (1 - flash.t) : 0;
      cu.uFlashColor.value.copy(flash.color);

      const fxaa = !samples;
      draw(compositeMat, fxaa ? ldrRT : null);
      if (fxaa) {
        fxaaMat.uniforms.tDiffuse.value = ldrRT.texture;
        draw(fxaaMat, null);
      }
      timer.end();
      timer.poll();
      renderer.autoClear = autoClear;
    },

    scanPulse(origin, { speed: v = 60, maxRadius = 140, startRadius = 0 } = {}) {
      if (Array.isArray(origin)) scan.origin.set(origin[0], origin[1], origin[2]);
      else scan.origin.copy(origin);
      scan.speed = v;
      scan.max = maxRadius;
      scan.radius = startRadius;
      scan.active = true;
    },
    get scanRadius() { return scan.active ? scan.radius : -1; },

    glitch(amount = 0.6, duration = 0.35) {
      const current = glitch.t < glitch.dur ? glitch.amount * (1 - glitch.t / glitch.dur) : 0;
      glitch.amount = Math.max(current, amount);
      glitch.dur = Math.max(duration, 1e-3);
      glitch.t = 0;
    },
    setGlitchBase(amount = 0) {
      glitch.base = Math.max(0, amount);
    },
    flash(color = '#ffffff', duration = 0.4) {
      srgbOf(color, flash.color);
      flash.dur = duration;
      flash.t = 0;
    },
    fade(target = 1, duration = 1, color = '#000') {
      if (fadeResolve) fadeResolve();
      srgbOf(color, fadeColor);
      fade.from = fade.value;
      fade.to = THREE.MathUtils.clamp(target, 0, 1);
      fade.dur = duration;
      fade.t = 0;
      if (duration <= 0) step(fade, 0);
      return new Promise((resolve) => {
        fadeResolve = resolve;
        if (fade.t >= 1) {
          fadeResolve = null;
          resolve();
        }
      });
    },
    setSpeed(amount = 0) {
      speed.target = THREE.MathUtils.clamp(amount, 0, 1.5);
    },
    setWarp(amount = 0) {
      warp.target = THREE.MathUtils.clamp(amount, 0, 1.5);
    },
    setLetterbox(amount = 1, duration = 0.8) {
      letterbox.from = letterbox.value;
      letterbox.to = THREE.MathUtils.clamp(amount, 0, 1);
      letterbox.dur = duration;
      letterbox.t = 0;
      if (duration <= 0) step(letterbox, 0);
    },
    setGrade(params = {}, duration = 1) {
      const p = typeof params === 'string' ? GRADES[params] : params;
      if (!p) return;
      copyGrade(gradeFrom, grade);
      copyGrade(gradeTo, gradeAnim.t < 1 ? gradeTo : grade);
      for (const k of SCALAR_KEYS) if (p[k] !== undefined) gradeTo[k] = p[k];
      for (const k of VECTOR_KEYS) if (p[k] !== undefined) writeVec3(gradeTo[k], p[k]);
      gradeAnim.dur = duration;
      gradeAnim.t = duration > 0 ? 0 : 1;
      if (duration <= 0) copyGrade(grade, gradeTo);
    },

    dispose() {
      disposeTargets();
      for (const m of [sanitizeMat, scanMat, raysMaskMat, raysBlurMat, downMat, upMat, compositeMat, fxaaMat]) m.dispose();
      black.dispose();
      quad.dispose();
    },
  };
  return api;
}
