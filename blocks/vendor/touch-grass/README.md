---
kind: system
engine: three.js
---

# Grass you can touch

A meadow for three.js that reacts and remembers: grass bends under feet and anything that rolls or lands on it, a scythe mows it and lays the cut stems in a row, and fire runs through it with the wind and leaves black ground behind.

![A scythe held over a meadow at golden hour, a mown lane and a row of cut grass beside it](shots/readme.jpg)

It is a field to the horizon, drawn blade by blade near you, with a map under it that every touch writes to and your game can read back. In the live demo you walk it in first person: click to play, WASD to move, 1 2 3 for the scythe, the torch and the ball, hold the button to mow or to lower the torch into the grass. It is a place to start from: take the field and its map, and change how it looks, what marks it and what your game does with what it remembers.

Patch made it, starting from two of its own blocks: soil and grass (Soil Studio by mohamedachrefelouafi, MIT) and fire. Code MIT, art CC0.

## What this owns

- **Renderer:** WebGL2, and it takes yours: `createFrame(renderer, field)`. Every shader is GLSL in a `ShaderMaterial`, so on `WebGPURenderer` none of it draws, and it can't share a scene with the WebGPU blocks (destruction, forests, clouds) as it stands.
- **Frame loop:** `frame.render(scene, camera)` draws the whole frame in place of `renderer.render`: your scene into an HDR target with a depth texture, the flames marched at half resolution against that depth, smoke and sparks, bloom, a filmic tone map. You call `field.update(dt, camera)` and `frame.update(dt, camera)` from your own loop.
- **Light:** the grass is lit by `field.setLight({...})`, not by three's lights. Your own meshes are lit by your lights as usual.
- **The ground:** `heightAt(x, z)` and `paint(x, z)` are read once, into maps 1,024 m across at 1 m a texel. The field draws its own ground mesh over that square, and `field.heightAt` is the same height on the CPU. That is a million calls of each: `await bakeGround({ heightAt, paint }, onProgress)` does them in slices so the page keeps answering, and `createField({ ..., baked })` takes the result.
- **Memory of what happened:** inside that, one fixed square 256 m across reacts and remembers, at 12.5 cm a texel for flattening and cutting and 25 cm for fire. Past it the grass grows and blows but nothing marks it. About 56 MB on the CPU and 30 MB on the GPU at those sizes.
- **three:** `package.json` pins 0.186.1. No other library has to match.
- **Copy:** `src/lib/` and `public/textures/`. The demo's player, scythe, torch, ball, sky and hills are in `src/demo/` and are only the demo's.

## Use it in a game

```js
import { createField, createFrame, loadGroundTextures } from './lib/index.js';

const field = createField({
  heightAt: (x, z) => 0,                                              // your ground, metres
  paint: (x, z) => ({ dry: 0.3, growth: 1, wet: 0, flowers: 0.3 }),   // what grows where, each 0 to 1
  textures: await loadGroundTextures(renderer, './textures/'),
});
scene.add(field.group);
const frame = createFrame(renderer, field);
await frame.compile(scene, camera);           // behind your loading screen

function tick(dt) {
  field.bend(x, z, 0.3, vx, vz);              // something trod here, going that way
  field.update(dt, camera);
  frame.update(dt, camera);
  frame.render(scene, camera);
}
```

**Bend, cut, burn, read:**

```js
field.bend(x, z, radius, dx, dz, amount);     // flattened the way (dx, dz) points; no direction: outwards, as under a landing
field.cutLine(ax, az, bx, bz, width, h0, h1, vx, vz);   // an edge passed from a to b, cutting to h0..h1 metres; tops fly along (vx, vz)
field.cutLine(ax, az, bx, bz, 0.15, 0.06, 0.06, 0, 0, { x, z, dx, dz, along: 0.85, width: 0.17 });   // or laid in a row, as a scythe leaves it
field.cut(x, z, radius, height);              // a disc
field.ignite(x, z, radius);                   // returns how many cells caught
field.stateAt(x, z);                          // { inside, burning, heat, burnt, cut (metres), flat, fuel, dry, wet, growth }
field.heightAt(x, z);                         // the ground, exactly where the grass stands on it
field.reset();
```

**The rest:**

```js
field.setWind(angle, metresPerSecond);        // the grass leans and gusts with it, and fire runs before it
field.setPusher(slot, x, y, z, radius);       // a body the blades part round: six of them, radius 0 clears one
field.setLamp(x, y, z, 1);                    // a flame carried through it lights the grass round it
field.setLight({ sunDir, sunColor, skyColor, bounceColor, fogColor, fogSunColor, fogDensity, cloudShade });
field.setDensity(0.45);                       // fewer blades, evenly, for a slower GPU
field.state.regrow = 60;                      // cut grass grows back in a minute (0: never, the default)
field.state.recover = 70;                     // seconds for flattened grass to stand halfway back up
```

