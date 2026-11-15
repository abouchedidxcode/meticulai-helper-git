// Headless browser helpers. Every browser the kit opens goes through here:
//  - launch():          headless Chromium (on macOS on the real GPU via Metal), never a visible window
//  - withBrowserLock(): one browser at a time on this computer, even with many agents running
//  - newGamePage():     a 1280x720 page that collects errors and can't be hot-reloaded by Vite mid-test
//  - openGame():        load the game and wait for window.__game.ready
//  - waitGameTime():    wait in GAME seconds (headless browsers run slower than real time)
//  - canvasStats():     is anything actually drawn, or is it a black screen?
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HelperError, detail, say } from './log.mjs';
import { isAlive, sleep } from './proc.mjs';

export const VIEWPORT = { width: 1280, height: 720 };

/** Chromium switches. On macOS use the GPU through Metal (otherwise WebGL falls back to slow software). */
export function browserArgs({ audio = false } = {}) {
  const args = [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ];
  if (process.platform === 'darwin') args.push('--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist');
  // Always muted: nothing ever plays through the speakers. Web Audio still runs, so loud.mjs can measure it.
  args.push('--mute-audio');
  if (audio) args.push('--autoplay-policy=no-user-gesture-required');
  return args;
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (e) {
    throw new HelperError('the browser tools (Playwright) are not installed yet.', 'Run  node tools/doctor.mjs --fix  and try again.', e);
  }
}

/** Launch headless Chromium (muted). opts.audio lets audio start without a click (loud.mjs). */
export async function launch(opts = {}) {
  const { chromium } = await loadPlaywright();
  try {
    return await chromium.launch({ headless: true, args: browserArgs(opts) });
  } catch (e) {
    const missing = /Executable doesn't exist|playwright install/i.test(e.message);
    throw new HelperError(
      missing ? 'the hidden test browser (Chromium) is not installed yet.' : 'the hidden test browser would not start.',
      missing ? 'Run  node tools/doctor.mjs --fix  and try again.' : 'Close other heavy programs, then try again. If it keeps failing, run  node tools/doctor.mjs.',
      e,
    );
  }
}

// ---------------------------------------------------------------- one browser at a time

/**
 * The lock folder. /tmp on macOS/Linux (so plain `mkdir /tmp/mhg-browser.lock` scripts share it), the temp folder on
 * Windows. Set HELPER_BROWSER_LOCK to a folder path to share a lock with other tooling on the same machine (the lock
 * holds `owner.json` and a plain `pid` file, and a lock whose `pid` is dead counts as stale).
 */
export const LOCK_DIR = process.env.HELPER_BROWSER_LOCK
  ? path.resolve(process.env.HELPER_BROWSER_LOCK)
  : path.join(process.platform !== 'win32' && fs.existsSync('/tmp') ? '/tmp' : os.tmpdir(), 'mhg-browser.lock');
const OWNER_FILE = path.join(LOCK_DIR, 'owner.json');
const MAX_AGE_MS = 45 * 60 * 1000; // a holder older than this is assumed dead, even if its pid was reused
const NO_OWNER_MAX_AGE_MS = 10 * 60 * 1000; // a bare mkdir lock (from a shell script) with no owner file
let held = 0;
let exitHooked = false;

function readOwner() {
  try { return JSON.parse(fs.readFileSync(OWNER_FILE, 'utf8')); } catch { return null; }
}

function lockIsStale() {
  let st;
  try { st = fs.statSync(LOCK_DIR); } catch { return false; }
  const owner = readOwner();
  if (!owner) {
    // maybe written by a shell script: `pid` file, or nothing at all
    let pid = null;
    try { pid = Number(fs.readFileSync(path.join(LOCK_DIR, 'pid'), 'utf8').trim()); } catch { /* none */ }
    if (pid && !isAlive(pid)) return true;
    return Date.now() - st.mtimeMs > NO_OWNER_MAX_AGE_MS;
  }
  if (owner.host && owner.host !== os.hostname()) return Date.now() - owner.started > MAX_AGE_MS;
  return !isAlive(owner.pid) || Date.now() - owner.started > MAX_AGE_MS;
}

function releaseLock() {
  if (held <= 0) return;
  held = 0;
  const owner = readOwner();
  if (owner && owner.pid !== process.pid) return; // not ours any more
  try { fs.rmSync(LOCK_DIR, { recursive: true, force: true }); } catch { /* already gone */ }
}

