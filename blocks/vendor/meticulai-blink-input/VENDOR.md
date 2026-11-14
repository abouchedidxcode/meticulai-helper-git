# Blink input: where this came from

From **Don't Blink** by Meticulai (meticulai.com, https://meticulai.com/games/dont-blink/). Extracted 2026-11-14 from
the game's source at `8849adcf3` (clean: no uncommitted changes in the game's folder).

| | |
|---|---|
| Made by | Meticulai |
| Source files (in the game folder) | `src/eyes/eyeState.ts`, `calibration.ts`, `faceTracker.ts`, `camera.ts`, `types.ts`, `src/ui/facePreview.ts`, `src/ui/calibrationScreen.ts` (the sequence only), `src/dev/eyes-test.ts` (the demo's idea), `scripts/fetch-model.mjs`, the `eyes` and `calibration` sections of `src/config.ts` |
| Code licence | MIT (see `LICENSE`) |
| Depends on | `@mediapipe/tasks-vision` 1.1.0 (Apache-2.0) and Google's `face_landmarker.task` model (Apache-2.0), both fetched at install time, never committed |
| Renderer | none (a 2D canvas only in the demo) |

## The model's licence

The download URL itself states no licence. Google's model cards for the three models inside `face_landmarker.task`
("Model Card MediaPipe Face Mesh V2", "Model Card Blendshape V2", "MediaPipe BlazeFace Model Card (Short Range)",
linked from the Face Landmarker docs) each say "Licensed under Apache License, Version 2.0" (read on 2026-11-14).
MediaPipe itself is Apache-2.0. The model is downloaded at install time from Google's URL (sha256
`64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`, 3,758,596 bytes), never committed.

## What changed

- TypeScript to plain JavaScript ES modules with JSDoc types.
- The game's `CONFIG.eyes` and `CONFIG.calibration` became options (`EYE_DEFAULTS`, `CALIBRATION_DEFAULTS`) with
  **exactly the game's numbers** as defaults. The calibration storage key became `blink-input.calibration.v1` (rename
  it per game).
- The game's typed `Emitter` became a 30-line inline emitter; the global `eyeState` singleton became `new EyeState()`.
- three.js is no longer needed: head yaw/pitch come from the facial transformation matrix in plain maths
  (`src/pose.js`), checked against three's `Euler.setFromRotationMatrix(m, 'YXZ')` on 500 random poses in the tests.
- `EyeState.update()` and `feed()` take the time as an argument and the hidden-tab check is an option, so the whole
  state machine runs in Node tests. `feed()` (was the private `ingest`) is public for injecting frames by hand.
- Added a mouse/touch fallback (`setButtonHeld`), a code-side fallback key (`setKeyHeld`), a configurable fallback
  key (`fallbackKey`), and an injectable random source for the simulated blinks.
- `FaceTracker.create()` takes the wasm and model paths (relative to the page) and loads MediaPipe on demand
  (dynamic import), so a game that never turns the camera on never downloads it.
- New: `SyntheticFace` (a scripted face for demos, bots and tests, no camera), `startCamera()` (one-call setup from a
  click), `calibrate()` (the game's calibration sequence without its UI), `CAMERA_HELP` (plain-words messages),
  `drawCartoonFace()` (a drawn face that follows the tracked values).
- `scripts/fetch-model.mjs` now checks the model's sha256, accepts `--out <public dir>` for use from a game, copies
  the wasm to `public/wasm/` (the game used `public/mediapipe/`), and never fails the build.
- Left out: the game's calibration screen markup and styles, its beep sound helper, the debug overlay (game
  internals), and everything outside `src/eyes/`.

## Checked

On 2026-11-14 in a temporary copy: `npm install`, `npm test` (25 tests pass), `npm run build`, and the demo in
headless Chromium with `?synthetic=1` (events, calibration) and with Chromium's fake camera (the real MediaPipe model
loads and runs). The picture is `blocks/previews/meticulai-blink-input.jpg`.

**Not checked with a real face on a real webcam by a person**, here or in the game. The thresholds are the game's
defaults and calibration exists for that reason, but treat them as a starting point.
