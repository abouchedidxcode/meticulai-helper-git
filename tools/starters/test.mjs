#!/usr/bin/env node
// For people working ON the kit: prove a starter works from a clean copy, the way a new user gets it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, bad, detail, ok, runTool, say, warn } from '../lib/log.mjs';
import { REPO_ROOT, pretty, readJson } from '../lib/paths.mjs';
import { run } from '../lib/proc.mjs';
import { canvasStats, launch, newGamePage, openGame, waitGameTime, withBrowserLock } from '../lib/browser.mjs';
import { buildGame, ensureServer, stopServer } from '../lib/server.mjs';
import { loadStarter } from './lib.mjs';

const HELP = `
node tools/starters/test.mjs <id> [--seconds 40] [--preview] [--keep] [--no-build] [--from <game folder>]

Kit maintenance. Makes a fresh game from the starter (as  init.mjs --starter <id>  does), then checks, in one
hidden browser:
  1. the title screen draws and waits
  2. the bot plays for --seconds of game time: no errors, the game state keeps changing, the screen is
     not black, the standard events fire, the controls card lists the controls
  3. skipTo('win') and skipTo('lose') each reach the end card, and Play again starts a new run
  4. the game builds for shipping
It also flags Math.random, timers and wall-clock time in the game code (they break replays and tests).

  --preview      save a picture of the bot's play as starters/<id>/preview.jpg (and the title as title.jpg)
  --from <dir>   test an existing game folder instead of a fresh copy (while building a starter)
  --keep         keep the fresh copy (in .starters-work/_test-<id>-<n>/) for a look afterwards
  --seconds N    how long the bot plays (game time, default 40)
`;

const EVENTS = ['start', 'jump', 'land', 'pickup', 'hit', 'death', 'score', 'win'];

