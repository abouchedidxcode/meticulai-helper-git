# Realistic car: how to use it

A drivable car on Rapier at real scale: Pacejka tyres with slip, suspension, engine, automatic gearbox, handbrake,
tarmac/gravel/grass surfaces, self-righting. Works with any glTF car whose four wheels are separate nodes.
Renderer: none needed by the physics; the demo uses WebGL2 (`WebGLRenderer`), the model also ran on WebGPU.
three 0.186.1, `@dimforge/rapier3d-compat` 0.17.3 (WASM inlined, no extra hosting).

## What to copy

- **Reusable system:** `src/car.js` (`Car`, `DEFAULTS`, `SURFACES`, `slipCurve`; physics only, needs Rapier passed
  in, no three), `src/car-model.js` (`measureCar`, `CarModel`: fits a model, spins/steers wheels, interpolates),
  `src/view.js` (`ChaseView` chase camera), optional `src/driver-view.js` (`DriverView` seat camera),
  `src/vireo.js` (the demo car's tuning numbers, a good starting tune), `src/dirt.js` (optional dirt shader).
- **Model:** `public/models/vireo-rally.glb` (2.7 MB, CC0) or `vireo-rally-lod.glb` (1.1 MB). Plain glTF, no
  Draco/KTX2, so a plain `GLTFLoader` loads it.
- **Demo only:** `src/demo.js`, `yard.js`, `stage*.js`, `mannequin.js`, `effects.js`, `sound.js`,
  `public/stage/`, `public/audio/` (CC0 engine/tyre sounds; `sound.js` is reusable as a reference but tied to the demo).

## API

```js
import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const STEP = 1 / 120; world.timestep = STEP;                 // the car is tuned for 120 Hz
world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setTranslation(0, -0.5, 0)); // your ground

const names = { fl: 'part_wheel_fl', fr: 'part_wheel_fr', rl: 'part_wheel_rl', rr: 'part_wheel_rr' }; // Vireo's (the default)
const { wheels, size } = measureCar(gltf.scene, names);
const car = new Car(RAPIER, world, { ...specOf(), wheels, size, position: { x: 0, y: 0.1, z: 0 }, yaw: 0,
  surfaceAt: (x, z, collider) => 'tarmac' });               // 'tarmac' | 'gravel' | 'grass'; called 4x per step, keep cheap
const look = new CarModel(gltf.scene, car, { names });       // look.object goes in your scene
const chase = new ChaseView(camera, car); chase.reset(car);

// fixed step at 120 Hz:
car.input = { throttle, brake, steer, handbrake };          // 0..1, 0..1, -1..1 (LEFT is positive), 0 or 1
car.update(STEP); world.step(); car.afterStep(STEP); look.stepped();
// every frame (alpha = 0..1 between the last two steps):
look.update(frameSeconds, alpha); chase.update(car, look.object.position, frameSeconds);
```

- Your own model: front faces +Z, ground at y = 0, metres, four separate wheel nodes; pass their names in `names`
  (and `steerNames: {}` if it has no separate uprights). `specOf()` is from `src/vireo.js`; otherwise pass your
  own `mass`, `torque`, `frontDrive` (0 rear .. 1 front) and anything in `DEFAULTS` (`src/car.js`).
- Read: `car.speed`, `car.forwardSpeed`, `car.gear`, `car.rpm`, `car.sideSpeed`, `car.airborne`, and per
  `car.wheels[i]`: `travelled`, `load`, `slip` (1 = tyre peak), `surface`.
- Events: `car.on('stuck' | 'upsideDown' | 'rightSideUp' | 'flip' | 'land' | 'takeoff' | 'shift', fn)`.
- `car.moveTo(position, yaw)` resets, `car.flip()` rights it, `car.dispose()` removes its body. `chase.drag(dx, dy)`
  and `chase.scroll(dy)` for mouse orbit/zoom. `car.tune.assists` switches ABS, traction control and steer assists.
- Other blocks' ground must be Rapier colliders in the same `world` (heightfield, trimesh, cuboids).

## Drop it into the starter

1. `node tools/blocks/add.mjs car`, then in `my-game/`: `npm install @dimforge/rapier3d-compat@0.17.3`.
2. Imports from `my-game/src/game/game.js`: `'../../vendor/car/src/car.js'`, `'../../vendor/car/src/car-model.js'`,
   `'../../vendor/car/src/view.js'`, `'../../vendor/car/src/vireo.js'`.
3. Rapier and the model are async but `createGame` is sync. Use top-level await at the top of `game.js` (fine in Vite):
   `await RAPIER.init();` and
   `import carUrl from '../../vendor/car/public/models/vireo-rally.glb?url';`
   `const gltf = await new GLTFLoader().loadAsync(carUrl);` (the `?url` import makes Vite ship the file; no copying).
4. The starter's loop ticks at 60 Hz. In `update(dt, mode)` run two car substeps of `dt / 2`
   (`car.update`, `world.step`, `car.afterStep` twice; set `world.timestep = dt / 2`), then call `look.stepped()`
   ONCE so the starter's `alpha` interpolates between whole ticks. Map input:
   `const m = ctx.input.move(); car.input = { throttle: Math.max(0, m.y), brake: Math.max(0, -m.y),
   steer: -m.x, handbrake: ctx.input.held('jump') ? 1 : 0 };` (starter `move().x` is +1 for right; car steer is +1 for
   left). Reverse: holding brake at a standstill selects reverse in the automatic box (check `car.gear < 0`).
5. In `render(alpha)`: measure frame time with `performance.now()`, then `look.update(ft, alpha)` and
   `chase.update(car, look.object.position, ft)`. Remove the starter's own follow camera (`createFollowCamera`) or
   keep it and point it at `look.object.position` instead of using `ChaseView`.
6. Renderer: no change. The starter's `WebGLRenderer` with shadows is enough. Add
   `resolve: { dedupe: ['three'] }` to `my-game/vite.config.js`. Checked on three 0.186.1, not verified on 0.187.

## Gotchas

- Step at 120 Hz. All tuning and the benches assume `1/120`; other rates are untested.
- Wheel suspension is one ray per wheel: sharp kerbs and steps hit late and hard; smooth ramps are fine.
- Keyboard steering is on/off; the assists exist to make that drivable. With assists off it is deliberately hard.
- Wheels can clip the arches on big landings (`bump`, `droop` options of `CarModel`).
- 14 tyre sub-steps per physics step: fine for a few cars, not for hundreds.
- Dispose: `car.dispose()` then `world.free()` when tearing down. For the starter's restart (`start()`), use
  `car.moveTo(...)` and `look.snap()` rather than rebuilding the world.
- Sounds are not wired in by the reusable files; if you ship `public/audio/` they are CC0 (sources listed in
  `public/audio/CREDITS.txt`), credit is optional but keep the list.

## Run the demo alone

`cd blocks/vendor/car && npm install && npm run dev` (http://127.0.0.1:5393), or `npm run build` for `dist/`.
Controls: WASD or arrows drive, Space handbrake, V swaps chase and driver's seat, R resets, drag turns the view,
scroll zooms. Extra measurement scripts: `node tools/bench.mjs`, `node tools/slide-bench.mjs`.

## Credit

Code by Patch (patch.gg), MIT; tyre model after Dechode's Godot Advanced Vehicle, gearbox/suspension/assists after
Godot Easy Vehicle Physics (David Shoemaker, Dechode, Baron Wittman), righting after Bruno Simon's folio-2025, all MIT;
Rapier by Dimforge (Apache-2.0). Keep `LICENSE`, `CREDITS.txt`, `LICENCE-NOTES.md` and `third-party/`.
