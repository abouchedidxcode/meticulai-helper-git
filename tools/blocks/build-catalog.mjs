#!/usr/bin/env node
// Merge every blocks/vendor/*/block.json into blocks/catalog.json, then regenerate blocks/BY-NEED.md (blocks grouped
// by what the player does or what the game needs) and the "Meticulai blocks" section of blocks/CREDITS.md.
// Safe to run again and again: same input, same files.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, bad, ok, runTool, say, warn } from '../lib/log.mjs';
import { kitDir } from '../assets/lib/catalogs.mjs';
import { NEEDS, OTHER, needsOf } from './lib/needs.mjs';

const HELP = `
node tools/blocks/build-catalog.mjs [--check]

For people who maintain the kit. Reads every blocks/vendor/<id>/block.json (the Meticulai blocks: systems taken from
games on meticulai.com) and puts them into blocks/catalog.json, replacing older copies of the same block. Entries
written by hand (the Patch blocks and the pointed-to ones) are left exactly as they are. Then it rewrites
blocks/BY-NEED.md, the list of every block grouped by what the game needs ("You fly or glide", "Crowds, herds,
flocks"...), and the "Meticulai blocks" section of blocks/CREDITS.md.

It prints any problem with a block.json in plain words. A block.json that can't be read is left out; one with
missing details goes in with a note.

  --check   only report problems and whether the files would change; write nothing
`;

const KINDS = ['effect', 'system', 'tool', 'look', 'input', 'audio', 'ai', 'physics', 'procgen', 'vehicle', 'character', 'combat', 'ui', 'dev-tool'];
const RENDERERS = ['webgl2', 'webgpu', 'both', '2d', 'none'];
const STATUSES = ['ready', 'reference-only', 'draft'];
// The order fields are written in, so the file stays tidy and diffs stay small. Unknown fields keep their place at the end.
const FIELD_ORDER = ['id', 'name', 'kind', 'what', 'use_when', 'tags', 'by', 'from_game', 'play_url', 'license', 'art_license',
  'third_party', 'vendored', 'upstream', 'renderer', 'size_kb', 'status', 'good_for', 'not_for', 'how_to_add', 'agent_docs',
  'preview', 'tuned_by_play', 'tests', 'needs'];
const REQUIRED = ['id', 'name', 'kind', 'what', 'use_when', 'tags', 'by', 'from_game', 'license', 'vendored', 'renderer', 'status', 'how_to_add', 'agent_docs'];

const RENDER_WORDS = { webgl2: 'works with the starter', webgpu: 'needs WebGPU', both: 'WebGPU, falls back to WebGL 2', '2d': '2D canvas', none: 'no renderer needed' };

const isMeticulai = (b) => /^meticulai-/.test(b?.id || '') || b?.by === 'Meticulai';
const rel = (p) => path.relative(kitDir(), p).split(path.sep).join('/');

function ordered(b) {
  const out = {};
  for (const k of FIELD_ORDER) if (k in b) out[k] = b[k];
  for (const k of Object.keys(b)) if (!(k in out)) out[k] = b[k];
  return out;
}

function folderKb(dir) {
  let n = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) n += fs.statSync(p).size;
    }
  };
  walk(dir);
  return Math.max(1, Math.round(n / 1024));
}

