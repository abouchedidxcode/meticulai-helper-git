// A drop-in for the kit starter's src/core/settings.js: the same exports, the same src/tuning.json format, the same
// "Save for my agent" endpoint (POST /__helper/tuning { values }), with the bigger panel (panel.js) on top.
//
// my-game/src/core/settings.js becomes:
//
//   import tuningFile from '../tuning.json';
//   import { createStarterSettings } from '../../vendor/meticulai-tuning-panel/src/starter.js';
//   export const { tune, define, set, changedValues, installSettingsPanel, tuning } =
//     createStarterSettings(tuningFile, { storageKey: 'my-game.tuning' });
//
// main.js and every game file stay as they are: they read tune.player.runSpeed, call define(...) and
// installSettingsPanel({ enabled, canSave }) exactly as before.
//
// tuning.json:  { "<group>": { "<id>": { "value": 6.5, "min": 2, "max": 14, "step": 0.1, "label": "Run speed",
//                                        "help": "Shown when you hover the row." } } }
//   true/false values are switches. Two optional extras the old panel did not know (it ignores neither, so the file
//   stays readable by both): "options": ["a", "b"] makes a choice, and a "#rrggbb" string value makes a colour.
// Control ids are "<group>.<id>" (e.g. "player.runSpeed"), the same keys the old "Copy" used.

import { createTuning } from './tuning.js';
import { createPanel } from './panel.js';

const title = (s) => String(s).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

/**
 * @param {Record<string, Record<string, {value:any, min?:number, max?:number, step?:number, label?:string, help?:string, options?:any[]}>>} tuningFile
 * @param {object} [opts]
 * @param {string} [opts.storageKey]  localStorage key, one per game
 * @param {Storage|null} [opts.storage] default localStorage (tests pass a fake)
 * @param {Array} [opts.presets]       [{ name, about, values: { "player.runSpeed": 8 } }]
 * @param {Array} [opts.essentials]    [["The run", [["How fast you run", "player.runSpeed", "hint"], ...]], ...]
 * @param {string} [opts.saveUrl]      default '/__helper/tuning'
 * @param {object} [opts.panel]        extra createPanel options (title, keys, copyNote, ...)
 */
export function createStarterSettings(tuningFile, opts = {}) {
  const { storageKey = 'my-game.tuning', storage, presets, essentials, saveUrl = '/__helper/tuning', panel: panelOpts = {} } = opts;
  const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const tuning = createTuning({ storageKey, useStored: params.get('tune') !== '0', ...(storage !== undefined ? { storage } : {}) });
  const defs = structuredClone(tuningFile); // group -> id -> { value, min, max, ... }
  const tune = {}; // group -> id -> current value (what the game reads)

  function register(group, id, def) {
    tune[group] ??= {};
    tune[group][id] = def.value;
    const base = {
      id: `${group}.${id}`,
      group: title(group),
      label: def.label ?? title(id),
      hint: def.help,
      def: def.value,
      get: () => tune[group][id],
      set: (v) => { tune[group][id] = v; },
    };
    if (typeof def.value === 'boolean') tuning.add({ ...base, kind: 'bool' });
    else if (Array.isArray(def.options)) tuning.add({ ...base, kind: 'pick', options: def.options });
    else if (typeof def.value === 'string' && /^#[0-9a-f]{3,6}$/i.test(def.value)) tuning.add({ ...base, kind: 'color' });
    else {
      tuning.add({
        ...base, kind: 'num',
        min: def.min ?? 0,
        max: def.max ?? Math.max(1, def.value * 2), // the same fallbacks as the starter's own panel
        step: def.step ?? 0.01,
      });
    }
  }
  for (const [group, items] of Object.entries(defs)) for (const [id, def] of Object.entries(items)) register(group, id, def);
  if (presets) tuning.addPresets(presets);
  if (essentials) tuning.setEssentials(essentials);

  /** Add one from code without touching the JSON (it is written into tuning.json on the next save). */
  function define(group, id, def) {
    defs[group] ??= {};
    if (!(id in defs[group])) {
      defs[group][id] = { ...def };
      register(group, id, def);
    }
    return tune[group][id];
  }

  /** Set a value from code (the panel shows it). */
  function set(group, id, value) {
    if (!tuning.set(`${group}.${id}`, value)) {
      tune[group] ??= {};
      tune[group][id] = value;
    }
  }

  /** Values that differ from the file, flat: { "player.runSpeed": 8 } */
  const changedValues = () => tuning.changes();

  /** The full file contents with the current values (what "Save for my agent" writes). */
  function fileWithCurrentValues() {
    const out = structuredClone(defs);
    for (const [group, items] of Object.entries(out)) for (const id of Object.keys(items)) items[id].value = tune[group][id];
    return out;
  }

  async function save() {
    const res = await fetch(saveUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ values: fileWithCurrentValues() }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ids = [];
    for (const [group, items] of Object.entries(defs)) for (const [id, d] of Object.entries(items)) { d.value = tune[group][id]; ids.push(`${group}.${id}`); }
    tuning.rebase(ids); // what was saved is now the default: it no longer shows as changed
    return 'Saved to src/tuning.json. Your agent will see it.';
  }

  let panel = null;
  /** enabled: show the panel at all. canSave: the dev server is there to receive "Save for my agent". */
  function installSettingsPanel({ enabled = true, canSave = false } = {}) {
    if (!enabled) return null;
    if (panel) return panel;
    panel = createPanel(tuning, { title: 'Tuning', canSave, save, ...panelOpts });
    return panel;
  }

  return { tune, define, set, changedValues, fileWithCurrentValues, saveForAgent: save, installSettingsPanel, tuning };
}
