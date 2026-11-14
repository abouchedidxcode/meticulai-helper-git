# Photoreal: where this copy came from

From CANDID by Meticulai (meticulai.com), a multiplayer prop hunt in a back alley that looks like a photograph
(https://meticulai.com/games/candid/). The renderer is the shared "photoreal" engine CANDID was built on.
Extracted 2026-11-14 from the engine's source at `8849adcf3` (clean: no uncommitted changes in the engine
folder). Source files: `engine/photoreal/` (renderer.js, effects.js, sky.js, patch.js, surfaces.js, assets.js,
quality.js, index.js) and `engine/README.md`.

| | |
|---|---|
| Made by | Meticulai |
| Code licence | MIT (see `LICENSE`, with third-party notices) |
| Art | none in this folder; the demo loads a CC0 Poly Haven sky and asphalt at runtime |
| Renderer | webgl2 (`WebGLRenderer` + pmndrs `postprocessing`) |
| three.js | built for 0.186.1, checked here on 0.187.0 |

## What changed

- **three 0.187.** three changed the line in `envmap_physical_pars_fragment` that the box-projected reflections
  hook into (`textureCubeUV( ... roughness )` became `textureLod( ... roughnessToMip( roughness ) )`). Without a
  fix, reflections silently stopped being box projected. `patch.js` now knows both lines, and warns once in the
  console (and keeps plain reflections) if a later three changes it again. The PCSS shadow patch still matches
  0.187 unchanged. `test/patch.test.mjs` checks both against the installed three.
- **n8ao 2.0.1 -> 2.0.2.** 2.0.1's half-resolution AO target breaks on three 0.187 (a crash in
  `setupRenderTarget` on the `low` and `medium` presets); 2.0.2 fixes it. **postprocessing 6.39.5 -> 6.39.6**
  (6.39.5 declares three < 0.187).
- **Use your own renderer, scene and camera.** `new PhotoRenderer({ renderer, scene, camera })` so it can sit in
  the kit's starter (before, it always made its own). `autoResize` (default on) follows the canvas size.
- **Every look number is an option.** `tune: { ao, exposure, motionBlur, dof, bloom, film, sun }` overrides
  any of `DEFAULT_TUNE`, which holds the exact values CANDID shipped with. Nothing was retuned.
- **Pure maths split out** into `maths.js` (depth of field, dynamic resolution, exposure) with the same numbers,
  so it can be tested; `pickQuality(env)` can take the facts instead of reading the browser.
- **Ground and wall materials without CANDID's files.** `createGroundMaterial` / `createTiledMaterial` take
  `maps: { diff, nor, arm, disp }` (URLs or textures), Poly Haven's file names fit (`polyHavenMaps(id)`), or no
  maps at all (flat colour that still gets puddles and grime). `dir` with CANDID's webp names still works.
- **A bug found and left as shipped, behind a switch.** In CANDID the ground's "puddles are mirror-smooth and
  flat" edits ran after the chunks they target had already been inlined, so they never applied; the puddle
  reflections you see in CANDID come from the screen-space pass alone. Default kept (off); `smoothPuddles: true`
  turns the intended version on.
- Header comment fixed: it said AgX, but the default (and CANDID's choice) is ACES.
- `polyHavenHdri(id, res)` helper; exports `AtmosphereEffect`, `WetReflectionEffect`, `DEFAULT_TUNE`.
- Left out: CANDID's game code (alley, props, moods, drones, netcode), its asset build tool and all assets.

## Checked

On 2026-11-14 with three 0.187.0, postprocessing 6.39.6, n8ao 2.0.2: `npm test` (20 tests), `npm run build`,
the demo in headless Chromium on the Mac GPU at `?q=low`, `medium`, `high`, `ultra` with no errors
(picture: `blocks/previews/meticulai-photoreal.jpg`, `high`). The swap described in HOW-TO-USE.md was applied to a
temporary copy of the kit's starter, which ran (`__game.ready`, no errors) and built.

Not checked: frame rate on a real weaker GPU or phone (CANDID never measured it either).
