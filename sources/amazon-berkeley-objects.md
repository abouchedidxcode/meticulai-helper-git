# Amazon Berkeley Objects (ABO)

Realistic household products and furniture (chairs, sofas, lamps, tables, rugs, decor) with 4K PBR textures, for room or shop scenes.

- Site: https://amazon-berkeley-objects.s3.amazonaws.com/index.html
- Licence: **CC-BY-4.0**. Credit required: **yes**. Commercial games: **yes**. AI-generated: **no**.
- What: model; styles: realistic; about 7953 items; formats: glb.
- Can an agent fetch it? **direct** (api = use the API; direct = fetch single files by URL; allowed = small polite fetches; manual = the user downloads by hand).
- Checked: 2026-11-14 (README and S3 listing read 2026-11-14).

## Licence

> This work is licensed under the Creative Commons Attribution 4.0 International Public License. ... Credit for the data, including all images and 3d models, must be given to: Amazon.com

Source: https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/README.md

## Credit line

Required. Put this in `my-game/CREDITS.md` and the game's credits screen:

```
"{title}" from Amazon Berkeley Objects, (c) Amazon.com, CC BY 4.0 (https://amazon-berkeley-objects.s3.amazonaws.com/index.html)
```

## How to search and download

```bash
curl -s -o 3dmodels.csv.gz "https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/metadata/3dmodels.csv.gz"   # 340 KB: id, path, faces, size
curl -s "https://amazon-berkeley-objects.s3.amazonaws.com/?list-type=2&prefix=listings/metadata/"                  # product names, types, 3dmodel_id
curl -s -o model.glb "https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/<path from csv>"
```
- Browse by eye: https://amazon-berkeley-objects.s3.amazonaws.com/index.html (Explore tab, "Only products with 3D models").

## Good for / not for

- Good for: Realistic household products and furniture (chairs, sofas, lamps, tables, rugs, decor) with 4K PBR textures, for room or shop scenes.
- Not for: Stylized games; small downloads (models are about 5-45 MB each).

## Gotchas

- Heavy: 4K textures; shrink textures and simplify (tools/assets/restyle.mjs) before use.
- These are real Amazon products: brand names in the metadata; do not use brand names or logos in the game.
- Searching needs the listings metadata (about 68 MB of json.gz): download once, then filter locally.
