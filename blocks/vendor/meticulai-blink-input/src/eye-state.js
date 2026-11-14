// EyeState: the single source of truth for "can the player see the screen right now".
// Feed it a face tracker (camera), synthetic frames, the fallback key or a held button, call update() once per
// animation frame, and listen for events:
//   eyesClosed { time }                 eyesOpened { time, closedFor }
//   lookAwayStart { time, reason }      lookAwayEnd { time, awayFor }       reason: 'noFace' | 'headTurn'
//   blindStart { time }                 blindEnd { time, blindFor }        (closed OR looking away: use these for game logic)
//   trackingFailed { reason }           the camera/tracker died for good; EyeState has detached (fall back to keys)
// Times are in seconds (nowMs / 1000).

import { Emitter } from './emitter.js';
import { EYE_DEFAULTS } from './options.js';

/**
 * One processed face-tracking result (what FaceTracker.detect and SyntheticFace.detect return).
 * @typedef {object} FaceFrame
 * @property {boolean} faceDetected
 * @property {number} blinkLeft  0..1 (MediaPipe blendshape eyeBlinkLeft)
 * @property {number} blinkRight 0..1
 * @property {number} yawDeg     positive = head turned to the player's left
 * @property {number} pitchDeg
 * @property {number} irisX      raw horizontal iris offset, -1..1 in image space (not mirrored)
 * @property {{x:number,y:number,z?:number}[]} [landmarks] for drawing a preview
 */

/**
 * Per-player values measured by calibration.
 * @typedef {object} Calibration
 * @property {number} closeLeft  @property {number} closeRight
 * @property {number} openLeft   @property {number} openRight
 * @property {number} neutralYaw @property {number} neutralPitch @property {number} neutralIrisX
 */

/** @typedef {'left'|'center'|'right'|'unknown'} GazeZone */

/**
 * Anything with detect(video, nowMs) -> FaceFrame | null (null = no new video frame).
 * @typedef {{ detect(video: any, nowMs: number): FaceFrame | null }} Tracker
 */

/**
 * @param {{closeThreshold:number, openThreshold:number}} [o]
 * @returns {Calibration}
 */
export function defaultCalibration(o = EYE_DEFAULTS) {
  return {
    closeLeft: o.closeThreshold,
    closeRight: o.closeThreshold,
    openLeft: o.openThreshold,
    openRight: o.openThreshold,
    neutralYaw: 0,
    neutralPitch: 0,
    neutralIrisX: 0,
  };
}

/** @param {number} x @param {number} split @returns {GazeZone} */
export function gazeZone(x, split) {
  if (x < -split) return 'left';
  if (x > split) return 'right';
  return 'center';
}

const defaultIsHidden = () => typeof document !== 'undefined' && !!document.hidden;

export class EyeState extends Emitter {
  /** @param {Partial<import('./options.js').EyeOptions>} [options] */
  constructor(options = {}) {
    super();
    /** Live options: change any of them at any time. */
    this.o = { ...EYE_DEFAULTS, isHidden: defaultIsHidden, random: Math.random, ...options };
    /** @type {Calibration} */
    this.calibration = defaultCalibration(this.o);
    this.snapshot = {
      /** smoothed blink scores 0..1 */
      blinkLeft: 0,
      blinkRight: 0,
      faceDetected: false,
      yawDeg: 0,
      pitchDeg: 0,
      /** mirrored (if gazeMirror) and calibrated iris offset, -1..1 */
      gazeX: 0,
      /** @type {GazeZone} */
      gaze: 'unknown',
      eyesClosed: false,
      lookingAway: false,
      /** eyesClosed || lookingAway: the player cannot see the screen */
      blind: false,
      eyesClosedDuration: 0,
      blindDuration: 0,
      /** true while the fallback key / held button / a simulated blink closes the eyes */
      simulated: false,
      trackerFps: 0,
      /** @type {'camera'|'keyboard'} */
      source: 'keyboard',
    };
    /** Latest raw tracker frame (calibration samples these). @type {FaceFrame|null} */
    this.lastFrame = null;
    /** Set during play: simulated involuntary blinks when there is no camera. */
    this.autoBlink = false;

    /** @type {Tracker|null} */ this._tracker = null;
    this._video = null;
    this._keyHeld = false;
    this._buttonHeld = false;
    this._camClosed = false;
    this._lastDetectMs = -Infinity;
    this._noFaceSinceMs = 0;
    this._lastFrameMs = 0;
    this._closedSince = 0;
    this._blindSince = 0;
    this._awaySince = 0;
    /** @type {'noFace'|'headTurn'} */ this._awayReason = 'noFace';
    this._fpsCount = 0;
    this._fpsWindowStart = 0;
    this._detectFailures = 0;
    this._nextAutoBlinkMs = 0;
    this._autoBlinkUntilMs = 0;
    this._unbindKeys = null;
  }

