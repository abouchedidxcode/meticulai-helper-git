#!/usr/bin/env node
// Download an asset from its ORIGINAL source: as a candidate to look at first, or straight into the game with its
// credit line. Also lists what's inside a pack, and promotes a (remixed) candidate into the game.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, bytes, ok, runTool, say, warn } from '../lib/log.mjs';
import { gameDir, helperDir, pretty, readJson, stamp, writeJson } from '../lib/paths.mjs';
import { KIND_FOLDER, fileKind, isCc0, licenseLabel, parseId, safeName, today } from './lib/common.mjs';
import { DEFAULT_CREDIT, fillTemplate, loadBlocks, loadLibraries, loadSources, sourceInfo } from './lib/catalogs.mjs';
import { appendAssetsLog, appendCredit } from './lib/credits.mjs';
import { ensureGameDir, findsDir, fromLastFind, saveLastFind } from './lib/finds.mjs';
import { hasExternalRefs, toGlb } from './lib/gltf.mjs';
import { lookAudio, lookImages, lookModelGrid } from './lib/looks.mjs';
import { ambientcg, packs, polyfork, polyhaven } from './sources/index.mjs';
import { findInPack, groupPackFiles } from './sources/packs.mjs';

const HELP = `
node tools/assets/get.mjs <id or number> [--candidate] [--res 1k|2k|4k] [--format glb|gltf]
node tools/assets/get.mjs promote <candidate file or folder> [--kind model] [--name new-name]

Downloads an asset from the site that made it (never a copy from somewhere else).

  <id>            from find.mjs, e.g. polyhaven:rock_moss_set_01, ambientcg:Rock064, polyfork:field-rock-5e37c6,
                  kenney:hexagon-kit (lists the pack), kenney:hexagon-kit/building-castle.glb (one file of it)
  <number>        a number from the last find.mjs search (or the last pack listing)
  --candidate     put it in my-game/.helper/candidates/<id>/ to look at and judge first (not in the game yet)
                  Without it: my-game/public/assets/<kind>/<name>.<ext>, plus a credit row in my-game/CREDITS.md
                  and a line in my-game/ASSETS.md.
  --res <r>       texture / sky resolution: 1k (default), 2k, 4k
  --format <f>    models: glb (default, one file) or gltf (a folder)
  --zip <file>    for a pack whose site needs a person to click Download: the zip you downloaded
  --force         replace a file that is already in the game
  --dir <folder>  the game folder (default my-game/)

promote: copies a candidate (or your remix of it, e.g. from restyle.mjs) into public/assets/ with its credit.
`;

const ADAPTERS = { polyhaven, ambientcg, polyfork };

