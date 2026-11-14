# Scenario 3D Collection

Odd one-off props and creatures to try quickly, each with the prompt that made it (useful to see what a prompt gives).

- Site: https://huggingface.co/datasets/scenario-labs/3d-collection
- Licence: **CC-BY-4.0**. Credit required: **yes**. Commercial games: **yes**. AI-generated: **yes**.
- What: model; styles: stylized, realistic, cartoon, voxel; about 1342 items; formats: glb, blend, ply, vox, fbx, spz.
- Can an agent fetch it? **direct** (api = use the API; direct = fetch single files by URL; allowed = small polite fetches; manual = the user downloads by hand).
- Checked: 2026-11-14 (dataset card and LICENSE read 2026-11-14).

## Licence

> CC BY 4.0. Credit "Scenario". All assets are AI-generated.

Source: https://huggingface.co/datasets/scenario-labs/3d-collection

## Credit line

Required. Put this in `my-game/CREDITS.md` and the game's credits screen:

```
"{title}" by Scenario (https://huggingface.co/datasets/scenario-labs/3d-collection), CC BY 4.0, AI-generated
```

## How to search and download

```bash
curl -s "https://huggingface.co/api/datasets/scenario-labs/3d-collection/tree/main/assets?limit=50"
curl -L -o preview.jpg "https://huggingface.co/datasets/scenario-labs/3d-collection/resolve/main/assets/<example>/preview.jpg"
curl -L -o model.glb  "https://huggingface.co/datasets/scenario-labs/3d-collection/resolve/main/assets/<example>/<file>.glb"
```
- Prompts and settings per example are in `data/train-00000-of-00001.parquet` (read with pandas/polars or duckdb).

## Good for / not for

- Good for: Odd one-off props and creatures to try quickly, each with the prompt that made it (useful to see what a prompt gives).
- Not for: A consistent family of assets; clean topology or animation.

## Gotchas

- All AI-generated: quality and style vary a lot; look at every model before use.
- A companion Hunyuan set is gated and under other licences: do not use it.
- Typical AI meshes: dense, messy triangles, baked lighting in textures; simplify and check scale.
