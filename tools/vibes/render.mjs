#!/usr/bin/env node
// For people working ON the kit: draw the kit's own starter games with each vibe and save the pictures the gallery shows.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, bad, detail, ok, runTool, say } from '../lib/log.mjs';
import { REPO_ROOT, pretty, readJson, writeJson } from '../lib/paths.mjs';
import { httpGet, run, sleep, waitFor } from '../lib/proc.mjs';
import { canvasStats, launch, newGamePage, openGame, waitGameTime, withBrowserLock } from '../lib/browser.mjs';
import { ensureServer, stopServer } from '../lib/server.mjs';
import { listStarters } from '../starters/lib.mjs';
import { applyLook } from '../looks/lib.mjs';
import { listVibes, loadVibe, putVibe, vibesDir } from './lib.mjs';

const HELP = `
node tools/vibes/render.mjs [--vibe <id>] [--starter <id> ...] [--all] [--seconds 8] [--force] [--limit N]

Kit maintenance. For each vibe: takes a test game made from a starter, puts the vibe on it (colours, light, look),
lets the bot play about 8 seconds, and saves the picture as vibes/<id>/in-kit-<starter>.jpg (1280x720, as a player
sees it). The picture is recorded in the vibe's "renders" list. The gallery shows it next to the mood pictures, so
people see what the kit really draws.

  --vibe <id>      only this vibe (default: every vibe, drafts included)
  --starter <id>   draw on this starter (repeat for more). Default: the first starter named in the vibe's
                   "good_for", else island
  --all            draw every vibe on every ready starter
  --seconds N      game seconds the bot plays before the picture (default 8)
  --force          draw again even when the picture is already there (by default those are skipped, so a long
                   batch that stopped half way can simply be run again)
  --limit N        draw at most N pictures this time (run it again for the next ones)

One hidden browser for the whole batch, one game server at a time. The test games are kept in
.starters-work/_render-<starter>/ and reused (only the colours and the look are swapped between vibes).
Then run  node tools/vibes/build-gallery.mjs.
`;

