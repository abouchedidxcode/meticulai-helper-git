# Firefly swarm: where this block came from

From Fireflies by Meticulai (meticulai.com). Extracted 2026-11-14 from the game's source at `8849adcf3` (clean).
Fireflies is live inside the Show of Hands hall: https://meticulai.com/games/show-of-hands/

| | |
|---|---|
| Made by | Meticulai |
| Source files (in the game folder) | `src/flies.ts`, `src/rules.ts`, `src/scene/fireflies.ts`, `src/scene/jar.ts`, `src/scene/shared.ts`, the hand logic in `src/main.ts`, the pointer timings in `src/input.ts` |
| Code licence | MIT (see `LICENSE`) |
| Art | none (everything is drawn in shaders) |
| Renderer | webgl2 |

## What changed

- TypeScript converted to plain JavaScript with JSDoc types.
- Every tuning number is kept exactly: the rules (`TUNING`), the speeds and sizes per kind, blink shapes, startle and
  escape timings, the point shader (core 5, halo 0.11; held core 2.2, halo 0.1), the 340-point distant swarm, the
  jar, the dusk palette, the 20 fake local lights and their order.
- The shared module-level uniforms became `createLook()` (one object you pass to each part) with `setDusk(look, d)`.
  The game's wind, gust and jar-clearing uniforms (used only by its grass) were left out.
- The per-hand logic that lived in the game's `main.ts` (close / open, capture radius with a little charity, startle,
  the pair, slip-out timer, a hand lost for 0.6 s, drops into the jar, fist glow) is now `FireflyCatcher`, driven by
  any hand that reports a screen point, a world point and an openness. Hints, audio and the HUD stayed in the game:
  the catcher emits events instead.
- The game fed the mouse through a synthetic hand and a gesture engine to get openness. That engine belongs to
  another block, so `PointerHand` turns the same timings (0.55 s hold to close, 0.15 s tap snaps shut in 50 ms,
  0.22 s to reopen) straight into openness. The slow / frantic outcome is the same (tested).
- Hand tracking, the ray-marched hand, the sky, land, grass, flowers, post chain, audio, bot, UI and the session
  flow were left out. The demo has its own small sky, ground and grass.
- The light update (`writeLights`) and the camera play volume (`createCameraSpace`) were pulled out of `main.ts`
  as functions, same numbers.
- Note kept from the game: `TUNING.curiousRadius` is 0.32 but the swarm's own curiosity test used 0.34; the block
  keeps 0.34 (option `curiousRadius` on `Flies`) because that is what was played.

## Checked

On 2026-11-14: `node --test test/*.test.mjs` (25 pass: the game's rules tests ported, plus swarm, catching and
pointer tests), `npm run build` in a temporary copy, and the demo opened in headless Chromium (no errors); a slow
press caught three fireflies at once. The picture is `blocks/previews/meticulai-firefly-swarm.jpg`.
