#!/usr/bin/env node
// Create my-game/: a copy of the starter game, the planning templates, the folders the tools use, and helper.json.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from './lib/args.mjs';
import { HelperError, detail, ok, runTool, say, nextStep } from './lib/log.mjs';
import { HELPER_DEFAULTS, REPO_ROOT, gameDir, pretty, readJson, slugify, writeJson } from './lib/paths.mjs';
import { findFreePort, run } from './lib/proc.mjs';
import { PORT_RANGE } from './lib/server.mjs';

const HELP = `
node tools/init.mjs [--name "My Game"]

Creates your game folder, my-game/, from the starter game. It copies the starter,
adds the planning files (GREAT.md, HANDOVER.md, ...), makes the folders for your
pictures, recordings and notes, picks a free port for the play link, and installs
what the game needs (this needs the internet and takes a minute).

  --name "..."    your game's name (you can change it later in my-game/helper.json)
  --no-install    skip installing (for testing the kit)
  --dir <path>    create the game somewhere else (default: my-game/)
  --verbose       show technical details

It never overwrites an existing game.
`;

const SKIP = new Set(['node_modules', 'dist', '.helper', 'ship', 'recordings', '.DS_Store', '.vite']);

await runTool(async () => {
  const { values: a } = getArgs({ name: { type: 'string' }, 'no-install': { type: 'boolean' } }, HELP);
  const dir = gameDir(a.dir);
  const name = (a.name || 'My Game').trim().slice(0, 80) || 'My Game';
  const starter = path.join(REPO_ROOT, 'starter');
  const templates = path.join(REPO_ROOT, 'templates');

  if (fs.existsSync(dir)) {
    const existing = readJson(path.join(dir, 'helper.json'))?.gameName;
    say(`You already have a game in ${pretty(dir)}${existing ? ` ("${existing}")` : ''}, so I left it exactly as it is.`);
    nextStep(`To keep working on it, just carry on (run  node tools/serve.mjs --check  to play it). To start a different game, first move or rename the ${path.basename(dir)} folder, or use  --dir another-folder.`);
    return 1;
  }
  if (!fs.existsSync(path.join(starter, 'package.json'))) {
    throw new HelperError('the starter game is missing from this copy of the kit (no starter/ folder).', 'Download the kit again, or ask your agent to restore the starter/ folder from the kit\'s repository.');
  }

  say(`Creating "${name}" in ${pretty(dir)}...`);
  fs.cpSync(starter, dir, { recursive: true, filter: (src) => !SKIP.has(path.basename(src)) });

  // planning templates (REFS.md goes into refs/); any that are missing are skipped quietly
  const port = await findFreePort(...PORT_RANGE);
  if (!port) throw new HelperError(`every port from ${PORT_RANGE[0]} to ${PORT_RANGE[1]} is busy.`, 'Restart your computer, then try again.');
  const fill = (text) => text.replaceAll('{{GAME_NAME}}', name).replaceAll('{{PORT}}', String(port)).replaceAll('{{CAP}}', '0');
  for (const d of ['refs', 'refs/sheets', 'refs/generated', 'recordings', 'playtest-notes']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  if (fs.existsSync(templates)) {
    for (const f of fs.readdirSync(templates).filter((x) => x.endsWith('.md'))) {
      const dest = f === 'REFS.md' ? path.join(dir, 'refs', 'REFS.md') : path.join(dir, f);
      if (fs.existsSync(dest)) continue;
      fs.writeFileSync(dest, fill(fs.readFileSync(path.join(templates, f), 'utf8')));
    }
  }

  // settings
  const starterHelper = readJson(path.join(starter, 'helper.json'), {});
  writeJson(path.join(dir, 'helper.json'), { ...HELPER_DEFAULTS, ...starterHelper, gameName: name, port });
  const html = path.join(dir, 'index.html');
  if (fs.existsSync(html)) {
    const esc = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc}</title>`));
  }
  const pkgFile = path.join(dir, 'package.json');
  const pkg = readJson(pkgFile);
  if (pkg) writeJson(pkgFile, { ...pkg, name: slugify(name) });
  ok(`Copied the starter game and the planning files. The play link will be http://localhost:${port}`);

  if (a['no-install']) {
    say('Skipped installing (--no-install).');
  } else {
    say('Installing what the game needs (this can take a minute)...');
    const r = await run('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir, inherit: false });
    detail(r.stdout, r.stderr);
    if (r.code !== 0) {
      throw new HelperError('installing the game\'s building blocks failed (your game folder was still created).', 'Check your internet connection, then run  node tools/doctor.mjs --fix  (it finishes the install).');
    }
    ok('Installed.');
  }

  say(`\nYour game "${name}" is set up in ${pretty(dir)}.`);
  nextStep('Tell your agent "let\'s make my game" (it will ask you a few questions first), or run  node tools/serve.mjs --check  to see the starter game.');
  return 0;
});
