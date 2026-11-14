#!/usr/bin/env node
// Blind comparison: copies pictures under shuffled names (X, Y, Z...) so a critic agent can judge them without
// knowing which is the new version. The key is kept outside the folder the critic sees.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, ok, runTool, say } from '../lib/log.mjs';
import { gameDir, helperDir, pretty, readJson, writeJson } from '../lib/paths.mjs';

const HELP = `
node tools/play/blind-ab.mjs a.png b.png [c.png ...]
node tools/play/blind-ab.mjs --reveal <id>

Makes a blind test: copies the pictures into a new folder named X, Y, Z... in a random
order. Give a critic agent ONLY that folder and ask which is best and why. Then reveal.

  --reveal <id>   show which file was X, Y, Z...
  --list          list earlier blind tests
  --dir <path>    use a different game folder (default: my-game/)
  --verbose       show technical details
`;

const LETTERS = ['X', 'Y', 'Z', 'U', 'V', 'W', 'P', 'Q', 'R', 'S', 'T', 'K'];

await runTool(async () => {
  const { values: a, positionals } = getArgs({ reveal: { type: 'string' }, list: { type: 'boolean' } }, HELP);
  const dir = gameDir(a.dir);
  const blindRoot = path.join(helperDir(dir), 'blind');

  if (a.list) {
    const keys = fs.existsSync(blindRoot) ? fs.readdirSync(blindRoot).filter((f) => f.endsWith('.key.json')).sort() : [];
    if (!keys.length) say('No blind tests yet.');
    for (const k of keys) {
      const j = readJson(path.join(blindRoot, k), {});
      say(`  ${j.id}  ${j.created}  ${Object.keys(j.files || {}).length} pictures`);
    }
    return 0;
  }

  if (a.reveal) {
    const id = path.basename(a.reveal);
    const key = readJson(path.join(blindRoot, `${id}.key.json`));
    if (!key) throw new HelperError(`there is no blind test called ${id}.`, 'Run  node tools/play/blind-ab.mjs --list  to see them.');
    say(`Blind test ${id}:`);
    for (const [label, file] of Object.entries(key.files)) say(`  ${label} = ${file}`);
    return 0;
  }

  if (positionals.length < 2) throw new HelperError('a blind test needs at least two pictures.', 'For example:  node tools/play/blind-ab.mjs before.png after.png');
  if (positionals.length > LETTERS.length) throw new HelperError(`that's more than ${LETTERS.length} pictures.`, 'Compare fewer at a time.');
  const files = positionals.map((p) => path.resolve(p));
  for (const f of files) if (!fs.existsSync(f)) throw new HelperError(`I can't find ${pretty(f)}.`, 'Check the file names.');

  const order = files.map((f) => ({ f, r: crypto.randomInt(1e9) })).sort((x, y) => x.r - y.r).map((x) => x.f);
  const id = `${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(3).toString('hex')}`;
  const out = path.join(blindRoot, id);
  fs.mkdirSync(out, { recursive: true });
  const map = {};
  order.forEach((f, i) => {
    const name = `${LETTERS[i]}${path.extname(f).toLowerCase() || '.png'}`;
    fs.copyFileSync(f, path.join(out, name));
    map[LETTERS[i]] = pretty(f);
  });
  writeJson(path.join(blindRoot, `${id}.key.json`), { id, created: new Date().toISOString(), files: map });

  ok(`Blind test ready: ${order.length} pictures named ${LETTERS.slice(0, order.length).join(', ')}.`);
  say(`\nGive the critic ONLY this folder:\n  ${pretty(out)}`);
  say('Ask it which picture is best for the game and why, before you reveal anything.');
  say(`\nTo reveal which is which afterwards:\n  node tools/play/blind-ab.mjs --reveal ${id}${a.dir ? ` --dir ${a.dir}` : ''}`);
  return 0;
});
