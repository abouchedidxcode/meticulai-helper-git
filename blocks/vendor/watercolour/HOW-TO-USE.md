# Watercolour: how to use

A three.js world that starts as a pencil drawing on paper and gets painted in watercolour as the player walks through it. The wash spreads from the player's feet, climbs each tree from its roots and stays where you have been. Demo: the edge of a wood, a stream, a meadow and a tree in blossom, with a girl in a red hooded cloak.

- Renderer: `THREE.WebGLRenderer`, WebGL2 (`MeshLambertMaterial`s patched with `onBeforeCompile`, plus GLSL3 passes). No WebGPU.
- three `0.186.1` (pinned). npm deps: `three` only (dev: `vite`, `playwright-core` for `tools/`).

## Reusable system vs demo

| Path | What it is |
|---|---|
| `src/wash.js` | **The paint (reusable).** `createWash` (map of when paint arrived + all materials), `createBatch` (solid things), `createDabs` (brush touches: leaves, grass, flowers). |
| `src/page.js` | **The paper (reusable).** `createPage(renderer)`: wet-into-wet bleeding, pencil outlines from depth, paper grain. |
| `src/pencil.js` | GLSL for pencil hatching plus `field`, `fieldBy`, `hue` (attribute helpers `wash.js` uses). Its `createPencil` is the coloured-pencil block's material and is unused here. |
| `src/shape.js`, `src/noise.js` | Soft solids to build things from (`ball`, `block`, `turned`, `roll`, `knead`, `put`), and noise. |
| `src/glade/world.js` | Demo world: ground, stream, trees (`tree`, `fir`, `willow`, `bush`), flowers, far wood, hills, sky, light, the final flood. |
| `src/hood.js` | Demo character: the girl, built on the starter man's skeleton (his body is hidden). |
| `src/main.js`, `src/figure/` | Demo loop; starter man movement on Rapier (`man.js`, `animator.js`, `player.js`, `input.js`, `camera.js`). |
| `lib/patch-block.js` | Only talks to Patch's page inside an iframe; harmless standalone. Bare `patch-block` alias in `vite.config.mjs`, used only by `src/main.js`. |

## API

```js
import { createWash, createBatch, createDabs } from '../../vendor/watercolour/src/wash.js';
import { createPage } from '../../vendor/watercolour/src/page.js';
const wash = createWash({ x0: -46, z0: -50, size: 92, cells: 256, reach: 14, speed: 11 });
```

`wash` gives `{ paint, uniforms, px, solid, both, always, alwaysBoth, water, hill, beam, dab, dabDepth }`.

