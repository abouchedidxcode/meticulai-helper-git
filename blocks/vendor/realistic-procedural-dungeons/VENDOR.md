# Realistic procedural dungeons: where this copy came from

This folder is a copy of an open-source project, kept here so the kit works offline and never changes under your game.

| | |
|---|---|
| Made by | blendi (patch.gg) |
| Source | https://git.patch.gg/blendi/realistic-procedural-dungeons.git |
| Commit | `42ce7dfa60e4d8d9142a2ef08113158720ca5091` (2026-11-05) |
| Copied on | 2026-11-14 |
| Code licence | MIT (see `LICENSE`) |
| Art licence | CC0-1.0 |
| Renderer | webgl2 |

## Other people's work inside it

- Dirt floor, medieval blocks, medieval wall textures: Poly Haven artists (see public/CREDITS.md), CC0-1.0. https://polyhaven.com

The full, file-by-file list is in the project's own credits file (`CREDITS.txt`, `CREDITS.md`, `public/CREDITS.md` or `LICENCE-NOTES.md`). Keep those files and every `LICENSE*` file with any copy.

## What we changed

- Left out `.gitattributes` (`.gitattributes`, 252 bytes): its Git LFS rules would apply inside the kit's repo.
- Left out `shots/` (`shots/cover.jpg`, `shots/hall.jpg`, `shots/steps.jpg`, 1.9 MB): README screenshots.
- Nothing else. The code, art and licence files are exactly as published.

## Checked

On 2026-11-14: copied this folder to a temporary folder, ran `npm ci` and `npm run build`, and opened the demo in headless Chromium. It drew without errors. The picture is `blocks/previews/realistic-procedural-dungeons.jpg`.

## Updating it

Clone the source at a newer commit, read its changes and licence again, copy it over this folder leaving out the same files, and update the commit here and in `blocks/catalog.json`. If you change the code for your game, list the changes in your game's own copy of this file.
