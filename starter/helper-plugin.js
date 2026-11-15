// Vite plugin for the dev server only (never part of a shipped build).
// It lets the game save things to disk for the agent to read:
//
//   POST /__helper/notes   { text, screenshot, state, url }
//        -> appends a dated section to playtest-notes/NOTES.md
//           and saves the screenshot to playtest-notes/shots/<stamp>.png
//   POST /__helper/tuning  { values }
//        -> writes src/tuning.json (pretty JSON) from the dev panel's "Save for my agent"
//   GET  /__helper/ping    -> { ok: true, game: "<gameName from helper.json>" }
//
// For the dev menu (src/core/dev/):
//   POST /__helper/palette { palette }
//        -> writes palette.json (the old one is kept in .helper/); the page then loads itself again
//   POST /__helper/shot    { png }
//        -> saves the picture as playtest-notes/shots/shot-<stamp>.png, answers { file }
//   GET  /__helper/vibes   -> { vibes: [{ id, name, one_line, mood, look, swatch }], current }
//        the kit's vibes, when the game sits inside a kit folder (../vibes/); an empty list otherwise
//   POST /__helper/vibe    { id }
//        -> puts that vibe on the game: runs the kit's tools/vibes/apply.mjs if it is there, else writes the
//           vibe's palette into palette.json
//
// Everything is relative to the Vite root (the game folder, where helper.json lives).

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

const MAX_BODY = 12 * 1024 * 1024; // 12 MB (a 1280-wide PNG is usually under 2 MB)
const MAX_TEXT = 5000;
const MAX_STATE = 50_000;
const MAX_TUNING = 200_000;
const MAX_PALETTE = 20_000;
const HEX = /^#[0-9a-f]{6}$/i;
const VIBE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('Body is not JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(obj));
}

// 2026-11-14_15-02-11 (local time): sorts by name, readable, safe in file names.
function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

// Write to a temp file then rename, so nothing ever reads a half-written file.
function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// A palette.json the game can read: colours are #rrggbb, numbers are numbers, nothing else gets in.
// Returns the cleaned palette, or a string saying what is wrong.
function cleanPalette(p) {
  if (!isPlainObject(p) || !isPlainObject(p.colors)) return 'palette.colors is required';
  const hex = (v) => typeof v === 'string' && HEX.test(v.trim());
  const hexList = (a, max) => Array.isArray(a) && a.length >= 1 && a.length <= max && a.every(hex);
  if (!hexList(p.colors.base, 4)) return 'palette.colors.base must be 1 to 4 colours like "#93ad5e"';
  const out = { name: typeof p.name === 'string' ? p.name.slice(0, 80) : 'my palette', colors: { base: p.colors.base.map((c) => c.trim().toLowerCase()) } };
  if (p.colors.accent !== undefined) {
    if (!hexList(p.colors.accent, 2)) return 'palette.colors.accent must be 1 or 2 colours';
    out.colors.accent = p.colors.accent.map((c) => c.trim().toLowerCase());
  }
  for (const k of ['danger', 'player', 'shadow', 'light', 'ink']) {
    if (p.colors[k] === undefined) continue;
    if (!hex(p.colors[k])) return `palette.colors.${k} must be a colour like "#4a3f5e"`;
    out.colors[k] = p.colors[k].trim().toLowerCase();
  }
  if (p.sky !== undefined) {
    if (!isPlainObject(p.sky)) return 'palette.sky must be an object';
    out.sky = {};
    for (const k of ['top', 'horizon', 'below', 'sun']) {
      if (p.sky[k] === undefined) continue;
      if (!hex(p.sky[k])) return `palette.sky.${k} must be a colour`;
      out.sky[k] = p.sky[k].trim().toLowerCase();
    }
  }
  if (p.light !== undefined) {
    if (!isPlainObject(p.light)) return 'palette.light must be an object';
    out.light = {};
    for (const k of ['sun', 'sunStrength', 'ambient', 'ground', 'ambientStrength', 'fog', 'fogAmount', 'exposure', 'sunElevation', 'sunAzimuth']) {
      const v = p.light[k];
      if (v === undefined) continue;
      const isColour = ['sun', 'ambient', 'ground', 'fog'].includes(k);
      if (isColour ? !hex(v) : !Number.isFinite(v)) return `palette.light.${k} must be a ${isColour ? 'colour' : 'number'}`;
      out.light[k] = isColour ? v.trim().toLowerCase() : Math.round(v * 1000) / 1000;
    }
  }
  if (typeof p.notes === 'string') out.notes = p.notes.slice(0, 2000);
  return out;
}