function hookExit() {
  if (exitHooked) return;
  exitHooked = true;
  process.on('exit', releaseLock);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => { releaseLock(); process.exit(130); });
  }
}

/**
 * Run fn() while holding the machine-wide browser lock. Waits for other agents' browsers to finish.
 * Nested calls in the same process just run fn().
 */
export async function withBrowserLock(fn, { label = path.basename(process.argv[1] || 'tool'), waitMs = 20 * 60 * 1000 } = {}) {
  if (held > 0) {
    held++;
    try { return await fn(); } finally { held--; }
  }
  hookExit();
  const end = Date.now() + waitMs;
  let told = false;
  for (;;) {
    try {
      fs.mkdirSync(LOCK_DIR); // atomic: only one process can create it
      fs.writeFileSync(OWNER_FILE, JSON.stringify({ pid: process.pid, label, started: Date.now(), host: os.hostname(), cwd: process.cwd() }));
      fs.writeFileSync(path.join(LOCK_DIR, 'pid'), String(process.pid));
      held = 1;
      detail(`browser lock taken: ${LOCK_DIR}`);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw new HelperError(`I couldn't create the browser lock in ${path.dirname(LOCK_DIR)}.`, 'Check that your temp folder is writable, then try again.', e);
    }
    if (lockIsStale()) {
      detail('removing a stale browser lock', readOwner() || '(no owner file)');
      const grave = `${LOCK_DIR}.stale-${process.pid}-${Date.now()}`;
      try { fs.renameSync(LOCK_DIR, grave); fs.rmSync(grave, { recursive: true, force: true }); } catch { /* someone else did it */ }
      continue;
    }
    if (Date.now() > end) {
      const o = readOwner();
      throw new HelperError(
        `another agent has been using the hidden browser for too long${o ? ` (${o.label}, process ${o.pid})` : ''}.`,
        `Wait for it to finish and try again. If nothing else is running, delete the folder ${LOCK_DIR} and try again.`,
      );
    }
    if (!told) {
      const o = readOwner();
      say(`Waiting for my turn: another agent is using the hidden browser${o ? ` (${o.label})` : ''}...`);
      told = true;
    }
    await sleep(1000);
  }
  try {
    return await fn();
  } finally {
    releaseLock();
  }
}

// ---------------------------------------------------------------- pages

/** Stops Vite's hot reload in this page only: its live-update socket never connects, so a file saved by another
 *  agent can't reload the page in the middle of a test or recording. The game itself loads normally. */
const FREEZE_RELOAD = `(() => {
  const Real = window.WebSocket;
  if (!Real) return;
  class Quiet extends EventTarget {
    constructor(url, protocols) { super(); this.url = String(url); this.protocol = ''; this.readyState = 0; this.binaryType = 'blob'; this.bufferedAmount = 0; this.extensions = ''; }
    send() {} close() {}
  }
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) { Quiet[k] = Real[k]; Quiet.prototype[k] = Real[k]; }
  const Wrapped = function (url, protocols) {
    const p = [].concat(protocols || []);
    if (p.includes('vite-hmr') || p.includes('vite-ping')) return new Quiet(url, protocols);
    return protocols === undefined ? new Real(url) : new Real(url, protocols);
  };
  Wrapped.prototype = Real.prototype;
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Wrapped[k] = Real[k];
  window.WebSocket = Wrapped;
})();`;

const pageProblems = new WeakMap();

/**
 * A new 1280x720 page. Returns { page, context, problems, navigations() }.
 * problems: plain strings for page errors and console errors (a missing favicon is ignored).
 */
