# Realistic procedural dungeons: how to use it

A crypt generated from a seed and walked in first person: vaulted rooms on carved columns, sunken basins, worn
paving, stairs under arches, candlelight and deep shadow. The layout is also plain data (grid, rooms with roles, a
walkable grid) your game can read.

- Renderer: **WebGL2**. `createView(canvas)` makes its own `THREE.WebGLRenderer`, scene, camera and post-processing.
- three 0.186.1 (pinned), no other dependency. Plain JavaScript. Generation and the light bake run in a module worker.

## Reusable system vs demo

- System: `src/dungeon/`. `generator.js` (layout from a seed; no three, runs in Node or a worker), `floors.js` (`floorAt` heights, stairs, basins), `level.js` (`buildLevel`: geometry and baked light field), `crypt.js` (`buildCrypt`: vaults, columns, arches, candles; returns the lamps), `skin.js`, `paving.js`, `masonry.js`, `themes.js`, `view.js` (`createView`: renderer, materials, lights, post), `walker.js` (round body sliding on walls), `build-worker.js`. Plus `public/assets/materials/` (three Poly Haven stone/dirt scans).
- Demo: `src/main.js` (295 lines). It is also the integration recipe: worker start-up, texture loading, two shadow-casting lamp slots (`makeShadowLights`, `placeLights`), the contact-shadow depth pass (`setUpDepth`), input and the loop. `src/patch-block.js` talks to Patch's page only inside an iframe; harmless standalone.

## API

```js
import { generateDungeon, cellToWorld, ROLES } from '.../src/dungeon/generator.js';
import { buildLevel } from '.../src/dungeon/level.js';
import { createView, CELL_M } from '.../src/dungeon/view.js';     // CELL_M = 1.5 metres per cell
import { buildCrypt } from '.../src/dungeon/crypt.js';
import { floorAt } from '.../src/dungeon/floors.js';
import { createWalker } from '.../src/dungeon/walker.js';

const view = createView(canvas, { pixelCap: 1.25 });
view.setScans({ wall, floor, plaster });   // each { color, normal, roughness, height } textures, see main.js `scan()`
view.setMasonry(data);                     // from the worker's 'masonry' message
// worker: postMessage({ type: 'level', id: 1, params: { seed, rooms: 24, loops: 0.3, decor: 0.6, theme: 'verdant' } })
view.setLevel(dungeon, level, { reveal: false });
const lamps = buildCrypt(view, dungeon, level);
const walker = createWalker(dungeon); walker.start();      // stands in the entrance; units are cells
// each frame
walker.step(dt, forward, strafe, cellsPerSecond);           // walker.x, .z, .yaw, .pitch, .room(), .cell()
view.rig.eye.set(x * CELL_M, eyeY * CELL_M, z * CELL_M); view.rig.eyeYaw = yaw; view.rig.eyePitch = pitch;
view.frame(time, dt);                                       // draws everything; view.resize() on window resize
```

- Data (`dungeon`): `W`, `H`, `grid` (0 void, 1 floor, 2 wall, 3 pool), `walkable` (Uint8Array, for pathfinding), `rooms` (each with `id`, `type` = role: `entrance combat elite treasure shrine boss`, `x0 y0 x1 y1` bounds in cells), `entrance`, `boss`, `path` (room ids entrance to boss), `spawns` (`{ x, y, tier, roomId }`), `props`, `torches`, `name`.
- Cells to metres: `cellToWorld(dungeon, cx, cy, CELL_M)`. Floor height in cells: `floorAt(dungeon, wx + dungeon.W / 2, wz + dungeon.H / 2)`.
- Themes: `ancient molten frost grim verdant`. Only `verdant` has `crypt: true` (the realistic crypt look the demo shows); the others are untested with this view.
- `view` also exposes `renderer`, `scene`, `camera`, `group`, `materials`, `stoneMaterials`, `carriedLight`, `setPixelCap(n)`, `beforeScene` (hook run before the scene pass). No dispose.

## Drop it into the starter (`my-game/`)

This is a **start-from-this-scene block**, not a drop-in: the view owns the renderer, the camera and the post, and
loading is async. Honest path: keep the starter's loop, UI and juice, and make the dungeon view the renderer.

1. `node tools/blocks/add.mjs realistic-procedural-dungeons`. Copy `vendor/realistic-procedural-dungeons/public/assets/materials/` to `my-game/public/assets/materials/`.
2. `vite.config.js`: add `resolve: { dedupe: ['three'] }` and `worker: { format: 'es' }` (the worker imports modules).
3. In `src/main.js`, replace `createRenderer()` with an adapter: make a canvas (`className = 'game-canvas'`, `tabIndex = 0`, appended to `document.body`), `const dv = createView(canvas)`, and build `view = { renderer: dv.renderer, canvas, get width(){...}, get height(){...}, ready, addCamera: (c) => c, warmUp() {}, draw() { dv.frame(time, dt); drawn++ }, capture() { dv.frame(time, 0); return canvas.toDataURL('image/png') } }`, plus `addEventListener('resize', () => dv.resize())`. Don't call `createRenderer()` too: two WebGLRenderers on one page fight.
4. Do the async load (textures, worker, `setLevel`, `buildCrypt`, lamps, `setUpDepth`) from the demo's `start()` before `createGame(ctx)`, with `await` at the top level, and pass `dv`, `dungeon` and `lamps` in `ctx`. Use the worker URL `new URL('../vendor/realistic-procedural-dungeons/src/dungeon/build-worker.js', import.meta.url)` from `src/main.js`.
5. In the game: `scene = dv.scene`, `camera = dv.camera`. Move the camera only through `dv.rig` (set `dv.rig.t = 1` for first person, `rig.fov`); `view.frame` overwrites `camera.position` every frame. Copy `syncEye`, `placeLights` and the walker step from `src/main.js` into `update`.
6. Don't apply the starter's renderer settings: the view uses `LinearSRGBColorSpace`, `NoToneMapping` and its own post on purpose. `watchWebGL` still works.
7. Your things go in `dv.scene` at metre scale. Shadows are drawn once (`shadowMap.autoUpdate = false`): set `dv.renderer.shadowMap.needsUpdate = true` after adding shadow casters, or give moving things `castShadow = false`.

## Gotchas

- Heavy: about 3.5 million triangles a frame across its passes where the walk starts; tested on a fast graphics card only. `setPixelCap(1)` and fewer `rooms` help.
- Only architecture is drawn: rooms are empty until you place enemies, chests, etc. by `type`.
- Generation is deterministic per seed (no `Math.random`), so a seed is a level you can share. `?seed=4242` in the demo.
- Pointer lock in the demo (click to look): headless tests need it faked. `?debug` gives `window.__dungeon` with `look(x, z, yawDeg, pitchDeg)` for stills.
- The source README mentions `shots/` and `tools/check-generator.mjs`; they are not in this copy.

## Run the demo alone

```sh
cd vendor/realistic-procedural-dungeons && npm install
npm run dev        # http://127.0.0.1:5394/   (?seed=4242 for another dungeon, ?debug for window.__dungeon)
npm run build      # dist/ with THIRD-PARTY-NOTICES.md (serve dist/ with any static server, e.g. npx vite preview)
```

Controls: click to look around, WASD or arrows to walk, Shift to run. Silent.

## Credit

Realistic Procedural Dungeons by blendi (blendi-bylygbashi, Patch), building on Patch's Dungeons block and Dungeon Forge by Majid Manzarpour, all MIT; textures CC0 (Poly Haven). Keep `LICENSE`, `public/CREDITS.md` and all of `public/LICENSES/`.
