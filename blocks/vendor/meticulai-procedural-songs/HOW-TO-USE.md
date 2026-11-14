# Procedural songs: how to use it

Whole songs made from a seed, with no sound files: a catchy hook melody over 4-bar chord progressions, drums, bass,
arpeggio, pad and lead, all built from Web Audio oscillators and noise. Four arrangements that share a key
(`menu`, `game`, `tense`, `results`), an **intensity** (0..1) that brings instruments in and out and opens the filter,
a tempo multiplier, and a "sudden" switch that crossfades to a tense minor version on the beat.
Renderer: **none** (pure Web Audio). npm deps: none. From the game Deadweight, by Meticulai.

**Nobody has listened to this block's output for this kit.** The numbers below were measured, not heard. A person
must listen to it (with headphones and on a phone speaker) before a game ships with it.

## What to copy

- **Reusable system:** `src/` (`index.js` re-exports everything).
  - `music.js`: `MusicEngine` (the player: buses, reverb, ping-pong delay, glue compressor, soft clip, crossfades)
    and `renderMusic` (schedule N seconds onto an `OfflineAudioContext`).
  - `music-gen.js`: `generateSong(kind, seed)`, pure and deterministic: keys, scales, progressions, the melody
    grammar, drum/bass/arp/stab/pad patterns, `MODE_STYLE` (tempo and swing per arrangement).
  - `music-sched.js`: `StepClock`, the sample-accurate look-ahead 16th-note clock with swing.
  - `music-voices.js`: the instruments (`VOICES`) and `Budget`, the voice cap.
  - `util.js`: seeded RNG, noise and reverb buffers, pulse waves, the soft-clip curve.
- **Demo only:** `demo/` (seed box, Play/Stop, modes, intensity/tempo sliders, tense switch, waveform).
- **Tests:** `test/` (37 node tests, plus `fake-audio.mjs`, a strict fake `AudioContext` for Node).

## API

```js
import { MusicEngine } from '../../vendor/meticulai-procedural-songs/src/index.js';
const music = new MusicEngine(audioCtx, musicBusGain, { seed: 1234 }); // no seed: a fresh tune every play-through
music.start('menu');                        // 'menu' | 'game' | 'results'
music.setMode('game', 0.8);                 // crossfade on the next beat (seconds)
music.setIntensity(0.6, { tempoMul: 1.06, sudden: false }); // safe to call every frame
music.stop(0.6);                            // fade out and halt; music.dispose() frees everything
music.song / music.bpm / music.kind / music.position / music.stats   // read-only, for HUDs and tests
```

- **Seeds.** With no `seed`, `start()` picks a new tune each play-through and `setMode('game')` from another mode
  picks a new one again (a new round, a new song). `game`, `tense` and `results` of one seed share a key, so the
  sudden swap stays in the family; `menu` uses a related key. Pass `seed` to pin one song (good for a title theme).
- **Intensity.** Every score event has an intensity window; only events inside it play. Low intensity is still a
  groove (kick, bass, a little lead); high intensity adds hats, claps, stabs, arps and opens a lowpass from 2.4 kHz
  (at 0) to about 15.5 kHz (at 1). It is smoothed over 0.7 s, so jumpy values are fine.
