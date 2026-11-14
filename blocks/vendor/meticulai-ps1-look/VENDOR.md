# PS1 look: where this copy came from

From **Don't Blink** by Meticulai (meticulai.com, play it at https://meticulai.com/games/dont-blink/).
Extracted 2026-11-14 from the game's source at `8849adcf3` (clean: no uncommitted changes in the files used).

| | |
|---|---|
| Source files | `src/render/ps1Material.ts`, `src/render/pipeline.ts`, `src/dev/render-test.ts`, numbers from `src/config.ts` (`render`, `fog`, `lighting`, `flashlight`) |
| Licence | MIT (see `LICENSE`, which also credits Dave Hoskins' hash) |
| Renderer | WebGL2 (`WebGLRenderer`, `onBeforeCompile`) |
| Checked on | three 0.187.0, vite 8.3.8, headless Chromium (Metal), 2026-11-14 |

## What changed

- TypeScript to plain JavaScript with JSDoc types. The game's `CONFIG` object became `PS1_DEFAULTS` /
  `ATMOSPHERE_DEFAULTS` (every number kept exactly) and constructor options.
- The timing logic (blackout, afterimage, eyelids, fade-in, vignette pulse, punch, shake) moved out of the
  renderer class into `src/ps1-state.js`, with no three.js import, so it can be unit-tested. Behaviour unchanged.
- The post shader's hard-coded grade, dread, flash and afterimage numbers became uniforms with the same default
  values (`grade`, `dread`, `fx` options), so a game can turn the green-sepia horror grade off (`NEUTRAL_GRADE`).
- `PS1Pipeline` can now use an existing renderer (the kit's starter) instead of always creating its own, keeps
  that renderer's clear colour and autoClear, and has an optional non-letterboxed mode (`letterbox: false`).
- New `patchPS1Material(material)` turns any built-in material into a PS1 one (the game only made Lambert ones).
- The game's 21 hand-painted procedural textures (`textures.ts`) were not copied. `src/texels.js` is a new,
  much smaller set of eight 32 x 32 patterns written for this block.
- Left out: webcam eye tracking, the monster, audio, and the game's flashlight flicker/stutter logic (the demo
  has a two-line flicker; the flashlight numbers are in `GAME_NOTES`).
- The demo uses the shared Meticulai looks test scene instead of the game's test room.
