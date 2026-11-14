// meticulai-marble-physics: deterministic marble physics from Lost Marbles (meticulai.com). Pure JS, no imports
// from three; the optional `view.js` (three.js meshes for colliders) is imported separately.
export {
  TICK_HZ, TICK_DT, SUBSTEPS, SUB_DT, GRAVITY, MAX_SPEED, CELL, SHAPES, DEFAULT_MAT,
  matIdentity, matMul, matRotX, matRotY, matRotZ, matYPR, matAxisAngle, matApply,
  makeCollider, poseAt, testCollider, lastHit, World, makeBody, stepWorld, stepSingle, insideBox,
} from './physics.js';
export { BTN_JUMP, DEFAULT_STATS, STAT_RANGES, SLICK, makeCtl, copyCtl, controlStep } from './control.js';
export { stateHash, copyBody, restoreBody } from './state.js';
export { useMath } from './math.js';
