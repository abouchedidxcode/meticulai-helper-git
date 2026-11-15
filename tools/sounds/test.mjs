#!/usr/bin/env node
// Checks the sound pack by numbers, because no agent can listen: every file exists and decodes, has the length the
// catalogue says, is neither silent nor clipped, starts promptly, its variations really differ, and every loop joins
// its end to its start without a click. Also proves the generator gives the same sound for the same recipe.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { bad, bytes, nextStep, ok, runTool, say, warn } from '../lib/log.mjs';
import { findFfmpeg } from '../lib/ffmpeg.mjs';
import { SR, gainToDb, measure, render, seam } from './lib/dsp.mjs';
import { LOOP_PAD, PACK_DIR, decodeSound, loadCatalog, loadRecipes } from './lib/pack.mjs';

const HELP = `
node tools/sounds/test.mjs [--json] [--table]

Checks every sound in sounds/ by numbers (length, loudest point, average level, how a loop joins,
how bright it is) and that the sound maker gives the same result every time.
  --table   print the numbers of every sound
  --json    the numbers as JSON, for agents
Exits with an error if any check fails. It cannot tell whether a sound is pleasant: a person must listen.
`;

const BUDGET_BYTES = 12 * 1024 * 1024;
/** Rough brightness: the frequency a pure tone would need to cross zero as often as this sound does. */
function brightness(buf) {
  let z = 0;
  for (let i = 1; i < buf.length; i++) if ((buf[i - 1] < 0) !== (buf[i] < 0)) z++;
  return Math.round((z / 2) / (buf.length / SR));
}
// Sounds whose character can be told from brightness alone: [id, min Hz, max Hz]
const BRIGHTNESS = [
  ['impact-thud', 20, 500], ['move-land-hard', 20, 700], ['impact-explosion-large', 20, 900], ['ambience-room-tone', 20, 500],
  ['ui-hover', 1500, 4000], ['ambience-rain', 1500, 12000], ['impact-break-glass', 2000, 12000], ['magic-sparkle', 1500, 9000],
  ['feedback-countdown-beep', 700, 960], ['vehicle-engine-loop', 40, 400],
];

