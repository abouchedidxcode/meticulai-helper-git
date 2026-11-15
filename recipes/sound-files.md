# Sound files (the starter pack, or your own)

**Problem:** the starter's synth voices (`audio.blip`, `chime`, `thud`, `whoosh`) cover a lot, but a game often
wants a real coin, footsteps on wood, rain, or a short music loop.

**The short way:** the kit ships about 85 ready sounds in `sounds/` (free, no credit needed). Pick, add, play.

```
node tools/sounds/list.mjs --for "footstep wood"      # find
node tools/sounds/add.mjs move-step-wood pickup-coin ambience-rain    # copy into my-game/, write the credit
```

`add.mjs` writes `src/audio/sounds.json`. Load it once, then play by name.

**Where:** the file that sets the game up (`src/game/game.js` in the starter), plus one line wherever something
happens.

```js
// file: src/game/game.js
import sounds from '../audio/sounds.json';

export function createGame(ctx) {
  const { audio } = ctx;
  audio.loadAll(sounds);                         // fetches now, is ready after the first click or key press

  const rain = audio.loop('ambience-rain', { vol: 0.5, fade: 1.5 });   // starts by itself when it can
  // rain.set(0.2) to turn it down, rain.stop(2) to fade it out

  function onPickup() {
    audio.play('pickup-coin');                   // a random take each time, never the same twice in a row
  }
  function onStep(speed01) {
    audio.play('move-step-wood', { vol: 0.4 + 0.4 * speed01, vary: 1.5 });   // vary = semitones of pitch spread
  }
  function onHit(x) {
    audio.play('impact-thud', { vol: 0.9, pan: Math.max(-1, Math.min(1, x / 10)) });   // pan: -1 left .. 1 right
  }
  // ...
}
```

Music from a file (it takes the place of the starter's synth pad while it plays, and `audio.duck()` still lowers it):

```js
const m = sounds.sounds['music-calm-loop'];
audio.music.playFile(m.files[0], { fade: 2, vol: 0.8, loopPoints: m.loop });
// later: audio.music.stopFile(2);
```

**What `audio.play` does for you:** picks a take at random, shifts the pitch a little (`vary`), holds back the same
sound if it was started less than 30 ms ago, allows at most 4 of one sound and 24 file sounds at once, and passes
everything through a limiter, so thirty hits in one frame come out as one clean hit instead of a crackle. It goes
through the `sfx` volume, the `?mute=1` switch and the master compressor like every other sound. It returns
`{ stop() }`, or `null` when nothing was played.

**A new sound in code** ("a softer jump", "a lower boom"):

```
node tools/sounds/synth.mjs --from move-jump --name soft-jump --soft --pitch=-3
```

It lands in the game and in `sounds.json`; play it with `audio.play('soft-jump')`. `--show <id>` prints a recipe to
copy and edit; `--recipe file.json` makes your own.

**Your own file** (a recording, something the user made): put it in `public/assets/audio/`, then
`audio.load('roar', 'assets/audio/roar.mp3')` or several takes `audio.load('roar', ['a.mp3', 'b.mp3'])`, and add a
row to `CREDITS.md`. MP3 plays in every browser. Keep effects short and mono; keep music under a couple of minutes.

**Check it works:** no agent can listen, so measure. `node tools/play/loud.mjs --seconds 20` while the bot plays:
"Sound playing" should go up when you add a bed, peaks must not clip, and the typical level should stay in the
comfortable range. `audio.sampleStats` (`{ loaded, failed, played, skipped }`) tells you whether the files loaded
and how often they played. Then make the listening page (`node tools/sounds/audition.mjs --dir my-game`) and ask the
user to listen: nobody has heard the pack inside your game.

**Common wrong version:**
- Calling `audio.play` before the files are loaded and thinking it is broken: before the first click or key press
  every sound call is a silent no-op, by design (browsers block sound until then).
- A wrong path. A missing file gives one warning in the browser console and silence, never an error. Paths in
  `sounds.json` are relative to the page (`assets/audio/...`), not to the source file.
- Looping with an `<audio loop>` tag: it leaves a gap. `audio.loop` uses the loop points in `sounds.json`.
- Starting a loop every frame. Call `audio.loop` once, keep the handle, use `set()`.
- Putting a loud bed under everything. Ambience sits low (`vol` 0.3 to 0.6); the moments the player causes sit on top.
- Shipping sounds from a paid AI service inside a shared template or asset pack: most services allow them in your
  game but not as loose files for others. In your own game they are fine; log them in `paid-ledger.md`.
