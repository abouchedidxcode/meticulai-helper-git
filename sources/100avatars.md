# 100Avatars (Polygonal Mind)

Quirky rigged low-poly humanoid characters (Mixamo-rigged), NPC crowds, party games.

- Site: https://github.com/PolygonalMind/100Avatars
- Licence: **CC-BY-4.0**. Credit required: **yes**. Commercial games: **yes**. AI-generated: **no**.
- What: model; styles: lowpoly, cartoon, voxel; about 200 items; formats: vrm, fbx, png.
- Can an agent fetch it? **direct** (api = use the API; direct = fetch single files by URL; allowed = small polite fetches; manual = the user downloads by hand).
- Checked: 2026-11-14 (GitHub licence file and README read 2026-11-14).

## Licence

> You are free to: Share ... Adapt ... for any purpose, even commercially. Under the following terms: Attribution (CCLicense.md, CC BY 4.0). README: "you can use them as a base for your own creations and make money out of it, but you can't sell them directly."

Source: https://github.com/PolygonalMind/100Avatars/blob/master/CCLicense.md

## Credit line

Required. Put this in `my-game/CREDITS.md` and the game's credits screen:

```
"{title}" by Polygonal Mind (100Avatars, https://github.com/PolygonalMind/100Avatars), CC BY 4.0
```

## How to search and download

```bash
gh api repos/PolygonalMind/100Avatars/contents/100Avatars_001 --jq '.[].name'
curl -L -o avatar001.zip "https://github.com/PolygonalMind/100Avatars/raw/master/100Avatars_001.zip"
```
- Each avatar has a .png preview: look at it before downloading the zip.

## Good for / not for

- Good for: Quirky rigged low-poly humanoid characters (Mixamo-rigged), NPC crowds, party games.
- Not for: Realistic characters.

## Gotchas

- VRM loads with @pixiv/three-vrm; the FBX needs converting to glb.
- No animations included: add Mixamo or Quaternius UAL clips.
- Check the default branch name before building raw URLs.
