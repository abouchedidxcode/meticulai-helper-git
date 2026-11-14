#!/usr/bin/env node
// Puts what face tracking needs into a public/ folder, so the game serves it itself (no CDN at runtime):
//   public/models/face_landmarker.task   Google's Face Landmarker model (Apache-2.0), downloaded once
//                                        from Google's official URL and checked against its sha256
//   public/wasm/                         the MediaPipe wasm runtime, copied from node_modules
//
//   node scripts/fetch-model.mjs                  this block's own public/ (the demo; runs before dev/build)
//   node vendor/meticulai-blink-input/scripts/fetch-model.mjs --out public     from my-game/, for the game
//
// Needs @mediapipe/tasks-vision installed (in this block or in the game).

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODEL = {
  file: 'face_landmarker.task',
  url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  bytes: 3758596,
  sha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
};

const blockDir = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const out = path.resolve(outArg >= 0 ? args[outArg + 1] : path.join(blockDir, 'public'));

const sha = (/** @type {Buffer} */ buf) => createHash('sha256').update(buf).digest('hex');

async function goodFile(p) {
  if (!existsSync(p)) return false;
  return sha(await readFile(p)) === MODEL.sha256;
}

/** Find node_modules/@mediapipe/tasks-vision/wasm from the current folder or this block, walking up. */
function findWasm() {
  for (const start of [process.cwd(), blockDir]) {
    let dir = start;
    for (;;) {
      const p = path.join(dir, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
      if (existsSync(p)) return p;
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  return null;
}

let failed = false;

// --- wasm ---
const wasmSrc = findWasm();
const wasmDst = path.join(out, 'wasm');
if (!wasmSrc) {
  console.warn('[fetch-model] @mediapipe/tasks-vision is not installed. Run: npm install @mediapipe/tasks-vision@1.1.0');
  failed = true;
} else {
  await mkdir(wasmDst, { recursive: true });
  // FilesetResolver.forVisionTasks(path) loads the SIMD or no-SIMD build; the *_module_* build is only used with
  // its useModule flag, so leave it out (saves 13 MB). Pass --module to copy it too.
  for (const f of await readdir(wasmSrc)) {
    if (f.includes('_module_') && !args.includes('--module')) continue;
    await copyFile(path.join(wasmSrc, f), path.join(wasmDst, f));
  }
  console.log(`[fetch-model] MediaPipe wasm -> ${path.relative(process.cwd(), wasmDst) || '.'}`);
}

// --- model ---
const modelDst = path.join(out, 'models', MODEL.file);
const blockCopy = path.join(blockDir, 'public', 'models', MODEL.file);
await mkdir(path.dirname(modelDst), { recursive: true });
if (await goodFile(modelDst)) {
  console.log('[fetch-model] model already present');
} else if (modelDst !== blockCopy && (await goodFile(blockCopy))) {
  await copyFile(blockCopy, modelDst);
  console.log('[fetch-model] model copied from the block');
} else {
  try {
    const res = await fetch(MODEL.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (sha(buf) !== MODEL.sha256) throw new Error(`the download did not match its fingerprint (sha256 ${sha(buf).slice(0, 12)}...)`);
    await writeFile(modelDst, buf);
    console.log(`[fetch-model] downloaded ${MODEL.file} (${(buf.length / 1e6).toFixed(1)} MB) and checked it`);
  } catch (err) {
    failed = true;
    console.warn(`[fetch-model] could not download the face model: ${/** @type {Error} */ (err).message}`);
    console.warn(`  Download it from ${MODEL.url}`);
    console.warn(`  and save it as ${modelDst}`);
  }
}

// Never fail the dev server or build over this: the keyboard fallback still works without a model.
if (failed) console.warn('[fetch-model] face tracking will not work until the files above are in place.');
