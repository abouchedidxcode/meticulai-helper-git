/**
 * The one-call setup: camera + MediaPipe + gesture engine, running every animation frame.
 *
 *   const hands = createHands({ onFrame: (frame) => draw(frame) });
 *   hands.engine.on('fist', (e) => e.phase === 'start' ? grab(e.hand) : release(e.hand));
 *   startButton.onclick = () => hands.startCamera();   // browsers want a click before the camera
 *
 * Without a camera (tests, demos, bots, mouse fallbacks) feed synthetic hands instead:
 *
 *   hands.inject([syntheticHand(0.5, 0.5, SYNTHETIC_POSES.point)]);   // held until inject(null)
 *   hands.inject((t) => [syntheticHand(...)]);                         // or a function of time (ms), called every frame
 *   hands.feed(clip);                                                  // or a scripted clip, run instantly
 */
import { GestureEngine } from './engine.js';
import { fromMediaPipe } from './mediapipe.js';
import { HandTracker } from './tracker.js';

/**
 * @typedef {import('./types.js').GestureFrame} GestureFrame
 * @typedef {import('./types.js').HandInput} HandInput
 * @typedef {import('./engine.js').EngineConfigInput} EngineConfigInput
 * @typedef {import('./tracker.js').TrackerOptions} TrackerOptions
 *
 * @typedef {TrackerOptions & {
 *   video?: HTMLVideoElement,
 *   engine?: GestureEngine,
 *   config?: EngineConfigInput,
 *   onFrame?: (frame: GestureFrame) => void,
 *   mirror?: boolean,
 * }} HandsOptions
 *   video: element for the camera (a hidden one is created if omitted). Show it mirrored: `transform: scaleX(-1)`.
 *   engine: engine to drive (default: a new GestureEngine with `config`).
 *   config: engine thresholds, e.g. `{ pose: { debounceMs: 50 } }`.
 *   onFrame: called with every new gesture frame (camera frames, injected hands and fed clips).
 *   mirror: selfie mirroring of camera landmarks (default true).
 *
 * @typedef {object} Hands
 * @property {GestureEngine} engine
 * @property {HandTracker} tracker
 * @property {HTMLVideoElement} video
 * @property {GestureFrame} frame The latest frame (same as engine.frame; current inside event listeners too).
 * @property {'none'|'camera'|'synthetic'} source Where frames currently come from.
 * @property {() => Promise<void>} startCamera Opens the camera and loads the model. Call from a click handler. Rejects if the camera is unavailable or denied.
 * @property {(hands: HandInput[] | ((tMs: number) => HandInput[]) | null) => void} inject Use these hands (or this function of time) every frame instead of the camera; null switches back.
 * @property {(clip: HandInput[][], dtMs?: number) => GestureFrame[]} feed Runs a scripted clip through the engine immediately, one entry per frame, `dtMs` apart.
 * @property {() => void} stop Stops the loop and the camera.
 */

/** @param {HandsOptions} [opts] @returns {Hands} */
export function createHands(opts = {}) {
  const video = opts.video ?? Object.assign(document.createElement('video'), { muted: true, playsInline: true });
  const engine = opts.engine ?? new GestureEngine(opts.config);
  const tracker = new HandTracker(video, opts);
  /** @type {HandInput[] | ((t: number) => HandInput[]) | null} */
  let injected = null;
  let camera = false;
  let offset = 0; // virtual time added by feed(), keeps engine time monotonic
  let lastT = -Infinity;
  let raf = 0;

  const step = (hands, t) => {
    t = Math.max(t + offset, lastT + 0.5);
    lastT = t;
    const frame = engine.update(hands, t);
    opts.onFrame?.(frame);
    return frame;
  };

  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (injected) { step(typeof injected === 'function' ? injected(now) : injected, now); return; }
    if (!camera) return;
    const det = tracker.detect(now);
    if (det) step(fromMediaPipe(det.hands, det.aspect, { mirror: opts.mirror ?? true }), det.frameTime);
  };
  raf = requestAnimationFrame(loop);

  return {
    engine, tracker, video,
    get frame() { return engine.frame; },
    get source() { return injected ? 'synthetic' : camera ? 'camera' : 'none'; },
    async startCamera() { await tracker.start(); camera = true; },
    inject(h) { injected = h; },
    feed(clip, dtMs = 1000 / 30) {
      return clip.map((hands) => { offset += dtMs; return step(hands, performance.now()); });
    },
    stop() { cancelAnimationFrame(raf); tracker.stop(); camera = false; },
  };
}

/**
 * Part of the camera image that maps onto the whole screen, so players don't have to reach the
 * frame edges.
 * @typedef {{x0:number, x1:number, y0:number, y1:number}} Region
 */
/** @type {Region} */
export const DEFAULT_REGION = Object.freeze({ x0: 0.12, x1: 0.88, y0: 0.08, y1: 0.78 });

/**
 * Camera-space point (0..1, mirrored, as in HandResult.features.center) -> screen 0..1, clamped.
 * @param {{x:number,y:number}} p @param {Region} [r]
 */
export function toScreen(p, r = DEFAULT_REGION) {
  const c = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  return { x: c((p.x - r.x0) / (r.x1 - r.x0)), y: c((p.y - r.y0) / (r.y1 - r.y0)) };
}

/**
 * Screen 0..1 -> camera space (inverse of toScreen, unclamped). Handy for aiming synthetic hands.
 * @param {{x:number,y:number}} p @param {Region} [r]
 */
export function fromScreen(p, r = DEFAULT_REGION) {
  return { x: r.x0 + p.x * (r.x1 - r.x0), y: r.y0 + p.y * (r.y1 - r.y0) };
}
