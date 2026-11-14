# Running autopilot in Codex

How to keep OpenAI's Codex working on the game for hours without anyone at the keyboard. Codex changes quickly;
where this page says "check the docs", look up that feature in the current Codex documentation rather than guessing.

## 1. Permissions: the honest trade-off

Codex runs commands inside a **sandbox** (what it may touch) with an **approval policy** (when it must ask you). For an
unattended run it must not stop to ask, so set both before you leave, in the session with `/permissions`, or as
options when you start it, or in Codex's config file (`sandbox_mode`, `approval_policy`; check the docs for the
current names and values).

- **Recommended:** let it write inside this game's folder without asking, and keep everything outside the folder off
  limits. That is the "workspace write" kind of sandbox with an approval policy that never asks. Commands that need
  more than the sandbox allows then fail instead of waiting, and the agent works around them or writes them down.
- Things to check in the practice round, because sandboxes often block them: starting the game's dev server and
  opening `localhost`, launching the hidden test browser (`node tools/serve.mjs --check`,
  `node tools/play/record.mjs`), `npm install` (needs the network), `git commit` and `git worktree`. If any fail,
  check the docs for allowing local network access or extra folders, and allow only what's needed.
- **No sandbox at all** (Codex's "full access" or `--yolo` style options): every command runs unchecked, including a
  mistaken delete outside the project. Only inside a throwaway virtual machine or container that holds nothing but this
  game.

Whatever you pick, the agent still never publishes, pushes, spends money or opens `.env`: those rules are in the role
files.

## 2. Parallel agents

Recent Codex versions can spawn **subagents** and run them in parallel. Ask the director session to "spawn one agent
per row of CONTRACTS.md, each following agents/builder.md". `/subagents` shows them. Subagents use the same sandbox
and approval settings as the main session, so step 1 covers them too. If the number running at once is configurable
in your version, set it to `maxAgents`. More in `swarm/README.md`.

## 3. Keep it going for hours

- **One long session:** paste the director's instructions (`agents/director.md`) and say: "Run autopilot rounds as in
  `autopilot/round.md` until <time>, or until `my-game/WRAP-UP.md` exists. Show the time at the start of every
  round. Then do the wrap-up steps." Codex may stop after a round and wait for you; if it does, use the next option.
- **One round per run:** `codex exec "<prompt>"` runs one prompt with no window and exits. A small shell loop can run
  one round per call until a set time, each starting fresh (the files hold the state). Any action that needs an
  approval fails in this mode instead of waiting, so the sandbox must already allow what a round needs. Test one round
  while you watch.
- Codex **cloud tasks** run on a copy of your code in the cloud, not on your computer, so they can't run the game or
  record it here. Not suited to autopilot.
- Don't poll. Wait for subagents to finish; if a timer is needed, every 20-30 minutes at most.

## 4. Keep the computer awake

`bash autopilot/keep-awake.sh <hours>`. Charger in, lid open.

## 5. Check from your phone

See `autopilot/remote.md`. Whether you can see a Codex session running on your computer from your phone depends on
your version: check the Codex docs for remote access. Otherwise use a remote-desktop app, or just read
`my-game/MORNING.md` when you're back.

## 6. Stopping

- Gently: create `my-game/WRAP-UP.md` from `autopilot/WRAP-UP.template.md`, or type "wrap up".
- At once: Esc or Ctrl+C in the Codex window, or close it. Finished rounds are committed.
- Afterwards: `bash autopilot/keep-awake.sh --stop`.
