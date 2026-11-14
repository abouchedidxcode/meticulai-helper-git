// Shared helpers for the asset tools: the download cache, polite web requests, text matching, safe names, zips.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HelperError, detail } from '../../lib/log.mjs';
import { sleep } from '../../lib/proc.mjs';

export const KINDS = ['model', 'material', 'hdri', 'sprite', 'tileset', 'audio', 'music', 'font', 'icon', 'shader', 'animation', 'vfx'];
/** Folder names under my-game/public/assets/ for each kind. */
export const KIND_FOLDER = {
  model: 'models', material: 'materials', hdri: 'skies', sprite: 'sprites', tileset: 'tilesets', audio: 'sounds',
  music: 'music', font: 'fonts', icon: 'icons', shader: 'shaders', animation: 'animations', vfx: 'effects',
};
export const STYLES = ['realistic', 'lowpoly', 'stylized', 'pixel', 'cartoon', 'voxel', 'any'];

/** Sites whose robots.txt asks AI agents to stay away: the tools never fetch anything from them (not even
 *  thumbnails). The person downloads by hand and passes the zip with --zip. */
export const NO_FETCH_HOSTS = ['kenney.nl'];
export function mayFetch(url) {
  try { const h = new URL(url).hostname; return !NO_FETCH_HOSTS.some((x) => h === x || h.endsWith('.' + x)); } catch { return false; }
}

export const USER_AGENT = 'meticulai-helper-git asset tools (open-source game kit; small, cached requests)';

// ---------------------------------------------------------------- cache folder

/** ~/.cache/meticulai-helper (or HELPER_CACHE_DIR, or the system's cache folder on Windows). */
export function cacheDir(...sub) {
  const base = process.env.HELPER_CACHE_DIR
    || (process.platform === 'win32' && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'meticulai-helper')
      : path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'meticulai-helper'));
  const d = path.join(base, ...sub);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export const hash = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16);

// ---------------------------------------------------------------- polite web requests

const DAY = 24 * 60 * 60 * 1000;

/** fetch with a timeout and a couple of retries on network errors and 5xx/429. Returns the Response. */
export async function fetchRetry(url, { timeoutMs = 20000, tries = 3, headers = {}, ...opts } = {}) {
  if (!mayFetch(url)) throw new HelperError(`${new URL(url).hostname} asks automated tools not to download from it.`, 'Open the page in a browser and download it by hand, then pass the file with --zip.');
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, headers: { 'User-Agent': USER_AGENT, ...headers }, signal: ctrl.signal, redirect: 'follow' });
      if ((res.status >= 500 || res.status === 429) && i < tries - 1) {
        detail(`${res.status} from ${url}, retrying`);
        await sleep(800 * (i + 1) * (res.status === 429 ? 3 : 1));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      detail(`request failed (${e.name}: ${e.message}) ${url}`);
      if (i < tries - 1) await sleep(800 * (i + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  const host = (() => { try { return new URL(url).host; } catch { return url; } })();
  throw new HelperError(`I couldn't reach ${host} (no answer${lastErr?.name === 'AbortError' ? ' in time' : ''}).`,
    'Check the internet connection and try again in a minute. If only this site fails, it may be down: try another source.', lastErr);
}

/** GET JSON, cached on disk for `ttlMs` (a day by default) so repeated searches don't hit the site again. */
export async function cachedJson(url, { ttlMs = DAY, headers = {}, timeoutMs = 25000 } = {}) {
  const file = path.join(cacheDir('api'), `${hash(url)}.json`);
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs < ttlMs) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { /* not cached */ }
  const res = await fetchRetry(url, { headers: { Accept: 'application/json', ...headers }, timeoutMs });
  if (!res.ok) {
    // a stale cache beats nothing
    try { const old = JSON.parse(fs.readFileSync(file, 'utf8')); detail(`using a stale cache for ${url}`); return old; } catch { /* none */ }
    throw new HelperError(`${new URL(url).host} answered with an error (${res.status}).`, 'Try again in a minute, or search another source with --source.');
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new HelperError(`${new URL(url).host} sent something that isn't JSON.`, 'The site may have changed. Try again later or use another source.', e); }
  fs.writeFileSync(file, text);
  return data;
}

/** Download a URL to a file (streamed; written to .part first). Returns the byte count. */
export async function download(url, file, { timeoutMs = 10 * 60 * 1000, headers = {}, onProgress = null } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const res = await fetchRetry(url, { timeoutMs, headers });
  if (!res.ok) throw new HelperError(`the download from ${new URL(url).host} failed (${res.status}).`, 'Try again in a minute. If it keeps failing, the file may have moved: open the asset page in a browser to check.');
  const part = `${file}.part`;
  const out = fs.createWriteStream(part);
  let n = 0;
  try {
    for await (const chunk of res.body) {
      n += chunk.length;
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      if (onProgress) onProgress(n);
    }
    await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())));
  } catch (e) {
    out.destroy();
    fs.rmSync(part, { force: true });
    throw new HelperError(`the download from ${new URL(url).host} broke off.`, 'Try again.', e);
  }
  fs.renameSync(part, file);
  return n;
}

