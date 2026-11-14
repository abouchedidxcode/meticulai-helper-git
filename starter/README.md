# The starter game (for the agent)

`tools/init.mjs` copies this folder to `my-game/`. It is a small working game (a demo) on top of
scaffolding you should keep. Plain JavaScript ES modules, three.js, Vite. No asset files: every
shape, colour and sound is made in code, so it runs offline and ships as one small folder.

```
npm run dev       # dev server (tools/serve.mjs runs this for you, on the port in helper.json)
npm run build     # production build into dist/ (relative paths; tools/ship.mjs zips it)
```

## What each part is

| Path | What it does | Keep it? |
| --- | --- | --- |
| `index.html` | Loads `src/main.js`. | Yes |
| `helper.json` | Project settings (game name, port, spending cap). Read by the kit's tools. | Yes |
| `vite.config.js` | Relative paths (`base: './'`), fixed port, the helper plugin. | Yes |
| `helper-plugin.js` | Dev-server-only endpoints: `/__helper/notes`, `/__helper/tuning`, `/__helper/ping`. | Yes |
| `src/main.js` | Wires everything together and runs the flow: title, play, pause, end. Read it first. | Yes (edit) |
| `src/tuning.json` | Every number worth tuning, with ranges. The dev panel edits it. | Yes (edit) |
| `src/core/loop.js` | Fixed 60 Hz simulation, game time vs wall time, pause and step. | Yes |
| `src/core/hooks.js` | `window.__game` and the URL switches. The tools depend on it. | Yes, don't rename |
| `src/core/random.js` | Seeded random (`rng`). Use it instead of `Math.random`. | Yes |
| `src/core/events.js` | Event bus. Emit `jump` `land` `pickup` `hit` `death` `score` `win`. | Yes |
| `src/core/input.js` | Keyboard, mouse, touch, gamepad behind named actions; `makeBuffer()`. | Yes |
| `src/core/errors.js` | Collects errors into `__game.errors`; red banner with `?test=1`. | Yes |
| `src/core/settings.js` | `tune` values + the dev panel (backquote key). | Yes |
| `src/core/notes.js` | The N-key note box: the player's notes reach you in `playtest-notes/`. | Yes |
| `src/core/testmode.js` | Skip buttons and `__game.skipTo(name)`. | Yes |
| `src/feel/juice.js` | `hitStop`, `shake`, `flash`, `slowmo`, `punch`, all in game time. | Yes |
| `src/audio/audio.js` | Synth sounds (blip, chime, thud, whoosh, loops), music pad, volumes, ducking. | Yes (swap sounds later) |
| `src/render/renderer.js` | three.js renderer: sRGB, ACES, DPR cap 2, PCFShadowMap, resize, ready. | Yes |
| `src/ui/` | Title, pause, end card with the reason, HUD, toasts, controls card. Styles in `ui.css`. | Yes (restyle) |
| `src/game/` | **The demo game.** Delete it and write yours. | No |

## Replacing the demo game

1. Delete `src/game/` (or keep one file to crib from, then delete it).
2. Make `src/game/game.js` that exports the same two things:

```js
export const info = {
  tagline: 'One line that says what you do.',
  controls: [{ keys: ['W', 'A', 'S', 'D'], label: 'Move' }, { keys: ['Space'], label: 'Jump' }],
};

export function createGame(ctx) {
  // ctx = { view, input, juice, audio, ui, events, rng, tune, flags, testmode, end }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 500);
  return {
    scene,
    camera,
    start() {},            // reset everything for a new run (called on Play and Play again)
    update(dt, mode) {},   // one fixed step (dt = 1/60 s, scaled during slow motion).
                           // mode: 'title' (attract screen), 'playing', 'over'
    render(alpha) {},      // place meshes for drawing; alpha (0..1) interpolates between steps
    state() { return {}; } // plain numbers/strings for __game.state (score, health, level...)
  };
}
```

