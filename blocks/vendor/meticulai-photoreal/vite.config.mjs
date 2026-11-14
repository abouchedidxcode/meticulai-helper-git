import { defineConfig } from 'vite';

// The demo lives in demo/; `npm run dev` serves it, `npm run build` writes dist/ (relative paths).
export default defineConfig({
  root: 'demo',
  base: './',
  server: { host: '127.0.0.1', port: 5395 },
  resolve: { dedupe: ['three'] },
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
