// The dev menu's panel: a side panel that draws every control in the tuning registry (tuning.js) and the buttons of
// the game-wide tools (tools.js), for whoever is shaping the game by hand while it runs. Plain DOM; its styles are
// in panel-css.js.
//
// Keys:   `  (backquote) or F2   open / close (always)
//         While the menu is open:  \  freeze   .  one step   C  free camera   H  hide the HUD   B  computer plays
//                                  1 2 3  load slot A B C     /  jump to the search box
//         With the menu closed a single key only acts to leave a mode that is on: \ and . while frozen, C or Esc in
//         the free camera, H while the HUD is hidden. So a game is free to use those letters.
//         Keys typed into the menu's boxes never reach the game.
//
// What it promises:
//  - Closed, it costs nothing: rows are built the first time it opens, and nothing of it runs per frame.
//  - Open, the game keeps running behind it. While a slider is dragged the rest of the menu fades away, so you judge
//    the picture, not the menu.
//  - It opens on a short list in plain words (the game's own, or one made from the first few numbers of each group);
//    "Everything" is one click away, and the search box always looks through everything.
//  - Each row: a mark, the name, a slider with a tick where the game's own value sits, the value (click and type; it
//    may go past the slider's ends), and the game's own value on the right. A changed row turns gold; click the gold
//    value, the mark, or double-click the row to put it back.
//  - Groups fold (remembered), their headers stick while you scroll. Everything changed is repeated in a "Changed"
//    group on top, which only re-sorts when the pointer is off the list, so nothing jumps under your hand.
//  - A / B / C slots keep whole sets of changes to flip between. Presets come with a sentence each.
//  - "Copy changes" puts the changed values on the clipboard as text for the agent; "Paste" takes such text back;
//    "Save for my agent" (dev server only) writes the values into src/tuning.json: they become the new defaults.

import { CSS } from './panel-css.js';
import { SPEEDS } from './tools.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const isText = (t) => !!t && ((t.tagName === 'INPUT' && /^(text|search|number|)$/.test(t.type)) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
function decimals(step) { if (!(step > 0)) return 3; let d = 0, s = step; while (d < 6 && Math.abs(s - Math.round(s)) > 1e-7) { s *= 10; d++; } return d; }
function fmtNum(v, d) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '-';
  const s = v.toFixed(d);
  return Math.abs(+s - v) > 1e-9 ? String(+v.toPrecision(6)) : s; // a typed value finer than the step keeps its digits
}
const optValue = (o) => (Array.isArray(o) ? o[0] : o && typeof o === 'object' ? o.value : o);
const optLabel = (o) => String(Array.isArray(o) ? o[1] ?? o[0] : o && typeof o === 'object' ? o.label ?? o.value : o);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function btn(label, title, fn, cls) { const b = h('button', cls, label); b.type = 'button'; if (title) b.title = title; b.tabIndex = -1; if (fn) b.addEventListener('click', (e) => { fn(e); b.blur(); }); return b; }
const VALUE = new Set(['num', 'bool', 'pick', 'color']);
const AUTO_PER_GROUP = 4;

/**
 * @param {ReturnType<import('./tuning.js').createTuning>} tuning
 * @param {object} opts
 * @param {ReturnType<import('./tools.js').createTools>} opts.tools
 * @param {string} [opts.gameName]
 * @param {boolean} [opts.canSave]        show "Save for my agent"
 * @param {() => Promise<string|void>} [opts.save]
 * @param {boolean} [opts.showTab]        the small tab on the screen's edge (not in hidden test browsers)
 * @param {boolean} [opts.open]           open at once
 * @param {() => Array} [opts.shortExtras]  more groups for the short list: [[name, [[label, id, hint?], ...]], ...]
 * @param {() => void} [opts.beforeBuild] register late controls (the skip buttons) before the list is drawn
 */
