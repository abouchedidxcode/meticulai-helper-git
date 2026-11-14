# Riso print look: how to use it

Draws a three.js game as a risograph print: three spot inks (blue, pink, yellow) on cream paper, through rotated
halftone dot screens, with inked outlines, plate misregistration, uneven ink and paper grain. Comes with a look
switch, so the same game can be drawn in more than one look (here: riso and a plain lit look) and the game code never
knows which one is on. From Still Life 2 (meticulai.com/games/still-life-2/). Renderer: **WebGL2**
(`WebGLRenderer`, `ShaderMaterial`, depth texture). three 0.187. npm deps: `three` only.

## The one idea to understand

Objects are not given colours. They are given **roles**: `looks.mat(INK.ENEMY)`, `looks.mat(INK.WALL, MODE.WOOD)`.
The riso look renders every object into a small G-buffer (shade, role id, glow, facing) and a final pass "prints" each
role with its own ink recipe. A different look (plain, photographic, toon, dither...) turns the same role into its own
material. So:

- **Every visible object must get its material from `looks.mat()`** (or `decalMat` / `vmMaterial`). A normal
  `MeshStandardMaterial` writes nonsense into the G-buffer. Particles and sprites: give them `looks.mat(INK.FX, 0, 1)`.
- Colour carries meaning. In Still Life 2, pink only ever means "this can hurt you", yellow "yours to grab", and
  blue is everything else. Pick roles by meaning, not by what colour you want.
- Scene lights, shadows and fog do nothing in riso. Shade comes from one fixed print light (`inkUniforms.uLight`).

## What to copy

- `src/` (all of it): `index.js` (entry), `look-switch.js` (the switch, no three.js), `riso/inks.js` (roles, modes,
  the 8 ink sets, no three.js), `riso/materials.js` (G-buffer materials), `riso/renderer.js` (`RisoView`, the print
  pass), `plain/look.js` (the lit fallback look).
- Demo only: `demo/` (`test-scene.js` is the shared looks test scene).

## API

```js
import { createLookSwitch, risoLook, createPlainLook, skyDome, inkUniforms, INK, MODE } from '.../src/index.js';

const looks = createLookSwitch({
  looks: { riso: risoLook({ palette: 'classic' }), plain: createPlainLook() },
  renderer,                       // one THREE.WebGLRenderer shared by every look
  storageKey: 'mygame.look',      // optional: remember the player's choice; ?look=plain in the URL also works
});
mesh.material = looks.mat(INK.WALL, MODE.WOOD);     // (role, mode = PLAIN, glow = 0, side = FrontSide)
scene.add(skyDome(looks));                          // the printed sky (radius 320; keep camera.far above it)

// every frame
looks.view.fx.energy = timeScale;                   // screen signals, see below (the plain look ignores them)
looks.view.tickPalette(dt);
looks.view.render(scene, camera);                   // perspective camera only

looks.set('plain', scene);       // switch live: swaps every role material under `scene` + the frame renderer
looks.next(scene);               // the next look (for a settings button or a key)
looks.view.resize(w, h);         // when the window changes
looks.view.setPalette('teal');   // change ink set, eased over ~1 s by tickPalette (or setPalette(name, true))
```

- **Roles** (`INK`, in `riso/inks.js`, each with a comment): SKY, WALL, FLOOR, DISTANT, SCENERY, PAPER (pale things,
  skin, cloth), PLAYER (highlighter yellow shaded in blue), ENEMY (solid pink, pink outline), CORE, TURRET, SHIELD,
  PICKUP (solid yellow), ITEM, GLASS, MARK, SPLAT (dull plum: spent ink), FX, BEAM, LASER, ENEMY_SHOT, PLAYER_SHOT,
  ZONE_SLOW / ZONE_FAST (see-through areas, no outlines; use with MODE.ZONE), MACHINE, and the first-person
  view-model roles HANDS, SLEEVE, VM_PICKUP, VM_FX.
