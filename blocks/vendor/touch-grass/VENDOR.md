# Grass you can touch: where this copy came from

This folder is a copy of an open-source project, kept here so the kit works offline and never changes under your game.

| | |
|---|---|
| Made by | blendi for Patch (patch.gg) |
| Source | https://git.patch.gg/blendi/touch-grass.git |
| Commit | `3bd4f39d9185689efad9dc1c9d4d1f5a89ac708b` (2026-11-10) |
| Copied on | 2026-11-14 |
| Code licence | MIT (see `LICENSE`) |
| Art licence | CC0-1.0 |
| Renderer | webgl2 |

## Other people's work inside it

- Blade arc model (maths followed, no file copied): mohamedachrefelouafi (Chiro Visuals), GrassSystemThreeJS, MIT. https://github.com/achrefelouafi/GrassSystemThreeJS
- Ground textures: ambientCG, CC0-1.0. https://ambientcg.com
- Fine Grained Wood: Rob Tuytel (Poly Haven), CC0-1.0. https://polyhaven.com/a/fine_grained_wood
- Impact Sounds (footsteps): Kenney, CC0-1.0. https://kenney.nl/assets/impact-sounds
- Red Hat Mono font: The Red Hat Project Authors, OFL-1.1. https://github.com/RedHatOfficial/RedHatFont

The full, file-by-file list is in the project's own credits file (`CREDITS.txt`, `CREDITS.md`, `public/CREDITS.md` or `LICENCE-NOTES.md`). Keep those files and every `LICENSE*` file with any copy.

## What we changed

- Left out `.gitattributes` (`.gitattributes`, 92 bytes): its Git LFS rules would apply inside the kit's repo.
- Left out `shots/` (`shots/cover.jpg`, `shots/readme.jpg`, 1.4 MB): README screenshots.
- Left out dev scripts with paths on the original author's computer (6 files, 38 KB): they only run on the original author's computer.
- Removed the `test` script from `package.json`: it ran one of the left-out dev scripts.
- Nothing else. The code, art and licence files are exactly as published.

## Checked

On 2026-11-14: copied this folder to a temporary folder, ran `npm ci` and `npm run build`, and opened the demo in headless Chromium. It drew without errors. The picture is `blocks/previews/touch-grass.jpg`.

## Updating it

Clone the source at a newer commit, read its changes and licence again, copy it over this folder leaving out the same files, and update the commit here and in `blocks/catalog.json`. If you change the code for your game, list the changes in your game's own copy of this file.
