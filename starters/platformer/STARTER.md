# 2D platformer starter (run, jump)

A side-on platformer on the kit's normal three.js base, drawn flat with an orthographic camera. The level is
text you type; the movement is already tuned. Use it for any side-view game: classic or precision platformers,
side-scrolling adventures, room-by-room (metroidvania-style) games, auto-runners.

**The demo:** run right through four short parts (a safe jump, spikes, moving platforms, everything at once) to a
glowing door. Three hearts. Spikes, crawlers (from the side) and pits cost one and put you back at the last flag in
under half a second; a new flag gives one heart back. Land on a crawler to squash it. No hearts left = lost.
About 1 to 2 minutes; 80 coins, some only reachable with the wooden platforms or a wall-jump climb.

## File map (`src/game/`)

| File | What it is |
| --- | --- |
| `levels.js` | **The levels as text**, the legend, the tile kinds. Content only. Start here. |
| `level.js` | Reads a level's text into a grid you can ask (`solid`, `oneWay`, `hazard`) plus lists of things. |
| `game.js` | Flow and feedback: loads a level, answers every world event with sound, particles, shake, HUD, end card; skip buttons; `state()`. |
| `world.js` | The rules: coins, hearts, checkpoints, what hurts, the stomp, the goal, coming back. No drawing. |
| `player.js` | How the player moves: run, jump, wall slide/jump, drop-through. **The feel.** |
| `physics.js` | Collision: box vs tiles, one-way platforms, movers; sub-steps; corner correction; riding. |
| `movers.js` | Moving platforms (glide, ease, wait at each end). |
| `enemies.js` | The crawler (walks, pauses, turns). |
| `camera.js` | Orthographic follow camera: look-ahead, vertical dead zone, bounds. |
| `bot.js` | The `?bot=1` player. |
| `draw/paint.js` | Tiny 2D drawing kit: `Painter` (rects, circles, rounded rects into one mesh), `flat()` material, `outlineFor()`. |
| `draw/tiles.js` | Tiles as one instanced mesh, with automatic grass caps, edges, depth shading, spikes, swaying tufts. |
| `draw/backdrop.js` | Sky gradient, sun, clouds, three parallax hill layers, floating motes. |
| `draw/actors.js` | The look of the player, crawlers and movers (squash, feet, eyes). |
| `draw/things.js` | Coins, checkpoint flags, the goal door. |
| `draw/fx.js` | Dust and sparkle particles. |

`world.js`, `player.js`, `physics.js`, `movers.js`, `enemies.js`, `level.js`, `levels.js` and `bot.js` have no
three.js in them: the whole game can be simulated in plain Node (handy for testing a level or a bot change fast).

## Already tuned, and why (don't un-tune by accident)

Units are tiles and seconds. All of it is in `src/tuning.json` and live in the dev panel (backquote key).

1. **Run** (`run.speed/accel/decel/turn`, `run.airAccel/airDecel/airTurn`, in `player.js`). Six separate rates, not
   one "friction". Starting is fast, stopping faster, turning fastest: that is what "tight" means. In the air you
   steer well (`airAccel`) but keep momentum when you let go (`airDecel` is low), so a running jump carries.
2. **Jump** (`jump.*`). `height` is in tiles, so levels can be measured against it (a held jump clears about 3.2
   tiles; a tap about 0.6). `cut` = variable height. `coyote` and `buffer` forgive presses that are a few frames late or
   early; without them jumps feel "eaten". `apexSpeed/apexGravity` halve gravity near the top while jump is held (a beat
   to aim). `fallGravity` makes the way down quicker than the way up; `maxFall` keeps long drops steerable. Jumping off
   a mover keeps its speed.
3. **Corner correction** (`assist.cornerNudge`, `assist.ledgeLift`, in `physics.js`). Head clips a ceiling corner by
   under 0.3 tile: you slide round it. Feet arrive under 0.3 tile short of a ledge (or a mover): you are lifted on.
   Players never notice these; they notice when they are gone.
4. **One-way platforms and movers** (`physics.js`, `movers.js`, `mover.speed/wait`). One-ways stop you only from above;
   down + jump drops through. Movers carry you by their exact movement (no sliding) and **wait at each end**: that pause
   is when players step on. Their track is drawn as a dotted line so the path is never a surprise.
