# Flock: how to use it

A player-steered murmuration: a few thousand boids on the CPU that move as one living cloud. The player sets a
target and the cloud trails and stretches after it; hold to **gather** it into a tight ball, tap to **scatter** it.
Birds avoid obstacles and the ground (or die on them, if you want that), flee predators in a ripple, and can travel
along a moving "flyway". Drawn as instanced procedural starlings that flap and bank in the vertex shader, reading
the simulation's arrays directly (no per-frame copy). From Murmur, a game by Meticulai where you were the flock.

Renderer: **webgl2** for `birds.js` (a patched `MeshLambertMaterial`, so fog and shadows still work). `flock.js` and
`colliders.js` have no imports and run anywhere (Node, workers).

## API

```js
import { Flock, CapsuleCollider, SphereCollider, BoxCollider } from '../../vendor/meticulai-flock/src/index.js';
import { Birds } from '../../vendor/meticulai-flock/src/birds.js';

const flock = new Flock(5000, { seed: 1 });      // capacity; seed makes spawns and bursts repeatable
flock.flow = [0, 0, 0];                          // hover; or the flyway's velocity, e.g. [0, 0, 13]
flock.spawn(3000, 0, 36, 0, 14);                 // n, centre x y z, spread, optional starting velocity
const birds = new Birds(flock);                  // { color, growFrom: 55, growMax: 2.4 }
scene.add(birds.mesh);

// every frame:
flock.target = [x, y, z];                        // where the player points
flock.tightness = gatherT;                       // 0 loose .. 1 gathered (ease it: up at 5/s, down at 2.5/s)
if (scatterPressed) flock.burst();               // a burst outward; flock.scatter fades from 1 to 0 in ~1.1 s
flock.step(Math.min(dt, 1 / 30), { colliders, predators, groundAt, wind, immortal });
birds.flapBoost = gatherT * 0.6 + flock.scatter; // they flap harder when gathering or scattering
birds.update(time, camera.position);
```

