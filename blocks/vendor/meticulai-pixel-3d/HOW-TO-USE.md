# Pixel 3D: how to use it

Real pixel art from a three.js scene: the world is drawn small (12 art pixels per world unit) into an art-resolution
target, the orthographic camera is snapped to whole art pixels, and the picture is blown up with nearest sampling at a
whole-number zoom (1-6). There is no tone mapping and no colour conversion, so **every pixel on screen is an exact
colour from one hand-tuned palette** of hue-shifted ramps. Meshes are lit through those ramps; sprites (mushrooms,
crystals, beetles, curios, butterflies...) are drawn by code, shaded and outlined like hand-pixelled art.
Renderer: **WebGL2** (`WebGLRenderer`). three 0.187. npm deps: `three` only. From Rootbound (meticulai.com).

## Files

- `src/index.js`: everything below.
- `src/view.js`: `PixelView` (the art target, snapped camera, zoom, outline pass, sky, blit), `rawColor`.
- `src/material.js`: `pixelMaterial(ramp, opts)` (lit meshes in one ramp), `setDither`.
- `src/batch.js`: `PxBillboard` (3d sprites), `PxSprite` (2d sprites), `PxParticles`, `canvasTexture`.
- `src/palette.js`: `RAMPS` (the palette), `rampHex`, `rampColor`, `hexToRgb`, ramp texture data.
- `src/glsl.js`: `PX_GLSL` (hash/noise, `bayer4`, `rampAt`, `rampDither`, `rampBand`, `R_<NAME>`/`L_<NAME>` defines).
- `src/sprites.js`: the sprite generator and rasteriser (no three.js; canvas only).
- `src/snap.js`: the pure maths (tested). `demo/`: the shared looks test scene drawn as pixel art.

## API

```js
import * as THREE from 'three';
import { PixelView, pixelMaterial, PxBillboard, PxParticles, sprites } from '.../meticulai-pixel-3d/src/index.js';

const view = new PixelView({
  mode: '3d',             // '2d' = side-on (x right, y up), like Rootbound; '3d' = ortho camera at yaw/pitch
  yaw: Math.PI / 4, pitch: Math.PI / 6,   // 45 deg round, 30 deg down = classic 2:1 dimetric pixel lines
  zoom: 4,                // CSS px per art px, one of zooms [1..6]
  depth: 200,             // ortho camera sees +-depth world units around the focus
  outline: true,          // 1 px dark outline where something sits in front of something else
  sky: 'skyDay',          // dithered ramp behind everything (or null for clearColor '#120c10')
  // renderer: existingRenderer,  // reuse one (e.g. the starter's); otherwise PixelView makes its own
});
document.body.appendChild(view.canvas);

const stone = pixelMaterial('stone', { lo: 0, hi: 4, view });           // light walks the ramp from entry lo to hi
const grass = pixelMaterial('grass', { lo: 1, hi: 4, grain: 0.1, view }); // grain = pixel texture from world noise
scene.add(new THREE.Mesh(geo, stone));                                   // normal lights + shadow maps still work

const shroom = new PxBillboard(view).set(sprites.mushrooms(3)).place(1.6, 0, 3.4); // anchor = ground point
scene.add(shroom.mesh);

// each frame:
view.follow(player.x, player.y, player.z);  // camera eases there (rate 8) and stays on the art grid
view.updateCamera(dt);
for (const b of billboards) b.update();     // after the camera turns or the sprite moves
view.render(scene);                         // draws to the art target and blits to the screen
```

- `PixelView`: `zoom`, `setZoom(z)`, `zoomStep(dir)`, `yaw`/`pitch` + `updateOrientation()`, `follow(x,y,z)`,
  `snapToGoal()`, `shake` (set to 1 for a 3-pixel jolt that decays in 0.5 s), `outline`, `setSky(ramp, [lo, hi])`,
  `setClearColor(hex)`, `setOutlineColor(hex)`, `blitUniforms.uFade.value` (1 -> 0 fades to black),
  `blitUniforms.uDanger.value` (0..1 stepped dry corners), `warmUp(scene)`, `worldToScreen(v3)`, `axes`
  (right/up/forward), `pick`/`project` (2d), `tw`/`th` (art target size), `dispose()`.
