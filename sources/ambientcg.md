# ambientCG

Tiling PBR materials (ground, rock, wood, metal, fabric, tiles), decals and leaf/grass atlases.

- Site: https://ambientcg.com
- Licence: **CC0-1.0**. Credit required: **no**. Commercial games: **yes**. AI-generated: **no**.
- What: material, hdri; styles: realistic; about 2936 items; formats: jpg, png, exr, hdr, mtlx, usdc, blend.
- Can an agent fetch it? **api** (api = use the API; direct = fetch single files by URL; allowed = small polite fetches; manual = the user downloads by hand).
- Checked: 2026-11-14 (live API test and one 1K download 2026-11-14).

## Licence

> All ambientCG assets are provided under the Creative Commons CC0 1.0 Universal License. ... You can include the raw files in your project, for example a video game.

Source: https://docs.ambientcg.com/license/

## Credit line

Not required, but kind and cheap. Suggested line for `my-game/CREDITS.md`:

```
"{title}" from ambientCG (https://ambientcg.com/a/{id}), CC0 (credit optional)
```

## How to search and download

```bash
curl -s -H "User-Agent: meticulai-helper-git/1.0" "https://ambientcg.com/api/v2/full_json?q=grass&type=Material&sort=Popular&limit=10&include=downloadData,previewData"
# then download the smallest zip listed under downloadFolders.default.downloadFiletypeCategories.zip.downloads
curl -L -o Grass004_1K-JPG.zip "https://ambientcg.com/get?file=Grass004_1K-JPG.zip"
```
- `type`: Material, HDRI, Decal, Atlas, Substance. `sort`: Popular, Latest, Alphabet.
- Preview: `previewImage["256-PNG"]`. Page: `https://ambientcg.com/a/<assetId>`.
- In the zip use `*_Color.jpg`, `*_NormalGL.jpg`, `*_Roughness.jpg`, `*_AmbientOcclusion.jpg`.

## Good for / not for

- Good for: Tiling PBR materials (ground, rock, wood, metal, fabric, tiles), decals and leaf/grass atlases.
- Not for: Stylized or low-poly looks without heavy remixing; models and characters.

## Gotchas

- Even the 1K-JPG zip is big (about 10 MB for Grass004): it holds Color, NormalGL, NormalDX, Roughness, AmbientOcclusion, Displacement, plus .blend/.usdc/.mtlx/.tres. Keep only Color, NormalGL, Roughness (and AO) and compress them.
- three.js wants the NormalGL map, not NormalDX.
- Displacement maps need a dense mesh; skip them on the web unless you need them.
