# Painted valley: how to use

A summer valley drawn like a hand-painted animated-film background: flat clean colour, heaped clouds, painted mountains, a village and a meadow of brush marks, with a cel-shaded, ink-outlined wanderer. A whole place with its own sky, hours (noon to sunset) and render pipeline.

- Renderer: `THREE.WebGLRenderer`, WebGL2 (GLSL3 shaders throughout). No WebGPU.
- three `0.186.1` (pinned). npm deps: `three` only (dev: `vite`, `playwright-core` for `tools/`).

## Reusable system vs demo

| Path | What it is |
|---|---|
| `src/lib/` | **Grass and frame (reusable).** From Patch's touch-grass block. `index.js`: `createField` (grass, flowers and ground that bend, cut and burn), `bakeGround`, `loadGroundTextures`. `frame.js`: `createFrame` (HDR, fire, bloom, tone map, Kuwahara paint finish, ink lines). |
| `src/valley/sky.js`, `clouds.js`, `backdrop.js` | Sky and hours, ray-marched cumulus, painted mountains and foothills. Reusable as a sky if you keep the field. |
| `src/valley/wanderer.js` | Cel look for any mesh, rigged or not: lit and shade colour plus an ink line number. |
| `src/valley/world.js` | The land: `heightAt`, `paint`, paths, tarn, river, `START`, `HERO`, shared palette. Edit this to change the place. |
| `src/valley/horizon.js`, `floor.js`, `farwoods.js`, `village.js`, `trees.js`, `dressing.js`, `water.js`, `strokes.js` | Demo scenery: the plain out to 6 km, village, near trees, stones and seeds, tarn, brush-dab texture. |
| `src/valley/main.js` | **The demo and the real entry point:** start-up order, walker, keys, loop (about 700 lines). |
| `src/valley/sounds.js`, `bake.worker.js` | Ambient sound; ground baking on a worker. |
| `src/figure/` | Starter man and movement on Rapier (`man.js`, `animator.js`, `player.js`, `input.js`, `camera.js`, `cloak.js`). |
| `lib/patch-block.js` | Only talks to Patch's page inside an iframe; harmless standalone. Bare `patch-block` alias in `vite.config.mjs`, used only by `valley/main.js`. |

## API (the start-up order from `valley/main.js`)

```js
import { bakeGround, createField, createFrame, loadGroundTextures } from '../../vendor/painted-valley/src/lib/index.js';
import { createSky, createSkyParts, SUNSET } from '../../vendor/painted-valley/src/valley/sky.js';
import { heightAt, paint, START } from '../../vendor/painted-valley/src/valley/world.js';

const GROUND = { extent: 1280, extentRes: 1280, centre: [0, 0] };
const parts = createSkyParts(renderer, { cloudSize: 2048, cloudSteps: 240, backdropWidth: 12288 });
await parts.clouds.compile(); await parts.backdrop.compile(); parts.backdrop.paint(); parts.light(15.5);
const field = createField({ heightAt, paint, ...GROUND, size: 256, baked: await bakeGround({ heightAt, paint, ...GROUND }),
  textures: await loadGroundTextures(renderer, './textures/'), density: 1, height: 0.5, seed: 3 });
const frame = createFrame(renderer, field, { samples: 4, bloom: 0.1 });
const sky = createSky(renderer, field, { parts });
scene.add(field.group, sky.mesh /*, createTrees(field).group, createHorizon(field, 640), ... */);
frame.paint = 3;          // paint finish strength, 0 off
sky.setHour(15.5);        // 12 noon .. SUNSET (20.4)
```

The demo also sets `field.uniforms.tFloor` (`createFloor`), `tStrokes` (`createStrokes`), `tSlope`, `uHeroEye`, `uFloor` and `uFloorInv`. Copy that block from `main.js`, or far ground and brushwork stay blank.

