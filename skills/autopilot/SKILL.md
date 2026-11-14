---
name: autopilot
description: Run the game unattended for hours - repeated rounds of record, critique, triage and fix with builders - inside guardrails the user set, ending with a MORNING.md report that opens with the Play it now card. Use when the user wants the agent to keep working while they're away (overnight, a workday).
---

# Autopilot

## Goal

The user comes back to a clearly better game, a working link, and a short report of what happened, with no money spent
they didn't approve and nothing published.

Before you start: you must be in the kit's workspace (it has `START.md` and `tools/`). If not, do START.md step 0.

The full procedure lives in the autopilot folder. Read both before starting:
- [autopilot/START-AUTOPILOT.md](../../autopilot/START-AUTOPILOT.md): setting it up, the guardrails, how to start it
  in each tool ([run-claude-code.md](../../autopilot/run-claude-code.md), [run-codex.md](../../autopilot/run-codex.md),
  [run-cursor.md](../../autopilot/run-cursor.md)), keeping the computer awake, checking in from a phone
  ([remote.md](../../autopilot/remote.md)).
- [autopilot/round.md](../../autopilot/round.md): exactly what one round does.

## Before starting: agree the limits (ask, one at a time)

1. "How long should I run? For example, 8 hours overnight." -> `autopilot.hours` in `my-game/helper.json`.
2. "What can I decide on my own?" Offer a default: "controls, camera, level layout, sound, visual polish, fixing
   bugs." -> `autopilot.mayDecideAlone`.
3. "What should I leave for you?" Offer a default: "changing the main idea, cutting a feature you asked for, changing
   the look direction, any spending." -> `autopilot.askMeFirst`. Those become proposals in MORNING.md, not changes.
4. Budget during autopilot: by default **no paid generation** while unattended, even within the cap, unless the user
   explicitly says otherwise.

Then: commit, run `bash autopilot/keep-awake.sh <hours>` so the computer doesn't sleep, and start as the right
`run-*.md` says.

## Guardrails (summary; the autopilot files are the full version)

- **Time:** stop at `autopilot.hours`. Leave time for the wrap-up.
- **Money:** never above `falCapUSD`; nothing paid unless the user said so for this run.
- **Never publish**, never push anywhere, never upload.
- **Scope:** only what `mayDecideAlone` allows. Everything in `askMeFirst` becomes a proposal.
- **Every round ends committed and playable** (`node tools/serve.mjs --check` passes). A round that breaks the game
  is reverted, not left half-done.
- **Big moves, plateau rule:** if three rounds don't move the top complaint, change approach in kind.
- **Machine:** at most `maxAgents` builders, one browser at a time, headless, no polling.
- **Usage:** if the plan's usage is nearly out, stop early and write the report (see
  `autopilot/WRAP-UP.template.md`). An unfinished round is worse than one fewer round.

## Roles per round

Director (you, [agents/director.md](../../agents/director.md)), 2-4 builders, 2-4 fresh critics, triage. A new set of
critics every round, so nobody grows attached to their earlier opinions.

## The return report: `my-game/MORNING.md`

From `autopilot/MORNING.template.md`. It **opens with the Play it now card** (run `serve.mjs --check` last, after
everything else is done), then:
- the three biggest improvements, in plain words, with what to try for each;
- what's still rough;
- decisions waiting for them (the `askMeFirst` proposals), each a yes/no question;
- money spent (normally $0);
- rounds run, and where the recordings are, for the curious.

When they return, the first message to them is the card and the three improvements, not the whole log.

## Done means

The time is up (or usage ran low), the last round is committed, the link works, and MORNING.md is written.

## Common mistakes

- Starting without agreed limits. The user won't remember what they allowed.
- Many tiny rounds. Fewer, bigger rounds use less and change more.
- Leaving the game broken at the end because the last round ran out of time. Revert it.
- A long MORNING.md. One screen. Details go in DEVLOG.md.
