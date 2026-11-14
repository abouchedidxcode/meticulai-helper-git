# Tilt-shift macro: how to use it

Makes a three.js scene look like a **macro photograph of a toy**: the plane of focus is tilted into a thin sharp band
through your subject, everything above and below melts into soft bokeh, and a filmic grade (AgX, warm white balance,
a touch more colour and contrast, grain, vignette, lens fringing) finishes it. The world reads as a miniature on a
table. From Lost Marbles (meticulai.com/games/lost-marbles/).

Renderer: **WebGL2** (`WebGLRenderer`, GLSL `ShaderMaterial`s; not `WebGPURenderer`). three 0.187. npm deps: `three`
only (uses its `GTAOPass`, `UnrealBloomPass`, `FullScreenQuad` addons).

Pipeline per frame: scene into an MSAA half-float target with depth -> GTAO ambient occlusion (high only, reuses the
scene depth) -> one-pass gather bokeh whose blur is the larger of real depth of field and the tilt band -> bloom
(only light brighter than 2.2) -> grade to the screen.

## What to copy

- **The system:** `src/lens.js` (`TiltShiftLens`, `createLensRenderer`) and `src/quality.js` (presets, all the
  numbers, the band/focus maths and the dynamic-resolution governor; no three import).
- **Demo only:** `demo/` (the shared Meticulai looks test scene, toy materials, orbit, keys).

## API

```js
import { TiltShiftLens, createLensRenderer, TILT_PREF, TILT_SHOTS } from '.../meticulai-tilt-shift-macro/src/lens.js';
const renderer = createLensRenderer(canvas);   // or your own: antialias false, NoToneMapping, sRGB output
const lens = new TiltShiftLens(renderer, scene, camera, { quality: 'high', sun });  // sun: optional DirectionalLight
lens.setSize(innerWidth, innerHeight);          // on resize (set camera.aspect yourself)
lens.warmUp();                                  // compile every shader now, before the first visible frame
// every frame:
lens.focusOn(subject.position, 'play', { subjectRadius: 0.5 });  // focus + band through the subject
lens.render(dt);                                // REPLACES renderer.render(scene, camera)
```

- `focusOn(point, shot, { subjectRadius, roll })`: shot is a name from `TILT_SHOTS` (or your own object):
  `establishing` (full miniature, slow orbit), `flyover`, `podium`, `play` (band sized to the subject, wide enough
  to read the way ahead), `crowd`, `cut`, `attract`, `diorama` (real shallow focus, aperture 10.5, the band only
  softens the frame edges), `showroom` (vertical band for one object). Animate `roll` with a slow sine for flyovers
  (`0.1 * sin(t * 0.2)` for establishing, `0.14 * sin(t * 0.35)` for flyovers).
- Lower level: `setFocusDistance(dist, aperture = 1, fgK = 0.45)` and
  `setTiltShift(bandY, core, amount, { roll, up, down })` (bandY in NDC -1..1, core = sharp half-width in NDC,
  amount 0 none / 1 normal / ~1.6 cinematic, up/down = ramp lengths above/below). Both ease toward their targets
  like a focus puller; `settle()` jumps there now (first frame, camera cuts).
- `lens.tiltPref = TILT_PREF.off | on | strong` (0, 1, 1.35): the player's setting, multiplies the band blur. Lost
  Marbles had Settings -> Tilt-shift lens: Off / On / Strong.
- `setQuality('high' | 'medium' | 'low')`, `setNight(bool)`, `flash(amount)`, `setFrozen(bool)` (no grain, no
  time: repeatable screenshots), `setFrameBudget(1/30)`, `lastFrameTexture()` (last frame before grade, for glass
  that refracts the scene), `exposure`, `dispose()`.
- Callbacks: `onQualityChange(name)` when auto quality drops a preset; `onSustainedSlow()` once when even `low` at
  the lowest resolution is slow (lock the game to 30 fps and call `setFrameBudget(1/30)`).
