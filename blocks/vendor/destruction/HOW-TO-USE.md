# Destruction physics: how to use it

Breakable structures on the GPU: hundreds of box pieces welded with fixed joints that snap under load, knocked down by
cannonballs. Physics is a vendored copy of three-avbd (GPU rigid bodies in WebGPU compute shaders).
Renderer: **WebGPU only** (`three/webgpu` `WebGPURenderer`; no WebGL fallback). three 0.186.1. npm deps: `three` only
(three-avbd is vendored source in `vendor/three-avbd/`). Source is TypeScript; Vite compiles it, no `tsc` needed.

## What to copy

- **Physics library:** `vendor/three-avbd/` (`src/lib/index.ts`: `World`, `Body`, `Joint`, `BodyMesh`,
  `recommendedLimits`; `src/lib/advanced.ts`: buffer layout constants). Needs the two Vite aliases below.
- **Reusable helpers on top (z-up, metres/tonnes/kN):** `src/physics/builder.ts` (`Builder`: `box`, `span`,
  `member`, `weld`, `autoWeld`), `src/physics/materials.ts` (`MATS`, `WELDS`), `src/physics/structure.ts`
  (`Structure.build`, `settle`, load-based weld arming, `createWorld`), `src/level/structures.ts`
  (`build('barn' | 'tower' | 'wall' | 'chimney')`), `src/render/pieces.ts` (instanced textured pieces drawn
  straight from the GPU buffer; loads `textures/<name>_{diff,nor,arm}.webp` from `public/`).
- **Tied to the demo's `View`** (need its `scene`, `flash`, `terrainHeight`): `src/game/site.ts` (`Site`),
  `src/game/cannon.ts` (`Cannon`, the no-tunnel cannonball), `src/game/fx.ts`, `src/render/view.ts`
  (renderer, sky, post), `src/fx/particles.ts`, `src/audio/`. Demo only: `src/demo.ts`, `lib/patch-block.js`.

## API (three-avbd)

```js
import * as THREE from 'three/webgpu';
import { World, BodyMesh } from 'three-avbd';
await renderer.init();                                    // WebGPURenderer, see limits below
const world = await World.create({ renderer, maxBodies: 4096, gravity: [0, 0, -9.81], iterations: 12 }); // z up!
world.addBox({ size: [40, 40, 1], position: [0, 0, -0.5], fixed: true });          // ground
const a = world.addBox({ size: [0.44, 0.2, 0.14], position: [0, 0, 0.07], density: 1900 });
world.addJoint(a, b, { anchorA, anchorB, breakForce: 6000, breakOnPull: true });  // brittle weld (mortar)
// plastic weld (timber/steel): add yieldForce and breakBend instead of breakOnPull
scene.add(new BodyMesh(world, { material: new THREE.MeshStandardNodeMaterial({ color: 0x9a4a32 }) }));
world.onBreak((joint) => crack(joint));   world.readbackEvery = 3;   // fresh body.position for game logic
// impact: GPU raycast (resolves a frame or two later), then push
const h = await world.raycast(origin, dir, { maxDistance: 100 });
if (h?.body) h.body.applyImpulse([dir[0] * 400, dir[1] * 400, dir[2] * 400], h.point);
// or cut a weld yourself: joint.remove();  explode: world.addSphere(...) with a velocity
// every frame:
world.update(dtSeconds);   // runs fixed steps of world.dt (at most world.maxSubsteps), then render normally
world.destroy();           // when done
```

