# Ink illustration: where this block came from

From Pop Quiz by Meticulai (meticulai.com). Extracted 2026-11-14 from the game's source at `8849adcf3` (clean: no
uncommitted changes in the game's folder).

| | |
|---|---|
| Game | Pop Quiz, https://meticulai.com/games/pop-quiz/ |
| Source files | `src/renderer.js` (the ink pass), `src/palette.js` (chapter palette blending), `src/world.js` (the `toon()` material and its 3-step ramp) |
| Code licence | MIT (see `LICENSE`) |
| Art | none: the block and its demo are fully procedural |
| Renderer | webgl2, three 0.187 |

## What changed

- `createRenderer(canvas)` became `createInkPost(renderer, options)`: it uses the game's own renderer instead of
  making one, reads the size from the renderer instead of the window, and restores the clear colour, render target,
  camera layers and shadow auto-update it touches.
- Every number in the shader is now an option with the game's value as the default (`INK_DEFAULTS`): line wobble,
  boil rate and step, edge ranges, pen pressure, hatch level/spacing/strengths, paper, grain, vignette, hurt colour,
  distance fade (90/520/0.7). The shader maths is unchanged.
- The sky cutoff (hard-coded 1300 with `camera.far` 2000) is `skyDepth`; by default 0.65 x `camera.far`, which is
  1300 in the game's setup. The game's `near`/`far` uniform defaults (0.05/2000) are read from the camera every frame.
- The renderer no longer reads the game's global `palette` object; ink, paper and hatch level are uniforms the caller sets.
- `palette.js` was rewritten as `palette-blend.js`: pure JavaScript (no three), any keys, colours blended in linear
  space like the original (`THREE.Color.lerp` on linear colours), same smoothstep easing, same "start from the live
  values" behaviour. The game's five chapter tables (with names and titles) were replaced by three example palettes
  for the test scene; their ink, hatch and light colours are the game's noon, dusk and night values.
- The `toon()` helper from `world.js` became `inkToon()` / `toonRamp()` in `toon.js` (same 70/150/255 ramp).
  `flatShading` is not passed: MeshToonMaterial no longer has it in three 0.187.
- Left out: the game's world, sky shader, answer colours, particle effects and the gameplay that drives hurt/flash/desat
  (the decay rates, 0.9 and 1.4 per second, are in the demo and the docs).
- Added: the demo on the shared Meticulai looks test scene, and tests for the palette maths.

## Checked

On 2026-11-14: built with vite 8.3.8 and three 0.187.0, opened headless (Chromium, Metal), no errors or warnings in
the console; screenshots of the day, dusk and night palettes and of a live blend. `node --test test/` passes.
The preview `blocks/previews/meticulai-ink-illustration.jpg` is the dusk palette.
