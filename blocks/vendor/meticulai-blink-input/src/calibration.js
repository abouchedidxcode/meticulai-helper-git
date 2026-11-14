// Calibration: sample a few seconds of "eyes open, looking at the screen", then a few seconds of
// "eyes closed", and put each eye's close/open thresholds between the player's own values.
// Natural open values sit low but squints spike, so "open" is the 90th percentile; closed values vary
// less, so "closed" is the median. Head pose and gaze while looking normally become the neutral.

import { CALIBRATION_DEFAULTS, EYE_DEFAULTS } from './options.js';
import { defaultCalibration } from './eye-state.js';

/** @typedef {import('./eye-state.js').FaceFrame} FaceFrame */
/** @typedef {import('./eye-state.js').Calibration} Calibration */
/** @typedef {{ openLeft:number, openRight:number, closedLeft:number, closedRight:number }} MeasuredValues */
/**
 * @typedef {{ ok: true, calibration: Calibration, measured: MeasuredValues }
 *         | { ok: false, reason: string, measured?: MeasuredValues }} CalibrationResult
 */

/**
 * Value at fraction p (0..1) of the sorted values (nearest rank).
 * @param {number[]} values @param {number} p
 */
export function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * Turn sampled open-eye and closed-eye frames into per-eye thresholds + neutral head pose.
 * @param {FaceFrame[]} openFrames @param {FaceFrame[]} closedFrames
 * @param {Partial<import('./options.js').CalibrationOptions>} [options]
 * @param {{closeThreshold:number, openThreshold:number}} [eyeDefaults] used for the untouched fields
 * @returns {CalibrationResult}
 */
export function computeCalibration(openFrames, closedFrames, options = {}, eyeDefaults = EYE_DEFAULTS) {
  const o = { ...CALIBRATION_DEFAULTS, ...options };
  const open = openFrames.filter((f) => f.faceDetected);
  const closed = closedFrames.filter((f) => f.faceDetected);
  if (open.length < o.minFrames / 2) return { ok: false, reason: "Couldn't see your face while your eyes were open. Check lighting and framing." };
  if (closed.length < o.minFrames / 2) return { ok: false, reason: 'Lost your face while your eyes were closed. Keep your head still and facing the screen.' };

  /** @type {MeasuredValues} */
  const measured = {
    openLeft: percentile(open.map((f) => f.blinkLeft), 0.9),
    openRight: percentile(open.map((f) => f.blinkRight), 0.9),
    closedLeft: percentile(closed.map((f) => f.blinkLeft), 0.5),
    closedRight: percentile(closed.map((f) => f.blinkRight), 0.5),
  };

  const sepL = measured.closedLeft - measured.openLeft;
  const sepR = measured.closedRight - measured.openRight;
  if (sepL < o.minSeparation || sepR < o.minSeparation) {
    return {
      ok: false,
      measured,
      reason: 'Open and closed eyes looked too similar. Try more light on your face, and close your eyes fully.',
    };
  }

  const cal = defaultCalibration(eyeDefaults);
  cal.closeLeft = measured.openLeft + sepL * o.closeFraction;
  cal.closeRight = measured.openRight + sepR * o.closeFraction;
  cal.openLeft = measured.openLeft + sepL * o.openFraction;
  cal.openRight = measured.openRight + sepR * o.openFraction;
  cal.neutralYaw = percentile(open.map((f) => f.yawDeg), 0.5);
  cal.neutralPitch = percentile(open.map((f) => f.pitchDeg), 0.5);
  cal.neutralIrisX = percentile(open.map((f) => f.irisX), 0.5);
  return { ok: true, calibration: cal, measured };
}

/**
 * Collect the raw tracker frames an EyeState sees for `ms` (keeps sampling up to 3x as long on slow
 * machines until `minFrames` face frames arrived). Needs eyeState.update() to keep running elsewhere.
 * @param {import('./eye-state.js').EyeState} eyeState
 * @param {number} ms @param {number} minFrames
 * @param {(p: number) => void} [onProgress] 0..1
 * @returns {Promise<FaceFrame[]>}
 */
export function sampleFrames(eyeState, ms, minFrames, onProgress = () => {}) {
  return new Promise((resolve) => {
    /** @type {FaceFrame[]} */
    const frames = [];
    const start = performance.now();
    /** @type {FaceFrame|null} */
    let last = null;
    const tick = () => {
      const f = eyeState.lastFrame;
      if (f && f !== last) {
        frames.push(f);
        last = f;
      }
      const elapsed = performance.now() - start;
      const faces = frames.filter((fr) => fr.faceDetected).length;
      onProgress(Math.min(1, Math.min(elapsed / ms, faces / minFrames)));
      if ((elapsed >= ms && faces >= minFrames) || elapsed >= ms * 3) resolve(frames);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * The whole calibration sequence without any UI: settle, sample open eyes, tell the game to ask for
 * closed eyes (play a tone there), settle, sample closed eyes, compute. On success it sets
 * eyeState.calibration and saves it. Show your own words and progress bar from the callbacks.
 * @param {import('./eye-state.js').EyeState} eyeState
 * @param {{ options?: Partial<import('./options.js').CalibrationOptions>,
 *           onPhase?: (phase: 'open'|'closed'|'done') => void,
 *           onProgress?: (p: number) => void, save?: boolean }} [opts]
 * @returns {Promise<CalibrationResult>}
 */
export async function calibrate(eyeState, { options = {}, onPhase = () => {}, onProgress = () => {}, save = true } = {}) {
  const o = { ...CALIBRATION_DEFAULTS, ...options };
  const wait = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
  onPhase('open');
  await wait(o.settleMs);
  const open = await sampleFrames(eyeState, o.sampleMs, o.minFrames, onProgress);
  onPhase('closed');
  onProgress(0);
  await wait(o.settleMs);
  const closed = await sampleFrames(eyeState, o.sampleMs, o.minFrames, onProgress);
  onPhase('done');
  const result = computeCalibration(open, closed, o, eyeState.o);
  if (result.ok) {
    eyeState.calibration = result.calibration;
    if (save) saveCalibration(result.calibration, o.storageKey);
  }
  return result;
}

/**
 * @param {string} [storageKey]
 * @param {{closeThreshold:number, openThreshold:number}} [eyeDefaults]
 * @returns {Calibration|null} null when nothing (valid) is saved
 */
export function loadCalibration(storageKey = CALIBRATION_DEFAULTS.storageKey, eyeDefaults = EYE_DEFAULTS) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const cal = { ...defaultCalibration(eyeDefaults), ...JSON.parse(raw) };
    if (cal.openLeft >= cal.closeLeft || cal.openRight >= cal.closeRight) return null;
    return cal;
  } catch {
    return null;
  }
}

/** @param {Calibration} cal @param {string} [storageKey] */
export function saveCalibration(cal, storageKey = CALIBRATION_DEFAULTS.storageKey) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(cal));
  } catch {
    /* storage unavailable: calibration just won't persist */
  }
}

/** @param {string} [storageKey] */
export function clearCalibration(storageKey = CALIBRATION_DEFAULTS.storageKey) {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}