5. **Wall slide and wall jump** (`wall.*`; `wall.enabled` turns both off). On by default: it saves falls into pits and
   the two towers in part 2 use it. `lock` is the short time steering is ignored after the kick. No person has judged
   this by hand yet: if the user finds it fiddly, turn it off rather than tune it for an hour.
6. **Squash, dust, hit-stop** (`feel.*`; `player.js` spring, `draw/actors.js`, `game.js` `onWorld`). Stretch on
   take-off, squash on landing (scaled by fall speed), dust on take-off / landing / skid / wall slide, a 60 ms freeze
   on a stomp and 110 ms when hurt. Hit-stop cannot be judged from recordings: ask the user how it feels.
7. **Camera** (`camera.*`, `camera.js`). Leads in the facing direction (`lookAhead`, swinging slowly so turning
   doesn't whip). `deadZoneUp` is set just above the jump height, so hopping never moves the screen; it re-frames when
   you LAND at a new height, and follows at once when you fall out of the zone. Clamped to the level. Moves in the
   fixed step and is drawn interpolated, like the player, so it cannot jitter.
8. **Collision** (`physics.js`). Tile grid, sideways then vertical, in slices of at most a quarter tile: nothing
   tunnels at any speed or step length.
9. **Backdrop** (`draw/backdrop.js`). Sky from `look.sky`, hills tinted from sky + base colours, moving 90% / 78% /
   60% with the camera; clouds and motes drift.
10. **Readable danger, generous stomp** (`enemy.stompGrace/hurtShrink`, `rules.spikeShrink/coinReach`). `look.danger`
    is used only for spikes and crawlers. The stomp box is wider than the crawler and counts from its middle up; the
    hurt boxes are smaller than they look; coins are taken from a little way off. Crawlers pause before turning
    (`enemy.turnPause`): their tell.

Rules knobs: `rules.hearts`, `checkpointHeals`, `respawnTime` (keep under 0.6: waiting is the punishment),
`invulnTime`, `invincible`.

## Make it yours

**A new level.** In `levels.js`, type a picture and add `{ id, name, sections: [TEXT], next: null }` to `LEVELS`
(the first entry is where the game starts). Sections join left to right and line up at the bottom row, so write a
level as several short pieces. **Linking:** set `next: 'other-id'` on a level and its goal leads there (hearts, score
and time carry over; `game.js` `loadLevel`); `next: null` means the goal wins the game. The demo's second level
(`steps`) is there to copy; the "Level 2" test button plays it. Fair sizes: gaps up to 3 tiles easy, 4 hard; steps up
to 2 easy, 3 the limit; 3 flat tiles before a hazard; coins drawn along the line you want played.

**A new tile.** `levels.js`: add a kind to `TILES` (`solid`, `oneWay` or `hazard`, or a new flag) and a character to
`LEGEND`. `draw/tiles.js`: add a branch that draws it with `q(x, y, w, h, colour)`. A new flag (ice, spring, ladder)
needs its rule too: read `level.tile(cx, cy)` under the feet in `player.js` (ice: lower `decel`; spring: set
`body.vy`). **A new enemy:** `LEGEND` entry `{ thing: 'enemy', type: 'hopper' }`, its movement as a branch in
`enemies.js` `update`, its look in `draw/actors.js`. Hurt-or-stomp is decided in `world.js` for every enemy.
**A new pickup:** copy the coin (a list in `world.js`, an instanced mesh in `draw/things.js`).

**An auto-runner.** In `player.js`, replace the stick: `let mx = 1;` (always run right), keep jump. Raise
`run.speed`, set `camera.lookAhead` to about 5, turn `wall.enabled` off, and make "hurt" end the run in `world.js`
(`rules.hearts` = 1). For endless play, build levels from random sections: `sections: [A, pick(), pick()...]`.

**Room by room.** Make each room its own small level (about 24 x 14 tiles, the size of the screen) and link them with
`next`; the camera clamps to the level, so a screen-sized level never scrolls. For doors on both sides, add a
`thing: 'door'` to the legend with a target level id and call `loadLevel(id)` on touch (`game.js`).

**Change the goal.** `world.js` sets `run.done = 'won'` at the door. Make it "all coins", "beat the clock" or
"defeat every crawler" there; write the end-card text in `game.js` `finish` (always say why, and what to try).

**Change the camera.** `camera.viewHeight` is the zoom. Fixed screen: return early from `rig.update`. Vertical
levels work as they are (make the level tall; raise `rows`).

**Swapping the shapes for sprites.** Everything is a mesh in `draw/`, placed each frame from the game's numbers, so
only `draw/` changes. Player: in `createPlayerLook` replace the `Painter` body with
`new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flat('#ffffff', { map: texture, transparent: true }))`, moved up by
half its height (the group's origin is the feet); keep `flip.scale.x = player.facing` and the squash group. For
animation frames, set `texture.repeat` / `texture.offset` from `player.runCycle` and `body.onGround`. Tiles: give the
instanced mesh a tileset texture and a per-instance UV offset, or simpler, one textured `PlaneGeometry` per tile kind
as its own `InstancedMesh`. Load with `new THREE.TextureLoader().load('./assets/x.png')`, and for pixel art set
`texture.magFilter = THREE.NearestFilter` and `texture.colorSpace = THREE.SRGBColorSpace`. The collision boxes
(`PLAYER_W/H`, `ENEMY_W/H`) are separate from the drawing: keep them a little smaller than the art.

**Colours.** None are hard-coded: world = `look.base`, coins / flags / door = `look.accent`, spikes and crawlers =
`look.danger`, player = `look.player`. Edit `palette.json`.

## Content format

See the top of `levels.js`. `#` ground, `=` block, `-` one-way, `^` spikes, `o` coin, `P` start, `C` checkpoint,
`G` goal, `e` crawler, `M` mover (3 wide, centred, you stand on the top of that row) with its track `~` (sideways)
or `:` (up/down) touching it. Bottom text row is y = 0; y grows up. Unknown characters are reported in the console.

## Bot, skips, state

**Bot (`?bot=1`).** Runs right reading the tiles ahead: jumps low walls, gaps and spikes, waits for movers, rides
them, tries to land on crawlers, sometimes hesitates, and lets go of about one gap jump in eight too early (so
recordings show a hurt and a respawn now and then). It usually finishes in under a minute. It does not collect
off-path coins, use one-way platforms, drop through, or wall jump, and it only walks right: teach it in `bot.js` if
your level needs more.

**Skip moments:** `win`, `lose`, `invincible`, `spikes` / `platforms` / `home` (checkpoints 1-3), `walls` (the
wall-jump towers), `level2` (the second level).

**`state()`:** `level, score, coins, coinsTotal, stomps, health, checkpoint, progress (0..1), runTime, speed,
grounded, standingOn, wallSliding, alive, player {x, y, vx, vy, facing}, camera {x, y}, enemiesLeft, invincible`.
**Events:** `jump, land, pickup, score, hit, death, win`, plus `stomp, checkpoint, level`.

## Controls

A/D or arrows run; Space (or W / Up) jumps, hold for higher; S + Space drops through a wooden platform; jump against
a wall in the air to wall jump. Gamepad: left stick and A. Touch: the base's touch stick steers, but there is no
on-screen jump button yet, so touch is not playable as it is.

## Known limits, good next steps

- One enemy kind, no slopes, no ladders, no crushing: a mover never pushes you sideways (you pass through its sides).
- Feel numbers were set from platformer practice and checked by simulation and recordings, not by a person's hands.
  Get the user to play early; `run.speed`, `jump.height` and `jump.gravity` are the three to offer them first.
- Music is the base pad. Blocks that fit: `meticulai-procedural-songs` or `meticulai-adaptive-music` (music),
  `meticulai-riso-print`, `meticulai-pixel-3d`, `watercolour`, `coloured-pencil` (a drawing style over the flat shapes),
  `meticulai-anim-springs` (springier secondary motion), `meticulai-tuning-panel`.
- Good first additions: a spring tile, a flying enemy on a track (reuse `movers.js`), a dash, a level-select screen.
