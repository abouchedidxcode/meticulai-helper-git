# One autopilot round

The director (`agents/director.md`) runs this loop until the hours are up. One round = one goal, built by a few
builders, proven by a recording, judged by fresh critics. A round usually takes 30 minutes to two hours. Fewer, bigger
rounds beat many small ones.

Keep a short log as you go in `my-game/.helper/autopilot-log.md` (time, round, what happened, one line each); it
becomes MORNING.md at the end.

## 0. Check before every round (and whenever you wake up)

1. **`my-game/WRAP-UP.md` exists?** Follow it now and stop (see "Wrapping up" below).
2. **Time:** if less than about 40 minutes remain before `autopilot.hours`, don't start a new round: wrap up.
3. **Usage:** if your tool says usage is close to its limit (a warning, a usage meter, a slower or refused reply),
   create `my-game/WRAP-UP.md` from `autopilot/WRAP-UP.template.md` yourself and wrap up. Finishing cleanly beats one
   more round.
4. `git status` is clean, and `node tools/serve.mjs --check` passes. If not, fixing that is this round's goal.

## 1. Read

- `node tools/play/notes.mjs`: the user's notes (they may have played from a phone or before leaving).
- `my-game/GREAT.md` (its five gaps), `HANDOVER.md`, the last `TRIAGE.md`, the last DEVLOG entry.
- `my-game/helper.json`: `maxAgents`, `mayDecideAlone`, `askMeFirst`.

## 2. Plan

- One goal: the top of the last TRIAGE "Fix now", else the top GREAT.md gap. Phrase it as what a player will notice.
- **Is it allowed?** If the goal is in `askMeFirst`, or changes the core verb, the fantasy or the look, deletes
  something the user praised, costs money or is public: don't build it. Add it to the "For you" list (in the
  autopilot log, later MORNING.md) as a short proposal with the evidence, and pick the next goal.
- **Plateau rule:** if the same top complaint has survived three rounds, stop turning dials. Change something
  different in kind: the mechanic, the level layout, the camera, the first 60 seconds. Write why in DECISIONS.md.
- Write `CONTRACTS.md` for the round: 1-5 builders (never above `maxAgents`), split by system and file.

## 3. Build in parallel

- `bash swarm/new-worktree.sh <name>` per builder; start them all at once with `agents/builder.md` and their brief.
- **Wait to be woken** by their completion. No polling. If your tool needs a timer, one check every 20-30 minutes.

## 4. Merge

- Review each diff (`git diff HEAD...swarm/<name>`); send back anything outside its files or anything that weakened a
  test. Then `bash swarm/merge-worktree.sh <name>` (it runs `node tools/serve.mjs --check`).
- If the merged game fails the check and you can't fix it quickly, revert the merge (`git revert -m 1 <merge>`) and
  note it. The game must work at the end of every round.

## 5. Freeze and record

- Commit the merged state first, so the recording matches a commit (other agents can't change it mid-recording).
- `node tools/play/record.mjs --bot --seconds 60 --name round-<n>` (add `--script <file>` if the game has one for this
  goal). It writes `my-game/recordings/<stamp>/` with the video, contact sheets, shots and log.

## 6. Critics, then triage

- Spawn 2-4 critics **in parallel, with fresh context each round** (never reuse last round's): always
  `critic-player`; add `critic-newcomer` when the opening changed, `critic-art` when the look changed,
  `critic-scroller` every few rounds, `bug-hunter` if `log.txt` shows errors. Give each only the recording folder
  and GREAT.md, never your own opinion of the build.
- Then `triage` (`agents/triage.md`): it checks every finding against the code and writes `TRIAGE.md` in the
  recording folder.

## 7. Fix the top 1-3

- Take the "Fix now" items that are in `mayDecideAlone`. Hand them to builders (another short build-merge pass) or,
  if they're tiny, include them in the next round's goal.
- Anything marked "user's call" goes to the "For you" list.

## 8. Commit and write it down

- `git add my-game/ && git commit -m "autopilot round <n>: <goal>"`. Commit after **every** round.
- `DEVLOG.md`: a dated entry with Findings (problem, what, effect, where in code) and What failed.
- `DECISIONS.md`: any decision made alone, marked "(autopilot)".
- `HANDOVER.md`: the "▶ Play this" block and the 3-line status, as if the user could walk in now.
- The autopilot log: one line for the round.

Then go back to step 0.

## Guardrails (all rounds)

- Never deploy, publish, upload or push. Never spend money unless the user approved an amount for this run, and never
  past `falCapUSD`. Never open `.env`.
- Never more than `maxAgents` builders; one browser at a time (the tools take the lock); everything headless.
- No polling loops; wake on completion, 20-30 minute fallback.
- The user's notes outrank every critic. Critics are good at WHERE, unreliable about which direction to move.
- Big moves, not dials. A change the user wouldn't notice isn't worth a round.

## Wrapping up (WRAP-UP.md, the time limit, or low usage)

1. Don't start anything new: no new builders, recordings, critics or paid calls.
2. Finish the change in progress if it's minutes away; otherwise revert it. Stop any builders (merge only what is
   done and reviewed). Never commit broken code.
3. Commit.
4. Write `my-game/MORNING.md` from `autopilot/MORNING.template.md`; run `node tools/serve.mjs --check` last and paste
   its card at the top.
5. Update `HANDOVER.md`, `DEVLOG.md`, `DECISIONS.md`, `paid-ledger.md`. Commit.
6. `bash autopilot/keep-awake.sh --stop`. Close any browser you started. Leave the game's own server running.
7. Cancel any scheduled check-ins or loops you set up. Schedule nothing more.
8. Last message: the Play it now card, the three biggest changes, the "For you" questions.
