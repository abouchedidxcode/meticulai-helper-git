# Crowd renderer: where this copy came from

From TUMEN by Meticulai (meticulai.com). Extracted 2026-11-14 from the game's source at `877d87cb2` (clean: the files
copied had no uncommitted changes). TUMEN is not released yet.

| | |
|---|---|
| Made by | Meticulai |
| Source files | `public/js/army/crowd.js` (the renderer), `public/js/army/standin.js` (the code-built models), `public/js/army/locomotion.js` (the movement law), `public/js/army/army.js` (the trail code and the instance writer only) |
| Code licence | MIT (see `LICENSE`) |
| Art | none: every model is built in code; the game's own horse and rider models are not included |
| Renderer | WebGL2 (three.js `WebGLRenderer`; GLSL patched into three's materials) |

## What changed

- `src/crowd.js`: the game's renderer. The shaders, the bake, the LODs, the far-LOD decimation, the culling, the
  shadow rings and every number are unchanged. Game glue removed: it took a game context object (`ctx.params`,
  `ctx.sys.sky`, `ctx.env`, `ctx.time.frame`) and now takes `createCrowd({ scene, camera, quality, cost, cascades })`.
  The address-bar cost switches became the `cost` option; the sky's cascade data became the optional `cascades`
  callback; the per-frame guard now counts scene renders. Added `crowd.warm(fn)` and `crowd.setCamera(cam)`.
  `create(ctx)` is now `createCrowd(opts)` and is not async (`register` still is).
- `src/standin.js`: unchanged except names and comments: `buildMongol` is now `buildArcher` (model name `archer`),
  `buildHorse` defaults its gait table to the law's defaults.
- `src/locomotion.js` and `src/herd.js`: copies of the block `meticulai-horse-locomotion` (same law, same numbers),
  so the demo's horses move honestly and their bodies bend along their trail. Kept here so the block stands alone.
- `src/herd-draw.js`: the game's instance writer (from `army.js`) cut down to one horse and its rider, plus the
  forehand-reach measurement and gait row tables.
- Not copied: the army (units, orders, battle), the game's horse, destrier, archer and knight model files (made with
  paid generation), the heraldry atlas and mask textures, the player's own horse.

## Checked

`npm test`: 6 tests in node (bake, stand-in hooves within 4 mm while planted in the clips themselves, LOD and
hysteresis, culling, shadow-only instances, the 24-float record, horse-to-rider glue). Demo built with Vite 8.3.8
and three 0.187.0 and run in headless Chromium (Metal): no errors or warnings; 3,800 horses and 3,500 riders in 13 to
17 draw calls at 60 fps, the movement law about 1 ms per step, the instance lists 0.1 to 0.3 ms. `?n=6000` (7,000
horses, 6,600 riders) also ran at the 60 fps cap. The preview is `blocks/previews/meticulai-crowd-renderer.jpg`.
