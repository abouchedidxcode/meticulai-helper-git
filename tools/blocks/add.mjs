#!/usr/bin/env node
// Add a block (an effect, system or tool from blocks/catalog.json) to the game as code it owns:
// a copy in my-game/vendor/<id>/, its credits in my-game/CREDITS.md, a VENDOR.md that says where it came from.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, bytes, ok, runTool, say, warn } from '../lib/log.mjs';
import { gameDir, pretty, readJson } from '../lib/paths.mjs';
import { run, which } from '../lib/proc.mjs';
import { download, licenseLabel, mapLimit, today } from '../assets/lib/common.mjs';
import { kitDir, loadBlocks } from '../assets/lib/catalogs.mjs';
import { appendAssetsLog, appendCredit } from '../assets/lib/credits.mjs';
import { ensureGameDir } from '../assets/lib/finds.mjs';

const HELP = `
node tools/blocks/add.mjs <block-id> [--install] [--npm] [--force]

Adds a block (see  node tools/blocks/list.mjs) to your game as code you can edit:
  - blocks copied into this kit: copied to my-game/vendor/<id>/ (plus any big files it lists, downloaded from the
    author's site and checked)
  - blocks we only point to: downloaded from the author's repository at the exact version we checked
Then it adds the credits to my-game/CREDITS.md and writes my-game/vendor/<id>/VENDOR.md.

  --install   also install the npm packages the block needs into my-game (only the ones the game doesn't have)
  --npm       for blocks that are published on npm: install the package into my-game instead of copying code
  --force     replace my-game/vendor/<id>/ if it is already there
  --dir       the game folder (default my-game/)
`;

const SKIP = new Set(['node_modules', 'dist', '.git', '.DS_Store', '.vite', '.cache']);

await runTool(async () => {
  const { values: a, positionals } = getArgs({ install: { type: 'boolean' }, npm: { type: 'boolean' }, force: { type: 'boolean' } }, HELP);
  const id = positionals[0];
  const blocks = loadBlocks();
  if (!blocks) throw new HelperError("the blocks catalogue isn't there yet (blocks/catalog.json is missing).", 'Update the kit (download it again), or ask your agent to check the blocks/ folder.');
  if (!id) throw new HelperError("you didn't say which block to add.", 'See them all with  node tools/blocks/list.mjs, then  node tools/blocks/add.mjs <id>.');
  const b = blocks.find((x) => x.id === id);
  if (!b) {
    const near = blocks.filter((x) => x.id.includes(id) || id.includes(x.id) || (x.name || '').toLowerCase().includes(id.toLowerCase())).map((x) => x.id);
    throw new HelperError(`there is no block called "${id}".`, near.length ? `Did you mean: ${near.join(', ')}?` : 'See them all with  node tools/blocks/list.mjs.');
  }
  const dir = gameDir(a.dir);
  ensureGameDir(dir);
  const dest = path.join(dir, 'vendor', b.id);

  // npm route: the package instead of a copy
  if (a.npm) {
    if (!b.npm) throw new HelperError(`${b.name} isn't published on npm, so it has to be copied.`, `Run  node tools/blocks/add.mjs ${b.id}  without --npm.`);
    say(`Installing the npm package ${b.npm} into ${pretty(dir)}...`);
    const r = await run('npm', ['install', '--no-audit', '--no-fund', b.npm], { cwd: dir, inherit: true, timeout: 10 * 60 * 1000 });
    if (r.code !== 0) throw new HelperError(`npm couldn't install ${b.npm}.`, 'Check the internet connection, then try again. Run with --verbose for details.');
    writeCredits(dir, b, `npm package ${b.npm}`);
    ok(`${b.npm} installed. Import it in the game code: import ... from '${b.npm}';`);
    nextSteps(b, null);
    return 0;
  }

  if (fs.existsSync(dest) && !a.force) {
    say(`${b.name} is already in the game: ${pretty(dest)}`);
    nextSteps(b, dest);
    say('(To start again from the original, run with --force: it replaces that folder, including your changes.)');
    return 0;
  }

  const vendored = b.vendored ? path.join(kitDir(), b.vendored) : null;
  if (vendored && fs.existsSync(vendored)) {
    say(`Copying ${b.name} into ${pretty(dest)}...`);
    if (a.force) fs.rmSync(dest, { recursive: true, force: true });
    const n = copyTree(vendored, dest);
    ok(`Copied ${n.files} files (${bytes(n.bytes)}).`);
    if (Array.isArray(b.fetch) && b.fetch.length) await fetchExtras(b, dest);
  } else {
    if (!b.upstream?.repo || !b.upstream?.commit) throw new HelperError(`the catalogue has no copy of ${b.name} and no repository to download it from.`, 'Ask your agent to check blocks/catalog.json for this block.');
    if (b.vendored) warn(`the kit's copy (${b.vendored}) is missing, so I'm downloading it from the author instead.`);
    if (b.npm) say(`(${b.name} is also on npm as ${b.npm}: run with --npm to install the package instead of copying its code.)`);
    say(`Downloading ${b.name} from ${b.upstream.repo} at the checked version ${b.upstream.commit.slice(0, 7)}...`);
    if (a.force) fs.rmSync(dest, { recursive: true, force: true });
    const n = await cloneAt(b.upstream.repo, b.upstream.commit, dest);
    ok(`Downloaded ${n.files} files (${bytes(n.bytes)}).`);
    if (n.bytes > 20 * 1024 * 1024) say(`  note  that's big. Most of it is usually the author's demo (pictures, models). Before shipping, delete what the game doesn't use from vendor/${b.id}/ (note it in its VENDOR.md).`);
  }

  // VENDOR.md
  const vendorMd = path.join(dest, 'VENDOR.md');
  if (!fs.existsSync(vendorMd)) {
    fs.writeFileSync(vendorMd, [
      `# ${b.name}: where this copy came from`, '',
      'A copy of an open-source project, so the game never changes under you. Edit it like your own code, and write',
      'what you changed at the bottom of this file.', '',
      '| | |', '|---|---|',
      `| Made by | ${b.by || 'see the repository'} |`,
      `| Source | ${b.upstream?.repo || 'this kit'} |`,
      `| Commit | \`${b.upstream?.commit || 'n/a'}\` |`,
      `| Copied on | ${today()} |`,
      `| Code licence | ${licenseLabel(b.license)} |`,
      `| Art licence | ${b.art_license ? licenseLabel(b.art_license) : 'n/a'} |`,
      `| Renderer | ${b.renderer || 'n/a'} |`, '',
      '## What we changed', '', '- nothing yet', '',
    ].join('\n'));
  } else {
    fs.appendFileSync(vendorMd, `\n<!-- Added to the game on ${today()} by tools/blocks/add.mjs -->\n`);
  }

  writeCredits(dir, b, `vendor/${b.id}/`);
  await checkDeps(dir, dest, a.install);
  appendAssetsLog(dir, `block:${b.id} -> vendor/${b.id}/ (${licenseLabel(b.license)})`);
  nextSteps(b, dest);
  return 0;
});

