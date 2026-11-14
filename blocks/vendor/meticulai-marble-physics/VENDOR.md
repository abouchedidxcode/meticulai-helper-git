# Marble physics: where this copy came from

From Lost Marbles by Meticulai (meticulai.com), live at https://meticulai.com/games/lost-marbles/.
Extracted 2026-11-14 from the game's source at `8849adcf3` (clean: no uncommitted changes in these files).

| | |
|---|---|
| Source files (relative to the game folder) | `shared/physics.js`, `shared/control.js`, base stats from `shared/cards.js` |
| Also merged | Marble Golf's copy of the physics (`shared/physics.js`, same commit, clean) |
| Code licence | MIT (see `LICENSE`) |
| Art licence | none: no files, the demo is code |
| Renderer | none (`src/view.js` and the demo use three.js) |

## What changed

- **Physics** (`src/physics.js`): the game's code with every number unchanged. Added Marble Golf's small additions:
  `floor` colliders (ghost marbles pass moving obstacles but still ride moving floors), `wallSpeed` and `groundTag`
  on bodies. `World` takes options (`gravity`, `maxSpeed`, `substeps`, `tickHz`, `cell`) that default to the game's
  values; `stepWorld`/`stepSingle` read them from the world instead of module constants. `Math` is now a live
  binding from `src/math.js` (`useMath`) so a deterministic Math can be swapped in, as Trick Shot did by editing
  the import. Comments made general (no game course names).
- **Controller** (`src/control.js`): kept movement, grip, drag, air control, jump, double jump, slick surfaces and
  the `mods` multipliers with the game's numbers. Left out the perk abilities (turbo, rocket, pogo, ghost, anchor,
  head start), which belonged to the game's card system. `controlStep` now returns `'jump'`/`'airjump'`, resets
  `ctl.justJumped` each tick (the game's sim did that) and takes `dt`. `DEFAULT_STATS` and `STAT_RANGES` are the
  game's `BASE_STATS` and `CAPS` (movement stats only).
- **Added**: `src/state.js` (`stateHash`, `copyBody`, `restoreBody`), `src/view.js` (three.js meshes for colliders),
  `src/sample-track.js` (a seeded example run, new; it borrows the game's whirlpool bowl profile constants
  A 0.06, K 14 and friction 0.35), the demo, and 13 tests.
- **Left out**: the course generator (`course.js`, 3,400 lines of the game's set pieces), the show/sim/session/
  netcode files, cards, art, sounds. They are the game, not the physics.

## Checked

On 2026-11-14: `npm install`, `npm test` (13 pass) and `npm run build` in a temporary copy; the demo ran in
headless Chromium with no errors, the twin simulation matched every tick. Picture:
`blocks/previews/meticulai-marble-physics.jpg`.
