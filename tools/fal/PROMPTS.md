# Prompt lessons for fal generation

What worked and what wasted money across many games. Read this before writing a prompt for `gen.mjs`.

## The lessons

1. **Describe the look in words first.** Before any generation, write the look as one short paragraph and get the
   user's yes on it: the style, the light, the palette, the camera. Generation then tests that paragraph; it does
   not invent it.
2. **Style words without a scene give random scenes.** "Painterly low-poly, warm light" alone came back as cottages,
   campsites and mice. Every prompt needs the full scene (what is in the picture, where the camera is) plus the style.
3. **Never say "mobile game".** It pulls in cluttered casual-game screens. Set the shape with `--aspect 9:16` instead.
4. **Text inside pictures comes out garbled.** Ask for clean scenes with no UI, no labels and no logos. Add the UI in
   code, where it is sharp and can change.
5. **Generated video invents motion.** Use stills for the look and clips only for mood and pacing. Never build the
   game's movement from a clip: the bow changes shape, feet slide, objects melt.
6. **Anchor every new frame on the chosen style frame.** Once the user picks a style picture, make every other
   picture with `frames --from <that picture>`. The anchor holds the look far better than any words.
7. **Models have a "house style" that beats your style words.** If a model keeps pulling toward photo-real or toward
   glossy cartoon, change the model (in `models.json`), not the adjectives. Pick the model that already leans your way.
8. **Photos of real people pull drawings toward realism.** For a stylised game, use stylised references.
9. **Best-of-N with a person choosing beats scoring numbers.** Make 4 to 6, show them side by side, let the user
   pick. Scoring pictures against a target with an image reviewer once produced over a hundred rounds of tiny tweaks
   and no real progress.
10. **Keep prompts 60 to 100 words, style first.** Longer prompts get ignored in the middle; shorter ones get filled
    with the model's defaults.
11. **Name no real games, films, artists or brands.** Describe what you like about them instead ("chunky shapes, two
    tones per surface, long soft shadows"). The art must be clearly your own.
12. **Avoid effects the game cannot draw.** Depth of field, motion blur and thick volumetric fog look great in a
    picture and then cannot be matched in the browser. Leave them out of the look.
13. **Cut out the background before image-to-3D.** One object, plain background, the whole object in view
    (`model3d --cutout`). Clutter becomes lumps on the model.
14. **Textures need flat light.** Any baked shadow or highlight repeats across the floor. Ask for flat, even light,
    seen straight from above, and check the edges tile.
15. **Log every call.** `gen.mjs` does this for you (`paid-ledger.md`). Do not make paid calls any other way.
16. **The game never calls paid APIs while people play.** Generate assets ahead of time, save them in the game's
    files, ship the files.
17. **Check the licence.** Before shipping generated pictures, sounds or models, read the model's terms on its fal
    page (some are fine for commercial use, some are not) and note the model in `CREDITS.md`.

## Example prompts

The kit adds a short wrapper to `style`, `frames`, `texture` and `video` (for example "In-game screenshot of an
original video game ... No text, no watermark, no logos"). Write only the part below. `--raw` turns the wrapper off.

### style (style pictures to choose from)

- `Painterly low-poly island at dusk. A lighthouse on a cliff, its lamp warm against a cold blue sea. Third-person camera behind a small keeper in a yellow raincoat on the cliff path. Chunky shapes, two tones per surface, soft long shadows, a little haze on the horizon.`
- `Flat-shaded toy diorama of a desert canyon at noon, seen from a high three-quarter angle. A tiny red rover on a dusty track, mesas in bands of orange and cream, hard short shadows, pale sky. Clean shapes, no texture noise.`
- `Ink-and-wash forest at night, side view like a 2D platformer. A fox with a paper lantern on a mossy log, fireflies, dark teal trees in layers fading into mist. Brush texture, limited palette of teal, black and lantern orange.`
- `Bright claymation kitchen seen from the counter top, first-person. A wobbly pile of plates, a cat on the windowsill, morning sun through the window. Soft rounded shapes, thumbprint texture, warm pastel colours.`
- `Dark sci-fi corridor, first-person, low-poly with glowing edges. Rusted panels, one red warning light pulsing, cables on the floor, a door at the end slightly open with white light behind it. Mostly black and deep blue with red accents.`

### frames (new pictures in the chosen style, with `--from chosen.png`)

- `The keeper climbing the spiral stairs inside the lighthouse, camera looking up from below, lamp light from above.`
- `Wide shot of the whole island from the sea at night, the lighthouse beam crossing the water.`
- `Close view over the keeper's shoulder: hands on the lamp's brass wheel, rain on the window.`
- `The same cliff path in a storm: dark clouds, waves breaking high, the keeper leaning into the wind.`
- `The rover driving into a dark cave mouth, its headlights lighting the dust.`

### image and edit (exactly as written)

- image: `A single wooden treasure chest on a plain light grey background, three-quarter view, stylised low-poly, soft even light, no shadow.`
- image: `Icon of a blue potion bottle, flat colours, thick dark outline, centred on a plain white background.`
- edit: `Make it night: dark blue sky, the windows lit warm yellow, everything else unchanged.`
- edit: `Remove the person on the bridge. Keep everything else exactly the same.`
- edit: `Same scene in winter: snow on the roofs and the ground, the sea grey.`

### texture (square, repeats)

- `mossy cobblestones, rounded grey stones with green moss in the gaps`
- `worn dark wooden planks, straight grain, small nail holes`
- `cracked dry desert mud, pale orange`
- `stylised grass, short blades in three greens, hand-painted look`
- `rusty riveted metal plates, low-poly game style`

### video (for mood only; from a still)

- `The camera drifts slowly forward along the cliff path; the sea moves, the lamp turns. No cuts.`
- `Static camera. Rain falls, the lantern flickers, the fox's tail moves a little.`
- `The rover drives slowly away from the camera down the canyon track, dust trailing.`
- `Very slow push-in on the lit window while snow falls.`
- `Static camera, the corridor light pulses red twice, a cable sways.`

### sfx (sound effects)

- `A heavy wooden door creaking open slowly in a stone room.`
- `A small coin pickup: one bright metallic ding, very short.`
- `Footsteps on wet gravel, four steps, close.`
- `Steady rain on a tin roof, even, no thunder` (with `--loop`)
- `A soft whoosh of a sword swing, short, no impact.`

### music (instrumental)

- `Calm solo piano at dawn, slow and hopeful, lots of space between notes, no drums.`
- `Upbeat chiptune adventure loop, 120 bpm, bright square-wave lead, bouncy bass, ends so it loops.`
- `Tense low strings and a slow heartbeat drum for a dark corridor, quiet, building very slowly.`
- `Warm acoustic guitar and light hand percussion for a cosy village, relaxed, 90 bpm.`
- `Big orchestral victory sting, brass and timpani, proud, ends on a long chord.`

### model3d (a picture of one object)

Make the picture first, then turn it into a model:

1. `image "A single wooden barrel with iron bands, stylised low-poly, plain light grey background, three-quarter view, whole object in view, soft even light"`
2. `model3d my-game/refs/generated/image/<that file>.png --cutout`

Check the model in the game at the size the player sees it. Generated models are often heavy: if the game slows
down, ask your agent to simplify the model or to build the object from simple shapes in code instead.
