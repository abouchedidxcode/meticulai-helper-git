// The game's dev server (Vite) and a tiny static server for built games.
//  - ensureServer(dir)  reuse the running server for this game, or start one in the background; returns { url, port }
//  - serverStatus(dir)  { running, url, port, pid }
//  - stopServer(dir)
//  - startStatic(root)  serve a folder (e.g. dist/) on a free port; returns { url, port, close() }
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { HelperError, detail, say } from './log.mjs';
import { helperDir, pretty, readHelper, readJson, writeHelper, writeJson } from './paths.mjs';
import { findFreePort, httpGet, isAlive, isPortFree, killTree, run, sleep, spawnDetached, tail, isWin } from './proc.mjs';

export const PORT_RANGE = [5170, 5199];
const serverFile = (dir) => path.join(helperDir(dir), 'server.json');
const logFile = (dir) => path.join(helperDir(dir), 'server.log');
export const localUrl = (port) => `http://localhost:${port}`;
const innerUrl = (port) => `http://127.0.0.1:${port}`;

/** What answers on this port: 'ours' (ping says our game), 'other-game', 'web' (some other web server), or null (nothing). */
async function probe(port, gameName) {
  const r = await httpGet(`${innerUrl(port)}/__helper/ping`, 1500);
  if (!r) return null;
  if (r.json && r.json.ok) return r.json.game === gameName ? 'ours' : 'other-game';
  return 'web';
}

export function viteBin(dir) {
  return path.join(dir, 'node_modules', 'vite', 'bin', 'vite.js');
}
function needVite(dir) {
  const v = viteBin(dir);
  if (!fs.existsSync(v)) {
    throw new HelperError(`the game's building blocks are not installed yet (no node_modules in ${pretty(dir)}).`, 'Run  node tools/doctor.mjs --fix  (it installs them), then try again.');
  }
  return v;
}

/** Is our server running? { running, url, port, pid, external } */
export async function serverStatus(dir) {
  const cfg = readHelper(dir);
  const rec = readJson(serverFile(dir));
  if (rec && isAlive(rec.pid)) {
    const what = await probe(rec.port, cfg.gameName);
    if (what === 'ours' || what === 'web') return { running: true, url: localUrl(rec.port), port: rec.port, pid: rec.pid, pingOk: what === 'ours' };
  }
  if ((await probe(cfg.port, cfg.gameName)) === 'ours') return { running: true, url: localUrl(cfg.port), port: cfg.port, pid: null, external: true, pingOk: true };
  return { running: false, port: cfg.port, url: localUrl(cfg.port) };
}

/** A small lock so two agents calling serve at the same moment don't start two servers. */
async function withServeLock(dir, fn) {
  const lock = path.join(helperDir(dir), 'serve.lock');
  const end = Date.now() + 120000;
  for (;;) {
    try { fs.mkdirSync(lock); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let age = 0;
      try { age = Date.now() - fs.statSync(lock).mtimeMs; } catch { continue; }
      if (age > 90000 || Date.now() > end) { fs.rmSync(lock, { recursive: true, force: true }); continue; }
      await sleep(300);
    }
  }
  try { return await fn(); } finally { fs.rmSync(lock, { recursive: true, force: true }); }
}

