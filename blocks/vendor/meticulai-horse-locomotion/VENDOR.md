# Horse locomotion: where this copy came from

From TUMEN by Meticulai (meticulai.com). Extracted 2026-11-14 from the game's source at `877d87cb2` (clean: the files
copied had no uncommitted changes). TUMEN is not released yet.

| | |
|---|---|
| Made by | Meticulai |
| Source files | `public/js/army/locomotion.js` (the law), `public/js/army/army.js` (the trail and body code only), `public/js/army/standin.js` (the footfall table only), `tools/movecheck.mjs` (the checks) |
| Code licence | MIT (see `LICENSE`) |
| Art | none (the demo's horses are built from spheres and cylinders in code) |
| Renderer | none (the law and the checker are pure JS; the demo uses three.js WebGL2) |

## What changed

- `src/locomotion.js`: the game's file, every number and every line of code unchanged. Only comments were edited
  (game file paths and builder names removed).
- `src/herd.js` is new as a file, but its trail code (`trailInit`, `trailPush`, `trailGet`, `bodyFromTrail`, 64
  points 5 cm apart) and the lean easing are copied from the game's army module. `worldPoint()` writes out the vertex
  shader's placement (bend, lean, heading) in JS. `seek()` is new and simple. `reins()` and `paceSpeeds()` carry the
  game's player-horse numbers (steer 1.3, pivot walk 1.9 m/s, burst 0.985 of top speed, pace picks 72 % / 55 % /
  72 % of each range, capped at 6.5 and 12.5 m/s).
- `src/footfall.js`: the stand-in horse's footfall table, body bob/pitch table and hoof path, lifted out of the
  three.js model builder so they run without three.js. Numbers unchanged.
- `src/checker.js`: the game's movement checker, taken out of the page and the army module. Kept: off-facing
  (forehand and body), backward, jump, claimed speed, accel, brake, turn, pivot at rest, overlap and hoof slide, with
  the same limits. Dropped (they belong to the renderer and the army): "rider on the seat", "picture vs sim", the men
  on foot, the per-unit report lines. Hoof slide is computed from the footfall table instead of from baked bone
  tracks; pass your own `hoofAt` and `contactsOf` to check a real model.
- `tools/movecheck.mjs`: rewritten for node only, with five general scenarios (ride, circle, halt, steer, herd) instead
  of the game's battle scenes, and seven of the game's eight sabotage modes (seat sabotage needs a renderer).
- Game-only parts not copied: units and formations, orders, knights, the battle, the player's camera.

## Checked

`npm test` (22 tests, node 26): law properties, the game's numbers, the five scenarios with hooves held within
1 cm, and every sabotage caught by the right check. `node tools/movecheck.mjs`: 40 horses x 60 s per scenario, worst
hoof slide 8.4 mm (wild steering), turn 0.999 of the limit, every check passes (the game's own run reported 0.998
turn and 4.5 mm with the same stand-in). Demo built with Vite 8.3.8 and three 0.187.0 and run in headless Chromium:
no errors; the preview is `blocks/previews/meticulai-horse-locomotion.jpg`.
