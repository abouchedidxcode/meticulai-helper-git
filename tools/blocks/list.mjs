#!/usr/bin/env node
// Print the blocks catalogue (blocks/catalog.json) in plain words, filtered by kind or renderer.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, runTool, say } from '../lib/log.mjs';
import { licenseLabel } from '../assets/lib/common.mjs';
import { kitDir, loadBlocks } from '../assets/lib/catalogs.mjs';

const HELP = `
node tools/blocks/list.mjs [--kind effect|system|tool] [--renderer webgl2|webgpu|both|2d|none] [--json]

Lists the blocks you can add to your game: effects (fire, water, painted looks), systems (cars, crowds,
destruction, dungeons) and tools (tree makers...). Add one with  node tools/blocks/add.mjs <id>.

  webgl2  works with the starter game as it is
  webgpu  needs three.js's WebGPU renderer and a recent Chrome or Edge (a real change to the game)
  both    WebGPU renderer that falls back to WebGL 2
  2d      plain canvas, no three.js
`;

const RENDER = { webgl2: 'works with the starter', webgpu: 'needs WebGPU', both: 'WebGPU renderer, falls back to WebGL', '2d': '2D canvas', none: 'not a renderer thing' };

await runTool(async () => {
  const { values: a } = getArgs({ kind: { type: 'string' }, renderer: { type: 'string' }, json: { type: 'boolean' } }, HELP);
  const blocks = loadBlocks();
  if (!blocks) throw new HelperError("the blocks catalogue isn't there yet (blocks/catalog.json is missing).", 'Update the kit (download it again), or ask your agent to check the blocks/ folder.');
  let list = blocks;
  if (a.kind) list = list.filter((b) => b.kind === a.kind);
  if (a.renderer) list = list.filter((b) => b.renderer === a.renderer || (a.renderer === 'webgl2' && b.renderer === 'both'));
  if (a.json) { console.log(JSON.stringify(list, null, 1)); return 0; }
  if (!list.length) { say('No blocks match those filters. Drop --kind or --renderer to see them all.'); return 1; }
  const kinds = [...new Set(list.map((b) => b.kind || 'other'))];
  say(`${list.length} block${list.length > 1 ? 's' : ''}${a.kind ? ` (${a.kind})` : ''}${a.renderer ? ` (renderer ${a.renderer})` : ''}. Add one with  node tools/blocks/add.mjs <id>\n`);
  for (const k of kinds) {
    say(`${k.toUpperCase()}S`);
    for (const b of list.filter((x) => (x.kind || 'other') === k)) {
      const ready = b.vendored && fs.existsSync(path.join(kitDir(), b.vendored));
      const where = ready ? 'in the kit' : 'downloaded from the author';
      say(`  ${b.id.padEnd(30)} ${b.name}`);
      say(`  ${''.padEnd(30)} ${b.what ? b.what.slice(0, 150) + (b.what.length > 150 ? '...' : '') : ''}`);
      say(`  ${''.padEnd(30)} ${RENDER[b.renderer] || b.renderer || '?'}; ${where}${b.size_kb ? `, ${b.size_kb >= 1024 ? (b.size_kb / 1024).toFixed(1) + ' MB' : b.size_kb + ' KB'}` : ''}; ${licenseLabel(b.license)}; by ${b.by || '?'}${b.preview && fs.existsSync(path.join(kitDir(), b.preview)) ? `; preview ${b.preview}` : ''}`);
    }
    say('');
  }
  return 0;
});
