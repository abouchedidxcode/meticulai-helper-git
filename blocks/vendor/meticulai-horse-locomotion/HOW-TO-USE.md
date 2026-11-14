# Horse locomotion: how to use it

One movement law for every horse (the player's too), plus the tool that proves nothing slides. Pure JavaScript, no
three.js needed for the law or the checker. From TUMEN, an unreleased mounted-archery battle game by Meticulai.

What the law guarantees, by construction:

- A horse moves **only along its own facing**: no strafing, no backing up, no teleporting.
- Speed changes at **bounded acceleration** (3.2 m/s² from a stand, 1.1 near top speed) and **braking** (4.2 m/s²).
- It **turns only while moving**: yaw rate = path curvature x speed, and the curvature is limited by speed (2.6 m
  tightest circle at a walk, sideways grip of 4 m/s² at a gallop, so a gallop needs an arc tens of metres wide). A
  standing horse cannot rotate; asked to, it walks round a small circle.
- The **stride phase advances with distance travelled** (phase += distance / stride), so a hoof that moves straight
  back at ground speed in its clip never slides.
- The **body is laid along the trail its forehand rode**, so planted hooves stay planted in turns too (under 2 mm in
  violent zig-zags in the game), and the horse **leans** into turns.

## Files

| File | What it is |
|---|---|
| `src/locomotion.js` | The law: `stepHorse`, `LIMITS`, `HERO` (the player's horse), `CHARGER` (a war horse in a charge), gait table, `bendPoint`, `leanFor` |
| `src/herd.js` | A herd in one struct of arrays: the law + each horse's trail + body + lean. `createHerd`, `reins` (player keys), `seek` |
| `src/footfall.js` | The stand-in horse's footfall table: where each hoof is at each phase of each gait (use it to draw legs or as a reference) |
| `src/checker.js` | `createMoveChecker(herd)`: judges every horse every step; `formatReport` |
| `tools/movecheck.mjs` | The proof as a command: `node tools/movecheck.mjs` (five scenarios) and `--sabotage all` |
| `demo/` | Ride a code-built horse among a small herd; hoofprints show the hooves stay put |

## API

```js
import { createHerd, reins, HERO } from '../../vendor/meticulai-horse-locomotion/src/herd.js';

const herd = createHerd({ capacity: 500 });         // options: gaits (makeGaits(meta)), lead (m, default 0.965)
const me = herd.add({ x: 0, z: 0, yaw: 0, limits: HERO });   // the player's horse: harder limits
const other = herd.add({ x: 5, z: 3, yaw: 1.2 });           // every other horse: LIMITS
const S = herd.S;                                   // struct of arrays, read it directly

// every fixed step (dt in seconds), for every horse:
herd.step(i, wantYaw, wantSpeed, dt);               // wantYaw radians, wantSpeed m/s: a wish, the law decides

// draw the horse at its MID-BODY point:
mesh.position.set(S.mx[i], groundY, S.mz[i]); mesh.rotation.y = S.myaw[i];
// S.gait[i] 0 idle / 1 walk / 2 trot / 3 canter / 4 gallop, S.phase[i] (cycles; fractional part = clip time / duration)
// S.gaitPrev[i], S.phasePrev[i], S.blend[i] (0..1): cross-fade from the old gait's clip for 0.32 s
// S.roll[i] lean (rad, + = left), S.speed[i] m/s, S.yawRate[i], S.curve[i] (1/m, + = left)
// S.b1..b4[i]: the body's bend along its trail (feed these to a bending vertex shader, or use herd.worldPoint)
herd.worldPoint(i, mx, my, mz, out);                // a model-space point (+Z fwd, +X left) -> world, bent and leaned
```

Steering helpers:

- `reins(yaw, turn, level, burst, herd.gaits, out)`: the game's player controls. `turn` -1..1 (+1 = right),
  `level` 0 halt, 1 walk (1.6 m/s), 2 canter (6.5), 3 gallop (12.1), `burst` = flat out (13.3). Returns
  `{ yaw, speed }` to pass to `herd.step`.
- `herd.seek(i, x, z, cruise, out)`: head for a point and stop on it.
- Anything else: compute any `wantYaw` and `wantSpeed` you like. The law makes it honest.

Units: metres, seconds, radians. At yaw 0 a horse faces +Z; **+X is its left** (x += sin(yaw) x distance). In three.js
`rotation.y = yaw` turns a model that faces +Z onto the heading.

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-horse-locomotion` (copies to `my-game/vendor/meticulai-horse-locomotion/`).
2. In `my-game/src/game/player.js` (or a new `horse.js`), create the herd once in `createGame(ctx)`.
3. In `update(dt, mode)` (the starter's fixed 60 Hz step):
   ```js
   const turn = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
   if (input.pressed('up')) level = Math.min(3, level + 1);
   if (input.pressed('down')) level = Math.max(0, level - 1);
   reins(S.yaw[me], turn, level, input.held('dash'), herd.gaits, want);   // define 'dash' as ShiftLeft
   herd.step(me, want.yaw, want.speed, dt);
   ```
   The starter's `left/right/up/down` actions are already A/D/W/S and the arrows.
4. In `render(alpha)`, place the horse's mesh at `S.mx, S.mz, S.myaw` and play its clip at `S.phase`. If your clip
   has a stride length (metres per cycle), put it in the gait table with `makeGaits({ walk: { stride, speed: [a, b],
   duration } ... })` from `locomotion.js`, so the phase matches the clip.
5. Put the numbers you want to tune in `src/tuning.json` (for example `horse.steerAsk`), but leave the limits alone
   unless a player asks: they were set by playing.
6. Add a test: copy `tools/movecheck.mjs`'s idea into `my-game/tests/`. Run your own steering for a minute in node,
   call `checker.afterStep(dt, t)` after every step, and assert `checker.report().ok`.

To draw thousands of these with real animated legs, use the block `meticulai-crowd-renderer`: its vertex shader bends
the body with the same `b1..b4` and keeps the rider on the saddle.

## The numbers that matter

| Number | Value | What it feels like |
|---|---|---|
| `R_MIN` | 2.6 m (player 1.9) | Tightest circle at a walk. Smaller feels like a sprite turning, bigger feels like a bus |
| `A_LAT` | 4.0 m/s² (player 7.6) | Grip in a turn at speed. The player's horse comes about at a gallop in about 5 s on a 19 m circle |
| `BEND_RATE` | 0.15 /m (player 0.6) | How fast a turn tightens per metre travelled: a couple of strides to bend in. Raise for snappier steering |
| `YAW_ACCEL` | 2.2 rad/s² (player 5.0) | Caps the same thing at speed |
| `ACCEL_LOW / HIGH` | 3.2 / 1.1 m/s² (player 4.6 / 2.0) | Push from a stand / near top speed |
| `BRAKE` | 4.2 m/s² (player 5.6) | Pull-up. A gallop needs about 17 m to stop |
| `V_MAX` | 13.5 m/s | Flat-out gallop (about 49 km/h, a small steppe horse) |
| `LEAN_MAX` | 0.38 rad | About 22 degrees of lean at full grip |
| Gaits | walk 1.7 m stride at 1 Hz, trot 2.4 at 1.5 Hz, canter 3.4 at 1.9 Hz, gallop 5.2 at 2.3 Hz | Stride x cadence = speed; the clips must match |

## What made it good in TUMEN

- The design rule was "honest movement: every horse moves only the way it faces; hooves never slide; nothing
  teleports", and it was **checked by a tool on recorded runs, not by eye**. The first proof run failed, and was
  right: hooves slid up to 24 cm at a walk. Bending the body along the trail the forehand rode is what brought that
  under 2 mm. In the game, runs of 1,700 horses for 60 s per scene passed every check; eight kinds of deliberate
  sabotage were each caught on the first step.
- After the owner's first play the complaint was "hard to tell if you're actually moving your horse". The fix was
  not to break the law but to give the player's horse its own declared limits (`HERO`): it grips, bends in, jumps
  off and pulls up harder, while still never sliding or pivoting. Every key press is felt.
- One law moved everything: the player's horse, 6,000 riders, loose horses, and also the herds and birds of the
  scenery. One file of numbers, one checker.

## Gotchas

- **The law does not keep horses apart.** Your steering must (slow behind a horse ahead, bear away). The checker's
  `overlap` check tells you when it failed. The demo's `giveWay()` is a minimal example.
- **Draw at `mx, mz, myaw`, not `x, z, yaw`.** `x, z` is the forehand (the point the law drives), about a metre ahead.
- **Teleporting on purpose** (respawn, reset): add a fresh horse, or call `checker.forget(i)` after moving it.
- A clip whose stride does not match the gait table slides however good the law is. Measure your clip: walk the hoof
  bone through one cycle and see how far it travels while planted.
- During a gait cross-fade (0.32 s) the hooves are not judged; keep the blend short.
- Fixed steps: the law is made for a fixed `dt` (1/60). With a variable frame time, step it in fixed slices.
- Turning radius grows with speed squared: a galloping horse cannot dodge sideways. If your game needs dodges, slow
  the horse first (BEST_TURN_SPEED, about 3.2 m/s, is where it turns fastest) or use the HERO limits.

## Restyle it

- Another animal: change `DEFAULT_GAITS` (stride, speed range, cycle time) and `LIMITS` for its size. A camel: longer
  stride, softer grip; a deer: higher `A_LAT`, faster bend. Keep the structure.
- A wheeled cart works too: one gait, `R_MIN` = its turning circle, no bend (pass `lead` = 0.6 and draw rigid).
- The demo horse is spheres and cylinders; swap in a rigged model and drive its clip with `S.gait` and `S.phase`.

## Run the demo and the proof

```
cd blocks/vendor/meticulai-horse-locomotion && npm install
npm run dev          # http://127.0.0.1:5461  (A/D turn, W/S pace, Shift flat out; hands off = autopilot)
npm test             # 22 tests
node tools/movecheck.mjs                 # five scenarios, 40 horses x 60 s, prints a table per scenario
node tools/movecheck.mjs --sabotage all  # proves the checker catches a broken law
```

## Credit

From TUMEN by Meticulai (meticulai.com). MIT: keep `LICENSE`.
