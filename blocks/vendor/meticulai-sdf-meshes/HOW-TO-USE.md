# SDF meshes: how to use it

Model smooth, organic 3D shapes in code (bones, creatures, helmets, rocks, blobby props) as signed distance fields,
and turn them into ordinary three.js meshes at load time with surface nets. Also: seeded 3D caves (tunnels, shafts,
chambers, overhangs, not a heightmap) meshed in chunks by Web Workers and streamed around the player, with collision
against the same field. No models, no textures, no paid generation.

Renderer: **webgl2** (plain `BufferGeometry` + any material). The core (`src/index.js`) has **no imports at all** and
runs in Node and in workers; only `src/geometry.js` and `src/streamer.js` import `three` (^0.187).

## The idea in one paragraph

An SDF is a function `(x, y, z) => distance`, negative inside the shape. Shapes are made by combining functions:
`sunion(k, a, b)` blends two shapes with a rounded join of radius `k`; `subtract(k, a, b)` carves; `intersect` keeps
the overlap. `meshSDF(f, min, max, cell)` samples the field on a grid inside the box and builds triangles where the
sign changes, then pushes every vertex onto the exact surface, so a coarse grid still looks smooth.

## API

```js
import { sphere, ellipsoid, roundCone, capsule, roundBox, cylinder, tube, curve,
         union, sunion, subtract, intersect, translated, rotX, rotY, rotZ, scaled, mirrorX, mirrorZ, shell, rough,
         meshSDF, meshParts, ellipsoidPart, roundConePart, roundBoxPart, cylinderPart, customPart, basisFromAxis,
         CaveField, caveTube, makeCaveLayout, buildChunk, chunkKey, chunkOf, liveChunks } from '../../vendor/meticulai-sdf-meshes/src/index.js';
import { toGeometry, withBakedAO } from '../../vendor/meticulai-sdf-meshes/src/geometry.js';
import { CaveStreamer } from '../../vendor/meticulai-sdf-meshes/src/streamer.js';
```

**1. Functions (from Dig Site): quickest to write.**

```js
const bone = rough(sunion(0.06,
  tube(curve([[-0.4, 0, 0, 0.075], [0, 0.03, 0, 0.055], [0.4, 0, 0, 0.07]], 14), 0.02), // bent shaft
  sphere(-0.45, 0.04, 0, 0.1), sphere(0.47, 0, 0, 0.08)), 0.0025, 22);                 // knobs, relief
const data = meshSDF(bone, [-0.6, -0.15, -0.18], [0.6, 0.16, 0.18], 0.007); // box must contain the shape
const mesh = new THREE.Mesh(toGeometry(data), withBakedAO(new THREE.MeshStandardMaterial({ color: 0xe6dcc4 })));
```

- Primitives: `sphere(cx,cy,cz,r)`, `ellipsoid(cx,cy,cz,rx,ry,rz)`, `roundCone(ax,ay,az,bx,by,bz,ra,rb)`,
  `capsule(...a, ...b, r)`, `roundBox(cx,cy,cz,hx,hy,hz,r)`, `cylinder(cx,cy,cz,r,halfH,round)`,
  `tube([[x,y,z,r],...], k)` (tapered polyline), `curve(ctrl, n)` (Catmull-Rom points for `tube`).
- Combine: `union`, `sunion(k, ...)`, `subtract(k, a, ...b)`, `intersect(k, a, b)`, `shell(f, thickness)`.
- Move: `translated`, `rotX/Y/Z(f, angle)`, `scaled(f, sx, sy, sz)`, `mirrorX`, `mirrorZ` (model one side).
- Relief: `rough(f, amp, freq)` adds pits and ridges (value noise).
- `meshSDF(f, min, max, cell, { ao = true, aoDist = 3 * cell, project = 2, narrowBand = true })` returns
  `{ positions, normals, ao, indices }` (typed arrays). Turn `narrowBand` off if a thin part goes missing.

**2. Parts lists (from Orbitball): fastest for big models with many parts.**

