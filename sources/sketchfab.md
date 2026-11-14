# Sketchfab (CC0 and CC BY downloadable models only)

A specific realistic or stylized object, creature or scan you cannot find elsewhere.

- Site: https://sketchfab.com/search?features=downloadable&type=models
- Licence: **mixed**. Credit required: **yes**. Commercial games: **yes**. AI-generated: **no**.
- What: model, animation; styles: any; about unknown items; formats: glb, gltf, fbx, usdz.
- Can an agent fetch it? **api** (api = use the API; direct = fetch single files by URL; allowed = small polite fetches; manual = the user downloads by hand).
- Checked: 2026-11-14 (keyless search and licence list tested 2026-11-14).

## Licence

> Sketchfab licence list (GET /v3/licenses): "cc0: Credit is not mandatory. Commercial use is allowed." "by: Author must be credited. Commercial use is allowed." "by-nc: Author must be credited. No commercial use."

Source: https://api.sketchfab.com/v3/licenses

## Credit line

Required. Put this in `my-game/CREDITS.md` and the game's credits screen:

```
"{title}" by {author} ({url}), {license}
```

## How to search and download

```bash
curl -s -H "User-Agent: meticulai-helper-git/1.0" "https://api.sketchfab.com/v3/search?type=models&q=lantern&downloadable=true&license=cc0&count=12"
curl -s -H "User-Agent: meticulai-helper-git/1.0" "https://api.sketchfab.com/v3/search?type=models&q=lantern&downloadable=true&license=by&count=12"
```
- Results carry `name`, `user.displayName`, `license.label`, `faceCount`, `thumbnails.images[]`, `viewerUrl`.
- Download needs the user's Sketchfab login: send them the `viewerUrl`, they click Download, choose glTF/GLB, and drop it in `my-game/.helper/inbox/`.

## Good for / not for

- Good for: A specific realistic or stylized object, creature or scan you cannot find elsewhere.
- Not for: NC, ND, SA, Standard, Editorial models (see sources/README.md: never use).

## Gotchas

- Always filter license=cc0 or license=by. Never use by-nc, by-nc-sa, by-nc-nd, by-nd ("Modified versions can not be distributed"), by-sa, or "ed" (editorial).
- "Free Standard" / "Standard" are store licences with their own terms: skip them.
- Many models are huge (100k-1M triangles); check faceCount in search results.
- Fan art of games, films and brands is common: even CC BY does not make a trademarked character safe to use.
