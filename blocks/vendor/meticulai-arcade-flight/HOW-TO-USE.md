# Arcade flight: how to use it

The flight model, mouse-aim piloting and chase camera of **Dragon Aces** (live at meticulai.com/games/dragon-aces/).
A flyer goes where its nose points with a little slip, trades height for speed, stalls with a nose drop when slow,
flaps harder with the throttle, burns stamina to boost and can throw a barrel roll. The player never flies the
stick: the mouse swings an aim direction and an autopilot (`steerToward`) banks and pulls toward it. Bots use the
same autopilot, so they fly exactly like players.

Renderer: the model has none (pure maths). `chase-camera.js` uses three.js (any renderer). npm deps: `three` only for
the camera and the demo.

## Files

| File | What | Needs |
|---|---|---|
| `src/flight.js` | `createFlightState`, `stepFlight`, `steerToward`, `FLIGHT` (numbers), `PRESETS` | nothing (pure) |
| `src/math.js` | array vectors `[x,y,z]` and quaternions `[x,y,z,w]` (three.js conventions), `qlook`, a seeded `rng` | nothing |
| `src/pilot.js` | `createPilot(fs)`: mouse aim -> autopilot, throttle spool, brake, boost, roll | nothing |
| `src/input.js` | `createInput(canvas)`: keyboard, pointer-lock mouse, gamepad -> controls | a browser |
| `src/chase-camera.js` | `createChaseCamera(camera, { boom, floorAt })` | three.js |
| `demo/` | an island, rock spires, a ring loop, three computer flyers | three.js |

## API

```js
import { createFlightState, PRESETS } from '.../src/flight.js';
import { qlook } from '.../src/math.js';
import { createPilot } from '.../src/pilot.js';
import { createInput } from '.../src/input.js';
import { createChaseCamera } from '.../src/chase-camera.js';

const fs = createFlightState([0, 400, 0], qlook([0, 0, 0, 1], [0, 0, -1])); // 75 m/s, facing -Z
const pilot = createPilot(fs, { breed: PRESETS.balanced });
const input = createInput(renderer.domElement);          // click the canvas to lock the mouse
const chase = createChaseCamera(camera, { boom: 1.4, floorAt: (x, z) => groundHeight(x, z) });

// every frame (dt in seconds; the game clamps it to 0.05):
pilot.fly(dt, input.read());              // steps the model
chase.update(dt, fs, pilot.aimDir());     // after the step
flyerMesh.position.set(...fs.p);  flyerMesh.quaternion.set(...fs.q);
```

- State `fs`: `p` position, `q` orientation (local -Z forward), `vel`, `speed` (m/s along the nose), `sink`,
  `stamina` 0..1, `throttle`, `boosting`, `braking`, `dodge` (time left in a roll), `dodgeCd`.
- Raw model: `stepFlight(fs, { pitch, roll, yaw, throttle, boost, brake, dodge }, dt, preset, cfg)`. pitch/roll/yaw
  are -1..1; dodge -1/1 starts a roll left/right.
