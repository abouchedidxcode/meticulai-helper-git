// The Math object the physics and controller use. By default it is the built-in Math (fast; deterministic on one
// JavaScript engine). For bit-identical results across Chrome, Safari and Node, swap in a deterministic one
// (meticulai-deterministic-math) BEFORE building colliders or stepping:
//   import { DMath } from '../meticulai-deterministic-math/src/dmath.js';
//   import { useMath } from './math.js';
//   useMath(DMath);
// Modules read it as a live binding (`import { M as Math } from './math.js'`), so the swap reaches them all.

/** @type {Math} */
export let M = Math;

/** @param {Math} m a Math-like object (needs floor, sqrt, abs, min, max, hypot, sin, cos, atan2, PI) */
export function useMath(m) {
  M = m || Math;
}
