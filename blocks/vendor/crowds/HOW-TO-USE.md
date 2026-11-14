# Crowds and navigation: how to use it

Navmesh pathfinding and crowd steering for any three.js level: build a navmesh from level meshes, spawn agents, send
them somewhere or have them chase the player; they avoid walls and each other and re-route around new obstacles.
Renderer: none for navigation (pure logic); the figures use plain `MeshStandardMaterial` (WebGL2 demo). three 0.186.1.
npm deps for the reusable part: `recast-navigation` 0.44.0 and `@recast-navigation/three` 0.44.0 (WASM is embedded,
no special hosting). `postprocessing` 6.39.6 and `n8ao` 2.0.1 are only the demo's ambient occlusion: you do not need them.

## What to copy

- **Reusable system:** `src/navigation.js` (`initNavigation`, `Navigation`), `src/crowd.js` (`CrowdSystem`,
  `MOVING`, `STANDING`), plus either `src/walker.js` (`Walker`: idle/walk/run blending for a few dozen rigged
  characters, one `AnimationMixer` each) or `src/figures.js` (`CrowdFigures`: hundreds of instanced mannequins,
  needs `public/models/mannequin.glb`, 264 KB, CC0).
- **Demo only:** `src/demo.js` (orbit camera, clicks, EffectComposer + N8AO, warm-up), `src/levels.js` (three levels
  built from Kenney kits in `public/models/kit-*.glb`), `lib/patch-block.js`, `make-*.mjs`, `mannequin/`.

## API

```js
import { initNavigation, Navigation } from '.../navigation.js';
import { CrowdSystem } from '.../crowd.js';
await initNavigation();                                   // loads Recast WASM once
scene.updateMatrixWorld(true);                            // meshes are read in world space
const nav = new Navigation([floorMesh, wallsMesh], { agentRadius: 0.35, agentHeight: 1.9, stepHeight: 0.5,
  maxSlope: 46, cellSize: 0.2, maxObstacles: 48 });       // < 100 ms for small levels; cellSize 0.3 if slow
const crowd = new CrowdSystem(nav, { home: nav.closest({ x: 0, y: 0, z: 0 }), maxAgents: 200, speed: 3 });
crowd.resize(70);                                         // spawn/remove until 70 (around `home`, or `resize(n, at)`)
crowd.goTo(nav.closest(point));                           // everyone, each to their own spot round the point
crowd.follow(nav.closest(player.position));               // enemies: call again whenever the player moves; follow(null) stops
// every step:
nav.update();  crowd.update(dt);                          // then read m.x, m.y, m.z, m.vx, m.vz, m.speed, m.state
```

- Orders: `crowd.goTo(point, { members, hurry, spread })` (a squad), `crowd.send(member, point, hurry)` (one;
  hurry 0 = stroll), `crowd.scatter()`, `crowd.setSpeed(n)`, `crowd.setSpacing(0..4)`, `crowd.wander = false`.
- Queries: `nav.closest(p)` (null if off the mesh), `nav.randomAround(p, r)`, `nav.path(from, to)` (check reachability).
- Obstacles at run time: `const o = nav.block(pos, halfW, halfD, height, yaw); crowd.shove(pos, halfW, halfD);`
  later `nav.unblock(o)`. Boxes only, up to `maxObstacles`; about 1 ms per change in the demo.
- Drawing: `const figures = new CrowdFigures(gltf, 200); scene.add(...figures.meshes); figures.update(crowd.members, dt)`
  each frame, or per rigged model `model.position.set(m.x, m.y, m.z); walker.update(m, dt); model.rotation.y = walker.yaw`.
- Debug view: `new NavMeshHelper(nav.navMesh)` from `@recast-navigation/three` draws the walkable area.
- Teardown: `crowd.destroy()` then `nav.destroy()`.

## Drop it into the starter

1. `node tools/blocks/add.mjs crowds`, then in `my-game/`:
   `npm install recast-navigation@0.44.0 @recast-navigation/three@0.44.0`.
2. Imports from `my-game/src/game/game.js`: `'../../vendor/crowds/src/navigation.js'`,
   `'../../vendor/crowds/src/crowd.js'`, `'../../vendor/crowds/src/figures.js'` (or `walker.js`).
3. `createGame` is sync, so use top-level await at the top of `game.js`: `await initNavigation();` and for figures
   `import mannequinUrl from '../../vendor/crowds/public/models/mannequin.glb?url';`
   `const mannequin = await new GLTFLoader().loadAsync(mannequinUrl);` (`?url` makes Vite ship the file).
4. In `createGame`, after building the level: `scene.updateMatrixWorld(true)`, then `new Navigation([...])` with only
   the floor, ramps and walls the agents touch. Create the `CrowdSystem` once; in `start()` call `crowd.resize(n)` and
   reposition (the starter calls `start()` on every restart, so do not rebuild the navmesh there).
5. In `update(dt, mode)`: `nav.update(); crowd.update(dt); figures.update(crowd.members, dt);` and
   `crowd.follow(...)` a few times a second for chasers. Collisions with the player: compare `m.x/m.z` to the player.
6. Renderer: no change (plain WebGLRenderer, no post needed). Add `resolve: { dedupe: ['three'] }` to
   `my-game/vite.config.js`. Checked on three 0.186.1, not verified on 0.187.

## Gotchas

- Level meshes: leave out roofs and treetops (Recast treats any flat top as floor: unreachable islands). Cut the floor
  under solid buildings. Keep `stepHeight` below anything agents must not climb.
- Read `agent.position()`, not `interpolatedPosition` (crowd.js already does; it steps with real dt, capped at 1/20 s).
- Randomness: `crowd.js` and `figures.js` use `Math.random()`, not the starter's seeded `rng`, so runs with crowds
  are not exactly replayable from a seed.
- Performance (desktop, 200 agents): crowd + figures about 2 ms CPU, about 8 ms with the CPU slowed 4x; 200 figures
  with shadows is about 1.16 M triangles, so drawing is the heavier part. Detour slows when agents pack tightly; the
  demo stops at 200. Test on a laptop before planning more. Set `castShadow = false` on figure meshes to save a lot.
- Warm up behind a loading screen: build the navmesh, draw one frame (shader compile), optionally run
  `crowd.update(1/60)` a few hundred times so people are already walking when the player sees them.
- No sound ships with this block.

## Run the demo alone

`cd blocks/vendor/crowds && npm install && npm run dev` (http://127.0.0.1:5381), or `npm run build` for `dist/`.
(The upstream lockfile was out of sync; it has been regenerated, so `npm ci` also works.) Controls: left click sends the
crowd there, right click places a stone block in their way or lifts one, drag orbits, scroll zooms. Level, crowd size,
speed and "show walkable area" come from Patch's block page (`lib/patch-block.js`).

## Credit

Recast and Detour by Mikko Mononen (zlib), through recast-navigation-js by Isaac Mason (MIT); crowd API, figures and
demo by Patch (patch.gg), MIT; mannequin CC0 with Quaternius clips (CC0); town/castle kits by Kenney (CC0, demo only).
Keep `LICENSE`, `CREDITS.txt`, `LICENCE-NOTES.md` and `third-party/` (both Recast notices).
