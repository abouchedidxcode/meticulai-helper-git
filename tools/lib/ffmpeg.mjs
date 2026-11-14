// Video and image work through the system's ffmpeg/ffprobe (installed by `node tools/doctor.mjs --fix`).
//  - findFfmpeg(), findFfprobe()
//  - videoInfo(file)                          -> { duration, width, height }
//  - encodeFrames(frames, out)                -> an mp4 where each frame lasts `dur` seconds (paced by game time)
//  - contactSheets(tiles, outPattern)         -> 4x3 sheets, each tile stamped with its label (e.g. "12.5s")
//  - sampleTimes(duration, opts)              -> evenly spaced times for sheet tiles
// Labels use ffmpeg's drawtext when the build has it and a font is found; otherwise a tiny built-in pixel font
// (many ffmpeg builds, including Homebrew's, ship without drawtext).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HelperError, detail } from './log.mjs';
import { run, which, isWin } from './proc.mjs';

let ffmpegPath, ffprobePath, drawtextOk;

export function findFfmpeg() {
  if (ffmpegPath === undefined) ffmpegPath = process.env.FFMPEG_PATH || which('ffmpeg');
  return ffmpegPath;
}
export function findFfprobe() {
  if (ffprobePath === undefined) ffprobePath = process.env.FFPROBE_PATH || which('ffprobe');
  return ffprobePath;
}
function needFfmpeg() {
  const f = findFfmpeg();
  if (!f) throw new HelperError('ffmpeg (the video tool) is not installed.', 'Run  node tools/doctor.mjs --fix  to install it, then try again.');
  return f;
}

/** Run ffmpeg with args; throws a HelperError with ffmpeg's last lines in --verbose. */
export async function ffmpeg(args, what = 'video work') {
  const r = await run(needFfmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
  if (r.code !== 0) {
    detail(`ffmpeg ${args.join(' ')}`, r.stderr.split('\n').slice(-15).join('\n'));
    throw new HelperError(`ffmpeg failed during ${what}.`, 'Run again with --verbose to see why. If ffmpeg is missing or broken, run  node tools/doctor.mjs --fix.');
  }
  return r;
}

/** { duration (s), width, height } of a video or image. */
export async function videoInfo(file) {
  const probe = findFfprobe();
  if (!probe) throw new HelperError('ffprobe (comes with ffmpeg) is not installed.', 'Run  node tools/doctor.mjs --fix  to install it, then try again.');
  const r = await run(probe, ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_type', '-of', 'json', file]);
  if (r.code !== 0) throw new HelperError(`I couldn't read the video ${path.basename(file)}.`, 'Check that the file is a normal video (mp4, mov, webm) and not still downloading.', new Error(r.stderr));
  const j = JSON.parse(r.stdout || '{}');
  const v = (j.streams || []).find((s) => s.codec_type === 'video') || {};
  return { duration: Number(j.format?.duration) || 0, width: v.width || 0, height: v.height || 0 };
}

export async function hasDrawtext() {
  if (drawtextOk === undefined) {
    const f = findFfmpeg();
    const r = f ? await run(f, ['-hide_banner', '-filters']) : { stdout: '' };
    drawtextOk = /\bdrawtext\b/.test(r.stdout) && !!findFont();
  }
  return drawtextOk;
}

function findFont() {
  const candidates = {
    darwin: ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf', '/System/Library/Fonts/Helvetica.ttc'],
    win32: ['C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/segoeui.ttf'],
    linux: ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/TTF/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'],
  }[process.platform] || [];
  return candidates.find((f) => fs.existsSync(f)) || null;
}

// ---------------------------------------------------------------- a tiny pixel font for labels (5x7)

const GLYPHS = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  's': ['00000', '00000', '01111', '10000', '01110', '00001', '11110'],
  'm': ['00000', '00000', '11010', '10101', '10101', '10101', '10101'],
  't': ['01000', '01000', '11100', '01000', '01000', '01001', '00110'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

/** Write a white-on-black label as a binary PPM image (any ffmpeg can read it). */
function writeLabelPpm(text, file, scale = 3) {
  const chars = [...String(text)].map((c) => GLYPHS[c] || GLYPHS[c.toLowerCase()] || GLYPHS[' ']);
  const pad = 2;
  const w = (chars.length * 6 - 1 + pad * 2) * scale, h = (7 + pad * 2) * scale;
  const px = Buffer.alloc(w * h * 3, 0);
  chars.forEach((g, ci) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
      if (g[y][x] !== '1') continue;
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
        const X = (pad + ci * 6 + x) * scale + sx, Y = (pad + y) * scale + sy;
        px.fill(255, (Y * w + X) * 3, (Y * w + X) * 3 + 3);
      }
    }
  });
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), px]));
}

function writeBlackPpm(w, h, file) {
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), Buffer.alloc(w * h * 3, 0)]));
}

const escFilterPath = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

