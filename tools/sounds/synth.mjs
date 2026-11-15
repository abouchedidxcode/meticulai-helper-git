#!/usr/bin/env node
// Makes game sounds from maths: no recordings, no downloads, no paid service. The recipes are data
// (tools/sounds/recipes.json), so an agent can copy one, change a few numbers and get a new sound.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, bytes, nextStep, ok, runTool, say, warn } from '../lib/log.mjs';
import { gameDir, pretty, readHelper, writeJson, readJson } from '../lib/paths.mjs';
import { findFfmpeg } from '../lib/ffmpeg.mjs';
import { render, GROUP_LEVELS } from './lib/dsp.mjs';
import { CATALOG, LOOP_PAD, PACK_DIR, gameAudioDir, loadRecipes, recordInGame, writeSound } from './lib/pack.mjs';

const HELP = `
node tools/sounds/synth.mjs                     make all the kit's own sounds again (into sounds/)
node tools/sounds/synth.mjs --only ui-click,move-jump
node tools/sounds/synth.mjs --list              the recipes there are
node tools/sounds/synth.mjs --show move-jump    print one recipe, to copy and change

A new sound for your game (goes into my-game/public/assets/audio/ and my-game/src/audio/sounds.json):
node tools/sounds/synth.mjs --from move-jump --name soft-jump --soft --pitch=-3
node tools/sounds/synth.mjs --recipe my-recipe.json

  --from <id>        start from one of the kit's recipes
  --name <new-id>    the name of the new sound (small letters, digits, dashes)
  --recipe <file>    a recipe file you (or your agent) wrote: one recipe or a list
  --pitch=<n>        higher or lower, in semitones: --pitch=-3 is a little lower, --pitch=12 one octave up
  --length <x>       longer or shorter: 2 = twice as long, 0.5 = half
  --soft             rounder and quieter (slower start, less treble, 4 dB down)
  --hard             harsher (a little distortion)
  --seed <n>         a different roll of the dice for the random parts
  --variations <n>   how many slightly different takes (so repeats don't sound like a machine)
  --group <name>     the group of a new sound: ${Object.keys(GROUP_LEVELS).join(', ')}
  --dir <path>       the game folder (default: my-game/)

Sounds made here are original work with no rights attached (CC0). No agent can hear them:
the tool prints their length and loudness, and a person should listen before the game ships.
`;

const describe = (n) => `${n.seconds}s, peak ${n.peakDb} dBFS, average ${n.rmsDb} dBFS${n.seam ? `, loop join ${n.seam.ratio}x a normal step` : ''}`;

function renderRecipe(recipe, outDir, opts) {
  const count = Math.max(1, Math.min(12, Math.round(opts.variations ?? recipe.variations ?? 1)));
  const files = [];
  const numbers = [];
  for (let v = 0; v < count; v++) {
    const r = render(recipe, { ...opts, variation: v });
    if (!(r.numbers.peakDb > -80)) throw new HelperError(`the recipe "${recipe.id}" came out silent.`, 'Check its layers: each needs a "vol" above 0 and a "dur" inside "seconds".');
    const base = path.join(outDir, count > 1 ? `${recipe.id}-${v + 1}` : recipe.id);
    for (const ext of ['.mp3', '.wav']) fs.rmSync(base + ext, { force: true });
    files.push(writeSound(r.samples, base, { loop: r.loop }));
    numbers.push(r.numbers);
  }
  // remove takes left over from a run with more variations
  for (let v = count; v < 12; v++) for (const ext of ['.mp3', '.wav']) fs.rmSync(path.join(outDir, `${recipe.id}-${v + 1}${ext}`), { force: true });
  if (count > 1) for (const ext of ['.mp3', '.wav']) fs.rmSync(path.join(outDir, recipe.id + ext), { force: true });
  return { files, numbers };
}

