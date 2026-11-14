# Crowds and navigation: where this copy came from

This folder is a copy of an open-source project, kept here so the kit works offline and never changes under your game.

| | |
|---|---|
| Made by | Patch (patch.gg), on recast-navigation-js by Isaac Mason |
| Source | https://git.patch.gg/patch/crowds.git |
| Commit | `35ca0a412c8b96024517124db6cbce7d90393ecc` (2026-11-04) |
| Copied on | 2026-11-14 |
| Code licence | MIT (see `LICENSE`) |
| Art licence | CC0-1.0 |
| Renderer | webgl2 |

## Other people's work inside it

- recast-navigation-js (npm recast-navigation, @recast-navigation/three): Isaac Mason, MIT. https://github.com/isaac-mason/recast-navigation-js
- Recast and Detour: Mikko Mononen, Zlib. https://github.com/recastnavigation/recastnavigation
- Universal Animation Library (mannequin clips): Quaternius, CC0-1.0. https://quaternius.com/packs/universalanimationlibrary.html
- postprocessing, n8ao (npm): pmndrs; N8python, Zlib / ISC. https://github.com/pmndrs/postprocessing

The full, file-by-file list is in the project's own credits file (`CREDITS.txt`, `CREDITS.md`, `public/CREDITS.md` or `LICENCE-NOTES.md`). Keep those files and every `LICENSE*` file with any copy.

## Note

Its upstream package-lock.json was out of sync with package.json (npm ci failed); we regenerated it with npm install. Nothing else changed.

## What we changed

- Left out `.gitattributes` (`.gitattributes`, 126 bytes): its Git LFS rules would apply inside the kit's repo.
- Left out `cover.jpg` (`cover.jpg`, 201 KB): the cover picture for the project page.
- Regenerated `package-lock.json` with `npm install`: the original was out of sync with `package.json`, so `npm ci` failed. Only missing peer packages were added; no versions changed.
- Nothing else. The code, art and licence files are exactly as published.

## Checked

On 2026-11-14: copied this folder to a temporary folder, ran `npm install` and `npm run build`, and opened the demo in headless Chromium. It drew without errors. The picture is `blocks/previews/crowds.jpg`.

## Updating it

Clone the source at a newer commit, read its changes and licence again, copy it over this folder leaving out the same files, and update the commit here and in `blocks/catalog.json`. If you change the code for your game, list the changes in your game's own copy of this file.
