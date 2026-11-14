// The demo: `npm run dev` serves demo/; `npm run build` writes dist/ with relative paths.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: `${here}demo`,
  base: './',
  publicDir: false,
  resolve: { dedupe: ['three'] },
  build: { outDir: `${here}dist`, emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
