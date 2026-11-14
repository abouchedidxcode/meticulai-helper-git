import test from 'node:test';
import assert from 'node:assert/strict';
import { EyeState, defaultCalibration } from '../src/eye-state.js';
import { EYE_DEFAULTS } from '../src/options.js';
import { SyntheticFace } from '../src/synthetic.js';

const face = (l, r, extra = {}) => ({ faceDetected: true, blinkLeft: l, blinkRight: r, yawDeg: 0, pitchDeg: 0, irisX: 0, ...extra });
const NOFACE = { faceDetected: false, blinkLeft: 0, blinkRight: 0, yawDeg: 0, pitchDeg: 0, irisX: 0 };

/** A tracker that returns a queue of frames, one per detect(). */
function scripted(frames) {
  let i = 0;
  return { detect: () => (i < frames.length ? frames[i++] : frames[frames.length - 1]) };
}

/** Run an EyeState at 30 Hz with a function giving the frame at time t (ms). Returns the event log. */
function run(es, frameAt, fromMs, toMs, stepMs = 1000 / 30) {
  const tracker = { detect: (_v, t) => frameAt(t) };
  es._tracker = tracker; // already attached by the caller
  const log = [];
  for (const type of ['eyesClosed', 'eyesOpened', 'lookAwayStart', 'lookAwayEnd', 'blindStart', 'blindEnd', 'trackingFailed']) {
    es.on(type, (p) => log.push({ type, ...p }));
  }
  for (let t = fromMs; t <= toMs; t += stepMs) es.update(t);
  return log;
}

const newEyes = (o = {}) => new EyeState({ isHidden: () => false, blinkSmoothing: 0, ...o });

test('defaults are the shipped numbers', () => {
  assert.equal(EYE_DEFAULTS.closeThreshold, 0.45);
  assert.equal(EYE_DEFAULTS.openThreshold, 0.28);
  assert.equal(EYE_DEFAULTS.blinkSmoothing, 0.2);
  assert.equal(EYE_DEFAULTS.lookAwayYawDeg, 32);
  assert.equal(EYE_DEFAULTS.lookAwayPitchDeg, 28);
  assert.equal(EYE_DEFAULTS.lostFaceGraceMs, 200);
  assert.equal(EYE_DEFAULTS.staleTrackerMs, 1000);
  assert.equal(EYE_DEFAULTS.gazeZoneSplit, 0.22);
  assert.equal(EYE_DEFAULTS.detectFps, 30);
  assert.deepEqual(defaultCalibration(), { closeLeft: 0.45, closeRight: 0.45, openLeft: 0.28, openRight: 0.28, neutralYaw: 0, neutralPitch: 0, neutralIrisX: 0 });
});

test('closing needs BOTH eyes past the close threshold', () => {
  const es = newEyes();
  es.attach(scripted([]), null, 0);
  es.feed(face(0.9, 0.2), 10);
  es.update(10);
  assert.equal(es.snapshot.eyesClosed, false, 'one eye shut is a wink or squint, not closed');
  es.feed(face(0.9, 0.5), 40);
  es.update(40);
  assert.equal(es.snapshot.eyesClosed, true);
});

test('reopening needs EITHER eye under the open threshold (hysteresis band holds)', () => {
  const es = newEyes();
  es.attach(scripted([]), null, 0);
  es.feed(face(0.8, 0.8), 10);
  es.update(10);
  assert.equal(es.snapshot.eyesClosed, true);
  // inside the band (0.28..0.45): stays closed
  es.feed(face(0.35, 0.4), 40);
  es.update(40);
  assert.equal(es.snapshot.eyesClosed, true, 'between open and close thresholds keeps the old state');
  // one eye opens: open
  es.feed(face(0.6, 0.2), 70);
  es.update(70);
  assert.equal(es.snapshot.eyesClosed, false);
  // back in the band: stays open
  es.feed(face(0.4, 0.4), 100);
  es.update(100);
  assert.equal(es.snapshot.eyesClosed, false);
});

test('smoothing: one noisy frame does not close the eyes with the default smoothing', () => {
  const es = new EyeState({ isHidden: () => false });
  es.attach(scripted([]), null, 0);
  es.feed(face(0.05, 0.05), 0);
  es.feed(face(0.5, 0.5), 33); // 0.05*0.2 + 0.5*0.8 = 0.41 < 0.45
  es.update(33);
  assert.equal(es.snapshot.eyesClosed, false);
  es.feed(face(0.5, 0.5), 66); // 0.41*0.2 + 0.4 = 0.482 > 0.45
  es.update(66);
  assert.equal(es.snapshot.eyesClosed, true);
});

