# Oil paint: how to use

Draws a three.js world as thick oil paint. Every leaf, trunk, patch of ground and fold of cloth is a "dab" (an instanced brush stroke) pinned to the world, so the paint stays on things as the camera moves. Demo: a snowy ridge under an aurora with a cabin (default), and an autumn wood.

- Renderer: `THREE.WebGLRenderer`, WebGL2 only (raw GLSL3 `ShaderMaterial`s). No WebGPU, no node materials.
- three `0.186.1` (pinned). npm deps: `three` only (dev: `vite`, `playwright-core` for `tools/`).

## Reusable system vs demo

| Path | What it is |
|---|---|
| `src/oilpaint/` | **The painter (reusable).** `index.js` re-exports it all: `common.js` (shared uniforms + GLSL helpers), `dabs.js` (the dab), `brush.js` (brush marks made in code), `ground.js` (endless ground), `pins.js` (dabs on any mesh), `shade.js` (sun shadows), `finish.js` (final canvas pass). |
| `src/night/kit.js` | Reusable kit for made things (walls, planks, furniture): faces + palette name, strokes along the grain. `cabin.js`, `roof.js`, `details.js` use it. |
| `src/world/`, `src/night/` (rest) | Demo worlds. Best examples of `makeDab` GLSL: `world/forest.js`, `world/floor.js`, `night/snow.js`, `night/pines.js`. |
| `src/figure/` | Patch's starter man on Rapier (`man.js`, `animator.js`, `player.js`, `input.js`, `camera.js`); `figure.js` paints him with `pinDabs`; `cloak.js` is cloth. |
| `src/main.js` (wood), `src/night/main.js` (aurora), `src/boot.js`, `src/scenes.js` | Demo entry points and the `?scene=` switch. |
| `lib/patch-block.js` | Only talks to Patch's page inside an iframe; harmless standalone. Imported as bare `patch-block` through an alias in `vite.config.mjs`, and only by the demo `main.js` files. |

## API

```js
import { createShared, createBrushSheet, dabMaterial, dabGeometry, dabMesh, groundRings,
  pinDabs, createShade, createFrame } from '../../vendor/oil-paint/src/oilpaint/index.js';
```

- `shared = createShared()`: one bag of uniforms every painted material reads (`uSunDir`, `uWind`, `uHaze*`, `tHeight`/`tLand` ground maps, shade maps, `uLamp`/`uLampCol`, `uImpasto`). Then `shared.tBrush.value = createBrushSheet()`.
- **Your own dabs:** `dabMesh(dabGeometry(count, { aPos: [Float32Array, 3], ... }, dynamic), dabMaterial(shared, { head, body, minPx, maxPx, cells, uniforms }), renderOrder)`. `head` declares your per-dab attributes; `body` is GLSL `void makeDab(inout Dab d)`. **Colour and stroke direction are set here:** `d.pos`, `d.dir` (world direction the stroke runs), `d.size` (vec2 across/along, metres), `d.c1` (colour), `d.c2` (streak colour). Optional: `d.lie = 1.0` with `d.nrm`, `d.height` (lies flat on a surface), `d.base = 1.0` (pinned at its foot), `d.glaze = 1.0` (the moving shadow passes over it), `d.alive` (0 hides), `d.cell` (brush mark). GLSL helpers: `paint3(light, half, shade, lit, r)` picks one of three mixes, `jitter`, `hazed`, `sunAt`, `lampAt`, `gustAt`, `heightAt`, `normalAt`, `hash4`. `minPx`/`maxPx` clamp the dab size on screen.
- **Paint an existing mesh (rigged or not):** `pins = pinDabs(shared, palettes, parts)`. `palettes`: `[[light, half, shade, own?], ...]` as RGB arrays. `parts`: `[{ mesh, count, accept?(p), style(p, n) => ({ pal, size: [across, along], dir: Vector3 }) }]`. Returns `{ mesh, count, update() }`; add `pins.mesh` and call `pins.update()` each frame after the model moves. The source mesh still needs a painted underlayer (see `figure.js`) or hiding.
- **Ground:** `groundRings(shared, { body, per, n, cell0, levels, minPx, maxPx, cells })` returns `{ group, follow(x, z) }`. Reads `shared.tHeight` / `tLand`; fill them from your land (see `world/land.js` `createLand`) or the ground sits at y = 0.
- **Shade:** `shade = createShade(renderer, shared, stillScene, { sun, size, box, centre, back, near, far })` draws the still world's shadow once from the sun. `shade.update(scene, heroPos)` redraws a small shadow of meshes on **layer 1** round `heroPos` each frame.
- **The canvas:** `frame = createFrame(renderer, shared, { samples })` returns `{ target, uniforms, resize(), render(scene, camera) }`. It renders the scene into its own MSAA target with depth, then one full-screen pass (sun in the mist `uniforms.uShafts`, canvas weave `uCanvas`, varnish). Use `frame.render` in place of `renderer.render`.

