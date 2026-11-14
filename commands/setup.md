---
description: "Set up the kit on this computer and create the game folder"
argument-hint: "[working title]"
---

Workspace check: if the current folder doesn't contain `START.md` and `tools/doctor.mjs`, you're not in a copy of
the kit yet. Read `${CLAUDE_PLUGIN_ROOT}/START.md` and do its step 0 (get a local copy, then set up) first.

Follow `skills/setup/SKILL.md`.

If the user wrote something after the command ("$ARGUMENTS"), use it as the working title for `node tools/init.mjs --name`. Otherwise use "My Game".

Talk to the user in plain words. End the turn with the hand-back in `skills/hand-back/SKILL.md`.
