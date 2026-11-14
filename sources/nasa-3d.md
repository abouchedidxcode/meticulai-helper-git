# NASA 3D Resources

Spacecraft, rovers, rockets, asteroids, planets and Moon/Mars terrain textures.

- Site: https://science.nasa.gov/3d-resources/
- Licence: **LicenseRef-NASA-media-guidelines (US public domain in general)**. Credit required: **no**. Commercial games: **yes**. AI-generated: **no**.
- What: model, material; styles: realistic; about 500 items; formats: glb, blend, fbx, 3ds, stl, obj, tif, jpg.
- Can an agent fetch it? **direct** (api = use the API; direct = fetch single files by URL; allowed = small polite fetches; manual = the user downloads by hand).
- Checked: 2026-11-14 (3D resources page and usage guidelines read 2026-11-14).

## Licence

> All of these assets are free to download and use. Refer to the NASA Images and Media Usage Guidelines. (Guidelines: NASA material is "generally not subject to copyright in the United States"; "The NASA Insignia, Logotype, identifiers, and imagery are not in the public domain.")

Source: https://www.nasa.gov/nasa-brand-center/images-and-media/

## Credit line

Not required, but kind and cheap. Suggested line for `my-game/CREDITS.md`:

```
"{title}", courtesy of NASA ({url})
```

## How to search and download

- Browse https://science.nasa.gov/3d-resources/ (filter "Asset format: glb").
- Single files from GitHub (never clone, the repo is about 5 GB):
```bash
gh api "repos/nasa/NASA-3D-Resources/contents/3D%20Models" --jq '.[].name' | head
curl -L -o model.glb "https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/<path>"
```

## Good for / not for

- Good for: Spacecraft, rovers, rockets, asteroids, planets and Moon/Mars terrain textures.
- Not for: Games that show the NASA logo or imply NASA endorses them.

## Gotchas

- Remove or never show NASA logos (meatball, worm) on models; do not suggest endorsement.
- Formats vary a lot (many are 3ds/blend/fbx only); pick glb where offered.
- Credit is requested: "NASA should be acknowledged as the source of the material."
