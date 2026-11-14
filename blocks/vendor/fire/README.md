---
kind: effect
engine: three
---

# Fire

Real 3D flames for three.js, made entirely in shader math, shaped by what's burning: a candle, a torch, a gas jet, a campfire, a brazier, a fireplace, a bonfire, a burning crate or a line of fire. No image files, and each holds up all the way round and close up.

The flame is a volume you march through, with separate tongues, a dark red edge and licking streaks inside, so a player can walk round it and lean in. In the live demo, pick a fire by its picture and drag Size, Intensity and Wind. Drag looks around, scroll pushes in, and clicking the fire stokes it. Patch made it, and everything you see in the demo is code. Inspired by a post by @majidmanzarpour showing volumetric fire in pure three.js; no code came from it.

## What this owns

- **Renderer:** WebGL2, and it takes yours: `new FireLayer(renderer)`. The shaders are GLSL. On `WebGPURenderer` it died with `Material "ShaderMaterial" is not compatible`, then a `TypeError`.
- **Frame loop:** `layer.update(dt)` and `layer.render(scene, camera)` draw the whole frame in place of `renderer.render`: your scene into `layer.rtScene`, then the fire, bloom and a filmic tone map, to the canvas. Or `layer.drawOver(colorTexture, depthTexture, camera, out)` draws the fire over a target of yours and leaves the rest of the frame to you. Other things go in your own `scene`, as the fires do.
- **three:** `package.json` pins 0.186.1. No other library has to match.
- **Copy:** `src/fire/`.
- **Elsewhere:** It reads your scene's depth, so a transparent object that writes depth cuts the flame in a straight line until it has `depthWrite: false`. `renderer.compileAsync(scene, camera)` with no target set compiled the wrong variant, for a first frame of about 2.7 s. With `renderer.setRenderTarget(layer.rtScene)` around it, 84 ms.

## Put it in a game

Copy `src/fire/` into your project (it needs only `three`, tested with 0.186.1). Use the layer in place of `renderer.render`:

```js
import { FireLayer } from './fire/index.js';

const layer = new FireLayer(renderer); // the fire draws at half resolution unless you say
const camp = layer.add({ type: 'campfire', position: [0, 0, 0] });
const torch = layer.add({ type: 'torch', position: [4, 1.7, -2], shadow: false }); // at the foot of its head
scene.add(camp, torch); // their lights go in your scene

await layer.compileAsync(camera); // before the first frame anyone sees

renderer.setAnimationLoop(() => {
  layer.update(dtInSeconds);
  layer.render(scene, camera); // your scene, then the fire behind and in front of it, bloom and tone map, to the canvas
});
```

Your logs, walls and characters hide the fire where they should, because the layer reads your scene's depth.

**Change a fire at any time:**

```js
camp.intensity = 1.4;           // 0.3 dying to 1.6 roaring: height, colour, sparks and light move together
camp.wind = 0.5;                // 0 straight up to 1 a gale, in gusts
camp.windDirection = Math.PI;   // radians round Y
camp.size = 1.5;                // metres per campfire metre: 1 is about 1.9 m tall. A type sets its own
camp.smoke = 0;                 // 0 off and cheaper, 1 as tuned, 3 thick
camp.embers = 0.5;              // sparks, against what the type starts with
camp.lightStrength = 1;         // or pass lights: false to add() and light it yourself
camp.stoke();                   // throw something on it: a flare and a burst of sparks
camp.position.set(2, 0, 1);     // move it. Leave its rotation and scale alone: use size
layer.remove(camp);             // and free it
```

**If the game has its own passes,** render your scene to a target with a depth texture, then let the layer draw over it, in linear light, and carry on with your own bloom and tone map. `out` must be a different target from the one holding those textures:

```js
renderer.setRenderTarget(sceneTarget);
renderer.render(scene, camera);
layer.drawOver(sceneTarget.texture, sceneTarget.depthTexture, camera, out);
```

**The types.** Each stands in a particular place on its object, in `FIRE_TYPES` in `src/fire/index.js`, so put it there:

| `type` | Size | Stand it at |
|---|---|---|
| `candle` | About 6 cm of flame on a 2 cm candle | The top of the wax, on the wick |
| `torch` | About 60 cm, on a head 5 cm in radius and 21 cm tall | The foot of the head |
| `gas` | About 35 cm, a still blue cone, no smoke or sparks | The nozzle's mouth |
| `campfire` | About 1.9 m | The ground, under the logs |
| `brazier` | About 1 m, out of a mouth 28 cm in radius | 17 cm under the rim |
| `fireplace` | About 80 cm, a row of flames 80 cm wide off three logs | Behind the front log, 10 cm above the hearth. Keep its top under the lintel |
| `bonfire` | About 5 m, inside and out of the top of a stack 1.9 m wide and 1.75 m tall | The ground, in the middle of the stack |
| `crate` | About 1.7 m, inside and out of the top of a box 70 cm wide and 68 cm tall | The ground, in the middle of the box |
| `line` | A front about 5 m long and 1.3 m tall, along its x. `length: 12` sets its length: it's a row of small fires, so the cost grows with it | The ground, at the middle of the line |

