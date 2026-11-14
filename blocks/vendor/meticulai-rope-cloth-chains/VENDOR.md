# Rope and cloth chains: where this copy came from

From Inkbound by Meticulai (meticulai.com). Not released yet. Extracted 2026-11-14 from the game's source at
`44387accb` (the file used is clean; other files in the game had uncommitted changes from a session working on it,
none of them this one).

| | |
|---|---|
| Source files (relative to the game folder) | `src/anim/cloth.ts` (the chain), preset numbers and wind from `src/anim/index.ts`, sleeve lengths from `src/anim/style.ts` |
| Code licence | MIT (see `LICENSE`) |
| Art licence | none: no files |
| Renderer | none (`src/ribbon-mesh.js` and the demo use three.js) |

## What changed

- `src/chain.js`: `cloth.ts` converted from TypeScript to JavaScript with JSDoc. Same algorithm and numbers. The
  teleport distance (420 px, hard-coded in the game) is now the `snap` property with the same default.
- Added `src/chain3.js`: the same chain in 3D (a z axis added; otherwise line for line the same steps), with `snap`
  and `floorGap` for metre-scale games, and `length()`.
- Added `src/presets.js`: the chains the game's three fighters wear (numbers unchanged, character names left out),
  the game's wind formula, and `scaled()` to convert game pixels to other units.
- Added `src/ribbon-mesh.js` (three.js tapered ribbon, camera-facing or fixed side), the 3D demo and 11 tests (the
  game had no tests for the chain).
- Left out: the brush-stroke painting of ribbons (`paint.ts`, tied to the game's ink look), the fighters and rig.

## Checked

On 2026-11-14: `npm install`, `npm test` (11 pass) and `npm run build` in a temporary copy; the demo ran in headless
Chromium with no errors. Picture: `blocks/previews/meticulai-rope-cloth-chains.jpg`.
