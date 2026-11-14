#!/usr/bin/env node
// The remix tool: make a downloaded model fit the game. Recolour to the game palette, flat or vertex colours,
// strip or shrink textures, roughness/metalness, rescale to metres, move the pivot, merge, compress.
// Always writes a NEW file; the original is never changed.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, bytes, detail, ok, runTool, say, warn } from '../lib/log.mjs';
import { gameDir, helperDir, pretty } from '../lib/paths.mjs';
import { readDoc, writeDoc } from './lib/gltf.mjs';
import { averageRgb, decodeBuffer, encodeBuffer } from './lib/image.mjs';
import { colourName, gamePalettePath, hexToRgb, kmeans, linearToRgb, nearest, readPalette, rgbToHex, rgbToLinear } from './lib/palette.mjs';
import { lookModels, modelFactsText } from './lib/looks.mjs';

const HELP = `
node tools/assets/restyle.mjs <in.glb> [options]

Remixes a model so it fits your game, and writes a NEW file (the original is never changed).

Colour
  --palette <file>        the game palette (default my-game/palette.json)
  --recolor nearest       each material becomes the nearest palette colour (default when a palette exists)
  --recolor map --map "<from>=<to>,..."
                          explicit: <from> is a material name or a #hex colour; <to> is a #hex colour or a palette
                          number (1 = first colour). E.g. --map "Leaves=#6f8a45,Bark=4"
  --recolor none          keep the colours
  --flat                  one flat colour per material, no textures (the low-poly look)
  --vertex-colors         bake each material's colour into the mesh and use ONE shared material (fewer draw calls)
Textures and surface
  --strip-textures        remove every texture
  --max-texture <px>      shrink textures to at most this size (e.g. 1024 or 512)
  --roughness <0..1>      set roughness everywhere (removes the roughness texture)
  --metalness <0..1>      set metalness everywhere
Size and placement
  --scale-to <metres>     resize so it is this big along --axis (default y = height). E.g. --scale-to 1.8
  --axis y|x|z|max        which size --scale-to means (max = the biggest side)
  --pivot bottom-center   move the origin to the middle of its base (it then stands on the ground at y = 0)
          center | keep
Files
  --merge                 join meshes that share a material (not for rigged or animated models)
  --compress meshopt|draco|none   smaller file (the game's loader must have the decoder; none is the default)
  --out <file>            where to write (default: <in>-restyled.glb next to the original)
  --look                  render before and after side by side when done (recommended)
  --in-game               with --look: light it like the game (palette.json light hints)
`;

const pct = (n) => `${Math.round(n * 100)}%`;

// "--palette" with no file after it means the game's palette (the default), so the docs' short form works too
const argv = process.argv.slice(2).filter((x, i, all) => !(x === '--palette' && (i === all.length - 1 || all[i + 1].startsWith('--'))));

