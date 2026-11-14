// The tuning panel: a side panel that draws every control in a tuning registry (tuning.js), for whoever is tuning
// the game by hand while it runs. Plain DOM, its CSS is in this file, no imports.
//
//   import { createPanel } from './panel.js';
//   const panel = createPanel(tuning, { title: 'Tuning', canSave: true, save: async () => { ... } });
//
// Keys:   `  (backquote) or F2   open / close (always)
//         \  freeze the game (the picture keeps drawing)      .  one frame forward      (panel open, or frozen)
//         1 2 3  load slot A B C      /  jump to the search box                         (panel open)
//         Keys typed into the panel's boxes never reach the game.
// URL:    ?tune=open  open at once      ?tune=0  ignore values kept from earlier visits (set in createTuning)
//
// What it promises (from the games it came from):
//  - Closed, it costs nothing: rows are built the first time it opens. A small tab on the right edge says
//    "Tuning . 3 changed" whenever something is changed, so a forgotten change can't hide.
//  - Open, the game keeps running behind it. While a slider is dragged the rest of the panel fades, so you judge the
//    picture, not the panel.
//  - Each row: a mark, the name, a slider with a tick where the default sits, the value (click and type; it may go
//    past the slider's ends), and the game's own value on the right. A changed row turns gold; click the gold value
//    on the right, click the mark, or double-click the row to put it back.
//  - Groups fold (remembered) and have their own reset. Everything changed is repeated in a "Changed" group on top.
//  - Search looks through every control (group, name, id, hint).
//  - A / B / C slots keep whole sets of changes to flip between. Presets (with a description each) and a plain-words
//    short list ("Essentials") appear when the game gives some.
//  - "Copy changes" puts a header line and the changed values as JSON on the clipboard: paste it to your agent.
//    "Paste" takes such text back. "Save for my agent" (only when the game gives a save function, e.g. the kit's
//    dev server) writes the values into the game's own file; they become the new defaults.

