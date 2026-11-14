#!/usr/bin/env node
// Turn an asset into a picture an agent can see, plus facts: models (4 views with a grid and a person for scale),
// materials and textures, skies, sounds (waveform + loudness), fonts, folders (contact sheets).
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, bytes, ok, runTool, say, warn } from '../lib/log.mjs';
import { gameDir, helperDir, pretty } from '../lib/paths.mjs';
import { safeName } from './lib/common.mjs';
import { gamePalettePath, readPalette } from './lib/palette.mjs';
import {
  audioFacts, audioFactsText, classify, folderContents, lookAudio, lookFont, lookHdri, lookImages, lookMaterial,
  lookModelGrid, lookModels, modelFactsText,
} from './lib/looks.mjs';
import { materialMaps, listFiles } from './lib/common.mjs';

const HELP = `
node tools/assets/look.mjs <file or folder> [--in-game] [--out picture.jpg] [--compare other.glb] [--json]

Makes a picture you (or your agent) can open to SEE an asset, and prints the facts that matter:

  models (glb, gltf, fbx, obj)  four views (front, side, top, 3/4) on a grid with a 1.8 m person for scale;
                                size in metres, triangles, materials, textures, animations, where the pivot is
  textures and materials        the picture tiled 2 x 2 (to spot seams) and on a lit sphere and ground
  skies (hdr, exr)              the whole sky, where the sun is, and the light it gives to three test balls
  sounds (wav, mp3, ogg, ...)   the waveform, length, peak, average and loudness (LUFS), silence at the ends
  fonts (ttf, otf, woff)        a sample sheet
  folders                       a numbered contact sheet of the models, pictures or sounds inside

  --in-game           light it like the game: colours and light hints from my-game/palette.json, and the palette
                      shown under the picture to compare against
  --palette <file>    another palette file for --in-game
  --compare <file>    a second model: shows both, "before" above "after"
  --out <file>        where to save the picture (default my-game/.helper/looks/<name>.jpg)
  --json              print the facts as JSON
  --dir <folder>      the game folder (default my-game/)

Uses the hidden browser (one at a time; it waits its turn).
`;

