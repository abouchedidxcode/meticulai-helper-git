#!/usr/bin/env node
// Print the notes the player left in the game (key N) since the agent last read them.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { isVerbose, runTool, say } from '../lib/log.mjs';
import { gameDir, helperDir, pretty, readJson, writeJson } from '../lib/paths.mjs';

const HELP = `
node tools/play/notes.mjs [--all] [--peek]

Shows the notes you left in the game (press N while playing), newest last,
with the path to the screenshot taken with each note. Agents run this at the
start of every turn. Notes are marked as read once shown.

  --all         show every note, not only new ones
  --peek        show new notes without marking them read
  --dir <path>  use a different game folder (default: my-game/)
  --verbose     also show long game-state blocks in full
`;

await runTool(async () => {
  const { values: a } = getArgs({ all: { type: 'boolean' }, peek: { type: 'boolean' } }, HELP);
  const dir = gameDir(a.dir);
  const notesDir = path.join(dir, 'playtest-notes');
  const file = path.join(notesDir, 'NOTES.md');
  const readFile = path.join(helperDir(dir), 'notes-read.json');
  if (!fs.existsSync(file)) {
    say('No playtest notes yet. (Press N in the game to leave one.)');
    return 0;
  }
  const buf = fs.readFileSync(file);
  const seen = readJson(readFile, { bytes: 0 });
  let from = a.all ? 0 : Number(seen.bytes) || 0;
  if (from > buf.length) from = 0; // the file was replaced or trimmed: show everything
  let text = buf.subarray(from).toString('utf8');
  if (from === 0) {
    // skip the file's own heading, start at the first note
    const i = text.search(/^## /m);
    text = i >= 0 ? text.slice(i) : '';
  }
  text = text.trim();
  if (!a.peek) writeJson(readFile, { bytes: buf.length, at: new Date().toISOString() });
  if (!text) {
    say(a.all ? 'The notes file has no notes in it yet.' : 'No new playtest notes since last time.');
    return 0;
  }

  // keep long state blocks short unless --verbose
  if (!isVerbose()) {
    text = text.replace(/```json\n([\s\S]*?)```/g, (m, body) => {
      const lines = body.trimEnd().split('\n');
      return lines.length <= 25 ? m : '```json\n' + lines.slice(0, 25).join('\n') + `\n... (${lines.length - 25} more lines, see the file)\n` + '```';
    });
  }
  const count = (text.match(/^## /gm) || []).length;
  say(`${a.all ? 'All' : 'New'} playtest notes (${count || 'some'}) from ${pretty(file)}:\n`);
  say(text);
  const shots = [...new Set([...text.matchAll(/\((shots\/[^)\s]+\.png)\)/g)].map((m) => m[1]))];
  if (shots.length) {
    say('\nScreenshots (open them to see what the player saw):');
    for (const s of shots) say(`  ${pretty(path.join(notesDir, s))}`);
  }
  return 0;
});
