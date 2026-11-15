# Racing starter (drive, drift): guide for the agent

**What this is.** A third-person arcade racer: you steer a car round a closed track, drift the corners for a boost,
and race three computer rivals. The handling is about 150 lines of plain maths in `src/game/handling.js` (no physics
engine). The track is data: a list of control points in `src/game/tracks.js`.

**The demo's rules.** Lakeside Circuit, three laps (about 1.2 km a lap, about two minutes), four cars, you start last.
3, 2, 1, GO (press the accelerator just before GO for a rocket start). **Win = finish first.** With only four cars a
podium would mean "not last", which is no goal at all, and the rubber band keeps first place within reach to the end;
change it with `race.winPosition`. Finish behind first and the end card says by how much and gives one tip taken from
your run. If a rival wins, you get 25 s to reach the line (`race.finishGrace`) or the race is called.

## File map (`src/game/`)

| File | What it does |
| --- | --- |
| `game.js` | Rules and flow: grid, countdown, race, finish, HUD text, skip moments, `state()`. Read first. |
| `tracks.js` | **The tracks as data** (two of them), with their terrain and scenery rules. |
| `track.js` | Maths on a track: smooth curve, samples every 2 m, `locate(x, z)`, `at(s, lat)`, racing line, gates. No three.js. |
| `trackMesh.js` | Draws the road in one mesh (asphalt, lines, kerbs, verges, rails, start line) and the checkpoint gates. |
| `scenery.js` | The island that hugs the road, lake and sea, instanced trees/rocks/posts, clouds, islets. `heightAt(x, z)`. |
| `handling.js` | **The player's car: steering, grip, drift, boost, rails.** The feel lives here. |
| `carModel.js` | The car shape (boxes) and its weight: body roll, dive, squat, steering and spinning wheels. |
| `rivals.js` | The computer drivers (rail-riding: lap position + sideways position + speed), `speedProfile()`. |
| `race.js` | Laps, checkpoints, race order, the ghost recorder and player, time formatting. |
| `camera.js` | Chase camera: lag, wider/lower/further at speed, drift swing, look into the turn, ground clearance. |
| `effects.js` | Speed lines, tyre smoke / dust / sparks, skid marks (three draw calls). |
| `sound.js` | Engine (three hum bands cross-faded by revs, with gear changes), wind, tyre hiss, rail scrape. |
| `hud.js` | Centre banner (3 2 1 GO, FINAL LAP, WRONG WAY), speed read-out, boost meter, running order. |
| `feedback.js` | Rail and car contacts, the reset key, auto-reset (stuck, wrong way), boost feedback. |
| `endcard.js` | What the end card says (reason and tip). |
| `bot.js` | A simple driver for the player's car: `?bot=1`, and the slow-down lap after the flag. |

