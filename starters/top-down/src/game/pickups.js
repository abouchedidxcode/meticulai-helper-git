// Pickups: score gems and hearts. They pop out of a beaten enemy, sit for a while, and DRIFT TO
// THE PLAYER once they are near (tune.pickups.magnetRadius), faster the longer they chase, so
// nobody has to walk over every single one. They blink before they vanish.
//
//   pickups.drop('gem' | 'heart', x, z)
//   pickups.update(dt, player, onCollect, pullAll)    pullAll: true = everything flies in (wave cleared)
// To add a kind: add a shape below and handle its name in game.js collect().

import * as THREE from 'three';
import { createRandom } from '../core/random.js';
import { apart, instanced } from './shapes.js';

function heartGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.3);
  s.bezierCurveTo(-0.5, 0.05, -0.32, 0.42, 0, 0.18);
  s.bezierCurveTo(0.32, 0.42, 0.5, 0.05, 0, -0.3);
  return new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -0.07);
}

export function createPickups({ scene, look, tune, fx }) {
  const rand = createRandom(99); // only for the little pop when they drop
  const ground = look.base[0];
  const gemColor = apart(look, look.accent[0], ground, 0.2);
  const heartColor = apart(look, look.shade(look.light, 0.55), ground, 0.25);
  const meshes = {
    gem: instanced(scene, new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ color: gemColor, roughness: 0.3, emissive: gemColor, emissiveIntensity: 0.35, flatShading: true }), 96),
    heart: instanced(scene, heartGeometry(), new THREE.MeshStandardMaterial({ color: heartColor, roughness: 0.4, emissive: heartColor, emissiveIntensity: 0.3 }), 8),
  };
  const list = [];

  return {
    list,
    drop(type, x, z) {
      if (list.length >= 96) return;
      const a = rand.range(0, Math.PI * 2);
      const s = rand.range(2, 4.5);
      list.push({ type, x, z, vx: Math.cos(a) * s, vz: Math.sin(a) * s, age: 0, pulled: 0, seed: rand.range(0, 6) });
    },

    update(dt, player, onCollect, pullAll = false) {
      const t = tune.pickups;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.age += dt;
        const dx = player.pos.x - p.x;
        const dz = player.pos.z - p.z;
        const d = Math.hypot(dx, dz) || 0.001;
        if (p.age > 0.25 && (pullAll || d < t.magnetRadius)) p.pulled += dt;
        if (p.pulled > 0) {
          // Home in, faster and faster: it always arrives.
          const speed = t.magnetSpeed * (1 + p.pulled * 3);
          p.vx = (dx / d) * speed;
          p.vz = (dz / d) * speed;
        } else {
          const drag = Math.exp(-5 * dt);
          p.vx *= drag;
          p.vz *= drag;
        }
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        if (d < t.collectRadius && p.age > 0.2) {
          list.splice(i, 1);
          fx.burst(p.x, 0.6, p.z, { count: 5, color: p.type === 'gem' ? gemColor : heartColor, speed: 2.5, up: 3, life: 0.3, size: 0.1 });
          onCollect(p.type);
        } else if (p.age > (p.type === 'heart' ? t.life * 2 : t.life) && p.pulled === 0) {
          list.splice(i, 1);
        } else if (p.type === 'heart') {
          fx.ring(p.x, p.z, 0.5 + Math.sin(p.age * 5) * 0.08, heartColor);
        }
      }
    },

    render(time) {
      meshes.gem.begin();
      meshes.heart.begin();
      for (const p of list) {
        const life = p.type === 'heart' ? tune.pickups.life * 2 : tune.pickups.life;
        if (p.pulled === 0 && p.age > life - 3 && Math.floor(time * 9) % 2 === 0) continue; // blinking: about to vanish
        const grow = Math.min(1, p.age * 6);
        const y = 0.45 + Math.sin(time * 4 + p.seed) * 0.1;
        if (p.type === 'gem') meshes.gem.place(p.x, y, p.z, { yaw: time * 3 + p.seed, sx: grow, sy: grow * 1.35, sz: grow });
        else meshes.heart.place(p.x, y + 0.15, p.z, { yaw: time * 2, sx: grow * 1.5 });
      }
      meshes.gem.done();
      meshes.heart.done();
    },

    reset() {
      rand.reset();
      list.length = 0;
    },
  };
}
