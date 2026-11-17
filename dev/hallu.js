import { bootZone } from './_zone.js';

const ctx = await bootZone('hallu');
if (!ctx.options.nosave && ctx.state.hasSave()) {
  ctx.state.load();
  ctx.events.emit('game:start', { newGame: false });
  ctx.env.setStage(ctx.state.stage, { instant: true });
  ctx.events.emit('stage:change', { stage: ctx.state.stage, from: 0, instant: true });
}