const CSS = `
.mtp, .mtp-tab, .mtp-note { --ink: #ecebe6; --soft: #a9a8a2; --faint: #6f6e6a; --line: rgba(236, 235, 230, 0.09);
  --line2: rgba(236, 235, 230, 0.2); --gold: #f2b54a; --gold2: rgba(242, 181, 74, 0.16); --bg: rgba(18, 19, 24, 0.95);
  --field: rgba(255, 255, 255, 0.05); font: 400 13px/1.3 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-variant-numeric: tabular-nums; color: var(--ink); -webkit-font-smoothing: antialiased; }
.mtp { position: fixed; top: 0; right: 0; bottom: 0; width: 400px; max-width: 100vw; z-index: 60; display: flex;
  flex-direction: column; background: var(--bg); border-left: 1px solid var(--line2); box-shadow: -16px 0 40px rgba(0,0,0,.35);
  transform: translateX(103%); visibility: hidden; transition: transform .18s ease-out, visibility 0s linear .18s, opacity .15s; user-select: none; }
.mtp.open { transform: none; visibility: visible; transition: transform .18s ease-out, visibility 0s, opacity .15s; }
.mtp *, .mtp *::before, .mtp *::after { box-sizing: border-box; }
.mtp [hidden] { display: none !important; }
.mtp button, .mtp input, .mtp select, .mtp textarea { font: inherit; color: inherit; }
.mtp button { cursor: pointer; background: var(--field); border: 1px solid var(--line2); border-radius: 5px; padding: 3px 8px; }
.mtp button:hover:not(:disabled) { border-color: var(--soft); }
.mtp button:disabled { opacity: .4; cursor: default; }
.mtp button.on { background: var(--gold2); border-color: var(--gold); color: var(--gold); }
.mtp kbd { font: 10px/1 ui-monospace, Menlo, monospace; color: var(--faint); margin-left: 5px; }
.mtp header { padding: 10px 12px 8px; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 7px; }
.mtp .top { display: flex; align-items: center; gap: 8px; }
.mtp h3 { margin: 0; font-size: 13px; font-weight: 650; letter-spacing: .14em; text-transform: uppercase; flex: 1; }
.mtp .x { width: 26px; height: 26px; padding: 0; }
.mtp .bar { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.mtp .lab { color: var(--faint); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; margin-right: 2px; }
.mtp .slots button { min-width: 28px; }
.mtp .slots button.full { border-color: var(--soft); }
.mtp .slots button.cur { background: var(--gold2); border-color: var(--gold); color: var(--gold); }
.mtp .slots.arm button:not(.arm) { border-style: dashed; border-color: var(--gold); }
.mtp .slots .arm { margin-left: auto; color: var(--soft); }
.mtp .about { margin: 0; color: var(--soft); font-size: 12px; line-height: 1.35; min-height: 0; }
.mtp .find { display: flex; gap: 6px; align-items: center; }
.mtp .find input { flex: 1; height: 26px; padding: 0 8px; border: 1px solid var(--line2); border-radius: 5px; background: var(--field); outline: none; user-select: text; }
.mtp .find input:focus { border-color: var(--gold); }
.mtp .hits { color: var(--faint); font-size: 11px; }
.mtp .list { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.mtp .empty { padding: 16px 12px; color: var(--faint); }
.mtp .sec { border-bottom: 1px solid var(--line); }
.mtp .sec > .hd { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 7px; width: 100%; padding: 8px 12px;
  border: 0; border-radius: 0; background: rgb(22, 23, 29); text-align: left; font-weight: 650; letter-spacing: .06em; color: var(--soft); }
.mtp .sec > .hd:hover { color: var(--ink); }
.mtp .sec > .hd::before { content: ''; width: 6px; height: 6px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg); margin: 0 3px 3px 1px; transition: transform .12s; }
.mtp .sec.folded:not(.found) > .hd::before { transform: rotate(-45deg); margin: 0 3px 0 0; }
.mtp .sec.folded:not(.found) > .body { display: none; }
.mtp .sec .t { flex: 1; }
.mtp .sec .cnt { color: var(--faint); font-weight: 400; }
.mtp .sec .chg { color: var(--gold); font-weight: 500; }
.mtp .sec .rs { font-size: 11px; font-weight: 400; padding: 1px 6px; border: 1px solid var(--line2); border-radius: 4px; visibility: hidden; }
.mtp .sec.has .rs { visibility: visible; }
.mtp .sec.changed > .hd { color: var(--gold); }
.mtp .sec.nohit, .mtp.filtering .sec.simple { display: none; }
.mtp.simple .sec.group, .mtp:not(.simple) .sec.simple { display: none; }
.mtp.simple.filtering .sec.group:not(.nohit) { display: block; }
.mtp .row { display: grid; grid-template-columns: 10px minmax(0, 1fr) 118px 58px 46px; gap: 0 6px; align-items: center; min-height: 26px; padding: 1px 12px 1px 8px; }
.mtp .row:hover { background: rgba(255, 255, 255, .035); }
.mtp .row.live { background: rgba(255, 255, 255, .06); }
.mtp .row .mk { width: 8px; height: 8px; padding: 0; border: 0; border-radius: 50%; background: transparent; }
.mtp .row.changed .mk { background: var(--gold); cursor: pointer; }
.mtp .row .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--soft); }
.mtp .row .name i { font-style: normal; color: var(--faint); margin-right: 5px; }
.mtp .row.changed .name { color: var(--gold); }
.mtp .row .ctl { grid-column: 3 / 5; display: flex; align-items: center; gap: 6px; min-width: 0; }
.mtp .row.num .ctl { grid-column: 3; }
.mtp .track { position: relative; flex: 1; min-width: 0; height: 18px; display: flex; align-items: center; }
.mtp .track input { width: 100%; margin: 0; accent-color: var(--gold); }
.mtp .track .tick { position: absolute; top: 1px; bottom: 1px; width: 2px; margin-left: -1px; background: var(--soft); opacity: 0; pointer-events: none; border-radius: 1px; }
.mtp .row.changed .tick { opacity: .8; }
.mtp .val { width: 100%; height: 22px; padding: 0 5px; border: 1px solid var(--line); border-radius: 4px; background: var(--field); outline: none; text-align: right; user-select: text; }
.mtp .val:focus { border-color: var(--gold); }
.mtp .row.beyond .val { color: #ff8a6a; }
.mtp .def { text-align: right; color: var(--faint); font-size: 11px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding: 0; border: 0; background: none; }
.mtp .row.changed .def { color: var(--gold); text-decoration: underline dotted; cursor: pointer; }
.mtp .row select { width: 100%; height: 22px; background: rgb(30, 31, 38); border: 1px solid var(--line2); border-radius: 4px; }
.mtp .row .seg { display: flex; width: 100%; }
.mtp .row .seg button { flex: 1; border-radius: 0; padding: 1px 4px; font-size: 12px; white-space: nowrap; overflow: hidden; }
.mtp .row .seg button:first-child { border-radius: 4px 0 0 4px; } .mtp .row .seg button:last-child { border-radius: 0 4px 4px 0; }
.mtp .row input[type=checkbox] { width: 16px; height: 16px; margin: 0; accent-color: var(--gold); }
.mtp .row input[type=color] { width: 30px; height: 22px; padding: 0; border: 1px solid var(--line2); border-radius: 4px; background: none; }
.mtp .row.readout .ctl { grid-column: 3 / 6; color: var(--ink); font: 12px/1.3 ui-monospace, Menlo, monospace; white-space: pre-wrap; }
.mtp .row.fns { display: flex; flex-wrap: wrap; gap: 5px; padding: 4px 12px 4px 26px; }
.mtp .hint { padding: 0 12px 6px 26px; color: var(--faint); font-size: 11.5px; }
.mtp footer { border-top: 1px solid var(--line); padding: 8px 12px 10px; display: flex; flex-direction: column; gap: 6px; }
.mtp footer .bar .count { flex: 1; color: var(--faint); }
.mtp footer .bar .count.some { color: var(--gold); }
.mtp .primary { background: var(--gold2); border-color: var(--gold); color: var(--gold); font-weight: 600; }
.mtp .msg { min-height: 16px; color: var(--soft); font-size: 12px; }
.mtp .paste textarea { width: 100%; height: 92px; resize: vertical; padding: 6px; border: 1px solid var(--line2); border-radius: 5px;
  background: rgba(0,0,0,.3); font: 11.5px/1.35 ui-monospace, Menlo, monospace; user-select: text; outline: none; }
.mtp.peek { opacity: .12; }
.mtp.peek .row.live { opacity: 1; }
.mtp-tab { position: fixed; right: 0; top: 40%; z-index: 59; padding: 7px 8px; border: 1px solid rgba(242,181,74,.6); border-right: 0;
  border-radius: 6px 0 0 6px; background: rgba(18, 19, 24, 0.88); color: var(--gold); cursor: pointer; writing-mode: vertical-rl;
  letter-spacing: .08em; font-size: 12px; }
.mtp-tab[hidden] { display: none; }
.mtp-note { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 61; padding: 6px 12px; border-radius: 6px;
  background: rgba(18, 19, 24, 0.88); color: var(--ink); pointer-events: none; opacity: 0; transition: opacity .3s; }
.mtp-note.show { opacity: 1; }
`;

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