  get hasCamera() {
    return this._tracker !== null;
  }

  /** @returns {'noFace'|'headTurn'} */
  get lookAwayReason() {
    return this._awayReason;
  }

  /**
   * Start reading a tracker (FaceTracker or SyntheticFace).
   * @param {Tracker} tracker @param {any} [video] the <video> the tracker reads @param {number} [nowMs]
   */
  attach(tracker, video = null, nowMs = now()) {
    this._tracker = tracker;
    this._video = video;
    this.snapshot.source = 'camera';
    this._noFaceSinceMs = 0;
    this._lastFrameMs = nowMs;
  }

  /** Give up on the camera: detach and emit 'trackingFailed' so the game drops to the fallback. @param {string} reason */
  fail(reason) {
    if (!this._tracker) return;
    console.warn(`[blink-input] tracking failed: ${reason}`);
    this.detach();
    this.emit('trackingFailed', { reason });
  }

  detach() {
    this._tracker = null;
    this._video = null;
    this.snapshot.source = 'keyboard';
    this.snapshot.faceDetected = false;
    this._camClosed = false;
    this._detectFailures = 0;
  }

  /**
   * Holding the fallback key (Space) closes the eyes. Returns an unbind function.
   * @param {EventTarget} [target] default window
   */
  bindKeyboard(target = globalThis.window) {
    if (this._unbindKeys || !target) return this._unbindKeys ?? (() => {});
    const down = (/** @type {KeyboardEvent} */ e) => {
      if (e.code === this.o.fallbackKey && this.o.spaceFallback) {
        e.preventDefault();
        this._keyHeld = true;
      }
    };
    const up = (/** @type {KeyboardEvent} */ e) => {
      if (e.code === this.o.fallbackKey) this._keyHeld = false;
    };
    const blur = () => (this._keyHeld = false);
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('blur', blur);
    this._unbindKeys = () => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', blur);
      this._unbindKeys = null;
    };
    return this._unbindKeys;
  }

  /** The fallback key, set from code (tests, bots). @param {boolean} held */
  setKeyHeld(held) {
    this._keyHeld = !!held;
  }

  /** A held on-screen button or touch counts as closed eyes (mouse/touch fallback). @param {boolean} held */
  setButtonHeld(held) {
    this._buttonHeld = !!held;
  }

  /**
   * Call once per animation frame.
   * @param {number} [nowMs] performance.now()-style milliseconds
   */
  update(nowMs = now()) {
    const s = this.snapshot;
    const o = this.o;
    const t = nowMs / 1000;

    // --- Face tracking (throttled) ---
    if (this._tracker && nowMs - this._lastDetectMs >= 1000 / o.detectFps - 1) {
      this._lastDetectMs = nowMs;
      /** @type {FaceFrame|null} */
      let frame = null;
      try {
        frame = this._tracker.detect(this._video, nowMs);
        this._detectFailures = 0;
      } catch (err) {
        if (this._detectFailures++ === 0) console.warn('[blink-input] detect failed', err);
        if (this._detectFailures > o.maxDetectFailures) this.fail('Face tracking stopped working.');
      }
      if (frame) this.feed(frame, nowMs);
    }
    if (nowMs - this._fpsWindowStart >= 1000) {
      s.trackerFps = (this._fpsCount * 1000) / (nowMs - this._fpsWindowStart || 1);
      this._fpsCount = 0;
      this._fpsWindowStart = nowMs;
    }

    // --- Looking away ---
    let away = false;
    let trackingLost = false;
    /** @type {'noFace'|'headTurn'} */
    let reason = 'noFace';
    if (this._tracker) {
      // Judge face loss from tracker results, not wall time, so slow trackers don't flicker.
      const stale = nowMs - this._lastFrameMs > o.staleTrackerMs; // video stalled / tab throttled
      const faceGone = this._noFaceSinceMs > 0 && nowMs - this._noFaceSinceMs >= o.lostFaceGraceMs;
      if (stale || faceGone) {
        away = true;
        trackingLost = true;
      } else if (
        Math.abs(s.yawDeg - this.calibration.neutralYaw) > o.lookAwayYawDeg ||
        Math.abs(s.pitchDeg - this.calibration.neutralPitch) > o.lookAwayPitchDeg
      ) {
        away = true;
        reason = 'headTurn';
      }
    }
    if (o.isHidden()) away = true;

    // --- Simulated involuntary blinks (no camera only) ---
    const auto = this._updateAutoBlink(nowMs);

    // --- Closed ---
    const held = this._keyHeld || this._buttonHeld;
    s.simulated = held || auto;
    // A head turn keeps the eye reading (closed stays closed); lost tracking can't tell, so it reads open.
    const closed = (this._tracker !== null && !trackingLost && this._camClosed) || held || auto;

    // --- Transitions ---
    if (closed !== s.eyesClosed) {
      s.eyesClosed = closed;
      if (closed) {
        this._closedSince = t;
        this.emit('eyesClosed', { time: t });
      } else {
        this.emit('eyesOpened', { time: t, closedFor: t - this._closedSince });
      }
    }
    if (away !== s.lookingAway) {
      s.lookingAway = away;
      if (away) {
        this._awaySince = t;
        this._awayReason = reason;
        this.emit('lookAwayStart', { time: t, reason });
      } else {
        this.emit('lookAwayEnd', { time: t, awayFor: t - this._awaySince });
      }
    }
    const blind = s.eyesClosed || s.lookingAway;
    if (blind !== s.blind) {
      s.blind = blind;
      if (blind) {
        this._blindSince = t;
        this.emit('blindStart', { time: t });
      } else {
        this.emit('blindEnd', { time: t, blindFor: t - this._blindSince });
      }
    }
    s.eyesClosedDuration = s.eyesClosed ? t - this._closedSince : 0;
    s.blindDuration = s.blind ? t - this._blindSince : 0;
    return s;
  }

  /**
   * Push one tracker frame in by hand (update() does this for an attached tracker).
   * @param {FaceFrame} f @param {number} [nowMs]
   */
  feed(f, nowMs = now()) {
    const s = this.snapshot;
    const o = this.o;
    this.lastFrame = f;
    this._lastFrameMs = nowMs;
    this._fpsCount++;
    s.faceDetected = f.faceDetected;
    if (!f.faceDetected) {
      if (this._noFaceSinceMs === 0) this._noFaceSinceMs = nowMs;
      s.gaze = 'unknown';
      return;
    }
    this._noFaceSinceMs = 0;

    const k = o.blinkSmoothing;
    s.blinkLeft = s.blinkLeft * k + f.blinkLeft * (1 - k);
    s.blinkRight = s.blinkRight * k + f.blinkRight * (1 - k);
    s.yawDeg = f.yawDeg;
    s.pitchDeg = f.pitchDeg;

    // Hysteresis: closing needs BOTH eyes past their close threshold;
    // reopening needs EITHER eye back under its open threshold.
    const c = this.calibration;
    if (!this._camClosed) {
      if (s.blinkLeft > c.closeLeft && s.blinkRight > c.closeRight) this._camClosed = true;
    } else if (s.blinkLeft < c.openLeft || s.blinkRight < c.openRight) {
      this._camClosed = false;
    }

    const raw = f.irisX - c.neutralIrisX;
    s.gazeX = o.gazeMirror ? -raw : raw;
    s.gaze = this._camClosed ? 'unknown' : gazeZone(s.gazeX, o.gazeZoneSplit);
  }

  /** @param {number} nowMs */
  _updateAutoBlink(nowMs) {
    const o = this.o;
    if (this._tracker || !this.autoBlink || !o.keyboardAutoBlink || this._keyHeld || this._buttonHeld) {
      this._nextAutoBlinkMs = 0;
      return false;
    }
    const rand = (/** @type {number} */ a, /** @type {number} */ b) => a + o.random() * (b - a);
    if (this._nextAutoBlinkMs === 0) this._nextAutoBlinkMs = nowMs + rand(o.autoBlinkIntervalMin, o.autoBlinkIntervalMax) * 1000;
    if (nowMs >= this._nextAutoBlinkMs) {
      this._autoBlinkUntilMs = nowMs + rand(o.autoBlinkMsMin, o.autoBlinkMsMax);
      this._nextAutoBlinkMs = nowMs + rand(o.autoBlinkIntervalMin, o.autoBlinkIntervalMax) * 1000;
    }
    return nowMs < this._autoBlinkUntilMs;
  }
}

function now() {
  return globalThis.performance ? performance.now() : Date.now();
}
