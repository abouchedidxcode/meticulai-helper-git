# Starting autopilot

## For you (the person): the 10-minute checklist before you leave

Your agent walks you through this. It takes about ten minutes, with you at the computer.

- [ ] **You agree with `GREAT.md`.** The agent reads it back; it's what every change is judged against overnight.
- [ ] **The look is confirmed** in words (and your reference pictures, if you added any, are described in `refs/REFS.md`).
- [ ] **How long:** e.g. "8 hours".
- [ ] **Money:** by default nothing is spent while you're away. Say an amount only if you want it to generate art or
      sound unattended.
- [ ] **How many helper agents at once:** the default is fine for most computers.
- [ ] **What it may decide alone, and what it must leave for you.** The defaults are below; change anything you like.
- [ ] **A practice round while you watch** (a few minutes), so any "allow this?" question pops up now, not at 3 am.
- [ ] **Charger in, lid open.** The agent keeps the computer awake.
- [ ] **You know how to stop it** (bottom of this page).

When you come back, open `my-game/MORNING.md` (or read the agent's last message). It starts with the link to play.

---

## For the agent: setting up an unattended run

Follow these steps in order, with the user present. Ask one question at a time, in plain words, each with the
default as an example answer. Write every answer into `my-game/helper.json` as you go.

### 1. The yardstick is agreed

- `my-game/GREAT.md` exists and the user said yes to it. If it's missing or stale, do `skills/new-game` first.
- The look is confirmed in words ("The look, in words" in GREAT.md, and `refs/REFS.md` if there are references).
  Read it back in two sentences and get a yes. Without this, critics overnight will pull the look in random
  directions.
- `my-game/HANDOVER.md` is current; the tree is committed (`git status` clean).

### 2. The limits, in `helper.json`

```json
"maxAgents": 4,
"autopilot": {
  "hours": 8,
  "mayDecideAlone": ["bug fixes", "feel tuning", "level layout", "performance", "audio levels", "polish the critics asked for"],
  "askMeFirst": ["changing the core verb or the fantasy", "art direction changes", "deleting features the user praised", "spending money", "anything public"]
}
```

- **hours:** when to stop. Plan the last round to end 20 minutes before, to leave time for MORNING.md.
- **Money:** the default is **no new spending during autopilot**, even if `falCapUSD` is above zero. Only if the user
  names an amount for this run (and what it's for), write it as a line under the cap in `paid-ledger.md`
  ("Autopilot <date>: up to $X approved for <what>") and as an entry in DECISIONS.md. It still counts against
  `falCapUSD`; never go above that. Every call goes in the ledger.
- **maxAgents:** builders at once. 3-4 is right for most laptops; 2 on an older machine. More is not faster: one
  laptop running twelve agents slowed to a crawl and used a week of the plan's usage in days.
- **mayDecideAlone / askMeFirst:** offer the defaults above and let the user edit them. Anything in `askMeFirst` is
  never done overnight: it goes to the "For you" list in MORNING.md as a short proposal.
- Commit `helper.json`.

### 3. Permissions, so it never stalls on a prompt

An unattended run that stops at a "may I run this?" prompt at 1 am does nothing until morning. Set permissions up now,
for this project folder only. Read the right guide for the tool you're running in and do what it says:
`autopilot/run-claude-code.md`, `autopilot/run-codex.md`, `autopilot/run-cursor.md`.

Explain the trade-off to the user honestly, in one or two sentences: "I'll get permission to run commands and edit files
inside this game's folder without asking each time. That's what lets me work while you sleep. I still won't publish,
spend money, or touch anything outside this folder."

### 4. A practice round while the user watches

Run one short round (follow `autopilot/round.md` with one builder and one critic, a 30-second recording). Its job is to
make every kind of permission prompt appear while the user is there to approve it permanently for this project. Watch
for: `git`, `node tools/...`, `bash swarm/...`, `npm`, `ffmpeg`, starting agents, writing files in `my-game/`.
If anything prompted, fix the permission setup and say what you changed. Commit the practice round's work.

### 5. Keep the computer awake

`bash autopilot/keep-awake.sh <hours + 1>`. Tell the user: charger in, lid open. It warns if the Mac is on battery.

### 6. Tell the user how to stop it, then start

Say, in plain words:
- **Stop gently** (finish the current change, save, write the report): tell me "wrap up", or put a file called
  `WRAP-UP.md` in `my-game/` (copy `autopilot/WRAP-UP.template.md`). From your phone, see `autopilot/remote.md`.
- **Stop right now:** press Esc in my window (Ctrl+C in a terminal), or close it. Finished rounds are saved; only the
  round in progress is lost.
- **Let the computer sleep again afterwards:** `bash autopilot/keep-awake.sh --stop` (I do this at the end).

Then start the loop as the tool's guide says, and run rounds by `autopilot/round.md` until the hours are up, the user
wraps up, or usage runs low.

### 7. At the end (always)

1. Finish or revert the change in progress. Never leave the game broken.
2. Commit.
3. Write `my-game/MORNING.md` from `autopilot/MORNING.template.md`. Run `node tools/serve.mjs --check` last and put its
   card at the top.
4. Update `HANDOVER.md` (the "▶ Play this" block too), `DEVLOG.md`, `DECISIONS.md`. Commit.
5. `bash autopilot/keep-awake.sh --stop`. Stop any dev server or browser you started other than the game's own
   server (leave that running so the link works).
6. Your last message: the Play it now card, the three biggest changes, and the "For you" questions. Nothing else.

## Hard guardrails (never broken, whatever helper.json says)

- Never deploy, publish, upload or push anywhere.
- Never spend past the cap; nothing at all unless the user approved an amount for this run.
- Never open `.env` or print a key.
- Never do anything in `askMeFirst`: write it in MORNING.md instead.
- Never leave the game broken at the end of a round: revert the round instead.
