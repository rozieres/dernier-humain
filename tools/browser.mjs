import { chromium } from 'playwright';

const GPU_FLAGS = {
  gpu: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu', '--enable-webgl'],
  swiftshader: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
};

export async function launch({ gpu = process.env.SHOT_GPU || 'gpu', width = 1280, height = 720, headless = true } = {}) {
  const browser = await chromium.launch({
    headless,
    channel: 'chromium',
    args: [
      ...(GPU_FLAGS[gpu] || GPU_FLAGS.gpu),
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'fr-FR' });
  return { browser, context };
}

export async function openPage(context, url, { quiet = false } = {}) {
  const page = await context.newPage();
  const log = { errors: [], warnings: [], logs: [] };
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') log.errors.push(text);
    else if (type === 'warning') log.warnings.push(text);
    else log.logs.push(text);
    if (!quiet && (type === 'error' || type === 'warning')) console.log(`[console.${type}] ${text}`);
  });
  page.on('pageerror', (err) => {
    log.errors.push(String(err.stack || err));
    if (!quiet) console.log(`[pageerror] ${err.stack || err}`);
  });
  page.on('requestfailed', (req) => {
    log.errors.push(`request failed: ${req.url()} ${req.failure()?.errorText || ''}`);
    if (!quiet) console.log(`[requestfailed] ${req.url()} ${req.failure()?.errorText || ''}`);
  });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  return { page, log };
}

export async function waitFor(page, expression, timeout = 60000) {
  await page.waitForFunction(expression, null, { timeout, polling: 100 });
}
