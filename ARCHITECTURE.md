# How the kit fits together

This is the technical map for agents (and curious humans). Every file in the kit follows these contracts, so the
pieces work together. If you change a contract, change it here first.

## One project = one copy of this kit

The user's workspace is a copy of this repository (cloned, downloaded as a zip, or made with "Use this template").
The kit's own files stay at the top. **Everything the user makes lives in one folder: `my-game/`.**

```
meticulai-helper-git/          <- the kit (workspace root)
  START.md                     agent entry point: the whole process
  AGENTS.md, CLAUDE.md         short pointers to START.md + the hard rules
  .env                         optional FAL_KEY (never committed, never printed)
  skills/<step>/SKILL.md       one file per step of the process
  agents/<role>.md             swarm roles (Claude Code subagents; plain prompts for any other agent)
  commands/<name>.md           Claude Code slash commands (thin wrappers around skills)
  autopilot/                   running unattended for hours
  swarm/                       running several agents at once
  templates/                   GREAT, HANDOVER, DECISIONS, DEVLOG, CREDITS, paid-ledger, CONTRACTS, REFS, ASSETS,
                               palette.json
  sources/                     free asset libraries: catalog.json, libraries.json (code libraries), <id>.md, packs/
  blocks/                      ready-made effects/systems as code: catalog.json, vendor/<id>/, previews/, CREDITS.md
  playbook/, case-studies/     what makes games good, learned the hard way
  recipes/                     tested code snippets for the starter
  guides/                      for humans with zero technical background
  tools/                       Node scripts (no build step)
    assets/                    find, get (and promote), look, restyle, palette-from
    blocks/                    list, add
  starter/                     the shared base game (copied to my-game/ by tools/init.mjs) + the island demo
  starters/<id>/               genre starters: overlays on the base (src/game/, src/tuning.json, STARTER.md, starter.json)
  vibes/<id>/                  ready-made looks: vibe.json (palette, light, look, words) + frames/ + in-kit-<starter>.jpg
  looks/<id>/                  drawing styles over any game (becomes my-game/src/look/index.js)
  sounds/                      free game sounds (catalog.json) made by tools/sounds/synth.mjs, plus a few from the games

  my-game/                     <- created by `node tools/init.mjs`; EVERYTHING the user makes
    helper.json                project settings (see below)
    index.html, src/, public/  the game (a Vite + three.js project)
    package.json
    GREAT.md HANDOVER.md DECISIONS.md DEVLOG.md CREDITS.md paid-ledger.md CONTRACTS.md
    ASSETS.md                  the asset plan: every need, the ladder choice, the chosen asset, rejections and why
    palette.json               the game's colours and light (read by restyle.mjs --palette and look.mjs --in-game)
    public/assets/<kind>/      assets brought in by tools/assets/get.mjs (credit line added to CREDITS.md)
    vendor/<block-id>/         blocks copied in by tools/blocks/add.mjs (with their licence and credit)
    refs/                      the user's pictures and videos (they drag files in here)
      REFS.md                  what each reference is FOR and what to ignore
      sheets/                  contact sheets made from videos (by tools/refs/intake.mjs)
      generated/               fal output (by tools/fal/gen.mjs)
    recordings/<stamp>/        play-through recordings: video.mp4, sheet-*.jpg, shots/, log.txt
    playtest-notes/            notes the user left in-game (NOTES.md + shots/)
    .helper/                   runtime files: server.json, server.log, fal-ledger.jsonl (git-ignored)
      candidates/              assets pulled for a look (get.mjs --candidate); not part of the game
      scout/<category>/        asset-scout shortlists (SHORTLIST.md) and look images

~/.cache/meticulai-helper/     downloaded assets, shared by every project on the machine (safe to delete)
```

Tools default to `my-game/`. Every tool accepts `--dir <path>` (or env `HELPER_GAME_DIR`) to point elsewhere.

## Assets (`skills/find-assets/SKILL.md`)

The ladder for every need in `my-game/ASSETS.md`: block (`blocks/catalog.json`) -> CC0 asset -> credit-required asset
(`sources/catalog.json`) -> made in code -> fal. Assets move: `find.mjs` (search, contact sheet) -> `get.mjs --candidate`
(`.helper/candidates/`) -> `look.mjs` (render to judge) -> optional `restyle.mjs` -> `get.mjs <id>` or
`get.mjs promote <path>` (`public/assets/<kind>/` + a line in `CREDITS.md`). Blocks: `tools/blocks/add.mjs <id>`
copies `blocks/vendor/<id>/` into `my-game/vendor/<id>/`. Game code loads assets with relative paths
(`./assets/models/x.glb`).

