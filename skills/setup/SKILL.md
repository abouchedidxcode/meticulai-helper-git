---
name: setup
description: Get a local copy of the kit, install what's missing, and create my-game/ from the starter so the user can play something within minutes. Use at the very start, or when tools fail because something isn't installed.
---

# Setup

## Goal

In under ten minutes, with no typing by the user: the kit is on their computer, every tool works, `my-game/` exists, and
they are playing the starter game from a link.

## Steps

1. **Get a copy if you don't have one.** If the current folder has no `START.md` and `tools/doctor.mjs`, follow step 0
   in `START.md` (clone, or download the zip yourself, into `~/Games/<name>`), then `cd` into it.
2. **Check and install.** `node tools/doctor.mjs --fix`. It checks Node 20+, git, ffmpeg and the headless browser,
   installs what it can, and says whether a fal key is present (it never prints it). Read its summary.
   - If it needs the user (an installer that asks for their password, a permission dialog), say exactly what will
     appear on their screen and what to click. Example: "A box will ask for your Mac password. That's the computer
     asking permission to install a tool. Type your password and press Enter. You won't see the letters; that's
     normal."
   - Run doctor again until it's clean. ffmpeg is needed for recordings; don't skip it.
3. **Make sure it's a git repository.** If `git status` fails (the zip download has no history), run
   `git init && git add -A && git commit -m "Start"`. Git is the undo button for everything later.
4. **Create the game folder.** `node tools/init.mjs --name "<working title>"`. Use the user's idea if they already
   gave one ("Lantern Keeper"), otherwise "My Game". It copies the starter and templates into `my-game/`, installs
   packages, picks a fixed port and writes `my-game/helper.json`.
5. **Commit:** `git add -A && git commit -m "Create my-game"`.
6. **Hand back** (see [hand-back](../hand-back/SKILL.md)): `node tools/serve.mjs --check`, the card, and then move
   straight into the interview.

## What to say

> Everything's installed and your game folder is ready. Before we design anything, here's the starter game running on
> your computer, so you can see how this works: click the link, play for a minute, and press N to leave me a note
> (try it once, even just "hello").
>
> ▶ Play it now: http://localhost:5173
>
> Next I'll ask you about eight short questions about the game you want, one at a time.

## If the user opened this from the Claude Code plugin

The plugin gives you the instructions, but the tools live in the workspace copy. Do step 1 (get a copy). If you can't
move your session into that folder, run every command with that folder as the working directory, and at the end tell
the user how to start next time in that folder, click by click.

## Done means

`doctor` is clean, `my-game/helper.json` exists, the first commit is made, and the user has a working link.

## Common mistakes

- Asking the user to open a terminal. You have one.
- Leaving ffmpeg or the browser uninstalled "for later". Recordings are how this kit judges the game.
- Putting the copy somewhere hard to find (Downloads, a temp folder). Use `~/Games/<name>`.
- Creating a second `my-game/` folder. One copy of the kit = one game. A second game gets a second copy.
