---
kind: system
engine: three.js
---

# Impossible spaces

Portals for three.js on WebGPU: join any two rectangular openings, and looking, walking and throwing through them is seamless. Rooms can be bigger inside than out, loop back on themselves, turn a wall into the floor, or make you a tenth your size.

![The mouth of a three-metre concrete box in a gallery, with a thirty-two metre tunnel inside it](cover.jpg)

The system is one file, `src/lib/portals.ts`. The live demo is a short first-person walk through a gallery whose exhibits are impossible: a three-metre box that holds a thirty-two metre tunnel, a hut that holds a hall, a corridor round a pillar whose door opens on a different room each lap, a stair that never arrives, a door that puts you on the next room's wall, and a door that lets you out, a tenth as tall, onto the table you were just looking at. A ball and a box can be pushed, carried and thrown through all of it.

Code is MIT. The art is CC0: four Poly Haven materials, and light baked for this demo.

## What this owns

- **Renderer:** WebGPU only. `PortalSystem` takes a three.js `WebGPURenderer` you made; the demo's `App.create` (`src/demo/app.ts`) makes its own on the page's `#view` canvas. The opening's surface is a TSL node material, so nothing here runs on `WebGLRenderer`.
- **Frame loop:** it draws the whole frame. `portals.render(camera, room)` stands where `renderer.render(scene, camera)` would: it draws the scene once for each view through an opening, deepest first, each into a screen-sized half-float target with the renderer's sample count, then the main view to the canvas. Up to `budget` extra draws a frame (10 in the demo), so anything that runs once a frame on render (a post-processing pipeline, a simulation hooked to `onBeforeRender`) runs once a view unless you guard it.
- **Scene:** everything belongs to a room, a `THREE.Group` from `portals.room(id)`, and a view draws exactly one room; `render` switches the groups' `visible`. Rooms can sit anywhere, overlapping or not. Things outside any room group are drawn in every view. `onView(room)` is called before each view, for a per-room background or fog.
- **Camera:** it reads your `PerspectiveCamera` and never moves it. Views behind an opening use a camera of its own, with an oblique near plane on the far opening so nothing behind it shows. `camera.near` matters: the opening's surface is an open box deep enough for it.
- **three:** `package.json` pins 0.186.1. The demo also uses Rapier 0.21.0 for walking and throwing; the system itself needs no physics.
- **Copy:** for the system alone, `src/lib/portals.ts` (it imports only `three/webgpu` and `three/tsl`). For the walk as well: `src/demo/` (`player.ts` is a first-person body that keeps its own up and size, `props.ts` things to carry that are drawn on both sides of an opening while they straddle it, `world.ts` the lightmapped rooms), `public/`, `recipe.json` and `lib/patch-block.js`, with the `patch-block` alias from `vite.config.ts`.
- **What it expects of a level:** nothing solid within 2 cm behind an opening, unless it carries on exactly as the other side does (a corridor cut in two). A walkable opening needs the same floor on both sides for half a metre: a body is moved when its centre crosses, and until then it only touches its own side. Two surfaces must never lie in the same plane over the same area (the level build here refuses that).
- **Light:** yours. A light in one room does not shine through an opening. The demo bakes each room's light in Blender and, in the bake, gives every opening a soft light the colour of the room behind it.
- **Cost:** every view is a full draw into a screen-sized multisampled target, about 115 MB of graphics memory each at 1080p. The demo caps the canvas at about 1440p for that reason. On an RTX 4090 at 1080p the deepest view in the demo (seven views, five deep) draws at 190 frames a second; it has not been measured on anything slower.

## Link two openings

```ts
import { PortalSystem } from './src/lib/index.ts';

const portals = new PortalSystem(renderer, scene, { maxDepth: 5, budget: 10 });

// Everything goes in a room.
portals.room('gallery').add(galleryMeshes);
portals.room('hall').add(hallMeshes);

// An opening: its centre, its axes (it spans right × up, and normal points at whoever looks in), its size.
const door = portals.frame({ room: 'gallery', position, right, up, normal, width: 1, height: 2.2 });
const far = portals.frame({ room: 'hall', position: p2, right: r2, up: u2, normal: n2, width: 1, height: 2.2 });
portals.link(door, far); // both ways

renderer.setAnimationLoop(() => portals.render(camera, roomTheCameraIsIn));
```

