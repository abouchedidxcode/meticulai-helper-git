// Head pose and gaze from MediaPipe Face Landmarker output, in plain maths (no three.js).

const RAD2DEG = 180 / Math.PI;

/**
 * Yaw and pitch (degrees) from a 4x4 facial transformation matrix in column-major order
 * (MediaPipe's `facialTransformationMatrixes[0].data`). Same result as three.js
 * `Euler.setFromRotationMatrix(m, 'YXZ')`: yaw = y, pitch = x. Positive yaw = head turned to the
 * player's left.
 * @param {ArrayLike<number>} m 16 numbers, column-major
 * @returns {{ yawDeg: number, pitchDeg: number }}
 */
export function yawPitchFromMatrix(m) {
  const m11 = m[0], m31 = m[2];
  const m13 = m[8], m23 = m[9], m33 = m[10];
  const x = Math.asin(-Math.min(1, Math.max(-1, m23)));
  const y = Math.abs(m23) < 0.9999999 ? Math.atan2(m13, m33) : Math.atan2(-m31, m11);
  return { yawDeg: y * RAD2DEG, pitchDeg: x * RAD2DEG };
}

// Eye corner + iris landmark indices (478-point mesh with refined iris).
export const EYE_A = Object.freeze({ outer: 33, inner: 133, iris: 468 });
export const EYE_B = Object.freeze({ outer: 263, inner: 362, iris: 473 });

/**
 * Iris position between the eye corners, mapped to -1 (image left) .. 1 (image right).
 * @param {{x:number,y:number}[]} lm landmarks
 * @param {{outer:number,inner:number,iris:number}} eye
 */
export function irisOffset(lm, eye) {
  const a = lm[eye.outer];
  const b = lm[eye.inner];
  const iris = lm[eye.iris];
  if (!a || !b || !iris) return 0;
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const w = right - left;
  if (w < 1e-4) return 0;
  return ((iris.x - left) / w - 0.5) * 2;
}

/** Average iris offset over both eyes, -1..1 in image space (not mirrored). */
export function irisX(lm) {
  return (irisOffset(lm, EYE_A) + irisOffset(lm, EYE_B)) / 2;
}
