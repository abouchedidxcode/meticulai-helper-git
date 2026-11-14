# Running autopilot in Cursor

How to keep Cursor's agent working on the game for hours without anyone at the keyboard. Cursor changes quickly;
where this page says "check the docs", look the feature up in Cursor's current documentation.

## 1. Permissions: the honest trade-off

Cursor's agent asks before running terminal commands unless they're allowed to run automatically. For an unattended
run, open Cursor's settings for the agent and find the option that lets it run commands without asking (often called
auto-run), and its allow list and deny list. Check the docs for where these live in your version.

- **Recommended:** auto-run with an **allow list** of what autopilot needs: `node tools/`, `bash swarm/`,
  `bash autopilot/`, `git status`, `git diff`, `git log`, `git add`, `git commit`, `git merge`, `git revert`,
  `git worktree`, `git branch`, `npm test`, `npm run`, `ffmpeg`. Put `git push`, `npm publish` and `rm -rf` on the
  deny list.
- **Running everything without asking** is faster to set up but lets a mistaken command through, including outside
  the project. Only on a throwaway machine that holds nothing but this game.
- The practice round in `START-AUTOPILOT.md` shows what's missing: anything that asked for approval goes on the list.

The agent still never publishes, pushes, spends money or opens `.env`: those rules are in the role files.

## 2. Parallel agents

- **On your computer:** recent Cursor versions run several agents side by side, each in its own git worktree that
  Cursor makes. Give each one `agents/builder.md` and its CONTRACTS.md row. Let Cursor manage those worktrees (don't
  also run `swarm/new-worktree.sh` for the same builder). The director still reviews and merges one at a time and runs
  `node tools/serve.mjs --check` after each.
- **Cloud agents** (formerly "background agents") run in Cursor's cloud, on a copy of your GitHub repository, in their
  own virtual machine. They keep going with your laptop closed and you can follow them from a phone, but: they need
  your game in your own GitHub repository (never the kit's), they may cost extra, the game they run lives in their
  machine (your "Play it now" link won't show their work until it's merged and pulled), and the kit's browser lock
  only covers your computer. Check the docs for cost and setup before using them for autopilot.

## 3. Keep it going for hours

- Start one agent chat as the director: paste `agents/director.md` and say: "Run autopilot rounds as in
  `autopilot/round.md` until <time>, or until `my-game/WRAP-UP.md` exists. Show the time at the start of every round.
  Then do the wrap-up steps."
- If the agent stops after a round, or pauses to ask whether to continue, it needs a nudge. Check the docs for settings
  that let it run longer without asking, and test in the practice round how far it gets on its own.
- Don't poll. Wait for agents to finish; if a timer is needed, every 20-30 minutes at most.

## 4. Keep the computer awake

`bash autopilot/keep-awake.sh <hours>`. Charger in, lid open, Cursor left open.

## 5. Check from your phone

Cloud agents can be followed at cursor.com/agents or in Cursor's phone app. An agent running inside Cursor on your
computer usually can't be; use a remote-desktop app, or read `my-game/MORNING.md` when you're back. See
`autopilot/remote.md`.

## 6. Stopping

- Gently: create `my-game/WRAP-UP.md` from `autopilot/WRAP-UP.template.md`, or type "wrap up" in the chat.
- At once: press the stop button in the agent chat, or close Cursor. Finished rounds are committed.
- Afterwards: `bash autopilot/keep-awake.sh --stop`.
