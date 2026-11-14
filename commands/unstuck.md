---
description: "Something is wrong or it isn't fun: diagnose it and fix it"
argument-hint: "[what is wrong]"
---

Workspace check: if the current folder doesn't contain `START.md` and `tools/doctor.mjs`, you're not in a copy of
the kit yet. Read `${CLAUDE_PLUGIN_ROOT}/START.md` and do its step 0 (get a local copy, then set up) first.

Follow `skills/unstuck/SKILL.md`.

If the user described the problem after the command ("$ARGUMENTS"), go straight to the matching branch. If not, ask one question: "What is going wrong, in a sentence?"

Talk to the user in plain words. End the turn with the hand-back in `skills/hand-back/SKILL.md`.
