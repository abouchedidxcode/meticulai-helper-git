# Poly Haven

Realistic skies and lighting (HDRIs), ground and wall materials, realistic props (rocks, furniture, plants) at real-world scale.

- Site: https://polyhaven.com
- Licence: **CC0-1.0**. Credit required: **no**. Commercial games: **yes**. AI-generated: **no**.
- What: model, material, hdri; styles: realistic; about 2388 items; formats: gltf, blend, fbx, usd, hdr, exr, jpg, png.
- Can an agent fetch it? **api** (api = use the API; direct = fetch single files by URL; allowed = small polite fetches; manual = the user downloads by hand).
- Checked: 2026-11-14 (live API test 2026-11-14 (types, assets, search, files)).

## Licence

> Our assets are all licensed as CC0 ... You can use our assets for any purpose, including commercial work. You do not need to give credit.

Source: https://polyhaven.com/license

## Credit line

Not required, but kind and cheap. Suggested line for `my-game/CREDITS.md`:

```
"{title}" by {author}, Poly Haven (https://polyhaven.com/a/{id}), CC0 (credit optional)
```

## How to search and download

```bash
# list (one call returns every asset of a type, with categories and tags)
curl -s -H "User-Agent: meticulai-helper-git/1.0" "https://api.polyhaven.com/assets?type=hdris&category=outdoor"
# search in plain words, best match first
curl -s -H "User-Agent: meticulai-helper-git/1.0" "https://api.polyhaven.com/search?q=mossy%20rock&t=models"
# every file for one asset (by map, resolution, format) with URL, size, md5
curl -s -H "User-Agent: meticulai-helper-git/1.0" "https://api.polyhaven.com/files/rock_moss_set_01"
```
- HDRI: `files.hdri["1k"].hdr.url` (use 1k-2k; load with RGBELoader / HDRLoader).
- Texture: `files.Diffuse["1k"].jpg.url`, `files.nor_gl`, `files.Rough`, `files.AO` (or `arm` = AO+Rough+Metal packed).
- Model: `files.gltf["1k"].gltf.url` plus every URL in `.include` (bin and textures), saved with the same relative paths.
- Page to show a person: `https://polyhaven.com/a/<id>`. Thumbnail: `https://cdn.polyhaven.com/asset_img/thumbs/<id>.png?width=256`.

## Good for / not for

- Good for: Realistic skies and lighting (HDRIs), ground and wall materials, realistic props (rocks, furniture, plants) at real-world scale.
- Not for: Low-poly, toon or pixel games (looks out of place); characters or animals (almost none); anything animated.

## Gotchas

- Files are big: pick 1k textures and 1k/2k HDRIs for the web; 4k+ HDRIs are 20-100 MB.
- Models are photoscanned: 5k-100k+ triangles each; check triangles before using many.
- glTF downloads are a .gltf + .bin + separate texture files listed under files.gltf.<res>.gltf.include; fetch them all, keep relative paths, or pack to .glb.
- The website forbids scraping; use the API only. If the game shows a live Poly Haven browser to players, say "Powered by Poly Haven".
- Logos, renders and site text are not CC0; only the assets are.
