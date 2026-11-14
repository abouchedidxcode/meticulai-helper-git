// Every number the eye input uses, with the values the game shipped with.
// Pass your own to `new EyeState({ ... })` or `computeCalibration(open, closed, { ... })` to change them.

/**
 * @typedef {object} EyeOptions
 * @property {number} closeThreshold   Both eyeBlink scores must rise above this to count as closed (calibration overwrites it).
 * @property {number} openThreshold    Eyes count as open again once either eye's score falls below this (calibration overwrites it).
 * @property {number} blinkSmoothing   Exponential smoothing on blink scores (0 = none, 0.9 = heavy).
 * @property {number} lookAwayYawDeg   Head turned left/right beyond this (from the calibrated neutral) counts as looking away.
 * @property {number} lookAwayPitchDeg Head tilted up/down beyond this counts as looking away.
 * @property {number} lostFaceGraceMs  The face must be missing this long before it counts as looking away (filters dropped frames).
 * @property {number} staleTrackerMs   No tracker result for this long (camera stalled, tab throttled) counts as looking away.
 * @property {number} maxDetectFailures Tracker exceptions in a row before giving up on the camera ('trackingFailed').
 * @property {number} gazeZoneSplit    Iris offset (-1 far left .. 1 far right) that splits left / center / right.
 * @property {boolean} gazeMirror      Mirror gaze so "left" is the player's left as they see the screen.
 * @property {number} detectFps        Maximum face detection rate.
 * @property {boolean} spaceFallback   Holding the fallback key closes the eyes (always useful; required without a camera).
 * @property {string} fallbackKey      KeyboardEvent.code of the fallback key.
 * @property {boolean} keyboardAutoBlink Without a camera, blink for the player now and then while `autoBlink` is on.
 * @property {number} autoBlinkIntervalMin Seconds between simulated blinks (min).
 * @property {number} autoBlinkIntervalMax Seconds between simulated blinks (max).
 * @property {number} autoBlinkMsMin   Length of a simulated blink in ms (min).
 * @property {number} autoBlinkMsMax   Length of a simulated blink in ms (max).
 * @property {() => boolean} [isHidden] Is the page hidden? Default reads document.hidden. A hidden tab counts as looking away.
 * @property {() => number} [random]   Random source for simulated blinks (default Math.random).
 */

/** @type {EyeOptions} */
export const EYE_DEFAULTS = Object.freeze({
  closeThreshold: 0.45,
  openThreshold: 0.28,
  blinkSmoothing: 0.2,
  lookAwayYawDeg: 32,
  lookAwayPitchDeg: 28,
  lostFaceGraceMs: 200,
  staleTrackerMs: 1000,
  maxDetectFailures: 60,
  gazeZoneSplit: 0.22,
  gazeMirror: true,
  detectFps: 30,
  spaceFallback: true,
  fallbackKey: 'Space',
  keyboardAutoBlink: true,
  autoBlinkIntervalMin: 3.5,
  autoBlinkIntervalMax: 7.5,
  autoBlinkMsMin: 130,
  autoBlinkMsMax: 260,
});

/**
 * @typedef {object} CalibrationOptions
 * @property {number} sampleMs      How long each calibration phase samples.
 * @property {number} minFrames     Sampling continues (up to 3x sampleMs) until this many face frames were seen.
 * @property {number} settleMs      Settle time before sampling starts in each phase.
 * @property {number} closeFraction closeThreshold = open + (closed - open) * closeFraction.
 * @property {number} openFraction  openThreshold = open + (closed - open) * openFraction.
 * @property {number} minSeparation If closed - open is smaller than this, calibration is rejected.
 * @property {string} storageKey    localStorage key for the saved calibration (rename it per game).
 */

/** @type {CalibrationOptions} */
export const CALIBRATION_DEFAULTS = Object.freeze({
  sampleMs: 2500,
  minFrames: 16,
  settleMs: 900,
  closeFraction: 0.6,
  openFraction: 0.35,
  minSeparation: 0.15,
  storageKey: 'blink-input.calibration.v1',
});
