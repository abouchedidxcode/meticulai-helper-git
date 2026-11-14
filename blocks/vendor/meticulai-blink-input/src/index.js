// meticulai-blink-input: the webcam as a controller. Eyes closed, looking away and a coarse
// left/centre/right gaze, with per-player calibration and keyboard / mouse / no-camera fallbacks.
// From Don't Blink by Meticulai (meticulai.com). MIT.

export { EyeState, defaultCalibration, gazeZone } from './eye-state.js';
export { EYE_DEFAULTS, CALIBRATION_DEFAULTS } from './options.js';
export { computeCalibration, percentile, calibrate, sampleFrames, loadCalibration, saveCalibration, clearCalibration } from './calibration.js';
export { openCamera, CameraError, CAMERA_HELP } from './camera.js';
export { FaceTracker, frameFromResult } from './face-tracker.js';
export { SyntheticFace, DEFAULT_SCRIPT } from './synthetic.js';
export { yawPitchFromMatrix, irisOffset, irisX } from './pose.js';
export { drawFacePreview, drawCartoonFace } from './face-preview.js';

import { openCamera, CameraError } from './camera.js';
import { FaceTracker } from './face-tracker.js';
import { loadCalibration } from './calibration.js';
import { CALIBRATION_DEFAULTS } from './options.js';

/**
 * One call from a click handler: open the camera, load the model, attach it to the EyeState, load a
 * saved calibration, and fall back cleanly if the camera dies later (the EyeState emits
 * 'trackingFailed' and keeps working on the keyboard / held-button fallback).
 * Call it from a button the player clicked (browsers only show the camera prompt after a click).
 * @param {import('./eye-state.js').EyeState} eyeState
 * @param {{ wasmPath?: string, modelPath?: string, storageKey?: string,
 *           onStatus?: (text: string) => void }} [opts]
 * @returns {Promise<{ ok: true, video: HTMLVideoElement, tracker: FaceTracker, stop: () => void }
 *                 | { ok: false, error: CameraError }>}
 */
export async function startCamera(eyeState, { wasmPath, modelPath, storageKey = CALIBRATION_DEFAULTS.storageKey, onStatus = () => {} } = {}) {
  /** @type {Awaited<ReturnType<typeof openCamera>> | null} */
  let cam = null;
  try {
    onStatus('Opening the camera...');
    cam = await openCamera();
    onStatus('Loading face tracking...');
    const tracker = await FaceTracker.create({ wasmPath, modelPath });
    eyeState.attach(tracker, cam.video);
    const saved = loadCalibration(storageKey, eyeState.o);
    if (saved) eyeState.calibration = saved;
    const handle = cam;
    handle.onEnded(() => eyeState.fail('The camera was disconnected.'));
    onStatus(`Face tracking ready (${tracker.delegate}).`);
    return {
      ok: true,
      video: handle.video,
      tracker,
      stop() {
        eyeState.detach();
        tracker.close();
        handle.stop();
      },
    };
  } catch (err) {
    cam?.stop();
    const error = err instanceof CameraError ? err : new CameraError('unknown', `Face tracking would not start (${/** @type {any} */ (err)?.message ?? err}).`);
    onStatus(error.message);
    return { ok: false, error };
  }
}
