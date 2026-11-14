#!/usr/bin/env node
// How smoothly does the game run? Frame-time percentiles, long frames, WebGL errors, draw calls.
import { getArgs } from '../lib/args.mjs';
import { detail, nextStep, ok, runTool, say, warn, bad } from '../lib/log.mjs';
import { gameDir, pretty, readHelper } from '../lib/paths.mjs';
import { launch, newGamePage, openGame, withBrowserLock } from '../lib/browser.mjs';
import { ensureServer } from '../lib/server.mjs';
import { sleep } from '../lib/proc.mjs';

const HELP = `
node tools/play/fps.mjs [--seconds 10] [--no-bot]

Measures how smoothly your game runs in the hidden browser while the bot plays:
how long frames take (typical and worst), how many frames were slow,
WebGL errors, and (if the game shares its renderer) draw calls and triangles.

  --seconds <n>   how long to measure, in real seconds (default 10)
  --warmup <n>    seconds to let the game settle first (default 3)
  --no-bot        measure without the built-in bot playing
  --url-extra "a=1"  extra URL switches for the game
  --dir <path>    use a different game folder (default: my-game/)
  --verbose       show technical details

The hidden browser is usually slower than a real one, so treat the numbers
as "at least this good" on a similar computer.
`;

await runTool(async () => {
  const { values: a } = getArgs({ seconds: { type: 'number', default: 10 }, warmup: { type: 'number', default: 3 }, 'no-bot': { type: 'boolean' }, 'url-extra': { type: 'string' } }, HELP);
  const dir = gameDir(a.dir);
  readHelper(dir);
  const srv = await ensureServer(dir);
  const extra = (a['url-extra'] || '').replace(/^[?&]+/, '');
  const url = `http://127.0.0.1:${srv.port}/?autostart=1&seed=1&test=0${a['no-bot'] ? '' : '&bot=1'}${extra ? `&${extra}` : ''}`;

  say(`Measuring frame times for ${a.seconds} seconds (in a hidden browser)...`);
  const r = await withBrowserLock(async () => {
    const browser = await launch();
    try {
      const { page, problems } = await newGamePage(browser);
      let glErrors = 0;
      page.on('console', (m) => { if (/GL_INVALID|WebGL: INVALID|CONTEXT_LOST/i.test(m.text())) glErrors++; });
      await openGame(page, url);
      await sleep(a.warmup * 1000);
      const m = await page.evaluate(async (ms) => {
        const stamps = [];
        const t0 = performance.now();
        await new Promise((done) => {
          const f = (now) => { stamps.push(now); if (now - t0 < ms) requestAnimationFrame(f); else done(); };
          requestAnimationFrame(f);
        });
        const d = stamps.slice(1).map((x, i) => x - stamps[i]).sort((x, y) => x - y);
        const pct = (p) => d[Math.min(d.length - 1, Math.floor(d.length * p))];
        const info = window.__game?.renderer?.info;
        return {
          frames: d.length, fps: d.length / ((stamps.at(-1) - stamps[0]) / 1000),
          p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), worst: d.at(-1),
          long: d.filter((x) => x > 50).length,
          draw: info?.render ? { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory?.geometries, textures: info.memory?.textures } : null,
        };
      }, a.seconds * 1000);
      return { ...m, glErrors, problems };
    } finally {
      await browser.close().catch(() => {});
    }
  }, { label: `fps ${pretty(dir)}` });
  detail(r);

  say('');
  say(`  Frames per second:       ${r.fps.toFixed(1)}`);
  say(`  Typical frame:           ${r.p50.toFixed(1)} ms   (16.7 ms = 60 fps)`);
  say(`  Slow frames (1 in 20):   ${r.p95.toFixed(1)} ms`);
  say(`  Slowest (1 in 100):      ${r.p99.toFixed(1)} ms   worst ${r.worst.toFixed(1)} ms`);
  say(`  Hitches (over 50 ms):    ${r.long} of ${r.frames} frames`);
  say(`  WebGL errors:            ${r.glErrors}`);
  if (r.draw) say(`  Draw calls / triangles:  ${r.draw.calls} / ${r.draw.triangles.toLocaleString('en-US')}  (one frame)`);
  say('');
  if (r.p95 <= 20 && r.long === 0) ok('Smooth. Frames are steady.');
  else if (r.p95 <= 34 && r.long <= Math.max(2, r.frames * 0.01)) warn('Mostly fine, with some slower frames. Worth a look if the game feels jerky.');
  else bad('Choppy. Many frames are slow or there are hitches.');
  if (r.glErrors) bad(`The game made ${r.glErrors} WebGL error(s); something is drawn wrongly. Run with --verbose or check the console.`);
  if (r.draw && r.draw.calls > 1000) warn(`${r.draw.calls} draw calls per frame is a lot. Merging or instancing meshes would help.`);
  if (r.problems.length) bad(`Errors while measuring: ${r.problems[0].slice(0, 300)}`);
  say('(The hidden browser is often slower than a real one. Compare runs with each other, not with a real browser.)');
  if (r.p95 > 34 || r.glErrors) { nextStep('Ask your agent to find what makes frames slow (too many objects, big shadows, heavy effects) and fix the biggest one.'); }
  return 0;
});
