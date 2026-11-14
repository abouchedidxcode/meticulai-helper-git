---
description: "Split the next build step across several agents working in parallel"
argument-hint: "[what to build next]"
---

Workspace check: if the current folder doesn't contain `START.md` and `tools/doctor.mjs`, you're not in a copy of
the kit yet. Read `${CLAUDE_PLUGIN_ROOT}/START.md` and do its step 0 (get a local copy, then set up) first.

Follow `skills/plan-swarm/SKILL.md`.

If the user wrote something after the command ("$ARGUMENTS"), make it the goal of this round.

Talk to the user in plain words. End the turn with the hand-back in `skills/hand-back/SKILL.md`.
