# Quaternius

Big themed low-poly kits (medieval village, sci-fi, nature, city, pirates, zombies, space), many rigged and animated characters and animals, and the Universal Animation Library (120+ humanoid clips that retarget).

- Site: https://quaternius.com
- Licence: **LicenseRef-Quaternius-QAL-1.0 (older packs say CC0 on their page)**. Credit required: **no**. Commercial games: **yes**. AI-generated: **no**.
- What: model, animation; styles: lowpoly, stylized; about 84 packs; formats: fbx, obj, blend, gltf, glb.
- Can an agent fetch it? **manual** (api = use the API; direct = fetch single files by URL; allowed = small polite fetches; manual = the user downloads by hand).
- Checked: 2026-11-14 (licence page and pack pages read 2026-11-14).

## Licence

> You can use these assets, free of charge, in personal, educational, and commercial games and other projects, with no credit required. You just can't resell or redistribute the assets themselves as assets.

Source: https://quaternius.com/license.html

## Credit line

Not required, but kind and cheap. Suggested line for `my-game/CREDITS.md`:

```
"{title}" by Quaternius (https://quaternius.com), QAL (credit optional)
```

## How to search and download

- Pack list with counts, formats, tags and the per-page licence label: `sources/packs/quaternius.json`.
- The user opens the pack page, clicks "Download" (Google Drive folder for older packs, itch.io free tier for newer ones) and drops the zip in `my-game/.helper/inbox/`.
- Prefer packs whose `formats` include glTF/GLB. FBX-only packs need Blender (Import FBX, Export glTF).
- Universal Animation Library 1 and 2: 120+ humanoid clips on a standard rig; retarget onto other humanoids.

## Good for / not for

- Good for: Big themed low-poly kits (medieval village, sci-fi, nature, city, pirates, zombies, space), many rigged and animated characters and animals, and the Universal Animation Library (120+ humanoid clips that retarget).
- Not for: Realistic games; putting the raw files in a public asset pack or template.

## Gotchas

- Licence changed: the site licence page (QAL v1.0, updated 2026-08-28) covers assets "regardless of the specific site"; older pack pages still say CC0. Treat everything as QAL: fine in a game, no credit, but never re-share the files on their own (no asset packs, no templates, no "free models" repos).
- Older packs are FBX/OBJ/Blend only (no glTF): convert in Blender, or pick packs whose formats list glTF/GLB.
- Downloads are Google Drive folders or itch.io pages: no stable direct zip for tools.
- Several packs ship atlas-textured models; check texture paths after converting.
