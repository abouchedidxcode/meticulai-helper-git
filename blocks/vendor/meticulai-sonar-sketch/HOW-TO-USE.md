# Sonar sketch: how to use it

A sonar ping that draws the world. Each ping casts 900 rays through your level's distance field and leaves a
glowing point wherever one meets a wall, at the moment the expanding front reaches that wall. The points flash,
then cool from teal to black over 4 seconds, so for a few seconds the sound sketches the shape of the space in 3D.
Things you mark (loot, exits) come back as a small amber knot. Optionally a big hidden body (a ghost contact) is
sketched in dim mauve points beyond the walls, drifting as it fades, faint even through rock.
Renderer: **WebGL2** (`ShaderMaterial` points). three 0.187. npm deps: `three` only. No textures, no files.

## What to copy

- **The block:** `src/sonar-sketch.js` (`SonarSketch`, `rayDirs`, `fromSolidSdf`, `SONAR_DEFAULTS`,
  `SONAR_COLOURS`), `src/shapes.js` (`bodySketch`: a stand-in body for ghosts), `src/index.js`.
- **Demo only:** `demo/` (a procedural cave in `demo/cave.js`, look/swim controls, a faint shell for the front).

## The field it needs

`density(x, y, z)`: a plain JS function, **positive inside rock, negative in open space**, roughly the distance to
the nearest wall (the signed distance of the open space). That is how cave and terrain fields usually come out
(marching cubes / surface nets input). If yours is an SDF of solid things (negative inside a solid), wrap it:
`fromSolidSdf(sdf)`. A mesh-only level has no field: build a rough one from boxes, capsules and spheres that match
the walls (see `demo/cave.js`), it does not have to be exact.

Cost: about 30 samples per ray, so ~27,000 calls per ping, spread over the ~45 frames the front takes, never more
than `budgetMs` (2 ms) of marching a frame. A field at 0.3-0.7 microseconds per call is fine.

## API

```js
import { SonarSketch, SONAR_DEFAULTS } from '../../vendor/meticulai-sonar-sketch/src/index.js';
const sketch = new SonarSketch();          // options: capacity 8192, rays 900, budgetMs 2, life 4, fogDensity 0.021, time, colours
scene.add(sketch.points);                  // one THREE.Points (+ its x-ray child for ghosts)

// a ping (t0 on the sketch's clock, range in metres); fwd = where the player looks (rays lean 25% toward it)
sketch.ping({ x, y, z, t0: sketch.time.value, range: 34 }, density, fwdVector, targets /* [{ pos: {x,y,z}, taken? }] */);

// every frame
sketch.time.value += dt;                   // its clock (or pass your own shared uniform: new SonarSketch({ time: myUTime }))
sketch.update(46, drawingBufferHeight);    // front speed m/s, pixel height (sizes the points)
```

- `sketch.ghost({ ping: {x,y,z,t0}, head, vel, at, shape: bodySketch({ length: 40 }), length: 40, sway: 1.3, echoes: 2, echoGap: 1, gain: 1, drift: 0.85 })`:
  a body that appears where the front reaches it, plus `echoes` fainter returns `echoGap` s apart, further along
  `vel`. `shape` is any set of body-space points (x forward, snout at 0, tail at -length).
- `sketch.clear()` between levels. `sketch.busy` is true while rays are still marching.
- `sketch.stats()`: `{ live, raysLastPing, hitsLastPing, pending, msFrame, msAvg, msMax, callsFrame, callsLastPing }`
  (put it in a dev panel).
