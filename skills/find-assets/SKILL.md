---
name: find-assets
description: Plan, find, look at, judge and bring in free assets (models, textures, skies, sprites, sounds, music, fonts) and ready-made blocks (effects and systems as code), so the game gets good material fast and for $0 while still looking like one game. Use whenever the game needs art or sound, before generating anything with fal or hand-coding a complex effect, and when the user asks for a specific thing ("a mossy rock", "music for the menu").
---

# Find assets

## Goal

Every thing the game needs has a decision in `my-game/ASSETS.md`: what it is, where it comes from, and why it fits.
What ends up in the game looks like one game, not a pile of downloads. Every file someone else made is in
`my-game/CREDITS.md` with the right author and licence.

Before you start: you must be in the kit's workspace (it has `START.md` and `tools/`). If not, do START.md step 0.
Background: [playbook/using-free-assets.md](../../playbook/using-free-assets.md). Where things come from:
[sources/README.md](../../sources/README.md) (free asset libraries, one `sources/<id>.md` each with how to search,
licence duties and gotchas) and [blocks/README.md](../../blocks/README.md) (ready-made effects and systems, as code).

## When

- **Write the plan early**, right after GREAT.md is agreed. It's cheap and it shapes the swarm.
- **Pull assets after the core loop is fun.** First playable is grey boxes ([first-playable](../first-playable/SKILL.md)).
  Exception: a block that IS the core mechanic (a drivable car, an ocean you sail on, things you break apart) comes in
  during the first playable, because the loop can't be judged without it.
- **Before every fal generation** and before hand-coding a complex effect or system: check here first.
- **When the user names a thing** (`/assets a mossy rock`): do steps 3-9 for that one need.

## These are defaults, not a cage

The steps and checklist below are what usually works. Use judgement. Some things that are fine when they are
deliberate:
- A single striking hero model (the player's ship, the boss, the one object the game is about) from a different
  family, restyled to the palette so it belongs.
- Mixing two families on purpose: realistic sky and light with stylised props is a classic look. Mixing by accident
  (whatever came up first in each search) is what looks cheap.
- Taking only part of an asset: one mesh out of a 200-piece kit, the roughness map of a texture, eight seconds of a
  music track.
- Kitbashing: a cart made of a crate, two wheels and a plank from the same kit.
- Using an asset only as reference: look at how a good model shapes a tree, then write the tree in code.
- Skipping the ladder for something code does better (water, skies, particles, UI shapes).
Write the reason in ASSETS.md whenever you break a default.

## The ladder

For each need, check in this order and stop at the first option that fits well:

1. **A block**: a ready-made effect or system as code (fire, ocean, sky, trees, crowds, pixel effects), including
   systems from finished Meticulai games (flight, horses, archery, looks, webcam hands, music). Start with
   `node tools/blocks/suggest.mjs` (reads GREAT.md and ASSETS.md; `--text "<the need>"` for one need), or browse
   [blocks/BY-NEED.md](../../blocks/BY-NEED.md), or `node tools/blocks/list.mjs [--need fly] [--kind ...]
   [--renderer webgl2|webgpu|2d]`.
2. **A free CC0 asset**: no conditions at all. `node tools/assets/find.mjs "<query>" --license cc0`.
3. **A credit-required asset** (CC-BY and similar): free, but the author must be named in CREDITS.md and on the game's
   credits screen.
4. **Make it in code**: skies, water, terrain, particles, simple props, synthesised sounds. Often the best answer, not
   a fallback.
5. **Generate with fal**: only with a budget above $0 and the user's yes before each batch
   ([generate-assets](../generate-assets/SKILL.md)). Generated files go through the same look-and-judge steps.

The order is about cost and speed, not quality. If code clearly beats a download for this game, choose code.

## Steps

### 1. Write the asset plan

Fill `my-game/ASSETS.md` (copied from `templates/ASSETS.md`). From GREAT.md (the look in words, the camera, the scale
of the world), list every need: player, enemies or creatures, props, ground and walls, sky and light, effects, music,
sound effects, UI font, UI icons. One row each. For each row: where it shows (and how big on screen at the game
camera), the ladder choice you expect, and notes ("seen from 20 m above, silhouette matters more than texture").

### 2. Pick the family and the palette first

- Choose **one or two style families** before pulling anything, and write them on the `Families:` line. Examples:
  "Kenney low-poly + Poly Haven skies"; "Poly Haven and ambientCG, all realistic"; "Kenney pixel tilesets + code
  effects". `sources/catalog.json` lists each library's styles (`realistic`, `lowpoly`, `stylized`, `pixel`,
  `cartoon`, `voxel`).