await runTool(async () => {
  const { values: a, positionals } = getArgs({ seconds: { type: 'number', default: 40 }, preview: { type: 'boolean' }, keep: { type: 'boolean' }, 'no-build': { type: 'boolean' }, from: { type: 'string' } }, HELP);
  const id = positionals[0];
  if (!id) throw new HelperError('say which starter to test.', 'Example:  node tools/starters/test.mjs island');
  const starter = a.from ? { id, name: id, dir: path.join(REPO_ROOT, 'starters', id) } : loadStarter(id);
  const fails = [];
  const notes = [];
  const fail = (m) => { fails.push(m); bad(m); };
  const note = (m) => { notes.push(m); warn(m); };

  // --- a fresh copy, as a new user gets it
  let dir = a.from ? path.resolve(a.from) : path.join(REPO_ROOT, '.starters-work', `_test-${id}-${process.pid}`); // per run: two agents may test the same starter at once
  if (!a.from) {
    fs.rmSync(dir, { recursive: true, force: true });
    say(`Making a fresh game from the "${id}" starter...`);
    const r = await run(process.execPath, [path.join(REPO_ROOT, 'tools', 'init.mjs'), '--name', `Test ${id}`, '--starter', id, '--dir', dir], { inherit: false, timeout: 10 * 60 * 1000 });
    detail(r.stdout, r.stderr);
    if (r.code !== 0) throw new HelperError(`init.mjs --starter ${id} failed.`, (r.stdout || r.stderr).trim().split('\n').slice(-6).join('\n'));
    ok('A fresh copy installs.');
  }

  // --- the code rules
  const gameSrc = path.join(dir, 'src', 'game');
  const files = [];
  const walk = (d) => { for (const n of fs.readdirSync(d)) { const f = path.join(d, n); if (fs.statSync(f).isDirectory()) walk(f); else if (/\.(js|mjs)$/.test(n)) files.push(f); } };
  walk(gameSrc);
  const rules = [[/\bMath\.random\s*\(/, 'Math.random() (use ctx.rng)'], [/\bsetTimeout\s*\(|\bsetInterval\s*\(/, 'a wall-clock timer (count dt instead)'], [/\bDate\.now\s*\(|\bperformance\.now\s*\(/, 'wall-clock time (use game time)']];
  let lines = 0;
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    lines += text.split('\n').length;
    text.split('\n').forEach((line, i) => {
      if (/^\s*\/\//.test(line) || /test-ok/.test(line)) return;
      for (const [re, what] of rules) if (re.test(line)) note(`${pretty(f)}:${i + 1} uses ${what}`);
    });
  }
  say(`  game code: ${files.length} files, ${lines} lines`);
  const tuning = readJson(path.join(dir, 'src', 'tuning.json'), null);
  if (!tuning) fail('src/tuning.json is missing or not valid JSON.');
  else if (!tuning.audio?.master || !tuning.audio?.music || !tuning.audio?.sfx) fail('src/tuning.json must keep the "audio" group (master, music, sfx): main.js reads it.');
  for (const need of ['STARTER.md']) if (!a.from && !fs.existsSync(path.join(dir, need))) note(`${need} is missing (the agent's guide to this starter).`);

  // --- play it
  const { url } = await ensureServer(dir, { quiet: true });
  const shots = {};
  let fps = null;
  try {
    await withBrowserLock(async () => {
      const browser = await launch();
      try {
        const { page, problems } = await newGamePage(browser);
        const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.state)));
        const errors = () => page.evaluate(() => (window.__game.errors || []).map((x) => String(x?.message || x)));

        // 1. title
        await openGame(page, `${url}/?seed=1&mute=1`);
        await new Promise((r) => setTimeout(r, 1500));
        const s0 = await state();
        if (s0.scene !== 'title') fail(`Without ?autostart the game should wait on its title screen; scene is "${s0.scene}".`);
        const lit0 = await canvasStats(page);
        if (lit0.lit < 0.02) fail('The title screen is black.');
        else ok('The title screen draws and waits.');
        if (a.preview) shots.title = await page.screenshot({ type: 'jpeg', quality: 86 });

        // 2. the bot plays
        await openGame(page, `${url}/?autostart=1&bot=1&seed=1&test=1&mute=1`);
        await page.evaluate((names) => {
          window.__seen = {};
          for (const n of names) window.__game.events.on(n, () => { window.__seen[n] = (window.__seen[n] || 0) + 1; });
        }, EVENTS);
        const controls = await page.evaluate(() => document.querySelectorAll('.controls-fixed .control').length);
        if (!controls) fail('info.controls is empty: the controls card shows nothing.');
        const seen = new Set();
        const t0 = Date.now();
        const f0 = await page.evaluate(() => window.__game.frames);
        const slices = 8;
        let stalled = false;
        for (let i = 0; i < slices; i++) {
          const w = await waitGameTime(page, a.seconds / slices);
          stalled ||= !!w.stalled;
          seen.add(JSON.stringify(await state()));
          if (a.preview && i === Math.floor(slices * 0.4)) {
            // the picture shows the game as a player sees it: no test buttons, no controls card
            await page.addStyleTag({ content: '.test-bar, .controls-fixed { visibility: hidden !important; }' }).then(async (tag) => {
              shots.preview = await page.screenshot({ type: 'jpeg', quality: 86 });
              await tag.evaluate((n) => n.remove());
            });
          }
        }
        const f1 = await page.evaluate(() => window.__game.frames);
        fps = Math.round(((f1 - f0) / ((Date.now() - t0) / 1000)) * 10) / 10;
        const errs = [...(await errors()), ...problems];
        const lit = await canvasStats(page);
        const events = await page.evaluate(() => window.__seen);
        if (errs.length) fail(`Errors while the bot played:\n${[...new Set(errs)].slice(0, 6).map((e) => `          ${e.slice(0, 300)}`).join('\n')}`);
        if (stalled) fail('The game clock stopped while the bot played (a crash, or the bot never restarts after the end card).');
        if (seen.size < Math.ceil(slices * 0.6)) fail(`The game state barely changed while the bot played (${seen.size} different states in ${slices} looks). Is the bot doing anything, and does state() report it?`);
        if (lit.lit < 0.05) fail('The screen is (nearly) black during play.');
        const fired = Object.keys(events).filter((n) => n !== 'start');
        if (!fired.length) fail(`None of the standard events fired in ${a.seconds} s of bot play (${EVENTS.slice(1).join(', ')}). Recording and critic tools listen for them.`);
        if (!errs.length && !stalled && seen.size >= Math.ceil(slices * 0.6) && fired.length) ok(`The bot played ${a.seconds} s of game time: no errors, events: ${Object.entries(events).map(([k, v]) => `${k} x${v}`).join(', ')}.`);
        say(`  about ${fps} frames per second in the hidden browser (a rough number; machine load changes it)`);
        if (fps < 30) note(`Low frame rate in the test (${fps} fps). Check it again on a quiet machine with  node tools/play/fps.mjs.`);

        // 3. win, lose, play again
        for (const name of ['win', 'lose']) {
          problems.length = 0;
          await openGame(page, `${url}/?autostart=1&seed=1&test=1&mute=1`);
          await waitGameTime(page, 1);
          const known = await page.evaluate((n) => window.__game.skipTo(n), name);
          if (!known) { fail(`The game has no skip moment called "${name}" (testmode.add('${name}', ...)).`); continue; }
          let over = false;
          for (let i = 0; i < 40 && !over; i++) { await waitGameTime(page, 0.25, { stallMs: 600 }); over = (await state()).scene === 'over'; }
          if (!over) { fail(`skipTo('${name}') did not reach the end card within 10 seconds.`); continue; }
          const card = await page.evaluate(() => ({ text: document.querySelector('.screen')?.innerText || '', button: !!document.querySelector('.screen button.primary') }));
          if (card.text.trim().length < 20) fail(`The end card after "${name}" says almost nothing. Give ctx.end() a heading and a reason.`);
          if (name === 'lose' && shots && a.preview) shots.lose = await page.screenshot({ type: 'jpeg', quality: 86 });
          await page.evaluate(() => document.querySelector('.screen button.primary')?.click());
          await new Promise((r) => setTimeout(r, 600));
          const again = await state();
          const errs2 = [...(await errors()), ...problems];
          if (again.scene !== 'playing') fail(`After "${name}", Play again did not start a new run (scene "${again.scene}").`);
          else if (errs2.length) fail(`Errors around "${name}": ${errs2[0].slice(0, 300)}`);
          else ok(`"${name}" reaches the end card and Play again works.`);
        }
      } finally {
        await browser.close().catch(() => {});
      }
    }, { label: `starter test ${id}` });
  } finally {
    await stopServer(dir).catch(() => {});
  }

  if (a.preview && !fails.length) {
    const out = starter.dir;
    fs.mkdirSync(out, { recursive: true });
    if (shots.preview) fs.writeFileSync(path.join(out, 'preview.jpg'), shots.preview);
    if (shots.title) fs.writeFileSync(path.join(out, 'title.jpg'), shots.title);
    ok(`Saved ${pretty(path.join(out, 'preview.jpg'))} and title.jpg.`);
  }

  // 4. it ships
  if (!a['no-build']) {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `starter-${id}-`));
    try {
      await buildGame(dir, outDir);
      const size = fs.readdirSync(outDir, { recursive: true }).reduce((n, f) => { const st = fs.statSync(path.join(outDir, f)); return n + (st.isFile() ? st.size : 0); }, 0);
      ok(`It builds for shipping (${(size / 1048576).toFixed(1)} MB).`);
    } catch (e) {
      fail(`It does not build for shipping: ${e.message}`);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }

  if (!a.from && !a.keep && !fails.length) fs.rmSync(dir, { recursive: true, force: true });
  say('');
  if (fails.length) { say(`FAILED: ${fails.length} problem${fails.length > 1 ? 's' : ''} in the "${id}" starter${a.from || a.keep ? '' : ` (the copy is kept in ${pretty(dir)})`}.`); return 1; }
  say(`PASSED: the "${id}" starter works from a clean copy${notes.length ? ` (${notes.length} note${notes.length > 1 ? 's' : ''} above)` : ''}.`);
  return 0;
});
