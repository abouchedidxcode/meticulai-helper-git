#!/usr/bin/env node
// Record a play-through in the hidden browser: video paced by GAME time, contact sheets, screenshots and a log.
// The critics (agents/critic-*.md) watch these instead of guessing from single screenshots.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getArgs } from '../lib/args.mjs';
import { HelperError, bad, detail, nextStep, ok, runTool, say, warn } from '../lib/log.mjs';
import { gameDir, helperDir, pretty, readHelper, slugify, stamp } from '../lib/paths.mjs';
import { launch, newGamePage, openGame, withBrowserLock } from '../lib/browser.mjs';
import { buildGame, ensureServer, startStatic } from '../lib/server.mjs';
import { contactSheets, encodeFrames, findFfmpeg, sampleTimes, timeLabel } from '../lib/ffmpeg.mjs';
import { sleep } from '../lib/proc.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCRIPT = path.join(HERE, 'scripts', 'first-minute.txt');

const HELP = `
node tools/play/record.mjs [--script file] [--seconds 60] [--bot] [--seed 1] [--name label]

Plays your game in a hidden browser and records it, so agents can watch what happens.
Writes a folder in my-game/recordings/ with:
  video.mp4       the play-through (paced by game time, so it plays at real speed)
  sheet-01.jpg..  4x3 grids of moments, each stamped with the game time
  shots/*.png     screenshots taken by "shot" lines in the script
  log.txt         what was pressed, the game's state every second, errors, frame rate

Options:
  --script <file>     a play script (default: tools/play/scripts/first-minute.txt, or none with --bot)
  --seconds <n>       how many seconds of game time to record (default 60)
  --bot               let the game's built-in bot play (adds ?bot=1)
  --seed <n>          random seed, so runs can be repeated (default 1)
  --name <label>      a word for the folder name, e.g. "jump-test"
  --url-extra "a=1"   extra URL switches for the game
  --build             record a production build instead of the dev server (nothing can reload it)
  --every <s>         seconds of game time between sheet tiles (default: fits 3 sheets)
  --keep-frames       keep every captured frame as a picture (big)
  --dir <path>        use a different game folder (default: my-game/)
  --verbose           show technical details

Play script: one command per line, # starts a comment. Times are in GAME milliseconds.
  press Enter         tap a key (KeyW, KeyA, Space, ArrowLeft, Enter, Escape, ShiftLeft...)
  hold KeyW 2000      hold a key for 2000 ms
  down Space / up Space
  click 640 360       click at x y (the screen is 1280 x 720)
  move 700 300        move the mouse
  mousedown / mouseup hold or release the left mouse button
  wait 500            let the game run for 500 ms
  shot after-jump     save a screenshot named after-jump.png
  skip level2         jump to a named moment (calls __game.skipTo)
  note any text       write a line into the log
`;

const COMMANDS = {
  press: 1, hold: 2, down: 1, up: 1, click: 2, move: 2, mousedown: 0, mouseup: 0, wait: 1, shot: 1, skip: 1, note: 0,
};

function parseScript(text, file) {
  const out = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) return;
    const [cmd, ...rest] = line.split(/\s+/);
    const c = cmd.toLowerCase();
    if (!(c in COMMANDS)) throw new HelperError(`line ${i + 1} of ${path.basename(file)} has an unknown command "${cmd}".`, 'Use one of: ' + Object.keys(COMMANDS).join(', ') + '. Run with --help for examples.');
    if (rest.length < COMMANDS[c]) throw new HelperError(`line ${i + 1} of ${path.basename(file)} ("${line}") is missing a value.`, 'Run with --help to see how each command is written.');
    for (const [k, v] of [['hold', 1], ['click', 0], ['click', 1], ['move', 0], ['move', 1], ['wait', 0]]) {
      if (c === k && !Number.isFinite(Number(rest[v]))) throw new HelperError(`line ${i + 1} of ${path.basename(file)} ("${line}") needs a number.`, 'Run with --help to see how each command is written.');
    }
    out.push({ c, args: rest, line, n: i + 1 });
  });
  return out;
}

/** Map a wall-clock moment to game time by interpolating the sampled (wall, game time) pairs. */
function gameTimeAt(samples, wall) {
  if (!samples.length) return null;
  if (wall <= samples[0].wall) return samples[0].t;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (wall <= b.wall) return a.t + (b.t - a.t) * ((wall - a.wall) / Math.max(1, b.wall - a.wall));
  }
  return samples.at(-1).t;
}

