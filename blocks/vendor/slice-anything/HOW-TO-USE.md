# Slice anything: how to use it

Cut any mesh along any plane, as often as you like. Every piece is a closed solid with its own Rapier body, and cut
faces show a solid "inside" texture (wood rings, marble veins, melon seeds) that lines up across the two halves.

- Renderer: three's `WebGPURenderer` from `three/webgpu` (falls back to WebGL2 by itself; the demo forces that with `?webgl`). The inside materials are TSL node materials.
- three 0.186.1 (pinned in `package.json`), `@dimforge/rapier3d-compat` **0.19.3** pinned on purpose (in 0.21 convex hulls never come to rest). TypeScript sources.

## Reusable system vs demo

- System: `src/lib/` (about 1,900 lines). `slicer.ts` (the `Slicer` class: bodies, queue, staging), `cut.ts` and `solid.ts` (pure geometry, typed arrays only, run in Node or a worker), `inside.ts` (inside materials, cut-line preview), `noise.ts` (a 64^3 noise texture built in code). Entry: `src/lib/index.ts`. Needs no asset files.
- Demo only: `src/demo/` (`main.ts` loop, renderer, bloom/AO pipeline, shader warm-up; `sword.ts` blade and swing; `yard.ts` the courtyard and objects; `fx.ts`, `materials.ts`), `public/assets/` (Poly Haven bust, swords, HDRI, textures), `index.html`, `recipe.json`, `lib/patch-block.js` (talks to Patch's page only inside an iframe; harmless standalone).

## API

```ts
import RAPIER from '@dimforge/rapier3d-compat';
import { Slicer, woodInside, marbleInside } from '../../vendor/slice-anything/src/lib/index.ts';

await RAPIER.init();                                    // once, before making a World
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const slicer = new Slicer(world, RAPIER, scene, { budgetMs: 5, maxPieces: 700 });

slicer.add(mesh, { inside: woodInside(), density: 650, pins: [new THREE.Vector3(0, -0.98, 0)], kind: 'post' });
slicer.slice(plane, push);                              // world-space THREE.Plane, push = THREE.Vector3; queues a cut of all it crosses
slicer.cut(piece, plane, push);                         // one piece only
slicer.link(a, b, point);                               // ball joint that survives cuts (b = null: pinned to the world)
slicer.onCut = ({ parent, pieces, point, area, dust }) => { /* sound, sparks, score: parent.options.kind */ };
const unwarm = slicer.warm(pointInView);                // build every inside's pipeline behind a loading screen, then unwarm()
slicer.remove(piece); slicer.clear();                   // clear() removes every piece, body and geometry
```

- `add(mesh, options)` copies the mesh's geometry and world transform (the mesh itself is left alone; don't also add it to the scene). Options: `inside` (required), `density` kg/m^3, `pins`, `friction`, `restitution`, `kind`, `minVolume`, `awake`, `part`, `tumble`, `linearDamping`, `angularDamping`, `inertia`, `uvScale`.
- Insides: `marbleInside stoneInside woodInside bambooInside melonInside orangeInside appleInside metalInside plainInside`. Your own: any node material reading `attribute('rest', 'vec3')`.
- `cutPreview` / `withCutPreview(material)`: draws where a plane would cut (the demo's right-mouse "focus").
- `cut(solid, normal, constant)` in `src/lib/cut.ts` is the bare cutter, no scene or physics.
- Each step: `slicer.beforeStep(); world.step(); slicer.update(dt, alpha);` (alpha 0..1 for drawing between steps). The slicer makes no renderer and no loop; it adds piece meshes to the `scene` you gave it.

## Drop it into the starter (`my-game/`)

`node tools/blocks/add.mjs slice-anything` copies it to `my-game/vendor/slice-anything/`. Then:

1. `cd my-game && npm install @dimforge/rapier3d-compat@0.19.3` (exact version). Rapier's WASM is inlined in the compat build; Vite needs no plugin.
2. `vite.config.js`: add `resolve: { dedupe: ['three'] }` so the block can't load a second three (it would, if anyone ran `npm install` inside `vendor/slice-anything/`). Add `build: { target: 'es2022', ... }` for top-level await.
3. Swap the renderer. The node insides need `WebGPURenderer`; the starter makes a plain `WebGLRenderer`. In `src/render/renderer.js`: `import * as THREE from 'three/webgpu';` and `new THREE.WebGPURenderer({ antialias: true })` (keep the rest: color space, tone mapping, PCFShadowMap all exist there). Change `warmUp` to `return renderer.compileAsync(scene, camera)`.
4. In `src/main.js`: right after `const view = createRenderer();` add `await view.renderer.init();`. Replace `const checkGL = watchWebGL(view.renderer);` with `const checkGL = () => {};` (it reads a WebGL context WebGPU doesn't have). After a swap, check that `view.capture()` doesn't return a blank PNG.
5. Game files can keep `import * as THREE from 'three'` (same classes). `ShaderMaterial` and `onBeforeCompile` do not draw under WebGPU: the starter demo's sky in `src/game/world.js` is a `ShaderMaterial`; replace it (a `scene.background` colour, or a node material).
6. In `src/game/game.js`: `await RAPIER.init()` before `createGame` runs (top-level await in the module, or make start-up async in `main.js`). In `update(dt)` (fixed 1/60): `slicer.beforeStep(); world.step(); slicer.update(dt);`. Set `world.timestep = dt` once. Don't feed Rapier a slowed or varying dt (the `juice.timeScale` slow motion): the author found that throws things around; skip or repeat fixed steps instead.
7. To cut on a swing, build a `THREE.Plane` from the blade's edge and travel direction and call `slicer.slice(plane, push, (p) => sweptThrough(p))`.

**WebGL-only alternative (not tried here):** `slicer.ts`, `cut.ts` and `solid.ts` import plain `three`, so importing `Slicer` straight from `vendor/slice-anything/src/lib/slicer.ts` (not `index.ts`, which pulls in the node materials) with a classic `MeshStandardMaterial` as `inside` should run under the starter's `WebGLRenderer` unchanged. Cut faces are then a flat material, without the solid wood/marble pattern.

## Gotchas

- WebGPU: Chrome/Edge 113+, Safari 26+, Firefox on Windows recently. Elsewhere three falls back to WebGL2, which the author says is "far less tested" here.
- First cut of each inside can freeze 0.15 to 1.3 s while the GPU builds its pipeline: call `slicer.warm(point)` during loading and draw a few real frames before `unwarm()`.
- The `rest` attribute trap: every mesh drawn with an inside material needs its own `rest` attribute (layout position, normal, uv, rest). Don't alias it to `position`.
- Static meshes only (no skinned). Colliders are convex hulls. Build multi-part things as one closed shell or they slide apart at the joins. Max 700 pieces (`maxPieces`), then cutting stops.
- `src/demo/main.ts`'s compile speed-up reaches into three's private `_pipelines` / `_renderContexts` (0.186). The starter has three 0.187: don't copy that trick without checking it.
- TypeScript: Vite strips types from `.ts` imports in a JS project (no type check). Keep the `.ts` extension in import paths.
- Pointer lock (demo): headless tests need a fake one; `scripts/no-pointer-lock.mjs` is how the author does it.
- The demo has no sound.

## Run the demo alone

```sh
cd vendor/slice-anything && npm install
npm run dev        # http://localhost:5375/  (add ?webgl to force the WebGL2 backend)
npm run build      # dist/ with LICENSE.txt and THIRD-PARTY-NOTICES.md;  npm run serve -> http://127.0.0.1:5374/
```

Controls: click to look; drag the mouse to slash (the drag direction is the cut); hold right mouse to slow time and show the cut line, wheel turns it; WASD or arrows walk; 1 / 2 katana / longsword; F throws a fruit; R resets; H hides hints. `node scripts/fuzz-node.mjs 3000` tests the cutter in Node.

## Credit

Slice anything by blendi (Patch, patch.gg), code MIT, art CC0 (Poly Haven); Rapier is Apache-2.0. Keep `LICENSE`, `public/CREDITS.md` and `public/LICENSES/` (CC0 and Rapier's Apache-2.0 text).
