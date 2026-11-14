# Impossible spaces: how to use it

Portals for three.js: join any two rectangular openings so looking, walking and throwing through them just works.
Rooms bigger inside than out, loops, a wall that becomes the floor, a door that shrinks you to a tenth.

- Renderer: **WebGPU only**. `PortalSystem` takes a `WebGPURenderer` (from `three/webgpu`); the opening's surface is a TSL node material, so nothing draws on `WebGLRenderer`. The demo refuses to start without `navigator.gpu`; WebGPURenderer's WebGL2 fallback is untested.
- three 0.186.1 (pinned). The system itself needs no physics; the demo uses `@dimforge/rapier3d-compat` 0.21.0 for walking and throwing. TypeScript sources.

## Reusable system vs demo

- System: one file, `src/lib/portals.ts` (433 lines, imports only `three/webgpu` and `three/tsl`). Entry: `src/lib/index.ts` (`PortalSystem`, `PortalFrame`, `oblique`).
- Demo: `src/demo/main.ts` (page boot), `app.ts` (renderer, input, loop), `player.ts` (first-person body that carries its own up direction and size through openings; worth reusing), `props.ts` (carry/throw things, drawn on both sides while straddling), `world.ts` (loads `public/level.json`, lightmaps, Rapier colliders). `public/` (level, baked lightmaps, Poly Haven textures), `tools/` (level builder, Blender bake, lightmap packer), `scripts/` (headless checks).

## API

```ts
import { PortalSystem } from '../../vendor/impossible-spaces/src/lib/index.ts';

const portals = new PortalSystem(renderer, scene, { maxDepth: 5, budget: 10, samples: 4, minShare: 0.0006,
  onView: (room) => { /* per-room background or fog before each view */ } });

portals.room('gallery').add(galleryStuff);           // a THREE.Group per room; a view draws exactly one room
portals.room('hall').add(hallStuff);
const a = portals.frame({ room: 'gallery', position, right, up, normal, width: 1, height: 2.2 });  // normal faces the viewer
const b = portals.frame({ room: 'hall', position: p2, right: r2, up: u2, normal: n2, width: 1, height: 2.2 });
portals.link(a, b);                                  // both ways; same proportions; size ratio scales what passes
portals.setFallback('hall', new THREE.Color(0x404040)); // colour shown when a view is too deep or too small
portals.prepare(4);                                  // make view targets during loading

// every frame, INSTEAD of renderer.render(scene, camera):
portals.render(camera, currentRoom);

// every step, for anything that moves (eye, ball centre):
const f = portals.crossing(room, before, after);     // the PortalFrame it went in through, or null
if (f) {
  position.applyMatrix4(f.through); orientation.premultiply(f.turn);
  velocity.applyQuaternion(f.turn).multiplyScalar(f.scale); size *= f.scale; room = f.link.room;
}
portals.dispose();                                   // frees the view render targets
```

`portals.stats` says what the last frame drew. Objects not inside any room group are drawn in every view. Lights do not
shine through openings: light each room yourself (the demo bakes it).

## Drop it into the starter (`my-game/`)

This is a big change to the starter: it needs WebGPU and it owns the draw call. Expect to restructure the level into rooms.

1. `node tools/blocks/add.mjs impossible-spaces`, then in `vite.config.js` add `resolve: { dedupe: ['three'] }` and `build: { target: 'es2022', ... }`.
2. Swap the renderer in `src/render/renderer.js`: `import * as THREE from 'three/webgpu';`, `new THREE.WebGPURenderer({ antialias: true })`, `warmUp` becomes `return renderer.compileAsync(scene, camera)`.
3. Let the game take over drawing. In `renderer.js` add `let drawFn = (s, c) => renderer.render(s, c);`, an api method `setDraw(fn) { drawFn = fn; }`, and use `drawFn(scene, camera)` in both `draw` and `capture`. In the game: `ctx.view.setDraw((s, c) => portals.render(c, playerRoom))`.
4. In `src/main.js`: `await view.renderer.init();` right after `createRenderer()`; replace `watchWebGL(view.renderer)` with `() => {}` (it reads a WebGL context). Check `view.capture()` isn't blank.
5. `ShaderMaterial` and `onBeforeCompile` don't draw under WebGPU: the starter demo's sky (`src/game/world.js`) must go; use `onView` to set `scene.background` per room.
6. Set the starter camera's `near` to about 0.03 (it is 0.1 in `src/game/camera.js`); the opening's surface is a box about that deep. When the player shrinks, scale `near` with them (the demo does `0.03 * size`).
7. Physics is yours. Rapier (`npm install @dimforge/rapier3d-compat@0.21.0`, `await RAPIER.init()`) is only needed if you copy `player.ts` / `props.ts`. Note slice-anything pins Rapier 0.19.3: the two can't share one install as-is.

## Gotchas

- WebGPU only: Chrome/Edge 113+, Safari 26+, Firefox on Windows recently. Show a message elsewhere (the demo's `#trouble` card in `index.html`).
- Cost: each view is a full scene draw into a screen-sized multisampled half-float target (about 115 MB each at 1080p). Up to `budget` extra draws a frame; anything that runs per render (`onBeforeRender`, a post-processing pass) runs once per view. Measured only on an RTX 4090. Cap pixel ratio.
- Level rules: nothing solid within 2 cm behind an opening; a walkable opening needs the same floor on both sides for half a metre; no two coplanar overlapping surfaces (z-fighting).
- Bodies cross when their centre passes the plane; until then they collide only with their own side.
- Pointer lock in the demo: headless checks use a fake one (`scripts/lib.mjs`).
- TypeScript: Vite strips types from `.ts` imports in a JS project. Keep the `.ts` extension in import paths.
- Rebuilding the level's light (`npm run bake`) needs Blender 5.2 and takes about 40 minutes; `npm run pack` needs ffmpeg with libwebp. You don't need either to use the system.

## Run the demo alone

```sh
cd vendor/impossible-spaces && npm install
npm run dev        # http://localhost:5374/
npm run build && npm run preview   # dist/ with THIRD-PARTY-NOTICES.md, served at http://127.0.0.1:5373/
```

Controls: click to look, WASD walk, Shift run, Space jump, E pick up / put down, click to throw, R back to the start.
Silent. `npm run level` rebuilds `public/level.json` from `tools/level-def.mjs`.

## Credit

Impossible spaces by blendi (Patch, patch.gg), code MIT, art CC0 (Poly Haven materials, Patch's baked light). Keep `LICENSE`, `CREDITS.md` and `LICENSES/CC0-1.0.txt`.
