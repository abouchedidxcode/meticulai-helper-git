# Ink illustration: how to use it

Redraws any three.js scene as a pen-and-ink illustration on paper: outlines from depth and normal breaks that
"boil" (re-drawn 7 times a second, like hand-drawn animation) with uneven pen pressure, diagonal hatching in the
shadows and cross-hatching in deep shadow, paper grain and fibre, a vignette, plus three effects a game drives:
ink bleeding in from the screen edges when hurt, a flash, and desaturate. Under it, three-tone toon materials, and a
small palette module that cross-fades the whole world's colours (sky, fog, lights, materials, ink, hatching, sun
direction) from one set to another.
From Pop Quiz (meticulai.com/games/pop-quiz/). Renderer: **WebGL2** (`WebGLRenderer`). three 0.187. npm deps: `three` only.

## Files

- `src/ink-post.js`: `createInkPost(renderer, options)`, `INK_DEFAULTS`. The post-process. Imports `three`.
- `src/toon.js`: `inkToon(params)`, `toonRamp(steps)`. MeshToonMaterial on the 3-step ramp the game used.
- `src/palette-blend.js`: `createPaletteBlend(palettes)`, `EXAMPLE_PALETTES`, colour helpers. **No three import**
  (pure maths, tested in `test/`).
- `src/index.js`: everything above in one import.
- `demo/`: the shared Meticulai looks test scene drawn in ink (`demo/test-scene.js` is the same file in every look
  block; do not copy it into a game).

## API

```js
import { createInkPost, inkToon, createPaletteBlend } from '../../vendor/meticulai-ink-illustration/src/index.js';

const ink = createInkPost(renderer, { ink: '#1d2340' });   // uses YOUR renderer; follows its size by itself
// every frame, INSTEAD of renderer.render(scene, camera):
ink.render(scene, camera, dt);        // dt in seconds; pass 0 while paused and the lines stop boiling

ink.fx.hurt = 0.5;                    // 0..1 ink bleed from the edges. Decay it yourself (the game: -0.9 per second)
ink.fx.flash = 0.55; ink.fx.flashColor.set('#ffffff');   // decay -1.4 per second
ink.fx.desat = 0.75;                  // 0..1 grey (the game used 0.75 on death)
ink.set({ hatchLevel: 0.07 });        // change any option live
ink.uniforms.ink.value                // THREE.Color you can copy into every frame (palette blending)
```

Materials: anything lit works, but the look was made on `inkToon({ color })` (MeshToonMaterial, ramp 70/150/255).
Smooth PBR materials still get the lines and hatching; the flat three tones are what make it read as a drawing.

Particles, dust and glows that should not get outlines: put them on layer 1 only (`mesh.layers.set(1)`). The colour
pass draws them, the normal pass skips them (`noNormalsLayer: 1`; `null` to turn this off).

Palette blending (plain values, no three):

```js
const pal = createPaletteBlend(myPalettes);   // [{ sky: '#97d2e4', ink: '#1d2340', hatch: 0.14, sunDir: [-0.5, 0.7, 0.4], ... }]
pal.set(2, 4);                                 // blend to palette 2 over 4 s (smoothstep); mid-blend changes never jump
if (pal.update(dt)) {                          // true while moving
  groundMat.color.fromArray(pal.live.ground);  // colours arrive as LINEAR [r, g, b]: use fromArray, not set()
  ink.uniforms.ink.value.fromArray(pal.live.ink);
  ink.uniforms.hatchLevel.value = pal.live.hatch;
}
```

