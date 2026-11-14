#!/usr/bin/env node
// Paid generation with fal.ai: style pictures, keyframes, textures, clips, sounds, music, 3D models.
// Every batch shows its cost and waits for a yes; a hard budget cap comes from my-game/helper.json (falCapUSD);
// every call is logged in my-game/.helper/fal-ledger.jsonl and my-game/paid-ledger.md.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {
  HERE, parseArgs, gameDir, show, fail, money, money3, loadKey, installRedaction, NO_KEY, readHelper, readLedger,
  spentSoFar, appendLedger, appendPaidLedger, IMAGE_EXT, prepareImage, FalError, uploadImage, runQueue, pickOutput,
  extFor, download,
} from './lib.mjs';

const HELP = `Usage: node tools/fal/gen.mjs <kind> [picture] ["words"] [options]

Kinds (each costs money; prices are estimates, see "models"):
  style "<the look in words>" [--n 6]          style pictures to choose from (one becomes the anchor)
  frames --from <chosen.png> "<shot>" [--n 3]  new pictures in the chosen style (same look, new composition)
  image "<prompt>" [--n 1]                     a picture from your prompt exactly as written
  edit <picture> "<instruction>" [--n 1]       change a picture ("make it night", "remove the sign")
  texture "<material>" [--n 2]                 a square texture that repeats (for floors, walls, ground)
  video <picture> "<motion>" [--seconds 5]     a short clip from a picture. For mood only: motion is often wrong
  sfx "<sound>" [--seconds 2] [--loop]         a sound effect
  music "<mood>" [--seconds 30]                an instrumental music track
  model3d <picture> [--cutout]                 a 3D model (.glb) of ONE object. --cutout removes the background first

Other commands (free):
  status    money spent vs the budget, last 10 calls
  models    which fal model each kind uses, and its price

Options:
  --dry-run         show the plan, the cost and the exact request; send nothing, spend nothing
  --yes             do not ask "Run? (y/n)" (only after the user has said yes to this cost)
  --n <count>       how many to make (each is a separate call with its own cost)
  --aspect <w:h>    picture shape: 16:9 (default), 9:16, 1:1, 4:3, 3:4, 21:9 ... (edit: auto)
  --seconds <s>     length for video, sfx, music
  --raw             send your words as they are, without the kit's prompt wrapper (style, frames, texture, video)
  --dir <path>      another game folder (default: my-game)

Results go to my-game/refs/generated/<kind>/. The budget is "falCapUSD" in my-game/helper.json (0 = off).
The fal key is read from the FAL_KEY setting or the kit's .env file. It is never shown.`;

const BOOL = ['dry-run', 'yes', 'help', 'loop', 'cutout', 'raw'];
const args = parseArgs(process.argv.slice(2), BOOL);
const cmd = args._[0];
if (args.help || !cmd) { console.log(HELP); process.exit(args.help ? 0 : 1); }

const MODELS = JSON.parse(fs.readFileSync(path.join(HERE, 'models.json'), 'utf8')).kinds;
const KINDS = ['style', 'frames', 'image', 'edit', 'texture', 'video', 'sfx', 'music', 'model3d'];

// The key is loaded once, and from then on anything printed is scrubbed of it.
const KEY = loadKey();
installRedaction(KEY);

// ---------------------------------------------------------------- free commands

if (cmd === 'models') {
  const rows = Object.entries(MODELS).map(([k, m]) => [k, m.endpoint, `$${m.price} per ${m.unit}`, m.checked]);
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length), 6));
  console.log(`${'kind'.padEnd(w[0])}  ${'fal model'.padEnd(w[1])}  ${'price (est.)'.padEnd(w[2])}  checked`);
  for (const r of rows) console.log(`${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}  ${r[3]}`);
  console.log('\nPrices change. If you are unsure, look the model up on fal.ai/models before a big batch.');
  console.log('To use a different model, edit tools/fal/models.json.');
  process.exit(0);
}

const GAME = gameDir(args);
const helper = readHelper(GAME);
if (!helper) fail(`There is no game folder with a helper.json yet (${show(GAME)}).\nRun: node tools/init.mjs --name "My Game"`);
const CAP = Number(helper.falCapUSD) || 0;

