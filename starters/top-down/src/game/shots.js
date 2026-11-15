// Everything that flies: the player's water shots and the enemies' slow seeds.
//
// The player's shots are FORGIVING on purpose: they hit anything within tune.shooting.hitRadius of
// their path, which is much wider than the drop you see. Each step checks the whole stretch the
// shot travelled (not just where it ended up), so a fast shot can't skip past a thin target.
// Enemy seeds are the opposite: slow, big to look at, small to be hit by (tune.player.hurtRadius),
// and a dash goes straight through them.
//
//   shots.fire(x, z, dirX, dirZ)                            a player shot
//   shots.spit(x, z, dirX, dirZ, speed, { radius, tip })    an enemy seed (tip = end-card advice if it wins)
//   shots.update(dt, targets, player, onHit, onHurt)        targets: [{ pos: {x,z}, radius }]

import * as THREE from 'three';
import { apart, instanced } from './shapes.js';

const HEIGHT = 0.6; // shots fly at hose height

export function createShots({ scene, arena, look, tune, fx, audio }) {
  const ground = look.base[0];
  const water = apart(look, look.mix(look.player, look.light, 0.5), ground, 0.25);
  const seedColor = look.danger;
  const seedDark = look.shade(look.danger, -0.45);

  const dropGeo = new THREE.SphereGeometry(1, 8, 6);
  const drops = instanced(scene, dropGeo, new THREE.MeshBasicMaterial({ color: water }), 96);
  const seeds = instanced(scene, new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: seedColor }), 96);
  const mine = []; // the player's shots
  const theirs = []; // enemy seeds

  const shots = {
    mine,
    theirs,
    water,

    fire(x, z, dx, dz) {
      if (mine.length >= 96) return;
      mine.push({ x, z, px: x, pz: z, dx, dz, left: tune.shooting.range });
    },

    spit(x, z, dx, dz, speed, { radius = 0.3, tip = '' } = {}) {
      if (theirs.length >= 96) return;
      theirs.push({ x, z, px: x, pz: z, dx, dz, speed, radius, tip, life: 7, age: 0 });
    },

    update(dt, targets, player, onHit, onHurt) {
      const s = tune.shooting;
      for (let i = mine.length - 1; i >= 0; i--) {
        const b = mine[i];
        const step = s.speed * dt;
        b.px = b.x;
        b.pz = b.z;
        b.x += b.dx * step;
        b.z += b.dz * step;
        b.left -= step;

        // Nearest target the shot's path came close to this step.
        let hit = null;
        let hitAlong = Infinity;
        for (const t of targets) {
          const tx = t.pos.x - b.px;
          const tz = t.pos.z - b.pz;
          const along = Math.max(0, Math.min(step, tx * b.dx + tz * b.dz));
          const off = Math.hypot(tx - b.dx * along, tz - b.dz * along);
          if (off < t.radius + s.hitRadius && along < hitAlong) { hit = t; hitAlong = along; }
        }
        let gone = b.left <= 0;
        if (hit) {
          const hx = b.px + b.dx * hitAlong;
          const hz = b.pz + b.dz * hitAlong;
          fx.burst(hx, HEIGHT, hz, { count: 5, color: water, speed: 3, up: 2.5, life: 0.28, size: 0.11, dirX: -b.dx * 0.3, dirZ: -b.dz * 0.3 });
          onHit(hit, b);
          gone = true;
        } else if (arena.blocksShot(b.x, b.z)) {
          fx.burst(b.px, HEIGHT, b.pz, { count: 4, color: water, speed: 2.5, up: 2, life: 0.25, size: 0.1, dirX: -b.dx * 0.4, dirZ: -b.dz * 0.4 });
          audio.blip({ freq: 180, slide: 0.6, length: 0.03, vol: 0.03, vary: 3 });
          gone = true;
        }
        if (gone) {
          mine[i] = mine[mine.length - 1];
          mine.pop();
        }
      }

      for (let i = theirs.length - 1; i >= 0; i--) {
        const b = theirs[i];
        b.px = b.x;
        b.pz = b.z;
        b.x += b.dx * b.speed * dt;
        b.z += b.dz * b.speed * dt;
        b.life -= dt;
        b.age += dt;
        let gone = b.life <= 0 || arena.blocksShot(b.x, b.z);
        if (!gone && player.invuln <= 0 && Math.hypot(b.x - player.pos.x, b.z - player.pos.z) < b.radius * 0.7 + tune.player.hurtRadius) {
          gone = true;
          onHurt(b);
        }
        if (gone) {
          fx.burst(b.x, HEIGHT, b.z, { count: 5, color: seedColor, speed: 2.5, up: 2, life: 0.3, size: 0.12 });
          theirs[i] = theirs[theirs.length - 1];
          theirs.pop();
        } else {
          // A dark patch under each seed: it reads on any ground colour, and shows exactly where it is.
          fx.disc(b.x, b.z, b.radius * 1.5, seedDark);
        }
      }
    },

    render(alpha, time) {
      drops.begin();
      for (const b of mine) {
        drops.place(b.px + (b.x - b.px) * alpha, HEIGHT, b.pz + (b.z - b.pz) * alpha, { yaw: Math.atan2(b.dx, b.dz), sx: tune.shooting.size, sy: tune.shooting.size, sz: tune.shooting.size * 3.5 }); // stretched along the flight: reads as a jet of water
      }
      drops.done();
      seeds.begin();
      for (const b of theirs) {
        const r = b.radius * (1 + Math.sin(time * 12 + b.age * 3) * 0.12) * Math.min(1, b.age * 8 + 0.3);
        seeds.place(b.px + (b.x - b.px) * alpha, HEIGHT, b.pz + (b.z - b.pz) * alpha, { yaw: b.age * 5, pitch: b.age * 3, sx: r });
      }
      seeds.done();
    },

    reset() {
      mine.length = 0;
      theirs.length = 0;
    },
  };
  return shots;
}