- Fill `my-game/palette.json`: the base colours, accents, shadow and light colours, sun, ambient, fog, exposure. Write
  it from the look in GREAT.md. If the user gave a reference picture, start from
  `node tools/assets/palette-from.mjs <image>` and adjust. The starter's dusk palette is the default.

### 3. Scout

`node tools/assets/find.mjs "<query>" [--kind model|material|hdri|sprite|tileset|audio|music|font|icon] [--style ...]
[--source <id>] [--license ...] [--limit 12]` prints a numbered list and makes a contact sheet of thumbnails.
**Open the sheet and look at it.** Names lie; pictures don't.
- Search the family's sources first (`--source kenney`). Try two or three wordings ("boulder", "rock", "stone").
- Shortlist 2-5. Fewer if one is clearly right.
- For blocks: read `blocks/vendor/<id>/HOW-TO-USE.md` and look at `blocks/previews/<id>.jpg`. A Meticulai block
  links the game it came from (`play_url`): its "What made it good" section says what to keep.

### 4. Pull candidates

`node tools/assets/get.mjs <id|number> --candidate` downloads into `my-game/.helper/candidates/`, not into the game.
Some sites ask that robots and AI agents don't download from them (Kenney, OpenGameArt, ShareTextures: check
`agent_fetch` in `sources/catalog.json`). Respect that: send the user the pack's page link, ask them to click
Download, then use `get.mjs <id> --zip <the downloaded file>`. Never work around a site's robots rules or logins.

Use `--res` to ask for the smallest size that will do (1K textures are often enough; 2K at most for the hero).
Downloads are cached in `~/.cache/meticulai-helper/`, so pulling again is free.

### 5. Look

`node tools/assets/look.mjs <file|folder>` renders what you pulled so you can see it: a model as four views with its
size in metres, triangle count, materials and texture sizes; a texture tiled and on a sphere; a sky as a thumbnail; a
sound as a waveform with loudness; a sprite pack as a contact sheet. Once `my-game/palette.json` exists, add
`--in-game` to see it lit with the game's sun, ambient and fog. **Open every image it makes.**

### 6. Judge fit

| Check | Question |
| --- | --- |
| Style family | Is it one of the chosen families, or a deliberate exception? |
| Silhouette | At the game camera's distance, does its outline read? (Squint at the look sheet.) |
| Palette | Do its colours sit inside `palette.json`, or can they be recoloured to? |
| Detail level | Next to its neighbours, is it much busier or much plainer? One ultra-detailed scan beside flat boxes breaks the look. |
| Scale | Real size in metres matches the world (a door ~2 m, a crate ~0.6 m, a tree 4-15 m). |
| File size | Fits the budget: most props under 1 MB, the hero under 5 MB, the whole first load ideally under 30 MB. |
| Animation | Does it need to move? Rigged, with the clips you need, or can code animate it? |
| Licence duties | CC0, or credit needed? Anything non-commercial, no-derivatives or unclear is out. |

### 7. Decide, and say why

One of: **use as is**, **remix**, **reject**, **make in code**, **generate**. Write the decision and a one-line reason
in ASSETS.md ("rejected: realistic bark next to flat-shaded rocks"; "remix: shape is right, colours too saturated").

### 8. Remix

- **Models:** `node tools/assets/restyle.mjs <in.glb> [options] --look`. Options: `--palette` (recolour to
  `palette.json`), `--recolor`, `--flat` or `--vertex-colors` (drop textures for flat shading), `--strip-textures`,
  `--max-texture <px>`, `--roughness`, `--metalness`, `--scale-to <metres>`, `--axis`, `--pivot` (bottom centre, so
  it sits on the ground), `--merge`, `--compress`. Run it with `--help` for the exact values. `--look` renders the
  result straight away; look again before you keep it.
- **Textures and skies:** pull a smaller `--res`; tint, rotate or blend them in the material code. A sky can be
  recoloured in the shader or replaced by the game's own sky with the HDRI kept only for light.
- **Sounds and music:** trim, fade and set the level in the game's audio code. Check loudness with
  `node tools/play/loud.mjs`.
- **Blocks are code.** `node tools/blocks/add.mjs <block-id>` copies a block into `my-game/vendor/<block-id>/` with
  its licence and credit. Then edit it like any other code: set its colours from the palette, cut the parts you don't
  need, change the feel.

### 9. Bring it in

- Unchanged: `node tools/assets/get.mjs <id>` (without `--candidate`).
- Remixed: `node tools/assets/get.mjs promote <path>`.
Both put the file in `my-game/public/assets/<kind>/` and add the exact credit line to `my-game/CREDITS.md`. Read the
line and check the title, author, licence and link are right. If credit is required, the game's credits screen shows
it too. Load files with relative paths (`./assets/models/rock.glb`, never `/assets/...`) so the shipped zip works.

### 10. Record

