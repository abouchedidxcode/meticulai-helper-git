// Looks: drawing styles that work on any starter game (looks/<id>/). Shared by the looks and vibes tools.
//   looks/<id>/look.json    what it is, its options, its cost
//   looks/<id>/index.js     becomes my-game/src/look/index.js
//   looks/_shared/*.js      helpers copied next to it
//   looks/upgrades.json     blocks that give a fuller version of a look but need the game built for them
import fs from 'node:fs';
import path from 'node:path';
import { HelperError, detail, ok, say, warn } from '../lib/log.mjs';
import { REPO_ROOT, helperDir, pretty, readJson, stamp, writeHelper, writeJson } from '../lib/paths.mjs';
import { run } from '../lib/proc.mjs';

export const LOOKS_DIR = path.join(REPO_ROOT, 'looks');
const SHARED_DIR = path.join(LOOKS_DIR, '_shared');
const PLAIN_FILE = path.join(REPO_ROOT, 'starter', 'src', 'look', 'index.js');
export const PLAIN = { id: 'none', name: 'Plain', one_line: 'No drawing style on top: the game as the starter draws it.', kind: 'none', block: null, options: {}, cost: 'none' };

export function listLooks() {
  if (!fs.existsSync(LOOKS_DIR)) return [];
  return fs.readdirSync(LOOKS_DIR)
    .filter((id) => !id.startsWith('_') && fs.existsSync(path.join(LOOKS_DIR, id, 'look.json')) && fs.existsSync(path.join(LOOKS_DIR, id, 'index.js')))
    .map((id) => {
      const l = { ...readJson(path.join(LOOKS_DIR, id, 'look.json'), {}), id, dir: path.join(LOOKS_DIR, id) };
      // the code is the source of truth for options (shots.mjs copies them into look.json)
      try { const o = readOptionsFromCode(path.join(l.dir, 'index.js')); if (Object.keys(o).length) l.options = o; } catch { /* keep look.json's */ }
      return l;
    })
    .sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || a.id.localeCompare(b.id));
}

export const listUpgrades = () => readJson(path.join(LOOKS_DIR, 'upgrades.json'), { upgrades: [] }).upgrades || [];

export function loadLook(id) {
  const want = String(id || '').toLowerCase();
  if (want === 'none' || want === 'plain') return { ...PLAIN };
  const all = listLooks();
  const hit = all.find((l) => l.id === want);
  if (hit) return hit;
  const near = all.filter((l) => l.id.includes(want) || want.includes(l.id) || (l.name || '').toLowerCase().includes(want)).map((l) => l.id);
  throw new HelperError(`there is no look called "${id}".`, near.length ? `Did you mean: ${near.join(', ')}?` : `The looks are: none, ${all.map((l) => l.id).join(', ')}. See them with  node tools/looks/list.mjs.`);
}

/** The options a look's index.js declares (`const OPTIONS = { ... };`), as the single source for look.json. */
export function readOptionsFromCode(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = /const OPTIONS = (\{[\s\S]*?\n\});/.exec(text);
  if (!m) return {};
  const raw = new Function(`return (${m[1]});`)();
  const out = {};
  for (const [k, o] of Object.entries(raw)) {
    out[k] = typeof o.default === 'boolean'
      ? { default: o.default, help: o.help || o.label || k }
      : { default: o.default, min: o.min ?? 0, max: o.max ?? Math.max(1, o.default * 2), help: o.help || o.label || k };
    out[k].label = o.label || k;
    if (o.step != null) out[k].step = o.step;
  }
  return out;
}

/** Check option values against a look ({ name: value }). Unknown names and wrong types are errors; numbers are kept in range. */
export function cleanOptions(look, options = {}) {
  const out = {};
  for (const [k, v] of Object.entries(options || {})) {
    const def = look.options?.[k];
    if (!def) throw new HelperError(`the look "${look.id}" has no option called "${k}".`, `Its options are: ${Object.keys(look.options || {}).join(', ') || '(none)'}.`);
    if (typeof def.default === 'boolean') out[k] = v === true || v === 'true' || v === 1 || v === '1';
    else {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new HelperError(`the option "${k}" of the look "${look.id}" needs a number, but got "${v}".`, `Try a value between ${def.min} and ${def.max}.`);
      out[k] = Math.min(def.max, Math.max(def.min, n));
    }
  }
  return out;
}

/** True when the game draws with a flat (orthographic) camera: side-on 2D games such as the platformer starter. */
export function gameIsFlat(dir) {
  const src = path.join(dir, 'src');
  if (!fs.existsSync(src)) return false;
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).some((e) => {
    if (e.name === 'look' || e.name === 'node_modules' || e.name.startsWith('.')) return false;
    const f = path.join(d, e.name);
    if (e.isDirectory()) return walk(f);
    return /\.(js|mjs|ts)$/.test(e.name) && /new\s+(THREE\.)?OrthographicCamera\s*\(/.test(fs.readFileSync(f, 'utf8'));
  });
  return walk(src);
}

