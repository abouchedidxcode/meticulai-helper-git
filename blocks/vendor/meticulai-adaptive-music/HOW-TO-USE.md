# Adaptive music: how to use it

A whole soundtrack played live by synths with the Web Audio API: electric piano, synth bass, clav, a lead that can
sound like a sax, soft strings, vibes, a jazz drum kit, reverb, delay and tape wobble. No audio files, no
downloads, no dependencies. It follows the game: faster and busier when the game is intense, a darker vamp in
danger, a lift when the player is in the air, a new section at each checkpoint, a resolving outro on a win and a
tape-stop on a loss. Style: late-70s/80s jazz fusion and smooth jazz on synths, in F major, 100 BPM in play and a
76 BPM ballad on the menu and end screen. From Last Drop by Meticulai. Renderer: none (pure audio).

**Nobody has listened to this inside the kit. The numbers below prove it makes sound at sane levels; they say
nothing about whether it sounds good. A person must listen to it, with the game, before you ship it.**

## What to copy

- **Reusable system:** `src/music.js` (the score, class `Music`, about 1,800 lines) and `src/index.js`
  (`createAdaptiveMusic`, generic names, the optional safety chain). Nothing else is needed.
- **Demo only:** `demo/` (buttons, sliders, waveform and level meter). `test/` (Node tests with a fake audio clock).

## API

```js
import { createAdaptiveMusic } from '.../meticulai-adaptive-music/src/index.js';
const music = createAdaptiveMusic(audioCtx, musicBusNode, { safetyChain: true }); // after the first click or key
music.setState({ mode: 'play', intensity: 0.6, danger: 0, progress: 0.3, lift: false, shimmer: false, paused: false });
music.update(dt);                       // every frame (seconds). It also runs its own 40 ms timer.
music.hit('checkpoint', { ahead: true });
```

- `setState(...)`, any time; it keeps the last one. All values are optional.
  - `mode`: `'menu'` (ballad), `'play'` (the run's arc), `'end'` (outro after a win, near-silence after a loss).
  - `intensity` 0..1: drum density (ride and cross-stick when low; hats, backbeat, ghost notes, congas when high),
    busier piano, the clav fades in and opens up. Eased over about 1 s up and 2 s down.
  - `danger` 0..1: above 0.5 the score switches to the **tension** section (a minor vamp over a pedal, stabs, ticks,
    a heartbeat in tempo); it switches back below 0.25.
  - `progress` 0..1: which part of the arc plays: intro, build (0.21), groove (0.41), glow, a swing chorus (0.61),
    sunset (0.8). Changes land on 4-bar boundaries.
  - `lift`: the player is in the air. Drums drop to a muffled pulse, bass out, piano and strings open up, a cymbal
    swell; landing gives a kick, crash and piano stab.
  - `shimmer`: a sparkle zone (water, magic, a bonus area). Vibes drops in key while it lasts, a falling run on entry.
  - `paused`: the music drops about 10 dB and keeps time.
- `hit(name, data)`: `'start'` (a new run: the intro starts on a downbeat), `'checkpoint'` (`{ ahead }`: a fill and
  cymbal swell, then the next section on the next downbeat; also moves the arc on with no progress given),
  `'pickup'` (`{ n, of }`: vibes up the chord, longer each time; the last one (`n >= of`) gets a big run, crash and
  low root), `'shimmer'`, `'win'` (everything resolves onto Fmaj9, then the outro), `'lose'` (a tape stop, then
  near-silence). After `win`/`lose`, also `setState({ mode: 'end' })`.
- `noteInKey()`: a frequency in the current chord, high up, walking upward when called in quick succession. Use it to
  pitch your own pickup sounds so they are always in key.
- `setMuted(bool)` fades the music out and stops making notes. `setActive(bool)`: stop the timer while the tab is
  hidden (and `audioCtx.suspend()` yourself). `section`, `stats` (`{ ok, section, chord, voices, errors, ... }`).
- `music` is the raw `Music` from `src/music.js` with the game's own names (`update({ mode, speed, volume, danger,
  progress, airborne, inPuddle, sunlit }, dt)`, `event('puddle' | 'bloom' | 'checkpoint' | 'finish' | 'dead' | 'start')`).
  `index.js` maps `intensity` 0..1 to the speed range it was tuned on (2..18 m/s).
- `opts.timer: false` for an `OfflineAudioContext`: then call `update(0.04)` from `ctx.suspend(t)` steps (see "Levels").
- No Web Audio, or it failed to build: `ok` is false and every call is a silent no-op. Nothing throws.

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-adaptive-music`. No npm packages to add.
2. The starter's `src/audio/audio.js` keeps its context private. Add two getters to the `audio` object it returns:
   `get ctx() { return ctx; },` and `get musicBus() { return musicBus; },`. The music then follows the starter's music
   volume slider and `audio.duck()`.