- Each frame: `field.update(dt, camera); frame.update(dt, camera); sky.update(dt, camera); frame.exposure = sky.exposure; frame.render(scene, camera);`. After an hour change: `trees.cast(sky.sunDir)`.
- `frame.render` replaces `renderer.render`. It owns the pipeline (HDR target, fire volume, smoke, bloom, filmic tone map, paint finish, ink lines) and resizes its own targets from the drawing buffer on every call, so no resize call is needed. `await frame.compile(scene, camera)` warms the shaders in slices.
- **Field controls:** `bend(x, z, r, dx, dz, amount)`, `cutLine(...)`, `cut(x, z, r)`, `ignite(x, z, r)`, `stateAt(x, z)`, `setWind(angle, speed, gust)`, `setPusher(slot, x, y, z, r)` (up to 6 things the grass parts round), `setLight({...})`, `setLamp(...)`, `heightAt(x, z)`. `field.uniforms.uWalker = (x, z, darkness, length)` lays one walker's shadow.
- **Your own meshes:** ordinary meshes are painted by the finish. Write alpha below 0.6 to be left crisp (a character, a world-space HUD). **The valley has no three.js lights**: everything lights itself from `field.uniforms` (`uSunDir`, `uSunColor`, `uSkyColor`). A `MeshStandardMaterial` needs a `DirectionalLight` along `sky.sunDir` plus a `HemisphereLight` that you add and update.
- **Cel people:** `createWanderer(field, onProgress, clothes)` dresses the starter man; copy its `paint()` material for your own characters (lit colour, shade colour, ink number below 0.23; different numbers get a line between them).
- No `dispose()` helpers.

## Drop it into the starter

**This is a start-from-this-place block, not a filter or a material.** The look comes from the field, sky and frame together, and the start-up is long and async.

**Recommended: make the block the game's base** when the game happens in the valley. Copy `vendor/painted-valley` as the project, put gameplay into `src/valley/main.js` (its `tick`), and port the starter's UI, audio and feel into it.

**If you keep the starter's shell:**

1. Import from the game with the paths above (`'../../vendor/painted-valley/src/...'`).
2. In `my-game/src/render/renderer.js` add a drawer hook so `main.js` and `view.ready` stay as they are:
   ```js
   let drawFrame = (scene, camera) => renderer.render(scene, camera);
   // in the api object:  setDrawer(fn) { drawFrame = fn; },
   // in draw() and capture(): replace renderer.render(scene, camera) with drawFrame(scene, camera)
   ```
   Then `ctx.view.setDrawer((s, c) => frame.render(s, c));`. The frame tone-maps itself and renders to targets, so the starter's ACES never applies twice.
3. `createGame` is synchronous: run the start-up above in an async function, keep `update`/`render` as no-ops until it resolves, then `await frame.compile(...)`. Use a camera like the demo's (`fov 68, near 0.12, far 40000`).
4. Copy the public assets the code fetches relative to the page: `vendor/painted-valley/public/textures/` to `my-game/public/textures/`, `public/figure/` (for the wanderer), and `public/audio/` (footsteps).
5. One three: the block pins 0.186.1, the starter uses 0.187. Add `resolve: { dedupe: ['three'] }` to `my-game/vite.config.js`. The worker (`new URL('./bake.worker.js', import.meta.url)`) bundles fine with the starter's Vite.

## Gotchas

- Heavy start: the clouds are ray-marched into a cube map and the mountains painted at load. A first visit takes about 8 s even on an RTX 4090, and the demo downloads about 13 MB. Per-frame cost is measured only on that card. `?quality=low|medium` maps to smaller `createSkyParts` sizes, lower field `density`, `samples: 0` and `frame.paint` 0 or 2; copy that for laptops.
- Sound: five ambient recordings (Sonniss GDC bundle licence) are **not** in the repo and must never be committed. Only the footsteps (Kenney, CC0) ship. `sounds.js` reads `./audio/manifest.json`, which only `npm run build` writes; without it, sound silently stays off. See `MISSING_ASSETS.md`.
- The valley is about 2 km across, and walking past the edge turns you back. Noon to sunset only; no night.
- `main.js` handles its own keys (T, 1-4, 0, `,`, `.`, V, P) and pointer lock. P clashes with the starter's pause.
- Left out of the kit, fetched by `node tools/blocks/add.mjs painted-valley` from the original repo at the pinned commit: `src/figure/rapier/rapier.mjs`, `public/figure/starter-man.glb`, `public/figure/starter-man-clips.glb`.

## Demo controls and running it alone

Click to look (pointer lock), WASD move, Shift sprint, Alt walk, Space jump, mouse wheel brings the eye in/out, V first person, T next time of day, 1-4 jump to noon / afternoon / golden hour / sunset, `,` `.` nudge the hour, 0 lets the day pass, P toggles the paint finish, gamepad works.

```
cd my-game/vendor/painted-valley && npm install && npm run dev   # http://127.0.0.1:5384
npm run build && npm run serve                                   # dist/ on http://127.0.0.1:5383
```

Credit: By Patch (patch.gg), MIT code, CC0 art; ground textures ambientCG (CC0), footsteps Kenney (CC0), physics Rapier (Apache-2.0). Keep `LICENSE`, `LICENCE-NOTES.md` and `MISSING_ASSETS.md`.
