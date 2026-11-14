# Sonar sketch: where this copy came from

From Abyssal by Meticulai (meticulai.com). Extracted 2026-11-14 from the game's source at `ebec2fde4` (clean: the
files below had no uncommitted changes). Abyssal is not released yet.

| | |
|---|---|
| Made by | Meticulai |
| Source files (in the game folder) | `src/fx/sonarcloud.ts`, `src/render/uniforms.ts` (the clock and fog uniforms), `src/sonar.ts` (ping speed 46 m/s and range 34 m), `tests/sonarcloud.test.ts` |
| Copied on | 2026-11-14 |
| Code licence | MIT (see `LICENSE`) |
| Art licence | none (no art files) |
| Renderer | webgl2 |

## What changed

- TypeScript to plain JavaScript with JSDoc types. `SonarCloud` is now `SonarSketch`; "salvage" is now "target".
- The game's shared uniforms are gone: the sketch owns its clock uniform (`sketch.time`, or pass your own with
  `opts.time`) and its fog density. The colours were constants in the shader; they are uniforms now, with the
  same values (`SONAR_COLOURS`).
- The fragment shader now includes three's tone mapping and output colour space chunks. The game drew into an HDR
  target and did tone mapping, bloom and sRGB in its own last pass; with the kit's starter renderer (ACES, sRGB)
  this gives about the same look, without the bloom.
- The per-frame budget reads `sketch.clock()` (default `performance.now()`) instead of calling it directly, so the
  budget test runs on a fake clock. The game's version of that test timed the real machine and failed under load.
- The ghost's body was the game's creature (`phantomSketch`); `src/shapes.js` has a generic stand-in (`bodySketch`)
  with the same layout. The tail-wave maths is unchanged.
- Every tuning number is unchanged: 900 rays, 2 ms budget, 4 s glow, step 0.4 x distance clamped 0.35-3.2 m,
  5 bisection steps, 0.22 m lift, 2 satellites, 12 amber points, the flash, size and fade curves.
- Left out: the game's ping uniforms and the shaders that light the rock as the front passes (they belong to the
  game's rock material), the decoy and dread systems that call it, the game's real cave field. The demo has a small
  procedural cave instead (`demo/cave.js`).
- Tests: ported from vitest to `node:test`. The test that timed the game's real cave field now uses the demo cave.

## Checked

On 2026-11-14: 15 tests pass (`npm test`); built with `npm run build` and opened the demo in headless Chromium (Metal).
It drew without errors. The picture is `blocks/previews/meticulai-sonar-sketch.jpg` (four quick pings, the last one
finding a ghost).
