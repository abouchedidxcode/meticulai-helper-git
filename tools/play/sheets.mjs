#!/usr/bin/env node
// Contact sheets from any video: a grid of moments, each stamped with its time. Agents read images, not videos.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, ok, runTool, say } from '../lib/log.mjs';
import { pretty } from '../lib/paths.mjs';
import { contactSheets, sampleTimes, timeLabel, videoInfo } from '../lib/ffmpeg.mjs';

const HELP = `
node tools/play/sheets.mjs <video> [--out folder] [--cols 4 --rows 3] [--every 2]

Turns a video into contact sheets: grids of still moments, each with its time in the corner.
Agents can't watch videos, but they can read these pictures.

  <video>          any video file (mp4, mov, webm...)
  --out <folder>   where to write the sheets (default: next to the video)
  --cols, --rows   grid size (default 4 x 3)
  --every <s>      seconds between moments (default: spread over at most --sheets sheets)
  --sheets <n>     most sheets to make when --every is not given (default 3)
  --verbose        show technical details
`;

await runTool(async () => {
  const { values: a, positionals } = getArgs({
    out: { type: 'string' }, cols: { type: 'number', default: 4 }, rows: { type: 'number', default: 3 },
    every: { type: 'number' }, sheets: { type: 'number', default: 3 },
  }, HELP);
  const video = positionals[0];
  if (!video) throw new HelperError('you didn\'t say which video to use.', 'For example:  node tools/play/sheets.mjs my-game/refs/clip.mp4');
  const file = path.resolve(video);
  if (!fs.existsSync(file)) throw new HelperError(`I can't find ${video}.`, 'Check the file name and folder.');
  const cols = Math.max(1, Math.round(a.cols)), rows = Math.max(1, Math.round(a.rows));

  const info = await videoInfo(file);
  if (!(info.duration > 0)) throw new HelperError(`${path.basename(file)} has no length (is it a still picture?).`, 'Use a video file.');
  const times = sampleTimes(info.duration, { every: a.every, cols, rows, maxSheets: Math.max(1, a.sheets) });
  const base = path.basename(file).replace(/\.[^.]+$/, '');
  const outDir = a.out ? path.resolve(a.out) : path.dirname(file);
  const pattern = path.join(outDir, a.out ? 'sheet-%02d.jpg' : `${base}-sheet-%02d.jpg`);

  say(`Making contact sheets from ${path.basename(file)} (${info.duration.toFixed(1)} s, ${times.length} moments)...`);
  const sheets = await contactSheets(times.map((t) => ({ input: file, seek: t, label: timeLabel(t) })), pattern, { cols, rows });
  ok(`${sheets.length} sheet(s) written:`);
  for (const s of sheets) say(`  ${pretty(s)}`);
  return 0;
});
