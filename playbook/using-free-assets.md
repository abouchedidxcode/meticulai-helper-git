# Using free assets

**The rule:** before generating anything or hand-coding a complex effect, check what already exists for free: ready-made
blocks, then CC0 assets, then assets that need a credit. Pick one or two style families first, look at every asset
before it goes in, and make free material look like *your* game with one palette, one light and shared materials.
Free is the start of the craft, not a replacement for it. Credits are written by the tools, never from memory.

## Evidence

**Reuse made the fastest good game.** Marble Golf was built from copies of Lost Marbles' room photo, wood scans,
marble shader, physics and sounds, and its back nine mostly from Lost Marbles' own course builder. Nothing new had to
be invented to look good, so the work went into holes, shots and secrets. One proven kit, reused whole, beat any
amount of new art. ([Lost Marbles and Marble Golf](../case-studies/lost-marbles.md))

**Free photoscans plus craft can look like real life.** Under Glass, a game about catching a hornet under a glass bowl
in a sunlit living room, is built from about 70 CC0 photoscanned objects from Poly Haven, a room shell made in code,
and a garden view from a free Poly Haven panorama. What made it look real was not the downloads but what was done
with them: its own renderer, baked light, soft sun shadows, one grade over everything. The assets were raw material.

**One free photo set the whole look.** Lost Marbles' look is "macro photography of a toy run". The room behind the
track, and the light on every marble, come from one free Poly Haven HDRI (a 360-degree photo that also lights the
scene). Most other things are made in code. One well-chosen free asset can carry a game's identity.

**$0 on assets is not the problem; no craft is.** In one run of twelve games built at once, the creator looked at
screenshots of ten and wrote that they looked "like ai slop instead of an intentional and visually stunning and
impressive game." Seven of the ten had spent nothing on assets, and their scenes were built from default primitives:
box cities, plain spheres with dot eyes, flat lighting, empty space. The fix the creator set was **"craft, not
cost"**: gorgeous games had been made entirely in code, or with free asset packs and open-source effects. The problem
was intention, not money. Free assets used with care, and good shaders, were the answer; spending more was not.
([The 12-game run](../case-studies/the-12-game-run.md))

**Realistic scans don't automatically win.** Bonesworth, a tavern dice game, was rebuilt as a photoreal table with
scanned free assets. The creator preferred the older, chunkier hand-made look. Pick the family that fits the game, not
the most detailed one available. ([Picking a look](picking-a-look.md))

**A wrong credit once shipped.** Lost Marbles credited its room HDRI under the name of a different panorama from the
same library. Nobody noticed until much later. That's why the kit's tools write the credit line
from the library's own data when a file comes in, and the agent only checks it.

## Mixed families look cheap

A family is a set of assets that share a style: one library's low-poly kit, one artist's pixel tiles, or realistic
scans from Poly Haven and ambientCG. Inside a family, detail, proportions and colour already agree. Across families
they don't: a photoscanned rock next to a flat-shaded Kenney tree reads as "assets from different places" at once,
even to someone who can't say why. Pick one or two families before pulling anything, and write them down.

Mixing is fine when it's a decision: a realistic sky and light over stylised props, or one hero model from another
source, recoloured and rescaled until it belongs. Mixing by accident, because each search returned something from a
different library, is what breaks the look.

## Making free assets look like your game

- **One palette.** Write it in `my-game/palette.json`. Recolour models to it (`node tools/assets/restyle.mjs --palette`),
  tint textures in the material, set block colours from it. Everything shares the same few hues.
- **One light.** One sun direction and colour, one ambient, one fog, for every asset. Assets that come with their own
  baked lighting or glowing materials get that removed or toned down.
- **Shared materials.** Ten props using three materials (wood, stone, cloth) look like one world; ten props with ten
  materials look like a shop window. Replace or merge materials when you bring a model in.
- **Consistent detail.** The most detailed thing on screen should be the thing that matters. A 2K-textured crate next
  to a flat-coloured player pulls the eye to the wrong place. Simplify the busy one or enrich the plain one.
- **Real scale.** Doors about 2 m, crates about 0.6 m, people about 1.7 m. Assets arrive in all kinds of units; check
  the metres on the look sheet and fix with `--scale-to`.
- **Restraint in post-processing.** Bloom, grain, vignette and heavy colour grades don't glue mismatched assets
  together; they make it look more like AI output. Fix the assets, keep post light.

## Licences in one minute

- **CC0 / public domain:** use it for anything, change it freely. No credit needed; the kit credits it anyway.
- **CC-BY:** use and change freely, but name the author, the licence and a link, in `CREDITS.md` and on the game's
  credits screen. Lost Marbles' radio has CC-BY tracks credited this way.
- **CC-BY-SA:** usable, but your changes to that asset must be shared under the same licence. Avoid unless nothing
  else fits.
- **MIT / Apache (code, including blocks):** use and change freely; keep the licence file and the copyright line.
  `tools/blocks/add.mjs` does this.
- **SIL Open Font License (fonts):** fine for games; credit the font.
- **Never:** non-commercial (NC), no-derivatives (ND: recolouring is a derivative), "free for personal use",
  "editorial use only", GPL art, unclear or missing licences, and anything from another game, film or brand.
- Some libraries include AI-generated assets; `sources/catalog.json` marks them (`ai_generated`). Know what you're
  using and note it in CREDITS.md.

Each library's exact duties and gotchas are in `sources/<id>.md`.

## How to apply it

- [ ] Write `my-game/ASSETS.md` from GREAT.md: every need, and the ladder (block, CC0, credit-required, code, fal).
- [ ] Pick one or two families and fill `my-game/palette.json` before pulling anything.
- [ ] Look at every candidate with `node tools/assets/look.mjs` (with `--in-game` once the palette exists) before it
      goes in. Never judge by name.
- [ ] Remix to fit: palette, scale, pivot, texture size, shared materials.
- [ ] Bring files in only with `get.mjs` or `get.mjs promote`, so the credit line is written for you; then read it.
- [ ] Record each decision, and each rejection with its reason, in ASSETS.md.
- [ ] Let critic-art judge coherence in the next recording. Fix mismatches by remixing or swapping, not by adding.

Full process: [skills/find-assets/SKILL.md](../skills/find-assets/SKILL.md). Related: [picking a look](picking-a-look.md),
[scope](scope.md), [audio](audio.md).
