// ?bot=1: a bot that plays through the same input as a person (input.virtual), so tests and
// recordings show real play. It has no mouse: it turns the view with input.virtual.look(dx, dy),
// which the game reads through input.look() exactly like mouse movement.
//
// What it does: walks the shortest path (findPath in level.js) to the nearest unlit lantern, looks at
// it and presses Use; turns to throw a spark at a shade that comes close; runs from a shade that is
// winding up; hops when stuck and now and then for no reason, as people do.
// It is imperfect on purpose (slow to turn, a wobbling aim, slow to react): it shows what a newcomer meets.
//
// If you change the goal of the game, change pickGoal() and what it presses when it arrives.

import * as THREE from 'three';
import { findPath, clearLine } from './level.js';
import { BODY } from './player.js';
import { SHADE_CHEST } from './shades.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createBot({ input, rng, tune }) {
  const b = { goal: null, path: [], repath: 0, stuck: 0, dodge: 0, dodgeDir: 1, react: 0, dwell: 0, hop: 3, wobble: 0, wobbleT: 0 };
  const aim = new THREE.Vector3();
  const go = new THREE.Vector3();

  function pickGoal(player, lanterns) {
    let best = null;
    let bestD = Infinity;
    for (const l of lanterns.list) {
      if (l.lit) continue;
      const d = Math.hypot(l.pos.x - player.pos.x, l.pos.z - player.pos.z) - (l === b.goal ? 4 : 0); // stick with the current one
      if (d < bestD) { bestD = d; best = l; }
    }
    return best;
  }

  return {
    reset() {
      Object.assign(b, { goal: null, path: [], repath: 0, stuck: 0, dodge: 0, react: 0, dwell: 0, hop: 3 });
      input.virtual.release();
    },

    update(dt, { player, lanterns, shades, sparks, focus }) {
      const pos = player.pos;
      b.goal = pickGoal(player, lanterns);
      if (!b.goal) { input.virtual.setMove(0, 0); return; }

      // Where to walk: along the path, cutting straight to the furthest square with a clear line.
      b.repath -= dt;
      if (b.repath <= 0) {
        b.path = findPath(pos.x, pos.z, b.goal.pos.x, b.goal.pos.z);
        b.repath = 0.4;
      }
      let way = b.path[1] ?? b.goal.pos;
      for (let i = Math.min(b.path.length - 1, 8); i > 1; i--) {
        if (clearLine(pos.x, pos.z, b.path[i].x, b.path[i].z)) { way = b.path[i]; break; }
      }
      const goalDist = Math.hypot(b.goal.pos.x - pos.x, b.goal.pos.z - pos.z);
      const arrived = goalDist < tune.use.range - 0.9;
      go.set(way.x - pos.x, 0, way.z - pos.z);
      if (arrived) go.set(0, 0, 0);
      else go.normalize();

      // Where to look: the lantern when close, a shade that needs a spark, otherwise the way ahead.
      aim.set(pos.x + go.x * 4, pos.y + BODY.eye - 0.1, pos.z + go.z * 4);
      if (goalDist < tune.use.range + 2.5) aim.copy(b.goal.pos);
      const threat = shades.nearest;
      let aimingAtShade = false;
      if (threat && threat.dist < (focus ? 5.5 : 10)) { // while lighting a lantern, only a close shade is worth turning for
        b.react += dt;
        if (b.react > 0.45 && sparks.ready) { // a person needs a moment to notice
          aim.set(threat.pos.x, SHADE_CHEST, threat.pos.z);
          aimingAtShade = true;
        }
        // It is about to rush: get out of its line, fast.
        if ((threat.state === 'windup' || threat.state === 'lunge') && threat.dist < 5) {
          go.set(-(threat.pos.z - pos.z), 0, threat.pos.x - pos.x).normalize().multiplyScalar(b.dodgeDir);
        }
      } else b.react = 0;

      // Turn toward the aim point at a human pace, with a little wobble.
      b.wobbleT -= dt;
      if (b.wobbleT <= 0) { b.wobble = rng.range(-0.03, 0.03); b.wobbleT = rng.range(0.3, 0.9); }
      const ex = aim.x - pos.x;
      const ey = aim.y - (pos.y + BODY.eye);
      const ez = aim.z - pos.z;
      const yawErr = wrap(Math.atan2(-ex, -ez) + b.wobble - player.yaw);
      const pitchErr = Math.atan2(ey, Math.hypot(ex, ez)) - player.pitch;
      const sens = tune.look.sensitivity * 0.001;
      const turn = THREE.MathUtils.clamp(yawErr * 0.18, -0.08, 0.08);
      const tilt = THREE.MathUtils.clamp(pitchErr * 0.18, -0.05, 0.05);
      input.virtual.look(-turn / sens, (-tilt / sens) * (tune.look.invertY ? -1 : 1));

      // Press things.
      b.dwell = focus ? b.dwell + dt : 0;
      input.virtual.hold('use', b.dwell > 0.18); // it looks at the thing for a moment, then holds Use
      if (aimingAtShade && !focus && Math.abs(yawErr) < 0.12 && sparks.ready) input.virtual.press('action');

      // Stuck against something? Sidestep and hop.
      const pushing = go.lengthSq() > 0.01;
      b.stuck = pushing && player.speed < 0.7 ? b.stuck + dt : 0;
      if (b.stuck > 0.4) {
        b.dodge = 0.5;
        b.dodgeDir = rng.sign();
        b.stuck = 0;
        if (player.grounded) input.virtual.press('jump');
      }
      b.hop -= dt;
      if (b.hop <= 0 && player.grounded && pushing) { input.virtual.press('jump'); b.hop = rng.range(6, 14); }
      if (b.dodge > 0) {
        b.dodge -= dt;
        go.set(go.x - go.z * b.dodgeDir, 0, go.z + go.x * b.dodgeDir).normalize();
      }

      // World direction -> the stick, relative to where the bot is looking (so it strafes like a person).
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      input.virtual.setMove(go.x * cos - go.z * sin, -go.x * sin - go.z * cos);
      input.virtual.hold('sprint', pushing && !arrived && goalDist > 9 && Math.abs(yawErr) < 0.5);
    },
  };
}
