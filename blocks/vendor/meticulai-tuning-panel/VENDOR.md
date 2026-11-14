# Tuning panel: where this came from

From TUMEN, Hezarfen, Inkbound, Scrapfall and Still Life 2 by Meticulai (meticulai.com). Extracted 2026-11-14 from
each game's source:

| Game | Commit | State | Files read |
|---|---|---|---|
| TUMEN (unreleased) | `877d87cb2` | clean | `public/js/core/tune.js`, `public/js/ui/dev.js`, `public/js/core/presets.js`, `public/js/core/essentials.js`, `tools/presetcheck.mjs` |
| Hezarfen (live) | `4a08f9939` | clean | `public/js/ui/dev.js`, `public/css/dev.css` |
| Inkbound (unreleased) | `44387accb` | panel files clean; the game's own dial list `src/dev/dials.ts` had uncommitted changes and was not used | `src/dev/knobs.ts`, `src/dev/panel.ts`, `src/dev/panel.css` |
| Scrapfall (live) | `2ef3c12aa` | clean | `src/gravity/dev-panel.js`, `DEV-PANEL.md` |
| Still Life 2 (live) | `8849adcf3` | clean | `src/tuning.js`, `src/devmenu.js` |

## What changed

One block written fresh from the best parts of the five, in plain JavaScript (Inkbound's TypeScript converted):

- Registry (`src/tuning.js`): Inkbound's shape (stable ids, default captured at registration, diff-only storage,
  values re-applied when a late control registers, A/B/C slots, header line + compact JSON copy, paste that finds the
  JSON in any text, `save: false`), TUMEN's shorthands (`num`, `bool`, `pick`, `color` on an object key, THREE.Color
  edited in place), presets that reset first so they never pile up, the short "essentials" list, and its
  `presetcheck` as `checkPresets()`. Scrapfall's chained `group(...)` calls, buttons and live readouts.
- Panel (`src/panel.js`): TUMEN's rows (gold changed mark, tick at the default on the track, double-click to reset,
  typed values may pass the slider's ends, a "Changed" group on top that doesn't move under the pointer, the panel
  fading while a slider is dragged, rows built only on first open, search across everything); Scrapfall's
  zero-import panel with CSS in a string, the game's own value on the right (click to reset), group resets and the
  "n changed" tab; Inkbound's slots bar and keys 1 2 3, "Sure?" on Reset all, keys typed in fields kept from the
  game; Hezarfen's single keys acting only while the panel is open (or frozen); Still Life 2's preset highlighted
  when the values match it, and paste with Apply.
- New here: the starter adapter (`src/starter.js`: same `tuning.json`, exports and save endpoint), kept values that
  remember the default they were changed from (dropped if the game's default has changed since), paste accepting a
  whole `tuning.json`, Save making the saved values the new defaults, colour and choice entries in `tuning.json`.
- Left out, because they need hooks into one game's camera, HUD or rules: the free camera, view cycling, hide HUD,
  time-scale buttons, "computer plays", the FPS line in the header (use a readout), resizing the panel by dragging,
  Still Life 2's cheats and spawn/teleport tools, TUMEN's HDR-colour brightness keeping, splitting big sections by
  label prefix, sub-sections inside a group, pause-while-open (Freeze does it), and every game's own list of controls.
- Names of the agent tool in button labels became "your agent" / "my agent".

## Checked

On 2026-11-14 in a temporary folder: `npm install`, `npm run build`, `npm test` (22 pass). Headless Chromium on the
demo: opens on backquote, slider and typed values reach the game, changed rows and the Changed group, search
(keys did not leak to the game), slots and key 1, freeze and one-frame step via `window.__game`, Copy changes text,
presets, per-value reset, the "n changed" tab, values kept across a reload, no page errors. The starter swap was
tested on a copy of the kit's starter (see HOW-TO-USE.md). Preview: `blocks/previews/meticulai-tuning-panel.jpg`.
