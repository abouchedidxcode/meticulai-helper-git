# Glider flight: how to use it

The flight model of **Hezarfen** (live at meticulai.com/games/hezarfen/), a hang-glider flight over a city. A point
mass with a wing: the pilot sets the angle of attack (pitch) and bank; lift grows with airspeed squared; drag has a
parasitic and an induced part; the wing stalls when slow and nose-high (the nose drops, controls go mushy for about a
second); a g limit caps pull-ups. The air moves: a breeze with gusts, thermals that lean with the wind and breathe,
ridge lift on windward slopes, gentle sink over water, faint lift over warm ground. Within a few metres of a surface
induced drag halves (ground effect) and a hands-off wing holds its height until the speed is spent, so skimming is
the efficient line. A flare past the stall is the landing. An autopilot flies scripted routes with the player's own
inputs and runs in plain Node, so you can prove a route is flyable and tune numbers without a browser.

Also here: **kite mode** (`src/kite.js`), the arcade glide model of **Kite Race**: direct, forgiving, never stalls.
Use it instead of the glider when the game is about racing lines, not about finding lift.

Renderer: none (three.js is used only for `Vector3`). npm deps: `three`.

## Files

| File | What |
|---|---|
| `src/glider.js` | `createGlider(world, tune?)`, `createAir(world, tune?)`, `TUNE` |
| `src/autopilot.js` | `createAutopilot({ glider, world })` with route plans; `touchdown()` (landed / crashed / splash) |
| `src/input.js` | `createInput(canvas)`: keyboard, pointer-lock mouse stick, gamepad -> `{ pitch, roll, flare, jump, ... }` |
| `src/kite.js` | `KiteGlider`, `KITE` numbers, `softLimit` (Kite Race) |
| `src/sample-world.js` | an example world (hill, ridge, lake, field, four thermals) and `SAMPLE_ROUTE` |
| `src/util.js` | clamp, damp, smoothstep, value noise |
| `tools/sim.mjs` | `node tools/sim.mjs [--set assistDrag=1] [--plan route|handsoff|direct]`: the whole flight in Node |
| `demo/` | the sample world drawn with thermal columns, a code-built hang glider and kite, chase camera, HUD |

## API

```js
import * as THREE from 'three';
import { createGlider, TUNE } from '.../src/glider.js';
import { createInput } from '.../src/input.js';
import { touchdown } from '.../src/autopilot.js';

const world = {
  heightAt: (x, z) => myGround(x, z),          // metres; below 0 is under water (seaLevel 0)
  wind: { x: -2.2, z: 0.4 },                    // m/s, the breeze (drives ridge lift and the thermals' lean)
  thermals: [{ id: 'a', x: 300, z: -100, r: 85, strength: 10.5, top: 212 }], // low: true = works from 4 m up
  warmthAt: (x, z) => 0.5,                      // optional 0..1: faint lift over warm ground (0.55 m/s at 1)
};
const glider = createGlider(world);            // shares the live TUNE; pass { ...TUNE } for a private copy
glider.reset(new THREE.Vector3(0, 160, 0), 90, 15.5, 2.4); // heading deg (0 = -Z, 90 = +X), speed, climb
const input = createInput(renderer.domElement);

// fixed 120 Hz steps, as the game:
glider.step(1 / 120, input.update(dt));
const result = touchdown(glider, world);       // null while flying
mesh.position.copy(glider.pos);                // body axes: glider.nose (forward), glider.wingRight
```

- Read-outs: `speed` (airspeed), `vspeed`, `groundSpeed`, `bank`, `alpha` (deg), `gLoad`, `stall` (0..1),
  `stallBreak` (s left), `buffet` (0..1, shake the camera with it), `groundEffect` (0..1), `info.thermal`
  (the thermal you are in), `info.lift`, `info.agl`, `stallSpeed`, `glideAngle()`, `heading()`, `agl()`.
- Air anywhere (for markers, sound, a vario tone): `glider.airAt(x, y, z, time, outVector3, info)`.
- Autopilot: `const ap = createAutopilot({ glider, world }); ap.start(plan);` then each frame
  `glider.step(dt, ap.update(dt))`. Steps: `dive`, `goto` (with `alt`, `slope`, `skim`), `climb` (a thermal by id),
  `land` (onto `world.landing = { x, z, ground }`), `idle`. Use it to record play-throughs and to check that a level
  is flyable after you move a thermal.
