// Writing credits: a row in my-game/CREDITS.md (the table from templates/CREDITS.md) and a line in my-game/ASSETS.md.
import fs from 'node:fs';
import path from 'node:path';
import { licenseLabel, today } from './common.mjs';

const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ').trim();

/**
 * Add one row to the credits table. entry: { title, author, license, url, where, credit, note }.
 * Skips it if the same link + where is already there. Returns 'added' | 'already' .
 */
export function appendCredit(gameDir, entry) {
  const file = path.join(gameDir, 'CREDITS.md');
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '# Credits\n\n| Asset | Author | Licence | Link | Where used |\n| --- | --- | --- | --- | --- |\n';
  const where = entry.where || '';
  if (entry.url && text.includes(entry.url) && (!where || text.includes(where))) return 'already';
  const whereCell = [where, entry.credit ? `credit line: ${entry.credit}` : '', entry.note || ''].filter(Boolean).join('; ');
  const row = `| ${cell(entry.title)} | ${cell(entry.author)} | ${cell(licenseLabel(entry.license))} | ${cell(entry.url)} | ${cell(whereCell)} |`;
  const lines = text.split('\n');
  // find the first table whose header mentions Asset, and its last row
  let header = lines.findIndex((l) => /^\s*\|.*asset.*\|/i.test(l));
  if (header >= 0) {
    let end = header;
    while (end + 1 < lines.length && /^\s*\|/.test(lines[end + 1])) end++;
    lines.splice(end + 1, 0, row);
    text = lines.join('\n');
  } else {
    text = `${text.trimEnd()}\n\n| Asset | Author | Licence | Link | Where used |\n| --- | --- | --- | --- | --- |\n${row}\n`;
  }
  fs.writeFileSync(file, text.endsWith('\n') ? text : text + '\n');
  return 'added';
}

/** Append a line to my-game/ASSETS.md under "## Brought in" (only if ASSETS.md exists). Returns true if written. */
export function appendAssetsLog(gameDir, line) {
  const file = path.join(gameDir, 'ASSETS.md');
  if (!fs.existsSync(file)) return false;
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes(line)) return false;
  const heading = '## Brought in (written by tools/assets/get.mjs)';
  if (!text.includes(heading)) text = `${text.trimEnd()}\n\n${heading}\n\n`;
  fs.writeFileSync(file, `${text.trimEnd()}\n- ${today()}: ${line}\n`);
  return true;
}