- **tempoMul** 0.6..1.5 (1 = the song's tempo); the tempo glides per beat, no clicks. **sudden** only acts in `game`.
- **Offline:** `renderMusic(offlineCtx, 'game', 20, { seed, intensity, sudden, tempoMul, startBar, destination })`
  then `await offlineCtx.startRendering()`. Deterministic per seed: use it to test levels or make a preview file.
- Every public method is guarded: a missing, closed or suspended context makes it a silent no-op; it never throws.

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-procedural-songs` (copies to `my-game/vendor/meticulai-procedural-songs/`).
2. In `my-game/src/audio/audio.js`, give the engine the music bus: add `get musicBus() { return musicBus; },` next to
   `get context()` in the `audio` object.
3. In `my-game/src/game/game.js`, inside `createGame(ctx)`:
   ```js
   import { MusicEngine } from '../../vendor/meticulai-procedural-songs/src/index.js';
   let music = null;
   ctx.audio.onReady(() => { music = new MusicEngine(ctx.audio.context, ctx.audio.musicBus); music.start('menu'); });
   ```
   The audio context only exists after the player's first click or key press (browser rule); `onReady` waits for it.
4. Stop the starter's own pad: in `main.js` remove `audio.music.start();` from `startRun()` (or make `audio.music`
   call into the engine). Then in `start()`: `music?.setMode('game')`; when the run ends: `music?.setMode('results')`.
5. In `update(dt, mode)`: `music?.setIntensity(x, { tempoMul: 1 + 0.1 * x, sudden })`, with `x` from your game
   (enemies near, time left, speed). The settings panel's Music slider and `?mute=1` keep working (they drive the bus).
6. Pause: the starter pauses the loop, not the audio. Call `music?.stop(0.3)` on pause and `music?.start('game')` on
   resume if silence fits better, or leave it playing quietly with `ctx.audio.duck(...)`.

How Deadweight drove it (a good default): menu and lobby -> `menu`; the countdown -> intensity 0.15; playing ->
`0.18 + 0.42 * (time into the round) + 0.25 * (share of players knocked out)`, plus 0.15 and `sudden` once the arena
stopped shrinking; `tempoMul = 1 + 0.1 * intensity` (+0.06 in sudden death); the end screen -> `results` at 0.55.
It re-sent intensity only when it moved by more than 0.03 (or every 0.6 s).

## Levels (measured 2026-11-14, not listened to)

`renderMusic` on an `OfflineAudioContext` (44.1 kHz stereo) in headless Chromium, 20 s per case after a 1 s lead-in,
measured at the engine's output (before your music volume). Three seeds (1234, 7, 90210); ranges across seeds.

| Arrangement | Intensity | RMS (dBFS) | Peak (dBFS) | Clipped samples | Silent 0.5 s windows |
|---|---|---|---|---|---|
| menu | 0.42 | -19.6 to -19.0 | -4.7 to -4.4 | 0 | 0 of 38 |
| game | 0.15 | -21.0 to -20.7 | -5.2 to -4.6 | 0 | 0 of 38 |
| game | 0.9 | -18.1 to -17.8 | -3.7 to -3.4 | 0 | 0 of 38 |
| tense (sudden) | 0.7 | -18.1 to -18.0 | -3.8 to -3.4 | 0 | 0 of 38 |
| results | 0.5 | -19.0 to -18.7 | -5.4 to -5.0 | 0 | 0 of 38 |

No errors. The voice cap (64 sources) dropped 0-15 low-priority hits per 20 s; peak 15-49 sources at once.
That is loud for background music under sound effects: the starter's Music (0.5) and Master (0.8) sliders bring it to about -26 dBFS.
In a game with the kit, check the full mix with `node tools/play/loud.mjs`.

## What made it good in Deadweight

- **It never repeats.** Every round got a new song from a new seed, with a real hook: a one-bar motif that repeats and
  answers itself, phrases that end open and then close on the tonic. The melody rules are tested (strong beats land on
  chord tones, phrases breathe, leaps stay singable).
- **It follows the round.** Intensity rose with time and eliminations, the tempo crept up, and sudden death swapped
  to the tense minor version exactly on a beat.
- **It is sturdy.** 37 unit tests (the source game had the same suite): the clock never drifts or bursts after a
  throttled tab, every source is stopped, the voice cap holds, nothing throws without audio.
- Honest note: Deadweight itself was retired, and no player or critic ever gave a verdict on how this music sounds.

## Restyle it

The style is upbeat party / cartoon: bouncy stride and syncopated bass, marimba arps, swing, "boing" scoops and
slide-whistle fills. For another mood, change in `src/music-gen.js`:
- `MODE_STYLE` (tempo range and swing per arrangement; swing 0 = straight, 1 = triplet).
- `KEYS`, `SCALES` and the progression tables (`OPEN4`, `CLOSE4`, `B_PAIRS`, `BRIDGES`) for darker or brighter harmony.
- The `build*` functions pick bass styles (`stride`, `bounce`, `sync`, `walk`), stab patterns and arp kinds per section.
- Grace notes and cartoon fills: `grace:` in `realize(...)` calls, the slide-whistle swoop in the fills.
In `src/music-voices.js` change the instruments (oscillator types, envelopes, the "boing" scoop); in `src/music.js`
the bus table `BUSES` (levels, filters, pans, reverb/delay sends) and `KIND_TRIM` (mix per arrangement).
Run `npm test` after any change: the tests check the music rules, not the taste.

## Gotchas

- Browsers start audio only after a click or key press. Create the engine in `onReady` (or on the first click).
- One engine per music bus. Calling `start()` while playing just follows the new mode.
- The reverb is a short mono convolver (the most expensive node). On weak phones lower `maxVoices` (option, default 64).
- `stop()` has a timer fallback for a frozen audio clock (hidden tab); `dispose()` when leaving the page or scene.

## Run the demo and tests alone

`cd blocks/vendor/meticulai-procedural-songs && npm install && npm run dev` (http://127.0.0.1:5485), `npm run build`
for `dist/`, `npm test` for the tests (no install needed for the tests).
