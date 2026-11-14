# KayKit (Kay Lousberg)

Cute stylized low-poly worlds that match each other: dungeons, medieval hex maps, forests, platformer blocks, furniture, food, space bases, rigged adventurer and skeleton characters with a big shared animation library.

- Site: https://kaylousberg.com/game-assets
- Licence: **CC0-1.0**. Credit required: **no**. Commercial games: **yes**. AI-generated: **no**.
- What: model, animation; styles: lowpoly, stylized; about 17 packs; formats: gltf, fbx, obj.
- Can an agent fetch it? **direct** (api = use the API; direct = fetch single files by URL; allowed = small polite fetches; manual = the user downloads by hand).
- Checked: 2026-11-14 (every pack page read 2026-11-14; GitHub zip URL checked).

## Licence

> Free for personal and commercial use, no attribution required. (CC0 Licensed)

Source: https://kaylousberg.com/game-assets/forest-nature-pack

## Credit line

Not required, but kind and cheap. Suggested line for `my-game/CREDITS.md`:

```
"{title}" by Kay Lousberg (KayKit, https://kaylousberg.com), CC0 (credit optional)
```

## How to search and download

- Pack list: `sources/packs/kaykit.json` (17 free packs). Where `download` is set it is a direct GitHub zip:
```bash
curl -L -o kaykit-city.zip "https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0/archive/refs/heads/main.zip"
```
- Inside: `<repo>-main/addons/kaykit_<pack>/Assets/gltf/*.gltf` (+ .bin) and `Assets/texture/` (one atlas png).
- Other packs: the user opens the itch.io page in `download_page`, picks the free tier ($0 / "No thanks, just take me to the downloads"), and drops the zip in `my-game/.helper/inbox/`.

## Good for / not for

- Good for: Cute stylized low-poly worlds that match each other: dungeons, medieval hex maps, forests, platformer blocks, furniture, food, space bases, rigged adventurer and skeleton characters with a big shared animation library.
- Not for: Realistic or gritty looks.

## Gotchas

- Every model uses one shared 1024x1024 gradient atlas texture: very cheap to draw, easy to recolour by editing the atlas.
- GitHub copies are .gltf + .bin + a texture folder; keep paths or pack to .glb.
- Characters need the separate KayKit Character Animations pack for most moves (Rig_Medium / Rig_Large).
- EXTRA and SOURCE tiers on itch.io are paid; only the free tier is CC0-for-free.