Size and direction come from the two frames. Link a door to one a tenth its size and what goes through comes out a tenth as big; link an upright door to one lying on its side and that wall is the floor on the other side.

## Send something through

```ts
// Each step: did this point (an eye, a ball's centre) go in through an opening of its room?
const through = portals.crossing(room, before, after);
if (through) {
	position.applyMatrix4(through.through); // where it is now
	orientation.premultiply(through.turn); // which way it faces, and which way is up for it
	velocity.applyQuaternion(through.turn).multiplyScalar(through.scale);
	size *= through.scale;
	room = through.link.room;
}
```

`src/demo/player.ts` and `src/demo/props.ts` are that, for a walking body and for thrown things. Gravity is each body's own (`down`), turned by `through.turn` like everything else.

Other knobs: `maxDepth` (how many openings deep a view goes), `budget` (most views a frame), `minShare` (a view smaller than this share of the screen is a flat colour, from `setFallback(room, colour)`), `prepare(n)` (make the view targets before the first deep look), and `stats` (what the last frame drew).

## The demo

Its controls are in `recipe.json`: where to start, how many views deep to draw (at 0 every opening is a flat colour), an outline round every opening, field of view, walking speed and the view budget, and a button that brings the ball to you. In the frame: click to look, WASD to walk, Shift to run, Space to jump, E to pick up or put down, click to throw, R to go back to the start.

It is silent.

## Build it

```sh
npm install
npm run build        # dist/, with THIRD-PARTY-NOTICES.md
npm run preview      # http://127.0.0.1:5373/
```

The level is code. To change it:

```sh
npm run level        # tools/level-def.mjs -> public/level.json (quads, colliders, openings)
npm run bake         # Blender 5.2 bakes each room's light to bake/*.exr (about 40 minutes at these settings)
npm run pack         # bake/*.exr (65 MB) -> public/lightmaps/*.webp (3.4 MB)
```

`npm run bake` expects Blender on the PATH as `blender`, and `npm run pack` ffmpeg with libwebp. `bake/` is not in the repo.

## Checks

`scripts/` holds the checks this was built with, all headless, muted and frame-stepped, in a browser that is given a pretend pointer lock so the real mouse is never taken (`scripts/lib.mjs`). `CHECKS.md` has what they found.

- `node scripts/all.mjs`: walks in through every walkable opening two ways and reports any that fail to cross or pop.
- `node scripts/roll-all.mjs`: rolls a ball in through every one and checks where and how it comes out.
- `node scripts/zfight.mjs`: draws 2,800 views twice with a tenth-of-a-pixel nudge and flags surfaces that fight for depth.
- `node scripts/cold.mjs <url>`: a first visit on a slowed CPU and network, and what the first seconds after ready are like.
- `node scripts/page-visit.mjs <url>`: the demo in a real block page's frame, and whether the page round it ever stops.
- `node scripts/fps.mjs`, `walk.mjs`, `props.mjs`, `shot.mjs`, `clip.mjs`, `smoke.mjs`: frame cost, single walks, thrown things, stills, a clip, and the real page with real keys.

## Licence and credits

Code: MIT (`LICENSE`). Art: CC0 1.0 (`LICENSES/CC0-1.0.txt`).

- Materials from Poly Haven, CC0, by way of Patch's asset library (1K maps): Wood Floor and Black Painted Planks by Dimitrios Savva, Brushed Concrete 04 by Amal Kumar, Marble 01 by Rob Tuytel. `CREDITS.md` has each one's line.
- The level, the baked light (`public/lightmaps/`), the cover and the pictures in `public/thumbs/` were made for this block by Patch, and are CC0.
- Bundled libraries: three.js (MIT) and Rapier (Apache-2.0). The build writes their licences to `THIRD-PARTY-NOTICES.md`.
