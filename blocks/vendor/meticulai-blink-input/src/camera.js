// Open the user-facing camera. Frames stay in a <video> element on this device; nothing is uploaded.

/** @typedef {'denied'|'notFound'|'inUse'|'insecure'|'unsupported'|'unknown'} CameraErrorKind */

export class CameraError extends Error {
  /** @param {CameraErrorKind} kind @param {string} message */
  constructor(kind, message) {
    super(message);
    this.name = 'CameraError';
    /** @type {CameraErrorKind} */
    this.kind = kind;
  }
}

/** Plain-words advice for each kind of camera error, to show the player next to the fallback controls. */
export const CAMERA_HELP = Object.freeze({
  denied: 'The camera was blocked. Click the camera icon in the address bar to allow it, or play with the keyboard.',
  notFound: 'No camera was found. Plug one in, or play with the keyboard.',
  inUse: 'Another app is using the camera. Close it and try again, or play with the keyboard.',
  insecure: 'The camera only works on https:// pages or on localhost.',
  unsupported: 'This browser cannot use the camera. Try a recent Chrome or Edge, or play with the keyboard.',
  unknown: 'The camera would not start. Try again, or play with the keyboard.',
});

/**
 * @typedef {object} CameraHandle
 * @property {MediaStream} stream
 * @property {HTMLVideoElement} video
 * @property {() => void} stop
 * @property {(fn: () => void) => void} onEnded fires if the camera disappears mid-game (unplugged, revoked)
 */

/**
 * Ask for the camera (one browser prompt) and wait for the first video frame.
 * @param {{ width?: number, height?: number, frameRate?: number }} [opts]
 * @returns {Promise<CameraHandle>}
 * @throws {CameraError}
 */
export async function openCamera({ width = 640, height = 480, frameRate = 30 } = {}) {
  if (!window.isSecureContext) {
    throw new CameraError('insecure', 'The camera needs a secure page (https:// or localhost).');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('unsupported', 'This browser does not support camera access.');
  }
  /** @type {MediaStream} */
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: frameRate } },
    });
  } catch (err) {
    const name = /** @type {any} */ (err)?.name ?? '';
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new CameraError('denied', 'Camera permission was denied.');
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new CameraError('notFound', 'No camera was found.');
    if (name === 'NotReadableError' || name === 'AbortError') throw new CameraError('inUse', 'The camera is in use by another application.');
    throw new CameraError('unknown', `Could not open the camera (${name || String(err)}).`);
  }

  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  video.srcObject = stream;
  await new Promise((resolve, reject) => {
    if (video.readyState >= 2) return resolve(undefined);
    const timer = setTimeout(() => {
      stream.getTracks().forEach((t) => t.stop());
      reject(new CameraError('unknown', 'The camera opened but sent no video.'));
    }, 10000);
    video.onloadeddata = () => {
      clearTimeout(timer);
      resolve(undefined);
    };
  });
  await video.play().catch(() => undefined);

  /** @type {(() => void)[]} */
  const endedHandlers = [];
  for (const track of stream.getVideoTracks()) {
    track.addEventListener('ended', () => endedHandlers.forEach((fn) => fn()));
  }

  return {
    stream,
    video,
    stop() {
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
    onEnded(fn) {
      endedHandlers.push(fn);
    },
  };
}
