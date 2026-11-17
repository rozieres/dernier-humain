import { bootZone } from './_zone.js';

const load = (ctx) => {
  if (!ctx.options.nosave) ctx.state.load();
};

await bootZone('forest', { extra: [{ name: 'forestSave', create: load }] });
