// The demo: `npm run dev` serves demo/ (it imports ../src); `npm run build` writes dist/ with relative paths.
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

export default {
  root: fileURLToPath(new URL('./demo', import.meta.url)),
  base: './',
  publicDir: false,
  server: { fs: { allow: [here] } },
  resolve: { dedupe: ['three'] },
  build: { outDir: fileURLToPath(new URL('./dist', import.meta.url)), emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 2000 },
};
