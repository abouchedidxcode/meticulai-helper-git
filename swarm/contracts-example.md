# Contracts: who owns what (example for the starter game)

*An example of a filled `my-game/CONTRACTS.md`, for the starter game the kit gives you. File names follow the
starter's layout (`src/core`, `src/game`, `src/feel`, `src/audio`, `src/render`, `src/ui`). In your game, use the
real file names; files marked (new) don't exist yet and the owner creates them.*

**Round:** 3, written by the director.
**Goal this round:** "Landing a jump feels heavy and certain, and picking things up feels like a reward." (GREAT.md
gap 1; the user's note: "jumping feels floaty and I can't tell when I got a coin".)

| Area | Owner | Files | Talks to others through |
| --- | --- | --- | --- |
| Core loop | `loop` | `src/game/game.js`, `src/game/rules.js` (new), `src/game/bot.js` | Emits `score` `{ total, delta }`, `pickup` `{ kind, remaining, pos }`, `death` `{ cause }`, `win` `{ time, stats }`. Calls `ctx.end()`. Reads the player from `player.js` only through `createPlayer()`'s return value. |
| Player and camera | `player` | `src/game/player.js` (new), `src/game/camera.js` (new), `src/core/input.js` | Emits `jump` `{ height }` and `land` `{ speed, pos }` (speed in m/s when it touches down). Exposes `player.pos`, `player.vel`, `player.grounded`. The camera reads `juice` for shake but never changes it. |
| World | `world` | `src/game/world.js` (new), `src/game/level.js` (new), `src/render/renderer.js`, `public/assets/` | Exposes `world.heightAt(x, z)`, `world.collide(pos, radius)`, `world.pickups` (positions only). Emits nothing. Lights and fog live here. |
| Juice and audio | `juice` | `src/feel/juice.js`, `src/audio/audio.js` | Listens only: `jump`, `land`, `pickup`, `hit`, `death`, `score`, `win`. Never changes game state. Exposes `juice.shake(amount)`, `juice.hitStop(ms)`, `juice.flash(color)`. |
| UI | `ui` | `src/ui/ui.js`, `src/ui/ui.css`, `index.html` | Listens to `score`, `pickup`, `death`, `win`, `start`, `pause`. Shows the HUD, title, pause and end card. Reads nothing else. |
| Plan, docs, merges | director | `src/main.js`, `helper.json`, `CONTRACTS.md`, `GREAT.md`, `HANDOVER.md`, `DECISIONS.md`, `DEVLOG.md` | Reviews every diff. Builders who need a change in `main.js` write it in their report. |

`src/tuning.json` holds values the user saved from the in-game panel. Nobody changes them this round; if a builder
believes one is wrong, it says so in its report with the old and new value.

`src/core/` (except `input.js`, which `player` owns) and the event names are shared and frozen: nobody renames
anything there. Adding new events is fine; tell the director so it lands in this file.

## Shared hooks this round

- `player` commits `land` with `{ speed, pos }` in its **first** commit (even before the landing feel is done), because
  `juice` and `loop` build on it.
- `loop` adds `pos` to the `pickup` event so `juice` can put the sparkle where the coin was.
- `juice` adds `juice.hitStop(ms)`; `player` may call it on a hard landing (over 8 m/s).

## Done means (each shows in a 60-second bot recording)

| Area | Done when |
| --- | --- |
| Core loop | Coins are worth more in a streak (`score.delta` grows); the end card shows the streak. Test: `rules` unit test for the streak. |
| Player and camera | Coyote time (a jump still works 0.1 s after leaving a ledge); jump height depends on how long Space is held; the camera dips on a hard landing. Test: a fixed-step test on `player.js` for coyote time. |
| World | Ledges cast a contact shadow so you can judge where you'll land; coins sit on a soft glow ring. |
| Juice and audio | A landing thud scaled by speed; a pickup chime that rises in pitch through a streak; 40 ms hit-stop on hard landings. |
| UI | The score ticks up instead of jumping; a small "+3" floats from the coin's screen position. |

## Rules

1. Only edit files in your row. Need a change in someone else's file? Write the exact change in your report. If it's
   tiny and blocks you, make it and say so.
2. Commit only your own files: `git commit -m "<area>: <what>" -- <your paths>`. Never `git add -A`.
3. The game runs at every commit. No code paths that nothing has run.
4. Don't change the user's values in `src/tuning.json` without saying so.
5. One browser at a time (the tools take the lock). No polling.
6. Event names, `window.__game` and the URL switches never change. New ones are fine.