Update the row in ASSETS.md: chosen asset id, family, status (`in game`), notes. Add every rejected candidate to
"Rejected and why", so nobody (you after a usage limit, or a scout) pulls it again. Commit.

### 11. Let the critics judge coherence

The next recording goes to [agents/critic-art.md](../../agents/critic-art.md), who checks whether the assets read as
one game (mismatched families, scale, palette breaks). If it flags something, fix it with a remix or a swap. Don't fix
a mismatch by adding more assets on top.

## Swarm: asset scouts

While builders work on code, the director can spawn [asset-scout](../../agents/asset-scout.md) agents in parallel, one
per category (props, characters, ground and sky, audio). Each scout gets: its category and rows from ASSETS.md,
GREAT.md, `palette.json`, the families line, and the file size budget.

- Scouts **never put files into the game**. They run find, pull candidates, run look, judge, and deliver a shortlist
  in `my-game/.helper/scout/<category>/SHORTLIST.md` with the look images and one recommendation per need.
- The director (or the builder who owns that area in CONTRACTS.md) reads the shortlist, opens the images, decides,
  and promotes.
- Scouts count toward `maxAgents`. Two builders and two scouts is a typical split. Scouts share the one-browser lock,
  so their look renders queue; that's fine.

## Showing the user

- For choices that set the look (the player, the hero object, the sky, the main music), show the user the look images
  of your top 2-3 and say which you recommend and why, in one sentence each. Paste the images if your tool can show
  pictures; otherwise give the file path and say how to open it.
- Small props and sound effects: decide yourself and mention them in the hand-back.
- "I don't like that one": take the next candidate from the shortlist, or scout again with what they said ("too
  cartoony" means search another family or style). Add the rejected one to "Rejected and why" with their words.
- Never ask them to visit an asset site or download anything.

## Worked examples

**A low-poly island game.** GREAT.md: "a calm floating island at dusk, chunky shapes, warm light". Families: Kenney
low-poly for everything solid, one Poly Haven sky for light. Palette from the starter. `find.mjs "rock" --source
kenney --kind model` gives a sheet; three rocks are shortlisted, one rejected (too angular next to the rounded
trees). The sky: a Poly Haven dusk HDRI is pulled at `--res 1k`, used only for lighting, and the visible sky stays the
game's own gradient shader, recoloured to the palette, because the photo sky looked out of place over flat-shaded
islands. The kit's trees come with green-blue leaves; `restyle.mjs <tree.glb> --flat --scale-to 6 --pivot bottom-center --look` brings them
to the palette's moss greens and real size. Fire for the campfire: a block, its colours set from the palette's accents.

**A realistic dusk street.** GREAT.md: "a wet city street at dusk, lived-in, sodium lamps". Families: Poly Haven
models and HDRIs + ambientCG materials, all realistic. Asphalt, brick and plaster come from ambientCG at 1K, the bins,
benches and bollards from Poly Haven. A shiny cartoon car from another library is rejected (detail level and style).
The hero is the street itself, so the budget goes to one good wet asphalt material. Rain is a block, toned down. The
music is a CC-BY track: credited in CREDITS.md and on the credits screen.

**A 2D pixel game.** GREAT.md: "a tiny pixel-art dungeon crawl, 16x16 tiles, readable at a glance". Families: one
Kenney pixel tileset for walls, floors and characters, and a pixel effects block for hits, fire and magic. The
tileset's palette is close but too bright, so the colours are mapped to `palette.json` in the sprite shader rather
than editing every image. A second tileset with 32x32 tiles is rejected: a different pixel size looks wrong next to
16x16 even when the colours match. Sounds: a CC0 retro sound pack, levelled with `loud.mjs`.

## Done means

Every row in ASSETS.md has a decision and a reason, everything in `public/assets/` and `vendor/` is in CREDITS.md
with the right licence, the look sheet of each asset was opened before it went in, critic-art found no unintended
mismatch in the latest recording, the first load is within the budget, and the turn ended with a
[hand-back](../hand-back/SKILL.md).

## Common mistakes

- Pulling assets before picking a family. The result is ten styles in one scene.
- Judging by the name or the library's thumbnail alone. Run `look.mjs` and open the image, at the game's camera.
- Putting candidates straight into `public/assets/`. Candidates live in `.helper/candidates/` until chosen.
- Forgetting scale: a 40 m mushroom next to a 1 m player because the file was in centimetres. Check the metres on the
  look sheet; fix with `--scale-to`.
- 4K textures on a pebble. Size to how big it is on screen.
- Credits typed by hand from memory. Let `get.mjs` write the line, then check it.
- Treating free assets as finished art. They are raw material: one light, one palette and shared materials make them
  yours ([playbook/using-free-assets.md](../../playbook/using-free-assets.md)).
- Pulling art while the loop isn't fun yet. Grey boxes first.
