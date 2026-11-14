---
name: playtest
description: The improvement loop - record a play-through, have fresh critics watch it, triage their findings against the code, fix the top 1-3 with big moves, re-record and compare. Use after every build round, whenever you're unsure what to do next, and as the core of autopilot.
---

# Playtest loop

## Goal

Each round makes the game noticeably better at the thing that hurts most, judged by watching it played, not by the
builder's opinion of their own code and not by still screenshots.

Before you start: you must be in the kit's workspace (it has `START.md` and `tools/`). If not, do START.md step 0.
Background: [playbook/who-to-trust.md](../../playbook/who-to-trust.md),
[playbook/big-moves-not-dials.md](../../playbook/big-moves-not-dials.md).

## Who to trust, in order

1. **The user's own play** and their notes (`node tools/play/notes.mjs`). Always read these first.
2. **Measured numbers:** fps (`tools/play/fps.mjs`), loudness (`tools/play/loud.mjs`), bot scores, errors in the log.
3. **Two critics agreeing** independently.
4. **One critic.** A hint, not an order. Critics are often wrong; triage checks every finding against the code.

Bots tune numbers (balance, difficulty, timing). They never tell you it's fun.

## One round

1. **Record.** `node tools/play/record.mjs --bot --seconds 60 --name <round>` for general play, or `--script <file>`
   to show a specific moment (see play scripts in ARCHITECTURE.md). Use `--seed 1` so before and after are comparable.
   Output: `my-game/recordings/<stamp>/` with `video.mp4`, `sheet-*.jpg` (12 frames each, game-time stamped),
   `shots/`, `log.txt`.
2. **Critics, fresh, in parallel.** Spawn each with **only the recording folder and `my-game/GREAT.md`**. Not your
   notes, not the code, not your opinion of what's wrong. A critic who is told the hypothesis confirms it.
   - [agents/critic-player.md](../../agents/critic-player.md): is it fun, does it feel great, the weakest moment.
   - [agents/critic-newcomer.md](../../agents/critic-newcomer.md): a stranger's first minute: what's confusing, where
     they'd quit. Use a recording that includes the title screen.
   - [agents/critic-art.md](../../agents/critic-art.md): does the look match GREAT.md in motion; anything that looks
     like a prototype or AI-made.
   - [agents/critic-scroller.md](../../agents/critic-scroller.md): would a 10-second clip make someone stop scrolling.
   Pick 2-4 per round based on what you're working on; all four for a big checkpoint. Each saves its report as
   `critic-<role>.md` in the recording folder.
   If `log.txt` shows errors, or a critic or the user reports something broken, also spawn
   [agents/bug-hunter.md](../../agents/bug-hunter.md): it reproduces the bug, writes a failing test and points at the
   cause (in `bugs-<stamp>.md` in the recording folder); a builder then fixes it.
3. **Triage.** Spawn [agents/triage.md](../../agents/triage.md) with the critics' reports, the user's notes and the code.
   It checks each finding against the code (is it real? what causes it?), merges duplicates, and ranks by how much it
   hurts the experience described in GREAT.md. Output: `my-game/recordings/<stamp>/TRIAGE.md`.
4. **Fix the top 1-3** with builders ([plan-swarm](../plan-swarm/SKILL.md)), one area each. Each fix is a **big move**:
   rework the camera, rebuild the jump, restructure the first level. Not "bloom 0.4 -> 0.35".
5. **Re-record with the same seed and script**, and compare against the previous round. Write in DEVLOG.md: the top
   complaint before, what you changed, whether the new recording shows it fixed.
6. [Hand-back](../hand-back/SKILL.md). Name the one thing the user should try to judge this round's fix.

## The plateau rule

If three rounds in a row don't move the top complaint, stop doing more of the same. Change something different in
kind: a new control scheme instead of tuning the old one, a new camera, a different level structure, cutting the
mechanic that isn't working, or a v2 (see [playbook/when-to-start-over.md](../../playbook/when-to-start-over.md)).
Write the decision in DECISIONS.md.

## What to say to the user

> I had four fresh reviewers watch a recording. They agreed on one thing: the first thirty seconds are empty, you just
> fly around with nothing to aim for. I moved the first light right in front of you and made the room glow when you
> grab it. Try the start again and tell me if it pulls you in now.

## Done means (for one round)

The top issue is fixed and the re-recording shows it, DEVLOG.md has the before/after, and the user has the link.

## Common mistakes

- Critics given your conclusions. Give them the material only.
- Fixing every finding. Fix the top 1-3; the rest go in HANDOVER.md's list.
- Judging from one still frame. Fun and feel only show in sequence.
- Scoring screenshots with a number and chasing it. Reviewer noise is as big as small tweaks; you'll go in circles.
- Ignoring the user's note because three critics disagree. The user is the one who plays it.
- Running more than one browser at once. The tools take a lock; don't work around it.
