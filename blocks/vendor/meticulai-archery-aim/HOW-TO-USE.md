# Archery aim: how to use it

Bow-and-arrow shooting that feels fair from a moving horse, cart or boat. Hold to draw, let go to loose, and **the
arrow goes where the crosshair was**: at the loose the code takes the point under the crosshair and solves the launch
to arrive there, through gravity and drag, counting the shooter's own speed and the target's. Near an enemy the shot
locks on and the arrow is steered a little in flight. Arrows test their whole path against moving targets (nothing
passes through a charging rider), stick in what they hit and ride it as it falls. Thousands of volley arrows fly on
the GPU with the same maths. Every real arrow leaves a short bright streak.

Renderer: **WebGL2** (`arrows.js` uses `ShaderMaterial` and `onBeforeCompile`). Everything else is plain JS with no
three.js and runs in Node. npm deps: `three` only (0.187).

## What to copy

| File | What | three.js? |
|---|---|---|
| `src/ballistics.js` | `at()` (position at time t, closed form), `solve()` (the launch that meets a moving point), `flightTime()`, `speedForArc()` | no |
| `src/aim.js` | `createAim()`: what is under the crosshair, the lock, the help beside a target, the steady "mark" a HUD can show | no |
| `src/bow.js` | `createBow()`: hold / draw / snap shot / reload / quiver; `aimShot()`: the loose (pick + solve + guide) | no |
| `src/flight.js` | `createFlight()`: one arrow's flight, swept hit tests, in-flight guidance, near-pass rule, glancing | no |
| `src/targets.js` | `createTargets()` (the list), `bodiesTarget()` (many moving bodies as one target) | no |
| `src/shapes.js` | `segmentSphere`, `segmentCapsule`, `segmentBox` for your targets' `test()` | no |
| `src/arrows.js` | `createArrows()`: drawing, streaks, strike bursts, stuck arrows, GPU volleys and their shadows | yes |
| `src/index.js` / `src/pure.js` | everything / only the parts with no three.js | |
| `tools/bot.mjs` | a headless bot that shoots through the real code and prints hit rates by distance | no |
| `demo/` | the demo page (stand-in riders, boards, dummy, HUD) | yes |

## API in one screen

```js
import { createTargets, bodiesTarget, segmentBox, createAim, createBow, aimShot, createArrows } from '.../meticulai-archery-aim/src/index.js';

const targets = createTargets();
// many moving bodies (riders, animals, soldiers): you keep each body's centre/vel/capsule current every step
targets.add(bodiesTarget({ id: 'riders', bodies: () => myRiders.map((r) => r.body) }));
//   body = { key, alive, center:{x,y,z} (chest: the aim point), vel:{x,y,z}, radius, capsule?:{a,b,r},
//            attach?: Object3D (arrows ride it), extra?: [{ capsule|center+radius, kind:'horse', seekBody:true }] }
// anything else: your own test(p0, p1) on the segment the arrow flew this step
targets.add({ id: 'door', center: doorPos, radius: 2, test: (p0, p1) => { const h = segmentBox(p0, p1, doorPos, 1, 1.5, 0.05, doorYaw); return h && { ...h, kind: 'wood', attach: doorMesh }; } });
// a moving thing: give it a live `vel` and test against where it is NOW (the swept test does the rest)

const aim = createAim({ targets, heightAt, now: () => time, carrierVel: () => horse.vel });
const bow = createBow();
const arrows = createArrows({ scene, camera, renderer, targets, heightAt, emit: (name, d) => events.emit(name, d),
                              listener: () => camera.position });

// every fixed step
const shot = bow.update(dt, mouseLeftHeld);              // bow.state: phase, draw 0..1, ready, quiver
if (tick % 6 === 0) aim.track(eye, aimDir, time);        // the steady mark, 10 times a second
if (shot) {
  const s = aimShot({ aim, eye, aimDir, from: bowHand, carry: horse.vel, speed: shot.speed, options: bow.options });
  arrows.spawn({ pos: bowHand, vel: s.vel, byPlayer: true, perfect: shot.perfect, power: shot.power, guide: s.guide, time });
}
scene.updateMatrixWorld();                               // stuck arrows read their target's matrixWorld
arrows.update(dt, time);
// every frame, for the HUD: const m = aim.follow(eye) -> m.point (draw a ring there), m.dist (the range)
```