/** Run fn over items with at most `limit` at a time. Keeps order. Errors become { error }. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try { out[i] = await fn(items[i], i); } catch (e) { out[i] = { error: e }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ---------------------------------------------------------------- text matching

/** "Mossy rocks!" -> ['mossy', 'rocks'] */
export const words = (s) => String(s || '').toLowerCase().replace(/[_\-/.]+/g, ' ').match(/[a-z0-9]+/g) || [];

/** A crude stem so "mossy" finds "moss" and "rocks" finds "rock". */
export function stem(w) {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  if (w.length > 4 && w.endsWith('y')) return w.slice(0, -1);
  return w;
}

/**
 * How well a query matches some fields. fields: [{ text, weight }]. Returns 0..1:
 * each query word scores its best field (exact word = weight, stem/prefix = 0.7 x weight), averaged over the words,
 * divided by the top weight; a small bonus when every word matched somewhere.
 */
export function matchScore(query, fields) {
  const q = words(query);
  if (!q.length) return 0.5;
  const top = Math.max(...fields.map((f) => f.weight));
  const prepared = fields.map((f) => {
    const ws = Array.isArray(f.text) ? f.text.flatMap(words) : words(f.text);
    return { weight: f.weight, set: new Set(ws), stems: new Set(ws.map(stem)) };
  });
  let total = 0, hits = 0;
  for (const w of q) {
    const s = stem(w);
    let best = 0;
    for (const f of prepared) {
      if (f.set.has(w)) best = Math.max(best, f.weight);
      else if (f.stems.has(s) || (s.length >= 4 && [...f.stems].some((x) => x.startsWith(s) || (x.length >= 4 && s.startsWith(x))))) best = Math.max(best, f.weight * 0.7);
    }
    if (best > 0) hits++;
    total += best;
  }
  if (!hits) return 0;
  return Math.min(1, (total / (q.length * top)) * 0.85 + (hits === q.length ? 0.15 : 0));
}

// ---------------------------------------------------------------- names and ids

/** Safe file/folder name: letters, digits, dash, underscore, dot. */
export const safeName = (s) => String(s || 'asset').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'asset';

/** "polyhaven:rock_moss_01" -> { source: 'polyhaven', id: 'rock_moss_01', sub: null }; "kenney:hexagon-kit/a.glb" -> sub 'a.glb' */
export function parseId(s) {
  const m = /^([a-z0-9_-]+):(.+)$/i.exec(String(s || '').trim());
  if (!m) return null;
  const source = m[1].toLowerCase();
  let id = m[2], sub = null;
  const slash = id.indexOf('/');
  if (slash > 0) { sub = id.slice(slash + 1); id = id.slice(0, slash); }
  return { source, id, sub };
}

