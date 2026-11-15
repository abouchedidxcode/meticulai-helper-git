#!/usr/bin/env node
// Put a vibe on the game: its colours and light (palette.json), its drawing style (the look), and its words (GREAT.md).
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, nextStep, ok, runTool, say } from '../lib/log.mjs';
import { gameDir, pretty, readHelper, writeHelper } from '../lib/paths.mjs';
import { listUpgrades } from '../looks/lib.mjs';
import { loadVibe, putVibe, vibesDir } from './lib.mjs';

const HELP = `
node tools/vibes/apply.mjs <id>

Puts a vibe on your game (see them with  node tools/vibes/list.mjs  or  node tools/vibes/open.mjs):
  - its colours and light go into my-game/palette.json (the old one is kept in my-game/.helper/)
  - its drawing style, if it has one, goes into my-game/src/look/index.js (as  node tools/looks/apply.mjs  does)
  - its description goes into my-game/GREAT.md under "The look, in words", if you have not written your own there
  - the choice is noted in helper.json and DECISIONS.md
The game's own code is not touched, and you can put on another vibe at any time.

A vibe's pictures are MOOD pictures. They show a feeling to aim for; the game is never judged on matching them.

  --dir <path>   the game folder (default my-game/)
`;

const START = '<!-- vibe:start (written by tools/vibes/apply.mjs; applying another vibe replaces this block) -->';
const END = '<!-- vibe:end -->';

/** Write look_words under "The look, in words" if that section is still empty (or holds an earlier vibe's block). */
function writeLookWords(dir, vibe) {
  const file = path.join(dir, 'GREAT.md');
  const text = String(vibe.look_words || '').trim();
  if (!text) return { state: 'no-words' };
  if (!fs.existsSync(file)) return { state: 'no-file', text };
  const md = fs.readFileSync(file, 'utf8');
  const head = /^## The look, in words[^\n]*\n/m.exec(md);
  if (!head) return { state: 'no-section', text };
  const from = head.index + head[0].length;
  const rest = md.slice(from);
  const next = /^## /m.exec(rest);
  const body = next ? rest.slice(0, next.index) : rest;
  const tail = next ? rest.slice(next.index) : '';
  const block = `${START}\n**Vibe: ${vibe.name || vibe.id}.** ${text}\n${END}`;
  const marked = body.indexOf(START) !== -1 && body.indexOf(END) > body.indexOf(START);
  const withoutBlock = marked ? body.slice(0, body.indexOf(START)) + body.slice(body.indexOf(END) + END.length) : body;
  const own = withoutBlock.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (own) return { state: 'kept', text }; // the user (or their agent) wrote their own words: leave them
  const newBody = `${withoutBlock.replace(/\s+$/, '')}\n\n${block}\n\n`.replace(/^\n+/, '\n');
  fs.writeFileSync(file, md.slice(0, from) + newBody + tail);
  return { state: marked ? 'replaced' : 'written', text };
}

