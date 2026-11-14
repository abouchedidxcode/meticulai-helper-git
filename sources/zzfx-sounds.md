# ZzFX (Zuper Zmall Zound Zynth)

Tiny browser games: sound effects as one line of code each, no audio files at all. Ideal for agents (they can write and tune the parameter arrays).

Site: https://killedbyapixel.github.io/ZzFX

## Licence

**MIT**

> Open Source: MIT licensed, use it anywhere!

Source: https://github.com/KilledByAPixel/ZzFX (checked 2026-11-14)

- Credit required: No. Credit line: `No on-screen credit required; keep the MIT notice in ZzFX.js.`
- Commercial use OK: Yes
- AI-generated content: No

## What is there

- Kinds: audio
- Styles: pixel, cartoon
- Approx count: not stated
- Formats: js, wav
- Access: github. no key; <1 KB JS library; the sound designer page outputs a parameter array you paste into code. Docs: https://github.com/KilledByAPixel/ZzFX

## How to search and download

- Design: open https://killedbyapixel.github.io/ZzFX, press presets/randomise, copy the generated `zzfx(...[...])` line.
- Use: `npm i zzfx` or copy ZzFX.js, then:
```
import { zzfx } from "./ZzFX.js";   // or: npm install zzfx
button.onclick = () => zzfx(...[,,925,.04,.3,.6,1,.3,,6.27,-184,.09,.17]);
```

## Good for / not for

- Good for: Tiny browser games: sound effects as one line of code each, no audio files at all. Ideal for agents (they can write and tune the parameter arrays).
- Not for: Realistic audio, long music (see ZzFXM for tracker music).

## Gotchas

- The library is MIT: keep its licence header in the file you ship. The sounds are just numbers you choose, so there is nothing else to license.
- Browsers block audio until the first user click/tap: trigger the first zzfx() from an input handler.
- The designer page can also export a wav if you prefer files.
