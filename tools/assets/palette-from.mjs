#!/usr/bin/env node
// Make my-game/palette.json from a picture the user chose as the look (a style frame or reference): 6-10 colours
// grouped as base / accent / shadow / light, plus light hints (sun, ambient, fog, background, exposure).
// restyle.mjs recolours models to it; look.mjs --in-game lights models with it.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, ok, runTool, say } from '../lib/log.mjs';
import { gameDir, helperDir, pretty, stamp, writeJson } from '../lib/paths.mjs';
import { decodeImage } from './lib/image.mjs';
import { colourDistance, colourName, hsv, kmeans, luma, rgbToHex } from './lib/palette.mjs';

const HELP = `
node tools/assets/palette-from.mjs <picture> [--count 8] [--name "warm dusk"] [--out my-game/palette.json]

Reads the main colours of a picture you chose for the game's look and writes them as the game palette
(my-game/palette.json): base colours (most of the picture), accents (strong, small), a shadow colour and a light
colour, plus hints for the sun, ambient light, fog, background and exposure.
The old palette.json is kept as a backup in my-game/.helper/.

  --count <n>   how many colours, 6 to 10 (default 8)
  --name <s>    a short name for the palette (default: from the picture's file name)
  --out <file>  write somewhere else
  --json        print the palette instead of a summary
`;

await runTool(async () => {
  const { values: a, positionals } = getArgs({ count: { type: 'number', default: 8 }, name: { type: 'string' }, out: { type: 'string' }, json: { type: 'boolean' } }, HELP);
  const src = positionals[0];
  if (!src) throw new HelperError("you didn't say which picture to take the colours from.", 'For example:  node tools/assets/palette-from.mjs my-game/refs/style-frame.png');
  const file = path.resolve(src);
  if (!fs.existsSync(file)) throw new HelperError(`I can't find ${src}.`, 'Check the name and the folder (pictures usually go in my-game/refs/).');
  const count = Math.max(6, Math.min(10, Math.round(a.count)));
  const dir = gameDir(a.dir);
  const out = a.out ? path.resolve(a.out) : path.join(dir, 'palette.json');

  const img = await decodeImage(file, { maxSide: 160 });
  const { width: W, height: H, data } = img;
  const px = [];
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 128) px.push([data[i], data[i + 1], data[i + 2]]);
  if (px.length < 50) throw new HelperError('the picture has almost no visible pixels.', 'Use a normal, non-transparent picture.');

  // more clusters than needed, then merge near-duplicates and drop specks
  let cl = kmeans(px, count + 4).filter((c) => c.share >= 0.008);
  const merged = [];
  for (const c of cl) {
    const near = merged.find((m) => colourDistance(m.rgb, c.rgb) < 0.045);
    if (near) { const t = near.share + c.share; near.rgb = near.rgb.map((v, i) => (v * near.share + c.rgb[i] * c.share) / t); near.share = t; } else merged.push({ ...c });
  }
  cl = merged.sort((x, y) => y.share - x.share);
  const sat = (c) => hsv(c.rgb).s;
  const L = (c) => luma(c.rgb);
  const shadowC = [...cl].sort((x, y) => L(x) - L(y))[0];
  const lightC = [...cl].sort((x, y) => L(y) - L(x))[0];
  const rest = cl.filter((c) => c !== shadowC && c !== lightC);
  // accents: clearly more colourful than the average and not a big part of the picture
  const avgSat = rest.reduce((s, c) => s + sat(c) * c.share, 0) / Math.max(1e-6, rest.reduce((s, c) => s + c.share, 0));
  let accent = rest.filter((c) => sat(c) > Math.max(45, avgSat + 15) && c.share < 0.12).slice(0, 3);
  let base = rest.filter((c) => !accent.includes(c)).slice(0, Math.max(2, count - 2 - accent.length));
  if (base.length + accent.length + 2 < count) accent = rest.filter((c) => !base.includes(c)).slice(0, count - 2 - base.length);

  // light hints from where things are in the frame
  const avgOf = (pred) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (data[i + 3] < 128 || !pred(x, y, data[i], data[i + 1], data[i + 2])) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    return n ? [r / n, g / n, b / n] : null;
  };
  const lumSorted = px.map((p) => luma(p)).sort((x, y) => x - y);
  const hi = lumSorted[Math.floor(lumSorted.length * 0.97)], lo = lumSorted[Math.floor(lumSorted.length * 0.1)], mid = lumSorted[Math.floor(lumSorted.length / 2)];
  const sun = avgOf((x, y, r, g, b) => luma([r, g, b]) >= hi) || lightC.rgb;
  const shadowAvg = avgOf((x, y, r, g, b) => luma([r, g, b]) <= lo) || shadowC.rgb;
  const top = avgOf((x, y) => y < H * 0.15) || lightC.rgb;
  const horizon = avgOf((x, y) => y > H * 0.3 && y < H * 0.5) || top;
  const ambient = avgOf((x, y) => y < H * 0.4) || top;
  const exposure = mid < 50 ? 0.9 : mid > 170 ? 1.1 : 1.0;
  const hex = (c) => rgbToHex(c.rgb || c);
  const name = a.name || path.basename(file).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');

  const palette = {
    name,
    colors: { base: base.map(hex), accent: accent.map(hex), shadow: rgbToHex(shadowAvg), light: rgbToHex(sun) },
    light: { sun: rgbToHex(sun), ambient: rgbToHex(ambient), fog: rgbToHex(horizon), background: rgbToHex(top), exposure, toneMapping: 'aces' },
    notes: `Made by palette-from.mjs from ${path.basename(file)} on ${new Date().toISOString().slice(0, 10)}. Base = most of the picture, biggest first; accents = strong colours kept for things that matter; shadow/light are the darkest and brightest areas. Light hints are guesses from where things sit in the frame: check them by eye.`,
    source: path.relative(path.dirname(out), file).split(path.sep).join('/'),
  };

  if (a.json) { console.log(JSON.stringify(palette, null, 2)); return 0; }
  if (fs.existsSync(out)) {
    const backup = path.join(fs.existsSync(dir) ? helperDir(dir) : path.dirname(out), `palette-before-${stamp()}.json`);
    fs.copyFileSync(out, backup);
    say(`The old palette is saved as ${pretty(backup)}.`);
  }
  writeJson(out, palette);
  const line = (label, list) => say(`  ${label.padEnd(8)} ${list.map((h) => `${h} ${colourName(hexRgb(h))}`).join(', ') || '(none)'}`);
  say(`\nPalette "${name}" from ${path.basename(file)}:`);
  line('base', palette.colors.base);
  line('accent', palette.colors.accent);
  line('shadow', [palette.colors.shadow]);
  line('light', [palette.colors.light]);
  say(`  light    sun ${palette.light.sun}, ambient ${palette.light.ambient}, fog ${palette.light.fog}, background ${palette.light.background}, exposure ${exposure}`);
  ok(`Wrote ${pretty(out)}`);
  say('Next: use it.  restyle.mjs <model.glb> --look  recolours a model to it;  look.mjs <file> --in-game  shows a model in this light.');
  return 0;
});

function hexRgb(h) { return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); }
