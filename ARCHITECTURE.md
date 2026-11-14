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
  templates/                   GREAT, HANDOVER, DECISIONS, DEVLOG, CREDITS, paid-ledger, CONTRACTS
  playbook/, case-studies/     what makes games good, learned the hard way
  recipes/                     tested code snippets for the starter
  guides/                      for humans with zero technical background
  tools/                       Node scripts (no build step)
  starter/                     the starter game (copied to my-game/ by tools/init.mjs)

  my-game/                     <- created by `node tools/init.mjs`; EVERYTHING the user makes
    helper.json                project settings (see below)
    index.html, src/, public/  the game (a Vite + three.js project)
    package.json
    GREAT.md HANDOVER.md DECISIONS.md DEVLOG.md CREDITS.md paid-ledger.md CONTRACTS.md
    refs/                      the user's pictures and videos (they drag files in here)
      REFS.md                  what each reference is FOR and what to ignore
      sheets/                  contact sheets made from videos (by tools/refs/intake.mjs)
      generated/               fal output (by tools/fal/gen.mjs)
    recordings/<stamp>/        play-through recordings: video.mp4, sheet-*.jpg, shots/, log.txt
    playtest-notes/            notes the user left in-game (NOTES.md + shots/)
    .helper/                   runtime files: server.json, server.log, fal-ledger.jsonl (git-ignored)
```

Tools default to `my-game/`. Every tool accepts `--dir <path>` (or env `HELPER_GAME_DIR`) to point elsewhere.

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
