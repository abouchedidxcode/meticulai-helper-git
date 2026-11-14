// Wraps MediaPipe Face Landmarker (Google, Apache-2.0). The model and the wasm runtime are served by
// your own site (run scripts/fetch-model.mjs); inference runs locally in the browser.

import { irisX, yawPitchFromMatrix } from './pose.js';

/** @typedef {import('./eye-state.js').FaceFrame} FaceFrame */

const NO_FACE = Object.freeze({ faceDetected: false, blinkLeft: 0, blinkRight: 0, yawDeg: 0, pitchDeg: 0, irisX: 0 });

export class FaceTracker {
  /** @param {any} landmarker @param {'GPU'|'CPU'} delegate */
  constructor(landmarker, delegate) {
    this.landmarker = landmarker;
    /** Which MediaPipe delegate ended up running. */
    this.delegate = delegate;
    this._lastVideoTime = -1;
  }

  /**
   * Load MediaPipe and the model. Tries the GPU delegate first, falls back to CPU.
   * Paths are relative to the page (the starter builds with base './').
   * @param {{ wasmPath?: string, modelPath?: string, confidence?: number }} [opts]
   * @returns {Promise<FaceTracker>}
   */
  static async create({ wasmPath = 'wasm', modelPath = 'models/face_landmarker.task', confidence = 0.5 } = {}) {
    // Loaded on demand: games that never turn the camera on never download it.
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const abs = (/** @type {string} */ p) => new URL(p, document.baseURI).href.replace(/\/$/, '');
    const fileset = await FilesetResolver.forVisionTasks(abs(wasmPath));
    const make = (/** @type {'GPU'|'CPU'} */ delegate) =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: abs(modelPath), delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: confidence,
        minFacePresenceConfidence: confidence,
        minTrackingConfidence: confidence,
      });
    try {
      return new FaceTracker(await make('GPU'), 'GPU');
    } catch (err) {
      console.warn('[blink-input] GPU delegate failed, falling back to CPU', err);
      return new FaceTracker(await make('CPU'), 'CPU');
    }
  }

  /**
   * Run detection on the current video frame. Returns null if the video has no new frame.
   * @param {HTMLVideoElement} video @param {number} nowMs
   * @returns {FaceFrame|null}
   */
  detect(video, nowMs) {
    if (!video || video.readyState < 2 || video.currentTime === this._lastVideoTime) return null;
    this._lastVideoTime = video.currentTime;
    const res = this.landmarker.detectForVideo(video, nowMs);
    return frameFromResult(res);
  }

  close() {
    this.landmarker.close();
  }
}

/**
 * Turn a FaceLandmarkerResult into a FaceFrame (exported so you can test with recorded results).
 * @param {any} res
 * @returns {FaceFrame}
 */
export function frameFromResult(res) {
  const lm = res.faceLandmarks?.[0];
  const shapes = res.faceBlendshapes?.[0]?.categories;
  if (!lm || !shapes) return { ...NO_FACE };

  let blinkLeft = 0;
  let blinkRight = 0;
  for (const c of shapes) {
    if (c.categoryName === 'eyeBlinkLeft') blinkLeft = c.score;
    else if (c.categoryName === 'eyeBlinkRight') blinkRight = c.score;
  }

  let yawDeg = 0;
  let pitchDeg = 0;
  const m = res.facialTransformationMatrixes?.[0];
  if (m) ({ yawDeg, pitchDeg } = yawPitchFromMatrix(m.data));

  return { faceDetected: true, blinkLeft, blinkRight, yawDeg, pitchDeg, irisX: irisX(lm), landmarks: lm };
}
