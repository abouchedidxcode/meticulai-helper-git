/**
 * Meticulai hand controls: webcam hand tracking and gestures for browser games.
 * See ../HOW-TO-USE.md. Nothing here imports three.js or touches the DOM until you call createHands().
 */
export { createHands, toScreen, fromScreen, DEFAULT_REGION } from './hands.js';
export { HandTracker, CAMERA_CONSTRAINTS, LANDMARKER_OPTIONS } from './tracker.js';
export { GestureEngine, DEFAULT_CONFIG, DEFAULT_POSE, TWO_HAND } from './engine.js';
export { computeFeatures, smooth, clamp01, L as LANDMARK } from './features.js';
export { POSES, scorePose, ruleScore } from './poses.js';
export { MOTIONS, MOTION_INFO, DEFAULT_MOTION } from './motions.js';
export { fromMediaPipe } from './mediapipe.js';
export { OneEuroFilter, OneEuroFilter2D, CURSOR_FILTER, SHAPE_FILTER } from './oneEuro.js';
export { drawHand, HAND_CONNECTIONS } from './draw.js';
export { syntheticHand, screenHandLandmarks, handShape, mixPoses, SYNTHETIC_POSES } from './synthetic.js';
export { PinchClick, HoldZone, Grip, GRIP_DEFAULTS, closeDuration, damp, cameraProblem, PRIVACY_LINE } from './helpers.js';
