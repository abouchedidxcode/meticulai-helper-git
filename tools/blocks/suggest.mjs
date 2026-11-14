#!/usr/bin/env node
// Read the game's design (my-game/GREAT.md, plus ASSETS.md) and point at the blocks and code libraries that may fit,
// with the words that matched. A pointer for the agent's judgement, not a decision: nothing is added.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, runTool, say } from '../lib/log.mjs';
import { gameDir, pretty } from '../lib/paths.mjs';
import { kitDir, loadBlocks, loadLibraries } from '../assets/lib/catalogs.mjs';
import { stem } from '../assets/lib/common.mjs';
import { tokens } from './lib/words.mjs';

const HELP = `
node tools/blocks/suggest.mjs [--from my-game/GREAT.md] [--text "..."] [--limit 8] [--json]

Reads your game's design (my-game/GREAT.md, and my-game/ASSETS.md if it exists) and lists the ready-made blocks and
code libraries that may fit it, best first, with the words that matched. Nothing is added to the game: it only
points. Read a block's HOW-TO-USE.md and look at its picture before deciding.

  --from <file>   the design to read (default my-game/GREAT.md)
  --text "..."    describe the game in words instead (or as well), e.g. --text "ride a horse and shoot arrows"
  --limit <n>     how many to list in total (default 8)
  --json          print the ranking as JSON
`;

// How much each part of GREAT.md counts. "What we will NOT build" counts for nothing.
const SECTION_WEIGHTS = [
  [/not build|out of scope|don.?t want|rejected/i, 0],
  [/best games|genre|get right/i, 0.3],
  [/gap|risk/i, 0.6],
  [/fantasy|loop|moment|feel|verb|control/i, 1],
  [/look|style|sound|music/i, 0.9],
];
// How much a match counts, by which field of the block it was found in.
const FIELD_WEIGHTS = { use_when: 3, tags: 3, name: 2.5, good_for: 2, kind: 1.5, what: 1.5, category: 1.5, id: 1 };
const RENDER = { webgl2: [1, 'works with the starter'], '2d': [1, '2D canvas'], none: [1, 'no renderer needed'], both: [0.9, 'needs the WebGPU renderer (falls back to WebGL 2)'], webgpu: [0.75, 'needs WebGPU: a real change to the game'] };

/** Markdown -> [{ text, weight }], one per section, without HTML comments and template placeholders. */
function designParts(text, baseWeight = 1) {
  const clean = String(text).replace(/<!--[\s\S]*?-->/g, ' ').replace(/\{\{[^}]*\}\}/g, ' ').replace(/^\s*(\d+\.|-)\s*(\*\*\.\.\.\*\*|\.\.\.|"\.\.\.")[^\n]*$/gm, ' ');
  const parts = [];
  let weight = baseWeight, buf = [];
  const flush = () => { if (buf.length) parts.push({ text: buf.join('\n'), weight }); buf = []; };
  for (const line of clean.split('\n')) {
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const rule = SECTION_WEIGHTS.find(([re]) => re.test(h[1]));
      weight = baseWeight * (rule ? rule[1] : 0.8);
      if (/^#\s/.test(line)) { weight = baseWeight * 0.5; buf.push(h[1].replace(/^what great is, for\s*/i, '')); } // the game's name
      continue;
    }
    buf.push(line.replace(/^\s*[-*]?\s*\*\*[^*:]{1,30}:\*\*/, ' ')); // template labels like "**Camera:**"
  }
  flush();
  return parts.filter((p) => p.weight > 0);
}

/** Design parts -> Map key -> { weight, words:Set } where key is a stem or "@concept". */
function designKeys(parts) {
  const keys = new Map();
  const add = (k, w, word) => {
    const e = keys.get(k) || { weight: 0, count: 0, words: new Set() };
    e.count++;
    e.weight = Math.max(e.weight, w);
    e.words.add(word);
    keys.set(k, e);
  };
  for (const p of parts) {
    for (const t of tokens(p.text)) {
      add(t.stem, p.weight, t.word);
      for (const c of t.concepts) add(`@${c}`, p.weight * 0.85, t.word);
    }
  }
  // repeated words count a bit more, but not much
  for (const e of keys.values()) e.weight *= 1 + Math.min(0.6, Math.log2(e.count) * 0.2);
  return keys;
}

/** One catalogue item (block or library) -> its fields as Map field -> Map key -> word. */
function itemFields(it) {
  const f = {
    use_when: it.use_when, tags: (it.tags || []).join(' . '), name: it.name, good_for: it.good_for,
    kind: it.kind, what: it.what, category: it.category, id: it.id,
  };
  const out = {};
  for (const [name, text] of Object.entries(f)) {
    if (!text) continue;
    const m = new Map();
    for (const t of tokens(text)) {
      if (!m.has(t.stem)) m.set(t.stem, t.word);
      for (const c of t.concepts) if (!m.has(`@${c}`)) m.set(`@${c}`, t.word);
    }
    out[name] = m;
  }
  // "not for" only counts against concepts the block doesn't also claim ("not for horses bigger than..." is still about horses)
  const not = new Set();
  for (const t of tokens(it.not_for || '')) for (const c of t.concepts) if (!Object.values(out).some((m) => m.has(`@${c}`))) not.add(`@${c}`);
  return { fields: out, not };
}

