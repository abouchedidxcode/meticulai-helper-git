#!/usr/bin/env node
// Print the starters: ready-to-play starting games, one per kind of game.
import { getArgs } from '../lib/args.mjs';
import { runTool, say } from '../lib/log.mjs';
import { listStarters } from './lib.mjs';

const HELP = `
node tools/starters/list.mjs [--json] [--for "<what the player does>"]

Lists the starting games. Each one already plays, feels right for its kind of game and has
sound, a title screen, an end card and a test bot. Start a game from one with:
  node tools/init.mjs --name "My Game" --starter <id>

  --for "..."   rank them for a game described in a few words ("ride a horse and shoot arrows")
  --json        the full details, for agents
`;

const words = (s) => String(s || '').toLowerCase().match(/[a-z0-9]+/g) || [];

export function rank(starters, text) {
  const want = new Set(words(text));
  return starters
    .map((s) => {
      const strong = new Set([...(s.tags || []), ...(s.you || []), s.id].flatMap(words));
      const soft = new Set(words(`${s.use_when} ${s.pitch} ${s.camera}`));
      const against = new Set(words(s.not_for));
      let score = 0;
      const why = [];
      for (const w of want) {
        if (w.length < 3) continue;
        if (strong.has(w)) { score += 3; why.push(w); } else if (soft.has(w)) { score += 1; why.push(w); }
        if (against.has(w)) score -= 2;
      }
      return { ...s, score, why: [...new Set(why)] };
    })
    .sort((a, b) => b.score - a.score || (a.order ?? 50) - (b.order ?? 50));
}

await runTool(async () => {
  const { values: a } = getArgs({ json: { type: 'boolean' }, for: { type: 'string' } }, HELP);
  let list = listStarters().filter((s) => s.status !== 'draft');
  if (a.for) list = rank(list, a.for);
  if (a.json) { console.log(JSON.stringify(list.map(({ dir, ...s }) => s), null, 1)); return 0; }
  if (!list.length) { say('There are no starters in this copy of the kit (the starters/ folder is missing).'); return 1; }
  say(`${list.length} starting games. Start from one with:  node tools/init.mjs --name "My Game" --starter <id>\n`);
  for (const s of list) {
    say(`${s.id}${a.for && s.score > 0 ? `   (matches: ${s.why.join(', ')})` : ''}`);
    say(`  ${s.name}: ${s.pitch}`);
    say(`  You: ${(s.you || []).join(', ')}.  Camera: ${s.camera}.  Controls: ${s.controls}`);
    say(`  Pick it for: ${s.use_when}`);
    if (s.blocks?.length) say(`  Built on: ${s.blocks.join(', ')}`);
    say('');
  }
  if (a.for && !(list[0]?.score > 0)) say('Nothing matched those words strongly: "island" is the general 3D starting point.');
  return 0;
});
