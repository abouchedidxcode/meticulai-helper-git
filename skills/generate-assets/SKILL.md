---
name: generate-assets
description: Optional paid generation of pictures, textures, 3D props, sound effects and music with fal, always as a dry run first, with the cost shown and the user's yes before every batch. The last rung of the asset ladder - use only when the user has a fal key, a budget above $0, and find-assets showed no free block, free asset or code option will do.
---

# Generate assets (optional, costs money)

## Goal

A small set of assets that clearly beat what free CC0 packs or code could do, all in one coherent style, every cent
logged, never over the cap.

Before you start: you must be in the kit's workspace (it has `START.md` and `tools/`). If not, do START.md step 0.

## Before anything

1. `falCapUSD` in `my-game/helper.json` is above 0. If it's 0, generation is off. Ask once if they want to set a
   budget; don't push.
2. A key is present: `node tools/doctor.mjs` says so. If not, send them to
   [guides/fal-key.md](../../guides/fal-key.md). **Never ask them to paste the key into the chat. Never open `.env`.**
3. `node tools/fal/gen.mjs status` shows spend so far against the cap. `node tools/fal/gen.mjs models` lists models
   and prices.
4. Read [tools/fal/PROMPTS.md](../../tools/fal/PROMPTS.md) for prompt patterns that work.

## Free first: fal is the last rung

The asset ladder is: ready-made block -> free CC0 asset -> credit-required asset -> made in code -> fal. Before any
batch, follow [find-assets](../find-assets/SKILL.md) for that need: `node tools/blocks/list.mjs`, then
`node tools/assets/find.mjs "<what>"` and look at the contact sheet. Sky, water, terrain, particles, most sound effects
and simple music can also be made in code, for free, and often look better than a generated texture. The row in
`my-game/ASSETS.md` should say why free options didn't fit before you generate.

Pay only when it clearly wins: a distinctive style frame to anchor the look, a hero texture, a prop no pack has, music
with a specific mood.

## The order that works

1. **Style frames first.** `node tools/fal/gen.mjs style "<the look in words, from GREAT.md>" --n 6 --dry-run`
   shows the plan and the cost. Ask for a yes, then run the same command with `--yes` instead of `--dry-run`. Show the
   pictures (they land in `my-game/refs/generated/style/`); the user picks one.
2. **Anchor everything on the pick.** New scenes in the same style:
   `node tools/fal/gen.mjs frames --from <chosen.png> "<shot>"`. Change one detail of a picture instead of
   regenerating it: `edit <picture> "<instruction>"`. Textures, props and the rest follow the chosen frame's words and
   look, so the set reads as one game, not ten.
3. **Only then, and only what the game needs:** `texture "<material>"`, a prop as `image` (one object, plain
   background) then `model3d <picture> --cutout`, `sfx "<sound>"`, `music "<mood>"`. `video` is for mood only. One
   small batch at a time.

## Every batch

1. `--dry-run` first. Read the cost it prints.
2. Ask, in plain words:
   > I'd like to generate 6 wood and stone textures in the style you picked. Cost: about $0.48. You've spent $2.10 of
   > your $10 budget. Go ahead?
3. Only after a yes: run with `--yes`. The tool refuses to pass the cap; never edit the cap yourself, only the user can
   raise it.
4. The tool logs each call; add a line to `my-game/paid-ledger.md` (what, why, cost, which files it made) if it didn't.
5. **Look and judge, like any asset.** Run `node tools/assets/look.mjs <file> --in-game` (for a model, also
   `node tools/assets/restyle.mjs <in.glb> --scale-to <metres> --look` if it needs to fit). Judge it with
   the find-assets checklist (family, silhouette, palette, detail, scale, file size). Bring the keepers in with
   `node tools/assets/get.mjs promote <path>`, and record them in ASSETS.md.
6. Show the results. Keep the good ones in the game; leave the rest in `refs/generated/`.

## Hard rules

- No yes, no call. Even $0.05.
- Never exceed `falCapUSD`. Never change it unless the user asks you to, in their own words.
- The game never calls fal or any paid service while it's played. Everything generated is saved as files and shipped
  with the game.
- Generated assets never copy a franchise, a real artist's name-style, or a famous character.
- Don't generate stills to "match" references in a loop. Generate assets the game needs.

## Roles

One agent does this; generation is a slow serial process. Builders can keep working on feel or code meanwhile.

## Done means

The game has the assets it needed, the ledger matches `gen.mjs status`, CREDITS.md is current, and the turn ends with
a [hand-back](../hand-back/SKILL.md) that shows the new assets in the running game.

## Common mistakes

- Generating 40 images "to have options". Small batches, decide, move on.
- Mixing styles because each asset was prompted on its own. Always anchor on the picked frame.
- Generated textures that look worse in-game than a CC0 one. Test in the game before generating more.
- Paying for music or sounds before the game is fun. Audio from a free pack is fine for playtesting.
