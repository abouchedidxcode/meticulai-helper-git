# First-person starter (walk, look, use)

A game seen through the character's own eyes, on the kit's normal three.js base: mouse look, walking that starts
and stops at once, capsule collision against a level typed as a text map, a hand holding a lantern, a forgiving
"use" and a forgiving aimed throw. Use it for exploring, walking stories, light horror, puzzle rooms, collecting
and, with work, shooting.

**The demo, "Lamplighter":** a walled garden and ruin at dusk, eyes at 1.6 m. Light the seven lanterns (look at
one, hold E or the mouse button). A shade haunts each dark lantern except the first; come near and it drifts
toward you, slower than you walk. Close up it stops, swells and hisses, then lunges where you WERE: step aside.
Its touch costs one of three hearts of warmth. A lit lantern makes a circle of light shades cannot enter, and
lighting one dissolves any shade inside the new circle. Click with nothing to use = throw a spark that stuns a
shade. Each lit lantern and the deepening dusk make the rest bolder and faster. Win: all seven lit (the last one
clears the garden). Lose: no warmth left. About 1 to 2 minutes.

## File map (`src/game/`)

| File | What it is |
| --- | --- |
| `level.js` | **The place as a text map** (`MAP`, `LEGEND`, `SOLIDS`). Builds the meshes AND the collision from the same data. Also `findPath`, `clearLine`, `floorAt`. Start here. |
| `game.js` | The rules and flow: the `usables` list, lighting, getting hurt, win/lose, skip moments, `state()`. |
| `player.js` | The body and eyes: look, walk, sprint, jump, step-up smoothing, head bob, footsteps, landing dip, FOV kick. **The feel.** |
| `collide.js` | Upright capsule vs boxes and cylinders: wall sliding, step-up, sub-steps; `segmentBlocked` for line of sight. |
| `interact.js` | `pickInCone()`: "what am I looking at", the forgiving cone behind both use and aim assist. |
| `hands.js` | The hand and lantern at the bottom of the view: sway, bob, landing dip, use thrust, throw flick; its flame is the health meter. |
| `lanterns.js` | The usable lanterns: look, light-up, safe circles (`safeAt`), the beams that show dark ones from afar. |
| `shades.js` | The enemies and their readable phases; the whisper and heartbeat that grow with nearness. |
| `spark.js` | The aimed action: a projectile with cooldown and aim assist. The seed of a shooter. |
| `hud.js` | Crosshair (dot / use ring that fills / danger lock), the "E" prompt, threat glows on the screen edge, the cold rim. |
| `scenery.js` | Sky and light from the palette, the dusk, swaying grass (shader), far trees and hills, fireflies. No rules. |
| `bot.js` | The `?bot=1` player (through `input.virtual`, including `input.virtual.look`). |

## Already tuned, and why (don't un-tune by accident)

Everything is in `src/tuning.json` (live in the dev panel, backquote key), groups `look`, `move`, `comfort`, `use`,
`spark`, `shades`, `lanterns`, `world`, `feel`.

1. **Raw mouse look** (`look.sensitivity`, `look.invertY`, `look.pitchLimit`; `player.js` "Look"). The view turns by
   exactly mouse pixels x sensitivity: no smoothing, no acceleration, no `dt`. Any smoothing feels like lag and
   makes some people sick. Pitch stops at 85 degrees so the view can never flip. `info.pointerLock: true` makes
   main.js capture the mouse; the gamepad's right stick arrives through the same `input.look()`, and so does the
   bot (`input.virtual.look(dx, dy)`), so never read the mouse directly.
2. **Movement that obeys** (`move.walkSpeed/sprintSpeed/groundAccel/stopAccel/airControl`). Velocity is steered to
   the wished velocity with a big grip (full speed in under 0.1 s, stop faster), so you stop where you meant to. The
   stick is clamped to length 1: strafing is full speed and diagonals are not faster. Sprint (Shift) only while
   moving forward, with a small FOV kick (`look.sprintFovKick`) that sells speed for free. Air keeps a third of the
   grip: a jump can be steered a little.
3. **Jump** (`move.jumpSpeed/gravity/fallGravity/coyoteTime/jumpBuffer`). About 1 m high (the 0.8 m low walls can
   be hopped). Coyote time and a buffer forgive presses a few frames late or early; heavier falling lands crisply.
4. **Collision** (`collide.js`, `move.stepHeight`). Upright capsule against boxes and cylinders, sideways first
   then vertical. Only the speed INTO a wall is removed, so you slide along walls and round corners without
   sticking. Anything lower than 0.35 m is a step and is walked up; the eyes catch up smoothly (`stepLag`) instead
   of popping. Moves are cut into sub-steps of half a radius, and the floor at y = 0 always exists: nothing passes
   through walls or falls out of the world at any frame rate.