await runTool(async () => {
  const { values: a, positionals } = getArgs({
    'in-game': { type: 'boolean' }, palette: { type: 'string' }, out: { type: 'string' }, compare: { type: 'string' }, json: { type: 'boolean' },
  }, HELP);
  const target = positionals[0];
  if (!target) throw new HelperError("you didn't say what to look at.", 'For example:  node tools/assets/look.mjs my-game/.helper/candidates/<id>/<file>.glb');
  const file = path.resolve(target);
  if (!fs.existsSync(file)) throw new HelperError(`I can't find ${target}.`, 'Check the path. Candidates are in my-game/.helper/candidates/, game files in my-game/public/assets/.');
  const dir = gameDir(a.dir);
  const outDir = fs.existsSync(dir) ? path.join(helperDir(dir), 'looks') : path.dirname(file);
  const base = safeName(path.basename(file).replace(/\.[^.]+$/, ''));
  const out = a.out ? path.resolve(a.out) : path.join(outDir, `${base}${a['in-game'] ? '-in-game' : ''}${a.compare ? '-compare' : ''}.jpg`);
  let look = null;
  if (a['in-game']) {
    const pf = gamePalettePath(dir, a.palette);
    look = readPalette(pf);
    if (!look) warn(`there is no ${pretty(pf)} yet, so --in-game uses neutral light. (Make one with palette-from.mjs <picture>.)`);
  }
  const kind = classify(file);
  const report = { file, kind, pictures: [], facts: null };
  const done = () => {
    if (a.json) { console.log(JSON.stringify(report, null, 1)); return 0; }
    say('');
    for (const p of report.pictures) ok(`Picture: ${pretty(p)}`);
    say('Open the picture to see it. Judge it against the game: style family, silhouette, colours, detail, size.');
    return 0;
  };

  if (kind === 'model') {
    say(`Rendering ${path.basename(file)}${a.compare ? ` next to ${path.basename(a.compare)}` : ''} in the hidden browser...`);
    const cmp = a.compare ? { file: path.resolve(a.compare), title: path.basename(a.compare) } : null;
    if (cmp && !fs.existsSync(cmp.file)) throw new HelperError(`I can't find ${a.compare}.`, 'Check the path of the second model.');
    const [r] = await lookModels([{ file, out, look, title: path.basename(file) }], { compare: cmp });
    report.pictures.push(r.out); report.facts = r.facts;
    if (!a.json) {
      say(`\n${path.basename(cmp ? cmp.file : file)} (${bytes(fs.statSync(cmp ? cmp.file : file).size)}):`);
      for (const l of modelFactsText(r.facts, file)) say(`  ${l}`);
      if (cmp && r.before) say(`  Before: ${r.before.size.x} x ${r.before.size.y} x ${r.before.size.z} m, ${r.before.triangles.toLocaleString('en')} triangles, ${r.before.materials.length} materials, ${r.before.textures.length} textures.`);
    }
    return done();
  }

  if (kind === 'texture') {
    // a colour map inside a material folder: show the whole material
    const sib = listFiles(path.dirname(file)).map((x) => path.join(path.dirname(file), x)).filter((x) => path.dirname(x) === path.dirname(file));
    const maps = materialMaps(sib);
    const useSet = maps && maps.color === file;
    say(`Rendering ${useSet ? 'the material' : 'the texture'} ${path.basename(file)}...`);
    const r = await lookMaterial(useSet ? maps : { color: file }, out, { name: path.basename(file), look });
    report.pictures.push(r.out); report.facts = r.facts;
    if (!a.json) say(`\n${path.basename(file)}: ${r.facts.width} x ${r.facts.height} px, ${bytes(fs.statSync(file).size)}, average colour ${r.facts.average}${useSet ? `, maps: ${r.facts.maps.join(', ')}` : ''}.`);
    return done();
  }

  if (kind === 'hdri') {
    say(`Rendering the sky ${path.basename(file)}...`);
    const r = await lookHdri(file, out);
    report.pictures.push(r.out); report.facts = r.facts;
    if (!a.json) {
      const f = r.facts;
      say(`\n${path.basename(file)}: ${f.width} x ${f.height} px, ${bytes(fs.statSync(file).size)}.`);
      say(`  ${f.hasSun ? `A clear sun ${f.brightest.elevation} degrees above the horizon: hard shadows. Point your sun light from there.` : `No strong sun: soft, even light. Brightest area ${f.brightest.elevation} degrees up.`}`);
      say('  Use it as scene.environment (light and reflections) and optionally scene.background. A 1k sky is plenty for lighting; the background looks blurry below 4k.');
    }
    return done();
  }

  if (kind === 'audio') {
    say(`Measuring ${path.basename(file)}...`);
    const f = await audioFacts(file);
    const [pic] = await lookAudio([file], out);
    report.pictures.push(pic); report.facts = f;
    if (!a.json) { say(`\n${path.basename(file)} (${bytes(fs.statSync(file).size)}):`); for (const l of audioFactsText(f)) say(`  ${l}`); }
    return done();
  }

  if (kind === 'font') {
    say(`Rendering a sample of ${path.basename(file)}...`);
    const r = await lookFont(file, out);
    report.pictures.push(r.out);
    return done();
  }

  // folder
  const c = folderContents(file);
  if (c.material && c.model.length === 0) {
    say(`Rendering the material in ${path.basename(file)}/...`);
    const r = await lookMaterial(c.material, out, { name: path.basename(file), look });
    report.pictures.push(r.out); report.facts = r.facts;
    if (!a.json) say(`\n${path.basename(file)}: ${r.facts.width} x ${r.facts.height} px, maps: ${r.facts.maps.join(', ')}, average colour ${r.facts.average}.`);
    return done();
  }
  if (!c.model.length && !c.image.length && !c.audio.length && !c.hdri.length && !c.font.length) {
    throw new HelperError(`${pretty(file)} has nothing I can show (no models, pictures, sounds, skies or fonts).`, 'Point look.mjs at a folder with asset files, or at one file.');
  }
  const listing = [];
  if (c.model.length) {
    say(`Rendering ${c.model.length} model${c.model.length > 1 ? 's' : ''} from ${path.basename(file)}/...`);
    const items = c.model.slice(0, 144).map((f, i) => ({ file: f, label: i + 1 }));
    const r = await lookModelGrid(items, out.replace(/\.jpg$/i, '-models.jpg'), { title: `${path.basename(file)}: ${c.model.length} models` });
    report.pictures.push(...r.outs);
    listing.push('Models (numbers as on the models sheet):');
    r.facts.forEach((f, i) => listing.push(`${String(i + 1).padStart(3)}  ${path.relative(file, items[i].file)}${f.error ? "  (couldn't load)" : `  ${f.size.x} x ${f.size.y} x ${f.size.z} m, ${f.triangles} triangles${f.animations ? `, ${f.animations} animations` : ''}`}`));
    if (c.model.length > 144) listing.push(`  ...and ${c.model.length - 144} more (look at a smaller folder to see them).`);
  }
  if (c.image.length) {
    const imgs = c.image.slice(0, 144);
    say(`Making a contact sheet of ${imgs.length} picture${imgs.length > 1 ? 's' : ''}...`);
    const sheets = await lookImages(imgs, out.replace(/\.jpg$/i, '-pictures.jpg'));
    report.pictures.push(...sheets);
    listing.push('Pictures (numbers as on the pictures sheet):');
    imgs.forEach((f, i) => listing.push(`${String(i + 1).padStart(3)}  ${path.relative(file, f)}`));
  }
  if (c.audio.length) {
    const sounds = c.audio.slice(0, 32);
    say(`Measuring ${sounds.length} sound${sounds.length > 1 ? 's' : ''}...`);
    const sheets = await lookAudio(sounds, out.replace(/\.jpg$/i, '-sounds.jpg'));
    report.pictures.push(...sheets);
    listing.push('Sounds (numbers as on the waveform sheet):');
    for (let i = 0; i < sounds.length; i++) {
      const f = await audioFacts(sounds[i]).catch(() => null);
      listing.push(`${String(i + 1).padStart(3)}  ${path.relative(file, sounds[i])}${f ? `  ${f.duration.toFixed(2)} s, peak ${f.peakDb} dBFS, ${f.lufs} LUFS` : ''}`);
    }
  }
  if (c.hdri.length) listing.push(`Skies: ${c.hdri.map((f) => path.relative(file, f)).join(', ')} (look at one file to see it).`);
  if (c.font.length) listing.push(`Fonts: ${c.font.map((f) => path.relative(file, f)).join(', ')} (look at one file to see a sample).`);
  report.facts = { listing };
  if (!a.json) { say(''); for (const l of listing) say(l); }
  return done();
});
