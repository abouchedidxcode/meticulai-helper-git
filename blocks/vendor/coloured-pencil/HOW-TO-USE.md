# Coloured pencil: how to use

Draws a three.js world in coloured pencil on a sketchbook page. Each surface is shaded in strokes of its own pencil that follow its form and stay put as you move, shade is a blue-violet pencil across them, a graphite line goes round each thing, and the page fades to paper at the edges. Demo: a harbour town on a bright morning with a young sailor.

- Renderer: `THREE.WebGLRenderer`, WebGL2 (`MeshLambertMaterial` patched with `onBeforeCompile`, plus one GLSL3 page pass). No WebGPU.
- three `0.186.1` (pinned). npm deps: `three` only (dev: `vite`, `playwright-core` for `tools/`).

## Reusable system vs demo

| Path | What it is |
|---|---|
| `src/pencil.js` | **The pencil (reusable).** `createPencil` (materials), `field` / `fieldBy` (stroke direction), `hue` (pencil colour), `createBatch` (merge pieces), `PENCIL` GLSL. |
| `src/page.js` | **The page (reusable).** `createPage(renderer)`: contour from depth, paper flecks, fade at the page edges. |
| `src/shape.js`, `src/noise.js` | Soft, slightly uneven solids (`ball`, `block`, `turned`, `roll`, `knead`, `ring`, `put`) and noise. |
| `src/harbour/` | Demo town: `world.js` (sky, sea, quay, pier, boats, gulls, light), `houses.js`, `quayside.js`, `tower.js`, `hills.js`, `mountains.js`. |
| `src/sailor.js` | Demo character, built on the starter man's skeleton. |
| `src/main.js`, `src/figure/` | Demo loop; starter man movement on Rapier (`man.js`, `animator.js`, `player.js`, `input.js`, `camera.js`). |
| `lib/patch-block.js` | Only talks to Patch's page inside an iframe; harmless standalone. Bare `patch-block` alias in `vite.config.mjs`, used only by `src/main.js`. |

## API

```js
import { createPencil, createBatch, field, fieldBy, hue } from '../../vendor/coloured-pencil/src/pencil.js';
import { createPage } from '../../vendor/coloured-pencil/src/page.js';
const pencil = createPencil();   // { px, make({ side, flat }), line, both, flat }
```

