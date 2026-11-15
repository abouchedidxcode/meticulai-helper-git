// Effects every other file draws with: ground markers (the warnings), particles, and the flowers
// that grow where a creature was washed away. Each kind is one instanced mesh = one draw call.
//
// MARKERS are "immediate": every step, whoever wants a marker asks for it again.
//   fx.ring(x, z, radius, color)                    a thin circle on the ground
//   fx.disc(x, z, radius, color)                    a filled, see-through circle (danger areas)
//   fx.lane(x, z, yaw, length, width, color)        a strip from a point (a charge path)
// PARTICLES live by themselves once made:
//   fx.burst(x, y, z, { count, color, speed, up, life, size, gravity, dirX, dirZ, spread })
//   fx.flower(x, z)                                 plant a flower (it pops up and stays)
// Colours are '#rrggbb' strings from the palette. Particles use their own random stream, so adding
// or removing an effect never changes how a seeded run plays out.

import * as THREE from 'three';
import { createRandom } from '../core/random.js';
import { instanced, mergeParts } from './shapes.js';

export function createFx(scene, look) {
  const rand = createRandom(4242);
  const flat = (opacity) => new THREE.MeshBasicMaterial({ transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

  const rings = instanced(scene, new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2), flat(0.95), 96, { colors: true });
  const discs = instanced(scene, new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), flat(0.34), 64, { colors: true });
  const lanes = instanced(scene, new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0), flat(0.3), 16, { colors: true });
  rings.renderOrder = 2;
  discs.renderOrder = 1;
  lanes.renderOrder = 1;

  const MAX = 280;
  const bits = instanced(scene, new THREE.TetrahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial(), MAX, { colors: true });
  const pool = [];

  const flowerGeo = mergeParts([
    { geo: new THREE.CylinderGeometry(0.03, 0.04, 0.5, 4), color: look.shade(look.base[0], -0.25), at: [0, 0.25, 0] },
    ...[0, 1, 2, 3, 4].map((i) => ({
      geo: new THREE.SphereGeometry(0.13, 5, 4), color: look.shade(look.light, 0.45),
      at: [Math.cos(i * 1.257) * 0.15, 0.52, Math.sin(i * 1.257) * 0.15], scale: [1, 0.45, 1],
    })),
    { geo: new THREE.SphereGeometry(0.09, 5, 4), color: look.accent[1], at: [0, 0.55, 0] },
  ]);
  const flowerMesh = instanced(scene, flowerGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), 160, { colors: true });
  flowerMesh.castShadow = true;
  const flowers = [];

  const fx = {
    get flowers() {
      return flowers.length;
    },

    // Call at the start of every step: forget last step's markers.
    begin() {
      rings.begin();
      discs.begin();
      lanes.begin();
    },
    ring(x, z, radius, color, y = 0.05) {
      rings.place(x, y, z, { sx: radius, sy: 1, sz: radius, color });
    },
    disc(x, z, radius, color, y = 0.04) {
      discs.place(x, y, z, { sx: radius, sy: 1, sz: radius, color });
    },
    lane(x, z, yaw, length, width, color) {
      lanes.place(x, 0.045, z, { yaw, sx: length, sy: 1, sz: width, color });
    },

    burst(x, y, z, { count = 8, color = look.light, speed = 4, up = 3, life = 0.5, size = 0.16, gravity = 14, dirX = 0, dirZ = 0, spread = 1 } = {}) {
      for (let i = 0; i < count; i++) {
        const p = pool.length < MAX ? (pool.push({}), pool[pool.length - 1]) : pool[Math.floor(rand.next() * MAX)];
        const a = rand.range(0, Math.PI * 2);
        const s = speed * rand.range(0.4, 1);
        p.x = x; p.y = y; p.z = z;
        p.vx = Math.cos(a) * s * spread + dirX * speed;
        p.vz = Math.sin(a) * s * spread + dirZ * speed;
        p.vy = up * rand.range(0.5, 1.2);
        p.life = p.max = life * rand.range(0.7, 1.2);
        p.size = size * rand.range(0.7, 1.3);
        p.gravity = gravity;
        p.spin = rand.range(-9, 9);
        p.color = Array.isArray(color) ? color[Math.floor(rand.next() * color.length)] : color;
      }
    },

    flower(x, z) {
      if (flowers.length >= 160) flowers.shift();
      flowers.push({ x, z, age: 0, yaw: rand.range(0, 6), s: rand.range(0.9, 1.4), bright: rand.range(0.85, 1.1) });
    },

    // Call at the end of every step.
    update(dt) {
      rings.done();
      discs.done();
      lanes.done();

      bits.begin();
      for (let i = pool.length - 1; i >= 0; i--) {
        const p = pool[i];
        p.life -= dt;
        if (p.life <= 0) {
          pool[i] = pool[pool.length - 1];
          pool.pop();
          continue;
        }
        p.vy -= p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; }
        const k = p.life / p.max;
        bits.place(p.x, p.y, p.z, { yaw: p.spin * p.life, pitch: p.spin * p.life * 0.7, sx: p.size * (0.3 + 0.7 * k), color: p.color });
      }
      bits.done();

      flowerMesh.begin();
      for (const f of flowers) {
        f.age += dt;
        const u = Math.min(1, f.age / 0.45);
        const pop = 1 + 0.35 * Math.sin(u * Math.PI) * (1 - u) * 2; // overshoot, then settle
        flowerMesh.place(f.x, 0, f.z, { yaw: f.yaw, sx: f.s * u * pop, bright: f.bright });
      }
      flowerMesh.done();
    },

    reset() {
      rand.reset();
      pool.length = 0;
      flowers.length = 0;
      fx.begin();
      fx.update(0);
    },
  };
  return fx;
}
