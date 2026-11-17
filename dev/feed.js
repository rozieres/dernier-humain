import { bootZone } from './_zone.js';
import createFeed from '/src/zones/feed.js';

const params = new URLSearchParams(location.search);
const loadSave = params.has('load');
const extra = loadSave ? [{
  name: 'feedFromSave',
  async create(ctx) {
    ctx.state.load();
    const zone = await createFeed(ctx);
    ctx.zones.feed = zone;
    return zone;
  },
}] : [];
const ctx = await bootZone('feed', loadSave ? { zones: [], extra } : {});
window.__feed = ctx.zones.feed;
