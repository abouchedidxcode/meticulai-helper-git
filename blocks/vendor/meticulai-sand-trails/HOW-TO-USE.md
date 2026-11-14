# Sand trails: how to use it

Soft ground that remembers. A small square of ground around a moving body (a ball, a drop, a sled, a boot) is
simulated on the GPU every frame: the body presses a groove along its path with low berms either side and a little
bow wave in front, a hard landing leaves a shallow crater with a rim, water wicks sideways into the dry grains with
a ragged front, and dry sand past its angle of repose slumps back within a few seconds while wet sand holds its
shape for most of a minute. A second, coarser map keeps a long damp trail (44 m) after the fine one (12 m) has
scrolled past. Your ground material draws it as normal detail with self-shadowing and wet darkening.
Visual only: your physics and your ground mesh are untouched. Renderer: **WebGL2**. three 0.187. npm deps: `three`.

## What to copy

- **The block:** `src/sand-map.js` (`SandMap`), `src/wet-map.js` (`WetMap`), `src/sand-material.js`
  (`applySandTrails`), `src/fullscreen.js`, `src/index.js`.
- **Demo only:** `demo/` (flat procedural sand, a rolling ball, chase camera).

## API

```js
import { SandMap, WetMap, applySandTrails } from '../../vendor/meticulai-sand-trails/src/index.js';
const sand = new SandMap(renderer);              // 512 texels over 12 m (2.3 cm a texel)
const wet = new WetMap(renderer);                // optional: 512 texels over 44 m, the long damp trail
applySandTrails(groundMaterial, { sand, wet }, { sunDir });   // any MeshStandardMaterial; sunDir = toward the sun

// every frame, after moving the body:
sand.update(dt, x, z, vx, vz, contactRadius, contact, speed, film);
wet.update(dt, x, z, wetRadius, contact, film);
// on a landing:
sand.land(x, z, craterRadius, craterDepth);
```

- `contact`: 0 in the air (or in water), 1 pressing. The game used 1.5 for a hard dive. `film`: free water shed
  (1 moving, 0.5 nearly still; 0 for a dry ball or a boot, which then leaves a dry groove).
- The game's calls, for a body of radius `r`: `contactRadius = 0.62 r`, `wetRadius = 0.66 r`; landing with impact
  speed `v`: `sand.land(x, z, r * min(1.5, 0.7 + v * 0.05), r * min(0.2, 0.02 + v * 0.012))`.
- Quality: `sand.configure({ size: 256, span: 12 })` (phones), `sand.configure(null)` (off; the material skips it).
  `wet.setSize(256)`, `wet.setSize(0)` (off). The game on phones used the 256 sand map and skipped the wet map.
