#!/usr/bin/env node
// Search free asset libraries (live where they have an API, the kit's catalogues otherwise), merge and rank the
// results, and make one numbered contact sheet of thumbnails to compare them by eye.
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, detail, ok, runTool, say, warn } from '../lib/log.mjs';
import { gameDir, pretty, stamp, writeJson } from '../lib/paths.mjs';
import { KINDS, STYLES, isCc0, licenseLabel } from './lib/common.mjs';
import { ensureGameDir, findsDir, saveLastFind } from './lib/finds.mjs';
import { numberedSheet } from './lib/sheet.mjs';
import { ALL, catalog, packs } from './sources/index.mjs';

const HELP = `
node tools/assets/find.mjs "<what you need>" [options]

Searches free asset libraries and shows the best matches as a numbered list and ONE picture (a contact sheet)
with a numbered thumbnail for each, so you can compare them by eye. Nothing is downloaded into the game.

  --kind <kind>        ${KINDS.join(' | ')}
  --style <style>      ${STYLES.join(' | ')}
  --source <ids>       only these sources, comma separated: polyhaven, ambientcg, polyfork, packs (or a pack
                       source like kenney), catalog (the kit's lists of libraries and blocks)
  --license <which>    cc0 (no credit needed) | credit-ok (CC0 and CC BY; default)
  --limit <n>          how many results (default 24)
  --json               print the results as JSON
  --dir <folder>       the game folder (default my-game/)

Writes my-game/.helper/finds/<time>/sheet.jpg and results.json. Then:
  node tools/assets/get.mjs <number> --candidate     download that result to look at it closely

Searches are polite: few requests at a time, and answers are cached for a day in ~/.cache/meticulai-helper/.
`;

const LIVE_KIND_HINT = { model: 'model', material: 'material', texture: 'material', hdri: 'hdri', sky: 'hdri' };

