# Top-down action starter (move, aim, shoot)

A 3D arena seen from above at a tilt. You move in 8 directions, aim at the ground under the mouse (or with the right
stick), hold to fire, and dash through danger. Use it for twin-stick shooters, arena survival, dungeon crawlers, tower
defence, top-down adventures.

**The demo, "keep the garden":** a small robot hoses down thorn creatures. Three waves (creepers, then rams, then
spitters), then Old Bramble, a large creature with four readable attacks. Three hearts. Beaten creatures leave a
flower and drop gems (score). You win by beating Old Bramble (about 2 minutes) and lose when the hearts run out; the
end card names what got you and what to try.

## File map (`src/game/`)

| File | What it holds |
| --- | --- |
| `game.js` | The rules and the flow: hearts, score, what a hit does, wave announcements, win/lose, end card, skip moments, `state()`. Start here. |
| `arena.js` | **The map as text** (`MAP`), walls and cover built from it, all collision (`pushOut`, `blocksShot`, `lineClear`, `isFree`), the path-finding grid, and the scenery. |
| `waves.js` | **The wave table** (`WAVES`) and the director that reads it and picks spawn spots. |
| `enemies.js` | **The enemy kinds as data** (`KINDS`), their shapes, the four-phase attack (seek, windup, strike, recover), spawn markers, separation. |
| `boss.js` | Old Bramble: its numbers and attack order (`BOSS`), and its four attacks. |
| `player.js` | Movement, the three aim modes, firing (convergence + magnetism), dash and afterimages, the robot's shape. |
| `shots.js` | Player shots (swept, forgiving hit radius) and enemy seeds (slow, small hurt radius). |
| `pickups.js` | Gems and hearts: drop, magnet, collect. |
| `camera.js` | The tilted follow camera: look-ahead, crowd zoom, leash, and "ground point under the mouse". |
| `fx.js` | Ground markers (`ring`, `disc`, `lane`), particles (`burst`), flowers. |
| `bot.js` | The `?bot=1` player. |
| `shapes.js` | Helpers: `mergeParts` (one coloured mesh from simple shapes), `instanced`, `apart` (keeps a colour readable on any ground). |

`src/tuning.json` holds every feel number, each with a label and a plain-words help line (backquote key in the game).

## Already tuned, and why (don't un-tune by accident)

1. **Movement** (`player.speed 7.5`, `accel 80`, `brake 110`). Full speed in about 6 frames, a stop in 4: "every press
   answered on the next frame". Stopping is faster than starting, so you stop where you meant to. The stick vector is
   capped at length 1, so diagonals are not faster. The body turns to the AIM, not the movement (you can back away
   while shooting).
2. **Aim** (in `player.js updateAim`). Mouse: the ground point under the cursor, recomputed every step from the camera's
   true position (a stable reference; it does not drift with camera smoothing). Stick: `input.aim()`; letting go keeps
   the last aim. Neither used yet (keyboard only, touch): it aims at the nearest enemy in sight.
3. **Forgiving shooting** (`shooting.*`). `hitRadius 0.4` is more than twice the drop you see (`size 0.18`): near misses hit.
   `assist 0.6` within `assistAngle 14` bends each shot toward the enemy nearest the aim line. Shots leave the hose (off
   to one side) but cross the aim line AT the aim point (`minConverge` stops them crossing over up close), so what you
   point at is what you hit. `flashTime`, `pitchVary` and `spread` keep a held stream alive instead of mechanical.
   Shots are fast (`speed 24`) so nobody has to lead a target.
4. **Dash** (`dash.*`). Short (`distance 4.2` in `time 0.16`), safe for `invuln 0.26` (a little longer than the dash,
   to forgive late presses), `buffer 0.15` (press early, it still happens), `cooldown 0.9` shown at your feet: the disc
   grows back and the ring pops with a tick when ready. Afterimages fade over `trail`. Dashing through seeds is allowed.
5. **Enemies: active but fair** (`enemies.*`, `KINDS`). An enemy can only hurt during its short "strike", and every
   strike is preceded by a windup with a ground marker, a swell, a brighter colour and a sound. Touching an enemy never
   hurts. Before anything appears, a ring closes on the spot for `spawnWarn 0.9` s; nothing appears within `safeSpawn`
   5 m of you or on top of you. `maxAttackers 3` enemies may wind up at once; the rest wait. `separation`/`spacing` push
   overlapping enemies apart so a crowd becomes a ring, not a blob. Rams that hit a wall are dizzy for longer (a reward
   for baiting them). `telegraph` scales every warning: the kindest single dial in the game.
