# SDF meshes: where this copy came from

From Dig Site, Orbitball and Abyssal by Meticulai (meticulai.com). None of the three games is released yet.
Extracted 2026-11-14 from each game's source:

| Game | Commit | State | Files used (relative to the game folder) |
|---|---|---|---|
| Dig Site | `996121c47` | clean | `src/sdf.js` |
| Orbitball | `cd0a399b8` | clean | `src/sdf.js` |
| Abyssal | `ebec2fde4` | clean | `src/world/mesher.ts`, `field.ts`, `layout.ts`, `noise.ts`, `chunkgen.ts`, `chunk.worker.ts`, `terrain.ts`, `src/config.ts` (chunk size, voxel, view radius, depth bands) |

| | |
|---|---|
| Code licence | MIT (see `LICENSE`), plus the third-party notices in `LICENSE` |
| Art licence | none: there are no files, every shape is code |
| Renderer | webgl2 (the core is renderer-free; `geometry.js` and `streamer.js` use three.js) |

## Credits

- Inigo Quilez: polynomial smooth min/max, the bound-corrected ellipsoid and the exact round cone (MIT,
  iquilezles.org). The games marked them "(iq)" in comments; this block names him in the code and in `LICENSE`.
- Stefan Gustavson: the simplex noise reference that `noise.js` follows (public domain).
- Tommy Ettinger: mulberry32 (public domain).
- Yann Collet: the xxHash prime constants used in the two integer hashes (constants only).
- No Dave Hoskins hash, no shader code and no assets came from anyone else.

## What changed

- **One mesher instead of three.** The three games each had their own surface nets. `mesher.js` has one core
  (`surfaceNets`) with Abyssal's chunk tiling (`lo`/`hi`) and both sign conventions (SDF negative inside, or density
  positive inside). Faces are wound outward by Dig Site's rule, so Abyssal's extra "flip every triangle to match the
  normal" pass was dropped (a test checks the winding instead).
- **Dig Site** (`sdf.js`, `meshSDF`): kept as is, numbers unchanged (narrow band with a 4x coarse grid and a 1.2 x
  coarse-cell band, 2 projection steps, gradient step cell/4, cavity AO over 3 cells with 5 samples, weights x0.6, x1.6
  gain). Added `cylinder`, `mirrorX` and an option to turn the narrow band off. The mesher now returns plain typed
  arrays; `toGeometry()` in `geometry.js` makes the three.js geometry.
- **Orbitball** (`parts.js`, `meshParts`): kept the parts list, splatted grid fill, 2 projection steps clamped to one
  cell and analytic normals. `basisFromAxis` rewritten without three.js. Bounds are now optional (computed from the
  parts). Optional baked AO. Dropped the `'carve'` op: it was documented in a comment but never implemented or used.
- **Abyssal** (`cave.js`, `chunks.js`, `chunk.worker.js`, `streamer.js`): TypeScript converted to JavaScript with
  JSDoc. The field takes the tube list as input (`new CaveField({ seed, tubes, ...options })`) and every tuned number
  (warp 4.5/3.5/4.5 m at 0.03/m, blend 5 m, rooms x0.9, vertical squash 1.18, roughness 1.9/1.2/0.55, detail band 9 m,
  floor noise 3 m) is an option with that value as default. The depth-based extra roughness is now the
  `roughDeepening` option. `makeCaveLayout(seed)` keeps the game's route planner (galleries, shafts, side chambers
  through necks, shortcuts, the great cavern; same ranges and chances) but drops the drop-cage shaft, the salvage
  spots and the game's biome config. The worker is sent the field spec instead of rebuilding the game's layout.
  `CaveStreamer` is the game's `Terrain` class, with a main-thread fallback when there are no workers.
- **Left out:** the coral/colony placement and the "rock skin" around colonies (`chunkgen.ts` decor, `depthlife.ts`,
  `reach.ts`), hydrothermal vents, the game's rock shader (`render/rock.ts`; `withBakedAO()` is a small stand-in),
  Orbitball's skinning and material zones (in `character/body.js`, not in the mesher), Dig Site's skeleton builders.
- **Added:** `test/sdf.test.mjs` (8 tests: none of the meshers had unit tests in Dig Site or Orbitball), the demo, the
  `withBakedAO` material patch.

## Checked

On 2026-11-14: `npm install`, `npm test` (8 pass) and `npm run build` in a temporary copy; the demo ran in headless
Chromium with no errors. Shapes page: bone 33k triangles in ~150 ms, creature 61k in ~190 ms, helmet 64k in ~125 ms,
rock 20k in ~35 ms, cave block 63k in ~380 ms. `?fly`: 3 workers built 138 cave chunks in 10 s. Picture:
`blocks/previews/meticulai-sdf-meshes.jpg`.
