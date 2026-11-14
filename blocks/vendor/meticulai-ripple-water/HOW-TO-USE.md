# Ripple water: how to use it

Water you can touch. A wave simulation runs on the GPU over your pond (a height field on two half-float targets,
a 9-point stencil so rings come out round). Two ways to disturb it: **drops** (a one-off bump: a tap, a pebble, a
leaf, a drip, a splash) and **bodies** (something held in the surface every frame: a fingertip, a cursor, a float, a
fish mouth). A body held still makes a quiet dimple with a meniscus ring; moved, it pushes a bow wave and leaves a
real V-shaped wake that grows with speed, because that is what a moving obstacle in a wave equation does. The
surface refracts what is under it through the ripple slopes (with a hint of dispersion), ripple flanks catch the sky
and the sun as glints, ring crests catch light and troughs hold shadow, and the pond bed is lit by caustics focused by
the live ripples. Splash foam rings and a touch marker are built in.
Renderer: **WebGL2** (ShaderMaterials + MeshStandardMaterial patch). three 0.187. npm deps: `three` only.

## What to copy

- **The block:** `src/ripples.js` (`Ripples`), `src/water-material.js` (`createWaterMaterial`,
  `createWindTexture`), `src/underwater.js` (`UnderPass`, `applyUnderwater`), `src/glsl.js` (noise, caustics,
  `rippleFocus`), `src/pond-shape.js` (`pondShore`), `src/index.js`.
- **Demo only:** `demo/` (a garden pond, stones, five capsule "fish", mouse as a finger).

## API

```js
import { Ripples, createWaterMaterial, UnderPass, applyUnderwater, pondShore } from '../../vendor/meticulai-ripple-water/src/index.js';
const pond = pondShore({ hw: 8.5, hh: 5.2, maxDepth: 1.5 });       // or your own GLSL `float shoreSdf(vec2 xz)`
const ripples = new Ripples({ rect: pond.rect, quality: 'med', shoreGlsl: pond.glsl });
const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),          // at y = water level
  createWaterMaterial(ripples, { shoreGlsl: pond.glsl, time: clockUniform }));
const under = new UnderPass(renderer);                              // the scene without the water, for refraction
water.material.uniforms.uUnder.value = under.texture;
applyUnderwater(bedMaterial, ripples, { waterY: 0, sunDir, time: clockUniform });   // every MeshStandardMaterial under water
// on resize:
water.material.uniforms.uRes.value.copy(under.setSize());
// every frame, in this order:
ripples.step(renderer);
under.render(scene, camera, [water /*, things floating on it */]);
renderer.render(scene, camera);
```

- Disturb it: `ripples.drop(x, z, radius, strength)` (once), `ripples.body(x, z, radius, depth)` (every frame it is
  held), `ripples.stroke(ax, az, bx, bz, speed)` (a moving finger: bodies along its path since the last frame).
- The game's recipes: touch down `drop(x, z, 0.3, -0.07)`; a finger `stroke(...)` (radius 0.16 + 0.008 x speed up to
  0.22, dip 0.05 + 0.012 x speed up to 0.1); splash `drop(x, z, 0.55, 0.14 * power)`; food landing
  `drop(x, z, 0.09, -0.02)`; a floating pellet `body(x, z, 0.075, 0.006)`; a leaf `drop(x, z, 0.22, 0.012)`;
  a drip `drop(x, z, 0.12, 0.02)`; a fish wake `drop(x, z, 0.2, 0.05 * s)`; a frog `drop(x, z, 0.3, 0.05 * p)`.
- `ripples.calm` (0..1): more damping, glassy water. Also set `uniforms.uCalm` on the water.
- Water uniforms: `uSun` (0..1 sun strength), `uMist` (0..1), `uCalm`, `uSunDir`, `uSunCol`, `uAmb`, `uSkyTop`,
  `uSkyLow` (linear colours), `uSplashes[4]` (x, z, age s, power; power 0 = none), `uTips[2]` (x, z, strength,
  kind: 1 touching, 3 hovering).
- Read the height anywhere: `ripples.uniforms` (`uSim`, `uSimTexel`, `uSimRect`) plus `GLSL_SIM` gives you
  `simH(xz)` and `rippleFocus(xz, depth)` in your own shaders (bob floating things, make lily pads ride the rings).
