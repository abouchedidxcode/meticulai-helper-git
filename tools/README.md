# Tools

Small programs your agent runs for you. You rarely need to type these yourself: just tell the agent what you want
("let's playtest it", "ship it"). They need nothing but Node.js; `node tools/doctor.mjs --fix` installs the rest.

Every tool:

- prints a short summary in plain words, and a "What to do next" line when something goes wrong;
- takes `--help` (what it does and its options) and `--verbose` (technical details);
- works on your game in `my-game/`, or another folder with `--dir <folder>`;
- uses a hidden browser (you never see a window pop up), one at a time, even with many agents running.

| Command | What it's for |
| --- | --- |
| `node tools/doctor.mjs` | Checks your computer has everything: Node.js, git, ffmpeg (for videos), the hidden test browser, disk space. Add `--fix` to install what's missing. Says whether a fal key is set, never what it is. |
| `node tools/init.mjs --name "My Game"` | Creates `my-game/` from the starter game, with the planning files and folders. Picks the port for your play link. Never overwrites an existing game. |
| `node tools/serve.mjs` | Starts your game in the background (or reuses it) and prints the "Play it now" link. |
| `node tools/serve.mjs --check` | Also opens the game in the hidden browser to prove it starts, runs without errors and shows something. Agents run this before handing the game back to you. `--status`, `--stop`, `--restart` do what they say. |
| `node tools/ship.mjs` | Builds the web version, tests it, and zips it to `my-game/ship/<name>-web.zip` for itch.io or GitHub Pages. Warns about files that are too big or paths that will break online. |
| `node tools/play/record.mjs` | Plays the game in the hidden browser and records it: a video, contact sheets (grids of moments with the game time on each), screenshots and a log, in `my-game/recordings/`. `--bot` lets the built-in bot play; `--script` follows a play script (see `tools/play/scripts/first-minute.txt`); `--build` records a frozen copy that can't reload mid-recording. |
| `node tools/play/sheets.mjs <video>` | Contact sheets from any video, for example a reference clip you like. Agents can't watch videos, but they can read these. |
| `node tools/play/fps.mjs` | How smoothly the game runs: typical and slowest frame times, hitches, WebGL errors, draw calls. |
| `node tools/play/loud.mjs` | How loud the game is (no agent can listen): typical and loudest levels, silence, clipping. The hidden browser is muted, so nothing plays out loud. |
| `node tools/play/blind-ab.mjs a.png b.png` | A blind test: copies pictures under shuffled names X, Y, Z so a critic can judge them without knowing which is new. `--reveal <id>` shows which was which. |
| `node tools/play/notes.mjs` | Shows the notes you left in the game (press **N** while playing) since the agent last read them, with their screenshots. `--all` shows every note. |
| `node tools/refs/intake.mjs` | Processes new pictures and videos you put in `my-game/refs/`: contact sheets for videos, a stub entry in `refs/REFS.md` for each file. |
| `node tools/refs/palette.mjs <img> [img2]` | The main colours of a picture, how bright and how colourful it is; compares two pictures. |
| `node tools/fal/gen.mjs <kind> ...` | Optional, paid: generates pictures, textures, sounds, music or 3D models with fal.ai. Shows the cost and waits for your yes; never goes over the cap in `helper.json`. `status` shows spending, `models` lists prices. |

## For agents

- Shared code is in `tools/lib/`: `paths.mjs` (kit root, game folder, `helper.json`), `browser.mjs` (`launch()`,
  `withBrowserLock()`, `newGamePage()`, `openGame()`, `waitGameTime()`, `canvasStats()`), `server.mjs`
  (`ensureServer()`, `stopServer()`, `startStatic()`, `buildGame()`), `check.mjs` (`checkGame()`), `ffmpeg.mjs`
  (`encodeFrames()`, `contactSheets()`, `videoInfo()`), `proc.mjs`, `log.mjs`, `args.mjs`.
- Never launch a browser directly: use `launch()` inside `withBrowserLock()`. The lock is the folder
  `/tmp/mhg-browser.lock` (the temp folder on Windows); a shell script can share it with `mkdir`/`rmdir`.
- Pages opened with `newGamePage()` can't be reloaded by Vite's hot reload, so another agent saving a file won't
  spoil a test or a recording. `record.mjs` also restarts the recording if the page reloads anyway.
- Waits in play scripts are in game time (`__game.time`), because the hidden browser can run slower than real time.
  The video is paced by game time too, so it plays at the speed a player would see.
- The dev server's log is `my-game/.helper/server.log`; its pid and port are in `my-game/.helper/server.json`.
