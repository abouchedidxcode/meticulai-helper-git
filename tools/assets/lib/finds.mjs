// Where find.mjs keeps its results, so get.mjs can take "3" to mean "number 3 from the last search".
import fs from 'node:fs';
import path from 'node:path';
import { HelperError } from '../../lib/log.mjs';
import { helperDir, pretty, readJson, writeJson } from '../../lib/paths.mjs';

export const findsDir = (gameDir) => path.join(helperDir(gameDir), 'finds');

export function saveLastFind(gameDir, resultsFile) {
  writeJson(path.join(findsDir(gameDir), 'last.json'), { results: path.relative(findsDir(gameDir), resultsFile) });
}

/** Result number n of the last search. */
export function fromLastFind(gameDir, n) {
  const last = readJson(path.join(findsDir(gameDir), 'last.json'));
  if (!last) throw new HelperError(`there is no earlier search to take number ${n} from.`, 'Search first:  node tools/assets/find.mjs "<what you need>"');
  const file = path.resolve(findsDir(gameDir), last.results);
  const data = readJson(file);
  const r = data?.results?.find((x) => x.n === n);
  if (!r) throw new HelperError(`the last search (${pretty(file)}) has no number ${n}.`, `Pick a number from 1 to ${data?.results?.length || 0}, or use the full id (like polyhaven:rock_moss_set_01).`);
  return r;
}

export function ensureGameDir(gameDir) {
  if (!fs.existsSync(gameDir)) {
    throw new HelperError(`there is no game folder yet (looked for ${pretty(gameDir)}).`, 'Run  node tools/init.mjs --name "My Game"  first, or point at a game folder with --dir.');
  }
}