**Shape a flame to your own object.** Don't sit a flame on top of something or run it through something. Say what's burning, in metres, and the flame attaches to it. The fire stands at the object's foot, or under the rim of an opening:

```js
// flames climbing the sides of something, then gathering above it
layer.add({ size: 1.2, position: crateFoot, around: { width: 1, depth: 1, height: 1 } });
layer.add({ size: 0.34, position: headFoot, around: { radius: 0.05, height: 0.21 } });

// flames rising out of an opening, the fire standing `below` metres under its rim
layer.add({ size: 0.5, position: barrelRim.sub(new THREE.Vector3(0, 0.14, 0)), outOf: { radius: 0.29, below: 0.14 } });

// logs: up to 6 pieces, from the fire's position. Flames lick off the top and up the sides of each and leave its underside clear
layer.add({
  size: 0.5,
  position: hearth,
  around: { width: 0.8, depth: 0.02, radius: 0.05, height: 0.25, climb: 0.2, flare: 1.7 },
  fuel: [{ from: [-0.6, 0.1, 0.17], to: [0.6, 0.1, 0.17], radius: 0.07 }],
});
```

- `size` sets how tall: the flame reaches about 1.9 m times `size`, times the `look`'s `height` if you set it. **Make it at least twice as tall as the object,** or it can't gather above it and goes flat on top.
- `around` also takes `climb`, from 0 for flames only inside and above it to 1 for licks all over its sides. `flare` is how much the flame widens going up, and `body` how thick it is above the object against the object's width.
- **Keep the flame behind what's in front.** Your scene's depth hides fire behind wood, so stand the flame inside or behind the fuel, and let `fuel` bring licks round to the front. For wood to stay readable, the flame's footprint must be smaller than the stack.
- **A stack or a slatted box** takes `rows: { apart, x, z, out }` in its shape, in metres per `size`: the flame stays strictly inside except for pushing `out` through open rows, every `apart`, starting at height `x` on its x faces and `z` on its z faces. `FIRE_TYPES.bonfire` and `crate` show it, with `shapeOn` and `shapeOut` exported for building one.
- `look` changes the flame itself: `calm` (0 to 1, a still flame), `blue` (1 makes it a still, laminar jet), `blueFoot` (0 to 1, its foot), `heat` (-1 to 1, red to yellow), `height`, `width`, `spread` (how far its tongues stand apart), `soot` (0 to 1, dark smoke), `repeat` (a row of tongues every so far, in metres per `size`) and `lightColor`. For a green magic fire or a still lamp, change a copy of one in `FIRE_TYPES`.
- **Make what's burning look burnt,** as the flame won't: black, with thin glowing cracks. The `headMat`, `hotIron` and `charOf` materials in `src/dressing.js` are ones to copy. A flame rises straight up, so tilt an object only a little, 8° at most for a torch.
- **It can't read your mesh.** The flame's footprint is a rectangle or a circle, plus 6 pieces of fuel. Use several fires for a car or a house.

**To send a ray at it,** `fire.hitBy(raycaster)` says whether the ray crosses its volume. **For a shader of your own,** `src/fire/shader.js` is one plain module: `LOOP` (16 s), `flicker(phase)`, and `fireGLSL` with `marchFire(ro, rd, tMax, phase, flicker, jitter)`, which returns premultiplied colour. It reads four uniforms, `uFireA`, `uFireB`, `uFireBound` and `uFirePx`; `Fire.tick` in `src/fire/index.js` shows what goes in them.

## What it costs

GPU time of the fire pass on one RTX 4090 at 1920 x 1080, in a WebGL2 canvas. Close means the camera at about a third of the opening distance. Times grow with the fire's pixels on screen, so a small fire far away is nearly free, and a fire outside the view costs nothing.

<!-- cost -->
| | Half, opening view | Half, close | Full, opening view | Full, close |
|---|---|---|---|---|
| Candle | 0.07 ms | 0.21 ms | 0.14 ms | 0.56 ms |
| Torch | 0.13 ms | 0.28 ms | 0.29 ms | 0.87 ms |
| Gas jet | 0.04 ms | 0.14 ms | 0.09 ms | 0.28 ms |
| Campfire | 0.18 ms | 0.54 ms | 0.47 ms | 1.71 ms |
| Brazier | 0.15 ms | 0.47 ms | 0.35 ms | 1.55 ms |
| Fireplace | 0.29 ms | 0.81 ms | 0.83 ms | 2.52 ms |
| Bonfire | 0.40 ms | 1.07 ms | 1.04 ms | 3.66 ms |
| Burning crate | 0.46 ms | 1.87 ms | 1.17 ms | 4.47 ms |
| Fire line | 0.32 ms | 1.03 ms | 0.95 ms | 3.13 ms |

