#!/usr/bin/env node
// Process new pictures and videos the user dropped into my-game/refs/.
// Videos get a 4x3 contact sheet and 6 stills (so an agent can "watch" them); big pictures get a small preview;
// every new file gets a stub entry in refs/REFS.md for the agent to fill in.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseArgs, gameDir, show, fail, needFfmpeg, run, probe, hasDrawtext, fmtTime, readJSON, plural,
  VIDEO_EXT, IMAGE_EXT,
} from './lib.mjs';

const HELP = `Usage: node tools/refs/intake.mjs [--all] [--dir <game folder>]

Looks in my-game/refs/ (and its subfolders, except sheets/ and generated/) for files that are new
since the last time it ran.
  Videos (mp4, mov, webm, m4v, gif): a contact sheet of 12 frames in refs/sheets/<name>-sheet.jpg
                                      and 6 stills in refs/sheets/<name>/
  Pictures (png, jpg, webp, ...):     size noted; a small preview in refs/sheets/ if wider than 2048 px
  Anything else:                      skipped, with the reason
Each new file gets a short entry in refs/REFS.md for your agent to fill in.

Options:
  --all         process every file again, not only new ones
  --dir <path>  use another game folder (default: my-game, or the HELPER_GAME_DIR setting)
  --help        show this text`;

const args = parseArgs(process.argv.slice(2), ['all', 'help']);
if (args.help) { console.log(HELP); process.exit(0); }

const GAME = gameDir(args);
if (!fs.existsSync(GAME)) {
  fail(`There is no game folder yet (${show(GAME)}).\nRun: node tools/init.mjs --name "My Game"`);
}
const REFS = path.join(GAME, 'refs');
const SHEETS = path.join(REFS, 'sheets');
const REFS_MD = path.join(REFS, 'REFS.md');
const SEEN = path.join(GAME, '.helper', 'refs-seen.json');

if (!fs.existsSync(REFS)) {
  fs.mkdirSync(REFS, { recursive: true });
  console.log(`Made the folder ${show(REFS)}.\nDrag pictures and short videos into it, then run this again.`);
  process.exit(0);
}
needFfmpeg();

// ---- find files
function walk(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!rel && (e.name === 'sheets' || e.name === 'generated')) continue;
      out.push(...walk(path.join(dir, e.name), r));
    } else if (e.isFile()) {
      if (!rel && e.name === 'REFS.md') continue;
      out.push(r);
    }
  }
  return out;
}
const all = walk(REFS).sort();
const seen = readJSON(SEEN, { files: {} });
seen.files ||= {};

const stat = (rel) => fs.statSync(path.join(REFS, rel));
const todo = all.filter((rel) => {
  if (args.all) return true;
  const s = stat(rel), prev = seen.files[rel];
  return !prev || prev.size !== s.size || Math.round(prev.mtimeMs) !== Math.round(s.mtimeMs);
});

