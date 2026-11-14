# pixelfx (pixel art effects): where this copy came from

This folder is a copy of an open-source project, kept here so the kit works offline and never changes under your game.

| | |
|---|---|
| Made by | Patch (patch.gg) |
| Source | https://github.com/patch-gg/pixelfx |
| Commit | `5294518ce7c72e48b6100a744596e0acf57f2826` (2026-11-12) |
| Version | 0.3.1 |
| Copied on | 2026-11-14 |
| Code licence | MIT (see `LICENSE`) |
| Art licence | MIT |
| Renderer | 2d |

## Other people's work inside it

- Pixel art VFX method and some effects (adapted): Hugo Duprez (Sprite Fusion), MIT. https://www.spritefusion.com/pixel-art-vfx
- Fonts in gallery/: Red Hat Project Authors; Funnel Project Authors, OFL-1.1. https://github.com/patch-gg/pixelfx

The full, file-by-file list is in the project's own credits file (`CREDITS.txt`, `CREDITS.md`, `public/CREDITS.md` or `LICENCE-NOTES.md`). Keep those files and every `LICENSE*` file with any copy.

## What we changed

- Left out `.github/` (`.github/workflows/gallery.yml`, 748 bytes): the source repo's CI settings.
- Left out `docs/` (`docs/readme/acts.gif`, `docs/readme/montage.gif`, 11.2 MB): large README animations; see them on the source page.
- Nothing else. The code, art and licence files are exactly as published.

## Checked

On 2026-11-14: copied this folder to a temporary folder, ran `npm install` and served `gallery/` (no build step), and opened the demo in headless Chromium. It drew without errors. The picture is `blocks/previews/pixelfx.jpg`.

## Updating it

Clone the source at a newer commit, read its changes and licence again, copy it over this folder leaving out the same files, and update the commit here and in `blocks/catalog.json`. If you change the code for your game, list the changes in your game's own copy of this file.
