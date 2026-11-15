#!/usr/bin/env node
// Makes one web page that lists every sound with a play button, for a person to listen. Needs no internet:
// the page plays the files next to it.
import fs from 'node:fs';
import path from 'node:path';
import { getArgs } from '../lib/args.mjs';
import { HelperError, ok, runTool, say } from '../lib/log.mjs';
import { gameDir, pretty, readJson } from '../lib/paths.mjs';
import { PACK_DIR, gameManifest, loadCatalog } from './lib/pack.mjs';

const HELP = `
node tools/sounds/audition.mjs [--dir <game folder>] [--out <file.html>]

Writes a page with a play button for every sound, so a person can listen (no agent can).
  (no options)    the kit's whole pack   -> sounds/audition.html
  --dir <path>    the sounds in a game   -> <game>/.helper/sounds-audition.html
  --out <file>    write the page somewhere else (it must stay in the same folder to find the files)

Open the page by double-clicking it. Click a name to play it; click again for the next take.
`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function page(title, intro, sounds) {
  const groups = [...new Set(sounds.map((s) => s.group))];
  const rows = (g) => sounds.filter((s) => s.group === g).map((s) => `
      <tr>
        <td><button data-id="${esc(s.id)}">&#9654; ${esc(s.id)}</button></td>
        <td>${s.loop ? 'loop, ' : ''}${esc(s.seconds)} s${s.files.length > 1 ? `, ${s.files.length} takes` : ''}</td>
        <td>${esc(s.from || '')}</td>
        <td class="feel">${esc((s.feel || []).join(', '))}</td>
        <td><label><input type="radio" name="v-${esc(s.id)}" value="good"> good</label> <label><input type="radio" name="v-${esc(s.id)}" value="bad"> not good</label></td>
      </tr>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font: 15px/1.45 system-ui, sans-serif; margin: 24px auto; max-width: 980px; padding: 0 16px; color: #1c1c1c; background: #faf8f4; }
  h1 { font-size: 22px; } h2 { font-size: 16px; margin: 26px 0 6px; text-transform: capitalize; }
  table { border-collapse: collapse; width: 100%; } td { padding: 4px 8px; border-bottom: 1px solid #e4dfd4; vertical-align: middle; }
  button { font: inherit; padding: 5px 10px; border: 1px solid #b9b2a3; border-radius: 6px; background: #fff; cursor: pointer; min-width: 230px; text-align: left; }
  button.playing { background: #ffe9a8; } .feel { color: #666; font-size: 13px; }
  .bar { position: sticky; top: 0; background: #faf8f4; padding: 8px 0; border-bottom: 1px solid #d8d2c4; }
  textarea { width: 100%; height: 90px; font: 13px ui-monospace, monospace; }
</style></head><body>
<h1>${esc(title)}</h1>
<p>${intro}</p>
<div class="bar"><button id="stop" style="min-width:0">Stop everything</button>
  Volume <input id="vol" type="range" min="0" max="1" step="0.01" value="0.8">
  <label><input id="even" type="checkbox" checked> play at the suggested level</label>
  <span id="plain" hidden> &middot; This browser is using its simple player here, so a loop may tick where it joins. In a game the loops join cleanly.</span></div>
${groups.map((g) => `<h2>${esc(g)}</h2>\n<table>${rows(g)}\n</table>`).join('\n')}
<h2>Your verdicts</h2>
<p>Tick "good" or "not good" as you listen, then copy this box and give it to your agent.</p>
<textarea id="notes" readonly></textarea>
<script>
const SOUNDS = ${JSON.stringify(Object.fromEntries(sounds.map((s) => [s.id, { files: s.files, gain: s.gain ?? 1, loop: s.loop || null }])))};
let ctx = null; const cache = new Map(); const playing = new Map(); const next = {};
const vol = document.getElementById('vol'), even = document.getElementById('even');
async function buffer(url) {
  if (!cache.has(url)) cache.set(url, new Promise((res, rej) => {
    // a plain file opened by double-click cannot use fetch(), so read it the old way
    const x = new XMLHttpRequest(); x.open('GET', url); x.responseType = 'arraybuffer';
    x.onload = () => ctx.decodeAudioData(x.response).then(res, rej); x.onerror = () => rej(new Error('could not read ' + url)); x.send();
  }));
  return cache.get(url);
}
function stop(id) {
  const p = playing.get(id);
  if (p) { try { p.src ? p.src.stop() : p.el.pause(); } catch {} playing.delete(id); }
  document.querySelector('button[data-id="' + id + '"]')?.classList.remove('playing');
}
// Some browsers will not let a page opened by double-click read files into the sound engine.
// Then a plain audio player is used instead: fine for listening, but a loop may tick where it joins.
function playPlain(id, s, url, btn, level) {
  const el = new Audio(url);
  el.volume = Math.max(0, Math.min(1, level));
  if (s.loop) {
    el.currentTime = s.loop[0];
    const watch = () => { if (playing.get(id)?.el !== el) return; if (el.currentTime >= s.loop[1] - 0.03) el.currentTime = s.loop[0]; requestAnimationFrame(watch); };
    requestAnimationFrame(watch);
    document.getElementById('plain').hidden = false;
  }
  el.onended = () => { if (playing.get(id)?.el === el) stop(id); };
  el.onerror = () => { btn.textContent = '! could not play ' + id; stop(id); };
  el.play().catch(() => {});
  playing.set(id, { el }); btn.classList.add('playing');
}
async function play(id) {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  await ctx.resume();
  const s = SOUNDS[id], btn = document.querySelector('button[data-id="' + id + '"]');
  if (playing.has(id) && s.loop) { stop(id); return; }
  stop(id);
  const i = (next[id] = ((next[id] ?? -1) + 1) % s.files.length);
  const level = Number(vol.value) * (even.checked ? s.gain : 1);
  let buf;
  try { buf = await buffer(s.files[i]); } catch (e) { playPlain(id, s, s.files[i], btn, level); return; }
  const src = ctx.createBufferSource(); src.buffer = buf;
  if (s.loop) { src.loop = true; src.loopStart = s.loop[0]; src.loopEnd = s.loop[1]; }
  const g = ctx.createGain(); g.gain.value = level;
  src.connect(g).connect(ctx.destination); src.start(0, s.loop ? s.loop[0] : 0);
  playing.set(id, { src }); btn.classList.add('playing');
  src.onended = () => { if (playing.get(id)?.src === src) stop(id); };
}
document.querySelectorAll('button[data-id]').forEach((b) => b.addEventListener('click', () => play(b.dataset.id)));
document.getElementById('stop').addEventListener('click', () => [...playing.keys()].forEach(stop));
document.addEventListener('change', () => {
  const good = [], bad = [];
  document.querySelectorAll('input[type=radio]:checked').forEach((r) => (r.value === 'good' ? good : bad).push(r.name.slice(2)));
  document.getElementById('notes').value = 'Sounds I listened to.\\nGood: ' + (good.join(', ') || '-') + '\\nNot good: ' + (bad.join(', ') || '-');
});
</script>
</body></html>
`;
}

await runTool(async () => {
  const { values: a } = getArgs({ out: { type: 'string' } }, HELP);
  let sounds, out, title, intro;
  if (a.dir) {
    const dir = gameDir(a.dir);
    const m = readJson(gameManifest(dir), null);
    if (!m?.sounds || !Object.keys(m.sounds).length) throw new HelperError(`the game in ${pretty(dir)} has no sound files listed yet.`, 'Add some first:  node tools/sounds/add.mjs ui-click pickup-coin --dir <game folder>');
    // kept out of public/, so the page never ships with the game
    out = a.out ? path.resolve(a.out) : path.join(dir, '.helper', 'sounds-audition.html');
    sounds = Object.entries(m.sounds).map(([id, s]) => ({
      id, group: s.group || 'sounds', seconds: s.seconds ?? '', loop: s.loop, gain: s.gain, feel: [],
      from: s.source === 'meticulai' ? 'from a Meticulai game' : s.source === 'synth' ? 'made in code' : '',
      files: s.files.map((f) => path.relative(path.dirname(out), path.join(dir, 'public', f)).split(path.sep).join('/')),
    }));
    title = 'The sounds in this game';
    intro = 'Click a name to hear it. A sound with several takes plays the next take on each click; a loop stops when you click it again.';
  } else {
    const catalog = loadCatalog();
    out = a.out ? path.resolve(a.out) : path.join(PACK_DIR, 'audition.html');
    sounds = catalog.sounds.map((s) => ({
      ...s, from: s.source === 'meticulai' ? `from ${s.from_game}` : 'made in code',
      files: s.files.map((f) => path.relative(path.dirname(out), path.join(PACK_DIR, f)).split(path.sep).join('/')),
    }));
    title = 'Meticulai Helper Git: starter sounds';
    intro = 'Every sound that comes with the kit. Click a name to hear it; a sound with several takes plays the next take on each click; a loop stops when you click it again. They were checked by numbers only (length, loudness, clean loops). Nobody has listened to all of them, so your ears decide.';
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, page(title, intro, sounds));
  ok(`A listening page with ${sounds.length} sounds is at ${pretty(out)}`);
  say('  Open it by double-clicking the file (it needs no internet). Tick good / not good and paste the box at the bottom back to your agent.');
  return 0;
});
