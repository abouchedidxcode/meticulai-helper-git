// Small helpers shared by tools/refs/*.mjs. Self-contained on purpose (no npm packages, no other tool folders).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.m4v', '.gif']);
export const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff', '.avif', '.heic', '.heif']);

// Parse argv into { _: [positionals], flag: value|true }. Flags listed in `bool` never take a value.
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
    else out._.push(a);
  }
  return out;
}

// The game folder: --dir, then HELPER_GAME_DIR, then <repo>/my-game.
export function gameDir(args) {
  const d = (typeof args.dir === 'string' && args.dir) || process.env.HELPER_GAME_DIR || path.join(REPO, 'my-game');
  return path.resolve(d);
}

// A path as the user would read it: relative to the repo when inside it.
export function show(p) {
  const rel = path.relative(REPO, p);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : p;
}

export function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

export function have(cmd) {
  const r = spawnSync(cmd, ['-version'], { encoding: 'utf8' });
  return r.status === 0;
}

export function needFfmpeg() {
  if (!have('ffmpeg') || !have('ffprobe')) {
    fail('This needs ffmpeg, a free video tool, and it is not installed.\nRun: node tools/doctor.mjs --fix');
  }
}

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: opts.encoding ?? 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return { ok: r.status === 0, stdout: r.stdout, stderr: String(r.stderr || ''), status: r.status };
}

// { width, height, duration (s or null), frames (or null), codec } or null when ffprobe cannot read it.
export function probe(file) {
  const r = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height,codec_name,nb_frames,duration:format=duration', '-of', 'json', file]);
  if (!r.ok) return null;
  try {
    const j = JSON.parse(r.stdout);
    const s = (j.streams || [])[0];
    if (!s) return null;
    const num = (v) => (v === undefined || v === 'N/A' || isNaN(parseFloat(v)) ? null : parseFloat(v));
    return {
      width: s.width, height: s.height, codec: s.codec_name,
      duration: num(j.format?.duration) ?? num(s.duration),
      frames: num(s.nb_frames),
    };
  } catch { return null; }
}

let drawtextCache = null;
export function hasDrawtext() {
  if (drawtextCache === null) {
    const r = run('ffmpeg', ['-hide_banner', '-filters']);
    drawtextCache = r.ok && /\bdrawtext\b/.test(r.stdout);
  }
  return drawtextCache;
}

export function fmtTime(s) {
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }
