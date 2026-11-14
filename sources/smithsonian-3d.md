# Smithsonian Open Access 3D (CC0 items)

Real museum objects: fossils, skulls, tools, sculptures, aircraft and space artefacts, for museum, dig or history games.

- Site: https://3d.si.edu/cc0
- Licence: **CC0-1.0**. Credit required: **no**. Commercial games: **yes**. AI-generated: **no**.
- What: model; styles: realistic; about 2000 items; formats: glb, gltf, obj.
- Can an agent fetch it? **manual** (api = use the API; direct = fetch single files by URL; allowed = small polite fetches; manual = the user downloads by hand).
- Checked: 2026-11-14 (partial 2026-11-14).

## Licence

> Metadata repository licence: CC0-1.0 (GitHub Smithsonian/OpenAccess). The Open Access FAQ says CC0 items can be used commercially without attribution, permission or fee (not read directly: site returned 403).

Source: https://www.si.edu/openaccess/faq

## Credit line

Not required, but kind and cheap. Suggested line for `my-game/CREDITS.md`:

```
"{title}", Smithsonian Institution (https://3d.si.edu), CC0 (credit optional)
```

## How to search and download

- The user browses https://3d.si.edu/cc0 , opens an item, checks it says CC0, and downloads the glb (pick a low-resolution version if offered).
- With a free api.data.gov key the Open Access API can search: `https://api.si.edu/openaccess/api/v1.0/search?q=<words>&api_key=<key>` (key goes in `.env`, never in code).

## Good for / not for

- Good for: Real museum objects: fossils, skulls, tools, sculptures, aircraft and space artefacts, for museum, dig or history games.
- Not for: Game-ready low-poly assets; anything not marked CC0 on its page.

## Gotchas

- Only items marked CC0 are free; some 3D items are "usage conditions apply". Check each item page.
- Scans are heavy; simplify and shrink textures.
- Partly verified: the Smithsonian site blocks tools; licence confirmed via its GitHub repo and search results.
