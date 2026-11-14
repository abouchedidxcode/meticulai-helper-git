import { smooth } from './features.js';

/** @typedef {import('./types.js').PoseDef} PoseDef @typedef {import('./types.js').HandFeatures} HandFeatures @typedef {import('./types.js').FingerRule} FingerRule */

/**
 * Built-in pose library. Each pose is a per-finger rule (thumb, index, middle, ring, pinky) plus
 * optional soft extras. Scores are a geometric mean of the rule scores, so one badly-wrong finger
 * sinks the pose. Add your own with `engine.registerPose(def)`.
 */

const deg = (d) => (d * Math.PI) / 180;
const pinchOf = (f, i = 0) => 1 - smooth(0.2, 0.42, f.tipGap[i]);
/** Fingers held together (small gaps), 0..1. */
const together = (f, idx) => Math.min(...idx.map((i) => 1 - smooth(deg(12), deg(26), f.spread[i])));
/** Thumb and index form an L (angle between their directions), 0..1. */
const lShape = (f) => smooth(deg(22), deg(42), Math.acos(Math.max(-1, Math.min(1, f.thumbDir.x * f.pointDir.x + f.thumbDir.y * f.pointDir.y))));

/** @type {PoseDef[]} */
export const POSES = [
  { id: 'open', name: 'Open palm', hint: 'All five fingers out, palm to the camera',
    fingers: ['ext', 'ext', 'ext', 'ext', 'ext'], extra: (f) => 1 - 0.5 * smooth(0.1, -0.35, f.facing) },
  { id: 'back', name: 'Back of hand', hint: 'Open hand, turn the back of it to the camera',
    fingers: ['any', 'ext', 'ext', 'ext', 'ext'], extra: (f) => smooth(0.1, -0.35, f.facing), experimental: true },
  { id: 'chop', name: 'Karate chop', hint: 'Flat hand, fingers together, turned edge-on like a blade',
    fingers: ['any', 'ext', 'ext', 'ext', 'ext'], extra: (f) => (1 - smooth(0.2, 0.5, Math.abs(f.facing))) * together(f, [0, 1, 2]), experimental: true },
  { id: 'fist', name: 'Fist', hint: 'Close all fingers tight',
    fingers: ['any', 'curl', 'curl', 'curl', 'curl'], extra: (f) => 1 - 0.6 * smooth(0.55, 0.9, f.thumbOut) },
  { id: 'claw', name: 'Claw', hint: 'Fingers half bent like grabbing a ball',
    fingers: ['any', 'half', 'half', 'half', 'half'], extra: (f) => smooth(0.28, 0.45, f.tipGap[0]) },
  { id: 'point', name: 'Point', hint: 'Index finger out, the rest curled',
    fingers: ['any', 'ext', 'curl', 'curl', 'curl'], extra: (f) => 1 - 0.45 * f.thumbOut * lShape(f) },
  { id: 'middle', name: 'Middle finger', hint: 'Only the middle finger up',
    fingers: ['any', 'curl', 'ext', 'curl', 'curl'] },
  { id: 'victory', name: 'Peace / V', hint: 'Index and middle up in a V',
    fingers: ['any', 'ext', 'ext', 'curl', 'curl'], extra: (f) => smooth(deg(9), deg(17), f.spread[0]) },
  { id: 'two', name: 'Two together', hint: 'Index and middle up, pressed together',
    fingers: ['any', 'ext', 'ext', 'curl', 'curl'], extra: (f) => 1 - smooth(deg(7), deg(14), f.spread[0]), experimental: true },
  { id: 'three', name: 'Three', hint: 'Index, middle and ring up, thumb holds the pinky',
    fingers: ['notext', 'ext', 'ext', 'ext', 'curl'] },
  { id: 'four', name: 'Four', hint: 'Four fingers up, thumb tucked into the palm',
    fingers: ['curl', 'ext', 'ext', 'ext', 'ext'] },
  { id: 'thumbs-up', name: 'Thumbs up', hint: 'Fist with the thumb pointing up',
    fingers: ['ext', 'curl', 'curl', 'curl', 'curl'], extra: (f) => smooth(0.35, 0.75, -f.thumbDir.y) },
  { id: 'thumbs-down', name: 'Thumbs down', hint: 'Fist with the thumb pointing down',
    fingers: ['ext', 'curl', 'curl', 'curl', 'curl'], extra: (f) => smooth(0.35, 0.75, f.thumbDir.y) },
  { id: 'rock', name: 'Rock on', hint: 'Index and pinky up, middle and ring down',
    fingers: ['any', 'ext', 'curl', 'curl', 'ext'] },
  { id: 'shaka', name: 'Call me / shaka', hint: 'Thumb and pinky out, the rest curled',
    fingers: ['ext', 'curl', 'curl', 'curl', 'ext'] },
  { id: 'gun', name: 'Finger gun / L', hint: 'Thumb up and index out in an L',
    fingers: ['ext', 'ext', 'curl', 'curl', 'curl'], extra: lShape },
  { id: 'pinch', name: 'Pinch', hint: 'Touch thumb and index tips',
    fingers: ['any', 'notcurl', 'any', 'any', 'any'], extra: (f) => pinchOf(f, 0) },
  { id: 'ok', name: 'OK sign', hint: 'Thumb and index make a ring, other fingers up',
    fingers: ['any', 'any', 'ext', 'ext', 'ext'], extra: (f) => pinchOf(f, 0) },
  { id: 'pinch-middle', name: 'Middle pinch', hint: 'Touch thumb and middle tips (snap-ready)',
    fingers: ['any', 'any', 'notcurl', 'any', 'any'], extra: (f) => pinchOf(f, 1) * smooth(0.25, 0.5, f.tipGap[0]) },
  { id: 'split', name: 'Split salute', hint: 'Four fingers up, split between middle and ring',
    fingers: ['any', 'ext', 'ext', 'ext', 'ext'],
    extra: (f) => smooth(deg(14), deg(24), f.spread[1]) * together(f, [0, 2]), experimental: true },
];