// ---------------------------------------------------------------- copying and downloading

function copyTree(src, dest) {
  let files = 0, size = 0;
  const walk = (s, d) => {
    fs.mkdirSync(d, { recursive: true });
    for (const e of fs.readdirSync(s, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const sp = path.join(s, e.name), dp = path.join(d, e.name);
      if (e.isDirectory()) walk(sp, dp);
      else if (e.isFile()) { fs.copyFileSync(sp, dp); files++; size += fs.statSync(dp).size; }
    }
  };
  walk(src, dest);
  return { files, bytes: size };
}

async function fetchExtras(b, dest) {
  say(`Downloading ${b.fetch.length} large file(s) the block needs from its author's site (checked against their fingerprints)...`);
  const root = path.resolve(dest);
  const res = await mapLimit(b.fetch, 2, async (f) => {
    const out = path.resolve(root, f.path);
    if (!out.startsWith(root + path.sep)) throw new Error(`unsafe path ${f.path}`);
    if (fs.existsSync(out) && f.sha256 && sha256(out) === f.sha256) return out;
    await download(f.url, out);
    if (f.sha256 && sha256(out) !== f.sha256) { fs.rmSync(out, { force: true }); throw new Error(`${f.path} doesn't match its fingerprint (the file changed upstream)`); }
    return out;
  });
  const bad = res.map((r, i) => (r && r.error ? `${b.fetch[i].path}: ${r.error.message}` : null)).filter(Boolean);
  if (bad.length) throw new HelperError(`some of the block's large files didn't download: ${bad.join('; ')}.`, 'Check the internet connection and run the same command again with --force.');
  ok(`${b.fetch.length} large file(s) downloaded and checked.`);
}

function sha256(f) { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); }

