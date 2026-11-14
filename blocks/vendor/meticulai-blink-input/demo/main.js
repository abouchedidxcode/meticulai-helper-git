// Demo: live eye state with your camera, or a synthetic face with ?synthetic=1 (no camera at all).
import {
  EyeState, SyntheticFace, startCamera, calibrate, drawFacePreview, drawCartoonFace, CAMERA_HELP,
} from '../src/index.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const view = /** @type {HTMLCanvasElement} */ ($('view'));
const params = new URLSearchParams(location.search);

const eyes = new EyeState({ isHidden: () => false }); // the demo keeps reading when its tab is in the background
eyes.bindKeyboard();
/** @type {'none'|'camera'|'synthetic'} */
let mode = 'none';
/** @type {HTMLVideoElement|null} */
let video = null;
/** @type {SyntheticFace|null} */
let synth = null;

// --- event log -------------------------------------------------------------------------------
const log = $('log');
const entries = [];
const t0 = performance.now();
function write(type, data) {
  const t = (performance.now() - t0) / 1000;
  entries.push({ t, type, data });
  const line = `${t.toFixed(2).padStart(6)}  ${type.padEnd(13)} ${data ? JSON.stringify(data, (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)) : ''}`;
  log.textContent = `${line}\n${log.textContent}`.split('\n').slice(0, 80).join('\n');
}
for (const type of ['eyesClosed', 'eyesOpened', 'lookAwayStart', 'lookAwayEnd', 'blindStart', 'blindEnd', 'trackingFailed']) {
  eyes.on(type, (p) => write(type, p));
}
eyes.on('trackingFailed', () => {
  mode = 'none';
  $('status').textContent = 'The camera stopped. Hold Space, or the button below, to close your eyes.';
});
/** @type {any} */ (window).__blink = { eyes, entries };

// --- buttons ---------------------------------------------------------------------------------
const status = (/** @type {string} */ s) => ($('status').textContent = s);

$('cam').addEventListener('click', async () => {
  stopSynthetic();
  const res = await startCamera(eyes, { onStatus: status });
  if (!res.ok) {
    status(CAMERA_HELP[res.error.kind] ?? res.error.message);
    return;
  }
  video = res.video;
  mode = 'camera';
  /** @type {HTMLButtonElement} */ ($('calib')).disabled = false;
  write('status', { tracker: res.tracker.delegate });
});

$('synth').addEventListener('click', startSynthetic);

function startSynthetic() {
  synth = new SyntheticFace({ startMs: performance.now() });
  eyes.attach(synth);
  mode = 'synthetic';
  /** @type {HTMLButtonElement} */ ($('calib')).disabled = false;
  status('Synthetic face: a scripted player blinks, closes their eyes, turns away and leaves the frame.');
}

function stopSynthetic() {
  if (mode === 'synthetic') eyes.detach();
  synth = null;
}

$('calib').addEventListener('click', async () => {
  const btn = /** @type {HTMLButtonElement} */ ($('calib'));
  btn.disabled = true;
  const result = await calibrate(eyes, {
    onPhase(phase) {
      if (phase === 'open') { synth?.hold('open'); status('Look at the screen normally. Blink as you usually would.'); }
      if (phase === 'closed') { synth?.hold('closed'); beep(440, 0.26); status('Close your eyes now. Keep them closed until the second, higher tone.'); }
      if (phase === 'done') { synth?.hold(null); beep(880, 0.32); }
    },
    onProgress: (p) => (btn.textContent = `Calibrating ${Math.round(p * 100)}%`),
  });
  btn.textContent = 'Calibrate';
  btn.disabled = false;
  if (result.ok) {
    status('Calibrated to your eyes. Blink a few times: each blink should show up in the events.');
    write('calibrated', result.measured);
  } else {
    status(result.reason);
  }
});

// Mouse / touch fallback: hold the button to close your eyes.
const hold = $('hold');
hold.addEventListener('pointerdown', (e) => { hold.setPointerCapture(e.pointerId); eyes.setButtonHeld(true); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) hold.addEventListener(ev, () => eyes.setButtonHeld(false));

/** A short tone made in code (calibration cues for players with their eyes shut). */
let audio = null;
function beep(freq, seconds) {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, audio.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + seconds);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + seconds + 0.05);
  } catch { /* no audio: fine */ }
}

// --- per frame -------------------------------------------------------------------------------
const pct = (/** @type {number} */ v) => `${(Math.max(0, Math.min(1, v)) * 100).toFixed(1)}%`;
function frame() {
  const s = eyes.update();
  const c = eyes.calibration;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const cw = Math.round(view.clientWidth * dpr);
  const ch = Math.round(view.clientHeight * dpr);
  if (cw > 0 && (view.width !== cw || view.height !== ch)) { view.width = cw; view.height = ch; }

  if (mode === 'camera') drawFacePreview(view, video, eyes.lastFrame, s.eyesClosed);
  else if (mode === 'synthetic') drawCartoonFace(view, s, { closed: s.eyesClosed, away: s.lookingAway });
  else {
    const lid = s.eyesClosed ? 0.8 : 0.05; // keyboard / button: the drawn face follows the fallback
    drawCartoonFace(view, { ...s, faceDetected: true, blinkLeft: lid, blinkRight: lid }, { closed: s.eyesClosed });
  }

  $('fillL').style.width = pct(s.blinkLeft);
  $('fillR').style.width = pct(s.blinkRight);
  $('fillL').classList.toggle('closed', s.eyesClosed);
  $('fillR').classList.toggle('closed', s.eyesClosed);
  $('closeL').style.left = pct(c.closeLeft);
  $('openL').style.left = pct(c.openLeft);
  $('closeR').style.left = pct(c.closeRight);
  $('openR').style.left = pct(c.openRight);
  $('cClosed').classList.toggle('on', s.eyesClosed);
  $('cAway').classList.toggle('on', s.lookingAway);
  $('cAway').textContent = s.lookingAway ? `looking away (${eyes.lookAwayReason === 'headTurn' ? 'head turned' : 'no face'})` : 'looking away';
  $('cBlind').classList.toggle('on', s.blind);
  $('cSource').textContent = mode === 'synthetic' ? 'synthetic face' : mode === 'camera' ? 'camera' : 'keyboard / button';
  $('cSource').classList.toggle('ok', mode !== 'none');
  $('gL').classList.toggle('on', s.gaze === 'left');
  $('gC').classList.toggle('on', s.gaze === 'center');
  $('gR').classList.toggle('on', s.gaze === 'right');
  $('nums').textContent = `yaw ${s.yawDeg.toFixed(0)}  pitch ${s.pitchDeg.toFixed(0)}  gaze ${s.gazeX.toFixed(2)}  tracker ${s.trackerFps.toFixed(0)} fps` +
    (s.blind ? `  blind ${s.blindDuration.toFixed(1)} s` : '');

  const big = $('big');
  big.textContent = s.lookingAway ? 'LOOKING AWAY' : s.eyesClosed ? 'EYES CLOSED' : 'EYES OPEN';
  big.style.color = s.blind ? '#ff6b6b' : '#7dff8a';
  $('step').textContent = mode === 'synthetic' && synth ? `synthetic: ${synth.step.label ?? ''}` : '';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (params.has('synthetic')) startSynthetic();