6. **Hit feedback** (`feel.*`). Enemies flash, squash and are pushed (`knockback`); kills freeze the game for
   `killStopMs 30` (two frames: felt, not seen) and pop into petals and a flower. Shake is saved for big events only:
   being hurt (`hurtShake`), the boss's slams, half-health roar and death (`bigShake`). Hurt: `hurtStopMs`, a flash in
   the danger colour, a push away, `hurtInvuln 1.3` s of blinking safety, and at one heart a slow-motion beat
   (`lastHeartSlow`, `lastHeartMs`). `player.hurtRadius 0.3` is smaller than the robot looks.
7. **Camera** (`camera.*`). Tilt from `height` and `back`; narrow `fov 30` keeps the arena tidy. Soft follow
   (`follow`), a lean toward the aim point (`lookAhead` share, capped by `lookAheadMax`), a slow pull-back when a crowd
   is near (`crowdZoom`, `crowdSize`, `crowdRange`), and a `leash`: the focus is never more than 4 m from the player,
   so they cannot leave the screen.
8. **Pickups** (`pickups.*`). Within `magnetRadius` they fly to you, faster the longer they chase; when a wave is
   cleared, everything left flies in. Pickups within `streakTime` of each other ring up a pentatonic scale. Hearts
   only drop while you are hurt, and a cleared wave always gives one if you are.

## Make it yours: the five most likely changes

1. **A new arena.** Edit `MAP` in `arena.js` (legend below). Keep cover as islands (no dead-end pockets) so charges and
   path-finding stay readable. `buildArena(scene, look, map)` takes any map.
2. **New waves.** Edit `WAVES` in `waves.js`. Run length is the sum of the `at` times plus kill time; the demo is
   about 25 s per wave plus 35 s of boss.
3. **A new enemy.** Add a row to `KINDS` and a shape to `buildShapes()` in `enemies.js`. Reuse an attack style
   (`bite`, `charge`, `spit`) or add one in the three places marked `ATTACK STYLES`. Always give it a windup with a
   ground marker, and a `tip` (the end card's advice). Teach `bot.js` to avoid it.
4. **Swap the player or the weapon.** `buildBody()` in `player.js` (keep +z as forward), or load a model into `group`.
   Weapon feel is all in `tuning.json` "shooting": a shotgun is a loop of `shots.fire` with wider angles in `fire()`;
   a charge shot is a timer on `input.held('fire')`.
5. **Change the goal.** `game.js`: `finish(won, reason)` ends the run; `director.update` returns `'cleared'`, `'next'`
   and `'won'`. Survive-for-time: end on `run.time`. Collect-N: count in `collect()`. Remove the boss: delete the last
   row of `WAVES`.

Camera angle: `camera.height` / `camera.back` in tuning (back 0 = straight down, equal = 45 degrees).

## Three bigger reshapes

**A dungeon crawler with rooms.** A room is a map. Keep an array of maps plus doors: add a `D` legend character in
`buildArena` (treat it as a wall while `enemies.count > 0`, open floor after), and a list of `{ map, waves, exits }`.
On walking through a door: `scene.remove` the old arena's meshes (make `buildArena` add everything to one
`THREE.Group` and return it), build the next, `player.reset(...)` at the matching door, `rig.snap(...)`,
`director.begin(0)` with that room's wave list (`createWaves({ waves })` already takes a table). Rooms larger than the
screen work as they are: the camera follows, the path-finding grid handles any size, and spitters only fire with a
clear line inside their `range`. Add keys and locked doors as pickups (`pickups.drop('key', ...)` and a case in
`collect`). The block `realistic-procedural-dungeons` can generate layouts; convert its grid to `MAP` rows.

**A tower defence.** Enemies should walk a path instead of hunting the player: in `enemies.js` "seek", replace the
player position with the next waypoint (or call `arena.updateFlow(goal.x, goal.z)` once so the path-finding grid
leads to the goal, and they will walk around towers placed as `o`). Losing = an enemy reaches the goal
(`finish(false, ...)` or lose a heart). A tower is a small object with `pos`, `range`, `fireWait` that calls
`shots.fire(x, z, dx, dz)` at the nearest enemy; draw its range with `fx.ring`. Place towers on the ground point
under the mouse (`rig.groundPoint`), snap to the grid (`CELL`), pay with gems (`run.score`). Keep the player robot
as a roaming hero, or remove player input and fix the camera high (`camera.height 40`, `follow` irrelevant).

