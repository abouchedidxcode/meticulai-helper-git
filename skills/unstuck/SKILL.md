---
name: unstuck
description: A plain-words decision tree for when things go wrong - black screen, nothing loads, slow, no sound, works locally but not online, not fun, the AI keeps making tiny changes, it looks like AI slop, or usage ran out. Use whenever the user is frustrated, confused, or the same problem has come back twice.
---

# Unstuck

Find the user's problem below, do what it says, and tell them in one or two plain sentences what was wrong and what
you did. Always end with a [hand-back](../hand-back/SKILL.md).

Before you start: you must be in the kit's workspace (it has `START.md` and `tools/`). If not, do START.md step 0.

## "The screen is black" / "nothing shows"

1. `node tools/serve.mjs --check`. It prints errors from the page. Fix the first error; later ones are often caused by
   it.
2. No errors but black: the camera is looking at nothing, a light is missing, or something is drawn at size 0. Record
   five seconds (`node tools/play/record.mjs --seconds 5`) and look at the shot.
3. A shadow setting that fails silently can make every surface vanish; check the log for `GL_INVALID` lines. See
   [playbook/gotchas.md](../../playbook/gotchas.md).
4. Still stuck: `git log --oneline -10`, find the last commit where it worked, compare.

## "The link doesn't open" / "nothing loads"

1. `node tools/serve.mjs --status`, then `node tools/serve.mjs --check` (it restarts the server if needed).
2. The computer went to sleep or restarted: the server stopped. `--check` starts it again; the link stays the same.
3. If `node tools/doctor.mjs` reports a problem, fix that first.
4. Tell the user: "The game's little local server had stopped. I restarted it; same link as before."

## "It's slow" / "it stutters"

1. Measure: `node tools/play/fps.mjs`. Look at the 95th and 99th percentiles, not the average.
2. Usual causes: too many lights casting shadows, huge textures, post-processing stacked up, creating objects every
   frame (garbage collection stutters), too many draw calls. Fix the biggest one, measure again.
3. Check the user's computer: an old laptop needs a lower quality default. Add a quality setting rather than making
   everyone's game uglier.

## "There's no sound"

1. Browsers block sound until the first click or key. Make sure audio starts on the first input.
2. Check `?mute=1` isn't in the link and the game's mute isn't on.
3. `node tools/play/loud.mjs` shows whether anything is playing at all and how loud.
4. Remind the user: you can't hear. Ask them to describe what they hear (or don't).

## "It works on my computer but not online"

1. Rebuild with `node tools/ship.mjs`. It builds with relative paths and tests the result, which catches most of these.
2. Usual causes: absolute paths (`/assets/x.png` instead of `assets/x.png`), file names with different capital letters
   (online servers care), files not included in the build, something that only exists on the dev server.
3. Never use the dev server's special features (notes, tuning save) in the shipped game; they're dev-only.

## "It's not fun and I don't know why"

The most important branch. Don't tweak. Go back to basics:
1. Re-read GREAT.md with the user's notes beside it. Three questions:
   - **The verb:** is doing the one verb satisfying on its own, with no goal at all?
   - **The 30-second loop:** does each beat pay off? Which beat is dead?
   - **Choice:** does the player's choice visibly change the result? If a random player and a careful one get the same
     outcome, that's the problem.
2. Record a minute of play and spawn [agents/critic-newcomer.md](../../agents/critic-newcomer.md): "what's the weakest
   moment, and where did you stop caring?"
3. Make **one big move** aimed at that answer: rework the verb, cut a beat, add a real decision, change the camera, move
   the best moment to the start.
4. If the core idea itself doesn't hold up after two big moves, propose a v2 to the user: keep what worked, restart the
   rest. See [playbook/when-to-start-over.md](../../playbook/when-to-start-over.md) and
   [playbook/what-makes-it-fun.md](../../playbook/what-makes-it-fun.md).

## "The AI keeps making tiny changes" / "nothing is improving"

That's the plateau. Small tweaks plus noisy reviews go in circles.
1. Stop. List the last three rounds' top complaint. If it's the same, the current approach is exhausted.
2. Pick a change different in kind (new controls, new camera, new structure, cut the feature).
3. Tell the user what you're changing and why: "We've polished the jump three times and it still feels floaty, so I'm
   rebuilding it from scratch with a faster, heavier fall."
4. See [playbook/big-moves-not-dials.md](../../playbook/big-moves-not-dials.md).

## "It looks like AI slop"

1. Usual tells: too much bloom and glow, neon on everything, glossy plastic materials, purple-blue gradients, generic
   sci-fi or fantasy filler, emoji or default fonts in the UI, a dashboard-style HUD, mismatched styles.
2. Go back to "the look, in words" in GREAT.md. If it's vague, sharpen it to one direction with the user.
3. Run [look](../look/SKILL.md) on one scene: cut effects first (bloom down or off), one key light, one palette, real
   fonts, line icons. Restraint looks more deliberate than more effects.

## "I ran out of usage" / "the agent stopped halfway"

1. Nothing is lost if HANDOVER.md is current and work is committed (that's why the rules say commit often).
2. When usage resets, the user opens the agent in the same folder and says: "Read START.md and continue my game." The
   agent reads HANDOVER.md and carries on.
3. To use less: lower `maxAgents` in `my-game/helper.json` to 2, use fewer critics per round (2 instead of 5), make
   rounds bigger and fewer, and avoid any repeating check-in loops.
4. Autopilot overnight uses the hours when the user isn't using their plan anyway. See
   [autopilot](../autopilot/SKILL.md).

## Anything else

Read the error message, search [playbook/gotchas.md](../../playbook/gotchas.md), check `git log` for what changed
since it last worked, and fix the cause, not the symptom. Never disable a test or hide an error to make it go away.
