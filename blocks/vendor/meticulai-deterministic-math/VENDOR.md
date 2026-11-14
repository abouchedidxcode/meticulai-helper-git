# Deterministic math: where this copy came from

From Lost Marbles: Trick Shot by Meticulai (meticulai.com), at https://meticulai.com/games/trick-shot/ (shared by
link, not listed on the site). Extracted 2026-11-14 from the game's source at `8849adcf3` (clean: no uncommitted
changes in this file).

| | |
|---|---|
| Source file (relative to the game folder) | `shared/dmath.js` |
| Code licence | MIT for Meticulai's code (see `LICENSE`); the fdlibm notice and musl's MIT notice are kept |
| Art licence | none |
| Renderer | none |

## Credits

- fdlibm, Sun Microsystems (1993): the algorithms and polynomial coefficients. Its notice is kept at the top of
  `src/dmath.js` and in `LICENSE`, as fdlibm's licence requires.
- musl libc (MIT, Rich Felker et al.): the C versions of fdlibm this port follows.

## What changed

- `src/dmath.js`: the code is unchanged, character for character, from the header down. The header now states the
  fdlibm copyright line and notice in full (the game quoted the notice in a sentence) and credits musl. The
  comment on `random` now warns that it is not deterministic.
- Added `src/check.js` (`selfCheck`, `bitsHex`, `GOLDEN`: 97 recorded results computed in Node with this file;
  `mulberry32`), `src/index.js`, the demo (a double pendulum with DMath twice and the built-in Math once) and 7 tests.
  The game's accuracy test (20,000 random inputs against Math) is kept and extended to the other functions.

## Checked

On 2026-11-14: `npm test` (7 pass) and `npm run build` in a temporary copy. The demo ran headless in Chromium
(all 97 recorded results matched; the built-in Math differed on 20) and in WebKit, Safari's engine (all 97 matched;
the built-in Math differed on 14). Picture: `blocks/previews/meticulai-deterministic-math.jpg`.
