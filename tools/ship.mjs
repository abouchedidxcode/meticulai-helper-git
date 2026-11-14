#!/usr/bin/env node
// Build the game for the web, test the build in the hidden browser, and zip it for itch.io or any web host.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from './lib/args.mjs';
import { HelperError, bytes, detail, nextStep, ok, runTool, say, warn } from './lib/log.mjs';
import { gameDir, pretty, readHelper, slugify } from './lib/paths.mjs';
import { checkGame, printProblems } from './lib/check.mjs';
import { buildGame, startStatic } from './lib/server.mjs';
import { run, which, isWin } from './lib/proc.mjs';

const HELP = `
node tools/ship.mjs [--no-check]

Makes the version of your game you can put on the internet:
  1. builds it (into my-game/dist/) with relative paths, so it works in any folder
  2. opens the build in a hidden browser to make sure it starts and draws
  3. zips it to my-game/ship/<name>-web.zip, ready for itch.io or GitHub Pages

  --no-check    skip step 2 (not recommended)
  --dir <path>  use a different game folder (default: my-game/)
  --verbose     show technical details
`;

const BIG_FILE = 25 * 1024 * 1024;
const BIG_TOTAL = 200 * 1024 * 1024;

function walk(dir, root = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, root));
    else out.push({ file: p, rel: path.relative(root, p).split(path.sep).join('/'), size: fs.statSync(p).size });
  }
  return out;
}

/** Paths that start with "/" break when the game is served from a sub-folder (itch.io, GitHub Pages). */
function findAbsolutePaths(files) {
  const hits = [];
  const patterns = [
    /\b(?:src|href)\s*=\s*["']\/(?!\/)[^"']+/g, // html attributes
    /url\(\s*["']?\/(?!\/)[^)"']+/g, // css url()
    /["'`]\/(?:assets|public|models|textures|sounds|audio|music|images|img|fonts|src)\/[^"'`]+/g, // js strings
  ];
  for (const f of files) {
    if (!/\.(html|css|js|mjs|json)$/i.test(f.rel)) continue;
    const text = fs.readFileSync(f.file, 'utf8');
    for (const re of patterns) {
      for (const m of text.matchAll(re)) {
        hits.push(`${f.rel}: ${m[0].slice(0, 120)}`);
        if (hits.length > 20) return hits;
      }
    }
  }
  return hits;
}

async function zipFolder(srcDir, zipFile) {
  fs.rmSync(zipFile, { force: true });
  fs.mkdirSync(path.dirname(zipFile), { recursive: true });
  if (which('zip')) {
    const r = await run('zip', ['-r', '-q', '-X', zipFile, '.'], { cwd: srcDir });
    if (r.code === 0) return 'zip';
    detail('zip failed', r.stderr);
  }
  if (which('tar') && isWin) {
    // Windows 10+ ships bsdtar, which writes zip files when asked with -a
    const r = await run('tar', ['-a', '-c', '-f', zipFile, '.'], { cwd: srcDir });
    if (r.code === 0) return 'tar';
    detail('tar failed', r.stderr);
  }
  if (isWin) {
    const ps = `Compress-Archive -Path '${path.join(srcDir, '*').replace(/'/g, "''")}' -DestinationPath '${zipFile.replace(/'/g, "''")}' -Force`;
    const r = await run('powershell', ['-NoProfile', '-Command', ps]);
    if (r.code === 0) return 'powershell';
    detail('powershell failed', r.stderr);
  }
  throw new HelperError('I could not make the zip file (no zip tool found).', isWin ? 'Update Windows, or zip the my-game/dist folder by hand: right-click it, Send to, Compressed folder.' : 'Install zip (for example  sudo apt install zip), then try again.');
}

await runTool(async () => {
  const { values: a } = getArgs({ 'no-check': { type: 'boolean' } }, HELP);
  const dir = gameDir(a.dir);
  const cfg = readHelper(dir);
  const slug = slugify(cfg.gameName);
  const dist = path.join(dir, 'dist');

  say('Building the web version of your game...');
  await buildGame(dir, dist);
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new HelperError('the build has no index.html.', 'Check that index.html is in the game folder, then try again.');
  const files = walk(dist);
  const total = files.reduce((s, f) => s + f.size, 0);
  ok(`Built: ${files.length} files, ${bytes(total)}.`);

  const warnings = [];
  const big = files.filter((f) => f.size > BIG_FILE);
  if (big.length) warnings.push(`Some files are over 25 MB, which some sites refuse and players wait for: ${big.map((f) => `${f.rel} (${bytes(f.size)})`).join(', ')}. Compress them (smaller textures, mp3/ogg sound, compressed models).`);
  if (total > BIG_TOTAL) warnings.push(`The whole game is ${bytes(total)}. itch.io allows up to about 1 GB, but over 200 MB loads slowly. Compress the biggest files.`);
  const abs = findAbsolutePaths(files);
  if (abs.length) warnings.push(`Some paths start with "/" and will break on itch.io or GitHub Pages (use relative paths like "./assets/x.png"):\n      ${abs.slice(0, 6).join('\n      ')}`);
  for (const w of warnings) warn(w);

  if (!a['no-check']) {
    say('Testing the build in a hidden browser...');
    const srv = await startStatic(dist);
    let res;
    try {
      res = await checkGame(`${srv.url}?test=0`, { label: `ship ${pretty(dir)}` });
    } finally {
      await srv.close();
    }
    for (const w of res.warnings) warn(w);
    if (!res.ok) {
      printProblems(res);
      nextStep('Fix the first problem above (the game works on your computer but not as a built web page), then run  node tools/ship.mjs  again.');
      return 1;
    }
    ok('The built game starts, runs without errors and draws on screen.');
  }

  const zipFile = path.join(dir, 'ship', `${slug}-web.zip`);
  await zipFolder(dist, zipFile);
  const size = fs.statSync(zipFile).size;
  ok(`Zipped: ${pretty(zipFile)} (${bytes(size)})`);

  say(`
Your game is ready to put online. Two easy ways (both free):

itch.io
  1. Make an account at https://itch.io and choose "Upload new project".
  2. Kind of project: HTML.
  3. Upload ${path.basename(zipFile)} and tick "This file will be played in the browser".
  4. Under "Embed options", set the size to 1280 x 720.
  5. Save it as a Draft and play it there yourself before you make it public.

GitHub Pages
  Ask your agent: "Put the dist folder on GitHub Pages." It needs your GitHub account,
  and it will ask before publishing anything.`);
  if (warnings.length) nextStep('Look at the notes above first. The zip works, but fixing them makes the game load better.');
  return 0;
});