export default function helperPlugin() {
  let root = process.cwd();
  let lastTuningWrite = 0;
  let devServer = null;
  // Files the dev menu writes, after which the menu loads the page again itself. Two things make that reload see the
  // new file: Vite reads files through a cache its file watcher clears, so we wait until the watcher has seen the
  // write (watchFor) before answering; then, as Vite's own hot update does, the file and the modules importing it
  // get a new timestamp (fresh), so the page asks for new addresses and can't reuse its old copies. Vite's own
  // reload for these files is skipped (hotUpdate below): one reload, not two.
  const quietWrites = new Map();
  function watchFor(rel, ms = 2000) {
    const file = path.normalize(path.join(root, rel));
    const watcher = devServer?.watcher;
    let finish = () => {};
    const seen = !watcher
      ? Promise.resolve()
      : new Promise((resolve) => {
          const on = (f) => {
            if (path.normalize(f) === file) finish();
          };
          const timer = setTimeout(() => finish(), ms);
          finish = () => {
            clearTimeout(timer);
            watcher.off?.('change', on);
            watcher.off?.('add', on);
            setTimeout(resolve, 50); // let Vite's own handler for the same event run first
          };
          watcher.on('change', on);
          watcher.on('add', on);
        });
    return { seen, skip: () => finish() };
  }
  function fresh(rel) {
    const file = path.join(root, rel);
    quietWrites.set(path.normalize(file), Date.now());
    const g = devServer?.environments?.client?.moduleGraph ?? devServer?.moduleGraph;
    try {
      const seen = new Set();
      const now = Date.now();
      for (const m of g?.getModulesByFile?.(file) ?? []) g.invalidateModule(m, seen, now, true);
    } catch {
      /* an older Vite: its watcher still reloads the page */
    }
  }

  const gameName = () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(root, 'helper.json'), 'utf8')).gameName ?? 'My Game';
    } catch {
      return 'My Game';
    }
  };

  async function handleNotes(req, res) {
    const body = await readBody(req);
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
    if (!text) return send(res, 400, { ok: false, error: 'text is required' });

    let stateJson = '';
    if (body.state !== undefined) {
      stateJson = JSON.stringify(body.state, null, 2) ?? '';
      if (stateJson.length > MAX_STATE) stateJson = `${stateJson.slice(0, MAX_STATE)}\n... (cut)`;
    }

    const dir = path.join(root, 'playtest-notes');
    const shotsDir = path.join(dir, 'shots');
    fs.mkdirSync(shotsDir, { recursive: true });

    let name = stamp();
    for (let i = 2; fs.existsSync(path.join(shotsDir, `${name}.png`)); i++) name = `${stamp()}-${i}`;

    let shotLine = '- Screenshot: none';
    const shot = body.screenshot;
    if (typeof shot === 'string' && shot.startsWith('data:image/png;base64,')) {
      const png = Buffer.from(shot.slice('data:image/png;base64,'.length), 'base64');
      // Check the PNG signature so only real images are written.
      if (png.length > 8 && png.readUInt32BE(0) === 0x89504e47) {
        fs.writeFileSync(path.join(shotsDir, `${name}.png`), png);
        shotLine = `- Screenshot: [shots/${name}.png](shots/${name}.png)`;
      }
    }

    const url = typeof body.url === 'string' ? body.url.slice(0, 500) : '';
    const notesFile = path.join(dir, 'NOTES.md');
    if (!fs.existsSync(notesFile)) {
      fs.writeFileSync(
        notesFile,
        '# Playtest notes\n\nWritten in the game with the N key. Newest at the bottom.\n' +
          'The agent reads new ones with `node tools/play/notes.mjs`.\n',
      );
    }
    const quoted = text.split('\n').map((l) => `> ${l}`).join('\n');
    const section =
      `\n## Note ${name}\n\n${quoted}\n\n${shotLine}\n` +
      (url ? `- Page: ${url}\n` : '') +
      (stateJson ? `- Game state:\n\n\`\`\`json\n${stateJson}\n\`\`\`\n` : '');
    fs.appendFileSync(notesFile, section);
    send(res, 200, { ok: true, id: name });
  }

  async function handleTuning(req, res) {
    const body = await readBody(req);
    if (!isPlainObject(body.values)) return send(res, 400, { ok: false, error: 'values must be an object' });
    const json = JSON.stringify(body.values, null, 2);
    if (json.length > MAX_TUNING) return send(res, 413, { ok: false, error: 'tuning too large' });
    lastTuningWrite = Date.now();
    writeAtomic(path.join(root, 'src', 'tuning.json'), `${json}\n`);
    send(res, 200, { ok: true });
  }

  // Keep the old palette.json in .helper/ and write the new one.
  async function writePalette(palette) {
    const file = path.join(root, 'palette.json');
    const next = `${JSON.stringify(palette, null, 2)}\n`;
    const had = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (had === next) return false;
    const watch = watchFor('palette.json');
    if (had !== null) {
      const keep = path.join(root, '.helper');
      fs.mkdirSync(keep, { recursive: true });
      fs.writeFileSync(path.join(keep, `palette.before-${stamp()}.json`), had);
    }
    quietWrites.set(path.normalize(file), Date.now());
    writeAtomic(file, next);
    await watch.seen;
    fresh('palette.json');
    return true;
  }

  async function handlePalette(req, res) {
    const body = await readBody(req);
    const palette = cleanPalette(body.palette);
    if (typeof palette === 'string') return send(res, 400, { ok: false, error: palette });
    if (JSON.stringify(palette).length > MAX_PALETTE) return send(res, 413, { ok: false, error: 'palette too large' });
    send(res, 200, { ok: true, changed: await writePalette(palette) });
  }

  async function handleShot(req, res) {
    const body = await readBody(req);
    const shot = body.png;
    const head = 'data:image/png;base64,';
    if (typeof shot !== 'string' || !shot.startsWith(head)) return send(res, 400, { ok: false, error: 'png must be a PNG data URL' });
    const png = Buffer.from(shot.slice(head.length), 'base64');
    if (png.length <= 8 || png.readUInt32BE(0) !== 0x89504e47) return send(res, 400, { ok: false, error: 'not a PNG' });
    const dir = path.join(root, 'playtest-notes', 'shots');
    fs.mkdirSync(dir, { recursive: true });
    let name = `shot-${stamp()}`;
    for (let i = 2; fs.existsSync(path.join(dir, `${name}.png`)); i++) name = `shot-${stamp()}-${i}`;
    fs.writeFileSync(path.join(dir, `${name}.png`), png);
    send(res, 200, { ok: true, file: `playtest-notes/shots/${name}.png` });
  }

  // The kit this game sits in: the nearest folder above the game that has a vibes/ folder (normally the game's
  // parent, since the game is my-game/ inside a copy of the kit). null = the game is on its own.
  function findKit() {
    let dir = root;
    for (let i = 0; i < 3; i++) {
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
      if (fs.existsSync(path.join(dir, 'vibes'))) return dir;
    }
    return null;
  }
  const readJsonFile = (file) => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  };

  // Every ready vibe, with its palette. vibes/catalog.json names them if it is there; else every vibes/<id>/vibe.json.
  function listVibes() {
    const kit = findKit();
    if (!kit) return { kit: null, vibes: [] };
    const dir = path.join(kit, 'vibes');
    let ids = null;
    const catalog = readJsonFile(path.join(dir, 'catalog.json'));
    const entries = Array.isArray(catalog) ? catalog : Array.isArray(catalog?.vibes) ? catalog.vibes : null;
    if (entries) ids = entries.map((e) => (typeof e === 'string' ? e : e?.id)).filter((id) => typeof id === 'string');
    if (!ids || !ids.length) {
      try {
        ids = fs.readdirSync(dir).filter((id) => !id.startsWith('_') && !id.startsWith('.'));
      } catch {
        ids = [];
      }
    }
    const vibes = [];
    for (const id of ids) {
      if (!VIBE_ID.test(id)) continue;
      const v = readJsonFile(path.join(dir, id, 'vibe.json'));
      if (!isPlainObject(v) || (v.status ?? 'ready') !== 'ready') continue;
      if (typeof cleanPalette(v.palette) === 'string') continue; // no palette the game could read
      vibes.push({ ...v, id });
    }
    if (!entries) vibes.sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || String(a.name || a.id).localeCompare(String(b.name || b.id)));
    return { kit, vibes };
  }

  function handleVibes(res) {
    const { vibes } = listVibes();
    const now = readJsonFile(path.join(root, 'palette.json'));
    const chosen = readJsonFile(path.join(root, 'helper.json'))?.vibe;
    const sameColours = (v) => JSON.stringify(v.palette.colors?.base) === JSON.stringify(now?.colors?.base) && (v.palette.name ?? v.name) === now?.name;
    const current = vibes.find((v) => v.id === chosen && sameColours(v)) ?? vibes.find(sameColours) ?? null;
    send(res, 200, {
      ok: true,
      current: current?.id ?? null,
      vibes: vibes.map((v) => {
        const p = v.palette;
        const swatch = [p.sky?.top, p.sky?.horizon, p.colors.base[0], p.colors.base[2] ?? p.colors.base[1], p.colors.accent?.[0], p.colors.player, p.colors.shadow].filter((c) => typeof c === 'string' && HEX.test(c));
        return { id: v.id, name: String(v.name || v.id).slice(0, 80), one_line: String(v.one_line || '').slice(0, 200), mood: Array.isArray(v.mood) ? v.mood.slice(0, 6).map(String) : [], look: String(v.look?.id || 'none'), swatch };
      }),
    });
  }

  async function handleVibe(req, res) {
    const body = await readBody(req);
    const id = typeof body.id === 'string' ? body.id : '';
    if (!VIBE_ID.test(id)) return send(res, 400, { ok: false, error: 'id must be a vibe id' });
    const { kit, vibes } = listVibes();
    const vibe = vibes.find((v) => v.id === id);
    if (!vibe) return send(res, 404, { ok: false, error: `no vibe called "${id}"` });
    // The kit's own tool does the whole job (palette, drawing style, notes for the agent). Without it: the palette.
    const tool = path.join(kit, 'tools', 'vibes', 'apply.mjs');
    if (fs.existsSync(tool)) {
      // The files the tool may write that the game imports (see fresh()).
      const files = ['palette.json', 'helper.json', path.join('src', 'look', 'index.js')];
      const mtime = (rel) => fs.statSync(path.join(root, rel), { throwIfNoEntry: false })?.mtimeMs ?? 0;
      const before = files.map(mtime);
      for (const rel of files) quietWrites.set(path.normalize(path.join(root, rel)), Date.now() + 120_000);
      const watches = files.map((rel) => watchFor(rel));
      const out = await new Promise((resolve) => {
        execFile(process.execPath, [tool, id, '--dir', root, '--from', path.join(kit, 'vibes')], { cwd: kit, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => resolve({ err, text: `${stdout || ''}${stderr || ''}` }));
      });
      if (out.err) for (const rel of files) quietWrites.delete(path.normalize(path.join(root, rel))); // Vite reloads as usual
      if (out.err) return send(res, 500, { ok: false, error: (out.text.trim().split('\n').filter(Boolean).slice(-3).join(' ') || out.err.message).slice(0, 400) });
      files.forEach((rel, i) => { if (mtime(rel) === before[i]) watches[i].skip(); });
      await Promise.all(watches.map((w) => w.seen));
      for (const rel of files) fresh(rel);
      return send(res, 200, { ok: true, how: 'tool', id });
    }
    const p = vibe.palette;
    const palette = cleanPalette({ ...p, name: p.name || vibe.name || id, notes: p.notes || `From the "${vibe.name || id}" vibe. The game reads this file (src/core/look.js): change a colour here and the whole game follows.` });
    await writePalette(palette);
    send(res, 200, { ok: true, how: 'palette', id });
  }

  return {
    name: 'meticulai-helper',
    apply: 'serve', // dev server only

    configResolved(config) {
      root = config.root;
    },

    configureServer(server) {
      devServer = server;
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.startsWith('/__helper/')) return next();

        // Only the game's own page may post (blocks other websites from writing files).
        const origin = req.headers.origin;
        let originHost = null;
        try {
          originHost = origin ? new URL(origin).host : null;
        } catch {
          originHost = 'invalid';
        }
        if (origin && originHost !== req.headers.host) {
          return send(res, 403, { ok: false, error: 'wrong origin' });
        }

        try {
          if (url === '/__helper/ping' && req.method === 'GET') return send(res, 200, { ok: true, game: gameName() });
          if (url === '/__helper/notes' && req.method === 'POST') return await handleNotes(req, res);
          if (url === '/__helper/tuning' && req.method === 'POST') return await handleTuning(req, res);
          if (url === '/__helper/palette' && req.method === 'POST') return await handlePalette(req, res);
          if (url === '/__helper/shot' && req.method === 'POST') return await handleShot(req, res);
          if (url === '/__helper/vibes' && req.method === 'GET') return handleVibes(res);
          if (url === '/__helper/vibe' && req.method === 'POST') return await handleVibe(req, res);
          send(res, 404, { ok: false, error: 'unknown helper endpoint' });
        } catch (err) {
          send(res, err.status ?? 500, { ok: false, error: err.message });
        }
      });
    },

    // When "Save for my agent" writes tuning.json, the page already has those values:
    // don't reload it (the player would lose their place). Hand edits still reload.
    hotUpdate({ file }) {
      if (file.endsWith(path.join('src', 'tuning.json')) && Date.now() - lastTuningWrite < 3000) {
        return [];
      }
      // (the dev menu wrote this file and is loading the page again itself: see wrote())
      const at = quietWrites.get(path.normalize(file));
      if (at && Date.now() - at < 3000) return [];
    },
  };
}
