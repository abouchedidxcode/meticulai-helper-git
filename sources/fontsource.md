# Fontsource

Self-hosting Google Fonts (and some other open fonts) in a Vite/npm game with one import line.

Site: https://fontsource.org

## Licence

**mixed**

> Always make sure to read the license for each font you use. Most of the fonts in the collection use the SIL Open Font License, v1.1.

Source: https://github.com/fontsource/fontsource (checked 2026-11-14)

- Credit required: No. Credit line: `No on-screen credit required. The npm package carries the font licence.`
- Commercial use OK: Yes (only for items whose own licence allows it; see gotchas)
- AI-generated content: No

## What is there

- Kinds: font
- Styles: any
- Approx count: ~2,100
- Formats: woff2, woff, ttf
- Access: api. no key; one npm package per font (@fontsource/<id>); metadata API https://api.fontsource.org/v1/fonts/<id> returns the SPDX licence. Docs: https://fontsource.org/docs/getting-started/install

## How to search and download

- Look up a font and its licence (keyless, tested 2026-11-14):
```
curl -s "https://api.fontsource.org/v1/fonts/press-start-2p"   # ..."license":"OFL-1.1"...
```

- Install and import:
```
npm install @fontsource/press-start-2p
// main.js
import "@fontsource/press-start-2p";
```

- Then use `font-family: "Press Start 2P"` in CSS or wait for `document.fonts.ready` before drawing text on a canvas.

## Good for / not for

- Good for: Self-hosting Google Fonts (and some other open fonts) in a Vite/npm game with one import line.
- Not for: Projects without a bundler (use the Google Fonts woff2 files directly).

## Gotchas

- Licence per font, returned by the API. Of 2,103 fonts on 2026-11-14: 2,059 OFL-1.1, 36 Apache-2.0, 5 UFL-1.0, and one each CC0, MIT, Unlicense.
- Same OFL rules as Google Fonts (bundle OK, no standalone sale, keep the licence; the npm package includes it).
- Use the variable package (@fontsource-variable/<id>) when the font has one: one file for all weights.
