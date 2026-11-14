// The block demo: demo/ is the page, src/ is the block. `npm run build` writes dist/ with relative paths.
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

export default {
  root: `${here}demo`,
  base: './',
  publicDir: false,
  resolve: { dedupe: ['three'] },
  server: { fs: { allow: [here] } },
  build: { outDir: `${here}dist`, emptyOutDir: true, target: 'es2022' },
};
