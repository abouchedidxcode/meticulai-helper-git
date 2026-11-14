---
name: references
description: Turn the user's pictures and videos into a clear description of the look - what each reference is for and what to ignore - and lock it into GREAT.md. Use when the user drops files into my-game/refs/ or wants to talk about how the game should look.
---

# References

## Goal

`my-game/refs/REFS.md` says, for each picture or video, what it is FOR (the light, the palette, the camera height,
the way water moves) and what to IGNORE (the text, the characters, the UI, the resolution). "The look, in words" in
GREAT.md is updated and the user has confirmed it.

References guide the look. **The game is never scored on matching them.** One project ran 138 rounds of "make the
screenshot look more like the concept art" and the game got no better to play. Don't build any loop that compares
frames to references.

Before you start: you must be in the kit's workspace (it has `START.md` and `tools/`). If not, do START.md step 0.

## Steps

1. **Help them add files.** If they haven't yet, explain click by click how to put files in `my-game/refs/` (or point
   them to [guides/adding-references.md](../../guides/adding-references.md)). Any images or short videos work:
   screenshots, photos they took, film stills, clips from games they love.
2. **Process them.** `node tools/refs/intake.mjs`. It makes contact sheets from videos into `refs/sheets/` and adds a
   stub entry for each new file to `refs/REFS.md`.
3. **Look at every file and sheet yourself.** Open each image. For videos, read the contact sheets in order: motion
   and pacing matter as much as single frames.
4. **Measure where it helps.** `node tools/refs/palette.mjs <image>` gives dominant colours, brightness and
   saturation. Compare two refs (`palette.mjs a.jpg b.jpg`) when they seem to disagree. Use the numbers later in
   [look](../look/SKILL.md) to check the game against the intent, not to copy pixels.
5. **Fill REFS.md.** For each reference: one line FOR, one line IGNORE, and which part of the game it informs (sky,
   characters, UI, motion, sound mood). If two refs conflict (neon city vs. warm cabin), ask which one wins. That's
   the one question you ask in this step.
6. **Play the look back in words** (see below). Edit until they say yes.
7. **Lock it.** Rewrite "The look, in words" in GREAT.md: palette, shapes, light, motion, and what it must never look
   like. Note the decision in DECISIONS.md. Commit.
8. Hand back ([hand-back](../hand-back/SKILL.md)).

## What to say

> I looked at all six. Here's the look I'm taking from them:
> - Light: low warm lamp light from one side, deep soft shadows (from the kitchen photo).
> - Colours: honey, dark wood, a little faded teal. Nothing bright or neon (the palette tool agrees: your photos are
>   warm and low in saturation).
> - Camera: low, close to the floor, like a small thing in a big room (from the game clip).
> - Motion: slow drifting dust, curtains moving a little.
> - Ignoring: the text in the poster, the characters in the film still, the phone UI in the screenshot.
>
> Does that match what you had in mind?

## Rules

- Never copy art, characters, logos or recognisable designs from references into the game. Take principles: light,
  palette, composition, motion.
- Franchise references are fine as inspiration only. Write IGNORE for every character and logo.
- Don't generate art in this step. That's [generate-assets](../generate-assets/SKILL.md), and only with a budget.
- Don't build a scoring or matching loop against the refs. Judge the game by recorded play.

## Done means

Every ref has a FOR and IGNORE line, GREAT.md's look section is locked, the user said yes, it's committed.

## Common mistakes

- Treating every ref as equal. Usually one or two refs carry the look; say which.
- Describing the refs instead of the game ("the photo is warm") rather than the decision ("the game's light is warm").
- Picking a look that can't be made well in a browser by an agent in a few days (photoreal crowds, realistic
  faces). Steer to one that can (stylised, strong light, simple shapes). See
  [playbook/picking-a-look.md](../../playbook/picking-a-look.md).
