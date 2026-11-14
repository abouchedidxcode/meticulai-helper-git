// The demo: demo/index.html. public/ holds the model and wasm (filled by scripts/fetch-model.mjs).
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('./demo', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  base: './',
  server: { port: 5396, host: '127.0.0.1' },
  build: { outDir: fileURLToPath(new URL('./dist', import.meta.url)), emptyOutDir: true },
  optimizeDeps: { exclude: ['@mediapipe/tasks-vision'] },
});
