#!/usr/bin/env node
// For people working ON the kit: draw every look on a starter game in ONE hidden browser, save each look's preview
// picture, check it survives a window resize and that screenshots still work, and measure what it costs.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, bad, detail, ok, runTool, say } from '../lib/log.mjs';
import { REPO_ROOT, pretty, readJson, writeJson } from '../lib/paths.mjs';
import { httpGet, run, sleep, waitFor } from '../lib/proc.mjs';
import { canvasStats, launch, newGamePage, openGame, waitGameTime, withBrowserLock } from '../lib/browser.mjs';
import { ensureServer, stopServer } from '../lib/server.mjs';
import { applyLook, listLooks, readOptionsFromCode } from './lib.mjs';

const HELP = `
node tools/looks/shots.mjs [look ids...] [--starter island] [--from <game folder>] [--out <folder>] [--no-save]

Kit maintenance. For each look (all of them by default): puts it on a test game, lets the bot play a few seconds,
saves looks/<id>/preview.jpg (1280x720), then checks that the look survives a window resize, that
window.__game.capture() still gives a picture, and that no errors appear. It also measures the time a whole frame
takes with the look on (waiting for the graphics chip to finish each frame) against the plain game, and writes the
numbers into look.json ("measured"). look.json's "options" are refreshed from the look's index.js.

  --starter <id>   which starter to draw on (default island); the test game lives in .starters-work/_looks-<starter>/
  --from <dir>     use this game folder instead (it is left with the plain look afterwards)
  --out <dir>      save the pictures here instead of looks/<id>/preview.jpg (and leave look.json alone)
  --no-save        check and measure only
  --seconds N      game seconds the bot plays before the picture (default 6)
`;

// Wraps the game's frame callback: with window.__timeFrames on, every frame is timed with the graphics chip made to
// finish its work, so the number is the real cost of a frame and not just "it kept up with the screen".
const TIMER = `(() => {
  let gl = null;
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const c = getContext.call(this, type, ...rest);
    if (c && /webgl/.test(type)) gl = c;
    return c;
  };
  window.__frameMs = [];
  const px = new Uint8Array(4);
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => {
    if (!window.__timeFrames || !gl) return cb(t);
    const t0 = performance.now();
    cb(t);
    // reading one pixel back makes the browser wait until the graphics chip has really drawn the frame
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    window.__frameMs.push(performance.now() - t0);
  });
})();`;

