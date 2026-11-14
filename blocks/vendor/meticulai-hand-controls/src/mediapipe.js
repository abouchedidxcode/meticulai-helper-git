/** @typedef {import('./tracker.js').RawHand} RawHand @typedef {import('./types.js').HandInput} HandInput */

/**
 * Raw MediaPipe detections (un-mirrored camera image, MediaPipe's handedness label) -> engine input
 * (mirrored selfie space, the user's real hand). MediaPipe labels handedness as if the image were
 * mirrored, so with a raw camera frame its label is the opposite of the user's hand.
 *
 * Pass `{ mirror: false }` if your page shows the camera un-mirrored (rare: players expect a mirror).
 * @param {RawHand[]} hands @param {number} aspect
 * @param {{mirror?: boolean, flipLabel?: boolean}} [opts]
 * @returns {HandInput[]}
 */
export function fromMediaPipe(hands, aspect, opts = {}) {
  const mirror = opts.mirror ?? true;
  const flip = opts.flipLabel ?? true;
  return hands.map((h) => ({
    landmarks: h.landmarks.map((p) => ({ x: mirror ? 1 - p.x : p.x, y: p.y, z: p.z })),
    world: h.world?.map((p) => ({ x: mirror ? -p.x : p.x, y: p.y, z: p.z })),
    handedness: flip ? (h.label === 'Left' ? 'Right' : 'Left') : h.label,
    aspect,
  }));
}