5. **Head bob and footsteps by distance** (`comfort.bobHeight/bobSway/strideLength/landDip`). The bob's low point
   IS the footfall, and both follow metres walked, never time, so they cannot drift against the ground. Stone path
   and grass sound different (`floorAt`). Landing dips the view on a spring, scaled by fall speed. Every one of these
   is 0 = off: offer that to anyone who feels queasy.
6. **Forgiving use** (`use.range/coneDegrees/holdTime`; `interact.js`, `game.js`). A cone, not a ray: of the usable
   things in reach and in line of sight, the one nearest the centre of the view wins, and close things count as
   bigger. The crosshair turns into a ring and a prompt appears before you press anything. Hold to use: the ring
   fills with a rising tick and drains slowly if you let go (a half-finished light is never lost at once). The
   mouse button uses too, when something is usable (one less thing to learn). The answer: a hit-stop
   (`feel.lightStopMs`), a flash, a chime that climbs the pentatonic scale lantern by lantern, the hand thrusting
   forward, the light spreading on the ground, the HUD punch. A press with nothing to use still gets a soft blip.
7. **The held lantern** (`comfort.handSway/handBob`; `hands.js`). It lags behind fast turns, swings with your steps,
   dips on landing, pushes forward while you light, flicks when you throw. Its flame shrinks with your warmth, so
   health is visible without looking at the HUD. Built at real size and shrunk to a fifth, so it never pokes
   through a wall you stand against (keep this trick for any held object).
8. **Threat readability** (`shades.hearRange/hintRange/windup/touchRadius`; `shades.js`, `hud.js`). Shades are
   in plain sight from far away (they circle their dark lantern, with danger-coloured eyes and halo), rise slowly
   at the start, and notice you with a low groan. A whisper grows with the nearest one's distance, a heartbeat starts
   when it is close. A shade out of view shows as a danger glow on the screen edge in its direction (behind you =
   bottom), and a cold rim closes in when one is very near. Before every lunge: a 0.85 s hiss and swell. They are
   always slower than walking (capped at 85% of `move.walkSpeed`), the touch radius is smaller than they look, and
   a touch gives 1.6 s of safety and pushes you apart. Nothing ever comes from behind unannounced.
9. **The aimed action** (`spark.speed/cooldown/range/assistDegrees/hitRadius`; `spark.js`). Click with nothing to use
   = throw a spark. Aim assist: a shade within 9 degrees of the crosshair gets the spark thrown straight at it, and
   the crosshair shows a dashed danger ring BEFORE you throw, so it never feels like the game plays itself. Fat hit
   radius, fast flight, two sub-steps per frame so it never skips through. See "a shooter" below.
10. **Pressure that grows** (`world.duskSeconds/duskDepth`, `shades.restless/speedPerLantern`). The light falls
    over two minutes (the same palette pulled toward its shadow, so every vibe gets its own evening), and each lit
    lantern makes the remaining shades notice you from 4 m further away and move a little faster. The first
    lantern, a few steps ahead of you, has no shade: it teaches "use" before "danger".
11. **Restraint** (`feel.hitShake`, `feel.hitStopMs`). Shake in first person is strong medicine: 0.12, on a hit only.

## Make it yours

**A new place.** Edit `MAP` in `level.js`: one character is a 2 m square, rows the same length, a wall all the way
round. `L` puts a lantern, `P` the start. New kinds of square: a line in `LEGEND` (and in `SOLIDS` for a new solid
shape with its `height`, `vary` for ruined unevenness, `walk` for steps). Off-grid colliders go in `EXTRA_SOLIDS`
(`makeBox`/`makeCyl`); give them a mesh in `scenery.js`. Bigger maps cost nothing extra in draw calls (instancing).

**A new usable thing** (lever, door, note, item to pick up). In `game.js`, push to `usables`:
`{ pos, radius, label, enabled: () => bool, use: () => { ... } }`. The cone, ring, prompt and hold all work at
once. `use.holdTime = 0` makes every use a single press; for one instant thing, give it its own `holdTime` check.
Answer every use with a sound and something you can see.

**Change the goal.** "All lanterns lit" is in `lightLantern()` (`left === 0`). Make it "find the key and reach the
gate", "collect 10 notes", "survive until dawn" (use `run.time` against `world.duskSeconds`). Always give `finish()`
a reason that says what happened and what to try.

**A walking story.** Set `feel.invincible` true (or delete `shades.js` from `game.js`), `world.duskDepth` low, make
the usables notes and objects whose `use()` shows a `ui.toast(text, ms)` or plays a sound, and end the game at a
place (check `player.pos` against a point in `playStep`). Slow `move.walkSpeed` to about 2.6 and drop sprint.