- `pixelMaterial(ramp, { lo, hi, gain = 1, lift = 0, grain = 0, grainScale = 3, dither = 'band', view, lambert })`:
  a `MeshLambertMaterial` with its final colour replaced. `dither`: `'band'` (2x2 checker only in a narrow band between
  tones, like the sprites; default), `'full'` (4x4 ordered dither across each step), `'none'` (hard bands).
  `m.setRamp(name, lo, hi)` swaps the ramp live. Pass `view` so dither stays fixed to the world while panning.
- Sprites (`sprites.*`, each returns `{ canvas, ax, ay }`, cached and deterministic from its arguments):
  `beetle(seed, dir 0-15, frame 0-3, chewing)` (seen from above, 16 headings), `grub(seed, dir, frame)`,
  `crystal(seed, 'violet'|'rose'|'quartz', stage 0-4, glow)`, `organic(seed, stage 0-3)`, `mushrooms(seed, grow 0-3)`,
  `curio(kind, seed)` (`CURIO_KINDS`: snail, acorn, hazelnut, vertebra, birdskull, shard, key, marble, ammonite,
  leaffossil, bottle, seeds, worm), `bird(frame)`, `butterfly(seed, frame)`, `leaf(seed, season)`.
- Your own sprites: `const sp = new sprites.Sprite(w, h, ax, ay)`, then `sp.ellipsoid({...})`, `sp.poly(pts, {...})`,
  `sp.line(...)`, `sp.dot(...)`, `sp.shape(fn, {...})` with `sprites.spriteMaterial(ramp, lo, hi, { spec, specT, hl,
  amb, wrap, dither, out, litOut, noOutline, outRamp })`; `sp.render()` returns the canvas. Read `beetle()` and
  `mushrooms()` in `sprites.js` as worked examples.
