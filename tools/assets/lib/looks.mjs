// What look.mjs does, as functions other tools can call: turn a model, material, sky, sound, font or folder into
// a picture an agent can open, plus facts in plain words.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HelperError, bytes, detail } from '../../lib/log.mjs';
import { contactSheets, ffmpeg, findFfmpeg, findFfprobe } from '../../lib/ffmpeg.mjs';
import { run } from '../../lib/proc.mjs';
import { fileKind, listFiles, materialMaps } from './common.mjs';
import { flattenTile } from './image.mjs';
import { withViewer, saveDataUrl } from './viewer.mjs';

const fmtM = (v) => (v >= 10 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3));

/** What kind of thing is this path? 'model' | 'material' | 'texture' | 'hdri' | 'audio' | 'font' | 'folder' */
export function classify(p) {
  const st = fs.statSync(p);
  if (st.isDirectory()) return 'folder';
  const k = fileKind(p);
  if (k === 'image') return 'texture';
  if (k) return k;
  throw new HelperError(`I don't know how to show ${path.basename(p)} (${path.extname(p) || 'no extension'}).`, 'look.mjs shows models (glb, gltf, fbx, obj), pictures and textures, skies (hdr, exr), sounds (wav, mp3, ogg...), fonts and folders of these.');
}

// ---------------------------------------------------------------- models

export function modelFactsText(f, file) {
  const s = f.size;
  const lines = [];
  lines.push(`Size: ${fmtM(s.x)} x ${fmtM(s.y)} x ${fmtM(s.z)} m (wide x tall x deep)${s.y > 0 ? `, ${(s.y / 1.8).toFixed(s.y / 1.8 < 1 ? 2 : 1)} times the height of a 1.8 m person` : ''}.`);
  const big = Math.max(s.x, s.y, s.z);
  if (big > 60 && /\.fbx$/i.test(file || '')) lines.push('  It may be in centimetres (common in FBX files): if it looks 100 times too big, scale it with restyle.mjs --scale-to.');
  if (big < 0.02) lines.push('  It is tiny: the file may be in different units. Use restyle.mjs --scale-to <metres>.');
  lines.push(`Triangles: ${f.triangles.toLocaleString('en')} in ${f.meshes} mesh${f.meshes === 1 ? '' : 'es'}${f.triangles > 150000 ? ' (heavy: fine for one hero object, too many for props you repeat)' : f.triangles > 30000 ? ' (medium: fine for a few, heavy if repeated a lot)' : ''}.`);
  const mats = f.materials.map((m) => `${m.name}${m.color ? ` ${m.color}` : ''}${m.textured ? ' +texture' : ''}`);
  lines.push(`Materials (${f.materials.length}): ${mats.slice(0, 8).join(', ')}${mats.length > 8 ? ', ...' : ''}${f.vertexColorMeshes ? `; ${f.vertexColorMeshes} mesh(es) use vertex colours` : ''}.`);
  if (f.textures.length) {
    const bySize = {};
    for (const t of f.textures) { const k = `${t.width}x${t.height}`; bySize[k] = (bySize[k] || 0) + 1; }
    lines.push(`Textures (${f.textures.length}): ${Object.entries(bySize).map(([k, n]) => `${n} x ${k} px`).join(', ')}.`);
  } else lines.push('Textures: none (flat colours).');
  const off = Math.hypot(f.center.x, f.center.z);
  const sinks = f.min.y < -Math.max(0.01, s.y * 0.02), floats = f.min.y > Math.max(0.01, s.y * 0.02);
  lines.push(`Pivot: ${sinks ? `the bottom is ${fmtM(-f.min.y)} m below the origin, so at y = 0 it sinks into the ground` : floats ? `the bottom is ${fmtM(f.min.y)} m above the origin, so at y = 0 it floats` : 'the bottom is at the origin, so it stands on the ground'}${off > Math.max(0.02, Math.max(s.x, s.z) * 0.1) ? `; its middle is ${fmtM(off)} m off the origin` : ''}${sinks || floats || off > Math.max(0.02, Math.max(s.x, s.z) * 0.1) ? ' (fix: restyle.mjs --pivot bottom-center)' : ''}.`);
  if (f.animations.length) lines.push(`Animations (${f.animations.length}): ${f.animations.slice(0, 12).map((a) => `${a.name} ${a.seconds} s`).join(', ')}${f.animations.length > 12 ? ', ...' : ''}${f.skinnedMeshes ? ` (rigged, ${f.bones} bones)` : ''}.`);
  else lines.push(`Animations: none${f.skinnedMeshes ? ` (but it is rigged, ${f.bones} bones)` : ''}.`);
  return lines;
}