Building a structure with the demo's helpers: `const plan = build('wall')` -> `Structure.build(world, plan.builder,
{ strength: 1, density: 1, friction: 1 })`, then call `structure.settle(3)` each frame until it returns true
(`structure.armed`): welds are unbreakable while it settles, then armed at margin x standing load. Use
`createWorld(renderer, maxBodies)` from `structure.ts` (sets dt 1/60, 12 iterations, contact storage) and draw with
`PieceMesh` + `PieceData` from `pieces.ts` (see `Site` constructor and `Site.load` for the exact wiring).

## Drop it into the starter

This needs the starter's renderer swapped to WebGPU, which touches several starter files. Honest options:
**(a)** plain three-avbd with your own boxes (the example above) inside the starter, after the swap below; or
**(b)** for the barn/cannon feel as shipped, treat the block as "start from this scene": copy `src/demo.ts`'s flow
(`View` + `Site` + `Cannon` + `Fx`) into your game and replace `View` with your scene. (b) is a bigger port.

1. `node tools/blocks/add.mjs destruction`. No npm deps to add.
2. `my-game/vite.config.js`: add
   `resolve: { dedupe: ['three'], alias: [ { find: /^three-avbd\/advanced$/, replacement: fileURLToPath(new URL('./vendor/destruction/vendor/three-avbd/src/lib/advanced.ts', import.meta.url)) }, { find: /^three-avbd$/, replacement: fileURLToPath(new URL('./vendor/destruction/vendor/three-avbd/src/lib/index.ts', import.meta.url)) } ] }`
   (`import { fileURLToPath } from 'node:url'`).
3. `my-game/src/render/renderer.js`: `import * as THREE from 'three/webgpu'`, `new THREE.WebGPURenderer({ antialias: true })`,
   and add an `async init()` that copies `View.init` in `src/render/view.ts`: request the adapter, set
   `renderer.backend.parameters.requiredLimits` (storage buffers per stage up to 10, buffer sizes up to 1 GB), `await
   renderer.init()`, and throw if `!renderer.backend.isWebGPUBackend` (three silently falls back to WebGL, where the
   solver cannot run). `warmUp` must use `renderer.compileAsync`.
4. `my-game/src/main.js`: `await view.init()` before `createGame`; replace `watchWebGL(view.renderer)` (it calls
   WebGL `getError`, which does not exist on WebGPU) with a no-op and listen to `renderer.backend.device.lost`.
   Check `view.capture()` still returns a picture (WebGPU canvases can read back blank).
5. `my-game/src/game/world.js` builds its sky with a `ShaderMaterial`, which WebGPU cannot draw: replace it
   (e.g. `scene.background = new THREE.Color(...)` or a node material). Standard/Lambert/Basic materials convert
   automatically; `ShaderMaterial` and `onBeforeCompile` do not.
6. In `src/game/game.js`: `import { World, BodyMesh } from 'three-avbd'` (or `'../../vendor/destruction/src/physics/structure.ts'`
   for the helpers). The world is z up: put `BodyMesh`/`PieceMesh` in a `THREE.Group` with `rotation.x = -Math.PI / 2`
   so it sits in the starter's y-up world; raycasts and positions stay z-up: y-up `(X, Y, Z)` is z-up `(X, -Z, Y)`.
   Call `world.update(dt)` in `update(dt, mode)`; set `world.dt = 1 / 60` to match the starter's tick.
7. Textures for `pieces.ts`: copy the needed `public/textures/*.webp` to `my-game/public/textures/` (create it).

## Gotchas

- Browser support: Chrome/Edge 113+ on desktop; Safari and Firefox WebGPU support varies by version and OS. Without
  WebGPU nothing runs: show a message. Device loss happens (driver reset); the demo reloads once.
- Headless tests: it rendered in headless Chromium with GPU flags (`--use-angle=metal --enable-gpu
  --ignore-gpu-blocklist` on macOS). A browser with no GPU adapter (some CI machines, software rendering) cannot run it.
- Performance: the solver and drawing all run on the GPU; budget for a dedicated or recent integrated GPU. The
  demo caps substeps at 2 per frame (`world.maxSubsteps`) so a slow frame does not snowball.
- With y-up gravity (`[0, -9.81, 0]`) the README's wall fell over by itself; keep z up and rotate the mesh group.
- Settling: build unbreakable, settle, then arm (as `Structure` does). Breakable from the start breaks most welds.
- Iterations: a 70-course chimney bounced apart at 10 iterations and stands at 12. Fast balls tunnel; `Cannon`
  sweeps on the CPU first for that reason. Keep at most ~24 balls in the solver.
- `BodyMesh` draws every body, the ground box included. Below 9 storage buffers per stage, hulls collide as boxes.
- Sounds: `public/audio/` mixes CC0, public domain and **CC-BY-4.0** recordings (richardemoore, YleArkisto,
  juskiddink, DWOBoyle: cannon_body, cannon_report, debris_big, brick_S). If any of those ship, copy their credit lines
  from `CREDITS.txt` into `my-game/CREDITS.md`. Textures/HDRI are CC0; font is OFL 1.1 (keep `fonts/OFL-red-hat-mono.txt`).

## Run the demo alone

`cd blocks/vendor/destruction && npm install && npm run dev` (http://127.0.0.1:5361), `npm run build` for `dist/`,
`npm run typecheck`. Needs a WebGPU browser. Controls: click fires a cannonball from the camera at what is under the
pointer, drag orbits, wheel zooms. Structure/strength/ball sliders come from Patch's block page (`lib/patch-block.js`).

## Credit

Physics: three-avbd by Steven Bobyn (MIT), with ports of Chris Giles' avbd demos and Erin Catto's box2d-lite (MIT);
sky and particles from Steven Bobyn's three-voxel-destruction (MIT); structures, cannon and demo by Patch (patch.gg),
MIT. Keep `LICENSE`, `CREDITS.txt`, `LICENCE-NOTES.md`, `vendor/three-avbd/LICENSE`, `THIRD_PARTY_NOTICES.md` and
`vendor/LICENSE-three-voxel-destruction.txt`.
