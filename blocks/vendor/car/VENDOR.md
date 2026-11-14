# Realistic car: where this copy came from

This folder is a copy of an open-source project, kept here so the kit works offline and never changes under your game.

| | |
|---|---|
| Made by | Patch (patch.gg) |
| Source | https://git.patch.gg/patch/car.git |
| Commit | `96d732c21f3c084b806d93334b5d872a8986d9dc` (2026-11-04) |
| Copied on | 2026-11-14 |
| Code licence | MIT (see `LICENSE`) |
| Art licence | CC0-1.0 |
| Renderer | webgl2 |

## Other people's work inside it

- Godot Advanced Vehicle (tyre model, ported): Dechode, MIT. https://github.com/Dechode/Godot-Advanced-Vehicle
- Godot Easy Vehicle Physics (gearbox, suspension, assists, ported): David Shoemaker, Dechode and Baron Wittman, MIT. https://github.com/DAShoe1/Godot-Easy-Vehicle-Physics
- folio-2025 (righting the car, ported): Bruno Simon, MIT. https://github.com/brunosimon/folio-2025
- Rapier 0.17.3 (npm): Dimforge, Apache-2.0. https://github.com/dimforge/rapier.js
- ez-tree (stage trees): Daniel Greenheck, MIT. https://github.com/dgreenheck/ez-tree
- Stage textures, sky, boulders: Poly Haven artists (see CREDITS.txt), CC0-1.0. https://polyhaven.com
- Bark textures: ambientCG, CC0-1.0. https://ambientcg.com
- Engine and surface sounds: Freesound authors (each in public/audio/CREDITS.txt), CC0-1.0. https://freesound.org
- Universal Animation Library (mannequin clips): Quaternius, CC0-1.0. https://quaternius.com/packs/universalanimationlibrary.html

The full, file-by-file list is in the project's own credits file (`CREDITS.txt`, `CREDITS.md`, `public/CREDITS.md` or `LICENCE-NOTES.md`). Keep those files and every `LICENSE*` file with any copy.

## What we changed

- Left out `.gitattributes` (`.gitattributes`, 126 bytes): its Git LFS rules would apply inside the kit's repo.
- Left out `cover.jpg` (`cover.jpg`, 330 KB): the cover picture for the project page.
- Left out dev scripts with paths on the original author's computer (8 files, 59 KB): they only run on the original author's computer.
- Nothing else. The code, art and licence files are exactly as published.

## Checked

On 2026-11-14: copied this folder to a temporary folder, ran `npm ci` and `npm run build`, and opened the demo in headless Chromium. It drew without errors. The picture is `blocks/previews/car.jpg`.

## Updating it

Clone the source at a newer commit, read its changes and licence again, copy it over this folder leaving out the same files, and update the commit here and in `blocks/catalog.json`. If you change the code for your game, list the changes in your game's own copy of this file.
