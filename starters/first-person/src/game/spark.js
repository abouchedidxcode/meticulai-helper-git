// The ACTION: throw a spark where you look. It stuns the shade it hits.
// This is the seed of a shooter: one aimed action with a cooldown, aim assist, a projectile and a hit.
//
// How it stays forgiving:
// - Aim assist: if a shade is within `spark.assistDegrees` of the crosshair, the spark is thrown AT it
//   (the crosshair shows the lock first, so it never feels like the game is playing itself).
// - The spark is fatter than it looks (`spark.hitRadius`), and flies fast.
//
// To grow a shooter from this: give targets health instead of a stun (see hit()), lower the cooldown,
// add ammo to throwSpark(), swap the hand's lantern for a weapon (hands.js). For instant "hitscan"
// shots, skip the projectile: call hit(target) straight away when pickTarget() finds one.

import * as THREE from 'three';
import { pointInSolid } from './collide.js';
import { pickInCone } from './interact.js';
import { glowTexture } from './scenery.js';
import { SHADE_CHEST, canHit } from './shades.js';

const POOL = 4;

export function createSparks({ scene, solids, look, tune, audio, shades, onStun }) {
  const coreGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const list = Array.from({ length: POOL }, () => {
    const group = new THREE.Group();
    const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: look.light }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: look.accent[0], transparent: true, opacity: 0.8, depthWrite: false }));
    glow.scale.setScalar(0.9);
    group.add(core, glow);
    scene.add(group);
    return { group, glow, pos: new THREE.Vector3(0, -50, 0), prev: new THREE.Vector3(0, -50, 0), vel: new THREE.Vector3(), life: 0, burst: 0 };
  });

  let cooldown = 0;
  const candidates = [];
  const aim = new THREE.Vector3();
  const from = new THREE.Vector3();

  // The shade the next throw would be helped toward (or null). Also drives the crosshair's lock.
  function pickTarget(eye, forward) {
    candidates.length = 0;
    for (const s of shades.list) {
      if (!canHit(s)) continue;
      s.aimPos ??= new THREE.Vector3();
      s.aimPos.set(s.pos.x, SHADE_CHEST, s.pos.z);
      candidates.push({ pos: s.aimPos, radius: 0.5, shade: s });
    }
    return pickInCone(eye, forward, candidates, { range: tune.spark.range, degrees: tune.spark.assistDegrees, solids });
  }

  function hit(sp, shade) {
    sp.life = 0;
    sp.burst = 1;
    if (shade && shades.stun(shade, sp.pos.x - sp.vel.x, sp.pos.z - sp.vel.z)) onStun(shade);
    else audio.blip({ freq: 900, slide: 0.5, length: 0.06, vol: 0.05 }); // fizzled on a wall
  }

  const api = {
    list,
    target: null,
    thrown: 0,
    get ready() { return cooldown <= 0; },
    reset() {
      cooldown = 0;
      api.target = null;
      api.thrown = 0;
      for (const sp of list) { sp.life = 0; sp.burst = 0; sp.pos.set(0, -50, 0); sp.prev.copy(sp.pos); }
    },

    // Throw from just beside the eyes, toward the locked shade or straight ahead. Returns false on cooldown.
    throwSpark(eye, forward, right) {
      if (cooldown > 0) return false;
      const sp = list.find((s) => s.life <= 0) ?? list[0];
      from.copy(eye).addScaledVector(right, 0.22).addScaledVector(forward, 0.3);
      from.y -= 0.18;
      const target = pickTarget(eye, forward);
      if (target) aim.subVectors(target.pos, from).normalize();
      else aim.copy(eye).addScaledVector(forward, 30).sub(from).normalize(); // meets the crosshair far away
      sp.pos.copy(from);
      sp.prev.copy(from);
      sp.vel.copy(aim).multiplyScalar(tune.spark.speed);
      sp.life = tune.spark.range / tune.spark.speed + 0.2;
      sp.burst = 0;
      cooldown = tune.spark.cooldown;
      api.thrown++;
      audio.whoosh({ vol: 0.16, length: 0.16, from: 900, to: 2600 });
      audio.blip({ freq: 720, slide: 1.5, length: 0.05, vol: 0.06 });
      return true;
    },

    update(dt, eye, forward) {
      cooldown = Math.max(0, cooldown - dt);
      api.target = pickTarget(eye, forward);
      for (const sp of list) {
        sp.burst = Math.max(0, sp.burst - dt * 4);
        sp.prev.copy(sp.pos);
        if (sp.life <= 0) continue;
        sp.life -= dt;
        // Two half-steps so a fast spark cannot skip through a thin shade or wall.
        for (let k = 0; k < 2 && sp.life > 0; k++) {
          sp.pos.addScaledVector(sp.vel, dt / 2);
          const struck = shades.list.find((s) => canHit(s)
            && Math.hypot(s.pos.x - sp.pos.x, s.pos.z - sp.pos.z) < tune.spark.hitRadius && sp.pos.y > 0 && sp.pos.y < 2.5);
          if (struck) hit(sp, struck);
          else if (sp.pos.y < 0.02 || pointInSolid(solids, sp.pos.x, sp.pos.y, sp.pos.z)) hit(sp, null);
        }
      }
    },

    render(alpha, time) {
      for (const sp of list) {
        const flying = sp.life > 0;
        sp.group.visible = flying || sp.burst > 0;
        if (flying) sp.group.position.lerpVectors(sp.prev, sp.pos, alpha);
        else sp.group.position.copy(sp.pos);
        // The burst: the glow blooms and fades where it hit.
        sp.glow.scale.setScalar(flying ? 0.9 + Math.sin(time * 40) * 0.15 : 0.9 + (1 - sp.burst) * 3);
        sp.glow.material.opacity = flying ? 0.8 : sp.burst * 0.8;
      }
    },
  };
  return api;
}
