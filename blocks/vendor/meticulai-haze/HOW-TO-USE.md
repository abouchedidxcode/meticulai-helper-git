# Haze: how to use it

One air for the whole world. Far things fade into a warm, luminous haze that matches the sky's horizon, so distance
reads at a glance (aerial perspective). It works by replacing three.js's fog shader code once, so **every** material
gets it: standard, lambert, phong, basic, points, sprites, instanced and skinned meshes, and your own `ShaderMaterial`
with `fog: true`. No extra render pass, works with MSAA and transparent things, and no builder can forget it.

Also in the block (all optional): a sky that melts into the same haze, a warm key + cool fill light rig, reflections
made from the sky, drifting cloud shadows, and Hezarfen's final colour grade (Khronos Neutral tone map, contrast,
saturation, sharpen, vignette, grain, faint bloom, sun shafts, a "dive" streak at the screen edges).

From Hezarfen (a dawn glide over Istanbul) by Meticulai. Renderer: **WebGL2** (`WebGLRenderer`; the fog chunks and
`ShaderMaterial`s do not run on `WebGPURenderer`). three 0.187. npm deps: `three` only (the grade uses `three/addons`).

## Files

| File | What | Imports three? |
|---|---|---|
| `src/haze.js` | `installHaze()`: the fog-chunk replacement, `hazeChunk()` for custom shaders, `hazeUniform` | yes |
| `src/sky.js` | `createSky()`: procedural sky dome (or a CC0 panorama) dissolving into the haze | yes |
| `src/atmosphere.js` | `createHazeAtmosphere()`: haze + sky + lights + environment in one call | yes |
| `src/grade.js` | `createHazePost()`: Hezarfen's final picture (replaces `renderer.render`) | yes + addons |
| `src/haze-math.js` | the `DAWN` look, `packHaze`, CPU copies of the maths (`transmittance`, `halfwayDistance`, `cloudShadowAt`) | no |
| `src/index.js` | re-exports everything | |
| `demo/` | the shared looks test scene at dawn (`demo/test-scene.js` is the same in every look block) | |

## API

```js
import { createHazeAtmosphere, createHazePost, dirFromAngles } from '.../meticulai-haze/src/index.js';

// 1. Before the first render (the chunks are swapped when materials compile):
const atmo = createHazeAtmosphere({
  scene, renderer,
  sunDir: dirFromAngles(132, 2.6),   // toward the sun disc: azimuth (0 north/-Z, 90 east/+X), elevation, degrees
  lightDir: dirFromAngles(132, 21),  // where light and shadows come from (default: sun azimuth, 21 degrees up)
  metresPerUnit: 1,                  // 10 = treat a small scene like a big one (see below)
  shadowRadius: 20, shadowDistance: 60, shadowSize: 2048, // fit the shadow box to YOUR scene (Hezarfen: 520 / 2400 / 4096)
  // look: { fogUniform: 0.0003 },   // overrides of DAWN; panorama: texture (optional); lights/environment/cloudShadows: false
});
// it sets scene.fog = new FogExp2(0, 1) (density = live thickness), adds the sky, sun, hemisphere light and scene.environment

// 2. Optional: the final picture
const post = createHazePost({ renderer, scene, camera /*, overlayScene, overlayCamera, options: { samples: 0, bloom: false } */ });
post.setSize(innerWidth, innerHeight, renderer.getPixelRatio());   // on every resize

// 3. Every frame
atmo.update(time, player.position);  // drifting banks and cloud shadows; shadow box follows the focus point
post.updateSun(atmo.sunDir);         // sun shafts only when the sun is near the frame
post.render(dt, time);               // instead of renderer.render(scene, camera)
```

Live controls (no recompiling, every material changes at once):
- `scene.fog.density` (or `atmo.density`): 0 clear air, 1 as tuned, 2-3 thick. Hezarfen's dev panel slider "All haze".
- `atmo.look.fogUniform = 0.0003; atmo.sync();` any `DAWN` field (heights, densities, horizon colours, banks).
- `post.exposure`, `post.toneMap = 'neutral' | 'agx' | 'aces'`, `post.speed` (0..1.6 edge streak), `post.fade` (0..1 to black),
  `post.uniforms.uContrast / uSaturation / uLift / uVignette / uGrain / uSharpen .value`, `post.rays.enabled`.
- `atmo.cloudShadowAt(x, y, z)`: the sunlight left at a point (0.6..1), the same as the shaders draw.

