# Destruction physics: where this copy came from

This folder is a copy of an open-source project, kept here so the kit works offline and never changes under your game.

| | |
|---|---|
| Made by | Patch (patch.gg), on three-avbd by Steven Bobyn |
| Source | https://git.patch.gg/patch/destruction.git |
| Commit | `496c06c96968922c982a47b6c01934cf83b0bb94` (2026-11-04) |
| Copied on | 2026-11-14 |
| Code licence | MIT (see `LICENSE`) |
| Art licence | CC-BY-4.0 |
| Renderer | webgpu |

## Other people's work inside it

- three-avbd (GPU rigid bodies, copy in vendor/three-avbd): Steven Bobyn, MIT. https://github.com/sbobyn/three-avbd
- three-voxel-destruction (sky and particles): Steven Bobyn, MIT. https://github.com/sbobyn/three-voxel-destruction
- avbd-demo2d/3d, box2d-lite (ported inside three-avbd): Chris Giles; Erin Catto, MIT. https://github.com/sbobyn/three-avbd
- Sounds: Freesound, Wikimedia Commons and Kenney recordings (some CC-BY-4.0: credit each one): listed one by one in CREDITS.txt, CC0-1.0 / public domain / CC-BY-4.0. https://freesound.org
- Textures and sky: Poly Haven, ambientCG, CC0-1.0. https://polyhaven.com

The full, file-by-file list is in the project's own credits file (`CREDITS.txt`, `CREDITS.md`, `public/CREDITS.md` or `LICENCE-NOTES.md`). Keep those files and every `LICENSE*` file with any copy.

## Note

art_license is CC-BY-4.0 because some sounds need a credit line: copy the matching lines from CREDITS.txt into my-game/CREDITS.md if those sounds ship.

## What we changed

- Left out `.gitattributes` (`.gitattributes`, 126 bytes): its Git LFS rules would apply inside the kit's repo.
- Left out `cover.jpg` (`cover.jpg`, 249 KB): the cover picture for the project page.
- Nothing else. The code, art and licence files are exactly as published.

## Checked

On 2026-11-14: copied this folder to a temporary folder, ran `npm ci` and `npm run build`, and opened the demo in headless Chromium with WebGPU on. It drew without errors. The picture is `blocks/previews/destruction.jpg`.

## Updating it

Clone the source at a newer commit, read its changes and licence again, copy it over this folder leaving out the same files, and update the commit here and in `blocks/catalog.json`. If you change the code for your game, list the changes in your game's own copy of this file.
