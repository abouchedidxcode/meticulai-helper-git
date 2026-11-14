---
name: look
description: Give the game one coherent, confident look - lock it on one small scene first, then roll it out - using free CC0 assets first and generated ones second, without the default "AI" look. Use after the core loop is fun, or when the user says it looks cheap, generic, muddy or like AI slop.
---

# Look

## Goal

One small scene of the game looks finished and matches "the look, in words" in GREAT.md, and the user likes it. Then
the same look spreads to the rest of the game.

Before you start: you must be in the kit's workspace (it has `START.md` and `tools/`). If not, do START.md step 0.
Background: [playbook/picking-a-look.md](../../playbook/picking-a-look.md).

## Defaults (follow GREAT.md when it says otherwise)

- **One coherent direction.** One palette, one shape language, one kind of light. Not "a bit of everything".
- **Warm, real, lived-in beats neon** for most games. Neon and glow are the default AI look; avoid them unless the game
  needs them.
- **Restrained bloom**, or none. Glow comes from tone and small halos, not a bloom filter on everything. Too much bloom
  was the most repeated complaint across these games.
- **Readability first.** At the game's camera, the player, the danger and the goal must read in under a second. The
  brightest, cleanest thing on screen should be the thing that matters.
- **Light with direction:** one strong key light with soft shadows beats flat ambient light.
- **No default-AI look:** no purple-blue gradients, no glossy plastic everything, no generic sci-fi panels, no
  dashboard-style UI, no emoji in the UI (use simple line icons), real fonts (not the browser default).

## Steps

1. **Pick one small scene** (one room, one stretch of track, one arena). Lock the look there before touching anything
   else.
2. **Assets, free first:** Poly Haven, ambientCG (CC0 textures and HDRIs), Kenney (CC0 models and UI), OpenGameArt
   (check each licence). Procedural materials and skies are often better than any download. Credit everything in
   `my-game/CREDITS.md`. Paid generation only through [generate-assets](../generate-assets/SKILL.md).
3. **Builders** with [plan-swarm](../plan-swarm/SKILL.md): `look` (lighting, materials, grade), `world` (props,
   composition of the scene), `ui` (fonts, HUD, menus in the same style). 2-3 builders.
4. **Measure, don't just eyeball:** take a shot of the scene and run `node tools/refs/palette.mjs shot.png` (and
   against a reference if there is one). Check brightness and saturation match the intent ("warm and low-saturation"
   should measure that way). Use the numbers to catch drift, not to copy pixels.
5. **Compare blind when choosing between versions:** `node tools/play/blind-ab.mjs a.png b.png` gives shuffled copies.
   Have `critic-art` pick without knowing which is new. Only for real choices between big alternatives, never as a
   loop of small tweaks.
6. **Judge in motion.** Record (`node tools/play/record.mjs --bot --seconds 45`) and have
   [agents/critic-art.md](../../agents/critic-art.md) watch the sheets with GREAT.md. A frame that looks nice still
   can be a game that reads badly in motion.
7. **Hand back** the one scene ([hand-back](../hand-back/SKILL.md)) and ask: "Is this the look? What would you change?"
   If the look is truly undecided, build two or three switchable looks (a key or `?look=2`) and let them choose after
   playing.
8. **Only after a yes**, roll it out to the rest of the game.

## Done means

The user said yes to the locked scene, the rest of the game follows it, CREDITS.md is complete, and fps didn't fall
(`node tools/play/fps.mjs`).

## Common mistakes

- Polishing the whole game at once and ending with five half-styles.
- Matching a reference picture frame by frame. It never converges; 100+ rounds of tiny tweaks went nowhere once.
- Turning up bloom, fog and particles to make it "look good". It reads as AI-made instantly.
- Breaking readability for beauty: the player can't find themselves on screen.
- Heavy assets: keep textures 2K or smaller, models light, total download small. A pretty game that takes 30 seconds
  to load loses the player.
