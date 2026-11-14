# Blink input: how to use it

The webcam as a controller: **eyes closed**, **looking away** (head turned, face out of frame, tab hidden) and a
coarse **gaze** (left / centre / right), as clean events with hysteresis. Per-player calibration, a scripted
synthetic face for tests, and keyboard / mouse / no-camera fallbacks. Runs MediaPipe Face Landmarker locally in the
browser: **no video ever leaves the player's device.**
Renderer: none (works with any game). npm deps: `@mediapipe/tasks-vision` 1.1.0. No three.js.

## Rules for any game that uses it

1. **Always offer a fallback.** Hold Space (built in), and a hold-to-close button or touch for mouse and phone players
   (`eyes.setButtonHeld(true/false)`). The game must be fully playable without a camera. Without one, turn on
   `eyes.autoBlink = true` during play so the "it moves when you blink" pressure still exists.
2. **Camera permission in one click.** One button ("Use my camera") that calls `startCamera()`; browsers only show the
   prompt after a click. Next to it, one line: **"Your camera video stays on this device. Nothing is recorded or
   sent anywhere."** If it fails, show `CAMERA_HELP[error.kind]` and keep the fallback ready.
3. **https or localhost only.** The camera does not work on `http://192.168...` or a file. The starter's dev server
   (`localhost`) and itch.io / GitHub Pages (https) are fine.
4. **Calibrate before play** (about 8 seconds) and offer "Recalibrate" in the pause menu. Lighting, glasses and seat
   change the scores a lot.
