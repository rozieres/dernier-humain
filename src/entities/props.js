import { metalMask, woodTexture, stoneTexture, plainTexture, impactHandler } from './props/kit.js';
import { createDynamicProps } from './props/dynamic.js';
import { createStaticProps } from './props/statics.js';

export default async function create(ctx) {
  const woodMap = woodTexture();
  const mats = {
    metalMask,
    wood: ctx.mat.standard({ map: woodMap, bumpMap: woodMap, bumpScale: 0.7, vertexColors: true, roughness: 0.84, metalness: 0 }, { onShader: metalMask }),
    iron: ctx.mat.standard({ vertexColors: true, roughness: 0.6, metalness: 0 }, { onShader: metalMask }),
    stone: ctx.mat.standard({ map: stoneTexture(), vertexColors: true, roughness: 0.88, metalness: 0 }),
    plastic: ctx.mat.standard({ map: plainTexture(), vertexColors: true, roughness: 0.5, metalness: 0 }),
  };

  const animated = [];
  const anim = { add: (fn) => animated.push(fn) };
  let clock = 0;

  const dynamic = createDynamicProps(ctx, mats);
  const statics = createStaticProps(ctx, mats, anim);

  return {
    ...dynamic,
    ...statics,

    custom(mesh, physicsOptions = {}) {
      if (!mesh.parent) ctx.scene.add(mesh);
      mesh.userData.kind ??= 'custom';
      const entity = ctx.physics.addDynamic(mesh, { grabbable: true, userData: { kind: mesh.userData.kind }, ...physicsOptions });
      entity.onCollision ??= impactHandler(ctx, entity);
      return entity;
    },

    frame(dt) {
      clock += dt;
      for (const fn of animated) fn(clock, dt);
    },
  };
}
