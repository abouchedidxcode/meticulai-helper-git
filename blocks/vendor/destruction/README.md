---
kind: system
engine: three
---

# Destruction physics

Breakable structures for three.js on the GPU: a timber barn, a steel water tower, a brick wall and a chimney, each built from hundreds of rigid pieces welded together, that cannonballs knock down piece by piece.

The physics is [three-avbd](https://github.com/sbobyn/three-avbd) by Steven Bobyn (MIT): rigid bodies solved entirely in WebGPU compute shaders, with fixed joints that break once they carry more than their strength. Every brick, board, post, rafter, tile and steel plate here is one box, welded to the pieces it touches, and the welds are as strong as what each one carries standing. So a cannonball makes a hole where it lands, and the rest stands or falls by its load paths: knock out a corner post and the plate over it sags and the roof follows. In the live demo, click to fire a cannonball from the camera at what's under the pointer, drag to orbit and scroll to zoom. The look and the break feel are from Patch's demolition game Timberfall.

Physics: three-avbd by Steven Bobyn (MIT). Code here is MIT. Art is CC0, and the sounds are CC0, public domain and CC-BY (`CREDITS.txt`).

## What this owns

- **Renderer:** WebGPU, and three-avbd takes yours: `World.create({ renderer })` shares its device, and `BodyMesh` draws from the solver's buffer. The `WebGPURenderer` in `src/render/view.ts` is the demo's.
- **Frame loop:** The library doesn't draw the frame. Call `world.update(dt)`, then render your scene with the `BodyMesh` in it. The demo's `View.render` goes through its own `RenderPipeline`, in `src/render/view.ts`.
- **three:** `package.json` pins 0.186.1. three-avbd is vendored at commit `cd3ce90`, so no other library has to match.
- **Copy:** `vendor/three-avbd/`, with the `three-avbd` and `three-avbd/advanced` aliases from `vite.config.mjs`. For the demo's builder and structures, add `src/physics/`, `src/level/structures.ts`, and `src/render/pieces.ts` with `public/textures`.
- **WebGPU limits:** `recommendedLimits()` in `vendor/three-avbd/src/lib/world.ts` returns `maxStorageBuffersPerShaderStage`, `maxStorageBufferBindingSize` and `maxBufferSize` at the adapter's values, to pass as `requiredLimits`. The demo asks in `View.init` in `src/render/view.ts`, capped at 10 buffers and 1 GB. Below 9 storage buffers a stage, hulls collide as their bounding boxes.
- **Elsewhere:** The README's world is z up (`gravity: [0, 0, -9.81]`). With y-up gravity the wall fell flat by itself. Keeping z up and parenting `BodyMesh` in a group turned `-PI/2` about X worked, with raycasts still in z-up coordinates. `BodyMesh` draws every body, ground box included.

## Make anything breakable

Destruction in three-avbd is **boxes, fixed joints and a break force**, then a **raycast** for hits:

1. Build the thing from boxes (`world.addBox`), one per piece.
2. Weld each pair of touching pieces with a fixed joint at the middle of where they touch (`world.addJoint`). Give it
   a `breakForce`; with `breakOnPull` it breaks on a pull or a push too (brittle, like mortar), without it only on a
   bend. A plastic weld (`yieldForce`, `breakBend`) bends and stays bent before it snaps (timber, steel).
3. Find what was hit with `world.raycast` (on the GPU, a frame or two later), and push it with
   `body.applyImpulse`, or cut welds yourself with `joint.remove()`. Welds that carry too much break by themselves,
   on the GPU, and `world.onBreak` tells you which.

```js
import * as THREE from 'three/webgpu';
import { World, BodyMesh } from 'three-avbd'; // vendor/three-avbd/src/lib/index.ts here

const renderer = new THREE.WebGPURenderer();
await renderer.init();
const world = await World.create({ renderer, maxBodies: 4096, gravity: [0, 0, -9.81], iterations: 12 });
world.addBox({ size: [40, 40, 1], position: [0, 0, -0.5], fixed: true }); // the ground

// A wall: 8 bricks a course, 10 courses, each brick welded to its neighbours
const brick = [0.44, 0.2, 0.14];
const rows = [];
for (let c = 0; c < 10; c++) {
  const shift = (c % 2) * 0.22;
  rows.push([]);
  for (let k = 0; k < 8; k++) rows[c].push(world.addBox({ size: brick, position: [k * 0.44 + shift, 0, 0.07 + c * 0.14], density: 1900 }));
}
const weld = (a, b, at) =>
  world.addJoint(a, b, {
    anchorA: [at[0] - a.position[0], at[1] - a.position[1], at[2] - a.position[2]],
    anchorB: [at[0] - b.position[0], at[1] - b.position[1], at[2] - b.position[2]],
    breakForce: 6000, // newtons: about 25 bricks' weight (with breakOnPull a push counts too)
    breakOnPull: true, // mortar: brittle
  });
for (let c = 0; c < 10; c++)
  for (let k = 0; k < 8; k++) {
    const b = rows[c][k];
    if (k > 0) weld(rows[c][k - 1], b, [b.position[0] - 0.22, 0, b.position[2]]);
    if (c > 0) for (const u of rows[c - 1]) if (Math.abs(u.position[0] - b.position[0]) < 0.44) weld(u, b, [(u.position[0] + b.position[0]) / 2, 0, b.position[2] - 0.07]);
  }
scene.add(new BodyMesh(world, { material: new THREE.MeshStandardNodeMaterial({ color: 0x9a4a32 }) }));
world.onBreak((joint) => playCrack(joint)); // seen at a readback
world.readbackEvery = 3; // keep body.position fresh for game logic

// Hit what's under the pointer: a raycast on the GPU, then a shove
async function hit(origin, direction) {
  const h = await world.raycast(origin, direction, { maxDistance: 100 });
  if (h?.body) h.body.applyImpulse([direction[0] * 400, direction[1] * 400, direction[2] * 400], h.point);
}
renderer.setAnimationLoop(() => {
  world.update(clock.getDelta()); // fixed steps of world.dt
  renderer.render(scene, camera);
});
```

Units are the solver's own: this demo uses metres, tonnes and kilonewtons (density 1.9 for brick), Timberfall's
units; the sample above uses kilograms and newtons. Only ratios matter to the solver.

**What this demo adds on top**, all in `src/`, all reusable:

- **Welds as strong as their load** (`physics/structure.ts`). The structure is built with unbreakable welds and
  settled (gravity eased on), each weld's load is read back (`joint.force` after `world.readJoints()`), then every
  weld is armed in place in the solver's own joint records (`three-avbd/advanced`'s `J_LAM_LIN`, `J_YIELD`,
  `J_BREAK_BEND`): a weld holds its material's margin times its standing load, never less than a floor in g's of
  its lighter piece. Building it breakable from the start breaks most welds while the solver's penalties ramp up.
  Settling runs a few steps a frame (`Structure.settle`), so putting a structure up never stalls a frame.
