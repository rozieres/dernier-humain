#!/usr/bin/env node
import { launch, openPage, waitFor } from './browser.mjs';

const HELP = `usage: node tools/shot.mjs <url> <out.png> [options]
  --size=1280x720     viewport
  --wait=2000         ms to wait after load (and after --until)
  --until="expr"      JS expression polled until truthy (ex: "window.__game?.ready")
  --eval="code"       async function body run in the page before the capture; its return value is printed as JSON
  --gpu=gpu|swiftshader   rendering backend (default gpu, env SHOT_GPU)
  --timeout=60000     max wait for --until
  --logs              also print console.log lines
exit code 1 if the page raised errors.`;

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const opts = Object.fromEntries(
  args.filter((a) => a.startsWith('--')).map((a) => {
    const i = a.indexOf('=');
    return i === -1 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)];
  }),
);

if (positional.length < 2 || opts.help) {
  console.log(HELP);
  process.exit(positional.length < 2 ? 2 : 0);
}

const [url, out] = positional;
const [width, height] = (opts.size || '1280x720').split('x').map(Number);
const { browser, context } = await launch({ gpu: opts.gpu, width, height });
let failed = false;
try {
  const { page, log } = await openPage(context, url);
  if (opts.until) await waitFor(page, opts.until, Number(opts.timeout || 60000));
  await page.waitForTimeout(Number(opts.wait ?? 2000));
  if (opts.eval) {
    const result = await page.evaluate(`(async () => { ${opts.eval} })()`);
    if (result !== undefined) console.log('[eval]', JSON.stringify(result, null, 1));
  }
  await page.screenshot({ path: out });
  if (opts.logs) for (const line of log.logs) console.log('[console.log]', line);
  console.log(`[shot] ${out} — ${log.errors.length} error(s), ${log.warnings.length} warning(s)`);
  failed = log.errors.length > 0;
} catch (err) {
  console.log('[shot] failed:', err.message);
  failed = true;
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
