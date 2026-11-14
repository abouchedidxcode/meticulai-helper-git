# Blocks: ready-made effects and systems

A **block** is a piece of a game someone already built and shared for free: fire you can walk around, a car that
drives like a car, crowds that find their way, grass that bends, a painted look for the whole world. Instead of
asking the agent to invent these from nothing, it can start from a block, look at it, and change it to fit your game.

Blocks are plain code. Nothing is hidden or locked. You can read them, change them and keep them.

**Finding the right one.** You don't have to remember what's here. Once your game's plan (`my-game/GREAT.md`) is
written, the agent runs `node tools/blocks/suggest.mjs`, which reads the plan and points at the blocks that fit it
("you ride a horse and shoot arrows" finds the horse and archery blocks), with the words that matched. To browse,
open **`BY-NEED.md`**: every block grouped by what the player does or what the game needs.

- **`catalog.json`**: every block, one entry each (what it is, who made it, licence, renderer, how to add it).
- **`BY-NEED.md`**: the same blocks grouped by need ("You fly or glide", "Crowds, herds, flocks", "The look of the
  whole game"...). Generated; don't edit it by hand.
- **`vendor/<id>/`**: blocks copied into this kit, tested, with `HOW-TO-USE.md` (for the agent) and `VENDOR.md`
  (where the copy came from and what we changed).
- **`previews/<id>.jpg`**: one picture of each block.
- **`CREDITS.md`**: who made what. Thank you to Patch ([patch.gg](https://patch.gg)) for the blocks they made and
  published openly, and to every author listed there.

## Meticulai blocks

Blocks whose id starts with `meticulai-` are systems taken from games on [meticulai.com](https://meticulai.com),
made by the same person who wrote this kit: a glider's flight, a horse that moves like a horse, mounted archery,
a riso print look, webcam hand controls, music written in code, a live tuning panel, and more. Each was rewritten as
standalone code with a small demo and tests, and keeps the game's numbers exactly: those numbers were tuned by
someone playing until it felt right, so start from them before changing anything.

Each one says which game it came from (`from_game`) and links to it (`play_url`) when the game is on the site:
**play it to see what the system feels like at its best.** Its `HOW-TO-USE.md` has a section "What made it good in
<the game>". `use_when` is one sentence about the situation it fits; that's what `suggest.mjs` matches your plan
against. Code is MIT; anything inside made by someone else is credited in the block's `LICENSE` and in `CREDITS.md`.

## Two kinds of entry

| `status` | What it means | Where the code comes from |
|---|---|---|
| `ready` | Copied into `blocks/vendor/<id>/`, built and checked in a hidden browser on 2026-11-14 | This kit (a few large files download at add time, see `fetch`) |
| `reference-only` | We point to the original author's repo at a pinned commit, and don't copy it | `upstream.repo` at `upstream.commit` |

Blocks made by Patch (and the patch.gg user blendi) are copied here with credit. When a Patch demo is built on someone
else's library, we point to **the original author** instead. Some of those entries have an `also_see` link to Patch's
game-ready version, as an option, not the main pointer.

## How the agent chooses one

1. **Start from the game, not the block.** Read `my-game/GREAT.md` (the feeling, the verb, the look in words) and
   `my-game/ASSETS.md`. Only reach for a block when the game needs that thing. `node tools/blocks/suggest.mjs`
   lists the candidates and why each matched; it is a pointer, not a decision. `node tools/blocks/list.mjs --need
   <need>` shows one group of `BY-NEED.md`.
2. **Match the look.** A painterly game wants `oil-paint`, `watercolour`, `painted-valley` or `coloured-pencil`, not
   photoreal Poly Haven textures. A pixel game wants `pixelfx` or `pixel-plays`. Mixed styles look cheap.
3. **Check the renderer** (`renderer` in the catalog). This matters more than anything else:
   - `webgl2`: works with the starter as it is (the starter uses three.js's normal `WebGLRenderer`).
   - `webgpu`: needs three.js's `WebGPURenderer` (`import * as THREE from 'three/webgpu'`) **and** a browser that
     has WebGPU (recent Chrome or Edge; Safari and Firefox are catching up). The starter does not use it. Switching
     a game to it is a real job: any `ShaderMaterial`, the WebGL error checks and shader warm-up must change. Only do
     it when the block is the heart of the game, and tell the user their players need a recent Chrome or Edge.
   - `both`: built on `three/webgpu`, which falls back to WebGL 2. Still needs the `WebGPURenderer`, but runs in more
     browsers.
   - `2d`: plain canvas, no three.js needed. `none`: a library or a tool, not a renderer thing.
4. **Look at the preview** (`previews/<id>.jpg`) and read `good_for` and `not_for`.
5. **Check the licence.** Code here is MIT or Apache-2.0. Art is mostly CC0. Anything CC-BY (for example some sounds
   in `destruction`) needs the author's name in `my-game/CREDITS.md`; `add.mjs` adds the block's lines for you.
6. **Run its demo first** if you are unsure: `cd my-game/vendor/<id> && npm install && npm run dev`. Seeing it
   is faster than guessing.

## How to add one

```
node tools/blocks/add.mjs <id>
```

- For a `ready` block it copies `blocks/vendor/<id>/` into `my-game/vendor/<id>/`, downloads any files listed in
  the entry's `fetch` (each one: `{ path, url, bytes, sha256 }`; the download is checked against `sha256`), and
  appends the credit lines to `my-game/CREDITS.md`.
- For a `reference-only` block it clones `upstream.repo` at `upstream.commit` into `my-game/vendor/<id>/` (and
  the same credits). Read that repo's README before using it.
- Then follow `my-game/vendor/<id>/HOW-TO-USE.md` (ready blocks) or the upstream README.

Each block keeps its own `package.json` so its demo still runs on its own. To use it inside the game, import its
files from `my-game/src/game/...` (for example `../../vendor/fire/src/fire/index.js`) and add the npm packages it
needs to `my-game/package.json`. Keep one copy of three.js: add `resolve: { dedupe: ['three'] }` to
`my-game/vite.config.js`. Most blocks were made for three 0.185-0.187; the starter uses 0.187.

Some blocks are **"start from this scene"** rather than drop-in parts. The five painted looks draw the whole frame
themselves (their own materials and final pass), so none of them is a filter over the starter's grey boxes.
`oil-paint`, `watercolour` and `painted-valley` are best used as the game's starting scene; `coloured-pencil` and
`patchwork-quilt` can convert the starter's meshes one by one. Blocks that draw the frame (these five, `fire`,
`touch-grass`) need a small draw hook in `my-game/src/render/renderer.js`; each `HOW-TO-USE.md` gives the exact lines.

## How to remix one

It is just code. Read its `README.md` and `HOW-TO-USE.md`, change what you need (colours, sizes, shaders, the scene),
and keep its `LICENSE` and credits files. Write what you changed in `my-game/vendor/<id>/VENDOR.md` under
"What we changed", so the next agent knows. If the change is big, record it in `my-game/DECISIONS.md` too.

## All blocks

The Meticulai blocks are listed in `BY-NEED.md` (with the game each came from) and in `catalog.json`.

Ready (copied here, tested; sizes are this kit's copy):

| Block | Kind | Renderer | Size | One line |
|---|---|---|---|---|
| `oil-paint` | effect | webgl2 | 0.6 MB + 7.6 MB fetched | The world as thick oil paint, dab by dab, pinned so it stays put as you move |
| `watercolour` | effect | webgl2 | 0.4 MB + 7.6 MB fetched | A pencil drawing that is painted in watercolour as you walk through it |
| `coloured-pencil` | effect | webgl2 | 0.4 MB + 7.6 MB fetched | A sketchbook world in coloured pencil with a graphite outline |
| `patchwork-quilt` | effect | webgl2 | 0.6 MB + 7.6 MB fetched | A world sewn from cloth, seen like a miniature on a table |
| `painted-valley` | effect | webgl2 | 2.4 MB + 7.6 MB fetched | Hand-painted animated-film backgrounds, four times of day |
| `slice-anything` | system | both | 6.8 MB | Cut any mesh along any plane into solid physics pieces with real insides |
| `impossible-spaces` | system | webgpu | 10.1 MB | Portals: rooms bigger inside than out, loops, doors onto walls |
| `touch-grass` | system | webgl2 | 3.6 MB | Grass that bends, can be mown and burnt, and remembers |
| `realistic-procedural-dungeons` | system | webgl2 | 6.9 MB | Seeded dark stone crypts to walk in first person, layout as data |
| `fire` | effect | webgl2 | 0.3 MB | Real 3D flames in shader math: candle to bonfire, with light and smoke |
| `car` | system | webgl2 | 11.1 MB | A physical car on Rapier: tyres, suspension, gearbox, surfaces |
| `destruction` | system | webgpu | 12.6 MB | Welded structures that break by load under cannon fire (on three-avbd) |
| `crowds` | system | webgl2 | 1.8 MB | Navmesh crowds and enemies that path around any level (on recast-navigation-js) |
| `pixelfx` | effect | 2d | 3.0 MB | 244 pixel art effects in code, any palette, plus a skill to make more |

Reference-only (we point to the original author):

| Block | Kind | Renderer | Original author | One line |
|---|---|---|---|---|
| `ez-tree` | tool | webgl2 | Daniel Greenheck | Procedural realistic trees from presets and a seed |
| `lowpoly-tree-generator` | tool | webgl2 | Pajama Studio | Faceted low-poly trees, rigged to walk and stomp |
| `nanite-forests` | system | webgpu | Victor Zakharov | A million trees with culling, impostors and auto quality |
| `particle-fluids` | system | webgpu | Daniel Greenheck | Liquid, jelly, cloth and smoke as GPU particles |
| `procedural-animals` | system | webgl2 | Majid Manzarpour | 24 animals built, rigged and furred in code; has an llms.txt |
| `ultra-water` | effect | webgl2 | Humpalumps | FFT ocean with breakers, foam, caustics, underwater view |
| `ultra-elements` | effect | webgl2 | Humpalumps | 39 tunable elemental spells simulated on the GPU |
| `effekseer` | effect | webgl2 | Effekseer Project | Effekseer's web player, plus CC0 stylised sample effects |
| `eanpa-sky` | effect | webgpu | SkyeShark | Soft painted sky with time of day and weather |
| `skyscape-clouds` | effect | webgpu | nagoya0, after takram | Volumetric clouds, atmosphere, sun, moon and stars |
| `geometry-painter` | tool | both | mohamedachrefelouafi | Paint crystals, cracks or silk that grow along any mesh |
| `elemental-abilities` | effect | webgl2 | mohamedachrefelouafi | Aimed character abilities with decals, light and shake |
| `cinematic-spells` | effect | webgl2 | mohamedachrefelouafi | Long spell set pieces that pin and tear ragdolls |
| `soil-and-grass` | effect | webgl2 | mohamedachrefelouafi | Shader soil under 200,000 wind-blown grass blades |
| `pixel-plays` | system | 2d | Amir Mushich | Isometric pixel dioramas with light, dither and wind |
| `voxel-destruction` | system | webgpu | Steven Bobyn | Teardown-style voxel buildings that really fall |
| `three-avbd` | system | webgpu | Steven Bobyn | GPU rigid bodies with breakable joints (under `destruction`) |
| `recast-navigation` | system | none | Isaac Mason | Navmesh, pathfinding and crowds (under `crowds`) |
| `procedural-terrains` | system | webgl2 | ZyFou | Whole worlds from a seed, for games seen from the air |
| `dungeon-forge` | system | webgl2 | Majid Manzarpour | Seeded dungeons with room roles and five themes |
| `00gamedevs-vfx` | effect | webgl2 | 00GameDevs | Five big magic effects, one module each |
| `trompe` | tool | none | Patch | Paints a grey level with image models (paid calls: ask first) |
| `anymove` | tool | none | Patch | Animation for any creature from one AI video (Python, paid calls: ask first) |

`trompe` and `anymove` are Patch's own, but they are large Python/ML tools that make paid calls, so we point to
their GitHub repos instead of copying them. Never run them without the user's yes on the cost.

## Why each Patch project is copied or pointed to

The source list was the 35 open-source blocks published on patch.gg (checked 2026-11-14). The rule: copy what Patch
wrote; point to the original author when Patch's version is mostly someone else's library.

| Patch project | Decision | Why |
|---|---|---|
| blendi/oil-paint, watercolour, coloured-pencil, patchwork-quilt, painted-valley | copied | Patch's own code and CC0 art. The shared character files (Rapier copy and two models, 7.6 MB) download at add time instead of being stored five times |
| blendi/slice-anything, impossible-spaces, touch-grass | copied | Patch's own systems; libraries (Rapier) come from npm; art is Poly Haven/ambientCG CC0 |
| blendi/realistic-procedural-dungeons | copied | Its own code; Poly Haven CC0 textures |
| patch/fire | copied | Written by Patch from scratch, no files |
| patch/car | copied | Patch's code; the tyre and gearbox ideas are ported from MIT Godot projects, credited |
| patch/destruction | copied | Patch wrote the structures, welds, cannon and scene (about 250 KB of its own code) on top of three-avbd, which is credited and also listed |
| patch/crowds | copied | Small but real game API (groups, milling, blending, instanced figures) over recast-navigation-js from npm, which is credited and also listed |
| patch/pixel-effects (= patch-gg/pixelfx) | copied from GitHub | Patch's own library; README GIFs left out |
| patch/voxel-destruction | pointed to `voxel-destruction` | The voxel world, chunk graph, solver wiring and renderer are Steven Bobyn's; Patch added scenes |
| patch/terrain | pointed to `procedural-terrains` | A thin wrapper round ZyFou's library |
| patch/forests | pointed to `nanite-forests` | The renderer and most of the world are Victor Zakharov's threejs-nanites |
| patch/dungeons | pointed to `dungeon-forge` | The generator, themes and kit are Majid Manzarpour's Dungeon Forge |
| patch/tree-generator, lowpoly-trees, particle-physics, animals, ocean, elements, effekseer, stylised-sky, clouds, geometry-painter, abilities, spells, soil-and-grass, pixel-dioramas | pointed to the original | Patch's game-ready versions of other people's libraries; the original author is the main credit |
| 00vchannel/00gamedevs-vfx-starter | pointed to the author's release | It is the original author's own pack (not Patch's); kept as a pinned reference |
| patch/trompe, patch/anymove | pointed to GitHub (by Patch) | Big Python/ML tools with paid calls; not for copying into a game |

## For the agent: catalog fields

`id, name, kind (effect|system|tool|look|input|audio|ai|physics|procgen|vehicle|character|combat|ui|dev-tool), what,
by, license, art_license, upstream {repo, commit, also?}, vendored (path or null), status (ready|reference-only),
renderer (webgl2|webgpu|both|2d|none), size_kb, fetch? [{path, url, bytes, sha256}], good_for, not_for, how_to_add,
agent_docs, preview, stars, last_push, npm, built_on?, also_see?, notes?`. Stars are GitHub stars (null for patch.gg
repos, which have none).

Meticulai blocks add: `use_when` (one sentence: the situation it fits), `tags` (words and synonyms people use for
it), `from_game`, `play_url` (or null if the game isn't on the site), `third_party` [{what, author, license, url}],
`tuned_by_play` (true when the numbers were tuned by a person playing), `tests` (how many tests pass), and optionally
`needs` (which `BY-NEED.md` groups to list it under: fly, ride, shoot, crowd, world, look, hands, sound, physics,
build, tuning, other; otherwise it is worked out from its words).

**Keeping the catalogue current.** Each Meticulai block's entry lives in its own `vendor/<id>/block.json`. Don't
edit those entries in `catalog.json` by hand: run `node tools/blocks/build-catalog.mjs`. It merges every
`block.json` into `catalog.json` (hand-written entries stay as they are), rewrites `BY-NEED.md` and the Meticulai
section of `CREDITS.md`, and prints any problem in plain words. Running it twice changes nothing.