await runTool(async () => {
  const { values: a } = getArgs({ json: { type: 'boolean' }, table: { type: 'boolean' } }, HELP);
  const fails = [];
  const rows = [];
  const check = (cond, id, msg) => { if (!cond) fails.push(`${id}: ${msg}`); };

  // 1. the generator: same recipe, same samples; different variations, different samples
  const recipes = loadRecipes();
  for (const r of recipes) {
    if (r.seconds > 4) continue; // long loops are covered by the file checks below
    const x = render(r, { variation: 0 }).samples, y = render(r, { variation: 0 }).samples;
    let same = x.length === y.length;
    for (let i = 0; same && i < x.length; i++) if (x[i] !== y[i]) same = false;
    check(same, r.id, 'the same recipe gave two different sounds (it must be repeatable)');
    if ((r.variations || 1) > 1) {
      const z = render(r, { variation: 1 }).samples;
      let diff = 0;
      for (let i = 0; i < Math.min(x.length, z.length); i++) diff += Math.abs(x[i] - z[i]);
      check(diff / Math.min(x.length, z.length) > 1e-4, r.id, 'variation 2 is the same as variation 1');
    }
    const m = measure(x);
    check(Number.isFinite(m.peakDb) && m.peakDb <= -2.5, r.id, `rendered peak ${m.peakDb} dBFS is above -2.5`);
  }

  // 2. the files
  const catalog = loadCatalog();
  const canDecode = !!findFfmpeg();
  if (!canDecode) warn('ffmpeg is not installed: files are checked for presence and size only.');
  let total = 0;
  const ids = new Set();
  for (const s of catalog.sounds) {
    check(!ids.has(s.id), s.id, 'listed twice in the catalogue');
    ids.add(s.id);
    check(['synth', 'meticulai'].includes(s.source), s.id, `unknown source "${s.source}"`);
    check(!!s.licence, s.id, 'no licence');
    check(s.source !== 'meticulai' || !!s.from_game, s.id, 'a sound from a game needs from_game');
    check(Array.isArray(s.feel) && s.feel.length >= 2, s.id, 'needs at least two feel words');
    const takes = [];
    for (const rel of s.files) {
      const file = path.join(PACK_DIR, rel);
      if (!fs.existsSync(file)) { check(false, s.id, `file missing: ${rel}`); continue; }
      total += fs.statSync(file).size;
      if (!canDecode) continue;
      const buf = decodeSound(file);
      const gain = s.gain ?? 1;
      const m = measure(buf);
      const row = { id: s.id, file: rel, source: s.source, seconds: m.seconds, peakDb: m.peakDb, rmsDb: m.rmsDb, activeRmsDb: m.activeRmsDb, gain, playedPeakDb: +(m.peakDb + gainToDb(gain)).toFixed(1), brightnessHz: brightness(buf), bytes: fs.statSync(file).size };
      const want = s.loop ? s.loop[1] + LOOP_PAD : s.seconds;
      // takes cut from recordings have their own lengths: the catalogue gives the first one
      if (s.source === 'synth' || rel === s.files[0]) check(Math.abs(m.seconds - want) <= 0.09, s.id, `${rel} is ${m.seconds}s long, the catalogue says ${want.toFixed(2)}s`);
      check(m.peakDb <= -0.9, s.id, `${rel} peaks at ${m.peakDb} dBFS (too close to clipping)`);
      check(row.playedPeakDb <= -2 && row.playedPeakDb >= -26, s.id, `${rel} plays with a peak of ${row.playedPeakDb} dBFS (wanted -26 to -2)`);
      check(m.rmsDb > -48, s.id, `${rel} is almost silent (average ${m.rmsDb} dBFS)`);
      let dc = 0;
      for (const v of buf) dc += v;
      check(Math.abs(dc / buf.length) < 0.01, s.id, `${rel} has a constant offset`);
      if (s.loop) {
        const body = buf.subarray(Math.round(s.loop[0] * SR), Math.round(s.loop[1] * SR));
        row.seam = seam(body);
        check(row.seam.ratio <= 2, s.id, `${rel} loop join jumps ${row.seam.ratio}x a normal step (a click)`);
        check(Math.abs(row.seam.levelDb) <= (s.group === 'ambience' || s.source !== 'synth' ? 9 : 14), s.id, `${rel} loop end and start differ by ${row.seam.levelDb} dB`);
      } else if (s.source === 'synth') {
        const peak = Math.pow(10, m.peakDb / 20);
        let onset = 0;
        while (onset < buf.length && Math.abs(buf[onset]) < peak * 0.1) onset++;
        row.onsetMs = Math.round((onset / SR) * 1000);
        const slow = /charge|boost|swing|whoosh|dash|growl|heal|slide|skid|bow/.test(s.id);
        check(row.onsetMs <= (slow ? 700 : 80), s.id, `${rel} starts ${row.onsetMs} ms late`);
      }
      rows.push(row);
      takes.push(buf);
    }
    for (let i = 1; i < takes.length; i++) {
      let diff = 0;
      const n = Math.min(takes[0].length, takes[i].length);
      for (let k = 0; k < n; k++) diff += Math.abs(takes[0][k] - takes[i][k]);
      check(diff / Math.max(1, n) > 1e-4, s.id, `take ${i + 1} is the same as take 1`);
    }
  }
  if (canDecode) for (const [id, lo, hi] of BRIGHTNESS) {
    const r = rows.find((x) => x.id === id);
    check(!!r, id, 'expected in the pack');
    if (r) check(r.brightnessHz >= lo && r.brightnessHz <= hi, id, `brightness ${r.brightnessHz} Hz is outside ${lo}-${hi} Hz for this kind of sound`);
  }
  // every file in the folder is in the catalogue (nothing ships without a licence line)
  const listed = new Set(catalog.sounds.flatMap((s) => s.files));
  for (const g of fs.readdirSync(PACK_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const f of fs.readdirSync(path.join(PACK_DIR, g.name))) {
      if (/\.(mp3|ogg|wav|m4a)$/i.test(f)) check(listed.has(`${g.name}/${f}`), `${g.name}/${f}`, 'is in the folder but not in catalog.json');
    }
  }
  check(total <= BUDGET_BYTES, 'pack', `the sound files take ${bytes(total)}, more than the 12 MB budget`);

  if (a.json) { console.log(JSON.stringify({ ok: !fails.length, fails, totalBytes: total, files: rows }, null, 2)); return fails.length ? 1 : 0; }
  if (a.table) {
    say('file                                       source     secs   peak  avg    active played  bright  loop join');
    for (const r of rows) say(`${r.file.padEnd(42)} ${r.source.padEnd(9)} ${String(r.seconds).padStart(6)} ${String(r.peakDb).padStart(6)} ${String(r.rmsDb).padStart(6)} ${String(r.activeRmsDb).padStart(6)} ${String(r.playedPeakDb).padStart(6)} ${String(r.brightnessHz).padStart(6)}Hz ${r.seam ? `${r.seam.ratio}x, ${r.seam.levelDb} dB` : ''}`);
    say('');
  }
  say(`${catalog.sounds.length} sounds, ${rows.length || listed.size} files, ${bytes(total)} (budget 12 MB).`);
  if (fails.length) {
    for (const f of fails) bad(f);
    nextStep('fix the recipe (tools/sounds/recipes.json) or the catalogue entry, run  node tools/sounds/synth.mjs --only <id>  and test again.');
    return 1;
  }
  ok('Every sound passed its number checks: length, level, no clipping, prompt start, different takes, clean loop joins.');
  say('  These checks cannot say whether a sound is pleasant. A person must listen: node tools/sounds/audition.mjs');
  return 0;
});
