#!/usr/bin/env node
// Check that this computer has everything the kit needs, and (with --fix) install what's missing.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getArgs } from './lib/args.mjs';
import { bytes, detail, nextStep, runTool, say } from './lib/log.mjs';
import { REPO_ROOT, gameDir, pretty } from './lib/paths.mjs';
import { run, versionOf, which, isWin } from './lib/proc.mjs';
import { ffmpegInstallHelp } from './lib/ffmpeg.mjs';
import { browserArgs, withBrowserLock } from './lib/browser.mjs';

const HELP = `
node tools/doctor.mjs [--fix]

Checks that your computer has what the kit needs: Node.js, npm, git, ffmpeg
(for videos), the hidden test browser, free disk space, and your game folder.
It also says whether a fal key is set in .env (it never shows the key).

  --fix         install what's missing (the kit's tools, the test browser,
                ffmpeg through Homebrew on a Mac, your game's building blocks)
  --dir <path>  check a different game folder (default: my-game/)
  --verbose     show technical details
`;

const results = [];
const add = (status, what, fix = '') => results.push({ status, what, fix });

function nodeOk() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 20) add('ok', `Node.js ${process.versions.node}`);
  else add('bad', `Node.js ${process.versions.node} is too old (the kit needs version 20 or newer)`, 'Install the "LTS" version from https://nodejs.org, then close and reopen the terminal.');
}

function playwrightInstalled() {
  try {
    createRequire(path.join(REPO_ROOT, 'package.json')).resolve('playwright');
    return true;
  } catch { return false; }
}

async function browserWorks() {
  // a real start of the hidden browser is the only honest check (in a child process, under the browser lock)
  const args = JSON.stringify(browserArgs());
  const go = () => run(process.execPath, ['--input-type=module', '-e', `
    import { chromium } from 'playwright';
    try { const b = await chromium.launch({ headless: true, args: ${args} }); await b.close(); console.log('ok'); }
    catch (e) { console.error(e.message); process.exit(1); }`], { cwd: REPO_ROOT, timeout: 90000 });
  let r;
  try {
    r = await withBrowserLock(go, { label: 'doctor', waitMs: 120000 });
  } catch (e) {
    detail(e);
    return 'busy';
  }
  detail(r.stderr.trim());
  return r.code === 0 ? 'ok' : 'bad';
}

function falKeyState() {
  // Reads only whether a FAL_KEY line exists and is non-empty. The value is never kept, printed or logged.
  const envFile = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(envFile)) return 'no-file';
  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
  let state = 'missing';
  for (const line of lines) {
    const m = /^\s*(?:export\s+)?FAL_KEY\s*=(.*)$/.exec(line);
    if (!m) continue;
    const v = m[1].replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '').trim();
    state = v ? 'set' : 'empty';
  }
  return state;
}

async function checkAll(dir) {
  results.length = 0;
  nodeOk();
  const npmV = versionOf('npm');
  if (npmV) add('ok', `npm ${npmV}`);
  else add('bad', 'npm is missing (it comes with Node.js)', 'Install the "LTS" version from https://nodejs.org.');

  const gitV = versionOf('git');
  if (gitV) add('ok', gitV.replace(/^git version/, 'git'));
  else add('bad', 'git is missing (it saves versions of your game)', process.platform === 'darwin'
    ? 'Open Terminal and run  xcode-select --install , then click Install.'
    : isWin ? 'Install it from https://git-scm.com/download/win (keep the default options).' : 'Install it with your package manager, for example  sudo apt install git.');

  const ff = which('ffmpeg'), fp = which('ffprobe');
  if (ff && fp) add('ok', 'ffmpeg (makes videos and contact sheets)');
  else add('bad', 'ffmpeg is missing (it makes the play-through videos)', process.platform === 'darwin' && which('brew') ? 'Run  node tools/doctor.mjs --fix' : ffmpegInstallHelp());

  const nm = fs.existsSync(path.join(REPO_ROOT, 'node_modules'));
  const pw = nm && playwrightInstalled();
  if (pw) add('ok', 'the kit\'s tools are installed');
  else add('bad', 'the kit\'s tools are not installed yet', 'Run  node tools/doctor.mjs --fix');

  if (pw) {
    const b = await browserWorks();
    if (b === 'ok') add('ok', 'the hidden test browser starts');
    else if (b === 'busy') add('note', 'the hidden test browser is busy with another agent, so I did not test it (that means it is installed)');
    else add('bad', 'the hidden test browser (Chromium) is missing or won\'t start', 'Run  node tools/doctor.mjs --fix');
  }

  try {
    const st = fs.statfsSync(REPO_ROOT);
    const free = st.bavail * st.bsize;
    if (free < 512 * 1024 * 1024) add('bad', `only ${bytes(free)} of disk space free`, 'Free up at least 2 GB (empty the Trash, delete big downloads).');
    else if (free < 2 * 1024 ** 3) add('note', `${bytes(free)} of disk space free (recordings and generated files need room; 2 GB or more is better)`);
    else add('ok', `${bytes(free)} of disk space free`);
  } catch (e) { detail(e); }

  if (fs.existsSync(dir)) {
    if (fs.existsSync(path.join(dir, 'node_modules', 'vite'))) add('ok', `your game folder ${pretty(dir)} is ready`);
    else add('bad', `your game folder ${pretty(dir)} is missing its building blocks`, 'Run  node tools/doctor.mjs --fix');
  } else {
    add('note', 'no game yet', 'Create one with  node tools/init.mjs --name "My Game"');
  }

  const fal = falKeyState();
  if (fal === 'set') add('ok', 'a fal key is set in .env (for optional paid pictures and sounds)');
  else add('note', 'no fal key (optional: only needed to generate pictures, sounds or 3D models with fal.ai)', 'See .env.example if you want it later. Never paste a key into the chat.');
}

