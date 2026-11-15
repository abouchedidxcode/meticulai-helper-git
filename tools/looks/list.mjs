#!/usr/bin/env node
// Print the looks: drawing styles that work on any starter game.
import { getArgs } from '../lib/args.mjs';
import { runTool, say } from '../lib/log.mjs';
import { PLAIN, listLooks, listUpgrades } from './lib.mjs';

const HELP = `
node tools/looks/list.mjs [--json]

Lists the looks. A look changes how the finished picture is drawn (printed, pixels, ink, painted, toy, film...)
without touching the game's code, so any of them works on any starter game. Colours do not come from the look:
they come from my-game/palette.json. Put one on with:
  node tools/looks/apply.mjs <id>        (and  node tools/looks/apply.mjs none  takes it off again)

A vibe (node tools/vibes/list.mjs) is a palette, a light and a look chosen together; most people pick a vibe.

  --json   the full details, for agents
`;

const COST = { none: 'free', light: 'light (hardly slows the game)', medium: 'medium (fine on a laptop, check on a phone)', heavy: 'heavy (needs a good graphics chip)' };

await runTool(async () => {
  const { values: a } = getArgs({ json: { type: 'boolean' } }, HELP);
  const looks = listLooks();
  const upgrades = listUpgrades();
  if (a.json) {
    console.log(JSON.stringify({ looks: [PLAIN, ...looks.map(({ dir, ...l }) => l)], upgrades }, null, 1));
    return 0;
  }
  say(`${looks.length} looks (plus "none"). Put one on with  node tools/looks/apply.mjs <id>\n`);
  say(`  ${'none'.padEnd(16)} ${PLAIN.name}: ${PLAIN.one_line}`);
  for (const l of looks) {
    say(`  ${l.id.padEnd(16)} ${l.name}: ${l.one_line}`);
    const opts = Object.keys(l.options || {});
    say(`  ${''.padEnd(16)} Cost: ${COST[l.cost] || l.cost}${l.measured?.fps != null ? `; measured ${Math.round(l.measured.fps)} frames a second at ${l.measured.size} on the ${l.measured.starter} starter (a whole frame ${l.measured.frame_ms} ms, plain game ${l.measured.plain_frame_ms} ms)` : ''}.${l.block ? ` Built on the block ${l.block}.` : ''}`);
    if (opts.length) say(`  ${''.padEnd(16)} You can tune: ${opts.join(', ')} (press \` in the game).`);
    if (l.note) say(`  ${''.padEnd(16)} Note: ${l.note}`);
    if (l.orthographic && l.orthographic.works !== true) say(`  ${''.padEnd(16)} Flat 2D games (orthographic camera): ${l.orthographic.works === false ? 'does not work' : 'partly'}. ${l.orthographic.note || ''}`);
    if (l.preview) say(`  ${''.padEnd(16)} Picture: ${l.preview}`);
  }
  if (upgrades.length) {
    say('\nFuller versions that need the game BUILT for them (blocks; not a switch you flip):');
    for (const u of upgrades) say(`  ${u.block.padEnd(30)} ${u.gives}${u.lite ? ` (the look "${u.lite}" is the light version)` : ''}`);
    say('  See one with  node tools/blocks/list.mjs --kind look  and its HOW-TO-USE.md.');
  }
  return 0;
});
