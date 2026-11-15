#!/usr/bin/env node
// Swap the game code in an existing my-game/ for another starter, keeping the user's plan, pictures, palette and notes.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, detail, nextStep, ok, runTool, say, warn } from '../lib/log.mjs';
import { REPO_ROOT, gameDir, pretty, readHelper, readJson, stamp, writeHelper, writeJson } from '../lib/paths.mjs';
import { run } from '../lib/proc.mjs';
import { stopServer } from '../lib/server.mjs';
import { loadStarter } from './lib.mjs';

const HELP = `
node tools/starters/switch.mjs <starter-id> [--force] [--no-install]

Changes which starting game your game is built on, for example from the island to the racer, right after the
interview. Your plan and everything you made stay: GREAT.md, HANDOVER.md, DECISIONS.md, palette.json, refs/,
playtest notes, recordings. Only the game itself (src/game/, src/tuning.json, STARTER.md) is replaced, and the
blocks that starter is built on are added. The old game code is kept in .helper/old-game-<time>/.

  --force       switch even though src/game/ was already changed from its starter (it is still kept)
  --no-install  don't install packages (for testing the kit)
  --dir <path>  the game folder (default my-game/)

See the starters with  node tools/starters/list.mjs --for "<the game in a few words>".
`;

const SKIP = new Set(['node_modules', 'dist', '.helper', '.DS_Store', '.vite']);

function sameTree(a, b) {
  if (!fs.existsSync(a) || !fs.existsSync(b)) return false;
  const sa = fs.statSync(a);
  if (sa.isDirectory()) {
    const na = fs.readdirSync(a).filter((n) => !SKIP.has(n)).sort();
    const nb = fs.readdirSync(b).filter((n) => !SKIP.has(n)).sort();
    return na.length === nb.length && na.every((n, i) => n === nb[i] && sameTree(path.join(a, n), path.join(b, n)));
  }
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

await runTool(async () => {
  const { values: a, positionals } = getArgs({ force: { type: 'boolean' }, 'no-install': { type: 'boolean' } }, HELP);
  const id = positionals[0];
  if (!id) throw new HelperError('say which starter to switch to.', 'See them with  node tools/starters/list.mjs');
  const dir = gameDir(a.dir);
  const helper = readHelper(dir);
  const pick = loadStarter(id);
  const from = helper.starter || 'island';
  if (from === pick.id) { say(`Your game is already built on the ${pick.name} starter. Nothing to do.`); return 0; }

  // Has the game code been worked on since it was copied? Then switching would throw that work away.
  const fromStarter = loadStarter(from);
  const fromGame = fromStarter.base ? path.join(REPO_ROOT, 'starter', 'src', 'game') : path.join(fromStarter.dir, 'src', 'game');
  const untouched = sameTree(path.join(dir, 'src', 'game'), fromGame);
  if (!untouched && !a.force) {
    throw new HelperError(`the game code in ${pretty(path.join(dir, 'src', 'game'))} has been changed since it was copied from the ${from} starter, so switching would replace that work.`,
      `If that's fine (it will be kept in ${pretty(path.join(dir, '.helper'))}/old-game-...), run again with --force.`);
  }

  await stopServer(dir).catch(() => {});
  const keep = path.join(dir, '.helper', `old-game-${stamp()}`);
  fs.mkdirSync(keep, { recursive: true });
  for (const rel of [path.join('src', 'game'), path.join('src', 'tuning.json'), 'STARTER.md']) {
    const p = path.join(dir, rel);
    if (fs.existsSync(p)) { fs.cpSync(p, path.join(keep, rel), { recursive: true }); fs.rmSync(p, { recursive: true, force: true }); }
  }

  const base = path.join(REPO_ROOT, 'starter');
  const src = pick.base ? base : pick.dir;
  const copy = (rel) => { const s = path.join(src, rel); if (fs.existsSync(s)) fs.cpSync(s, path.join(dir, rel), { recursive: true, filter: (f) => !SKIP.has(path.basename(f)) }); };
  copy(path.join('src', 'game'));
  if (!fs.existsSync(path.join(src, 'src', 'tuning.json'))) fs.copyFileSync(path.join(base, 'src', 'tuning.json'), path.join(dir, 'src', 'tuning.json'));
  else copy(path.join('src', 'tuning.json'));
  if (!pick.base) { copy('public'); copy('scripts'); }
  if (fs.existsSync(path.join(pick.dir, 'STARTER.md'))) fs.copyFileSync(path.join(pick.dir, 'STARTER.md'), path.join(dir, 'STARTER.md'));

  const pkgFile = path.join(dir, 'package.json');
  const pkg = readJson(pkgFile);
  if (pkg && pick.npm) writeJson(pkgFile, { ...pkg, dependencies: { ...pkg.dependencies, ...pick.npm } });
  writeHelper(dir, { starter: pick.id });
  ok(`Your game is now built on the ${pick.name} starter. The old game code is kept in ${pretty(keep)}.`);

  if (!a['no-install'] && pick.npm) {
    const r = await run('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir, inherit: false });
    detail(r.stdout, r.stderr);
    if (r.code !== 0) throw new HelperError('installing the starter\'s packages failed.', 'Check the internet connection, then run  node tools/doctor.mjs --fix');
  }
  for (const b of pick.blocks || []) {
    if (fs.existsSync(path.join(dir, 'vendor', b))) continue;
    const r = await run(process.execPath, [path.join(REPO_ROOT, 'tools', 'blocks', 'add.mjs'), b, '--dir', dir, ...(a['no-install'] ? [] : ['--install'])], { inherit: false });
    detail(r.stdout, r.stderr);
    if (r.code !== 0) warn(`Adding the block ${b} failed: run  node tools/blocks/add.mjs ${b} --verbose`);
    else ok(`Added the block ${b}.`);
  }
  fs.appendFileSync(path.join(dir, 'DECISIONS.md'), `\n- ${stamp().slice(0, 10)}: switched the game from the ${from} starter to the ${pick.id} starter (${pick.name}). Old code kept in ${path.relative(dir, keep)}/.\n`);
  nextStep(`Read ${pretty(path.join(dir, 'STARTER.md'))} (what is already tuned and how to reshape it), then run  node tools/serve.mjs --check`);
  return 0;
});
