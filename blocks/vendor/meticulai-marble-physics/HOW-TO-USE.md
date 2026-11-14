# Marble physics: how to use it

Sphere physics for marbles and balls rolling over a built course, from Lost Marbles (a 50-marble online race on
meticulai.com). Fixed 60 Hz ticks with 4 substeps; colliders are oriented boxes, cylinders, **lathe shells**
(a 2D profile spun round an axis: bowls, funnels, banked turns) and **helix shells** (a lathe that also climbs as it
turns: loop-the-loops, helter-skelters, drops). Moving obstacles (spinners, swinging hammers, sliders, trapdoors,
orbiting tops) are pure functions of time. Marbles bump each other. A small controller turns stick input into forces
(grip, drag, air control, jump, double jump, slick surfaces).

It is **deterministic**: same course, same inputs, same order -> the same bits, every run. That is what let the game
run one simulation on the server, the same one in the browser for solo play, and the same one again to predict the
player's own marble between network updates. Use it for replays, ghosts, share links, server-checked scores,
bots that test levels, or lockstep multiplayer.

Renderer: **none** (pure JavaScript, no imports). `src/view.js` is an optional three.js helper that draws any
collider. Runs in Node, Workers and the browser.

## Files

- `src/physics.js`: colliders, `World`, `stepWorld`, `stepSingle`, matrices. The heart; no dependencies.
- `src/control.js`: `controlStep` (input -> forces), `DEFAULT_STATS`, `STAT_RANGES`, `SLICK`.
- `src/state.js`: `stateHash` (exact-bits hash of every marble), `copyBody` / `restoreBody` (snapshots).
- `src/math.js`: `useMath(m)`: swap the `Math` the physics uses (for cross-engine determinism, see below).
- `src/sample-track.js`: a seeded example run (`buildSampleTrack(seed)`, `chute(...)`, `mulberry32`). Read it to
  see how a course is built.
- `src/view.js` (three.js): `colliderMesh(col, material)`, `syncMesh(mesh, col)`, `shellGeometry(col)`.
- `src/index.js` re-exports everything except `view.js` and `sample-track.js`.

## API

```js
import { World, makeCollider, makeBody, stepWorld, matYPR, makeCtl, controlStep, DEFAULT_STATS, BTN_JUMP,
         stateHash } from '../../vendor/meticulai-marble-physics/src/index.js';

const plank = makeCollider('box', { c: [0, 5, 10], R: matYPR(0, 0.2), hx: 3, hy: 0.25, hz: 10 });   // tipped down 0.2 rad
const peg   = makeCollider('cyl', { c: [0, 6, 8], radius: 0.22, hh: 0.6, mat: { bounce: 0.6, friction: 0.3 } });
const bowl  = makeCollider('lathe', { c: [0, 0, 30], profile: [[1.5, -2], [4, -0.5], [9, 0], [10, 1.5]] });
const loop  = makeCollider('helix', { c: [0, 2, 50], profile: [[3, -1], [3, 1]], a0: 0, a1: Math.PI * 2, rise: 3 });
const spinner = makeCollider('box', { c: [0, 5.6, 14], hx: 2, hy: 0.3, hz: 0.2,
  motion: { type: 'spin', axis: [0, 1, 0], speed: 1.6, phase: 0 } });

const world = new World([plank, peg, bowl, loop, spinner]);           // or new World(cols, { gravity, maxSpeed, substeps, tickHz, cell })
const ball = makeBody(0); ball.x = 0; ball.y = 6; ball.z = 1;          // r 0.5, mass 1 by default
const ctl = makeCtl();

// every fixed tick (count ticks with an integer; never sum dt):
controlStep(ball, ctl, { mx: stickX, mz: stickZ, btn: jumpHeld ? BTN_JUMP : 0 }, DEFAULT_STATS, null);
stepWorld(world, [ball /*, ...all marbles */], tick * world.tickDt, bumpEvents /* optional [idA, idB, speed, ...] */);
tick++;
```

- **Colliders** (`makeCollider(shape, opts)`): `c` centre, `R` rotation (9 numbers, row-major; build with `matYPR`,
  `matRotX/Y/Z`, `matAxisAngle`, `matMul`). `box`: `hx, hy, hz` half sizes. `cyl`: `radius`, `hh` half height
  (along local Y). `lathe`: `profile` [[radius, height], ...] spun round local Y, `a0/a1` to use only part of the
  circle, `shell` thickness each side of the line (0.35). `helix`: a lathe plus `rise` over the range `a0..a1`
  (may go past 2 pi), `ease` (S-curve rise), `lift` (per-profile-point bank) and `blend` (radians to ease the bank in).
