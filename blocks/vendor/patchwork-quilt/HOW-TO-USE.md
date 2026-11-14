# Patchwork quilt: how to use

Makes a three.js world out of hand-sewn cloth, shot like a photo of a small thing on a table: puffed quilt patches with real seams and stitches, felt with fibres, crease shading, and a shallow depth of field. Demo: a small felt country sewn into an unfinished quilt, with a stop-motion rag doll.

- Renderer: `THREE.WebGLRenderer`, WebGL2. Ordinary `MeshPhysicalMaterial` / `MeshStandardMaterial` cloth, plus its own GLSL3 post chain. No WebGPU.
- three `0.186.1` (pinned). npm deps: `three` only (dev: `vite`, `playwright-core` for `tools/`).

## Reusable system vs demo

| Path | What it is |
|---|---|
| `src/fabric.js` | **Cloth (reusable).** `createFabrics()`: woven normal maps and printed cottons made in code, handed out as materials. |
| `src/sew.js` | **Sewing helpers (reusable).** `createStitches`, `clothUV`, `stuffedBox`, `strip`, `ribbon`, `tapeTexture`, `fuzz` + `fuzzFrame`, `cast`. |
| `src/quilt.js` | **The quilt (reusable).** `sewQuilt(fabrics, Q, mound, opts)`; `createQuilt` is the small table quilt. |
| `src/post.js` | **The camera (reusable).** `createPost(renderer)`: crease shading, focus blur, film develop. |
| `src/country/buildings.js`, `src/country/nature.js` | Makers that take a `kit`: cottage, church, windmill, washing line, pom-pom and felt trees, sheep, bales, grass, flowers, river, road, clouds, mountains. |
| `src/making/` | The default demo scene: `world.js` (assembly and the `kit` object), `land.js`, `room.js`, `work.js`. Also `?scene=table` (`table-world.js`, `table.js`, `scenery.js`) and `?scene=country` (`country/world.js`, `fields.js`, `land.js`). |
| `src/doll.js`, `src/cape.js`, `src/main.js`, `src/figure/` | Demo doll and felt cape, demo loop, starter man movement on Rapier. |
| `lib/patch-block.js` | Only talks to Patch's page inside an iframe; harmless standalone. Bare `patch-block` alias in `vite.config.mjs`, used only by `src/main.js`. |

## API

```js
import { createFabrics } from '../../vendor/patchwork-quilt/src/fabric.js';
import { clothUV, stuffedBox, createStitches, ribbon, fuzz, fuzzFrame, cast } from '../../vendor/patchwork-quilt/src/sew.js';
import { sewQuilt } from '../../vendor/patchwork-quilt/src/quilt.js';
import { createPost } from '../../vendor/patchwork-quilt/src/post.js';
const fabrics = createFabrics();
```

- **Materials:** `fabrics.cotton(print, colours, { size, vertexColors })`. Prints: `solid`, `gingham`, `stripes`, `ticking`, `dots`, `ditsy`, `plaid`; `colours` is an array of hex strings, and `size` is world units per repeat. Plain cloth: `felt(hex)`, `wool(hex)` (knit), `denim(hex)`, `linen(hex)`, `corduroy(hex, { wale })`, `satin(hex)`, `thread(hex)`. Each takes extra material options as a last argument.
- **UVs are world units** (one UV unit = one metre), so a print is the same size everywhere. Run `clothUV(geometry)` on your own geometry, or build with `stuffedBox(w, h, d, bulge)`.
- **Quilt:** `sewQuilt(fabrics, { w, d, s, nx, nz }, mound, { seed, uneven, skip, unbound })` returns `{ group, surface(x, z), corner, counts }`. `mound(x, z)` is the land under the quilt. `s` is the patch size. `skip(x, z)` leaves patches out; `unbound(x, z)` leaves the binding off. `surface(x, z)` gives the real puffed top height for placing things.
- **Details:** `const st = createStitches(fabrics.thread()); st.run(a, b, { every, long, colour }); group.add(st.build());`. `ribbon(points, width, heightFn, opts)` lays a strip over the surface. `mesh.add(fuzz(mesh.geometry, density, { long, colour, lean }))` adds felt fibres; set `fuzzFrame.value = frameNumber` to make them boil like stop-motion.
- **Post:** `post = createPost(renderer)` returns `{ render(scene, camera, focusDistance), resize(), lens, most, reach, deep, focus, develop, overlay, depth }`. It renders to a HalfFloat MSAA target, then crease shading (`deep`, `reach`), focus blur (`lens`, `most`; `lens = 0` turns it off), then develop (its own ACES fit, gamma, vignette, grain; `post.develop.uExposure`, `uGrain`, `uTime`). `overlay` is an optional scene drawn unblurred over the result.

