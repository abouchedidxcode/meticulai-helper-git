#!/usr/bin/env node
// How loud is the game? No agent can listen, so this measures it: everything the game sends to the speakers is
// tapped (before the page's own code runs) and measured in dBFS (0 dBFS = the loudest a sound can be before clipping).
import { getArgs } from '../lib/args.mjs';
import { detail, nextStep, ok, runTool, say, warn, bad } from '../lib/log.mjs';
import { gameDir, pretty, readHelper } from '../lib/paths.mjs';
import { launch, newGamePage, openGame, waitGameTime, withBrowserLock } from '../lib/browser.mjs';
import { ensureServer } from '../lib/server.mjs';

const HELP = `
node tools/play/loud.mjs [--seconds 20] [--no-bot]

Measures how loud your game is while the bot plays (in a hidden, muted browser,
so nothing comes out of your speakers). Reports typical and loudest levels and
warns about silence or clipping (sound so loud it distorts).

  --seconds <n>   how long to listen, in game seconds (default 20)
  --no-bot        listen without the built-in bot playing
  --url-extra "a=1"  extra URL switches for the game
  --dir <path>    use a different game folder (default: my-game/)
  --verbose       show technical details

Levels are in dBFS: 0 is the maximum, -20 is a comfortable game mix, -60 is near silence.
`;

// Runs before the game's code: every connection to a speaker output goes through a gain node we can measure.
const TAP = `(() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const taps = new Map();
  const L = window.__loud = { rms: [], peak: 0, clips: 0, contexts: 0, running: 0 };
  const origConnect = AudioNode.prototype.connect;
  function tapFor(ctx) {
    let t = taps.get(ctx);
    if (t) return t;
    const g = ctx.createGain();
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    origConnect.call(g, ctx.destination);
    origConnect.call(g, an);
    t = { ctx, g, an, buf: new Float32Array(an.fftSize) };
    taps.set(ctx, t);
    return t;
  }
  AudioNode.prototype.connect = function (target, ...rest) {
    if (target instanceof AudioDestinationNode) return origConnect.call(this, tapFor(target.context).g, ...rest);
    return origConnect.call(this, target, ...rest);
  };
  const Wrapped = class extends AC { constructor(...a) { super(...a); L.contexts++; tapFor(this); } };
  window.AudioContext = Wrapped;
  if (window.webkitAudioContext) window.webkitAudioContext = Wrapped;
  setInterval(() => {
    let sum = 0, n = 0, pk = 0, running = 0;
    for (const t of taps.values()) {
      if (t.ctx.state === 'running') running++;
      t.an.getFloatTimeDomainData(t.buf);
      for (const v of t.buf) { sum += v * v; n++; const a = Math.abs(v); if (a > pk) pk = a; if (a >= 0.999) L.clips++; }
    }
    L.running = running;
    if (n) { L.rms.push(Math.sqrt(sum / n)); if (pk > L.peak) L.peak = pk; }
  }, 100);
})();`;

await runTool(async () => {
  const { values: a } = getArgs({ seconds: { type: 'number', default: 20 }, 'no-bot': { type: 'boolean' }, 'url-extra': { type: 'string' } }, HELP);
  const dir = gameDir(a.dir);
  readHelper(dir);
  const srv = await ensureServer(dir);
  const extra = (a['url-extra'] || '').replace(/^[?&]+/, '');
  const url = `http://127.0.0.1:${srv.port}/?autostart=1&seed=1&test=0${a['no-bot'] ? '' : '&bot=1'}${extra ? `&${extra}` : ''}`;

  say(`Listening to the game for ${a.seconds} seconds of game time (hidden and muted)...`);
  const r = await withBrowserLock(async () => {
    const browser = await launch({ audio: true });
    try {
      const { page, problems } = await newGamePage(browser, { initScripts: [TAP] });
      await openGame(page, url);
      // browsers only start sound after a click or key press: give it one, in the middle of the screen
      await page.mouse.click(640, 360);
      await page.evaluate(() => { for (const c of [window.__game?.audio?.ctx, window.__game?.audio?.context]) c?.resume?.(); });
      await waitGameTime(page, a.seconds);
      const m = await page.evaluate(() => {
        const L = window.__loud;
        if (!L) return null;
        const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
        const all = L.rms.length;
        const live = L.rms.filter((x) => db(x) > -60).sort((x, y) => x - y);
        const q = (p) => (live.length ? +db(live[Math.min(live.length - 1, Math.floor(live.length * p))]).toFixed(1) : null);
        return { samples: all, audible: live.length, p10: q(0.1), p50: q(0.5), p90: q(0.9), p99: q(0.99), peak: +db(L.peak).toFixed(1), clips: L.clips, contexts: L.contexts, running: L.running };
      });
      return { m, problems };
    } finally {
      await browser.close().catch(() => {});
    }
  }, { label: `loud ${pretty(dir)}` });
  const m = r.m;
  detail(m);
  say('');
  if (!m || !m.contexts) {
    bad('The game made no sound at all (it never started any audio).');
    nextStep('If the game should have sound, check that audio starts after the first click or key press, and that ?mute=1 is not set.');
    return 0;
  }
  const share = m.samples ? Math.round((m.audible / m.samples) * 100) : 0;
  say(`  Sound playing:       ${share}% of the time`);
  if (m.audible) {
    say(`  Quiet moments:       ${m.p10} dBFS`);
    say(`  Typical level:       ${m.p50} dBFS`);
    say(`  Loud moments:        ${m.p90} dBFS   (loudest 1%: ${m.p99} dBFS)`);
  }
  say(`  Peak:                ${m.peak} dBFS   clipped samples: ${m.clips}`);
  say('');
  if (!m.audible) bad('Silence: audio started but nothing audible came out.');
  else {
    if (m.p50 < -40) bad('Very quiet. Most players will hear almost nothing. Turn the overall volume up.');
    else if (m.p50 < -30) warn('On the quiet side. Consider turning the overall volume up.');
    else if (m.p50 > -8) bad('Very loud. Turn the overall volume down so it does not tire the ears.');
    else ok('The typical level is in a comfortable range.');
    if (m.clips > 0 || m.peak >= -0.1) bad('Clipping: some sounds hit the maximum and will crackle. Lower the loudest sounds or add a limiter.');
    else if (m.peak > -1) warn('Peaks get very close to the maximum. A little lower would be safer.');
    if (share < 10) warn('Sound plays rarely. Many good games answer almost every player action with a sound.');
  }
  if (r.problems.length) bad(`Errors while listening: ${r.problems[0].slice(0, 300)}`);
  return 0;
});
