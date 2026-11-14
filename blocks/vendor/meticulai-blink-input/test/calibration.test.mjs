import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCalibration, percentile } from '../src/calibration.js';
import { CALIBRATION_DEFAULTS } from '../src/options.js';
import { EyeState } from '../src/eye-state.js';

const face = (l, r, extra = {}) => ({ faceDetected: true, blinkLeft: l, blinkRight: r, yawDeg: 0, pitchDeg: 0, irisX: 0, ...extra });
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('percentile: nearest rank, unsorted input, empty', () => {
  assert.equal(percentile([], 0.5), 0);
  assert.equal(percentile([3, 1, 2], 0.5), 2);
  assert.equal(percentile([5, 1, 4, 2, 3], 0), 1);
  assert.equal(percentile([5, 1, 4, 2, 3], 1), 5);
  const ten = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  assert.equal(percentile(ten, 0.9), 0.9); // round(0.9 * 9) = 8
});

test('defaults are the shipped numbers', () => {
  assert.equal(CALIBRATION_DEFAULTS.sampleMs, 2500);
  assert.equal(CALIBRATION_DEFAULTS.minFrames, 16);
  assert.equal(CALIBRATION_DEFAULTS.settleMs, 900);
  assert.equal(CALIBRATION_DEFAULTS.closeFraction, 0.6);
  assert.equal(CALIBRATION_DEFAULTS.openFraction, 0.35);
  assert.equal(CALIBRATION_DEFAULTS.minSeparation, 0.15);
});

test('open = 90th percentile (squints spike), closed = median, thresholds between them', () => {
  // open eyes mostly ~0.1 with a couple of squint spikes; the 90th percentile ignores the very top
  const openL = [0.08, 0.09, 0.1, 0.1, 0.1, 0.11, 0.11, 0.12, 0.12, 0.13, 0.14, 0.15, 0.15, 0.16, 0.18, 0.2, 0.2, 0.55, 0.6, 0.62];
  const open = openL.map((v, i) => face(v, v + 0.02, { yawDeg: 4 + (i % 3), pitchDeg: -3, irisX: 0.05 }));
  const closed = [0.7, 0.72, 0.75, 0.75, 0.76, 0.78, 0.8, 0.8, 0.81, 0.82, 0.84, 0.85, 0.85, 0.86, 0.88, 0.9, 0.9, 0.92].map((v) => face(v, v - 0.05));
  const r = computeCalibration(open, closed);
  assert.equal(r.ok, true);
  const m = r.measured;
  assert.equal(m.openLeft, percentile(openL, 0.9));
  assert.equal(m.closedLeft, 0.82); // 18 values: index round(8.5) = 9
  const sep = m.closedLeft - m.openLeft;
  assert.ok(close(r.calibration.closeLeft, m.openLeft + sep * 0.6));
  assert.ok(close(r.calibration.openLeft, m.openLeft + sep * 0.35));
  assert.ok(r.calibration.openLeft < r.calibration.closeLeft, 'a hysteresis band');
  assert.equal(r.calibration.neutralYaw, 5);
  assert.equal(r.calibration.neutralPitch, -3);
  assert.equal(r.calibration.neutralIrisX, 0.05);
});

test('rejects too few face frames, with a reason in plain words', () => {
  const open = Array.from({ length: 7 }, () => face(0.1, 0.1));
  const closed = Array.from({ length: 20 }, () => face(0.8, 0.8));
  const r = computeCalibration(open, closed);
  assert.equal(r.ok, false);
  assert.match(r.reason, /eyes were open/);
  const r2 = computeCalibration(Array.from({ length: 20 }, () => face(0.1, 0.1)), [...Array.from({ length: 5 }, () => face(0.8, 0.8)), ...Array.from({ length: 20 }, () => ({ ...face(0, 0), faceDetected: false }))]);
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /closed/);
});

test('rejects open and closed that look too similar (< 0.15 apart)', () => {
  const open = Array.from({ length: 20 }, () => face(0.3, 0.3));
  const closed = Array.from({ length: 20 }, () => face(0.42, 0.6));
  const r = computeCalibration(open, closed);
  assert.equal(r.ok, false);
  assert.ok(r.measured, 'still reports what it measured');
  assert.match(r.reason, /too similar/);
});

test('a calibrated EyeState catches a player whose closed eyes only reach 0.4', () => {
  // This player's "closed" never passes the default 0.45: without calibration they could never close their eyes.
  const open = Array.from({ length: 20 }, (_, i) => face(0.05 + (i % 4) * 0.01, 0.06));
  const closed = Array.from({ length: 20 }, () => face(0.4, 0.42));
  const r = computeCalibration(open, closed);
  assert.equal(r.ok, true);
  const es = new EyeState({ isHidden: () => false, blinkSmoothing: 0 });
  es.attach({ detect: () => null }, null, 0);
  es.feed(face(0.4, 0.42), 10);
  assert.equal(es.update(10).eyesClosed, false, 'defaults miss it');
  es.calibration = r.calibration;
  es.feed(face(0.4, 0.42), 40);
  assert.equal(es.update(40).eyesClosed, true, 'calibrated catches it');
});
