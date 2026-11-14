/**
 * Webcam + MediaPipe HandLandmarker (VIDEO mode). Produces raw MediaPipe detections; pass them
 * through `fromMediaPipe()` before feeding the GestureEngine (it mirrors them into selfie space).
 *
 * - WASM fileset from `<assetBase>/wasm/`, model from `<assetBase>/models/hand_landmarker.task`
 *   (both resolved against document.baseURI, so it works under any deploy path). Both are put there
 *   by `scripts/fetch-model.mjs` (the model is downloaded from Google, never committed).
 * - GPU delegate with automatic CPU fallback (at creation, and if the GPU graph keeps throwing at runtime).
 * - Detection runs at most once per *new* video frame (video.currentTime changed), so a 120 Hz
 *   render loop doesn't re-run the model on the same 30 Hz frame.
 * - The MediaPipe module is imported lazily so mouse-only / test builds never load it.
 */

/**
 * A landmark as MediaPipe reports it: x, y in 0..1 of the (un-mirrored) camera image, z relative depth.
 * @typedef {{x:number, y:number, z:number}} RawLandmark
 *
 * One detection as it comes out of MediaPipe (un-mirrored camera image).
 * @typedef {object} RawHand
 * @property {RawLandmark[]} landmarks
 * @property {'Left'|'Right'} label MediaPipe's handedness label. It assumes a mirrored image, so for
 *   a raw camera frame it is the opposite of the user's real hand; fromMediaPipe() fixes that.
 * @property {number} score Handedness score 0..1.
 * @property {RawLandmark[]} [world] MediaPipe world landmarks: metres, origin at the hand's centre, un-mirrored.
 *
 * @typedef {object} TrackerOptions
 * @property {string} [assetBase] Where `wasm/` and `models/hand_landmarker.task` are served from. Default: the page's own directory.
 * @property {number} [numHands] Max hands to track (default 2).
 * @property {MediaStreamConstraints} [camera] Camera constraints (default: front camera, 1280x720, 60 fps ideal).
 *
 * @typedef {object} DetectionFrame
 * @property {RawHand[]} hands
 * @property {number} frameTime Capture time of the processed frame (performance.now() base, ms).
 * @property {number} aspect Video width / height.
 */

/** @type {MediaStreamConstraints} */
export const CAMERA_CONSTRAINTS = {
  audio: false,
  video: {
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 60 },
  },
};

