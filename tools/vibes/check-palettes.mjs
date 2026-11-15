#!/usr/bin/env node
// Check every vibe in vibes/: are its files complete, and does its palette work BY ROLE in a game?
// A palette can look lovely as swatches and still fail in play: a pickup the colour of the grass,
// a hazard the colour of the goal, a player who vanishes into the ground, text nobody can read.
// This puts numbers on those four things. Plain Node, no packages.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getArgs } from '../lib/args.mjs';
import { runTool, say, ok, warn, bad } from '../lib/log.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const HELP = `
node tools/vibes/check-palettes.mjs [vibe-id ...] [--json] [--quiet]

Checks every vibe in vibes/ (or only the ones you name). A vibe FAILS when:
  - a required field is missing, or a colour is not written as #rrggbb
  - an accent is too close to any of the four base colours (pickups would not stand out)
  - danger is too close to an accent or a base (the player could not tell harm from help)
  - the player colour is too close to base[0] or base[1] (the player would vanish into the ground),
    or too close to danger
  - the text colour has less than 4.5 to 1 contrast on the kit's UI card (text would be hard to read)
  - a block or asset family it names is not in the kit's catalogues, or a frame picture is missing,
    too big or the wrong size

"Too close" is measured as a distance between colours the way the eye sees them (OKLab x 100:
0 = the same colour, about 2 = just visible side by side, 100 = black against white).
Notes (lines starting with "note") are worth a look but do not fail the vibe.
With --verbose it also lists the vibes whose text colour is weak straight over the ground (fine on the
UI card, which is where the kit puts text).

  --json    print the numbers for every vibe
  --quiet   only print problems and the summary
