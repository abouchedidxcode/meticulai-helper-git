// Shared by the sound tools: where the pack is, reading its catalogue, turning samples into files, and putting a
// sound into a game (files + the game's sounds.json + a credit row).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { HelperError, detail } from '../../lib/log.mjs';
import { REPO_ROOT, readJson, writeJson } from '../../lib/paths.mjs';
import { findFfmpeg } from '../../lib/ffmpeg.mjs';
import { appendCredit } from '../../assets/lib/credits.mjs';
import { encodeWav, pcm16ToFloat, SR } from './dsp.mjs';

export const PACK_DIR = path.join(REPO_ROOT, 'sounds');
export const CATALOG = path.join(PACK_DIR, 'catalog.json');
export const RECIPES = path.join(REPO_ROOT, 'tools', 'sounds', 'recipes.json');
export const LOOP_PAD = 0.25; // seconds of wrapped sound before and after every loop file

export function loadCatalog() {
  const c = readJson(CATALOG);
  if (!c || !Array.isArray(c.sounds)) {
    throw new HelperError('the sound pack list (sounds/catalog.json) is missing or broken.', 'Run  node tools/sounds/synth.mjs  to make the kit\'s own sounds again.');
  }
  return c;
}

export function loadRecipes(file = RECIPES) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    throw new HelperError(`I couldn't read the recipe file ${path.basename(file)} (${e.message}).`, 'Check that it is valid JSON: a comma or a quote is probably missing.', e);
  }
  const list = Array.isArray(data) ? data : data.recipes || (data.id ? [data] : []);
  if (!list.length) throw new HelperError(`the recipe file ${path.basename(file)} has no recipes in it.`, 'A recipe needs at least an id, seconds and layers. Print an example with  node tools/sounds/synth.mjs --show ui-click');
  for (const r of list) {
    if (!r.id || !/^[a-z0-9][a-z0-9-]*$/.test(r.id)) throw new HelperError(`a recipe has a missing or odd id ("${r.id}").`, 'Use small letters, digits and dashes, for example "soft-jump".');
    if (!(r.seconds > 0) || r.seconds > 60) throw new HelperError(`the recipe "${r.id}" needs "seconds" between 0 and 60.`, 'Set for example "seconds": 0.3');
    if (!Array.isArray(r.layers) || !r.layers.length) throw new HelperError(`the recipe "${r.id}" has no layers.`, 'Add at least one layer, for example { "type": "tone", "freq": [300, 600], "dur": 0.15 }');
  }
  return list;
}

const words = (s) => String(s || '').toLowerCase().match(/[a-z0-9]+/g) || [];

/** Rank catalogue sounds for a few words ("soft footstep on grass"). Returns sounds with score > 0, best first. */
export function searchSounds(sounds, text) {
  const want = [...new Set(words(text))].filter((w) => w.length > 2);
  return sounds
    .map((s) => {
      const strong = new Set([...words(s.id), ...words(s.group)]);
      const soft = new Set((s.feel || []).flatMap(words));
      let score = 0;
      for (const w of want) {
        const stem = w.replace(/(ing|s)$/, '');
        if (strong.has(w) || strong.has(stem)) score += 3;
        else if (soft.has(w) || soft.has(stem)) score += 2;
        else if ([...strong, ...soft].some((x) => x.length > 3 && (x.startsWith(stem) || stem.startsWith(x)))) score += 1;
      }
      return { ...s, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------- files

/**
 * Write samples as a sound file. With ffmpeg: an MP3 (plays in every browser). Without: a WAV (bigger, still plays).
 * Loops get LOOP_PAD seconds of wrapped sound on both ends, so a browser can loop them with no click.
 * Returns the path written.
 */
export function writeSound(samples, outNoExt, { loop = false, quality = 5 } = {}) {
  fs.mkdirSync(path.dirname(outNoExt), { recursive: true });
  const wav = encodeWav(samples, { pad: loop ? LOOP_PAD : 0 });
  const ff = findFfmpeg();
  if (!ff) {
    fs.writeFileSync(`${outNoExt}.wav`, wav);
    return `${outNoExt}.wav`;
  }
  const tmp = path.join(os.tmpdir(), `mhg-sound-${process.pid}-${Math.random().toString(36).slice(2)}.wav`);
  fs.writeFileSync(tmp, wav);
  try {
    const r = spawnSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-map_metadata', '-1', '-c:a', 'libmp3lame', '-q:a', String(quality), '-ac', '1', '-ar', String(SR), `${outNoExt}.mp3`], { encoding: 'utf8' });
    if (r.status !== 0) {
      detail(r.stderr);
      fs.writeFileSync(`${outNoExt}.wav`, wav);
      return `${outNoExt}.wav`;
    }
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  fs.rmSync(`${outNoExt}.wav`, { force: true });
  return `${outNoExt}.mp3`;
}

/** Decode any sound file to mono 44.1 kHz samples with ffmpeg (for measuring). Returns null without ffmpeg. */
export function decodeSound(file) {
  const ff = findFfmpeg();
  if (!ff) return null;
  const r = spawnSync(ff, ['-v', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new HelperError(`I couldn't read the sound file ${path.basename(file)}.`, 'Check that it is a normal mp3, ogg or wav file.', new Error(String(r.stderr)));
  return pcm16ToFloat(r.stdout);
}

// ---------------------------------------------------------------- into a game

export const gameAudioDir = (dir) => path.join(dir, 'public', 'assets', 'audio');
export const gameManifest = (dir) => path.join(dir, 'src', 'audio', 'sounds.json');

const MANIFEST_ABOUT = 'Sound files this game can play. Written by tools/sounds/add.mjs and synth.mjs. In the game: import sounds from "./audio/sounds.json"; audio.loadAll(sounds); then audio.play("ui-click") or audio.loop("ambience-wind").';

/**
 * Record a sound in the game: its entry in src/audio/sounds.json and a row in CREDITS.md.
 * entry: { id, group, files (paths relative to public/), gain, loop ([start, end] seconds or false), seconds, licence,
 *          source, credit: { title, author, url, line, note } }
 * Returns { manifest, credit: 'added' | 'already' }.
 */
export function recordInGame(dir, entry) {
  const file = gameManifest(dir);
  const m = readJson(file, null) || { about: MANIFEST_ABOUT, sounds: {} };
  if (!m.sounds) m.sounds = {};
  m.sounds[entry.id] = {
    files: entry.files,
    ...(entry.gain != null && entry.gain !== 1 ? { gain: entry.gain } : {}),
    ...(entry.loop ? { loop: entry.loop } : {}),
    group: entry.group, seconds: entry.seconds, licence: entry.licence, source: entry.source,
  };
  writeJson(file, m);

  const where = `public/${path.posix.dirname(entry.files[0])}/ (${entry.id}, ${entry.files.length} file${entry.files.length === 1 ? '' : 's'})`;
  const creditsFile = path.join(dir, 'CREDITS.md');
  const text = fs.existsSync(creditsFile) ? fs.readFileSync(creditsFile, 'utf8') : '';
  let credit = 'already';
  if (!text.includes(`(${entry.id},`)) {
    credit = appendCredit(dir, {
      title: entry.credit?.title || `Sound "${entry.id}"`, author: entry.credit?.author || 'unknown', license: entry.licence,
      url: entry.credit?.url || '', where, credit: entry.credit?.line || '', note: entry.credit?.note || '',
    });
  }
  return { manifest: file, credit };
}
