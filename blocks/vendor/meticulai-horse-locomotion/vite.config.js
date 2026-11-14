// The demo page lives in demo/; `npm run build` writes a static copy with relative paths to dist/.
import { fileURLToPath } from 'node:url';

export default {
  root: fileURLToPath(new URL('./demo', import.meta.url)),
  base: './',
  publicDir: false,
  resolve: { dedupe: ['three'] },
  build: { outDir: fileURLToPath(new URL('./dist', import.meta.url)), emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 1500 },
};