/** Reuse or start the dev server. Returns { url, port, pid, started }. */
export async function ensureServer(dir, { quiet = false } = {}) {
  return withServeLock(dir, async () => {
    let cfg = readHelper(dir);
    const st = await serverStatus(dir);
    if (st.running) {
      detail(`reusing the server on port ${st.port} (pid ${st.pid ?? 'unknown, started outside the helper'})`);
      return { ...st, started: false };
    }
    const rec = readJson(serverFile(dir));
    if (rec && isAlive(rec.pid)) { detail(`old server pid ${rec.pid} is not answering; stopping it`); await killTree(rec.pid); }

    const vite = needVite(dir);
    let port = cfg.port;
    if (!(await isPortFree(port))) {
      const [lo, hi] = PORT_RANGE;
      const free = (await findFreePort(Math.max(lo, port + 1), hi)) ?? (await findFreePort(lo, hi, [port]));
      if (!free) throw new HelperError(`every port from ${lo} to ${hi} is busy, so the game has nowhere to run.`, 'Restart your computer (or close other game servers), then try again.');
      if (!quiet) say(`Port ${port} is busy with another program, so your game moves to port ${free}. The new link is below.`);
      cfg = { ...cfg, ...writeHelper(dir, { port: free }) };
      port = free;
    }
    if (!quiet) say('Starting your game in the background...');
    const pid = spawnDetached(process.execPath, [vite, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: dir, logFile: logFile(dir) });
    writeJson(serverFile(dir), { pid, port, gameName: cfg.gameName, started: new Date().toISOString() });
    detail(`started vite pid ${pid} on port ${port}; log: ${logFile(dir)}`);

    const end = Date.now() + 60000;
    let webSince = 0;
    while (Date.now() < end) {
      if (!isAlive(pid)) {
        // someone else may have started the same game a moment ago
        if ((await probe(port, cfg.gameName)) === 'ours') return { url: localUrl(port), port, pid: null, started: false, external: true };
        detail(tail(logFile(dir), 25));
        throw new HelperError('the game server stopped right after starting.', `Look at the end of ${pretty(logFile(dir))} (or run again with --verbose) and fix the first error it shows.`);
      }
      const what = await probe(port, cfg.gameName);
      if (what === 'ours') return { url: localUrl(port), port, pid, started: true, pingOk: true };
      if (what === 'web' || what === 'other-game') {
        // Vite answers but the helper endpoint doesn't (or names another game). Give the plugin a moment, then accept.
        if (!webSince) webSince = Date.now();
        else if (Date.now() - webSince > 5000) {
          detail(`port ${port} answers but /__helper/ping does not report "${cfg.gameName}". Is the helper plugin in vite.config.js?`);
          return { url: localUrl(port), port, pid, started: true, pingOk: false };
        }
      }
      await sleep(300);
    }
    await killTree(pid);
    detail(tail(logFile(dir), 25));
    throw new HelperError('the game server took more than a minute to start.', `Look at the end of ${pretty(logFile(dir))}, or run again with --verbose.`);
  });
}

/** Find the pid listening on a port (macOS/Linux only; null elsewhere). */
async function pidOnPort(port) {
  if (isWin) return null;
  const r = await run('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']);
  const pid = Number((r.stdout || '').split('\n')[0]);
  return pid || null;
}

/** Stop the game server. Returns { stopped, wasRunning }. */
export async function stopServer(dir) {
  const st = await serverStatus(dir);
  const rec = readJson(serverFile(dir));
  let pid = rec && isAlive(rec.pid) ? rec.pid : null;
  if (!pid && st.running) pid = await pidOnPort(st.port);
  fs.rmSync(serverFile(dir), { force: true });
  if (!pid) return { stopped: !st.running, wasRunning: st.running };
  const gone = await killTree(pid);
  return { stopped: gone, wasRunning: true };
}

// ---------------------------------------------------------------- static server for built games

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.wasm': 'application/wasm',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.ktx2': 'image/ktx2', '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream',
};

/** Serve a folder at a sub-path (default "/play/", like itch.io and GitHub Pages do, so absolute "/" paths break here too). */
export function startStatic(root, { prefix = '/play/' } = {}) {
  root = path.resolve(root);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!p.startsWith(prefix)) { res.writeHead(404); res.end('not found'); return; }
    p = p.slice(prefix.length);
    let file = path.join(root, p);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch { /* 404 below */ }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ url: `http://127.0.0.1:${port}${prefix}`, port, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

/** Production build of the game into outDir with relative paths (base './'). */
export async function buildGame(dir, outDir) {
  const vite = needVite(dir);
  const r = await run(process.execPath, [vite, 'build', '--base', './', '--outDir', outDir, '--emptyOutDir'], { cwd: dir });
  if (r.code !== 0) {
    detail(r.stdout.split('\n').slice(-30).join('\n'), r.stderr.split('\n').slice(-30).join('\n'));
    const first = (r.stderr || r.stdout).split('\n').find((l) => /error/i.test(l)) || '';
    throw new HelperError(`the game would not build${first ? `: ${first.trim().slice(0, 300)}` : '.'}`, 'Fix the error above in the game code (or ask your agent to), then try again. Run with --verbose for the full output.');
  }
  return outDir;
}
