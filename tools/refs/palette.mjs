#!/usr/bin/env node
// Measure the colours of a picture (or the first frame of a video): 6 main colours, brightness, saturation,
// warm or cool. With two pictures, compare them in plain words (typically: a game screenshot vs a reference).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, fail, needFfmpeg, run } from './lib.mjs';

const HELP = `Usage: node tools/refs/palette.mjs <picture> [second picture] [--json]

One picture:  its 6 main colours (with how much of the picture each covers), brightness, colour strength
              (saturation) and whether it leans warm or cool.
Two pictures: both, side by side, and the differences in plain words. Put your game screenshot first and the
              reference second, e.g.
              node tools/refs/palette.mjs my-game/recordings/<stamp>/shots/start.png my-game/refs/dusk.jpg

Options:
  --json   print the numbers as JSON (for agents)
  --help   show this text

Numbers: brightness and saturation go from 0 to 100. p10 / p50 / p90 mean "10% of the picture is darker than
this", "half is darker", "90% is darker". Warmth above 0 leans orange/red, below 0 leans blue.`;

const args = parseArgs(process.argv.slice(2), ['json', 'help']);
if (args.help || !args._.length) { console.log(HELP); process.exit(args.help ? 0 : 1); }
if (args._.length > 2) fail('Give one or two pictures, not more.');
for (const f of args._) if (!fs.existsSync(f)) fail(`Can't find ${f}. Check the name and the folder.`);
needFfmpeg();

// ---- read pixels (downscaled; the exact size does not matter, only the pixel mix)
function pixels(file) {
  const r = run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-frames:v', '1',
    '-vf', 'scale=96:96:force_original_aspect_ratio=decrease:flags=area,format=rgb24', '-f', 'rawvideo', 'pipe:1'],
  { encoding: 'buffer' });
  if (!r.ok || !r.stdout?.length) fail(`Could not read ${file} as a picture. Try a PNG or JPG.`);
  const buf = r.stdout, n = Math.floor(buf.length / 3), px = new Array(n);
  for (let i = 0; i < n; i++) px[i] = [buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]];
  return px;
}

const luma = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 2.55;
function hsv([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: mx ? (d / mx) * 100 : 0, v: mx / 2.55 };
}
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

// k-means, deterministic start: spread the starting colours across the brightness range.
function kmeans(px, k = 6) {
  const byL = [...px].sort((a, b) => luma(a) - luma(b));
  let cent = Array.from({ length: k }, (_, i) => [...byL[Math.floor(((i + 0.5) / k) * byL.length)]]);
  const label = new Int32Array(px.length);
  for (let it = 0; it < 20; it++) {
    let moved = 0;
    for (let i = 0; i < px.length; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) { const d = dist2(px[i], cent[c]); if (d < bd) { bd = d; best = c; } }
      if (label[i] !== best) { moved++; label[i] = best; }
    }
    const sum = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < px.length; i++) { const s = sum[label[i]]; s[0] += px[i][0]; s[1] += px[i][1]; s[2] += px[i][2]; s[3]++; }
    cent = cent.map((c, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : c));
    if (!moved && it) break;
  }
  const count = new Array(k).fill(0);
  for (let i = 0; i < px.length; i++) count[label[i]]++;
  return cent.map((c, j) => ({ rgb: c, share: count[j] / px.length }))
    .filter((c) => c.share > 0).sort((a, b) => b.share - a.share);
}

function colourName(rgb) {
  const { h, s, v } = hsv(rgb);
  const tone = v < 18 ? 'very dark ' : v < 40 ? 'dark ' : v > 85 && s < 35 ? 'pale ' : '';
  if (s < 12) return v < 12 ? 'black' : v > 90 ? 'white' : `${tone}grey`.replace('pale grey', 'light grey');
  const names = [[15, 'red'], [40, 'orange'], [65, 'yellow'], [85, 'yellow-green'], [160, 'green'], [190, 'teal'],
    [250, 'blue'], [280, 'purple'], [330, 'pink'], [360, 'red']];
  let n = names.find(([lim]) => h < lim)[1];
  if ((n === 'orange' && v < 55) || ((n === 'red' || n === 'orange') && v < 60 && s < 65)) n = 'brown';
  if (s < 30) return `${tone}greyish ${n}`;
  return `${tone}${n}`;
}

