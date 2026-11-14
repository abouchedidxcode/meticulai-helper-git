// Where things are: the kit (repo root), the game folder, and the game's helper.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HelperError } from './log.mjs';

/** The kit's root folder (two levels up from tools/lib/). */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const HELPER_DEFAULTS = {
  gameName: 'My Game',
  port: 5173,
  falCapUSD: 0,
  maxAgents: 4,
  autopilot: { hours: 0, mayDecideAlone: [], askMeFirst: [] },
};

/** The game folder: --dir, else HELPER_GAME_DIR, else my-game/ in the kit. Relative paths are from where you ran the command. */
export function gameDir(dirOption) {
  const d = dirOption || process.env.HELPER_GAME_DIR;
  return d ? path.resolve(process.cwd(), d) : path.join(REPO_ROOT, 'my-game');
}

/** A short path for printing: relative to the kit (or to where you are) when that is shorter. */
export function pretty(p) {
  const fromRepo = path.relative(REPO_ROOT, p);
  const fromCwd = path.relative(process.cwd(), p);
  const best = [fromCwd, fromRepo].filter((r) => r && !r.startsWith('..') && !path.isAbsolute(r)).sort((a, b) => a.length - b.length)[0];
  return best || p;
}

export const helperJsonPath = (dir) => path.join(dir, 'helper.json');
/** Runtime files (server.json, logs, ledgers). Git-ignored. */
export function helperDir(dir) {
  const d = path.join(dir, '.helper');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** Read helper.json (with defaults filled in). Throws a plain error if the game folder or file is missing. */
export function readHelper(dir) {
  const file = helperJsonPath(dir);
  if (!fs.existsSync(dir)) {
    throw new HelperError(`there is no game folder yet (looked for ${pretty(dir)}).`, 'Run  node tools/init.mjs --name "My Game"  to create it.');
  }
  if (!fs.existsSync(file)) {
    throw new HelperError(`the game folder ${pretty(dir)} has no helper.json settings file.`, 'If this is the right folder, run  node tools/init.mjs  in a fresh copy of the kit, or ask your agent to recreate helper.json from ARCHITECTURE.md.');
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new HelperError(`helper.json in ${pretty(dir)} is not valid JSON (${e.message}).`, 'Ask your agent to fix helper.json (a comma or quote is probably missing).', e);
  }
  return { ...HELPER_DEFAULTS, ...data, autopilot: { ...HELPER_DEFAULTS.autopilot, ...(data.autopilot || {}) } };
}

/** Merge `patch` into helper.json and write it back (keeps keys we don't know about). */
export function writeHelper(dir, patch) {
  const file = helperJsonPath(dir);
  let cur = {};
  try { cur = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* new file */ }
  const next = { ...cur, ...patch };
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  return next;
}

/** "My Cool Game!" -> "my-cool-game" */
export function slugify(name) {
  const s = String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return s || 'my-game';
}

/** 2026-11-14_1530-12 (sorts by time, safe in file names everywhere) */
export function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** Read JSON or return `fallback`. */
export function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
