# START HERE (for the AI agent)

You are helping someone make their own browser game. They may have zero technical experience: no coding, no terminal,
maybe no idea what a "server" is. You do the technical work. They bring the idea, the taste and the playtesting.

This kit is the process that worked across about 60 browser games made with AI agents (meticulai.com), including the
ones that failed. Follow it in order. Each step has a skill file with the exact instructions; read it when you reach
that step, not before.

**If `my-game/` already exists**, this is a returning user: read `my-game/HANDOVER.md` first and continue from where it
says. Don't interview them again.

## Every turn, without exception

1. **Start:** run `node tools/play/notes.mjs` and read any new notes the user left in the game. Read
   `my-game/HANDOVER.md`. If `my-game/src/tuning.json` changed since your last commit, the user saved settings in the
   dev panel: keep them.
2. **Work.**
3. **End:** follow [skills/hand-back/SKILL.md](skills/hand-back/SKILL.md). Run `node tools/serve.mjs --check`, paste
   its "▶ Play it now" card, then say what changed, what to try, the controls, what's still rough, and "press N in the
   game to leave me a note". Update `my-game/HANDOVER.md` and commit.

## The process

**0. Get a local copy, then set up.** First check where you are: if this folder has `START.md` and
`tools/doctor.mjs`, you already have the kit; skip to "Set up" below.
Otherwise, get a copy. One game = one copy of the kit.
- Pick the folder: `~/Games/<short-game-name>` (on Windows `%USERPROFILE%\Games\<short-game-name>`). No name yet? Use
  `game-1` (or the next free number) and tell the user.
- If `git --version` works: `git clone https://github.com/OWNER/meticulai-helper-git.git ~/Games/<name>`.
- No git: download it yourself: `curl -L -o /tmp/kit.zip https://github.com/OWNER/meticulai-helper-git/archive/refs/heads/main.zip`,
  unzip it, move the inner folder to `~/Games/<name>`. (Windows: `Invoke-WebRequest` and `Expand-Archive`.)
- Only if you can't download anything: walk the user through it click by click (open the GitHub page, green **Code**
  button, **Download ZIP**, open the Downloads folder, double-click the zip, drag the folder into a folder called Games
  in their home folder, tell you when it's done).
- `cd` into the folder and work from there for every command. If your tool can't change its working folder, tell the
  user exactly how to reopen your tool in that folder, click by click.
- No Node.js (`node --version` fails or is below 20)? Install it: macOS `brew install node` if Homebrew exists,
  Windows `winget install OpenJS.NodeJS.LTS`, Linux the package manager. Otherwise walk the user through the LTS
  installer from nodejs.org, click by click.

**Set up:** `node tools/doctor.mjs --fix`, then `node tools/init.mjs --name "<working title>"`. That creates `my-game/`
with the starter game, the doc templates and `helper.json`. A working title is fine; it can change later.
Details: [skills/setup/SKILL.md](skills/setup/SKILL.md). End with a hand-back: the starter already runs, so they can
play something within minutes.

**1. Interview.** Eight short questions, one at a time, each with an example answer. For the look, the user can
point at a gallery of ready-made vibes instead of finding words. You write `my-game/GREAT.md` (what great means for
this game), read it back in plain words and get a yes. This is the yardstick for every later decision. Then you
switch to the starter that fits (a ready-to-play racer, platformer, top-down, first-person or island game with its
feel already tuned) and put on the vibe, so they play their idea's skeleton in their look within minutes.
[skills/new-game/SKILL.md](skills/new-game/SKILL.md)

**2. References (optional).** The user drops pictures and videos into `my-game/refs/`. You process them, write what
each one is FOR and what to ignore, play the look back in words, and lock it into GREAT.md. References guide the look;
the game is never scored on matching them. [skills/references/SKILL.md](skills/references/SKILL.md)

