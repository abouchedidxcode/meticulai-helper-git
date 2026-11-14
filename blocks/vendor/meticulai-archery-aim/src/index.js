// meticulai-archery-aim: everything in one import.
//   Pure (no three.js, runs in Node): ballistics, aim, flight, bow, targets, shapes, Vec3.
//   three.js (WebGL2): createArrows (drawing, streaks, strike marks, stuck arrows, GPU volleys).
export * from './ballistics.js';
export * from './aim.js';
export * from './flight.js';
export * from './bow.js';
export * from './targets.js';
export * from './shapes.js';
export { Vec3 } from './vec3.js';
export { createArrows, arrowGeometry, arrowMaterial, ARROW, ARROWS_DEFAULTS, makeRng } from './arrows.js';
