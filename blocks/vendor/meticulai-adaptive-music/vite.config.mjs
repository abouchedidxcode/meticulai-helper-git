// The block demo: demo/index.html at the top of dist, every path relative, nothing from other hosts.
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

export default {
  root: fileURLToPath(new URL('./demo', import.meta.url)),
  base: './',
  publicDir: false,
  server: { fs: { allow: [here] } },
  build: { target: 'es2022', outDir: fileURLToPath(new URL('./dist', import.meta.url)), emptyOutDir: true },
};
