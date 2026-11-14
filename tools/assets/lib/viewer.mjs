// Run the asset viewer (tools/assets/viewer/) in the hidden browser and get pictures + facts back.
// A throwaway local server serves the viewer page, three.js from the kit's node_modules, and only the folders the
// caller registers (the asset being looked at). Everything happens under the machine-wide browser lock.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HelperError, detail } from '../../lib/log.mjs';
import { REPO_ROOT } from '../../lib/paths.mjs';
import { launch, newGamePage, withBrowserLock } from '../../lib/browser.mjs';

const VIEWER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'viewer');
const THREE_DIR = path.join(REPO_ROOT, 'node_modules', 'three');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.bmp': 'image/bmp', '.tga': 'image/x-tga', '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.wasm': 'application/wasm', '.fbx': 'application/octet-stream',
  '.obj': 'text/plain', '.mtl': 'text/plain', '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function startServer() {
  const roots = new Map(); // token -> absolute folder
  const serveFrom = (base, rel, res) => {
    const file = path.resolve(base, rel);
    if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  };
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
    if (p.startsWith('/viewer/')) return serveFrom(VIEWER_DIR, p.slice(8) || 'index.html', res);
    if (p.startsWith('/three/')) return serveFrom(THREE_DIR, p.slice(7), res);
    const m = /^\/f\/([a-z0-9]+)\/(.*)$/.exec(p);
    if (m && roots.has(m[1])) return serveFrom(roots.get(m[1]), m[2], res);
    res.writeHead(404); res.end('not found');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      let n = 0;
      resolve({
        base,
        /** Serve a folder; returns its URL prefix. */
        addRoot(dir) {
          const t = `r${++n}`;
          roots.set(t, path.resolve(dir));
          return `${base}/f/${t}/`;
        },
        /** URL for one file (its folder is served, so glTF side files and textures load too). */
        urlFor(file) {
          const abs = path.resolve(file);
          const prefix = this.addRoot(path.dirname(abs));
          return prefix + encodeURIComponent(path.basename(abs));
        },
        close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
      });
    });
  });
}

/**
 * Open the viewer and run fn(api) where api.call(name, args) runs window.viewer[name](args) in the page,
 * api.urlFor(file) / api.addRoot(dir) make local files reachable. Returns fn's result.
 */
export async function withViewer(fn, { label = 'look' } = {}) {
  if (!fs.existsSync(path.join(THREE_DIR, 'build', 'three.module.js'))) {
    throw new HelperError('three.js is not installed in the kit yet (the viewer needs it).', 'Run  node tools/doctor.mjs --fix  (or  npm install  in the kit folder) and try again.');
  }
  return withBrowserLock(async () => {
    const srv = await startServer();
    const browser = await launch();
    try {
      const { page, problems } = await newGamePage(browser, { freezeReload: false, viewport: { width: 1280, height: 960 } });
      await page.goto(`${srv.base}/viewer/index.html`, { waitUntil: 'load', timeout: 30000 });
      const ready = await page.waitForFunction(() => window.viewerReady === true || window.viewerError, null, { timeout: 30000 }).then(() => page.evaluate(() => window.viewerError || null)).catch((e) => e.message);
      if (ready) throw new HelperError(`the 3D viewer page didn't start (${ready}).`, 'Run again with --verbose. If three.js is missing, run  node tools/doctor.mjs --fix.', new Error(problems.join('\n')));
      const api = {
        urlFor: (f) => srv.urlFor(f),
        addRoot: (d) => srv.addRoot(d),
        problems,
        async call(name, args = {}, timeout = 180000) {
          let timer;
          const res = await Promise.race([
            page.evaluate(([n, a]) => window.viewer[n](a).then((r) => r, (e) => ({ error: String(e && (e.message || e)) })), [name, args]),
            new Promise((_, rej) => { timer = setTimeout(() => rej(new HelperError('the viewer took too long (over 3 minutes).', 'The file may be very big. Try a smaller version (e.g. --res 1k), or run again with --verbose.')), timeout); }),
          ]).finally(() => clearTimeout(timer));
          if (res && res.error) {
            detail(problems.slice(-10).join('\n'));
            throw new HelperError(`the viewer couldn't show it: ${res.error}`, 'Check the file is complete and in a format the viewer reads (glb, gltf, fbx, obj, png, jpg, hdr, exr, ttf/otf/woff). Run again with --verbose for details.');
          }
          return res;
        },
      };
      return await fn(api);
    } finally {
      await browser.close().catch(() => {});
      await srv.close().catch(() => {});
    }
  }, { label });
}

/** Save a data: URL to a file. */
export function saveDataUrl(dataUrl, file) {
  const m = /^data:[^;]+;base64,(.*)$/.exec(dataUrl || '');
  if (!m) throw new HelperError('the viewer returned no picture.', 'Run again with --verbose to see why.');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(m[1], 'base64'));
  return file;
}
