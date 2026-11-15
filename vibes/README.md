# Vibes

A vibe is a ready-made direction for how a game looks and feels. People who cannot describe a look in words can
usually point at a picture and say "that". Each folder here is one vibe to point at.

    node tools/vibes/list.mjs            # the list (add --for "cosy night fishing" to rank them)
    node tools/vibes/open.mjs            # the same as pictures
    node tools/vibes/apply.mjs <id>      # put one on your game; you can change your mind at any time

Any vibe works on any starter game, because every starter takes all its colours and light from `palette.json`.

## What is in a vibe

`vibes/<id>/vibe.json` and two or three pictures in `vibes/<id>/frames/`.

| Part | What it is | How long it lasts |
| --- | --- | --- |
| `palette` | The colours by role, the sky and the light. Copied into your game's `palette.json`. | For the whole game. This is the valuable part. |
| `look_words` | One paragraph: colours, shapes, light, motion, materials, what to avoid. Goes into `GREAT.md`. | For the whole game. Agents choose assets by it. |
| `look`, `look_wish` | A drawing style from `looks/` if one fits, and the style it would like in words. | Change it freely. |
| `upgrade`, `blocks` | Bigger pieces from `blocks/` that suit this vibe, and why. | Optional, later. |
| `asset_search`, `asset_families` | Words for `tools/assets/find.mjs` and the libraries whose style matches. | A starting point. |
| `music`, `sound_feel` | The mood for the soundtrack and the sound effects. | A starting point. |
| `good_for` | Starters and kinds of game it suits. | A hint, not a rule. |
| `frames` | Mood pictures made by an AI image model. | **Only for choosing.** See below. |
| `renders` | The kit's own starter game drawn with this vibe (filled in by `tools/vibes/render.mjs`). | Shows what you really get on day one. |

## The pictures are mood, not a target

The frames are AI-generated pictures. They are there so you can choose a feeling. A browser game made in an afternoon
will not look like them, and it does not need to. The gallery shows each frame next to a real render of the starter
game with the same palette, so the gap is plain from the start.

Never score a game on how closely it matches a frame, and never ask an agent to "make it look like the picture".
When games were judged that way they went through more than a hundred rounds of tiny tweaks and ended where they began
(see `playbook/picking-a-look.md` and `case-studies/the-12-game-run.md`). What carries over from a vibe is the palette,
the light and the words. Judge the game by playing it.

The characters and places in the frames are not part of the vibe. Do not copy them; make your own.

## The palette, by role

Colours are chosen by the job they do in a game, not by how nice they look together.

| Role | Job |
| --- | --- |
| `base[0]` | The main ground. Most of the screen. |
| `base[1]` | Its darker partner (shaded ground, the second ground colour). |
| `base[2]` | Structures: walls, rock, buildings. |
| `base[3]` | Paths and secondary structures. |
| `accent[0]`, `accent[1]` | Things that matter to the player: pickups, the goal. Kept rare, and never used for scenery. |
| `danger` | Things that hurt. Only those. In a red world this is not red (see `red-dune-dusk`, `ember-and-ash`). |
| `player` | The player. Stands out from the ground, the accents and danger. |
| `shadow` | The dark end: undersides, far shapes, deep water. Also the colour of the UI card. |
| `light` | The bright end: highlights, sparks, foam. |
| `ink` | Text on the UI card. |
| `sky` | `top`, `horizon`, `below` (under the horizon: sea, cloud, a table top), `sun`. |
| `light` | Sun colour and strength, ambient and ground light, fog colour and amount, exposure, sun height and direction. |

`palette.notes` says what each accent means in that vibe and anything odd about it. Read it before building.

## Check a palette with numbers

    node tools/vibes/check-palettes.mjs            # every vibe
    node tools/vibes/check-palettes.mjs my-vibe    # one

It fails a vibe when a pickup colour is too close to the ground or walls, when danger is too close to a pickup or to
the world, when the player would vanish into the ground, when text has less than 4.5 to 1 contrast on the UI card, or
when a field, block id, asset library or picture is missing. It prints the distances so you can see how much room
there is. Every vibe in this folder passes.

## Add a vibe

1. Copy a folder that is close to what you want and rename it. The folder name is the `id` (small letters and dashes).
2. Write `look_words` first, in plain words: colours, shapes, light, motion, materials and a list of things to avoid.
   Name no artist, studio, brand or game. Describe what you like about a look instead.
3. Fill the palette by role. `node tools/assets/palette-from.mjs <picture>` gives a first guess from a picture, but
   it only samples colours: you still have to decide which colour does which job. Start from the ground, then pick
   accents that are clearly not the ground, then danger, then the player.
4. Run `node tools/vibes/check-palettes.mjs <id>` and fix what it names.
5. Add two or three frames: 16:9, 1280 x 720 JPEG, under 300 KB each, showing a small game-like scene with a clear
   subject. No text, no interface, no logos, nothing recognisable from an existing game, film or brand. Record where
   each came from in `frames` (`source`, `model`, and the `prompt` and `date` if you generated it). Generating
   pictures costs money: see `tools/fal/README.md`.
6. Use only block ids from `blocks/catalog.json`, library ids from `sources/catalog.json` and look ids from `looks/`.
7. Run `node tools/vibes/render.mjs <id>` and `node tools/vibes/build-gallery.mjs` to refresh the gallery.

`GALLERY.md`, `gallery.html` and `catalog.json` in this folder are written by `tools/vibes/build-gallery.mjs`. Do not
edit them by hand.

The pictures in `frames/` have their own terms: see [LICENSE-NOTE.md](LICENSE-NOTE.md).
