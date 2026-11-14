# Painterly styles: how to use it

Turns an ordinary three.js scene (MeshStandardMaterial, a sun, a hemisphere light, fog) into one of three art styles,
switchable live from a settings menu, with the player's choice remembered:

- **gouache** ("Painterly", the default): a picture-book painting. A 4-sector Kuwahara brush sized by distance (broad
  strokes near, fine far; thin near things and points of light are kept), more pigment at stroke edges, soft
  darker-colour edges, paper tooth, warm light and cool shade, broken colour and stroke streaks painted on near walls
  and ground in world space (they never swim), the distance melting into a painted sky with heaped cumulus.
- **miniature**: an ink-outlined miniature painting. Colours snapped to a flat jewel palette (ivory, saffron,
  vermilion, lapis, malachite, gold...), fine brown-black ink from depth (silhouettes and creases), a soft tonal
  ramp, paper fibre, paler washes in the distance, a curling contour-line sky and a scalloped gold sun, a narrow
  ivory margin with fine gold and vermilion rules.
- **clean**: calm toon. Two-step light ramp, gradient by height, layered pastel fog in bands, a smooth gradient sky,
  very soft outlines.
- **none** ("Classic"): your scene as it was, with the same filmic grade.

Renderer: **WebGL2** (`WebGLRenderer`, `onBeforeCompile` patches + `ShaderMaterial` passes). three 0.187. npm deps:
`three` only (uses the `three/addons` `FullScreenQuad` and `UnrealBloomPass`). From Kite Race (unreleased).

## Files

- `src/index.js`: `createPainterlyStyles(renderer, opts)`, the pipeline (scene -> HDR target with depth -> bloom ->
  grade -> style pass -> screen) and re-exports everything below.
- `src/patch-material.js`: `patchStyleMaterial(mat, kind)`, `patchStyleScene(root, kindOf)`, `STYLE_U` (the shared
  uniforms).
- `src/styles.js`: the three style tables (light, sky, haze, grade overrides), `BASE_LOOKS`, name parsing,
  remembering, `styleLook()`. Pure JS, no three import (tested).
- `src/style-glsl.js`: palettes, palette snap, gouache brush, light ramp, styled haze, styled skies (GLSL strings).
- `src/style-post.js`: `StylePass` (the brush / ink / paper / border pass). `src/grade.js`: `GradePass`.
- `src/sky.js`: `createStyleSky()`, a sky dome every style repaints.
- `demo/`: the shared Meticulai looks test scene in all four styles.

## API

```js
import { createPainterlyStyles, createStyleSky, patchStyleScene, BASE_LOOKS, STYLE_LABELS, STYLE_CHOICES }
  from '../../vendor/meticulai-painterly-styles/src/index.js';

const styles = createPainterlyStyles(renderer, {
  storageKey: 'mygame.style', // localStorage key for the player's choice (default 'game.style')
  // style: 'gouache',        // force a start style (default: ?style=, else the saved choice, else gouache)
  // samples: 4,              // MSAA of the scene target (0 on weak phones)
  // bloom: true,
  fogDensityScale: 1,         // multiplies a look's fogDensity for scene.fog (FogExp2)
  fogDistanceScale: 1,        // how far the styled haze thinks things are (see "Scale" below)
});
patchStyleScene(scene, (mesh, mat) => mesh.userData.kind);   // every mesh material; kinds below
const sky = createStyleSky(); scene.add(sky);                  // optional but most of the look is in the sky
styles.applyLook(BASE_LOOKS.golden, { sun, hemi, scene, sky }); // sun/hemi colours+intensity, fog, sky, grade
styles.warmUp(scene, camera);                                  // compile before the first frame

// every frame, INSTEAD of renderer.render(scene, camera):
sky.material.uniforms.uTime.value = seconds;                   // drifting clouds
styles.render(scene, camera, seconds);

// settings menu: STYLE_CHOICES = ['gouache', 'miniature', 'clean', 'none'], labels in STYLE_LABELS
styles.choose('miniature');   // live switch, remembered; styles.setStyle(name) = live, not remembered
styles.onStyle((name) => { /* e.g. switch your own AO pass off when styles.def?.noAO */ });
```

- Switching costs nothing: one shared uniform (`uStyle`) changes and the last `applyLook` is re-applied with the new
  style's overrides. No recompile, no reload.
