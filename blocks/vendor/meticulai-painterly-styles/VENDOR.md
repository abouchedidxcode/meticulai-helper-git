# Painterly styles: where this came from

From **Kite Race** by Meticulai (meticulai.com; not released yet). Extracted 2026-11-14 from the game's source at
`9f685dbe9` (clean: no uncommitted changes in the files used).

| | |
|---|---|
| Made by | Meticulai |
| Source files (in the game folder) | `src/render/style.ts`, `style-gouache.ts`, `style-miniature.ts`, `style-clean.ts`, `style-post.ts`; hooks in `src/atmosphere.ts` (material patch, light loop, sky) and `src/post.ts` (final grade pass, bloom) |
| Code licence | MIT (see `LICENSE`) |
| Art | none (no textures, models or images) |
| Renderer | webgl2, three 0.187.0 (the game used 0.186) |

## What changed

- TypeScript -> plain JavaScript with JSDoc types.
- **Kept exactly:** the three style tables (light, haze, sky, grade overrides, bloom, vignette, AO flag), every GLSL
  number: palettes, palette snap, gouache world-space brush, light ramps, styled haze (`stFog`), styled skies
  (`stSky`, painted night), and the whole post pass (ink, Kuwahara brush, paper, border). The grade pass keeps the
  game's exposure, ACES / hue-keeping filmic / Neutral curves, split tone, saturation, S-curve, vignette, fringe, grain
  and its round-2 bloom weights (radius 0, threshold 2.6, strength 0.3).
- **Made standalone:** the game's style patch ran inside its own atmosphere patch (height fog, cloud shadows, street
  dust, lamp pools, passages). Here `patchStyleMaterial` adds its own world-position varying and applies the styled
  haze on top of three's normal `scene.fog`, tinted toward the sun like the game's air. `StylePass` and `GradePass` are
  plain classes with a `FullScreenQuad` instead of the game's `EffectComposer` chain; `createPainterlyStyles` wires
  scene -> HDR target (MSAA, depth texture) -> bloom -> grade -> style pass.
- **Options instead of game ties:** the storage key (was the game's own key) is `storageKey`; the game's Atmosphere
  look tables became `BASE_LOOKS` (its golden, morning and night looks, only the fields used here) and `applyLook()`;
  new `fogDensityScale` and `fogDistanceScale` because the game's haze was tuned for a 4 km city.
- **Surface kinds:** the game picked a kind from material names (kites, people, its paved ground). Here you pass the
  kind (`flat`, `textured`, `hero`, `figure`, `ground`). The game's paved-ground kind rebuilt its ground from that
  ground's own mask (lanes, square, rings); that part is game-only and was dropped, so `ground` is a flat ground with
  the ground's palette treatment.
- The styles' light ramp is also applied to point and spot lights (the game only had a sun).
- The sky keeps the game's base sky (gradient, warm horizon band, streak clouds, sun disc, moon, stars, height haze)
  under the styled sky; the game's colour-mode switch is fixed at its current value.
- **Dropped:** the styled water (it reads the game's river shader's locals), the "start in Classic = compile nothing"
  mode and its page reload (here the style code is always compiled; Classic is the same program with uStyle 0), the
  game's speed lines and gust kick in the final pass, its GTAO pass (the game's clean style kept AO; add three's
  `GTAOPass` yourself if you want it and switch it with `styles.def.noAO`), the debug globals and profiler names.
- Names: the game's other curve was named after another game; it is called the hue-keeping filmic curve here.

## Checked

On 2026-11-14 with three 0.187.0 and vite 8.3.8: `vite build`, then the demo in headless Chromium (Metal): all four
styles and the night and morning looks draw with no console errors or warnings; S cycles gouache -> miniature -> clean
-> Classic -> gouache live and the choice survives a reload. `node --test test/`: 9 passing. Preview:
`blocks/previews/meticulai-painterly-styles.jpg` (gouache, golden).