function rank(items, dkeys) {
  // how rare each key is across the catalogue: a word every block has means little
  const prepared = items.map((it) => ({ it, ...itemFields(it) }));
  const df = new Map();
  for (const p of prepared) {
    const all = new Set(Object.values(p.fields).flatMap((m) => [...m.keys()]));
    for (const k of all) df.set(k, (df.get(k) || 0) + 1);
  }
  const N = prepared.length;
  const idf = (k) => Math.log(1 + N / (df.get(k) || 1));

  const out = [];
  for (const p of prepared) {
    let score = 0, strong = 0;
    const why = new Map(); // design word(s) -> { blockWord, fields:Set }
    const conceptsHit = new Set();
    const stemsHit = new Set();
    for (const [k, d] of dkeys) {
      let best = 0, bestField = null;
      for (const [fname, m] of Object.entries(p.fields)) {
        if (m.has(k) && FIELD_WEIGHTS[fname] > best) { best = FIELD_WEIGHTS[fname]; bestField = fname; }
      }
      if (!best) continue;
      const isConcept = k.startsWith('@');
      // a word matched exactly and through its concept: count the concept once
      // a synonym match adds less (and isn't listed) when the design's own word already matched
      let echo = false;
      if (isConcept) {
        if (conceptsHit.has(k)) continue;
        conceptsHit.add(k);
        echo = [...d.words].some((w) => stemsHit.has(stem(w)));
      } else stemsHit.add(k);
      // a lone word in a long description is weak evidence; concepts and the short fields are strong
      const loose = !isConcept && ['what', 'good_for'].includes(bestField) ? 0.5 : 1;
      const add = d.weight * best * idf(k) * (isConcept ? (echo ? 0.6 : 0.8) : 1) * loose;
      score += add;
      if (['use_when', 'tags', 'name'].includes(bestField)) strong += add;
      if (echo) continue;
      const blockWord = p.fields[bestField].get(k);
      const dw = [...d.words].slice(0, 2).join('/');
      const label = isConcept && !d.words.has(blockWord) ? `${dw} ~ ${blockWord}` : (d.words.has(blockWord) ? blockWord : dw);
      const e = why.get(label) || { fields: new Set(), w: 0 };
      e.fields.add(bestField.replace('_', ' '));
      e.w += d.weight * best * idf(k) * loose;
      why.set(label, e);
    }
    if (!score) continue;
    let penalty = 0;
    for (const k of p.not) if (dkeys.has(k)) penalty += dkeys.get(k).weight * 1.5 * idf(k);
    // a block with lots of text matches lots of words: soften that
    const size = Object.values(p.fields).reduce((n, m) => n + m.size, 0);
    let s = (score - penalty) / (1 + Math.sqrt(size) / 12);
    const it = p.it;
    const notes = [];
    if (it._type === 'block') {
      if (it.status !== 'ready') { s *= 0.8; notes.push('pointed to: downloaded from its author'); }
      else notes.push('ready in the kit');
      if (it.tuned_by_play) { s *= 1.15; notes.push('tuned by playing'); }
      const r = RENDER[it.renderer] || [0.9, it.renderer || 'renderer unknown'];
      s *= r[0];
      notes.push(r[1]);
    } else {
      s *= 0.7;
      notes.push(`code library${it.npm ? ` (npm ${it.npm})` : ''}`);
    }
    if (penalty > 0) notes.push('its "not for" list mentions something in your design');
    const whyList = [...why.entries()].sort((a, b) => b[1].w - a[1].w).slice(0, 5).map(([w, e]) => ({ word: w, where: [...e.fields] }));
    out.push({ item: it, score: s, strong: s * (strong / score), why: whyList, notes, distinct: why.size });
  }
  return out.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
}

function addLine(it) {
  if (it._type === 'library') return it.npm ? `npm install ${it.npm}   (in my-game/; docs: ${it.agent_docs || it.repo || 'its README'})` : `see ${it.repo || it.agent_docs || 'its page'}`;
  return it.how_to_add || `node tools/blocks/add.mjs ${it.id}`;
}