`'#rrggbb'` values are colours (sRGB in, linear out), numbers blend as numbers, arrays blend per component, keys
ending in `Dir` stay unit length. `demo/main.js` `applyPalette()` shows a full mapping (materials by role, sky, fog,
hemisphere light, sun colour and direction, ink, paper, hatch).

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-ink-illustration`.
2. The starter draws with `view.draw(scene, camera)` -> `renderer.render`. In `my-game/src/render/renderer.js` add
   `drawWith: null,` to `api`, and in both `draw()` and `capture()` replace `renderer.render(scene, camera)` with
   `api.drawWith ? api.drawWith(scene, camera) : renderer.render(scene, camera)`.
3. In `my-game/src/game/game.js`, in `createGame(ctx)`:
   ```js
   const ink = createInkPost(ctx.view.renderer);
   let inkDt = 0;
   ctx.view.drawWith = (s, c) => { ink.render(s, c, inkDt); inkDt = 0; };
   ```
   and in `update(dt, mode)`: `inkDt += dt;` (so the lines boil at 7 per second and freeze when paused).
   Build world materials with `inkToon({ color })` instead of `MeshStandardMaterial`.
4. Hook game events to the effects: `ctx.events.on('hit', () => ink.fx.hurt = Math.min(1, ink.fx.hurt + 0.3))`,
   flash on `pickup`, `desat` on `death`; decay `hurt`/`flash` in `update`.
5. Scale the distance options to your world (see below). Put tuning numbers you want to play with in
   `src/tuning.json` and pass them to `ink.set(...)`.
6. `resolve: { dedupe: ['three'] }` in `my-game/vite.config.js`.

## The numbers that matter

All defaults are what Pop Quiz shipped.

| Option | Default | What it feels like |
|---|---|---|
| `boilRate` | 7 | Line re-draws per second. 7 reads as hand-drawn; 12+ gets jittery, 0 is a clean static outline. |
| `wobble` | 2.6 | Pixels the line wanders. 0 = vector-clean, 4+ = shaky sketch. |
| `pressure` | [0.75, 0.25] | Pen pressure base and variation along a stroke (lines fade in and out a little). |
| `edgeStrength` | 0.92 | Line darkness. |
| `depthEdge` / `normalEdge` | [0.035, 0.12] / [0.55, 1.1] | Line sensitivity. Lower = more lines (creases inside shapes); higher = silhouettes only. |
| `hatchLevel` | 0.15 | Linear brightness below which hatching starts (Pop Quiz: 0.14-0.16 by day, 0.07 at night, so night is not all hatch). Cross-hatch starts at 0.6x of it. |
| `hatchSpacing` | 6 | Hatch spacing in CSS pixels. |
| `hatch1` / `hatch2` | 0.42 / 0.5 | Strength of the diagonal and cross layers. |
| `paper`, `paperMix`, `grain` | `#fff4e0`, 0.18, 1 | Paper warmth in the highlights, and grain. |
| `vignette`, `vignetteRange` | 0.72, [0.45, 1.05] | Corner darkening. |
| `fadeNear` / `fadeFar` / `fadeAmount` | 90 / 520 / 0.7 | World distances where lines and hatching fade (so far land doesn't turn to ink noise). **Scale to your world.** |
| `skyDepth` | `null` = 0.65 x `camera.far` | Past this view distance a pixel is sky: no hatching. Pop Quiz: 1300 with far 2000. |
| `maxPixelRatio` | 1.5 | Buffer resolution cap (the game capped the whole renderer at 1.5). |

## What made it good in Pop Quiz

- It is the identity of the game: the README sells it as "a hand-inked illustration", and Pop Quiz is one of the
  screens in the meticulai.com homepage room. A later game (a mech shooter) copied it as its "Ink (like Pop Quiz)" look.
- The boil is the trick that stops it reading as a filter: lines that are re-drawn a few times a second look drawn
  by hand, not computed. Hatching in screen space (not on the models) looks like pen strokes on a page.
- The whole world re-inks per chapter (dawn, noon, dusk, night, eclipse): the palette blend moves sky, lights,
  materials, ink colour and hatch level together over 4-5 seconds, so a level change feels like turning a page.
  Night drops `hatchLevel` to 0.07 so dark scenes don't drown in hatching.
- No owner quote about the look itself was recorded; it shipped live and stayed unchanged.

## Gotchas

- Two scene renders per frame (colour, then normals with an override material) plus a full-screen pass: about
  double the draw cost. On weak GPUs lower `maxPixelRatio` to 1.
- Lines are 1-2 px: on very high-resolution screens they get thin; at 4K raise `wobble` a little or cap the pixel ratio.
- The normal pass draws every mesh with one `MeshNormalMaterial` (skinned and morphed meshes are fine). A
  `ShaderMaterial` that moves vertices (wind, waves) gets outlines from its undisplaced shape: put such meshes on
  layer 1 (no outlines) or accept it.
- Sky: a `scene.background` colour or texture has no depth, so it reads as `camera.far`: it is treated as sky as long
  as `skyDepth < camera.far`. A sky dome mesh must sit beyond `skyDepth`.
- No antialiasing in the colour target (the game ran `antialias: false`); the outlines hide the stair-steps.
- `MeshToonMaterial` has no `flatShading` in three 0.187 (it warns). For faceted rock, use non-indexed geometry with
  `computeVertexNormals()`.
- The output skips tone mapping (the scene is drawn into a half-float target); the game ran without tone mapping.
  If your colours look washed out compared with the starter's ACES, darken the palette rather than adding ACES.
- Perspective cameras only (linear depth uses the perspective formula).

## Restyle it

- Ink colour per scene (`ink`), warmer or cooler paper (`paper`), and a palette per level with `createPaletteBlend`.
- Comic book: `boilRate: 0`, `wobble: 0`, `edgeStrength: 1`, `hatchLevel: 0.25`, `hatchSpacing: 4`.
- Sketchbook: `wobble: 4`, `pressure: [0.5, 0.5]`, `paperMix: 0.35`, `grain: 1.6`, pale palettes.
- Different hatch angles: edit the two `fract((fc.x +/- fc.y) / hatchSpacing ...)` lines in `ink-post.js`.

## Run the demo alone

`cd blocks/vendor/meticulai-ink-illustration && npm install && npm run dev` (http://127.0.0.1:5403).
Keys: P or Space next palette (day, dusk, night; 4 s blend), H hurt, F flash, G grey, O ink on/off (compare with
the plain toon render). `?palette=1` starts at dusk, `?shot=1` freezes the pose. `npm test` runs the palette tests.
