import * as THREE from 'three';
import { sharedUniforms } from '../core/glsl.js';
import { SKY_VERTEX, SKY_FRAGMENT, SAT_PLANES } from './sky/skyShader.js';
import { STAGE_HOURS, sunDirection, moonDirection, starRotation, createPaletteSampler } from './sky/palette.js';
import { createLightPool } from './sky/lightpool.js';
import { createAtmospheres } from './sky/atmospheres.js';

const DEG = Math.PI / 180;
const TRANSITION_SECONDS = 25;
const SHADOW_RADIUS = { low: 55, medium: 70, high: 80, ultra: 100 };
const SHADOW_DISTANCE = 600;
const ENV_REFRESH_INTERVAL = 1.75;
const ENV_TIME_STEP = 0.02;
const ENV_TIME_JUMP = 0.5;
const ENV_ATMOS_STEP = 0.3;
const MOON_PHASE_ANGLE = 38 * DEG;
const ENV_INTENSITY = 0.55;
const FILL = { color: '#8fa6d8', intensity: 10, distance: 24, height: 2.5, back: 1.5 };

const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const wrap24 = (h) => ((h % 24) + 24) % 24;
const easeInOut = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

function satellitePlanes() {
  const N = [];
  const A = [];
  const B = [];
  const P = [];
  const up = new THREE.Vector3(0, 1, 0);
  const plane = (azimuth, tilt, count, speed, phase, train) => {
    const n = new THREE.Vector3(Math.cos(azimuth * DEG) * Math.cos(tilt * DEG), Math.sin(tilt * DEG), Math.sin(azimuth * DEG) * Math.cos(tilt * DEG)).normalize();
    const a = new THREE.Vector3().crossVectors(n, up).normalize();
    const b = new THREE.Vector3().crossVectors(n, a).normalize();
    N.push(n);
    A.push(a);
    B.push(b);
    P.push(new THREE.Vector4(count, speed, phase, train));
  };
  for (let i = 0; i < 5; i++) plane(18 + i * 8, 24, 34, 0.0105, i * ((Math.PI * 2) / 34) * 0.5, 0);
  for (let i = 0; i < 3; i++) plane(112 + i * 9, -16, 28, -0.0082, i * 0.07, 0);
  plane(62, 38, 220, 0.0145, 1.3, 19);
  while (N.length < SAT_PLANES) plane(0, 90, 1, 0, 0, 0);
  return { N, A, B, P };
}

