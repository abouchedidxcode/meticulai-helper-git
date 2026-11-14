# Swarm: several agents building one game at once

**In plain words:** instead of one AI agent doing everything in turn, a "director" agent splits the work into parts
(controls, the level, sound, menus...) and hands each part to its own "builder" agent. The builders work at the same
time, each in its own copy of the game folder, so they never overwrite each other. The director checks each one's
work, combines it, makes sure the game still runs, and gives you a link to play.

You don't need to do anything to make this happen. Your agent follows `skills/plan-swarm/SKILL.md` and
`agents/director.md`. This page is the reference it uses.

## The rules (for every tool)

1. **3-5 builders per game, never more than `maxAgents` in `my-game/helper.json`.** More agents is not better. One
   laptop running twelve sessions at once slowed to a crawl, the sessions killed each other's test browsers, and a
   week of the plan's usage went in a few days. Three builders with clear jobs beat ten with vague ones.
2. **Split by system and by file.** Each builder owns a list of files (in `my-game/CONTRACTS.md`). Every file has
   one owner. Two jobs that need the same file go to one builder, or run one after the other.
3. **One git worktree per builder.** A worktree is a second folder with its own branch that shares the game's history.
   `bash swarm/new-worktree.sh <name>` makes one. Builders never work in the main folder.
4. **Commit only your own files:** `git commit -m "<area>: <what>" -- <paths>`. Never `git add -A`.
5. **One browser at a time on the machine.** The kit's tools (`tools/play/record.mjs`, `fps.mjs`, `serve.mjs --check`)
   take a machine-wide lock and run hidden (headless). Agents never open their own browser windows.
6. **No polling.** After starting builders or a recording, wait to be woken by their completion. If your tool can't
   wake you, check once every 20-30 minutes, never every minute (each check re-reads the whole conversation and
   burns usage).
7. **The director reviews every diff before merging,** then runs `node tools/serve.mjs --check`.
   `bash swarm/merge-worktree.sh <name>` does the merge, the check and the clean-up.
8. **The director never builds.** It plans, reviews, merges and keeps the docs. If it starts writing game code,
   nobody is reviewing.

## The scripts

| Command | What it does |
| --- | --- |
| `bash swarm/new-worktree.sh <name>` | A new folder `../<kit folder>-worktrees/<name>` on branch `swarm/<name>`, from the current commit, with the game's packages copied in so it runs. Refuses if the main folder has uncommitted changes (`--force` to override). |
| `bash swarm/merge-worktree.sh <name>` | Merges the builder's branch (refuses if the builder left uncommitted work), backs out cleanly on a conflict, runs `node tools/serve.mjs --check`, then removes the folder and branch. `--keep` keeps them; `--no-check` skips the check. |
| `bash swarm/list.sh` | Every builder: commits waiting to be merged, uncommitted changes, last commit. |

The worktrees live **outside** the kit folder (next to it), so the game's dev server, file watchers and search tools
never scan them. Builders don't run `tools/serve.mjs` in their worktree: it would use the main game's port. They test
without a browser where they can; the director checks the merged game in the browser.

## Claude Code

- **Roles:** `agents/*.md` are Claude Code subagent files (name, description, tools, then the role prompt). When the
  kit is installed as a Claude Code plugin, they're available as subagent types with the plugin's name as a prefix
  (for example `meticulai-helper-git:builder`). If they aren't, start a general-purpose agent and give it the role
  file's text as its instructions; that works everywhere.
- **The director is the main session.** Either just tell Claude to follow `agents/director.md`, or start it as the
  director with `claude --agent director` (check `claude --help` if your version needs the plugin prefix). Only the
  director spawns agents; builders and critics don't spawn their own.
- **Parallel:** the director starts every builder in the same turn (several Agent tool calls in one message). They run
  in the background, and each one's completion notification wakes the director. No timers needed while they run.
- **Worktrees:** Claude Code can also give a subagent its own temporary worktree (`isolation: worktree`), but that
  copy starts from the repository's default branch, not from the latest commit you're on. The kit uses
  `swarm/new-worktree.sh` instead, so every builder starts from exactly where the game is, and the director decides
  when to merge.
- **Permissions:** builders in the background still raise permission prompts in your session. Set permissions up
  before a long run (`autopilot/run-claude-code.md`).

## Codex

- Recent versions of Codex (the CLI and the app) can run **subagents**: ask it to "spawn three agents, one per row of
  CONTRACTS.md". Its `/subagents` command shows the running ones.
- You can define the roles as custom agents: Codex reads one TOML file per agent from `.codex/agents/` in the project
  (fields `name`, `description`, `developer_instructions`). Paste a role file's body into `developer_instructions`.
- The number of agents running at once can be capped in Codex's config; set it to `maxAgents`. Subagents share the
  main session's sandbox and approval settings, so set those before you start (see `autopilot/run-codex.md`).
- These features change often. Check the Codex docs ("subagents") for the current names before relying on them.
  If your version has no subagents, run the roles one after another (below).
- Codex cloud tasks run on a copy of your code in the cloud, not on your computer: they can't see your running game,
  the recordings or the browser lock. Use them only for code-only jobs, and only if your game is in your own private
  GitHub repository (never the kit's).

## Cursor

- **Parallel agents on your computer:** recent Cursor versions can run several agents side by side, each in its own
  git worktree that Cursor creates and manages. If you use those, let Cursor make the worktrees (don't also run
  `new-worktree.sh` for the same builder), give each agent its role file and its CONTRACTS.md row, and still merge one
  at a time with a review and `node tools/serve.mjs --check` after each.
- **Cloud agents** (formerly "background agents") run on Cursor's servers on a copy of your GitHub repository. Same
  limits as Codex cloud: they can't see the running game or record it, need your own repository, and may cost extra.
  Good for code-only jobs; the director still reviews and merges locally.
- Check Cursor's docs for the current names and limits; they change between versions.

## Any other tool (or no subagents)

The director plays the roles one after another, in the same session:

1. Write CONTRACTS.md as usual. It becomes your work order.
2. For each row: read `agents/builder.md`, do that row's work only, test it, commit only those files.
3. After building: record (`node tools/play/record.mjs --bot --seconds 60`), then read each critic's role file and
   judge the recording as that critic, using only the recording folder and GREAT.md, as if you had never seen the
   code. Then do triage (`agents/triage.md`).

It's slower, and self-review is weaker than a fresh agent's, but the process still works. Worktrees are optional
here: one agent can't step on itself.

## What a round looks like

```
director: read notes, GREAT.md, HANDOVER, last TRIAGE  ->  write CONTRACTS.md
director: new-worktree.sh for each builder  ->  start builders in parallel  ->  wait (no polling)
builders: build their own files, write a failing-then-passing test, commit their files, report
director: review each diff  ->  merge-worktree.sh <name>  ->  serve.mjs --check
director: record.mjs  ->  critics in parallel (fresh context, recording + GREAT.md only)  ->  triage
director: update HANDOVER, DECISIONS, DEVLOG; commit; hand back with the Play it now card
```

An example CONTRACTS.md for the starter game: `swarm/contracts-example.md`.
