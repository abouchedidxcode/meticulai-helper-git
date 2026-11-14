# Rope and cloth chains: how to use it

Secondary motion for free: short verlet chains pinned at one end to a moving point and simulated in **world
space**, so scarves, ribbons, hair, sashes, tails, antennae, banners and short ropes trail every move the body makes,
swing past when it stops, flutter in wind and drag on the floor. No hand animation. From Inkbound (a 2D ink-brush
fighting game by Meticulai), where every fighter's sash, ponytail, headband ribbons, scarf, sleeve corners and
hems are these chains. This block adds a 3D version for three.js games.

Renderer: **none** for the chains (`chain.js`, `chain3.js`, `presets.js` have no imports). `ribbon-mesh.js` draws a
3D chain as a tapered three.js ribbon; `chainPath` draws a 2D chain on a Canvas 2D context.

## API

```js
import { Chain3, PRESETS, scaled, gameWind } from '../../vendor/meticulai-rope-cloth-chains/src/index.js';
import { RibbonMesh } from '../../vendor/meticulai-rope-cloth-chains/src/ribbon-mesh.js';

const p = scaled(PRESETS.scarf, 0.007);                 // game pixels -> metres (a 1.75 m character)
const scarf = new Chain3(p.n, p.seg, p.grav, p.drag, p.stiff);
const mesh = new RibbonMesh(scarf, { w0: p.w0, w1: p.w1, tip: p.tip, material: redCloth });
scene.add(mesh);

// every frame (any dt; it caps at 1/24 s and splits big frames in two):
neckPoint.set(0.05, 1.42, -0.12).applyMatrix4(hero.matrixWorld);  // where it is tied, in world space
rest.copy(heroForward).multiplyScalar(p.rest[0]).addScaledVector(UP, p.rest[1]).normalize(); // back and down
scarf.step(neckPoint, rest, dt, wind /* Vector3, units/s^2 */, groundY);
mesh.update(camera);                                     // faces the camera; or mesh.update(null, sideVector)
```

- `new Chain3(n, seg, grav, drag, stiff = 0)`: `n` nodes including the pin, `seg` link length, `grav` downward
  acceleration, `drag` = share of velocity kept per 1/60 s (0.84 floats, 0.9 swings), `stiff` = pull toward the rest
  direction (0 for ribbons; 40-260 for scarves and hair that keep a shape). Properties: `snap` (a pin jump bigger than
  this resets the chain instead of whipping it across the map; 3 units), `floorGap` (0.01), `x/y/z` Float32Arrays.
- `step(pin, restDir, dt, wind?, floorY?)`: vectors may be three.js `Vector3`s or `[x, y, z]` arrays.
- `kill()`: re-hang on the next step (after a teleport or a respawn). `length()`: current length.
- `Chain` is the original 2D version (y up): `step(ax, ay, rx, ry, dt, wx, wy, floor)` and
  `chainPath(ctx, chain, ax, ay, w0, w1, tipLen)` to outline it as a tapered brush stroke, then `ctx.fill()`.
- `PRESETS`: the game's chains (`sash`, `sashShort`, `ponytail`, `headbandRibbon`, `headbandRibbon2`, `spearRibbon`,
  `scarf`, `scarf2`, `sleeve`, `hem`), in game pixels with y up, each with its rest direction, widths and wind share.
  `scaled(preset, unitsPerPx)` converts lengths, widths and gravity (drag and stiffness need no change).