```js
const parts = [
  { prim: ellipsoidPart([0, 0.3, 0], [0.22, 0.2, 0.2]), k: 0 },                         // body
  { prim: roundConePart([0.1, 0.22, 0.05], [0.13, 0.03, 0.08], 0.06, 0.045), k: 0.04 },  // leg, blended 4 cm
  { prim: ellipsoidPart([0.06, 0.54, 0.17], [0.028, 0.028, 0.02]), op: 'sub', k: 0.012 }, // eye socket
];
const data = meshParts(parts, { cell: 0.0065, ao: true }); // bounds worked out from the parts
```

Each part only fills the grid inside its own box, so 50 parts cost little more than 5. `ellipsoidPart`,
`roundBoxPart` and `cylinderPart` take an optional basis (`basisFromAxis(axis, hint)`) to tilt them along a limb.
`customPart(f, [min, max])` wraps any function from (1). Order matters: `'sub'` carves only what came before it.
`data.field` is the exact distance function, handy for skin weights or placing things on the surface.

**3. Caves (from Abyssal).** `CaveField` is a density: **positive = rock**, negative = open, about metres to the wall.

```js
const layout = makeCaveLayout(1234);       // or write tubes yourself: [caveTube([x,y,z], [x,y,z], ra, rb, kind), ...]
const spec = { seed: 1234, tubes: layout.tubes, floorY: layout.floorY }; // plain data: workers rebuild it
const caves = new CaveStreamer(spec, { material: withBakedAO(new THREE.MeshStandardMaterial({ color: 0x9a8f80, roughness: 0.95 }), 0.9) });
scene.add(caves.group);
await caves.waitFor(startPos);             // behind a loading screen
// every frame:
caves.update(playerPos);                   // nearest chunks first, drops far ones
if (caves.field.density(x, y, z) > 0) { /* inside rock: push out along -caves.field.grad(x, y, z) */ }
```