- **Materials and their welds** (`physics/materials.ts`): mortar, nogging, putty and nails are brittle; timber
  joinery and grain are plastic (they sag, then snap); steel rivets bend a long way.
- **A builder** (`physics/builder.ts`): `span`, `member` (a long timber in segments welded end to end, so it snaps
  along its length), `weld`, and `autoWeld`, which welds every pair of square pieces that touch at the middle of
  where they touch. `level/structures.ts` builds the four structures with it.
- **A cannonball that never tunnels** (`game/cannon.ts`): a ball at 55 m/s moves 0.9 m a step, so it flies on the
  CPU, swept in 25 cm steps against the pieces as last read back, until the first piece in its path. There it
  breaks what's round the hit by hardness, hands its momentum on (never more than it had), and carries on as a
  real sphere in the solver, slower.
- **Drawing straight from the solver** (`render/pieces.ts`): one instanced mesh per material reads each piece's pose
  from the solver's body buffer on the GPU (no readback), with rounded edges of a fixed width and textures mapped
  in each piece's own frame in metres.
- **Swapping structures in one world** (`game/site.ts`): `Structure.remove` releases a structure's joints in one
  batch and its bodies after them; the world and every pipeline stay, so a rebuild costs no shader compile.

**Lessons, measured here:** a free-standing chimney of 70 courses bounced on its welds until they broke at 10 solver
iterations and stands at 12; weatherboards and panes welded at both ends brace a frame like a shear wall, so one knock
stripped a whole barn, and hung by one weld each they only go where they're hit; a 0.2 m iron ball is 261 kg, a
wrecking ball for a small barn (the default is 12 cm, 56 kg); glass shards that collide with the structure knock
boards off wherever they fly, so they only collide with the ground.

