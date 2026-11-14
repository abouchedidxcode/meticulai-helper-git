# PS1 look: how to use it

The PlayStation 1 look from **Don't Blink** (meticulai.com): the world drawn at 320 x 240, vertices that snap to
that pixel grid (the famous jitter), textures that warp like the PS1's (affine mapping), 20 colour levels per
channel with 4 x 4 Bayer dither, a sick green-sepia grade, grain, vignette and a 4:3 letterbox. It also has the
game's screen effects: eyes closed (blackout with a fading warm afterimage of the brightest things), eyelids that
open from a slit, flash, chunky whole-pixel shake, a vignette punch and "dread" (rows swim, colours split, grain
rises). Renderer: **WebGL2** (`WebGLRenderer`). Checked on three 0.187.0. npm deps: `three` only.

## Files

- `src/index.js` re-exports everything.
- `src/ps1-material.js`: `createPS1Material(opts)` (a Lambert material, PS1-patched), `patchPS1Material(mat)`
  (patch any built-in material in place), shared `ps1Uniforms`, `setPS1Resolution`, `setPS1Affine`.
- `src/pipeline.js`: `PS1Pipeline` (low-res target + the one post pass) and `applyPS1Atmosphere(scene)`.
- `src/defaults.js`: every number (`PS1_DEFAULTS`, `NEUTRAL_GRADE`, `ATMOSPHERE_DEFAULTS`, `GAME_NOTES`).
- `src/ps1-state.js`: the timing logic (no three.js; tested). `src/texels.js` + `src/textures.js`: eight tiny
  procedural textures (`bricks planks tiles grass cloth skin noise checker`), nearest-filtered.
- Demo only: `demo/` (test scene + keys).

## API

