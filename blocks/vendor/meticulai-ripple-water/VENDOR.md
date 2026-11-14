# Ripple water: where this copy came from

From Koi by Meticulai (meticulai.com). Extracted 2026-11-14 from the game's source at `8849adcf3` (clean: the files
below had no uncommitted changes). Koi is live inside the Show of Hands hall: https://meticulai.com/games/show-of-hands/

| | |
|---|---|
| Made by | Meticulai |
| Source files (in the game folder) | `src/scene/ripples.ts`, `src/scene/ripples-config.ts`, `src/scene/water.ts`, `src/scene/shared.ts` (noise, caustics, `rippleFocus`, light colours), `src/scene/terrain.ts` (the under-water lighting), `src/pond.ts` (the pond shape), the calls in `src/main.ts`, `tests/water.test.ts` |
| Copied on | 2026-11-14 |
| Code licence | MIT (see `LICENSE`) |
| Art licence | none (no art files) |
| Renderer | webgl2 |

## What changed

- TypeScript to plain JavaScript with JSDoc types.
- `Ripples`: the simulation shader is unchanged. The pond shape and simulation rectangle were fixed in the game; they
  are options now (`rect`, `shoreGlsl`), and grid sizes come from the game's cell size so waves keep the game's speed
  on any rectangle (`SIM_QUALITY`, `gridFor`). The finger-to-bodies code from `main.ts` is `ripples.stroke()`, same
  numbers. `step()` restores the previous render target instead of always the screen.
- Water surface: the game's shader minus what belonged to the game: the canopy reflection, palm and finger shadows,
  koi mouths, resting-place glows, the held-food marker, debug views. Kept: refraction with dispersion, sky reflection
  and Fresnel, glints and sparkle, crest/trough light, wind ripples (baked texture), pollen film, splash foam, the
  touch and hover markers, the shore meniscus. It now ends with three's tone mapping and colour space chunks (the game
  did that in its own post pass).
- Under water: the game lit its bed in its own terrain shader. `applyUnderwater` is that lighting (ripple-focused
  caustics, absorption, scatter) as a patch for any `MeshStandardMaterial`. The caustic factor multiplies three's
  direct light instead of the game's own light sum. The game's two-layer camera setup is now `UnderPass` (hide the
  water, render into a half-float target at about CSS resolution).
- All tuning numbers are unchanged (k, steps, damping, body pull, stencil weights, `NORMAL_K`, refraction,
  reflection, glint powers, absorption, colours).
- The demo (a garden pond, stones, capsule fish, mouse as a finger) is new. No game art.

## Checked

On 2026-11-14: 10 tests pass (`npm test`, on a fake renderer). Built with `npm run build` and opened the demo in
headless Chromium (Metal): it drew without errors. The picture is `blocks/previews/meticulai-ripple-water.jpg` (the
self-driving finger, a splash, caustics on the bed).
