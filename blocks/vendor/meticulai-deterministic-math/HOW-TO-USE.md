# Deterministic math: how to use it

`DMath` is a drop-in replacement for `Math` whose `sin`, `cos`, `tan`, `atan`, `atan2`, `asin`, `acos`, `exp`,
`log`, `pow` and `hypot` give **the same bits in every JavaScript engine**: Chrome and Edge (V8), Safari and every
iPhone browser (JavaScriptCore), Firefox, and Node. From Trick Shot (meticulai.com), where every share link and
replay re-runs the shot's physics in the viewer's browser instead of storing the path.

Renderer: **none**. One file, no imports, no npm packages.

## When determinism matters (and when it does not)

The built-in `Math.sin` and friends are only promised to be *close*, not exact, and engines round differently.
Measured with this block's demo on 2026-11-14: of 97 test inputs, the built-in Math disagreed with DMath on 18 in
Node, 20 in headless Chromium and 14 in WebKit (Safari's engine), and not always on the same inputs. DMath gave the
same 97 results, bit for bit, in all three. One bit seems harmless, but a simulation feeds every result into the
next step: in the demo's double pendulum the gap starts at 1e-16 and is a whole swing apart within a minute.

You need it when **a simulation is run again somewhere else and must come out the same**:

- **Replays and ghosts** stored as inputs (much smaller than storing positions), watched in another browser.
- **Share links** like `?shot=12.4500.730`: the receiver re-simulates the shot (Trick Shot).
- **Lockstep multiplayer**: every player simulates and only inputs are sent; one bit of drift desyncs the game.
- **Server-checked scores and leaderboards**: the server (Node) re-runs the player's inputs to verify the score.
- **Bots and level solvers** in Node whose results must hold in the browser ("this level is solvable at 65% power").
- **Daily puzzles from a seed** that must be the same puzzle for everyone.

You do **not** need it for anything only drawn on screen (particles, camera, animation, shaders: GPUs are not
bit-exact anyway), for a single-player game that never re-runs a simulation, or for a server-authoritative game
where only the server simulates. It is a bit slower than `Math` (pure JavaScript instead of native code), so use
it only in the simulation.

## API

```js
import { DMath } from '../../vendor/meticulai-deterministic-math/src/dmath.js';
```

`DMath` is a frozen object with the same names as `Math`. Only the functions listed above are replaced; `sqrt`,
`floor`, `abs`, `min`, `max`, `round`, `trunc`, `sign`, `imul`, `fround`, `clz32` and the constants are the built-ins
(IEEE 754 makes those exact everywhere already). `DMath.random` is the built-in `Math.random` and is **not**
deterministic: use a seeded generator.

The simplest way to switch a simulation module over is one line at the top of the file, so the rest of the code
stays the same:

```js
import { DMath as Math } from '../../vendor/meticulai-deterministic-math/src/dmath.js';
```

Also in `src/check.js` (re-exported by `src/index.js`):

- `selfCheck(M = DMath)` -> `{ total, failed }`: recomputes 97 recorded cases and lists any whose bits differ. Run
  it once in a test or in `?test=1` mode to prove a new browser agrees. `selfCheck(Math)` shows how the built-in
  Math differs on this engine.
- `bitsHex(x)`: the 16 hex digits of a number's bits, for logs and comparisons.
- `mulberry32(seed)`: a tiny seeded random generator to use instead of `Math.random()`.

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-deterministic-math`. No npm packages.
2. In every file under `my-game/src/game/` that runs the **simulation** (movement, physics, collisions, rules),
   add `import { DMath as Math } from '../../vendor/meticulai-deterministic-math/src/dmath.js';` at the top.
   Leave rendering, camera, UI and audio on the built-in Math.
3. The starter's random numbers (`ctx.rng`, `core/random.js`) are already seeded and reset at every run
   (`rng.reset()`): use them, never `Math.random()`, in the simulation.
4. With `meticulai-marble-physics`: call `useMath(DMath)` from its `src/math.js` before building colliders.
5. Add a test (`node --test`) that calls `selfCheck()` and runs a recorded input list twice, comparing a state hash.
   Optionally expose `selfCheck().failed.length` in `window.__game.state()` so a bot run in a real browser checks it.

## Other rules for a deterministic simulation (the math is only one of them)

- Fixed time step, counted in integer ticks: `t = tick * DT`, never `t += dt` with frame time.
- Inputs recorded per tick and applied on the same tick, in the same order. Iterate arrays in a fixed order (not
  over a `Set` of objects whose order depends on insertion timing, not `Object.keys` of a map filled differently).
- No `Math.random()`, no `Date.now()`/`performance.now()`, no reading the frame rate inside the step.
- Reset **every** piece of state on a retry. Trick Shot found that a retry kept a conveyor-belt boost and a ground
  normal from the shot before: 9 of 3,024 follow-up shots finished a few ticks off, so the replay showed a different
  shot. Its fix was to restore a brand-new body, plus a test that compares a shot played after a belt shot with the
  same shot played fresh.
- Float32Arrays round to 32-bit: fine, they round the same everywhere. `Math.fround` is exact too.
- Send a check value with a share link (Trick Shot sends the stars and end tick). If it ever differs, play anyway
  and say so, instead of showing a wrong result as if it were right.

## What made it good in Trick Shot

- A shot is two integers (heading in 1/100 degree, power in 1/1000) and nothing else. Because the simulation is
  exact everywhere, those two numbers are the whole replay, the whole share link and the whole input to the solver
  that proves every level's stars can be earned.
- It was a decision made at the start ("deterministic math instead of tolerance"), not a fix after drift showed up.
  Every simulation module imports it as `Math`, so the physics code (from Lost Marbles) did not have to change.
- Accuracy against the built-in Math is within 1-3 units in the last place, so moving a game over changes nothing
  you can see or feel. The game went through four critic review rounds with it in place.

## Gotchas

- Range: angles are reduced with a simplified method that is exact for |x| below about 1e6 radians. Wrap angles
  that grow forever (a wheel spinning for an hour) back into -pi..pi now and then.
- `pow(x, y)` for negative x and integer y uses `exp(y * log(-x))` with the sign fixed: close, but `pow(-2, 3)` is
  -8 within an ulp, not always exactly -8. Write `x * x * x` for small whole powers.
- `hypot` is `sqrt(a*a + b*b + ...)`: it overflows past about 1e154, unlike `Math.hypot`.
- It only helps if **every** simulation file uses it. One stray `Math.sin` in a collision helper brings the drift
  back. Search for `Math.` in the simulation files after converting.
- `bitsHex` assumes a little-endian machine (every phone and computer browsers run on today).

## Restyle it

Nothing to restyle: it is maths. To add a function (for example `sinh`), port it from fdlibm/musl using only
`+ - * /` and `Math.sqrt`, add cases to `GOLDEN` in `check.js` (computed once in Node) and run the tests.

## Run the demo alone

`cd vendor/meticulai-deterministic-math && npm install && npm run dev` (http://127.0.0.1:5402). Open the same page in
Safari and in Chrome: both should say "all 97 match". `npm test` runs 7 tests (accuracy on 20,000 inputs, known
values, special values, the recorded bits, cross-call stability, a chaotic re-run, large arguments).
