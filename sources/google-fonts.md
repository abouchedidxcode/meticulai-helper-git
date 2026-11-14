# Google Fonts

Every UI and title font need: pixel fonts (Press Start 2P, Silkscreen, VT323), display, handwriting, body text in many scripts.

Site: https://fonts.google.com

## Licence

**mixed**

> Most of the fonts in the collection use the SIL Open Font License, v1.1.

Source: https://github.com/google/fonts (checked 2026-11-14)

- Credit required: No. Credit line: `No on-screen credit required. Ship the family's OFL.txt with the font files.`
- Commercial use OK: Yes (only for items whose own licence allows it; see gotchas)
- AI-generated content: No

## What is there

- Kinds: font
- Styles: any
- Approx count: ~1,900
- Formats: ttf, woff2
- Access: api. no key for the CSS API (fonts.googleapis.com/css2) or the GitHub repo; per-family licence file (OFL-1.1, Apache-2.0 or UFL-1.0). Docs: https://github.com/google/fonts

## How to search and download

- Browse https://fonts.google.com (filters: category, "Pixel" tag via search). Note the family name.
- Get the CSS (keyless, tested 2026-11-14):
```
curl -s -A "Mozilla/5.0" "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
```

- Download the woff2 URL(s) listed for the `latin` subset into `assets/fonts/`, and write your own @font-face:
```
@font-face { font-family: "Press Start 2P"; src: url(assets/fonts/press-start-2p.woff2) format("woff2"); font-display: swap; }
```

- Licence file: https://github.com/google/fonts/tree/main/ofl/<family> (folder name = licence: ofl/, apache/, ufl/).
- Easier for npm projects: see the fontsource entry.

## Good for / not for

- Good for: Every UI and title font need: pixel fonts (Press Start 2P, Silkscreen, VT323), display, handwriting, body text in many scripts.
- Not for: Selling the font files on their own.

## Gotchas

- Licence is per family: most are SIL OFL 1.1, some Apache 2.0, Ubuntu fonts use UFL 1.0. All allow use in commercial games.
- OFL rules: embed/bundle freely in a game; do not sell the font by itself; ship OFL.txt (copyright + licence) next to the font files; if you modify a font with a Reserved Font Name, rename it.
- Self-host the woff2 files instead of linking fonts.googleapis.com: works offline, no third-party request (privacy, GDPR).
- The CSS API returns woff2 only when the request looks like a modern browser; with plain curl you may get ttf. Fine either way.
