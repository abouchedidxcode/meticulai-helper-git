# Tilt-shift macro: where this block came from

From **Lost Marbles** by Meticulai (meticulai.com, https://meticulai.com/games/lost-marbles/). Extracted 2026-11-14
from the game's source at `8849adcf3` (clean: no uncommitted changes in the files used).

| | |
|---|---|
| Source files | `public/js/render/scene.js` (the lens pipeline, presets, dynamic resolution); `public/js/game.js` (the tilt band per kind of shot, `updateTiltShift`); `public/js/main.js` (the Off / On / Strong setting) |
| Code licence | MIT (see `LICENSE`) |
| Art | none (the demo is procedural) |
| Renderer | webgl2, three 0.187 |

## What changed

- Split out of the game's `Scene3D` class: the game's camera, window sun, texel-snapped shadow follow, marble
  showroom override and room photograph are gone. The lens now takes your `renderer`, `scene`, `camera` and an
  optional `sun`. `resize()` from the window became `setSize(w, h)`, and the camera's aspect is left to you.
- Every number is kept exactly and exposed as an option (`LENS_DEFAULTS` in `src/quality.js`): the shader's grade
  constants (white balance, saturation, S-curve) became uniforms with the same values. The night grade is the same
  shader variant, renamed from the game's mode to `setNight()`.
- The dynamic-resolution logic (`trackPerf`) moved into a pure `createPerfGovernor()` (same thresholds, timings and
  steps) so it can be tested in node; the lens applies its answers. It no longer runs while frozen.
- The game's per-shot band calls became the `TILT_SHOTS` table and `focusOn()`; `setTiltShift`,
  `setFocusDistance`, `warmUp`, `setFrozen`, `setFrameBudget` and the previous-frame texture keep their behaviour.
- `flash` became a method; the game's `?q=`, `?tilt=` flags moved to the demo.
- Added: `createLensRenderer()`, `settle()`, `dispose()`, a test file, the demo on the shared Meticulai looks test
  scene (toy lacquer materials and a procedural `RoomEnvironment` for reflections instead of the game's photograph).
- Not included: Last Drop's camera motion blur (depth reprojection, player mask), which builds on this pipeline; it
  needs per-game masks and was left out to keep the block small.

## Credits

- Single-pass gather bokeh: technique after Dennis Gustafsson (reimplemented from his description, no code copied).
- `hash12`: Dave Hoskins, "Hash without Sine" (MIT). Interleaved gradient noise: Jorge Jimenez's published formula.
- `GTAOPass`, `UnrealBloomPass`, `FullScreenQuad`, `RoomEnvironment`: three.js addons (MIT), imported from `three`.

## Checked

2026-11-14: `npm test` (11 tests pass). Built with vite 8.3.8 against three 0.187.0 and opened headless in Chromium
(Metal): high, medium (diorama mode) and low presets drew without errors or warnings. Preview:
`blocks/previews/meticulai-tilt-shift-macro.jpg` (`?shot=1&tilt=strong`).
