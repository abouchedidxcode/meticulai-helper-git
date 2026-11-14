# Touch grass: how to use it

A meadow to the horizon, drawn blade by blade near the camera, that bends under feet and rolling things, can be mown
(cut stems laid in a row) and burnt (fire spreads with the wind), and remembers it all in a map your game can read.

- Renderer: **WebGL2**, and it uses yours: `createFrame(renderer, field)` takes a `THREE.WebGLRenderer`. All shaders are GLSL `ShaderMaterial`s, so it does not draw on `WebGPURenderer` and can't share a page with the WebGPU blocks (slice-anything, impossible-spaces).
- three 0.186.1 (pinned). No other runtime dependency. Plain JavaScript.

## Reusable system vs demo

- System: `src/lib/` (`index.js` entry: `createField`, `bakeGround`, `createFrame`, `loadGroundTextures`; `blades.js`, `state.js` (bend/cut/fire memory), `frame.js` (the frame passes: HDR scene, flames, smoke, bloom, tone map), `clippings.js`, `flowers.js`, `ground.js`, `glsl.js`, `noise.js`) plus `public/textures/` (ambientCG ground maps).
- Demo only: `src/demo/` (`main.js` player, tools and loop; `scythe.js`, `sky.js`, `horizon.js`, `world.js`, `sounds.js`), `public/assets/` (wood texture, footstep sounds), `fonts/`, `index.html`, `recipe.json`, `lib/patch-block.js` (talks to Patch's page only inside an iframe; harmless standalone).

## API

```js
import { createField, createFrame, bakeGround, loadGroundTextures } from '../../vendor/touch-grass/src/lib/index.js';

const heightAt = (x, z) => 0;                                          // your ground, metres
const paint = (x, z) => ({ dry: 0.3, growth: 1, wet: 0, flowers: 0.3 });  // 0..1 each; growth 0 = bare, wet > 0.5 won't burn
const baked = await bakeGround({ heightAt, paint }, (done) => {});      // a million samples, in slices (optional)
const field = createField({ heightAt, paint, baked, textures: await loadGroundTextures(renderer, './textures/'),
  size: 256, density: 1, seed: 1, recover: 70, regrow: 0, flowers: true });
scene.add(field.group);
const frame = createFrame(renderer, field, { samples: 4, bloom: 0.22, exposure: 1 });   // must exist before field.update
await frame.compile(scene, camera);                                    // shaders + textures, behind a loading screen

// each frame
field.update(dt, camera); frame.update(dt, camera);
frame.render(scene, camera);                                           // INSTEAD of renderer.render(scene, camera)
```

- Touch: `field.bend(x, z, radius, dx, dz, amount)`, `field.cutLine(ax, az, bx, bz, width, h0, h1, vx, vz, lay?)`, `field.cut(x, z, radius, height)`, `field.ignite(x, z, radius)`, `field.reset()`.
- Read: `field.stateAt(x, z)` gives `{ inside, burning, heat, burnt, cut, flat, fuel, dry, wet, growth }`; `field.heightAt(x, z)` is the exact ground height (stand things on it with this).
- Look: `field.setWind(angle, mps)`, `field.setPusher(slot 0..5, x, y, z, radius)` (bodies the blades part round), `field.setLamp(x, y, z, 1)`, `field.setLight({ sunDir, sunColor, skyColor, bounceColor, fogColor, fogSunColor, fogDensity, cloudShade })`, `field.setDensity(0.45)` for slow GPUs, `frame.torch.position` / `.size` for a carried flame, `frame.exposure`, `frame.bloom`.
- No `dispose()`: it's built to live for the whole page.

## Drop it into the starter (`my-game/`)

The starter already uses `WebGLRenderer`, so no renderer swap. What changes:

1. `node tools/blocks/add.mjs touch-grass`; in `vite.config.js` add `resolve: { dedupe: ['three'] }`.
2. Copy `vendor/touch-grass/public/textures/` to `my-game/public/textures/` (Vite serves `public/` at the root; `loadGroundTextures(renderer, './textures/')` loads from there).
3. Let the game take over drawing. In `src/render/renderer.js` add `let drawFn = (s, c) => renderer.render(s, c);`, an api method `setDraw(fn) { drawFn = fn; }`, and call `drawFn(scene, camera)` in both `draw` and `capture`. In `createGame`: `ctx.view.setDraw((s, c) => frame.render(s, c))`, with `createFrame(ctx.view.renderer, field)`.
4. The frame does its own ACES tone map and sRGB in its last pass; set exposure with `frame.exposure`, not `renderer.toneMappingExposure`. The starter's own meshes still use three's lights; the grass only uses `field.setLight`: give it the same sun direction and colour.
5. Remove the starter demo's ground (`src/game/world.js`): the field draws its own ground from `heightAt`. Drive `field.update` / `frame.update` from `update(dt)` or `render`, and call `field.bend` / `field.setPusher` for the player and anything that rolls.
6. Creating the field and `bakeGround` take a moment: do it before `ui.showTitle`, then `await frame.compile(...)`. `createGame` is synchronous in the starter, so either await in `main.js` before calling it or build the field async and skip drawing until it's ready.

## Gotchas

- Heavy: about 230,000 blades near the camera, about 56 MB CPU + 30 MB GPU for the memory map. Measured only on an RTX 4090; use `setDensity` and `createFrame(..., { samples: 0 })` on weaker machines.
- The square that remembers is fixed (256 m around `centre`), not scrolling; outside it the grass grows and blows but takes no marks.
- No shadows on or from the grass. Built to be seen from standing height; from high up the middle distance looks thin.
- Anything else that renders per frame must go through `frame.render`, or it skips the bloom and tone map.
- Demo uses pointer lock; headless tests need it faked.

## Run the demo alone

```sh
cd vendor/touch-grass && npm install
npm run dev        # http://127.0.0.1:5376/
npm run build && npm run serve    # dist/ with licences, served at http://localhost:5375/
```

URL options: `?hour=21`, `?wind=8`, `?quality=low`, `?clean`. Controls: click to play, WASD move, Shift run, Space
jump, click / hold to use the tool, 1 2 3 scythe / torch / ball, R reset, `[` `]` wind, `,` `.` time of day. Footsteps
only; scythe, fire and wind are silent. (The author's test and recording scripts, `tools/run.mjs` etc., were left out
of this copy; `tools/fire-speed.mjs` and `tools/fire-gap.mjs` remain.)

## Credit

Touch grass by blendi (Patch, patch.gg), code MIT (blade model after Soil Studio by mohamedachrefelouafi, MIT), art CC0 (ambientCG, Poly Haven, Kenney). Keep `LICENSE`, `LICENCE-NOTES.md`, `public/CREDITS.md`, `public/LICENSES/`, and `fonts/OFL-red-hat-mono.txt` if you keep the font.
