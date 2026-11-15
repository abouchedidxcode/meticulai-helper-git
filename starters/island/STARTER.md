# The island starter (for the agent)

The shared base game: a little round creature runs and jumps around a floating island at dusk, gathering twelve
sparks while two stones roll along worn tracks. Three hearts; a stone hit or a fall costs one. About 2 minutes.
Every other starter is built on the same base (core, render, ui, feel, audio, look, the dev menu) with its own
`src/game/`. The full map of the base is `README.md` in this folder; the demo's files are in `src/game/`.

## Files
- `game.js`: rules and flow (pickups, hearts, falling, win and lose, skip moments, the dev-menu short list and presets).
- `world.js`: the island, its light (from `render/atmosphere.js`) and the collision shapes; colours from `palette.json`.
- `player.js`: movement, jump, squash. `camera.js`: the follow camera. `sparks.js`, `stones.js`: pickups and hazards.
- `bot.js`: plays for tests and recordings (`?bot=1`).

## Already tuned, and why (`src/tuning.json`)
- **Jump** (`player.jumpSpeed`, `gravity`, `fallGravity`, `jumpCut`, `coyoteTime`, `jumpBuffer`): quick rise, heavier
  fall, short hop on a tap, a jump still counts a moment after leaving a ledge or just before landing. Remove any of
  these and jumping feels unfair.
- **Ground grip** (`player.groundAccel`, `airControl`): you stop where you aim; some steering in the air.
- **Camera** (`camera.*`): follows behind and above, turns with Q/E or drag, never clips through the island.
- **Hazards you can read** (`stones.rest`): stones wobble at the end of their worn track before they roll.
- **Pickups that feel good** (`feel.pickupStopMs`): a tiny freeze-frame and a chime that rises with each spark.

## Make it yours
1. **A new place:** replace the island in `world.js`; keep `solids` (boxes and upright cylinders) for collision.
2. **A different goal:** change what `collect()` and `finish()` in `game.js` count.
3. **A new hazard:** copy `stones.js`; give it a warning before it can hurt.
4. **A different character:** swap the meshes in `player.js`; keep `PLAYER_RADIUS` for collision.
5. **Another kind of game:** if the game is really a racer, platformer, top-down or first-person game, switch starter
   instead:  `node tools/starters/switch.mjs <id>`.

Skip moments: `win`, `lose`, `last-spark`, `invincible`. `state()`: score, sparks, health, runTime, grounded, player.