- `step(dt, world)`: `colliders` = objects with `sdf(x, y, z, out)` (use the three classes, or write your own:
  return false if far, else write distance and outward normal to `out[0..3]`); `predators` =
  `[{ x, y, z, r, k }]` (birds within `r` flee with strength `k`; the game's falcon used r 8-11, k up to 260);
  `groundAt(x, z)` = ground height (birds pull up below 4 m, die below 0.15 m); `wind` = [x, y, z] push;
  `immortal: true` = nothing kills them (they bounce up instead), as on the game's title screen.
- Read: `flock.count`, `flock.centroid`, `flock.radius` (rms size), `flock.pos` / `flock.vel` (Float32Arrays,
  3 per bird), `flock.misc` (flap phase, bank, wander seed, size), `flock.age`, `densityAt(x, y, z, r)`.
- `flock.onDeath = (x, y, z, vx, vy, vz, cause) => {}` (cause 1 ground, 2 collider): spawn feathers, play a sound,
  count the score. `kill(i)` removes a bird (swap-remove: the last bird moves into slot `i`).
- `flock.p` holds the tuning (`DEFAULT_PARAMS`); pass `{ params: {...} }` to the constructor or change it live.
- `coreRadius(tightness)`: the hollow middle the target pull leaves alone, so the cloud has volume and swirls. It
  grows with the cube root of the bird count, so a big flock is a big cloud (harder to thread through gaps).

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-flock` (three is already in the starter).
2. In `my-game/src/game/game.js`, in `createGame(ctx)`: make the `Flock`, `spawn`, add `new Birds(flock).mesh` to
   the scene. Use `ctx.rng` to pick the seed so `?seed=` replays work: `new Flock(5000, { seed: ctx.rng.int(1, 1e9) })`
   (`rng.reset()` runs before `start()`, so build or re-seed the flock in `start()`).
3. In `update(dt, mode)`: set `target` from the input (raycast the pointer onto a plane in front of the camera, as
   the demo does), `tightness` from a held button, `burst()` on a tap with a cooldown (the game used 2.2 s), then
   `flock.step(dt, world)`.
4. In `render(alpha)`: `birds.update(time, camera.position)`. Point the camera at `flock.centroid`.
5. Put the weights you change most (`wSwirl`, `wTarget`, `maxRel`, `sepR`) into `src/tuning.json` and copy them into
   `flock.p` when they change.
6. For the HUD and bots: `window.__game.state()` can return `flock.count`, `flock.radius` and `flock.centroid`.

## The numbers that matter (Murmur's, unchanged)

| Param | Value | What it does |
|---|---|---|
| `wSwirl` / `swirlSpeed` | 7.5 / 0.55 | a slowly changing swirl field anchored to the flock: whole regions fold and roll together. This is what makes it read as a murmuration and not a swarm of gnats |
| `wTarget` / `wTargetGather` | 3.2 / 9.0 | how hard the cloud chases the player's target, loose / gathered |
| `wSep`, `sepR` / `sepRGather` | 34, 1.35 / 0.62 m | personal space; shrinks when gathered so the ball gets dense |
| `wAli` / `wCoh` | 2.6 / 0.35 | alignment strong, local cohesion weak (the target and swirl hold it together) |
| `maxNeighbors` | 10 | stop after 10 neighbours: cheap and still looks right |
| `maxRel` | 18 m/s | top speed relative to the flow (doubled while scattering) |
| `wFlow` | 1.6 | match the flyway's velocity |
| core radius | 2.2 + cbrt(n) x 0.72 (loose), 0.9 + cbrt(n) x 0.26 (gathered) | the hollow middle |
| obstacle push | 70 within 3.2 m | strong but limited, so aiming still matters |

Cost: about 1.3 ms per step for 2,600 birds on a laptop CPU in Node (measured 2026-11-14). The game ran up to 7,000.

## What made it good in Murmur

- The game's design note says it best: "The title screen is already playable. Thousands of starlings swirl over a
  golden field and follow your cursor; hold the button and they pull into a dense knot, let go and they bloom back
  out. Nobody needs to be told what this game is." Steer, gather, scatter: three verbs, readable in five seconds.
- The swirl is a single smooth flow field (an ABC flow, divergence-free and chaotic) anchored to the flock rather
  than per-bird noise, so big regions move together. Per-bird wander is kept small on top.
- The cloud scales with its size: more birds make a bigger core, so a big flock is harder to thread through gaps.
  Gathering costs breath in the game: a budget that turned narrow sections into a little puzzle.
- Predators make the cloud ripple away from the stoop, and a gathered flock flees less (the falcon's strength is
  halved at full gather), which made "gather when the falcon commits" a real decision.
- Cheap enough for thousands: a counting-sort spatial hash rebuilt each step, the first 10 neighbours only, and the
  renderer reads the simulation's own arrays (no copying), uploading just the live range.
- Note: Murmur was retired before release. No player verdict on the flock was recorded; the numbers are the
  developers' tuning (a bot at skill 0.7 was used to balance levels).

## Gotchas

- `step` wants dt of 1/30 s or less (the game capped it there). A long hitch with a big dt makes birds overshoot.
- With `flow` non-zero, birds are never allowed to fly backwards along it (they keep 45% of the flow speed). For a
  hovering display set `flow = [0, 0, 0]`.
- Birds only die if you pass `groundAt` or colliders and not `immortal`. For a decorative flock pass `immortal: true`.
- `kill` swap-removes: bird indices change when birds die. Don't keep an index to a bird across steps.
- `Flock(max)` allocates once. `spawn` beyond `max` is ignored (it returns how many it added).
- The spatial hash has 32,768 cells (15 bits). Past ~20,000 birds, raise `HASH_BITS` in `flock.js`.
- Without a seed, `spawn` and `burst` use `Math.random()`. Pass `{ seed }` for replays and tests.
- The bird shader replaces the material's vertex transform: use `MeshLambertMaterial` (as given) or patch your own
  the same way. Birds are drawn up to 2.4x bigger past 55 m so far birds stay visible (`growFrom`, `growMax`).

## Restyle it

- Fish school: `flow` = current, lower `maxRel` (6-8), `wSwirl` 3-4, raise `wAli` to 4, swap the starling geometry
  in `birds.js` for a fish shape and slow the flap (the `flap()` GLSL) into a tail wiggle.
- Bats or insects: smaller `sepR`, higher `wWander`, faster flap, lower `growMax`.
- Bigger, slower birds (geese): `maxNeighbors` 6, `wSwirl` 2, `maxRel` 12, scale the geometry up.
- Colour: `new Birds(flock, { color: 0x1a1a1a })`. They read best dark against a bright sky.

## Run the demo alone

`cd vendor/meticulai-flock && npm install && npm run dev` (http://127.0.0.1:5405). `?n=6000` for more birds. Move the
mouse, hold the button to gather, space or right click to scatter; a falcon stoops through every few seconds.
`npm test` runs 12 tests.