function analyse(file) {
  const px = pixels(file);
  const L = px.map(luma).sort((a, b) => a - b);
  const S = px.map((p) => hsv(p).s).sort((a, b) => a - b);
  // Warmth: red minus blue, counted more where the colour is strong. Roughly -100 (all blue) to 100 (all orange).
  let w = 0, ws = 0;
  for (const p of px) { const s = hsv(p).s / 100; w += ((p[0] - p[2]) / 2.55) * s; ws += 1; }
  const warmth = w / ws;
  return {
    file,
    colours: kmeans(px).map((c) => ({ hex: hex(c.rgb), share: +(c.share * 100).toFixed(1), name: colourName(c.rgb), rgb: c.rgb.map(Math.round) })),
    brightness: { p10: +pct(L, 0.1).toFixed(1), p50: +pct(L, 0.5).toFixed(1), p90: +pct(L, 0.9).toFixed(1) },
    contrast: +(pct(L, 0.9) - pct(L, 0.1)).toFixed(1),
    saturation: { p50: +pct(S, 0.5).toFixed(1), p90: +pct(S, 0.9).toFixed(1) },
    warmth: +warmth.toFixed(1),
  };
}

const lean = (w) => (w > 8 ? 'warm' : w < -8 ? 'cool' : 'neutral');
const words = (a) => {
  const b = a.brightness.p50, s = a.saturation.p50;
  return [
    b < 25 ? 'very dark' : b < 40 ? 'dark' : b > 75 ? 'very bright' : b > 60 ? 'bright' : 'mid brightness',
    s < 12 ? 'almost grey' : s < 25 ? 'muted colours' : s > 60 ? 'very strong colours' : s > 40 ? 'strong colours' : 'moderate colours',
    `${lean(a.warmth)} light`,
    a.contrast < 25 ? 'low contrast' : a.contrast > 60 ? 'high contrast' : 'medium contrast',
  ].join(', ');
};

function report(a) {
  const lines = [`${path.basename(a.file)}: ${words(a)}`];
  lines.push('  Main colours:');
  for (const c of a.colours) lines.push(`    ${c.hex}  ${String(Math.round(c.share)).padStart(3)}%  ${c.name}`);
  lines.push(`  Brightness  p10 ${a.brightness.p10}  p50 ${a.brightness.p50}  p90 ${a.brightness.p90}  (contrast ${a.contrast})`);
  lines.push(`  Saturation  p50 ${a.saturation.p50}  p90 ${a.saturation.p90}`);
  lines.push(`  Warmth      ${a.warmth} (${lean(a.warmth)})`);
  return lines.join('\n');
}

function compare(a, b) {
  const an = path.basename(a.file), bn = path.basename(b.file);
  const diffs = [];
  const say = (d, small, big, more, less) => {
    if (Math.abs(d) < small) return null;
    return `${Math.abs(d) >= big ? 'much ' : ''}${d > 0 ? more : less}`;
  };
  const parts = [
    say(a.brightness.p50 - b.brightness.p50, 6, 15, 'brighter', 'darker'),
    say(a.saturation.p50 - b.saturation.p50, 6, 15, 'more saturated (stronger colours)', 'less saturated (greyer colours)'),
    say(a.warmth - b.warmth, 6, 15, 'warmer', 'cooler'),
    say(a.contrast - b.contrast, 10, 25, 'more contrasty', 'flatter (less contrast)'),
  ].filter(Boolean);
  if (parts.length) {
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
    diffs.push(`${an} is ${list} than ${bn}.`);
  } else diffs.push(`${an} and ${bn} have about the same brightness, colour strength, warmth and contrast.`);
  if (Math.abs(a.brightness.p10 - b.brightness.p10) >= 10) {
    diffs.push(`Its shadows are ${a.brightness.p10 < b.brightness.p10 ? 'deeper' : 'lighter'} (darkest tenth: ${a.brightness.p10} vs ${b.brightness.p10}).`);
  }
  if (Math.abs(a.brightness.p90 - b.brightness.p90) >= 10) {
    diffs.push(`Its highlights are ${a.brightness.p90 < b.brightness.p90 ? 'dimmer' : 'brighter'} (brightest tenth: ${a.brightness.p90} vs ${b.brightness.p90}).`);
  }
  // Main colours of the second picture that the first one does not have anything close to.
  const missing = b.colours.filter((c) => c.share >= 8 && Math.min(...a.colours.map((x) => Math.sqrt(dist2(x.rgb, c.rgb)))) > 60);
  if (missing.length) {
    diffs.push(`Colours in ${bn} that ${an} is missing: ${missing.map((c) => `${c.name} ${c.hex} (${Math.round(c.share)}%)`).join(', ')}.`);
  }
  return diffs;
}

const results = args._.map(analyse);
if (args.json) {
  const out = results.length === 2 ? { a: results[0], b: results[1], differences: compare(results[0], results[1]) } : results[0];
  console.log(JSON.stringify(out, null, 1));
} else if (results.length === 1) {
  console.log(report(results[0]));
} else {
  const [a, b] = results;
  const A = report(a).split('\n'), B = report(b).split('\n');
  const w = Math.max(...A.map((l) => l.length)) + 4;
  const n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i++) console.log((A[i] || '').padEnd(w) + (B[i] || ''));
  console.log('\nDifferences:');
  for (const d of compare(a, b)) console.log(`  ${d}`);
}
