---
description: "Make sure the game runs and give me the link to play it"
---

Workspace check: if the current folder doesn't contain `START.md` and `tools/doctor.mjs`, you're not in a copy of
the kit yet. Read `${CLAUDE_PLUGIN_ROOT}/START.md` and do its step 0 (get a local copy, then set up) first.

Don't change the game. Run `node tools/play/notes.mjs`, then `node tools/serve.mjs --check`. If it fails, fix only what stops it from running. Then give the card from `skills/hand-back/SKILL.md`, with "What changed" as the last few entries in `my-game/DEVLOG.md`.

If the user wrote something after the command ("$ARGUMENTS"), answer it after the card.

Talk to the user in plain words. End the turn with the hand-back in `skills/hand-back/SKILL.md`.