Each is the lower of two runs' medians, because other work shared the card and could only add time, so treat them as a guide. The numbers are in `tools/bench-1080p.json`.
<!-- /cost -->

Those are one fast graphics card's numbers. **No slower card was measured.** Scaling by general GPU benchmarks, a mid-range laptop GPU such as an RTX 4050 might take 3 to 4 times as long, and integrated graphics such as Iris Xe about 15 times. Use half resolution in a game, and `layer.resolution = 0.34` on weak machines. The demo starts at half, and draws fewer pixels by itself if it can't hold 30 frames a second.

The shader takes about a second to compile on Windows, longer on a first visit with an empty cache, so call `compileAsync` and draw one frame behind your loading screen. Each fire has two point lights by default, and one casts a cube shadow: for a row of torches pass `lights: false` or `shadow: false` on most of them.

## What it's bad at

- **It's WebGL2 only.** The shaders are GLSL, so it won't run on three's WebGPU renderer without a port.
- **Stylised, not filmed.** It looks painted rather than photographed, and it lacks the hair-thin tendrils of a simulated flame. It doesn't react to objects: a character walking through doesn't part the flames.
- **Perspective cameras only**, because of how it reads depth.
- **Grain up close at half resolution:** a fine speckle shows in the flame near the tips. Full resolution clears most of it, at about three times the cost.
- **Looks depend on the finish.** It's tuned for the layer's filmic tone map and exposure. With `drawOver`, check it under your own grading, because a flame can wash out to yellow or go dull.
- **One lump in a while:** now and then a small red piece breaks off near a tall tongue and fades.
- **All the fires are one flame, reshaped,** not separate simulations, so the big ones move and break up the same way as a campfire.
- **Many big fires add up.** Each one is drawn on its own. Overlapping fires blend correctly, but a screen full of flame at full resolution isn't cheap.

## Controls in the demo

<!-- controls -->
**For people** (the block page shows these):

| id | Control | Type | Range | What it does |
|---|---|---|---|---|
| `type` | Fire | choice | `candle`, `torch`, `gas`, `campfire`, `brazier`, `fireplace`, `bonfire`, `crate`, `line`; default `campfire` | Which fire. Each is shaped by what is burning, from a candle wick to a tall stack of logs. |
| `size` | Size | number | 0.4 to 2×, default 1 | How big the whole fire is, against what this type starts at. |
| `intensity` | Intensity | number | 0.3 to 1.6, default 1 | How hard it burns: low red embers of a flame at one end, a roaring yellow one at the other. Height, colour, sparks and light move together. |
| `wind` | Wind | number | 0 to 1, default 0 | Bends the flames, smoke and sparks over and stirs them harder, in gusts. |

Triggers: `stoke` (Stoke): The fire flares up for a couple of seconds and throws up a burst of sparks. Clicking the fire does the same. `reset` (Reset): Everything back to the start: the campfire, every control at its default, and the view.

**For agents** (steer them over the channel):

| id | Control | Type | Range | What it does |
|---|---|---|---|---|
| `direction` | Wind direction | number | 0 to 360°, default 335 | Where the wind blows to, in degrees round the fire. |
| `smoke` | Smoke | number | 0 to 3, default 1 | How thick the smoke is. 0 turns it off and saves its share of the cost. |
| `embers` | Sparks | number | 0 to 1.6×, default 1 | How many sparks rise from the fire, against what the type starts with. |
| `light` | Light | number | 0 to 2.5×, default 1 | How strongly the fire lights what is around it. |
| `speed` | Speed | number | 0.25 to 2×, default 1 | How fast the flames move. |
| `resolution` | Fire resolution | choice | `half`, `third`, `full`; default `half` | The fire's pixels against the screen's. Half suits a game, third is for weak graphics cards, and full is finest up close at about 3 times the cost. |
| `dressing` | Show the dressing | toggle | default true | The logs, stones, torch and wall. They are not part of the effect. |
| `bloom` | Bloom | number | 0 to 1, default 0.3 | The glow round the hottest parts. |
| `exposure` | Exposure | number | 0.3 to 1.5, default 0.72 | How bright the whole picture is. |
| `turn` | Turn the view | toggle | default false | Slowly turns the view around the fire until turned off. |
<!-- /controls -->

## Files

`src/fire/` is the effect. `src/demo.js` and `src/dressing.js` are the demo, with its logs, stones, wall and night sky: dressing, not part of the effect. `tools/` holds the checks and the scripts that make the pictures. The code is MIT.
