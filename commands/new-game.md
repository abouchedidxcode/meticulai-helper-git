---
description: "Start a new game: the eight-question interview that writes GREAT.md"
argument-hint: "[your idea, in a sentence]"
---

Workspace check: if the current folder doesn't contain `START.md` and `tools/doctor.mjs`, you're not in a copy of
the kit yet. Read `${CLAUDE_PLUGIN_ROOT}/START.md` and do its step 0 (get a local copy, then set up) first.

Follow `skills/new-game/SKILL.md`. If setup has not been done (no `my-game/` folder), do `skills/setup/SKILL.md` first.

If the user wrote an idea after the command ("$ARGUMENTS"), treat it as the answer to question 1 and start with question 2.

Talk to the user in plain words. End the turn with the hand-back in `skills/hand-back/SKILL.md`.
