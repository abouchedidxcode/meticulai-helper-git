#!/usr/bin/env node
// Print the blocks catalogue (blocks/catalog.json) in plain words, filtered by kind or renderer.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, runTool, say } from '../lib/log.mjs';
import { licenseLabel } from '../assets/lib/common.mjs';
import { kitDir, loadBlocks } from '../assets/lib/catalogs.mjs';
import { NEEDS, OTHER, needsOf } from './lib/needs.mjs';

const HELP = `
node tools/blocks/list.mjs [--need <need>] [--kind <kind>] [--renderer webgl2|webgpu|both|2d|none] [--json]

Lists the blocks you can add to your game: effects (fire, water, painted looks), systems (cars, crowds,
destruction, dungeons), tools (tree makers...), and the Meticulai blocks: systems taken from finished games on
meticulai.com (flight, horses, archery, looks, webcam hands, music...), each tuned by playing.
Add one with  node tools/blocks/add.mjs <id>.

  --need <need>   only blocks for one need: ${[...NEEDS, OTHER].map((n) => n.id).join(', ')}
                  (the same groups as blocks/BY-NEED.md)
  --kind <kind>   effect, system, tool, look, input, audio, ai, physics, procgen, vehicle, character, combat, ui, dev-tool

To find blocks for YOUR game, run  node tools/blocks/suggest.mjs  (it reads my-game/GREAT.md).

  webgl2  works with the starter game as it is
  webgpu  needs three.js's WebGPU renderer and a recent Chrome or Edge (a real change to the game)
  both    WebGPU renderer that falls back to WebGL 2
  2d      plain canvas, no three.js
`;

const KIND_TITLES = { effect: 'EFFECTS', system: 'SYSTEMS', tool: 'TOOLS', look: 'LOOKS', input: 'INPUT (webcam, hands, touch)', audio: 'MUSIC AND SOUND', ai: 'AI (creatures, crowds, rivals)', physics: 'PHYSICS', procgen: 'MADE IN CODE (procedural)', vehicle: 'VEHICLES AND FLIGHT', character: 'CHARACTERS', combat: 'COMBAT AND AIMING', ui: 'MENUS AND SCREEN', 'dev-tool': 'TUNING AND TESTING TOOLS' };
const RENDER = { webgl2: 'works with the starter', webgpu: 'needs WebGPU', both: 'WebGPU renderer, falls back to WebGL', '2d': '2D canvas', none: 'not a renderer thing' };

await runTool(async () => {
  const { values: a } = getArgs({ need: { type: 'string' }, kind: { type: 'string' }, renderer: { type: 'string' }, json: { type: 'boolean' } }, HELP);
  const blocks = loadBlocks();
  if (!blocks) throw new HelperError("the blocks catalogue isn't there yet (blocks/catalog.json is missing).", 'Update the kit (download it again), or ask your agent to check the blocks/ folder.');
  let list = blocks;
  if (a.need) {
    const need = [...NEEDS, OTHER].find((n) => n.id === a.need.toLowerCase());
    if (!need) throw new HelperError(`I don't know the need "${a.need}".`, `Use one of: ${[...NEEDS, OTHER].map((n) => n.id).join(', ')}.`);
    list = list.filter((b) => needsOf(b).includes(need.id));
  }
  if (a.kind) list = list.filter((b) => b.kind === a.kind);
  if (a.renderer) list = list.filter((b) => b.renderer === a.renderer || (a.renderer === 'webgl2' && b.renderer === 'both'));
  if (a.json) { console.log(JSON.stringify(list, null, 1)); return 0; }
  if (!list.length) { say('No blocks match those filters. Drop --need, --kind or --renderer to see them all.'); return 1; }
  const kinds = [...new Set(list.map((b) => b.kind || 'other'))];
  say(`${list.length} block${list.length > 1 ? 's' : ''}${a.need ? ` (need: ${a.need})` : ''}${a.kind ? ` (${a.kind})` : ''}${a.renderer ? ` (renderer ${a.renderer})` : ''}. Add one with  node tools/blocks/add.mjs <id>\n`);
  for (const k of kinds) {
    say(KIND_TITLES[k] || k.toUpperCase());
    for (const b of list.filter((x) => (x.kind || 'other') === k)) {
      const ready = b.vendored && fs.existsSync(path.join(kitDir(), b.vendored));
      const where = ready ? 'in the kit' : 'downloaded from the author';
      say(`  ${b.id.padEnd(30)} ${b.name}`);
      say(`  ${''.padEnd(30)} ${b.what ? b.what.slice(0, 150) + (b.what.length > 150 ? '...' : '') : ''}`);
      if (b.use_when) say(`  ${''.padEnd(30)} Use when ${b.use_when.replace(/^use (it )?when /i, '').slice(0, 140)}${b.use_when.length > 140 ? '...' : ''}`);
      if (b.from_game) say(`  ${''.padEnd(30)} From ${b.from_game}${b.play_url ? `, play it at ${b.play_url}` : ' (not on the site yet)'}${b.tuned_by_play ? '; tuned by playing' : ''}`);
      say(`  ${''.padEnd(30)} ${RENDER[b.renderer] || b.renderer || '?'}; ${where}${b.size_kb ? `, ${b.size_kb >= 1024 ? (b.size_kb / 1024).toFixed(1) + ' MB' : b.size_kb + ' KB'}` : ''}; ${licenseLabel(b.license)}; by ${b.by || '?'}${b.preview && fs.existsSync(path.join(kitDir(), b.preview)) ? `; preview ${b.preview}` : ''}`);
    }
    say('');
  }
  return 0;
});