`paint` decides what the fire does as much as how the field looks: `growth` 0 is bare ground with nothing to burn, `wet` above about a half won't catch, and `dry` grass catches sooner. A track of bare earth or a strip you mowed is a firebreak.

## How it works

- **Blades** (`blades.js`): four rings of instanced blades follow the camera, about 230,000 single blades of eight rows of vertices out to 6 m, then fewer and wider ones, then tufts to 120 m; past that the ground takes the colour of the grass. Nothing about a blade is stored. Its place, height, lean, colour and kind (leaf, or stalk with a seed head) come from the number of its world cell, so it is the same blade when you come back. A blade fades between rings on its own random distance.
- **State** (`state.js`): one texture holds which way the grass is flattened and how far, and how short it is cut; another holds heat, char and embers. Both live on the CPU, so `stateAt` answers at once, and only the rectangles that changed go to the GPU.
- **Fire** (`state.js`): a cell catches when the heat it has taken from burning neighbours passes a threshold that is lower for dry grass and different for every cell, and the wind weights which neighbours get the heat. Measured on even grass (`tools/fire-speed.mjs`): 0.3 m/s in still air; in a 3.5 m/s wind 0.9 m/s before it and 0.1 into it; 1.8 m/s in a 12 m/s wind. A bare strip 0.5 m wide stopped it at every wind tried, and 0.25 m did not once there was wind (`tools/fire-gap.mjs`).
- **Flames** (`frame.js`): one pass marches each pixel's ray through the air above the fire map, stepping over 2 m cells that hold no fire. Smoke and sparks are a few hundred CPU particles born at burning cells.
- **Cut grass** (`clippings.js`): up to 49,152 pieces. Thrown, tops tumble and lie for half a minute. Laid, nearly whole stems are carried to a row and come to rest on the ground and on each other at every angle; they stay five minutes and pale to hay.
- **Flowers** (`flowers.js`): ox-eye daisies, buttercups, knapweed and poppies in drifts, bending, cut and burnt from the same maps.

## Limits

- The square that remembers is fixed, not scrolling. A bigger one costs memory by its area.
- No shadows are cast on or by the grass: blades are shaded by height, by clump and by drifting cloud shadow.
- Measured on one PC (RTX 4090). `setDensity` thins the blades; nothing else adapts to a slower GPU yet.
- The smoke is soft dark puffs and is the weakest part. From high above, the mid-distance grass is thin: it is built to be seen from standing height.
- Sound: the demo has footsteps only. The scythe, the fire and the wind are silent.

## Build and check

```sh
npm install
npm run build
```

`npm run build` writes the demo to `dist/` with its licences. `npm test` drives it the way Patch's block page does (it needs Patch's lab harness on this PC). `node tools/serve.mjs dist 5377` serves it; `?hour=21`, `?wind=8`, `?quality=low` and `?clean` change how it opens.

- `tools/run.mjs <scenario>`: the built demo headless and muted, the clock stepped by hand, saving stills (`media`, `film`, `scythe3`, ...).
- `tools/fps.mjs`: real-time frame rate at 1080p.
- `tools/cold.mjs`, `tools/page-visit.mjs`: a slowed first visit, and the demo inside a page with a heartbeat, for stalls.

## Credits and licences

- Code: Patch, MIT (`LICENSE`). The blade's arc model follows Soil Studio's grass by mohamedachrefelouafi (MIT, © 2026 mohamedachrefelouafi), by way of Patch's soil and grass block; its notice is in `LICENSE`. The flame colour ramp and the frame's passes come from Patch's fire block (MIT).
- `public/textures/`: Ground048 and Ground103 by ambientCG, CC0 1.0.
- `public/assets/materials/fineGrainedWood/`: "Fine Grained Wood" by Rob Tuytel, Poly Haven, CC0 1.0.
- `public/assets/audio/`: five footsteps on grass from Kenney's Impact Sounds, CC0 1.0.
- `fonts/`: Red Hat Mono, SIL Open Font License 1.1.
- The scythe, the steel's maps, the flowers, the sky and everything else you see is made in code by Patch, CC0.
- Every line, as shipped: `CREDITS.md`. Where each thing came from and what was checked: `LICENCE-NOTES.md`.
