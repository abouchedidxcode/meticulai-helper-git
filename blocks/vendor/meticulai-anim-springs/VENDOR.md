# Anim springs: where this copy came from

From **Bonesworth** by Meticulai (meticulai.com, play it at https://meticulai.com/games/bonesworth/). Extracted
2026-11-14 from the game's source at `8849adcf3` (clean). The game's folder is no longer in that repository's working
tree, so the files were read from git at that commit (`git show 8849adcf3:<path>`).

| | |
|---|---|
| Made by | Meticulai |
| Source | Bonesworth, `src/anim/` (13 TypeScript files, about 2,200 lines with tests) |
| Commit | `8849adcf3` (the anim core was last changed in `59d81a925`, 2026-10-25) |
| Copied on | 2026-11-14 |
| Code licence | MIT (see `LICENSE`, which also credits the published methods it follows) |
| Art licence | none (no art; the demo figure is built from three.js primitives) |
| Renderer | none (the system only uses three.js math and `Object3D`; the demo uses `WebGLRenderer`) |

## What changed

- TypeScript to plain JavaScript ES modules with JSDoc types. Imports now end in `.js`.
- Every number kept as the game had it: spring half-life defaults (0.15 s for `Spring`/`SpringVec3`/`SpringQuat`,
  0.12 s for inertializers, 0.2 s for layer weight fades), `ChannelFollower` 0.025 s, IK softness default 0.015 m,
  `BouncySpring` 2 Hz / 0.4, `Jitter` 8% time / 12% amplitude, timeline arc defaults (12 cm, 10%), easing constants.
- `TypeScript private` fields became `_underscore` fields (`Timeline._explicitDuration`, `Track._tangents`, ...).
- `TwoBoneIK` used a private copy of `setWorldQuaternion`; it now calls the exported one (same code).
- `PoseInertializer.apply`: on the very first frame a bone is seen, it no longer measures a velocity against an
  identity rotation (the original created the "last" entry and then tested for it, so the first frame's velocity
  was the bone's whole rotation divided by dt). Only matters if a transition is requested on the second frame.
- Comments: game-specific references (the gambler, dice, tankard, an asset generator) replaced by general wording.
- Tests: the game's vitest file (40 cases) ported to `node:test` in `test/anim.test.mjs`, same cases and tolerances
  (a `close()` helper reproduces vitest's `toBeCloseTo`).
- Left out (game glue): the gambler rig solver, face controller, director, action library, scene measurements and
  the fuzz harness that used this core. Their lessons are in `HOW-TO-USE.md`.
- Added: `demo/` (a figure made of capsules), `package.json`, `vite.config.mjs`, `block.json`.

## Checked

On 2026-11-14: copied this folder to a temporary folder, ran `npm install`, `npm test` (40 pass), `npm run build`,
and opened the demo in headless Chromium. It drew without errors. The picture is `blocks/previews/meticulai-anim-springs.jpg`.