Finding blocks: `tools/blocks/suggest.mjs` reads `my-game/GREAT.md` (and `ASSETS.md`) and ranks blocks and code
libraries by their `use_when`, `tags` and `what`. `blocks/BY-NEED.md` lists them by what the player does.
`tools/blocks/build-catalog.mjs` merges every `blocks/vendor/*/block.json` into `blocks/catalog.json` and regenerates
`BY-NEED.md` and the Meticulai section of `blocks/CREDITS.md`; run it after adding or changing a block.
Blocks named `meticulai-*` are systems taken from the games at meticulai.com; each `block.json` names the game it came from.

`my-game/palette.json`:

```json
{
  "name": "warm dusk",
  "colors": { "base": ["#93ad5e", "#b9957a"], "accent": ["#ffc46b"], "shadow": "#4a3f5e", "light": "#ffc08a" },
  "light": { "sun": "#ffc08a", "ambient": "#b4c0e6", "fog": "#7d6a86", "exposure": 1.1 },
  "notes": "..."
}
```

## Starters, vibes and looks

- A starter is an overlay on `starter/`: `init.mjs --starter <id>` copies the base, then the starter's `src/game/`,
  `src/tuning.json`, `public/`, `scripts/` and `STARTER.md`, and adds the blocks listed in its `starter.json`.
  `switch.mjs` does the same later under an existing game. Starters may not change base files; anything they need from
  the base is proposed as a base change. `tools/starters/test.mjs <id>` is the bar a starter must pass.
- Every colour and the light come from `my-game/palette.json`, read by `src/core/look.js` by ROLE (`look.base[0..3]`,
  `accent[0..1]`, `danger`, `player`, `shadow`, `light`, `ink`, `sky`, `lighting`); games get it as `ctx.look`, and
  `render/atmosphere.js` builds sky, sun, ambient and fog from it. Missing fields are worked out; UI colours are
  chosen so text stays readable (`uiColors()`). A vibe is a palette plus a look id plus words.
- A look is `src/look/index.js` exporting `lookInfo` and `installLook(ctx)`; it may return `{ render(renderer, scene,
  camera), resize?(w, h, pixelRatio), update?(dt), dispose?() }`, which main.js hands to `view.setPost()`. Looks never
  touch game code; `look.json` says whether one works with orthographic (2D) cameras.
- Mouse-look games set `info.pointerLock: true`; main.js captures the mouse while playing and pauses when it is
  freed. Input has `input.look()` (mouse movement plus right stick) and `input.aim()` (right stick), and bots drive
  them with `input.virtual.look(dx, dy)` / `setAim(x, y)`.

## `my-game/helper.json`

```json
{
  "gameName": "My Game",
  "port": 5173,
  "falCapUSD": 0,
  "maxAgents": 4,
  "autopilot": { "hours": 0, "mayDecideAlone": [], "askMeFirst": [] }
}
```

