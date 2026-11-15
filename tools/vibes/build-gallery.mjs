#!/usr/bin/env node
// For people working ON the kit: build the vibes catalogue and the two galleries from vibes/<id>/vibe.json.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, ok, runTool, say, warn } from '../lib/log.mjs';
import { pretty, writeJson } from '../lib/paths.mjs';
import { listVibes, vibesDir } from './lib.mjs';

const HELP = `
node tools/vibes/build-gallery.mjs

Kit maintenance. Reads every vibes/<id>/vibe.json and writes, into vibes/:
  catalog.json    every vibe in one file (for tools and agents)
  GALLERY.md      a gallery that shows on GitHub: per vibe its mood pictures next to the kit's own game drawn with it
  gallery.html    one page a person opens by double-click (no internet needed): cards, click one to see it large

Vibes whose status is not "ready" are left out. Pictures that are named in a vibe.json but missing are skipped
with a note. Make the in-kit pictures first with  node tools/vibes/render.mjs.
`;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const join = (x) => (Array.isArray(x) ? x.join(', ') : String(x || ''));
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');

const MOOD_CAPTION = 'Mood pictures, made by an AI image model. They show a feeling, not the game.';
const KIT_CAPTION = 'A real screenshot: the kit\'s own starter game with only this vibe\'s colours, light and drawing style put on. Same shapes, no new models or textures; your game\'s own assets take it the rest of the way.';