test('events: eyesClosed/eyesOpened and blindStart/blindEnd with durations', () => {
  const es = newEyes();
  es.attach(scripted([]), null, 0);
  const log = run(es, (t) => (t >= 1000 && t < 1500 ? face(0.9, 0.9) : face(0.05, 0.05)), 0, 2000);
  const types = log.map((e) => e.type);
  assert.deepEqual(types, ['eyesClosed', 'blindStart', 'eyesOpened', 'blindEnd']);
  const opened = log.find((e) => e.type === 'eyesOpened');
  assert.ok(Math.abs(opened.closedFor - 0.5) < 0.07, `closedFor ${opened.closedFor}`);
});

test('a lost face counts as looking away only after the 200 ms grace', () => {
  const es = newEyes();
  es.attach(scripted([]), null, 0);
  // face missing for 150 ms: no event
  let log = run(es, (t) => (t >= 500 && t < 650 ? NOFACE : face(0.05, 0.05)), 0, 1000);
  assert.equal(log.filter((e) => e.type === 'lookAwayStart').length, 0, 'a dropped frame or two is not looking away');
  // face missing for 600 ms: away, reason noFace
  const es2 = newEyes();
  es2.attach(scripted([]), null, 0);
  log = run(es2, (t) => (t >= 500 && t < 1100 ? NOFACE : face(0.05, 0.05)), 0, 1600);
  const start = log.find((e) => e.type === 'lookAwayStart');
  assert.ok(start, 'looking away');
  assert.equal(start.reason, 'noFace');
  assert.ok(start.time >= 0.69 && start.time <= 0.75, `starts ~200 ms after the face went (${start.time})`);
  assert.ok(log.find((e) => e.type === 'lookAwayEnd'), 'comes back');
});

test('a head turn beyond 32 degrees is looking away (from the calibrated neutral)', () => {
  const es = newEyes();
  es.attach(scripted([]), null, 0);
  let log = run(es, (t) => face(0.05, 0.05, { yawDeg: t > 500 ? 30 : 0 }), 0, 1000);
  assert.equal(log.length, 0, '30 degrees is still looking');
  const es2 = newEyes();
  es2.attach(scripted([]), null, 0);
  es2.calibration.neutralYaw = 10; // this player sits a little to the side
  log = run(es2, (t) => face(0.05, 0.05, { yawDeg: t > 500 ? 40 : 10 }), 0, 1000);
  assert.equal(log.length, 0, '40 degrees is only 30 from this player\'s neutral');
  const es3 = newEyes();
  es3.attach(scripted([]), null, 0);
  log = run(es3, (t) => face(0.05, 0.05, { pitchDeg: t > 500 ? -35 : 0 }), 0, 1000);
  assert.equal(log.find((e) => e.type === 'lookAwayStart')?.reason, 'headTurn');
});

test('a head turn keeps the eye reading; lost tracking reads open', () => {
  const es = newEyes();
  es.attach(scripted([]), null, 0);
  run(es, (t) => face(0.9, 0.9, { yawDeg: t > 300 ? 50 : 0 }), 0, 600);
  assert.equal(es.snapshot.eyesClosed, true);
  assert.equal(es.snapshot.lookingAway, true);
  const es2 = newEyes();
  es2.attach(scripted([]), null, 0);
  run(es2, (t) => (t > 300 ? NOFACE : face(0.9, 0.9)), 0, 800);
  assert.equal(es2.snapshot.eyesClosed, false, 'no face: we cannot tell, so not closed');
  assert.equal(es2.snapshot.lookingAway, true);
  assert.equal(es2.snapshot.blind, true);
});

test('a stalled tracker (no frames for 1 s) counts as looking away', () => {
  const es = newEyes();
  es.attach({ detect: () => null }, null, 0);
  for (let t = 0; t <= 900; t += 33) es.update(t);
  assert.equal(es.snapshot.lookingAway, false);
  for (let t = 900; t <= 1200; t += 33) es.update(t);
  assert.equal(es.snapshot.lookingAway, true);
});

