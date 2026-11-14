# Picking a look

**The rule:** pick a look with a point of view, describe it in words, and lock it on one small scene before rolling it
out. When unsure, build two or three looks behind a switch and let the person choose by playing. References set the
mood; they are never a target to match. Keep bloom restrained, and avoid the default look AI tools fall into.

## Evidence

**Photoreal is not automatically better.** Bonesworth is a tavern dice game with a chunky, hand-painted, candlelit
look. It was rebuilt as a photoreal candlelit table with scanned assets, real dice physics and a new interface. A
procedural cloaked opponent was tried first and dropped because it "read as a plush toy." Then the creator compared
the two: "I actually like the older one more, make that one the one findable on the website." The rebuild stays
unlisted. The next request was to "make the original bonesworth better without completely remaking it."

**Keep changing until the person says yes.** Rootbound went through three looks. Realistic soil was rejected outright
("i can be stylized"). The stylised version was rejected too, with a request for "a high rez pixel look." The pixel
art version got "looks gorgeous." Each switch was cheap because the game rules didn't depend on the look.

**Switchable looks let the person choose by playing.** Still Life 2 split the game from its graphics: the same rooms
draw as a risograph print, photoreal, 1-bit dither or high-res ASCII, picked in Settings. Gameplay never knows which.
A seeded run plays frame for frame in all four, so they can be compared fairly. (Spectators also found the photoreal look, cut
into a montage of print, "looks like a cheap Unity prototype"; side by side with the others it worked.) Kite Race did the same: the person tried a painterly (gouache) look and it became the
default within minutes, with the others still in Settings. Scrapfall offered three looks; the creator kept two, then one.

**Describe the look in words an agent can check.** Inkbound's look, from its design file: "Sumi-e on warm paper ... flat
black silhouettes ... Three values (paper, grey wash, black) and one accent, vermilion, used only for meaning (counter
hits, the last cut, seals, health). The fighters are the darkest, sharpest things on screen. Restrained: no bloom, no
glow." Lost Marbles: "macro photography of a toy run." Both decide real choices. "Make it look AAA" decides nothing.

**References set mood; they are not a target.** In one run, twelve games were told to match three frames from AI
concept art, scored by an image reviewer, with 8 out of 10 needed to pass. Tidecaller ran 138 scoring rounds and ended
roughly where it started. Orbitball scored 6.5 to 7.3 on its frames while the real game had a camera stuck in a wall
(see [Orbitball](../case-studies/orbitball.md)). Staged frames hid a broken game. Reference images are fine for
palette, mood and camera. Write what each one is *for* and what to *ignore*.

**Bloom and neon: the most repeated complaint.** Too much bloom was called out on Keeper, on the racer Hypervolt GP, on
the first 3D homepage ("way too much neon and this weird bloom effect") and on the webcam games' hall ("too much bloom").
Scrapfall: "looks cheap and weirdly lit," "NO NEON anywhere." Dragon Aces cut bloom from 0.5 to 0.4 and replaced neon
rings with mist and dust. Fireflies keeps bloom at 0.16 and gets its glow from drawn halos instead. The creator's taste,
stated plainly: real-world, warm, lived-in looks beat neon.

**The default AI look.** After seeing screenshots of ten new games, the creator wrote: "it seems like they're making
quick games that look like ai slop instead of an intentional and visually stunning ... game." What that meant in the
captures: scenes built from primitives (box cities, plain spheres with dot eyes), flat lighting, sparse empty scenes,
no hero object. Interfaces have their own version. Dragon Aces: "it feels so much like a claude made game, something
generic ... The font is too generic, the screen seems quite busy." Last Drop: "The UI looks vibe coded ngl, specially
the font." The Dragon Aces fixes were specific: self-hosted fonts with
character instead of the usual defaults, no crests or gold gradients, a calm HUD of thin rules, menus made from the
game's own materials and real renders.

**Generated images: words are weak, references are strong.** From Bonesworth's art notes: style text without a scene
gives "random scenes (cottages, campsites, mice)"; reference images in edit mode are "far more reliable than text."

## How to apply it

- [ ] Write the look in `GREAT.md` in 3 to 5 sentences: palette (how many values, which accent and what it means),
      shape language, light, what may glow, and one "never" list.
- [ ] Lock it on one small scene (one room, one stretch of track) before dressing the whole game.
- [ ] If unsure, build two or three looks behind a setting. Keep gameplay out of the look code. Let the person play
      each and pick.
- [ ] Start with bloom low or off. Prefer warm, real-world light. No neon unless the person asks.
- [ ] Use CC0 assets and good shaders before paid generation. Replace primitives that read as placeholders.
- [ ] For the interface: a font with character, the game's own materials, a calm HUD, no emoji. Ask a persona critic
      "does this look like a generic AI-made game?"
- [ ] For references, write in `refs/REFS.md` what each is for and what to ignore. Never score the game on matching them.

Related: [who to trust](who-to-trust.md), [the 12-game run](../case-studies/the-12-game-run.md),
[Rootbound](../case-studies/rootbound.md).