Words used everywhere: **s** = metres along the lap from the start line, **lat** = metres sideways from the middle
of the road (+ = driver's right), **turn** = 1 / corner radius (+ = right-hand bend). Speeds are m/s (x 3.6 = km/h).

## Already tuned, and why (don't un-tune by accident)

All numbers are in `src/tuning.json` with a label and help; the backquote key edits them live.

1. **Steering** (`car.turnLow`, `turnHigh`, `turnFullAt`, `tapSteer`, `steerTime`, `centreTime`, `stickCurve`).
   The nose answers on the same step. Less lock at speed (`turnHigh` < `turnLow`) keeps straights calm. On a keyboard a
   tap jumps straight to `tapSteer` (38%) and then ramps, so small corrections are possible with keys; releasing
   self-centres in `centreTime`. A stick goes through a gentle curve with almost no smoothing. Lesson: full lock from
   a key tap makes a car undriveable; pure ramping makes it feel late.
2. **Grip and drift** (`car.grip`, the whole `drift` group). Heading and velocity are separate; grip pulls the
   velocity round to the nose. A drift is "low grip for a while": started with Space while steering (or by lifting
   off while steering hard above `drift.liftAt`), with a small nose flick (`kick`) so it starts at once. It turns
   tighter than gripping (`turnBoost`), so drifting is the fast way through hairpins. Opposite lock or centring the
   wheel brings the grip back (the catch). The slide angle is capped (`maxSlip`), so **the car cannot spin**. Time
   spent sliding above `chargeSlip` fills the meter; when the drift ends (slide under `exitSlip`) after `chargeTime`
   you get a boost, bigger up to `chargeFull` (`boostTime`, `boostTop`, `boostKick`). Lesson: uncapped slip plus
   keyboard steering equals spin-outs and quitting.
3. **Forgiving** (`forgive` group). Rails push the car back, take at most `wallLossMax` of its speed and turn the
   nose along the road (`wallAlign`): a scrape, never a dead stop. Grass allows `offroadMargin` for free and then only
   lowers top speed (`offroadTop`). **R** resets; the game resets by itself when you are stuck (`stuckTime`) or
   driving the wrong way (`wrongWayTime`). A reset is always on the road, facing forward, rolling at `resetSpeed`,
   away from other cars. Cars bump softly (`bumpLoss`). No penalty for flooring it early on the grid.
4. **Visible speed** (`camera.speedFov`, `speedDistance`, `speedDrop`, `boostFov`, `boostDistance`; `speed` group).
   The field of view widens with the square of speed, the camera drops back and lower, pale speed lines hang beside
   the road and whip past (`linesFrom`, `linesStrength`, `linesLength`), and the road itself is striped: centre
   dashes, two-tone asphalt, kerbs, rail blocks, verge bands, roadside posts and trees. Engine pitch climbs through
   four pretend gears, wind grows with speed squared. Slides leave skid marks and smoke (`skidFrom`, `smoke`).
   Lesson: speed is read from things rushing past close to the camera, not from the number. There is no camera shake
   at speed on purpose (it reads as a rough road). If the user finds it too fast, lower `car.topSpeed` and
   `linesStrength` before touching anything else; aim for speed you can see in a calm picture.
5. **Chase camera** (`camera` group). Position lags a little (`follow`), the trailing direction lags more
   (`turnFollow`), and it trails the direction of travel rather than the nose (`driftSwing`), so a drift shows the
   car side-on. The look point sits ahead (`lookAhead`) and slides into the corner (`lookTurn`). `clearGround()` in
   `camera.js` lifts it over the land under it and halfway to the car (`minHeight`). `snap()` after every teleport.
   A rival in the line between the camera and your car turns see-through (`seeThrough`, `render()` in `game.js`):
   a car tucked in behind you would otherwise fill the screen and hide your own car.
6. **Race rules** (`race.js`, `race` group). Gates in order, then the line, or the lap does not count. Lap counter,
   position and running order, lap and best time, WRONG WAY and MISSED A GATE banners, FINAL LAP, a finish banner,
   slow motion and a slow circling camera before the card.
7. **Weight** (`weight` group). The body sits on a damped spring: it rolls out of corners (`roll`), dives under
   braking and squats under power (`pitch`), with a little overshoot (`spring`, `damping`). Front wheels steer
   (`wheelTurn`), all wheels spin with speed, and the whole car tilts with the road's slope and banking.
8. **Ghost hook** (`race.js`). `createGhostRecorder()` stores `[lapTime, x, y, z, yaw]` every 0.1 s; the best lap of
   the session is `ghost.best` and `sampleGhost(samples, t)` plays it back. `race.ghost` shows it as a pale car.

Rivals (`rivals` group): `pace` is the difficulty dial. `catchUp` / `easeOff` are the rubber band (within
`bandDistance` metres); set both to 0 for an honest race. They make a mistake every `mistakeEvery` seconds.

## Make it yours

- **A new track.** Add an object to `TRACKS` in `tracks.js` (copy "Pine Loop"). Points are `[x, z, height, width,
  bank]` in driving order; 8 to 20 points, 50-120 m apart, stretches of road at least 40 m apart, heights above 1.5,
  no crossings. Laps, number of gates, verge width, banking, hills, lakes and scenery rules are in the same object.
  Then `?track=<index>&bot=1` and watch the bot drive it; a corner tighter than about 15 m radius needs wider road.
- **A time trial.** Set `race.rivals` to 0 and `race.ghost` to true (the `time-trial` skip button does this). The
  end card already switches to "Time trial done". For medals, compare `progress.best` with target times in
  `endcard.js`. To keep the best lap between visits, store `ghost.best` and `ghost.bestTime` (see
  `recipes/save-progress.md`); they are plain arrays and numbers.
- **Swap the car for a model.** In `carModel.js`, replace `buildBody()`'s mesh: load a glTF (three's `GLTFLoader`),
  scale it to about 1.8 x 4 m, face it along +z and add it to `body`. If the model has separate wheels, put them in
  the `wheels` list (pivot = steer, wheel = spin); if not, hide the built-in ones or keep them under the body.
  Bring models in with `node tools/assets/get.mjs` so credits are written. Colour is no longer from the palette then.
- **Kart racing with pickups.** Narrow the roads (width 9-10), lower `car.topSpeed` to about 26, raise `turnLow` /
  `turnHigh`, shorten `drift.chargeTime`. Pickups: a list of `{ s, lat }` per track drawn as one InstancedMesh; each
  step test `Math.abs(track.delta(car.loc.s, p.s)) < 2 && Math.abs(car.loc.lat - p.lat) < 1.6`, emit `pickup`, then
  `car.giveBoost(1)` (a boost item) or slow a rival (`r.v *= 0.5`, `r.mistake = 1.5`). Rivals can use the same test
  with their `s` and `lat`. Boost pads are the same thing painted on the road.