// Output names: folder parts + base name, safe characters only. Add the extension when two files share a base name.
const baseOf = (rel) => rel.replace(/\.[^./]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'ref';
const baseCount = {};
for (const rel of all) baseCount[baseOf(rel)] = (baseCount[baseOf(rel)] || 0) + 1;
const nameOf = (rel) => (baseCount[baseOf(rel)] > 1 ? `${baseOf(rel)}-${path.extname(rel).slice(1).toLowerCase()}` : baseOf(rel));

// ---- REFS.md
const DEFAULT_REFS_MD = `# References

What each picture or video is for. Your agent fills in "Use for" and "Ignore" and then tells you, in plain
words, the look it took from them, so you can say yes or correct it. Add anything you like under
"Notes from the user".

References set the mood and the look. The game is never judged on matching them pixel for pixel, and other
games' art never goes into your game.
`;
let refsMd = fs.existsSync(REFS_MD) ? fs.readFileSync(REFS_MD, 'utf8') : null;
const hasEntry = (rel) => refsMd !== null && new RegExp(`^## ${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(refsMd);
const stubs = [];

// ---- video helpers
function videoDuration(file, info) {
  if (info?.duration && info.duration > 0) return info.duration;
  // Some files carry no duration in their header: decode once and read the last timestamp.
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-map', '0:v:0', '-f', 'null', '-']);
  const m = [...r.stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)].pop();
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : null;
}

function grab(file, t, out, filter) {
  // Fast seek first; if that lands past the end (some GIFs, some short clips), seek slowly after decoding.
  for (const seekFirst of [true, false]) {
    const a = ['-hide_banner', '-loglevel', 'error', '-y'];
    if (seekFirst) a.push('-ss', t.toFixed(3), '-i', file);
    else a.push('-i', file, '-ss', t.toFixed(3));
    a.push('-frames:v', '1', '-vf', filter, '-q:v', '3', out);
    const r = run('ffmpeg', a);
    if (r.ok && fs.existsSync(out) && fs.statSync(out).size > 0) return true;
  }
  return false;
}

const label = (t) => `${t.toFixed(1)}s`;
const textFilter = (t) => `drawtext=text='${label(t)}':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=5`;

function contactSheet(file, dur, name) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mhg-sheet-'));
  const times = Array.from({ length: 12 }, (_, i) => ((i + 0.5) / 12) * dur);
  let stamped = hasDrawtext();
  try {
    for (let i = 0; i < times.length; i++) {
      const out = path.join(tmp, `f${String(i + 1).padStart(2, '0')}.jpg`);
      const base = 'scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2';
      let ok = stamped && grab(file, times[i], out, `${base},${textFilter(times[i])}`);
      if (!ok && stamped && i === 0) { stamped = false; } // drawtext present but unusable (no font): go without
      if (!ok) ok = grab(file, times[i], out, base);
      if (!ok) {
        // Very short or odd files: reuse the previous frame so the grid stays 4x3.
        const prev = path.join(tmp, `f${String(i).padStart(2, '0')}.jpg`);
        if (i > 0 && fs.existsSync(prev)) fs.copyFileSync(prev, out);
        else return { ok: false };
      }
    }
    const sheet = path.join(SHEETS, `${name}-sheet.jpg`);
    const r = run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(tmp, 'f%02d.jpg'),
      '-vf', 'tile=4x3:padding=4:margin=4:color=black', '-frames:v', '1', '-q:v', '3', sheet]);
    return { ok: r.ok, sheet, times, stamped };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function stills(file, dur, name) {
  const dir = path.join(SHEETS, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^still-\d+/.test(f)) fs.rmSync(path.join(dir, f));
  let n = 0;
  for (let i = 0; i < 6; i++) {
    const t = ((i + 0.5) / 6) * dur;
    const out = path.join(dir, `still-${i + 1}-${label(t)}.jpg`);
    if (grab(file, t, out, "scale='min(1920,iw)':-2")) n++;
  }
  return { dir, n };
}

// ---- process
fs.mkdirSync(SHEETS, { recursive: true });
const counts = { picture: 0, video: 0, changed: 0 };
const made = [], skipped = [], notes = [];

for (const rel of todo) {
  const file = path.join(REFS, rel);
  const ext = path.extname(rel).toLowerCase();
  const name = nameOf(rel);
  const s = stat(rel);
  const wasSeen = !!seen.files[rel];
  let kind = null, kindLine = '';

  if (VIDEO_EXT.has(ext)) {
    const info = probe(file);
    const dur = info ? videoDuration(file, info) : null;
    const still = ext === '.gif' && (!dur || dur < 0.05 || info?.frames === 1);
    if (!info) {
      skipped.push(`${rel}: could not read it as a video. Try saving it again as MP4.`);
    } else if (still) {
      kind = 'picture';
      kindLine = `Kind: picture (${info.width} x ${info.height}, a still GIF)`;
    } else if (!dur) {
      skipped.push(`${rel}: could not tell how long the video is. Try saving it again as MP4.`);
    } else {
      kind = 'video';
      const cs = contactSheet(file, dur, name);
      const st = stills(file, dur, name);
      if (cs.ok) {
        made.push(rel);
        kindLine = `Kind: video (${fmtTime(dur).replace('.0 s', ' s')})  ·  Sheet: sheets/${name}-sheet.jpg  ·  Stills: sheets/${name}/`;
        if (!cs.stamped) kindLine += `\nSheet tiles (left to right, top to bottom) are at: ${cs.times.map(label).join(', ')}`;
      } else {
        kindLine = `Kind: video (${fmtTime(dur)})  ·  no contact sheet (ffmpeg could not read the frames)`;
        notes.push(`Could not make a contact sheet for ${rel}. Try saving it again as MP4.`);
      }
      if (dur > 30) notes.push(`${rel} is ${fmtTime(dur)} long. Clips under 30 seconds work best: trim it to the part you like.`);
      if (st.n === 0) notes.push(`Could not take stills from ${rel}.`);
    }
  } else if (IMAGE_EXT.has(ext)) {
    const info = probe(file);
    if (!info || !info.width) {
      skipped.push(`${rel}: could not read this picture. Save or export it as JPG or PNG and drop that in instead.`);
    } else {
      kind = 'picture';
      kindLine = `Kind: picture (${info.width} x ${info.height})`;
      if (Math.max(info.width, info.height) > 2048) {
        const prev = path.join(SHEETS, `${name}-preview.jpg`);
        const r = run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-frames:v', '1',
          '-vf', "scale='if(gt(iw,ih),1600,-2)':'if(gt(iw,ih),-2,1600)'", '-q:v', '3', prev]);
        if (r.ok) kindLine += `  ·  Preview: sheets/${name}-preview.jpg`;
      }
    }
  } else {
    const why = {
      '.pdf': 'a PDF is not a picture. Take a screenshot of the page you like and drop that in.',
      '.txt': 'a text file. Write notes in REFS.md instead, under "Notes from the user".',
      '.md': 'a text file. Write notes in REFS.md instead, under "Notes from the user".',
      '.psd': 'a Photoshop file. Export it as PNG or JPG and drop that in.',
      '.zip': 'a zip file. Unzip it and drop the pictures or videos in.',
      '.mp3': 'a sound file. Sound references are not handled here yet; mention them to your agent.',
      '.wav': 'a sound file. Sound references are not handled here yet; mention them to your agent.',
      '.html': 'a web page. Take a screenshot of it, or paste the link into REFS.md.',
      '.webloc': 'a web link. Paste the link into REFS.md instead.',
      '.url': 'a web link. Paste the link into REFS.md instead.',
    }[ext] || `not a picture or a video${ext ? ` (${ext})` : ''}.`;
    skipped.push(`${rel}: ${why}`);
  }

  if (kind) {
    counts[kind]++;
    if (wasSeen) counts.changed++;
    if (!hasEntry(rel)) {
      stubs.push(`## ${rel}\n${kindLine}\nUse for: (agent fills: palette / light / mood / camera / effect / feel of motion / UI)\nIgnore: (agent fills)\nNotes from the user:\n`);
    } else if (wasSeen || args.all) {
      notes.push(`${rel} already has an entry in REFS.md; left it as it is.`);
    }
  }
  seen.files[rel] = { size: s.size, mtimeMs: Math.round(s.mtimeMs), kind: kind || 'skipped' };
}

