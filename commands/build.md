---
description: "Do the next sensible build step: first playable, feel, or look"
argument-hint: "[what to work on]"
---

Workspace check: if the current folder doesn't contain `START.md` and `tools/doctor.mjs`, you're not in a copy of
the kit yet. Read `${CLAUDE_PLUGIN_ROOT}/START.md` and do its step 0 (get a local copy, then set up) first.

Read `my-game/HANDOVER.md`, `my-game/GREAT.md` and new notes (`node tools/play/notes.mjs`). Then pick the next step:
- No playable core loop yet: `skills/first-playable/SKILL.md`.
- The loop works but actions feel weak, floaty or silent: `skills/feel/SKILL.md`.
- It plays and feels good but looks unfinished: `skills/look/SKILL.md`.
- All three are in decent shape: `skills/playtest/SKILL.md`, or `skills/first-minute/SKILL.md` before shipping.

If the user wrote something after the command ("$ARGUMENTS"), that wins: work on what they asked, using the matching skill. Tell them in one sentence which step you picked and why.

Talk to the user in plain words. End the turn with the hand-back in `skills/hand-back/SKILL.md`.
