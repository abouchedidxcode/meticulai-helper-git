// The tuning registry: every number worth turning while the game runs, in one place. No DOM, no imports, so it
// runs in Node tests and in any game. The panel (panel.js) draws whatever is registered here.
//
//   import { createTuning } from './tuning.js';
//   const tuning = createTuning({ storageKey: 'my-game.tuning' });
//
// Register from any module, one line each (before or after the panel exists, in any order):
//
//   tuning.num('Player', 'Run speed', P, 'runSpeed', 2, 14, 0.1);              // P.runSpeed is read and written
//   tuning.bool('Feel', 'Invincible', cheats, 'invincible');
//   tuning.pick('Look', 'Shape', opts, 'shape', ['box', 'ball', ['torus', 'Ring']]);
//   tuning.color('Look', 'Sky colour', look, 'sky');                           // '#rrggbb' string or a THREE.Color
//   tuning.button('Debug', 'Kick the ball', () => ball.kick());
//   tuning.readout('Debug', 'Height', () => ball.y.toFixed(2) + ' m');
//   // each takes a last options object: { id, hint, save: false, onChange(v) }
//
//   tuning.group('Player').num('Jump', P, 'jump', 4, 16, 0.1).bool('Double jump', P, 'double');   // the same, chained
//
//   tuning.add({ id, kind: 'num'|'bool'|'pick'|'color'|'button'|'readout', group, label, hint,
//                min, max, step, options, get, set, def, save, onChange, run, read })        // the general form
//
// Rules (learned in five games):
//  - `id` is stable and unique: it is the key in storage, in "Copy changes", in presets and in pasted JSON.
//    The shorthands make it '<group in lower case>.<key>' unless you pass { id }. Renaming an id loses saved values
//    and breaks presets: checkPresets() lists what no longer fits.
//  - The default is whatever get() returns when the control is registered (or `def`), so register after the thing
//    exists and before anything changes it. Reset puts the default back.
//  - set() must take effect at once: game code reads the value every time it needs it, never caches it.
//  - Changed values are kept in storage as a diff from the defaults, WITH the default they were changed from. If the
//    game's default has changed since (the agent made a new default), the old saved value is dropped, not re-applied.
//  - `save: false` keeps a control out of storage, slots, presets and copies (a switch for this session only).
//  - Registering an id again replaces the control but keeps its first default (hot reload must not turn a changed
//    value into the default).

export const SLOTS = ['A', 'B', 'C'];

const VALUE_KINDS = new Set(['num', 'bool', 'pick', 'color']);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const slug = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** decimals of a step (0.05 -> 2), so values come out clean */
export function decimals(step) {
  if (!(step > 0)) return 3;
  let d = 0;
  let s = step;
  while (d < 6 && Math.abs(s - Math.round(s)) > 1e-7) { s *= 10; d++; }
  return d;
}

export const optValue = (o) => (Array.isArray(o) ? o[0] : isObj(o) ? o.value : o);
export const optLabel = (o) => String(Array.isArray(o) ? o[1] ?? o[0] : isObj(o) ? o.label ?? o.value : o);

function normHex(v) {
  let s = String(v ?? '').trim().toLowerCase();
  if (!s.startsWith('#')) s = '#' + s;
  if (/^#[0-9a-f]{3}$/.test(s)) s = '#' + [...s.slice(1)].map((c) => c + c).join('');
  return /^#[0-9a-f]{6}$/.test(s) ? s : null;
}

function same(kind, a, b) {
  if (kind === 'num') return typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= 1e-9 : a === b;
  if (kind === 'color') return normHex(a) === normHex(b);
  return a === b;
}

/** A value made fit for a control, or null when no sense can be made of it. Numbers are NOT clamped to the slider:
 *  a typed value may go past its ends (the panel marks it). */
export function fit(item, v) {
  switch (item.kind) {
    case 'num': {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(',', '.')) : NaN;
      if (!Number.isFinite(n)) return null;
      return +n.toFixed(Math.min(9, decimals(item.step) + 3));
    }
    case 'bool':
      return typeof v === 'boolean' ? v : v === 1 || v === 'true' ? true : v === 0 || v === 'false' ? false : null;
    case 'pick': {
      const ok = (item.options || []).map(optValue);
      const hit = ok.findIndex((o) => o === v);
      const loose = hit >= 0 ? hit : ok.findIndex((o) => String(o) === String(v));
      return loose >= 0 ? ok[loose] : null;
    }
    case 'color':
      return normHex(v);
    default:
      return null;
  }
}