test('a hidden tab counts as looking away, even without a camera', () => {
  let hidden = false;
  const es = new EyeState({ isHidden: () => hidden });
  es.update(0);
  assert.equal(es.snapshot.blind, false);
  hidden = true;
  es.update(16);
  assert.equal(es.snapshot.lookingAway, true);
  assert.equal(es.snapshot.blind, true);
});

test('fallback key and held button close the eyes, with or without a camera', () => {
  const es = newEyes();
  es.update(0);
  es.setKeyHeld(true);
  es.update(16);
  assert.equal(es.snapshot.eyesClosed, true);
  assert.equal(es.snapshot.simulated, true);
  es.setKeyHeld(false);
  es.setButtonHeld(true);
  es.update(32);
  assert.equal(es.snapshot.eyesClosed, true);
  es.setButtonHeld(false);
  es.update(48);
  assert.equal(es.snapshot.eyesClosed, false);
});

test('repeated tracker errors give up on the camera and emit trackingFailed', () => {
  const es = newEyes({ maxDetectFailures: 3 });
  const warn = console.warn;
  console.warn = () => {};
  try {
    es.attach({ detect: () => { throw new Error('boom'); } }, null, 0);
    let failed = null;
    es.on('trackingFailed', (p) => (failed = p));
    for (let t = 0; t < 400; t += 34) es.update(t);
    assert.ok(failed, 'trackingFailed emitted');
    assert.equal(es.hasCamera, false);
    assert.equal(es.snapshot.source, 'keyboard');
  } finally {
    console.warn = warn;
  }
});

test('simulated blinks without a camera: 130-260 ms every 3.5-7.5 s, only while autoBlink is on', () => {
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const es = new EyeState({ isHidden: () => false, random });
  const log = [];
  es.on('eyesOpened', (p) => log.push(p));
  for (let t = 0; t < 30000; t += 10) es.update(t);
  assert.equal(log.length, 0, 'off by default');
  es.autoBlink = true;
  for (let t = 30000; t < 90000; t += 10) es.update(t);
  assert.ok(log.length >= 7 && log.length <= 18, `blinks in 60 s: ${log.length}`);
  for (const b of log) assert.ok(b.closedFor >= 0.12 && b.closedFor <= 0.27, `blink length ${b.closedFor}`);
});

test('gaze zones: mirrored, calibrated and split at 0.22', () => {
  const es = newEyes();
  es.attach(scripted([]), null, 0);
  es.feed(face(0.05, 0.05, { irisX: 0.4 }), 0);
  assert.equal(es.snapshot.gaze, 'left', 'image right is the player\'s left in a mirror');
  es.feed(face(0.05, 0.05, { irisX: -0.4 }), 33);
  assert.equal(es.snapshot.gaze, 'right');
  es.feed(face(0.05, 0.05, { irisX: 0.1 }), 66);
  assert.equal(es.snapshot.gaze, 'center');
  es.calibration.neutralIrisX = 0.3;
  es.feed(face(0.05, 0.05, { irisX: 0.3 }), 99);
  assert.equal(es.snapshot.gaze, 'center', 'measured from the neutral');
  es.feed(face(0.9, 0.9, { irisX: 0.9 }), 132);
  es.feed(face(0.9, 0.9, { irisX: 0.9 }), 165);
  assert.equal(es.snapshot.gaze, 'unknown', 'no gaze with the eyes closed');
});

test('the synthetic face plays a blink, a long close, a squint, a turn and a lost face', () => {
  const es = new EyeState({ isHidden: () => false });
  const synth = new SyntheticFace();
  es.attach(synth, null, 0);
  const log = [];
  for (const type of ['eyesClosed', 'eyesOpened', 'lookAwayStart']) es.on(type, (p) => log.push({ type, ...p }));
  for (let t = 0; t <= synth.total + 400; t += 1000 / 60) es.update(t);
  const opened = log.filter((e) => e.type === 'eyesOpened').map((e) => e.closedFor);
  assert.ok(opened.some((d) => d < 0.3), `a quick blink (${opened})`);
  assert.ok(opened.some((d) => d > 1.8), `a long close (${opened})`);
  assert.equal(opened.length, 3, `blink, long close, blink at the loop end; no blink at the start; the squint does not count (${opened})`);
  const away = log.filter((e) => e.type === 'lookAwayStart').map((e) => e.reason);
  assert.deepEqual(away, ['headTurn', 'noFace']);
});
