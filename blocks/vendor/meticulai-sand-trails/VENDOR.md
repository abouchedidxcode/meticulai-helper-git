# Sand trails: where this copy came from

From Last Drop by Meticulai (meticulai.com). Extracted 2026-11-14 from the game's source at `8849adcf3` (clean: the
files below had no uncommitted changes). Last Drop is live at https://meticulai.com/games/last-drop/.

| | |
|---|---|
| Made by | Meticulai |
| Source files (in the game folder) | `public/js/render/sand.js`, `public/js/render/wet.js`, the sand part of `public/js/render/terrain.js` (shading), the calls in `public/js/main.js` |
| Copied on | 2026-11-14 |
| Code licence | MIT (see `LICENSE`) |
| Art licence | none (no art files) |
| Renderer | webgl2 |

## What changed

- `sand.js` -> `src/sand-map.js`, `wet.js` -> `src/wet-map.js`. Both shaders are unchanged. The JS is the same
  logic with the numbers moved into `SAND_DEFAULTS` / `WET_DEFAULTS` (same values) so they can be tuned; the sand
  map now configures itself at the game's desktop setting (512 texels over 12 m) when made; both gained `dispose()`.
- New `src/sand-material.js` (`applySandTrails`): the part of the game's terrain shader that read these maps
  (normal tilt from the trail's slope, the groove's self-shadow in a low sun, wet darkening, damp and film
  roughness), as an `onBeforeCompile` patch for any `MeshStandardMaterial`. The game's terrain also used the groove
  depth as parallax for its own grain and ripple textures and wiped its wind ripples inside the trail; those
  belonged to its terrain and are left out (HOW-TO-USE.md says how to add them back).
- Comments: "the drop" became "the body" where it describes the API.
- Left out: the game's quality presets and phone overrides (the values are in HOW-TO-USE.md), its puddles,
  particles, drop shader and terrain.
- The demo (a rolling ball on flat procedural sand) is new.

## Checked

On 2026-11-14: 9 tests pass (`npm test`, on a fake renderer: scrolling, groove, crater, decays, material patch).
Built with `npm run build` and opened the demo in headless Chromium (Metal): it drew without errors. The picture is
`blocks/previews/meticulai-sand-trails.jpg` (the high camera, a second after a hop).