Each frame: `post.render(scene, camera, camera.position.distanceTo(focusPoint))`. The demo also steps a 12 fps "film" (`fuzzFrame.value`, `post.develop.uTime.value = frame`, `world.step(frame)`) and poses the doll 15 times a second (`rate` / `doll.pose()` in `main.js`). On a size change, call `post.resize()`. No `dispose()` helpers.

Lights are ordinary three.js lights. The demo uses a warm key `DirectionalLight` (3.5) with shadows, a warm edge light (1.5) and a cool fill (0.45) in `making/world.js`.

## Drop it into the starter

**This is the friendliest of the five for a starter game.** The materials are standard PBR, so starter meshes can switch to cloth directly and keep the starter's lights. The post is optional but carries the "tiny thing on a table" look.

1. Import from the game with the paths above (`'../../vendor/patchwork-quilt/src/...'`).
2. Re-dress meshes: `clothUV(mesh.geometry); mesh.material = fabrics.felt('#c2473d');`. Use `stuffedBox` for crates and blocks, and `sewQuilt` for a ground.
3. For the camera look, let the post draw the frame. In `my-game/src/render/renderer.js`:
   ```js
   let drawFrame = (scene, camera) => renderer.render(scene, camera);
   // in the api object:  setDrawer(fn) { drawFrame = fn; },
   // in draw() and capture(): replace renderer.render(scene, camera) with drawFrame(scene, camera)
   ```
   In `createGame`: `ctx.view.setDrawer((s, c) => post.render(s, c, c.position.distanceTo(player.position)));`. Watch `ctx.view.renderer.getDrawingBufferSize()` and call `post.resize()` when it changes. `main.js` stays as it is.
4. With the post, its own ACES fit and gamma replace the starter's. Render targets skip three's tone mapping, so nothing is applied twice. Without the post, the starter's ACES applies as normal.
5. Scale matters. The blur and crease reach are tuned for a camera a few units from a roughly 40 x 30 unit quilt with FOV 30. Tune `post.lens`, `post.most` and `post.reach` if your camera is far off.
6. One three: the block pins 0.186.1, the starter uses 0.187. Add `resolve: { dedupe: ['three'] }` to `my-game/vite.config.js`.

For a game played on the demo's quilt, copy `vendor/patchwork-quilt` as the base and port the starter's UI and audio into `src/main.js`.

## Gotchas

- Performance: about 7 ms a frame at 1080p on a fast desktop card, mostly 1,270 patches and 18,000 stitches drawn twice (once for shadows); laptops untested. `MeshPhysicalMaterial` sheen costs extra on weak GPUs. Cut the patch count (`nx`, `nz`), stitches or shadow casters if it is slow.
- Each patch is its own mesh, and the fabric textures are drawn on canvases at start-up. `createFabrics()` takes a moment, so call it once and share it.
- The demo's P key changes the doll's pose rate, but P pauses the starter. Its `Input` asks for pointer lock on click and listens on `window` for keys. Use one input system.
- Left out of the kit, fetched by `node tools/blocks/add.mjs patchwork-quilt` from the original repo at the pinned commit: `src/figure/rapier/rapier.mjs`, `public/figure/starter-man.glb`, `public/figure/starter-man-clips.glb`. `doll.js` loads `./figure/` relative to the page, so copy `vendor/patchwork-quilt/public/figure/` to `my-game/public/figure/` if you use the doll. The demo downloads about 9 MB.

## Demo controls and running it alone

Click to look (pointer lock), WASD move, Shift sprint, Space jump, mouse wheel steps the eye in/out, H hides the hint, P cycles the doll's pose rate (15, 24, every frame, 12), gamepad works. URL flags: `?scene=table`, `?scene=country`, `?lens=0`, `?ao=0`, `?fps=`.

There is no `dev` script:

```
cd my-game/vendor/patchwork-quilt && npm install && npm run build && npm run serve   # http://127.0.0.1:5412/
npx vite --config vite.config.mjs                                                    # live-reload dev server
```

Credit: By Patch (patch.gg), MIT code, CC0 art; physics by Rapier (Apache-2.0). Keep `LICENSE` and `LICENCE-NOTES.md`.
