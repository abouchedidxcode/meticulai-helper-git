import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The demo's build: index.html at the top of dist, every path relative, nothing from other hosts, and the
// licences of everything bundled written beside it.
export default defineConfig({
	base: './',
	resolve: { alias: [{ find: /^patch-block$/, replacement: fileURLToPath(new URL('./lib/patch-block.js', import.meta.url)) }] },
	build: {
		target: 'es2022',
		outDir: 'dist',
		sourcemap: false,
		chunkSizeWarningLimit: 8000,
		modulePreload: { polyfill: false },
		license: { fileName: 'THIRD-PARTY-NOTICES.md' },
	},
});
