# Adding references

References are pictures and short videos that show the feeling and the look you want. They are the fastest way to
tell your agent what you mean: "like this, but with ..." is easier than describing light and colour in words.

## What makes a good reference

- **Screenshots of games you love**, at the moment that shows what you like (the light, the colours, the camera).
- **Photos**: a place, a time of day, a material, a sky.
- **Film stills** with the mood you want.
- **Short gameplay clips, under 30 seconds**, when what you like is how something moves or feels: the camera
  following a jump, a hit that shakes the screen, a menu that slides in.
- **Drawings or paintings** in a style you like.

Fewer, clearer references work better than many. Five good ones beat thirty random ones. One reference can be about
just one thing: "only the sky colour in this one".

## How to add them

1. Open the kit's folder, then the `my-game` folder, then the `refs` folder.
2. Drag your pictures and videos into `refs`. You can make folders inside it if you like (for example `mood` and
   `ui`).
3. Tell your agent: **"I added references."**
4. For each one, say in one line what you like about it. For example:
   - "dusk.jpg: the orange sky against the dark blue sea"
   - "jump.mp4: how the camera swings when he jumps"
   - "menu.png: ignore the art, I like how small and quiet the menu is"

You can also write these lines yourself in `my-game/refs/REFS.md`, under "Notes from the user" for each file.

## What your agent does with them

- It runs a small tool that notices new files. For each video it makes a contact sheet (12 frames from the video on
  one picture) and a few still frames, because agents cannot watch videos directly.
- It looks at every reference and writes in `refs/REFS.md` what each one is **for** (palette, light, mood, camera,
  an effect, how motion feels, the menus) and what to **ignore**.
- Then it tells you, in plain words, the look it took from them. Say yes, or correct it. That description becomes
  the look of your game.

## What references are not

- **They set the mood and the look. They are not a target to copy pixel for pixel.** Your game is never judged on
  how closely a screenshot matches a reference. Chasing a match once took over a hundred rounds of tiny changes
  and made the game no better.
- **Other games' art never goes into your game.** No pictures, characters, music or names from other games or
  films. They are there to point at a feeling. Everything in your game is made fresh: drawn in code, free assets
  with a licence that allows it, or generated.
