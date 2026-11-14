# Watercolour: where this copy came from

This folder is a copy of an open-source project, kept here so the kit works offline and never changes under your game.

| | |
|---|---|
| Made by | blendi for Patch (patch.gg) |
| Source | https://git.patch.gg/blendi/watercolour.git |
| Commit | `713908667b250c35598a737503e68b72cb9a2192` (2026-11-13) |
| Copied on | 2026-11-14 |
| Code licence | MIT (see `LICENSE`) |
| Art licence | CC0-1.0 |
| Renderer | webgl2 |

## Other people's work inside it

- Rapier 0.21 (copy in src/figure/rapier): Dimforge, Apache-2.0. https://github.com/dimforge/rapier.js
- Universal Animation Library 1 and 2 (clips): Quaternius, CC0-1.0. https://quaternius.com/packs/universalanimationlibrary.html

The full, file-by-file list is in the project's own credits file (`CREDITS.txt`, `CREDITS.md`, `public/CREDITS.md` or `LICENCE-NOTES.md`). Keep those files and every `LICENSE*` file with any copy.

## What we changed

- Left out 3 large files to keep the kit small. They are essential: `node tools/blocks/add.mjs watercolour` downloads them from the original repo at the same commit and checks each one's SHA-256. To get them by hand, download each URL below into the same path.
- Left out `.gitattributes` (`.gitattributes`, 134 bytes): its Git LFS rules would apply inside the kit's repo.
- Left out `shots/` (`shots/cover.jpg`, `shots/meadow.jpg`, `shots/readme.jpg`, `shots/wood.jpg`, 1.8 MB): README screenshots.
- Nothing else. The code, art and licence files are exactly as published.

## Files downloaded at add time

| Path | Size | SHA-256 | URL |
|---|---|---|---|
| `src/figure/rapier/rapier.mjs` | 4.1 MB | `02dc6a4e2fffc013...` | https://git.patch.gg/blendi/watercolour/raw/713908667b250c35598a737503e68b72cb9a2192/src/figure/rapier/rapier.mjs |
| `public/figure/starter-man.glb` | 1.2 MB | `450089ce3fd70c1a...` | https://git.patch.gg/blendi/watercolour/raw/713908667b250c35598a737503e68b72cb9a2192/public/figure/starter-man.glb |
| `public/figure/starter-man-clips.glb` | 2.3 MB | `c8ff99c52785e1e1...` | https://git.patch.gg/blendi/watercolour/raw/713908667b250c35598a737503e68b72cb9a2192/public/figure/starter-man-clips.glb |

Full hashes are in `blocks/catalog.json` (`fetch`).

## Checked

On 2026-11-14: copied this folder plus the downloaded files to a temporary folder, ran `npm ci` and `npm run build`, and opened the demo in headless Chromium. It drew without errors. The picture is `blocks/previews/watercolour.jpg`.

## Updating it

Clone the source at a newer commit, read its changes and licence again, copy it over this folder leaving out the same files, and update the commit here and in `blocks/catalog.json`. If you change the code for your game, list the changes in your game's own copy of this file.
