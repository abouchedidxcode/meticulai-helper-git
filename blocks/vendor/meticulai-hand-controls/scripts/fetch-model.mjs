#!/usr/bin/env node
// Puts the two things the camera needs next to the game's pages:
//   <out>/models/hand_landmarker.task  downloaded from Google's official URL, checked against its SHA-256
//   <out>/wasm/                         MediaPipe's wasm runtime, copied from node_modules/@mediapipe/tasks-vision
// The model is not committed to this kit (it is Google's file, 7.8 MB); it is fetched once and cached here.
//
//   node scripts/fetch-model.mjs                 -> into this block's public/ (for the demo)
//   node vendor/meticulai-hand-controls/scripts/fetch-model.mjs --out public   (from my-game/)
//
// No network? It warns and exits 0, so `npm run dev` still starts: synthetic hands, mouse and touch
// keep working; only the camera needs the model.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODEL = {
  url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  bytes: 7819105,
  sha256: 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1',
  file: 'models/hand_landmarker.task',
};

const blockDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outArg = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const out = resolve(outArg ?? join(blockDir, 'public'));

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

async function fetchModel() {
  const dest = join(out, MODEL.file);
  if (existsSync(dest) && sha(readFileSync(dest)) === MODEL.sha256) {
    console.log(`hand model: already in ${MODEL.file} (checked)`);
    return true;
  }
  mkdirSync(dirname(dest), { recursive: true });
  // already downloaded into this block's own public/ (tools/blocks/add.mjs does that)? copy it, no second download
  const local = join(blockDir, 'public', MODEL.file);
  if (local !== dest && existsSync(local) && sha(readFileSync(local)) === MODEL.sha256) {
    cpSync(local, dest);
    console.log(`hand model: copied from the block folder (checked) -> ${MODEL.file}`);
    return true;
  }
  let buf;
  try {
    const res = await fetch(MODEL.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.warn(`hand model: could not download it (${e.message}).`);
    console.warn(`  The camera will not work until it is there. Synthetic hands, mouse and touch still work.`);
    console.warn(`  Try again online, or download ${MODEL.url} into ${dest}`);
    return false;
  }
  const got = sha(buf);
  if (got !== MODEL.sha256) {
    console.error(`hand model: the download does not match the expected fingerprint (sha256 ${got}). Not saved.`);
    console.error('  Google may have replaced the file. Check the URL and update MODEL in scripts/fetch-model.mjs.');
    process.exit(1);
  }
  writeFileSync(dest + '.part', buf);
  renameSync(dest + '.part', dest);
  console.log(`hand model: downloaded and checked (${(buf.length / 1e6).toFixed(1)} MB) -> ${MODEL.file}`);
  return true;
}

/** node_modules/@mediapipe/tasks-vision/wasm, looked up from the output folder, the current folder and this block. */
function findWasm() {
  for (const start of [out, process.cwd(), blockDir]) {
    let dir = start;
    for (;;) {
      const p = join(dir, 'node_modules/@mediapipe/tasks-vision/wasm');
      if (existsSync(p)) return p;
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  return null;
}

function copyWasm() {
  const src = findWasm();
  if (!src) {
    console.error('wasm: node_modules/@mediapipe/tasks-vision is missing. Run `npm install` first (add "@mediapipe/tasks-vision": "1.1.0" to package.json).');
    process.exit(1);
  }
  const dst = join(out, 'wasm');
  mkdirSync(dst, { recursive: true });
  // FilesetResolver.forVisionTasks(path) loads the SIMD or no-SIMD build; the *_module_* build is only used with its
  // useModule flag, so leave it out (saves 13 MB). Pass --module to copy it too.
  for (const f of readdirSync(src)) {
    if (f.includes('_module_') && !args.includes('--module')) continue;
    cpSync(join(src, f), join(dst, f));
  }
  console.log(`wasm: MediaPipe runtime copied to ${dst} (${readdirSync(dst).length} files)`);
}

copyWasm();
await fetchModel();