/**
 * @param {ReturnType<import('./tuning.js').createTuning>} tuning
 * @param {object} [opts]
 * @param {string} [opts.title]           panel title, also the first word of the copied header line
 * @param {string[]} [opts.keys]          key codes that open and close it
 * @param {boolean} [opts.canSave]        show "Save for my agent"
 * @param {() => Promise<string|void>} [opts.save]  writes the values to the game's file; may return a message
 * @param {() => {pause:Function, resume:Function, step:Function}|null} [opts.hooks]  freeze / step (default window.__game)
 * @param {string} [opts.copyNote]        extra words in the copied header line (e.g. the level being tuned)
 * @param {boolean} [opts.open]           open at once
 * @param {HTMLElement} [opts.parent]
 */
export function createPanel(tuning, opts = {}) {
  const o = {
    title: 'Tuning', keys: ['Backquote', 'F2'], canSave: false, save: null, copyNote: '',
    hooks: () => (typeof window !== 'undefined' && window.__game && typeof window.__game.pause === 'function' ? window.__game : null),
    open: false, parent: document.body, ...opts,
  };
  const params = new URLSearchParams(location.search);

  if (!document.getElementById('mtp-css')) { const st = h('style'); st.id = 'mtp-css'; st.textContent = CSS; document.head.append(st); }

  const tab = btn('', 'Tuning panel (` key)', () => setOpen(true), 'mtp-tab');
  tab.hidden = true;
  const panel = h('aside', 'mtp');
  panel.setAttribute('aria-label', 'Tuning panel');
  const note = h('div', 'mtp-note');
  o.parent.append(panel, tab, note);

  // ---------------------------------------------------------------- the shell ----
  const header = h('header');
  const top = h('div', 'top');
  const title = h('h3', null, o.title);
  top.append(title, btn('×', 'Close ( ` )', () => setOpen(false), 'x'));
  const tools = h('div', 'bar');
  const bFreeze = btn('Freeze', 'Stop the game clock. The picture keeps drawing.', () => setFrozen(!frozen));
  bFreeze.append(h('kbd', null, '\\'));
  const bStep = btn('Step', 'One frame forward (freezes first)', () => step());
  bStep.append(h('kbd', null, '.'));
  tools.append(bFreeze, bStep);
  const slots = h('div', 'bar slots');
  slots.append(h('span', 'lab', 'Compare'));
  const slotBtns = ['A', 'B', 'C'].map((k, i) => {
    const b = btn(k, '', (e) => slotClick(k, e.shiftKey));
    b.dataset.k = k; b.dataset.i = String(i + 1);
    slots.append(b);
    return b;
  });
  let armed = false;
  const bArm = btn('save to...', 'Then click A, B or C to keep the current values there', () => { armed = !armed; refreshSlots(); }, 'arm');
  slots.append(bArm);
  const presetsBox = h('div', 'presets');
  const presetBar = h('div', 'bar');
  const about = h('p', 'about');
  presetsBox.append(presetBar, about);
  const viewBar = h('div', 'bar');
  const bSimple = btn('Essentials', 'The few controls that matter most, in plain words', () => setView('simple'));
  const bAll = btn('Everything', 'Every control', () => setView('all'));
  viewBar.append(bSimple, bAll);
  const find = h('div', 'find');
  const search = h('input'); search.type = 'search'; search.placeholder = 'Search'; search.spellcheck = false; search.autocomplete = 'off';
  search.setAttribute('aria-label', 'Search the controls');
  const hits = h('span', 'hits');
  const bFold = btn('Fold all', null, () => foldAll(anyOpen()));
  find.append(search, hits, bFold);
  header.append(top, tools, slots, presetsBox, viewBar, find);

  const list = h('div', 'list');
  const empty = h('div', 'empty');
  list.append(empty);

  const footer = h('footer');
  const cbar = h('div', 'bar');
  const fbar = h('div', 'bar');
  const count = h('span', 'count');
  const bSave = btn('Save for my agent', 'Write every value into the game\'s own tuning file. They become the new defaults.', () => doSave(), 'primary');
  const bCopy = btn('Copy changes', 'The changed values as text: paste them to your agent to make them the defaults', () => doCopy());
  const bPaste = btn('Paste', 'Put back values from text (copied earlier, or from your agent)', () => openPaste());
  const bReset = btn('Reset all', 'Put every control back to the game\'s own value', () => doResetAll());
  cbar.append(count, bReset);
  fbar.append(bSave, bCopy, bPaste);
  const paste = h('div', 'paste');
  paste.hidden = true;
  const ta = h('textarea'); ta.spellcheck = false; ta.placeholder = 'Paste the values here, then Replace or Apply on top';
  const pbar = h('div', 'bar');
  pbar.append(btn('Replace', 'Everything else goes back to its default', () => doPaste(true)), btn('Apply on top', 'Keep the other changes', () => doPaste(false)), btn('Close', null, () => { paste.hidden = true; ta.blur(); }));
  paste.append(ta, pbar);
  const msg = h('div', 'msg');
  footer.append(cbar, fbar, paste, msg);
  panel.append(header, list, footer);

  let msgT = 0;
  function say(text) { msg.textContent = text || ''; clearTimeout(msgT); if (text) msgT = setTimeout(() => { msg.textContent = ''; }, 7000); }
  let noteT = 0;
  function flash(text) { note.textContent = text; note.classList.add('show'); clearTimeout(noteT); noteT = setTimeout(() => note.classList.remove('show'), 1600); }

  // ---------------------------------------------------------------- rows ----
  const rows = []; // { id, el, read(), mark(), search, top, alias }
  const sections = new Map(); // key -> { el, body, cnt, chg, ids:Set, kind }
  let built = false, dirtyList = true, dirtyValues = true, liveRow = null, peekT = 0;
  const folded = tuning.ui('folded', {});
  const fold = (key, v) => { folded[key] = v; tuning.setUi('folded', folded); };

  function makeSection(key, name, kind) {
    const el = h('section', `sec ${kind}`);
    const hd = h('button', 'hd'); hd.type = 'button'; hd.tabIndex = -1;
    const t = h('span', 't', name), cnt = h('span', 'cnt'), chg = h('span', 'chg'), rs = h('span', 'rs', 'reset');
    rs.title = `Put ${name} back`;
    hd.append(t, cnt, chg, rs);
    const body = h('div', 'body');
    el.append(hd, body);
    const sec = { key, name, el, body, cnt, chg, ids: new Set(), kind };
    hd.addEventListener('click', (e) => {
      hd.blur();
      if (e.target === rs) {
        if (kind === 'group') tuning.resetGroup(name);
        else for (const id of sec.ids) tuning.reset(id);
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

  function makeRow(it, { top = false, alias = null } = {}) {
    const id = it.id, kind = it.kind;
    const el = h(kind === 'bool' ? 'label' : 'div', `row ${kind}`);
    const row = { id, el, top, alias, read: () => {}, search: `${it.group} ${it.label} ${id} ${it.hint || ''} ${alias ? alias[0] + ' ' + (alias[2] || '') : ''}`.toLowerCase() };
    const mk = btn('', 'Changed: click to put it back', (e) => { e.preventDefault(); tuning.reset(id); }, 'mk');
    const name = h('span', 'name');
    if (top) name.append(h('i', null, it.group));
    name.append(document.createTextNode(alias ? alias[0] : it.label));
    el.append(mk, name);
    const ctl = h('div', 'ctl');
    el.append(ctl);
    const cur = () => tuning.item(id) || it;

    if (kind === 'readout') {
      row.read = () => { let s; try { s = String(cur().read()); } catch (e) { s = 'error'; } if (ctl.textContent !== s) ctl.textContent = s; };
      el.title = it.hint || '';
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
      row.read = () => {
        const v = cur().get();
        if (document.activeElement !== val) val.value = fmtNum(v, d);
        if (liveRow !== row) rng.value = typeof v === 'number' ? v : it.min;
        tick.style.left = `calc(${pos(cur().def) * 100}% + ${(0.5 - pos(cur().def)) * 14}px)`; // the thumb's travel is the track minus its width
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
    } else if (kind === 'bool') {
      const box = h('input'); box.type = 'checkbox'; box.tabIndex = -1;
      box.addEventListener('change', () => { tuning.set(id, box.checked); box.blur(); });
      row.read = () => { const v = !!cur().get(); if (box.checked !== v) box.checked = v; };
      ctl.append(box);
    } else if (kind === 'pick') {
      const options = it.options || [];
      const total = options.reduce((n, op) => n + optLabel(op).length + 3, 0);
      if (options.length <= 4 && total <= 26) {
        const seg = h('div', 'seg');
        options.forEach((op) => seg.append(btn(optLabel(op), null, () => tuning.set(id, optValue(op)))));
        row.read = () => { const v = cur().get(); [...seg.children].forEach((b, i) => b.classList.toggle('on', optValue(options[i]) === v)); };
        ctl.append(seg);
      } else {
        const sel = h('select'); sel.tabIndex = -1;
        options.forEach((op, i) => { const x = h('option', null, optLabel(op)); x.value = String(i); sel.append(x); });
        sel.addEventListener('change', () => { tuning.set(id, optValue(options[+sel.value])); sel.blur(); });
        row.read = () => { const i = options.findIndex((op) => optValue(op) === cur().get()); if (sel.value !== String(i)) sel.value = String(i); };
        ctl.append(sel);
      }
    } else if (kind === 'color') {
      const sw = h('input'); sw.type = 'color'; sw.tabIndex = -1;
      const hex = h('input', 'val'); hex.type = 'text'; hex.maxLength = 7; hex.spellcheck = false; hex.autocomplete = 'off';
      sw.addEventListener('input', () => tuning.set(id, sw.value));
      sw.addEventListener('change', () => sw.blur());
      hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') { tuning.set(id, hex.value); hex.blur(); } else if (e.key === 'Escape') { hex.value = cur().get(); hex.blur(); } });
      hex.addEventListener('blur', () => { if (hex.value !== cur().get()) tuning.set(id, hex.value); row.read(); });
      row.read = () => { const v = String(cur().get() || '#000000'); if (sw.value !== v) sw.value = v; if (document.activeElement !== hex) hex.value = v; };
      ctl.append(sw, hex);
    }
    const def = btn('', null, (e) => { e.preventDefault(); tuning.reset(id); }, 'def');
    el.append(def);
    row.mark = () => {
      const c = cur();
      const ch = tuning.changed(id);
      el.classList.toggle('changed', ch);
      const was = kind === 'num' ? fmtNum(c.def, decimals(c.step)) : kind === 'bool' ? (c.def ? 'on' : 'off') : kind === 'pick' ? optLabel((c.options || []).find((x) => optValue(x) === c.def) ?? c.def) : String(c.def);
      def.textContent = was;
      def.title = ch ? `Click: back to the game's own value, ${was}` : 'The game\'s own value';
      const where = alias ? `\nIn the full list: ${c.group} / ${c.label}` : '';
      el.title = `${(alias && alias[2]) || c.hint || ''}${(alias && alias[2]) || c.hint ? '\n' : ''}${c.id}${kind === 'num' ? `   ${c.min} to ${c.max}` : ''}${where}`;
    };
    // double-click anywhere on the row (not while typing in it) puts the value back
    el.addEventListener('dblclick', (e) => { if (isText(e.target) && document.activeElement === e.target) return; e.preventDefault(); tuning.reset(id); });
    return row;
  }

  function addRow(sec, it, extra) {
    const row = makeRow(it, extra);
    rows.push(row);
    sec.body.append(row.el);
    sec.ids.add(it.id);
    row.read(); row.mark?.();
    return row;
  }

  // The list is rebuilt when controls are added, but never under a hand that is dragging a slider.
  function build() {
    if (liveRow) return;
    dirtyList = false;
    for (const sec of sections.values()) sec.el.remove();
    sections.clear(); rows.length = 0;
    const items = tuning.items();
    const changedSec = makeSection('~changed', 'Changed', 'changed');
    list.insertBefore(changedSec.el, empty);
    // the short list, when the game gives one
    for (const [name, aliases] of tuning.essentials) {
      const sec = makeSection('simple:' + name, name, 'simple');
      for (const alias of aliases) { const it = tuning.item(alias[1]); if (it) addRow(sec, it, { alias }); }
      if (sec.ids.size) list.insertBefore(sec.el, empty);
    }
    // every control, by group, in the order groups first appear
    for (const g of tuning.groups()) {
      const sec = makeSection(g, g, 'group');
      sec.n = 0;
      let fns = null;
      for (const it of items) {
        if (it.group !== g) continue;
        sec.n++;
        if (it.kind === 'button') {
          if (!fns || fns !== sec.body.lastElementChild) { fns = h('div', 'row fns'); sec.body.append(fns); }
          const b = btn(it.label, it.hint || it.id, () => { try { (tuning.item(it.id) || it).run(); } catch (err) { console.error(`tuning: "${it.id}" failed`, err); say(`"${it.label}" failed: see the console`); } dirtyValues = true; });
          b.dataset.search = `${g} ${it.label} ${it.id}`.toLowerCase();
          fns.append(b);
          sec.ids.add(it.id);
        } else addRow(sec, it);
      }
      list.insertBefore(sec.el, empty);
    }
    syncChanged(true);
    const hasSimple = tuning.essentials.length > 0;
    viewBar.hidden = !hasSimple;
    bAll.textContent = `Everything (${items.length})`;
    search.placeholder = `Search all ${items.length} controls`;
    setView(hasSimple ? tuning.ui('view', 'simple') : 'all', true);
    buildPresets();
    applyFilter();
    syncFold();
  }

  // the group on top: one more row for every changed control; it only moves when the pointer is off the list
  let overList = false;
  function syncChanged(force) {
    if (!force && overList) return;
    const sec = sections.get('~changed');
    if (!sec) return;
    const want = new Set(tuning.items().filter((it) => tuning.changed(it.id) && it.save !== false).map((it) => it.id));
    for (const row of rows.filter((r) => r.top)) {
      if (!want.has(row.id)) { row.el.remove(); rows.splice(rows.indexOf(row), 1); sec.ids.delete(row.id); }
    }
    for (const id of want) if (!sec.ids.has(id)) addRow(sec, tuning.item(id), { top: true });
    sec.el.hidden = want.size === 0;
  }

  function buildPresets() {
    presetBar.innerHTML = '';
    presetsBox.hidden = tuning.presets.length === 0;
    if (!tuning.presets.length) return;
    presetBar.append(h('span', 'lab', 'Presets'));
    presetBar.append(btn('Game\'s own', 'Every control back to the game\'s own value', () => { tuning.resetAll(); about.textContent = ''; say('Back to the game\'s own values'); }));
    for (const p of tuning.presets) {
      const b = btn(p.name, p.about || '', () => {
        const r = tuning.applyPreset(p.id);
        about.textContent = p.about || '';
        say(`Preset "${p.name}"${r.unknown.length ? `: ${r.unknown.length} value(s) match no control (see the console)` : ''}`);
        if (r.unknown.length) console.warn(`tuning: preset "${p.name}" names controls that do not exist: ${r.unknown.join(' | ')}`);
      });
      b.dataset.preset = p.id;
      b.addEventListener('pointerenter', () => { about.textContent = p.about || ''; });
      presetBar.append(b);
    }
  }

  function setView(v, quiet) {
    const view = v === 'simple' && tuning.essentials.length ? 'simple' : 'all';
    panel.classList.toggle('simple', view === 'simple');
    bSimple.classList.toggle('on', view === 'simple');
    bAll.classList.toggle('on', view === 'all');
    if (!quiet) { tuning.setUi('view', view); list.scrollTop = 0; }
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
          for (const b of el.children) { const ok = !words.length || hit(b.dataset.search); b.hidden = !ok; anyB ||= ok; total++; if (ok) shown++; }
          el.hidden = !anyB;
          any ||= anyB;
        } else if (!el.hidden) any = true;
      }
      sec.el.classList.toggle('nohit', !any);
      sec.el.classList.toggle('found', words.length > 0 && any); // a search opens what it finds, without changing what you folded
    }
    hits.textContent = words.length ? `${shown} of ${total}` : '';
    empty.textContent = words.length && !shown ? `No control matches "${query.trim()}"` : !tuning.items().length ? 'Nothing registered yet.' : '';
    panel.classList.toggle('filtering', words.length > 0);
  }
  const visibleSecs = () => [...sections.values()].filter((s) => (panel.classList.contains('simple') ? s.kind !== 'group' : s.kind !== 'simple'));
  const anyOpen = () => visibleSecs().some((s) => !s.el.classList.contains('folded'));
  function foldAll(f) { for (const s of visibleSecs()) { s.el.classList.toggle('folded', f); folded[s.key] = f; } tuning.setUi('folded', folded); syncFold(); }
  function syncFold() { bFold.textContent = anyOpen() ? 'Fold all' : 'Open all'; }
  search.addEventListener('input', () => { query = search.value; applyFilter(); list.scrollTop = 0; });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (search.value) { search.value = query = ''; applyFilter(); } else search.blur(); } else if (e.key === 'Enter') search.blur(); });

  // ---------------------------------------------------------------- peek: the panel gets out of the picture's way ----
  function startPeek(row) { liveRow = row; row.el.classList.add('live'); clearTimeout(peekT); peekT = setTimeout(() => { if (liveRow) panel.classList.add('peek'); }, 180); }
  function endPeek() { clearTimeout(peekT); if (liveRow) { liveRow.el.classList.remove('live'); const r = liveRow; liveRow = null; r.read(); } panel.classList.remove('peek'); }
  window.addEventListener('pointerup', endPeek, true);
  window.addEventListener('pointercancel', endPeek, true);
  list.addEventListener('pointerenter', () => { overList = true; });
  list.addEventListener('pointerleave', () => { overList = false; dirtyValues = true; });

  // ---------------------------------------------------------------- refresh ----
  function refresh() {
    if (!built) return;
    if (dirtyList) build();
    syncChanged(false);
    for (const row of rows) { row.read(); row.mark?.(); }
    counts();
  }
  function counts() {
    const n = tuning.count();
    count.textContent = n ? `${n} changed` : 'Nothing changed';
    count.classList.toggle('some', n > 0);
    bCopy.disabled = bReset.disabled = n === 0;
    for (const sec of sections.values()) {
      let c = 0;
      for (const id of sec.ids) if (tuning.changed(id)) c++;
      if (sec.kind === 'group') sec.cnt.textContent = String(sec.n);
      sec.chg.textContent = c ? String(c) : '';
      sec.el.classList.toggle('has', c > 0);
    }
    refreshSlots();
    const ap = tuning.activePreset();
    for (const b of presetBar.querySelectorAll('[data-preset]')) b.classList.toggle('on', b.dataset.preset === ap);
  }
  function refreshTab() {
    const n = tuning.count();
    const word = frozen ? 'Frozen' : 'Tuning';
    tab.textContent = n ? `${word} . ${n} changed` : word;
    tab.hidden = isOpen || (!n && !frozen);
  }
  function refreshSlots() {
    const cur = tuning.activeSlot();
    slots.classList.toggle('arm', armed);
    bArm.classList.toggle('on', armed);
    for (const b of slotBtns) {
      const k = b.dataset.k, s = tuning.slot(k);
      b.classList.toggle('full', !!s);
      b.classList.toggle('cur', !!s && cur === k);
      b.title = armed ? `Keep the current values in ${k}` : s ? `Load ${k} (key ${b.dataset.i}): ${Object.keys(s).length} changed value(s). Shift-click: keep the current values here` : `${k} is empty: click to keep the current values here`;
    }
  }
  function slotClick(k, keep = false) {
    if (armed || keep || !tuning.slot(k)) { tuning.saveSlot(k); say(`Kept the current values in ${k}`); }
    else { tuning.loadSlot(k); say(`Loaded ${k}`); flash(`Slot ${k}`); }
    armed = false;
    refreshSlots();
  }

  tuning.onChange((it) => {
    if (!it) dirtyList = true;
    dirtyValues = true;
  });
  // values change from outside too (game code, keys): look a few times a second while open, once a second while shut
  let lastLook = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (isOpen && (dirtyValues || dirtyList || now - lastLook > 300)) { dirtyValues = false; lastLook = now; refresh(); }
    else if (!isOpen && now - lastLook > 1000) { lastLook = now; refreshTab(); }
    if (dirtyValues && !isOpen) { dirtyValues = false; refreshTab(); }
  }
  requestAnimationFrame(frame);

  // ---------------------------------------------------------------- copy, paste, save, reset ----
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* no permission, or not a secure page */ }
    try {
      const t = h('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.append(t); t.select();
      const ok = document.execCommand('copy'); t.remove(); return ok;
    } catch { return false; }
  }
  async function doCopy() {
    const text = tuning.copyText({ title: o.title, note: typeof o.copyNote === 'function' ? o.copyNote() : o.copyNote });
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
    if (performance.now() - sure > 2500) { sure = performance.now(); bReset.textContent = 'Sure? Reset all'; setTimeout(() => { bReset.textContent = 'Reset all'; }, 2500); return; }
    sure = 0; bReset.textContent = 'Reset all';
    tuning.resetAll(); about.textContent = '';
    say('Everything is back to the game\'s own values.');
  }
  async function doSave() {
    if (!o.save) return;
    bSave.disabled = true;
    try {
      const m = await o.save();
      say(m || 'Saved. Your agent will see it.');
    } catch (err) {
      say(`Could not save (${err?.message || err}). Use Copy changes instead.`);
    } finally { bSave.disabled = false; }
  }
  bSave.hidden = !(o.canSave && o.save);

  // ---------------------------------------------------------------- freeze and step ----
  let frozen = false;
  function setFrozen(on) {
    const g = o.hooks();
    if (!g) { say('This game has no pause hook (window.__game.pause).'); return; }
    frozen = !!on;
    if (frozen) g.pause(); else g.resume();
    bFreeze.classList.toggle('on', frozen);
    flash(frozen ? 'Frozen.  \\ resumes   . steps one frame' : 'Running');
    refreshTab();
  }
  function step() {
    const g = o.hooks();
    if (!g) return;
    if (!frozen) { frozen = true; bFreeze.classList.add('on'); refreshTab(); }
    g.step(1);
  }

  // ---------------------------------------------------------------- open, close, keys ----
  let isOpen = false;
  function setOpen(on) {
    isOpen = !!on;
    if (isOpen && !built) { built = true; build(); }
    panel.classList.toggle('open', isOpen);
    tuning.setUi('open', isOpen);
    if (isOpen) { if (document.pointerLockElement) document.exitPointerLock?.(); dirtyValues = true; refresh(); }
    else { endPeek(); armed = false; const a = document.activeElement; if (a && panel.contains(a)) a.blur(); }
    refreshTab();
  }

  // keys typed into the panel's own boxes stay in the panel (the game listens on window)
  for (const type of ['keydown', 'keyup', 'keypress']) {
    panel.addEventListener(type, (e) => { if (isText(e.target)) e.stopPropagation(); });
  }
  window.addEventListener('keydown', (e) => {
    if (o.keys.includes(e.code)) {
      if (isText(e.target) && !panel.contains(e.target)) return; // typing in the game's own note box
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) setOpen(!isOpen);
      return;
    }
    if (isText(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!isOpen && !frozen) return;
    if (e.code === 'Backslash') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) setFrozen(!frozen); }
    else if (e.code === 'Period') { e.preventDefault(); e.stopPropagation(); step(); }
    else if (isOpen && !e.repeat && /^Digit[123]$/.test(e.code)) { e.preventDefault(); e.stopPropagation(); slotClick('ABC'[+e.code.slice(5) - 1]); }
    else if (isOpen && e.code === 'Slash') { e.preventDefault(); e.stopPropagation(); search.focus(); }
  }, true);

  if (tuning.dropped.length) console.info(`tuning: ${tuning.dropped.length} saved value(s) dropped because the game's own default changed: ${tuning.dropped.join(', ')}`);
  if (o.open || params.get('tune') === 'open' || tuning.ui('open', false)) setOpen(true);
  refreshTab();

  return {
    root: panel,
    tab,
    get open() { return isOpen; },
    get frozen() { return frozen; },
    toggle: (on = !isOpen) => setOpen(on),
    setOpen,
    setFrozen,
    step,
    refresh: () => { dirtyValues = true; },
    rebuild: () => { dirtyList = true; dirtyValues = true; },
    setView,
    search: (q) => { search.value = query = q; applyFilter(); },
    say,
  };
}

// the same reader as tuning.js parse(), kept here so the panel has no imports
function parseText(text) {
  const body = String(text).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const a = body.indexOf('{'), b = body.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try { const v = JSON.parse(body.slice(a, b + 1)); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}
