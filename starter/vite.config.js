// Vite settings. `base: './'` keeps every path relative, so the built game works from any
// folder (itch.io, GitHub Pages, a zip). The helper plugin only runs with `npm run dev`.
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import helperPlugin from './helper-plugin.js';

let port = 5173;
try {
  port = JSON.parse(readFileSync(new URL('./helper.json', import.meta.url), 'utf8')).port ?? port;
} catch {
  /* no helper.json: use the default */
}

export default defineConfig({
  base: './',
  plugins: [helperPlugin()],
  server: {
    port,
    strictPort: true, // the play link must never change
    watch: {
      // Big folders the game never imports: don't make the dev server watch them.
      ignored: ['**/playtest-notes/**', '**/recordings/**', '**/refs/**', '**/ship/**', '**/.helper/**'],
    },
  },
  build: {
    chunkSizeWarningLimit: 1500, // three.js alone is ~700 KB; that's fine for a game
  },
});
