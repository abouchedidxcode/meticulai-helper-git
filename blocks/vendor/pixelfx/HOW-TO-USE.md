# pixelfx: how to use it

244 pixel-art effects (fire, explosions, magic, weather, UI pops, pickups, transitions, critters), each one small JS
file that draws itself in code: no images. Effects with a character come "acted out" (wind-up, hit-stop, recovery).

- Renderer: none of its own. Effects write into two typed-array buffers (`color`, `light`); `composite()` turns them into RGBA bytes you put on a **canvas 2D** context or upload to a WebGL/three.js texture.
- No three.js, no runtime dependencies (devDependency `esbuild` only for building the gallery). Plain JavaScript, Node 18+ for the tools.

## Reusable system vs extras

- System: `src/core/` (entry `src/core/index.js`: frames, painter, particles, acting) and `src/fx/<category>/<name>.js` (one file per effect; `_lib.js` files are shared helpers). `src/fx/index.js` imports all 244, so import single effect files instead.
- Extras: `gallery/` (browse and tweak every effect), `tools/` (`render.mjs` contact sheets / GIF / sprite sheets, `list.mjs` search, `new.mjs` scaffold, `check.mjs` lint, `act.mjs`, `sheets.mjs`), `skills/pixelfx/SKILL.md` (a Claude Code skill for finding, exporting and making effects), `docs/CATALOG.md` (every effect), `docs/AUTHORING.md` (how to write one).

## API

```js
import { createFrame, clearFrame, createFx, createAct, composite, PAL } from '../../vendor/pixelfx/src/core/index.js';
import * as frostNova from '../../vendor/pixelfx/src/fx/ice/frost-nova.js';

const frame = createFrame(320, 180);                  // pixels; optional ox, oy = world offset of the top-left
const fx = createFx(frostNova, { x: 160, y: 140, flip: false, angle: 0, seed: 4, palette: PAL.fire, light: 1 });
fx.update(dt);                                       // seconds; simulations sub-step at 120 Hz themselves
clearFrame(frame);
fx.draw(frame, 'back');  /* your sprites */  fx.draw(frame, 'front');   // or fx.draw(frame) for both
composite(frame, imageData.data, bg);                // bg: null = transparent, a colour number, or a Uint32Array
if (fx.done()) { /* drop it */ }   fx.stop();        // stop() fades a loop out
```

- Each module has `meta`: `name`, `size` [w, h] it was designed in, `origin` [x, y] (the pivot), `duration`, `loop`, `fps`, `options` (its own knobs: `palette`, `reach`, `count`, `text`...). Move a live effect by changing `fx.options.x` / `.y`.
- `createAct(mod, { x, y, flip })` plays the effect with the stock character and target: `act.update(dt)`, `act.draw(frame, { body, target })`, `act.shake` ([dx, dy] px to offset the picture), `act.done()`. Timing data: `mod.act` (`poses`, `hits` with `t` and freeze `stop`).
- Palettes: any dark-to-bright array of hex strings, or a ramp from `PAL` (fire, ice, poison, holy, arcane, shadow, gold...).

## Plain canvas 2D game

```js
const W = 320, H = 180, frame = createFrame(W, H), img = new ImageData(W, H);
const fxCanvas = Object.assign(document.createElement('canvas'), { width: W, height: H }), fctx = fxCanvas.getContext('2d');
// per frame, after drawing your scene at W x H:
clearFrame(frame); for (const f of live) { f.update(dt); f.draw(frame); }
composite(frame, img.data, null); fctx.putImageData(img, 0, 0);
ctx.drawImage(fxCanvas, 0, 0);       // drawImage blends; putImageData straight onto ctx would wipe your scene
```

Scale the main canvas up with CSS `image-rendering: pixelated`.

## Drop it into the starter (`my-game/`, three.js)

`node tools/blocks/add.mjs pixelfx`, then import from `src/game/...` as `../../vendor/pixelfx/src/core/index.js` and
`../../vendor/pixelfx/src/fx/<category>/<name>.js`. No renderer change, no npm install, no dedupe needed. Two ways:

**A. In the world (a sprite that faces the camera):**

```js
function pixelSprite(mod, opts = {}, pxPerMetre = 32) {
  const [w, h] = mod.meta.size, [ox, oy] = mod.meta.origin;
  const frame = createFrame(w, h), canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const c2d = canvas.getContext('2d'), img = c2d.createImageData(w, h), fx = createFx(mod, { x: ox, y: oy, ...opts });
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  sprite.scale.set(w / pxPerMetre, h / pxPerMetre, 1);
  sprite.center.set(ox / w, 1 - oy / h);              // pivot at the effect's origin
  return { sprite, fx, update(dt) { fx.update(dt); clearFrame(frame); fx.draw(frame); composite(frame, img.data, null);
    c2d.putImageData(img, 0, 0); tex.needsUpdate = true; }, dispose() { tex.dispose(); sprite.material.dispose(); } };
}
```

Add `sprite` to `game.scene` at the hit point, call `update(dt)` from the game's `update`, remove and `dispose()` when
`fx.done()`. `toneMapped: false` keeps the starter's ACES tone mapping from dulling the colours. For pure glows,
`blending: THREE.AdditiveBlending` looks hotter.

**B. On screen (an overlay canvas over the 3D view):** a `<canvas>` with `position: fixed; inset: 0; width: 100%;
height: 100%; pointer-events: none; image-rendering: pixelated`, sized `H = 180`, `W = Math.round(180 * innerWidth / innerHeight)`
so pixels stay square; put it after the game canvas and below the UI. Each `render(alpha)`: project the world point
(`v.copy(p).project(camera)`, `x = (v.x + 1) / 2 * W`, `y = (1 - v.y) / 2 * H`), set `fx.options.x/y`, then draw and
composite with `bg = null` and `putImageData`. Best for UI effects (coin collect, combo counter) and screen transitions.

## Gotchas

- Effects are drawn on the CPU; a full-screen frame at 320x180 is cheap, but dozens of large effects every frame add up. Keep frames low-res and share one frame between effects.
- Each effect is designed at its `meta.size`; drawing it into a smaller frame clips it.
- `putImageData` ignores transforms and alpha blending: composite into an offscreen canvas and `drawImage` it.
- Effects that use the stock character (`meta.actor`) paint the grey dummy unless you pass your own `actor`; `createFx` draws only the effect, `createAct` adds body and target.
- Seeded: the same seed gives the same frames, so tests and recordings repeat.
- Sprite sheets for other engines: `node tools/render.mjs ice/frost-nova --sheet` (PNG + Aseprite-style JSON in `records/`). `--gif` / `--mp4` need ffmpeg.

## Run the gallery alone

```sh
cd vendor/pixelfx
node tools/serve.mjs          # http://localhost:8080/gallery/  (no npm install needed; optional port argument)
```

Gallery: category list, search box and palette picker; click an effect (or Enter / Space on it) to open it with its
options, a sprite sheet and the code to use it. There is no `npm run build`; `npm install` then `node tools/index.mjs &&
node tools/build-gallery.mjs` bundles a static gallery into `dist/`. Find effects with `node tools/list.mjs frost`.
To use the skill in Claude Code, copy `skills/pixelfx` into `~/.claude/skills/`.

## Credit

pixelfx by Patch (patch.gg, github.com/patch-gg/pixelfx), MIT; parts adapted from Hugo Duprez's Sprite Fusion VFX and Hollow Crown (both MIT). Keep `LICENSE` and `NOTICE.md`. The Patch Pixel font in `gallery/fonts` is not MIT: don't ship it in your game.
