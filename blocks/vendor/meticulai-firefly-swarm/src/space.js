/**
 * A play volume defined by the camera, as in the game: fireflies live in front of the camera, low over the grass, at a
 * comfortable depth, and away from the screen corners you keep for UI (the jar's corner, the score).
 */
import * as THREE from 'three';

/**
 * @typedef {object} SpaceOptions
 * @property {[number, number]} [x]      screen x range (0.08..0.92)
 * @property {[number, number]} [y]      screen y range, y down (0.3..0.78: they hang low, over the grass)
 * @property {number} [near]             nearest depth along the view axis (2.8)
 * @property {number} [depth]            extra depth range (3.6; biased near by a power of 1.4)
 * @property {number} [minY]             lowest world height for a pick (0.4)
 * @property {[number, number, number, number][]} [avoid]  screen rects [x0, y0, x1, y1] to keep clear
 *   (default: the bottom-right jar corner and the top-left score corner)
 */

/**
 * @param {THREE.PerspectiveCamera} camera keep its matrices current (updateMatrixWorld) before each frame
 * @param {SpaceOptions} [o]
 */
export function createCameraSpace(camera, o = {}) {
  const X = o.x ?? [0.08, 0.92], Y = o.y ?? [0.3, 0.78];
  const near = o.near ?? 2.8, depth = o.depth ?? 3.6, minY = o.minY ?? 0.4;
  const avoid = o.avoid ?? [[0.68, 0.55, 1, 1], [0, 0, 0.24, 0.24]];
  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3();

  /** Screen (0..1, y down) -> world point `dist` in front of the camera (measured along the view axis). */
  function screenToWorld(/** @type {number} */ sx, /** @type {number} */ sy, /** @type {number} */ dist, out = new THREE.Vector3()) {
    out.set(sx * 2 - 1, -(sy * 2 - 1), 0.5).unproject(camera).sub(camera.position).normalize();
    camera.getWorldDirection(fwd);
    const k = dist / Math.max(0.05, out.dot(fwd));
    return out.multiplyScalar(k).add(camera.position);
  }

  /** World -> screen 0..1 (y down). False when behind the camera or off screen. */
  function project(/** @type {THREE.Vector3} */ p, /** @type {{ x: number, y: number }} */ out) {
    tmp.copy(p).project(camera);
    out.x = (tmp.x + 1) / 2; out.y = (1 - tmp.y) / 2;
    return tmp.z < 1 && out.x > -0.02 && out.x < 1.02 && out.y > -0.02 && out.y < 1.02;
  }

  /** A random point in the play volume. */
  function pick(/** @type {() => number} */ r) {
    for (let i = 0; i < 12; i++) {
      const sx = X[0] + r() * (X[1] - X[0]), sy = Y[0] + r() * (Y[1] - Y[0]);
      if (avoid.some(([x0, y0, x1, y1]) => sx > x0 && sx < x1 && sy > y0 && sy < y1)) continue;
      const d = near + Math.pow(r(), 1.4) * depth;
      const p = screenToWorld(sx, sy, d);
      if (p.y < minY) continue;
      return p;
    }
    return screenToWorld(0.5, 0.45, 3.5);
  }

  return { pick, project, screenToWorld };
}