- Kite mode: `const k = new KiteGlider(); k.place(pos, dir, 15); k.step(dt, { turn, climb }, { power, lift, draft })`.
  `k.gust()`, `k.collide(normal, depth, fresh)` (slides along walls, costs ~20% head-on), `k.snag()`.

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-glider-flight`.
2. In `my-game/src/game/player.js` (or a new `glider.js`): build your `world` object from your terrain, create the
   glider in `createGame(ctx)`, `reset()` it in `start()`.
3. In `update(dt, mode)`: the starter steps at 60 Hz; step the glider twice with `dt / 2` (the game's 120 Hz) and read
   controls from `createInput(ctx.view.canvas)` or map the starter's `ctx.input` to `{ pitch, roll, flare }`.
   End the run with `ctx.end({ won: result === 'landed', reason: ... })` when `touchdown()` returns.
4. Put the numbers you want to play with in `src/tuning.json` (for example `glider.assistDrag`,
   `glider.thermalScale`, `glider.speedScale`) and copy them onto `TUNE` each step; call `glider.retune()` after
   changing `speedScale`. Report `speed`, `vspeed`, `agl` and `info.thermal?.id` in `state()` for the bot.
5. Make a bot plan for your level with `createAutopilot` and run it in Node (copy `tools/sim.mjs`) before asking
   anyone to play: if the autopilot can't land, nobody will.

## The numbers and what they feel like

| Number | Value | Feel |
|---|---|---|
| `mass`, `area` | 95 kg, 5.6 m^2 | stall about 13.7 m/s (49 km/h); trim glide about 20 m/s |
| `alphaTrim` / `alphaMin` / `alphaMax` | 5.3 / -1.5 / 14.2 deg | hands off = best glide; full push dives; full pull is just under the stall |
| `alphaFlare` | 19 deg | Shift: past the stall on purpose, with `flareDrag` 0.16: the landing and an airbrake |
| `cd0`, `kInduced` | 0.03, 0.07 | glide about 9-11:1 at drag 1 (the game measured 11:1 over land, 9.5:1 over water) |
| `assistDrag` | 0.7 | the game's default "Drag" setting: glides further; 1 is the original harder tuning |
| `bankMax`, `rollRate` | 50 deg, 125 deg/s | a held key circles tightly without bleeding the climb away |
| `turnAssist` | 0.75 | a banked wing gets most of the extra lift it needs automatically |
| `maxG` | 3.4 | a hard pull at speed is capped: zooms, not loops |
| `pitchDamp`, `gammaTrim` | 0.3, -5.5 deg | stops the slow porpoising a fixed angle of attack would give |
| `groundEffect` | 0.5 | within ~2-9 m of a surface induced drag falls by up to half |
| thermals | 10.5 m/s core, top ~190-215 m | two turns to the top, not ten; full lift out to 0.55 r, a faint sink ring outside |
| `seaSink`, `cityLift` | 0.35, 0.55 m/s | water costs height, warm ground saves it |
| `speedScale` | 1 | every speed x k with the same glide angle (thermals scale too, so climbs keep pace) |
| controls | tap = 62% deflection, full after ~1 s held | keys feel like a hand on a bar; the mouse stick holds a bank and eases pitch back to trim |

## What made it good in Hezarfen

- The trades are real: height for speed, speed for height, bank costs lift. A point mass with a wing was chosen over
  a full rigid body because it is stable and predictable and still has those trades.
- Play critics drove the tuning. Round 1 found the flight spent two thirds of its time wings-level, high and far from
  anything: thermal tops came down to about 180-215 m and got stronger, so a crossing is tight and low. They found
  the launch under the stall (pulling back after the jump stalled you): the launch is 15.5 m/s now. Thermals were
  made flat-topped so a held key climbs. "Low and fast" became flyable and paid: the skim cushion and ground effect.
- The owner played it and asked to "not die as quick" and "retain my speed longer": the "Forgiving wings" and Drag
  setting (default 0.7) were added on top of the model without changing it. The critics argued about the route and
  the HUD, never about the flight model.
- The autopilot flies the whole four-minute route in the real scene and lands; a straight line with no lift ends in
  the water. That is how the level was proven fair before anyone played it.

## Gotchas

- `TUNE` is shared and live. Two gliders that need different numbers: `createGlider(world, { ...TUNE, ... })`.
- Step at 120 Hz. At 60 Hz it still flies, but the stall break and flare were tuned at 120.
- `heightAt` is called many times per step (ridge slope, ground effect, warmth): make it cheap (a grid lookup).
- The glider has no collisions with buildings or trees; `touchdown()` only knows the ground and water. Add your own.
- Headings: 0 = -Z (north), 90 = +X (east). `bank` + = right wing down.
- Ridge lift needs `wind` blowing up a slope: put your launch on the windward face, or it starts in sink.
- Kite mode ignores the stall, mass and drag entirely; feed it thermal lift as `env.lift` (the demo uses the glider's
  `airAt`).

## Restyle it

- Paraglider: lower `area`/raise `mass` slightly for a slower stall, lower `bankMax`. Bird or wingsuit: raise `cd0`,
  lower `kInduced` and `alphaFlare`, and use the flare as a flap. Paper plane: kite mode.
- Arcade but still about lift: `assistDrag` 0.5, `thermalScale` 1.3, `stalls: false`.
- Not included (game-specific): the cloth wing simulation, buildings and their colliders, "Forgiving wings" bounces,
  the reach estimate on the HUD, the camera rig, the sunlit air motes.