/** Render one or more model sheets. jobs: [{ file, out, look, title }] -> [{ out, facts }] */
export async function lookModels(jobs, { compare = null } = {}) {
  return withViewer(async (v) => {
    const res = [];
    for (const j of jobs) {
      const args = { url: v.urlFor(j.file), ext: path.extname(j.file), name: path.basename(j.file), title: j.title, look: j.look || null };
      if (compare) {
        const b = { url: v.urlFor(compare.file), ext: path.extname(compare.file), name: path.basename(compare.file), title: compare.title, look: j.look || null };
        const r = await v.call('compare', { a: { ...args, title: `${args.title || args.name}` }, b });
        saveDataUrl(r.image, j.out);
        res.push({ out: j.out, facts: r.facts.after, before: r.facts.before });
      } else {
        const r = await v.call('modelSheet', args);
        saveDataUrl(r.image, j.out);
        res.push({ out: j.out, facts: r.facts });
      }
    }
    return res;
  });
}

/** A numbered grid of many models (3/4 views). items: [{ file, label }] -> { outs, facts } */
export async function lookModelGrid(items, out, { title = '', cols = 6, perSheet = 36 } = {}) {
  return withViewer(async (v) => {
    const outs = [], facts = [];
    for (let s = 0; s * perSheet < items.length; s++) {
      const group = items.slice(s * perSheet, s * perSheet + perSheet);
      const r = await v.call('modelGrid', { items: group.map((it) => ({ url: v.urlFor(it.file), ext: path.extname(it.file), label: it.label, name: path.basename(it.file) })), cols, tile: 256, title: items.length > perSheet ? `${title} (sheet ${s + 1})` : title }, 300000);
      const f = items.length > perSheet ? out.replace(/\.jpg$/i, `-${String(s + 1).padStart(2, '0')}.jpg`) : out;
      saveDataUrl(r.image, f);
      outs.push(f); facts.push(...r.facts);
    }
    return { outs, facts };
  });
}

// ---------------------------------------------------------------- materials, skies, fonts

export async function lookMaterial(maps, out, { name, look = null } = {}) {
  return withViewer(async (v) => {
    const urls = {};
    for (const [k, f] of Object.entries(maps)) if (f) urls[k] = v.urlFor(f);
    const r = await v.call('material', { maps: urls, name, look });
    saveDataUrl(r.image, out);
    return { out, facts: r.facts };
  });
}

export async function lookHdri(file, out) {
  return withViewer(async (v) => {
    const r = await v.call('hdri', { url: v.urlFor(file), ext: path.extname(file), name: path.basename(file) });
    saveDataUrl(r.image, out);
    return { out, facts: r.facts };
  });
}

export async function lookFont(file, out) {
  return withViewer(async (v) => {
    const r = await v.call('font', { url: v.urlFor(file), name: path.basename(file) });
    saveDataUrl(r.image, out);
    return { out, facts: r.facts };
  });
}

// ---------------------------------------------------------------- sounds (no browser: ffmpeg)