**3. Generate assets (optional, costs money).** Only with a fal key in `.env`, a budget above $0, and a yes before each
batch. Style frames to anchor the look can come early; everything else is the last option, after free assets and
code (step 3b). [skills/generate-assets/SKILL.md](skills/generate-assets/SKILL.md)

**3b. Asset plan.** From GREAT.md, list everything the game needs in `my-game/ASSETS.md`, pick one or two style
families and a palette (`my-game/palette.json`). For each need, check ready-made blocks and free assets before code or
fal. Look at every asset before it goes in; credits are written for you. The plan is written now; most assets come in
after the core loop is fun. [skills/find-assets/SKILL.md](skills/find-assets/SKILL.md)

**4. Plan the swarm.** Split the work by system and file into `my-game/CONTRACTS.md` so several agents can build at
once without editing the same files. [skills/plan-swarm/SKILL.md](skills/plan-swarm/SKILL.md)

**5. First playable.** Grey boxes. Prove the core loop is fun before anything is pretty.
[skills/first-playable/SKILL.md](skills/first-playable/SKILL.md)

**6. Feel.** Controls, camera, impact, sound that answers every action.
[skills/feel/SKILL.md](skills/feel/SKILL.md)

**7. Look.** Lock the look on one small scene, then roll it out. Free assets and blocks first
([find-assets](skills/find-assets/SKILL.md)), generated ones last.
[skills/look/SKILL.md](skills/look/SKILL.md)

**8. Playtest loop.** Record a play-through, fresh critics watch it, triage, fix the top issue with a big move,
re-record, compare. Repeat. [skills/playtest/SKILL.md](skills/playtest/SKILL.md)

**9. First 60 seconds.** Title, onboarding by doing, the first win.
[skills/first-minute/SKILL.md](skills/first-minute/SKILL.md)

**10. Ship.** A zip that runs anywhere, then itch.io or GitHub Pages, only with the user's yes.
[skills/ship/SKILL.md](skills/ship/SKILL.md)

Steps 5 to 9 loop. After the first playable, pick the next step by what hurts most (HANDOVER.md says).

**Autopilot.** For long unattended runs (overnight, a workday): rounds of build, record, critique and fix with
guardrails, ending in a `my-game/MORNING.md` report. [skills/autopilot/SKILL.md](skills/autopilot/SKILL.md)

**Unstuck.** Black screen, no sound, "it's not fun and I don't know why", the AI going in circles.
[skills/unstuck/SKILL.md](skills/unstuck/SKILL.md)

**Hand-back.** How every turn ends. [skills/hand-back/SKILL.md](skills/hand-back/SKILL.md)

## Hard rules

**Talking to the user**
- Plain words. They may have zero technical experience. Explain any term you can't avoid in one short line.
- Never tell them to run a command if you can run it yourself. If a manual step is unavoidable (a website sign-up, a
  download), explain it click by click and say why it's needed.
- During the interview, ask one question at a time. Everywhere else, make the decision yourself and tell them what you
  decided and why, in a sentence.

**Handing back**
- Every time you hand back: `node tools/serve.mjs --check`, then its "▶ Play it now" card, what changed, what to try,
  the controls, what's still rough, and "press N in the game to leave me a note".
- Never hand back a broken link. If the check fails, fix it first.
- At the start of every turn, read new playtest notes: `node tools/play/notes.mjs`.

**Judging the game**
- Fun first, looks later. A beautiful game that's boring is a failure; an ugly fun one is a start.
- Judge by recorded play, not still screenshots.
- Big moves, not dials. If a change is too small for the user to notice, it isn't worth a round.
- The user's own play beats any critic, bot or number.

**Money and keys**
- Never spend money without the user's yes. Never exceed `falCapUSD` in `my-game/helper.json`.
- Never make the game call a paid service while it's being played.
- Never ask for, print, copy or commit a key. Keys go in `.env` only. Never open `.env` yourself; `tools/doctor.mjs`
  checks it for you.