await runTool(async () => {
  const { values: a, positionals } = getArgs({
    out: { type: 'string' }, palette: { type: 'string' }, recolor: { type: 'string' }, map: { type: 'string' },
    flat: { type: 'boolean' }, 'vertex-colors': { type: 'boolean' }, 'strip-textures': { type: 'boolean' },
    'max-texture': { type: 'number' }, roughness: { type: 'number' }, metalness: { type: 'number' },
    'scale-to': { type: 'number' }, axis: { type: 'string', default: 'y' }, pivot: { type: 'string', default: 'keep' },
    merge: { type: 'boolean' }, compress: { type: 'string', default: 'none' }, look: { type: 'boolean' }, 'in-game': { type: 'boolean' },
  }, HELP, argv);
  const input = positionals[0];
  if (!input) throw new HelperError("you didn't say which model to restyle.", 'For example:  node tools/assets/restyle.mjs my-game/.helper/candidates/<id>/<file>.glb --pivot bottom-center --look');
  const inFile = path.resolve(input);
  if (!fs.existsSync(inFile)) throw new HelperError(`I can't find ${input}.`, 'Check the path.');
  if (!/\.(glb|gltf)$/i.test(inFile)) throw new HelperError('restyle works on .glb and .gltf models.', 'For FBX or OBJ: open it in Blender (free) and use File > Export > glTF 2.0 (.glb), then restyle that.');
  const outFile = a.out ? path.resolve(a.out) : inFile.replace(/(-restyled(-\d+)?)?\.(glb|gltf)$/i, '-restyled.glb');
  if (path.resolve(outFile) === inFile) throw new HelperError('the output would overwrite the original.', 'Give another name with --out.');
  if (!['y', 'x', 'z', 'max'].includes(a.axis)) throw new HelperError(`--axis takes y, x, z or max, not "${a.axis}".`, 'y means height.');
  if (!['keep', 'bottom-center', 'center'].includes(a.pivot)) throw new HelperError(`--pivot takes bottom-center, center or keep, not "${a.pivot}".`, 'bottom-center makes it stand on the ground.');
  if (!['none', 'meshopt', 'draco'].includes(a.compress)) throw new HelperError(`--compress takes meshopt, draco or none, not "${a.compress}".`, 'meshopt is a good default when you need a smaller file.');
  for (const k of ['roughness', 'metalness']) if (a[k] != null && !(a[k] >= 0 && a[k] <= 1)) throw new HelperError(`--${k} goes from 0 to 1.`, `For example --${k} ${k === 'roughness' ? 0.8 : 0}.`);
  if (a['scale-to'] != null && !(a['scale-to'] > 0)) throw new HelperError('--scale-to needs a size in metres above 0.', 'For example --scale-to 1.8 for a person-sized thing.');

  const dir = gameDir(a.dir);
  const palFile = gamePalettePath(dir, a.palette);
  const palette = readPalette(palFile);
  const mode = a.recolor || (a.map ? 'map' : palette ? 'nearest' : 'none');
  if (!['nearest', 'map', 'none'].includes(mode)) throw new HelperError(`--recolor takes nearest, map or none, not "${a.recolor}".`, 'nearest picks the closest palette colour for each material.');
  if (mode === 'nearest' && !palette?.colors.length) throw new HelperError(`recolouring needs a palette, and ${pretty(palFile)} ${palette ? 'has no colours' : "doesn't exist"}.`, 'Make one with  node tools/assets/palette-from.mjs <picture>  or give --palette <file>.');
  const map = mode === 'map' ? parseMap(a.map, palette) : null;

  say(`Restyling ${path.basename(inFile)}...`);
  const doc = await readDoc(inFile);
  const root = doc.getRoot();
  const materials = root.listMaterials();
  const changes = [];
  const hasSkin = root.listSkins().length > 0, hasAnim = root.listAnimations().length > 0;

  // 1. what colour each material looks like now (factor x average of its colour texture), in sRGB
  const texAvg = new Map();
  const visible = new Map();
  for (const m of materials) {
    const f = m.getBaseColorFactor();
    let rgb = linearToRgb(f.slice(0, 3));
    const tex = m.getBaseColorTexture();
    if (tex) {
      if (!texAvg.has(tex)) {
        try { texAvg.set(tex, averageRgb(await decodeBuffer(Buffer.from(tex.getImage()), extOf(tex), { maxSide: 128 }))); } catch (e) { detail(e); texAvg.set(tex, null); }
      }
      const avg = texAvg.get(tex);
      if (avg) rgb = linearToRgb(rgbToLinear(avg).map((v, i) => v * f[i]));
    }
    visible.set(m, rgb);
  }
  const vcPrims = root.listMeshes().flatMap((me) => me.listPrimitives()).filter((p) => p.getAttribute('COLOR_0'));

  // 2. recolour
  const colourReport = [];
  if (mode !== 'none') {
    const cloneFor = new Map();
    // materials whose meshes are coloured per vertex (common in low-poly packs) keep a white base: the vertex
    // colours carry the colour and are recoloured below
    const vcOnly = new Set(materials.filter((m) => {
      const users = m.listParents().filter((p) => p.getAttribute);
      return users.length && users.every((p) => p.getAttribute('COLOR_0')) && !m.getBaseColorTexture();
    }));
    for (const m of materials) {
      if (vcOnly.has(m)) { colourReport.push({ name: m.getName() || '(no name)', before: rgbToHex(visible.get(m)), after: 'vertex', label: 'kept white; its vertex colours are recoloured' }); continue; }
      const before = visible.get(m);
      const target = mode === 'nearest' ? nearest(before, palette.materialColors) : mapTarget(map, m, before);
      if (!target) { colourReport.push({ name: m.getName() || '(no name)', before: rgbToHex(before), after: null }); continue; }
      const tex = m.getBaseColorTexture();
      const keepTex = tex && !a.flat && !a['strip-textures'] && !a['vertex-colors'];
      if (keepTex) {
        // keep the texture's detail but shift its colours so its average becomes the palette colour
        let t = tex;
        const users = tex.listParents().filter((p) => p !== root && materials.includes(p));
        if (users.length > 1) { t = cloneFor.get(`${tex.getURI()}|${target.hex}`) || doc.createTexture(`${tex.getName() || 'tex'}-${target.hex.slice(1)}`).copy(tex); cloneFor.set(`${tex.getURI()}|${target.hex}`, t); m.setBaseColorTexture(t); }
        const how = await retint(t, texAvg.get(tex), target.rgb, mode === 'nearest' ? palette.materialColors : null);
        m.setBaseColorFactor([1, 1, 1, m.getBaseColorFactor()[3]]);
        if (how === 'atlas') { colourReport.push({ name: m.getName() || '(no name)', before: rgbToHex(before), after: 'vertex', label: 'its texture is a colour atlas: each colour swatch moved to its nearest palette colour' }); continue; }
      } else {
        const lin = rgbToLinear(target.rgb);
        m.setBaseColorFactor([lin[0], lin[1], lin[2], m.getBaseColorFactor()[3]]);
      }
      visible.set(m, target.rgb);
      colourReport.push({ name: m.getName() || '(no name)', before: rgbToHex(before), after: target.hex, label: target.name || colourName(target.rgb), textured: !!keepTex });
    }
    if (vcPrims.length) {
      let n = 0;
      for (const p of vcPrims) n += recolourVertices(p.getAttribute('COLOR_0'), mode === 'nearest' ? (rgb) => nearest(rgb, palette.materialColors).rgb : (rgb) => mapTarget(map, null, rgb)?.rgb || null);
      changes.push(`vertex colours of ${vcPrims.length} mesh part(s) moved to the palette (${n.toLocaleString('en')} vertices)`);
    }
  }

  // 3. textures and surface
  if (a.flat || a['strip-textures'] || a['vertex-colors']) {
    let n = 0;
    for (const m of materials) {
      if (a['strip-textures'] || a['vertex-colors']) {
        for (const set of ['setBaseColorTexture', 'setNormalTexture', 'setOcclusionTexture', 'setMetallicRoughnessTexture', 'setEmissiveTexture']) { if (m[set.replace('set', 'get')]?.()) n++; m[set](null); }
      } else {
        // flat: drop colour detail and the bumpy look, keep nothing that makes it look photographic
        for (const set of ['setBaseColorTexture', 'setNormalTexture', 'setOcclusionTexture', 'setMetallicRoughnessTexture']) { if (m[set.replace('set', 'get')]?.()) n++; m[set](null); }
      }
      if (!a.recolor && mode === 'none' && !m.getBaseColorTexture()) {
        const rgb = visible.get(m); const lin = rgbToLinear(rgb);
        m.setBaseColorFactor([lin[0], lin[1], lin[2], m.getBaseColorFactor()[3]]);
      }
    }
    if (n) changes.push(`${n} texture slot(s) removed${a.flat ? ' (flat colours)' : ''}`);
  }
  if (a.roughness != null || a.metalness != null) {
    for (const m of materials) {
      if (a.roughness != null) m.setRoughnessFactor(a.roughness);
      if (a.metalness != null) m.setMetallicFactor(a.metalness);
      if (m.getMetallicRoughnessTexture()) m.setMetallicRoughnessTexture(null);
    }
    changes.push(`surface set to${a.roughness != null ? ` roughness ${a.roughness}` : ''}${a.metalness != null ? ` metalness ${a.metalness}` : ''} on ${materials.length} material(s)`);
  }

  // 4. vertex colours + one shared material
  if (a['vertex-colors']) {
    const shared = doc.createMaterial('palette').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(a.roughness ?? 0.85).setMetallicFactor(a.metalness ?? 0);
    let parts = 0;
    for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
      const m = p.getMaterial();
      const rgb = m ? visible.get(m) || [200, 200, 200] : [200, 200, 200];
      const lin = rgbToLinear(rgb);
      const pos = p.getAttribute('POSITION');
      if (!pos) continue;
      const count = pos.getCount();
      const old = p.getAttribute('COLOR_0');
      const arr = new Float32Array(count * 4);
      const el = [];
      for (let i = 0; i < count; i++) {
        let c = [1, 1, 1, 1];
        if (old) { old.getElement(i, el); c = [el[0], el[1], el[2], el.length > 3 ? el[3] : 1]; }
        arr.set([c[0] * lin[0], c[1] * lin[1], c[2] * lin[2], c[3]], i * 4);
      }
      const acc = doc.createAccessor().setType('VEC4').setArray(arr).setBuffer(root.listBuffers()[0] || doc.createBuffer());
      p.setAttribute('COLOR_0', acc);
      if (m && m.getAlphaMode() !== 'OPAQUE') { /* keep transparent parts on their own material */ continue; }
      p.setMaterial(shared);
      parts++;
    }
    changes.push(`colours baked into ${parts} mesh part(s); they now share one material`);
  }

  // 5. shrink textures
  if (a['max-texture']) {
    const max = Math.round(a['max-texture']);
    let n = 0;
    for (const t of root.listTextures()) {
      const s = t.getSize();
      if (!s || Math.max(s[0], s[1]) <= max) continue;
      const k = max / Math.max(s[0], s[1]);
      const ext = extOf(t);
      try {
        const img = await decodeBuffer(Buffer.from(t.getImage()), ext);
        const out = await encodeBuffer(img, ext === '.jpg' ? '.jpg' : '.png', { resizeTo: { width: Math.max(1, Math.round(s[0] * k)), height: Math.max(1, Math.round(s[1] * k)) } });
        t.setImage(new Uint8Array(out)).setMimeType(ext === '.jpg' ? 'image/jpeg' : 'image/png');
        n++;
      } catch (e) { detail(e); warn(`couldn't shrink the texture ${t.getName() || t.getURI() || ''} (${e.message}).`); }
    }
    changes.push(n ? `${n} texture(s) shrunk to at most ${max} px` : `textures were already ${max} px or smaller`);
  }

  // 6. size and pivot
  if (a['scale-to'] != null || a.pivot !== 'keep') {
    const { getBounds } = await import('@gltf-transform/core');
    for (const scene of root.listScenes()) {
      const b = getBounds(scene);
      const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
      if (!(Math.max(...size) > 0)) continue;
      const axisIdx = { x: 0, y: 1, z: 2 }[a.axis];
      const cur = a.axis === 'max' ? Math.max(...size) : size[axisIdx];
      const s = a['scale-to'] != null ? a['scale-to'] / cur : 1;
      const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2, cz = (b.min[2] + b.max[2]) / 2;
      const t = a.pivot === 'bottom-center' ? [-cx * s, -b.min[1] * s, -cz * s] : a.pivot === 'center' ? [-cx * s, -cy * s, -cz * s] : [0, 0, 0];
      const wrap = doc.createNode('restyle-root').setScale([s, s, s]).setTranslation(t);
      for (const c of scene.listChildren()) { scene.removeChild(c); wrap.addChild(c); }
      scene.addChild(wrap);
      if (a['scale-to'] != null) changes.push(`scaled x${s.toPrecision(3)}: ${a.axis === 'max' ? 'biggest side' : a.axis === 'y' ? 'height' : `${a.axis} size`} ${cur.toPrecision(3)} m -> ${a['scale-to']} m`);
      if (a.pivot !== 'keep') changes.push(`pivot moved to the ${a.pivot === 'bottom-center' ? 'middle of its base (stands on y = 0)' : 'centre'}`);
    }
  }

  // 7. merge, tidy, compress
  const fns = await import('@gltf-transform/functions');
  if (a.merge) {
    if (hasSkin || hasAnim) warn('it is rigged or animated, so I did not merge its meshes (that would break the animation).');
    else {
      const before = root.listMeshes().length;
      await doc.transform(fns.dedup(), fns.flatten(), fns.join(), fns.prune());
      changes.push(`merged: ${before} mesh(es) -> ${root.listMeshes().length}`);
    }
  }
  await doc.transform(fns.prune(), fns.dedup());
  if (a.compress === 'meshopt') {
    const { MeshoptEncoder } = await import('meshoptimizer');
    await MeshoptEncoder.ready;
    await doc.transform(fns.meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    changes.push('compressed with meshopt (load it with GLTFLoader.setMeshoptDecoder)');
  } else if (a.compress === 'draco') {
    await doc.transform(fns.draco());
    changes.push('compressed with Draco (load it with GLTFLoader.setDRACOLoader)');
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await writeDoc(doc, outFile);

  // report
  say('');
  if (colourReport.length) {
    say(`Colours (${mode === 'nearest' ? `nearest in ${pretty(palFile)}` : mode === 'map' ? 'your --map' : 'unchanged'}):`);
    for (const c of colourReport.slice(0, 24)) say(`  ${c.name.padEnd(24)} ${c.before} -> ${c.after === 'vertex' ? c.label : c.after ? `${c.after} (${c.label})${c.textured ? ', texture kept and tinted' : ''}` : 'unchanged (no rule for it)'}`);
    if (colourReport.length > 24) say(`  ...and ${colourReport.length - 24} more materials.`);
  } else if (mode === 'none') say('Colours: unchanged (no palette, or --recolor none).');
  for (const c of changes) ok(c);
  const sizeIn = fs.statSync(inFile).size, sizeOut = fs.statSync(outFile).size;
  ok(`Wrote ${pretty(outFile)} (${bytes(sizeOut)}, was ${bytes(sizeIn)}, ${pct(sizeOut / Math.max(1, sizeIn))}). The original is unchanged.`);

  if (a.look) {
    say('\nRendering before and after...');
    const look = a['in-game'] ? palette : null;
    const cmpOut = path.join(fs.existsSync(dir) ? path.join(helperDir(dir), 'looks') : path.dirname(outFile), `${path.basename(outFile, path.extname(outFile))}-compare.jpg`);
    const [r] = await lookModels([{ file: inFile, out: cmpOut, look, title: `${path.basename(inFile)} (before)` }], { compare: { file: outFile, title: `${path.basename(outFile)} (after)` } });
    say(`\nAfter (${path.basename(outFile)}):`);
    for (const l of modelFactsText(r.facts, outFile)) say(`  ${l}`);
    ok(`Before and after: ${pretty(r.out)}`);
    say('Open it and judge: does it now sit with the rest of the game?');
  } else {
    say(`\nNext: see before and after:  node tools/assets/look.mjs ${pretty(inFile)} --compare ${pretty(outFile)}   (or run restyle again with --look)`);
  }
  if (a.compress !== 'none') say('Note: the starter game\'s loader needs the matching decoder for compressed files (see recipes/ or ask your agent).');
  return 0;
});

// ---------------------------------------------------------------- helpers

function extOf(tex) {
  const mt = tex.getMimeType() || '';
  if (/jpe?g/.test(mt) || /\.jpe?g$/i.test(tex.getURI() || '')) return '.jpg';
  if (/webp/.test(mt)) return '.webp';
  return '.png';
}

/**
 * Recolour a texture. A colour atlas (a few flat swatches, common in low-poly packs) gets each swatch moved to its
 * nearest palette colour; a photo-like texture is shifted so its average becomes `target`, keeping light/dark detail.
 * Returns 'atlas' or 'tint'.
 */
async function retint(tex, avg, target, colors = null) {
  if (!avg) return 'none';
  const ext = extOf(tex);
  const img = await decodeBuffer(Buffer.from(tex.getImage()), ext);
  const d = img.data;
  const L = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (colors) {
    // smooth everywhere (flat swatches or gentle gradients, no photo grain) -> a colour atlas: recolour each colour group
    let diff = 0, n = 0;
    const W = img.width, H = img.height, rowStep = Math.max(1, Math.floor(H / 64));
    for (let y = 0; y < H; y += rowStep) for (let x = 1; x < W; x++) {
      const a = (y * W + x) * 4, b = a - 4;
      diff += Math.abs(d[a] - d[b]) + Math.abs(d[a + 1] - d[b + 1]) + Math.abs(d[a + 2] - d[b + 2]); n++;
    }
    const grain = diff / Math.max(1, n) / 3;
    detail(`texture grain ${grain.toFixed(2)} (below 3 = colour atlas)`);
    const sample = [];
    for (let i = 0; i < d.length; i += 4 * Math.max(1, Math.floor(d.length / 4 / 6000))) sample.push([d[i], d[i + 1], d[i + 2]]);
    const centres = grain < 3 ? kmeans(sample, 24).map((g) => g.rgb) : [];
    const near = (p) => { let b = 0, bd = Infinity; for (let c = 0; c < centres.length; c++) { const x = centres[c]; const dd = (p[0] - x[0]) ** 2 + (p[1] - x[1]) ** 2 + (p[2] - x[2]) ** 2; if (dd < bd) { bd = dd; b = c; } } return [b, bd]; };
    if (centres.length >= 2) {
      const targets = centres.map((c) => nearest(c, colors).rgb);
      const cache = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        let g = cache.get(key);
        if (g === undefined) { g = near([d[i], d[i + 1], d[i + 2]])[0]; cache.set(key, g); }
        const k = L(d[i], d[i + 1], d[i + 2]) / Math.max(1, L(...centres[g]));
        const t = targets[g];
        d[i] = Math.min(255, t[0] * k); d[i + 1] = Math.min(255, t[1] * k); d[i + 2] = Math.min(255, t[2] * k);
      }
      const out = await encodeBuffer(img, '.png');
      tex.setImage(new Uint8Array(out)).setMimeType('image/png');
      if (tex.getURI()) tex.setURI(tex.getURI().replace(/\.(webp|png|jpe?g)$/i, '.png'));
      return 'atlas';
    }
  }
  const la = Math.max(1, L(...avg));
  // blend: mostly the target colour, scaled by how light this pixel is compared to the average
  for (let i = 0; i < d.length; i += 4) {
    const k = L(d[i], d[i + 1], d[i + 2]) / la;
    d[i] = Math.min(255, target[0] * k); d[i + 1] = Math.min(255, target[1] * k); d[i + 2] = Math.min(255, target[2] * k);
  }
  const out = await encodeBuffer(img, ext === '.jpg' ? '.jpg' : '.png');
  tex.setImage(new Uint8Array(out)).setMimeType(ext === '.jpg' ? 'image/jpeg' : 'image/png');
  if (tex.getURI()) tex.setURI(tex.getURI().replace(/\.(webp|png|jpe?g)$/i, ext === '.jpg' ? '.jpg' : '.png'));
  return 'tint';
}