await runTool(async () => {
  const { values: a } = getArgs({ from: { type: 'string' }, text: { type: 'string' }, limit: { type: 'number', default: 8 }, json: { type: 'boolean' } }, HELP);
  const limit = Math.max(1, Math.min(40, Math.round(a.limit)));
  const parts = [];
  const read = [];
  let fromFile = a.from ? path.resolve(process.cwd(), a.from) : null;
  if (!fromFile && !a.text) fromFile = path.join(gameDir(a.dir), 'GREAT.md');
  if (fromFile) {
    if (!fs.existsSync(fromFile)) {
      if (a.text) fromFile = null;
      else throw new HelperError(`I can't find ${pretty(fromFile)}.`, 'Write the design first (the new-game interview makes GREAT.md), or describe the game:  node tools/blocks/suggest.mjs --text "ride a horse and shoot arrows"');
    }
  }
  if (fromFile) {
    parts.push(...designParts(fs.readFileSync(fromFile, 'utf8')));
    read.push(pretty(fromFile));
    const assets = path.join(path.dirname(fromFile), 'ASSETS.md');
    if (fs.existsSync(assets)) {
      // only the plan, not the rejected list
      const plan = fs.readFileSync(assets, 'utf8').split(/^##\s+Rejected/im)[0];
      parts.push(...designParts(plan, 0.6));
      read.push(pretty(assets));
    }
  }
  if (a.text) { parts.push({ text: a.text, weight: 1 }); read.push('your words'); }
  const dkeys = designKeys(parts);
  if (!dkeys.size) throw new HelperError('the design has no words I can match yet (GREAT.md may still be the empty template).', 'Finish the interview first, or use --text "what the game is about".');

  const blocks = (loadBlocks() || []).map((b) => ({ ...b, _type: 'block' }));
  const libs = (loadLibraries() || []).map((l) => ({ ...l, _type: 'library' }));
  if (!blocks.length && !libs.length) throw new HelperError("the kit's catalogues aren't there (blocks/catalog.json, sources/libraries.json).", 'Download the kit again, or ask your agent to check the blocks/ folder.');
  const ranked = rank([...blocks, ...libs], dkeys).filter((r) => r.score > 0);

  const top = ranked[0]?.score || 0;
  const MIN = 2.5;
  const shown = ranked.filter((r) => r.score >= Math.max(MIN, top * 0.12)).slice(0, limit);
  // "probably useful": a good share of the match is in what the block is FOR (use when, tags, name), not its description
  // (the top three qualify on that alone; below them they must also come close to the best match)
  const probable = (r) => r.distinct >= 2 && r.strong >= MIN * 2 && (shown.indexOf(r) < 3 || (r.score >= top * 0.35 && r.strong >= top * 0.25));

  if (a.json) {
    console.log(JSON.stringify({ read, results: shown.map((r) => ({
      id: r.item.id, type: r.item._type, name: r.item.name, score: +r.score.toFixed(2), probably_useful: probable(r),
      why: r.why, notes: r.notes, from_game: r.item.from_game || null, play_url: r.item.play_url || null,
      renderer: r.item.renderer || null, add: addLine(r.item), docs: r.item.agent_docs || null, preview: r.item.preview || null,
    })) }, null, 1));
    return 0;
  }

  say(`Read ${read.join(' and ')}. These blocks and libraries may fit. It's a pointer, not a decision:`);
  say('read each one\'s HOW-TO-USE.md and look at its picture before choosing. Nothing has been added.\n');
  if (!shown.length) {
    say('Nothing in the catalogue matches this design well. That is a fine answer: build it in code, or search assets');
    say('with  node tools/assets/find.mjs "<what you need>". Every block by need: blocks/BY-NEED.md');
    return 0;
  }
  const groups = [['Probably useful:', shown.filter(probable)], ['Worth a look:', shown.filter((r) => !probable(r))]];
  let n = 0;
  for (const [title, list] of groups) {
    if (!list.length) continue;
    say(title);
    for (const r of list) {
      const it = r.item;
      n++;
      const tag = it._type === 'library' ? 'library' : (it.kind || 'block');
      say(`${String(n).padStart(2)}. ${it.id}: ${it.name} (${tag})`);
      say(`    ${String(it.use_when || it.what || '').replace(/\s+/g, ' ').slice(0, 160)}${String(it.use_when || it.what || '').length > 160 ? '...' : ''}`);
      say(`    Why: ${r.why.map((w) => `"${w.word}" (${w.where.join(', ')})`).join('; ')}`);
      const from = it.from_game ? `From ${it.from_game}${it.play_url ? ` (${it.play_url})` : ''}. ` : '';
      const notes = r.notes.join('; ');
      say(`    ${from}${notes[0].toUpperCase()}${notes.slice(1)}.`);
      if (it._type === 'block') say(`    Read: ${it.agent_docs || 'its README'}${it.preview && fs.existsSync(path.join(kitDir(), it.preview)) ? `   Picture: ${it.preview}` : ''}`);
      say(`    Add: ${addLine(it)}`);
    }
    say('');
  }
  say('Every block by need: blocks/BY-NEED.md. Note the promising ones in my-game/ASSETS.md; add a block only when the');
  say('game needs it (a block that IS the core mechanic comes in with the first playable).');
  return 0;
});