Each frame: `shared.uTime.value = t; shared.uPixel.value = 2 * Math.tan(fov / 2) / drawingBufferHeight;` then `ground.follow(cam.x, cam.z)`, `pins.update()`, `shade.update(scene, heroPos)`, `frame.render(scene, camera)`. Call `frame.resize()` when the canvas size changes. Renderer as in the demo: `antialias: false`, `autoClear = false`, `outputColorSpace = THREE.LinearSRGBColorSpace` (colours are paint, never tone-mapped). There are no `dispose()` helpers; free geometries, materials and targets yourself if you tear a scene down.

**It owns the whole picture:** custom materials on everything, its own render target and final pass. An ordinary `MeshStandardMaterial` mesh in the same scene will not look painted, and the demo scenes have no three.js lights, so it renders dark.

## Drop it into the starter

This is a **start-from-this-scene block, not a filter.** Every visible thing has to be rebuilt as dabs with palettes. Two honest paths:

**A. Rebuild `my-game/src/game/` on the painter** (keeps the starter's loop, UI, audio, test hooks):

1. Import from the game: `'../../vendor/oil-paint/src/oilpaint/index.js'`, demo parts like `'../../vendor/oil-paint/src/world/forest.js'`.
2. Let the painter draw the frame. In `my-game/src/render/renderer.js` add a hook, so `main.js` stays unchanged and `view.ready` still counts frames:
   ```js
   let drawFrame = (scene, camera) => renderer.render(scene, camera);
   // in the api object:  setDrawer(fn) { drawFrame = fn; },
   // in draw() and capture(): replace renderer.render(scene, camera) with drawFrame(scene, camera)
   ```
   Then in `createGame`: `const buf = new THREE.Vector2(), had = new THREE.Vector2();`
   `ctx.view.setDrawer((s, c) => { ctx.view.renderer.getDrawingBufferSize(buf); if (!buf.equals(had)) { had.copy(buf); frame.resize(); } frame.render(s, c); });`
3. Set the demo's renderer options on `ctx.view.renderer` (`autoClear = false`, linear output, `setPixelRatio(Math.min(devicePixelRatio, 1.5))`). The starter's ACES tone mapping never reaches the painter's passes.
4. Move per-frame work into `update(dt)` / `render(alpha)` (uniforms, `follow`, `pins.update`, `shade.update`). Leave out the demo's `patchBlock`, `window.lab`, warm-up and `setAnimationLoop`: the starter's loop drives frames.
5. `createGame` is synchronous, but the world build is async (`prepareLand`, `createFigure`, `RAPIER.init`). Start an async build inside `createGame`, keep `update`/`render` as no-ops until it resolves, then call `ctx.view.warmUp(scene, camera)`.
6. One three: the block pins 0.186.1, the starter uses 0.187. It only uses raw GLSL3 `ShaderMaterial`s, so the step is low risk. Add `resolve: { dedupe: ['three'] }` to `my-game/vite.config.js`, which matters once someone runs `npm install` inside the vendor folder.

**B. Make the block the game's base** when the game is mostly walking the painted world: copy `vendor/oil-paint` as the project, add gameplay to `src/night/main.js` or `src/main.js`, and port the starter's UI, audio and feel into it.

## Gotchas

- Performance: about 4.5 ms a frame at 1080p, measured only on an RTX 4090; laptops untested. The wood has about 570,000 leaf dabs. For low quality, set `frame.uniforms.uShafts.value = 0`, lower `geometry.instanceCount` and cap the pixel ratio.
- Call `createShade` before the first frame, even with an empty `Scene`: it fills the shade map that `sunAt` reads.
- Textures on your models are ignored; colour comes only from palettes. Nothing is transparent (no glass). Water is strokes, not a reflection.
- The figure's `Input` asks for pointer lock on click and listens on `window` for keys, which clashes with the starter's input and its Escape/P pause. Use one input system: `Player.update(dt, inp, camYaw)` takes `{ move: {x, y}, walk, sprint, strafe, jump, look: {x, y}, zoom }`, which you can build from `ctx.input`.
- Left out of the kit, fetched by `node tools/blocks/add.mjs oil-paint` from the original repo at the pinned commit: `src/figure/rapier/rapier.mjs`, `public/figure/starter-man.glb`, `public/figure/starter-man-clips.glb`. If they are missing, the demo and anything using the figure fail to load.
- `loadMan` fetches `./figure/*.glb` relative to the page: copy `vendor/oil-paint/public/figure/` to `my-game/public/figure/`. Physics: `import RAPIER from '../../vendor/oil-paint/src/figure/rapier/rapier.mjs'; await RAPIER.init();`.
- Demo bounds: more than 78 m from the wood's path, or off the ridge, resets you to the start. The demo downloads about 9 MB.

## Demo controls and running it alone

Click to look (pointer lock), WASD move, Shift sprint, Space jump, mouse wheel steps the eye in/out, V looks through his eyes (aurora), H hides the hint, gamepad works. Two corner buttons switch scenes (`?scene=aurora`, `?scene=autumn`). URL flags: `?quality=low`, `?canvas=0`, `?shafts=0`, `?impasto=0..2`.

```
cd my-game/vendor/oil-paint && npm install && npm run dev      # http://127.0.0.1:5406
npm run build && npm run serve                                 # dist/ on http://127.0.0.1:5405
```

Credit: By Patch (patch.gg), MIT code, CC0 art; physics by Rapier (Apache-2.0). Keep `LICENSE` and `LICENCE-NOTES.md`.