export async function newGamePage(browser, { freezeReload = true, viewport = VIEWPORT, initScripts = [] } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  if (freezeReload) await page.addInitScript(FREEZE_RELOAD);
  for (const s of initScripts) await page.addInitScript(s);
  const problems = [];
  page.on('pageerror', (e) => problems.push(`Page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const where = m.location()?.url || '';
    if (/favicon\.ico/.test(where)) return;
    problems.push(`Console error: ${m.text()}${where && /Failed to load resource/.test(m.text()) ? ` (${where})` : ''}`);
  });
  pageProblems.set(page, problems);
  let navs = 0;
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });
  return { page, context, problems, navigations: () => navs };
}

/** Open the game and wait until window.__game.ready. Throws a HelperError that says what is missing. */
export async function openGame(page, url, { timeout = 60000 } = {}) {
  try {
    await page.goto(url, { waitUntil: 'load', timeout });
  } catch (e) {
    throw new HelperError(`the page ${url} would not open.`, 'Run  node tools/serve.mjs  to start the game, then try again.', e);
  }
  // Wait for ready. If the page has already thrown errors and nothing changes for 5 s, stop waiting: it crashed.
  const problems = pageProblems.get(page) || [];
  const end = Date.now() + timeout;
  let crashed = false, firstProblemAt = 0;
  for (;;) {
    const ready = await page.evaluate(() => !!(window.__game && window.__game.ready)).catch(() => false);
    if (ready) return;
    if (problems.length && !firstProblemAt) firstProblemAt = Date.now();
    if (firstProblemAt && Date.now() - firstProblemAt > 5000) { crashed = true; break; }
    if (Date.now() > end) break;
    await sleep(250);
  }
  const info = await page.evaluate(() => ({
    hooks: typeof window.__game === 'object' && window.__game !== null,
    frames: window.__game?.frames ?? null,
    errors: (window.__game?.errors || []).slice(0, 5).map(String),
    canvas: !!document.querySelector('canvas'),
  })).catch(() => ({ hooks: false }));
  detail(info);
  let why;
  if (crashed) why = `the game hit an error while starting and never became ready${info.hooks ? '' : ' (window.__game was never set up)'}.`;
  else if (!info.hooks) why = `the game didn't start within ${Math.round(timeout / 1000)} seconds: the page has no window.__game test hooks (the game code probably crashed while loading, or the hooks were removed).`;
  else if (!info.frames) why = `the game didn't draw its first frame within ${Math.round(timeout / 1000)} seconds.`;
  else why = `the game drew ${info.frames} frames but never said it was ready (window.__game.ready stayed false).`;
  const err = new HelperError(why, 'Read the errors above (if any) and fix the first one, then run the check again.');
  err.gameErrors = info.errors || [];
  throw err;
}

export const gameTime = (page) => page.evaluate(() => (window.__game && typeof window.__game.time === 'number' ? window.__game.time : null));

/**
 * Wait `seconds` of GAME time. If the game clock stops moving (paused, menu, crash) for `stallMs` of real time,
 * finish the wait in real time instead and report { stalled: true }.
 */
export async function waitGameTime(page, seconds, { stallMs = 8000, everyMs = 40, onPoll = null } = {}) {
  const t0 = await gameTime(page);
  if (t0 == null) { await sleep(seconds * 1000); return { stalled: true }; }
  const target = t0 + seconds;
  let last = t0, lastMove = Date.now();
  for (;;) {
    const t = await gameTime(page).catch(() => null);
    if (onPoll) await onPoll(t);
    if (t == null) return { stalled: true };
    if (t >= target) return { stalled: false, time: t };
    if (t !== last) { last = t; lastMove = Date.now(); }
    else if (Date.now() - lastMove > stallMs) {
      await sleep(Math.max(0, (target - t) * 1000));
      return { stalled: true, time: t };
    }
    await sleep(everyMs);
  }
}

/**
 * How much is drawn on screen. Uses __game.capture() if the game has it, else a page screenshot.
 * Returns { source, lit (0..1 share of pixels that aren't near-black), mean (0..255), std }.
 */
export async function canvasStats(page) {
  let url = null, source = 'capture';
  try { url = await page.evaluate(() => (typeof window.__game?.capture === 'function' ? window.__game.capture() : null)); } catch { url = null; }
  if (typeof url !== 'string' || !url.startsWith('data:image')) {
    source = 'screenshot';
    url = 'data:image/png;base64,' + (await page.screenshot({ type: 'png' })).toString('base64');
  }
  const stats = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const w = 160, h = 90;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let lit = 0, sum = 0, sum2 = 0;
    for (let i = 0; i < d.length; i += 4) {
      const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      sum += y; sum2 += y * y;
      if (y > 12) lit++;
    }
    const n = d.length / 4, mean = sum / n;
    return { lit: lit / n, mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
  }, url);
  return { source, ...stats };
}