await runTool(async () => {
  const { values: a } = getArgs({ from: { type: 'string' } }, HELP);
  const dir = vibesDir(a.from);
  if (!fs.existsSync(dir)) throw new HelperError(`there is no vibes folder (${pretty(dir)}).`, 'Add vibes/<id>/vibe.json first.');
  const vibes = listVibes(dir);
  const drafts = listVibes(dir, { all: true }).length - vibes.length;
  if (!vibes.length) throw new HelperError(`there are no ready vibes in ${pretty(dir)}.`, 'Add vibes/<id>/vibe.json (with "status": "ready") first.');

  // only pictures that are really there
  const missing = [];
  const data = vibes.map((v) => {
    const has = (f) => {
      const good = typeof f === 'string' && f && !path.isAbsolute(f) && !f.includes('..') && fs.existsSync(path.join(v.dir, f));
      if (!good && f) missing.push(`${v.id}/${f}`);
      return good;
    };
    const frames = (Array.isArray(v.frames) ? v.frames : []).map((f) => (typeof f === 'string' ? f : f?.file)).filter(has).map((f) => `${v.id}/${f}`);
    const renders = (Array.isArray(v.renders) ? v.renders : []).filter((r) => has(r?.file)).map((r) => ({ file: `${v.id}/${r.file}`, starter: r.starter || '' }));
    return { v, frames, renders };
  });
  if (missing.length) warn(`${missing.length} picture${missing.length > 1 ? 's are' : ' is'} named in a vibe.json but missing, so left out: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '...' : ''}`);
  const noRender = data.filter((d) => !d.renders.length).map((d) => d.v.id);
  if (noRender.length) warn(`no in-kit picture yet for: ${noRender.join(', ')} (run  node tools/vibes/render.mjs).`);

  // 1. catalog.json
  writeJson(path.join(dir, 'catalog.json'), {
    about: 'Every ready vibe, merged from vibes/<id>/vibe.json by tools/vibes/build-gallery.mjs. Do not edit: change the vibe.json files and run the tool again.',
    count: vibes.length,
    vibes: vibes.map(({ dir: _d, ...v }) => v),
  });

  // 2. GALLERY.md
  const md = [
    '# Vibes',
    '',
    'A vibe is a ready-made direction for how your game looks and feels: colours, light, a drawing style and a mood.',
    'Any vibe works on any starter game. Pick one and tell your agent: **"use the ... vibe"**',
    '(or run `node tools/vibes/apply.mjs <id>`). To browse them on your own computer, run `node tools/vibes/open.mjs`.',
    '',
    `> **About the pictures.** Left: mood pictures made by an AI image model. They show a feeling to aim for, not the`,
    '> game, and the kit never judges a game on matching them. Right: a real screenshot of the kit\'s own starter game',
    '> with only the vibe\'s colours, light and drawing style put on: the same shapes, no new models or textures. It is',
    '> what you get the moment the vibe is put on; your game\'s own assets take it the rest of the way.',
    '',
    `${vibes.length} vibe${vibes.length > 1 ? 's' : ''}: ${data.map(({ v }) => `[${v.name || v.id}](#${String(v.name || v.id).toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-')})`).join(' · ')}`,
    '',
  ];
  for (const { v, frames, renders } of data) {
    md.push(`## ${v.name || v.id}`, '');
    md.push(`${v.one_line || ''}`, '');
    const facts = [];
    if (v.mood?.length) facts.push(`**Mood:** ${join(v.mood)}`);
    facts.push(`**Drawing style:** ${v.look?.id && v.look.id !== 'none' ? `\`${v.look.id}\`` : 'plain (colours and light only)'}`);
    if (v.good_for?.length) facts.push(`**Good for:** ${join(v.good_for)}`);
    md.push(facts.join(' · '), '');
    const left = frames.length ? frames.map((f) => `<img src="${esc(f)}" width="${frames.length > 1 ? 210 : 420}" alt="mood picture">`).join(' ') : '(none yet)';
    const right = renders.length ? renders.map((r) => `<img src="${esc(r.file)}" width="420" alt="the ${esc(r.starter)} starter with this vibe">`).join('<br>') : '(not drawn yet)';
    md.push('| Mood pictures (AI-made, a feeling to aim for) | The kit\'s own starter with only this vibe\'s colours, light and style (real) |', '|---|---|', `| ${cell(left)} | ${cell(right)} |`, '');
    md.push(`Tell your agent: **"use the ${v.name || v.id} vibe"** &nbsp; (\`node tools/vibes/apply.mjs ${v.id}\`)`, '');
  }
  fs.writeFileSync(path.join(dir, 'GALLERY.md'), md.join('\n'));

  // 3. gallery.html
  const cards = data.map(({ v, frames, renders }) => ({
    id: v.id,
    name: v.name || v.id,
    line: v.one_line || '',
    mood: Array.isArray(v.mood) ? v.mood : [],
    look: v.look?.id && v.look.id !== 'none' ? v.look.id : '',
    goodFor: Array.isArray(v.good_for) ? v.good_for : [],
    words: v.look_words || '',
    swatches: [...(v.palette?.colors?.base || []), ...(v.palette?.colors?.accent || []), v.palette?.colors?.shadow, v.palette?.colors?.light].filter((c) => /^#[0-9a-f]{3,6}$/i.test(String(c || ''))).slice(0, 8),
    frames,
    renders,
  }));
  fs.writeFileSync(path.join(dir, 'gallery.html'), page(cards));

  ok(`${vibes.length} vibe${vibes.length > 1 ? 's' : ''} in ${pretty(path.join(dir, 'catalog.json'))}, GALLERY.md and gallery.html${drafts ? ` (${drafts} not marked ready, left out)` : ''}.`);
  say(`  Open it with  node tools/vibes/open.mjs  (or double-click ${pretty(path.join(dir, 'gallery.html'))}).`);
  return 0;
});

function page(cards) {
  const json = JSON.stringify(cards).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vibes</title>
<style>
  :root { color-scheme: light dark; --bg: #f4f1ea; --card: #ffffff; --ink: #1f1d1a; --soft: #6b665e; --line: #ddd7cb; --accent: #b4532a; }
  @media (prefers-color-scheme: dark) { :root { --bg: #171614; --card: #22201d; --ink: #f1ede4; --soft: #a59f94; --line: #36322d; --accent: #f0a070; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  header { max-width: 1180px; margin: 0 auto; padding: 36px 20px 8px; }
  h1 { margin: 0 0 6px; font-size: 34px; letter-spacing: -0.01em; }
  header p { margin: 4px 0; color: var(--soft); max-width: 70ch; }
  .grid { max-width: 1180px; margin: 0 auto; padding: 18px 20px 60px; display: grid; gap: 18px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; cursor: pointer; text-align: left; padding: 0; color: inherit; font: inherit; display: flex; flex-direction: column; transition: transform 0.12s ease, box-shadow 0.12s ease; }
  .card:hover, .card:focus-visible { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18); outline: none; }
  .thumb { aspect-ratio: 16 / 9; background: var(--line) center / cover no-repeat; display: block; width: 100%; object-fit: cover; }
  .nothumb { aspect-ratio: 16 / 9; display: flex; }
  .nothumb span { flex: 1; }
  .card .body { padding: 12px 14px 14px; }
  .card h2 { margin: 0 0 2px; font-size: 20px; }
  .card p { margin: 0; color: var(--soft); font-size: 14.5px; }
  .tags { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
  .tag { font-size: 12.5px; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--line); color: var(--soft); }
  .swatches { display: flex; height: 8px; }
  .swatches span { flex: 1; }
  dialog { border: 0; padding: 0; background: var(--card); color: var(--ink); border-radius: 16px; width: min(1100px, 94vw); max-height: 92vh; overflow: auto; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5); }
  dialog::backdrop { background: rgba(0, 0, 0, 0.62); }
  .sheet { padding: 26px 28px 30px; }
  .close { position: sticky; top: 10px; float: right; margin: 10px 10px 0 0; width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--line); background: var(--card); color: var(--ink); font-size: 20px; cursor: pointer; z-index: 2; }
  .big { font-size: clamp(34px, 6vw, 60px); line-height: 1.05; margin: 0 0 6px; letter-spacing: -0.02em; }
  .line { font-size: 19px; color: var(--soft); margin: 0 0 14px; }
  .say { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 14px 0 20px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; }
  .say b { font-size: 18px; }
  .say code { font: inherit; font-weight: 700; color: var(--accent); }
  .copy { font: inherit; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--accent); background: transparent; color: var(--accent); cursor: pointer; }
  .copy:hover { background: var(--accent); color: var(--card); }
  .pics { display: grid; gap: 22px; grid-template-columns: 1fr 1fr; align-items: start; }
  @media (max-width: 760px) { .pics { grid-template-columns: 1fr; } }
  .pics h3 { margin: 0 0 2px; font-size: 15px; }
  .pics small { display: block; color: var(--soft); margin-bottom: 8px; }
  .pics img { width: 100%; border-radius: 10px; display: block; margin-bottom: 10px; cursor: zoom-in; background: var(--line); }
  .pics img.zoom { position: fixed; inset: 0; margin: auto; max-width: 96vw; max-height: 96vh; width: auto; height: auto; z-index: 5; cursor: zoom-out; box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.85); border-radius: 4px; }
  .words { color: var(--soft); max-width: 75ch; margin: 6px 0 0; }
  footer { max-width: 1180px; margin: 0 auto; padding: 0 20px 40px; color: var(--soft); font-size: 14px; }
</style>
</head>
<body>
<header>
  <h1>Vibes</h1>
  <p>A vibe is a ready-made direction for how your game looks and feels: colours, light, a drawing style and a mood. Any vibe works on any starter game.</p>
  <p>Click a card to see it large. When you like one, tell your agent: <b>"use the ... vibe"</b>.</p>
</header>
<main class="grid" id="grid"></main>
<footer>The mood pictures were made by an AI image model: they show a feeling to aim for, and your game is never judged on matching them. The pictures marked "the kit's own game" are real screenshots of a starter game with only the vibe's colours, light and drawing style on: the same shapes, no new models.</footer>
<dialog id="sheet"></dialog>
<script>
const VIBES = ${json};
const el = (tag, attrs, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v); }
  for (const k of kids) if (k) n.append(k);
  return n;
};
const grid = document.getElementById('grid');
const sheet = document.getElementById('sheet');
const swatches = (v) => { const s = el('div', { class: 'swatches' }); for (const c of v.swatches) { const b = el('span'); b.style.background = c; s.append(b); } return s; };

