// Little particles: dust puffs under the feet, sparkles from coins, the pop when you are hurt.
// One instanced mesh of circles; each particle drifts, slows, shrinks and is gone in under a second.
// Purely for show: nothing here affects the game, and it has its own random numbers so it can never
// change how a run plays out.
//
//   fx.puff(x, y, { n: 5, color, speed: 2, up: 1, spread: 1, size: 0.2, life: 0.4, dir: 0 })

import * as THREE from 'three';
import { createRandom } from '../../core/random.js';
import { col, flat } from './paint.js';

const MAX = 160;
const Z = 4;

export function createFx(group) {
  const rand = createRandom(977);
  const list = [];
  for (let i = 0; i < MAX; i++) list.push({ life: 0, max: 1, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, size: 0, gravity: 0, color: '#ffffff' });
  let next = 0;
  const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 10), flat('#ffffff'), MAX);
  mesh.frustumCulled = false;
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < MAX; i++) {
    mesh.setMatrixAt(i, m4.makeScale(0, 0, 0));
    mesh.setColorAt(i, col('#ffffff'));
  }
  group.add(mesh);

  return {
    mesh,
    // dir: -1 / 1 pushes the puff to one side, 0 spreads it both ways. gravity > 0 pulls it down.
    puff(x, y, { n = 5, color, speed = 2, up = 0.8, spread = 1, size = 0.22, life = 0.4, dir = 0, gravity = 0 } = {}) {
      for (let i = 0; i < n; i++) {
        const index = next;
        const p = list[index];
        next = (next + 1) % MAX;
        const a = dir === 0 ? rand.range(-1, 1) : dir * rand.range(0.3, 1);
        Object.assign(p, {
          x: x + rand.range(-0.15, 0.15) * spread, y: y + rand.range(0, 0.12),
          vx: a * speed, vy: rand.range(0.2, 1) * up * speed,
          size: size * rand.range(0.7, 1.25), gravity, color,
        });
        p.px = p.x;
        p.py = p.y;
        p.life = p.max = life * rand.range(0.7, 1.2);
        mesh.setColorAt(index, col(color));
      }
      mesh.instanceColor.needsUpdate = true;
    },
    clear() {
      for (const p of list) p.life = 0;
    },
    update(dt) {
      for (const p of list) {
        if (p.life <= 0) continue;
        p.life -= dt;
        p.px = p.x;
        p.py = p.y;
        p.vx *= 1 - Math.min(1, 4 * dt); // air drag
        p.vy = p.vy * (1 - Math.min(1, 3 * dt)) - p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    },
    render(alpha) {
      for (let i = 0; i < MAX; i++) {
        const p = list[i];
        if (p.life <= 0) m4.makeScale(0, 0, 0);
        else {
          const k = p.life / p.max;
          const s = p.size * (0.35 + 0.65 * Math.sqrt(k));
          m4.makeScale(s, s, 1).setPosition(p.px + (p.x - p.px) * alpha, p.py + (p.y - p.py) * alpha, Z);
        }
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