- Tube kinds: `'passage'`, `'neck'`, `'shortcut'`, `'chamber'`, `'cavern'` (the last two are widened by `roomScale`).
- `buildChunk(field, key, { chunk: 24, voxel: 1 })` works without three.js (Node, tests, a custom worker).
- For one small cave piece, skip the chunks: `meshSDF((x, y, z) => field.sdf(x, y, z), min, max, 0.5, { narrowBand: false })`
  (the demo's cut-away block does this, intersected with a box).

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-sdf-meshes` (copies to `my-game/vendor/meticulai-sdf-meshes/`). No npm
   packages to add: the starter already has `three`.
2. Write your shapes in `my-game/src/game/shapes.js` (one exported function per shape) and mesh them in
   `createGame(ctx)` in `src/game/game.js`, once, at load. Mesh each shape ONCE and reuse the geometry for every copy
   (meshing is the slow part; Dig Site caches one geometry per shape and size).
3. Keep the sizes that matter in `src/tuning.json` only if the user should tweak them live; re-meshing on a slider
   change costs 0.1 to 1 s per shape, so re-mesh on release, not on every move.
4. Caves: create the `CaveStreamer` in `createGame`, add `caves.group` to the scene, call `caves.update(player.position)`
   in `update(dt, mode)`, and use `caves.field.density` for collision. Vite bundles the worker by itself (it is
   started with `new Worker(new URL('./chunk.worker.js', import.meta.url), { type: 'module' })`). `caves.dispose()` on
   restart if the seed changes.
5. Put `caves.ready` (chunks built) and your mesh timings in `window.__game.state` so tests can see them.

## Numbers that matter

| Number | Value | What it feels like |
|---|---|---|
| `cell` (grid size) | Orbitball: body 7.2 mm, gloves 3.2 mm, boots 4.2 mm, helmet 3.4 mm; demo: 6.5-10 mm for 0.5-1 m props | Half the cell = 4x the triangles, ~8x the time. Pick the biggest cell that keeps your thinnest part |
| `k` (blend radius) | 0.02-0.07 m on a 1.8 m figure | Small: crisp joins. Large: melted, soft, cartoony |
| `project` | 2 Newton steps, each clamped to one cell | 0 = blocky "voxel" surface; 2 is smooth |
| AO (`aoDist`) | 3 cells, 5 samples | Darkens creases, sockets and the gaps between ribs |
| Cave chunk / voxel | 24 m / 1 m | ~70 ms per chunk in a worker; 0.5 m voxels look finer but cost ~8x |
| Cave view radius | 78 m, up to 3 workers | Just past the fog; smaller is faster |
| Cave warp | 4.5 / 3.5 / 4.5 m at 0.03 per m | No straight wall anywhere; set to 0 to see the bare tubes |
| Cave roughness | 1.9 m big lumps, 1.2 m finer, 0.55 m ridges | Lower = smooth water-worn tubes; higher = broken rock |
| `squashY` | 1.18 | Passages have floors instead of being round pipes |

Measured in the demo (headless Chromium, a laptop): bone 33k triangles in 150 ms, creature 61k in 190 ms, helmet 64k
in 125 ms, cave block 63k in 380 ms.

## What made it good in Dig Site, Orbitball and Abyssal

- **Everything in code.** All three games were asked to build their assets in code where possible. Dig Site meshes
  every bone of three skeletons (a small theropod, a flying reptile, a marine reptile) from SDFs at load time;
  Orbitball builds its whole athlete, helmet, gloves and jetpack this way; Abyssal's every dive is a new cave.
- **Smooth from a coarse grid.** Orbitball's trick is pushing each vertex onto the exact surface and taking the normal
  from the field, so about 70k triangles in about 1.3 s looked smooth. Its helmet passed the hero-shot review in round
  after round, and proportions were tuned by editing primitive sizes, never by sculpting.
- **Overlap, don't add lumps.** A small "skirt" ellipsoid added under Orbitball's helmet pinched a waist and made it
  read as a peanut. One broad ellipsoid overlapping most of the shell, blended with k 0.06, gave one smooth flare.
- **Baked occlusion sells the shape.** Dig Site darkened recesses by the baked SDF occlusion (x 0.8), so sockets and
  joints read without screen-space AO.
- **Variety without re-meshing.** Meshing is slow, so Dig Site caches one mesh per rib size and varies copies through
  the instance (small angle, thickness and length jitter) and world-space colour blotches, so repeated ribs don't
  shade identically.
- **What you see is what you hit.** Abyssal's collision samples the same field as the meshes, and its chunks are built
  in workers while you swim (24 m chunks, ~70 ms each, 78 m around you), so the cave never stalls the frame.

## Gotchas

- The mesh box must contain the whole shape (plus the blend radius); a shape poking out gets an open hole there.
- `meshSDF`'s narrow band assumes `f` is close to a true distance. `scaled`, `rough` with large amplitude and cave
  densities are not: use `{ narrowBand: false }` if parts vanish.
- Meshing blocks the main thread (0.1-1 s per shape). For many shapes, mesh in a worker (the core has no imports) or
  show a loading bar; never mesh inside the game loop.
- Index buffers switch to 32-bit above 65,535 vertices (handled in `toGeometry`).
- `withBakedAO` needs the geometry's `ao` attribute; on a geometry without it the shader reads 0 and goes black.
- Cave density is **positive in rock** (the opposite sign of an SDF); `field.sdf()` flips it for the SDF tools.
- Generated caves are big (Abyssal: ~1,300 chunks, 700 m deep). For a small game, write a few tubes by hand.
- Worker URL: keep `chunk.worker.js` next to `streamer.js`, or Vite won't find it.

## Restyle it

- Colour and surface: any three.js material; `withBakedAO(material, strength)` keeps the creases dark. Flat colours +
  AO look like clay; add a world-space noise colour for stone or bone.
- Softer or harder forms: raise or lower `k` everywhere. Faceted low-poly look: `project: 0` and a large `cell`, plus
  `material.flatShading = true`.
- Caves: change `warpAmp`, `roughAmp`, `fineAmp`, `ridgeAmp`, `blend` in the spec; `makeCaveLayout(seed, { bands,
  bottomY, shortcutChance, cavern })` for the route; Abyssal's deeper-is-rougher look is
  `roughDeepening: [{ y: -250, add: 0.5 }, { y: -520, add: 0.5 }]`.

## Run the demo alone

`cd vendor/meticulai-sdf-meshes && npm install && npm run dev` (http://127.0.0.1:5403/; `?fly` flies through a
streamed cave), `npm test` (8 tests), `npm run build` for `dist/`.

## Credit

From Dig Site, Orbitball and Abyssal by Meticulai (MIT). Distance formulas by Inigo Quilez (MIT), simplex noise after
Stefan Gustavson (public domain), mulberry32 (public domain). Keep `LICENSE`.
