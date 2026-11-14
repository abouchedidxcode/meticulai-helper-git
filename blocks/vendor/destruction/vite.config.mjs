// The block demo's build: index.html at the top of dist, every path relative, nothing from other hosts.
// No `vite` import: the config is a plain object. three-avbd is vendored at commit cd3ce90 (vendor/three-avbd,
// MIT) and imported from its source, pinned by the copy; three is the repo's one copy.
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const lib = (f) => fileURLToPath(new URL(`./vendor/three-avbd/src/lib/${f}`, import.meta.url));

export default {
	root: here,
	base: './',
	publicDir: 'public',
	resolve: {
		alias: [
			{ find: /^three-avbd\/advanced$/, replacement: lib('advanced.ts') },
			{ find: /^three-avbd$/, replacement: lib('index.ts') },
			{ find: /^patch-block$/, replacement: fileURLToPath(new URL('./lib/patch-block.js', import.meta.url)) },
		],
		dedupe: ['three'],
	},
	build: { target: 'es2022', outDir: `${here}dist`, emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 4000, modulePreload: { polyfill: false } },
};