- Options: any key of `LENS_DEFAULTS` in `src/quality.js` overrides that number (`{ grain: 0, vignette: 0.3,
  whiteBalance: [1, 1, 1], bloom: { threshold: 1.5 } }`); plus `autoQuality`, `adaptive`, `frameBudget`, `tilt`.

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-tilt-shift-macro`. No npm deps to add (three is already there).
2. The starter draws with `view.draw(scene, camera)` -> `renderer.render`. The lens must replace that call. In
   `my-game/src/render/renderer.js`: add `drawWith: null,` to `api`, and in both `draw()` and `capture()` replace
   `renderer.render(scene, camera)` with `api.drawWith ? api.drawWith(scene, camera) : renderer.render(scene, camera)`.
   The starter makes its renderer with `antialias: true` and ACES; the lens draws into its own targets and grades
   itself, so set `ctx.view.renderer.toneMapping = THREE.NoToneMapping` (canvas antialias is just wasted, harmless).
3. In `my-game/src/game/game.js`, in `createGame(ctx)`:
   ```js
   import { TiltShiftLens } from '../../vendor/meticulai-tilt-shift-macro/src/lens.js';
   const lens = new TiltShiftLens(ctx.view.renderer, scene, camera, { sun });
   let lastDt = 1 / 60;
   ctx.view.drawWith = () => lens.render(lastDt);
   ```
   In `update(dt)` remember `lastDt = dt` and call `lens.focusOn(player.position, 'play')`. On window resize call
   `lens.setSize(ctx.view.width, ctx.view.height)` (or once per frame if the size changed).
4. `__game.capture()` keeps working (it goes through `drawWith`). Call `lens.setFrozen(true)` in test mode if you
   compare screenshots pixel by pixel.
5. Tuning: add `tiltShift: "on"` to `src/tuning.json` and map it through `TILT_PREF`.

## The numbers that matter

| Number | Value | What it does |
|---|---|---|
| `aperturePx` | 125 | real depth-of-field strength (px at 1080p for aperture 1). Blur = 125 * aperture * abs(1/focus - 1/z) |
| `tiltPx` | 11 | band blur at amount 1 (px at 1080p), capped at the preset's `dof.max` (16 / 15 / 10) |
| `fgK` | 0.45 | foreground blurs at 45% of the background: things brushing past the lens don't smear the view |
| band `core` | 0.11-0.16 | the sharp strip's half-height in NDC for the miniature shots; `play` widens it with the subject's size |
| band `up` / `down` | 0.6-0.9 / 0.4-0.7 | ramp lengths: blur grows more slowly toward what's ahead (the top) |
| amount | 1 play, 1.45-1.6 cinematic | the miniature strength; the grade adds +0.1 saturation and S-curve as it rises |
| `catEye` | 0.55 | bokeh discs clipped into cat's eyes toward the corners (a fast lens) |
| bloom | 0.12 / 0.5 / 2.2 | strength, radius, threshold: restrained, glints only (night threshold 4) |
| grade | WB 1.04/1/0.95, sat 1.12, S-curve 0.32, vignette 0.55, grain 0.032, fringe 0.006 | warm afternoon photo |
| ease | focus 6/s, band 5/s, amount 2.5/s | a focus puller, not a snap; band jumps over 0.5 NDC (cuts) snap |

Presets: `high` (pixel ratio 1.5, MSAA 4, GTAO, full-res bokeh max 16 px, bloom, 4096 shadows), `medium` (1.25,
MSAA 4, no AO, half-res bokeh max 15, bloom, 2048), `low` (1, no MSAA, half-res bokeh max 10, no bloom, 1024
shadows redrawn every 2nd frame). Lost Marbles gave phones `low`. Dynamic resolution: when the fastest 90% of the
last 90 frames average over 1.2x the budget, pixel count steps x0.87 (to 0.66 at most three times), then a whole
preset drops (at most every 8 s); it steps back up after 4-30 s of headroom.

## What made it good in Lost Marbles

- The game's whole look was written down as one sentence, "macro photography of a toy run", and every pass serves
  it. The tilt band is what makes a 3D course read as a toy on a table instead of a big world.
- Racing keeps the band just wide enough for your marble and the track ahead (readability first); flyovers, the
  menu orbit and the podium get the full miniature with a slowly rolling band.
- Occlusion-aware gathering: the sharp subject never bleeds into the blur, and blurred foreground smears over the
  band the way a real lens does. Taps read matched mip levels, so a wide blur with few taps is smooth, not ghosted.
- It shipped on phones because of the presets and the automatic step-down, not by turning the look off.
- The owner loved the look: the next game (Last Drop) was asked to be "equally striking", and its renderer adapted
  this depth of field and grade. The players' setting (Off / On / Strong) let people who dislike blur turn it off.

## Gotchas

- Perspective cameras only (depth is linearised with the perspective formula).
- Plain colours on large flat areas show the blur poorly: the miniature reads best with texture, many small
  objects and a high, looking-down camera on a fairly long lens (fov ~30-38).
- Depth is read from the opaque pass: transparent objects (particles, glass) take the depth behind them, so they
  blur like the background. Draw sharp HUD-like things in a second pass after `render()` if needed.
- The lens owns the renderer's pixel ratio and size: call `lens.setSize()` rather than `renderer.setSize()`.
- Only the sun's shadow map size and softness come from the preset. `shadowSpan` in the presets is Lost Marbles'
  own shadow box (its world units): fit your sun's shadow camera to your scene yourself.
- `low` redraws the shadow map every 2nd frame only when you pass `sun`; moving objects' shadows trail a frame.
- Each preset change rebuilds the render targets (a brief hitch). GTAO uses the depth only (normals rebuilt).
- Cost: high is the scene + GTAO + up to ~60 bokeh taps per pixel + bloom. Not measured outside Lost Marbles.

## Restyle it

- Less "toy", more "film": `tiltPref` 0 and `focusOn(p, { aperture: 1, core: 1, amount: 0 })`; the grade stays.
- Cooler or neutral light: `whiteBalance: [1, 1, 1]`. Cleaner image: `grain: 0, fringe: 0, vignette: 0.3`.
- Stronger miniature: amount 1.6, core 0.08, lower `up`/`down`, and raise the camera.
- Last Drop (another Meticulai game) added camera motion blur by depth reprojection (a 90-degree shutter, with
  circles that keep the player sharp) after the bokeh; it is not in this block.

## Run the demo alone

`cd blocks/vendor/meticulai-tilt-shift-macro && npm install && npm run dev` (http://127.0.0.1:5404), `npm run build`
for `dist/`, `npm test` for the logic tests. Keys: T tilt off/on/strong, F band or diorama focus, Q quality, N night,
Space flash, P pause the orbit. URL: `?q=high|medium|low`, `?tilt=off|on|strong`, `?mode=band|diorama`, `?shot=1`
(the fixed pose of the preview, which was taken with `?shot=1&tilt=strong`).