await runTool(async () => {
  const { values: a } = getArgs({
    script: { type: 'string' }, seconds: { type: 'number', default: 60 }, bot: { type: 'boolean' }, seed: { type: 'number', default: 1 },
    name: { type: 'string' }, 'url-extra': { type: 'string' }, build: { type: 'boolean' }, every: { type: 'number' }, 'keep-frames': { type: 'boolean' },
  }, HELP);
  const dir = gameDir(a.dir);
  readHelper(dir); // friendly error if there is no game yet
  if (!findFfmpeg()) throw new HelperError('ffmpeg (the video tool) is not installed, so I cannot make the video.', 'Run  node tools/doctor.mjs --fix  and try again.');
  if (!(a.seconds > 0)) throw new HelperError('--seconds must be more than 0.', 'Try --seconds 60.');

  // the play script
  let scriptFile = a.script ? path.resolve(a.script) : (a.bot ? null : DEFAULT_SCRIPT);
  if (scriptFile && !fs.existsSync(scriptFile)) {
    const inKit = path.join(HERE, 'scripts', a.script);
    if (a.script && fs.existsSync(inKit)) scriptFile = inKit;
    else throw new HelperError(`I can't find the play script ${a.script}.`, 'Check the file name. Example scripts are in tools/play/scripts/.');
  }
  const script = scriptFile ? parseScript(fs.readFileSync(scriptFile, 'utf8'), scriptFile) : [];

  // where the game runs
  let base, staticSrv = null;
  if (a.build) {
    say('Building a frozen copy of the game to record...');
    const out = path.join(helperDir(dir), 'record-build');
    await buildGame(dir, out);
    staticSrv = await startStatic(out);
    base = staticSrv.url;
  } else {
    const srv = await ensureServer(dir, { quiet: false });
    base = `http://127.0.0.1:${srv.port}/`;
  }
  const extra = (a['url-extra'] || '').replace(/^[?&]+/, '');
  const url = `${base}?autostart=1&seed=${a.seed}&test=0${a.bot ? '&bot=1' : ''}${extra ? `&${extra}` : ''}`;

  const label = slugify(a.name || (scriptFile ? path.basename(scriptFile).replace(/\.[^.]+$/, '') : '') || (a.bot ? 'bot' : 'play'));
  const outDir = path.join(dir, 'recordings', `${stamp()}-${label}`);
  const shotsDir = path.join(outDir, 'shots');
  const framesDir = path.join(outDir, 'frames');
  fs.mkdirSync(shotsDir, { recursive: true });

  say(`Recording ${a.seconds} seconds of game time${a.bot ? ' (the bot plays)' : ''}${scriptFile ? ` with the script ${path.basename(scriptFile)}` : ''}...`);
  let result;
  try {
    result = await withBrowserLock(async () => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const r = await recordOnce({ url, script, seconds: a.seconds, framesDir, shotsDir });
        if (!r.reloaded) return r;
        warn('The page reloaded in the middle of the recording (a file probably changed). Starting again.');
        fs.rmSync(framesDir, { recursive: true, force: true });
        fs.rmSync(shotsDir, { recursive: true, force: true });
        fs.mkdirSync(shotsDir, { recursive: true });
        if (attempt === 3) throw new HelperError('the page kept reloading during the recording.', 'Wait until agents stop editing files, or record a frozen copy with  --build.');
      }
    }, { label: `record ${pretty(dir)}` });
  } finally {
    if (staticSrv) await staticSrv.close();
  }

  // video paced by game time (real time where the game clock was stopped, e.g. in a menu)
  const frames = result.frames
    .map((f) => ({ ...f, t: gameTimeAt(result.samples, f.wall) }))
    .filter((f) => f.t != null)
    .sort((x, y) => x.wall - y.wall);
  for (let i = 0; i < frames.length; i++) {
    const nx = frames[i + 1];
    const dGame = nx ? nx.t - frames[i].t : 1 / 30;
    const dWall = nx ? (nx.wall - frames[i].wall) / 1000 : 1 / 30;
    frames[i].dur = dGame > 0.0005 ? dGame : dWall;
  }
  const log = result.log;
  let video = null, sheets = [];
  if (frames.length >= 2) {
    say('Making the video and contact sheets...');
    video = await encodeFrames(frames, path.join(outDir, 'video.mp4'));
    const t0 = frames[0].t, t1 = frames.at(-1).t;
    const times = sampleTimes(Math.max(0.1, t1 - t0), { every: a.every }).map((x) => t0 + x);
    const tiles = times.map((t) => {
      let best = frames[0];
      for (const f of frames) { if (f.t <= t) best = f; else break; }
      return { input: best.file, label: timeLabel(best.t) };
    });
    sheets = await contactSheets(tiles, path.join(outDir, 'sheet-%02d.jpg'));
  } else {
    bad('Too few frames were captured to make a video.');
  }
  if (!a['keep-frames']) fs.rmSync(framesDir, { recursive: true, force: true });
  if (!fs.readdirSync(shotsDir).length) fs.rmSync(shotsDir, { recursive: true, force: true });

  const gameSecs = result.tEnd - result.tStart;
  const wallSecs = (result.wallEnd - result.wallStart) / 1000;
  const fps = wallSecs > 0 ? (result.framesEnd - result.framesStart) / wallSecs : 0;
  log.push('');
  log.push(`summary: ${gameSecs.toFixed(1)} s of game time in ${wallSecs.toFixed(1)} s of real time; ${frames.length} frames captured`);
  log.push(`frame rate: the game drew ${fps.toFixed(1)} frames per real second in the hidden browser (a real browser is usually faster)`);
  log.push(`errors: ${result.errors.length}`);
  for (const e of result.errors) log.push(`  ${e}`);
  fs.writeFileSync(path.join(outDir, 'log.txt'), log.join('\n') + '\n');

  say('');
  ok(`Recorded ${gameSecs.toFixed(1)} s of game time (took ${wallSecs.toFixed(0)} s), ${frames.length} frames, about ${fps.toFixed(0)} fps in the hidden browser.`);
  if (result.errors.length) bad(`The game had ${result.errors.length} error(s) while playing. The first: ${result.errors[0].slice(0, 300)}`);
  else ok('No errors while playing.');
  if (result.stalled) warn('The game clock stopped moving for a while (a menu, a pause, or a freeze). See log.txt.');
  say(`\nFolder: ${pretty(outDir)}`);
  say(`  ${video ? 'video.mp4, ' : ''}${sheets.length} contact sheet(s)${result.shots ? `, ${result.shots} screenshot(s)` : ''}, log.txt`);
  say('\nGive the sheets and the video to the critic agents.');
  if (!video) { nextStep('Check that the game draws with  node tools/serve.mjs --check, then record again.'); return 1; }
  return 0;
});