- Tuning: `new SandMap(renderer, { slump: 0.2 })` or `sand.tuning.slump = 0.2` at runtime (all in `SAND_DEFAULTS`).
- `sand.clear()` / `wet.clear()` on a restart. A jump of more than ~7 m in one frame clears the sand map by itself.
- The textures: `sand.tex.value` (r = height in m, g = wetness, b = film), `wet.texture` (r = damp, g = film), over
  `sand.rect.value` (x0, z0, span, texel) and `wet.rect.value` (x0, z0, span). Read them in your own shaders if you
  draw the ground yourself; copy the GLSL in `src/sand-material.js`.

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-sand-trails`. No npm deps to add.
2. In `my-game/src/game/world.js`, keep a reference to the ground's material (it must be a `MeshStandardMaterial`
   or `MeshPhysicalMaterial`, and the ground roughly flat in y: the normal tilt assumes "up" is +y).
3. In `my-game/src/game/game.js` `createGame(ctx)`: `const sand = new SandMap(ctx.view.renderer)` (and `WetMap`),
   then `applySandTrails(groundMat, { sand, wet }, { sunDir })` where `sunDir` is the normalised direction toward your
   `DirectionalLight` (`light.position - light.target.position`).
4. Call `sand.update(...)` / `wet.update(...)` once per rendered frame from `render(alpha)` with the interpolated
   position (they render a small pass each; the starter's fixed `update(dt)` may run 0 or 2 times a frame). Use the
   real frame time for `dt` (keep the last `performance.now()`).
5. Put `slump`, `ploughSpeed`, `dryHeightTau` and `wetHeightTau` in `src/tuning.json` (group `sand`) if you want to
   tune them live in the settings panel.

## The numbers that matter

| Number | Value | What it feels like |
|---|---|---|
| map | 512 texels over 12 m | 2.3 cm a texel: a groove from a 20 cm body is ~16 texels wide, crisp from a chase camera. |
| `lead` | 0.22 | The square sits 2.6 m behind the body at speed: more trail behind, where the camera looks. |
| groove depth | `r * (0.1 + 0.1 * plough)` | `plough = speed / 12` (capped at 1). Sitting still barely dents; at 12 m/s it ploughs. |
| berm height | `r * (0.025 + 0.05 * plough)` | Low ridges either side; their height varies in small clumps, the edge stays straight. |
| `slump` | 0.12 a frame | Dry sand past its angle of repose slides back; the angle is 4x steeper for wet sand. |
| `wick` | 0.14 a frame | How fast water spreads into dry grains; the front slows as it widens. |
| `dryHeightTau` / `wetHeightTau` | 2.2 s / 45 s | Dry grooves soften away in a few seconds; wet ones hold for most of a minute. |
| `wetnessTau`, `filmTau` | 60 s, 1.6 s | Damp sand stays dark a minute; the glossy film right behind the body dries in a second or two. |
| wet look | albedo x (0.46, 0.42, 0.40), roughness 0.55, film 0.06 | Dark, rich wet sand; the fresh film is almost a mirror. |
| self-shadow | 3 texel steps toward the sun | The groove's sun-side wall shades the floor in a low sun. At noon it all but vanishes. |

## What made it good in Last Drop

The owner asked for "much better sand" and a real interaction between water and sand, simulated "at least where the
drop is touching it", mobile first, with no loss of frame rate. This is that: a small drop-centred grid, one pass a
frame. Two rounds of the owner playing it on a phone shaped it: "the sand leaves a squiggly tail" (the groove's edge
used to wander with noise; it is straight now and only the berms' height varies), and "have the water sit in
deeper" (a deeper dent even when slow). Measured on a phone on High it cost nothing you could separate from noise
(2.89 ms before, 2.94 ms after, mean frame time); on a desktop at 1920x1200, about 0.4 ms.

## Gotchas

- **Low sun.** Without a low light the grooves read only by their wet colour. The game played at golden hour.
- Flat-ish ground only: the trail is in a square in x/z, sampled straight down. On steep slopes it stretches.
- Half-float targets. Some very old phones can't render to them; check `renderer.extensions.has('EXT_color_buffer_half_float')`.
- `update` renders. Calling it from a fixed-step loop that runs twice in a frame doubles the slumping; once per
  rendered frame with the real `dt` is right (the decays are scaled by `dt`).
- The coarse wet map draws a soft 8.6 cm-texel band, so near the body it is the fine sand map that shows the detail.
- A ground material with its own `onBeforeCompile` still works (the patch chains it), but two patches that both
  replace `#include <normal_fragment_maps>` must agree on order.
- The game also shifted its own sand textures by the groove depth (parallax: you see the grains at the floor of the
  groove) and erased its wind ripples inside the trail. If your ground has a detail texture, offset its UV in the
  material by `V.xz / max(V.y, 0.3) * sandH` the same way.

## Restyle it

- **Snow:** albedo tint near 1 (`wetTint: [0.85, 0.9, 1.0]`, `wetRoughness: [0.5, 0.3]`), `film` 0, slower
  slumping (`slump: 0.04`), longer `dryHeightTau` (20 s): deep footprints that stay.
- **Mud:** dark tint, `slump: 0.03`, `dryHeightTau: 30`, `film: 1` for a shine.
- **Footprints:** call `sand.land(x, z, footRadius, depth)` per step with `contact` 0 between steps.
- **Tyre tracks:** one `SandMap` per wheel (each is one small pass), or one map with the axle centre and a radius
  as wide as the axle if the tracks can merge.

## Run the demo alone

`cd blocks/vendor/meticulai-sand-trails && npm install && npm run dev` (http://127.0.0.1:5482). It drives itself;
WASD takes over, Space jumps, F toggles a wet or dry ball, C switches to a high camera. `npm test` runs the 9 tests.
