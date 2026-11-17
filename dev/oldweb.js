import '../src/core/fonts.js';
import { bootZone } from './_zone.js';

const params = new URLSearchParams(location.search);
const booting = bootZone('oldweb');
if (params.has('load')) window.__game.state.load();
const ctx = await booting;
if (params.has('load')) {
  ctx.env.setStage(ctx.state.stage, { instant: true });
  ctx.events.emit('stage:change', { stage: ctx.state.stage, from: 0, instant: true });
}
