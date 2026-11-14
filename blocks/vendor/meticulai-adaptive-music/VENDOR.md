# Adaptive music: where this copy came from

From Last Drop by Meticulai (meticulai.com). Extracted 2026-11-14 from the game's source at `8849adcf3` (clean: the
game's files had no uncommitted changes).

| | |
|---|---|
| Made by | Meticulai |
| Game | Last Drop, https://meticulai.com/games/last-drop/ |
| Source file | `public/js/music.js` (in the game's folder) |
| Copied on | 2026-11-14 |
| Code licence | MIT (see `LICENSE`) |
| Art licence | none (no files: every sound is synthesised) |
| Renderer | none (Web Audio only) |

## What changed

- `src/music.js` is the game's file with the score untouched: every progression, melody, pattern, patch, level and
  timing number is the game's. Changes are comments and one export line only:
  - the header names the block instead of the game, explains that the event names are the game's own, and calls the
    bridge "a classic IV-III7-vi-v bridge" instead of naming the song it resembles;
  - synth product names in comments became plain descriptions ("80s FM electric piano", "ladder-filter-style bass").
    The lead patch keeps its internal id `moog`;
  - two comments that pointed at the game's sound file now say "the game's sound layer";
  - an `export { ... }` line at the end exposes the tables and helpers (`PROG`, `MEL`, `SECT`, `chord`, ...) for the
    tests and for remixing.
- New: `src/index.js` (generic names: `intensity`, `danger`, `progress`, `lift`, `shimmer`; events `start`,
  `checkpoint`, `pickup`, `shimmer`, `win`, `lose`; and `safetyChain`, a copy of the game's master chain from its
  sound layer: compressor -16 dB 8:1, tanh soft clip, 0.85).
- New: `demo/`, `test/` (16 Node tests on a fake audio clock), `package.json`, `vite.config.mjs`.
- Left out: the game's sound effects layer (wind, sand hiss, bubbles, landings), which was tied to the game.

## Checked

On 2026-11-14: `npm test` (16 pass); built the demo with vite and opened it in headless Chromium, which drew the
waveform and reached the groove section without errors (`blocks/previews/meticulai-adaptive-music.jpg`); rendered
eight situations offline and measured levels (table in `HOW-TO-USE.md`). Nobody listened to it.
