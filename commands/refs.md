---
description: "Add pictures or videos for the look, and turn them into a description of the look"
argument-hint: "[what the refs are for]"
---

Workspace check: if the current folder doesn't contain `START.md` and `tools/doctor.mjs`, you're not in a copy of
the kit yet. Read `${CLAUDE_PLUGIN_ROOT}/START.md` and do its step 0 (get a local copy, then set up) first.

Follow `skills/references/SKILL.md`.

If the user wrote something after the command ("$ARGUMENTS"), treat it as what they want the references to guide.

Talk to the user in plain words. End the turn with the hand-back in `skills/hand-back/SKILL.md`.
