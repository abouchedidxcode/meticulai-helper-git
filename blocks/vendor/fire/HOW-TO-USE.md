# Fire: how to use it

Volumetric 3D flames made in shader math (candle, torch, gas jet, campfire, brazier, fireplace, bonfire, burning crate,
line of fire), with embers, smoke and point lights that light your scene. No textures or models.
Renderer: **WebGL2 only** (GLSL `ShaderMaterial`s; it fails on `WebGPURenderer`). three 0.186.1. npm deps: `three` only.

## What to copy

- **Reusable system:** `src/fire/` (`index.js` = `FireLayer`, `Fire`, `FIRE_TYPES`, `shapeOn`, `shapeOut`;
  `shader.js` = the flame GLSL). It imports only `three`.
- **Demo only:** `src/demo.js` (orbit camera, UI, auto resolution), `src/dressing.js` (logs, stones, torch head, wall,
  sky; copy its `headMat`, `hotIron`, `charOf` materials if you want charred fuel), `lib/patch-block.js`, `tools/`.

## API

```js
import { FireLayer } from '.../fire/index.js';
const layer = new FireLayer(renderer, { resolution: 0.5, samples: 4, bloom: 0.3, exposure: 0.72 });
const camp  = layer.add({ type: 'campfire', position: [0, 0, 0] });          // stand it on the ground under the logs
const torch = layer.add({ type: 'torch', position: [4, 1.7, -2], shadow: false }); // at the foot of the torch head
scene.add(camp, torch);              // each Fire is an Object3D holding its lights; add it to YOUR scene
await layer.compileAsync(camera);    // before the first visible frame (shader compile ~1 s on Windows)
// every frame:
layer.update(dt);                    // seconds; animates flames, embers, lights
layer.render(scene, camera);         // REPLACES renderer.render: scene -> layer.rtScene, fire, bloom, ACES + sRGB, to canvas
```

- Types and sizes (`FIRE_TYPES`): candle ~6 cm, gas ~35 cm, torch ~60 cm, fireplace ~80 cm, brazier ~1 m,
  crate ~1.7 m, campfire ~1.9 m, bonfire ~5 m, line ~5 m long (`length: 12` to change; cost grows with length).
  `size` scales it (1 = campfire, about 1.9 m tall).
- Live knobs on a fire: `intensity` (0.3 dying .. 1.6 roaring), `wind` (0..1), `windDirection` (radians round Y),
  `size`, `smoke` (0 off and cheaper .. 3), `embers`, `lightStrength`, `speed`, `stoke()` (flare + sparks),
  `position.set(...)` (never rotate or scale it; use `size`). `layer.remove(fire)` frees it.
- Light: by default each fire adds two point lights and the lower one casts a 1024 cube shadow. Pass
  `lights: false` (light it yourself) or `shadow: false` for most fires in a row of torches.
- Custom fuel: `around: { width, depth, radius, height, climb, flare, body }`, `outOf: { radius, below }`,
  `fuel: [{ from, to, radius }]` (up to 6 logs). Make the flame at least twice as tall as the object.
- `look: { calm, blue, blueFoot, heat, height, width, spread, soot, repeat, lightColor }` for green/magic/still flames.
- `fire.hitBy(raycaster)` tells you if a ray crosses the flame volume (use it to click/stoke or to damage).
- Your own post chain instead: render the scene into a target with a `depthTexture`, then
  `layer.drawOver(target.texture, target.depthTexture, camera, outTarget)` (linear light; do your own tone map).
- `layer.resolution` (0.5 default, 0.34 for weak GPUs, 1 for close-up quality at ~3x cost). No `layer.dispose()`:
  call `layer.remove(fire)` per fire.

## Drop it into the starter

1. `node tools/blocks/add.mjs fire` (copies to `my-game/vendor/fire/`, adds credits). No npm deps to add.
2. In `my-game/src/game/game.js`:
   `import { FireLayer } from '../../vendor/fire/src/fire/index.js';`
   then in `createGame(ctx)`: `const layer = new FireLayer(ctx.view.renderer);`, add fires, `scene.add(fire)`,
   and start `layer.compileAsync(camera)` (you cannot await inside `createGame`; the first frame may hitch).
3. The starter draws with `view.draw(scene, camera)` -> `renderer.render`. The layer must replace that call.
   Smallest change, in `my-game/src/render/renderer.js`: add `drawWith: null,` to `api`, and in both `draw()` and
   `capture()` replace `renderer.render(scene, camera)` with
   `api.drawWith ? api.drawWith(scene, camera) : renderer.render(scene, camera)`.
   Then in `createGame`: `ctx.view.drawWith = (s, c) => layer.render(s, c);`
4. Call `layer.update(dt)` in `update(dt, mode)` (the starter's fixed 60 Hz step is fine for it).
5. Look: the layer does its own ACES tone map and sRGB with `layer.exposure` (0.72) and `layer.bloom` (0.3). The
   starter's `toneMappingExposure = 1.1` no longer applies (the scene is drawn into a render target), so the game
   will look darker: raise `layer.exposure` until it matches. Also `view.warmUp` compiles the scene for the screen,
   not for `layer.rtScene`; wrap it in `renderer.setRenderTarget(layer.rtScene)` ... `setRenderTarget(null)` to avoid
   a slow first frame.
6. three: the starter is on ^0.187, the block was checked on 0.186.1. Not verified on 0.187. Add
   `resolve: { dedupe: ['three'] }` to `my-game/vite.config.js` so only one three is bundled.

## Gotchas

- WebGL2 only: will not run if you switch the game to `WebGPURenderer`.
- Perspective cameras only (it reads depth with the perspective projection). The starter camera is perspective.
- Transparent objects that write depth cut the flame in a straight line: give them `depthWrite: false`.
- Cost scales with flame pixels on screen. Measured on a desktop RTX 4090 at 1080p, half res: torch 0.13 ms,
  campfire 0.18 ms, bonfire 0.40 ms, crate 0.46 ms (close up 2-4x more). Not measured on weaker GPUs; expect
  integrated graphics to be roughly 15x slower. Many large fires add up; each is drawn separately.
- Each fire's shadowed point light is the expensive part on low-end machines: use `shadow: false` liberally.
- Grain near flame tips at half resolution; stylised look, not photo-real; flames do not react to objects.
- No sound ships with this block.

## Run the demo alone

`cd blocks/vendor/fire && npm install && npm run dev` (http://127.0.0.1:5391), or `npm run build` for `dist/`.
`npm test` runs `tools/test.mjs`. Demo controls: drag looks around, scroll pushes in, click the fire to stoke it.
The page's Fire/Size/Intensity/Wind sliders come from Patch's block page (`lib/patch-block.js`, only active inside
Patch's iframe); standalone the defaults are used.

## Credit

Fire by Patch (patch.gg), MIT: keep `LICENSE` and `CREDITS.txt` (three.js is MIT). Inspired by a post by
@majidmanzarpour; no code from it.
