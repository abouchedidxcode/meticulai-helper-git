# Meticulai Helper Git

Make your own browser game with AI agents, even if you've never coded.

## What this is

A step-by-step guide that your AI agent follows to make a game with you. You bring the idea and play what it makes.
The agent asks you a few questions, builds the game, tests it, shows it to you, and keeps improving it.

It's built from about 60 browser games made with AI agents at [meticulai.com](https://meticulai.com): what made the
good ones good, why the bad ones failed, and the tools and habits that actually worked.

It works with Claude Code, Codex, Cursor, or any AI coding agent that can read files and run commands on your computer.

## Start in 2 minutes

Pick one.

**1. Paste one sentence into your AI agent.** Open your agent and paste:

```
Read https://github.com/OWNER/meticulai-helper-git/blob/main/START.md and help me make a game.
```

It downloads the kit, installs what's missing, and starts asking you questions.

**2. Claude Code plugin.** In Claude Code, type these one at a time:

```
/plugin marketplace add OWNER/meticulai-helper-git
/plugin install meticulai-helper-git@meticulai-helper-git
```

Then type `/new-game` and pick `meticulai-helper-git:new-game` from the list.

**3. Make your own copy.** Click **Use this template** (or **Code**, then **Download ZIP**) at the top of this page.
Open the folder in your AI agent and say: "Read START.md and help me make a game."

Never used an AI agent? Read [guides/getting-started.md](guides/getting-started.md) first.

## What happens next

1. **Setup.** The agent installs what it needs. Within minutes you're playing a small starter game from a link.
2. **Interview.** About eight short questions, one at a time: what game, what the player does, the best moments, the
   look, the controls, your budget. Each has an example answer. You can always say "you pick".
3. **Pictures (optional).** Drop in images or videos of the look you like. The agent describes the look back to you.
4. **Building.** Several AI helpers build different parts at the same time: controls, levels, sound, menus.
5. **Playing.** Every time the agent hands back, you get a link that says "Play it now". You play, and press N in the
   game to leave a note.
6. **Improving.** The agent records the game being played, fresh AI reviewers watch the recording, and the agent fixes
   the biggest problem. Round after round.
7. **Sharing.** When you're happy, it packs the game into one file and walks you through putting it on itch.io or a
   free web page. Only when you say yes.

## What's inside

| Folder | What it's for |
| --- | --- |
| `START.md` | The process your agent follows. Start here. |
| `guides/` | Short guides for you: testing your game, costs, autopilot, a glossary. |
| `playbook/` | What makes games good, learned the hard way. |
| `case-studies/` | Real games that worked and failed, and why. |
| `skills/` | Detailed instructions for each step, for the agent. |
| `agents/` | Roles for AI helpers: builders, reviewers, a director. |
| `tools/` | Small programs the agent runs: check your computer, run the game, record it, pack it. |
| `sources/` | Where free models, textures, sounds and music come from, and what each licence asks. |
| `blocks/` | Ready-made effects and systems (fire, ocean, sky, trees...), with credits to their authors. |
| `starter/` | The starter game your game grows from. |
| `my-game/` | Your game. Created during setup. Everything you make lives here. |

## Autopilot and swarms

If your AI plan is a big one, two things make the most of it:

- **Swarms.** The agent runs several helpers at once, each on its own part of the game, then combines their work. You
  set how many (the default is 4).
- **Autopilot.** Leave it running overnight or during a workday. It works in rounds: build, record, review, fix. It
  stops at the time you set, never spends money or publishes anything, and leaves you a short report that starts with
  a link to play the new version. See [guides/autopilot-for-humans.md](guides/autopilot-for-humans.md).

## Free assets and ready-made effects

The agent knows where to find tens of thousands of free 3D models, textures, skies, sounds and music, from the
original libraries that publish them (Poly Haven, ambientCG, Kenney, OpenGameArt and others). It also has ready-made
effects and systems it can drop into your game and adjust: fire, an ocean, skies, trees, magic, crowds. It picks one
style for your game, looks at each piece before using it, and changes colours and sizes so everything fits together.
Every credit is written down for you in your game's `CREDITS.md`. See [guides/free-assets.md](guides/free-assets.md).

## Optional: generated pictures and sounds

The agent can generate pictures, textures, 3D props, sounds and music with a paid service called fal. It's off by
default: free assets and things made in code work well. If you want it, you set a budget, the agent shows the cost
before every batch, and it never goes over. See [guides/fal-key.md](guides/fal-key.md) and
[guides/costs.md](guides/costs.md).

## What it won't do

- **It won't make it fun for you.** It can build, test and review, but only a person playing can tell if a game is
  fun. Your play and your notes steer everything.
- **It never spends money without your yes**, and never more than the budget you set.
- **It never publishes anything without your yes.**
- It won't copy other people's games, characters, art or music.

## Requirements

- A computer: Mac, Windows or Linux.
- An AI coding agent that can run commands on your computer (Claude Code, Codex, Cursor, or similar).
- About 30 minutes for the first session.

The agent installs everything else (Node.js, git, ffmpeg, a hidden browser for testing).

## Thanks

This kit stands on free work by other people: the artists and libraries behind the free assets (each one credited in
[sources/](sources/README.md)), and the authors of the open-source effects and systems in [blocks/](blocks/README.md),
including Patch ([patch.gg](https://patch.gg)), whose open-source blocks are included with full credit in
[blocks/CREDITS.md](blocks/CREDITS.md). Thank you.

## License

The tools and starter game are under the [MIT licence](LICENSE). The written guides are under
[CC BY 4.0](LICENSE-docs.md). The game you make is yours.
