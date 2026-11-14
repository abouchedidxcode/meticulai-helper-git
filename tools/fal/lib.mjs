// Helpers for tools/fal/gen.mjs: paths, the key (never shown), the ledgers, and fal's queue API.
// Self-contained on purpose: Node 20+ built-ins only, plus the system ffmpeg to shrink big input pictures.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const HERE = path.join(REPO, 'tools', 'fal');
// For offline tests only: point the tool at a local mock server instead of fal.
const QUEUE = process.env.HELPER_FAL_TEST_QUEUE || 'https://queue.fal.run';
const REST = process.env.HELPER_FAL_TEST_REST || 'https://rest.fal.ai';

export function parseArgs(argv, bool = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const name = a.slice(2);
      const next = argv[i + 1];
      if (bool.includes(name) || next === undefined || next.startsWith('--')) out[name] = true;
      else { out[name] = next; i++; }
    } else if (a === '-h') out.help = true;
    else if (a === '-y') out.yes = true;
    else out._.push(a);
  }
  return out;
}

export function gameDir(args) {
  const d = (typeof args.dir === 'string' && args.dir) || process.env.HELPER_GAME_DIR || path.join(REPO, 'my-game');
  return path.resolve(d);
}

export function show(p) {
  const rel = path.relative(REPO, p);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : p;
}

export function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

export const money = (v) => `$${(Math.round(v * 100) / 100).toFixed(2)}`;
export const money3 = (v) => (v < 0.1 ? `$${v.toFixed(3)}` : money(v));

// ---------------------------------------------------------------- the key

// FAL_KEY from the environment, else the one FAL_KEY= line of <repo>/.env. Nothing else in that file is read or kept.
export function loadKey() {
  const clean = (v) => String(v || '').trim().replace(/^["']|["']$/g, '').trim();
  if (clean(process.env.FAL_KEY)) return clean(process.env.FAL_KEY);
  const envFile = path.join(REPO, '.env');
  if (!fs.existsSync(envFile)) return '';
  try {
    const line = fs.readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => /^\s*(export\s+)?FAL_KEY\s*=/.test(l));
    return line ? clean(line.slice(line.indexOf('=') + 1).replace(/\s+#.*$/, '')) : '';
  } catch { return ''; }
}

// Make sure the key can never reach the screen or a log: every write to stdout/stderr is scrubbed.
export function installRedaction(key) {
  if (!key) return;
  const parts = [key, ...key.split(':')].filter((p) => p.length >= 8).sort((a, b) => b.length - a.length);
  const scrub = (s) => { let t = s; for (const p of parts) t = t.split(p).join('[hidden key]'); return t; };
  for (const stream of [process.stdout, process.stderr]) {
    const write = stream.write.bind(stream);
    stream.write = (chunk, ...rest) => write(typeof chunk === 'string' ? scrub(chunk) : Buffer.isBuffer(chunk) ? scrub(chunk.toString()) : chunk, ...rest);
  }
  return scrub;
}

export const NO_KEY = `There is no fal key yet, so nothing can be generated. To add one:
  1. Go to fal.ai and make an account.
  2. Add a small balance (Billing). $10 is plenty to start.
  3. Open fal.ai/dashboard/keys and create a key. Copy it.
  4. In the kit's folder, copy the file .env.example and name the copy .env (your agent can do this step).
  5. Open .env, paste the key right after FAL_KEY= and save.
Never paste the key into the chat. The full guide, step by step: guides/fal-key.md`;

// ---------------------------------------------------------------- settings and ledgers

export function readHelper(game) {
  const f = path.join(game, 'helper.json');
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { fail(`${show(f)} is not valid JSON. Ask your agent to fix it.`); }
}

export const ledgerPath = (game) => path.join(game, '.helper', 'fal-ledger.jsonl');

export function readLedger(game) {
  const f = ledgerPath(game);
  if (!fs.existsSync(f)) return [];
  const rows = [];
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* a broken line is skipped, never fatal */ }
  }
  return rows;
}

export const spentSoFar = (game) => readLedger(game).reduce((s, r) => s + (Number(r.estUSD) || 0), 0);

export function appendLedger(game, row) {
  const f = ledgerPath(game);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.appendFileSync(f, JSON.stringify(row) + '\n');
}

const PAID_HEADER = `# Paid ledger

Every paid call made for this game, with its estimated cost. tools/fal/gen.mjs adds a row for each call.
Add a row by hand for anything you pay for somewhere else.

| When | Service | What | Count | Est. USD | Total so far |
| --- | --- | --- | --- | --- | --- |
`;

export function appendPaidLedger(game, { when, service, what, count, usd, total }) {
  const f = path.join(game, 'paid-ledger.md');
  if (!fs.existsSync(f)) fs.writeFileSync(f, PAID_HEADER);
  const cell = (s) => String(s).replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  let body = fs.readFileSync(f, 'utf8');
  const row = `| ${cell(when)} | ${cell(service)} | ${cell(what)} | ${count} | ${usd.toFixed(3)} | ${total.toFixed(2)} |\n`;
  fs.appendFileSync(f, (body.endsWith('\n') ? '' : '\n') + row);
}

// ---------------------------------------------------------------- input pictures

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
export const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.avif', '.heic']);

// Big or unusual pictures are shrunk to at most 2048 px and saved as JPEG/PNG in a temp folder first.
export function prepareImage(file) {
  const ext = path.extname(file).toLowerCase();
  const size = fs.statSync(file).size;
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const [w, h] = (r.stdout || '').trim().split(',').map(Number);
  const big = (w && h && Math.max(w, h) > 2048) || size > 4 * 1024 * 1024;
  if (MIME[ext] && !big) return { path: file, mime: MIME[ext], temp: false };
  const keepAlpha = ext === '.png' || ext === '.webp';
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mhg-fal-')), keepAlpha ? 'input.png' : 'input.jpg');
  const s = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-frames:v', '1',
    '-vf', "scale='min(2048,iw)':'min(2048,ih)':force_original_aspect_ratio=decrease", ...(keepAlpha ? [] : ['-q:v', '2']), out]);
  if (s.status !== 0) throw new FalError(`Could not read the picture ${path.basename(file)}. Save it as PNG or JPG and try again.`);
  return { path: out, mime: keepAlpha ? 'image/png' : 'image/jpeg', temp: true };
}

