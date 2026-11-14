---
description: "Generate pictures, textures, props, sounds or music with fal (costs money, asks first)"
argument-hint: "[what to generate]"
---

Workspace check: if the current folder doesn't contain `START.md` and `tools/doctor.mjs`, you're not in a copy of
the kit yet. Read `${CLAUDE_PLUGIN_ROOT}/START.md` and do its step 0 (get a local copy, then set up) first.

Follow `skills/generate-assets/SKILL.md`. Always a dry run first, show the cost, wait for a yes.

If the user wrote something after the command ("$ARGUMENTS"), that is what they want generated. Still check free options first and still ask before spending.

Talk to the user in plain words. End the turn with the hand-back in `skills/hand-back/SKILL.md`.
