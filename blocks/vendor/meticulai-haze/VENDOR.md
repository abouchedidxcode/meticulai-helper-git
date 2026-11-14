# Haze: where this came from

From **Hezarfen** by Meticulai (meticulai.com/games/hezarfen/, a dawn glide over Istanbul). Extracted 2026-11-14 from
the game's source at `4a08f9939` (clean: no uncommitted changes in the files used).

| | |
|---|---|
| Source files (in the game folder) | `public/js/render/atmosphere.js`, `public/js/render/post.js`, `public/js/world/layout.js` (sun angles), `tools/palette.py` (idea only) |
| Code licence | MIT (see `LICENSE`) |
| Art | none: the block ships no images |
| Renderer | webgl2, three 0.187.0 (the game used 0.186.1) |

## What changed

- **Kept exactly:** the haze GLSL (fog chunks, layers, banks, sun tint, cloud shadows, firefly clamp), the shared
  `vec4 hzP[4]` uniform trick, every `LOOK` number (now `DAWN` in `src/haze-math.js`, colours as plain arrays), the
  sun angles (`DAWN_SUN`), the light rig, the environment-from-sky, the shadow-box snapping, the final grade shader,
  the sun-shaft shader and the quarter-resolution bloom override.
- **Defaults taken from how the game calls them:** sharpen 0.16 and lift 0.02 (the game's `main.js` sets these over
  the shader's own 0.3 and 0.0), Neutral tone map, exposure 1.05.
- **Made into options:** sun and light direction (were constants from the game's map), `metresPerUnit` (new: rescales
  distances so small scenes can use the same air; 1 = the game), shadow box size and distance (were 520 / 2400 for a
  7 km city), cloud shadows and firefly clamp on/off, an overlay scene (was the game's first-person rig pass), bloom,
  shafts and MSAA samples.
- **Sky:** the game's sky is a photographed CC0 panorama (Poly Haven "Belfast Sunset (Pure Sky)"). The image is NOT
  shipped. The default is a new procedural gradient (horizon = the haze colour, rising to a new `skyZenith`
  lavender-slate, a rose band toward the sun) with the game's sun core, glow and horizon dissolve. The game's
  panorama grading is kept behind `panorama: texture`.
- **New:** `src/haze-math.js` (pure JS copies of the haze maths for tests and game logic: `transmittance`,
  `halfwayDistance`, `cloudShadowAt`), `createHazePost` getters (`speed`, `fade`, `toneMap`), `dispose()`.
- **Left out:** the noise texture for the game's clouds (unused by the haze), the game's water, rig, dev panel and
  map. `tools/palette.py` (Python + Pillow, regions hand-picked for one concept frame) is not ported: the kit already
  has `tools/refs/palette.mjs` for comparing a still with a reference, and HOW-TO-USE.md explains the idea.
- Comments rewritten without the game's place names.

## Checked

2026-11-14: built the demo with vite 8.3.8 + three 0.187.0, opened it in headless Chromium (Metal): no console errors
or warnings; programs compiled for MeshStandardMaterial, MeshLambertMaterial, MeshBasicMaterial, MeshDepthMaterial and
a custom ShaderMaterial with `fog: true`, plus the sky and grade shaders. All demo keys pressed; `?scale=1` also drawn.
`node --test test/`: 9 tests pass. Preview: `blocks/previews/meticulai-haze.jpg`.