/** Map every vertex colour to a new colour. Returns how many vertices were changed. */
function recolourVertices(acc, fn) {
  const el = [];
  const cache = new Map();
  let n = 0;
  for (let i = 0; i < acc.getCount(); i++) {
    acc.getElement(i, el);
    const rgb = linearToRgb(el.slice(0, 3));
    const key = rgb.map(Math.round).join(',');
    let to = cache.get(key);
    if (to === undefined) { to = fn(rgb); cache.set(key, to); }
    if (!to) continue;
    const lin = rgbToLinear(to);
    const next = [...lin, ...(el.length > 3 ? [el[3]] : [])];
    acc.setElement(i, next);
    n++;
  }
  return n;
}

/** "Leaves=#6f8a45,Bark=4,#a0a0a0=#7d6a86" -> [{ from: { name } | { rgb }, to: rgb }] */
function parseMap(s, palette) {
  if (!s) throw new HelperError('--recolor map needs --map "<from>=<to>,...".', 'For example --map "Leaves=#6f8a45,Bark=#7a5c3e" (material names come from look.mjs).');
  return s.split(',').map((part) => {
    const [from, to] = part.split('=').map((x) => x && x.trim());
    if (!from || !to) throw new HelperError(`I can't read "${part}" in --map.`, 'Each rule is from=to, e.g. Leaves=#6f8a45.');
    let toRgb = hexToRgb(to);
    if (!toRgb && /^\d+$/.test(to)) toRgb = palette?.colors[Number(to) - 1]?.rgb || null;
    if (!toRgb) throw new HelperError(`"${to}" in --map is not a #hex colour${palette ? ' or a palette number' : ''}.`, 'Use a colour like #6f8a45.');
    const fromRgb = hexToRgb(from);
    return { from: fromRgb ? { rgb: fromRgb } : { name: from.toLowerCase() }, to: toRgb };
  });
}

function mapTarget(map, material, rgb) {
  const name = material?.getName()?.toLowerCase() || '';
  let rule = material ? map.find((r) => r.from.name && r.from.name === name) : null;
  if (!rule) {
    // a colour rule matches when the colour is close (RGB distance under 40)
    const close = map.filter((r) => r.from.rgb).map((r) => ({ r, d: Math.hypot(...r.from.rgb.map((v, i) => v - rgb[i])) })).sort((x, y) => x.d - y.d)[0];
    if (close && close.d < 40) rule = close.r;
  }
  return rule ? { rgb: rule.to, hex: rgbToHex(rule.to), name: colourName(rule.to) } : null;
}
