# Procedural songs: where this copy came from

From Deadweight by Meticulai (meticulai.com). Extracted 2026-11-14 from the game's source at `8849adcf3` (clean: the
music files had no uncommitted changes). Deadweight is retired and not on the site. Its source was released under the
MIT licence; this block is MIT too (see `LICENSE`).

| | |
|---|---|
| Made by | Meticulai |
| Source (in the game folder) | `public/js/audio/music.js`, `music-gen.js`, `music-sched.js`, `music-voices.js`, `util.js`; tests `tests/audio-music.test.js`, `tests/audio-fake.js` |
| Copied on | 2026-11-14 |
| Code licence | MIT |
| Art licence | none (no files: every sound is synthesised) |
| Renderer | none (Web Audio) |

## What changed

- `music.js`, `music-gen.js`, `music-sched.js`, `music-voices.js`: copied as they were. Only comments changed: the game's
  name in the file headers, and "match / lobby" wording became "round / menu". Every tuning number is unchanged.
- `util.js` trimmed to what the music uses: the seeded RNG, white noise, the reverb impulse, pulse waves and the
  soft-clip curve. Left out the sound-effect buffers (pink, brown, crackle, applause), the organ wave and the
  saturation curves, which only the game's sound effects used.
- Added `src/index.js` (re-exports the public API), the `demo/` page, `package.json` and `vite.config.mjs`.
- Tests: all 37 tests of `audio-music.test.js` kept, now `test/music.test.mjs`, importing from `../src/`. The fake
  audio context is `test/fake-audio.mjs`, unchanged. Two test names were reworded (the "match/lobby" one, and the API
  surface test, which named the game's dev page and audio engine); their assertions are the same.
- Left out: the game's sound effects, ambience layers and mix logic (`audio.js`, `sfx.js`, `synth.js`, `layers.js`,
  `logic.js`, `trims.js`), the dev soundboard page and the browser render/spectrogram tools.

## Checked

On 2026-11-14: `node --test test/*.test.mjs` (37 pass); `npm run build` of a copy; the demo opened in headless
Chromium with Play pressed (the picture is `blocks/previews/meticulai-procedural-songs.jpg`); levels rendered offline
for 3 seeds x 5 arrangements (table in `HOW-TO-USE.md`). Nobody listened to it.