function summary(numbers) {
  const pick = (k) => numbers.map((n) => n[k]);
  const out = { peakDb: Math.max(...pick('peakDb')), rmsDb: +(pick('rmsDb').reduce((a, b) => a + b, 0) / numbers.length).toFixed(1), activeRmsDb: +(pick('activeRmsDb').reduce((a, b) => a + b, 0) / numbers.length).toFixed(1) };
  if (numbers[0].seam) out.seam = numbers[0].seam;
  return out;
}

await runTool(async () => {
  const { values: a } = getArgs({
    only: { type: 'string' }, list: { type: 'boolean' }, show: { type: 'string' }, from: { type: 'string' }, name: { type: 'string' },
    recipe: { type: 'string' }, pitch: { type: 'number' }, length: { type: 'number' }, soft: { type: 'boolean' }, hard: { type: 'boolean' },
    seed: { type: 'number' }, variations: { type: 'number' }, group: { type: 'string' }, json: { type: 'boolean' },
  }, HELP);
  const recipes = loadRecipes();
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const opts = { pitch: a.pitch, length: a.length, soft: a.soft, hard: a.hard, seed: a.seed, variations: a.variations };

  if (a.list) {
    if (a.json) { console.log(JSON.stringify(recipes.map((r) => ({ id: r.id, group: r.group, seconds: r.seconds, loop: !!r.loop, feel: r.feel })), null, 2)); return 0; }
    for (const g of [...new Set(recipes.map((r) => r.group))]) say(`${g}: ${recipes.filter((r) => r.group === g).map((r) => r.id).join(', ')}`);
    say(`\n${recipes.length} recipes. Print one with --show <id>.`);
    return 0;
  }
  if (a.show) {
    const r = byId.get(a.show);
    if (!r) throw new HelperError(`there is no recipe called "${a.show}".`, 'See them all with  node tools/sounds/synth.mjs --list');
    console.log(JSON.stringify(r, null, 2));
    return 0;
  }
  if (!findFfmpeg()) warn('ffmpeg is not installed, so the sounds are written as WAV files (bigger, but they play). Run  node tools/doctor.mjs --fix  for small MP3 files.');

  // ---- a new sound for the game
  if (a.from || a.recipe || a.name) {
    const dir = gameDir(a.dir);
    readHelper(dir);
    let list;
    if (a.recipe) list = loadRecipes(path.resolve(a.recipe));
    else {
      const base = byId.get(a.from);
      if (!base) throw new HelperError(a.from ? `there is no recipe called "${a.from}".` : 'I need to know which sound to start from.', 'Give  --from <id>  (see  node tools/sounds/synth.mjs --list ) or  --recipe <file>.');
      if (!a.name) throw new HelperError('the new sound needs a name.', 'Add for example  --name soft-jump');
      if (!/^[a-z0-9][a-z0-9-]*$/.test(a.name)) throw new HelperError(`"${a.name}" can't be a sound name.`, 'Use small letters, digits and dashes, for example  --name soft-jump');
      list = [{ ...base, id: a.name, ...(a.group ? { group: a.group } : {}) }];
    }
    for (const recipe of list) {
      if (a.group) recipe.group = a.group;
      recipe.group = recipe.group || 'sfx';
      const outDir = path.join(gameAudioDir(dir), recipe.group);
      const { files, numbers } = renderRecipe(recipe, outDir, opts);
      const loop = recipe.loop ? [LOOP_PAD, +(LOOP_PAD + numbers[0].seconds).toFixed(3)] : false;
      recordInGame(dir, {
        id: recipe.id, group: recipe.group, files: files.map((f) => path.relative(path.join(dir, 'public'), f).split(path.sep).join('/')),
        loop, seconds: numbers[0].seconds, licence: 'CC0-1.0', source: 'synth',
        credit: { title: `Sound "${recipe.id}"`, author: 'Made in code for this game (tools/sounds/synth.mjs)', note: a.from ? `from the kit recipe ${a.from}` : 'from a recipe file' },
      });
      // keep the recipe beside the sound, so it can be changed and made again
      const kept = readJson(path.join(dir, 'src', 'audio', 'sound-recipes.json'), { recipes: [] });
      kept.recipes = [...kept.recipes.filter((r) => r.id !== recipe.id), { ...recipe, made_with: Object.fromEntries(Object.entries(opts).filter(([, v]) => v != null && v !== false)) }];
      writeJson(path.join(dir, 'src', 'audio', 'sound-recipes.json'), kept);
      ok(`${recipe.id}: ${files.length} file${files.length === 1 ? '' : 's'} in ${pretty(outDir)} (${describe({ ...numbers[0], peakDb: summary(numbers).peakDb })})`);
    }
    say(`\nListed in ${pretty(path.join(dir, 'src', 'audio', 'sounds.json'))} and credited in CREDITS.md.`);
    say('Play it in the game with  audio.play("<name>")  (see recipes/sound-files.md).');
    say('Nobody has heard this sound yet: ask the person to listen (node tools/sounds/audition.mjs --dir <game> makes a page with play buttons).');
    return 0;
  }

  // ---- the kit's own pack
  const want = a.only ? a.only.split(',').map((s) => s.trim()).filter(Boolean) : null;
  if (want) for (const id of want) if (!byId.has(id)) throw new HelperError(`there is no recipe called "${id}".`, 'See them all with  node tools/sounds/synth.mjs --list');
  const todo = recipes.filter((r) => !want || want.includes(r.id));
  const catalog = readJson(CATALOG, null) || { version: 1, sounds: [] };
  let total = 0, count = 0;
  for (const recipe of todo) {
    const outDir = path.join(PACK_DIR, recipe.group);
    const { files, numbers } = renderRecipe(recipe, outDir, { ...opts, variations: a.variations });
    const size = files.reduce((s, f) => s + fs.statSync(f).size, 0);
    total += size; count += files.length;
    const entry = {
      id: recipe.id, group: recipe.group, files: files.map((f) => path.relative(PACK_DIR, f).split(path.sep).join('/')),
      feel: recipe.feel || [], seconds: numbers[0].seconds, loop: recipe.loop ? [LOOP_PAD, +(LOOP_PAD + numbers[0].seconds).toFixed(3)] : false,
      gain: 1, source: 'synth', licence: 'CC0-1.0', bytes: size, numbers: summary(numbers),
    };
    const i = catalog.sounds.findIndex((s) => s.id === recipe.id);
    if (i >= 0) catalog.sounds[i] = entry; else catalog.sounds.push(entry);
    say(`  ${recipe.id.padEnd(26)} ${String(files.length).padStart(2)} file${files.length === 1 ? ' ' : 's'}  ${describe({ ...numbers[0], peakDb: entry.numbers.peakDb })}`);
  }
  if (!want) {
    // a recipe that was removed takes its catalogue entry with it
    catalog.sounds = catalog.sounds.filter((s) => s.source !== 'synth' || byId.has(s.id));
  }
  const order = Object.keys(GROUP_LEVELS);
  const rank = (g) => (order.includes(g) ? order.indexOf(g) : order.length);
  catalog.sounds.sort((x, y) => rank(x.group) - rank(y.group) || (x.source === y.source ? x.id.localeCompare(y.id) : x.source === 'synth' ? -1 : 1));
  catalog.version = 1;
  catalog.updated = new Date().toISOString().slice(0, 10);
  catalog.about = 'The kit\'s starter sounds. source "synth" = made in code by tools/sounds/synth.mjs (CC0). source "meticulai" = from a finished Meticulai game (see CREDITS.md). loop is false or [start, end] in seconds. gain is a suggested volume so the pack mixes evenly. Nobody has listened to every file: see README.md.';
  writeJson(CATALOG, catalog);
  say('');
  ok(`${todo.length} sounds, ${count} files, ${bytes(total)} written to ${pretty(PACK_DIR)}; the list is ${pretty(CATALOG)}.`);
  nextStep('check them by numbers with  node tools/sounds/test.mjs , and make the listening page with  node tools/sounds/audition.mjs');
  return 0;
});