**A puzzle room.** Usables that change state (`lever.on = !lever.on`), a rule in `playStep` that checks the
combination, and a door: a solid you remove from `level.solids` (and hide its mesh) when solved. Keep the room
small (one screen of map), and teach each object once before combining.

**A shooter.** In `spark.js`: lower `spark.cooldown` to 0.15, give shades health and call `shades.stun` only at 0 (or
add a `kill`), add ammo to `throwSpark()`. For hitscan, skip the projectile: when `pickTarget()` finds a target,
`hit()` it at once and draw a short tracer. Keep the aim assist (lower `assistDegrees` to 3-5 for skill) and the lock
ring. Swap the lantern in `hands.js` `build()` for a weapon; add recoil by kicking `player.pitch` up a little and a
hand kick in `hands.throwIt()`. Enemies: waves are `shades.place(x, z)` on a timer (counted in `dt`); they pass
through walls (smoke): for solid enemies, steer them along `findPath()` from `level.js`.

**Change the camera height or body.** `BODY` in `player.js` (`eye: 1.6`, `radius`, `height`). A child is 1.1;
a crawl-space game lowers `height` too. Field of view: `look.fov`.

**Colours.** None hard-coded. World = `look.base`, lanterns and sparks = `look.accent` / `look.light`, shades =
a dark body seen through a `look.danger` halo, with danger eyes (they read as danger red in every test
palette), the hand = `look.player`. Edit `palette.json` or pick a vibe.

## Content formats

`level.js` map legend: `.` grass, `,` stone path, `#` wall (2.7 m, the outer one whole, inner ones broken),
`=` low wall (0.8 m, hop it), `b` step (0.3 m, walk up), `o` pillar, `T` tree, `L` lantern, `A` lantern on a step,
`P` start. A thing's `y` is the floor height of its square. `buildLevel` returns `things[kind]` for any `thing:`
name you add to the legend.

## Bot, skips, state

**Bot (`?bot=1`).** Walks the shortest path (`findPath`) to the nearest unlit lantern, sprints on long stretches,
looks at the lantern and holds Use; notices a close shade after about half a second, turns (at a human rate, with a
little wobble) and throws a spark; dodges sideways when one winds up; hops when stuck and now and then for nothing.
It wins in about 40 s (the final recordings, seed 2, were won with no hit taken; earlier versions took hits), so
it is better than a newcomer and recordings show less danger than real play: use the `deep-dusk` and
`shade-close` skips to see the threat. A newcomer who has to find the lanterns takes 1 to 2 minutes. Limits: it ignores the safe circles as a tactic, never
backs off to heal its nerve, and only knows "light lanterns": change `pickGoal()` if the goal changes.

**Skip moments:** `win`, `lose`, `last-lantern` (one dark lantern left, you in front of it), `deep-dusk` (full dark,
every shade awake), `shade-close` (a shade 7 m ahead), `invincible`.

**`state()`:** `score, lanterns, lanternsTotal, health, runTime, dusk (0..1), player {x, y, z, yaw, pitch, speed},
grounded, sprinting, walked (m), focus (the usable looked at), useProgress, aimLock, sparksThrown, stuns, banished,
shades [{x, z, state, dist}], nearestShade, inLight, invincible, drawCalls, triangles`.
**Events:** `jump, land, pickup` (a lantern lit), `score, hit, death, win`, plus `step` (each footstep) and `stun`.

## Controls

Mouse look (click the game to capture the mouse; Esc frees it and pauses), WASD walk, Shift sprint, Space jump,
E (hold) use, click or F throw a spark (or use, when something is usable). Gamepad: left stick walk, right stick
look, A jump, Y / B use, X throw, left-stick press sprint. (The base also binds E to `turnRight`; this game does not
read it, but a game that does must move one of them.) Touch: the base's touch stick walks,
but there is no touch look, so touch is not playable as it is.

## Known limits, good next steps

- Feel numbers come from first-person practice and were checked in recordings and tests, not by a person's hands.
  Get the user to play early; `look.sensitivity`, `move.walkSpeed` and `comfort.bobHeight` are the three to offer.
- No slopes or stairs other than steps, no ladders, no crouch, no doors. Shades pass through walls (smoke).
- Only the three nearest lit lanterns cast real light (`REAL_LIGHTS` in `lanterns.js`); the rest glow. Raise it with
  care: each real light costs every material on screen.
- Music is the base pad. Blocks that fit: `meticulai-procedural-songs` / `meticulai-adaptive-music` (music that
  tightens with the threat), a drawing style from `looks/`, and any fog or volumetric block for a heavier horror mood.
- Good first additions: a door that opens with a usable, a note to read, touch look (drag on the right half),
  a crouch (lower `BODY.eye` and `height` while a key is held, check `ceilingAt` before standing up).
