# Kenney

Clean, consistent low-poly 3D kits (city, nature, dungeon, space, cars, food, furniture, mini characters with animations), 2D platformer/top-down/roguelike tilesets, UI packs, input prompts, game icons, UI and impact sounds, fonts. One family across many genres.

- Site: https://kenney.nl/assets
- Licence: **CC0-1.0**. Credit required: **no**. Commercial games: **yes**. AI-generated: **no**.
- What: model, sprite, tileset, icon, audio, music, font, material, vfx, animation; styles: lowpoly, cartoon, pixel; about 217 packs; formats: glb, fbx, obj, png, svg, ogg, ttf.
- Can an agent fetch it? **manual** (api = use the API; direct = fetch single files by URL; allowed = small polite fetches; manual = the user downloads by hand).
- Checked: 2026-11-14 (licence text read on pack pages and in one zip 2026-11-14).

## Licence

> License: (Creative Commons Zero, CC0) ... You can use this content for personal, educational, and commercial purposes. Support by crediting 'Kenney' or 'www.kenney.nl' (this is not a requirement)

Source: https://kenney.nl/assets (License row on every pack page; same text in each zip's License.txt)

## Credit line

Not required, but kind and cheap. Suggested line for `my-game/CREDITS.md`:

```
"{title}" by Kenney (https://kenney.nl), CC0 (credit optional)
```

## How to search and download

- Pack list with kinds, style, tags and counts: `sources/packs/kenney.json` (217 packs). Pick from it; do not crawl kenney.nl.
- Ask the user: "Please open <pack url>, click Download (you can skip the donation), and drag the zip into `my-game/.helper/inbox/`."
- Checked 3D pack layout: `Models/GLB format/*.glb` (+ `Textures/colormap.png` beside them), `Previews/*.png`, `License.txt`.

## Good for / not for

- Good for: Clean, consistent low-poly 3D kits (city, nature, dungeon, space, cars, food, furniture, mini characters with animations), 2D platformer/top-down/roguelike tilesets, UI packs, input prompts, game icons, UI and impact sounds, fonts. One family across many genres.
- Not for: Realistic games; detailed hero characters.

## Gotchas

- kenney.nl/robots.txt blocks AI agents by name and disallows automated access to /assets/ and /downloads/: tools must not crawl or download from kenney.nl. Ask the user to download the pack and drop the zip into the game folder.
- Downloads are short-lived signed links made by the page; there is no stable direct zip URL.
- GLBs in at least some 3D packs point to an external Textures/colormap.png beside them: keep that folder or embed the texture.
- Scale differs between kits: measure each model (tools/assets/look.mjs) and rescale to metres.
- A paid "All-in-1" bundle exists on itch.io; it is a convenience, not needed.
