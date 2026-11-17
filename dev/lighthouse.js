import '../src/core/fonts.js';
import { bootZone } from './_zone.js';

const params = new URLSearchParams(location.search);
const ctx = await bootZone('lighthouse');
if (!params.has('stage') && ctx.env.stage !== ctx.state.stage) ctx.debug.setStage(ctx.state.stage);

if (params.get('beacons') === '1') {
  for (const id of ['feed', 'farm', 'hallu', 'oldweb', 'forest']) {
    const [x, z] = ctx.world.zones[id].center;
    ctx.beacons.create(id, { position: [x, ctx.world.heightAt(x, z), z] });
  }
}
window.__lh = ctx.zones.lighthouse;
