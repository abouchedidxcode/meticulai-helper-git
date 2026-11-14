---
description: "Keep working on the game unattended for hours, inside limits you set"
argument-hint: "[hours]"
---

Workspace check: if the current folder doesn't contain `START.md` and `tools/doctor.mjs`, you're not in a copy of
the kit yet. Read `${CLAUDE_PLUGIN_ROOT}/START.md` and do its step 0 (get a local copy, then set up) first.

Follow `skills/autopilot/SKILL.md`, which points to `autopilot/START-AUTOPILOT.md` and `autopilot/round.md`.

If the user wrote a number after the command ("$ARGUMENTS"), use it as the hours. Still agree the other limits first.

Talk to the user in plain words. End the turn with the hand-back in `skills/hand-back/SKILL.md`.
