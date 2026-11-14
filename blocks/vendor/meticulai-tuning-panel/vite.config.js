// The demo's dev server. Its small plugin answers POST /__helper/tuning the way the kit starter's helper-plugin.js
// does (writes demo/tuning.json), so "Save for my agent" works in the demo too. Dev server only.
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const root = path.resolve(import.meta.dirname, 'demo');

function saveTuning() {
  return {
    name: 'demo-save-tuning',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__helper/tuning', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 200000) req.destroy(); });
        req.on('end', () => {
          try {
            const { values } = JSON.parse(body);
            if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('values must be an object');
            fs.writeFileSync(path.join(root, 'tuning.json'), JSON.stringify(values, null, 2) + '\n');
            res.setHeader('content-type', 'application/json');
            res.end('{"ok":true}');
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: e.message }));
          }
        });
      });
    },
    // the page already has the saved values: don't reload it
    hotUpdate({ file }) { if (file.endsWith(path.join('demo', 'tuning.json'))) return []; },
  };
}

export default defineConfig({
  root,
  base: './',
  plugins: [saveTuning()],
  server: { port: 5417, host: '127.0.0.1' },
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