- Quality: `'low'` 256 x 166 cells, `'med'` 384 x 248, `'high'` 576 x 372 at 3 steps (for the game's 19.2 x 12.4 m
  rectangle; other sizes keep the same cell size so waves keep the same speed in metres per second).

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-ripple-water`. No npm deps to add.
2. In `my-game/src/game/world.js`: build the pond (bed mesh with `MeshStandardMaterial` + `applyUnderwater`, the
   water mesh, the `Ripples`). Keep `pond.sdf` / `pond.depthAt` for gameplay (is the cursor over water?).
3. The water needs a pre-pass, so it must draw the frame. In `my-game/src/render/renderer.js` add `drawWith: null`
   to `api`, and in `draw()` and `capture()` replace `renderer.render(scene, camera)` with
   `api.drawWith ? api.drawWith(scene, camera) : renderer.render(scene, camera)`. Then in `createGame`:
   `ctx.view.drawWith = (s, c) => { ripples.step(r); under.render(s, c, [water]); r.render(s, c); };`
   and in a resize listener `water.material.uniforms.uRes.value.copy(under.setSize())`.
4. Touches in `update(dt)`: raycast `ctx.input.mouse` onto the plane y = 0 (`THREE.Raycaster` +
   `ray.intersectPlane`), and while `ctx.input.held('action')` call `ripples.stroke(...)`. Emit
   `events.emit('splash', {...})` for big moments so the recorder sees them.
5. Advance the clock uniform in `update(dt)`. Put `NORMAL_K`-style look numbers and `calm` in `src/tuning.json`.

## The numbers that matter

| Number | Value | What it feels like |
|---|---|---|
| wave speed | ~7.8 m/s at 60 fps | A tap's rings cross a 17 m pond in about 2 s. Slower feels like syrup, faster like jelly. |
| `k` | 1.7 (0.76 on low) | Stable to ~1.8 with this stencil. Keep the cell size and k together (`SIM_QUALITY`). |
| damping | 0.9955 + 0.0025 x (1 - calm), per 2 steps | Light: a slow trail leaves a long wake and a tap's rings reach the far bank. |
| body pull | `mix(h, target, 0.4 * profile)` | How hard a body holds its dimple. Higher makes a stiffer finger and a bigger wake. |
| finger dip | 0.05 + 0.012 x speed (max 0.1) | The wake grows with speed: a still finger is a dimple, a quick stroke a V. |
| `NORMAL_K` | 0.95 | How strongly slopes shade the surface. The game raised it from 0.55 so rings read from a metre away. |
| refraction | 0.011 + 0.013 x depth | Enough to wobble the bed, little enough that fish never turn to glass. |
| reflection | Fresnel x 1.3, at most 0.5 | Mostly see-through from above; the sky shows on ripple flanks. More washes the pond milky. |
| absorption | (0.9, 0.44, 0.62) per metre of path | Reds go first; clear shallows, a dark jade middle that bright fish glow against. |

## What made it good in Koi

After playing the first version with a real webcam the owner said it was "very hazy and almost foggy so it wasn't
clear what I was doing; interactions with water would be elite". The second round rebuilt the water around that
sentence: the finger became a body in the simulation (so a still finger dimples and a moving one leaves a true wake),
and everything else (refraction, glints, bed caustics, the finger's marker) reads the same height field, so the whole
pond answers each touch. The caustics on the bed are focused by the live ripples, so rings of light run across the
pebbles under your wake. A performance round took it from 34 to 56-60 fps at a pixel ratio of 2: the under-water pass
at about CSS resolution, the wind ripples baked into a texture (two taps instead of nine noise calls a pixel). It is
live inside the Show of Hands hall.

## Gotchas

- **Fine dotted ripples near a fast stroke.** The shortest waves the grid can hold travel slower and trail behind a
  quick body; up close (cells bigger than ~3 px) they read as a fine grid. Keep the camera far enough that a cell is a
  pixel or two (the game's view), use `'high'`, or slow the finger.
- The under pass renders the whole scene again (at about CSS resolution). Hide the water and anything floating on it
  (pass them in `hide`); everything else is drawn twice. Put big dry scenery on a layer and skip it if needed.
- The water mesh must be flat at the water level and cover the shore rectangle; it discards outside `shoreSdf`.
- `applyUnderwater` assumes the water is at `waterY` everywhere (one pond). Two ponds at different heights need two
  `Ripples` and two sets of uniforms.
- The water shader samples `uUnder` in screen space; if you render at a different resolution than the canvas (post
  passes), set `uRes` to that target's size.
- Half-float render targets: very old phones may not render to them (`EXT_color_buffer_half_float`).
- Left out from the game: the canopy reflection (a dark mirror of the trees overhead), palm and finger shadows on the
  bed, koi mouths, lily pads, leaves. Add a reflection by mixing a texture lookup along `R` where the shader mixes the sky.

## Restyle it

- Colours: `createWaterMaterial(r, { light: { skyTop, skyLow, sunCol, amb, sunDir } })`; bed colours with
  `applyUnderwater(m, r, { colours: { deep, shallow, absorb } })`. Blue swimming pool: absorb `[0.6, 0.15, 0.05]`,
  shallow `[0.2, 0.45, 0.6]`. Murky swamp: absorb `[1.2, 0.9, 1.4]`, deep `[0.05, 0.06, 0.02]`.
- Bathtub, fountain, puddle: a different `shoreGlsl` (rectangle by default: `RECT_SHORE`) and a smaller `rect`.
- Magic pool: add a glow term where the shader adds crests (`crest`), tinted to taste.
- Cheaper: `quality: 'low'`, `new UnderPass(renderer, { scale: 0.5 })`.

## Run the demo alone

`cd blocks/vendor/meticulai-ripple-water && npm install && npm run dev` (http://127.0.0.1:5483). Hover, hold and
drag, double-click to splash, C for calm. `?view=mid` or `?view=close` move the camera. `npm test` runs the 10 tests.