if (cmd === 'status') {
  const rows = readLedger(GAME);
  const spent = spentSoFar(GAME);
  console.log(`fal spending for ${helper.gameName || path.basename(GAME)}`);
  if (CAP <= 0) console.log(`  Generation is switched off (budget $0). Spent so far: about ${money(spent)}.`);
  else console.log(`  Spent so far: about ${money(spent)} of your ${money(CAP)} budget (${money(Math.max(0, CAP - spent))} left).`);
  console.log(`  fal key: ${KEY ? 'found (not shown)' : 'not set (see guides/fal-key.md)'}`);
  if (!rows.length) { console.log('  Nothing generated yet.'); process.exit(0); }
  console.log(`  Calls so far: ${rows.length}\n\nLast ${Math.min(10, rows.length)}:`);
  for (const r of rows.slice(-10)) {
    const when = String(r.time || '').slice(0, 16).replace('T', ' ');
    const what = (r.outputs && r.outputs[0]) || (r.note ? `(${r.note})` : '');
    console.log(`  ${when}  ${String(r.kind || '?').padEnd(8)} ${money3(Number(r.estUSD) || 0).padStart(7)}  ${what}`);
  }
  process.exit(0);
}

if (!KINDS.includes(cmd)) fail(`"${cmd}" is not something this tool makes.\nKinds: ${KINDS.join(', ')}. Also: status, models. See --help.`);

// ---------------------------------------------------------------- build the batch

const cfg = MODELS[cmd];
if (!cfg) fail(`tools/fal/models.json has no entry for "${cmd}".`);
const pos = args._.slice(1);
const needsPicture = ['edit', 'video', 'model3d'].includes(cmd);
let picture = null, text = '';
if (cmd === 'frames') {
  picture = typeof args.from === 'string' ? args.from : null;
  if (!picture) fail('frames needs the chosen style picture: --from <picture>, e.g.\n  node tools/fal/gen.mjs frames --from my-game/refs/generated/style/chosen.png "the player crossing a rope bridge"');
  text = pos.join(' ');
} else if (needsPicture) {
  picture = pos[0];
  if (!picture) fail(`${cmd} needs a picture first, e.g.\n  node tools/fal/gen.mjs ${cmd} my-game/refs/hero.png${cmd === 'model3d' ? '' : ' "what to do"'}`);
  text = pos.slice(1).join(' ');
} else {
  text = pos.join(' ');
}
text = text.trim();
if (cmd !== 'model3d' && !text) fail(`Say what to make, in quotes. See: node tools/fal/gen.mjs --help`);
if (picture) {
  if (!fs.existsSync(picture)) fail(`Can't find the picture ${picture}. Check the name and the folder.`);
  if (!IMAGE_EXT.has(path.extname(picture).toLowerCase())) fail(`${picture} is not a picture (use PNG or JPG).`);
}

const tips = [];
if (/mobile game/i.test(text)) tips.push('Tip: "mobile game" tends to bring cluttered casual-game screens. Set the shape with --aspect 9:16 instead.');
if (cmd === 'style' && text.split(/\s+/).length < 12) tips.push('Tip: describe a scene as well as the style (what is in the picture, where the camera is). Style words alone give random scenes.');
if (/\b(text|title|logo|score|button|menu)\b/i.test(text) && ['style', 'frames', 'image', 'texture'].includes(cmd)) tips.push('Tip: words and UI inside generated pictures come out garbled. Make the scene clean and add the UI in code.');

const WRAP = {
  style: (t) => `In-game screenshot of an original video game. ${t}. Real-time game graphics. No text, no watermark, no logos, no user interface.`,
  frames: (t) => `${t}. Same art style, palette and rendering as the reference picture; new composition and camera as described. In-game screenshot of the same original video game. No text, no watermark, no logos.`,
  texture: (t) => `Seamless tileable PBR albedo texture of ${t}. Flat even lighting, no shadows, no highlights, seen straight from above, fills the whole square edge to edge, no objects, no text.`,
  video: (t) => `${t}. Gameplay footage continuing from this exact picture: same art style, smooth game camera, real-time game graphics, no cuts, no new text.`,
};
const sentence = (t) => t.charAt(0).toUpperCase() + t.slice(1).replace(/[.\s]+$/, '');
const prompt = !args.raw && WRAP[cmd] ? WRAP[cmd](cmd === 'texture' ? text.replace(/[.\s]+$/, '') : sentence(text)) : text;

