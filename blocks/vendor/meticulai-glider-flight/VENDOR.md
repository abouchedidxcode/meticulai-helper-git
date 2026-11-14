# Glider flight: where this copy came from

From Hezarfen by Meticulai (meticulai.com), with the kite mode from Kite Race by Meticulai. Extracted 2026-11-14.

| | |
|---|---|
| Made by | Meticulai |
| Hezarfen source | `4a08f9939` (clean: the copied files had no uncommitted changes); live, link only, at meticulai.com/games/hezarfen/ |
| Hezarfen files (relative to the game folder) | `public/js/flight/glider.js`, `public/js/flight/input.js`, `public/js/flight/bot.js`, `public/js/core/util.js` (helpers), `tools/sim.mjs`; the launch and touchdown rules from `public/js/main.js` |
| Kite Race source | `9f685dbe9` (clean); not released |
| Kite Race files | `src/race/glide.ts`, helpers from `src/rng.ts`; tests from `tests/glide.test.ts` |
| Copied on | 2026-11-14 |
| Code licence | MIT (see `LICENSE`) |
| Art | none: the demo's world, hang glider and kite are built in code |
| Renderer | none (three.js `Vector3` only); the demo uses WebGL 2 |

## What changed

- **`glider.js`: the model is unchanged.** The step function is line for line the game's. The game's map
  (`THERMALS`, `WIND`, `heightAt`, `slopeAt`, `districtAt`, `SEA_LEVEL` from its layout file) is replaced by a
  `world` object passed to `createGlider(world)`; the air function became `createAir(world)`. The city's warmth
  (from the game's district map) is now an optional `world.warmthAt(x, z)`. With the game's own map plugged in as a
  `world`, a scripted 90 s flight gave bit-identical positions, speeds and angles to the game's file.
- `TUNE.assistDrag` defaults to **0.7**, the game's default "Drag" setting (the game set it from its settings every
  frame; the file's own default was 1, the original tuning before "Forgiving wings"). Every other number is the
  file's. `stallSpeed` is now set by `glider.retune()` (the game recomputed it in `main.js` when the speed setting
  changed). Added read-outs: `glider.agl()`, `glider.airAt`, `glider.tune`.
- **`autopilot.js`** is the game's `bot.js`: same steering, slope, skim, circling and landing logic and numbers. The
  game's `jump` step (its perch and intro) is gone (the caller launches); `land` targets `world.landing` instead of
  the game's carpets; thermals are found by id in `world.thermals`; the logging no longer prints to the console.
  `touchdown()` is the game's contact rule from `tools/sim.mjs` (6.2 m/s sink, 24 m/s, scaled by `speedScale`).
- **`input.js`**: unchanged apart from the import path and the header comment.
- **`tools/sim.mjs`**: the game's Node simulator over the sample world, now also exported as `simulate()` for tests.
- **`sample-world.js`** is new: a small procedural world with the game's thermal strengths and tops, and a route the
  autopilot flies and lands (the tests check it, and that hands off or straight at the field with no lift falls short).
- **`kite.js`** is Kite Race's `glide.ts` converted from TypeScript to JavaScript with JSDoc types; the numbers are
  the game's round-7 set; comments that named the game's places (its lanes and river) are made general. Its 10 game
  tests are kept (`test/kite.test.mjs`, moved from vitest to node:test); the wind-stream and course tests that need
  the race's course were left out.
- Left out: the cloth wing, the camera rig, the air motes (`airflow.js`), buildings and colliders, the game's
  "Forgiving wings" bounces and lenient landings, the reach estimate.

## Checked

On 2026-11-14: `npm test` (24 tests pass), `node tools/sim.mjs` (the autopilot launches, climbs two thermals,
crosses the lake and lands 17 m from the field centre at 3.8 m/s sink), `vite build`, and the demo opened in headless
Chromium: it drew without errors, the autopilot flew, holding S gave the STALL warning, K switched to kite mode. The
picture is `blocks/previews/meticulai-glider-flight.jpg`.