- **A boat or a hover version.** Boat: lower `car.grip` to about 3 and `drift.grip` to 1.2, raise `car.coast`, set
  `hillPull` to 0; in `tracks.js` set heights to 0.3 and `verge` to 0; in `trackMesh.js` drop the asphalt strips and
  keep buoys/rails; hide the wheels and let `effects.puff('smoke', ...)` be the wake. Hover: keep the grip, hide the
  wheels, add a bob to `body.position.y` in `carModel.set()`, and double `weight.roll`.
- **Other likely changes.** Delivery driving: keep the track as the road, put stops at chosen `s` values and time
  the legs. More rivals: add to `DRIVERS` in `rivals.js` (and a colour in `game.js`). Bonnet or top-down camera: see
  the note at the top of `camera.js`. Checkpoint timer instead of rivals: add time on each `'gate'` in `game.js`.

## Content formats

```js
// tracks.js
{ name, laps, checkpoints,            // gates per lap, evenly spaced; the last is the finish line
  verge,                              // metres of grass between road edge and rail
  autoBank,                           // degrees of banking in the tightest corners
  points: [[x, z, height, width, bank], ...],
  terrain: { hills, scale, seed, shore, lakes: [{ x, z, r, depth }] },
  scenery: [{ kind: 'tree' | 'rock' | 'post', along: metres, from, to, chance }, { kind, scatter: count }] }
```
`along` rules place things every so many metres on both sides, `from`..`to` metres beyond the rail; `scatter`
sprinkles them over the island. New kinds go in `KINDS` in `scenery.js`. Drivers: `DRIVERS` in `rivals.js`
(`name, skill, line, lane`). Ghost samples: `[lapTime, x, y, z, yaw]`.

## Bot, skip moments, state

- **Bot** (`?bot=1`): drives the player's car through `input.virtual` with the real handling. It aims down the
  racing line, brakes for corners from a speed table, throws drifts into tight corners, wanders a little
  (`bot` group). It usually leads by mid-race at the default `bot.pace`; it never uses the reset key unless stuck.
  It does not model rivals (it will bump them), and it is tuned for these two tracks: check it on a new one.
- **Skip moments**: `win`, `lose`, `go` (skip the countdown), `final-lap` (everyone on the last lap, you in the
  pack), `hairpin` (just before the tightest corner at speed: the drift test), `time-trial` (toggles rivals off and
  the ghost on).
- **`state()`**: `track, phase (grid|race|done), countdown, position, cars, lap, laps, nextGate, score, raceTime,
  lastLap, bestLap, speed (km/h), s, lat, drifting, charge, boost, offroad, slipDeg, banner, drifts, boosts,
  wallHits, bumps, resets, topSpeed, wrongWay, finished, ghostSamples, ghostShown, player {x,y,z}, rivals [{name,
  lap, s, speed, finished}], order [names], gapAhead, gapBehind`.
- **Events**: `score` (each gate, lap and overtake), `hit` (`by: 'rail' | 'car'`), `win`, `death` (a lost race),
  plus `boost` and `reset`. There is no `jump`, `land` or `pickup` in this game.

## Controls

Keyboard: W/A/S/D or arrows, Space (or Shift) handbrake, R reset. Gamepad: left stick steers, RT accelerates, LT
brakes (or push the stick up/down), A or X handbrake, Y reset. Touch: the base's left-thumb stick steers and
accelerates and a right-thumb press is the handbrake; it works but is not tuned.

## Known limits and next steps

- The track must not cross itself (no bridges): `locate()` finds the nearest piece of road.
- Cars are kept between the rails; there is no open terrain driving. The land is scenery (`heightAt` is for the
  camera and for placing things).
- Rivals ride the track rather than using the handling model, so they never crash or get stuck, and they cannot be
  spun round. For rivals with real physics, give each a `createHandling()` car and a `createDriver()` from `bot.js`.
- The engine is filtered noise from the base synth, so it hums rather than roars. The kit has a recorded engine
  loop, skids and boosts (`node tools/sounds/add.mjs vehicle-engine-loop vehicle-skid vehicle-boost`, see
  `recipes/sound-files.md`): skids and boosts drop straight in with `audio.play(...)` where `effects.js` starts a
  slide and `feedback.js` fires a boost. A recorded engine needs its pitch to follow the revs, and `audio.loop()`
  only takes a rate when it starts, so for now keep the synth engine (or cross-fade two loops started at different
  rates with `set()`, in `sound.js`).
- The best lap is kept for the session only.
- Blocks that fit: `blocks/vendor/car/` is the upgrade for people who want **realistic car physics** (Rapier, tyre
  slip, suspension, gearbox, a CC0 rally car model): it replaces `handling.js` and `carModel.js`, and needs colliders
  built from the road ribbon; read its `HOW-TO-USE.md` first. Also look in `blocks/BY-NEED.md` for water, sky and
  post-processing looks.