/** Read and check one block.json. Returns { block, problems: [string], fatal: bool }. */
function readBlockJson(file, folder) {
  const problems = [];
  let b;
  try {
    b = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { block: null, problems: [`it isn't valid JSON (${e.message}). Left out.`], fatal: true };
  }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { block: null, problems: ['it should hold one object { "id": ..., ... }. Left out.'], fatal: true };
  if (!b.id) return { block: null, problems: ['it has no "id". Left out.'], fatal: true };
  if (b.id !== folder) problems.push(`its id "${b.id}" doesn't match its folder name "${folder}" (add.mjs finds blocks by folder).`);
  if (!b.name || !b.what) return { block: null, problems: [...problems, 'it needs at least "name" and "what" to be listed. Left out.'], fatal: true };
  const missing = REQUIRED.filter((k) => b[k] === undefined || b[k] === null || b[k] === '' || (Array.isArray(b[k]) && !b[k].length));
  if (missing.length) problems.push(`missing: ${missing.join(', ')}.`);
  if (!('play_url' in b)) problems.push('no "play_url" (use null if the game is not on meticulai.com yet).');
  if (b.kind && !KINDS.includes(b.kind)) problems.push(`kind "${b.kind}" is not one of ${KINDS.join(', ')}.`);
  if (b.renderer && !RENDERERS.includes(b.renderer)) problems.push(`renderer "${b.renderer}" is not one of ${RENDERERS.join(', ')}.`);
  if (b.status && !STATUSES.includes(b.status)) problems.push(`status "${b.status}" is not one of ${STATUSES.join(', ')}.`);
  if (b.tags && !Array.isArray(b.tags)) problems.push('"tags" should be a list of words, like ["horse", "gallop"].');
  if ('tuned_by_play' in b && typeof b.tuned_by_play !== 'boolean') problems.push('"tuned_by_play" should be true or false.');
  if ('tests' in b && !Number.isFinite(b.tests)) problems.push('"tests" should be a number (how many tests pass).');
  if (b.play_url && !/^https:\/\/meticulai\.com\//.test(b.play_url)) problems.push(`play_url "${b.play_url}" doesn't point at meticulai.com.`);
  if (b.vendored && b.vendored.replace(/\/?$/, '/') !== `blocks/vendor/${folder}/`) problems.push(`"vendored" should be "blocks/vendor/${folder}/".`);
  if (b.agent_docs && !fs.existsSync(path.join(kitDir(), b.agent_docs))) problems.push(`agent_docs ${b.agent_docs} doesn't exist yet.`);
  if (b.preview && !fs.existsSync(path.join(kitDir(), b.preview))) problems.push(`preview ${b.preview} doesn't exist yet.`);
  if (b.how_to_add && !b.how_to_add.includes(b.id)) problems.push(`how_to_add should be "node tools/blocks/add.mjs ${b.id}".`);
  const text = JSON.stringify(b);
  if (/(^|["\s(])(\/Users\/|\/home\/|[A-Z]:\\\\Users)/.test(text)) problems.push('it contains a path from someone\'s computer (/Users/... or /home/...). Remove it before publishing.');
  if (!b.size_kb) b.size_kb = folderKb(path.dirname(file));
  return { block: b, problems, fatal: false };
}

// ---------------------------------------------------------------- BY-NEED.md

const oneLine = (s, n = 170) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return stop > n * 0.5 ? cut.slice(0, stop) + '.' : cut.replace(/[\s,;:]+\S*$/, '') + '...';
};
const md = (s) => String(s || '').replace(/\|/g, '/').replace(/\n/g, ' ');

function byNeedLine(b) {
  const status = b.status === 'ready' ? 'ready' : b.status === 'reference-only' ? 'pointed to (downloaded from the author)' : b.status || '?';
  const parts = [];
  parts.push(`- **${md(b.name)}** (\`${b.id}\`): ${md(oneLine(b.what))}`);
  const when = b.use_when ? `Use when ${md(oneLine(b.use_when.replace(/^use (it )?when /i, ''), 200))}` : (b.good_for ? `Good for: ${md(oneLine(b.good_for, 200))}` : '');
  if (when) parts.push(`  ${when.replace(/\.?$/, '.')}`);
  let from;
  if (isMeticulai(b)) {
    from = b.from_game ? `From ${b.from_game}${b.play_url ? ` ([play it](${b.play_url}))` : ' (not on the site yet)'}` : 'From a Meticulai game';
    if (b.tuned_by_play) from += ', tuned by playing';
  } else {
    from = `By ${b.by || 'unknown'}`;
  }
  const r = RENDER_WORDS[b.renderer] || b.renderer || 'renderer unknown';
  parts.push(`  ${from}. ${r[0].toUpperCase()}${r.slice(1)}; ${status}.`);
  return parts.join('\n');
}

function buildByNeed(blocks) {
  const groups = new Map([...NEEDS, OTHER].map((n) => [n.id, []]));
  for (const b of blocks) for (const n of needsOf(b)) groups.get(n).push(b);
  const meticulai = blocks.filter(isMeticulai).length;
  const lines = [
    '# Blocks by need',
    '',
    '<!-- Generated by `node tools/blocks/build-catalog.mjs` from blocks/catalog.json. Don\'t edit by hand: change the',
    '     block.json (or the catalogue entry) and run the script again. -->',
    '',
    'Every block in the kit, grouped by what the player does or what the game needs. A block can be under two headings.',
    `${blocks.length} blocks: ${meticulai} Meticulai blocks (systems from games on meticulai.com, each links to its game)`,
    `and ${blocks.length - meticulai} from Patch and other authors. Details and licences: \`blocks/catalog.json\` and`,
    '`blocks/README.md`.',
    '',
    'For your own game, let the kit point you: `node tools/blocks/suggest.mjs` reads `my-game/GREAT.md` and lists the',
    'blocks whose "use when" matches it, with the words that matched. Add one with `node tools/blocks/add.mjs <id>`.',
    '',
    '"Works with the starter" means it runs with the starter\'s normal renderer. "Needs WebGPU" means switching the game to',
    'three.js\'s WebGPU renderer (a real job; see `blocks/README.md`, "Check the renderer").',
    '',
  ];
  const sortKey = (b) => `${isMeticulai(b) ? 0 : 1}${b.status === 'ready' ? 0 : 1}${b.name.toLowerCase()}`;
  for (const n of [...NEEDS, OTHER]) {
    const list = groups.get(n.id).sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
    if (!list.length) continue;
    lines.push(`## ${n.title}`, '');
    for (const b of list) lines.push(byNeedLine(b));
    lines.push('');
  }
  return lines.join('\n').replace(/\n+$/, '\n');
}

// ---------------------------------------------------------------- CREDITS.md

const CREDIT_START = '<!-- meticulai-blocks:start (written by tools/blocks/build-catalog.mjs from each block.json; edit those, not this) -->';
const CREDIT_END = '<!-- meticulai-blocks:end -->';

function creditsSection(list) {
  const lines = [CREDIT_START, '', '## Meticulai blocks (`blocks/vendor/meticulai-*`)', ''];
  lines.push('Systems taken from games on [meticulai.com](https://meticulai.com), rewritten as standalone code and shared');
  lines.push('under MIT. Each one names the game it came from; play the game to see the system at its best.', '');
  if (!list.length) lines.push('None yet.', '');
  for (const b of list) {
    lines.push(`### ${b.name} (\`${b.id}\`)`, '');
    const art = b.art_license ? `, art ${b.art_license}` : '';
    lines.push(`- **Meticulai**, from ${b.from_game || 'a Meticulai game'}${b.play_url ? ` (${b.play_url})` : ''}. Code ${b.license || 'MIT'}${art}.`);
    for (const t of Array.isArray(b.third_party) ? b.third_party : []) {
      if (typeof t === 'string' && t.trim()) { lines.push(`- ${t.trim()}`); continue; }
      if (!t || typeof t !== 'object') continue;
      lines.push(`- ${t.what || 'Part'}: ${t.author || 'unknown author'}, ${t.license || 'licence unknown'}.${t.url ? ` ${t.url}` : ''}`);
    }
    lines.push(`- Full list: \`${b.vendored || `blocks/vendor/${b.id}/`}\` (\`LICENSE\`, \`VENDOR.md\`).`, '');
  }
  lines.push(CREDIT_END);
  return lines.join('\n');
}

/** CREDITS.md with the Meticulai section replaced (or added before "Pictures in", else at the end). */
function withCredits(text, list) {
  const section = creditsSection(list);
  const a = text.indexOf(CREDIT_START.slice(0, 30));
  const b = text.indexOf(CREDIT_END);
  if (a >= 0 && b > a) return text.slice(0, a) + section + text.slice(b + CREDIT_END.length);
  const pics = text.indexOf('\n## Pictures in');
  if (pics >= 0) return `${text.slice(0, pics)}\n${section}\n${text.slice(pics)}`;
  return `${text.replace(/\n*$/, '\n\n')}${section}\n`;
}

// ---------------------------------------------------------------- main

await runTool(async () => {
  const { values: a } = getArgs({ check: { type: 'boolean' } }, HELP);
  const catFile = path.join(kitDir(), 'blocks', 'catalog.json');
  if (!fs.existsSync(catFile)) throw new HelperError('blocks/catalog.json is missing.', 'Restore it from git (git checkout blocks/catalog.json) and run this again.');
  const before = fs.readFileSync(catFile, 'utf8');
  let cat;
  try { cat = JSON.parse(before); } catch (e) {
    throw new HelperError(`blocks/catalog.json isn't valid JSON (${e.message}).`, 'Fix it (or restore it from git) and run this again.');
  }
  if (!Array.isArray(cat.blocks)) throw new HelperError('blocks/catalog.json has no "blocks" list.', 'Restore it from git and run this again.');

  // 1. read every block.json
  const vendorDir = path.join(kitDir(), 'blocks', 'vendor');
  const folders = fs.existsSync(vendorDir) ? fs.readdirSync(vendorDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : [];
  const fromFiles = new Map();
  let problemCount = 0;
  for (const f of folders) {
    const file = path.join(vendorDir, f, 'block.json');
    if (!fs.existsSync(file)) {
      if (/^meticulai-/.test(f)) { warn(`${f}: no block.json yet, so it isn't listed.`); problemCount++; }
      continue;
    }
    const { block, problems, fatal } = readBlockJson(file, f);
    for (const p of problems) { (fatal ? bad : warn)(`${rel(file)}: ${p}`); problemCount++; }
    if (block) {
      if (fromFiles.has(block.id)) { bad(`two block.json files use the id "${block.id}"; keeping the one in ${fromFiles.get(block.id).vendored}.`); problemCount++; continue; }
      fromFiles.set(block.id, block);
    }
  }

  // 2. merge: hand-written entries untouched and in place; Meticulai entries rebuilt from block.json, sorted by id
  const kept = [];
  const dropped = [];
  for (const b of cat.blocks) {
    if (isMeticulai(b)) { if (!fromFiles.has(b.id)) dropped.push(b.id); continue; }
    if (fromFiles.has(b.id)) { warn(`${b.id}: has a block.json but also a hand-written catalogue entry; keeping the hand-written one.`); fromFiles.delete(b.id); problemCount++; }
    kept.push(b);
  }
  for (const id of dropped) warn(`${id} was in the catalogue but has no block.json any more, so it was taken out.`);
  const nonMeticulaiFromFiles = [...fromFiles.values()].filter((b) => !isMeticulai(b));
  for (const b of nonMeticulaiFromFiles) kept.push(ordered(b));
  const meticulai = [...fromFiles.values()].filter(isMeticulai).sort((x, y) => x.id.localeCompare(y.id)).map(ordered);
  const next = { ...cat, blocks: [...kept, ...meticulai] };
  const after = JSON.stringify(next, null, 2) + '\n';

  // 3. BY-NEED.md
  const byNeedFile = path.join(kitDir(), 'blocks', 'BY-NEED.md');
  const byNeed = buildByNeed(next.blocks);
  const byNeedBefore = fs.existsSync(byNeedFile) ? fs.readFileSync(byNeedFile, 'utf8') : '';

  // 4. CREDITS.md: the Meticulai section
  const creditsFile = path.join(kitDir(), 'blocks', 'CREDITS.md');
  const creditsBefore = fs.existsSync(creditsFile) ? fs.readFileSync(creditsFile, 'utf8') : '# Credits for the blocks\n';
  const credits = withCredits(creditsBefore, meticulai);

  const catChanged = after !== before;
  const needChanged = byNeed !== byNeedBefore;
  const creditsChanged = credits !== creditsBefore;
  if (a.check) {
    say(`${meticulai.length} Meticulai block${meticulai.length === 1 ? '' : 's'} found, ${kept.length} other entries.`);
    say(`catalog.json ${catChanged ? 'would change' : 'is up to date'}; BY-NEED.md ${needChanged ? 'would change' : 'is up to date'}; CREDITS.md ${creditsChanged ? 'would change' : 'is up to date'}.`);
    return problemCount ? 1 : 0;
  }
  if (catChanged) fs.writeFileSync(catFile, after);
  if (needChanged) fs.writeFileSync(byNeedFile, byNeed);
  if (creditsChanged) fs.writeFileSync(creditsFile, credits);
  ok(`blocks/catalog.json: ${next.blocks.length} blocks (${meticulai.length} Meticulai, ${kept.length} others)${catChanged ? ', updated' : ', no change'}.`);
  ok(`blocks/BY-NEED.md${needChanged ? ' rewritten' : ': no change'}.`);
  ok(`blocks/CREDITS.md${creditsChanged ? ': Meticulai section rewritten' : ': no change'}.`);
  if (problemCount) say(`\n${problemCount} thing${problemCount === 1 ? '' : 's'} to fix above (the blocks with notes are still listed unless it says "Left out").`);
  return 0;
});
