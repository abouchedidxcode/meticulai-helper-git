# Tuning panel: how to use it

A side panel of live controls for whoever is tuning the game by playing it. Every number worth turning (speeds,
gravity, hit-stop, camera, colours, switches) gets a slider, a box to type in and the game's own value beside it.
The person playing changes what feels wrong, then hands the result back to the agent in one click: **Save for my
agent** writes it into `src/tuning.json`, or **Copy changes** gives a short text to paste into the chat.

It is a drop-in upgrade for the kit starter's own panel: same `src/tuning.json`, same `tune.group.id` reads, same
`POST /__helper/tuning` save. On top it adds: A/B/C compare slots, search, presets with descriptions, a plain-words
short list, reset per value / per group / all, a "Changed" group, a gold mark and a tick at the default on every
changed value, values kept across reloads, paste back, freeze and frame step, and a small tab that says
"Tuning . 3 changed" so a forgotten change can't hide.

Renderer: none (plain DOM, works with any renderer or none). npm deps: none (`three` and `vite` only for the demo).

**Games made from the kit starter already have all of this built in**, and more: since 2026-11-14 the starter's dev
menu (`starter/src/core/dev/`, backquote or F2) is this registry and panel plus game-wide tools (fps and frame cost,
freeze and step, speed 1/8x to 4x, a free camera, No HUD, screenshot, copy view, restart, the computer playing, skip
buttons), the palette and vibe chooser, and sound. Don't add this block to such a game. This block is for games that
were NOT made from the starter (see "Using it without the starter"), and for older starter games, below.

## Files

- `src/tuning.js`: the registry (no DOM, no imports): controls, defaults, storage, slots, presets, copy and paste.
- `src/panel.js`: the panel (plain DOM, its CSS is a string inside, no imports).
- `src/starter.js`: the adapter for the kit starter's `src/core/settings.js`.
- `src/index.js`: exports all three. `demo/`: a bouncing ball and a ring of pillars on the panel. `test/`: 22 tests.

## Drop it into an older starter game (made before 2026-11-14)

A game made from today's starter already has the full dev menu: skip this section. For an older one:


1. `node tools/blocks/add.mjs meticulai-tuning-panel` (copies the block to `my-game/vendor/meticulai-tuning-panel/`).
2. Replace the whole of `my-game/src/core/settings.js` with:

   ```js
   // Tunable numbers and the dev panel: the meticulai-tuning-panel block (vendor/meticulai-tuning-panel/HOW-TO-USE.md).
   // Same src/tuning.json, same exports, same "Save for my agent".
   import tuningFile from '../tuning.json';
   import { createStarterSettings } from '../../vendor/meticulai-tuning-panel/src/starter.js';

   export const { tune, define, set, changedValues, installSettingsPanel, tuning } =
     createStarterSettings(tuningFile, { storageKey: 'my-game.tuning' });
   ```

   Use the game's own name in `storageKey` (two games on one site must not share it).
3. Nothing else changes. `main.js` still calls `installSettingsPanel({ enabled: DEV || flags.test, canSave: DEV })`;
   game files still read `tune.player.runSpeed` and call `define(...)`. The old panel's `.dev-panel` / `.dev-row`
   rules in `src/ui/ui.css` are no longer used; delete them or leave them.
4. Check: `node tools/serve.mjs --check`, open the game, press the backquote key.

This exact swap was tested on a copy of the starter (2026-11-14): `vite build` passes; headless, the panel opens on
backquote with a row for all 26 values, a slider changes `tune.player.runSpeed` while the game keeps running, the
old cheat key's direct write to `tune` shows as changed, keys typed into the search box don't reach the game (Escape
did not pause it), "Save for my agent" POSTs `{ values }` and rewrites `src/tuning.json` in the same format with
only the changed value different, the page is not reloaded, and nothing shows as changed after saving.

Options for `createStarterSettings(tuningFile, opts)`:

```js
{
  storageKey: 'my-game.tuning',
  presets: [{ name: 'Floaty', about: 'Low gravity, long hang time.', values: { 'player.gravity': 14, 'player.fallGravity': 1.2 } }],
  essentials: [['The jump', [['How high', 'player.jumpSpeed', 'Upward speed at take-off.'], ['How heavy', 'player.gravity']]]],
  saveUrl: '/__helper/tuning',
  panel: { title: 'Tuning', copyNote: () => `level ${level}` },   // any createPanel option
}
```

It returns `{ tune, define, set, changedValues, fileWithCurrentValues, saveForAgent, installSettingsPanel, tuning }`.
`tuning` is the registry: add controls that are not in the file (`tuning.button('Debug', 'Skip to boss', fn)`,
`tuning.readout('Debug', 'Speed', () => player.speed.toFixed(1))`). Those show in the panel and in Copy changes but
are not written into `tuning.json` (only `define()`d and file values are).

`tuning.json` stays in the starter's format. Two extras the new panel understands: `"options": ["day", "dusk"]` makes
a choice, and a `"#rrggbb"` string value makes a colour picker. (The old panel can't draw these, so only use them
after the swap.) Control ids are `"<group>.<id>"`, e.g. `player.runSpeed`, the same keys the old Copy used.

## Using it without the starter

```js
import { createTuning, createPanel } from './vendor/meticulai-tuning-panel/src/index.js';
const tuning = createTuning({ storageKey: 'my-game.tuning' });
tuning.num('Player', 'Run speed', P, 'runSpeed', 2, 14, 0.1);          // id 'player.runSpeed'; P.runSpeed is read and written
tuning.bool('Feel', 'Invincible', cheats, 'invincible', { save: false });
tuning.pick('Look', 'Light', look, 'mood', ['day', 'dusk', ['night', 'Night']]);
tuning.color('Look', 'Fog colour', scene.fog, 'color');                 // a THREE.Color is edited in place
tuning.button('Debug', 'Respawn', () => player.respawn());
tuning.readout('Debug', 'Speed', () => player.speed.toFixed(1));
tuning.group('Camera').num('Distance', cam, 'dist', 4, 20, 0.1).num('Height', cam, 'h', 1, 12, 0.1);   // chained
createPanel(tuning, { title: 'Tuning', canSave: false });
```