function defaultStorage() {
  try {
    const ls = globalThis.localStorage;
    if (ls) return ls;
  } catch { /* private mode, or blocked */ }
  return null;
}

/** Turn pasted or loaded values into a flat { id: value }. Accepts a flat diff, { tune: {...} } / { values: {...} },
 *  and the starter's tuning.json shape ({ group: { id: { value } } } or { group: { id: value } }). */
export function flatten(o) {
  if (!isObj(o)) return null;
  const keys = Object.keys(o);
  if (keys.length === 1 && (keys[0] === 'tune' || keys[0] === 'values' || keys[0] === 'changes') && isObj(o[keys[0]])) return flatten(o[keys[0]]);
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (isObj(v) && !('value' in v)) {
      for (const [k2, v2] of Object.entries(v)) out[`${k}.${k2}`] = isObj(v2) && 'value' in v2 ? v2.value : v2;
    } else out[k] = isObj(v) && 'value' in v ? v.value : v;
  }
  return out;
}

/** Read pasted text: the JSON object in it, whatever is round it (a header line, a code fence, words). */
export function parse(text) {
  const body = String(text ?? '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const a = body.indexOf('{');
  const b = body.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try {
    return flatten(JSON.parse(body.slice(a, b + 1)));
  } catch {
    return null;
  }
}

const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/**
 * @param {object} [opts]
 * @param {string} [opts.storageKey]  localStorage key (one per game: two games on one site must not share it)
 * @param {Storage|null} [opts.storage]  anything with getItem/setItem (tests pass a fake); null = keep nothing
 * @param {boolean} [opts.useStored]  false: ignore what earlier visits saved (the URL switch ?tune=0 does this)
 */
export function createTuning({ storageKey = 'game.tuning', storage = defaultStorage(), useStored = true } = {}) {
  const reg = new Map(); // id -> item
  const listeners = new Set();
  /** @type {{ v: Record<string, {v:any, base:any}>, slots: Record<string, Record<string, any>>, ui: Record<string, any> }} */
  let store = { v: {}, slots: {}, ui: {} };
  if (storage) {
    try {
      const s = JSON.parse(storage.getItem(storageKey) || '{}');
      store = { v: useStored && isObj(s.v) ? s.v : {}, slots: isObj(s.slots) ? s.slots : {}, ui: isObj(s.ui) ? s.ui : {} };
    } catch { /* bad JSON: start clean */ }
  }
  const save = () => {
    if (!storage) return;
    try { storage.setItem(storageKey, JSON.stringify(store)); } catch { /* full or private mode */ }
  };
  const notify = (item = null) => { for (const fn of listeners) fn(item); };
  const kept = (it) => VALUE_KINDS.has(it.kind) && it.save !== false;

  const api = {
    storageKey,
    /** ids of saved values that were dropped at load because the game's own default had changed since */
    dropped: [],
    presets: [],
    essentials: [],

    /** register (or replace) a control; returns the item */
    add(def) {
      const it = { ...def };
      if (!it.id) it.id = `${slug(it.group || 'misc')}.${slug(it.label || 'x')}`;
      it.group = it.group || 'Misc';
      it.label = it.label || it.id;
      if (it.kind === 'num') {
        if (!(it.step > 0)) it.step = it.max > it.min ? (it.max - it.min) / 200 : 0.01;
      }
      const old = reg.get(it.id);
      if (VALUE_KINDS.has(it.kind)) {
        if (!('def' in def) || def.def === undefined) it.def = old && old.kind === it.kind ? old.def : it.get();
        if (it.kind === 'color') it.def = normHex(it.def) ?? it.def;
      }
      reg.set(it.id, it);
      if (kept(it) && it.id in store.v) {
        const s = store.v[it.id];
        if (isObj(s) && 'base' in s && !same(it.kind, s.base, it.def)) {
          delete store.v[it.id]; // the default moved under it: the agent made a new default. Drop the old change.
          api.dropped.push(it.id);
          save();
        } else if (!put(it, isObj(s) && 'v' in s ? s.v : s)) {
          delete store.v[it.id];
          save();
        }
      }
      notify();
      return it;
    },

    num(group, label, obj, key, min, max, step, o = {}) {
      return api.add({ kind: 'num', group, label, min, max, step, id: o.id ?? `${slug(group)}.${key}`, get: () => obj[key], set: (v) => { obj[key] = v; }, ...o });
    },
    bool(group, label, obj, key, o = {}) {
      return api.add({ kind: 'bool', group, label, id: o.id ?? `${slug(group)}.${key}`, get: () => !!obj[key], set: (v) => { obj[key] = !!v; }, ...o });
    },
    pick(group, label, obj, key, options, o = {}) {
      return api.add({ kind: 'pick', group, label, options, id: o.id ?? `${slug(group)}.${key}`, get: () => obj[key], set: (v) => { obj[key] = v; }, ...o });
    },
    color(group, label, obj, key, o = {}) {
      const isColor = () => obj[key] && typeof obj[key].getHexString === 'function';
      return api.add({
        kind: 'color', group, label, id: o.id ?? `${slug(group)}.${key}`,
        get: () => (isColor() ? '#' + obj[key].getHexString() : normHex(obj[key])),
        set: (v) => { if (isColor()) obj[key].set(v); else obj[key] = v; },
        ...o,
      });
    },
    button(group, label, run, o = {}) {
      return api.add({ kind: 'button', group, label, run, id: o.id ?? `${slug(group)}.${slug(label)}`, ...o });
    },
    readout(group, label, read, o = {}) {
      return api.add({ kind: 'readout', group, label, read, id: o.id ?? `${slug(group)}.${slug(label)}`, ...o });
    },
    /** the same shorthands with the group filled in, chained: tuning.group('Player').num(...).bool(...) */
    group(name) {
      const g = {
        num: (...a) => (api.num(name, ...a), g),
        bool: (...a) => (api.bool(name, ...a), g),
        pick: (...a) => (api.pick(name, ...a), g),
        color: (...a) => (api.color(name, ...a), g),
        button: (...a) => (api.button(name, ...a), g),
        readout: (...a) => (api.readout(name, ...a), g),
      };
      return g;
    },

    items: () => [...reg.values()],
    item: (id) => reg.get(id),
    groups: () => [...new Set([...reg.values()].map((i) => i.group))],
    /** fn(item | null) whenever a control is added (null) or a value changes (the item); returns the unsubscribe */
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    get(id) { const it = reg.get(id); return it && VALUE_KINDS.has(it.kind) ? it.get() : undefined; },
    /** set a value (fitted to its control), keep it, tell the panel. Returns false if the value made no sense. */
    set(id, v) {
      const it = reg.get(id);
      if (!it || !put(it, v)) return false;
      record(it);
      save();
      notify(it);
      return true;
    },
    changed(id) {
      const it = reg.get(id);
      return !!it && VALUE_KINDS.has(it.kind) && !same(it.kind, it.get(), it.def);
    },
    /** outside the game's own range (typed past the slider's ends) */
    beyond(id) {
      const it = reg.get(id);
      if (!it || it.kind !== 'num') return false;
      const v = it.get();
      return typeof v === 'number' && (v < it.min - 1e-9 || v > it.max + 1e-9);
    },
    reset(id) { const it = reg.get(id); if (it && VALUE_KINDS.has(it.kind)) api.set(id, it.def); },
    resetGroup(group) {
      for (const it of reg.values()) if (it.group === group && VALUE_KINDS.has(it.kind)) { put(it, it.def); record(it); }
      save();
      notify();
    },
    resetAll() {
      for (const it of reg.values()) if (kept(it)) put(it, it.def);
      store.v = {};
      save();
      notify();
    },

    /** the changed values as a flat { id: value } (kept controls only), plus any saved for controls not registered yet */
    changes() {
      const out = {};
      for (const [id, s] of Object.entries(store.v)) if (!reg.has(id)) out[id] = isObj(s) && 'v' in s ? s.v : s;
      for (const it of reg.values()) if (kept(it) && !same(it.kind, it.get(), it.def)) out[it.id] = it.get();
      return out;
    },
    count() { return Object.keys(api.changes()).length; },

    /** Apply a flat diff. replace: everything else goes back to its default first. Returns { used, unknown, bad }. */
    apply(diff, replace = true) {
      const flat = flatten(diff) || {};
      if (replace) { for (const it of reg.values()) if (kept(it)) put(it, it.def); store.v = {}; }
      const used = [];
      const unknown = [];
      const bad = [];
      for (const [id, v] of Object.entries(flat)) {
        const it = reg.get(id);
        if (!it) { unknown.push(id); store.v[id] = { v }; continue; } // kept for a control that registers later
        if (!VALUE_KINDS.has(it.kind) || !put(it, v)) { bad.push(id); continue; }
        record(it);
        used.push(id);
      }
      save();
      notify();
      return { used, unknown, bad };
    },

    /** "Copy changes": one line saying what it is, then the changed values as compact JSON (id: value) */
    copyText({ title = 'Tuning', note = '', when = new Date() } = {}) {
      const d = api.changes();
      const n = Object.keys(d).length;
      const stamp = when.toISOString().slice(0, 16).replace('T', ' ');
      return `// ${title} ${stamp}: ${n} value${n === 1 ? '' : 's'} changed from the game's defaults (id: value)${note ? ' . ' + note : ''}\n${JSON.stringify(d)}`;
    },

    /** The current values become the defaults (after "Save for my agent" wrote them into the game's file).
     *  ids: only these controls (the ones the file holds); controls the file does not hold keep their change. */
    rebase(ids = null) {
      const only = ids ? new Set(ids) : null;
      for (const it of reg.values()) {
        if (!VALUE_KINDS.has(it.kind) || (only && !only.has(it.id))) continue;
        it.def = it.kind === 'color' ? normHex(it.get()) : it.get();
        delete store.v[it.id];
      }
      save();
      notify();
    },

    // ---- A / B / C: keep whole sets of changes and flip between them to compare feels
    slot: (k) => store.slots[k],
    saveSlot(k) { store.slots[k] = api.changes(); save(); notify(); },
    loadSlot(k) { const s = store.slots[k]; if (s) api.apply(s, true); return !!s; },
    clearSlot(k) { delete store.slots[k]; save(); notify(); },
    /** the slot the current values match exactly (null: none) */
    activeSlot() {
      const cur = JSON.stringify(sorted(api.changes()));
      return SLOTS.find((k) => store.slots[k] && JSON.stringify(sorted(store.slots[k])) === cur) ?? null;
    },

    // ---- presets: named sets, each with a description. Choosing one first puts everything back to the defaults,
    // then applies its values, so presets never pile up.
    /** list: [{ id, name, about, values: { id: value } }] */
    addPresets(list) { api.presets = list.map((p) => ({ ...p, id: p.id ?? slug(p.name) })); notify(); },
    applyPreset(id) {
      const p = api.presets.find((x) => x.id === id);
      if (!p) { api.resetAll(); return { used: [], unknown: [], bad: [] }; }
      return api.apply(p.values, true);
    },
    /** the preset the current values match exactly (null: none) */
    activePreset() {
      const cur = JSON.stringify(sorted(api.changes()));
      return api.presets.find((p) => JSON.stringify(sorted(p.values)) === cur)?.id ?? null;
    },
    /** problems with the presets against the registered controls: [{ preset, id, problem }] */
    checkPresets() {
      const out = [];
      for (const p of api.presets) {
        for (const [id, v] of Object.entries(p.values)) {
          const it = reg.get(id);
          if (!it) out.push({ preset: p.name, id, problem: 'no such control' });
          else if (!VALUE_KINDS.has(it.kind) || fit(it, v) === null) out.push({ preset: p.name, id, problem: 'not a value this control takes' });
          else if (it.kind === 'num' && (v < it.min - 1e-9 || v > it.max + 1e-9)) out.push({ preset: p.name, id, problem: `out of range (${it.min}..${it.max})` });
        }
      }
      return out;
    },

    // ---- the short list: the same controls under plain words, a handful per group. The panel opens on it.
    /** list: [[groupName, [[plainLabel, id, hint?], ...]], ...] */
    setEssentials(list) { api.essentials = list; notify(); },
    missingEssentials() { return api.essentials.flatMap(([, rows]) => rows.map((r) => r[1])).filter((id) => !reg.has(id)); },

    // ---- the panel's own preferences (folded groups, view, open), kept with the values
    ui: (k, d) => (k in store.ui ? store.ui[k] : d),
    setUi(k, v) { store.ui[k] = v; save(); },
  };

  function put(it, v) {
    if (!VALUE_KINDS.has(it.kind)) return false;
    const f = fit(it, v);
    if (f === null) return false;
    it.set(f);
    try { it.onChange?.(f); } catch (e) { console.error(`tuning: onChange of "${it.id}" failed`, e); }
    return true;
  }
  function record(it) {
    if (!kept(it)) return;
    if (!same(it.kind, it.get(), it.def)) store.v[it.id] = { v: it.get(), base: it.def };
    else delete store.v[it.id];
  }

  return api;
}
