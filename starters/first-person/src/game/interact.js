// Picking things with your eyes: the forgiving cone behind both "use" and aim assist.
//
// A thin ray from the crosshair misses constantly and feels broken. A CONE does what people expect:
// of everything close enough, the thing nearest the centre of the view wins.
//
//   const best = pickInCone(eye, forward, candidates, { range, degrees, solids });
//   candidates: [{ pos: Vector3, radius?: metres, ... }]   radius widens the cone for big or close things
//   returns the winning candidate (or null), with best.dist and best.angle (radians) filled in
//
// Used by: the use prompt (game.js: lanterns within reach), and the spark's aim assist (spark.js).
// To add a new usable thing, you do not touch this file: add a "usable" in game.js.

import * as THREE from 'three';
import { segmentBlocked } from './collide.js';

const to = new THREE.Vector3();

export function pickInCone(eye, forward, candidates, { range, degrees, solids = null }) {
  const cone = THREE.MathUtils.degToRad(degrees);
  let best = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    to.subVectors(c.pos, eye);
    const dist = to.length();
    if (dist > range || dist < 1e-3) continue;
    const angle = Math.acos(THREE.MathUtils.clamp(to.dot(forward) / dist, -1, 1));
    // Close or big things take up more of the view: let them count as "looked at" more easily.
    const allowed = Math.max(cone, Math.atan2(c.radius ?? 0, dist));
    if (angle > allowed) continue;
    const score = angle / allowed + (dist / range) * 0.35; // centre of view first, then nearer
    if (score >= bestScore) continue;
    if (solids && segmentBlocked(solids, eye, c.pos, -0.05)) continue; // a wall in the way
    best = c;
    bestScore = score;
    c.dist = dist;
    c.angle = angle;
  }
  return best;
}