- `port`: fixed per project so the play link never changes. `init.mjs` picks a free port in 5170-5199.
- `falCapUSD`: hard spending cap for `tools/fal/gen.mjs`. 0 means generation is off.
- `maxAgents`: how many builder agents may run at once (the machine and the plan's usage both matter).

## The game's test hooks (the starter implements these; the tools rely on them)

```js
window.__game = {
  ready,        // true once the first real frame has been drawn
  frames,       // frames rendered so far
  time,         // game time in seconds (NOT wall time; headless browsers run slow)
  state,        // plain object: { scene, score, health, ... } safe to JSON.stringify
  errors,       // array of error strings caught at runtime (window.onerror + GL errors)
  seed,         // the random seed in use
  pause(), resume(),
  step(n),      // advance n fixed steps while paused (deterministic)
  skipTo(name), // jump to a named moment, e.g. 'level2', 'boss' (test builds only)
  capture(),    // returns a PNG data URL of the current frame
  events,       // the event bus: events.on('jump'|'land'|'pickup'|'hit'|'death'|'score'|'win', fn)
}
```

URL switches: `?seed=42` (deterministic random), `?autostart=1` (skip the title), `?bot=1` (a simple built-in bot
plays), `?test=1` (show skip buttons + controls card), `?mute=1`, `?dev=1` / `?dev=open` (the dev menu in a shipped
build / opened at once).

## Dev-server endpoints (added by the starter's Vite plugin; dev only, never in a shipped build)

- `POST /__helper/notes` body `{ text, screenshot, state, url }` -> appends to `playtest-notes/NOTES.md`, saves the
  screenshot as `playtest-notes/shots/<stamp>.png`. The in-game note box (key **N**) uses it.
- `POST /__helper/tuning` body `{ values }` -> writes `src/tuning.json`. The dev menu's "Save for my agent" button
  uses it. The game reads its default tuning from `src/tuning.json`.
- `POST /__helper/palette` body `{ palette }` -> checks it (colours `#rrggbb`, numbers numbers, known fields only),
  keeps the old `palette.json` in `.helper/`, writes the new one. The dev menu's "Save palette for my agent" uses it,
  then reloads the page.
- `POST /__helper/shot` body `{ png }` -> saves `playtest-notes/shots/shot-<stamp>.png` (the dev menu's Screenshot).
- `GET /__helper/vibes` -> the kit's ready vibes (`../vibes/catalog.json` if there, else every `../vibes/*/vibe.json`)
  with a colour swatch each, and which one is on. `POST /__helper/vibe` body `{ id }` -> runs
  `tools/vibes/apply.mjs <id>` if the kit has it, else writes the vibe's palette. The dev menu then reloads.

## The dev menu (`starter/src/core/dev/`)

Every game made from the starter has it (backquote or F2). On in the dev server and with `?test=1`; in a shipped
build only with `?dev=1`. In a hidden test browser it stays invisible unless the address says `?dev` (so recordings,
previews and `__game.capture()` never show it); `?dev=open` opens it at once. Its code is loaded with a dynamic
import only when it is on, so players never download it. `settings.js` is the adapter: `tune`, `define`, `set`,
`changedValues`, `installSettingsPanel` and the `tuning.json` format are as before, plus `dev` (also `ctx.dev`):
`button`, `toggle`, `readout`, `pick`, `slider`, `essentials`, `presets`, all no-ops when the menu is off.
`dev.view(camera)` gives main.js the camera to draw with (the free camera never moves the game's own);
`loop.speed` and `loop.freeze()` give Speed and Freeze. Maker's changes are kept in localStorage under
`<game name>.tuning`. Tests: `node --test tools/starters/dev-menu.test.mjs` (no browser) and
`node tools/starters/dev-menu-check.mjs --dir <game>` (one hidden browser, under a minute). The same registry and
panel, for games not made from the starter, is the block `meticulai-tuning-panel`.
- `GET /__helper/ping` -> `{ ok: true, game: "<gameName>" }` (used by `tools/serve.mjs` to know the server is ours).

## Browsers

All browser work is headless. Launch through `tools/lib/browser.mjs` (`launch()`), which adds
`--use-angle=metal --enable-gpu --ignore-gpu-blocklist` on macOS and takes a machine-wide lock
(`withBrowserLock(fn)`) so parallel agents never run two browsers at once. Viewport 1280x720.

## Play scripts (`tools/play/record.mjs --script <file>`)

Plain text, one command per line, `#` for comments:

```
press Enter          # tap a key (names as in Playwright: KeyW, Space, ArrowLeft, Enter, Escape...)
hold KeyW 2000       # hold a key for 2000 ms of GAME time
down Space / up Space
click 640 360        # click at x y in the 1280x720 viewport
move 700 300         # move the mouse
wait 500             # wait 500 ms of game time
shot after-jump      # save a named screenshot
skip level2          # __game.skipTo('level2')
note text...         # write a line into the log
```

## Output that agents read

- Recordings: `my-game/recordings/<stamp>/video.mp4`, `sheet-01.jpg...` (4x3 grids, each tile stamped with game
  time), `shots/*.png`, `log.txt` (script lines, `__game.state` snapshots, errors, fps).
- Every tool prints a short human summary and exits non-zero on failure.

## The hand-back rule (applies to every agent, every step)

Never hand the game back to the user without running `node tools/serve.mjs --check` and pasting its
"Play it now" card. `serve.mjs` starts the game if it is not running, keeps it running in the background, loads it
in a hidden browser to prove it draws without errors, and prints:

```
▶ Play it now: http://localhost:5173
```

If the check fails, fix it first. A broken link is never handed to the user.
