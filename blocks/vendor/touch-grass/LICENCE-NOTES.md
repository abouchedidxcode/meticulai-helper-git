# Licence notes: grass you can touch

Code MIT. Art CC0 1.0. Checked 2026-11-10.

| Part | Where it came from | Licence | In this repo? |
|---|---|---|---|
| `src/lib/` (field, state, fire, flames, cut grass, flowers) | Written by Patch for this block | MIT | Yes |
| The blade's arc model in `src/lib/blades.js` | Soil Studio by mohamedachrefelouafi, https://github.com/achrefelouafi/GrassSystemThreeJS at `b236b2a`, through Patch's soil and grass block. The maths is followed; no file is copied | MIT, © 2026 mohamedachrefelouafi, notice in `LICENSE` | Yes |
| `FIRE_RAMP` in `src/lib/glsl.js`, the bloom and tone-map passes in `src/lib/frame.js` | Patch's fire block, copied and changed | MIT, © 2026 Patch | Yes |
| `src/demo/` (player, scythe, torch, ball, sky, hills) | Written by Patch for this demo. The scythe is built in code: Patch's asset library has no scythe model | MIT; what it draws CC0 | Yes |
| `public/textures/Ground048_*`, `Ground103_*` | ambientCG, taken from the soil and grass block's repo, which saved them again as smaller JPEGs | CC0 1.0 (checked on ambientcg.com for that block on 2026-10-31) | Yes, in Git LFS |
| `public/assets/materials/fineGrainedWood/` | "Fine Grained Wood" by Rob Tuytel, Poly Haven, through Patch's asset library (`polyhaven:fine_grained_wood`) | CC0 1.0 | Yes, in Git LFS |
| `public/assets/audio/footstepOnGrass*.ogg` | Kenney's Impact Sounds, through Patch's asset library (`kenney:impact-sounds/footstep_grass_000` to `_004`) | CC0 1.0 | Yes |
| `fonts/red-hat-mono-latin-500-normal.woff2` | The Red Hat Project Authors | SIL OFL 1.1, `fonts/OFL-red-hat-mono.txt` | Yes |
| `lib/patch-block.js` | Patch's block helper, from staging.patch.gg/patch-block.js | Patch's, shipped with every block | Yes |
| `shots/` | Stills of this demo | CC0 1.0, Patch | Yes, in Git LFS |
| three.js | npm | MIT | Installed by npm; its notice ships as `THIRD-PARTY-NOTICES.md` |

**Left out on purpose.** While it was being made, the demo had eight sounds cut from the Sonniss GDC bundles (wind, fire, a blade, footsteps, crickets). Sonniss's licence bars supplying its sounds as files, so none of them is in this repo or its history, and the demo's scythe, fire and wind are silent. Patch's asset library had no CC0 or CC-BY recording for them on 2026-11-10 (searched: grass, fire, wind, swing, whoosh).

**Nothing here has no stated source.**
