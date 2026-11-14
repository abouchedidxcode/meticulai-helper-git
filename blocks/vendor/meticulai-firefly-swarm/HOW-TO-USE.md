# Firefly swarm: how to use it

Fireflies that wander over a meadow, blink on their own rhythms, drift toward a still open hand, scatter from a
snatch, ride glowing inside a closed fist and drop into a glass jar that fills with light. The glow is drawn in the
point shader (hot core, warm inner glow, wide faint halo), not bloomed, and reaches the grass and ground through 20
fake point lights. A few hundred more fireflies glow in the distance, animated only on the GPU.
Renderer: **WebGL2** (`ShaderMaterial`s). three 0.187. npm deps: `three` only. No art files.

From the game Fireflies (Meticulai), played inside the Show of Hands hall at meticulai.com. There it is played with
a webcam hand; this block takes any "hand" (mouse, touch, bot or a hand tracker) that reports where it is and how
open it is.

## What to copy

- **The system:** `src/` (import from `src/index.js`). `rules.js` and `flies.js` are pure logic (`flies.js` uses
  three's vectors only); `view.js`, `jar.js`, `look.js` draw; `catcher.js` is the catching game; `pointer.js` the
  mouse hand; `space.js` a play volume in front of a camera.
- **Demo only:** `demo/` (sky, ground, grass, the hand ring, the panel).

## API

```js
import { createLook, setDusk, writeLights, Flies, FireflyView, Jar, FireflyCatcher, PointerHand, createCameraSpace,
  jarGlow } from '../../vendor/meticulai-firefly-swarm/src/index.js';

const look = createLook();               // shared uniforms: pass the same object to everything
setDusk(look, 0.8);                      // 0 amber dusk .. 1 deep blue night (palette, sun, haze)
const space = createCameraSpace(camera); // where fireflies may fly: in front of this camera, low, corners kept clear
const flies = new Flies(space, seed);    // the catchable ones
const view = new FireflyView(look);      // scene.add(view.group): free, held and the distant swarm
const jar = new Jar(look);               // scene.add(jar.group); jar.place(worldPoint)
const catcher = new FireflyCatcher({ flies, jar, onEvent: (type, d) => { /* catch, startle, release, drop, jar, slip */ } });
const hand = new PointerHand(canvas);    // mouse/touch: hold = slow close, quick click = snatch
for (let i = 0; i < 9; i++) flies.spawn('common');

// on resize:
const px = renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(camera.fov * Math.PI / 360));
view.setPixelScale(px); jar.setPixelScale(px);

// every frame (dt seconds, t seconds):
look.uTime.value = t;
look.uCamPos.value.copy(camera.position);
space.project(jar.center, catcher.jarScreen);         // where the jar is on screen (release zone)
const openness = hand.update(dt);
const world = space.screenToWorld(hand.x, hand.y, 3.0); // the hand sits 3 m in front of the camera
catcher.populate(dt, dusk);                            // keeps 7..16 commons about (more at night) + rares on schedule
catcher.update(dt, t, hand.seen ? [{ id: 0, screen: { x: hand.x, y: hand.y }, world, openness }] : []);
jar.glow += (jarGlow(catcher.stats.score) - jar.glow) * (1 - Math.exp(-dt * 1.5));
jar.update(dt, camera);
view.update(flies.list);
writeLights(look, { flies: flies.list, camera, jar, fists: catcher.fists() });
```

- A **hand** is `{ id, screen: {x, y} (0..1, y down), world: Vector3, fist?: Vector3, openness: 0..1 }`. A webcam
  tracker that reports openness (1 fingers straight, 0 fist) plugs in the same way: two hands = two ids.
- `catcher.stats`: `score, caught, byKind, catches, startles, slips, releasedFree, bestHeld`.
  `catcher.slipWarning(id)` 0..1 for a flutter before a held firefly slips. `catcher.playing = false` on menus.
  `catcher.reset()` for a new round. `catcher.singleHanded` (default true) lets one pointer catch the pair.
- `flies.spawn('common' | 'blue' | 'gold')`, `flies.spawnPair()`. Rares leave after 32 s (pair 40 s) if not caught.
- Your own shaders can glow with the fireflies: put `GLSL_COMMON` (from `look.js`) at the top of a fragment shader,
  use `look` as its uniforms, and add `albedo * localLight(worldPos, normal, wrap) * 2.0`. `applyHaze(col, worldPos)`
  gives the same depth mist. The demo's ground and grass show it.
- Pure rules for your own game flow: `Grip` (feed openness + ms, get `close` slow/frantic or `open`), `duskAt`
  (the sky over a 180 s session), `raresDue`, `targetCommon`, `addToJar`, `jarGlow`, `verdict`.

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-firefly-swarm`. No npm deps to add (three is already there).
2. In `my-game/src/game/game.js`, in `createGame(ctx)`: build the scene's `camera` (perspective), then everything
   from the API block above; add `view.group` and `jar.group` to `scene`; place the jar with
   `jar.place(space.screenToWorld(0.8, 0.76, 2.55))` (lower right, as in the game). Use
   `new PointerHand(ctx.view.canvas)` for the mouse (the starter's `ctx.input.mouse` has the position but no
   hold timing; PointerHand keeps the game's exact timings).
3. In `update(dt, mode)`: the per-frame lines (use your own running time for `t`). Set `catcher.playing = mode === 'playing'`.
   Count jar points with `onEvent('jar', ...)`; end the run with `ctx.end({ won: true, heading: verdict(stats.score), ... })`
   after `TUNING.sessionS` (180 s) if you want the game's session.
4. Pixel scale: call the resize lines once in `createGame` and again on `window` `resize`.
5. Tuning: add the `TUNING` numbers you want to expose to `my-game/src/tuning.json` and pass them as
   `new FireflyCatcher({ tuning: { franticMs: tune.fireflies.franticMs, ... } })`.
6. Glow: the starter's renderer (ACES, exposure 1.1) is fine; keep bloom off or very low (see below).

## The numbers that matter

| Number | Value | What it feels like |
|---|---|---|
| `franticMs` | 120 | A hand that closes from open to fist faster than this is a snatch. A normal close is 250-500 ms, so only a real grab scares them. Lower it and snatching becomes nearly impossible; raise it to 200+ and careful players fail. |
| `openAbove` / `closedBelow` | 0.6 / 0.4 | Hysteresis: wobbling in between does nothing. |
| `captureRadius` | 0.14 screen heights (x1.3 for the nearest one if none is inside) | Generous on purpose: a catch that "should have worked" works. |
| `startleRadius` | 0.34 | A snatch scares everything near it, not just the target. |
| `holdMs` / `slipWarnMs` | 7000 / 5000 | Hold too long and one slips out; the fist flutters from 5 s. Moves the player on to the jar. |
| `jarRadius` | 0.2 | How close to the jar (screen heights) an open hand drops them in. |
| curiosity | 0.34, hand speed < 0.45 screen heights / s | Keep the hand still and open and they come. The calm rewards patience. |
| speeds | common 0.32, blue 0.62, gold 0.2, pair 0.26 | Blue is quick and shy; gold is slow, big (1.75x) and worth 5. |
| blink | glow 0.32 + flash 0.9 over 22% of a 2.4-5 s period | The J-shaped flash on each firefly's own rhythm is what reads as "firefly". |
| pointer | hold 0.55 s to close, tap < 0.15 s snaps in 50 ms | Hold always counts as gentle; a click is always a snatch. |
| halo | core 5, halo 0.11, size 0.52 | At full night the halos sit at the limit of what the game's owner accepted as bloom. |

## What made it good in Fireflies

- The owner loved the game's calm mood enough to commission seven more calm hands games modelled on it, and called
  it "perfect" after playing. The one rule (close slowly, or they scatter) is the whole game: it needs no UI to
  explain, and it rewards patience instead of speed.
- The glow is drawn, not bloomed: the owner wanted warm, restrained light, so the post bloom stayed almost off and
  each firefly paints its own core, glow and halo, while 20 fake lights warm the grass and the jar's stump.
- Critique rounds moved the fireflies lower over the grass and made the halos smaller (they read as too big and too
  high at night); depth testing lets them dip behind blades, which sells the meadow.
- Held fireflies are drawn dimmer and grow with the square root of the count, so a full fist glows from within
  instead of turning into a white blob. The jar fills with light as it fills up: every catch has a visible payoff.
- The dusk was sped up on the owner's request (a quarter of the way at 15 s, half at 30 s, night at 90 s) so the
  change shows in a short clip.

## Gotchas

- Point sizes are in world units scaled by `setPixelScale`: forget the resize call and they are tiny or huge.
- The glow adds light with alpha 0 (custom blending). Over a bright sky they wash out: they need a dusk or night scene.
- `Flies.update` loops every pair for separation: fine for the 7-50 catchable ones; use the GPU swarm for crowds.
- The distant swarm is laid out for a camera near the origin looking down -z (z -4..-56). Move or rotate
  `view.swarm` for another layout, or pass `swarmCount: 0`.
- `createCameraSpace` reads the camera's matrices: call `camera.updateMatrixWorld()` after moving it, before
  `catcher.update`.
- Held fireflies have no depth test (they show through your hand mesh). If your hand is opaque, draw the held set
  after it, as here.
- The glass jar is faked (no transmission). It looks right against a dark sky and grass; on a white background it
  will look thin.
- Openness from a webcam is noisy: smooth it a little, but not so much that a snatch takes longer than 120 ms.

## Restyle it

- Colours: `COLORS` in `flies.js` (per kind; values above 1 are fine, they are multiplied by 2.2 in the shader).
- Glow shape: `core`, `halo` options of `FireflyView`; the shader's `exp(-r2 * 220)` / `34` / `6.5` falloffs.
- Wisps, spirits, plankton, sparks: change `COLORS`, `SPEED`, `SIZE` (Flies options `speed`, `size`) and the blink
  in `Flies.update`; set `floorY` for underwater or sky scenes; widen `createCameraSpace` ranges.
- Evening palette: `PALETTE` in `look.js` (three keys per colour at dusk 0, 0.5, 1).

## Run the demo alone

`cd blocks/vendor/meticulai-firefly-swarm && npm install && npm run dev` (http://127.0.0.1:5426). URL switches:
`?dusk=0.85` (0..1), `?jar=12` (start with fireflies in the jar), `?seed=3`. `npm test` runs the 25 tests.