/** Duration, channels, peak/RMS (dBFS), loudness (LUFS), silence at the ends. */
export async function audioFacts(file) {
  const probe = findFfprobe(), ff = findFfmpeg();
  if (!probe || !ff) throw new HelperError('ffmpeg is not installed (needed to measure sounds).', 'Run  node tools/doctor.mjs --fix  and try again.');
  const p = await run(probe, ['-v', 'error', '-show_entries', 'format=duration:stream=channels,sample_rate,codec_name', '-select_streams', 'a:0', '-of', 'json', file]);
  let info = {};
  try { const j = JSON.parse(p.stdout); info = { duration: Number(j.format?.duration) || 0, channels: j.streams?.[0]?.channels, sampleRate: Number(j.streams?.[0]?.sample_rate), codec: j.streams?.[0]?.codec_name }; } catch { /* below */ }
  if (!info.channels) throw new HelperError(`I couldn't read ${path.basename(file)} as a sound.`, 'Check it is a normal wav, mp3, ogg or m4a file.');
  const r = await run(ff, ['-hide_banner', '-nostats', '-i', file, '-af', 'astats=metadata=0:reset=0,ebur128=framelog=quiet,silencedetect=n=-50dB:d=0.15', '-f', 'null', '-'], { timeout: 120000 });
  const err = r.stderr;
  const overall = err.split(/Overall/).pop() || '';
  const num = (re, s = overall) => { const m = re.exec(s); if (!m) return null; const v = Number(m[1]); return Number.isFinite(v) ? +v.toFixed(1) : null; };
  const peak = num(/Peak level dB:\s*(-?[\d.]+|-inf)/);
  const rms = num(/RMS level dB:\s*(-?[\d.]+|-inf)/);
  const lufs = num(/I:\s*(-?[\d.]+) LUFS/, err);
  const starts = [...err.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...err.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  let leading = 0, trailing = 0;
  if (starts.length && starts[0] <= 0.01 && ends.length) leading = ends[0];
  if (starts.length && (ends.length < starts.length || ends.at(-1) >= info.duration - 0.05)) trailing = Math.max(0, info.duration - starts.at(-1));
  return { ...info, peakDb: peak, rmsDb: rms, lufs, leadingSilence: +leading.toFixed(2), trailingSilence: +trailing.toFixed(2) };
}

export function audioFactsText(f) {
  const out = [`Length ${f.duration.toFixed(2)} s, ${f.channels === 1 ? 'mono' : f.channels === 2 ? 'stereo' : `${f.channels} channels`}, ${f.sampleRate} Hz (${f.codec}).`];
  const loud = f.lufs == null ? '' : f.lufs > -10 ? ' (very loud)' : f.lufs > -16 ? ' (loud)' : f.lufs > -24 ? ' (normal)' : f.lufs > -32 ? ' (quiet)' : ' (very quiet)';
  out.push(`Peak ${f.peakDb ?? '?'} dBFS${f.peakDb != null && f.peakDb > -0.3 ? ' (touches the maximum: may clip when mixed)' : ''}, average (RMS) ${f.rmsDb ?? '?'} dBFS, loudness ${f.lufs ?? '?'} LUFS${loud}.`);
  if (f.leadingSilence > 0.05 || f.trailingSilence > 0.05) out.push(`Silence: ${f.leadingSilence} s at the start, ${f.trailingSilence} s at the end${f.leadingSilence > 0.05 ? ' (a sound effect with silence at the start feels late: trim it)' : ''}.`);
  return out;
}

/** Waveform pictures. One file -> one wide image; several -> a numbered stack. */
export async function lookAudio(files, out, { start = 1 } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mhg-wave-'));
  try {
    const tiles = [];
    const h = files.length > 1 ? 140 : 200;
    for (let i = 0; i < files.length; i++) {
      const w = path.join(tmp, `w${i}.png`);
      await ffmpeg(['-i', files[i], '-filter_complex', `aformat=channel_layouts=mono,showwavespic=s=1200x${h}:colors=0x4cc9f0:scale=sqrt,format=rgba[w];color=c=0x1d2024:s=1200x${h}[bg];[bg][w]overlay=format=auto`, '-frames:v', '1', w], 'drawing a waveform');
      tiles.push({ input: w, label: files.length > 1 ? String(i + start) : '' });
    }
    if (files.length === 1) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await ffmpeg(['-i', tiles[0].input, '-frames:v', '1', '-q:v', '3', out], 'saving the waveform');
      return [out];
    }
    return await contactSheets(tiles, out.replace(/\.jpg$/i, '-%02d.jpg'), { cols: 1, rows: Math.min(8, files.length), tileW: 1200, tileH: 140 });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Contact sheet of pictures (sprites, icons), numbered, on grey so transparent ones show. */
export async function lookImages(files, out, { start = 1 } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mhg-sprites-'));
  try {
    const tiles = [];
    for (let i = 0; i < files.length; i++) {
      const f = path.join(tmp, `s${String(i).padStart(4, '0')}.png`);
      if (await flattenTile(files[i], f, { size: 200, bg: '0x9a9da2' })) tiles.push({ input: f, label: String(i + start) });
    }
    const cols = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(tiles.length))));
    const rows = Math.min(6, Math.ceil(tiles.length / cols));
    return await contactSheets(tiles, out.replace(/\.jpg$/i, '-%02d.jpg'), { cols, rows, tileW: 200, tileH: 200 });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Sort a folder's files into what look can show. */
export function folderContents(dir) {
  const rel = listFiles(dir);
  const abs = rel.map((r) => path.join(dir, r));
  const by = { model: [], image: [], hdri: [], audio: [], font: [] };
  for (const f of abs) { const k = fileKind(f); if (k && by[k]) by[k].push(f); }
  // one copy per model name (prefer glb)
  const rank = { '.glb': 0, '.gltf': 1, '.fbx': 2, '.obj': 3 };
  const m = new Map();
  for (const f of by.model) {
    const key = path.basename(f).replace(/\.[^.]+$/, '').toLowerCase();
    const cur = m.get(key);
    if (!cur || rank[path.extname(f).toLowerCase()] < rank[path.extname(cur).toLowerCase()]) m.set(key, f);
  }
  by.model = [...m.values()];
  by.material = materialMaps(by.image);
  detail({ folder: dir, models: by.model.length, images: by.image.length, audio: by.audio.length, material: !!by.material });
  return by;
}

export { bytes };
