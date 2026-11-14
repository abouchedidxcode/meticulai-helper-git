// Numbered contact sheets of thumbnails (search results, pack contents, sprite folders) through ffmpeg.
// Thumbnails are downloaded once into ~/.cache/meticulai-helper/thumbs/ and flattened onto grey.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detail } from '../../lib/log.mjs';
import { contactSheets } from '../../lib/ffmpeg.mjs';
import { cacheDir, download, hash, mapLimit, mayFetch } from './common.mjs';
import { flattenTile, greyTile } from './image.mjs';

/** A local picture for a thumbnail URL or path (downloaded and cached). null if it can't be had. */
export async function localThumb(src) {
  if (!src) return null;
  if (!/^https?:/i.test(src)) return fs.existsSync(src) ? src : null;
  if (!mayFetch(src)) return null; // e.g. kenney.nl: grey tile, the list gives the page to open
  const ext = (/\.(png|jpe?g|webp|gif)(\?|$)/i.exec(src)?.[1] || 'img').toLowerCase();
  const file = path.join(cacheDir('thumbs'), `${hash(src)}.${ext}`);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  try {
    await download(src, file, { timeoutMs: 20000 });
    return file;
  } catch (e) {
    detail(`thumbnail failed: ${src}`, e);
    return null;
  }
}

/**
 * items: [{ thumb, label }] (label: a short number). Writes one or more sheets.
 * out: a file name like .../sheet.jpg; with more than cols*maxRows items, sheet-01.jpg, sheet-02.jpg...
 * Returns the sheet paths.
 */
export async function numberedSheet(items, out, { cols = 6, maxRows = 6, tile = 240, concurrency = 4 } = {}) {
  if (!items.length) return [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mhg-tiles-'));
  try {
    const local = await mapLimit(items, concurrency, (it) => localThumb(it.thumb));
    const tiles = [];
    for (let i = 0; i < items.length; i++) {
      const f = path.join(tmp, `t${String(i).padStart(4, '0')}.png`);
      const src = local[i] && !local[i].error ? local[i] : null;
      let ok = src ? await flattenTile(src, f, { size: tile }) : null;
      if (!ok) ok = await greyTile(f, { size: tile });
      tiles.push({ input: f, label: String(items[i].label) });
    }
    const rows = Math.min(maxRows, Math.ceil(items.length / cols));
    const multi = items.length > cols * rows;
    const pattern = multi ? out.replace(/\.jpg$/i, '-%02d.jpg') : path.join(tmp, 'one-%02d.jpg');
    const sheets = await contactSheets(tiles, pattern, { cols, rows, tileW: tile, tileH: tile });
    if (multi) return sheets;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(sheets[0], out);
    return [out];
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
