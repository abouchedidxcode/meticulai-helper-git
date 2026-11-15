# Looks

A look is a drawing style that works on **any** starter game without touching the game's code: it takes the finished
picture (with its depth) and redraws it. Colours do not come from the look; they come from `my-game/palette.json`.
A vibe (`vibes/`) is a palette, a light and a look chosen together.

    node tools/looks/list.mjs            # what there is
    node tools/looks/apply.mjs <id>      # put one on (adds the block it is built on, if any)
    node tools/looks/apply.mjs none      # take it off

| Look | What you get | Built on |
|---|---|---|
| [`print-lite`](print-lite/) | flat colour on paper, halftone dots for the shade, inked outlines | own pass (ideas from `meticulai-riso-print`) |
| [`pixel`](pixel/) | big crisp pixels in colours from your palette, with dither | own pass (dither from `meticulai-pixel-3d`) |
| [`retro-console`](retro-console/) | 90s console: low resolution, colour steps, dither, wobble | `meticulai-ps1-look` |
| [`ink`](ink/) | pen-and-ink: boiling outlines, hatching in the shadows | `meticulai-ink-illustration` |
| [`painterly`](painterly/) | gouache: broad strokes near, fine far, paper tooth | `meticulai-painterly-styles` |
| [`toy-tilt-shift`](toy-tilt-shift/) | a photographed miniature: one sharp band, soft blur | `meticulai-tilt-shift-macro` |
| [`soft-haze`](soft-haze/) | calm and airy: faint glow, sun shafts, gentle contrast | `meticulai-haze` |
| [`film`](film/) | grain, darker corners, a gentle curve, tinted shadows and highlights | own pass |

All eight are checked on the island (3D) and the platformer (flat 2D, orthographic camera) starters. On flat games
`toy-tilt-shift` only partly works (the band blur, no depth blur); `look.json` says so under `"orthographic"`, and
`apply.mjs` warns when you put it on such a game.

## Looks and blocks: the honest difference

Some look blocks in `blocks/` cannot be switched on over a finished picture: they need every object to use their
materials, their camera or their way of building the world. Those are **upgrades**, listed in
[`upgrades.json`](upgrades.json) (and by `node tools/looks/list.mjs`). Where a faithful lighter version is possible as
a pass, it is a look here, and its README says what the full block adds. Nothing here pretends to be the full block.

## How a look is made (for people adding one)

    looks/<id>/look.json    id, name, one_line, kind "post", block (or null), options, cost, preview
    looks/<id>/index.js     becomes my-game/src/look/index.js: exports lookInfo and installLook(ctx)
    looks/<id>/preview.jpg  made by  node tools/looks/shots.mjs
    looks/_shared/look-kit.js   helpers every look uses; copied next to index.js

- `installLook({ view, look, tune, flags })` returns `{ render(renderer, scene, camera), resize?, update?(dt), dispose? }`.
- Draw the scene with `createStage()` and finish with `createPass()` from `look-kit.js`. Passes call `toDisplay()`:
  the starter's colours are made for its tone mapping and sRGB output, which three.js only applies when drawing
  straight to the screen.
- Declare options once, as `const OPTIONS = { name: { default, min, max, step, label, help } };` and read them with
  `lookOptions(OPTIONS)`. They show in the tuning panel under "Look". `shots.mjs` copies them into `look.json`.
- Take paper, ink and tint colours from `look` (the palette), never from fixed colours.
- Leave the renderer as you found it after each frame, and put back anything you changed in `dispose()`.
- Then run `node tools/looks/shots.mjs <id>`: it draws the look on the island starter, saves the preview, checks a
  window resize and `window.__game.capture()`, and measures the cost. Look at the picture.
