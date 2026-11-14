# CMU Graphics Lab Motion Capture Database

Realistic human motion (walks, runs, dances, sports, climbing) to retarget onto a character.

- Site: http://mocap.cs.cmu.edu
- Licence: **LicenseRef-CMU-mocap (free for all uses; no resale of the data)**. Credit required: **no**. Commercial games: **yes**. AI-generated: **no**.
- What: animation; styles: realistic; about 2600 items; formats: asf, amc, c3d, bvh.
- Can an agent fetch it? **manual** (api = use the API; direct = fetch single files by URL; allowed = small polite fetches; manual = the user downloads by hand).
- Checked: 2026-11-14 (home page and FAQ read 2026-11-14).

## Licence

> This dataset of motions is free for all uses. ... You may include this data in commercially-sold products, but you may not resell this data directly, even in converted form.

Source: http://mocap.cs.cmu.edu

## Credit line

Not required, but kind and cheap. Suggested line for `my-game/CREDITS.md`:

```
Motion data from the CMU Graphics Lab Motion Capture Database (http://mocap.cs.cmu.edu)
```

## How to search and download

- Search by keyword at http://mocap.cs.cmu.edu (e.g. "walk", "jump"), download single motions, retarget in Blender. Never crawl.

## Good for / not for

- Good for: Realistic human motion (walks, runs, dances, sports, climbing) to retarget onto a character.
- Not for: Beginners: needs retargeting in Blender; stylized characters (motion looks too real).

## Gotchas

- ASF/AMC units are inches-based: scale per their FAQ.
- Raw mocap has noise and no root-motion cleanup; expect Blender work.
- Never crawl the database.
