# Hand controls: where this copy came from

From the hands games by Meticulai (meticulai.com): Show of Hands and the 14 games in it (Fireflies, Koi, Lanterns,
Palm Runner, Fit, Glide and others), which all ship the same hand-gesture kit, and GODHAND, where the gesture engine
was first written. Extracted 2026-11-14 from the games' source at `8849adcf3` (clean: no uncommitted changes in the
files used).

| | |
|---|---|
| Made by | Meticulai |
| Play it | https://meticulai.com/games/show-of-hands/ |
| Code licence | MIT (see `LICENSE`) |
| Third-party | `@mediapipe/tasks-vision` 1.1.0 by Google (Apache-2.0, npm dependency, not copied); `hand_landmarker.task` model by Google (downloaded at install, not redistributed) |
| Renderer | none (2D canvas overlay helper only) |

## Sources (paths inside each game's folder)

- Fireflies `src/hand-gesture-kit/` (all 12 files; byte-identical to the copy in Show of Hands and the other hands
  games): the camera tracker, the one-call `createHands`, synthetic hands, the drawing helper, the engine.
- GODHAND `src/gesture/engine.ts`, `motions.ts`, `README.md`: the gesture on/off mask (`setEnabled`, `enabled`,
  `isEnabled`, `TWO_HAND`) that the shared kit lacked, and the docs. `tests/gestureEngine.test.ts` became
  `test/gestures.test.mjs`.
- Show of Hands `src/nav.ts`: `PinchClick`, `HoldZone`, `damp`.
- Fireflies `src/rules.ts`: `Grip` and `closeDuration` (open/fist hysteresis with close speed).
- Fireflies `scripts/copy-mediapipe.mjs`: the wasm copy, now part of `scripts/fetch-model.mjs`.

## What changed

- TypeScript converted to plain JavaScript ES modules with JSDoc types. The kit's engine and GODHAND's engine merged
  into one: the kit's `frame` property and partial config input, plus GODHAND's enable mask. `engine.catalog` now
  also lists `hold`.
- Every tuning number is exactly as the games shipped it.
- Removed the `emoji` field from poses and motions (no emoji in game UI); names and hints stay. Renamed one
  experimental pose that was named after a TV franchise to `split` / "Split salute".
- `inject()` also accepts a function of time, called every frame (for mouse fallbacks, bots and the demo script).
  `createHands` takes a `mirror` option. Added `mixPoses()` to blend synthetic poses.
- New `helpers.js` collects the game-side helpers above, plus `cameraProblem()` (plain-words camera errors that
  always point at the fallback) and `PRIVACY_LINE`, from the games' camera screens.
- The model is no longer committed: `scripts/fetch-model.mjs` downloads it from Google's URL and checks its SHA-256.
- Left out: GODHAND's full Gesture Lab page (reliability trials, per-gesture icons, threshold sliders; it depended on
  that game's icon set). The demo here is a smaller lab: hands with pose names, live pose scores and an event log.
  Left out the hands hall's camera-sharing bridge (specific to Show of Hands).

## Model licence

Google publishes `hand_landmarker.task` for MediaPipe at the URL in `scripts/fetch-model.mjs`. Its download page and
model card ("Model Card Hand Tracking (Lite/Full) with Fairness, Oct 2021") give no separate licence; MediaPipe itself
is Apache-2.0. Because of that, this kit does not redistribute the file: each game downloads it from Google. Games
that ship it in their build (as the hands games do) should keep Google's Apache-2.0 notice in `CREDITS.md`.

## Checked

On 2026-11-14: `npm test` (74 tests, synthetic hands through the real engine) passed. In a temporary copy:
`npm install`, `npm run build`, and the built demo in headless Chromium on the GPU: the scripted hands produced
poses, a swipe, a throw and a clap; the mouse hand produced a pinch tap; Chromium's fake webcam loaded the real model
on the GPU delegate at ~54 detections per second with no page errors. Not checked: a real webcam with real hands.
