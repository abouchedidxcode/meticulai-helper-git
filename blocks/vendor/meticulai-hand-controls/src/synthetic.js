/**
 * SYNTHETIC HANDS: procedural 21-point hands in any pose, for tests, demos, bots and mouse fallbacks.
 * They let you (or a coding agent) exercise the whole gesture engine without a webcam:
 *
 *   const h = syntheticHand(0.5, 0.5, SYNTHETIC_POSES.fist);
 *   engine.update([h], t);
 *
 * Local frame: palm facing the camera, as the user sees it on screen. x right, y up, z away from
 * the camera (MediaPipe convention: smaller z = closer), unit = wrist-to-middle-knuckle length.
 * Wrist at origin.
 */
import { L } from './features.js';

/** @typedef {import('./types.js').HandInput} HandInput @typedef {import('./types.js').Vec3} Vec3 */

/**
 * @typedef {object} HandPose
 * @property {number[]} curl Curl 0 (straight) .. 1 (fully curled) for thumb, index, middle, ring, pinky.
 * @property {number} pinch 0..1: thumb tip pulled onto the index tip.
 * @property {number} [roll] In-plane rotation (radians, positive = counter-clockwise on screen).
 * @property {number} [spread] Finger splay: multiplies each finger's angle away from the middle finger (1 = natural).
 */

/** Synthetic shapes that the engine recognises as the pose of the same id. */
export const SYNTHETIC_POSES = Object.freeze({
  open: { curl: [0, 0, 0, 0, 0], pinch: 0 },
  relaxed: { curl: [0.2, 0.25, 0.3, 0.35, 0.4], pinch: 0 },
  fist: { curl: [1, 1, 1, 1, 1], pinch: 0 },
  point: { curl: [1, 0, 1, 1, 1], pinch: 0 },
  middle: { curl: [1, 1, 0, 1, 1], pinch: 0 },
  victory: { curl: [1, 0, 0, 1, 1], pinch: 0, spread: 3 },
  three: { curl: [1, 0, 0, 0, 1], pinch: 0 },
  four: { curl: [1, 0, 0, 0, 0], pinch: 0 },
  rock: { curl: [1, 0, 1, 1, 0], pinch: 0 },
  shaka: { curl: [0, 1, 1, 1, 0], pinch: 0 },
  gun: { curl: [0, 0, 1, 1, 1], pinch: 0 },
  'thumbs-up': { curl: [0, 1, 1, 1, 1], pinch: 0, roll: -Math.PI / 2 },
  'thumbs-down': { curl: [0, 1, 1, 1, 1], pinch: 0, roll: Math.PI / 2 },
  pinch: { curl: [0, 0.5, 0.35, 0.4, 0.45], pinch: 1 },
  ok: { curl: [0, 0.5, 0, 0, 0], pinch: 1 },
  claw: { curl: [0.4, 0.45, 0.45, 0.45, 0.45], pinch: 0 },
});

// Finger bases (MCP), in-plane direction (deg) and segment lengths.
const FINGERS = [
  { mcp: [-0.24, 0.96, 0], dir: 97, seg: [0.48, 0.28, 0.22] }, // index
  { mcp: [0, 1, 0], dir: 90, seg: [0.52, 0.32, 0.24] },        // middle
  { mcp: [0.19, 0.95, 0], dir: 84, seg: [0.48, 0.3, 0.22] },   // ring
  { mcp: [0.36, 0.84, 0], dir: 76, seg: [0.38, 0.22, 0.2] },   // pinky
];
/** Max flexion per joint (deg) at curl = 1: MCP, PIP, DIP (cumulative). */
const FLEX = [75, 100, 70];

// Thumb: open (splayed) and tucked (across the curled fingers) key shapes.
const THUMB_OPEN = [[-0.22, 0.18, 0], [-0.48, 0.36, -0.02], [-0.71, 0.52, -0.03], [-0.91, 0.66, -0.04]];
const THUMB_TUCK = [[-0.2, 0.18, -0.02], [-0.38, 0.45, -0.12], [-0.3, 0.72, -0.3], [-0.08, 0.86, -0.42]];

const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/**
 * Blend two poses (0 = a, 1 = b). Handy for scripted bots: a fist that opens over a few frames.
 * @param {HandPose} a @param {HandPose} b @param {number} k @returns {HandPose}
 */
export function mixPoses(a, b, k) {
  return {
    curl: a.curl.map((c, i) => lerp(c, b.curl[i], k)),
    pinch: lerp(a.pinch, b.pinch, k),
    roll: lerp(a.roll ?? 0, b.roll ?? 0, k),
    spread: lerp(a.spread ?? 1, b.spread ?? 1, k),
  };
}