Each shorthand takes a last options object: `{ id, hint, save: false, onChange(v) }`. The general form is
`tuning.add({ id, kind, group, label, hint, min, max, step, options, get, set, def, save, onChange, run, read })`.
Freeze and Step call `window.__game.pause() / resume() / step(1)` (the kit's test hooks); pass
`hooks: () => ({ pause, resume, step })` to `createPanel` for anything else.

Registry API (for tests and tools): `get(id)`, `set(id, v)`, `changed(id)`, `reset(id)`, `resetGroup(group)`,
`resetAll()`, `changes()` (flat `{ id: value }`), `copyText()`, `apply(diff, replace)`, `saveSlot/loadSlot/activeSlot`,
`addPresets/applyPreset/activePreset/checkPresets()`, `setEssentials/missingEssentials()`, `rebase(ids)`, `onChange(fn)`.
`checkPresets()` lists preset keys that no longer match a control (after a rename): run it in a test.

## The controls

| Key | What it does |
|---|---|
| `` ` `` (backquote) or F2 | open / close (always) |
| `\` | freeze the game clock; the picture keeps drawing (panel open, or frozen) |
| `.` | one frame forward (freezes first) |
| 1 2 3 | load slot A B C (panel open) |
| `/` | jump to the search box (panel open) |
| double-click a row, click its gold mark, or click the gold value on the right | put that value back |

URL switches: `?tune=open` opens it at once, `?tune=0` ignores values kept from earlier visits.

**Copy changes** gives this (one header line, then compact JSON), ready to paste into the chat:

```
// Tuning 2026-11-14 10:00: 2 values changed from the game's defaults (id: value)
{"player.runSpeed":8.2,"feel.hitStopMs":90}
```

**Paste** takes that text back, or a whole `tuning.json`, or `{ "tune": { ... } }` (Replace, or Apply on top).

## The numbers that matter

None of the panel's numbers change how a game feels: it only shows the game's own. Its behaviour, kept from the
games it came from:

- Typed values may go past the slider's ends (they turn red); slider values are rounded to the step.
- The Changed group only re-sorts when the pointer is off the list, so nothing jumps under the hand that is tuning.
- While a slider is dragged the panel fades to 12% after 180 ms, so the picture is judged, not the panel.
- Closed, rows are not built and it looks at values once a second (for the tab); open, three times a second.
- Values are kept in `localStorage` as a diff, with the default each was changed from. If the agent has since made a
  new default for that value, the old change is dropped instead of silently overriding the new default.

## What made it good in TUMEN, Hezarfen, Inkbound, Scrapfall and Still Life 2

- **Hezarfen** (live): the maker asked for "a side panel" to "toggle all sorts of things on the fly", tuned the
  camera in it, and pasted Copy changes back with "make this the default settings". Those values are the game's
  defaults today. Freeze is separate from pause: pause is the player's, freeze is the developer's (nothing on top).
- **TUMEN**: the maker sent 75, then 52 more of their panel settings to become the defaults; asked for seven presets
  with a short description each; and when the full list was "a bit too granular and hard to comprehend", a short list
  of the controls that matter, in plain words, with everything one click away, fixed it. The game's notes say the maker
  liked the panel in the previous game and tunes by hand with it.
- **Scrapfall** (live): about a dozen builder agents registered 378 settings from their own files, one line each,
  without touching the panel. The "DEV n" tab meant a forgotten god mode could not hide.
- **Inkbound**: A/B/C slots to flip between two feels; Copy as a header line plus compact JSON; paste back.
- **Still Life 2** (live): one table of every number with presets and copy / paste. Its maker had not pasted values
  back yet when this was extracted.

The lesson across all five: the hand-back. A person plays, turns what feels wrong, and the agent gets exact numbers,
not "make it a bit floatier".

## Gotchas

- Ids are the contract. Renaming a control id (or a key in `tuning.json`) loses kept values and breaks presets and
  essentials. `tuning.checkPresets()` and `tuning.missingEssentials()` list what no longer fits.
- Game code must read the value every time (`tune.player.runSpeed` inside update), never copy it once at start.
- Register after the thing exists and before anything changes it: the default is what `get()` returns at that moment.
- Slots hold diffs from the defaults at the time. After Save for my agent (new defaults), old slots still apply their
  values, but on top of the new defaults.
- The panel is on in the dev server and `?test=1` pages only (the starter's `main.js` decides, not the block). If you
  ever turn it on for players, its single keys only act while it is open or frozen, so nobody freezes the game by
  accident, but Save is hidden there anyway (no dev server).
- Values kept in this browser come back on reload. When the game behaves oddly, look for the "Tuning . n changed"
  tab on the right edge, or load with `?tune=0`.
- Keys typed into the panel's boxes are stopped at the panel. Games that listen on `document` in the capture phase
  would still see them; the starter listens on `window` (bubble), which is fine.

## Restyle it

All colours are CSS variables at the top of `CSS` in `src/panel.js` (`--gold` is the accent, `--bg` the panel);
width is `.mtp { width: 400px }`. Text in the panel is plain English in `panel.js`.

## Run the demo alone

`cd blocks/vendor/meticulai-tuning-panel && npm install && npm run dev` (http://127.0.0.1:5417). `npm test` runs the
22 tests. In the demo, Save for my agent writes `demo/tuning.json`.

## Credit

Meticulai, MIT. No third-party code.