await runTool(async () => {
  const { values: a, positionals } = getArgs({
    kind: { type: 'string' }, style: { type: 'string' }, source: { type: 'string' }, license: { type: 'string', default: 'credit-ok' },
    limit: { type: 'number', default: 24 }, json: { type: 'boolean' },
  }, HELP);
  const query = positionals.join(' ').trim();
  if (!query) throw new HelperError('you didn\'t say what to look for.', 'For example:  node tools/assets/find.mjs "mossy rock" --kind model');
  const kind = a.kind ? (LIVE_KIND_HINT[a.kind] || a.kind) : null;
  if (kind && !KINDS.includes(kind)) throw new HelperError(`I don't know the kind "${a.kind}".`, `Use one of: ${KINDS.join(', ')}.`);
  if (a.style && !STYLES.includes(a.style)) throw new HelperError(`I don't know the style "${a.style}".`, `Use one of: ${STYLES.join(', ')}.`);
  if (!['cc0', 'credit-ok'].includes(a.license)) throw new HelperError(`--license takes cc0 or credit-ok, not "${a.license}".`, 'Use --license cc0 to see only assets that need no credit.');
  const limit = Math.max(1, Math.min(60, Math.round(a.limit)));
  const dir = gameDir(a.dir);
  ensureGameDir(dir);

  // which adapters to ask
  const wanted = a.source ? a.source.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : null;
  const packSources = packs.sourceIds();
  const adapters = ALL.filter((s) => {
    if (wanted) {
      if (s.id === 'packs') return wanted.includes('packs') || wanted.some((w) => packSources.includes(w));
      if (!wanted.includes(s.id)) return false;
    }
    if (s.kinds && kind && !s.kinds.includes(kind)) return false;
    if (s.styles && a.style && a.style !== 'any' && !s.styles.includes(a.style)) return false;
    if (a.license === 'cc0' && s.license && !isCc0(s.license)) return false;
    return true;
  });
  if (wanted) {
    const known = [...ALL.map((s) => s.id), ...packSources];
    const unknown = wanted.filter((w) => !known.includes(w));
    if (unknown.length) warn(`I don't know the source ${unknown.join(', ')}. Known: ${known.join(', ')}.`);
  }
  if (!adapters.length) throw new HelperError('no source matches those filters.', 'Drop --style, --kind or --source and search again.');

  say(`Searching ${adapters.map((s) => s.name).join(', ')} for "${query}"...`);
  const settled = await Promise.all(adapters.map(async (s) => {
    try {
      const list = await s.search(query, { kind, style: a.style, limit, license: a.license, sources: wanted });
      return { s, list };
    } catch (e) {
      detail(e);
      return { s, error: e };
    }
  }));

  let results = [];
  for (const { s, list, error } of settled) {
    if (error) { warn(`${s.name} didn't answer (${error.message.replace(/\.$/, '')}), so it's left out this time.`); continue; }
    // within one source, later results count a little less, so sources interleave instead of one filling the list
    list.sort((x, y) => y.score - x.score).forEach((r, i) => { r.rank = r.score - 0.03 * i; });
    results.push(...list);
  }
  if (settled.every((x) => x.error)) throw new HelperError('none of the sources answered.', 'Check the internet connection and try again in a minute.');

  const st = catalog.status();
  if (adapters.includes(catalog) && !st.sources && !st.blocks && !st.libraries) warn("the kit's catalogues aren't there yet (sources/catalog.json, blocks/catalog.json), so there are no library or block suggestions.");
  if ((!wanted || wanted.includes('packs')) && !packSources.length) detail('no sources/packs/*.json files yet');

  if (a.license === 'cc0') results = results.filter((r) => isCc0(r.license));
  if (a.style && a.style !== 'any') results = results.filter((r) => !r.style || r.style.split('/').includes(a.style));
  // libraries and blocks are suggestions: at most 4 of them
  const assets = results.filter((r) => !r.isLibrary && !r.isBlock).sort((x, y) => y.rank - x.rank);
  const extras = results.filter((r) => r.isLibrary || r.isBlock).sort((x, y) => y.rank - x.rank).slice(0, 4);
  const top = assets.slice(0, Math.max(0, limit - Math.min(extras.length, Math.ceil(limit / 6))));
  const final = [...top, ...extras.slice(0, limit - top.length)];
  if (!final.length) {
    say(`\nNothing found for "${query}"${kind ? ` (kind ${kind})` : ''}.`);
    say('Try fewer or simpler words (e.g. "rock" instead of "mossy granite boulder"), drop --kind or --style, or another --source.');
    return 1;
  }
  final.forEach((r, i) => { r.n = i + 1; });

  const outDir = path.join(findsDir(dir), stamp());
  const resultsFile = path.join(outDir, 'results.json');
  const clean = final.map(({ rank, score, ...r }) => ({ ...r, score: +score.toFixed(3) }));
  writeJson(resultsFile, { query, kind, style: a.style || null, license: a.license, made: new Date().toISOString(), results: clean });
  saveLastFind(dir, resultsFile);

  say('Making the contact sheet...');
  let sheets = [];
  try {
    sheets = await numberedSheet(final.map((r) => ({ thumb: r.thumb, label: r.n })), path.join(outDir, 'sheet.jpg'), { cols: final.length <= 12 ? 4 : 6, maxRows: 10 });
  } catch (e) {
    detail(e);
    warn(`I couldn't make the contact sheet (${e.message}). The list below still works.`);
  }

  if (a.json) {
    console.log(JSON.stringify({ query, sheet: sheets[0] || null, results: clean }, null, 1));
    return 0;
  }
  const counts = {};
  for (const r of final) counts[r.sourceName] = (counts[r.sourceName] || 0) + 1;
  say(`\nFound ${final.length} for "${query}" (${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}):`);
  const idW = Math.min(44, Math.max(...final.map((r) => r.id.length)));
  for (const r of final) {
    const lic = `${licenseLabel(r.license)}${r.creditNeeded ? ', credit needed' : ''}`;
    say(`${String(r.n).padStart(3)}  ${r.id.padEnd(idW)}  ${r.title} - ${[r.kind, r.style].filter(Boolean).join(', ')}, ${lic}${r.info ? ` - ${r.info}` : ''}`);
  }
  if (sheets.length) {
    say('');
    ok(`Contact sheet: ${sheets.map(pretty).join(', ')}`);
    say('Look at this picture to compare them. Each tile has its number in the corner.');
  }
  say('\nNext: download the ones that might fit to look at them closely (they stay out of the game until you decide):');
  say(`  node tools/assets/get.mjs ${final[0].n} --candidate`);
  if (extras.length) say('Libraries and blocks in the list are whole kits or code: "get" tells you how to use them.');
  return 0;
});