3. When a run ends, call `ctx.end({ won, heading, reason, stats })`. Always give a `reason` that tells the
   player what happened and what to try ("The stone wobbles before it rolls: watch for it"), never just
   "Game over".
4. Put your numbers in `src/tuning.json` and read them as `tune.group.name` every step.
5. Register skip moments for testing: `ctx.testmode.add('boss', 'Boss', () => { ... })`.
6. If `?bot=1` makes sense, drive `ctx.input.virtual` from a small bot (see `game/bot.js`).

## Rules of the scaffolding

- **All gameplay goes in `update(dt)`**, never in `render`. `update` runs at a fixed 60 Hz in game time.
  `render` runs at the screen's rate and may run zero or several times per step.
- **No `Math.random()`** in gameplay. Use `ctx.rng` (`rng.range`, `rng.int`, `rng.pick`, `rng.chance`).
  The seed comes from `?seed=`. `rng.reset()` runs on every restart so the same seed gives the same run.
- **No wall-clock timers for gameplay** (`setTimeout`, `Date.now`, `performance.now`). Count `dt`.
  Tests run in slow headless browsers; only game time is reliable there.
- **Read input through actions** (`input.pressed('jump')`, `input.move()`), so the bot, gamepad and touch work.
- **Paths stay relative** (`./assets/x.png`, or `import url from './x.png'`). No CDN, no web fonts: the game
  must run with no network.
- **Emit the standard events** when they happen: `jump`, `land`, `pickup`, `hit`, `death`, `score`, `win`.
  Recording and critic tools listen to them.
- **three.js:** use `PCFShadowMap` (not `PCFSoftShadowMap`), `THREE.Timer` (not `Clock`) if you need one,
  `HDRLoader` (not `RGBELoader`). A mesh with `vertexColors: true` but no colour attribute renders black.

## The hooks contract (`window.__game`)

| Field | Meaning |
| --- | --- |
| `ready` | true once a few real frames have been drawn |
| `frames` | frames drawn so far |
| `time` | game time in seconds (stops when paused; slows when the browser is slow) |
| `state` | `{ scene, ...game.state() }`; `scene` is `title`, `playing`, `paused` or `over` |
| `errors` | runtime errors (window errors, promise rejections, `console.error`, WebGL errors) |
| `seed` | the random seed in use |
| `pause()`, `resume()` | freeze or unfreeze the simulation (drawing continues) |
| `step(n)` | advance exactly n fixed steps while paused |
| `skipTo(name)` | run a registered moment (`start`, plus whatever the game adds) |
| `capture()` | PNG data URL of the current frame |
| `events` | the event bus: `__game.events.on('pickup', fn)` |

URL switches: `?seed=42`, `?autostart=1`, `?bot=1` (implies autostart; restarts by itself after the end card),
`?test=1` (skip buttons, controls card, red error banner), `?mute=1`. They combine:
`?autostart=1&seed=1&bot=1&test=1`.

## Dev-only tools in the game

- **Backquote key (`)**: the tuning panel. Drag sliders while playing; changed rows turn amber (click the
  name to reset it). "Save for my agent" writes `src/tuning.json` without reloading the page. "Copy" puts the
  changed values on the clipboard. Also available with `?test=1`.
- **N key**: the note box. Pauses the game, asks what was fun / confusing / where they stopped / what felt
  wrong, and saves the note with a screenshot and the game state to `playtest-notes/`. Read new notes with
  `node tools/play/notes.mjs`. Does nothing in a shipped build.

## The demo game, briefly

A round creature on a floating island at dusk gathers 12 sparks; two stones roll along worn tracks.
Three hearts; a stone hit or a fall costs one. Win when all sparks are gathered (about 2 minutes).
Skip moments: `last-spark`, `end`, `lose`, `invincible`. Files: `game.js` (rules and flow), `world.js`
(island, light, collision), `player.js` (movement, jump, squash), `camera.js` (follow camera),
`sparks.js`, `stones.js`, `bot.js`.

More snippets for common needs (follow camera with pull-in, projectiles, saving, particles...) are in the
kit's `recipes/` folder.
