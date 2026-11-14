# Arcade flight: where this copy came from

From Dragon Aces by Meticulai (meticulai.com). Extracted 2026-11-14 from the game's source at `8849adcf3` (clean: the
copied files had no uncommitted changes, and are identical to the version live at meticulai.com/games/dragon-aces/).

| | |
|---|---|
| Made by | Meticulai |
| Source files (relative to the game folder) | `shared/flight.js`, `shared/math.js`; the player's mouse-aim and throttle from `client/js/game.js` (`flyMe`, `aimDir`); the controls from `client/js/input.js`; the chase camera from `client/js/feel.js` (`camera()`, chase branch) |
| Copied on | 2026-11-14 |
| Code licence | MIT (see `LICENSE`) |
| Art | none: the demo's flyer, island and rings are built in code |
| Renderer | none for the model; three.js for the camera and demo |

## What changed

- **`flight.js` is a copy, not a refactor.** The only edits: the game's `WORLD.ceiling` and `WEAPONS.dodge` (from
  its constants file) and the module constants (`THRUST`, `DRAG`, `BOOST`, `BRAKE_DRAG`, `G`, `STALL_SPEED`,
  `MAX_SPEED`) now come from an exported `FLIGHT` object with the same values, passed as an optional 5th argument;
  the breed argument defaults to `PRESETS.balanced`; comments say "flyer" instead of "dragon". A scripted 40 s flight
  through the game's file and this one gave bit-identical results for all four breeds; a test pins it.
- **`math.js`**: unchanged apart from the header comment.
- **`pilot.js`** (new file): the game's `flyMe` input path without weapons, shrines and networking: mouse aim ->
  `steerToward(..., 1.15)`, A/D roll override, the throttle spool (0.62 cruise, 1 / 0.08, rates 5 and 7), brake,
  boost, dodge. Same numbers.
- **`input.js`**: the game's `Input.read()` with the weapon, lock-on, scoreboard, map and camera-toggle keys, the
  saved settings and the touch controls left out (touch needs the game's on-screen buttons).
- **`chase-camera.js`**: the chase branch of the game's camera with the same springs, boom, FOV spring, roll and
  tremor. Left out: the rider (first person) view, the death and kill cams, the respawn swoop, terrain ray tests
  against the game's world (a simple `floorAt` floor instead), controller rumble, chromatic aberration and the
  shot recoil.
- The breeds' other stats (health, fireballs, breath) are not part of this block; their speed and turn
  multipliers are `PRESETS`.

## Checked

On 2026-11-14: `npm test` (11 tests pass, including the game's own "autopilot turns toward a direction" test),
`vite build`, and the demo opened in headless Chromium: it drew without errors and flew the ring loop at 82-140 m/s.
The picture is `blocks/previews/meticulai-arcade-flight.jpg`.