```js
import { PS1Pipeline, createPS1Material, patchPS1Material, makePS1Texture, applyPS1Atmosphere } from '.../src/index.js';

const ps1 = new PS1Pipeline({ renderer });          // or { container: el } to make its own renderer like the game
const wall = createPS1Material({ map: makePS1Texture('bricks'), color: 0xa49c8c, repeat: [3, 1] });
patchPS1Material(someExistingMeshLambertMaterial);  // any built-in material; Lambert is cheapest and most PS1
applyPS1Atmosphere(scene);                          // optional: the game's black fog (FogExp2 0x020203, 0.16) + dim ambient

// every frame, INSTEAD of renderer.render(scene, camera):
ps1.render(scene, camera, dt);                      // dt in seconds

ps1.setBlind(true | false, instant?)  // eyes closed / open (instant open = hard cut, no eyelids)
ps1.closeEyes(ms)                     // lids slowly shut, then black
ps1.setFlash(0..1)  ps1.setShake(0..1)  // you decay these (the game: flash -= dt*2.5, shake -= dt*2)
ps1.setDread(0..1)                    // how close the threat is
ps1.punch(0..1)                       // sharp vignette pulse that fades on its own
ps1.set({ colorLevels: 16, grade: NEUTRAL_GRADE, letterbox: false, affineStrength: 0 })  // live changes
```

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-ps1-look`.
2. In `my-game/src/render/renderer.js`: add `drawWith: null,` to `api`, and in `draw()` and `capture()` replace
   `renderer.render(scene, camera)` with `api.drawWith ? api.drawWith(scene, camera) : renderer.render(scene, camera)`.
3. In `my-game/src/game/game.js` `createGame(ctx)`:
   ```js
   import { PS1Pipeline, patchPS1Material } from '../../vendor/meticulai-ps1-look/src/index.js';
   const ps1 = new PS1Pipeline({ renderer: ctx.view.renderer });
   let frameDt = 1 / 60;
   ctx.view.drawWith = (s, c) => ps1.render(s, c, frameDt);
   scene.traverse((o) => o.isMesh && patchPS1Material(o.material));  // after the world is built
   ```
   Set `frameDt` from your `update(dt)`. Use `ps1.setShake` / `setFlash` from the starter's `juice` events
   (hits, deaths) to get the chunky shake.
4. The starter's camera aspect is overwritten to 4:3 each frame (that is the letterbox). For full screen use
   `new PS1Pipeline({ renderer, letterbox: false })`: 240 rows, as wide as the window.
5. The starter's ACES tone mapping does not apply (the scene goes into a render target and the post pass writes
   sRGB itself, with no tone mapping). Bright lit areas clip instead of rolling off, so you may want to lower light intensities a little.
6. Its antialias and pixel ratio 2 do nothing useful here (the picture is 320 x 240); fine to leave.
7. `vite.config.js`: `resolve: { dedupe: ['three'] }`.

## The numbers that matter (all in `PS1_DEFAULTS`, exactly as the game has them)

| Option | Value | What it does |
|---|---|---|
| `width` x `height` | 320 x 240 | The PS1's own resolution. 256 x 224 is even cruder; 480 x 360 starts to look "retro-styled" not retro. |
| `vertexSnap` | 1.0 | Grid in low-res pixels. 2-4 = wobblier, 0.5 = calmer. |
| `affineStrength` | 0.85 | 1 = full PS1 warp; 0.85 keeps big floors readable. Subdivide floors/walls to ~1 m or it looks broken. |
| `colorLevels` | 20 | Per channel. 32 = smoother; 8-12 = posterised. |
| `ditherStrength` | 1.0 | 4 x 4 Bayer, in quantisation steps. |
| `grain` | 0.05 | Re-rolled 24 times a second, weaker in blacks. |
| `grade` | sat 0.55, tint 0.94/1.0/0.80, contrast 0.35 | The horror grade. `NEUTRAL_GRADE` turns it off. |
| `vignetteBase` | 0.35 | Plus `vignettePulse` 0.65 over 450 ms each time the eyes open. |
| `lidOpenMs` / `fadeInMs` | 190 / 150 | A quick blink opens 2.5 x faster (0.4 x) than a closure of 0.7 s or more. |
| `afterimageStrength` / `afterimageFadeMs` | 0.35 / 1400 | What lingers when the eyes close. 0 = pure black. |
| Atmosphere | FogExp2 0x020203 at 0.16, ambient 0x30303a at 0.035 | Pitch black past ~10 m; the flashlight (`GAME_NOTES.flashlight`) is the only real light. |

## What made it good in Don't Blink

Don't Blink is a webcam horror game: you can only move with your eyes closed, and the monster only moves while you
can't see it. The look serves that one moment, opening your eyes to see what changed: the eyelids, the vignette
pulse and the afterimage all live on the blink, and the black fog plus a single flashlight keep the player
uncertain about what is past the light. The low resolution and dither hide how simple the procedural rooms are and
make every prop read as "found footage from 1997". The game shipped live on meticulai.com with a dedicated render
test room (Space = blind, F = flash, S = shake). Honest note: the project's own status notes say the eyelid and
light-pool visuals were never checked by a person, so the numbers were set by the building agent, not tuned by play.

## Gotchas

- `onBeforeCompile` replaces three.js chunk names (`common`, `project_vertex`, `map_fragment`,
  `emissivemap_fragment`). Checked on three 0.187.0; re-check after upgrading three (shader compile errors or
  silently missing jitter mean a chunk was renamed).
- Big polygons + affine warp = swimming textures. Subdivide (the shared test scene's ground is 1 m segments).
- Snapping is in screen space, so far things jitter more than near ones: that is correct PS1 behaviour.
- `uSnapRes` and `uAffine` are shared by every PS1 material (one set of uniforms); the pipeline keeps them in step.
- The pipeline forces perspective cameras to its aspect. Orthographic cameras are left alone.
- Two separate pipelines on one page would fight over the shared uniforms; use one.
- Shadows work (Lambert receives them), but crisp shadow maps look modern; PS1 games used blob shadows.
- Flash/shake don't decay by themselves (by design, the game drives them); punch does.

## Restyle it

- Not horror: `grade: NEUTRAL_GRADE`, `vignetteBase: 0.15`, your own fog colour. Warm racing-game PS1:
  `grade: { saturation: 1.15, tint: [1.05, 1, 0.92], contrast: 0.2 }`.
- Cruder: `width: 256, height: 224, colorLevels: 12, vertexSnap: 2`. Cleaner: `colorLevels: 32, affineStrength: 0.5`.
- Textures: keep them tiny (32-64 px) and nearest-filtered; `makePS1Texture(kind, { size: 64, seed })`, or your
  own canvas with `NearestFilter` and no mipmaps.

## Run the demo

`npm install && npm run dev` (http://127.0.0.1:5402). `?preset=horror` = the game's own black-fog flashlight air.
Keys: Space (hold) eyes closed, C close slowly, F flash, S shake, D dread, P punch, G grade, L letterbox, W warp.
`npm test` runs the logic tests (no browser).