`;

// How far apart two roles must be (OKLab distance x 100). Measured on the kit's default palette
// ('warm dusk', played a lot): its amber pickup is 17.6 from the nearest base, its red 13.6 from the
// nearest base, its player 17.5 from the ground. Pairs that are honestly hard to tell apart in play
// (yellow paint on pale cardboard, teal on sage) measure 9 to 11. So the lines sit in between.
// New palettes should aim a few points above them.
export const LIMITS = {
  accentFromBase: 13, // a pickup against the ground and walls
  dangerFromBase: 13,
  dangerFromAccent: 12, // harm must not look like the goal
  playerFromGround: 16, // against base[0] and base[1], where the player stands most of the time
  playerFromDanger: 12,
  playerFromOther: 8, // against base[2], base[3] and the accents: a note, not a failure
  inkContrast: 4.5,
};

// --- colour maths (the same sRGB rules as starter/src/core/look.js) ----------------------------
const isHex6 = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const toRgb = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => { const A = toRgb(a); const B = toRgb(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const shade = (c, amt) => (amt >= 0 ? mix(c, '#ffffff', amt) : mix(c, '#000000', -amt));
const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export const luminance = (c) => { const [r, g, b] = toRgb(c).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

function oklab(hex) {
  const [r, g, b] = toRgb(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
/** Distance between two colours as the eye sees it, 0..100. */
export function distance(a, b) {
  const A = oklab(a); const B = oklab(b);
  return 100 * Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

/** The card and text colours the kit's UI ends up with (mirrors applyLookToUI in core/look.js). */
export function uiColours(c) {
  const darkUi = luminance(c.shadow) < 0.35;
  const card = darkUi ? c.shadow : shade(c.shadow, -0.55);
  return { darkUi, card: mix(card, '#000000', 0.25), ink: darkUi ? c.ink : shade(c.light, 0.75), alpha: 0.78 };
}

// --- reading JPEG size without a package --------------------------------------------------------
function jpegSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const idsIn = (file, key) => { try { return new Set((readJson(file)[key] || []).map((x) => x.id)); } catch { return null; } };

export function checkVibe(dir, known) {
  const id = path.basename(dir);
  const problems = [];
  const notes = [];
  const hints = []; // true of most pale palettes and already handled by the kit's UI card: only shown with --verbose
  const numbers = {};
  const P = (m) => problems.push(m);
  let v;
  try { v = readJson(path.join(dir, 'vibe.json')); } catch (e) { return { id, problems: [`vibe.json is missing or is not valid JSON (${e.message})`], notes, hints, numbers }; }

  // 1. required fields
  if (v.id !== id) P(`"id" is "${v.id}" but the folder is "${id}"`);
  for (const k of ['name', 'one_line', 'look_words', 'sound_feel']) if (typeof v[k] !== 'string' || !v[k].trim()) P(`"${k}" is missing`);
  for (const k of ['mood', 'blocks', 'asset_search', 'asset_families', 'good_for', 'frames']) if (!Array.isArray(v[k]) || !v[k].length) P(`"${k}" is missing or empty`);
  if (!Array.isArray(v.upgrade)) P('"upgrade" must be a list (it can be empty)');
  if (!v.music || typeof v.music.mood !== 'string') P('"music.mood" is missing');
  if (!v.look || typeof v.look.id !== 'string') P('"look.id" is missing (use "none")');
  if (typeof v.look_words === 'string' && v.look_words.length < 200) notes.push('look_words is short: an agent needs palette, shapes, light, motion, materials and what to avoid');

  const pal = v.palette || {};
  const c = pal.colors || {};
  const sky = pal.sky || {};
  const li = pal.light || {};
  const hexes = {
    ...Object.fromEntries([0, 1, 2, 3].map((i) => [`colors.base[${i}]`, c.base?.[i]])),
    'colors.accent[0]': c.accent?.[0], 'colors.accent[1]': c.accent?.[1],
    'colors.danger': c.danger, 'colors.player': c.player, 'colors.shadow': c.shadow, 'colors.light': c.light, 'colors.ink': c.ink,
    'sky.top': sky.top, 'sky.horizon': sky.horizon, 'sky.below': sky.below, 'sky.sun': sky.sun,
    'light.sun': li.sun, 'light.ambient': li.ambient, 'light.ground': li.ground, 'light.fog': li.fog,
  };
  let coloursOk = true;
  for (const [k, val] of Object.entries(hexes)) if (!isHex6(val)) { coloursOk = false; P(`palette.${k} is ${val === undefined ? 'missing' : `"${val}", not #rrggbb`}`); }
  const ranges = { sunStrength: [0, 12], ambientStrength: [0, 8], fogAmount: [0, 1], exposure: [0.2, 3], sunElevation: [-10, 90], sunAzimuth: [-360, 720] };
  for (const [k, [lo, hi]] of Object.entries(ranges)) if (!Number.isFinite(li[k]) || li[k] < lo || li[k] > hi) P(`palette.light.${k} must be a number from ${lo} to ${hi} (got ${li[k]})`);
  if (typeof pal.name !== 'string' || !pal.name) P('palette.name is missing');

  // 2. the palette by role
  if (coloursOk) {
    const d = (a, b) => Math.round(distance(a, b) * 10) / 10;
    const near = (what, a, others, limit, list = problems) => {
      for (const [name, col] of others) {
        const dist = d(a, col);
        if (dist < limit) list.push(`${what} ${a} is too close to ${name} ${col} (distance ${dist}, needs ${limit})`);
      }
    };
    const bases = c.base.map((col, i) => [`base[${i}]`, col]);
    const accents = c.accent.map((col, i) => [`accent[${i}]`, col]);
    c.accent.forEach((a, i) => near(`accent[${i}]`, a, bases, LIMITS.accentFromBase));
    near('danger', c.danger, bases, LIMITS.dangerFromBase);
    near('danger', c.danger, accents, LIMITS.dangerFromAccent);
    near('player', c.player, bases.slice(0, 2), LIMITS.playerFromGround);
    near('player', c.player, [['danger', c.danger]], LIMITS.playerFromDanger);
    near('player', c.player, [...bases.slice(2), ...accents], LIMITS.playerFromOther, notes);

    const ui = uiColours(c);
    const onCard = contrast(ui.ink, ui.card);
    const behind = [['the ground', c.base[0]], ['the horizon', sky.horizon]].map(([n, col]) => [n, contrast(ui.ink, mix(col, ui.card, ui.alpha))]);
    if (onCard < LIMITS.inkContrast) P(`text ${ui.ink} on the UI card ${ui.card} has contrast ${onCard.toFixed(2)}, needs ${LIMITS.inkContrast}`);
    for (const [n, k] of behind) if (k < LIMITS.inkContrast) P(`text ${ui.ink} on the see-through UI card over ${n} has contrast ${k.toFixed(2)}, needs ${LIMITS.inkContrast}`);
    if (!ui.darkUi) notes.push('shadow is pale, so the kit works out its own UI text colour and "ink" is only used by the game');
    const overGame = contrast(c.ink, c.base[0]);
    if (overGame < 3) hints.push(`ink ${c.ink} straight over the ground ${c.base[0]} has contrast ${overGame.toFixed(2)}: keep text on a card or give it a dark edge`);
    if (luminance(c.shadow) >= luminance(c.light)) P(`shadow ${c.shadow} should be darker than light ${c.light}`);

    numbers.accentFromBase = Math.min(...c.accent.flatMap((a) => c.base.map((b) => d(a, b))));
    numbers.dangerFromBase = Math.min(...c.base.map((b) => d(c.danger, b)));
    numbers.dangerFromAccent = Math.min(...c.accent.map((a) => d(c.danger, a)));
    numbers.playerFromGround = Math.min(d(c.player, c.base[0]), d(c.player, c.base[1]));
    numbers.playerFromDanger = d(c.player, c.danger);
    numbers.inkOnCard = Math.round(Math.min(onCard, ...behind.map((x) => x[1])) * 100) / 100;
  }

  // 3. ids that must exist in the kit
  const blockIds = [...(Array.isArray(v.blocks) ? v.blocks : []), ...(Array.isArray(v.upgrade) ? v.upgrade.map((u) => u?.block) : [])];
  if (known.blocks) for (const b of blockIds) if (!known.blocks.has(b)) P(`block "${b}" is not in blocks/catalog.json`);
  if (known.families) for (const f of v.asset_families || []) if (!known.families.has(f)) P(`asset family "${f}" is not in sources/catalog.json`);
  if (Array.isArray(v.upgrade)) for (const u of v.upgrade) if (!u || typeof u.why !== 'string' || !u.why) P('every "upgrade" needs a "why"');
  if (v.look && v.look.id !== 'none' && known.looks && !known.looks.has(v.look.id)) P(`look "${v.look.id}" is not in looks/`);

  // 4. the frames (mood pictures)
  const frames = Array.isArray(v.frames) ? v.frames : [];
  if (frames.length && (frames.length < 2 || frames.length > 3)) P(`a vibe has 2 or 3 frames (this one has ${frames.length})`);
  for (const f of frames) {
    const file = path.join(dir, f.file || '');
    if (!f.file || !fs.existsSync(file)) { P(`frame ${f.file || '(no file)'} does not exist`); continue; }
    if (!['reused', 'generated'].includes(f.source)) P(`frame ${f.file}: "source" must be "reused" or "generated"`);
    if (!f.model) P(`frame ${f.file}: "model" is missing`);
    if (f.source === 'generated' && (!f.prompt || !f.date)) P(`frame ${f.file}: a generated frame needs its "prompt" and "date"`);
    const kb = fs.statSync(file).size / 1024;
    if (kb > 300) P(`frame ${f.file} is ${Math.round(kb)} KB (keep it under 300 KB)`);
    const size = jpegSize(file);
    if (!size) P(`frame ${f.file} is not a JPEG`);
    else if (size.w !== 1280 || size.h !== 720) P(`frame ${f.file} is ${size.w} x ${size.h} (make it 1280 x 720)`);
  }

  // 5. nothing private in a public file
  const raw = fs.readFileSync(path.join(dir, 'vibe.json'), 'utf8');
  if (/\/Users\/|\/home\/[a-z]/.test(raw)) P('vibe.json contains a path from somebody\'s computer');

  return { id, problems, notes, hints, numbers };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await runTool(async () => {
    const { values: a, positionals } = getArgs({ json: { type: 'boolean' }, quiet: { type: 'boolean' } }, HELP);
    const root = path.join(KIT, 'vibes');
    if (!fs.existsSync(root)) { bad('There is no vibes/ folder in the kit.'); return 1; }
    const all = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_')).map((e) => e.name).sort();
    const unknown = positionals.filter((p) => !all.includes(p));
    if (unknown.length) { bad(`No vibe called ${unknown.join(', ')}. The vibes are: ${all.join(', ')}`); return 1; }
    const ids = positionals.length ? positionals : all;
    const looksDir = path.join(KIT, 'looks');
    const known = {
      blocks: idsIn(path.join(KIT, 'blocks', 'catalog.json'), 'blocks'),
      families: idsIn(path.join(KIT, 'sources', 'catalog.json'), 'sources'),
      looks: fs.existsSync(looksDir) ? new Set(fs.readdirSync(looksDir).filter((n) => fs.existsSync(path.join(looksDir, n, 'look.json')))) : null,
    };
    const results = ids.map((id) => checkVibe(path.join(root, id), known));
    const failed = results.filter((r) => r.problems.length);
    if (a.json) { console.log(JSON.stringify({ limits: LIMITS, results }, null, 2)); return failed.length ? 1 : 0; }

    say(`Checking ${results.length} vibe${results.length === 1 ? '' : 's'} (distances: 0 = same colour, 100 = black against white)`);
    for (const r of results) {
      const n = r.numbers;
      const nums = n.inkOnCard === undefined ? '' : `  accent/base ${n.accentFromBase}  danger/base ${n.dangerFromBase}  danger/accent ${n.dangerFromAccent}  player/ground ${n.playerFromGround}  text ${n.inkOnCard}:1`;
      if (r.problems.length) { bad(`${r.id}${nums}`); for (const p of r.problems) say(`          - ${p}`); }
      else if (!a.quiet) ok(`${r.id.padEnd(24)}${nums}`);
      if (!a.quiet || r.problems.length) for (const m of r.notes) warn(`${r.id}: ${m}`);
      if (a.verbose) for (const m of r.hints) warn(`${r.id}: ${m}`);
    }
    const noteCount = results.reduce((s, r) => s + r.notes.length, 0);
    say('');
    if (failed.length) {
      say(`${failed.length} of ${results.length} vibes need fixing: ${failed.map((r) => r.id).join(', ')}`);
      say('What to do next: fix what is named above in that vibe\'s vibe.json and run this again.');
      return 1;
    }
    say(`All ${results.length} vibes pass${noteCount ? ` (${noteCount} note${noteCount === 1 ? '' : 's'}${a.quiet ? '; run without --quiet to read them' : ' above'}, none of them a failure)` : ''}.`);
    return 0;
  });
}