- Bots: `steerToward(fs, [dx, dy, dz], input, 1)` then `stepFlight(fs, input, dt, preset)`. The player uses sharp 1.15.
- Presets (the game's breeds): `balanced` 1.0/1.0, `heavy` 0.93/0.9, `fast` 1.09/1.12, `agile` 0.98/1.06 (speed / turn).
- The model never touches the ground: you decide what a crash is (`fs.p[1] < groundHeight`). The game ends the life.

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-arcade-flight`.
2. In `my-game/src/game/player.js` (or a new `flyer.js`), import from `../../vendor/meticulai-arcade-flight/src/...`.
   Create the state and pilot in `createGame(ctx)`; in `update(dt, mode)` call `pilot.fly(dt, controls)`.
3. Controls: either use `createInput(ctx.view.canvas)` (pointer lock and its own keys), or map the starter's
   `ctx.input` to `{ aimDx, aimDy, roll, throttleUp, throttleDown, boost, dodge }` yourself. Mouse deltas become
   radians at `0.0022` per pixel.
4. Camera: replace `src/game/camera.js`'s follow with `createChaseCamera(camera, ...)`, updated in `render(alpha)`
   or right after the step. Set `camera.near = 1` and `far` to several kilometres; the scale is metres and the
   flyer does 60-190 m/s, so the world must be big (the game's arena is a 1.65 km disc).
5. Tuning: put the numbers you want live in `src/tuning.json` (for example `flight.thrust`, `flight.topSpeed`) and
   pass a copy of `FLIGHT` with them to `stepFlight` (5th argument) or `createPilot(fs, { cfg })`. `__game.state()`
   can report `speed`, `stamina`, `p` for the bot and recorder.
6. `resolve: { dedupe: ['three'] }` in `my-game/vite.config.js`.

## The numbers and what they feel like

| Number | Value | Feel |
|---|---|---|
| `thrust` | 30 m/s^2 | full flap; with `topSpeed` 96 it settles about 96 m/s level (345 km/h) |
| `boost` | 36 m/s^2 | Shift: about 140 m/s after 4 s, stamina drains 0.24/s (about 4 s from full); cruise throttle settles at 82 m/s |
| `stallSpeed` | 30 m/s | lift fades from 16 to 42 m/s; under it the nose drops at up to 1.4 rad/s and you sink |
| `maxSpeed` | 190 m/s | a long dive tops out here |
| control authority | `(speed-14)/46`, 0.28..1 | slow = mushy, from 60 m/s full; pitch 1.55, roll 3.6, yaw 0.7 rad/s |
| wing inertia | 11/s (30 in a roll) | the angular rates ease in: snappy but not twitchy |
| banked turn | `sin(bank) * 0.55` | a rolled flyer curves round world up: you turn by banking, like a plane |
| slip | 4.5/s | velocity follows the nose quickly: drifts a little in hard turns |
| barrel roll | 0.75 s, cooldown 2.6 s, 22% stamina | one full turn with a 32 m/s sideways hop; dodges missiles in the game |
| ceiling | 1700 m | above it thrust fades over 400 m and you sink: a soft roof |
| pilot `sharp` | 1.15 | how eagerly the flyer chases the mouse |
| throttle spool | 5/s up, 7/s down | W/S feel like wings working, not a switch |
| camera boom | (20.5 + speed x 0.055 + boost x 3.4 ...) x 1.4 m | the faster, the further back; FOV 65 + up to 7 with speed + 6 boost |

## What made it good in Dragon Aces

- The owner played the live game and said "the way you control and move, and the speed is right"; the standing rule
  since then is not to change the player's flight feel, speed or controls. The UI was rebuilt twice around it; the
  flight model was never touched.
- Mouse aim means nobody has to learn to fly. You point where you want to go and the autopilot does the banking, so
  a first-time player is in a dogfight in seconds, and an expert still gets energy, stall and rolls to play with.
- Banked turns plus energy (dive for speed, climbs cost it) give the flight weight without a real aerodynamic model.
- The camera looks along the aim, not the nose, so the flyer swings across the frame as it turns: you see the turn
  happen. Loose sideways springs, a third of the bank in the view and a FOV that overshoots on boost sell the speed.
- Bots and players share `steerToward`, so the bots fly believably and the server can run the same file.

## Gotchas

- Do not "clean up" `flight.js`: the test `matches the game's flight model` pins its output to the live game's.
  Change feel through `FLIGHT` / presets in your own copy, after playing.
- Frame-rate: the game steps it once per rendered frame (dt clamped to 0.05) and at 30 Hz on the server; both feel
  the same. A fixed 60 Hz step (the starter) is fine.
- `steerToward` writes `input.pitch/roll/yaw`. If you also want direct A/D roll, set `input.roll` after it (pilot.js
  does).
- `stepFlight` has no collisions and no ground. Clamp or crash yourself.
- Quaternions are arrays: `mesh.quaternion.set(...fs.q)`.
- Thin air above 1700 m: lower `FLIGHT.ceiling` for a low world or the flyer can climb forever below it.

## Restyle it

- A plane: keep everything, hide the flap animation, maybe lower `boost`. A bird or a dragon: flap the wings with
  `fs.throttle` and `fs.boosting` as the demo does. Heavier: preset `heavy` or lower `turn`.
- Camera: `boom` scales the distances for a bigger or smaller flyer. Remove the `floorAt` option over open sea.
- Not included (game-specific): the rider view, the death and kill cams, weapons, lock-on, hit-stop, rumble.
