import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  optimizeDeps: { exclude: ['three', '@dimforge/rapier3d-compat'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
});
