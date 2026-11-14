# Contracts: who owns what

<!-- Written by the director before builders start (skills/plan-swarm). It lets several agents build at once without
     editing the same files. A full example is in swarm/contracts-example.md.
     Split by SYSTEM and FILE, not by task. Every file has exactly one owner. 3-5 builders max (and never more than
     maxAgents in helper.json). -->

**Round:** <!-- number and date -->  **Goal this round:** <!-- the top gap from GREAT.md, in one line -->

| Area | Owner | Files | Talks to others through |
| --- | --- | --- | --- |
| <!-- core loop --> | <!-- builder-loop --> | <!-- src/game/*.js --> | <!-- emits 'score', 'win', 'death'; reads input from src/feel/input.js --> |
| docs, plan, merges | director | GREAT.md, HANDOVER.md, DECISIONS.md, DEVLOG.md, CONTRACTS.md | reviews every diff |

## Rules

1. Only edit files in your row. Need a change in someone else's file? Write the exact change in your report.
   If it's tiny and blocks you, make it and say so.
2. Commit only your own files: `git commit -m "<area>: <what>" -- <your paths>`. Never `git add -A`.
3. Keep the game running at every commit. No half-built code paths nobody has run.
4. Don't change values the user saved in `src/tuning.json` without saying so in your report.
5. One browser at a time (the tools take the lock). No polling.
6. Shared names (events, `window.__game`, URL switches) never change; add new ones freely.

## Shared hooks this round

<!-- Anything one builder creates that another uses: a function, an event, a field. Who creates it, and by when.
     Example: "builder-feel adds events.emit('land', { speed }) in its first commit; builder-juice listens for it." -->
