# WRAP UP

<!-- To stop autopilot cleanly: copy this file to my-game/WRAP-UP.md (same folder as GREAT.md).
     The agent checks for it at the start of every round and whenever it wakes up.
     It finishes what it's doing, saves, writes MORNING.md, and stops.
     You can also just tell the agent "wrap up". To stop instantly instead, press Esc in its window or close it. -->

**Stop autopilot now.** Written by: <!-- the user / the agent (usage running low) / a scheduled check -->
<!-- Optional: a reason or a note for the agent, e.g. "I need the laptop at 9" or "usage is at 90%". -->

Agent, do this in order. Start no new work: no builders, recordings, critics or paid generation.

1. Finish the change in progress only if it's minutes away; otherwise revert it. Never commit broken code.
2. Stop builders and critics. Merge only work that is finished and reviewed; leave the rest on its branch and say so.
3. Run the tests and `node tools/serve.mjs --check`. The game must work.
4. Commit.
5. Write `my-game/MORNING.md` from `autopilot/MORNING.template.md`, with the Play it now card at the top.
6. Update `HANDOVER.md` (written for someone with no memory of this session: "▶ Play this", 3-line status, first
   thing a new session should do, next 5), `DEVLOG.md`, `DECISIONS.md`, `paid-ledger.md`. Commit.
7. `bash autopilot/keep-awake.sh --stop`. Close browsers you started; leave the game's server running.
8. Cancel every scheduled check-in or loop. Schedule nothing more.
9. Rename this file to `WRAP-UP-done-<date>.md` so the next run doesn't stop at once.
10. Last message, three lines: the Play it now card, the biggest change, the first thing to try.
