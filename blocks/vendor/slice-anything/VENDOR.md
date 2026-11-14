# Slice anything: where this copy came from

This folder is a copy of an open-source project, kept here so the kit works offline and never changes under your game.

| | |
|---|---|
| Made by | blendi for Patch (patch.gg) |
| Source | https://git.patch.gg/blendi/slice-anything.git |
| Commit | `7f7a4035bd0421c0855c4ea9b10c7fcde5328cd0` (2026-11-10) |
| Copied on | 2026-11-14 |
| Code licence | MIT (see `LICENSE`) |
| Art licence | CC0-1.0 |
| Renderer | both |

## Other people's work inside it

- Rapier 0.19.3 (npm @dimforge/rapier3d-compat): Dimforge, Apache-2.0. https://github.com/dimforge/rapier.js
- Bust, blades, sky and surfaces: Poly Haven artists (see public/CREDITS.md), CC0-1.0. https://polyhaven.com

The full, file-by-file list is in the project's own credits file (`CREDITS.txt`, `CREDITS.md`, `public/CREDITS.md` or `LICENCE-NOTES.md`). Keep those files and every `LICENSE*` file with any copy.

## Note

Uses three/webgpu (WebGPURenderer). Add ?webgl to the URL to force its WebGL2 path. Pins Rapier 0.19.3 on purpose (0.21 hulls never settle), so it cannot share one Rapier version with impossible-spaces as is.

## What we changed

- Left out `.gitattributes` (`.gitattributes`, 5 KB): its Git LFS rules would apply inside the kit's repo.
- Left out `cover.jpg` (`cover.jpg`, 501 KB): the cover picture for the project page.
- Nothing else. The code, art and licence files are exactly as published.

## Checked

On 2026-11-14: copied this folder to a temporary folder, ran `npm ci` and `npm run build`, and opened the demo in headless Chromium with WebGPU on. It drew without errors. The picture is `blocks/previews/slice-anything.jpg`.

## Updating it

Clone the source at a newer commit, read its changes and licence again, copy it over this folder leaving out the same files, and update the commit here and in `blocks/catalog.json`. If you change the code for your game, list the changes in your game's own copy of this file.
