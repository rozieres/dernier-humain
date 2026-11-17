import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = new URL('../..', import.meta.url).pathname;
const children = [];

export function killAll() {
  for (const c of children) {
    try {
      process.kill(-c.pid, 'SIGKILL');
    } catch {
      try {
        c.kill('SIGKILL');
      } catch {}
    }
  }
  children.length = 0;
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    killAll();
    process.exit(130);
  });
}
process.on('exit', killAll);

function run(args, env = {}) {
  const child = spawn('npx', args, { cwd: ROOT, env: { ...process.env, ...env }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = [];
  child.stdout.on('data', (d) => out.push(String(d)));
  child.stderr.on('data', (d) => out.push(String(d)));
  children.push(child);
  child.logs = () => out.join('');
  return child;
}

async function waitUp(url, child, timeoutMs = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`server exited early (code ${child.exitCode}):\n${child.logs()}`);
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await sleep(300);
  }
  throw new Error(`server did not answer at ${url} within ${timeoutMs / 1000} s:\n${child.logs()}`);
}

export async function startTarget() {
  if (process.env.E2E_BASE) return { base: process.env.E2E_BASE.replace(/\/$/, ''), mode: 'external' };
  if (process.env.E2E_TARGET === 'preview') {
    const outDir = 'node_modules/.e2e-dist';
    const build = spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], { cwd: ROOT, env: { ...process.env, VITE_CACHE_DIR: 'node_modules/.vite-e2e' }, encoding: 'utf8' });
    if (build.status !== 0) throw new Error(`vite build failed:\n${build.stdout}\n${build.stderr}`);
    const child = run(['vite', 'preview', '--port', '5291', '--strictPort', '--outDir', outDir]);
    await waitUp('http://127.0.0.1:5291/', child);
    return { base: 'http://127.0.0.1:5291', mode: 'preview' };
  }
  const child = run(['vite', '--port', '5290', '--strictPort'], { VITE_CACHE_DIR: 'node_modules/.vite-e2e' });
  await waitUp('http://127.0.0.1:5290/', child);
  return { base: 'http://127.0.0.1:5290', mode: 'dev' };
}