const defaultN = { style: 4, frames: 3, texture: 2 }[cmd] || 1;
const maxN = ['video', 'model3d', 'music'].includes(cmd) ? 4 : 12;
const n = args.n === undefined ? defaultN : Number(args.n);
if (!Number.isInteger(n) || n < 1) fail('--n must be a whole number, 1 or more.');
if (n > maxN) fail(`At most ${maxN} at a time for ${cmd}. Make a few, pick, then make more.`);

let seconds;
if (cfg.unit === 'second') {
  seconds = args.seconds === undefined ? cfg.default_seconds : Number(args.seconds);
  if (!(seconds > 0)) fail('--seconds must be a number above 0.');
  if (cmd === 'video') seconds = Math.round(seconds);
  if (seconds < cfg.min_seconds || seconds > cfg.max_seconds) fail(`${cmd} length must be between ${cfg.min_seconds} and ${cfg.max_seconds} seconds.`);
}
const aspect = typeof args.aspect === 'string' ? args.aspect : cmd === 'edit' ? 'auto' : '16:9';
if (!/^(\d+:\d+|auto)$/.test(aspect)) fail('--aspect looks like 16:9, 9:16, 1:1 or auto.');

const cutout = cmd === 'model3d' && args.cutout;
const cutCfg = MODELS.cutout;
const priceOf = (c) => c.price * (c.unit === 'second' ? seconds : 1);
const each = priceOf(cfg) + (cutout ? cutCfg.price : 0);
const total = each * n;

// Fill a models.json input template. "$x" values come from vars; keys whose value is unset are dropped.
function fill(tpl, vars) {
  if (typeof tpl === 'string' && tpl.startsWith('$')) return vars[tpl.slice(1)];
  if (Array.isArray(tpl)) return tpl.map((v) => fill(v, vars)).filter((v) => v !== undefined);
  if (tpl && typeof tpl === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(tpl)) { const f = fill(v, vars); if (f !== undefined) o[k] = f; }
    return o;
  }
  return tpl;
}
const baseVars = { prompt, aspect, seconds, ms: seconds ? Math.round(seconds * 1000) : undefined, loop: args.loop ? true : undefined };

// ---------------------------------------------------------------- plan

