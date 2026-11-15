// What ../settings.js is made of: the game's tunable numbers (`tune`), and `dev`, the small API a game uses to put
// its own buttons and readouts in the dev menu. No DOM here, so Node tests can run it (see the kit's
// tools/starters/dev-menu.test.mjs). The menu itself (menu.js and the files it imports) is only loaded when it is on.
//
// tuning.json:  { "<group>": { "<id>": { "value": 6.5, "min": 2, "max": 14, "step": 0.1, "label": "Run speed",
//                                        "help": "Shown when you hover the row." } } }
//   true/false values are switches; "options": ["a", "b"] makes a choice; a "#rrggbb" value makes a colour.
// Control ids are "<group>.<id>" (e.g. "player.runSpeed"): the keys of presets, essentials and "Copy changes".

import { createTuning, slug } from './tuning.js';

export { slug };

const title = (s) => String(s).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

/**
 * @param {Record<string, Record<string, {value:any, min?:number, max?:number, step?:number, label?:string, help?:string, options?:any[]}>>} tuningFile
 * @param {object} [opts]
 * @param {string} [opts.storageKey]   localStorage key, one per game
 * @param {Storage|null} [opts.storage] default localStorage (tests pass a fake; null keeps nothing)
 * @param {boolean} [opts.devMode]     false = a shipped game for players: no menu, nothing kept, `dev` calls do nothing
 * @param {boolean} [opts.forced]      the address asked for the menu (?dev=1): show it even where main.js would not
 * @param {string} [opts.gameName]
 * @param {string} [opts.saveUrl]      default '/__helper/tuning'
 * @param {() => Promise<{installMenu: Function}>} [opts.loadMenu]  default: import('./menu.js')
 */
export function createStarterSettings(tuningFile, opts = {}) {
  const { storageKey = 'my-game.tuning', devMode = true, forced = false, gameName = 'My Game', saveUrl = '/__helper/tuning', loadMenu = () => import('./menu.js') } = opts;
  const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  // Values changed in the menu are kept in this browser, for the maker only. Players of a shipped game keep nothing.
  const storage = !devMode ? null : opts.storage;
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
      file: true,
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
        max: def.max ?? Math.max(1, def.value * 2),
        step: def.step ?? 0.01,
      });
    }
  }
  for (const [group, items] of Object.entries(defs)) for (const [id, def] of Object.entries(items)) register(group, id, def);

  /** Add one from code without touching the JSON (it is written into tuning.json on the next save). */
  function define(group, id, def) {
    defs[group] ??= {};
    if (!(id in defs[group])) {
      defs[group][id] = { ...def };
      register(group, id, def);
    }
    return tune[group][id];
  }

  /** Set a value from code (the menu shows it; it is not kept across reloads, only the maker's own changes are). */
  function set(group, id, value) {
    tune[group] ??= {};
    tune[group][id] = value;
    menu?.refresh();
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

  // ---------------------------------------------------------------- dev: the game's own things in the menu ----
  // Every call is safe in a shipped game: with the menu off they do nothing at all.
  let menu = null; // the loaded menu (menu.js), once it is there
  let wanted = null; // installSettingsPanel() was called: its options
  const extra = (o) => (typeof o === 'string' ? { hint: o } : o || {});
  const own = (def, o) => { if (devMode) tuning.add({ save: false, dev: true, ...def, ...extra(o) }); };
  const dev = {
    /** true when the menu can be opened on this page */
    on: devMode,
    /** A button: dev.button('Cheats', 'Give 10 coins', () => { coins += 10; }, 'What it does, in plain words') */
    button(group, label, run, o) { own({ kind: 'button', group, label, run, id: `${slug(group)}.${slug(label)}` }, o); },
    /** A switch: dev.toggle('Cheats', 'Walk through walls', () => noclip, (on) => { noclip = on; }) */
    toggle(group, label, get, set, o) { own({ kind: 'bool', group, label, get: () => !!get(), set: (v) => set(!!v), id: `${slug(group)}.${slug(label)}` }, o); },
    /** A live line of text: dev.readout('Player', 'Speed', () => speed.toFixed(1) + ' m/s') */
    readout(group, label, read, o) { own({ kind: 'readout', group, label, read, id: `${slug(group)}.${slug(label)}` }, o); },
    /** A choice: dev.pick('World', 'Level', ['1', '2', ['boss', 'The boss']], () => level, (v) => loadLevel(v)) */
    pick(group, label, options, get, set, o) { own({ kind: 'pick', group, label, options, get, set, id: `${slug(group)}.${slug(label)}` }, o); },
    /** A slider for a number that is not in tuning.json: dev.slider('World', 'Time of day', () => hour, (v) => { hour = v; }, { min: 0, max: 24, step: 0.5 }) */
    slider(group, label, get, set, o = {}) { own({ kind: 'num', group, label, get, set, min: o.min ?? 0, max: o.max ?? 1, step: o.step ?? 0.01, id: `${slug(group)}.${slug(label)}` }, o); },
    /** The short plain-words list the menu opens on: [['The jump', [['How high', 'player.jumpSpeed', 'hint'], ...]], ...] */
    essentials(list) { if (devMode && Array.isArray(list)) tuning.setEssentials([...tuning.essentials, ...list]); },
    /** Whole feels to flip between: [{ name: 'Floaty', about: 'One sentence.', values: { 'player.gravity': 14 } }] */
    presets(list) { if (devMode && Array.isArray(list)) tuning.addPresets([...tuning.presets, ...list]); },

    // ---- used by main.js ----
    /** Once per drawn frame: counts frames, and gives back the camera to draw with (the free camera while it is on). */
    view(camera) { return menu ? menu.tools.view(camera) : camera; },
    /** The menu or the free camera is using the mouse: a mouse-look game must not pause because it lost it. */
    holdsMouse() { return !!menu && menu.holdsMouse(); },

    // ---- for tests and tools (window.__game.dev) ----
    /** resolves when the menu's code is loaded (or at once with null when the menu is off) */
    ready: Promise.resolve(null),
    open() { menu?.setOpen(true); },
    close() { menu?.setOpen(false); },
    state() { return menu ? menu.state() : { on: devMode && !!wanted, loaded: false, open: false }; },
    get menu() { return menu; },
    tuning,
  };

  /**
   * Called once by main.js. enabled: show the menu at all. canSave: the dev server is there to receive saves.
   * game: what the menu's game-wide tools work on (all optional): { name, loop, view, input, audio, testmode, notes,
   * flags, getGame, getMode, restart }.
   */
  function installSettingsPanel({ enabled = true, canSave = false, game = {} } = {}) {
    if (!devMode || !(enabled || forced) || wanted) return null;
    wanted = { canSave, game };
    dev.ready = loadMenu()
      .then((m) => {
        menu = m.installMenu({ tuning, tune, canSave, save, game: { name: gameName, ...game }, params });
        return menu;
      })
      .catch((err) => { console.warn('The dev menu could not load (the game itself is fine):', err); return null; });
    return dev;
  }

  return { tune, define, set, changedValues, fileWithCurrentValues, saveForAgent: save, installSettingsPanel, tuning, dev };
}
