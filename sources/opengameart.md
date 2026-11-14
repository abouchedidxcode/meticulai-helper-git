# OpenGameArt.org

Pixel art, tilesets, music and sound packs from many artists; finding a specific odd thing.

- Site: https://opengameart.org
- Licence: **mixed**. Credit required: **yes**. Commercial games: **yes**. AI-generated: **no**.
- What: sprite, tileset, model, material, audio, music, icon, font; styles: any; about 30000 items; formats: png, ogg, wav, mp3, blend, obj, glb.
- Can an agent fetch it? **manual** (api = use the API; direct = fetch single files by URL; allowed = small polite fetches; manual = the user downloads by hand).
- Checked: 2026-11-14 (FAQ and search form read 2026-11-14 (before robots.txt was checked; not fetched since)).

## Licence

> I'm a commercial (closed-source) game developer. Can I use this art? Short answer: Yes, you can use this art. Even in commercial projects. Be sure to follow the terms of the license, though.

Source: https://opengameart.org/content/faq

## Credit line

Required. Put this in `my-game/CREDITS.md` and the game's credits screen:

```
"{title}" by {author} licensed {license}: {url}
```

## How to search and download

- Agents: do not fetch opengameart.org (its robots.txt blocks AI agents by name). Give the user a search link instead:
  `https://opengameart.org/art-search-advanced?keys=<words>&field_art_type_tid%5B%5D=<type>&field_art_licenses_tid%5B%5D=4`
  Types: 2D 9, 3D 10, Texture 14, Music 12, Sound effect 13. Licences: CC0 4, CC-BY 3.0 2, CC-BY 4.0 17981, OGA-BY 3.0 10310, OGA-BY 4.0 31772.
- The user downloads, then pastes the page URL, title, author and licence into `my-game/CREDITS.md` (or tells the agent).

## Good for / not for

- Good for: Pixel art, tilesets, music and sound packs from many artists; finding a specific odd thing.
- Not for: A consistent look without care; anything where you cannot track the licence of each file.

## Gotchas

- robots.txt blocks AI agents by name (Claude-User, Claude-Code, ChatGPT-User and others): agents must not browse or download from OGA; the user does it and drops files in.
- Licences per item: CC0, CC-BY 3.0/4.0, OGA-BY 3.0/4.0, CC-BY-SA 3.0/4.0, GPL 2.0/3.0. Prefer CC0 and CC-BY. CC-BY-SA and GPL are share-alike: avoid unless you know the duties.
- Many items list several licences; you may pick any one of them. Credit as the FAQ says: "[asset name]" by [author] licensed [licence]: [url].
- Some uploads are re-uploads of other people's work; check the Copyright/Attribution Notice.