3. Turn off the starter's pad: in `src/main.js` remove `audio.music.start();` from `startRun()`.
4. In `src/game/game.js`:
   ```js
   import { createAdaptiveMusic } from '../../vendor/meticulai-adaptive-music/src/index.js';
   // in createGame(ctx):
   let music = null;
   audio.onReady(() => { music = createAdaptiveMusic(audio.ctx, audio.musicBus, { safetyChain: true }); });
   const total = sparks.list.length; // how many pickups the level has (the demo game's sparks)
   events.on('pickup', ({ remaining }) => music?.hit('pickup', { n: total - remaining, of: total }));
   events.on('win', () => { music?.hit('win'); music?.setState({ mode: 'end' }); });
   events.on('death', () => { music?.hit('lose'); music?.setState({ mode: 'end' }); });
   // in start(): music?.hit('start');
   // in update(dt, mode):
   music?.setState({ mode: mode === 'playing' ? 'play' : mode === 'over' ? 'end' : 'menu',
     intensity: playerSpeed / topSpeed, danger: dangerNow, progress: done / total, lift: !player.onGround });
   music?.update(dt);
   ```
   Pick your own `danger` (enemy close, low health, a timer running out) and `progress` (distance, pickups, level
   part). Give `intensity` something the player controls, like speed, so the music answers them.
5. `{ safetyChain: true }` puts the game's own master chain (compressor -16 dB 8:1, tanh soft clip, 0.85) in front of
   the starter's bus. The levels below were measured through it. Without it the music is about 8 dB quieter.
6. `?mute=1` and the starter's volume settings keep working (they act on the starter's buses).

## The numbers that matter (all in `src/music.js`, kept exactly as the game had them)

- `LEVEL = 0.16`: the music trim. Change this, not the instrument levels, to make it louder or softer.
- `BPM_RUN = 100`, `BPM_CALM = 76`; swing per section in `SECT` (`swing` 0.54-0.66: 0.5 is straight, 0.66 triplet).
- `LOOKAHEAD = 0.16` s of notes scheduled ahead on the audio clock, `TIMER_MS = 40`. Notes never drift with frame rate.
- `MAX_VOICES = 36` one-shot voices (48 for stingers): busy moments drop low-priority hits instead of piling up.
- `RENDER_BUDGET = 5` ms: the 36 instrument samples are rendered in small jobs (about 30-50 ms in total) spread over
  the first second, piano and brushes first, so starting it never stalls a frame.
- Output tone for phone speakers: high-pass at 48 Hz, -4 dB low shelf at 140 Hz, +3 dB at 1.8 kHz. The piano is
  voiced between F3 and E4 on purpose: phone speakers lose most of what is under about 250 Hz.

## Levels (measured 2026-11-14, nobody listened)

