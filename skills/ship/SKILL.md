---
name: ship
description: Package the game into a zip that runs anywhere, then help the user put it on itch.io (they upload, click by click) or GitHub Pages (only if gh is set up and they say yes). Never publish without the user's explicit go-ahead. Use when the user wants to share the game or send it to a friend.
---

# Ship

## Goal

The game is online at a link anyone can open, in the user's own account, after they said yes.

Before you start: you must be in the kit's workspace (it has `START.md` and `tools/`). If not, do START.md step 0.

## Before you build

- [ ] The [first-minute](../first-minute/SKILL.md) checklist is done (no debug text, no placeholder words).
- [ ] `my-game/CREDITS.md` lists every asset, font and sound that needs credit. Show the credits somewhere in the game
      (title or pause menu) if any licence requires it.
- [ ] Nothing from other people's games, characters or music.
- [ ] The game calls no paid service while played, and contains no key. Search the built files for `fal` and `key`.

## Build

1. `node tools/ship.mjs`. It makes a production build with relative paths, tests it in a hidden browser, and writes
   `my-game/ship/<slug>-web.zip`. If it fails, fix the cause and run again.
2. Tell the user the file is ready and ask where they want it. Offer both:

> Your game is packed into one file, ready to put online. Two options, both free:
> 1. **itch.io**, a popular site for indie games. You make a free account and upload the file; I'll walk you through
>    every click. Good if you want people to find it and leave comments.
> 2. **GitHub Pages**, a free web page from your GitHub account. I can do it for you if you're signed in to GitHub
>    here. Good if you just want a link to send.
> Which one? (Or neither for now: the file is saved and you can decide later.)

**Wait for an explicit yes to a specific option.** "Sounds good" to the explanation isn't a yes to publish.

## itch.io (the user uploads; it's their account)

Walk them through it one step at a time, waiting for "done" when a step needs them:
1. Go to itch.io, click **Register** (top right), make an account and confirm the email.
2. Click the arrow next to your name (top right), then **Upload new project**.
3. **Title:** the game's name. **Kind of project:** choose **HTML**.
4. **Uploads:** click **Upload files** and pick the zip. Tell them exactly where it is: open Finder (or File Explorer),
   go to the Games folder, then the game's folder, then `my-game`, then `ship`.
5. Tick **This file will be played in the browser**.
6. **Embed options:** viewport size **1280 x 720**, tick **Fullscreen button**. Tick **Mobile friendly** only if you
   tested the game on a phone.
7. Add a short description and a screenshot (offer to pick one from `my-game/recordings/` and say where it is).
8. **Visibility:** choose **Draft** first. Click **Save & view page**. Play it there.
9. If it works, go back to **Edit game**, set visibility to **Public**, save. Ask them to send you the link.

## GitHub Pages (only if `gh auth status` works and they said yes)

1. Confirm the name: "I'll create a public repository called `<slug>` in your GitHub account and publish the game at
   `https://<user>.github.io/<slug>/`. OK?" Public is needed for free Pages. Only the built game goes there, not the
   kit.
2. Make a fresh folder outside the workspace, unzip the build into it, `git init -b main`, commit, and
   `gh repo create <slug> --public --source . --push`.
3. Enable Pages from the main branch root: `gh api -X POST repos/<user>/<slug>/pages -f "source[branch]=main" -f "source[path]=/"`.
4. Wait for it to go live (it can take a few minutes; check once or twice, don't loop), open it headless, confirm it
   draws, and give them the link.
5. Never push to the kit's own repository (`origin` in the workspace, if it was cloned).

## After shipping

- Note the link and date in HANDOVER.md and DEVLOG.md. Commit.
- Updating later: rebuild with `ship.mjs`, then for itch.io they upload the new zip and delete the old one (walk them
  through it); for Pages, replace the files and push again, with their yes.
- Hand back with both links: the local one (`serve.mjs --check`) and the public one.

## Done means

The user has a public link they chose to publish, it plays, and HANDOVER.md records it.

## Common mistakes

- Publishing because the user said "nice" or "let's share it someday". Ask a direct question; wait for a direct yes.
- Uploading to the user's account with their password. Never ask for passwords; they do the upload.
- Absolute paths that work locally and break online. `ship.mjs` checks this; don't skip it.
- Shipping with `?test=1` features, the dev panel, or the N note box active. They are dev-only.