- **Solid things:** `const b = createBatch(wash.solid); b.add(geometry, '#pigment', a, b2, root); scene.add(b.build());` makes one merged mesh. `colour` is the pigment (written as vertex colour). `a`, `b2` are two direction vectors (`[x, y, z]`): the pencil hatching runs along the level planes of each (default: a right-handed slant). `root` is `[x, y, z, secondsPerMetre]`, the point a thing takes its paint from and how fast colour climbs it (a tree: its foot). Leave `root` out for ground, where each point is its own root. Materials: `solid` (front faces), `both` (double-sided), `always` / `alwaysBoth` (painted from the start, e.g. the player), `water` (the stream).
- **Brush touches:** `const d = createDabs(wash.dab, wash.dabDepth); d.add(x, y, z, { w, h, kind, colour, turn, seed, normal, at, line, sway }); scene.add(d.build());`. Kinds: 0 soft mass behind leaves, 1 grass tuft, 2 flower (`sway` = petal count), 3 falling petal, 4 butterfly, 5 leaves, 6 first wet wash of a bough, 7 dust mote, 8 stem. `at` is the root, `line: true` means the touch shows as pencil before the paint arrives.
- **Spreading paint:** `wash.paint.touch(x, z, now)` puts paint down there (it spreads about `reach` m). `flood(x, z, now, seconds, span)` sends one wave over everything. `all()` / `none()` paint or clear the whole page. `at(x, z)` and `done(now)` report progress (0..1). Call `wash.paint.sync()` once per frame to upload the map. `now` is `wash.uniforms.uNow.value`, which you advance yourself.
- **Pencil spacing:** `wash.px.value = 4.6 * drawingBufferHeight / 1080` (the demo's value).
- **Hills:** `wash.hill` needs `root`, `hill`, `hillB` attributes; copy the ranges code from `glade/world.js`.
- **The page:** `page = createPage(renderer)` returns `{ render(scene, camera), resize(), wet, depth }`. It draws the scene into a white-cleared HalfFloat MSAA target, then one paper pass to the screen with its own gamma. `page.wet.value = 0` gives crisp edges.

Each frame: `wash.uniforms.uNow.value += dt; wash.paint.touch(feet.x, feet.z, wash.uniforms.uNow.value); wash.paint.sync(); page.render(scene, camera);`. On a size change: `page.resize()` and reset `wash.px`. No `dispose()` helpers.

**It hooks the renderer** by owning the frame (`page.render` replaces `renderer.render`) and by custom materials. It still uses three's lights and shadow maps: **the scene must contain at least one `DirectionalLight`**, because the shaders read `directionalLights[0]` and fail to compile without one. Demo light: Directional `PI * 1.25` with a 4096 shadow map, Ambient `PI * 0.27`, Hemisphere `PI * 0.2`, and `renderer.shadowMap.enabled = true`.

## Drop it into the starter

**Start from this scene, not a filter.** A starter mesh can't just take `wash.solid`: without the `hatch`, `color` and `root` attributes it comes out black with no strokes. Each thing is rebuilt through `createBatch` / `createDabs`. That is mechanical for simple shapes, so path A is realistic for small games:

**A. Rebuild `my-game/src/game/` with the wash:**

1. Import from the game: `'../../vendor/watercolour/src/wash.js'`, `'../../vendor/watercolour/src/page.js'`, `'../../vendor/watercolour/src/shape.js'`.
2. Let the page draw the frame. In `my-game/src/render/renderer.js`:
   ```js
   let drawFrame = (scene, camera) => renderer.render(scene, camera);
   // in the api object:  setDrawer(fn) { drawFrame = fn; },
   // in draw() and capture(): replace renderer.render(scene, camera) with drawFrame(scene, camera)
   ```
   In `createGame`: `ctx.view.setDrawer((s, c) => page.render(s, c));`. Watch `ctx.view.renderer.getDrawingBufferSize()` and call `page.resize()` plus update `wash.px` when it changes. `main.js` stays as it is.
3. Rebuild every mesh with `createBatch(wash.solid).add(geometry, colour, a, b, root)`. Moving things get their own batch: `build()` once, then move the mesh. Use `wash.always` for the player and anything that should never be bare pencil.
4. Put a `DirectionalLight` in the scene (light index 0 is the sun). Keep `shadowMap.enabled` (the starter already has it). The starter's ACES and sRGB settings don't reach the page pass, so leave them.
5. Make `createWash({ x0, z0, size })` cover your whole play area. Outside it nothing ever gets painted.
6. Call `touch` from whatever should paint: the player's feet, a projectile, a pickup.
7. One three: the block pins 0.186.1, the starter uses 0.187. The shader chunks it patches (`begin_vertex`, `project_vertex`, `opaque_fragment`) exist in 0.187. Add `resolve: { dedupe: ['three'] }` to `my-game/vite.config.js`.

**B. Make the block the game's base** for a walk-and-reveal game in the glade: copy `vendor/watercolour`, add gameplay to `src/main.js` / `glade/world.js`, and port the starter's UI and audio in.

## Gotchas

- Performance: 4 to 6 ms a frame at 1080p on a fast desktop card; laptops untested. The demo has about 650,000 dabs, and building the world takes about 4.5 s at load. `createDabs` grows its arrays as you add.
- `paint.flood` and `paint.all` loop over every map cell: call them once, not every frame.
- With `autoClear` the paper is the clear colour (white). The sky is a mesh in `glade/world.js` (`wash.sky`) that follows the camera.
- The demo's `Input` asks for pointer lock on click and listens on `window` for keys, which clashes with the starter's input and Escape/P pause. Use one input system.
- Left out of the kit, fetched by `node tools/blocks/add.mjs watercolour` from the original repo at the pinned commit: `src/figure/rapier/rapier.mjs`, `public/figure/starter-man.glb`, `public/figure/starter-man-clips.glb`. `hood.js` loads `./figure/` relative to the page, so copy `vendor/watercolour/public/figure/` to `my-game/public/figure/` if you use the girl.
- URL flags in the demo: `?painted` (everything painted from the start), `?wet=0`, `?px=5`. The demo downloads about 9 MB.

## Demo controls and running it alone

Click to look (pointer lock), WASD move, Shift sprint, Space jump, mouse wheel steps the eye in/out, H hides the hint, gamepad works. Follow the path, cross the stream, reach the tree in blossom for the final wash.

There is no `dev` script:

```
cd my-game/vendor/watercolour && npm install && npm run build && npm run serve   # http://127.0.0.1:5483/
npx vite --config vite.config.mjs                                                # live-reload dev server
```

Credit: By Patch (patch.gg), MIT code, CC0 art; physics by Rapier (Apache-2.0). Keep `LICENSE` and `LICENCE-NOTES.md`.