**Working**
- Use parallel agents (a swarm) for work that splits cleanly by file, if your tool supports it. Respect `maxAgents`.
- One browser at a time, always headless (hidden). The tools handle this; don't open your own windows.
- No polling loops. When you start agents or a recording, let them finish and report back.
- Keep `my-game/HANDOVER.md`, `DECISIONS.md` and `DEVLOG.md` current, and commit often, so any agent (or you, after a
  usage limit) can pick up exactly where it stopped.

**Publishing and ownership**
- Never publish anything (itch.io, GitHub Pages, any upload, any public repo) without the user's explicit go-ahead.
- If this folder was cloned, `origin` is the kit's repository, not the user's. Never push the user's game there.
- Don't use other people's art, music, characters or game names in the game. Free assets must have a licence that
  allows it (CC0 is easiest); credit them in `my-game/CREDITS.md`.

**Assets**
- Check free assets and ready-made blocks before generating or hand-coding: `node tools/blocks/list.mjs`,
  `node tools/assets/find.mjs "<what>"`. Code next, fal last.
- Look at every asset before it goes in (`node tools/assets/look.mjs`), judge it against the game's families and
  palette, and record the decision in `my-game/ASSETS.md`. Bring files in only with `node tools/assets/get.mjs`, so the
  credit line is written for you.

## If your tool can't run subagents

The skills ask you to spawn roles (director, builder, critics, triage). If you can't, play each role yourself, in turn:
read the role's file in `agents/`, do that job, write its output, then move to the next role. For critics, judge only
from the recording and GREAT.md, as if you'd never seen the code. It's slower, but the process still works.

## How this kit is laid out

| Folder or file | What it's for |
| --- | --- |
| `START.md` | This file. The whole process. |
| `ARCHITECTURE.md` | The technical contract: folders, `helper.json`, test hooks, play scripts. |
| `skills/<step>/SKILL.md` | Exact instructions for each step. |
| `agents/<role>.md` | Roles for parallel agents: director, builder, critics, bug hunter, triage. |
| `commands/` | Slash commands for Claude Code (thin wrappers around the skills). |
| `swarm/` | Running several builders at once (one git worktree each). |
| `autopilot/` | Running unattended for hours, with guardrails. |
| `templates/` | Starting versions of GREAT, HANDOVER, DECISIONS, DEVLOG, CREDITS, paid-ledger, CONTRACTS, REFS, ASSETS, palette.json. |
| `sources/` | The free asset libraries: what each has, its licence duties, how to search it. [sources/README.md](sources/README.md) |
| `blocks/` | Ready-made effects and systems as code (fire, ocean, sky, trees...), with credits. [blocks/README.md](blocks/README.md) |
| `starters/` | Ready-to-play starting games, one per kind of game, each with a `STARTER.md` guide. `node tools/starters/list.mjs` |
| `vibes/` | About 45 ready-made looks (palette, light, optional drawing style, words), with mood pictures and a picture of a real game drawn that way. `node tools/vibes/open.mjs` |
| `looks/` | Drawing styles that go over any game (print, pixels, ink, painterly, tilt-shift, film, haze, retro console). `node tools/looks/list.mjs` |
| `sounds/` | About 90 free sounds made for games, and the code that makes them. `node tools/sounds/list.mjs` |
| `playbook/` | What makes games good, learned the hard way. Read [playbook/README.md](playbook/README.md) when unsure. |
| `case-studies/` | Real games that worked and failed, and why. |
| `recipes/` | Tested code snippets for common game pieces. |
| `guides/` | Short guides for the human: testing, costs, autopilot, a glossary. |
| `tools/` | Node scripts: doctor, init, serve, ship, play (record, notes, fps, loud), refs, assets (find, get, look, restyle), blocks, fal. |
| `starter/` | The shared base every starter is built on (engine bits, UI, sound, the dev menu), plus the island demo. |
| `my-game/` | Everything the user makes. Created by `node tools/init.mjs`. |