export const dataUri = (p) => `data:${p.mime};base64,${fs.readFileSync(p.path).toString('base64')}`;

// ---------------------------------------------------------------- fal over HTTP

export class FalError extends Error {
  constructor(message, { retry = false, charged = false } = {}) { super(message); this.retry = retry; this.charged = charged; }
}

export function plainError(status, text, endpoint) {
  const t = String(text || '');
  const detail = (() => {
    try {
      const j = JSON.parse(t);
      const d = j.detail ?? j.error ?? j.message ?? j;
      if (Array.isArray(d)) return d.map((x) => x.msg || x.message || JSON.stringify(x)).join('; ');
      return typeof d === 'string' ? d : JSON.stringify(d);
    } catch { return t; }
  })().slice(0, 300);
  if (/exhausted balance|insufficient|balance|locked|billing|payment/i.test(t)) {
    return new FalError('Your fal balance is empty (or the account is locked for billing). Add credit at fal.ai/dashboard/billing, then try again.');
  }
  if (status === 401) return new FalError('fal did not accept the key. Check that the whole key is pasted after FAL_KEY= in .env, with no spaces (guides/fal-key.md).');
  if (status === 403) return new FalError(`fal refused the request (403): the key may be wrong, revoked, or not allowed to use this model. ${detail}`);
  if (status === 404) return new FalError(`fal does not know the model "${endpoint}". It may have been renamed: look it up on fal.ai/models and update tools/fal/models.json.`);
  if (/content|safety|nsfw|moderat|flagged|policy|prohibited/i.test(t)) {
    return new FalError(`fal's content filter refused this prompt or picture. Reword it (no real people, no violence or adult words) and try again. (${detail})`);
  }
  if (status === 422 || status === 400) return new FalError(`fal did not accept the request: ${detail}`);
  if (status === 429) return new FalError('fal is busy (too many requests). Wait a minute and try again.', { retry: true });
  if (status >= 500) return new FalError(`fal had a problem on its side (${status}). Try again in a few minutes.`, { retry: true });
  return new FalError(`fal answered ${status}: ${detail}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One HTTP call with a timeout. Retries on 429 / 5xx with backoff. A POST is not retried after a network error
// or timeout (it may have been accepted, and paying twice is worse than asking the user to try again).
export async function falFetch(url, { key, method = 'GET', body, timeoutMs = 120000, tries = 4, endpoint = '', raw = false, headers = {} } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < tries; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: { ...(key ? { Authorization: `Key ${key}` } : {}), ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      lastErr = new FalError(timedOut
        ? 'fal did not answer in time.'
        : 'Could not reach fal. Check the internet connection and try again.', { retry: method === 'GET' });
      if (method !== 'GET') {
        if (timedOut) lastErr.message += ' It may still be working on it: check fal.ai/dashboard (Requests) before trying again, so you do not pay twice.';
        throw lastErr;
      }
      await sleep(3000 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res;
    const text = await res.text().catch(() => '');
    lastErr = plainError(res.status, text, endpoint);
    if (!lastErr.retry || attempt === tries - 1) throw lastErr;
    await sleep(3000 * 2 ** attempt);
  }
  throw lastErr;
}

// Put a local picture on fal's file storage and return its URL. Falls back to sending the picture inline
// (a base64 data URI), which most fal models also accept.
export async function uploadImage(file, key) {
  const p = prepareImage(file);
  try {
    const init = await (await falFetch(`${REST}/storage/upload/initiate?storage_type=fal-cdn-v3`, {
      key, method: 'POST', body: { content_type: p.mime, file_name: path.basename(p.path) }, tries: 2, timeoutMs: 30000,
    })).json();
    if (!init.upload_url || !init.file_url) throw new Error('no upload url');
    const put = await fetch(init.upload_url, { method: 'PUT', headers: { 'Content-Type': p.mime }, body: fs.readFileSync(p.path), signal: AbortSignal.timeout(120000) });
    if (!put.ok) throw new Error(`upload ${put.status}`);
    return { url: init.file_url, how: 'uploaded' };
  } catch {
    return { url: dataUri(p), how: 'inline' };
  } finally {
    if (p.temp) fs.rmSync(path.dirname(p.path), { recursive: true, force: true });
  }
}

// Submit to the queue, wait, fetch the answer. onWait(status) is called while it waits.
export async function runQueue(endpoint, input, key, { pollMs = 3000, timeoutMs = 15 * 60000, onWait } = {}) {
  const sub = await (await falFetch(`${QUEUE}/${endpoint}`, { key, method: 'POST', body: input, tries: 3, endpoint })).json();
  if (!sub.request_id || !sub.status_url || !sub.response_url) throw new FalError(`fal's answer was not what this tool expected: ${JSON.stringify(sub).slice(0, 200)}`);
  const t0 = Date.now();
  let last = '';
  for (;;) {
    await sleep(pollMs);
    const st = await (await falFetch(sub.status_url, { key, endpoint, timeoutMs: 60000 })).json();
    if (st.status !== last && onWait) onWait(st.status, st.queue_position);
    last = st.status;
    if (st.status === 'COMPLETED') break;
    if (Date.now() - t0 > timeoutMs) {
      throw new FalError(`Still not finished after ${Math.round(timeoutMs / 60000)} minutes (request ${sub.request_id}). It may finish later; check fal.ai/dashboard (Requests).`, { charged: true });
    }
  }
  let res;
  try {
    res = await (await falFetch(sub.response_url, { key, endpoint, timeoutMs: 120000 })).json();
  } catch (e) {
    e.requestId = sub.request_id;
    throw e;
  }
  return { requestId: sub.request_id, response: res };
}

// Find the result file in fal's answer: the listed paths first, then any file link anywhere in it.
export function pickOutput(response, paths, wantExt) {
  const get = (o, p) => p.split('.').reduce((v, k) => (v == null ? v : v[/^\d+$/.test(k) ? Number(k) : k]), o);
  for (const p of paths) {
    const v = get(response, p);
    if (typeof v === 'string' && /^https?:/.test(v)) return { url: v, contentType: get(response, p.replace(/\.url$/, '.content_type')) };
  }
  const found = [];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (typeof o.url === 'string' && /^https?:/.test(o.url)) found.push({ url: o.url, contentType: o.content_type });
    for (const v of Object.values(o)) walk(v);
  };
  walk(response);
  return found.find((f) => wantExt && new RegExp(`\\.${wantExt}(\\?|$)`, 'i').test(f.url)) || found[0] || null;
}

const EXT_BY_TYPE = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm',
  'video/quicktime': 'mov', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'model/gltf-binary': 'glb',
};
export function extFor(out, fallback) {
  if (out.contentType && EXT_BY_TYPE[out.contentType]) return EXT_BY_TYPE[out.contentType];
  const m = /\.([a-z0-9]{2,5})(?:\?|$)/i.exec(new URL(out.url).pathname);
  return m ? m[1].toLowerCase() : fallback;
}

export async function download(url, file) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(300000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return file;
    } catch (e) { lastErr = e; await sleep(3000 * 2 ** attempt); }
  }
  throw new FalError(`Made it, but the download failed (${lastErr?.message}). The file is at ${url} for a few days.`, { charged: true });
}