- `gameWind(t, facing)`: the game's wind: two slow gusts sideways plus a gentle lift, pushing against the facing.

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-rope-cloth-chains` (no npm packages; three is already in the starter).
2. In `my-game/src/game/player.js` (or wherever the hero is built): make the chains and `RibbonMesh`es once, add the
   meshes to the scene (not to the hero: they live in world space).
3. In the game's `render(alpha)` (it runs once per drawn frame) step each chain with the frame time, using the
   hero's **interpolated** pose, then `mesh.update(camera)`. Stepping in `update(dt)` (fixed 60 Hz) also works, but
   then draw with the latest state.
4. Call `chain.kill()` in `start()` and after any teleport.
5. Put the feel numbers (`drag`, `stiff`, `grav`, wind strength) into `src/tuning.json` so the settings panel can
   tune them live.

## The numbers that matter (Inkbound's, unchanged)

| Preset | n x seg (px) | grav (px/s^2) | drag | stiff | Feels like |
|---|---|---|---|---|---|
| sash | 5 x 13 | 1500 | 0.9 | 0 | heavy cloth end that swings |
| ponytail | 7 x 13 | 1300 | 0.9 | 260 | thick hair that keeps its sweep back, ends flick |
| headbandRibbon | 7 x 13 | 520 | 0.84 | 0 | light silk that floats and lags far behind |
| scarf | 9 x 15 | 560 | 0.87 | 46 | a long scarf: floats, but holds a line down the back |
| sleeve / hem | 2 links | 2000-2200 | 0.84-0.86 | 0 | one heavy link: how far a sleeve or hem hangs behind |

- 1 game pixel = 0.007 m on a 1.75 m character, so the sash's 1500 px/s^2 is 10.5 m/s^2: real gravity. Light
  ribbons use about a third of it: that is what makes them float.
- `drag` is the main dial: 0.84 = floaty, long trails; 0.9 = heavy swing. It is per 1/60 s and frame-rate independent.
- `stiff` fades from full at the pin to nothing at the tip, so shaped hair still flicks at the end.
- Substeps: two above 1/80 s, one below; two constraint passes per substep. Cheap: hundreds of chains per frame.
- Wind multipliers per chain (game values): sash 0.5, ponytail 0.6, headband ribbons 1.3, scarf 1.5, sleeves 0.3.

## What made it good in Inkbound

- Its biggest decision was to draw fighters as skeletons every frame instead of swapping painted pictures. The first
  version's painted frames "held pictures, slid and swapped" according to its critics. A skeleton with good key poses,
  IK and these chains gave fluid 60 fps motion for three characters with no paid art.
- One of its three design pillars is "moving is a pleasure ... every motion is animated at 60 fps with anticipation
  and follow-through; ribbons and sleeves trail". The chains are the follow-through: they cost nothing to animate and
  answer every dash, jump and turn.
- Each character is told apart partly by what trails: a heavy sash, a ponytail plus two floating ribbons, a long
  scarf. Different `drag` and `stiff` values give each one its own silhouette in motion.
- Sleeve and hem chains are only one link long. The game reads node 1's offset to bend the drawn cloth shape: it is
  a cheap way to get cloth lag on a shape that is not a strip.
- Note: Inkbound is not released yet and the owner had not played this version when it was extracted. The chain
  numbers come from the developers' tuning and recorded play-throughs, not from a player's verdict.

## Gotchas

- Chains live in world space. Never parent the ribbon mesh to the character, and never step a chain in the
  character's local space: then nothing trails.
- Pin the chain where it is tied and give a sensible rest direction (back and down): it is used when the chain is
  (re)hung and by `stiff`.
- No collision with the body: a chain can pass through the character when it turns sharply. Pin points just behind
  the body (as the presets do) hide it; for capes that must stay outside, push nodes out of a sphere or capsule after
  `step` (a few lines).
- Floor only, at one height (`floorY`). For uneven ground, pass the ground height under the pin.
- A big jump of the pin (more than `snap`) re-hangs the chain. After a teleport call `kill()` anyway.
- Not a full cloth sheet: each chain is one line. For a cape, run 3-5 chains side by side and draw a strip between
  them, or fake width with `RibbonMesh`.
- `RibbonMesh` faces the camera (it reads like a brush stroke from any angle). For a banner that must stay flat in
  one plane, pass a fixed side vector: `mesh.update(null, sideVector)`.

## Restyle it

Change `drag` (float vs swing), `grav` (silk vs leather), `stiff` (limp vs shaped), `n` and `seg` (length), the widths
and `tip`, and the material. A tail: `stiff` 80-150, `drag` 0.9. A rope with a weight: more nodes, `drag` 0.95,
high `grav`; to hang a lantern on it, place the lantern at the last node. Antennae: 3 nodes, `stiff` 400, pointing up.

## Run the demo alone

`cd vendor/meticulai-rope-cloth-chains && npm install && npm run dev` (http://127.0.0.1:5404). Move the mouse over
the ground to lead the runner; leave it still and it runs laps. `npm test` runs 11 tests.