- `styles.applyLook(look, targets)`: a `Look` is a table of light, haze, sky and grade numbers (see `BASE_LOOKS` in
  `src/styles.js` for the fields). Each style overrides parts of it per look name (`golden`, `morning`, `night`, and
  `all`). Use your own look tables; the style tables still apply when your look is named `golden`/`morning`/`night`
  (other names get only the style's `all` overrides). `night: 1` switches the painted night sky, moon and stars on.
- `styles.grade.uniforms`: `flash` (0..1, a warm white flash), `aberration`, `grain`, `vignette` (set by the style).
- `styles.setSize()` after `renderer.setSize` (it also checks the size every frame).

### Surface kinds (`patchStyleMaterial(mat, kind)`)

| kind | what the style does | use for |
|---|---|---|
| `flat` (default) | flat base colour (material x vertex colour x the texture's *average*), snapped to the palette, style light, no specular; gouache paints strokes on it | buildings, props, rocks, trees |
| `textured` (default if it has a `map`) | keeps the texture but reads it from small mips, so detail melts into colour fields | painted terrain you want to keep |
| `ground` | like flat; lighter palette snap in the miniature, warm earth in the gouache | big floors and fields |
| `figure` | keeps its colours, flat camera-facing shading (a silhouette) | people, animals |
| `hero` | keeps its own paint and specular, gets the style's light; glows a little at night | the star of the game (Kite Race's kites) |

Only `MeshStandardMaterial` / `MeshPhysicalMaterial` get the surface treatment. Basic, line, point materials are
untouched (but still get the styled fog if `fog: true`). Patch before the first render.

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-painterly-styles`.
2. In `my-game/src/render/renderer.js`: add `drawWith: null,` to `api`, and in `draw()` and `capture()` replace
   `renderer.render(scene, camera)` with `api.drawWith ? api.drawWith(scene, camera) : renderer.render(scene, camera)`.
3. In `my-game/src/game/game.js` `createGame(ctx)`:
   `const styles = createPainterlyStyles(ctx.view.renderer, { storageKey: 'my-game.style' });`
   patch your materials (`patchStyleScene(scene)` after building the world, or patch in your material factory),
   add `createStyleSky()`, call `styles.applyLook(...)` with your sun and hemisphere light, then
   `ctx.view.drawWith = (s, c) => styles.render(s, c, time);` (keep a `time` you advance in `update`).
4. The starter's `toneMappingExposure = 1.1` and ACES no longer apply: the block sets `NoToneMapping` and does its own
   grade; exposure comes from the look (`look.exposure`).
5. Settings: add a "Look" choice to `my-game/src/core/settings.js` that calls `styles.choose(name)`.
6. `view.warmUp` compiles for the screen, not the block's target: call `styles.warmUp(scene, camera)` instead.
7. Add `resolve: { dedupe: ['three'] }` to `my-game/vite.config.js`. Checked on three 0.187.0.

## The numbers that matter

- **Scale.** Kite Race is a 4 km city, so the styled haze works in metres at that size: gouache keeps the first
  ~120 m clear and melts from 180 m to 1400 m; clean steps its pastel bands from 60 m to 1600 m. For a small scene set
  `fogDistanceScale` (the demo's 150 m scene uses 8) and `fogDensityScale` (demo: 2). The post pass's distances
  (gouache brush 2.1 px near -> 0.55 px by 140 m; ink fading 45-420 m) and the world strokes (gone by ~220 m) are left
  in metres: they suit scenes from a room to a city.
- **Gouache brush**: `spacing = mix(2.1, 0.55, smoothstep(12, 140, z))` px at 1080p. Bigger = broader, smudgier
  strokes. Kuwahara calm weight `600` (higher = only very flat areas blend). Edge pigment `0.25`, paper tooth `0.06`,
  pools `0.08`. Whites roll off above luminance `0.8`.
- **Miniature ink**: silhouettes when a neighbour is 4-12 % further (plus a bit with distance), creases from the
  Laplacian of 1/z (`0.004..0.02`), ink colour `(0.13, 0.075, 0.045)` at 78 %. Tonal ramp 7 steps at 40 %. Border:
  ivory margin 10 px, gold rule at 12.5 px, vermilion at 16.5 px (at 1080p).
- **Palette snap** (`stPalette` in `style-glsl.js`): miniature pulls 72 % of the way to the nearest of 12 pigments
  (figures 35 %, ground 12 %); gouache 30 % of 10 earth/sky pigments (figures 15 %), saturation x1.1. Edit the
  `MINI_P*` / `GOU_P*` constants (linear RGB) to restyle; `stNearest` weights hue/chroma (0.6) over value (0.18).
- **Light ramp** (`stRamp`): miniature gentle two-part, gouache soft wrap `smoothstep(-0.05, 0.75, N.L)`, clean
  two-step toon, figures flat.
- **Grade per style** (`styles.js`): vignette 0.28 gouache / 0.12 miniature / 0.15 clean; bloom x0.8 / x0.4 / x0.6.
- **Cost.** Never timed in Kite Race (counted only: gouache 25 colour + ~10 depth taps a pixel, miniature 9, clean 5,
  plus a 12-colour palette loop per lit fragment). The demo's `?bench=1` measured, at 1280x720 on an Apple-silicon Mac
  in headless Chrome (rough, a shared machine): Classic 2.75 ms, clean 2.92, miniature 3.35, gouache 4.43 ms per whole
  frame. So gouache adds ~1.7 ms at 720p; expect several times that on phones and integrated GPUs at 1080p+.

## What made it good in Kite Race

- The game's maker asked for a look that is "beautiful while not having to be perfectly HD". Three styles were made
  and shown side by side on one sheet (the same six views in each). The maker first picked the miniature, then a few
  minutes later chose the painterly gouache as the default, with the others kept as a setting. So the block keeps all
  three, live-switchable and remembered.
- What fixed the painterly look in the round that made it the default: the brush **sized by distance** (strokes
  broad near, under a pixel far, so far people, wires and lamps are not smeared into mush); **thin near things and
  points of light kept** out of the brush; strokes and broken colour painted **in world space** so they hold still as
  the camera moves; the near distance kept clear so the path ahead never greys out; edges darkened with a darker
  shade of the colour, not grey; the brightest whites rolled off (a sunlit court stopped glaring).
- The miniature got better by subtraction: a loud mustard square became a pale buff court, the gold softened, the dark
  burned border became a narrow ivory margin with two fine rules, ink fades out with distance (no scribble on tiny far
  things).
- Everything is driven by one uniform, so a settings change is instant and the game never recompiles.

## Gotchas

- **Perspective cameras only** (the post pass reads depth with the perspective formula; an orthographic camera gets
  wrong outlines). `camera.far` matters: depth beyond 90 % of `far` counts as sky.
- Materials must be patched (or the style only changes the post pass and sky). Custom `ShaderMaterial`s are not
  repainted; include the fog chunks for haze, or leave them as they are.
- The styled haze needs `scene.fog` (`applyLook` creates a `FogExp2`). Linear `Fog` works too.
- The miniature's border and paper are fixed to the screen (like a page), by design.
- Gouache can shimmer a little on far edges in motion (Kuwahara); Kite Race never saw it moving on a person's screen.
- Paper, pools and tooth are in screen space (they stay still while the world moves under them, like paper would).
- The sky dome follows the camera and draws at the far plane; keep `scene.background` null or it is simply covered.
- Point and spot lights also get the style's light ramp in this block (Kite Race only had a sun).

## Restyle it

- Colours: the palettes (`MINI_P*`, `GOU_P*`) in `style-glsl.js`, the per-look tables in `styles.js` (sun, hemi,
  fog, sky colours, grade).
- Brush feel: `spacing` and the `600` calm weight in `style-post.js`; paper amounts there too.
- A fourth style: give it `id: 4` in `styles.js`, then add a branch in `stPalette`, `stRamp`, `stFog`, `stSky` and the
  post shader (each tests `uStyle < 1.5`, `< 2.5`, else clean: add yours before the clean fallback).

## Run the demo alone

`npm install && npm run dev` (http://127.0.0.1:5407). Keys: **S** next style (remembered), **1/2/3** golden /
morning / night. URL: `?style=gouache|miniature|clean|none`, `?look=night`, `?shot=1` (frozen pose, no HUD),
`?bench=1` (rough cost per style in `window.__demo.info.bench`). `npm test` runs the pure-logic tests.