- **Materials:** `pencil.line` for solid things, `pencil.both` (double-sided: cloth, flags, sails), `pencil.flat` (one even line, no outline: rope, rigging, smoke). They are ordinary `MeshLambertMaterial`s with one shader chunk replaced, so lights, shadows, skinning and instancing work as usual.
- **Colour:** `hue(geometry, '#c8553d')` writes the pencil colour as a vertex colour. You can also pass a function `(x, y, z, i, nx, ny, nz) => colour`. The material's own `color` and textures are ignored.
- **Stroke direction:** `field(geometry, a, b)` writes a `hatch` attribute. Strokes run along the level lines of `dot(position, a)` (the colour layer) and `dot(position, b)` (the shadow pencil, across it). The default is a right-handed slant: `a = [0.62, 1, 0.34]`, `b = [-0.78, 1, 0.22]`. For custom flows (round a column, along a road) use `fieldBy(geometry, (x, y, z, i) => [h1, h2])`.
- **Batches:** `const b = createBatch(pencil.line); b.add(geometry, colour, a, b2); scene.add(b.build());`. It fills in normals, `hatch` and `color` if missing, drops `uv`, and merges everything into one mesh with shadows on.
- **Stroke spacing:** `pencil.px.value = 4.6 * drawingBufferHeight / 1080` (the demo's value; `?px=` in the demo).
- **The page:** `page = createPage(renderer)` returns `{ render(scene, camera), resize(), depth }`. It draws the scene into a white-cleared HalfFloat MSAA target, then one pass to screen (contour, paper, edge fade) with its own gamma.

Each frame, only `page.render(scene, camera)` is needed; the materials need nothing per frame. On a size change: `page.resize()` and reset `pencil.px`. No `dispose()` helpers.

It needs **scene lights**: the shade comes from how lit the Lambert surface is (the demo has Directional `PI * 1.25` with a 4096 shadow map, Ambient `PI * 0.27`, Hemisphere `PI * 0.2`). With no light, everything draws as full shade.

## Drop it into the starter

Of the five painterly blocks, **this one comes closest to a drop-in.** Existing meshes can be converted one by one. It is still not a post filter: each geometry needs `hatch` and `color` attributes.

1. Import from the game: `'../../vendor/coloured-pencil/src/pencil.js'`, `'../../vendor/coloured-pencil/src/page.js'`.
2. Convert meshes: `field(mesh.geometry); hue(mesh.geometry, '#3d6fb4'); mesh.material = pencil.line;`. The geometry needs normals. A geometry shared by several meshes shares one colour: clone it, or batch static scenery with `createBatch`. A skinned character works as-is (Lambert supports skinning).
3. Let the page draw the frame. In `my-game/src/render/renderer.js`:
   ```js
   let drawFrame = (scene, camera) => renderer.render(scene, camera);
   // in the api object:  setDrawer(fn) { drawFrame = fn; },
   // in draw() and capture(): replace renderer.render(scene, camera) with drawFrame(scene, camera)
   ```
   In `createGame`: `ctx.view.setDrawer((s, c) => page.render(s, c));`. Watch `ctx.view.renderer.getDrawingBufferSize()` and call `page.resize()` plus update `pencil.px` when it changes. `main.js` stays as it is.
4. Without the page pass the materials still draw, but the starter's ACES tone mapping and sRGB output then change the colours, and there is no outline or paper. Use the page.
5. Keep at least one `DirectionalLight` with shadows. The starter's `shadowMap` (PCF) is already on.
6. The sky: the page clears to paper white, so an empty sky reads as paper. For a drawn sky, copy the sky sphere from `harbour/world.js`.
7. One three: the block pins 0.186.1, the starter uses 0.187. The chunks it patches (`begin_vertex`, `opaque_fragment`) exist in 0.187. Add `resolve: { dedupe: ['three'] }` to `my-game/vite.config.js`.

For a game set in the harbour itself, copy `vendor/coloured-pencil` as the base instead, and port the starter's UI and audio into `src/main.js`.

## Gotchas

- Performance: about 2 ms a frame at 1080p on a fast desktop card (the cheapest of the five); laptops untested. Cap the pixel ratio at 1.5 as the demo does.
- Strokes are fixed to the surface in object space (`position`), so they move with a moving mesh. If you `put()` a piece into place before batching, its strokes are laid in that space.
- Contours come from depth only. Two touching surfaces at the same depth get no line between them.
- The demo's `Input` asks for pointer lock on click and listens on `window` for keys, which clashes with the starter's input and Escape/P pause. Use one input system.
- Left out of the kit, fetched by `node tools/blocks/add.mjs coloured-pencil` from the original repo at the pinned commit: `src/figure/rapier/rapier.mjs`, `public/figure/starter-man.glb`, `public/figure/starter-man-clips.glb`. `sailor.js` loads `./figure/` relative to the page, so copy `vendor/coloured-pencil/public/figure/` to `my-game/public/figure/` if you use the sailor. The demo downloads about 9 MB.

## Demo controls and running it alone

Click to look (pointer lock), WASD move, Shift sprint, Space jump, mouse wheel steps the eye in/out, H hides the hint, gamepad works. Walk off the pier, along the quay, to the lighthouse.

There is no `dev` script:

```
cd my-game/vendor/coloured-pencil && npm install && npm run build && npm run serve   # http://127.0.0.1:5476/
npx vite --config vite.config.mjs                                                    # live-reload dev server
```

Credit: By Patch (patch.gg), MIT code, CC0 art; physics by Rapier (Apache-2.0). Keep `LICENSE` and `LICENCE-NOTES.md`.
