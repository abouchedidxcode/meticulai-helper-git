// Pictures through ffmpeg (already a kit requirement): decode to raw pixels, encode back, resize, flatten
// transparent thumbnails onto grey, average colour. No image library needed.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HelperError, detail } from '../../lib/log.mjs';
import { findFfmpeg, findFfprobe } from '../../lib/ffmpeg.mjs';

function need(bin, name) {
  if (!bin) throw new HelperError(`${name} (the video and picture tool) is not installed.`, 'Run  node tools/doctor.mjs --fix  to install it, then try again.');
  return bin;
}

/** Run a program with optional stdin bytes; resolve { code, stdout: Buffer, stderr: string }. */
function runBin(cmd, args, input = null) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    const out = [];
    let err = '';
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => { if (err.length < 20000) err += d; });
    child.on('error', (e) => resolve({ code: -1, stdout: Buffer.alloc(0), stderr: e.message }));
    child.on('close', (code) => resolve({ code, stdout: Buffer.concat(out), stderr: err }));
    if (input) { child.stdin.on('error', () => {}); child.stdin.end(input); }
  });
}

/** { width, height } of a picture. */
export async function imageSize(file) {
  const r = await runBin(need(findFfprobe(), 'ffprobe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file]);
  try {
    const s = JSON.parse(r.stdout.toString()).streams[0];
    return { width: s.width, height: s.height };
  } catch {
    throw new HelperError(`I couldn't read ${path.basename(file)} as a picture.`, 'Check that it is a normal PNG or JPG.');
  }
}

/** Decode a picture file to RGBA pixels, optionally scaled to fit maxSide. Returns { width, height, data: Buffer }. */
export async function decodeImage(file, { maxSide = 0 } = {}) {
  let { width, height } = await imageSize(file);
  const vf = [];
  if (maxSide && Math.max(width, height) > maxSide) {
    const k = maxSide / Math.max(width, height);
    width = Math.max(1, Math.round(width * k)); height = Math.max(1, Math.round(height * k));
    vf.push(`scale=${width}:${height}:flags=area`);
  }
  vf.push('format=rgba');
  const r = await runBin(need(findFfmpeg(), 'ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-i', file, '-frames:v', '1', '-vf', vf.join(','), '-f', 'rawvideo', 'pipe:1']);
  if (r.code !== 0 || r.stdout.length < width * height * 4) {
    detail(r.stderr);
    throw new HelperError(`I couldn't decode ${path.basename(file)}.`, 'Check that it is a normal PNG or JPG.');
  }
  return { width, height, data: r.stdout.subarray(0, width * height * 4) };
}

/** Encode RGBA pixels to a file (.png or .jpg by extension), optionally resized. */
export async function encodeImage({ width, height, data }, outFile, { resizeTo = null } = {}) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-i', 'pipe:0'];
  if (resizeTo) args.push('-vf', `scale=${resizeTo.width}:${resizeTo.height}:flags=lanczos`);
  if (/\.jpe?g$/i.test(outFile)) args.push('-q:v', '3', '-pix_fmt', 'yuvj444p');
  args.push('-frames:v', '1', outFile);
  const r = await runBin(need(findFfmpeg(), 'ffmpeg'), args, data);
  if (r.code !== 0) { detail(r.stderr); throw new HelperError(`I couldn't write the picture ${path.basename(outFile)}.`, 'Run again with --verbose to see why.'); }
  return outFile;
}

/** Image bytes (png/jpg/webp) -> RGBA pixels, via a temp file. */
export async function decodeBuffer(buf, ext = '.png', opts = {}) {
  const tmp = path.join(os.tmpdir(), `mhg-img-${process.pid}-${Math.random().toString(36).slice(2)}${ext}`);
  fs.writeFileSync(tmp, buf);
  try { return await decodeImage(tmp, opts); } finally { fs.rmSync(tmp, { force: true }); }
}

/** RGBA pixels -> image bytes. */
export async function encodeBuffer(img, ext = '.png', opts = {}) {
  const tmp = path.join(os.tmpdir(), `mhg-img-${process.pid}-${Math.random().toString(36).slice(2)}${ext}`);
  try { await encodeImage(img, tmp, opts); return fs.readFileSync(tmp); } finally { fs.rmSync(tmp, { force: true }); }
}

/** Average sRGB colour [r,g,b] 0..255 of the opaque pixels. */
export function averageRgb({ data }) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    if (a < 0.1) continue;
    r += data[i] * a; g += data[i + 1] * a; b += data[i + 2] * a; n += a;
  }
  return n ? [r / n, g / n, b / n] : [128, 128, 128];
}

/** Put a (maybe transparent) picture centred on a grey square, so dark models don't vanish on the black sheet. */
export async function flattenTile(input, out, { size = 256, bg = '0x8f9296' } = {}) {
  const r = await runBin(need(findFfmpeg(), 'ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `color=c=${bg}:s=${size}x${size}`, '-i', input,
    '-filter_complex', `[1:v]scale=${size}:${size}:force_original_aspect_ratio=decrease[f];[0:v][f]overlay=(W-w)/2:(H-h)/2:format=auto`,
    '-frames:v', '1', out]);
  if (r.code !== 0) { detail(r.stderr); return null; }
  return out;
}

/** A plain grey tile (for results without a thumbnail). */
export async function greyTile(out, { size = 256, bg = '0x5a5d63' } = {}) {
  const r = await runBin(need(findFfmpeg(), 'ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${bg}:s=${size}x${size}`, '-frames:v', '1', out]);
  return r.code === 0 ? out : null;
}

export { runBin };