export function createPanel(tuning, opts = {}) {
  const o = { gameName: 'My Game', keys: ['Backquote', 'F2'], canSave: false, save: null, showTab: true, open: false, shortExtras: () => [], beforeBuild: () => {}, ...opts };
  const tools = o.tools;

  if (!document.getElementById('devm-css')) { const st = h('style'); st.id = 'devm-css'; st.textContent = CSS; document.head.append(st); }

  const tab = btn('', 'The dev menu: change how the game feels while it runs  ( ` key )', () => setOpen(true), 'devm-tab');
  tab.hidden = true;
  const panel = h('aside', 'devm');
  panel.setAttribute('aria-label', 'Dev menu');
  panel.lang = 'en';
  const note = h('div', 'devm-note');
  document.body.append(panel, tab, note);

  // ---------------------------------------------------------------- the shell ----
  const kbd = (b, k) => { b.append(h('kbd', null, k)); return b; };
  const grip = h('i', 'grip'); grip.title = 'Drag to make the menu wider or narrower (double-click: back to normal)';
  const header = h('header');
  const top = h('div', 'top');
  const fpsEl = h('span', 'fps'); fpsEl.title = 'Pictures drawn per second. 60 is smooth; under 30 feels choppy.';
  const titleEl = h('h3', null, 'Dev menu');
  const gameEl = h('span', 'game', o.gameName);
  top.append(titleEl, gameEl, fpsEl, btn('×', 'Close the menu  ( ` )', () => setOpen(false), 'x'));
  const statsEl = h('div', 'nums');
  statsEl.title = 'Time per picture (and the slowest lately), things drawn, triangles, picture size.\nBelow: where the game is, its clock, the random seed.';

  const tools1 = h('div', 'bar tools');
  const bFreeze = kbd(btn('Freeze', 'Stop the game\'s clock. The picture keeps drawing and nothing is put on top. Good for a close look, with Step and the free camera.', () => tools.setFrozen(!tools.frozen)), '\\');
  const bStep = kbd(btn('Step', 'Move the game forward by one tick (a sixtieth of a second). Freezes first.', () => tools.step()), '.');
  const bFly = kbd(btn('Camera', 'Free camera: fly round the scene without the game knowing. W A S D move, Q / E down and up, drag to look, wheel to zoom, Shift to go fast. C or Esc goes back to the game\'s own camera, exactly as it was.', () => tools.setFly(!tools.fly)), 'C');
  const bHud = kbd(btn('No HUD', 'Hide everything drawn on top of the picture (score, hearts, screens) for a clean look. H shows it again.', () => tools.setNoHud(!tools.noHud)), 'H');
  tools1.append(bFreeze, bStep, bFly, bHud);
  bFreeze.hidden = bStep.hidden = !tools.has.freeze;
  bFly.hidden = !tools.has.fly;

  const tools2 = h('div', 'bar');
  const speedLab = h('span', 'lab', 'Speed');
  const seg = h('div', 'seg speed');
  seg.title = 'How fast the game\'s clock runs. Slow it to see what happens; speed it up to get through slow parts.';
  const speedBtns = SPEEDS.map(([v, l, t]) => { const b = btn(l, t, () => tools.setSpeed(v)); b.dataset.v = String(v); seg.append(b); return b; });
  const bRestart = btn('Restart', 'Start the run again from the beginning', () => tools.restart(), 'quiet');
  const bBot = kbd(btn('Computer plays', tools.bot
    ? 'The computer is playing. Click to play yourself again (the page loads again: the game reads this switch once, when it starts).'
    : 'Let the computer play while you change things. The page loads again with the switch on (the game reads it once, when it starts) and the run starts by itself.', () => tools.toggleBot(), 'quiet'), 'B');
  tools2.append(speedLab, seg, h('span', 'gap'), bBot);
  speedLab.hidden = seg.hidden = !tools.has.speed;
  bRestart.hidden = !tools.has.restart;
  bBot.hidden = !tools.has.bot;

  const tools3 = h('div', 'bar');
  const bShot = btn('Screenshot', o.canSave
    ? 'Save a picture of the game (no menu, no HUD) into playtest-notes/shots/ for your agent'
    : 'Download a picture of the game (no menu, no HUD)', async () => { try { say(await tools.screenshot()); } catch (err) { say(`No screenshot: ${err.message}.`); } }, 'quiet');
  const bView = btn('Copy view', 'Copy where the camera is and what it looks at, as text. Paste it to your agent ("put the camera here").', async () => {
    const t = tools.viewText();
    say(t && (await copyText(t)) ? 'Camera view copied. Paste it to your agent.' : 'Could not copy the view.');
  }, 'quiet');
  const bNote = kbd(btn('Leave a note', 'Write what you felt, for your agent. The game waits while you type; a picture and the game\'s state go with it.', () => tools.note(), 'quiet'), 'N');
  tools3.append(bRestart, bShot, bView, bNote);
  bShot.hidden = !tools.has.shot;
  bNote.hidden = !tools.has.note;

  const find = h('div', 'bar find');
  const viewSeg = h('div', 'seg view');
  const bSimple = btn('Essentials', 'The few controls that matter most, in plain words', () => setView('simple'));
  const bAll = btn('Everything', 'Every control in the game', () => setView('all'));
  viewSeg.append(bSimple, bAll);
  const search = h('input'); search.type = 'search'; search.placeholder = 'Search'; search.spellcheck = false; search.autocomplete = 'off';
  search.setAttribute('aria-label', 'Search the controls');
  search.title = 'Type a word to find a control anywhere  ( / )';
  const hits = h('span', 'hits');
  const bFold = btn('Fold', 'Close every group, or open them all', () => foldAll(anyOpen()), 'quiet');
  find.append(viewSeg, search, hits, bFold);
  header.append(top, statsEl, tools1, tools2, tools3, find);

  const list = h('div', 'list');
  const presetsBox = h('div', 'presets');
  const presetHead = h('div', 'phead');
  const presetNow = h('span', 'now');
  presetHead.append(h('span', 'lab', 'Presets'), presetNow);
  const presetBar = h('div', 'plist');
  const about = h('p', 'about');
  presetsBox.append(presetHead, presetBar, about);
  presetsBox.hidden = true;
  const empty = h('div', 'empty');
  list.append(presetsBox, empty);

  const footer = h('footer');
  const cbar = h('div', 'bar');
  const count = h('span', 'count');
  const slots = h('span', 'slots');
  slots.append(h('span', 'lab', 'Compare'));
  const slotBtns = ['A', 'B', 'C'].map((k, i) => { const b = btn(k, '', (e) => slotClick(k, e.shiftKey)); b.dataset.k = k; b.dataset.i = String(i + 1); slots.append(b); return b; });
  let armed = false;
  const bArm = btn('keep', 'Then click A, B or C to keep the current values there. Later, click the letter to flip back to them.', () => { armed = !armed; refreshSlots(); }, 'quiet arm');
  slots.append(bArm);
  const bReset = btn('Reset all', 'Put every control back to the game\'s own value', () => doResetAll(), 'quiet');
  cbar.append(count, slots, bReset);
  const fbar = h('div', 'bar');
  const bSave = btn('Save for my agent', 'Write every value into the game\'s own file (src/tuning.json). They become the game\'s new values, and your agent sees them.', () => doSave(), 'primary');
  const bCopy = btn('Copy changes', 'The changed values as text: paste them to your agent to make them the game\'s own', () => doCopy());
  const bPaste = btn('Paste', 'Put back values from text (copied earlier, or from your agent)', () => openPaste());
  fbar.append(bSave, bCopy, bPaste);
  const paste = h('div', 'paste');
  paste.hidden = true;
  const ta = h('textarea'); ta.spellcheck = false; ta.placeholder = 'Paste the values here, then Replace or Apply on top';
  const pbar = h('div', 'bar');
  pbar.append(btn('Replace', 'Everything else goes back to the game\'s own value', () => doPaste(true)), btn('Apply on top', 'Keep the other changes', () => doPaste(false)), btn('Close', null, () => { paste.hidden = true; ta.blur(); }));
  paste.append(ta, pbar);
  const msg = h('div', 'msg');
  footer.append(cbar, fbar, paste, msg);
  panel.append(grip, header, list, footer);

  let msgT = 0;
  function say(text) { msg.textContent = text || ''; clearTimeout(msgT); if (text) msgT = setTimeout(() => { msg.textContent = ''; }, 8000); }
  let noteT = 0;
  /** a short line over the game when a mode starts, then nothing: a frozen picture has to be clean */
  function flash(text, ms = 2200) { note.textContent = text; note.classList.add('show'); clearTimeout(noteT); noteT = setTimeout(() => note.classList.remove('show'), ms); }

  // ---------------------------------------------------------------- width ----
  const WIDTH = 400;
  let width = WIDTH;
  function setWidth(w) {
    width = clamp(Math.round(w), 320, Math.max(320, Math.min(760, window.innerWidth - 80)));
    panel.style.width = `${width}px`;
    document.documentElement.style.setProperty('--devm-w', `${width}px`);
  }
  setWidth(tuning.ui('width', WIDTH));
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault(); grip.setPointerCapture(e.pointerId); panel.classList.add('sizing');
    const move = (ev) => setWidth(window.innerWidth - ev.clientX);
    const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); panel.classList.remove('sizing'); tuning.setUi('width', width); };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
  });
  grip.addEventListener('dblclick', () => { setWidth(WIDTH); tuning.setUi('width', width); });
  window.addEventListener('resize', () => setWidth(width));

  // ---------------------------------------------------------------- rows ----
  const rows = []; // { id, el, read(), mark(), search, top, alias }
  const sections = new Map(); // key -> { el, body, cnt, chg, ids:Set, kind }
  let built = false, dirtyList = true, dirtyValues = true, liveRow = null, peekT = 0;
  const folded = tuning.ui('folded', {});
  const fold = (key, v) => { folded[key] = v; tuning.setUi('folded', folded); };

  function makeSection(key, name, kind) {
    const el = h('section', `sec ${kind}`);
    const hd = h('button', 'hd'); hd.type = 'button'; hd.tabIndex = -1;
    hd.title = 'Click to fold or open this group';
    const t = h('span', 't', name), cnt = h('span', 'cnt'), chg = h('span', 'chg'), rs = h('span', 'rs', 'reset');
    rs.title = `Put everything in "${name}" back to the game's own values`;
    hd.append(t, cnt, chg, rs);
    const body = h('div', 'body');
    el.append(hd, body);
    const sec = { key, name, el, body, cnt, chg, ids: new Set(), kind, n: 0 };
    hd.addEventListener('click', (e) => {
      hd.blur();
      if (e.target === rs) {
        for (const id of sec.ids) if (tuning.changed(id)) tuning.reset(id);
        say(`${name}: back to the game's own values`);
        return;
      }
      const f = !el.classList.contains('folded');
      el.classList.toggle('folded', f);
      fold(key, f);
      syncFold();
    });
    el.classList.toggle('folded', !!folded[key]);
    sections.set(key, sec);
    return sec;
  }

  function makeRow(it, { top: inTop = false, alias = null } = {}) {
    const id = it.id, kind = it.kind;
    const el = h(kind === 'bool' ? 'label' : 'div', `row ${kind}`);
    el.dataset.id = id;
    const row = { id, el, top: inTop, alias, read: () => {}, search: `${it.group} ${it.label} ${id} ${it.hint || ''} ${it.search || ''} ${alias ? alias[0] + ' ' + (alias[2] || '') : ''}`.toLowerCase() };
    const cur = () => tuning.item(id) || it;
    const hint = () => (alias && alias[2]) || cur().hint || '';

    if (kind === 'custom') { // the control draws itself (the vibe chooser)
      el.title = hint();
      try { row.read = it.build(el, h, { say, alias }) || (() => {}); } catch (err) { console.error(`dev menu: "${id}" failed to draw`, err); }
      return row;
    }

    const mk = btn('', 'Changed: click to put it back', (e) => { e.preventDefault(); tuning.reset(id); }, 'mk');
    const name = h('span', 'name');
    if (inTop) name.append(h('i', null, it.group));
    name.append(document.createTextNode(alias ? alias[0] : it.label));
    el.append(mk, name);
    const ctl = h('div', 'ctl');
    el.append(ctl);

    if (kind === 'readout') {
      row.read = () => { let s; try { s = String(cur().read()); } catch { s = 'error'; } if (ctl.textContent !== s) ctl.textContent = s; };
      el.title = hint() || 'A live value from the game (it cannot be changed here)';
      return row;
    }

    if (kind === 'num') {
      const d = decimals(it.step);
      const track = h('div', 'track');
      const rng = h('input'); rng.type = 'range'; rng.min = it.min; rng.max = it.max; rng.step = it.step; rng.tabIndex = -1;
      const tick = h('i', 'tick');
      track.append(rng, tick);
      const val = h('input', 'val'); val.type = 'text'; val.inputMode = 'decimal'; val.spellcheck = false; val.autocomplete = 'off';
      ctl.append(track);
      el.append(val);
      const pos = (v) => (it.max > it.min && typeof v === 'number' ? clamp((v - it.min) / (it.max - it.min), 0, 1) : 0);
      let shown, shownDef;
      row.read = () => {
        const v = cur().get(), def = cur().def;
        if (document.activeElement !== val) { const s = fmtNum(v, d); if (val.value !== s) val.value = s; }
        if (v === shown && def === shownDef) return;
        shown = v; shownDef = def;
        if (liveRow !== row) rng.value = typeof v === 'number' ? v : it.min;
        rng.style.setProperty('--p', pos(v).toFixed(4));
        tick.style.setProperty('--d', pos(def).toFixed(4));
        el.classList.toggle('beyond', tuning.beyond(id));
      };
      rng.addEventListener('input', () => tuning.set(id, +rng.value));
      rng.addEventListener('pointerdown', () => startPeek(row));
      rng.addEventListener('change', () => rng.blur());
      val.addEventListener('focus', () => val.select());
      val.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { tuning.set(id, val.value); val.blur(); }
        else if (e.key === 'Escape') { val.value = fmtNum(cur().get(), d); val.blur(); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const base = parseFloat(val.value.replace(',', '.'));
          const now = Number.isFinite(base) ? base : +cur().get() || 0;
          tuning.set(id, now + (e.key === 'ArrowUp' ? 1 : -1) * it.step * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1));
          val.value = fmtNum(cur().get(), d); val.select();
        }
      });
      val.addEventListener('blur', () => { const v = parseFloat(val.value.replace(',', '.')); if (Number.isFinite(v) && val.value !== fmtNum(cur().get(), d)) tuning.set(id, v); row.read(); });
      val.title = 'Click to type an exact number (it may go past the slider\'s ends). Up and Down arrows nudge it.';
    } else if (kind === 'bool') {
      const box = h('input', 'sw'); box.type = 'checkbox'; box.tabIndex = -1;
      box.addEventListener('change', () => { tuning.set(id, box.checked); box.blur(); });
      row.read = () => { const v = !!cur().get(); if (box.checked !== v) box.checked = v; };
      ctl.append(box);
    } else if (kind === 'pick') {
      const options = it.options || [];
      const total = options.reduce((n, op) => n + optLabel(op).length + 3, 0);
      if (options.length <= 4 && total <= 26) {
        const sg = h('div', 'seg');
        options.forEach((op) => sg.append(btn(optLabel(op), null, () => tuning.set(id, optValue(op)))));
        row.read = () => { const v = cur().get(); [...sg.children].forEach((b, i) => b.classList.toggle('on', optValue(options[i]) === v)); };
        ctl.append(sg);
      } else {
        const sel = h('select'); sel.tabIndex = -1;
        options.forEach((op, i) => { const x = h('option', null, optLabel(op)); x.value = String(i); sel.append(x); });
        sel.addEventListener('change', () => { tuning.set(id, optValue(options[+sel.value])); sel.blur(); });
        row.read = () => { const i = options.findIndex((op) => optValue(op) === cur().get()); if (sel.value !== String(i)) sel.value = String(i); };
        ctl.append(sel);
      }
    } else if (kind === 'color') {
      const sw = h('input'); sw.type = 'color'; sw.tabIndex = -1;
      const hex = h('input', 'val hex'); hex.type = 'text'; hex.maxLength = 7; hex.spellcheck = false; hex.autocomplete = 'off';
      sw.addEventListener('input', () => tuning.set(id, sw.value));
      sw.addEventListener('change', () => sw.blur());
      hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') { tuning.set(id, hex.value); hex.blur(); } else if (e.key === 'Escape') { hex.value = cur().get(); hex.blur(); } });
      hex.addEventListener('blur', () => { if (hex.value !== cur().get()) tuning.set(id, hex.value); row.read(); });
      row.read = () => { const v = String(cur().get() || '#000000'); if (sw.value !== v) sw.value = v; if (document.activeElement !== hex && hex.value !== v) hex.value = v; };
      sw.title = 'Click to pick a colour';
      ctl.append(sw, hex);
    }
    const def = btn('', null, (e) => { e.preventDefault(); tuning.reset(id); }, 'def');
    el.append(def);
    let marked = null;
    row.mark = () => {
      const c = cur();
      const ch = tuning.changed(id);
      const was = kind === 'num' ? fmtNum(c.def, decimals(c.step)) : kind === 'bool' ? (c.def ? 'on' : 'off') : kind === 'pick' ? optLabel((c.options || []).find((x) => optValue(x) === c.def) ?? c.def) : String(c.def);
      const key = `${ch}|${was}`;
      if (key === marked) return;
      marked = key;
      el.classList.toggle('changed', ch);
      def.textContent = kind === 'color' ? '' : was;
      if (kind === 'color') def.style.setProperty('--c', was);
      def.title = ch ? `Click: back to the game's own value, ${was}` : `The game's own value: ${was}`;
      const where = alias ? `\nIn the full list: ${c.group} / ${c.label}` : '';
      const text = hint();
      el.title = `${text}${text ? '\n' : ''}${kind === 'num' ? `From ${c.min} to ${c.max}. ` : ''}The game's own value: ${was}.${where}\n(${c.id})`;
    };
    // double-click anywhere on the row (not while typing in it) puts the value back
    el.addEventListener('dblclick', (e) => { if (isText(e.target) && document.activeElement === e.target) return; e.preventDefault(); tuning.reset(id); });
    return row;
  }

  // one control into a section: a button joins the row of buttons, anything else gets its own row
  function put(sec, it, extra = {}) {
    sec.ids.add(it.id);
    if (it.kind === 'button') {
      let fns = sec.body.lastElementChild;
      if (!fns || !fns.classList.contains('fns')) { fns = h('div', 'row fns'); sec.body.append(fns); }
      const label = extra.alias ? extra.alias[0] : it.label;
      const b = btn(label, (extra.alias && extra.alias[2]) || it.hint || label, async () => {
        try { await (tuning.item(it.id) || it).run(); } catch (err) { console.error(`dev menu: "${it.id}" failed`, err); say(`"${it.label}" did not work: see the console.`); }
        dirtyValues = true;
      });
      b.dataset.search = `${it.group} ${it.label} ${label} ${it.id} ${it.hint || ''}`.toLowerCase();
      b.dataset.id = it.id;
      if (!extra.alias) b.dataset.count = '1';
      fns.append(b);
      return null;
    }
    const row = makeRow(it, extra);
    rows.push(row);
    sec.body.append(row.el);
    row.read(); row.mark?.();
    return row;
  }

  /** The short list: the game's own, or the first few numbers of each group; then the game's own buttons and
   *  readouts, then Sound and Look. An id is never listed twice. */
  function shortList() {
    const items = tuning.items();
    const out = [];
    if (tuning.essentials.length) for (const [name, aliases] of tuning.essentials) out.push([name, [...aliases]]);
    else {
      const per = new Map();
      for (const it of items) {
        if (!it.file || !VALUE.has(it.kind) || it.id.startsWith('audio.')) continue;
        if (!per.has(it.group)) per.set(it.group, []);
        if (per.get(it.group).length < AUTO_PER_GROUP) per.get(it.group).push([it.label, it.id]);
      }
      for (const [g, aliases] of per) out.push([g, aliases]);
    }
    const used = new Set(out.flatMap(([, a]) => a.map((x) => x[1])));
    const more = [];
    const own = new Map();
    for (const it of items) if (it.dev && !used.has(it.id)) { if (!own.has(it.group)) own.set(it.group, []); own.get(it.group).push([it.label, it.id]); }
    for (const [g, aliases] of own) more.push([g, aliases]);
    more.push(...o.shortExtras());
    for (const [name, aliases] of more) {
      const fresh = aliases.filter((a) => !used.has(a[1]) && tuning.item(a[1]));
      if (!fresh.length) continue;
      for (const a of fresh) used.add(a[1]);
      const had = out.find(([n]) => n === name);
      if (had) had[1].push(...fresh); else out.push([name, fresh]);
    }
    return out;
  }

  // The list is rebuilt when controls are added, but never under a hand that is dragging a slider.
  function build() {
    if (liveRow) return;
    o.beforeBuild();
    dirtyList = false;
    const scroll = list.scrollTop;
    for (const sec of sections.values()) sec.el.remove();
    sections.clear(); rows.length = 0;
    const items = tuning.items();
    const changedSec = makeSection('~changed', 'Changed', 'changed');
    changedSec.hd = changedSec.el.firstChild;
    changedSec.el.firstChild.title = 'Everything you have changed, in one place. Click to fold.';
    list.insertBefore(changedSec.el, empty);
    for (const [name, aliases] of shortList()) {
      const sec = makeSection('simple:' + name, name, 'simple');
      for (const alias of aliases) { const it = tuning.item(alias[1]); if (it) put(sec, it, { alias }); }
      if (sec.ids.size) list.insertBefore(sec.el, empty);
    }
    // every control, by group, in the order groups first appear
    let total = 0;
    for (const g of tuning.groups()) {
      const sec = makeSection(g, g, 'group');
      for (const it of items) {
        if (it.group !== g) continue;
        sec.n++; total++;
        put(sec, it);
      }
      list.insertBefore(sec.el, empty);
    }
    syncChanged(true);
    bAll.textContent = `Everything (${total})`;
    search.placeholder = `Search all ${total}`;
    setView(tuning.ui('view', 'simple'), true);
    buildPresets();
    applyFilter();
    syncFold();
    list.scrollTop = scroll;
  }

  // the group on top: one more row for every changed control; it only moves when the pointer is off the list
  let overList = false;
  function syncChanged(force) {
    if (!force && (overList || liveRow)) return;
    const sec = sections.get('~changed');
    if (!sec) return;
    const want = new Set(tuning.items().filter((it) => VALUE.has(it.kind) && it.save !== false && tuning.changed(it.id)).map((it) => it.id));
    let moved = false;
    for (const row of rows.filter((r) => r.top)) {
      if (!want.has(row.id)) { row.el.remove(); rows.splice(rows.indexOf(row), 1); sec.ids.delete(row.id); moved = true; }
    }
    for (const id of want) if (!sec.ids.has(id)) { put(sec, tuning.item(id), { top: true }); moved = true; }
    sec.el.hidden = want.size === 0;
    if (moved && query) applyFilter();
  }

  function buildPresets() {
    presetBar.innerHTML = '';
    presetsBox.hidden = tuning.presets.length === 0;
    if (!tuning.presets.length) return;
    const own = btn('The game\'s own', 'Every control back to the game\'s own value', () => { tuning.resetAll(); say('Back to the game\'s own values'); });
    own.dataset.preset = '';
    own.dataset.about = 'The game exactly as it is built today. Clears every change you or a preset have made.';
    presetBar.append(own);
    for (const p of tuning.presets) {
      const b = btn(p.name, `${p.about || ''}\nChanges ${Object.keys(p.values || {}).length} values (everything else goes back to the game's own).`, () => {
        const r = tuning.applyPreset(p.id);
        say(`Preset "${p.name}"${r.unknown.length ? `: ${r.unknown.length} value(s) match no control (see the console)` : ''}`);
        if (r.unknown.length) console.warn(`dev menu: preset "${p.name}" names controls that do not exist: ${r.unknown.join(' | ')}`);
      });
      b.dataset.preset = p.id;
      b.dataset.about = p.about || '';
      presetBar.append(b);
    }
    presetBar.onpointerover = (e) => { const b = e.target.closest('button'); if (b) about.textContent = b.dataset.about; };
    presetBar.onpointerleave = () => syncPresets();
  }
  function syncPresets() {
    if (presetsBox.hidden) return;
    const ap = tuning.activePreset(), n = tuning.count();
    const p = tuning.presets.find((x) => x.id === ap);
    for (const b of presetBar.children) b.classList.toggle('on', p ? b.dataset.preset === ap : n === 0 && b.dataset.preset === '');
    presetNow.textContent = p ? p.name : n ? `Your own settings (${n} changed)` : 'The game\'s own';
    if (!presetBar.matches(':hover')) about.textContent = p ? p.about || '' : '';
  }

  function setView(v, quiet) {
    const view = v === 'all' ? 'all' : 'simple';
    panel.classList.toggle('simple', view === 'simple');
    bSimple.classList.toggle('on', view === 'simple');
    bAll.classList.toggle('on', view === 'all');
    if (!quiet) { tuning.setUi('view', view); list.scrollTop = 0; syncFold(); }
  }

  // ---------------------------------------------------------------- filter and folding ----
  let query = '';
  function applyFilter() {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (s) => words.every((w) => s.includes(w));
    let shown = 0, total = 0;
    for (const row of rows) {
      const ok = !words.length || hit(row.search);
      row.el.hidden = !ok;
      if (!row.top && !row.alias) { total++; if (ok) shown++; }
    }
    for (const sec of sections.values()) {
      let any = false;
      for (const el of sec.body.children) {
        if (el.classList.contains('fns')) {
          let anyB = false;
          for (const b of el.children) { const ok = !words.length || hit(b.dataset.search); b.hidden = !ok; anyB ||= ok; if (b.dataset.count) { total++; if (ok) shown++; } }
          el.hidden = !anyB;
          any ||= anyB;
        } else if (!el.hidden) any = true;
      }
      sec.el.classList.toggle('nohit', !any);
      sec.el.classList.toggle('found', words.length > 0 && any); // a search opens what it finds, without changing what you folded
    }
    hits.textContent = words.length ? `${shown} of ${total}` : '';
    empty.textContent = words.length && !shown ? `Nothing matches "${query.trim()}"` : !tuning.items().length ? 'This game has no controls yet.' : '';
    panel.classList.toggle('filtering', words.length > 0);
  }
  const visibleSecs = () => [...sections.values()].filter((s) => (panel.classList.contains('simple') ? s.kind !== 'group' : s.kind !== 'simple'));
  const anyOpen = () => visibleSecs().some((s) => !s.el.classList.contains('folded'));
  function foldAll(f) { for (const s of visibleSecs()) { s.el.classList.toggle('folded', f); folded[s.key] = f; } tuning.setUi('folded', folded); syncFold(); }
  function syncFold() { bFold.textContent = anyOpen() ? 'Fold' : 'Open'; }
  search.addEventListener('input', () => { query = search.value; applyFilter(); list.scrollTop = 0; });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (search.value) { search.value = query = ''; applyFilter(); } else search.blur(); } else if (e.key === 'Enter') search.blur(); });

  // ---------------------------------------------------------------- peek: the menu gets out of the picture's way ----
  function startPeek(row) { liveRow = row; row.el.classList.add('live'); clearTimeout(peekT); peekT = setTimeout(() => { if (liveRow === row) panel.classList.add('peek'); }, 180); }
  function endPeek() {
    clearTimeout(peekT);
    if (liveRow) { liveRow.el.classList.remove('live'); const r = liveRow; liveRow = null; r.read(); }
    panel.classList.remove('peek');
  }
  window.addEventListener('pointerup', endPeek, true);
  window.addEventListener('pointercancel', endPeek, true);
  list.addEventListener('pointerenter', () => { overList = true; });
  list.addEventListener('pointerleave', () => { overList = false; dirtyValues = true; });
  list.addEventListener('scroll', () => { clearTimeout(list._t); list._t = setTimeout(() => tuning.setUi('scroll', list.scrollTop), 300); }, { passive: true });

  // ---------------------------------------------------------------- refresh ----
  function refresh() {
    if (!built) return;
    if (dirtyList) build();
    syncChanged(false);
    for (const row of rows) { row.read(); row.mark?.(); }
    counts();
  }
  let countKey = '';
  function counts() {
    const n = tuning.count();
    count.textContent = n ? `${n} changed` : 'No changes';
    count.classList.toggle('some', n > 0);
    bCopy.disabled = bReset.disabled = n === 0;
    for (const sec of sections.values()) {
      let c = 0;
      for (const id of sec.ids) if (tuning.changed(id)) c++;
      const cnt = sec.kind === 'group' ? String(sec.n) : '', chg = c ? (sec.kind === 'changed' ? String(c) : `${c} changed`) : '';
      if (sec.cnt.textContent !== cnt) sec.cnt.textContent = cnt;
      if (sec.chg.textContent !== chg) sec.chg.textContent = chg;
      sec.el.classList.toggle('has', c > 0);
    }
    const key = `${n}|${tuning.activeSlot()}|${tuning.activePreset()}|${armed}`;
    if (key !== countKey) { countKey = key; refreshSlots(); syncPresets(); }
  }
  function refreshTab() {
    const n = tuning.count();
    const word = tools.frozen ? 'Frozen' : tools.fly ? 'Free camera' : tools.noHud ? 'HUD hidden' : tools.speed !== 1 ? `Speed ×${tools.speed}` : 'Dev';
    const text = n ? `${word} · ${n} changed` : word;
    if (tab.textContent !== text) tab.textContent = text;
    tab.classList.toggle('busy', tools.active());
    tab.hidden = isOpen || !o.showTab || (tools.noHud && !tools.frozen && !tools.fly);
  }
  function refreshSlots() {
    const cur = tuning.activeSlot();
    slots.classList.toggle('arm', armed);
    bArm.classList.toggle('on', armed);
    for (const b of slotBtns) {
      const k = b.dataset.k, s = tuning.slot(k);
      b.classList.toggle('full', !!s);
      b.classList.toggle('cur', !!s && cur === k);
      b.title = armed ? `Keep the current values in ${k}` : s ? `Flip to ${k} (key ${b.dataset.i}): ${Object.keys(s).length} changed value(s). Shift-click: keep the current values here instead` : `${k} is empty: click to keep the current values here, then change things and click it again to compare`;
    }
  }
  function slotClick(k, keep = false) {
    if (armed || keep || !tuning.slot(k)) { tuning.saveSlot(k); say(`Kept the current values in ${k}. Change things, then click ${k} to flip back.`); }
    else { tuning.loadSlot(k); say(`Loaded ${k}`); flash(`Slot ${k}`, 1200); }
    armed = false;
    countKey = '';
    dirtyValues = true;
  }

  function syncTools() {
    bFreeze.classList.toggle('on', tools.frozen);
    bFly.classList.toggle('on', tools.fly);
    bHud.classList.toggle('on', tools.noHud);
    bBot.classList.toggle('on', tools.bot);
    for (const b of speedBtns) b.classList.toggle('on', +b.dataset.v === tools.speed);
    document.body.classList.toggle('devm-fly', tools.fly);
    refreshTab();
  }
  tools.onChange(() => { syncTools(); dirtyValues = true; });

  let statsText = '', fpsText = '';
  function stats() {
    const s = tools.stats();
    const f = s.fps ? `${Math.round(s.fps)} fps` : '';
    if (f !== fpsText) fpsEl.textContent = fpsText = f;
    const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
    const a = [];
    if (s.ms) a.push(`${s.ms.toFixed(1)} ms`, `slowest ${Math.round(s.worst)}`);
    if (s.calls) a.push(`${s.calls} draws`, `${k(s.tris)} triangles`);
    if (s.size) a.push(s.size);
    const b = [s.scene, `time ${s.time.toFixed(1)} s`];
    if (s.seed != null) b.push(`seed ${s.seed}`);
    if (tools.speed !== 1) b.push(`speed ×${tools.speed}`);
    if (tools.frozen) b.push('frozen');
    if (tools.bot) b.push('computer playing');
    const text = `${a.join('  ·  ')}\n${b.filter(Boolean).join('  ·  ')}`;
    if (text !== statsText) statsEl.textContent = statsText = text;
  }

  tuning.onChange((it) => {
    if (!it) dirtyList = true;
    dirtyValues = true;
    if (!isOpen) refreshTab();
  });
  // Open: look at the values a few times a second (the game changes them too) and at the numbers on top.
  // Closed: nothing runs per frame; the tab is brought up to date once a second.
  let lastLook = 0, lastStats = 0, raf = 0;
  function frame(now) {
    raf = isOpen ? requestAnimationFrame(frame) : 0;
    if (!isOpen) return;
    if (dirtyValues || dirtyList || now - lastLook > 300) { dirtyValues = false; lastLook = now; refresh(); }
    if (now - lastStats > 250) { lastStats = now; stats(); }
  }
  setInterval(() => { if (!isOpen) refreshTab(); }, 1000);

  // ---------------------------------------------------------------- copy, paste, save, reset ----
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* no permission, or not a secure page */ }
    try {
      const t = h('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.append(t); t.select();
      const ok = document.execCommand('copy'); t.remove(); return ok;
    } catch { return false; }
  }
  async function doCopy() {
    const text = tuning.copyText({ title: `Tuning of "${o.gameName}"` });
    const n = tuning.count();
    if (await copyText(text)) say(`Copied ${n} changed value${n === 1 ? '' : 's'}. Paste them to your agent.`);
    else { paste.hidden = false; ta.value = text; ta.focus(); ta.select(); say('Could not reach the clipboard: the text is in the box, copy it by hand.'); }
  }
  function openPaste() {
    paste.hidden = !paste.hidden;
    if (paste.hidden) return;
    ta.value = '';
    navigator.clipboard?.readText?.().then((t) => { if (!ta.value && t && t.includes('{')) ta.value = t; }).catch(() => {});
    ta.focus();
  }
  function doPaste(replace) {
    const flat = parseText(ta.value);
    if (!flat) { say('No values found in that text.'); return; }
    const r = tuning.apply(flat, replace);
    say(`${replace ? 'Replaced with' : 'Applied'} ${r.used.length} value${r.used.length === 1 ? '' : 's'}${r.unknown.length ? `; ${r.unknown.length} match no control yet (kept for later)` : ''}${r.bad.length ? `; ${r.bad.length} did not fit` : ''}.`);
    paste.hidden = true; ta.blur();
  }
  let sure = 0;
  function doResetAll() {
    // two clicks: an afternoon of tuning should not go with one slip
    if (performance.now() - sure > 2500) { sure = performance.now(); bReset.textContent = 'Sure? Click again'; bReset.classList.add('warn'); setTimeout(() => { bReset.textContent = 'Reset all'; bReset.classList.remove('warn'); }, 2500); return; }
    sure = 0; bReset.textContent = 'Reset all'; bReset.classList.remove('warn');
    tuning.resetAll();
    say('Everything is back to the game\'s own values.');
  }
  async function doSave() {
    if (!o.save) return;
    bSave.disabled = true;
    try {
      const m = await o.save();
      say(m || 'Saved. Your agent will see it.');
    } catch (err) {
      say(`Could not save (${err?.message || err}). Use "Copy changes" instead.`);
    } finally { bSave.disabled = false; dirtyValues = true; }
  }
  bSave.hidden = !(o.canSave && o.save);

  // ---------------------------------------------------------------- open, close, keys ----
  let isOpen = false;
  function setOpen(on) {
    on = !!on;
    if (on === isOpen) return;
    isOpen = on;
    if (isOpen && !built) { built = true; build(); list.scrollTop = tuning.ui('scroll', 0); }
    panel.classList.toggle('open', isOpen);
    document.body.classList.toggle('devm-open', isOpen);
    tuning.setUi('open', isOpen);
    tools.watch(isOpen);
    if (isOpen) {
      if (document.pointerLockElement) document.exitPointerLock?.(); // the menu needs the mouse (the game does not pause for this)
      dirtyValues = true; refresh(); stats(); syncTools();
      if (!raf) raf = requestAnimationFrame(frame);
    } else { endPeek(); armed = false; const a = document.activeElement; if (a && panel.contains(a)) a.blur(); }
    refreshTab();
  }

  // keys typed into the menu's own boxes stay in the menu (the game listens on window)
  for (const type of ['keydown', 'keyup', 'keypress']) {
    panel.addEventListener(type, (e) => { if (isText(e.target)) e.stopPropagation(); });
  }
  // nothing clicked in the menu reaches the game underneath
  for (const type of ['pointerdown', 'mousedown', 'click', 'dblclick', 'wheel', 'contextmenu']) panel.addEventListener(type, (e) => e.stopPropagation());
  window.addEventListener('keydown', (e) => {
    if (o.keys.includes(e.code)) {
      if (isText(e.target) && !panel.contains(e.target)) return; // typing in the game's own note box
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) setOpen(!isOpen);
      return;
    }
    if (isText(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const eat = () => { e.preventDefault(); e.stopPropagation(); };
    const c = e.code;
    if (c === 'Backslash' && tools.has.freeze && (isOpen || tools.frozen)) { eat(); if (!e.repeat) tools.setFrozen(!tools.frozen); }
    else if (c === 'Period' && tools.has.freeze && (isOpen || tools.frozen)) { eat(); tools.step(); }
    else if (c === 'KeyC' && tools.has.fly && (isOpen || tools.fly)) { eat(); if (!e.repeat) tools.setFly(!tools.fly); }
    else if (c === 'Escape' && tools.fly) { eat(); tools.setFly(false); }
    else if (c === 'KeyH' && (isOpen || tools.noHud)) { eat(); if (!e.repeat) tools.setNoHud(!tools.noHud); }
    else if (!isOpen || e.repeat) return;
    else if (c === 'KeyB' && tools.has.bot) { eat(); tools.toggleBot(); }
    else if (/^Digit[123]$/.test(c)) { eat(); slotClick('ABC'[+c.slice(5) - 1]); }
    else if (c === 'Slash') { eat(); search.focus(); search.select(); }
  }, true);

  if (tuning.dropped.length) console.info(`dev menu: ${tuning.dropped.length} kept value(s) dropped because the game's own value changed since: ${tuning.dropped.join(', ')}`);
  syncTools();
  if (o.open) setOpen(true);
  refreshTab();

  return {
    root: panel,
    tab,
    get open() { return isOpen; },
    get built() { return built; },
    toggle: (on = !isOpen) => setOpen(on),
    setOpen,
    refresh: () => { dirtyValues = true; },
    rebuild: () => { dirtyList = true; dirtyValues = true; },
    setView,
    get view() { return panel.classList.contains('simple') ? 'simple' : 'all'; },
    search: (q) => { search.value = query = q; applyFilter(); },
    say,
    flash,
    copyText,
    get width() { return width; },
    rows: () => rows.length,
  };
}

function parseText(text) {
  const body = String(text).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const a = body.indexOf('{'), b = body.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try { const v = JSON.parse(body.slice(a, b + 1)); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}
