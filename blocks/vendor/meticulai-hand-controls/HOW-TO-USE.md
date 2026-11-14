# Hand controls: how to use it

Play with bare hands in front of a webcam. One call opens the camera, runs Google's MediaPipe HandLandmarker in the
browser, mirrors it like a selfie, smooths it, and gives you per hand per frame: a stable **pose** (20 built in:
open, fist, point, pinch, OK, V, thumbs up/down, rock, gun, claw...), a **score for every pose**, continuous values
(palm position, pinch 0..1, openness, roll, size as depth, velocity) and **events**: swipes, push/pull, circles,
wave/shake, twist, pinch tap/double tap, throw, hold, and two-hand clap, zoom and steering wheel.
**Synthetic hands** drive the same engine without a camera, so tests, bots and mouse/touch fallbacks share one
code path. Renderer: none (works with any renderer; the overlay helper is a 2D canvas). No three.js needed.

Run the demo: `npm install && npm run dev` (http://127.0.0.1:5396). `?synthetic=1` plays a scripted pair of hands;
with no camera the mouse is a hand (hold the button to pinch). `npm test` runs 74 tests with synthetic hands.

## The rules every hands game follows

These came from 15 webcam games; follow them in yours.

1. **Be charitable with gestures. When unsure, the player is right.** Tracking is noisy and hands differ. Use low
   thresholds, read the raw `scores` (not only the debounced `pose`) where speed matters, short lock-in times and
   generous hit areas. The player should feel understood. (The exception is a game whose point is precision; one
   game was asked to be strict. Decide per game, write it in DECISIONS.md.)
2. **Always offer mouse, touch and keyboard fallbacks** that play the same game, so it works on a phone, with the
   camera denied, or with no camera at all. Easiest way: turn the mouse/touch into a synthetic hand
   (`hands.inject(fn)`, see below), so the game only ever reads hands.
3. **Camera permission in one click**, from a button (browsers require a click). Next to it, always the line
   **"Your camera video never leaves this device."** (`PRIVACY_LINE`). If it fails, say why in plain words and point at
   the fallback (`cameraProblem(err, 'the mouse')`).
4. **The camera needs https or localhost.** `npm run dev` on localhost works; a phone on your network at
   `http://192.168...` will not get the camera (use the fallback, or an https tunnel). itch.io and GitHub Pages are https.
5. Show a small **mirrored camera preview with the hand drawn on it** (`drawHand`) unless the game shows the feed itself,
   so players can see what the game sees. Keep the area a game needs inside `DEFAULT_REGION` (players can't reach the
   frame edges).
6. **No emoji in the UI.** Pose and motion data have `name` and `hint` only; draw line icons or an animated line-art
   hand for how-to-play.

## Files

- `src/index.js`: everything below.
- `src/hands.js`: `createHands()`, `toScreen()`, `fromScreen()`, `DEFAULT_REGION`.
- `src/tracker.js`: webcam + MediaPipe (`HandTracker`), GPU with CPU fallback, one detection per new video frame.
- `src/engine.js`: `GestureEngine` (smoothing, poses with hysteresis and debounce, motions, two hands, on/off mask).
- `src/features.js`, `src/poses.js`, `src/motions.js`: measurements, the pose library, motion detectors.
- `src/oneEuro.js`: One Euro filter, 1D and 2D (useful for any jittery input: tilt, touch, gamepad).
- `src/synthetic.js`: procedural hands in any pose (`syntheticHand`, `SYNTHETIC_POSES`, `mixPoses`).
- `src/helpers.js`: `PinchClick` (pinch-as-click with hysteresis), `Grip` (open/fist with close speed), `HoldZone`
  (hold-to-confirm with a grace period), `damp`, `cameraProblem`, `PRIVACY_LINE`.
- `src/draw.js`: `drawHand()` on a 2D canvas.
- `scripts/fetch-model.mjs`: downloads the model and copies the wasm (see "Model and wasm").
- Demo only: `demo/`, `vite.config.mjs`.

## API

```js
import { createHands, toScreen, syntheticHand, SYNTHETIC_POSES, PinchClick, cameraProblem, PRIVACY_LINE } from '.../src/index.js';

const hands = createHands({ onFrame(frame) { /* every new frame: frame.hands, frame.twoHand, frame.events */ } });
button.onclick = () => hands.startCamera().catch((e) => showMessage(cameraProblem(e, 'the mouse')));

hands.engine.on('fist', (e) => (e.phase === 'start' ? grab(e.hand) : release(e.hand))); // pose start/end per hand
hands.engine.on('swipe-left', prev);       // any event name, a kind ('pose' | 'motion' | 'two-hand'), or '*'
hands.engine.on('clap', jump);

const h = hands.frame.hands[0];            // latest frame, any time
if (h) {
  const p = toScreen(h.features.center);   // palm centre -> 0..1 of the screen (comfortable region, clamped)
  h.pose; h.scores.point; h.pinch; h.features.openness; h.features.roll; h.features.size; h.velocity;
}
```

`createHands(options)`: `video` (show it with `transform: scaleX(-1)`; a hidden one is made if omitted),
`config` (engine numbers, any subset), `numHands` (2), `assetBase` (where `wasm/` and `models/` are served, default
the page's folder), `camera` (getUserMedia constraints), `mirror` (true), `onFrame`.
Returns `{ engine, tracker, video, frame, source, startCamera(), inject(), feed(), stop() }`.

- `hands.inject([hand, ...])` holds those hands every frame; `hands.inject((tMs) => [...])` calls your function every
  frame (mouse fallback, bots, the demo's script); `hands.inject(null)` goes back to the camera.
- `hands.feed(clip, dtMs)` runs a list of frames through the engine at once (tests).
- `engine.setEnabled({ poses: ['fist', 'open'], motions: ['throw'], twoHand: [] })`: only listen for what your game
  uses. A disabled pose never wins classification, so it can't steal frames from the ones you use (turn OK off and an
  OK sign reads as pinch). `null` for a kind = all on; `setEnabled(null)` = everything on.
- `engine.registerPose({ id, name, hint, fingers: ['curl','curl','curl','curl','ext'], extra?(f) })`, finger rules
  `ext | curl | half | notcurl | notext | any`; `engine.registerMotion({ id, names, detect({ h, now, cfg, mem }) })`.
- `engine.catalog` lists every pose, motion and two-hand name (for a how-to-play screen); `MOTION_INFO` has names
  and hints for motions.
- Helpers: `new PinchClick()` -> `.update(h?.pinch)` is true on the frame a pinch starts (down at 0.72, up below
  0.42). `new Grip()` -> `.update(h.features.openness, t)` returns `{ type: 'close', kind: 'slow'|'frantic', durationMs }`
  or `{ type: 'open' }`. `new HoldZone(1.2, 0.25)` -> `.update(inside, dt)` true when held long enough; `.progress` for a ring.

Coordinates: everything is in mirrored selfie space, x right, y down, 0..1 of the camera image. `handedness` is
the player's real hand.

## Model and wasm (downloaded, not in this kit)

MediaPipe needs two things served next to your pages: its wasm runtime (from the npm package) and Google's
`hand_landmarker.task` model (7.8 MB). The model is **not committed**; `scripts/fetch-model.mjs` downloads it from
Google's official URL and checks it:

- URL: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`
- 7,819,105 bytes, SHA-256 `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1` (checked 2026-11-14)

No network: it warns and carries on; synthetic hands, mouse and touch still work, only the camera waits for it.

## Drop it into the starter

1. `node tools/blocks/add.mjs meticulai-hand-controls` (copies to `my-game/vendor/meticulai-hand-controls/`).
2. In `my-game/package.json`: add `"@mediapipe/tasks-vision": "1.1.0"` to `dependencies`, and scripts
   `"assets": "node vendor/meticulai-hand-controls/scripts/fetch-model.mjs --out public"`, `"predev": "npm run assets"`,
   `"prebuild": "npm run assets"`. Run `npm install` then `npm run assets` (creates `public/wasm/` and
   `public/models/hand_landmarker.task`; add both to `my-game/.gitignore`). Vite copies `public/` into the build,
   so the shipped zip contains them and works offline. In `vite.config.js` add
   `optimizeDeps: { exclude: ['@mediapipe/tasks-vision'] }`.
3. New file `my-game/src/game/hands.js` that turns hands into the starter's actions, so the rest of the game (and
   `?bot=1`) keeps reading `input`:

```js
import { createHands, toScreen, syntheticHand, SYNTHETIC_POSES, PinchClick, cameraProblem, PRIVACY_LINE } from '../../vendor/meticulai-hand-controls/src/index.js';

export function createHandInput({ input, ui }) {
  const hands = createHands();
  hands.engine.setEnabled({ poses: ['open', 'fist', 'pinch'], motions: ['throw', 'swipe-left', 'swipe-right'], twoHand: ['clap'] });
  const click = new PinchClick();
  hands.engine.on('clap', () => input.virtual.press('jump'));
  // a camera button with the privacy line (the starter's title screen is a good place for it)
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:20;font:14px system-ui;color:#fff';
  box.innerHTML = `<button>Play with my hands</button><div style="opacity:.75;margin-top:4px">${PRIVACY_LINE}</div>`;
  box.querySelector('button').onclick = () => hands.startCamera()
    .then(() => box.remove())
    .catch((e) => { box.lastChild.textContent = cameraProblem(e, 'the keyboard'); });
  document.body.append(box);
  return {
    hands,
    update() {                                  // call from the game's update(dt)
      if (hands.source !== 'camera') return;    // keyboard / touch / bot keep working as before
      const h = hands.frame.hands[0];
      if (!h) { input.virtual.setMove(0, 0); return; }
      const p = toScreen(h.features.center);    // palm left/right/up/down steers, centre = still
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
      input.virtual.setMove(dz((p.x - 0.5) * 2), dz((0.5 - p.y) * 2));
      if (click.update(h.pinch)) input.virtual.press('action');
    },
  };
}
```

   In `createGame(ctx)`: `const handInput = createHandInput(ctx);` and call `handInput.update()` at the top of
   `update(dt)`. Expose it for tests: `window.__hands = handInput.hands`.
4. Bots and recordings without a camera: under `?bot=1` drive hands instead of keys,
   `handInput.hands.inject((t) => [syntheticHand(0.5 + 0.2 * Math.sin(t / 900), 0.5, SYNTHETIC_POSES.open)])`, and
   change the `source !== 'camera'` check to also accept `'synthetic'`. That way `tools/play/record.mjs --bot`
   exercises the real gesture code.
5. Tests: copy the pattern in `test/gestures.test.mjs`: for every gesture your game asks for, a test that it is
   recognised from `syntheticHand` landmarks, plus a still-hand-with-jitter test that fires nothing.

The kit's headless browser has no webcam, so recordings show the fallback or synthetic hands. Ask the user to try it
with their real camera early: that is the only test of the thresholds that matters.

## The numbers that matter

All live in `engine.config` (pass any subset to `createHands({ config })`). These are the values every hands game
shipped with.

| Number | Default | Feel |
|---|---|---|
| `pose.enter` / `pose.exit` | 0.62 / 0.42 | hysteresis: a pose starts at 0.62 and holds until below 0.42, so it doesn't flicker |
| `pose.margin` | 0.08 | another pose must beat the current one by this to take over |
| `pose.debounceMs` | 70 | candidate must last this long (dropping to "no pose" waits 1.6x). Lower = snappier, more flicker |
| `smoothing.minCutoff` / `beta` | 2.2 Hz / 8 | One Euro on all 63 coordinates. Lower cutoff = steadier but laggier at rest; higher beta = less lag on fast moves |
| `motion.swipeDist` / `swipeMs` | 0.2 / 380 ms | a fifth of the frame in under 0.4 s. Raise `swipeDist` if players trigger swipes by accident |
| `motion.throwSpeed` | 1.1 screens/s | a fist that opens while moving at least this fast |
| `motion.pushRatio` | 1.28 | palm grows 28% within 450 ms while staying put |
| `motion.tapMs` / `doubleTapMs` | 350 / 550 | pinch closes above 0.75, opens below 0.4 (hysteresis), within 350 ms |
| `motion.holdMs` | 800 | a pose kept this long fires `hold` once |
| `motion.clapSpeed` / `clapDist` | 0.9 / 0.2 | open hands closing at 0.9 screens/s to within 0.2 |
| `motion.cooldownMs` | 650 | the same detector can't fire twice on one hand within this |
| `DEFAULT_REGION` | x 0.12-0.88, y 0.08-0.78 | the part of the camera image that maps to the whole screen |
| `PinchClick(on, off)` | 0.72 / 0.42 | pinch-as-click thresholds from the hub's cursor |
| `Grip` | open >= 0.6, closed < 0.4, frantic < 120 ms | a normal close is 250-500 ms; only a snatch counts as frantic |
| MediaPipe | detection 0.6, presence 0.5, tracking 0.5, 2 hands | `LANDMARKER_OPTIONS` in `tracker.js` |

Charitable tuning for a calm game: read `h.scores.fist > 0.5` instead of waiting for `pose === 'fist'`, widen hit
radii, lower `throwSpeed` a little. For a precision game, raise `enter` and `debounceMs`.

## What made it good in the hands games

- **One code path for every input.** Mouse, touch, bots and tests are turned into synthetic hands and go through
  the same engine as the camera. The builders had no webcam, so every game was built, tested and recorded this way:
  about 150 gesture tests across the games, and `?bot=1` runs that play the real game.
- **It held up with real hands.** The person who commissioned the games played most of them with a real webcam and
  called them "promising"; Fireflies (close your hand slowly around a firefly, the `Grip` close-speed measure here)
  was called "perfect". Show of Hands, a hall of 15 hand games, is live on meticulai.com on this engine.
- **Gesture switches were asked for.** Being able to turn gestures off (`setEnabled`) came from a request while
  testing: a game should only listen for the handful of gestures it teaches.
- **Measuring angles, not distances.** Finger curl is measured from joint angles on MediaPipe's world landmarks, so
  it doesn't care where the hand is, how far away, or how it's turned.
- **Hysteresis everywhere** (pose enter/exit, pinch on/off, grip open/closed, hold-zone grace): noisy tracking never
  makes the game chatter.

## Gotchas

- Thresholds were tuned mostly on synthetic hands; a person has played with them, but the numbers were never
  re-tuned against recorded real MediaPipe output. Expect to adjust per game after the first real try.
- Back-of-hand poses (`back`, `chop`) and `two`, `split` are experimental; they rely on MediaPipe's left/right
  label, which back views can fool. `config.pose.experimental = false` hides them.
- MediaPipe needs strictly increasing timestamps; the tracker handles it. Don't call `detectForVideo` yourself.
- A hidden browser tab or 0x0 window pauses animation frames; the loop then sees nothing. Skip drawing when the
  canvas is under 2 px (the demo does).
- MediaPipe uses the GPU too: keep the game's pixel ratio capped (2) and post-processing cheap.
- The first `startCamera()` downloads 7.8 MB of model and ~10 MB of wasm; show "Starting..." on the button.
- The `@mediapipe/tasks-vision` version and the copied `wasm/` must match: rerun `npm run assets` after upgrading it.

## Restyle it

`drawHand(ctx, landmarks, w, h, { color, lineWidth, jointRadius, map: toScreen })` is only a debug-looking
skeleton; for a game, draw your own hand (a glow at `h.features.center`, a ghost hand, a 3D hand from the 21 points)
and keep the skeleton for the small camera preview. Pose names and hints are plain data in `src/poses.js` and
`MOTION_INFO`; translate or rewrite them there.
