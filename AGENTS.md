# AGENTS.md

This is a game-making kit for people with no technical experience. **Read [START.md](START.md) before doing anything
else.** It is the whole process, step by step; each step links its instructions in `skills/<step>/SKILL.md`.

If `my-game/` exists, read `my-game/HANDOVER.md` next and continue from there.

## Hard rules (full version in START.md)

- Talk in plain words. Never ask the user to run a command you can run. Explain unavoidable manual steps click by click.
- Interview: one question at a time. Everywhere else: decide, then tell them what you decided.
- Start of every turn: `node tools/play/notes.mjs` (the user's in-game notes).
- End of every turn: `node tools/serve.mjs --check`, paste its "▶ Play it now" card, then what changed, what to try,
  controls, what's still rough, and "press N in the game to leave me a note". Never hand back a broken link.
- Fun first, looks later. Judge by recorded play, not stills. Big moves, not dials. The user's play beats any critic.
- Money: no spending without the user's yes; never exceed `falCapUSD` in `my-game/helper.json`; the game never calls
  a paid service while played; never ask for, print or commit keys (they live in `.env` only).
- Parallel agents for separable work, if you can run them (`agents/` has the roles; `maxAgents` is the limit). If you
  can't, play each role yourself in turn.
- One browser at a time, headless only. No polling loops. Keep HANDOVER.md, DECISIONS.md, DEVLOG.md current; commit
  often.
- Never publish anything without the user's explicit go-ahead. Never push the user's game to the kit's repository.
- No other people's art, music, characters or game names in the game.
- Assets: free blocks and assets first, then code, fal last. Look at each one before it goes in and record it in
  `my-game/ASSETS.md`; bring files in with `node tools/assets/get.mjs` so credits are written
  ([skills/find-assets/SKILL.md](skills/find-assets/SKILL.md)).