- **Modes** (`MODE`): printed surface patterns: PLAIN, FLOOR (tile grid), WALL (skirting band), ZONE (crawling
  hatch), MIRROR, SKY, DRUM, CRATE, WOOD, TILE (checker), TATAMI, CARPET, GRATE, METAL, PAPERWALL, CEILING, BELT
  (scrolls with `inkUniforms.uScroll`), HAZARD (stripes).
- **Ink sets** (`PALETTES`): classic, teal, violet, green, night, burgundy, slate, black. Only the blue ink really
  changes between them, so meaning survives. Still Life 2 gives each room its own set.
- **Screen signals** (`looks.view.fx`, all 0..1, free at 0): `energy` (how fast time runs: plates drift further
  apart), `freeze` (light blue vignette), `dash` (pink vignette + big misregistration jolt), `speed` (radial ink
  streaks), `focus` (slow motion: the world drains to a pale proof, danger and pickups keep their ink, a heavy
  vignette and still radial lines close in), `hit` (biggest jolt), `flash` x `flashScale` (yellow flash; lower
  `flashScale` for a "fewer flashes" setting), `dead` (floods pink), `replay` (yellow border), `wipe` (0 -> 1: big
  dots grow from the centre until the page is solid; a scene transition).
- `RisoView` options: `palette`, `palettes`, `fade` ([24, 95] m: ink thins with distance), `lineFade` ([30, 100] m),
  `maxPixelRatio` (1.5), `frag` + `uniforms` (replace the print pass and reuse the G-buffer: Still Life 2 builds
  its 1-bit dither and ASCII looks this way).
- `inkUniforms`: `uLight` (print light direction), `uSunDir` (where the sky prints its sun), `uTime` (animates
  ZONE), `uScroll` (BELT).
- First-person hands: build them in a second scene with `vmMaterial(looks.mat(INK.HANDS))` etc. and call
  `looks.view.render(scene, camera, vmScene, vmCamera)`. They mark the stencil, so the world never draws through them.