**WebGPU only.** three-avbd has no WebGL path. The demo plays in Patch Desktop and in Chrome or Edge 113 or later;
without WebGPU it shows a message in its frame instead.

## Controls

The block page talks to the demo over the `patch-block` message channel (`lib/patch-block.js`). Firing happens in the
frame: click fires a cannonball from the camera at what's under the pointer, drag orbits, the wheel zooms.

**For people** (the block page shows these):

| id | Control | Type | Range | What it does |
|---|---|---|---|---|
| `structure` | Structure | choice | Timber barn, Water tower, Garden wall, Brick chimney, each with a picture; default Timber barn | What stands in the yard to knock down. |
| `strength` | Weld strength | number | 0.25 to 4 ×, default 1 | How strong the welds are, against what each carries standing. Rebuilds the structure. |
| `ball` | Cannonball | number | 0.06 to 0.35 m, default 0.12 | The iron ball's radius: 12 cm is 56 kg; twice that is eight times as heavy. |
| `speed` | Speed | number | 0.1 to 1 ×, default 1 | How fast time runs: below 1 is slow motion (smaller steps, still one a frame, so it stays smooth). |

**Trigger:** Rebuild (`rebuild`): puts the structure back up, whole, and clears the rubble and cannonballs.

**For agents** (7 more, in `recipe.json` with every range and default):

| id | Control | Type | Range | What it does |
|---|---|---|---|---|
| `power` | Ball speed | number | 20 to 90 m/s, default 55 | How fast the ball flies when it is fired. |
| `density` | Density | number | 0.25 to 4 ×, default 1 | Every material's density, scaled. Rebuilds. |
| `friction` | Friction | number | 0.2 to 2 ×, default 1 | Every material's friction, scaled. Rebuilds. |
| `gravity` | Gravity | number | 1 to 20 m/s², default 9.81 | Gravity once the structure stands (welds are set for 9.81). |
| `iterations` | Solver iterations | number | 4 to 20, default 12 | Solver passes a step. |
| `auto` | Keep firing | toggle | default off | Fires at the structure every two seconds and rebuilds it once it's down. |
| `shake` | Camera shake | toggle | default on | Whether the camera shakes when a ball is fired and things land. |