- Decoy pings (`decoy: true`) draw nothing. At most three sketches march at once (older ones are dropped).
- `rayDirs(n, fwd, rot, out, flat = 0.78, pull = 0.25)` is exported if you want the same ray pattern for something
  else (sound occlusion, a scanner).

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-sonar-sketch`. No npm deps to add (three is already there).
2. In `my-game/src/game/game.js`, in `createGame(ctx)`: make the sketch, `scene.add(sketch.points)`, and keep the
   density function for your level next to the level code (`src/game/world.js`).
3. In `update(dt, mode)`: `sketch.time.value += dt;` then on `ctx.input.pressed('action')` (or your own action,
   `ctx.input.define('ping', ['KeyR', 'mouse:2'])`) call `sketch.ping(...)` from the player, with the camera's
   forward vector. Then `sketch.update(46, ctx.view.renderer.getDrawingBufferSize(v2).y)`.
4. Add `events.emit('ping', {...})` there so recordings and the bot can see it, and put the speed and range in
   `src/tuning.json` (group `sonar`: `speed` 46, `range` 34, `life` 4) so they show in the settings panel.
5. The starter's renderer (ACES, sRGB) is what the sketch expects. A dark scene (`scene.background` near black, no
   lights on the walls or very dim ones) is what makes it work: the points ARE the reveal.

## The numbers that matter

| Number | Value | What it feels like |
|---|---|---|
| front speed | 46 m/s | A 34 m ping takes 0.74 s to reach its edge: you see the sound travel, near walls first. Much faster and it is a flash; slower and it drags. |
| range | 34 m | One chamber and the start of the passage on. Big enough to plan a route, small enough that the dark stays dark. |
| `life` | 4 s | Long enough to steer by, short enough that you ping again. Target marks last 6 s. |
| `rays` | 900 | ~2,700 points a ping (each hit adds 2 satellites). 400 reads as dust, 2,000 costs 2x and looks like a mesh. |
| `budgetMs` | 2 ms | Marching never takes more than this a frame; rays that run out resume next frame. |
| flash | `exp(-age * 7)` | The bright white-teal pop when a wall is found; it fades in about 0.3 s. |
| colours | teal near, deep blue far, amber targets, mauve ghosts | Distance reads as colour, so a still frame still has depth. |
| `flat` / `pull` | 0.78 / 0.25 | Rays favour the horizontal and the view: more of the sketch is where you are looking. |

## What made it good in Abyssal

A critic watching a recorded dive said the game's weakest point was getting lost in the dark and asked for one
change: make sonar draw the world. This system was built for that. The next two critics both told the team to
keep "the sonar point sketch", one calling it "the best visual in the game". Two details made it work: points
appear when the front reaches them (so a ping has a direction and a speed you can feel), and they fade in the
shader from a birth time, so a ping never stalls a frame. The ghost contact was added later: the first version
behind rock was about 17/255 bright in 3 px dots at 35 m and read as nothing, so ghosts are brighter, bigger (never
under 4 px) and longer-lived than rock, with a faint layer that shows through walls.

## Gotchas

- The field sign. Positive = rock. With it reversed, every ray "hits" at 1.4 m and you get a ball of points
  round the player. Use `fromSolidSdf` for solid-object SDFs.
- Steep fields (lots of noise): the step is 0.4 x the distance for that reason. If points float off the walls or
  rays tunnel through thin walls, lower `STEP_K` / `STEP_MAX` in `src/sonar-sketch.js`.
- Thin walls under 0.35 m can be stepped over (the minimum step).
- A still screenshot of a ping looks like scattered stars; in motion (moving camera, a few pings) the shape reads
  at once. Judge it from a recording.
- The points are additive and do not write depth. Draw them after your opaque scene (they use `renderOrder` 5).
- No bloom. The game had a bloom pass; with one, the points glow more. Without it, it still reads.
- Lost points: the ring buffer holds 8,192, about three pings. Raise `capacity` if you ping faster than every 1.3 s.

## Restyle it

- Colours: `new SonarSketch({ colours: { near: [1, 0.4, 0.2], far: [0.5, 0, 0.3] } })` (linear RGB 0..1) for a
  heat scanner; or set `sketch.mat.uniforms.uNear.value` at runtime.
- A radar sweep instead of a sphere: give `rayDirs` a `flat` near 0 (all rays horizontal).
- An echolocating bat or a blind character: lower `range` to 15-20 and `life` to 2.
- A scanner pulse in a sci-fi game: keep it, raise `rays` to 1,500 and use your hull or helmet's colour.

## Run the demo alone

`cd blocks/vendor/meticulai-sonar-sketch && npm install && npm run dev` (http://127.0.0.1:5481). Click or Space to
ping, drag to look, WASD to swim, G for a ping that finds a ghost. `npm test` runs the 15 tests.
