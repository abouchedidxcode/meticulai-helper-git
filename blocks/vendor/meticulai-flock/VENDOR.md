# Flock: where this copy came from

From Murmur by Meticulai (meticulai.com). Murmur was retired before release (it is not on the site). Extracted
2026-11-14 from the game's source at `8849adcf3` (clean: no uncommitted changes).

| | |
|---|---|
| Source files (relative to the game folder) | `src/sim/flock.js`, `src/sim/colliders.js`, `src/render/birds.js`; the gather/scatter rates and falcon strength from `src/game/game.js` and `src/game/falcon.js` |
| Code licence | MIT (see `LICENSE`) |
| Art licence | none: birds are a procedural mesh, no files |
| Renderer | webgl2 (`src/birds.js`); the simulation has no renderer |

## What changed

- `src/flock.js`: the game's code with every number unchanged. Added an optional seed (`new Flock(max, { seed })`,
  mulberry32) so spawns and bursts can be replayed; without a seed it uses `Math.random()` as the game did. The
  tunables moved into an exported `DEFAULT_PARAMS` object, overridable with `{ params }`. JSDoc for `step`'s world.
- `src/birds.js`: the game's renderer. The distance-based size boost (55 m, 2.4x, hard-coded) is now an option
  (`growFrom`, `growMax`), and so is the bird colour.
- `src/colliders.js`: unchanged apart from the header comment.
- Added: `src/index.js`, the demo (a hovering flock over a field with a falcon; the game flew it along flyways) and
  12 tests (the game had none for the flock).
- Left out: everything else in the game (flyways, levels, terrain, the falcon AI, audio, UI). None of the game's
  generated art, models, music or sound came along.

## Checked

On 2026-11-14: `npm install`, `npm test` (12 pass) and `npm run build` in a temporary copy; the demo ran in headless
Chromium with no errors, mouse-driven as well. Picture: `blocks/previews/meticulai-flock.jpg`.
