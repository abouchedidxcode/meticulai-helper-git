#!/usr/bin/env node
// Copy sounds from the kit's pack into the game: the files, a credit row, and the list the game loads.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, bytes, ok, runTool, say } from '../lib/log.mjs';
import { gameDir, pretty, readHelper } from '../lib/paths.mjs';
import { PACK_DIR, gameAudioDir, gameManifest, loadCatalog, recordInGame, searchSounds } from './lib/pack.mjs';

const HELP = `
node tools/sounds/add.mjs <id> [<id> ...] [--group ui] [--dir <game folder>]

Copies sounds from the kit's pack into your game:
  the files          my-game/public/assets/audio/<group>/
  the list           my-game/src/audio/sounds.json   (the game loads this)
  the credit         a row in my-game/CREDITS.md

  --group <name>   add every sound of a group (ui, pickup, move, impact, weapon, vehicle, feedback, creature,
                   magic, ambience, music)
  --dir <path>     the game folder (default: my-game/)

See what there is:  node tools/sounds/list.mjs      Then, in the game:  audio.play("ui-click")
How to wire them in: recipes/sound-files.md
`;

await runTool(async () => {
  const { values: a, positionals: ids } = getArgs({ group: { type: 'string' } }, HELP);
  const dir = gameDir(a.dir);
  readHelper(dir);
  const catalog = loadCatalog();
  const byId = new Map(catalog.sounds.map((s) => [s.id, s]));
  const chosen = [];
  if (a.group) {
    const list = catalog.sounds.filter((s) => s.group === a.group);
    if (!list.length) throw new HelperError(`there is no group called "${a.group}".`, `The groups are: ${[...new Set(catalog.sounds.map((s) => s.group))].join(', ')}.`);
    chosen.push(...list);
  }
  for (const id of ids) {
    const s = byId.get(id);
    if (!s) {
      const near = searchSounds(catalog.sounds, id.replace(/-/g, ' ')).slice(0, 4).map((x) => x.id);
      throw new HelperError(`there is no sound called "${id}" in the pack.`, near.length ? `Did you mean: ${near.join(', ')}? The full list: node tools/sounds/list.mjs` : 'See the full list with  node tools/sounds/list.mjs');
    }
    if (!chosen.includes(s)) chosen.push(s);
  }
  if (!chosen.length) throw new HelperError('I need to know which sounds to add.', 'Give one or more ids, for example  node tools/sounds/add.mjs ui-click pickup-coin  (list them with  node tools/sounds/list.mjs ).');

  let size = 0, files = 0;
  for (const s of chosen) {
    const rel = [];
    for (const f of s.files) {
      const from = path.join(PACK_DIR, f);
      if (!fs.existsSync(from)) throw new HelperError(`the pack file ${f} is missing.`, 'Run  node tools/sounds/synth.mjs  to make the kit\'s own sounds again.');
      const to = path.join(gameAudioDir(dir), f);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      size += fs.statSync(to).size; files++;
      rel.push(`assets/audio/${f}`);
    }
    const own = s.source === 'synth';
    recordInGame(dir, {
      id: s.id, group: s.group, files: rel, gain: s.gain, loop: s.loop, seconds: s.seconds, licence: s.licence, source: s.source,
      credit: own
        ? { title: `Sound "${s.id}"`, author: 'Meticulai Helper Git starter sounds (made in code)', note: 'no credit needed' }
        : { title: `Sound "${s.id}"`, author: `Meticulai, from the game ${s.from_game}`, note: `no credit needed; made from: ${(s.made_from || []).join('; ')}` },
    });
    say(`  ${s.id.padEnd(26)} ${s.files.length} file${s.files.length === 1 ? ' ' : 's'}  ${s.loop ? 'loop' : 'one-shot'}`);
  }
  say('');
  ok(`${chosen.length} sound${chosen.length === 1 ? '' : 's'} (${files} files, ${bytes(size)}) copied to ${pretty(gameAudioDir(dir))}.`);
  ok(`Listed in ${pretty(gameManifest(dir))} and credited in ${pretty(path.join(dir, 'CREDITS.md'))}.`);
  say('\nIn the game (once, where the game is set up):');
  say('  import sounds from \'../audio/sounds.json\';   // the path from your file to src/audio/sounds.json');
  say('  audio.loadAll(sounds);');
  say(`Then:  audio.play('${chosen.find((s) => !s.loop)?.id || 'ui-click'}')${chosen.some((s) => s.loop) ? `   and   const bed = audio.loop('${chosen.find((s) => s.loop).id}', { vol: 0.5 })` : ''}`);
  say('More: recipes/sound-files.md. Nobody has heard these in your game yet: measure with  node tools/play/loud.mjs  and ask the person to listen.');
  return 0;
});
