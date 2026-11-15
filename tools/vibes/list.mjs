#!/usr/bin/env node
// Print the vibes: ready-made directions for how a game looks and feels (palette, light, drawing style, mood).
import { getArgs } from '../lib/args.mjs';
import { nextStep, runTool, say } from '../lib/log.mjs';
import { pretty } from '../lib/paths.mjs';
import { listVibes, rankVibes, vibesDir } from './lib.mjs';

const HELP = `
node tools/vibes/list.mjs [--for "<a few words>"] [--json]

Lists the vibes. A vibe is a ready-made direction for how your game looks and feels: a set of colours, the light
(time of day, fog), a drawing style if it has one, and words for the mood, the music and the sounds. Any vibe works
on any starter game. Put one on with:
  node tools/vibes/apply.mjs <id>
To see them as pictures:  node tools/vibes/open.mjs

  --for "..."   put the best matches for these words first ("cosy night fishing")
  --json        the full details, for agents
`;

const join = (x) => (Array.isArray(x) ? x.join(', ') : String(x || ''));

await runTool(async () => {
  const { values: a } = getArgs({ for: { type: 'string' }, json: { type: 'boolean' }, from: { type: 'string' } }, HELP);
  const dir = vibesDir(a.from);
  let vibes = listVibes(dir);
  if (a.for) vibes = rankVibes(vibes, a.for);
  if (a.json) {
    console.log(JSON.stringify(vibes.map(({ dir: _d, ...v }) => v), null, 1));
    return 0;
  }
  if (!vibes.length) {
    say(`There are no vibes in ${pretty(dir)} yet.`);
    nextStep('update the kit (download it again). Until then the game uses the colours in my-game/palette.json, which you can change by hand.');
    return 1;
  }
  say(`${vibes.length} vibe${vibes.length > 1 ? 's' : ''}${a.for ? `, best match for "${a.for}" first` : ''}. Put one on with  node tools/vibes/apply.mjs <id>\n`);
  for (const v of vibes) {
    say(`${v.id}${a.for && v.score > 0 ? `   (matches: ${v.why.join(', ')})` : ''}`);
    say(`  ${v.name || v.id}: ${v.one_line || ''}`);
    if (v.mood?.length) say(`  Mood: ${join(v.mood)}`);
    say(`  Drawing style: ${v.look?.id && v.look.id !== 'none' ? v.look.id : 'plain (colours and light only)'}`);
    if (v.good_for?.length) say(`  Good for: ${join(v.good_for)}`);
    say('');
  }
  say('To see them as pictures:  node tools/vibes/open.mjs');
  return 0;
});