/**
 * Soft score of one finger against one rule.
 * @param {FingerRule} rule @param {number} curl @param {number} thumbOut @param {boolean} thumb
 */
export function ruleScore(rule, curl, thumbOut, thumb) {
  if (rule === 'any') return 1;
  // the thumb's "extended" is mostly about sticking out from the palm, not its own bend
  const ext = thumb ? thumbOut : 1 - smooth(0.3, 0.62, curl);
  const cur = thumb ? 1 - thumbOut : smooth(0.5, 0.74, curl);
  switch (rule) {
    case 'ext': return ext;
    case 'curl': return cur;
    case 'notcurl': return 1 - cur;
    case 'notext': return 1 - ext;
    case 'half': return thumb ? 1 : smooth(0.15, 0.32, curl) * (1 - smooth(0.62, 0.8, curl));
    default: return 0;
  }
}

/**
 * 0..1 match of a pose: sqrt(geometric mean x worst rule), so one clearly wrong finger sinks the
 * pose while small wobbles everywhere only dent it. Plus a hair for specificity.
 * @param {PoseDef} def @param {HandFeatures} f
 */
export function scorePose(def, f) {
  let logSum = 0, n = 0, worst = 1;
  const add = (v) => { const c = Math.max(1e-4, v); logSum += Math.log(c); n++; if (c < worst) worst = c; };
  for (let i = 0; i < 5; i++) {
    const r = def.fingers[i];
    if (r !== 'any') add(ruleScore(r, f.curl[i], f.thumbOut, i === 0));
  }
  if (def.extra) add(def.extra(f));
  const g = n ? Math.sqrt(Math.exp(logSum / n) * worst) : 0;
  // more constrained poses win ties against looser ones (OK beats pinch, gun beats point when the
  // thumb is out); scaled so even a 7-rule pose stays <= 1
  return Math.min(1, g * (0.93 + 0.01 * n));
}
