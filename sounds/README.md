# Starter sounds

Sounds your game can use right away, so no game made with the kit ships silent: clicks, coins, jumps, footsteps,
hits, explosions, lasers, an engine, wind, rain, a win jingle and more. 86 sounds, about 200 small files, under 3 MB.

**They are free. Use them in any game, even one you sell. No credit is needed** (licence: CC0, which means "do
anything you like"). Details are in [CREDITS.md](CREDITS.md).

**Nobody has listened to all of them.** They were made and checked by an AI agent, and an agent cannot hear. The
numbers were checked (length, loudness, no distortion, loops that join cleanly). Whether a sound is *nice* is for
your ears. Listening takes a few minutes: see "Listen first" below.

## Where they come from

| In the list | What it means |
| --- | --- |
| `made in code` (ids like `ui-click`, `move-jump`) | Built from maths by `tools/sounds/synth.mjs`. No recordings. You can change them: "a softer jump", "a lower explosion". |
| `from <game>` (ids starting with `mt-`) | Made for a finished Meticulai game (Topple, Dragon Aces, Lost Marbles): some in code, some cut and layered from public-domain (CC0) recordings. |

## Listen first

Tell your agent "make the sound listening page", or run:

```
node tools/sounds/audition.mjs
```

It writes `sounds/audition.html`. Double-click it. Every sound has a play button; tick "good" or "not good" and paste
the box at the bottom of the page back to your agent. It needs no internet.

## Use them in your game

You don't have to type these. Say "add a coin sound and footsteps" and your agent runs them.

```
node tools/sounds/list.mjs                           everything, by group
node tools/sounds/list.mjs --for "soft footstep"     the best matches for a few words
node tools/sounds/add.mjs pickup-coin move-jump      copy these into my-game/
node tools/sounds/add.mjs --group ui                 copy a whole group
```

`add.mjs` copies the files to `my-game/public/assets/audio/`, lists them in `my-game/src/audio/sounds.json` and writes
a row in `my-game/CREDITS.md`. In the game, two lines load them and one line plays one:

```js
import sounds from '../audio/sounds.json';
audio.loadAll(sounds);
audio.play('pickup-coin');
```

The how-to with examples is [recipes/sound-files.md](../recipes/sound-files.md).

## The groups

| Group | What's in it |
| --- | --- |
| `ui` | click, hover, confirm, back, error, toggle, a beep |
| `pickup` | coin, gem, power-up, key, heal |
| `move` | jump, soft and hard landing, footsteps on grass, stone, wood and metal, dash, slide, a swish |
| `impact` | thud, punch, light and heavy hit, breaking wood, glass and stone, small and large explosion, bricks, steel, pebbles, splashes, marbles |
| `weapon` | laser, pew, bow release, arrow hit, sword swing, reload, fireball |
| `vehicle` | engine loop, skid, boost |
| `feedback` | win jingle, lose sting, level up, countdown beep and "go", alarm, bells, warnings, a heartbeat |
| `creature` | blip, chirp, growl, wing flaps, roars |
| `magic` | sparkle, whoosh, zap, charge |
| `ambience` | loops: wind, rain, sea, night insects, cave drips, fire, room tone, a generator, rain on a window, a ticking clock |
| `music` | three short loops made in code: calm, bouncy, tense. Simple placeholders, not finished music |

Short sounds come in 2 to 6 takes. The game picks a different take each time, so thirty footsteps don't sound like a
machine. Loops are made to repeat with no click.

## Make a new sound in code

Every `made in code` sound is a small recipe (a list of tones and noises) in `tools/sounds/recipes.json`. Your agent
can bend one into something new:

```
node tools/sounds/synth.mjs --from move-jump --name soft-jump --soft --pitch=-3
node tools/sounds/synth.mjs --from impact-explosion-small --name far-boom --length 1.5 --pitch=-7
node tools/sounds/synth.mjs --show move-jump          print the recipe, to copy and change
node tools/sounds/synth.mjs --recipe my-recipe.json   make a recipe you wrote
```

The new sound goes straight into your game and is yours (no rights attached). The options are explained by
`node tools/sounds/synth.mjs --help`; the recipe format is described at the top of `tools/sounds/lib/dsp.mjs`.

For agents, a recipe in short: `seconds`, `group`, `variations`, `loop`, and `layers`. Layer types: `tone` (wave, freq,
optional `fm`, `vib`, `unison`), `noise` (white, pink, brown), `grains` (many small copies of `each`, scattered),
`notes` (a tune from `each`). Any layer takes `at`, `dur`, `vol`, `attack`, `env`, `curve`, `filter`, `am`. A value can
be a number, a curve `[start, end]`, or `{"r": [low, high]}` for a fresh random value in every take. `post` adds
`lowpass`, `highpass`, `drive`, `tremolo`, `echo`, `reverb`. Levels are set per group, so a new sound sits with the rest.

## Check the pack by numbers

```
node tools/sounds/test.mjs --table
```

Prints length, loudest point, average level, brightness and loop join for every file, and fails if anything is
silent, too loud, late to start, a copy of another take, or a loop that clicks. In your game, measure the whole mix
with `node tools/play/loud.mjs`.

## More sounds and music

The pack is a start. For more:

- **More sounds made in code:** the small sound makers listed in `sources/libraries.json` (jsfxr and ZzFX make
  retro game sounds from a few numbers; Tone.js is a full synth), and the starter's own synth voices (`audio.blip`,
  `chime`, `thud`, `whoosh`), which need no files at all.
- **Music made in code:** two blocks play whole songs with no files. `meticulai-procedural-songs` makes a catchy tune
  from a number (menu, game, tense and results versions). `meticulai-adaptive-music` is a jazz-fusion score that
  follows the game. Add one with `node tools/blocks/add.mjs <id>` and read its `HOW-TO-USE.md`.
- **Free packs a person downloads by hand:** Kenney's audio packs (Interface Sounds, Impact Sounds, UI Audio, RPG
  Audio, Sci-fi Sounds, Digital Audio, Casino Audio, Voiceover Pack; CC0, no credit needed) from
  <https://kenney.nl/assets>; each pack's page is listed in `sources/packs/kenney.json`. Kenney asks automated tools
  not to download from his site, so *you* click Download, then drop the zip in your game folder and tell your agent.
  The same goes for OpenGameArt (<https://opengameart.org>, choose licence CC0).
- **Other sources** (Freesound's CC0 sounds, the Sonniss GDC bundles, incompetech for music with a credit line) are in
  [sources/README.md](../sources/README.md) and `sources/catalog.json`, with what each licence allows.
- **Sounds or music you made yourself** (or generated with a paid service on your own account): drop the file in
  `my-game/public/assets/audio/` and tell your agent. Check the service's own terms before you share such files
  outside your game.

## For people who keep the kit up to date

- `catalog.json` lists every sound: id, files, group, feel words, seconds, loop points, suggested volume (`gain`),
  source (`synth` or `meticulai`), the game it came from, its licence and its measured numbers.
- `node tools/sounds/synth.mjs` makes every `synth` sound again from the recipes (same recipe, same sound) and
  updates the catalogue. It leaves the `meticulai` sounds alone.
- A sound from somewhere else goes in only with a written licence that allows sharing the file itself, and a line in
  `CREDITS.md`. Sounds generated with a paid AI service do not go in: their terms usually forbid sharing the files
  as a collection.
