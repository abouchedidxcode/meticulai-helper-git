# Impossible spaces (portals): where this copy came from

This folder is a copy of an open-source project, kept here so the kit works offline and never changes under your game.

| | |
|---|---|
| Made by | blendi for Patch (patch.gg) |
| Source | https://git.patch.gg/blendi/impossible-spaces.git |
| Commit | `a9db30c95ad7bf7805848c85c362d9ecf0c9133a` (2026-11-10) |
| Copied on | 2026-11-14 |
| Code licence | MIT (see `LICENSE`) |
| Art licence | CC0-1.0 |
| Renderer | webgpu |

## Other people's work inside it

- Rapier 0.21 (npm @dimforge/rapier3d-compat): Dimforge, Apache-2.0. https://github.com/dimforge/rapier.js
- Wood Floor, Brushed Concrete 04, Marble 01, Black Painted Planks: Dimitrios Savva, Amal Kumar, Rob Tuytel (Poly Haven), CC0-1.0. https://polyhaven.com

The full, file-by-file list is in the project's own credits file (`CREDITS.txt`, `CREDITS.md`, `public/CREDITS.md` or `LICENCE-NOTES.md`). Keep those files and every `LICENSE*` file with any copy.

## Note

Needs WebGPU (recent Chrome or Edge). Rendered fine in headless Chromium with WebGPU on.

## What we changed

- Left out `.gitattributes` (`.gitattributes`, 92 bytes): its Git LFS rules would apply inside the kit's repo.
- Left out `cover.jpg` (`cover.jpg`, 348 KB): the cover picture for the project page.
- Nothing else. The code, art and licence files are exactly as published.

## Checked

On 2026-11-14: copied this folder to a temporary folder, ran `npm ci` and `npm run build`, and opened the demo in headless Chromium with WebGPU on. It drew without errors. The picture is `blocks/previews/impossible-spaces.jpg`.

## Updating it

Clone the source at a newer commit, read its changes and licence again, copy it over this folder leaving out the same files, and update the commit here and in `blocks/catalog.json`. If you change the code for your game, list the changes in your game's own copy of this file.