for (const v of VIBES) {
  const first = (v.renders[0] && v.renders[0].file) || v.frames[0];
  let thumb;
  if (first) thumb = el('img', { class: 'thumb', src: first, alt: '', loading: 'lazy' });
  else { thumb = el('div', { class: 'nothumb' }); for (const c of v.swatches) { const b = el('span'); b.style.background = c; thumb.append(b); } }
  const tags = el('div', { class: 'tags' });
  for (const m of v.mood.slice(0, 4)) tags.append(el('span', { class: 'tag', text: m }));
  const card = el('button', { class: 'card', type: 'button', 'aria-label': 'See the ' + v.name + ' vibe' }, thumb, swatches(v), el('div', { class: 'body' }, el('h2', { text: v.name }), el('p', { text: v.line }), tags));
  card.addEventListener('click', () => show(v));
  grid.append(card);
}

function copyText(text, button) {
  const done = () => { const old = button.textContent; button.textContent = 'Copied'; setTimeout(() => { button.textContent = old; }, 1400); };
  const fallback = () => {
    const t = el('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    sheet.append(t); t.select();
    try { document.execCommand('copy'); done(); } catch (e) { button.textContent = 'Select the text and copy it'; }
    t.remove();
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
}

function show(v) {
  sheet.textContent = '';
  const close = el('button', { class: 'close', type: 'button', 'aria-label': 'Close', text: '\\u00d7' });
  close.addEventListener('click', () => sheet.close());
  const phrase = 'use the ' + v.name + ' vibe';
  const copy = el('button', { class: 'copy', type: 'button', text: 'Copy' });
  copy.addEventListener('click', () => copyText(phrase, copy));
  const say = el('div', { class: 'say' }, el('b', { text: 'Tell your agent:' }), el('code', { text: phrase }), copy);
  const tags = el('div', { class: 'tags' });
  for (const m of v.mood) tags.append(el('span', { class: 'tag', text: m }));
  tags.append(el('span', { class: 'tag', text: v.look ? 'drawing style: ' + v.look : 'plain drawing style' }));
  for (const g of v.goodFor) tags.append(el('span', { class: 'tag', text: 'good for: ' + g }));

  const pics = el('div', { class: 'pics' });
  const column = (title, note, files) => {
    const c = el('div', null, el('h3', { text: title }), el('small', { text: note }));
    for (const f of files) {
      const img = el('img', { src: f, alt: title });
      img.addEventListener('click', () => img.classList.toggle('zoom'));
      c.append(img);
    }
    if (!files.length) c.append(el('small', { text: '(no picture yet)' }));
    return c;
  };
  pics.append(column('Mood pictures', ${JSON.stringify(MOOD_CAPTION)}, v.frames));
  pics.append(column("The kit's own game with this vibe", ${JSON.stringify(KIT_CAPTION)}, v.renders.map((r) => r.file)));

  sheet.append(close, el('div', { class: 'sheet' }, el('h2', { class: 'big', text: v.name }), el('p', { class: 'line', text: v.line }), tags, say, pics, v.words ? el('p', { class: 'words', text: v.words }) : null));
  sheet.showModal();
  sheet.scrollTop = 0;
}
sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
</script>
</body>
</html>
`;
}