- `eye` and `aimDir`: the camera position and the unit ray through the crosshair (screen centre). They can be
  THREE.Vector3s; results come back as `Vec3` (same field and method names; `threeVec.copy(v)` takes one).
- `arrows.volley({ x, z, width, depth, yaw, tx, tz, tr, count: 1500, arc: 40 })` looses a whole volley from a box
  of shooters onto a disc; `arc` 35-42 gives the "sheet, hang, rain" look (about 5 s for 180 m).
- Events (through `emit`): `arrow:hit` `{ kind, pos, speed, dist, byPlayer, key, targetId, ... }` and `arrow:near`
  `{ pos }` (an arrow passing within ~4 m of `listener`: play a whizz).
- `arrows.anchor()` makes something to ride that is not an Object3D (a bone of an instanced crowd): write its matrix
  every frame; `userData.gone = true` makes its arrows shrink away.

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-archery-aim`. three is already in the starter.
2. In `my-game/src/game/game.js` import from `'../../vendor/meticulai-archery-aim/src/index.js'`. In `createGame(ctx)`
   build `targets`, `aim`, `bow`, and `createArrows({ scene, camera, renderer: ctx.view.renderer, targets, heightAt,
   emit: (n, d) => ctx.events.emit(n, d), listener: () => camera.position })`.
3. In `update(dt, mode)`: `bow.update(dt, ctx.input.held('action'))` (the starter's `action` is the left mouse
   button), the track/loose lines above, then `arrows.update(dt, time)` with your own game clock.
4. Mouse look: the starter gives `ctx.input.mouse.dx/dy`; lock the pointer on click (see `demo/main.js`).
5. Numbers on the dev panel: copy the ones you want into `src/tuning.json` (for example
   `"archery": { "drawTime": { "value": 0.4, "min": 0.15, "max": 1.4, "step": 0.01, "label": "Draw time (s)" } }`)
   and write them into the live option objects each step: `bow.options.drawTime = tune.archery.drawTime`
   (`aim.options`, `bow.options` and `arrows.options` are read every call).
6. `window.__game.state()`: add `{ quiver: bow.state.quiver, mark: aim.mark?.thing, arrows: arrows.state() }`.

## The numbers that matter (kept exactly as tuned in TUMEN)

| Option | Value | What it feels like |
|---|---|---|
| `bow.drawTime` | 0.4 s | Full draw. Quick enough to shoot at a gallop without thinking about it |
| `bow.drawEase` | 2.1 | The pull starts fast and slows for the last inch |
| `bow.speedFull` / `speedMin` | 120 / 30 m/s | Arrows are fast and reach far: 300 m in about 2.9 s, nearly flat |
| `bow.minDraw` | 0.45 | A tap is a weak snap shot about 0.15 s later |
| reload (`followT+reachT+pullT+nockT`) | 0.5 s | From the loose to ready again; a press during it is kept |
| `aim.assistDeg` + `assistBody` | 1.1 deg + 0.4 m | The help beside an enemy. Bigger feels like auto-aim; 0 means only "crosshair on him" locks |
| `bow.guideTurn` | 30 deg/s | How hard a locked arrow may turn in flight. Enough to forgive a rider who checks his horse, not enough to bend round corners |
| `bow.assistNear` + `assistNearPer100` | 0.4 m + 0.3 m per 100 m | A locked arrow passing this close counts as a hit |
| `aim.aimFar` | 300 m | Where a shot at nothing goes; also how far the help reaches |
| `aim.seekBodyFrom` | 35 m | Past this a shot that would only find a shield goes for the body |
| `aim.lockHold` / `lockMargin` / `lockSweep` | 0.15 s / 0.3 / 2.5 deg/s | Keep the mark from flickering between two riders side by side |
| `ballistics.DRAG` | 0.05 /s | A 60 m/s arrow loses about 3 m/s each second |
| `arrows.streakFade` / `streakPx` | 0.32 s / 3.6 px | The streak: a line from bow to mark for an instant |

`PLAYED_SETTINGS` holds the last settings the game was played with by its maker: a heavy 1.2 s draw, 129 m/s, and
no help beside the target (a crosshair ON a rider still locks). Use them for a harder, slower bow:
`createBow({ ...PLAYED_SETTINGS.bow })`, `createAim({ ..., options: { ...PLAYED_SETTINGS.aim } })`. The demo switches
with keys 1 and 2.

## What made it good in TUMEN

- After the first play the verdict was blunt: the shooting was "too hard", the aim "jittery", and "if I was aiming at
  that spot when I let go, the arrow should go there." Leading targets and holding over for drop were removed. Full
  draw is a perfect shot, the arrow is solved onto the point under the crosshair, and fast arrows (120 m/s) make the
  rest feel immediate. A critic asked to judge those two lines answered "Yes".
- The help is generous but honest: a lock only happens within about a degree, and a HUD ring shows who the shot is
  locked to before the loose, so what is shown is what happens. The game's own bot (a "person" with about 0.3
  degrees of aiming error) hit about 9 riders in 10 galloping across at 30 to 150 m, and in the full battle the
  computer players hit 91 to 93 shots in 100. A later play asked for the aim to be "just a bit harder", which was a
  dial change (help 1.5 to 1.1 degrees), not a rewrite.
- The swept test against moving targets fixed a real bug: without it about one arrow in eight passed straight through
  a charging rider.
- A critic's summary of the whole game: "A reward he can see? Yes per arrow: a bright trail, a flash, the man falls.
  This is the strongest thing in the game." The streak, the strike burst and the arrows left standing in a fallen
  body are that reward; keep them.

## Gotchas

- Call `scene.updateMatrixWorld()` (or keep your attach objects' matrices current) before `arrows.update`, or stuck
  arrows lag a frame behind the body they are in.
- Move targets BEFORE stepping arrows, and keep `vel` (or each body's `vel`) true: the swept test assumes the target
  moved by `vel * dt` this step.
- `solve()` with `high: true` (a lob) returns 0 when the lob would stay up more than 14 s (fast bows): use the flat
  solution for anything over ~70 m/s.
- `groundAlong` assumes gentle land (a ray climbing steeper than 0.22 never meets it). Raise that in `aim.js` for
  cliffs.
- `bodiesTarget` is the generic stand-in for the source game's army: its lock aims at the body's `center` plus the
  spot the crosshair was on. The source also tested the line of sight to pick helm or body past a shield; that part
  was game-specific and is not here.
- Volley arrows land on `heightAt` but are not tested against targets (by design: thousands of them). Volley
  arrows that will land within 30 m of `listener` become real arrows.
- The volley shadows need your ground in GLSL (`light.groundGLSL`, the body of `float ground(vec2 p)`). Default is
  flat at 0; turn them off with `arrows.options.shadow = 0`.
- Perspective cameras only (streak width and shaft thickness read `camera.fov`).

## Restyle it

- Arrow colours: `arrowGeometry({ colors: { shaft, nock, head, vanes, vaneTip } })` (RGB 0..1 arrays) and pass your
  own geometry by editing the one line in `createArrows`. Arrow size: `ARROW` in `arrows.js`.
- Streak colour and glow: `updateStreaks()` (`1.0, 0.94, 0.78` times `streakGlow`); fade and width are options.
- Strike bursts per material: the `BURST` table (sparks, ring, size, colour). Add your own kinds.
- Spears, thrown axes, cannonballs: change `ARROW`, `DRAG` and the speeds; the aim and the lock do not care.

## Run the demo alone

`npm install`, then `npm run dev` (http://127.0.0.1:5436), `npm run build` for `dist/`, `npm test` for the 28
tests, `npm run bot` (or `node tools/bot.mjs --mode careless`, `--no-help`) for the hit table. Until you click, the
computer rides and shoots. `?cine` shows a film camera beside the rider instead of the aiming view;
`?settings=played` starts with `PLAYED_SETTINGS`.
