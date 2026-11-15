// Vibes: a palette, a light and (optionally) a look chosen together, with mood pictures. vibes/<id>/vibe.json.
import fs from 'node:fs';
import path from 'node:path';
import { HelperError, warn } from '../lib/log.mjs';
import { REPO_ROOT, helperDir, pretty, readJson, stamp, writeJson } from '../lib/paths.mjs';
import { applyLook, flatSupport, gameIsFlat, listLooks } from '../looks/lib.mjs';

/** Where the vibes are: --from, else HELPER_VIBES_DIR, else vibes/ in the kit. (The other two are for testing the tools.) */
export function vibesDir(from) {
  const d = from || process.env.HELPER_VIBES_DIR;
  return d ? path.resolve(process.cwd(), d) : path.join(REPO_ROOT, 'vibes');
}

export function listVibes(dir = vibesDir(), { all = false } = {}) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((id) => !id.startsWith('_') && !id.startsWith('.') && fs.existsSync(path.join(dir, id, 'vibe.json')))
    .map((id) => {
      const v = readJson(path.join(dir, id, 'vibe.json'), null);
      return v && typeof v === 'object' ? { ...v, id, dir: path.join(dir, id) } : null;
    })
    .filter((v) => v && (all || (v.status || 'ready') === 'ready'))
    .sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || String(a.name || a.id).localeCompare(String(b.name || b.id)));
}

export function loadVibe(id, dir = vibesDir()) {
  const all = listVibes(dir, { all: true });
  const want = String(id || '').toLowerCase().trim();
  const slug = want.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const hit = all.find((v) => v.id === want) || all.find((v) => v.id === slug) || all.find((v) => String(v.name || '').toLowerCase() === want);
  if (hit) return hit;
  const near = all.filter((v) => v.id.includes(slug) || slug.includes(v.id) || String(v.name || '').toLowerCase().includes(want)).map((v) => v.id);
  if (!all.length) throw new HelperError(`there are no vibes in ${pretty(dir)} yet.`, 'Update the kit (download it again), or ask your agent to check the vibes/ folder.');
  throw new HelperError(`there is no vibe called "${id}".`, near.length ? `Did you mean: ${near.join(', ')}?` : 'See them all with  node tools/vibes/list.mjs.');
}

const words = (s) => String(s || '').toLowerCase().match(/[a-z0-9]+/g) || [];
const flat = (x) => (Array.isArray(x) ? x.join(' ') : typeof x === 'object' && x ? Object.values(x).join(' ') : String(x || ''));

/** Order vibes by how well they fit a few words ("cosy night fishing"). Adds score and why. */
export function rankVibes(vibes, text) {
  const want = new Set(words(text).filter((w) => w.length >= 3));
  return vibes
    .map((v) => {
      const strong = new Set(words(`${v.id} ${v.name} ${flat(v.mood)} ${flat(v.good_for)} ${v.look?.id || ''}`));
      const soft = new Set(words(`${v.one_line} ${v.look_words} ${v.palette?.name || ''} ${flat(v.music)} ${v.sound_feel} ${flat(v.asset_search)}`));
      let score = 0;
      const why = [];
      for (const w of want) {
        if (strong.has(w)) { score += 3; why.push(w); } else if (soft.has(w)) { score += 1; why.push(w); }
      }
      return { ...v, score, why };
    })
    .sort((a, b) => b.score - a.score || (a.order ?? 50) - (b.order ?? 50) || String(a.name).localeCompare(String(b.name)));
}

/** The look a vibe asks for, if this kit has it; otherwise 'none' (with the reason). */
export function vibeLook(vibe) {
  const id = String(vibe.look?.id || 'none');
  if (id === 'none') return { id: 'none', options: {}, missing: null };
  if (listLooks().some((l) => l.id === id)) return { id, options: vibe.look.options || {}, missing: null };
  return { id: 'none', options: {}, missing: id };
}

/** The palette.json a vibe writes (only the fields the game reads, in a steady order). */
export function vibePalette(vibe) {
  const p = vibe.palette;
  if (!p || typeof p !== 'object' || !p.colors || !Array.isArray(p.colors.base) || !p.colors.base.length) {
    throw new HelperError(`the vibe "${vibe.id}" has no usable palette (it needs palette.colors.base).`, 'Ask your agent to fix its vibe.json, or pick another vibe.');
  }
  const out = { name: p.name || vibe.name || vibe.id, colors: p.colors };
  if (p.sky) out.sky = p.sky;
  if (p.light) out.light = p.light;
  out.notes = p.notes || `From the "${vibe.name || vibe.id}" vibe. The game reads this file (src/core/look.js): change a colour here and the whole game follows.`;
  return out;
}

/**
 * Put a vibe's palette and look into a game folder (no notes, no planning files: apply.mjs does those).
 * Returns { paletteBackup, look, lookResult, lookMissing }.
 */
export async function putVibe(dir, vibe, { backup = true, quietFlat = false } = {}) {
  const file = path.join(dir, 'palette.json');
  const next = JSON.stringify(vibePalette(vibe), null, 2) + '\n';
  let paletteBackup = null;
  const had = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const paletteChanged = had !== next;
  if (paletteChanged) {
    if (had != null && backup) {
      paletteBackup = path.join(helperDir(dir), `palette.before-${stamp()}.json`);
      fs.writeFileSync(paletteBackup, had);
    }
    fs.writeFileSync(file, next);
  }
  const want = vibeLook(vibe);
  if (want.missing) warn(`the vibe asks for the look "${want.missing}", which this copy of the kit does not have, so the game keeps the plain look.`);
  let options = want.options;
  let lookResult;
  try {
    lookResult = await applyLook(dir, want.id, { options, quiet: true });
  } catch (e) {
    if (!(e instanceof HelperError) || !/has no option|needs a number/.test(e.message)) throw e;
    warn(`${e.message} The look starts with its own values instead.`);
    lookResult = await applyLook(dir, want.id, { options: {}, quiet: true });
    options = {};
  }
  const flat = flatSupport(lookResult.look);
  const flatNote = lookResult.look.id !== 'none' && flat.works !== true && gameIsFlat(dir)
    ? `this game uses a flat (orthographic) camera, and the ${lookResult.look.name} look ${flat.works === false ? 'does not work with one' : 'only partly works with one'}: ${flat.note}`
    : null;
  if (flatNote && !quietFlat) warn(flatNote);
  return { paletteBackup, paletteChanged, look: lookResult.look, lookResult, lookMissing: want.missing, options, flatNote };
}

export { writeJson };