await runTool(async () => {
  const { values: a, positionals } = getArgs({ starter: { type: 'string', default: 'island' }, from: { type: 'string' }, out: { type: 'string' }, 'no-save': { type: 'boolean' }, seconds: { type: 'number', default: 6 } }, HELP);
  const all = listLooks();
  const want = positionals.length ? positionals.map((id) => all.find((l) => l.id === id) || (() => { throw new HelperError(`there is no look called "${id}".`, `The looks are: ${all.map((l) => l.id).join(', ')}.`); })()) : all;
  const save = !a['no-save'];
  const outDir = a.out ? path.resolve(a.out) : null;
  if (outDir) fs.mkdirSync(outDir, { recursive: true });

  // look.json options follow the code
  if (save && !outDir) {
    for (const l of want) {
      const file = path.join(l.dir, 'look.json');
      const json = readJson(file, {});
      const options = readOptionsFromCode(path.join(l.dir, 'index.js'));
      if (JSON.stringify(json.options) !== JSON.stringify(options)) { writeJson(file, { ...json, options }); l.options = options; }
    }
  }

  let dir = a.from ? path.resolve(a.from) : path.join(REPO_ROOT, '.starters-work', `_looks-${a.starter}`);
  if (!fs.existsSync(path.join(dir, 'helper.json'))) {
    if (a.from) throw new HelperError(`there is no game in ${pretty(dir)}.`, 'Leave out --from to let this tool make its own test game.');
    say(`Making a test game from the "${a.starter}" starter (once; it is reused next time)...`);
    const r = await run(process.execPath, [path.join(REPO_ROOT, 'tools', 'init.mjs'), '--name', `Looks ${a.starter}`, '--starter', a.starter, '--dir', dir], { inherit: false, timeout: 10 * 60 * 1000 });
    detail(r.stdout, r.stderr);
    if (r.code !== 0) throw new HelperError(`init.mjs --starter ${a.starter} failed.`, (r.stdout || r.stderr).trim().split('\n').slice(-6).join('\n'));
  }

  const results = [];
  const fails = [];
  const { url } = await ensureServer(dir, { quiet: true });
  try {
    await withBrowserLock(async () => {
      const browser = await launch();
      try {
        const { page, problems } = await newGamePage(browser, { initScripts: [TIMER] });
        const measure = async () => {
          await page.evaluate(() => { window.__frameMs.length = 0; window.__timeFrames = true; });
          const f0 = await page.evaluate(() => window.__game.frames);
          const t0 = Date.now();
          await sleep(3000);
          const m = await page.evaluate(() => { window.__timeFrames = false; return window.__frameMs.slice().sort((x, y) => x - y); });
          const f1 = await page.evaluate(() => window.__game.frames);
          const pct = (p) => (m.length ? Math.round(m[Math.min(m.length - 1, Math.floor(m.length * p))] * 100) / 100 : null);
          return { frame_ms: pct(0.5), frame_ms_p95: pct(0.95), fps: Math.round(((f1 - f0) / ((Date.now() - t0) / 1000)) * 10) / 10 };
        };
        const drawOne = async (id) => {
          problems.length = 0;
          await applyLook(dir, id, { quiet: true });
          // the dev server notices the changed file a moment later: wait until it serves the new look
          const marker = id === 'none' ? "id: 'none'" : `id: '${id}'`;
          await waitFor(async () => (await httpGet(`${url}/src/look/index.js`, 3000).catch(() => null))?.body?.includes(marker), 15000, 200);
          await openGame(page, `${url}/?autostart=1&bot=1&seed=7&mute=1`);
          const running = await page.evaluate(() => window.__look || 'none');
          if (running !== id) throw new HelperError(`the game is running the look "${running}", not "${id}".`, 'The dev server may be serving an old file: stop it and run this again.');
          await waitGameTime(page, a.seconds);
          const tag = await page.addStyleTag({ content: '.test-bar, .controls-fixed { visibility: hidden !important; }' });
          const shot = await page.screenshot({ type: 'jpeg', quality: 86 });
          await tag.evaluate((n) => n.remove());
          const stats = await canvasStats(page); // through __game.capture(): proves screenshots work with the look on
          const m = await measure();
          // resize: smaller, then back
          await page.setViewportSize({ width: 900, height: 620 });
          await sleep(500);
          const small = await canvasStats(page);
          await page.setViewportSize({ width: 1280, height: 720 });
          await sleep(400);
          const back = await canvasStats(page);
          const errs = [...(await page.evaluate(() => (window.__game.errors || []).map((x) => String(x?.message || x)))), ...problems];
          return { id, shot, stats, small, back, errs: [...new Set(errs)], ...m };
        };

        const plain = await drawOne('none');
        say(`  plain game: ${plain.frame_ms} ms a frame (typical), ${plain.fps} frames per second in the hidden browser`);
        if (outDir) fs.writeFileSync(path.join(outDir, 'none.jpg'), plain.shot);
        for (const l of want) {
          let r;
          try { r = await drawOne(l.id); } catch (e) { fails.push(l.id); bad(`${l.id}: ${e.message}`); detail(e); continue; }
          const problemsNow = [];
          if (r.errs.length) problemsNow.push(`errors: ${r.errs.slice(0, 3).map((e) => e.slice(0, 240)).join(' | ')}`);
          if (r.stats.source !== 'capture') problemsNow.push('window.__game.capture() gave no picture');
          if (r.stats.lit < 0.05) problemsNow.push('the picture is (nearly) black');
          if (r.small.lit < 0.05 || r.back.lit < 0.05) problemsNow.push('the picture went black after a window resize');
          const added = r.frame_ms != null && plain.frame_ms != null ? Math.max(0, Math.round((r.frame_ms - plain.frame_ms) * 10) / 10) : null;
          results.push({ ...r, added });
          if (problemsNow.length) { fails.push(l.id); bad(`${l.id}: ${problemsNow.join('; ')}`); }
          else ok(`${l.id.padEnd(16)} ${r.frame_ms} ms a frame (+${added} ms over plain; slow frames ${r.frame_ms_p95} ms), ${r.fps} fps, picture ${Math.round(r.stats.lit * 100)}% lit, resize ok`);
          if (save) {
            const file = outDir ? path.join(outDir, `${l.id}.jpg`) : path.join(l.dir, 'preview.jpg');
            fs.writeFileSync(file, r.shot);
            if (!outDir && !problemsNow.length) {
              const jf = path.join(l.dir, 'look.json');
              writeJson(jf, { ...readJson(jf, {}), measured: { starter: a.starter, size: '1280x720', frame_ms: r.frame_ms, plain_frame_ms: plain.frame_ms, added_ms: added, fps: r.fps, date: new Date().toLocaleDateString('en-CA'), how: 'hidden Chromium on the kit\'s test laptop, whole frame read back from the graphics chip; machine load changes it' } });
            }
          }
        }
        await applyLook(dir, 'none', { quiet: true });
      } finally {
        await browser.close().catch(() => {});
      }
    }, { label: 'looks shots' });
  } finally {
    await applyLook(dir, 'none', { quiet: true }).catch(() => {});
    await stopServer(dir).catch(() => {});
  }
  say('');
  if (fails.length) { say(`FAILED: ${fails.length} look${fails.length > 1 ? 's' : ''} had problems (${fails.join(', ')}).`); return 1; }
  say(`PASSED: ${results.length} look${results.length > 1 ? 's' : ''} drawn on the ${a.starter} starter${save ? `; pictures in ${outDir ? pretty(outDir) : 'looks/<id>/preview.jpg'}` : ''}.`);
  return 0;
});
