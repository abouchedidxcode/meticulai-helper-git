#!/usr/bin/env node
// For people working ON the kit: save a game folder back as a starter overlay in starters/<id>/.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, ok, runTool, say } from '../lib/log.mjs';
import { REPO_ROOT, pretty, readJson, writeJson } from '../lib/paths.mjs';
import { STARTERS_DIR } from './lib.mjs';

const HELP = `
node tools/starters/save.mjs <id> [--from <game folder>]

Kit maintenance. Copies a game's own parts into starters/<id>/ so it becomes a starter:
  src/game/  src/tuning.json  public/  scripts/  STARTER.md
and writes the blocks it uses (the folders in vendor/) into starters/<id>/starter.json.
The shared base files (src/core, src/render, src/ui, src/feel, src/audio, src/look, main.js) are NOT
saved: a starter must work on the untouched base. Check it with  node tools/starters/test.mjs <id>.

  --from <dir>   the game folder to save (default: .starters-work/<id>/)
`;

const SKIP = new Set(['node_modules', 'dist', '.helper', '.DS_Store', '.vite']);

await runTool(async () => {
  const { values: a, positionals } = getArgs({ from: { type: 'string' } }, HELP);
  const id = positionals[0];
  if (!id || !/^[a-z0-9-]+$/.test(id)) throw new HelperError('give the starter a short id in lowercase with dashes.', 'Example:  node tools/starters/save.mjs top-down');
  if (id === 'island') throw new HelperError('the island starter is the shared base in starter/ itself.', 'Edit starter/src/game/ directly.');
  const from = path.resolve(a.from || path.join(REPO_ROOT, '.starters-work', id));
  if (!fs.existsSync(path.join(from, 'src', 'game', 'game.js'))) throw new HelperError(`${pretty(from)} has no src/game/game.js.`, 'Point --from at the game folder you built the starter in.');
  const dest = path.join(STARTERS_DIR, id);
  fs.mkdirSync(dest, { recursive: true });

  // mirror the game's own parts
  const mirror = (rel) => {
    const src = path.join(from, rel);
    const out = path.join(dest, rel);
    fs.rmSync(out, { recursive: true, force: true });
    if (!fs.existsSync(src)) return false;
    fs.cpSync(src, out, { recursive: true, filter: (f) => !SKIP.has(path.basename(f)) });
    return true;
  };
  mirror(path.join('src', 'game'));
  mirror(path.join('src', 'tuning.json'));
  const hasPublic = fs.existsSync(path.join(from, 'public')) && fs.readdirSync(path.join(from, 'public')).length > 0 && mirror('public');
  const hasScripts = mirror('scripts');
  if (fs.existsSync(path.join(from, 'STARTER.md'))) fs.copyFileSync(path.join(from, 'STARTER.md'), path.join(dest, 'STARTER.md'));

  // anything the game changed outside its own parts would be lost: say so
  const base = path.join(REPO_ROOT, 'starter');
  const drift = [];
  const walk = (rel) => {
    for (const name of fs.readdirSync(path.join(base, rel))) {
      if (SKIP.has(name)) continue;
      const r = path.join(rel, name);
      if (r === path.join('src', 'game') || r === path.join('src', 'tuning.json') || r === 'helper.json' || r === 'package.json' || r === 'package-lock.json' || r === 'index.html' || r === 'README.md') continue;
      const b = path.join(base, r);
      const g = path.join(from, r);
      if (fs.statSync(b).isDirectory()) { walk(r); continue; }
      if (!fs.existsSync(g) || !fs.readFileSync(b).equals(fs.readFileSync(g))) drift.push(r);
    }
  };
  walk('');

  const vendor = path.join(from, 'vendor');
  const blocks = fs.existsSync(vendor) ? fs.readdirSync(vendor).filter((n) => fs.statSync(path.join(vendor, n)).isDirectory()).sort() : [];
  const basePkg = readJson(path.join(base, 'package.json'), {});
  const pkg = readJson(path.join(from, 'package.json'), {});
  const npm = Object.fromEntries(Object.entries(pkg.dependencies || {}).filter(([k]) => !(k in (basePkg.dependencies || {}))));
  const file = path.join(dest, 'starter.json');
  const cur = readJson(file, { id, name: id, pitch: '', you: [], camera: '', controls: '', session: '', use_when: '', not_for: '', tags: [], skips: [], already_good: [], status: 'draft' });
  writeJson(file, { ...cur, id, blocks, ...(Object.keys(npm).length ? { npm } : {}), preview: `starters/${id}/preview.jpg` });

  ok(`Saved ${pretty(from)} as starters/${id}/ (${blocks.length ? `blocks: ${blocks.join(', ')}` : 'no blocks'}${hasPublic ? ', public files' : ''}${hasScripts ? ', play scripts' : ''}).`);
  if (drift.length) {
    say(`\n  !!    These base files differ from starter/ in the game folder and were NOT saved:\n${drift.map((d) => `          ${d}`).join('\n')}`);
    say('        A starter must run on the untouched base. Move that code into src/game/, or report it as a change the base needs.');
  }
  say(`\nNext: fill in starters/${id}/starter.json and STARTER.md, then run  node tools/starters/test.mjs ${id}`);
  return drift.length ? 2 : 0;
});
