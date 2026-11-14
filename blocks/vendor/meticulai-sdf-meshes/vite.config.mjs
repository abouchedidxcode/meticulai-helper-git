// The demo: `npm run dev` serves demo/; `npm run build` writes dist/ with relative paths.
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

export default {
  root: fileURLToPath(new URL('./demo/', import.meta.url)),
  base: './',
  publicDir: false,
  resolve: { dedupe: ['three'] },
  server: { fs: { allow: [here] } },
  build: { outDir: `${here}dist`, emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 2000 },
};