async function recordOnce({ url, script, seconds, framesDir, shotsDir }) {
  fs.mkdirSync(framesDir, { recursive: true });
  const browser = await launch();
  const log = [`recording of ${url}`, `started ${new Date().toISOString()}`, ''];
  const errors = [];
  const samples = [];
  const frames = [];
  let shots = 0;
  let stalled = false;
  try {
    const { page, problems, navigations } = await newGamePage(browser);
    try {
      await openGame(page, url);
    } catch (e) {
      if (e instanceof HelperError && problems.length) e.message += ` First error: ${problems[0].slice(0, 300)}`;
      throw e;
    }
    const navAtStart = navigations();
    const wallStart = Date.now();
    const rd = () => page.evaluate(() => ({ t: window.__game.time, f: window.__game.frames, e: (window.__game.errors || []).length }));
    let cur = await rd();
    const tStart = cur.t, framesStart = cur.f;
    let seenErrors = cur.e, seenProblems = problems.length, lastLoggedSec = -1;
    const wallLimit = wallStart + seconds * 15000 + 60000;
    const deadline = tStart + seconds;
    const stamp = () => `[t=${(cur.t ?? 0).toFixed(2)}]`;
    let stop = false, reloaded = false, lastMove = Date.now(), lastT = cur.t;

    // screencast: every frame the page shows, stamped with the moment it was shown
    const cdp = await page.context().newCDPSession(page);
    cdp.on('Page.screencastFrame', async (f) => {
      const file = path.join(framesDir, `f${String(frames.length).padStart(6, '0')}.jpg`);
      try {
        fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
        frames.push({ file, wall: f.metadata?.timestamp ? f.metadata.timestamp * 1000 : Date.now() });
      } catch { /* folder removed during a retry */ }
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });

    // sampler: game time, state every game second, new errors
    const sampler = (async () => {
      while (!stop) {
        if (navigations() !== navAtStart) { reloaded = true; stop = true; break; }
        let s;
        try {
          s = await page.evaluate(() => ({
            t: window.__game?.time, f: window.__game?.frames, e: (window.__game?.errors || []).length,
            state: JSON.stringify(window.__game?.state ?? null),
          }));
        } catch { if (navigations() !== navAtStart) { reloaded = true; stop = true; } break; }
        cur = s;
        samples.push({ wall: Date.now(), t: s.t });
        if (s.t !== lastT) { lastT = s.t; lastMove = Date.now(); }
        else if (Date.now() - lastMove > 8000 && !stalled) { stalled = true; log.push(`${stamp()} the game clock has not moved for 8 s of real time`); }
        const sec = Math.floor(s.t);
        if (sec > lastLoggedSec) { lastLoggedSec = sec; log.push(`${stamp()} state ${s.state && s.state.length > 1500 ? s.state.slice(0, 1500) + '...' : s.state}`); }
        if (s.e > seenErrors) {
          const errs = await page.evaluate((from) => (window.__game.errors || []).slice(from).map((x) => String(x?.message || x)), seenErrors).catch(() => []);
          seenErrors = s.e;
          for (const e of errs) { errors.push(`Game error: ${e}`); log.push(`${stamp()} GAME ERROR ${e}`); }
        }
        while (seenProblems < problems.length) { const p = problems[seenProblems++]; errors.push(p); log.push(`${stamp()} ${p}`); }
        if (cur.t >= deadline || Date.now() > wallLimit) stop = true;
        await sleep(50);
      }
    })();

    /** wait `ms` of game time (cut short at the end of the recording or if the clock stops) */
    const waitGame = async (ms) => {
      const target = Math.min((cur.t ?? 0) + ms / 1000, deadline);
      while (!stop && (cur.t ?? 0) < target) {
        if (Date.now() - lastMove > 8000) { await sleep(Math.min(ms, 10000)); return; } // clock stopped: wait in real time
        await sleep(20);
      }
    };

    for (const s of script) {
      if (stop) { log.push(`${stamp()} (time is up: the rest of the script was not played)`); break; }
      log.push(`${stamp()} ${s.line}`);
      const [x, y] = s.args;
      switch (s.c) {
        case 'press': await page.keyboard.press(x); break;
        case 'down': await page.keyboard.down(x); break;
        case 'up': await page.keyboard.up(x); break;
        case 'hold': await page.keyboard.down(x); await waitGame(Number(y)); await page.keyboard.up(x); break;
        case 'click': await page.mouse.click(Number(x), Number(y)); break;
        case 'move': await page.mouse.move(Number(x), Number(y), { steps: 5 }); break;
        case 'mousedown': await page.mouse.down(); break;
        case 'mouseup': await page.mouse.up(); break;
        case 'wait': await waitGame(Number(x)); break;
        case 'shot': {
          const name = slugify(x);
          await page.screenshot({ path: path.join(shotsDir, `${name}.png`) });
          shots++;
          log.push(`${stamp()} saved shots/${name}.png`);
          break;
        }
        case 'skip': {
          const r = await page.evaluate((n) => { if (typeof window.__game.skipTo !== 'function') return 'no skipTo'; window.__game.skipTo(n); return 'ok'; }, x).catch((e) => e.message);
          if (r !== 'ok') log.push(`${stamp()} skip failed: ${r}`);
          break;
        }
        case 'note': break;
        default: break;
      }
    }
    if (!stop) log.push(`${stamp()} script finished; recording until ${seconds} s of game time`);
    while (!stop) {
      if (Date.now() - lastMove > 8000) { log.push(`${stamp()} stopping early: the game clock stopped`); break; }
      await sleep(50);
    }
    stop = true;
    await sampler;
    await cdp.send('Page.stopScreencast').catch(() => {});
    await sleep(100);
    if (reloaded) return { reloaded: true };
    if (Date.now() > wallLimit) log.push(`${stamp()} stopping early: it took too long in real time`);
    const fin = await rd().catch(() => cur);
    return {
      reloaded: false, frames, samples, log, errors, shots, stalled,
      tStart, tEnd: fin.t ?? cur.t, framesStart, framesEnd: fin.f ?? cur.f, wallStart, wallEnd: Date.now(),
    };
  } finally {
    await browser.close().catch(() => {});
    detail(`captured ${frames.length} frames`);
  }
}
