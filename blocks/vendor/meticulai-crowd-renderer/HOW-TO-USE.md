# Crowd renderer: how to use it

Thousands of animated, skinned horses and riders (or any rigged model) in a handful of draw calls. From TUMEN, an
unreleased mounted-archery battle game by Meticulai, where it drew up to 6,000 riders and 200 knights in a battle.
**WebGL2 only** (three's `WebGLRenderer`; the starter already uses it). three 0.187. No model files needed: a horse,
a mounted archer and a knight are built in code (`src/standin.js`).

How it works, in one paragraph: when a model is registered, every clip is played once and each bone's matrix is
written into a float texture (one row per frame, 3 texels per bone). Each instance is then 24 floats (position,
rotation, clip rows and blend, the bend of the body, tints). The vertex shader reads the bone texture and skins the
mesh itself, so the CPU never skins anything. A rider's shader reads its horse's `seat` bone from the horse's texture
at the horse's own clip and phase, so the rider can never drift off the saddle. Materials are three's own (Standard
near, Lambert far, Depth for shadows) with the vertex stage replaced, so lights, shadows and fog just work.

## Files

| File | What it is |
|---|---|
| `src/crowd.js` | `createCrowd`, the renderer (bake, sets, LOD, culling, shadows), `F` (the instance record's offsets) |
| `src/standin.js` | `buildHorse`, `buildArcher`, `buildKnight`: rigged, animated models built in code, LOD0/1/2 |
| `src/herd.js`, `src/locomotion.js` | The horse movement law (same as the block `meticulai-horse-locomotion`) |
| `src/herd-draw.js` | `writeHorse` (a herd horse and its rider into the instance buffers), `leadFromModel`, `gaitRows` |
| `demo/` | An army of 3,000 mounted archers wheeling and changing pace, a line of knights, a loose herd |

## API

```js
import { createCrowd, F } from '../../vendor/meticulai-crowd-renderer/src/crowd.js';
import { buildHorse, buildArcher, buildKnight } from '../../vendor/meticulai-crowd-renderer/src/standin.js';

const crowd = createCrowd({ scene, camera });                // options: quality 'high' | 'medium' | 'low', cost: { far: 2500 }
const horse = await crowd.register('horse', buildHorse());   // or ('horse', 'models/horse.glb', 'models/horse.meta.json')
await crowd.register('archer', buildArcher());
const horses = crowd.createSet('horse', 4000);               // capacity; options: lodDist [9, 45, 120], shadowDist 80
const riders = crowd.createSet('archer', 4000, { mount: 'horse' });
horses.count = riders.count = 4000;

// once per instance (persists): colours
horses.set(i, { tint: [0.55, 0.36, 0.22], hair: 0.5 });     // coat; mane and tail = coat x hair
riders.set(i, { tint: [0.6, 0.2, 0.1] });                   // cloth

// every frame (simple path):
horses.set(i, { x, y, z, yaw, clip: 'gallop', phase, curve });
riders.set(i, { x, y, z, yaw, clip: 'ride', phase: t / 2.03, mClip: 'gallop', mPhase: phase, curve });
// then draw as usual: renderer.render(scene, camera). The crowd hooks scene.onBeforeRender to cull and upload.
```

- `phase` is in cycles for looping clips (any real number; 0.5 = half way through); `time` (seconds) for one-shots.
- Cross-fade: `clipB`, `phaseB`, `blend` (weight of B). Riders: `mClipB`, `mPhaseB`, `mBlend` for the horse's fade.
- `curve` (1/m, + = turning left) bends the body along a circle; `bend: [b1, b2, b3, b4]` is the full trail fit from
  the movement law, which keeps planted hooves still in any turn.
- `roll` on a horse is its lean into a turn (only the body leans; the hooves stay on the ground).
- `parts` (bit mask) shows or hides variant parts (hats, helms, pennons) of a model that has a `_VARIANT` attribute.
- `show: false` hides one; `show: 2` hides it but keeps its shadow (the player's own rider in first person).
- Fast path for thousands: write straight into `set.buf` at `i * F.STRIDE` (24 floats) with rows from
  `model.row(clip, phase)`. `writeHorse(herd, i, horses, gaitRows(horse), slot, y, pitch, riders, riderRow)` in
  `herd-draw.js` does it for a herd moved by the law (the demo does 3,500 a frame this way).
- `crowd.stats`: `{ instances, drawn, shadow, lod: [n0, n1, n2, n3], tris, prepMs }`.
- `model.sample('seat' | 'head' | 'hoof_fl' ..., row, out12)`: where a tracked bone is (3x4 matrix, row-major) at a
  clip row, on the CPU: for hit tests, hoof dust, arrows that stick, a camera on a rider's head.
- `crowd.warm(() => renderer.compile(scene, camera))` before the first frame compiles every shader (no hitch later).

## The model contract (for your own GLB)

- Faces +Z, +Y up, metres, at most 4 bone influences per vertex (LOD1 uses 2, LOD2 and the far LOD 1).
- LODs as separate SkinnedMeshes on one skeleton, named `<name>_lod0` (hero, used within 9 m), `_lod1` (to 45 m),
  `_lod2` (beyond). One mesh with no LOD names also works. A far LOD (about 42 % of LOD2) is made at load.
- Clips in place (the root stays at the origin; your code moves the instance). Loops must be seamless.
- Horses: bones `seat` (top of the saddle, where a rider's pelvis sits), `head`, `hoof_fl`, `hoof_fr`, `hoof_hl`,
  `hoof_hr`; clips `idle`, `walk`, `trot`, `canter`, `gallop`. A meta JSON per clip: `{ duration, stride (metres
  per cycle), speed: [min, max], contacts: { hoof_fl: [[start, end]], ... } }`. The stand-in's `meta` is the example.
- Riders are authored seated, origin at the seat point, legs round a barrel; bones `hips`, `spine1..3`, `neck`,
  `head`. The upper body twists with `twist` (weights from the spine bones).
- Tints: a vertex attribute `_COAT` / `_TINT` / `_CLOTH` (0..1), a vertex colour channel named in `meta.tint`, or a
  mask texture `meta.tint.mask` (R = first tint, G = second).
- If your model's axes or scale are off, pass `{ transform: new THREE.Matrix4()... }` as the 4th argument of
  `register`. A seat bone authored with Blender's axes is fixed automatically.

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-crowd-renderer` (copies to `my-game/vendor/meticulai-crowd-renderer/`).
2. In `my-game/src/game/game.js`: `createGame(ctx)` is not async, so build the crowd there and register the
   stand-ins without awaiting (they are built in code, so `register` finishes at once; `await` it if you load GLBs and
   create the sets when it resolves):
   ```js
   import { createCrowd } from '../../vendor/meticulai-crowd-renderer/src/crowd.js';
   import { buildHorse, buildArcher } from '../../vendor/meticulai-crowd-renderer/src/standin.js';
   const crowd = createCrowd({ scene, camera });
   Promise.all([crowd.register('horse', buildHorse()), crowd.register('archer', buildArcher())]).then(() => { /* createSet ... */ });
   ```
3. Move your instances in `update(dt, mode)` and write them in `render(alpha)`. Nothing to change in
   `render/renderer.js`: the crowd prepares itself when the scene is drawn.
4. In `main.js`, after `view.warmUp(...)`, nothing extra is needed for the stand-ins; for big GLBs call
   `crowd.warm(() => view.warmUp(game.scene, game.camera))` once they are loaded.
5. The starter's sun has a 2048 shadow map. The crowd sends only riders within `shadowDist` (80 m) to it.
6. Keep one three.js: `resolve: { dedupe: ['three'] }` in `my-game/vite.config.js`.

Moving them: for horses, use `src/herd.js` (the law: no sliding, real turns) and `writeHorse`. For anything else, a
walking animal: `phase += distance / stride`, `curve = yawRate / speed`.

## The numbers that matter

| Number | Value | What it does |
|---|---|---|
| `lodDist` | [9, 45, 120] m | LOD0 within 9 m (expensive: about 2 ms for a dozen 18k-triangle heroes), LOD1 to 45, LOD2 to 120, far beyond |
| LOD hysteresis | 10 % in distance | A rider at a boundary does not flicker |
| `shadowDist` | 80 m | Riders beyond cast no shadow; rings: LOD1 mesh within 9 m, LOD2 to 50 m, far mesh beyond (every second rider) |
| `cost.far` | 2500 m | Nothing drawn beyond |
| `lod3Ratio` | 0.42 | The far mesh's share of LOD2 triangles (thin props may vanish; the game kept LOD2 for knights so lances stayed) |
| `fps` | 60 | Bake rate: one texture row per 1/60 s of clip; rows are interpolated near, nearest far |

## What made it good in TUMEN

- One asset serves both the hero up close and the thousands far away, and nothing is skinned on the CPU. Measured
  in the game: 1,600 riders beyond 45 m cost under 1 ms; 6,000 riders plus 200 knights added about 5 ms to a 12.7 ms
  frame; capacity was 8,192 horses and 2,048 knights. After the first play the owner said the visuals were "really,
  really cool".
- Riders read the saddle from the horse's own bone texture, so a rider sits on the saddle exactly: the game's
  checker measured the gap as 0.0000 m over millions of rider-steps.
- The body bends along the trail the horse rode (the same maths as the movement law), so planted hooves stay put in
  turns even for 6,000 horses: that is what makes a wheeling army look real instead of skating.
- The code-built stand-ins came first: they let the renderer and the movement proof be built and checked before any
  model existed, and they are a known-good baseline (hooves cannot slide by construction).

## Gotchas

- **WebGL2 only.** Switching to `WebGPURenderer` breaks it (it patches GLSL into three's materials).
- **Riders in a separate set with `{ mount }`, same slot index as their horse**, and the same x, y, z, yaw, scale and
  curve. A rider writes the horse's clip rows into its own record (`mClip`/`mPhase`, or `writeHorse` does it).
- Instances are culled with a sphere of `radius` (2.4 m default); raise it for long models (the game used 3.6 for
  knights with lances).
- The first frame after a camera cut steps LODs one level per frame from far; it settles in two or three frames.
- `register` reads a GLB's clips by playing them through three's `AnimationMixer`: very long clips make tall textures
  (rows = seconds x fps). Keep clips short and looping.
- The stand-ins look like stand-ins up close (tubes); from 20 m they read as riders. Use a real model for heroes.
- Shadow ring selection by cascade needs a cascaded sun (`cascades` option); with a plain `DirectionalLight` the
  crowd uses rings by distance, which is what the demo and the starter do.

## Restyle it

- Colours: `tint`, `tintB`, `hair` per instance; the stand-ins' base colours are the arrays at the top of each builder
  (`COAT`, `DEEL`, `SUR`...).
- Other animals: change `buildHorse`'s proportions (the `SH`, `HIP`, leg lengths `FL1/FL2/HL1/HL2`, barrel rings) and
  its `FOOTFALL` table; a deer is a thinner horse with a higher lift; cattle a lower, heavier one (`heavy: true`).
- People on foot: register any rigged GLB with `walk`/`run` clips and drive `phase += distance / stride`.
- A painted or toon look: the materials are three's own, so swap `MeshLambertMaterial`/`MeshStandardMaterial` in
  `makeMaterial` for a `MeshToonMaterial` and keep the `patchMaterial` call.

## Run the demo

```
cd blocks/vendor/meticulai-crowd-renderer && npm install
npm run dev     # http://127.0.0.1:5462   ?n=6000 for a bigger army, ?cam=2.4,0.35 for a close view
npm test        # 6 tests
```

## Credit

From TUMEN by Meticulai (meticulai.com). MIT: keep `LICENSE`.