await runTool(async () => {
  // --starter can repeat
  const argv = process.argv.slice(2);
  const startersWanted = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--starter') {
      argv.splice(i, 1);
      while (argv[i] != null && !argv[i].startsWith('--')) startersWanted.push(...argv.splice(i, 1));
      i--;
    } else if (argv[i].startsWith('--starter=')) { startersWanted.push(argv[i].slice(10)); argv.splice(i, 1); i--; }
  }
  const { values: a } = getArgs({ vibe: { type: 'string' }, all: { type: 'boolean' }, seconds: { type: 'number', default: 8 }, from: { type: 'string' }, force: { type: 'boolean' }, limit: { type: 'number' } }, HELP, argv);
  const dir = vibesDir(a.from);
  const vibes = a.vibe ? [loadVibe(a.vibe, dir)] : listVibes(dir, { all: true });
  if (!vibes.length) throw new HelperError(`there are no vibes in ${pretty(dir)}.`, 'Add vibes/<id>/vibe.json first.');
  const starters = listStarters();
  const ready = starters.filter((s) => (s.status || 'ready') === 'ready').map((s) => s.id);
  if (!ready.includes('island')) ready.unshift('island');
  for (const s of startersWanted) if (!ready.includes(s) && !starters.some((x) => x.id === s)) throw new HelperError(`there is no starter called "${s}".`, `The starters are: ${ready.join(', ')}.`);

  // which (starter, vibe) pictures to make, grouped by starter so each test game is served once
  const jobs = new Map();
  let skipped = 0;
  let queued = 0;
  const limit = a.limit > 0 ? Math.floor(a.limit) : Infinity;
  const done = (v, starter) => (Array.isArray(v.renders) ? v.renders : []).some((r) => r?.starter === starter && r.file && fs.existsSync(path.join(v.dir, r.file)));
  const add = (starter, vibe) => {
    if (!a.force && done(vibe, starter)) { skipped++; return; }
    if (queued >= limit) return;
    queued++;
    if (!jobs.has(starter)) jobs.set(starter, []);
    jobs.get(starter).push(vibe);
  };
  for (const v of vibes) {
    const list = a.all ? ready : startersWanted.length ? startersWanted : [(Array.isArray(v.good_for) ? v.good_for : []).find((g) => ready.includes(g)) || 'island'];
    for (const s of list) add(s, v);
  }
  const total = [...jobs.values()].reduce((n, l) => n + l.length, 0);
  const wanted = vibes.length;
  if (!total) {
    say(`Nothing to draw: ${skipped} picture${skipped === 1 ? ' is' : 's are'} already there (use --force to draw them again).`);
    return 0;
  }
  say(`Drawing ${total} picture${total > 1 ? 's' : ''} on ${[...jobs.keys()].join(', ')}${skipped ? ` (${skipped} already there, skipped; --force draws them again)` : ''}${Number.isFinite(limit) ? ` (--limit ${limit})` : ''}...`);

  // test games (made once, reused)
  const work = {};
  for (const s of jobs.keys()) {
    const w = path.join(REPO_ROOT, '.starters-work', `_render-${s}`);
    if (!fs.existsSync(path.join(w, 'helper.json')) || !fs.existsSync(path.join(w, 'node_modules'))) {
      fs.rmSync(w, { recursive: true, force: true });
      say(`Making a test game from the "${s}" starter (once; it is reused next time)...`);
      const r = await run(process.execPath, [path.join(REPO_ROOT, 'tools', 'init.mjs'), '--name', `Render ${s}`, '--starter', s, '--dir', w], { inherit: false, timeout: 10 * 60 * 1000 });
      detail(r.stdout, r.stderr);
      if (r.code !== 0) throw new HelperError(`init.mjs --starter ${s} failed.`, (r.stdout || r.stderr).trim().split('\n').slice(-6).join('\n'));
    }
    work[s] = w;
    // the starter's own colours, to put back afterwards
    const keep = path.join(w, '.helper', 'palette.starter.json');
    if (!fs.existsSync(keep)) { fs.mkdirSync(path.dirname(keep), { recursive: true }); fs.copyFileSync(path.join(w, 'palette.json'), keep); }
  }

  const fails = [];
  const made = [];
  await withBrowserLock(async () => {
    const browser = await launch();
    try {
      const { page, problems } = await newGamePage(browser);
      for (const [starter, list] of jobs) {
        const w = work[starter];
        const { url } = await ensureServer(w, { quiet: true });
        try {
          for (const v of list) {
            try {
              problems.length = 0;
              const r = await putVibe(w, v, { backup: false, quietFlat: true });
              // the dev server notices changed files a moment later: wait until it serves this vibe
              const lookMark = `id: '${r.look.id}'`;
              const colour = String(v.palette.colors.base[0]).toLowerCase();
              await waitFor(async () => (await httpGet(`${url}/src/look/index.js`, 3000).catch(() => null))?.body?.includes(lookMark), 15000, 200);
              await waitFor(async () => (await httpGet(`${url}/palette.json?import`, 3000).catch(() => null))?.body?.toLowerCase().includes(colour), 15000, 200);
              await sleep(300);
              await openGame(page, `${url}/?autostart=1&bot=1&seed=7&mute=1`);
              // the game must really be drawing with the vibe's colours (not the starter's own defaults)
              const using = await page.evaluate(async () => {
                try { return (await import('/src/core/look.js')).look.base[0]; } catch { return null; }
              });
              if (using && using.toLowerCase() !== colour.replace(/^#?/, '#')) {
                throw new HelperError(`the game is not using the vibe's colours (its first base colour is ${using}, the vibe's is ${colour}).`, 'src/core/look.js in the test game is not reading palette.json: check how it loads the file.');
              }
              await waitGameTime(page, a.seconds);
              const tag = await page.addStyleTag({ content: '.test-bar, .controls-fixed { visibility: hidden !important; }' });
              const shot = await page.screenshot({ type: 'jpeg', quality: 86 });
              await tag.evaluate((n) => n.remove());
              const stats = await canvasStats(page);
              const errs = [...new Set([...(await page.evaluate(() => (window.__game.errors || []).map((x) => String(x?.message || x)))), ...problems])];
              if (errs.length) throw new HelperError(`errors in the game: ${errs.slice(0, 2).map((e) => e.slice(0, 240)).join(' | ')}`);
              if (stats.lit < 0.03) throw new HelperError('the picture is (nearly) black.');
              const name = `in-kit-${starter}.jpg`;
              fs.writeFileSync(path.join(v.dir, name), shot);
              const jf = path.join(v.dir, 'vibe.json');
              const json = readJson(jf, {});
              const renders = (Array.isArray(json.renders) ? json.renders : []).filter((x) => x && x.file !== name);
              renders.push({ file: name, starter, look: r.look.id, date: new Date().toLocaleDateString('en-CA') });
              renders.sort((x, y) => (x.starter === 'island' ? 0 : 1) - (y.starter === 'island' ? 0 : 1) || String(x.starter).localeCompare(String(y.starter)));
              writeJson(jf, { ...json, renders });
              made.push(`${v.id} on ${starter}`);
              ok(`${v.id.padEnd(22)} on ${starter}: ${pretty(path.join(v.dir, name))}${r.lookMissing ? ` (look "${r.lookMissing}" is not in the kit: drawn plain)` : r.look.id !== 'none' ? ` (look ${r.look.id})` : ''}`);
            } catch (e) {
              fails.push(`${v.id} on ${starter}`);
              bad(`${v.id} on ${starter}: ${e.message}`);
              detail(e);
            }
          }
        } finally {
          // leave the test game plain, with the starter's own colours
          await applyLook(w, 'none', { quiet: true }).catch(() => {});
          const keep = path.join(w, '.helper', 'palette.starter.json');
          if (fs.existsSync(keep)) fs.copyFileSync(keep, path.join(w, 'palette.json'));
          await stopServer(w).catch(() => {});
        }
      }
    } finally {
      await browser.close().catch(() => {});
    }
  }, { label: 'vibes render' });

  say('');
  if (fails.length) { say(`FAILED: ${fails.length} of ${total} picture${total > 1 ? 's' : ''} (${fails.join('; ')}).`); return 1; }
  const left = vibes.filter((v) => !(Array.isArray(readJson(path.join(v.dir, 'vibe.json'), {}).renders) && readJson(path.join(v.dir, 'vibe.json'), {}).renders.length)).length;
  say(`PASSED: ${made.length} picture${made.length > 1 ? 's' : ''} saved.${left ? ` ${left} of ${wanted} vibes still have no picture: run this again to draw the next ones.` : ' Now run  node tools/vibes/build-gallery.mjs.'}`);
  return 0;
});
