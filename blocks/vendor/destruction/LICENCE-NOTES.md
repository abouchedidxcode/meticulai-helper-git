# Where every part came from

| Part | From | Licence | In this repo |
|---|---|---|---|
| The physics | [three-avbd](https://github.com/sbobyn/three-avbd) by Steven Bobyn, commit `cd3ce901557aa9cf4f7ede489fac385971d383ea` (2026-10-24, the 0.4.0 release candidate) | MIT, © 2026 Steven Bobyn | `vendor/three-avbd/` (`src/lib`, `src/avbd3d`, `src/avbd2d`, one kernel changed: its `VENDOR.md`), with its `LICENSE` and `THIRD_PARTY_NOTICES.md` |
| three-avbd's own third-party parts | TypeScript ports of avbd-demo2d and avbd-demo3d (Chris Giles), box2d-lite (Erin Catto), three.js | MIT | listed in `vendor/three-avbd/THIRD_PARTY_NOTICES.md` |
| The sky and the particles | [three-voxel-destruction](https://github.com/sbobyn/three-voxel-destruction) by Steven Bobyn, by way of Patch's Brickfall and Timberfall | MIT, © 2026 Steven Bobyn | `src/render/sky.ts`, `src/fx/particles.ts`; licence `vendor/LICENSE-three-voxel-destruction.txt` |
| The structures, welds and their tuning, the cannon, the yard, the demo | Patch, after its game Timberfall | MIT, © 2026 Patch | `src/` |
| The sound's code and design | the layers and the mix, after Timberfall's (`src/audio/`) | MIT, Patch | `src/audio/`, `make-audio.mjs` |
| The sounds | recordings from Freesound and Wikimedia Commons, and Kenney's Impact Sounds from Patch's asset library, cut, filtered and mastered by Patch | CC0, public domain, CC-BY 4.0: each one in `CREDITS.txt` and `audio-build/layers.json` | `public/audio/` |
| Textures | [Poly Haven](https://polyhaven.com/textures): rough_wood, fine_grained_wood, clay_roof_tiles_02, rock_surface, rough_concrete, rusty_metal_sheet, leafy_grass, gravel_floor, bark_brown_02 (1k, WebP) | CC0 | `public/textures/` |
| Sky light | [Poly Haven](https://polyhaven.com/a/qwantani_late_afternoon_puresky): Qwantani late afternoon, puresky, 1k | CC0 | `public/hdri/` |
| Leaf and grass cards | [ambientCG](https://ambientcg.com): LeafSet004, Foliage001, Foliage006, composed into a leaf-cluster and a grass-tuft card (Timberfall's `art-build/foliage.py`, `grass.py`) | CC0 | `public/textures/leaf_cluster.webp`, `grass_tuft.webp` |
| The Structure choice's pictures | stills of this demo (`make-thumbs.mjs`) | CC0, Patch | `thumbs/structures/` |
| Red Hat Mono 500 | The Red Hat Project Authors | SIL OFL 1.1 | `fonts/` |

Left out of Timberfall on purpose: its sound files (built from a commercial sound library, licensed for that game only;
the layers here are other people's recordings, chosen and levelled to do the same jobs),
its Poly Haven grass, shrub and rock models (size), its sledge, charges and first-person tools, and its title and
results screens. Nothing here is from a store or under game-only terms: code is MIT, textures and pictures are CC0, sounds are CC0, public
domain or CC-BY 4.0, the font is OFL.
