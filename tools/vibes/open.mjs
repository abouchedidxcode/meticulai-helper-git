#!/usr/bin/env node
// Show the vibes gallery (vibes/gallery.html) in the user's own browser.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getArgs } from '../lib/args.mjs';
import { HelperError, nextStep, runTool, say } from '../lib/log.mjs';
import { REPO_ROOT, pretty } from '../lib/paths.mjs';
import { run } from '../lib/proc.mjs';
import { vibesDir } from './lib.mjs';

const HELP = `
node tools/vibes/open.mjs [--no-open]

Opens the vibes gallery in your normal browser: every vibe as a card with its pictures. Click a card to see it
large, then tell your agent which one you want ("use the Paper diorama vibe").
The gallery is one file on your computer (vibes/gallery.html); it needs no internet.

  --no-open   only print where the gallery is (for agents and tests)
`;

await runTool(async () => {
  const { values: a } = getArgs({ 'no-open': { type: 'boolean' }, from: { type: 'string' } }, HELP);
  const dir = vibesDir(a.from);
  const file = path.join(dir, 'gallery.html');
  if (!fs.existsSync(file)) {
    const r = await run(process.execPath, [path.join(REPO_ROOT, 'tools', 'vibes', 'build-gallery.mjs'), ...(a.from ? ['--from', a.from] : [])], { inherit: false });
    if (r.code !== 0 || !fs.existsSync(file)) throw new HelperError('the gallery page is missing and I could not make it.', 'Run  node tools/vibes/build-gallery.mjs --verbose  to see why.');
  }
  say(`The vibes gallery: ${file}`);
  if (a['no-open'] || process.env.HELPER_NO_OPEN === '1') {
    say('(Not opened: --no-open.) Open that file in a browser to see it.');
    return 0;
  }
  const [cmd, args] = process.platform === 'darwin' ? ['open', [file]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', file]] : ['xdg-open', [file]];
  const opened = await new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
      child.on('error', () => resolve(false));
      child.on('spawn', () => { child.unref(); resolve(true); });
    } catch { resolve(false); }
  });
  if (opened) say('I opened it in your browser. Click a card to see a vibe large.');
  else say(`I could not open it for you. Open this file yourself (double-click it): ${pretty(file)}`);
  nextStep('tell your agent which vibe you like ("use the ... vibe"), or run  node tools/vibes/apply.mjs <id>.');
  return 0;
});