5. **Be forgiving.** A very short blink should never be fatal (in Don't Blink the monster stops just short). False
   "closed" readings feel like cheating; missed blinks just feel calm.

## What to copy

- **Reusable system:** `src/` (start at `src/index.js`). `eye-state.js` (the state machine, no DOM needed),
  `calibration.js`, `face-tracker.js` (MediaPipe), `camera.js`, `synthetic.js`, `pose.js`, `face-preview.js`.
- **Install-time helper:** `scripts/fetch-model.mjs` (model + wasm into a `public/` folder).
- **Demo only:** `demo/`.

## API

```js
import { EyeState, startCamera, calibrate, SyntheticFace, CAMERA_HELP } from '.../src/index.js';

const eyes = new EyeState({ /* any EYE_DEFAULTS field */ });
eyes.bindKeyboard();                         // hold Space = eyes closed (returns an unbind function)
eyes.on('blindStart', ({ time }) => ...);    // player can't see the screen (eyes closed OR looking away)
eyes.on('blindEnd', ({ time, blindFor }) => ...);
eyes.on('eyesClosed', ...); eyes.on('eyesOpened', ({ closedFor }) => ...);
eyes.on('lookAwayStart', ({ reason }) => ...);   // 'headTurn' | 'noFace'
eyes.on('lookAwayEnd', ({ awayFor }) => ...);
eyes.on('trackingFailed', ({ reason }) => ...);  // camera died for good; fallbacks keep working

// from a click:
const res = await startCamera(eyes, { onStatus: (text) => ... });   // camera + model + saved calibration
if (!res.ok) showMessage(CAMERA_HELP[res.error.kind]);              // denied | notFound | inUse | insecure | unsupported | unknown

const r = await calibrate(eyes, {                // ~2 x (0.9 s settle + 2.5 s sample)
  onPhase: (p) => ...,                           // 'open' (look normally) -> 'closed' (play a tone: eyes are shut) -> 'done' (second, higher tone)
  onProgress: (p) => ...,                        // 0..1
});                                              // r.ok ? saved to localStorage : r.reason (plain words, show it, offer retry / defaults)

// every animation frame:
const s = eyes.update();   // s.eyesClosed, s.lookingAway, s.blind, s.gaze ('left'|'center'|'right'|'unknown'),
                           // s.blinkLeft/Right (0..1), s.yawDeg, s.pitchDeg, s.eyesClosedDuration, s.blindDuration,
                           // s.simulated, s.source ('camera'|'keyboard'), s.trackerFps
```

- `eyes.attach(new SyntheticFace())`: a scripted face (blink, long close, one-eye squint, head turn, lost face,
  glances) at 30 fps. `synth.hold('open'|'closed'|'squint'|'gone'|'away'|null)` overrides the script. Use it for bots,
  recordings and tests; `?synthetic=1` in the demo.
- `eyes.feed(frame, nowMs)`: push a `{ faceDetected, blinkLeft, blinkRight, yawDeg, pitchDeg, irisX }` frame by hand.
- `eyes.setKeyHeld(b)`, `eyes.setButtonHeld(b)`: fallbacks from code or an on-screen button.
- `eyes.o.<option> = value` changes any number live. `eyes.calibration` holds the per-player thresholds.
- `drawFacePreview(canvas, video, eyes.lastFrame, closed)`: mirrored camera with eye landmarks (calibration screen).
  `drawCartoonFace(canvas, eyes.snapshot, { closed, away })`: a drawn face that follows the values, no video.
- `computeCalibration(openFrames, closedFrames)` and `percentile()` are pure (tested).

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-blink-input` (copies the block to `my-game/vendor/meticulai-blink-input/`
   and downloads the model into it, checked against its sha256).
2. In `my-game/`: `npm install @mediapipe/tasks-vision@1.1.0`, then
   `node vendor/meticulai-blink-input/scripts/fetch-model.mjs --out public` (copies the model and the wasm into
   `my-game/public/models/` and `my-game/public/wasm/`). Add the same line as `"predev"` and `"prebuild"` scripts in
   `my-game/package.json` so a fresh install always has them, and add `public/wasm/` and `public/models/*.task` to
   `my-game/.gitignore`. The starter's `base: './'` makes the default paths (`wasm`, `models/face_landmarker.task`)
   work in dev and in the shipped zip.
3. In `my-game/src/game/game.js`:
   ```js
   import { EyeState, startCamera, calibrate } from '../../vendor/meticulai-blink-input/src/index.js';
   // in createGame(ctx):
   const eyes = new EyeState();
   eyes.bindKeyboard();
   eyes.on('blindStart', (e) => ctx.events.emit('blind', e));     // tools and recordings see it on __game.events
   eyes.on('blindEnd', (e) => ctx.events.emit('see', e));
   // in update(dt, mode): const s = eyes.update();  then use s.blind / s.eyesClosed
   // in state(): return { ..., eyesClosed: eyes.snapshot.eyesClosed, lookingAway: eyes.snapshot.lookingAway };
   ```
   `update()` reads the clock itself (performance.now), so calling it from the starter's fixed 60 Hz step is fine.
4. Title screen: add a "Use my camera" button with the privacy line (rule 2) next to the normal start, and a
   "Calibrate" step after the camera starts. Keep the start without a camera working.
5. Bots and recordings: with `?bot=1`, `eyes.attach(new SyntheticFace())` so `tools/play/record.mjs` sees real
   blinks and look-aways without a camera. Headless Chromium can also fake a camera
   (`--use-fake-device-for-media-stream`), but its test pattern has no face, so it only proves the model loads.
6. Tuning: the numbers below can go into `src/tuning.json` (group `eyes`) and be copied into `eyes.o` each step.
7. The starter pauses when the tab is hidden; `EyeState` also counts a hidden tab as looking away. For a test page
   that must keep reading in the background, pass `isHidden: () => false`.

## The numbers (Don't Blink's, unchanged) and what they feel like

| Option | Default | What it does |
|---|---|---|
| `closeThreshold` / `openThreshold` | 0.45 / 0.28 | Blink score both eyes must pass to read closed / either eye must drop under to read open. The gap between is the hysteresis band: no flicker at the edge. Calibration replaces both per eye. |
| `blinkSmoothing` | 0.2 | Light smoothing: a single noisy frame can't close the eyes, a real blink still registers in ~2 frames. |
| `lookAwayYawDeg` / `lookAwayPitchDeg` | 32 / 28 | Head turn / tilt from the player's own neutral before it counts as looking away. Lower = stricter. |
| `lostFaceGraceMs` | 200 | Face must be gone this long. Filters dropped frames; longer feels laggy. |
| `staleTrackerMs` | 1000 | No tracker frames this long (camera stalled) counts as looking away. |
| `maxDetectFailures` | 60 | Tracker errors in a row before giving up and emitting `trackingFailed`. |
| `gazeZoneSplit` | 0.22 | Iris offset that splits left / centre / right. Coarse on purpose; don't build aiming on it. |
| `gazeMirror` | true | "left" = the player's left as they see the screen. |
| `detectFps` | 30 | Max face detections per second. |
| `autoBlinkIntervalMin/Max`, `autoBlinkMsMin/Max` | 3.5-7.5 s, 130-260 ms | Simulated blinks without a camera (only while `autoBlink` is on). |
| calibration `sampleMs`, `settleMs`, `minFrames` | 2500, 900, 16 | Each phase settles 0.9 s, then samples 2.5 s (up to 3x longer on slow machines until 16 face frames). |
| calibration `closeFraction` / `openFraction` | 0.6 / 0.35 | Thresholds at 60 % and 35 % of the way from the player's open (90th percentile) to closed (median) scores. |
| calibration `minSeparation` | 0.15 | Open and closed closer than this: rejected with a plain-words reason (more light, close fully). |

## What made it good in Don't Blink

- The whole game is built on one honest signal: "can the player see the screen?" (`blind` = eyes closed OR looking
  away). You can only walk with your eyes closed, and the monster only moves while you can't see it; the horror is
  opening your eyes to see what changed. One clean event pair (`blindStart` / `blindEnd`) drives it all.
- **Closing needs both eyes, opening needs either.** A squint or a wink never counts as closed, and the moment one
  eye opens the player sees again. That asymmetry is what keeps it from feeling unfair.
- **Calibration to the player's own eyes**: open is the 90th percentile (squints spike), closed is the median.
  Players whose closed eyes only score 0.4 would never trigger the defaults; after calibration they do (tested).
- **Face loss judged on tracker frames, not wall time**, with a 200 ms grace, so a slow machine or a dropped frame
  doesn't flicker into "looking away".
- **It never dead-ends**: denied, missing, busy or unplugged camera all drop to keyboard mode, and keyboard mode
  still blinks for you now and then so the pressure stays.
- Honest note: the game is live, but **real webcam tracking has never been checked by a person**: the defaults and
  the calibration maths are unproven on real faces. The game's own balance was checked by a headless simulator, not
  by eyes. Get a person to play it with a camera early.

## Gotchas

- Camera needs https or localhost (`CameraError` kind `insecure`). Never test on a LAN IP.
- The model (3.8 MB) and wasm (two builds, ~13 MB each; the browser downloads one) are served by the game; the first
  load takes a moment. Load
  them after a click, not on page load (`startCamera` does this).
- The GPU delegate fails on some machines; it falls back to CPU automatically (`res.tracker.delegate`).
- `eyeBlinkLeft/Right` scores vary a lot with lighting and glasses; dim rooms make open eyes read half-closed.
  Calibration rejects that case with a reason; show it.
- Gaze is coarse (three zones). Head yaw is far more reliable than iris position.
- A head turn keeps the last eye reading (closed stays closed); a lost face reads "open but looking away".
- Hidden tab = looking away. If your game pauses on hide (the starter does), that's consistent.
- Don't call `update()` from two places per frame: detection is throttled by time, events would double up.

## Restyle it

All UI is the game's own: the block only gives values, events and two optional drawing helpers. Change the words in
`CAMERA_HELP`, the face colours in `drawCartoonFace`, and the calibration phases' text and tones in your screen.

## Run the demo alone

`cd blocks/vendor/meticulai-blink-input && npm install && npm run dev` (http://127.0.0.1:5396). `predev` downloads the
model and copies the wasm. Add `?synthetic=1` for the scripted face, or click "Use my camera". Hold Space or the
button to close your eyes without a camera. `npm test` runs the 25 Node tests (`three` is only used to cross-check
the head-pose maths).

## Credit

Blink input from Don't Blink by Meticulai, MIT. MediaPipe Tasks Vision and the Face Landmarker model by Google,
Apache-2.0 (see `LICENSE`).
