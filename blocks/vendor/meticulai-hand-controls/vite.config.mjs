import { defineConfig } from 'vite';

// The demo lives in demo/; public/ (wasm + model, filled by scripts/fetch-model.mjs) is served beside it.
export default defineConfig({
  root: 'demo',
  base: './',
  publicDir: '../public',
  server: { host: '127.0.0.1', port: 5396 },
  // the MediaPipe package ships its own ES module; let Vite leave it alone
  optimizeDeps: { exclude: ['@mediapipe/tasks-vision'] },
  build: { outDir: '../dist', emptyOutDir: true },
});