**A non-violent version (herding, watering, cleaning).** The systems stay; the meaning changes. The demo is already
close: water turns creatures into flowers. Watering: enemies become dry plants that do not move (`speed 0`, no
attack: skip the windup in "seek"), shots fill their `hp` up instead of down, and the pressure is a timer or a
spreading drought. Herding: give creatures `attack: 'none'`, make "seek" move AWAY from the player
(`mx = -dir.x * speed`), and win when all are inside a pen (a map region); the dash becomes a whistle that scatters
them. Cleaning: `fx.disc` patches on the ground are the "enemies"; hosing shrinks them. In each case rename hearts
(time, water, patience), keep the markers and the rising chimes, and rewrite the `tip` lines: they are the game's
teaching.

## Content formats

**Map** (`arena.js`): one character = one 2 m square (`CELL`). `#` wall (blocks everything), `o` planter (round
cover, blocks everything), `~` pond (blocks walking, shots pass over), `P` player start, `B` boss spot, lowercase
letters = spawn gates named in the wave table, `.` floor. Surround the map with `#`.

**Wave table** (`waves.js`): `{ name, groups: [{ kind, count, at, whenLeft?, where }] }`. `at` = seconds after the
wave starts; `whenLeft` = appear early if this few enemies are left; `where` = a gate letter, `'far'`, `'any'` or
`'ring'` (around the player, 7-9 m out). `{ boss: true }` brings the boss.

**Enemy kinds** (`enemies.js`): `hp, speed, radius, attack, range, windup, strike, strikeSpeed, recover, knock, gems,
score, tip` (+ `keep`, `shotSpeed` for spitters). **Boss** (`boss.js`): `hp, radius, speed, rest, pattern: [...]`
and one block of numbers per attack.

## The bot, skip moments, state

**Bot** (`?bot=1`): plays through `input.virtual` with both sticks, fire and dash. It backs away from close enemies,
steps out of marked ground, aims with lag and wobble, picks up gems, drifts to the middle near walls, and has short
lapses of attention. It usually wins in about 2 minutes, often without losing a heart: it is better than a new human
player at dodging, so judge difficulty with a person. It never uses the mouse; `scripts/mouse-play.txt` is a short
mouse-and-keyboard script for `tools/play/record.mjs --script`.

**Skip moments:** `win`, `lose`, `wave2`, `wave3`, `boss`, `last-heart`, `invincible`.

**`state()`:** `score, health, wave, waves, waveName, waveState, enemies, arriving, bossHealth, bossState, kills,
flowers, pickups, shots, seeds, runTime, player {x, z}, speed, aim {x, z, mode}, dashReady, dashing, safe, invincible`.

**Events:** standard `pickup`, `hit`, `death`, `score`, `win` (there is no jump, so `jump`/`land` never fire), plus
`shoot`, `dash`, `kill`, `wave`.

## Controls

Keyboard + mouse: WASD/arrows, mouse aim, hold left button (or J / F) to fire, Space / Shift / right button to dash.
Gamepad: left stick move, right stick aim, RT or RB fire, A / LB / LT dash. Keyboard only works (auto-aim at the
nearest enemy until the mouse moves). Touch: left half = move stick, auto-aim and auto-fire, tap the right half to
dash; this path is written but was not tested on a phone.

## Known limits and good next steps

- All sound is the base synth (no files). For recorded sounds, `audio.load`/`audio.play` (see `recipes/sound-files.md`):
  swap `audio.blip` in `player.js fire()` and the thuds in `game.js`. No music; `meticulai-adaptive-music` fits
  (a layer per wave, a boss layer).
- Hit-stop and shake were tuned from numbers and recordings, not by hand: ask the person how hits feel first.
- Enemy path-finding is a simple grid; long thin corridors make crowds queue.
- Each enemy kind is one instanced mesh (max 48 alive per kind). For hundreds, see `meticulai-crowd-renderer`/`crowds`.
- The floor picture is painted once from the palette; for another surface, replace the canvas drawing in `arena.js`.
- Looks: any look block works on top (`meticulai-riso-print`, `watercolour`, `meticulai-tilt-shift-macro` suits
  the small-garden scale). `touch-grass` could replace the tufts; `meticulai-ripple-water` the ponds.