// "style picture" -> "style pictures", "keyframe in the chosen style" -> "keyframes in the chosen style"
const pluralLabel = (l) => l.replace(/^(.*?)(\s(?:\(|in\s).*)?$/, (m, a, b = '') => `${a}s${b}`);
const howMany = n === 1 ? `1 ${cfg.label}` : `${n} ${pluralLabel(cfg.label)}`;
const spent = spentSoFar(GAME);
console.log(`Plan: ${howMany}${seconds ? `, ${seconds} s each` : ''}, with ${cfg.endpoint}`);
if (picture) console.log(`  From: ${picture}${cutout ? ' (background removed first with ' + cutCfg.endpoint + ')' : ''}`);
if (text) console.log(`  Words: ${text}`);
if (cmd === 'video') console.log('  Note: clips are for mood and pacing only. The motion they invent is often wrong for the game.');
if (cmd === 'model3d' && !cutout) console.log('  Note: works best on ONE object on a plain background. Add --cutout to remove the background first.');
console.log(`  Cost: about ${money3(each)} each, ${money3(total)} in total (estimate checked ${cfg.checked}; prices change, check fal.ai if unsure)`);
for (const c of cutout ? [cutCfg, cfg] : [cfg]) if (c.price_note) console.log(`  Price note (${c.endpoint}): ${c.price_note}`);
console.log(`  Budget: spent ${money(spent)} so far of ${money(CAP)}. After this: about ${money3(spent + total)}.`);
for (const t of tips) console.log(`  ${t}`);

if (args['dry-run']) {
  const img = picture ? (cutout ? '<the fal link to the cut-out picture from step 1>' : `<${picture}: uploaded to fal storage when it runs>`) : undefined;
  console.log('\nExact request (sent once per item; nothing is sent in a dry run):');
  if (cutout) {
    console.log(`  Step 1: POST https://queue.fal.run/${cutCfg.endpoint}`);
    console.log(indent(JSON.stringify(fill(cutCfg.input, { image: `<${picture}: uploaded to fal storage when it runs>` }), null, 2), 4));
    console.log(`  Step 2: POST https://queue.fal.run/${cfg.endpoint}`);
  } else console.log(`  POST https://queue.fal.run/${cfg.endpoint}`);
  console.log(`  Header: Authorization: Key [hidden key]   (key ${KEY ? 'found' : 'NOT set: needed for a real run, see guides/fal-key.md'})`);
  console.log(indent(JSON.stringify(fill(cfg.input, { ...baseVars, image: img }), null, 2), 4));
}

function indent(s, k) { return s.split('\n').map((l) => ' '.repeat(k) + l).join('\n'); }

// ---------------------------------------------------------------- the money checks

if (CAP <= 0) fail('\nGeneration is switched off. Ask your agent to set a budget (falCapUSD in my-game/helper.json).', 3);
if (spent + total > CAP + 1e-9) {
  fail(`\nNot running: this would take spending to about ${money(spent + total)}, over your ${money(CAP)} budget.\n` +
    `Make fewer (--n), or ask your agent to raise the budget if you agree to spend more.`, 4);
}
if (args['dry-run']) { console.log('\nDry run: nothing was sent and nothing was spent.'); process.exit(0); }
if (!KEY) fail(`\n${NO_KEY}`, 5);

async function confirm() {
  if (args.yes) return true;
  process.stdout.write('Run? (y/n) ');
  const rl = readline.createInterface({ input: process.stdin });
  const answer = await new Promise((resolve) => {
    rl.once('line', (l) => resolve(l));
    rl.once('close', () => resolve(null));
  });
  rl.close();
  if (answer === null) {
    console.log('\nNo answer, so nothing was made. (Agents: show the user this cost, and after their yes run again with --yes.)');
    return false;
  }
  if (!/^\s*y(es)?\s*$/i.test(answer)) { console.log('Not running. Nothing was spent.'); return false; }
  return true;
}
if (!(await confirm())) process.exit(0);

// ---------------------------------------------------------------- run

const stamp = (() => {
  const d = new Date(), p = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
})();
const slug = (text || path.basename(picture || cmd, path.extname(picture || ''))).toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 6).join('-').slice(0, 40).replace(/-+$/, '') || cmd;
const OUT = path.join(GAME, 'refs', 'generated', cmd);
const rel = (p) => path.relative(GAME, p).split(path.sep).join('/');
const POLL = { video: 6000, model3d: 5000, music: 5000 }[cmd] || 3000;
const TIMEOUT = ({ video: 30, model3d: 20 }[cmd] || 10) * 60000;

let reserved = 0;
const uploads = new Map();
async function upload(file) {
  if (!uploads.has(file)) uploads.set(file, uploadImage(file, KEY));
  return (await uploads.get(file)).url;
}

