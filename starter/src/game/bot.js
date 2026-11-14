// ?bot=1: a simple bot that plays through the same input as a person (input.virtual), so
// recordings show real play. It heads for the nearest spark, jumps up to it, jumps gaps and
// stones, and gives up on a spark it can't reach for a while.
// It isn't smart on purpose: it should show what a careless newcomer runs into.

import * as THREE from 'three';
import { groundAt } from './world.js';

export function createBot({ input, rng }) {
  const dir = new THREE.Vector3();
  const probe = new THREE.Vector3();
  let target = null;
  let targetTime = 0;
  let stuckTime = 0;
  let jumpHold = 0;
  let wobble = 0;
  let wobbleTimer = 0;
  const skip = new Map(); // spark -> time left to ignore it

  function jump() {
    if (jumpHold > 0) return;
    input.virtual.press('jump');
    jumpHold = 0.35;
  }

  return {
    reset() {
      target = null;
      skip.clear();
      jumpHold = 0;
      input.virtual.release();
    },
    update(dt, { player, sparks, stones, rig, solids }) {
      for (const [s, t] of skip) (t - dt <= 0 ? skip.delete(s) : skip.set(s, t - dt));

      // Pick the nearest spark (height counts double: climbing is slow).
      let best = null;
      let bestD = Infinity;
      for (const s of sparks.list) {
        if (s.taken || skip.has(s)) continue;
        const d = Math.hypot(s.base.x - player.pos.x, (s.base.y - player.pos.y) * 2, s.base.z - player.pos.z);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      if (best !== target) {
        target = best;
        targetTime = 0;
      }
      targetTime += dt;
      if (target && targetTime > 9) {
        skip.set(target, 12); // can't get it: try something else for a while
        target = null;
      }

      // Wander a little so it's not a straight line every time.
      wobbleTimer -= dt;
      if (wobbleTimer <= 0) {
        wobble = rng.range(-0.35, 0.35);
        wobbleTimer = rng.range(0.6, 1.4);
      }

      dir.set(0, 0, 0);
      if (target) {
        dir.set(target.base.x - player.pos.x, 0, target.base.z - player.pos.z);
        const dist = dir.length();
        if (dist > 0.25) dir.normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, dist > 3 ? wobble : 0);
        else dir.set(0, 0, 0);

        const above = target.base.y - player.pos.y;
        if (player.grounded && above > 1.1 && dist < 3.2) jump();

        // Gap ahead? Jump it (only when the spark is past it).
        probe.copy(player.pos).addScaledVector(dir, 1.1);
        const g = groundAt(solids, probe.x, probe.z, player.pos.y);
        if (player.grounded && dist > 1.2 && g < player.pos.y - 2) jump();
      }

      // Stuck against something?
      const speed = Math.hypot(player.vel.x, player.vel.z);
      stuckTime = dir.lengthSq() > 0 && speed < 0.6 ? stuckTime + dt : 0;
      if (stuckTime > 0.35 && player.grounded) {
        jump();
        stuckTime = 0;
      }

      // A stone coming close? Hop.
      for (const s of stones.list) {
        if (s.rolling && s.pos.distanceTo(player.pos) < 2.6 && player.grounded) jump();
      }

      jumpHold = Math.max(0, jumpHold - dt);
      input.virtual.hold('jump', jumpHold > 0);

      // World direction -> camera-relative stick.
      const fx = -Math.sin(rig.yaw);
      const fz = -Math.cos(rig.yaw);
      const rx = Math.cos(rig.yaw);
      const rz = -Math.sin(rig.yaw);
      input.virtual.setMove(dir.x * rx + dir.z * rz, dir.x * fx + dir.z * fz);
    },
  };
}