function print() {
  say('');
  for (const r of results) {
    const tag = r.status === 'ok' ? '  ok  ' : r.status === 'bad' ? '  !!  ' : '  --  ';
    say(`${tag} ${r.what}`);
    if (r.fix && r.status !== 'ok') say(`        ${r.status === 'bad' ? 'fix: ' : ''}${r.fix}`);
  }
  say('');
}

async function fix(dir) {
  const has = (re) => results.some((r) => r.status === 'bad' && re.test(r.what));
  if (has(/kit's tools/)) {
    say('Installing the kit\'s tools (npm install)...');
    const r = await run('npm', ['install', '--no-audit', '--no-fund'], { cwd: REPO_ROOT, inherit: true });
    if (r.code !== 0) say('  That did not work. Check your internet connection and try again.');
  }
  if (has(/kit's tools|test browser/)) {
    if (playwrightInstalled()) {
      say('Installing the hidden test browser (about 150 MB, once)...');
      const cli = path.join(path.dirname(createRequire(path.join(REPO_ROOT, 'package.json')).resolve('playwright/package.json')), 'cli.js');
      const r = await run(process.execPath, [cli, 'install', 'chromium'], { cwd: REPO_ROOT, inherit: true });
      if (r.code !== 0) say('  That did not work. Check your internet connection and try again.');
    }
  }
  if (has(/ffmpeg/)) {
    if (which('brew')) {
      say('Installing ffmpeg with Homebrew (this can take a few minutes)...');
      await run('brew', ['install', 'ffmpeg'], { inherit: true });
    } else if (isWin && which('winget')) {
      say('Installing ffmpeg with winget...');
      await run('winget', ['install', '--id', 'Gyan.FFmpeg', '-e', '--accept-source-agreements', '--accept-package-agreements'], { inherit: true });
      say('  When it finishes, close this terminal and open a new one so ffmpeg is found.');
    } else {
      say(`ffmpeg needs installing by hand: ${ffmpegInstallHelp()}`);
    }
  }
  if (fs.existsSync(dir) && has(/building blocks/)) {
    say(`Installing your game's building blocks in ${pretty(dir)}...`);
    const r = await run('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir, inherit: true });
    if (r.code !== 0) say('  That did not work. Check your internet connection and try again.');
  }
}

await runTool(async () => {
  const { values: a } = getArgs({ fix: { type: 'boolean' } }, HELP);
  const dir = gameDir(a.dir);
  say('Checking your computer...');
  await checkAll(dir);
  if (a.fix && results.some((r) => r.status === 'bad')) {
    print();
    say('Fixing what I can...\n');
    await fix(dir);
    say('\nChecking again...');
    await checkAll(dir);
  }
  print();
  const bad = results.filter((r) => r.status === 'bad');
  if (!bad.length) {
    say('Everything the kit needs is here.');
    if (!fs.existsSync(dir)) nextStep('Create your game:  node tools/init.mjs --name "My Game"');
    return 0;
  }
  say(`${bad.length} thing(s) need fixing.`);
  nextStep(a.fix ? 'Follow the "fix:" lines above that I could not do for you, then run  node tools/doctor.mjs  again.' : 'Run  node tools/doctor.mjs --fix  to install what is missing.');
  return 1;
});
