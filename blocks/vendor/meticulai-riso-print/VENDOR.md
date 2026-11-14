# Riso print look: where this copy came from

From **Still Life 2** by Meticulai (meticulai.com, play it at https://meticulai.com/games/still-life-2/).
Extracted 2026-11-14 from the game's source at `8849adcf3` (clean: no uncommitted changes in the files used).

| | |
|---|---|
| Made by | Meticulai |
| Source files (in the game folder) | `src/look.js`, `src/renderer.js`, `src/materials.js`, `src/looks/riso/renderer.js`, `src/looks/riso/materials.js` |
| Code licence | MIT (see `LICENSE`) |
| Art | none: fully procedural, no textures or models |
| Renderer | webgl2 |
| three.js | written for 0.186, checked on 0.187.0 |

## What changed

- **Kept exactly:** the G-buffer layout, every surface mode's pattern, every role's ink recipe, the halftone angles
  (15/75/45 degrees), dot size and dot-area curve, outline rules, distance fades (24-95 m, 30-100 m),
  misregistration offset and jolt weights, uneven-ink and grain numbers, all eight ink sets, the palette ease rate,
  and every screen signal (freeze, dash, speed, focus, hit, flash, dead, replay, wipe).
- **Renamed roles to general names** (ids unchanged): WEAPON -> PICKUP, MIRROR -> GLASS, EBULLET -> ENEMY_SHOT,
  PBULLET -> PLAYER_SHOT, SLOW/FAST -> ZONE_SLOW/ZONE_FAST, DRUM -> MACHINE, BOTTLE -> ITEM, VMWEAPON -> VM_PICKUP,
  VMFX -> VM_FX, SELF -> PLAYER. Comments now describe what each role means in any game.
- **Generalised:** the post uniforms the game set by hand are now a `fx` object on the view; the print light and
  the sky's sun direction (hard-coded in the shader) are uniforms with the same defaults; the distance fades are
  options with the same defaults; the conveyor uniform `uBelt` is `uScroll`; the renderer can share a
  `WebGLRenderer` (`opts.renderer`) and takes `resize(w, h)`; `scene.background` is skipped in the G-buffer pass.
- **The look switch:** Still Life 2 picked the look once (`?look=` or settings) and reloaded the page. Here
  `look-switch.js` does the same job live: `mat()` tags each material with its role and `set()` swaps them and the
  frame renderer without a reload. The URL/saved-choice picking is kept (`pickLook`).
- **Plain look:** new and small (`plain/look.js`). Still Life 2's photographic look (lit PBR, reflections, GTAO,
  bloom, its own grade) is ~900 lines of game-specific surfaces and was left out; the plain look shows the switch
  and keeps each role's colour meaning by computing its overprint colour.
- **Dropped (game-only):** the ending's "press" vertex squash (`uFlatOn`, `uFlat`, `uFlatBox`, `solidMat`), the
  `attach()/setRoom()/setQuality()` no-ops, and the game's sky model import (replaced by `skyDome()`). The dither and
  ASCII looks are not included (they reuse the G-buffer through `opts.frag`).
- **Removed** comments that compared the game with other games.
- Added: `demo/` (shared looks test scene), `test/` (10 logic tests), these docs.

## Checked

On 2026-11-14: built with vite 8.3.8 and three 0.187.0, opened headless in Chromium (Metal), no errors or warnings;
pressed every demo key (look switch both ways, ink sets, focus, energy, speed, wipe) without errors.
`npm test`: 10 passing. Preview: `blocks/previews/meticulai-riso-print.jpg`.

## Third party

None copied. The value-noise and sin-hash one-liners are common public snippets written from memory.