/** Download one commit of a git repository (shallow), copy it without .git. */
async function cloneAt(repo, commit, dest) {
  if (!which('git')) throw new HelperError('git is not installed (it downloads code from repositories).', 'Run  node tools/doctor.mjs --fix  and try again.');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mhg-block-'));
  const env = { GIT_TERMINAL_PROMPT: '0' };
  try {
    let r = await run('git', ['init', '-q', tmp], { env });
    r = await run('git', ['-C', tmp, 'fetch', '-q', '--depth', '1', repo, commit], { env, timeout: 10 * 60 * 1000 });
    if (r.code === 0) r = await run('git', ['-C', tmp, '-c', 'advice.detachedHead=false', 'checkout', '-q', 'FETCH_HEAD'], { env });
    if (r.code !== 0) {
      // some servers don't hand out single commits: take the history and check the commit out
      fs.rmSync(tmp, { recursive: true, force: true });
      r = await run('git', ['clone', '-q', '--filter=blob:none', '--no-checkout', repo, tmp], { env, timeout: 15 * 60 * 1000 });
      if (r.code === 0) r = await run('git', ['-C', tmp, '-c', 'advice.detachedHead=false', 'checkout', '-q', commit], { env });
      if (r.code !== 0) throw new HelperError(`I couldn't download ${repo} at version ${commit.slice(0, 7)}.`, 'Check the internet connection. If the repository moved or that version is gone, ask your agent to update blocks/catalog.json.', new Error(r.stderr));
    }
    return copyTree(tmp, dest);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- credits, dependencies, next steps

function writeCredits(dir, b, where) {
  const commit = b.upstream?.commit ? ` at commit ${b.upstream.commit.slice(0, 7)}` : '';
  const lic = [b.license && `code ${licenseLabel(b.license)}`, b.art_license && `art ${licenseLabel(b.art_license)}`].filter(Boolean).join(', ');
  const r = appendCredit(dir, { title: `${b.name} (block ${b.id})`, author: b.by || 'see the repository', license: lic || b.license, url: b.upstream?.repo || '', where: `${where}${commit}` });
  // anything inside the block that needs its author named (CC BY) gets its own row
  const ccby = [];
  for (const f of ['CREDITS.txt', 'CREDITS.md', 'LICENCE-NOTES.md', 'LICENSE-NOTES.md']) {
    const p = path.join(dir, 'vendor', b.id, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) if (/\bCC[- ]?BY\b/i.test(line) && /https?:\/\//.test(line)) ccby.push(line.trim().replace(/^[-*]\s*/, ''));
  }
  for (const line of [...new Set(ccby)].slice(0, 40)) {
    const url = (/(https?:\/\/\S+)/.exec(line) || [])[1] || '';
    appendCredit(dir, { title: line.replace(url, '').replace(/[:,\s]+$/, '').slice(0, 160), author: '(see the line)', license: 'CC-BY-4.0', url, where: `vendor/${b.id}/ (inside ${b.name})` });
  }
  ok(r === 'added' ? `Credits added to ${pretty(path.join(dir, 'CREDITS.md'))}${ccby.length ? ` (${ccby.length} part(s) inside it are CC BY: name them in the game's credits screen)` : ''}.` : 'Its credits were already in CREDITS.md.');
}

async function checkDeps(dir, dest, install) {
  const bp = readJson(path.join(dest, 'package.json'));
  if (!bp?.dependencies) return;
  const gp = readJson(path.join(dir, 'package.json')) || {};
  const have = { ...(gp.dependencies || {}), ...(gp.devDependencies || {}) };
  const missing = Object.entries(bp.dependencies).filter(([k]) => !have[k]).map(([k, v]) => `${k}@${v}`);
  if (have.three && bp.dependencies.three && bp.dependencies.three.replace(/[^\d.]/g, '') !== String(have.three).replace(/[^\d.]/g, '')) {
    say(`  note  the block was made with three ${bp.dependencies.three}; the game has ${have.three}. Usually fine; keep one copy with  resolve: { dedupe: ['three'] }  in vite.config.js.`);
  }
  if (!missing.length) { ok('The game already has every package the block needs.'); return; }
  if (!install) {
    say(`  note  the block also needs: ${missing.join(', ')}. Install them when you use it:  node tools/blocks/add.mjs ${path.basename(dest)} --install --force  or  cd my-game && npm install ${missing.join(' ')}`);
    return;
  }
  say(`Installing what the block needs: ${missing.join(', ')}...`);
  const r = await run('npm', ['install', '--no-audit', '--no-fund', ...missing], { cwd: dir, inherit: true, timeout: 10 * 60 * 1000 });
  if (r.code !== 0) throw new HelperError('npm couldn\'t install the block\'s packages.', `Try by hand:  cd my-game && npm install ${missing.join(' ')}`);
  ok('Installed.');
}

function nextSteps(b, dest) {
  const howTo = dest && ['HOW-TO-USE.md', 'README.md', 'readme.md'].map((f) => path.join(dest, f)).find((f) => fs.existsSync(f));
  say('');
  if (howTo) ok(`How to use it: read ${pretty(howTo)}`);
  else if (b.agent_docs) ok(`How to use it: read ${b.agent_docs}`);
  if (b.how_to_add && !/tools\/blocks\/add\.mjs/.test(b.how_to_add)) say(`  ${b.how_to_add}`);
  if (b.renderer === 'webgpu' || b.renderer === 'both') warn(`${b.name} needs three.js's WebGPU renderer (import from 'three/webgpu'); the starter uses WebGL. Switching is a real job: only do it if this block is the heart of the game.`);
  if (b.not_for) say(`  Not for: ${b.not_for}`);
  say(`\nNext: import what you need from vendor/${b.id}/ in the game code (e.g. from src/game/: '../../vendor/${b.id}/...'), set its colours from palette.json, and note the decision in ASSETS.md.`);
}
