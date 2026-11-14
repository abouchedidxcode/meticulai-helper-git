# Pixel 3D: where this copy came from

From **Rootbound** by Meticulai (meticulai.com, https://meticulai.com/games/rootbound/). Extracted 2026-11-14 from
the game's source at `8849adcf3` (clean: no uncommitted changes in the files used).

| | |
|---|---|
| Made by | Meticulai |
| Source files (in the game folder) | `public/js/pixel/view.js`, `palette.js`, `glsl.js`, `batch.js`, `sprites.js` |
| Code licence | MIT (see `LICENSE`; Dave Hoskins' hash is MIT too) |
| Art licence | none: no image files, every sprite is drawn by code |
| Renderer | webgl2 (three.js `WebGLRenderer`), checked on three 0.187.0 |

## What changed

- `palette.js`, `glsl.js`: copied as they are (every ramp colour unchanged). Comments generalised; Dave Hoskins credited.
- `sprites.js`: the generator is unchanged (all shapes, numbers, the light direction, outline and dither rules).
  Added `setCanvasFactory()` (so node tests can run it without a browser), `clearSpriteCache()`, and exports of the
  rasteriser (`Sprite`, `spriteMaterial`, `seededRandom`, `tube`, `inPoly`) so a game can draw its own sprites.
- `view.js` -> `src/view.js` `PixelView`: same art target, integer zooms, camera snap, sub-pixel blit, follow easing
  (rate 8), shake (3 art px, decay 2/s), clear colour `#120c10` and the stepped corner tint (`uDanger`, Rootbound's
  drought warning) and fade. New: a `'3d'` mode (orthographic camera at any yaw/pitch, snapped in its own axes), reusing
  an existing renderer (e.g. the kit's starter), an optional 1 px depth outline pass, an optional dithered palette
  sky, raw (unconverted) clear/outline colours so they stay exact, and target sizes rounded up to even numbers so
  sprite pixels always sit exactly on art pixels. Removed: the stand-ins for Rootbound's deleted 3D view
  (`grade`, `q.tilt`, `setQuality`).
- The maths moved to `src/snap.js` (no three.js import) so it is tested in node.
- `batch.js`: `canvasTexture`, `releaseCanvas`, `PxSprite` (2d) and `PxParticles` kept with the same numbers;
  particles now take 3D positions and snap in clip space, so they work in both modes. New: `PxBillboard` (3d sprites).
  Dropped: `PxPreview` (Rootbound's dotted root-drawing preview; game-only).
- New: `src/material.js` `pixelMaterial()` (Rootbound had no lit 3D meshes in the pixel version: its world was 2D
  shaders). It resolves light into a ramp the same way the sprite rasteriser does.
- Not taken: soil, roots, sky, tree and stage shaders (game content, ~2,500 lines), the HUD and pixel fonts.

## Checked

2026-11-14: `npm run build` on three 0.187.0 / vite 8.3.8, demo opened in headless Chromium (Metal), no console
errors or warnings, preview `blocks/previews/meticulai-pixel-3d.jpg`. Every pixel of the screenshot was checked to be an
exact palette colour (66 colours, 0 off-palette), also when drawn through a starter-style renderer (ACES tone mapping, sRGB output).
`node --test test/`: 16 tests pass.