- `decalMat(INK.SPLAT)`: polygon-offset, double-sided, for splats and marks on walls.

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-riso-print`.
2. In `my-game/src/game/game.js`:
   `import { createLookSwitch, risoLook, createPlainLook, skyDome, INK, MODE } from '../../vendor/meticulai-riso-print/src/index.js';`
   In `createGame(ctx)`, before building the world:
   `const looks = createLookSwitch({ looks: { riso: risoLook(), plain: createPlainLook() }, renderer: ctx.view.renderer, storageKey: 'mygame.look' });`
   Pass `looks` to `buildWorld`, `player.js` and `sparks.js`, and replace every `new THREE.MeshStandardMaterial({...})`
   with `looks.mat(<role>, <mode>)`. The starter's `sparks.js` and the glow sprite in `world.js` use their own
   `ShaderMaterial`s: give them `looks.mat(INK.FX, 0, 1)` or hide them in riso.
3. The starter draws with `view.draw(scene, camera)` -> `renderer.render`. In `my-game/src/render/renderer.js` add
   `drawWith: null,` to `api`, and in both `draw()` and `capture()` replace `renderer.render(scene, camera)` with
   `api.drawWith ? api.drawWith(scene, camera) : renderer.render(scene, camera)`. Then in `createGame`:
   ```js
   ctx.view.drawWith = (s, c) => {
     const v = looks.view;
     if (v.width !== ctx.view.width || v.height !== ctx.view.height) v.resize(ctx.view.width, ctx.view.height);
     v.tickPalette(1 / 60);
     v.render(s, c);
   };
   ```
4. Drive the signals from `update(dt, mode)`: e.g. `looks.view.fx.flash` from the juice flash, `fx.hit` when hurt,
   `fx.dead` on death, `fx.wipe` between levels. Check `looks.name === 'riso'` only for UI, never for rules.
5. A "Look" choice in settings: `looks.set(name, scene)` (or `looks.next(scene)`), then the resize call above.
6. Riso sets `toneMapping = NoToneMapping` and `autoClear = false` on the shared renderer; the plain look puts ACES
   and shadows back. `view.warmUp` compiles the current look only; call it again after a switch if you see a hitch.

## The numbers that matter

- Halftone screens: blue at 15 degrees, pink at 75, yellow at 45; dot cell 5.8 device pixels x pixel ratio. Dot
  radius `sqrt(v) * mix(0.5642, 0.75, v*v)`, so area follows coverage and solids close up at the top.
- Misregistration: the pink plate is drawn from an offset of (1.3, -0.9) px x (1 + energy x 1.6 + dash x 6 + hit x 9).
  At 0.4 energy (Still Life's menu value) it is just visible; a hit knocks the plates apart for a frame.
- Outlines where the role id changes, depth jumps more than 3.5% + 4 cm, or the facing code changes by 0.07
  (creases). Outlines take the danger colour around ENEMY/TURRET/CORE.
- Distance: ink thins from 24 m to 95 m (blue to 25%, pink and yellow to 50%); outlines thin from 30 to 100 m.
- Uneven ink: blue x 0.86-1.0, pink x 0.9-1.0, yellow x 0.92-1.0 in big soft blotches; paper grain x 0.955-1.015.
- Ink set changes ease at `min(1, dt * 2.5)` per frame (~1 s), like re-inking the press.

## What made it good in Still Life 2

- It is its maker's favourite game and the one they are most proud of; the riso look carried both STILL LIFE and
  STILL LIFE 2 to the live site.
- A fresh critic watching the trailer called its first frame "a genuinely thumb-stopping image". Print reads as a
  choice; the same game in a plain photographic look, unlabelled, was described as "a cheap Unity prototype".
- Colour as meaning: pink is only ever danger. When the sun was printed as a pink ringed disc, players read it as an
  incoming shot, so the sun moved to blue. Zones were moved to blue for the same reason.
- Signals drawn in ink, not captions: testers said they "read that time slows, but never saw it" until focus got its
  own printed look (the vignette and still radial lines). Moving streaks mean fast, still lines mean slow.
- "One fight, four renderers": the game code doesn't know how it's drawn, so one seeded run plays frame for frame as
  riso, 1-bit dither, ASCII and photoreal. Dither and ASCII read the riso G-buffer, so enemies stay pink in every look.

## Gotchas

- Halftone screens are close to noise for video encoders: recordings get huge (a 260 MB master once). Record at
  higher bitrate or accept softer dots in clips.
- Retrofitting an existing game means touching every material. Start a game on `looks.mat()` from day one.
- The print pass reads depth with `camera.near/far` as a perspective camera. Orthographic cameras need a different
  `lin()`.
- Up to 255 roles fit in the G-buffer; ids are matched exactly, so a new role needs its ink recipe added to the
  `inks()` function in `riso/renderer.js` (and to `ROLE_COVERAGE` for the plain look).
- The G-buffer has no anti-aliasing (nearest sampling, by design: ids must not blend). The halftone dots and outlines
  hide it.
- `scene.background` is skipped while drawing the G-buffer (it would be read as a role); use `skyDome()`.
- Two passes per frame plus 5 x 2 G-buffer reads per pixel: cheap on desktop, fine on phones at pixel ratio 1-1.5.

## Restyle it

- New ink set: add an entry to `PALETTES` (paper + three inks as 0..1 colours). Keep pink and yellow meaning the same.
- Coarser or finer print: change `big = 5.8 * uPx` in `riso/renderer.js` (bigger = chunkier dots).
- More or less misregistration: the `vec2(1.3, -0.9)` offset and the `jolt` line in the print pass `main()`.
- A role's recipe: its branch in `inks()` (`B`, `P`, `Y` are coverages 0..1; `dots(fc, angle, cell, v)` is a screen).
- Another look: write `{ mat(id, mode, glow, side), createView(renderer) }` like `plain/look.js` and add it to
  `createLookSwitch({ looks })`. For a print-like look, `new RisoView({ renderer, frag: myShader })` reuses the
  G-buffer.

## Run the demo alone

`cd blocks/vendor/meticulai-riso-print && npm install && npm run dev` (http://127.0.0.1:5401), `npm run build` for
`dist/`, `npm test` for the logic tests. Keys: L look (riso / plain), P next ink set, F focus, E energy, S speed
streaks, W ink wipe. URL: `?look=plain`, `?palette=teal`, `?shot=1` (frozen pose, no HUD).