- `PxParticles(scene, view, { n, depthTest })`: `emit({ x, y, z, vx, vy, vz, life, size, color: [r,g,b] 0..1, grav,
  drag })`, `burst(x, y, n, base, z)`, `update(dt)`. Colours: use palette colours (`hexToRgb(rampHex('gold', 5))/255`).

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-pixel-3d`. No npm packages to add (three is already there).
2. In `my-game/src/render/renderer.js` add `drawWith: null,` to `api`, and in both `draw()` and `capture()` replace
   `renderer.render(scene, camera)` with `api.drawWith ? api.drawWith(scene, camera) : renderer.render(scene, camera)`.
3. In `my-game/src/game/game.js`:
   ```js
   import { PixelView, pixelMaterial } from '../../vendor/meticulai-pixel-3d/src/index.js';
   // in createGame(ctx):
   const pv = new PixelView({ renderer: ctx.view.renderer, mode: '3d', yaw: Math.PI / 4, pitch: Math.PI / 6, zoom: 4, outline: true });
   ctx.view.drawWith = (scene) => pv.render(scene);
   ```
   Swap every mesh material for `pixelMaterial(...)` (map your materials by what they are: rock -> 'stone',
   wood -> 'trunk', metal -> 'slate', skin -> 'bark' 2-6, ...). Remove `scene.background` and `scene.fog`.
4. In `update(dt)`: `pv.follow(player.position.x, player.position.y, player.position.z); pv.updateCamera(dt);`.
   The game's own perspective camera is no longer used for drawing; mouse picking must use `pv.camera`.
5. The starter's ACES tone mapping and sRGB output don't touch the result (the blit is raw), so you don't need to
   change them. Checked: the screen is still palette-exact. `view.warmUp` compiles for the screen: call
   `pv.warmUp(scene)` too.

## The numbers that matter

- **12 art pixels per world unit** (`ppu`): a 1.75 m person is 21 px tall, a 1 m crate 12 px. Lower = chunkier, fewer
  details; higher = smoother, less pixel-art. The sprites are drawn for 12.
- **Zoom 1-6 whole steps**: never a fractional scale, or pixels become uneven. Rootbound's default was 2 on its own
  canvas; 4-5 shows a small 3D scene well at 1280x720.
- **Pitch 30 deg, yaw 45 deg**: edges along the world axes become clean 2-pixels-across, 1-down lines.
- **Follow rate 8** (about 0.3 s to settle), **shake 3 px** decaying 2 per second.
- **`gain` 1** with the test scene's sun 2.6 + sky 0.9: a sunlit top lands near the light end of the ramp, shadows
  2-3 tones down. Dim scene: raise `gain` or `lift`. Too many surfaces on the top tone: lower it.
- **Outline edge 0.35** world units of depth step. **Dither band 0.16** (the sprite rasteriser's own value).

## What made it good in Rootbound

- The game's first two art directions were thrown out, including a "pixel" chip that just pixelated and posterised the
  3D render. The person making it asked to start the art over with "a high rez pixel look"; after this rebuild they
  said it "looks gorgeous", and it shipped like that. The lesson: a pixelate filter is not pixel art. What sells it is
  an exact limited palette, square pixels at a whole-number zoom, a camera that never lets pixels crawl, and sprites
  shaded the way a pixel artist would (light from the upper left, coloured outlines, no blur).
- The ramps are hue-shifted by hand: shadows lean purple/cool, highlights lean warm/yellow. That is why flat ramp
  shading still looks rich instead of grey.
- Sprites are generated, so the game had 3 beetle kinds x 16 headings x 4 walk frames, crystals that shrink as
  they are mined, mushrooms that grow, and 13 curios, with no art files at all.

## Gotchas

- **Orthographic only** for the snap. A perspective camera can't be pixel-stable (things change size as they move).
- Everything that draws into the art target must output palette colours: `pixelMaterial`, sprites, particles with
  palette colours. A normal `MeshStandardMaterial` will draw, but in off-palette colours.
- `scene.fog` and `scene.background` are not used (the view draws its sky; materials have fog off). For distance, use
  a paler ramp (`hillsFar`, `hillsMid`) on far things, like a pixel artist would.
- Outlines come from depth steps: surfaces seen almost edge-on (a flat floor from a very low camera) get outlined
  everywhere. Keep pitch above ~15 deg, raise `outlineEdge`, or turn `outline` off.
- `PxBillboard`s face the camera and are pre-shaded (light baked into the sprite): they don't get scene shadows.
  Creatures from `beetle()`/`grub()` are drawn from above; they suit top-down games more than this side view.
- Shadow maps work (Lambert), but soft edges become dithered bands. Use `PCFShadowMap`.
- Changing `palette.js` at runtime: call `sprites.clearSpriteCache()` and rebuild the ramp texture (it is cached).

## Restyle it

Edit the ramps in `src/palette.js` (each 2-8 colours dark -> light, hue-shifted). Choose which ramp each material
uses and its `lo`/`hi`. Change `ppu`, zoom, yaw/pitch. Outline colour: `setOutlineColor('#1d1219')` (the softer
outline tone). Sky: `setSky('skyDusk')` or `'skyDawn'`, `'skyNight'`.

## Run the demo alone

`cd blocks/vendor/meticulai-pixel-3d && npm install && npm run dev` (http://127.0.0.1:5405). `npm run build` for
`dist/`; `npm test` runs the tests. Keys: arrows/WASD pan, Q/E turn 45 deg, +/- zoom, O outlines, T dither mode,
Space sparkles. URL: `?zoom=1..6`, `?shot=1` (frozen frame), `?shared=1` (through a starter-style renderer).