/** "12.5s" for short times, "2m05s" past a minute. */
export function timeLabel(sec) {
  if (sec == null || !Number.isFinite(sec)) return '';
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}m${String(s).padStart(2, '0')}s`;
}

/**
 * Make one tile image: the input (an image, or a video at `seek` seconds) scaled into tileW x tileH,
 * with `label` in the top-left corner.
 */
async function makeTile({ input, seek = null, label = '' }, out, tileW, tileH, tmp) {
  const fit = `scale=${tileW}:${tileH}:force_original_aspect_ratio=decrease,pad=${tileW}:${tileH}:(ow-iw)/2:(oh-ih)/2:color=black`;
  const src = seek != null ? ['-ss', String(Math.max(0, seek)), '-i', input] : ['-i', input];
  if (label && (await hasDrawtext())) {
    const font = escFilterPath(findFont());
    const text = String(label).replace(/[^0-9a-zA-Z .#=-]/g, '');
    try {
      await ffmpeg([...src, '-frames:v', '1', '-vf', `${fit},drawtext=fontfile='${font}':text='${text}':x=8:y=8:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=6`, out], 'a contact sheet tile');
      return;
    } catch (e) {
      detail('drawtext failed, using the built-in pixel font', e);
      drawtextOk = false;
    }
  }
  if (label) {
    const lab = path.join(tmp, `label-${path.basename(out)}.ppm`);
    writeLabelPpm(label, lab);
    await ffmpeg([...src, '-i', lab, '-frames:v', '1', '-filter_complex', `[0:v]${fit}[b];[b][1:v]overlay=6:6`, out], 'a contact sheet tile');
  } else {
    await ffmpeg([...src, '-frames:v', '1', '-vf', fit, out], 'a contact sheet tile');
  }
}

/**
 * Build contact sheets. tiles: [{ input, seek?, label? }]. outPattern: a path with "%02d" (e.g. dir/sheet-%02d.jpg).
 * Returns the list of sheet files written.
 */
export async function contactSheets(tiles, outPattern, { cols = 4, rows = 3, tileW = 480, tileH = 270 } = {}) {
  needFfmpeg();
  const per = cols * rows;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mhg-sheet-'));
  const written = [];
  try {
    const black = path.join(tmp, 'black.ppm');
    writeBlackPpm(tileW, tileH, black);
    for (let s = 0; s * per < tiles.length; s++) {
      const group = tiles.slice(s * per, s * per + per);
      const files = [];
      for (let i = 0; i < per; i++) {
        const f = path.join(tmp, `tile-${String(s).padStart(3, '0')}-${String(i).padStart(3, '0')}.png`);
        if (group[i]) await makeTile(group[i], f, tileW, tileH, tmp);
        else fs.copyFileSync(black, f.replace(/\.png$/, '.ppm'));
        files.push(group[i] ? f : f.replace(/\.png$/, '.ppm'));
      }
      const out = outPattern.replace('%02d', String(s + 1).padStart(2, '0'));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const inputs = files.flatMap((f) => ['-i', f]);
      const labels = files.map((_, i) => `[${i}:v]`).join('');
      const layout = files.map((_, i) => `${(i % cols) * (tileW + 4)}_${Math.floor(i / cols) * (tileH + 4)}`).join('|');
      await ffmpeg([...inputs, '-filter_complex', `${labels}xstack=inputs=${files.length}:layout=${layout}:fill=black[o]`, '-map', '[o]', '-frames:v', '1', '-q:v', '3', out], 'a contact sheet');
      written.push(out);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return written;
}

/**
 * Evenly spaced times across a clip for sheet tiles. With no `every`, picks a spacing that fills at most
 * `maxSheets` sheets (but never closer than `minEvery` seconds).
 */
export function sampleTimes(duration, { every = null, cols = 4, rows = 3, maxSheets = 3, minEvery = 0.5 } = {}) {
  if (!(duration > 0)) return [0];
  const step = every || Math.max(minEvery, duration / (cols * rows * maxSheets));
  const times = [];
  for (let t = step / 2; t < duration; t += step) times.push(+t.toFixed(3));
  return times.length ? times : [duration / 2];
}

/**
 * Encode still frames into an mp4. frames: [{ file, dur }] where dur is how long each frame stays on screen (s).
 */
export async function encodeFrames(frames, out, { fps = 30 } = {}) {
  if (!frames.length) throw new HelperError('there were no frames to turn into a video.', 'Check that the game drew something, then record again.');
  const list = path.join(path.dirname(out), `.frames-${process.pid}.txt`);
  const q = (f) => `'${path.resolve(f).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`;
  const lines = [];
  for (const f of frames) lines.push(`file ${q(f.file)}`, `duration ${Math.max(0.001, f.dur).toFixed(4)}`);
  lines.push(`file ${q(frames.at(-1).file)}`);
  fs.writeFileSync(list, lines.join('\n') + '\n');
  try {
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-vf', `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2`, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], 'making the video');
  } finally {
    fs.rmSync(list, { force: true });
  }
  return out;
}

export const ffmpegInstallHelp = () => (isWin
  ? 'Install ffmpeg: open PowerShell and run  winget install Gyan.FFmpeg  (then close and reopen the terminal).'
  : process.platform === 'darwin'
    ? 'Install Homebrew from https://brew.sh (copy the one line on that page into Terminal), then run  brew install ffmpeg.'
    : 'Install ffmpeg with your system\'s package manager, for example  sudo apt install ffmpeg  (Ubuntu/Debian) or  sudo dnf install ffmpeg  (Fedora).');
