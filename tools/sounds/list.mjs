#!/usr/bin/env node
// Print the kit's starter sounds: what there is, by group or by a few words.
import { getArgs } from '../lib/args.mjs';
import { HelperError, bytes, runTool, say } from '../lib/log.mjs';
import { loadCatalog, searchSounds } from './lib/pack.mjs';

const HELP = `
node tools/sounds/list.mjs [--group ui] [--for "soft footstep on grass"] [--json]

Lists the sounds that come with the kit (free to use in any game, no credit needed).
  --group <name>   only one group: ui, pickup, move, impact, weapon, vehicle, feedback, creature, magic, ambience, music
  --for "<words>"  the best matches for a few words
  --json           the full details, for agents

Add some to your game with:  node tools/sounds/add.mjs <id> [<id> ...]
No agent can hear them. Listen yourself:  node tools/sounds/audition.mjs
`;

await runTool(async () => {
  const { values: a } = getArgs({ group: { type: 'string' }, for: { type: 'string' }, json: { type: 'boolean' } }, HELP);
  const catalog = loadCatalog();
  let sounds = catalog.sounds;
  const groups = [...new Set(sounds.map((s) => s.group))];
  if (a.group) {
    if (!groups.includes(a.group)) throw new HelperError(`there is no group called "${a.group}".`, `The groups are: ${groups.join(', ')}.`);
    sounds = sounds.filter((s) => s.group === a.group);
  }
  if (a.for) sounds = searchSounds(sounds, a.for).slice(0, 12);
  if (a.json) { console.log(JSON.stringify(sounds, null, 2)); return 0; }
  if (!sounds.length) {
    say(`Nothing in the pack matches "${a.for}".`);
    say('Make one in code:  node tools/sounds/synth.mjs --list  shows the recipes you can start from. More free packs: sounds/README.md.');
    return 0;
  }
  const line = (s) => {
    const takes = s.files.length > 1 ? `${s.files.length} takes` : '1 file';
    const kind = s.loop ? `loop ${s.seconds}s` : `${s.seconds}s`;
    const from = s.source === 'meticulai' ? `from ${s.from_game}` : 'made in code';
    return `  ${s.id.padEnd(26)} ${kind.padEnd(10)} ${takes.padEnd(8)} ${from.padEnd(18)} ${(s.feel || []).slice(0, 5).join(', ')}`;
  };
  if (a.for) {
    say(`Best matches for "${a.for}":`);
    for (const s of sounds) say(line(s));
  } else {
    for (const g of groups) {
      const list = sounds.filter((s) => s.group === g);
      if (!list.length) continue;
      say(`${g}`);
      for (const s of list) say(line(s));
    }
  }
  const size = sounds.reduce((n, s) => n + (s.bytes || 0), 0);
  say(`\n${sounds.length} sound${sounds.length === 1 ? '' : 's'}, ${bytes(size)}. All free to use, no credit needed (CC0).`);
  say('Add to your game:  node tools/sounds/add.mjs <id> [<id> ...]     Hear them:  node tools/sounds/audition.mjs');
  return 0;
});