Only the air: `installHaze({ sunDir, lightDir, look, metresPerUnit })` then `scene.fog = new THREE.FogExp2(0, 1)` and
call `haze.update(scene, time)` each frame. Your own lights, sky and renderer stay.

Custom shaders: with `fog: true`, merge `THREE.UniformsLib.fog` into the uniforms, define `vec4 mvPosition` before
`#include <fog_vertex>`, and include `fog_pars_vertex`, `fog_pars_fragment`, `fog_fragment` as three's own shaders do.
For a shader that does its own thing (water, clouds), add `hzP: hazeUniform` to its uniforms, paste `${hazeChunk()}`
into the fragment shader, and call `hzApply(color, cameraPosition, worldPos, 1.0)` or `hzFogColor(dir)`.

Game logic: `transmittance(atmo.haze.params, eye, point)` tells how much of a thing's colour reaches the eye (1 clear,
0 lost in haze); `halfwayDistance(params, eyeHeight)` is the distance where half is gone (about 440 m at the dawn numbers).

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-haze`. No npm deps to add (three is already there).
2. In `my-game/src/game/world.js`, `buildWorld()`: delete `scene.fog = new THREE.Fog(...)`, the `sky(...)` call and the
   hemisphere + sun lights, and instead:
   `const atmo = createHazeAtmosphere({ scene, renderer: ctx.view.renderer, metresPerUnit: 8, shadowRadius: 20, shadowDistance: 40 });`
   (pass the renderer in from `createGame(ctx)`). The starter island is only tens of metres across, so `metresPerUnit` 6-10
   makes its far edge hazy; at 1 you will barely see the haze on a small map. Keep the starter's `sun` variable name
   pointing at `atmo.sun` if other code uses it.
3. In the game's `update(dt)` (or `render`), call `atmo.update(worldTime, player.position)`.
4. Haze only: done. The starter's ACES tone map at exposure 1.1 still applies; for Hezarfen's colours set
   `renderer.toneMapping = THREE.NeutralToneMapping` and `toneMappingExposure = 1.05`.
5. Full grade: add the starter's draw hook (in `my-game/src/render/renderer.js` add `drawWith: null,` to `api`, and in
   `draw()` and `capture()` replace `renderer.render(scene, camera)` with
   `api.drawWith ? api.drawWith(scene, camera) : renderer.render(scene, camera)`), then in `createGame`:
   `const post = createHazePost({ renderer: ctx.view.renderer, scene, camera });`
   `ctx.view.drawWith = () => { post.updateSun(atmo.sunDir); post.render(1 / 60, worldTime); };`
   and call `post.setSize(w, h, pixelRatio)` from a `resize` listener. Create the renderer with `antialias: false`
   when using the post (it has its own 4x MSAA).
6. Tuning panel: expose `scene.fog.density`, `look.fogUniform`, `look.fogDensity0`, `post.exposure`,
   `uContrast`, `uSaturation` in `settings/tuning.json` if the player or you want to tune by eye.

## The numbers that matter (Hezarfen's dawn, grade v5)

| Number | Value | What it feels like |
|---|---|---|
| `fogHeight` | 24 m | the low mist's height: it lies on water and in valleys; towers and domes stand clear of it |
| `fogDensity0` | 0.00137 /m | how thick that mist is at the ground |
| `fogUniform` | 0.000166 /m | thin haze everywhere: what makes 2 km away look 2 km away |
| `fogHeight2`, `fogDensity1` | 180 m, 0.00013 /m | the deep layer: still haze between layers of a city seen from 300 m up |
| `fogBanks` | 0.75 | how patchy the mist is (0 = an even sheet) |
| `horizonAway`, `horizonSun` | rose-grey, gold-peach (1.32 > 1: brighter than white) | the haze is luminous, far land fades lighter, and the sun side glows |
| `sunIntensity`, `hemiIntensity` | 8.6 warm, 0.74 slate blue | a strong key and a weak cool fill: lit walls 3-4x their shadow, shadows blue not mauve |
| sun disc vs light | 2.6 degrees vs 21 degrees | a deliberate cheat: a low dawn sun in the sky, but faces actually lit and shadows long, not endless |
| `exposure`, `contrast`, `saturation`, `lift` | 1.05, 1.12, 1.06, 0.02 | set by measuring against a concept frame, not by eye |
| `maxRadiance` | 4.0 | caps any one pixel before haze, so a sun glint cannot bloom into a white blob |
| `metresPerUnit` | 1 (demo: 10) | world scale. The demo scene is small, so it uses 10 to look like a valley seen from far |

Measured by `halfwayDistance`: at eye height half a colour is gone at about 440 m; from 300 m up, further.

## What made it good in Hezarfen

- **One air, everywhere.** The first versions had the "clear-air picture" problem: an art critic said "the target is a
  haze picture and the game is a clear-air picture with a violet grade". Moving the haze into three's fog chunks gave
  every material the same mist with no extra pass: "costs nothing extra, cannot be forgotten by a builder".
- **Haze of the right kind, not just more.** After tripling the haze, critics said it was "a uniform grey veil, not low
  layered" mist. The fix was the low banked layer plus a deep second layer so there is still mist between a city's
  layers at flying height.
- **Measured, not guessed.** Three grades set by eye each overshot the last complaint. A small script compared named
  regions of a game still against the concept frame (median colour per region); grade v5 put every city region within
  2 to 14 levels of the concept. The kit's `node tools/refs/palette.mjs <img> <img2>` does the same kind of comparison.
- **Live air.** The numbers became one shared uniform array so a dev panel could tune the haze live. After it, a
  scroller critic's check "Istanbul at one glance": yes.
- Neutral tone mapping was picked by comparing AgX, ACES and Neutral on the same frame: the other two washed out the
  sky's pinks and oranges.

## Gotchas

- **Call `installHaze` / `createHazeAtmosphere` before the first render.** Materials compiled before it keep three's
  normal fog. Calling it a second time does not move the sun in already-compiled materials (the sun direction is baked
  into the shader; the haze numbers are live).
- `scene.fog` must be set (any colour; density is the multiplier). Its **red channel carries time** for the drifting
  banks and cloud shadows: `update()` writes it, so do not use `scene.fog.color` for anything else.
- A material with `fog: false` gets no haze. Your own sky must fade to `hzFogColor(dir)` at the horizon or there will be
  a seam: use `createSky`, or include `hazeChunk()`.
- Small worlds: at `metresPerUnit: 1` a 100 m scene is almost clear (that is correct air for 100 m). Raise it.
- Cloud shadows patch the light code of every lit material (`lights_fragment_begin`). Turn them off with
  `cloudShadows: false` if your game already has its own, or if a three.js upgrade changes that chunk (it warns).
- These chunk replacements were written for three r186 and checked on 0.187.0 (standard, lambert, basic, depth and a
  custom `ShaderMaterial` with `fog: true`, no shader errors). Recheck after a three upgrade.
- Cost: the haze adds a few dozen ALU operations per pixel to every material; the post is fill-bound. Hezarfen at
  2400x1350: 4x MSAA about 4.5 ms, bloom about 1 ms. On weak machines use `samples: 0, bloom: false`.
- The sky is procedural here. Hezarfen used a photographed CC0 panorama because its first procedural sky was "flat
  grey-mauve, no visible cloud"; this block's gradient has no clouds either. For clouds pass a CC0 sky:
  `const tex = await new THREE.TextureLoader().loadAsync('./assets/sky.jpg'); tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;` then `createHazeAtmosphere({ ..., panorama: tex })`. Poly Haven's "pure sky"
  HDRIs (CC0) work; Hezarfen used the upper half of one as a JPG (`panoramaSunU` = where its sun is, 0..1 across).

## Restyle it

- Another time of day: change `sunDir`, `sunColor`, `horizonAway`, `horizonSun`, `skyZenith`, `skyLight`. Noon: white sun,
  pale blue horizons, less haze. Dusk: deeper oranges, `fogUniform` up. Night fog: dark blue horizons, `sunIntensity` low.
- A cleaner look: `fogBanks: 0`, `grain: 0`, `vignette: 0.15`. A thicker one: `scene.fog.density = 2`.
- Desert heat: yellow-white horizons, `fogHeight` 8 m, `fogDensity0` up; an underwater feel: blue-green horizons and
  `fogUniform` 0.02 per metre.

## Run the demo alone

`cd blocks/vendor/meticulai-haze && npm install && npm run dev` (http://127.0.0.1:5406). Keys: H haze on/off,
[ ] thinner/thicker, T tone map, D dive streak, R sun shafts. `?shot=1` freezes the pose, `?scale=1` shows the scene at
real-world scale (almost clear: it is only 100 m deep), `?density=2`. `npm test` runs the maths tests.
