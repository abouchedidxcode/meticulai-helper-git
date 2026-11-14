---
kind: system
engine: three.js
---

# Realistic Procedural Dungeons

A procedurally generated crypt you can walk through in first person, built for three.js in WebGL2: vaulted rooms on carved columns, sunken basins with broken kerbs, worn paving, stairs through stone arches, candlelight and deep shadow. Each seed is a different dungeon, as plain data your game can read and as a level ready to walk.

![A vaulted crypt hall lit by embers at the foot of a carved column, with a candle beside worn paving](shots/cover.jpg)

## Try it

```
npm install
npm run dev
```

Click to look around, WASD to walk, Shift to run. Add `?seed=4242` to the address for another dungeon.

## What's in it

| File | What it does |
|---|---|
| `src/dungeon/generator.js` | The dungeon from a seed: a grid, rooms with roles, and corridors that always connect them. No graphics, so it runs anywhere. |
| `src/dungeon/floors.js` | Where the floor stands: basins, walkways, stairs. `floorAt` tells you its height at any point. |
| `src/dungeon/crypt.js` | The architecture: vaults, ribs, columns, arches, wall candles. |
| `src/dungeon/skin.js` | The continuous walls, tunnels and earth, which follow the walkable floor. |
| `src/dungeon/paving.js` | The floor's stones, one by one. |
| `src/dungeon/view.js` | Materials, lighting and post-processing. |
| `src/dungeon/walker.js` | Walking: a round body sliding along walls and columns. |
| `src/main.js` | This demo, and the place to start from. It's short: it builds the level, then steps the walker and draws. |

The data is measured in cells of 1.5 m and the level is drawn in metres, so anything you add shares its scene at its real size.

## Using it in a game

Copy `src/dungeon` and `public/assets` into your game, and start from `src/main.js`. You can add `?debug` to the address to get `window.__dungeon`, which lets you stand anywhere and read the level's data.

Rooms carry a role (`entrance`, `combat`, `elite`, `treasure`, `shrine`, `boss`) for placing what your game needs. Only the architecture is drawn, so nothing stands in those rooms until you put it there. `walkable` is a grid you can path on.

The rendering is heavy for a browser: about 3.5 million triangles a frame across its passes, measured where the walk starts. It has been tested on a fast graphics card only.

## Licence and credits

Code and art are MIT, see `LICENSE`, apart from the textures, which are CC0. Who made what is in `public/CREDITS.md`, and each licence's text is in `public/LICENSES`. Keep those with any copy.
