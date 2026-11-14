// The demo lives in demo/; `npm run build` writes dist/ with relative paths.
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  base: './',
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
