// The demo page: demo/index.html at the top of dist, every path relative.
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

export default {
  root: fileURLToPath(new URL('./demo/', import.meta.url)),
  base: './',
  publicDir: false,
  resolve: { dedupe: ['three'] },
  build: { outDir: `${here}dist`, emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 1500 },
};
