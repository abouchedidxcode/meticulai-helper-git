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
  starter/                     the starter game (copied to my-game/ by tools/init.mjs)

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
plays), `?test=1` (show skip buttons + controls card), `?mute=1`.

## Dev-server endpoints (added by the starter's Vite plugin; dev only, never in a shipped build)

- `POST /__helper/notes` body `{ text, screenshot, state, url }` -> appends to `playtest-notes/NOTES.md`, saves the
  screenshot as `playtest-notes/shots/<stamp>.png`. The in-game note box (key **N**) uses it.
- `POST /__helper/tuning` body `{ values }` -> writes `src/tuning.json`. The dev panel's "Save for my agent" button
  uses it. The game reads its default tuning from `src/tuning.json`.
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
