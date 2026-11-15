# Getting started

You need an AI coding agent: an AI that can read files and run programs on your computer, not just chat. Any of these
works. If you already pay for one, use that.

## Which agent

| Agent | Good if |
| --- | --- |
| **Claude Code** | You have a Claude plan. Works in the Claude desktop app or in a terminal window. Can run several helpers at once and comes with this kit's shortcuts as a plugin. |
| **Codex** | You have a ChatGPT plan. Works in its desktop app, in a code editor, or in a terminal window. |
| **Cursor** | You like seeing the files in a normal-looking app. It's a code editor with an AI built in. |

A plain chat window (a website where you only chat) won't work: it can't run the game on your computer.

## Open it

Follow your agent's own install page, then:

- **Claude Code desktop app or Codex app:** open the app and start a new session. If it asks for a folder, make one
  called `Games` in your home folder and pick it.
- **Cursor:** open Cursor, click **File**, then **Open Folder**, make a folder called `Games` in your home folder and
  pick it. Open the AI chat panel (the agent side panel).
- **In a terminal window:** open Terminal (Mac: press Cmd+Space, type Terminal, press Enter). Type `claude` or `codex`
  and press Enter.

If it asks whether to trust the folder or allow it to run commands, say yes for this folder. The agent needs to run
programs to build and test your game.

## The first sentence

Paste this into the agent and press Enter:

```
Read https://github.com/abouchedidxcode/meticulai-helper-git/blob/main/START.md and help me make a game.
```

If you use Claude Code with the plugin installed, you can type `/new-game` instead.

## What happens next

1. **It sets things up.** It downloads this kit into a folder (usually `Games/<your game>` in your home folder) and
   installs a few free tools. Sometimes your computer asks for your password: that's normal, it's asking permission to
   install. The agent tells you when to expect it.
2. **You play the starter game.** It gives you a link that says "Play it now". Click it. It opens in your web browser.
   The game runs on your own computer; nobody else can see it.
3. **It asks you about eight questions**, one at a time:
   - what game you want, or the feeling you want it to give;
   - what the player does most of the time;
   - who it's for and how long one sitting is;
   - three moments a player would tell a friend about;
   - what it should look like;
   - how you control it;
   - how much time and money you want to put in (the default is $0);
   - anything you don't want.
   Each question has an example. Short answers are fine. "You pick" is a fine answer.
4. **It reads the plan back to you.** Change anything you like. When you say yes, it starts building.

## Coming back later

Open your agent in the same game folder and say: "Read START.md and continue my game." It reads its own notes and
picks up where it stopped.

Next: [Testing your game](testing-your-game.md).
