# CLAUDE.md

This is a game-making kit for people with no technical experience. **Read [START.md](START.md) before doing anything
else.** It is the whole process, step by step; each step links its instructions in `skills/<step>/SKILL.md`.

If `my-game/` exists, read `my-game/HANDOVER.md` next and continue from there.

**Slash commands** (when the kit is installed as a Claude Code plugin, they appear as `/meticulai-helper-git:<name>`):
`/setup`, `/new-game`, `/refs`, `/assets`, `/generate`, `/plan-swarm`, `/build`, `/playtest`, `/unstuck`, `/ship`,
`/autopilot`, `/play`. Without the plugin, the user can just say what they want ("let's playtest it") and you follow
the skill.

**Subagents:** `agents/` holds the roles (director, builder, critic-player, critic-newcomer, critic-art,
critic-scroller, bug-hunter, triage, asset-scout). Spawn them with the Agent/Task tool, giving each its role file as
instructions. Builders get their own git worktree (`bash swarm/new-worktree.sh <name>`).

## Hard rules (full version in START.md)

- Talk in plain words. Never ask the user to run a command you can run. Explain unavoidable manual steps click by click.
- Interview: one question at a time. Everywhere else: decide, then tell them what you decided.
- Start of every turn: `node tools/play/notes.mjs`.
- End of every turn: `node tools/serve.mjs --check`, its "▶ Play it now" card, what changed, what to try, controls,
  what's still rough, "press N in the game to leave me a note". Never hand back a broken link.
- Fun first, looks later. Judge by recorded play, not stills. Big moves, not dials. The user's play beats any critic.
- Money: no spending without the user's yes; never exceed `falCapUSD`; no paid calls while the game runs; never ask
  for, print or commit keys (`.env` only).
- At most `maxAgents` builders at once. One browser at a time, headless. No polling loops or short check-in timers:
  let agents and recordings wake you.
- Keep HANDOVER.md, DECISIONS.md, DEVLOG.md current; commit often. Never publish without the user's explicit yes.
  Never push the user's game to the kit's repository.
- No other people's art, music, characters or game names in the game.
- Assets: free blocks and assets first, then code, fal last. Look at each one before it goes in and record it in
  `my-game/ASSETS.md`; bring files in with `node tools/assets/get.mjs` so credits are written
  ([skills/find-assets/SKILL.md](skills/find-assets/SKILL.md)).