await runTool(async () => {
  const { values: a, positionals } = getArgs({
    candidate: { type: 'boolean' }, res: { type: 'string', default: '1k' }, format: { type: 'string', default: 'glb' },
    zip: { type: 'string' }, force: { type: 'boolean' }, kind: { type: 'string' }, name: { type: 'string' },
  }, HELP);
  const dir = gameDir(a.dir);
  ensureGameDir(dir);
  if (!/^(1k|2k|4k|8k)$/i.test(a.res)) throw new HelperError(`--res takes 1k, 2k or 4k, not "${a.res}".`, 'Start with 1k: it is plenty for most game objects.');
  if (!['glb', 'gltf'].includes(a.format)) throw new HelperError(`--format takes glb or gltf, not "${a.format}".`, 'Use glb (one file) unless you need to edit the textures by hand.');
  if (positionals[0] === 'promote') return promote(dir, positionals[1], a);

  const target = positionals[0];
  if (!target) throw new HelperError("you didn't say what to get.", 'Give an id from find.mjs (like polyhaven:rock_moss_set_01) or a number from the last search.');
  let id = target, fromFind = null;
  if (/^\d+$/.test(target)) { fromFind = fromLastFind(dir, Number(target)); id = fromFind.id; say(`Number ${target} is ${id} (${fromFind.title}).`); }
  const p = parseId(id);
  if (!p) throw new HelperError(`"${id}" isn't an asset id.`, 'Ids look like source:name, e.g. polyhaven:rock_moss_set_01. Run find.mjs to get them.');

  if (p.source === 'block') return explainBlock(p.id);
  if (p.source === 'library') return explainLibrary(p.id);
  if (p.source === 'source') return explainSource(p.id);

  const res = a.res.toLowerCase();
  if (ADAPTERS[p.source]) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mhg-get-'));
    try {
      say(`Downloading ${id} from ${ADAPTERS[p.source].name}${['polyhaven', 'ambientcg'].includes(p.source) ? ` (${res})` : ''}...`);
      const got = await ADAPTERS[p.source].get(p.id, { res, workDir: work, format: a.format, say });
      return place(dir, { ...got, source: p.source, sourceName: ADAPTERS[p.source].name, id }, a);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  if (packs.has(p.source)) {
    const { pack, dir: packDir, files } = await packs.ensure(p.source, p.id, { zipFile: a.zip, say });
    if (!p.sub) return listPack(dir, p, pack, packDir, files);
    const hit = findInPack(files, p.sub);
    if (!hit.file) {
      throw new HelperError(`the pack ${p.source}:${p.id} has no file "${p.sub}".`, hit.near?.length ? `Close matches: ${hit.near.join(', ')}` : `List the pack with  node tools/assets/get.mjs ${p.source}:${p.id}`);
    }
    if (hit.others?.length) say(`  note  also in other formats: ${hit.others.slice(0, 3).join(', ')}; taking ${hit.file}.`);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mhg-get-'));
    try {
      const src = path.join(packDir, hit.file);
      let main = path.join(work, path.basename(hit.file));
      const k = fileKind(src);
      if (k === 'model' && /\.(glb|gltf)$/i.test(src) && (a.format === 'glb') && (src.toLowerCase().endsWith('.gltf') || hasExternalRefs(src))) {
        main = path.join(work, path.basename(hit.file).replace(/\.gltf$/i, '.glb'));
        await toGlb(src, main); // pulls its textures in, so it's one self-contained file
      } else {
        fs.copyFileSync(src, main);
        if (/\.obj$/i.test(src)) { const mtl = src.replace(/\.obj$/i, '.mtl'); if (fs.existsSync(mtl)) fs.copyFileSync(mtl, path.join(work, path.basename(mtl))); }
      }
      const kind = a.kind || ({ model: 'model', image: (pack.kinds.includes('tileset') ? 'tileset' : pack.kinds.includes('icon') ? 'icon' : 'sprite'), audio: (pack.kinds.includes('music') && !pack.kinds.includes('audio') ? 'music' : 'audio'), font: 'font', hdri: 'hdri' }[k] || 'model');
      return place(dir, {
        kind, title: `${pack.name}: ${path.basename(hit.file)}`, author: pack.author || p.source, license: pack.license, url: pack.url,
        credit_template: pack.credit_template, assetId: `${p.id}-${path.basename(hit.file).replace(/\.[^.]+$/, '')}`,
        files: fs.readdirSync(work).map((f) => path.join(work, f)), main, source: p.source, sourceName: p.source, id: `${p.source}:${p.id}/${path.basename(hit.file)}`,
        creditNeeded: pack.credit_required ?? !isCc0(pack.license),
      }, a);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  const known = ['polyhaven', 'ambientcg', 'polyfork', ...packs.sourceIds(), 'block', 'library', 'source'];
  throw new HelperError(`I don't know how to download from "${p.source}".`, `Sources I can download from: ${known.join(', ')}. For others, open the asset page in a browser.`);
});

// ---------------------------------------------------------------- putting files in place

function creditLine(got) {
  if (got.credit) return got.credit;
  const tpl = got.credit_template || sourceInfo(got.source)?.credit_template || DEFAULT_CREDIT;
  return fillTemplate(tpl, { title: got.title, author: got.author, url: got.url, license: licenseLabel(got.license), id: got.assetId });
}

function copyInto(files, destDir, { force = false } = {}) {
  fs.mkdirSync(destDir, { recursive: true });
  const out = [];
  for (const f of files) {
    const d = path.join(destDir, path.basename(f));
    if (fs.existsSync(d) && !force) throw new HelperError(`${pretty(d)} is already there.`, 'Use --force to replace it, or --name to bring it in under another name.');
    if (fs.statSync(f).isDirectory()) fs.cpSync(f, d, { recursive: true, force: true });
    else fs.copyFileSync(f, d);
    out.push(d);
  }
  return out;
}

function place(dir, got, a) {
  const credit = creditLine(got);
  const needsCredit = got.creditNeeded ?? !isCc0(got.license);
  const meta = {
    id: got.id, title: got.title, source: got.source, kind: got.kind, license: got.license, credit_needed: needsCredit,
    author: got.author, url: got.url, credit, note: got.note || null, resolution: got.res || null, downloaded: today(),
  };
  // the files: a folder of maps (materials, ambientCG zips) or one file
  const folderish = got.folder || got.files.length > 1;
  if (a.candidate) {
    const cdir = path.join(helperDir(dir), 'candidates', safeName(got.id.replace(':', '_').replace(/\//g, '_')));
    fs.mkdirSync(cdir, { recursive: true });
    const placed = copyInto(got.files, cdir, { force: true });
    const main = folderish && got.kind === 'material' ? cdir : (placed.find((f) => path.basename(f) === path.basename(got.main)) || placed[0]);
    writeJson(path.join(cdir, 'CANDIDATE.json'), { ...meta, main: path.relative(cdir, main) || '.', files: placed.map((f) => path.relative(cdir, f)) });
    const size = placed.reduce((s, f) => s + (fs.statSync(f).isFile() ? fs.statSync(f).size : 0), 0);
    say('');
    ok(`Candidate saved (not in the game yet): ${pretty(main)} (${bytes(size)})`);
    say(`  ${got.title} - ${licenseLabel(got.license)}${needsCredit ? `, credit needed: ${credit}` : ', no credit needed (we still list it in CREDITS.md when it goes in)'}`);
    if (got.note) say(`  ${got.note}`);
    say(`\nNext: look at it:  node tools/assets/look.mjs ${pretty(main)}${got.kind === 'model' ? ' --in-game' : ''}`);
    say(`If it fits, bring it in:  node tools/assets/get.mjs promote ${pretty(main)}${got.kind === 'model' ? '   (or remix it first with restyle.mjs)' : ''}`);
    return 0;
  }
  const kindDir = path.join(dir, 'public', 'assets', KIND_FOLDER[got.kind] || 'other');
  const name = safeName(a.name || got.assetId || got.title).toLowerCase();
  let placedMain;
  if (folderish) {
    const dest = path.join(kindDir, name);
    copyInto(got.files, dest, { force: a.force });
    placedMain = dest;
  } else {
    const ext = path.extname(got.main);
    const dest = path.join(kindDir, `${name}${ext}`);
    if (fs.existsSync(dest) && !a.force) throw new HelperError(`${pretty(dest)} is already in the game.`, 'Use --force to replace it, or --name to bring it in under another name.');
    fs.mkdirSync(kindDir, { recursive: true });
    fs.copyFileSync(got.main, dest);
    placedMain = dest;
  }
  return finishBringIn(dir, placedMain, meta, credit, needsCredit, null);
}

function finishBringIn(dir, placedMain, meta, credit, needsCredit, changedNote) {
  const rel = path.relative(path.join(dir, 'public'), placedMain).split(path.sep).join('/');
  const where = `public/${rel}`;
  const added = appendCredit(dir, { title: meta.title, author: meta.author, license: meta.license, url: meta.url, where, credit: needsCredit ? credit : '', note: changedNote });
  const logged = appendAssetsLog(dir, `${meta.id} -> ${where} (${licenseLabel(meta.license)}${changedNote ? `; ${changedNote}` : ''})`);
  say('');
  ok(`In the game: ${pretty(placedMain)}`);
  say(`  Load it in code with the relative path '${rel}' (no leading slash, so it works online too).`);
  ok(added === 'added' ? `Credit row added to ${pretty(path.join(dir, 'CREDITS.md'))}` : 'Its credit row was already in CREDITS.md.');
  if (needsCredit) say(`  This licence needs the credit shown to players too (a credits screen is enough): ${credit}`);
  if (logged) ok(`Logged in ${pretty(path.join(dir, 'ASSETS.md'))} (update its row in the table: status "in game").`);
  return 0;
}

// ---------------------------------------------------------------- promote

function promote(dir, target, a) {
  if (!target) throw new HelperError('you didn\'t say which candidate to promote.', 'For example:  node tools/assets/get.mjs promote my-game/.helper/candidates/polyhaven_rock_moss_set_01/rock_moss_set_01_1k.glb');
  const p = path.resolve(target);
  if (!fs.existsSync(p)) throw new HelperError(`I can't find ${target}.`, 'Check the path (candidates are in my-game/.helper/candidates/).');
  // find CANDIDATE.json in this folder or one above it
  let d = fs.statSync(p).isDirectory() ? p : path.dirname(p), meta = null, cdir = null;
  for (let i = 0; i < 4 && d; i++) {
    meta = readJson(path.join(d, 'CANDIDATE.json'));
    if (meta) { cdir = d; break; }
    const up = path.dirname(d); if (up === d) break; d = up;
  }
  if (!meta) throw new HelperError(`${pretty(p)} isn't inside a candidate folder (no CANDIDATE.json), so I don't know whose it is or its licence.`, 'Get it with  get.mjs <id> --candidate  first, and keep remixes in the same candidate folder.');
  const kind = a.kind || meta.kind || 'model';
  const kindDir = path.join(dir, 'public', 'assets', KIND_FOLDER[kind] || 'other');
  const isDir = fs.statSync(p).isDirectory();
  const original = path.join(cdir, meta.main || '');
  const changed = !isDir && path.resolve(original) !== p;
  const base = a.name ? safeName(a.name).toLowerCase() : safeName((isDir ? path.basename(p) : path.basename(p, path.extname(p)))).toLowerCase();
  let dest;
  if (isDir) {
    dest = path.join(kindDir, base);
    if (fs.existsSync(dest) && !a.force) throw new HelperError(`${pretty(dest)} is already in the game.`, 'Use --force to replace it, or --name for another name.');
    fs.mkdirSync(dest, { recursive: true });
    for (const f of fs.readdirSync(p)) if (f !== 'CANDIDATE.json' && !f.startsWith('.')) fs.cpSync(path.join(p, f), path.join(dest, f), { recursive: true, force: true });
  } else {
    dest = path.join(kindDir, `${base}${path.extname(p)}`);
    if (fs.existsSync(dest) && !a.force) throw new HelperError(`${pretty(dest)} is already in the game.`, 'Use --force to replace it, or --name for another name.');
    fs.mkdirSync(kindDir, { recursive: true });
    fs.copyFileSync(p, dest);
  }
  say(`Promoting ${pretty(p)} (${meta.title}, from ${meta.source})${changed ? ' - a remix of the original' : ''}...`);
  return finishBringIn(dir, dest, meta, meta.credit, meta.credit_needed, changed ? 'modified (remixed with restyle.mjs)' : null);
}

// ---------------------------------------------------------------- packs

async function listPack(dir, p, pack, packDir, files) {
  const g = groupPackFiles(files);
  const outDir = path.join(findsDir(dir), `${stamp()}_${safeName(p.source)}-${safeName(p.id)}`);
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  let n = 0;
  // short names: the file name when it is unique in the pack, else the path inside the pack
  const baseCount = {};
  for (const f of files) { const b = path.basename(f).toLowerCase(); baseCount[b] = (baseCount[b] || 0) + 1; }
  const short = (f) => (baseCount[path.basename(f).toLowerCase()] === 1 ? path.basename(f) : f);
  const add = (f, kind) => { n++; results.push({ n, id: `${p.source}:${p.id}/${short(f)}`, title: path.basename(f), source: p.source, kind, license: pack.license, file: f, name: short(f) }); return n; };
  const models = g.model.slice(0, 144), images = g.image.slice(0, 144), sounds = g.audio.slice(0, 48);
  models.forEach((f) => add(f, 'model'));
  images.forEach((f) => add(f, 'sprite'));
  sounds.forEach((f) => add(f, 'audio'));
  g.font.forEach((f) => add(f, 'font'));
  const resultsFile = path.join(outDir, 'results.json');
  writeJson(resultsFile, { pack: `${p.source}:${p.id}`, results });
  saveLastFind(dir, resultsFile);

  say(`\n${pack.name} (${licenseLabel(pack.license)}): ${g.model.length} models, ${g.image.length} pictures, ${g.audio.length} sounds${g.font.length ? `, ${g.font.length} fonts` : ''}.`);
  const sheets = [];
  if (models.length) {
    say(`Rendering the ${models.length} models...`);
    const r = await lookModelGrid(models.map((f, i) => ({ file: path.join(packDir, f), label: i + 1 })), path.join(outDir, 'models.jpg'), { title: `${pack.name}: models` });
    sheets.push(...r.outs);
    r.facts.forEach((f, i) => { if (!f.error) results[i].info = `${f.size.x} x ${f.size.y} x ${f.size.z} m, ${f.triangles} triangles${f.animations ? `, ${f.animations} animations` : ''}`; });
  }
  if (images.length) sheets.push(...(await lookImages(images.map((f) => path.join(packDir, f)), path.join(outDir, 'pictures.jpg'), { start: models.length + 1 })));
  if (sounds.length) sheets.push(...(await lookAudio(sounds.map((f) => path.join(packDir, f)), path.join(outDir, 'sounds.jpg'), { start: models.length + images.length + 1 })));
  writeJson(resultsFile, { pack: `${p.source}:${p.id}`, results });
  say('');
  const folders = [...new Set(results.map((r) => path.dirname(r.file)))];
  if (folders.length <= 4) say(`Inside: ${folders.join(', ')}`);
  for (const r of results) say(`${String(r.n).padStart(4)}  ${r.name}${r.info ? `  (${r.info})` : ''}`);
  const more = [g.model.length > 144 && `${g.model.length - 144} more models`, g.image.length > 144 && `${g.image.length - 144} more pictures`, g.audio.length > 48 && `${g.audio.length - 48} more sounds`].filter(Boolean);
  if (more.length) say(`  ...and ${more.join(', ')} (get them by name).`);
  say('');
  for (const s of sheets) ok(`Contact sheet: ${pretty(s)}`);
  if (sheets.length) say('Look at these pictures to choose. The numbers match the list.');
  const first = results[0];
  if (first) say(`\nTake one:  node tools/assets/get.mjs ${first.n} --candidate   (or  get.mjs ${first.id} --candidate)`);
  return 0;
}

// ---------------------------------------------------------------- blocks, libraries, whole sources

function explainBlock(id) {
  const b = (loadBlocks() || []).find((x) => x.id === id);
  if (!b) throw new HelperError(`there is no block "${id}" in blocks/catalog.json${loadBlocks() ? '' : " (the blocks catalogue isn't there yet)"}.`, 'List the blocks with  node tools/blocks/list.mjs');
  say(`${b.name} is a block: code you add to the game and then edit like your own.`);
  say(`  ${b.what || ''}`);
  say(`\nAdd it:  node tools/blocks/add.mjs ${b.id}`);
  return 0;
}

function explainLibrary(id) {
  const l = (loadLibraries() || []).find((x) => x.id === id);
  if (!l) throw new HelperError(`there is no library "${id}" in sources/libraries.json${loadLibraries() ? '' : " (the libraries list isn't there yet)"}.`, 'Search again with find.mjs.');
  say(`${l.name} is a code library (${licenseLabel(l.license)}): ${l.what || ''}`);
  if (l.npm) say(`\nAdd it to the game (in the my-game folder):  npm install ${l.npm}`);
  if (l.repo) say(`Its home: ${l.repo}${l.agent_docs ? `  (notes for agents: ${l.agent_docs})` : ''}`);
  say('Add a row for it to my-game/CREDITS.md (name, author, licence, link).');
  return 0;
}

function explainSource(id) {
  const s = (loadSources() || []).find((x) => x.id === id);
  if (!s) throw new HelperError(`there is no library "${id}" in sources/catalog.json${loadSources() ? '' : " (the catalogue isn't there yet)"}.`, 'Search again with find.mjs.');
  say(`${s.name} (${s.url}) is a whole asset library: ${licenseLabel(s.license)}${s.credit_required ? ', credit needed' : ''}.`);
  if (s.good_for) say(`  Good for: ${s.good_for}`);
  if (s.not_for) say(`  Not for: ${s.not_for}`);
  for (const gch of (s.gotchas || []).slice(0, 4)) say(`  Watch out: ${gch}`);
  const md = path.join('sources', `${id}.md`);
  say(`\nHow to search and download it: read ${md}. Search inside it with  node tools/assets/find.mjs "<words>" --source ${id}`);
  return 0;
}
