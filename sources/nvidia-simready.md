# NVIDIA SimReady Assets

Realistic industrial, warehouse, hospital, office and everyday objects with physics-ready data.

- Site: https://huggingface.co/datasets/nvidia/simready-assets
- Licence: **CC-BY-4.0**. Credit required: **yes**. Commercial games: **yes**. AI-generated: **no**.
- What: model; styles: realistic; about 1000 items; formats: usd.
- Can an agent fetch it? **direct** (api = use the API; direct = fetch single files by URL; allowed = small polite fetches; manual = the user downloads by hand).
- Checked: 2026-11-14 (dataset API and card read 2026-11-14).

## Licence

> license: cc-by-4.0 (dataset card); each asset folder carries .metadata/LICENSE.txt with the full CC BY 4.0 text.

Source: https://huggingface.co/datasets/nvidia/simready-assets

## Credit line

Required. Put this in `my-game/CREDITS.md` and the game's credits screen:

```
"{title}" from NVIDIA SimReady Assets (https://huggingface.co/datasets/nvidia/simready-assets), CC BY 4.0
```

## How to search and download

```bash
curl -s "https://huggingface.co/api/datasets/nvidia/simready-assets/tree/main"                       # asset folders
curl -s "https://huggingface.co/api/datasets/nvidia/simready-assets/tree/main/IV_pole_a01?recursive=true"
curl -L -o thumb.png "https://huggingface.co/datasets/nvidia/simready-assets/resolve/main/<folder>/simready_usd/.thumbs/256x256/<file>.usd.png"
```
- Look at the thumbnail first. Download the .usd and every file it references, import into Blender, export .glb.

## Good for / not for

- Good for: Realistic industrial, warehouse, hospital, office and everyday objects with physics-ready data.
- Not for: Quick web use without conversion; stylized games.

## Gotchas

- USD only: convert to glTF in Blender (File > Import > USD, then Export glTF) before three.js can load it.
- Built for simulation (Omniverse): materials (MDL) may not carry over; expect to re-assign simple PBR materials.
- Over 1,000 asset folders (the first tree page lists 1,000); clone nothing in bulk.
