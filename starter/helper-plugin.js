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
// Everything is relative to the Vite root (the game folder, where helper.json lives).

import fs from 'node:fs';
import path from 'node:path';

const MAX_BODY = 12 * 1024 * 1024; // 12 MB (a 1280-wide PNG is usually under 2 MB)
const MAX_TEXT = 5000;
const MAX_STATE = 50_000;
const MAX_TUNING = 200_000;

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

export default function helperPlugin() {
  let root = process.cwd();
  let lastTuningWrite = 0;

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

  return {
    name: 'meticulai-helper',
    apply: 'serve', // dev server only

    configResolved(config) {
      root = config.root;
    },

    configureServer(server) {
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
    },
  };
}