/** "CC0-1.0" -> "CC0"; "CC-BY-4.0" -> "CC BY 4.0" */
export function licenseLabel(l) {
  if (!l) return 'licence unknown';
  const s = String(l);
  if (/^cc0/i.test(s)) return 'CC0';
  if (/QAL/i.test(s)) return 'Quaternius licence (QAL)';
  const m = /^cc[- ]?(by(?:[- ](?:sa|nd|nc))*)[- ]?([\d.]+)?/i.exec(s);
  if (m) return `CC ${m[1].toUpperCase().replace(/-/g, ' ')}${m[2] ? ' ' + m[2] : ''}`;
  return s;
}

export const isCc0 = (l) => /^(cc0|public[- ]?domain|unlicense)/i.test(String(l || ''));

// ---------------------------------------------------------------- zips

/** Unzip a .zip file into destDir (paths are kept inside destDir; macOS junk skipped). Returns the list of files. */
export async function unzip(zipFile, destDir) {
  const { unzipSync } = await import('fflate');
  let entries;
  try {
    entries = unzipSync(new Uint8Array(fs.readFileSync(zipFile)));
  } catch (e) {
    throw new HelperError(`${path.basename(zipFile)} is not a zip file I can open (the download may be broken).`, `Delete ${zipFile} and try again.`, e);
  }
  const root = path.resolve(destDir);
  const files = [];
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith('/') || /(^|\/)(__MACOSX|\.DS_Store)(\/|$)/.test(name)) continue;
    const out = path.resolve(root, name);
    if (!out.startsWith(root + path.sep)) { detail(`skipping unsafe zip path ${name}`); continue; }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, data);
    files.push(out);
  }
  return files;
}

/** All files under a folder (relative paths, forward slashes), skipping hidden files and node_modules. */
export function listFiles(dir, { max = 20000 } = {}) {
  const out = [];
  const walk = (d, rel) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '__MACOSX') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else if (out.length < max) out.push(r);
    }
  };
  walk(dir, '');
  return out;
}

export const EXT = {
  model: ['.glb', '.gltf', '.fbx', '.obj'],
  image: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tga'],
  hdri: ['.hdr', '.exr'],
  audio: ['.wav', '.mp3', '.ogg', '.m4a', '.flac', '.aac', '.opus', '.webm'],
  font: ['.ttf', '.otf', '.woff', '.woff2'],
};
export function fileKind(f) {
  const e = path.extname(f).toLowerCase();
  for (const [k, list] of Object.entries(EXT)) if (list.includes(e)) return k;
  return null;
}

/** Rough "does this folder hold one PBR material?" check: a colour map plus a normal or roughness map. */
export function materialMaps(files) {
  const pick = (re) => files.find((f) => fileKind(f) === 'image' && re.test(path.basename(f).toLowerCase()));
  const maps = {
    color: pick(/(^|[_\-. ])(col|color|colour|diff|diffuse|albedo|basecolou?r|base_colou?r)([_\-. ]|$)/),
    normal: pick(/(^|[_\-. ])(nor_gl|normalgl|normal_gl|normal|nrm|nor)([_\-. ]|$)/),
    roughness: pick(/(^|[_\-. ])(rough|roughness)([_\-. ]|$)/),
    ao: pick(/(^|[_\-. ])(ao|ambientocclusion|occlusion)([_\-. ]|$)/),
    metalness: pick(/(^|[_\-. ])(metal|metalness|metallic)([_\-. ]|$)/),
    arm: pick(/(^|[_\-. ])arm([_\-. ]|$)/),
    displacement: pick(/(^|[_\-. ])(disp|displacement|height)([_\-. ]|$)/),
  };
  if (!maps.normal) maps.normal = pick(/normaldx|nor_dx/);
  const ok = maps.color && (maps.normal || maps.roughness || maps.arm);
  return ok ? maps : null;
}

/** "2026-11-14" */
export const today = () => new Date().toISOString().slice(0, 10);