/** What a look says about flat (orthographic) cameras: { works: true | 'partly' | false, note }. */
export const flatSupport = (look) => look.orthographic || { works: true, note: '' };

const same = (a, b) => fs.existsSync(a) && fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b));

/**
 * Put a look into a game folder. Returns { look, changed: [plain sentences], backup }.
 * options: { name: value } starting values that differ from the look's defaults.
 */
export async function applyLook(dir, id, { options = {}, quiet = false } = {}) {
  const look = loadLook(id);
  const lookDir = path.join(dir, 'src', 'look');
  const dest = path.join(lookDir, 'index.js');
  if (!fs.existsSync(path.join(dir, 'src', 'main.js'))) throw new HelperError(`there is no game in ${pretty(dir)}.`, 'Run  node tools/init.mjs --name "My Game"  first.');
  const main = fs.readFileSync(path.join(dir, 'src', 'main.js'), 'utf8');
  if (!/look\/index\.js/.test(main) || !fs.existsSync(path.join(dir, 'src', 'core', 'look.js'))) {
    throw new HelperError('this game was made with an older starter that has no place for a look (no src/look/).', 'Ask your agent to bring src/look/, src/core/look.js and the setPost part of src/render/renderer.js over from the kit\'s starter/ folder, then try again.');
  }
  const opts = cleanOptions(look, options);
  const changed = [];

  // the block the look is built on
  if (look.block && !fs.existsSync(path.join(dir, 'vendor', look.block))) {
    const r = await run(process.execPath, [path.join(REPO_ROOT, 'tools', 'blocks', 'add.mjs'), look.block, '--dir', dir], { inherit: false, timeout: 10 * 60 * 1000 });
    detail(r.stdout, r.stderr);
    if (r.code !== 0) throw new HelperError(`the look "${look.id}" needs the block "${look.block}", and adding it failed.`, `Run  node tools/blocks/add.mjs ${look.block} --dir ${pretty(dir)} --verbose  to see why.`);
    changed.push(`added the block ${look.block} (in vendor/, with its credits in CREDITS.md)`);
  }

  // keep a hand-edited look file
  let backup = null;
  if (fs.existsSync(dest)) {
    const ours = [PLAIN_FILE, ...listLooks().map((l) => path.join(l.dir, 'index.js'))];
    if (!ours.some((f) => same(f, dest))) {
      backup = path.join(helperDir(dir), `look.before-${stamp()}.js`);
      fs.copyFileSync(dest, backup);
      changed.push(`kept your edited look file as ${pretty(backup)}`);
    }
  }

  fs.mkdirSync(lookDir, { recursive: true });
  const src = look.id === 'none' ? PLAIN_FILE : path.join(look.dir, 'index.js');
  if (!same(src, dest)) {
    fs.copyFileSync(src, dest);
    changed.push(look.id === 'none' ? 'put the plain look file back (src/look/index.js)' : `wrote the ${look.name} look to src/look/index.js`);
  }
  if (look.id !== 'none' && fs.existsSync(SHARED_DIR)) {
    for (const f of fs.readdirSync(SHARED_DIR).filter((x) => x.endsWith('.js'))) {
      if (!same(path.join(SHARED_DIR, f), path.join(lookDir, f))) fs.copyFileSync(path.join(SHARED_DIR, f), path.join(lookDir, f));
    }
  }

  // tuning.json: the "look" group holds only starting values that differ from the look's own defaults
  const tuningFile = path.join(dir, 'src', 'tuning.json');
  const tuning = readJson(tuningFile, null);
  if (tuning) {
    const had = JSON.stringify(tuning.look ?? null);
    delete tuning.look;
    if (Object.keys(opts).length) {
      tuning.look = {};
      for (const [k, v] of Object.entries(opts)) {
        const d = look.options[k];
        tuning.look[k] = typeof d.default === 'boolean' ? { value: v, label: d.label, help: d.help } : { value: v, min: d.min, max: d.max, step: d.step ?? (d.max - d.min > 20 ? 1 : 0.01), label: d.label, help: d.help };
      }
    }
    if (JSON.stringify(tuning.look ?? null) !== had) {
      writeJson(tuningFile, tuning);
      if (Object.keys(opts).length) changed.push(`set the look's starting values in src/tuning.json (${Object.entries(opts).map(([k, v]) => `${k} ${v}`).join(', ')})`);
    }
  } else if (Object.keys(opts).length) warn('src/tuning.json is missing or broken, so the look starts with its own default values.');

  const before = readJson(path.join(dir, 'helper.json'), {})?.look ?? 'none';
  writeHelper(dir, { look: look.id });
  if (!quiet) {
    if (!changed.length && before === look.id) say(`The game already has the ${look.name} look; nothing changed.`);
    else ok(`${look.id === 'none' ? 'The game is back to the plain look' : `The game now has the ${look.name} look`}${changed.length ? `: ${changed.join('; ')}` : ''}.`);
  }
  return { look, changed, backup, before };
}