// Forget files that are gone.
for (const rel of Object.keys(seen.files)) if (!all.includes(rel)) delete seen.files[rel];
fs.mkdirSync(path.dirname(SEEN), { recursive: true });
fs.writeFileSync(SEEN, JSON.stringify(seen, null, 1));

if (stubs.length) {
  if (refsMd === null) refsMd = DEFAULT_REFS_MD;
  const sep = refsMd.endsWith('\n\n') ? '' : refsMd.endsWith('\n') ? '\n' : '\n\n';
  fs.writeFileSync(REFS_MD, refsMd + sep + stubs.join('\n'));
}

// ---- summary
if (!todo.length) {
  console.log(`Nothing new in ${show(REFS)} since the last check.\nDrag pictures or short videos into it and run this again.`);
  process.exit(0);
}
const parts = [];
if (counts.picture) parts.push(plural(counts.picture, 'picture', 'pictures'));
if (counts.video) parts.push(plural(counts.video, 'video', 'videos'));
const lines = [];
if (parts.length) {
  const fresh = args.all ? '' : counts.changed ? 'new or changed ' : 'new ';
  lines.push(`${args.all ? 'Processed' : 'Found'} ${parts.join(' and ').replace(/^(\d+) /, `$1 ${fresh}`)}.`);
}
if (made.length) lines.push(`Made a contact sheet for ${made.map((m) => path.basename(m)).join(', ')} (in ${show(SHEETS)}).`);
for (const sk of skipped) lines.push(`Skipped ${sk}`);
for (const n of notes) lines.push(n);
if (stubs.length) lines.push(`Added ${plural(stubs.length, 'entry', 'entries')} to ${show(REFS_MD)}.`);
if (parts.length) lines.push('Next: your agent looks at them and fills in REFS.md.');
console.log(lines.join('\n'));