Rendered offline in headless Chromium (OfflineAudioContext, 44.1 kHz stereo, 20 s per row, the first 4 s skipped,
driven in 40 ms steps), through `safetyChain` (the game's master chain). "Raw" is the score alone, without it.
dBFS: 0 is the loudest possible, -20 is a normal game mix, -60 is near silence.

| Situation | Section reached | RMS dBFS | Peak dBFS | Raw RMS / peak | Clipping | Silent |
|---|---|---|---|---|---|---|
| Menu | menu | -28.1 | -14.5 | -36.2 / -21.8 | none | 0 % |
| Play, intensity 0.1 | intro | -26.3 | -12.1 | -34.8 / -20.1 | none | 0 % |
| Play, intensity 0.5, progress 0.5 | groove | -23.2 | -10.9 | -31.5 / -19.8 | none | 0 % |
| Play, intensity 1, progress 0.9 | sunset | -22.2 | -10.6 | -31.5 / -19.3 | none | 0 % |
| Play, intensity 0.8, in the air | build | -23.6 | -11.1 | -32.1 / -19.3 | none | 0 % |
| Danger 1 | groove > tension | -23.2 | -9.5 | -31.7 / -18.5 | none | 0 % |
| Win, then end screen | sunset > outro | -23.7 | -9.0 | -32.9 / -18.3 | none | 0 % |
| Lose, then end screen | groove > silence | -73.5 | -57.9 | -81.7 / -66.5 | none | 100 % (by design) |

"Silent" = share of 100 ms windows under -60 dBFS. The loss is meant to fall to near-silence (a tape stop, then a
barely audible pad) until the next `start`. If you want sound on the game-over screen, play your own sting there.
These match what the game's own header recorded (menu about -27, run -25 to -22, peaks at or under -9 dBFS).
To re-measure in your game, use `node tools/play/loud.mjs`.

## What made it good in Last Drop

- It answers the player. Last Drop is a water drop rolling down a desert to an oasis; the score is driven by the
  drop's speed, its airtime, the water it has left and the checkpoints. Going fast fills in the drums and the clav;
  a jump opens the sound up and the landing hits with a kick and a stab; running low on water slides into the
  tension vamp and a heartbeat in tempo. The music says how the run is going without any UI.
- It came from a direct request to make the music "synth type that is dynamic to the gameplay", and was rewritten
  across rounds into this synth jazz score (it replaced a slower chillwave pad score).
- No files: the whole soundtrack costs about 53 KB of JavaScript (minified, before gzip) and nothing to load.
- Honest status: it shipped in the live game, but the game's own status notes say its audio is **unverified by
  ear on real devices**, and the owner of the game never said they liked it. The design and the measured levels are
  sound; the taste is not proven. Treat it as a strong starting point, not a finished soundtrack.

## Gotchas

- Browsers only allow sound after a click or key press: create it in a click handler (the starter's
  `audio.onReady`), never at page load.
- It uses `Math.random()` for humanising, so two runs never sound identical, and it does not follow the starter's
  `?seed`. Don't use it for anything gameplay depends on.
- One style only: jazz fusion in F major. A horror or chiptune game needs new progressions (`PROG`), melodies
  (`MEL`), sections (`SECT`) and patches (`TONE`), not a new engine.
- The chord progressions are common jazz moves (ii-V-Is, tritone substitutions, a IV-III7-vi-v bridge); the
  melodies were written for the game. If you swap in a known song's melody, it is no longer yours to ship.
- Hidden tab: call `setActive(false)` and `ctx.suspend()`; on return it resyncs to the bar grid instead of bursting.
- CPU: about 0.04 ms per scheduler tick on a desktop, 10-12 one-shot voices on average. Not measured on a phone.

## To restyle it

- Louder or softer: `LEVEL`. Brighter or darker: the lowpass numbers in `_params()` (`ecut`, `cut`, `acut`).
- Different harmony: edit `PROG` (one bar per `|`, two chords in a bar = the second on beat 3; qualities in `QUAL`).
- Different tunes: `MEL` uses `bar.step:length:note` on a 16th grid with flags `^` scoop, `v` fall, `'` ghost,
  `~` wide vibrato. Tests check every melody stays inside its phrase.
- Different arc: `SECT` (tempo, swing, which progression, drum kit and density, lead patch, levels) and
  `_pickSection()` (when each one plays).
- Drum patterns: `DR` (layers unlock as intensity rises; upper case = accent). Piano comping: `COMP`.

## Run the demo alone

`cd blocks/vendor/meticulai-adaptive-music && npm install && npm run dev` (http://127.0.0.1:5484), click "Start the
music". `npm test` runs 16 Node tests (harmony, melodies, the adapter, the conductor on a fake clock).