const localTime = (d) => {
  const p = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function log(row, service, what) {
  appendLedger(GAME, row);
  appendPaidLedger(GAME, {
    when: localTime(new Date(row.time)), service, what, count: 1, usd: row.estUSD, total: spentSoFar(GAME),
  });
}

async function call(c, kindName, input, i, outBase) {
  const t0 = Date.now();
  let res;
  try {
    res = await runQueue(c.endpoint, input, KEY, {
      pollMs: POLL, timeoutMs: TIMEOUT,
      onWait: (s, q) => console.log(`  [${i}] ${kindName}: ${s === 'IN_QUEUE' ? `waiting in line${q ? ` (position ${q})` : ''}` : s === 'IN_PROGRESS' ? 'working' : s.toLowerCase()}`),
    });
  } catch (e) {
    if (e.charged || e.requestId) {
      // It ran (and probably cost money) but we could not get the result: still count it.
      const est = priceOf(c);
      log({ time: new Date().toISOString(), kind: kindName, endpoint: c.endpoint, prompt: input.prompt || input.text || '', inputs: picture ? [picture] : [], outputs: [], estUSD: +est.toFixed(4), requestId: e.requestId || '', note: 'no result: ' + e.message.slice(0, 120) },
        `fal (${c.endpoint})`, `${kindName} (no result)`);
    }
    throw e;
  }
  const out = pickOutput(res.response, c.output, c.ext);
  const est = priceOf(c);
  if (!out) {
    log({ time: new Date().toISOString(), kind: kindName, endpoint: c.endpoint, prompt: input.prompt || input.text || '', inputs: picture ? [picture] : [], outputs: [], estUSD: +est.toFixed(4), requestId: res.requestId, note: 'answer had no file' },
      `fal (${c.endpoint})`, `${kindName} (no file in answer)`);
    throw new FalError(`fal finished but sent back no file (request ${res.requestId}). Answer: ${JSON.stringify(res.response).slice(0, 200)}`);
  }
  const file = `${outBase}.${extFor(out, c.ext)}`;
  let saved = null, note;
  try { saved = await download(out.url, file); } catch (e) { note = e.message; }
  log({
    time: new Date().toISOString(), kind: kindName, endpoint: c.endpoint, prompt: input.prompt || input.text || '',
    inputs: picture ? [picture] : [], outputs: saved ? [rel(saved)] : [], estUSD: +est.toFixed(4), requestId: res.requestId,
    seconds: seconds || undefined, tookSeconds: Math.round((Date.now() - t0) / 1000), ...(note ? { note } : {}),
  }, `fal (${c.endpoint})`, `${kindName}: ${(text || path.basename(picture || '')).slice(0, 80)}${saved ? ` -> ${rel(saved)}` : ' (download failed)'}`);
  if (!saved) throw new FalError(note);
  return { file: saved, url: out.url };
}

async function job(i) {
  // Re-read the ledger before every call: another agent may have spent money meanwhile.
  if (spentSoFar(GAME) + reserved + each > CAP + 1e-9) throw new FalError(`Stopped before item ${i}: it would pass the ${money(CAP)} budget.`);
  reserved += each;
  try {
    const base = path.join(OUT, `${stamp}-${slug}-${i}`);
    let image;
    if (cutout) {
      const cut = await call(cutCfg, 'cutout', fill(cutCfg.input, { image: await upload(picture) }), i, `${base}-cutout`);
      image = cut.url;
    } else if (picture) image = await upload(picture);
    const r = await call(cfg, cmd, fill(cfg.input, { ...baseVars, image }), i, base);
    return r.file;
  } finally {
    reserved -= each;
  }
}

fs.mkdirSync(OUT, { recursive: true });
const parallel = Math.min(n, cmd === 'video' || cmd === 'model3d' ? 2 : 3);
const results = new Array(n);
let next = 0;
await Promise.all(Array.from({ length: parallel }, async () => {
  while (next < n) {
    const i = ++next;
    try { results[i - 1] = { ok: true, file: await job(i) }; console.log(`  [${i}] done: ${show(results[i - 1].file)}`); }
    catch (e) { results[i - 1] = { ok: false, err: e.message }; console.log(`  [${i}] failed: ${e.message}`); }
  }
}));

const ok = results.filter((r) => r?.ok);
const bad = results.filter((r) => r && !r.ok);
console.log(`\nMade ${ok.length} of ${n}.${ok.length ? ' Files:' : ''}`);
for (const r of ok) console.log(`  ${show(r.file)}`);
if (bad.length) {
  console.log(`${bad.length} failed:`);
  for (const r of [...new Set(bad.map((b) => b.err))]) console.log(`  ${r}`);
}
const now = spentSoFar(GAME);
console.log(`Spent so far: about ${money(now)} of your ${money(CAP)} budget. Logged in ${show(path.join(GAME, 'paid-ledger.md'))}.`);
process.exit(bad.length ? 1 : 0);