**Warm-up before `ready`:** every structure planned, the first one built, settled and armed, the solver's raycast,
push and contact-event passes run once, every material compiled, and every sound take decoded (an offline
context decodes without a click), and one practice shot fired onto the ground in view (a ball first drawn in the frame
stalled the first click), landing clear of the structure and stopping there. A cover of the page's colour stays over the
canvas throughout, since the page's loader sits over the frame and what's behind it shows; the first thing seen is the
settled view. (A cover, not `visibility: hidden`: a canvas shown for the first time stalls that frame 300 to 500 ms. Even
lifting the cover can stall one 100 to 300 ms, so it's lifted 20 frames before `ready`.)

**When the GPU goes away:** the demo listens to `device.lost`. A lost device (a driver reset, the browser's GPU process
crashing) reloads the page once, and if it's lost again within a minute a message and a Reload button show in the frame.
It asks for an adapter a few times over a few seconds, since a GPU process takes that long to restart, and refuses
three's silent fallback to WebGL. No more than 24 cannonballs stay in the solver: the oldest goes.

## The structures

| Structure | Pieces | Welds | Built like |
|---|---|---|---|
| Timber barn | about 870 | about 1,800 | Oak posts every 2.4 m on sills on a stone plinth; six courses of brick below a mid rail, tarred weatherboards above; cream windows; oxblood ledged doors; a king-post roof of clay tiles with gables boarded. |
| Water tower | about 100 | about 230 | A riveted steel tank on four legs with girts and X-braces; the tank's floor carries the water's weight, so it's top-heavy: shoot two legs on one side. |
| Garden wall | about 365 | about 1,030 | Stretcher bond between square piers, stone base, coping and caps, a ledged and braced gate. |
| Brick chimney | about 410 | about 1,220 | A 10 m square stack on a stepped stone base, with corbelled courses and a stone cap. |

## Build it

```bash
npm install
npm run build        # writes recipe.json, then dist/ (~8 MB), with thumbs/ and the licences copied in
npm run dev          # http://127.0.0.1:5361/
npm run thumbs       # with the dev server running: thumbs/structures/*.webp (needs ffmpeg)
```

`dist/` is the live demo exactly as released, with `index.html` at the top and nothing loaded from other hosts.

| Path | What |
|---|---|
| `src/demo.ts`, `index.html` | The demo page: the orbit camera, input, the block wiring, warm-up |
| `src/physics/` | The builder, materials and welds, and the structure in three-avbd (from Timberfall) |
| `src/level/structures.ts` | The four structures |
| `src/game/` | The yard at run time (`site.ts`), the cannon (`cannon.ts`), effects (`fx.ts`) |
| `src/render/` | The look: sky, light, post (`view.ts`, `sky.ts`), pieces drawn from the solver (`pieces.ts`), trees and grass (`nature.ts`) |
| `src/fx/particles.ts` | GPU smoke, dust, fire and sparks |
| `src/audio/sounds.ts`, `src/audio/layers.ts` | The sound: layered recordings through a mix (compressor, limiter, reverb, voice caps, sound placed in space) |
| `make-audio.mjs`, `audio-build/`, `public/audio/` | Each take's source, cut and loudness, the script that builds them, and the built takes |
| `vendor/three-avbd/` | three-avbd at commit `cd3ce90`, with one kernel changed (its `VENDOR.md`), with its `LICENSE` and `THIRD_PARTY_NOTICES.md` |
| `recipe.json`, `make-recipe.mjs` | The release recipe (mode `browser` with its `block` section) |
| `thumbs/structures/`, `make-thumbs.mjs` | The Structure choice's pictures, stills of this demo |
| `public/` | Textures, the sky light, the leaf and grass cards |
| `lib/patch-block.js` | Patch's block demo helper, as served at patch.gg/patch-block.js |
| `LICENCE-NOTES.md` | Where every part came from |

## Credits and licences

- **Physics: three-avbd by Steven Bobyn (MIT)**, commit `cd3ce90`
  ([github.com/sbobyn/three-avbd](https://github.com/sbobyn/three-avbd)), with ports of Chris Giles' avbd-demo2d and
  avbd-demo3d (MIT) and box2d-lite by Erin Catto (MIT): `vendor/three-avbd/LICENSE`, `THIRD_PARTY_NOTICES.md`. The
  method is *Augmented Vertex Block Descent* (Giles, Diaz and Yuksel, SIGGRAPH 2025).
- **Sky and particles**: from three-voxel-destruction by Steven Bobyn (MIT), by way of Patch's Brickfall and Timberfall.
- **Textures and sky light**: Poly Haven, CC0. **Leaf and grass cards**: from ambientCG's LeafSet004, Foliage001 and
  Foliage006, CC0.
- **Red Hat Mono**: The Red Hat Project Authors, SIL Open Font License 1.1.
- **three.js**: MIT.
- **The sounds**: recordings under CC0, public domain and CC-BY, each named with its author and link in `CREDITS.txt`.
  The sound design follows Patch's game Timberfall: the same layers by material and size, and the same mix.
- **The structures, the cannon, the demo and its sound code**: Patch, MIT. **The pictures in `thumbs/`**: stills of this
  demo, Patch, CC0.

Code: MIT (`LICENSE`). Textures, sky and pictures: CC0. Sounds: CC0, public domain and CC-BY 4.0 (credit them as `CREDITS.txt` does if you reuse them). The font is OFL 1.1.
