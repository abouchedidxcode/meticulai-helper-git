import test from 'node:test';
import assert from 'node:assert/strict';
import { yawPitchFromMatrix, irisOffset, EYE_A } from '../src/pose.js';
import { frameFromResult } from '../src/face-tracker.js';

let three = null;
try {
  three = await import('three');
} catch {
  /* three is a devDependency: the cross-check is skipped without it */
}

test('yaw/pitch of simple rotations', () => {
  const ry = (a) => [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
  const r = yawPitchFromMatrix(ry((30 * Math.PI) / 180));
  assert.ok(Math.abs(r.yawDeg - 30) < 1e-9);
  assert.ok(Math.abs(r.pitchDeg) < 1e-9);
  const id = yawPitchFromMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  assert.equal(id.yawDeg, 0);
  assert.ok(Object.is(id.pitchDeg, 0) || Object.is(id.pitchDeg, -0));
});

test('matches three.js Euler YXZ (what the game used) on random head poses', { skip: !three && 'three not installed' }, () => {
  const { Matrix4, Euler, Quaternion, Vector3 } = three;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < 500; i++) {
    const q = new Quaternion().setFromEuler(new Euler(rnd() * 1.4, rnd() * 3, rnd() * 0.6, 'YXZ'));
    const m = new Matrix4().compose(new Vector3(rnd() * 10, rnd() * 10, -40 + rnd()), q, new Vector3(1, 1, 1));
    const e = new Euler().setFromRotationMatrix(m, 'YXZ');
    const r = yawPitchFromMatrix(m.elements);
    assert.ok(Math.abs(r.yawDeg - (e.y * 180) / Math.PI) < 1e-9);
    assert.ok(Math.abs(r.pitchDeg - (e.x * 180) / Math.PI) < 1e-9);
  }
});

test('iris offset: -1 at one corner, 0 centred, 1 at the other', () => {
  const lm = [];
  lm[EYE_A.outer] = { x: 0.4, y: 0.5 };
  lm[EYE_A.inner] = { x: 0.5, y: 0.5 };
  lm[EYE_A.iris] = { x: 0.45, y: 0.5 };
  assert.ok(Math.abs(irisOffset(lm, EYE_A)) < 1e-9);
  lm[EYE_A.iris] = { x: 0.5, y: 0.5 };
  assert.ok(Math.abs(irisOffset(lm, EYE_A) - 1) < 1e-9);
  lm[EYE_A.iris] = { x: 0.4, y: 0.5 };
  assert.ok(Math.abs(irisOffset(lm, EYE_A) + 1) < 1e-9);
  assert.equal(irisOffset([], EYE_A), 0);
});

test('frameFromResult reads blendshapes and copes with no face', () => {
  assert.equal(frameFromResult({}).faceDetected, false);
  const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const f = frameFromResult({
    faceLandmarks: [lm],
    faceBlendshapes: [{ categories: [{ categoryName: 'eyeBlinkLeft', score: 0.7 }, { categoryName: 'eyeBlinkRight', score: 0.6 }, { categoryName: 'jawOpen', score: 0.1 }] }],
    facialTransformationMatrixes: [{ data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }],
  });
  assert.equal(f.faceDetected, true);
  assert.equal(f.blinkLeft, 0.7);
  assert.equal(f.blinkRight, 0.6);
  assert.equal(f.yawDeg, 0);
});
