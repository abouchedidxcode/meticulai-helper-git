// Starters: ready-to-play starting games, one per kind of game. starters/<id>/starter.json describes each.
// The island starter IS the shared base in starter/ ("base": true); every other starter is an overlay on it:
//   starters/<id>/src/game/      replaces the base's demo game
//   starters/<id>/src/tuning.json  replaces the base's numbers
//   starters/<id>/public/, scripts/   extra files, copied as they are
//   starters/<id>/STARTER.md     the agent's guide to this starter (copied into the game folder)
//   starters/<id>/preview.jpg    a picture of it being played
import fs from 'node:fs';
import path from 'node:path';
import { HelperError } from '../lib/log.mjs';
import { REPO_ROOT, readJson } from '../lib/paths.mjs';

export const STARTERS_DIR = path.join(REPO_ROOT, 'starters');

export function listStarters() {
  if (!fs.existsSync(STARTERS_DIR)) return [];
  return fs.readdirSync(STARTERS_DIR)
    .map((id) => ({ id, file: path.join(STARTERS_DIR, id, 'starter.json') }))
    .filter((x) => fs.existsSync(x.file))
    .map((x) => ({ ...readJson(x.file, {}), id: x.id, dir: path.dirname(x.file) }))
    .sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || a.id.localeCompare(b.id));
}

export function loadStarter(id) {
  const all = listStarters();
  const want = String(id || 'island').toLowerCase();
  const hit = all.find((s) => s.id === want);
  if (hit) return hit;
  if (want === 'island') return { id: 'island', name: 'Island', base: true, dir: path.join(STARTERS_DIR, 'island'), blocks: [] };
  const near = all.filter((s) => s.id.includes(want) || want.includes(s.id) || (s.tags || []).some((t) => want.includes(t))).map((s) => s.id);
  throw new HelperError(`there is no starter called "${id}".`, near.length ? `Did you mean: ${near.join(', ')}?` : `See them all with  node tools/starters/list.mjs  (${all.map((s) => s.id).join(', ') || 'none yet'}).`);
}