/** Add the decision to DECISIONS.md (filling the empty first entry of the template if it is still there). */
function noteDecision(dir, vibe, look, before) {
  const file = path.join(dir, 'DECISIONS.md');
  if (!fs.existsSync(file)) return false;
  let md = fs.readFileSync(file, 'utf8');
  const visible = md.replace(/<!--[\s\S]*?-->/g, '');
  const nums = [...visible.matchAll(/^## (\d+)\.[ \t]*(\S.*)$/gm)].map((m) => Number(m[1]));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  const entry = [
    `## ${n}. The look: the "${vibe.name || vibe.id}" vibe`,
    '',
    `- **Decision:** the game uses the "${vibe.name || vibe.id}" vibe (\`${vibe.id}\`): its colours and light in palette.json${look.id !== 'none' ? `, and the "${look.name}" drawing style` : ', with the plain drawing style'}.`,
    `- **Why:** ${vibe.one_line || 'chosen from the vibes gallery.'} Its pictures are mood pictures, not targets.`,
    `- **What it replaced:** ${before ? `the "${before}" vibe` : 'the starter\'s own colours'}.`,
    '',
  ].join('\n');
  const placeholder = /^## 1\. <!-- short title -->\n\n- \*\*Decision:\*\* <!--[^\n]*-->\n- \*\*Why:\*\* <!--[^\n]*-->\n- \*\*What it replaced:\*\* <!--[^\n]*-->\n/m;
  if (n === 1 && placeholder.test(md)) md = md.replace(placeholder, entry);
  else md = `${md.replace(/\s+$/, '')}\n\n${entry}`;
  fs.writeFileSync(file, md);
  return n;
}

await runTool(async () => {
  const { values: a, positionals } = getArgs({ from: { type: 'string' } }, HELP);
  const id = positionals.join(' ');
  if (!id) throw new HelperError("you didn't say which vibe.", 'See them with  node tools/vibes/list.mjs  (or as pictures:  node tools/vibes/open.mjs), then  node tools/vibes/apply.mjs <id>.');
  const dir = gameDir(a.dir);
  const helper = readHelper(dir);
  const vibe = loadVibe(id, vibesDir(a.from));
  const before = helper.vibe && helper.vibe !== vibe.id ? helper.vibe : null;

  const r = await putVibe(dir, vibe);
  const words = writeLookWords(dir, vibe);
  writeHelper(dir, { vibe: vibe.id });
  const decision = helper.vibe === vibe.id ? null : noteDecision(dir, vibe, r.look, before);

  say(`Your game now has the "${vibe.name || vibe.id}" vibe. ${vibe.one_line || ''}\n`);
  say('What changed:');
  if (r.paletteChanged) ok(`Colours and light: palette.json now holds the "${vibe.palette.name || vibe.name}" colours${r.paletteBackup ? ` (your old ones are kept in ${pretty(r.paletteBackup)})` : ''}.`);
  else ok('Colours and light: palette.json already had this vibe\'s colours.');
  if (r.look.id === 'none') ok(`Drawing style: plain${r.lookMissing ? ` (the vibe wanted "${r.lookMissing}", which this kit does not have)` : ' (this vibe is colours and light only)'}.`);
  else ok(`Drawing style: ${r.look.name} (${r.look.one_line})${r.lookResult.changed.length ? '' : ' was already on'}.`);
  for (const c of r.lookResult.changed.filter((c) => /kept your edited|added the block/.test(c))) say(`        ${c}`);
  if (words.state === 'written' || words.state === 'replaced') ok('Words: GREAT.md, "The look, in words", now describes this vibe (in a marked block; edit it freely).');
  else if (words.state === 'kept') {
    ok('Words: GREAT.md already has your own "The look, in words", so I left it alone. The vibe\'s words, to use if you like:');
    say(`\n        ${words.text}\n`);
  } else if (words.text) {
    ok('Words: I found no "The look, in words" section in GREAT.md to fill. The vibe\'s words:');
    say(`\n        ${words.text}\n`);
  }
  if (decision) ok(`Noted as decision ${decision} in DECISIONS.md, and in helper.json.`);

  const ups = Array.isArray(vibe.upgrade) ? vibe.upgrade : [];
  const known = listUpgrades();
  if (ups.length) {
    say('\nLater, if this vibe becomes the heart of the game (these need the game built for them, so they are a real job):');
    for (const u of ups) say(`  ${u.block}: ${u.why || known.find((k) => k.block === u.block)?.gives || ''}`);
  }
  const hints = [];
  if (vibe.blocks?.length) hints.push(`blocks that fit: ${vibe.blocks.join(', ')}`);
  if (vibe.asset_search?.length) hints.push(`words for finding assets: ${vibe.asset_search.join(', ')}`);
  if (vibe.music?.mood) hints.push(`music: ${vibe.music.mood}`);
  if (vibe.sound_feel) hints.push(`sounds: ${vibe.sound_feel}`);
  if (hints.length) { say('\nFor your agent, when it picks assets and sounds:'); for (const h of hints) say(`  ${h}`); }

  say('\nThe vibe\'s pictures are mood pictures: a feeling to aim for. The game is not meant to match them, and nothing in the kit scores it on that.');
  nextStep('run  node tools/serve.mjs --check  and play. Not right? Put on another vibe, or change single colours in my-game/palette.json.');
  return 0;
});