/** Builds the 21 landmarks of a RIGHT hand in the local frame. @param {HandPose} pose @returns {number[][]} */
export function handShape(pose) {
  const out = new Array(21);
  out[L.WRIST] = [0, 0, 0];
  for (let f = 0; f < 4; f++) {
    const { mcp, seg } = FINGERS[f];
    const dir = 90 + (FINGERS[f].dir - 90) * (pose.spread ?? 1);
    let c = pose.curl[f + 1];
    if (f === 0) c = Math.max(c, 0.5 * pose.pinch); // a pinching index bends a bit
    const base = L.INDEX_MCP + f * 4;
    out[base] = mcp;
    const dx = Math.cos((dir * Math.PI) / 180), dy = Math.sin((dir * Math.PI) / 180);
    let p = mcp, phi = 0;
    for (let s = 0; s < 3; s++) {
      phi += (FLEX[s] * c * Math.PI) / 180;
      const cs = Math.cos(phi), sn = Math.sin(phi);
      // Bend toward the camera (-z).
      p = [p[0] + seg[s] * dx * cs, p[1] + seg[s] * dy * cs, p[2] - seg[s] * sn];
      out[base + 1 + s] = p;
    }
  }
  const tc = pose.curl[0];
  for (let i = 0; i < 4; i++) out[L.THUMB_CMC + i] = lerp3(THUMB_OPEN[i], THUMB_TUCK[i], tc);
  if (pose.pinch > 0) {
    // Pull the thumb chain so its tip meets the index tip (slightly on the thumb side).
    const it = out[L.INDEX_TIP];
    const target = [it[0] - 0.07, it[1] - 0.06, it[2] + 0.02];
    const tip = out[L.THUMB_TIP];
    const delta = [target[0] - tip[0], target[1] - tip[1], target[2] - tip[2]];
    const w = [0.15, 0.4, 0.7, 1]; // CMC barely moves, tip moves fully
    for (let i = 0; i < 4; i++) {
      const k = w[i] * pose.pinch;
      const q = out[L.THUMB_CMC + i];
      out[L.THUMB_CMC + i] = [q[0] + delta[0] * k, q[1] + delta[1] * k, q[2] + delta[2] * k];
    }
  }
  if (pose.roll) {
    const c = Math.cos(pose.roll), s = Math.sin(pose.roll);
    for (let i = 0; i < 21; i++) { const [x, y, z] = out[i]; out[i] = [x * c - y * s, x * s + y * c, z]; }
  }
  return out;
}

const tipMid = (s) => [(s[L.THUMB_TIP][0] + s[L.INDEX_TIP][0]) / 2, (s[L.THUMB_TIP][1] + s[L.INDEX_TIP][1]) / 2];

/**
 * Screen-space landmarks with the thumb/index tip midpoint exactly on (x, y).
 * @param {number} x @param {number} y @param {HandPose} pose
 * @param {{handedness?: 'Left'|'Right', scale?: number, aspect?: number}} [o]
 *   scale: palm length in screen-height units (default 0.14); aspect: screen width / height.
 * @returns {Vec3[]}
 */
export function screenHandLandmarks(x, y, pose, o = {}) {
  const scale = o.scale ?? 0.14, aspect = o.aspect ?? 16 / 9;
  const sx = o.handedness === 'Left' ? -1 : 1;
  const s = handShape(pose);
  const [mx, my] = tipMid(s);
  return s.map(([lx, ly, lz]) => ({
    x: x + (sx * (lx - mx) * scale) / aspect,
    y: y - (ly - my) * scale,
    z: lz * scale,
  }));
}

/**
 * A ready-to-use engine input: a hand in `pose` whose palm centre is at screen point (x, y)
 * (0..1, mirrored selfie space, y down).
 * @param {number} x @param {number} y @param {HandPose} pose
 * @param {{handedness?: 'Left'|'Right', scale?: number, aspect?: number}} [o]
 *   scale: palm length in screen heights (default 0.2; bigger = closer to the camera); aspect default 16/9.
 * @returns {HandInput}
 */
export function syntheticHand(x, y, pose, o = {}) {
  const opts = { handedness: o.handedness ?? 'Right', scale: o.scale ?? 0.2, aspect: o.aspect ?? 16 / 9 };
  const lm = screenHandLandmarks(x, y, pose, opts);
  // re-centre on the palm (wrist + four knuckles) so (x, y) is where the hand appears
  const palm = [L.WRIST, L.INDEX_MCP, L.MIDDLE_MCP, L.RING_MCP, L.PINKY_MCP];
  const cx = palm.reduce((a, i) => a + lm[i].x, 0) / palm.length, cy = palm.reduce((a, i) => a + lm[i].y, 0) / palm.length;
  const landmarks = lm.map((p) => ({ x: p.x + x - cx, y: p.y + y - cy, z: p.z }));
  return { landmarks, handedness: opts.handedness, aspect: opts.aspect };
}