/** MediaPipe thresholds the hands games shipped with. */
export const LANDMARKER_OPTIONS = {
  runningMode: 'VIDEO',
  numHands: 2,
  minHandDetectionConfidence: 0.6,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

/** Consecutive detectForVideo failures on GPU before rebuilding on CPU. */
const GPU_FAILURES_BEFORE_FALLBACK = 3;

function assetUrl(path, assetBase) {
  const page = typeof document !== 'undefined' ? document.baseURI : globalThis.location?.href ?? '/';
  const base = assetBase ? new URL(assetBase.endsWith('/') ? assetBase : assetBase + '/', page).href : page;
  return new URL(path, base).href.replace(/\/$/, '');
}

export class HandTracker {
  /** @param {HTMLVideoElement} video @param {TrackerOptions} [options] */
  constructor(video, options = {}) {
    this.video = video;
    this.options = options;
    /** @type {'GPU'|'CPU'|null} */
    this.delegate = null;
    /** Detections per second (measured over ~0.5 s windows). */
    this.fps = 0;
    /** Called if the camera track ends (unplugged, permission revoked...). @type {(() => void)|null} */
    this.onEnded = null;

    this._landmarker = null;
    this._fileset = null;
    /** @type {MediaStream|null} */
    this._stream = null;
    this._lastVideoTime = -1;
    this._lastTs = 0;
    this._lastFrameTime = 0;
    this._failures = 0;
    this._rebuilding = false;
    this._fpsCount = 0;
    this._fpsWindowStart = 0;
    this._rvfcHandle = 0;
    this._rvfcTime = NaN;
    this._lastRvfcUsed = NaN;
    this._lastDetectNow = 0;
    this._stopped = false;
  }

  /** Opens the camera and loads the model in parallel. Throws on failure (see cameraProblem()). */
  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw Object.assign(new Error('Camera API unavailable (insecure context or unsupported browser)'), { name: 'NotSupportedError' });
    }
    this._stopped = false; // a retry after a failed start (or after stop()) must run normally
    const camera = this._openCamera();
    const model = this._createLandmarker();
    // Don't leave a dangling rejection if one side fails first.
    const [camRes, modelRes] = await Promise.allSettled([camera, model]);
    if (camRes.status === 'rejected' || modelRes.status === 'rejected') {
      this.stop();
      if (modelRes.status === 'fulfilled') modelRes.value.close();
      throw camRes.status === 'rejected' ? camRes.reason : modelRes.reason;
    }
    this._landmarker = modelRes.value;
    this._watchFrames();
  }

  async _openCamera() {
    const stream = await navigator.mediaDevices.getUserMedia(this.options.camera ?? CAMERA_CONSTRAINTS);
    this._stream = stream;
    for (const track of stream.getVideoTracks()) {
      track.addEventListener('ended', () => { if (!this._stopped) this.onEnded?.(); });
    }
    const v = this.video;
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.srcObject = stream;
    if (v.readyState < 2) {
      await new Promise((resolve, reject) => {
        const ok = () => { cleanup(); resolve(); };
        const bad = () => { cleanup(); reject(new Error('Video element failed to load the camera stream')); };
        const cleanup = () => { v.removeEventListener('loadeddata', ok); v.removeEventListener('error', bad); };
        v.addEventListener('loadeddata', ok);
        v.addEventListener('error', bad);
      });
    }
    await v.play().catch(() => { /* autoplay of a muted stream normally succeeds; detection still works on a paused-but-loaded frame */ });
  }

  async _createLandmarker(cpuOnly = false) {
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    if (!this._fileset) this._fileset = await FilesetResolver.forVisionTasks(assetUrl('wasm', this.options.assetBase));
    const make = (delegate) => HandLandmarker.createFromOptions(this._fileset, {
      ...LANDMARKER_OPTIONS,
      numHands: this.options.numHands ?? LANDMARKER_OPTIONS.numHands,
      baseOptions: { modelAssetPath: assetUrl('models/hand_landmarker.task', this.options.assetBase), delegate },
    });
    if (!cpuOnly) {
      try {
        const lm = await make('GPU');
        this.delegate = 'GPU';
        return lm;
      } catch (err) {
        console.warn('[hand-controls] GPU delegate unavailable, falling back to CPU:', err);
      }
    }
    const lm = await make('CPU');
    this.delegate = 'CPU';
    return lm;
  }

  /** Records the capture time of each presented frame (more accurate than rAF time). */
  _watchFrames() {
    const v = this.video;
    if (!v.requestVideoFrameCallback) return;
    const cb = (now, meta) => {
      if (this._stopped) return;
      const t = meta.captureTime ?? meta.expectedDisplayTime ?? now;
      this._rvfcTime = Number.isFinite(t) ? t : now;
      this._rvfcHandle = v.requestVideoFrameCallback(cb);
    };
    this._rvfcHandle = v.requestVideoFrameCallback(cb);
  }

  get running() { return !!this._landmarker && !this._stopped; }

  /** Runs the model if a new video frame is available; null otherwise. @param {number} now @returns {DetectionFrame|null} */
  detect(now) {
    const v = this.video, lm = this._landmarker;
    if (!lm || this._rebuilding || v.readyState < 2 || !v.videoWidth || !v.videoHeight) return null;
    const ct = v.currentTime;
    if (ct === this._lastVideoTime) return null;
    this._lastVideoTime = ct;

    // MediaPipe requires strictly increasing timestamps.
    const ts = Math.max(now, this._lastTs + 1);
    this._lastTs = ts;
    let res;
    try {
      res = lm.detectForVideo(v, ts);
      this._failures = 0;
    } catch (err) {
      this._onDetectError(err);
      return null;
    }

    // FPS over ~0.5 s windows.
    this._fpsCount++;
    if (!this._fpsWindowStart) this._fpsWindowStart = now;
    const span = now - this._fpsWindowStart;
    if (span >= 500) {
      const inst = (this._fpsCount * 1000) / span;
      this.fps = this.fps ? this.fps * 0.5 + inst * 0.5 : inst;
      this._fpsCount = 0;
      this._fpsWindowStart = now;
    }

    /** @type {RawHand[]} */
    const hands = [];
    for (let i = 0; i < res.landmarks.length; i++) {
      const lms = res.landmarks[i];
      if (!lms || lms.length < 21) continue;
      const cat = res.handedness[i]?.[0];
      hands.push({
        landmarks: lms.map((p) => ({ x: p.x, y: p.y, z: p.z })),
        world: res.worldLandmarks?.[i]?.map((p) => ({ x: p.x, y: p.y, z: p.z })),
        label: cat?.categoryName === 'Left' ? 'Left' : 'Right',
        score: cat?.score ?? 0.5,
      });
    }

    // Prefer the frame's capture time; if the frame callback hasn't reported this frame (or isn't
    // supported), advance by wall-clock delta so the time base never mixes.
    let frameTime;
    if (Number.isFinite(this._rvfcTime) && this._rvfcTime !== this._lastRvfcUsed) {
      frameTime = this._rvfcTime;
      this._lastRvfcUsed = this._rvfcTime;
    } else {
      frameTime = this._lastFrameTime ? this._lastFrameTime + (now - this._lastDetectNow) : now;
    }
    if (frameTime <= this._lastFrameTime) frameTime = this._lastFrameTime + 1;
    this._lastFrameTime = frameTime;
    this._lastDetectNow = now;
    return { hands, frameTime, aspect: v.videoWidth / v.videoHeight };
  }

  _onDetectError(err) {
    this._failures++;
    if (this._failures === 1) console.warn('[hand-controls] hand detection failed:', err);
    if (this.delegate === 'GPU' && this._failures >= GPU_FAILURES_BEFORE_FALLBACK && !this._rebuilding) {
      this._rebuilding = true;
      const old = this._landmarker;
      this._createLandmarker(true)
        .then((lm) => { if (this._stopped) lm.close(); else { this._landmarker = lm; old?.close(); } })
        .catch((e) => console.error('[hand-controls] CPU fallback failed:', e))
        .finally(() => { this._rebuilding = false; this._failures = 0; });
    }
  }

  stop() {
    this._stopped = true;
    const v = this.video;
    if (this._rvfcHandle && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(this._rvfcHandle);
    this._stream?.getTracks().forEach((t) => t.stop());
    this._stream = null;
    this._landmarker?.close();
    this._landmarker = null;
  }
}
