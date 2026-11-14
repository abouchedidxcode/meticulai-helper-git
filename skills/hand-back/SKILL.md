---
name: hand-back
description: How every turn handed back to the user must end - a verified, working play link plus a short card saying what changed and what to try. Use at the end of every turn, every step, every autopilot report, without exception.
---

# Hand-back

## Goal

The user can click one link and play the newest version, and knows in ten seconds what to look at. The single most
common way these projects die is the user not being able to play what the agent made. This rule prevents that.

## When

The end of every turn. After setup, after the interview, after a fix, after a playtest round, in `MORNING.md` after
autopilot. Even when you only changed documents: the link still goes at the top.

## Pre-checks (all of them, in order)

1. Builders are finished and their work is merged. No agent is still editing files.
2. `node tools/serve.mjs --check`. It starts the dev server if needed, loads the game in a hidden browser, checks that
   it draws and has no errors, and prints the card line `▶ Play it now: http://localhost:PORT`.
3. If the check fails: fix it. Don't hand back. If you truly can't fix it this turn, roll back to the last working
   commit (`git stash` or `git revert`, never delete the user's work), check again, and say plainly that the new work
   is saved but not in the playable build yet.
4. If you changed something visible, look at it yourself: a quick `node tools/play/record.mjs --seconds 20 --bot`
   and a glance at `sheet-01.jpg` catches a black screen or a missing model that `--check` can't judge.
5. Update `my-game/HANDOVER.md` (top block: current state, what to try, what's next) and add a line to `DEVLOG.md`.
6. Commit: `git add -A && git commit -m "<what changed, in plain words>"`.

## The card

Paste it exactly in this shape. Short lines. No file paths, no code, no jargon.

```
▶ Play it now: http://localhost:5173

What changed
- The jump now has a short squash on landing and a thud you can hear.
- Coins pull toward you when you're close.

Try this
- Jump off the tallest ledge and land on the moving platform.
- Test mode (skip buttons, jump to any level): http://localhost:5173/?test=1

Controls
- Arrow keys or WASD to move, Space to jump, Esc to pause.

Still rough
- The second level is grey boxes.
- No music yet.

Press N in the game to leave me a note (it saves a screenshot too).
```

Rules for the card:
- **The link comes first**, exactly as `serve.mjs` printed it. Never type a port from memory.
- **What changed**: things the user can see, hear or feel. "Rewrote the input module" is not a change they can see;
  "the ship turns faster and leans into the turn" is.
- **Try this**: one to three concrete missions that send them straight to the new thing. Add the `?test=1` link when
  skip buttons save them time.
- **Still rough**: honest. Include anything you couldn't verify ("I can't hear audio, so tell me if the music is too
  loud").
- If you need a decision from them, ask one question at the very end, after the card.

## Common mistakes

- Handing back with "it should work now" without running `--check`.
- Giving a link to a server you stopped, or a port that changed. The port is fixed in `helper.json`; `serve.mjs` keeps
  the server running in the background after you finish.
- Long reports. The card is the report. Details go in DEVLOG.md.
- Listing ten things in "What changed". Pick the three that matter.
- Hiding problems. The user will find them in ten seconds and stop trusting you.

## Done means

The card is in your message, the link works, HANDOVER.md matches what you said, and the work is committed.
