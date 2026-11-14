# Running autopilot in Claude Code

How to keep Claude Code working on the game for hours without anyone at the keyboard. The agent does all of this
with the user during the 10-minute setup in `START-AUTOPILOT.md`. Features change between versions: if something
below doesn't match what you see, check the Claude Code docs (code.claude.com/docs) for the named feature.

## 1. Permissions: the honest trade-off

An unattended run must never stop at a "may I?" prompt, or it sits there until morning. There are three ways, from
safest to riskiest. Pick one with the user and say why.

**a) An allow list for this project, plus "don't ask" (most predictable).** List exactly what autopilot needs in the
project's `.claude/settings.json`, and start the run with `claude --permission-mode dontAsk`. In that mode anything
on the list runs, and anything else is refused instead of prompting (the run carries on without it). Example:

```json
{
  "permissions": {
    "allow": [
      "Read", "Edit", "Write", "Glob", "Grep", "Agent",
      "Bash(node tools/*)", "Bash(bash swarm/*)", "Bash(bash autopilot/*)",
      "Bash(git status*)", "Bash(git diff*)", "Bash(git log*)", "Bash(git add*)", "Bash(git commit*)",
      "Bash(git merge*)", "Bash(git revert*)", "Bash(git worktree*)", "Bash(git branch*)",
      "Bash(npm test*)", "Bash(npm run *)", "Bash(npx vitest*)", "Bash(ffmpeg *)", "Bash(ls *)", "Bash(date*)"
    ],
    "deny": [
      "Bash(git push*)", "Bash(npm publish*)", "Bash(rm -rf *)",
      "Read(./.env)", "Read(./.env.*)", "Edit(./.env)"
    ]
  }
}
```

Add a rule whenever the practice round shows something missing. `/permissions` shows and edits these rules.

**b) Auto mode (fewest prompts, good judgment).** `claude --permission-mode auto` (or Shift+Tab until it says Auto).
A separate safety check approves or blocks each action instead of asking you. It isn't available on every plan or
model. Two things to know for long runs: if the safety check blocks several actions in a row, auto mode pauses and
goes back to asking (so a run can still stall), and broad rules like `Bash(*)` are ignored in this mode. Keep the deny
list from (a) either way.

**c) Bypass permissions (no checks at all).** `claude --dangerously-skip-permissions`. Everything runs without any
check, including a mistaken delete. Only use it inside a throwaway virtual machine or container that holds nothing
but this game. Don't use it on your everyday computer.

Whatever you pick: the permissions cover **this game's folder only**. The agent still never publishes, pushes, spends
money or opens `.env`; those are rules in the role files, and the deny list backs them up.

## 2. Keep it going for hours

**Recommended: `/goal`.** It keeps Claude working turn after turn until a condition is met, judged by a separate
model after every turn. Start Claude in the game's folder with the permission mode from step 1, then:

```
/goal Run autopilot rounds as described in autopilot/round.md. Stop when `date` shows it is past 06:30, or
my-game/WRAP-UP.md exists, or usage is running low. Before stopping: the wrap-up steps in autopilot/round.md are done,
my-game/MORNING.md is written and committed, and `node tools/serve.mjs --check` passed last. Show `date` and
whether WRAP-UP.md exists at the start of every round.
```

The checker can only see what is in the conversation, which is why the condition asks the agent to show the time and
the WRAP-UP check every round. While builders or critics are running in the background, the goal waits for them; it
checks in by itself if they run for a long time. `/goal` with no argument shows its state; `/goal clear` stops it.

**Alternative: `/loop`.** `/loop run one autopilot round as described in autopilot/round.md` repeats the prompt;
without an interval Claude picks the wait itself (one minute to one hour). Loops only run while the session is open,
and a repeating loop expires after seven days. Prefer `/goal` for a night's run; `/loop` suits "one round every
couple of hours".

**Don't** set short timers to check on agents. Background subagents wake the director when they finish. If a timer is
truly needed, 20-30 minutes, never every minute: each check re-reads the whole conversation and uses the plan's usage.

**Advanced: one round per fresh session.** `claude -p "<prompt>"` runs one prompt with no window and exits. A small
shell loop can run one round per call until a time, so every round starts with a clean context (the files hold all the
state). No one can answer a prompt in this mode, so use option (a) or (b) above, and test it once while watching.

## 3. Waking on finished work

The director starts builders and critics with the Agent tool. They run in the background, and each one's finish
arrives as a notification that starts the director's next turn. That's the wake-up; no polling needed. `/tasks` lists
what's running.

## 4. Keep the computer awake

`bash autopilot/keep-awake.sh <hours>`. The Claude desktop app also has a keep-awake option in its settings; either
is fine. Charger in, lid open.

## 5. Check from your phone

Turn on **Remote Control** before you leave: type `/remote-control` (or `/rc`) in the session, or start it with
`claude --remote-control`. The session then appears in the Claude app on your phone and in the Code section of the
Claude website, where you can read progress and send messages ("wrap up" works). It needs you to be signed in with a
Claude subscription, not an API key. Details and limits: `autopilot/remote.md`.

## 6. Usage

`/usage` shows how much of the plan's limit is used. You type it; the agent can't run it for itself, so it can only
react to usage warnings it sees. To stay safe: pick an hour limit with some margin, glance at `/usage` from your phone
(Remote Control) now and then, and send "wrap up" or drop a `WRAP-UP.md` if it's getting high. When a limit is hit,
Claude Code pauses; a goal can carry on by itself when the limit resets if the session is still open, which is one
more reason the goal needs an end time.

## 7. Stopping

- Gently: send "wrap up" (from the phone too), or create `my-game/WRAP-UP.md` from `autopilot/WRAP-UP.template.md`.
- At once: Esc in the session (Ctrl+C in a terminal) or close it. `/goal clear` ends the goal; finished rounds are
  committed.
- Afterwards: `bash autopilot/keep-awake.sh --stop`.
