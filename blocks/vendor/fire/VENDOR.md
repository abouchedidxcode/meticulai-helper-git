# Fire: where this copy came from

This folder is a copy of an open-source project, kept here so the kit works offline and never changes under your game.

| | |
|---|---|
| Made by | Patch (patch.gg) |
| Source | https://git.patch.gg/patch/fire.git |
| Commit | `4d6ee79b7bce072bc0515cfa1e787536e8b0eaf2` (2026-11-04) |
| Copied on | 2026-11-14 |
| Code licence | MIT (see `LICENSE`) |
| Art licence | CC0-1.0 |
| Renderer | webgl2 |

## Note

Inspired by a post by @majidmanzarpour showing volumetric fire in pure three.js; no code came from it.

## What we changed

- Left out `.gitattributes` (`.gitattributes`, 46 bytes): its Git LFS rules would apply inside the kit's repo.
- Left out `cover.jpg` (`cover.jpg`, 72 KB): the cover picture for the project page.
- Left out dev scripts with paths on the original author's computer (9 files, 26 KB): they only run on the original author's computer.
- Removed the `test` script from `package.json`: it ran one of the left-out dev scripts.
- Nothing else. The code, art and licence files are exactly as published.

## Checked

On 2026-11-14: copied this folder to a temporary folder, ran `npm ci` and `npm run build`, and opened the demo in headless Chromium. It drew without errors. The picture is `blocks/previews/fire.jpg`.

## Updating it

Clone the source at a newer commit, read its changes and licence again, copy it over this folder leaving out the same files, and update the commit here and in `blocks/catalog.json`. If you change the code for your game, list the changes in your game's own copy of this file.