- Per collider: `mat: { bounce 0.25, friction 0.15, kick 0 }`, `tag` (any string; `'slick'` = low grip, see
  `SLICK`), `boost: [ax, ay, az]` speed strip (with `boostCap`), `sensor: true` (not solid: boost only),
  `launch: [vx, vy, vz]` (a cannon: sets velocity exactly), `floor: true` (moving floor that ghosts still ride).
- **Motion** (kinematic, a pure function of time): `{ type: 'spin', axis, speed, phase, pivot? }`,
  `{ type: 'swing', axis, amp, speed, phase, pivot }` (hammers), `{ type: 'slide', dir, amp, speed, phase }`,
  `{ type: 'drop', period, phase, closedFrac, depth }` (trapdoor, stops colliding when open),
  `{ type: 'orbit', axis, pivot, speed, spin, phase }` (a spinning top wandering round a point).
- **Body** fields you set: `x y z vx vy vz r mass bounce push wallLoss gravity ghost anchored active`.
  Fields you read after a step: `grounded`, `groundT`, `gnx/gny/gnz` (ground normal), `wallHit`, `wallSpeed`,
  `landSpeed`, `bumped`/`bumpSpeed` (cumulative; reset yourself), `touchTag`, `groundTag`.
  Use them for sound and juice: `landSpeed` for a thud, `bumpEvents` for clacks, `wallSpeed` for knocks.
- `stepSingle(world, body, t0, others)`: step one marble against the course with others as fixed spheres
  (`[x, y, z, r, mass, ...]`). The game used it to predict the player's own marble between server snapshots.
