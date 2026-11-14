---
name: plan-swarm
description: Split the build into areas with clear file ownership in my-game/CONTRACTS.md, then run 3-5 builder agents in parallel, each in its own git worktree, and merge their work. Use after GREAT.md is agreed and before any big build step (first playable, feel, look, a fix round).
---

# Plan the swarm

## Goal

Several builders work at the same time without ever editing the same file, and the director (you) merges their work
into one game that runs. `my-game/CONTRACTS.md` says who owns what and how the parts talk.

Before you start: you must be in the kit's workspace (it has `START.md` and `tools/`). If not, do START.md step 0.

## When not to swarm

- The game is tiny or the step is one system. One builder is faster than coordinating three.
- Your tool can't run subagents. Then use CONTRACTS.md anyway as your own work order, and do each area in turn
  (see "If your tool can't run subagents" in START.md).

## Roles

- **Director: you**, following [agents/director.md](../../agents/director.md). You write CONTRACTS.md, start the
  builders, review their diffs, merge, run the checks, and talk to the user. You don't write game code while a swarm
  runs: if you do, nobody reviews it.
- **Builders:** 3-5, never more than `maxAgents` in `my-game/helper.json`. Each gets
  [agents/builder.md](../../agents/builder.md) plus its section of CONTRACTS.md.

## Write CONTRACTS.md

Fill `my-game/CONTRACTS.md` (from the template). Split **by system and by file**, never by "half the work each".

Typical areas for a first game (pick the 3-5 that matter now):

| Area | Owns (example files) | Done when |
| --- | --- | --- |
| core | `src/game.js`, `src/rules.js`, `src/tuning.json` | the verb works, win and lose exist |
| feel | `src/player.js`, `src/camera.js`, `src/fx.js` | inputs answer in under 100 ms, impacts land |
| world | `src/level*.js`, `src/world.js` | the place exists and reads clearly |
| look | `src/render.js`, `src/materials.js`, `public/textures/` | one scene matches "the look in words" |
| audio | `src/audio.js`, `public/audio/` | every action has a sound |
| ui | `src/ui.js`, `index.html`, `src/style.css` | title, HUD, results, pause |

For each area write: owner name, the files it may edit, the files it may only read, what it exposes to the others (the
events on `window.__game.events`, the functions, the state fields), and what "done" means for this round, in terms a
recording can show. Shared files (like `src/main.js`) belong to one owner; others ask the director for changes.

## Start the builders

1. Commit everything first. Builders branch from your latest commit.
2. For each builder: `bash swarm/new-worktree.sh <area>`. It makes a separate folder next to the kit, on branch
   `swarm/<area>`, with the game's packages copied in, and prints where. If your tool makes its own worktrees (Cursor's
   parallel agents), use those instead; if it can't do worktrees at all, rely on file ownership alone. Details per tool:
   [swarm/README.md](../../swarm/README.md).
3. Spawn each builder with: its role file, its CONTRACTS.md section, GREAT.md, the worktree folder, and the round's
   goal. Give them the material, not your conclusions.
4. Builder rules (also in `agents/builder.md`): edit only your own files; **commit only your own files**
   (`git commit -m "<area>: <what>" -- <paths>`, never `git add -A`); one browser at a time (the tools take a lock);
   don't run `tools/serve.mjs` in a worktree (it would take the main game's port); report what you changed, how you
   tested it, and what you couldn't test.
5. Start them all in the same turn, then let them run. Don't poll; their completion wakes you. If your tool can't wake
   you, check once every 20-30 minutes, never every minute. `bash swarm/list.sh` shows where each one is.

## Merge

For each finished builder:
1. Read the diff (`git diff HEAD...swarm/<area>` from the main folder). Check it stayed in its files and matches the
   contract. Reject anything that edits another area's file without a reason.
2. `bash swarm/merge-worktree.sh <area>`. It merges the branch, backs out cleanly on a conflict, runs
   `node tools/serve.mjs --check`, and removes the worktree. On a conflict: tell that builder (or a fresh one) to
   rebase onto the merged work, or resolve it yourself, keeping both sides' intent.
3. Merge one builder at a time. After the last one, record a short run
   (`node tools/play/record.mjs --bot --seconds 30`) and look at it to see that the parts work together.
4. Update CONTRACTS.md (what changed in how parts talk), DEVLOG.md, HANDOVER.md. Commit.
5. [Hand-back](../hand-back/SKILL.md).

## What to say to the user

Briefly, once: "I'm splitting the work across 4 helpers that build at the same time: one on controls, one on the
level, one on sound, one on menus. I'll check and combine their work and send you a link when it's together."

## Done means

Every builder's work is merged or rejected with a reason, the merged game passes `--check`, and the user has a link.

## Common mistakes

- Two builders on one file. It always ends in a lost change. Split the file or give it one owner.
- Starting more builders than the machine or the plan can carry. Five slow builders finish later than three fast ones,
  and burn more usage.
- Merging without reading the diff. Builders sometimes "fix" another area or delete a test.
- Builders judging their own work. Judgement comes from the [playtest](../playtest/SKILL.md) loop with fresh critics.