export default async function create(ctx) {
  const { scene, camera, renderer, quality, events } = ctx;
  const U = sharedUniforms;
  const sample = createPaletteSampler();
  const atmos = createAtmospheres();

  const sats = satellitePlanes();
  const skyUniforms = {
    uSunTrue: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uMoonLight: { value: new THREE.Vector3(0, 0, 1) },
    uMidA: { value: new THREE.Color() },
    uMidS: { value: new THREE.Color() },
    uHorS: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uDisc: { value: new THREE.Color() },
    uHaze: { value: 0.1 },
    uZenLow: { value: 0 },
    uMoonCol: { value: new THREE.Color() },
    uMoonVis: { value: 0 },
    uMoonSky: { value: new THREE.Color() },
    uStars: { value: 0 },
    uStarRot: { value: new THREE.Matrix3() },
    uAurora: { value: 0 },
    uCover: { value: 0.45 },
    uCloudLit: { value: new THREE.Color() },
    uCloudShade: { value: new THREE.Color() },
    uCloudOffset: { value: new THREE.Vector2() },
    uSkyDim: { value: 0 },
    uPixelAngle: { value: 0.0017 },
    uSatN: { value: sats.N },
    uSatA: { value: sats.A },
    uSatB: { value: sats.B },
    uSatP: { value: sats.P },
    uGround: { value: new THREE.Color() },
  };
  const skyMaterial = new THREE.ShaderMaterial({
    name: 'env:sky',
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms: { ...U, ...skyUniforms },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 64, 32), skyMaterial);
  sky.name = 'env:sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  sky.matrixAutoUpdate = true;
  scene.add(sky);
  scene.background = null;

  const captureMaterial = skyMaterial.clone();
  captureMaterial.uniforms = skyMaterial.uniforms;
  captureMaterial.defines = { ENV_CAPTURE: '' };
  captureMaterial.name = 'env:skyCapture';
  const envScene = new THREE.Scene();
  const captureSky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), captureMaterial);
  captureSky.frustumCulled = false;
  envScene.add(captureSky);
  const cubeTarget = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cubeCamera = new THREE.CubeCamera(1, 5000, cubeTarget);
  envScene.add(cubeCamera);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null;
  let envClock = ENV_REFRESH_INTERVAL;
  const captured = { time: -1, aurora: 0, fog: 0, dark: 0 };
  let captures = 0;

  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.name = 'env:sun';
  const shadowCam = sun.shadow.camera;
  function configureShadows() {
    sun.castShadow = quality.shadows;
    const size = quality.shadowMapSize;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    const r = SHADOW_RADIUS[quality.tier] || SHADOW_RADIUS.high;
    shadowCam.left = -r;
    shadowCam.right = r;
    shadowCam.top = r;
    shadowCam.bottom = -r;
    shadowCam.near = 20;
    shadowCam.far = SHADOW_DISTANCE + r * 2.5;
    shadowCam.updateProjectionMatrix();
    sun.shadow.bias = -0.00004;
    sun.shadow.normalBias = 0.035 * (2048 / size) * (r / 80);
  }
  configureShadows();
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  hemi.name = 'env:hemi';
  scene.add(hemi);

  const fill = new THREE.PointLight(FILL.color, 0, FILL.distance, 1);
  fill.name = 'env:moonFill';
  scene.add(fill);

  const lights = createLightPool({ scene, camera, count: quality.maxLights });
  let poolTier = quality.tier;

  const sunTrue = new THREE.Vector3();
  const moonDir = new THREE.Vector3();
  const lightDir = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const bufferSize = new THREE.Vector2();
  const tintRGB = { r: 1, g: 1, b: 1 };
  const moonLight = new THREE.Color();
  const moonSky = new THREE.Color();
  const atmFog = new THREE.Color();
  const tintColor = new THREE.Color();
  const focus = new THREE.Vector3();
  const lx = new THREE.Vector3();
  const ly = new THREE.Vector3();
  const lastDir = new THREE.Vector3(-0.5, 0.6, 0.5).normalize();
  const MOON_COLOR = new THREE.Color('#dfe6f5');
  const MOON_LIGHT = new THREE.Color('#a8bce6');
  const MOON_SKY = new THREE.Color('#2a3c66');
  const MOON_AMBIENT = new THREE.Color('#6f86c0');
  const AURORA_AMBIENT = new THREE.Color('#5ab8c8');
  const AURORA_FOG = new THREE.Color('#1c4a5a');
  const grade = { exposure: 1, saturation: 1, contrast: 1, vignette: 0.2, tint: [1, 1, 1] };
  const pushed = { exposure: -1, saturation: -1, contrast: -1, vignette: -1, tint: [-1, -1, -1] };

  const startStage = Number.isFinite(ctx.options?.stage) ? Math.max(0, Math.min(6, Math.floor(ctx.options.stage))) : ctx.state.stage;
  const st = {
    time: STAGE_HOURS[startStage] ?? STAGE_HOURS[0],
    stage: startStage,
    anim: null,
    night: 0,
    aurora: 0,
    sunElevation: 0,
    moonElevation: 0,
    windAngle: Math.atan2(0.55, 0.83),
    windClock: 0,
  };

  function setTime(hours, { duration = 0, direction = 1 } = {}) {
    const target = wrap24(hours);
    if (!duration) {
      st.time = target;
      st.anim = null;
      return;
    }
    let delta = wrap24(target - st.time);
    if (direction < 0 && delta > 0) delta -= 24;
    if (Math.abs(delta) < 1e-4) {
      st.anim = null;
      return;
    }
    st.anim = { from: st.time, delta, t: 0, duration };
  }

  function setStage(stage, { instant = false } = {}) {
    const s = Math.max(0, Math.min(6, Math.floor(Number(stage) || 0)));
    const target = STAGE_HOURS[s];
    const animTarget = st.anim ? wrap24(st.anim.from + st.anim.delta) : null;
    if (s === st.stage && !instant && (Math.abs(st.time - target) < 1e-3 || (animTarget !== null && Math.abs(animTarget - target) < 1e-3))) return;
    const direction = s >= st.stage ? 1 : -1;
    st.stage = s;
    setTime(target, { duration: instant ? 0 : TRANSITION_SECONDS, direction });
  }

  events.on('stage:change', ({ stage, instant } = {}) => {
    if (Number.isFinite(stage)) setStage(stage, { instant: Boolean(instant) });
  });
  events.on('quality:change', ({ tier } = {}) => {
    if (tier && tier !== poolTier) {
      poolTier = tier;
      lights.resize(quality.maxLights);
      configureShadows();
    }
  });

  function computeSky(dt) {
    sunDirection(st.time, sunTrue);
    moonDirection(st.time, moonDir);
    const elev = Math.asin(sunTrue.y) / DEG;
    const moonElev = Math.asin(moonDir.y) / DEG;
    st.sunElevation = elev;
    st.moonElevation = moonElev;
    const morning = smooth(-0.05, 0.3, sunTrue.x);
    const P = sample(elev, morning);
    const darkSky = smooth(1, -10, elev);
    st.night = smooth(2, -12, elev);
    const u = wrap24(st.time - 12);
    st.aurora = smooth(11.25, 12.7, u) * (1 - smooth(14.5, 16.5, u));

    const moonVis = smooth(-1.5, 1.5, moonElev);
    const moonUp = smooth(0, 12, moonElev) * darkSky;
    moonLight.copy(MOON_LIGHT).multiplyScalar(0.55 * moonUp);
    moonSky.copy(MOON_SKY).multiplyScalar(0.05 * moonVis * darkSky);

    const A = atmos.update(camera.position.x, camera.position.z, dt);
    const dark = A.darkness;

    const sunLum = lum(P.sun);
    const moonLum = lum(moonLight);
    lightDir.copy(sunTrue).multiplyScalar(sunLum).addScaledVector(moonDir, moonLum);
    if (lightDir.lengthSq() < 1e-8) lightDir.copy(lastDir);
    lightDir.normalize();
    const y = Math.min(0.97, Math.max(0.06, lightDir.y));
    const h = Math.hypot(lightDir.x, lightDir.z);
    if (h < 1e-4) lightDir.set(lastDir.x, 0, lastDir.z).normalize().multiplyScalar(Math.sqrt(1 - y * y)).setY(y);
    else lightDir.set((lightDir.x / h) * Math.sqrt(1 - y * y), y, (lightDir.z / h) * Math.sqrt(1 - y * y));
    lastDir.copy(lightDir);

    U.uSunDir.value.copy(lightDir);
    U.uSunColor.value.copy(P.sun).add(moonLight).multiplyScalar(1 - 0.9 * dark);
    U.uSkyColor.value.copy(P.sky)
      .add(tintColor.copy(MOON_AMBIENT).multiplyScalar(0.12 * moonUp))
      .add(tintColor.copy(AURORA_AMBIENT).multiplyScalar(0.07 * st.aurora))
      .multiplyScalar(1 - 0.7 * dark);
    U.uGroundColor.value.copy(P.ground).multiplyScalar(1 - 0.7 * dark);
    U.uSkyZenith.value.copy(P.zen).add(moonSky);

    const fog = U.uFogColor.value.copy(P.horA).add(moonSky).add(tintColor.copy(AURORA_FOG).multiplyScalar(0.05 * st.aurora));
    U.uSkyHorizon.value.copy(fog);
    const fogSun = U.uFogSunColor.value.copy(P.horS).lerp(fog, 0.25 * darkSky);
    if (A.fogWeight > 0.001) {
      const baseLum = Math.max(lum(fog), 1e-5);
      atmFog.copy(A.fogColor).multiplyScalar((baseLum / Math.max(lum(A.fogColor), 1e-5)) * (1 - 0.7 * dark));
      fog.lerp(atmFog, A.fogWeight * 0.85);
      fogSun.lerp(fog, A.fogWeight * 0.7);
      U.uSkyHorizon.value.lerp(fog, A.fogWeight * 0.5);
    }
    U.uFogDensity.value = P.fogD * A.fogDensity;
    U.uFogHeight.value = P.fogH;
    U.uNight.value = st.night;

    st.windClock += dt;
    const wc = st.windClock;
    const angle = st.windAngle + 0.3 * Math.sin(wc * 0.013) + 0.15 * Math.sin(wc * 0.037 + 1.3);
    const gust = 1 + 0.22 * Math.sin(wc * 0.21) * Math.sin(wc * 0.083 + 1.0);
    const wx = Math.cos(angle);
    const wz = Math.sin(angle);
    U.uWind.value.set(wx, wz, P.wind * gust);
    skyUniforms.uCloudOffset.value.x -= wx * P.wind * 7 * dt;
    skyUniforms.uCloudOffset.value.y -= wz * P.wind * 7 * dt;

    skyUniforms.uSunTrue.value.copy(sunTrue);
    skyUniforms.uMoonDir.value.copy(moonDir);
    tmp.copy(sunTrue).addScaledVector(moonDir, -sunTrue.dot(moonDir));
    if (tmp.lengthSq() < 1e-6) tmp.set(0, 1, 0);
    tmp.normalize();
    skyUniforms.uMoonLight.value.copy(moonDir).multiplyScalar(-Math.cos(MOON_PHASE_ANGLE)).addScaledVector(tmp, Math.sin(MOON_PHASE_ANGLE));
    skyUniforms.uMidA.value.copy(P.midA);
    skyUniforms.uMidS.value.copy(P.midS);
    skyUniforms.uHorS.value.copy(P.horS);
    skyUniforms.uGlow.value.copy(P.glow);
    skyUniforms.uDisc.value.copy(P.disc);
    skyUniforms.uHaze.value = P.haze;
    skyUniforms.uZenLow.value = P.zenLow;
    skyUniforms.uMoonCol.value.copy(MOON_COLOR).multiplyScalar(1.25 * (0.3 + 0.7 * darkSky));
    skyUniforms.uMoonVis.value = moonVis;
    skyUniforms.uMoonSky.value.copy(moonSky);
    skyUniforms.uStars.value = P.stars;
    starRotation(st.time, skyUniforms.uStarRot.value);
    skyUniforms.uAurora.value = st.aurora;
    skyUniforms.uCover.value = P.cover;
    skyUniforms.uCloudLit.value.copy(moonLight).multiplyScalar(0.08).add(P.cloudLit);
    skyUniforms.uCloudShade.value.copy(P.cloudShade);
    skyUniforms.uSkyDim.value = 0.7 * dark;
    skyUniforms.uGround.value.copy(U.uGroundColor.value).multiplyScalar(0.5);
    const fovRad = camera.fov * DEG;
    skyUniforms.uPixelAngle.value = (2 * Math.tan(fovRad / 2)) / Math.max(1, renderer.getDrawingBufferSize(bufferSize).y || 720);

    sun.color.copy(U.uSunColor.value);
    sun.intensity = 1;
    fill.intensity = FILL.intensity * st.night * (1 + 3 * dark);
    hemi.color.copy(U.uSkyColor.value);
    hemi.groundColor.copy(U.uGroundColor.value);

    P.tint.getRGB(tintRGB, THREE.SRGBColorSpace);
    grade.exposure = P.exposure * A.exposure * (1 - 0.3 * dark);
    grade.saturation = P.sat * A.saturation;
    grade.contrast = P.contrast;
    grade.vignette = P.vignette + 0.12 * dark;
    grade.tint[0] = tintRGB.r * A.tint.r;
    grade.tint[1] = tintRGB.g * A.tint.g;
    grade.tint[2] = tintRGB.b * A.tint.b;
    return A;
  }

  function pushGrade() {
    if (!ctx.has('postfx')) {
      renderer.toneMappingExposure = grade.exposure;
      return;
    }
    const eps = 0.004;
    const changed = Math.abs(grade.exposure - pushed.exposure) > eps
      || Math.abs(grade.saturation - pushed.saturation) > eps
      || Math.abs(grade.contrast - pushed.contrast) > eps
      || Math.abs(grade.vignette - pushed.vignette) > eps
      || Math.abs(grade.tint[0] - pushed.tint[0]) > eps
      || Math.abs(grade.tint[1] - pushed.tint[1]) > eps
      || Math.abs(grade.tint[2] - pushed.tint[2]) > eps;
    if (!changed) return;
    pushed.exposure = grade.exposure;
    pushed.saturation = grade.saturation;
    pushed.contrast = grade.contrast;
    pushed.vignette = grade.vignette;
    pushed.tint[0] = grade.tint[0];
    pushed.tint[1] = grade.tint[1];
    pushed.tint[2] = grade.tint[2];
    ctx.postfx.setGrade(grade, 0);
  }

  function refreshEnvironment(force) {
    const A = atmos.state;
    const drift = Math.abs(wrap24(st.time - captured.time + 12) - 12);
    const sky = drift > ENV_TIME_STEP || Math.abs(st.aurora - captured.aurora) > 0.05;
    const air = Math.max(Math.abs(A.fogWeight - captured.fog), Math.abs(A.darkness - captured.dark)) > ENV_ATMOS_STEP;
    const due = envClock >= ENV_REFRESH_INTERVAL;
    if (!force && !(drift > ENV_TIME_JUMP || (due && (sky || air)))) return;
    envClock = 0;
    captures++;
    captured.time = st.time;
    captured.aurora = st.aurora;
    captured.fog = A.fogWeight;
    captured.dark = A.darkness;
    cubeCamera.position.copy(camera.position);
    captureSky.position.copy(camera.position);
    cubeCamera.update(renderer, envScene);
    const result = pmrem.fromCubemap(cubeTarget.texture, envTarget);
    if (!envTarget) {
      envTarget = result;
      scene.environment = envTarget.texture;
    }
    scene.environmentIntensity = ENV_INTENSITY;
  }

  function followShadow() {
    camera.getWorldDirection(tmp);
    tmp.y = 0;
    if (tmp.lengthSq() > 1e-6) tmp.normalize();
    const r = shadowCam.right;
    focus.copy(camera.position).addScaledVector(tmp, r * 0.4);
    const z = lightDir;
    lx.set(0, 1, 0).cross(z);
    if (lx.lengthSq() < 1e-6) lx.set(1, 0, 0);
    lx.normalize();
    ly.crossVectors(z, lx);
    const texel = (2 * r) / sun.shadow.mapSize.x;
    const fx = focus.dot(lx);
    const fy = focus.dot(ly);
    focus.addScaledVector(lx, Math.round(fx / texel) * texel - fx).addScaledVector(ly, Math.round(fy / texel) * texel - fy);
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(lightDir, SHADOW_DISTANCE);
    sun.target.updateMatrixWorld();
  }

  computeSky(0);

  const env = {
    sun,
    hemi,
    sky,
    lights,
    atmospheres: atmos.list,
    get time() {
      return st.time;
    },
    set time(h) {
      setTime(h);
    },
    get stage() {
      return st.stage;
    },
    get night() {
      return st.night;
    },
    get transitioning() {
      return Boolean(st.anim);
    },
    setTime,
    setStage,
    addAtmosphere(opts) {
      return atmos.add(opts);
    },
    debugInfo() {
      return {
        time: st.time, stage: st.stage, sunElevation: st.sunElevation, moonElevation: st.moonElevation,
        night: st.night, aurora: st.aurora, sunDir: U.uSunDir.value.toArray(), grade: { ...grade, tint: [...grade.tint] },
        atmosphere: { fogWeight: atmos.state.fogWeight, darkness: atmos.state.darkness }, lights: { size: lights.size, handles: lights.count, active: lights.active }, envCaptures: captures,
      };
    },
    start() {
      if (!ctx.has('postfx')) {
        skyMaterial.defines = { DITHER_OUT: '' };
        skyMaterial.needsUpdate = true;
      }
      refreshEnvironment(true);
    },
    update(dt) {
      const a = st.anim;
      if (!a) return;
      a.t = Math.min(1, a.t + dt / a.duration);
      st.time = wrap24(a.from + a.delta * easeInOut(a.t));
      if (a.t >= 1) st.anim = null;
    },
    frame(dt) {
      computeSky(dt);
      sky.position.copy(camera.position);
      camera.getWorldDirection(tmp);
      tmp.y = 0;
      if (tmp.lengthSq() > 1e-6) tmp.normalize();
      fill.position.copy(camera.position).addScaledVector(tmp, -FILL.back).y += FILL.height;
      followShadow();
      lights.update(dt);
      pushGrade();
      envClock += dt;
      refreshEnvironment(false);
    },
    dispose() {
      scene.remove(sky, sun, sun.target, hemi, fill);
      lights.dispose();
      fill.dispose();
      sky.geometry.dispose();
      skyMaterial.dispose();
      captureSky.geometry.dispose();
      captureMaterial.dispose();
      cubeTarget.dispose();
      envTarget?.dispose();
      pmrem.dispose();
      sun.shadow.map?.dispose();
    },
  };
  return env;
}