- `stateHash(bodies)`: 8 hex digits over the exact bits. Print it on two machines; if it differs, they drifted.
- `controlStep(body, ctl, input, stats, mods, frozen, dt)`: `input.mx/mz` is a world-space direction (length <= 1:
  turn your stick into camera-relative world XZ first). Returns `'jump'`, `'airjump'` or `null`.

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-marble-physics`. No npm packages needed (three is already in the starter
   for `view.js`).
2. In `my-game/src/game/game.js`: build the colliders and `new World(colliders)` in `createGame(ctx)`; add meshes
   with `colliderMesh(col, material)` from `vendor/meticulai-marble-physics/src/view.js`.
3. The starter's `update(dt, mode)` is already a fixed 60 Hz step: in it call `controlStep` for the player marble
   (input from `ctx.input`), then `stepWorld(world, bodies, tick * world.tickDt)` and `tick++`.
   In `render(alpha)`, place marble meshes at the body positions (and `syncMesh` the moving obstacles).
   In `start()`, rebuild bodies and set `tick = 0` so every run starts the same (the starter calls `rng.reset()`).
4. Put the feel numbers in `src/tuning.json` (`topSpeed`, `accel`, `grip`, `jump`...) and read them with
   `ctx.tune` into a stats object: the settings panel then tunes them live. Keep `DEFAULT_STATS` as the defaults.
5. For `window.__game.state()`, return the marble's position, speed and `stateHash(bodies)`: a recording or bot
   run can then be checked for the same result.

## Determinism: what to know

- On one JavaScript engine the result is always bit-identical (tests prove it). Across engines (Chrome V8 vs
  Safari JavaScriptCore vs Node), `Math.sin/cos/atan2/hypot` may differ in the last bit, and a long run then drifts.
  If players on different browsers must agree (share links, replays, server checks), add
  `meticulai-deterministic-math` and call `useMath(DMath)` **before building colliders**. Trick Shot did exactly this.
- Count time in integer ticks: `t0 = tick * world.tickDt`. Summing `dt` gives different times on different runs.
- Feed inputs in the same order, on the same tick. Never use `Math.random()` inside the step (seed your own; see
  `mulberry32` in `sample-track.js`). Never step with a variable `dt`.
- Bodies are visited in array order; keep the order the same on every machine.

## The numbers that matter (the game's, unchanged)

| Number | Value | What it feels like |
|---|---|---|
| `GRAVITY` | 46 units/s^2 (marble is 1 unit across) | heavy and quick, like a small glass toy filmed up close; lower it and marbles float |
| `MAX_SPEED` | 52 | a safety cap; races rarely touch it |
| ticks, substeps | 60 Hz x 4 | no tunnelling through 0.5-thick planks at race speeds |
| settle rule | bounces under 3 units/s become 0 | marbles rest instead of buzzing on the floor |
| ground friction | `1 - friction*0.5*h` per substep | marbles roll on and on; walls cost much more (scrapes slow you) |
| `DEFAULT_MAT` | bounce 0.25, friction 0.15 | wood |
| `topSpeed` / `accel` | 17 / 25 | control tops out; downhill and boosts still go faster |
| `airControl` | 0.32 | you can nudge in the air, not steer |
| `grip` | 2.4 | carves through turns and hands some sideways speed back as forward speed |
| `jump` / `jumpCd` | 10.5 / 0.9 s | a small hop, not a platformer jump |
| `SLICK` | grip x0.1, accel x0.2, 0.2 s memory | lacquered bowls: you orbit, and must lean to dive in |

`STAT_RANGES` is the range the game let perks move each stat into: tune inside it.

## What made it good in Lost Marbles

- One physics everywhere. The server, the solo mode and the player's own prediction ran the same file, so the
  marble felt the same online and offline and corrections were tiny. A toy cannon uses `launch` (an exact velocity)
  rather than a force, so prediction and server agree to the bit on every shot.
- Shapes that make set pieces. Lathe and helix shells gave the game its best moments: a giant slick bowl where
  the whole field orbits like coins in a wishing-well funnel, banked turns you ride high to keep speed, a
  loop-the-loop that drifts sideways, a 540-degree helter-skelter, a wall-of-death drum. Measured in the game: a lone
  marble that does nothing orbits the bowl about 3 laps (15-17 s) before draining; leaning in takes 3-4.5 s.
- Things that make it not feel cheap: the settle rule (no jittering at rest), resolving the deepest contact first
  and re-testing (no snagging on the seams between blocks laid end to end), only a little rolling loss on floors.
- Feel was tuned by the owner playing: an early build felt "way too fast" and jittery, so burst boosts were
  removed or softened. The numbers here are the ones after that.
- It carried a lot: 50 marbles bumping in one show, bots that time jumps (a mega jump measured over full bot races:
  far deck 40%, mid 42%, net 18%), and it was reused by Marble Golf, For Keeps and Trick Shot.

## Gotchas

- Units: a marble is radius 0.5. Build courses at that scale (planks 0.5 thick, walls about 1.2 high) or change
  `GRAVITY` with the scale (`new World(cols, { gravity })`).
- Gaps narrower than a marble (peg to peg, peg to wall) trap marbles for good on a slope. Keep gaps over 1.1, or
  respawn marbles that stall (the game sent back any marble with no progress for 12 s).
- Lathe/helix `profile` is the shell's mid-line; the riding surface is `shell` (0.35) above or below it.
- The broad phase is a 10-unit XZ grid. A tower of many stacked colliders in one cell is slower; a huge collider
  covers many cells (fine, just memory).
- Marble-marble is O(n^2): fine up to about 60 marbles. For hundreds, add a grid.
- No spin or rolling rotation is simulated: draw rolling yourself from velocity (rotate about
  `cross(up, velocity)` by `speed * dt / r`). For Keeps added spin; this block does not.
- `stepWorld` resets `wallHit`, `landSpeed`, `touchTag`, `groundTag` each tick; `bumped` counts up until you reset it.

## Restyle it

The physics has no look. Change the course (`sample-track.js` is just an example), materials (`mat` per
collider: rubber pegs bounce 0.6, ice friction 0.02, felt friction 0.6), the marble size (`body.r`, `mass`) and the
controller stats. For a pinball or minigolf feel: lower `GRAVITY` a bit, raise `bounce` on bumpers, add `kick`
(a minimum bounce-out speed) to make active bumpers.

## Run the demo alone

`cd vendor/meticulai-marble-physics && npm install && npm run dev` (http://127.0.0.1:5401). `?seed=N` builds
another run. Drag to orbit. The HUD shows the state hash and checks a hidden twin simulation every tick.
`npm test` runs 13 tests (determinism, rollback, kinematics, resting, slopes, shells, bumps, controller).
