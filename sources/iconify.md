# Iconify API (index of 270+ open icon sets)

Agents finding an icon by keyword across hundreds of sets and reading the licence from the same response (game-icons, Lucide, Tabler, Phosphor, Material, pixelarticons, Twemoji, Noto emoji...).

Site: https://icon-sets.iconify.design

## Licence

**mixed**

> "game-icons":{"name":"Game Icons",...,"license":{"title":"CC BY 3.0","spdx":"CC-BY-3.0","url":"https://github.com/game-icons/icons/blob/master/license.txt"}

Source: https://api.iconify.design/collections (checked 2026-11-14)

- Credit required: No. Credit line: `Depends on the set: e.g. "Icons made by {author}. Available on https://game-icons.net" for game-icons (CC BY 3.0); none needed for MIT/ISC/Apache sets beyond keeping the licence text.`
- Commercial use OK: Yes (only for items whose own licence allows it; see gotchas)
- AI-generated content: No

## What is there

- Kinds: icon
- Styles: any, pixel
- Approx count: ~480,000
- Formats: svg, json
- Access: api. no key; search https://api.iconify.design/search?query=...; per-set licence in the "collections" block of every response; SVG at https://api.iconify.design/<prefix>/<name>.svg. Docs: https://iconify.design/docs/api/

## How to search and download

- Search (keyless, tested 2026-11-14; returns icon ids plus a collections block with licences):
```
curl -s "https://api.iconify.design/search?query=sword&limit=32&prefixes=game-icons,lucide,tabler"
```

- Download one SVG (tested, HTTP 200):
```
curl -s "https://api.iconify.design/game-icons/broadsword.svg" -o assets/icons/broadsword.svg
```

- List all sets with licences: `curl -s https://api.iconify.design/collections`.
- Options on the SVG URL: `?color=%23ffcc00&height=64`.

## Good for / not for

- Good for: Agents finding an icon by keyword across hundreds of sets and reading the licence from the same response (game-icons, Lucide, Tabler, Phosphor, Material, pixelarticons, Twemoji, Noto emoji...).
- Not for: Trusting the licence field blindly for sets that changed licence recently (see gotchas).

## Gotchas

- Licence is per icon set: read collections[prefix].license.spdx. On 2026-11-14 the 276 sets were mostly MIT (144), CC-BY-4.0 (53), Apache-2.0 (31), OFL-1.1 (13), CC0 (10), but also CC-BY-SA (9), GPL (6) and CC-BY-NC (2). Allow-list SPDX ids; reject NC, and avoid SA/GPL unless the user accepts share-alike.
- Restrict searches with prefixes= to sets you already approved, e.g. prefixes=game-icons,lucide,tabler,ph,pixelarticons.
- The licence field can lag upstream: Iconify still listed Remix Icon as Apache 2.0, but upstream switched to its own "Remix Icon License v1.0" in Jan 2026. Check the set's own repo for anything you ship.
- CC BY sets (game-icons, Font Awesome, Twemoji) need credit; record the author per icon.
- Public API is a shared free service: fetch the few icons you need and save the SVGs into the repo; do not call it at game runtime or in bulk.
