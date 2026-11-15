// The things placed in a level that are not tiles and don't move about: coins, checkpoints, the goal.
// All drawn in the ACCENT colours, because they are what matters to the player.
//   coins        one instanced mesh; each bobs and turns, and vanishes when taken
//   checkpoints  a pole with a small pale flag that runs up and turns bright when touched
//   the goal     a glowing doorway
// To add a new pickup: copy the coin (a list in world.js, an instanced mesh here).

import * as THREE from 'three';
import { Painter, flat, outlineFor } from './paint.js';

const Z = 1.5;

export function createThings(group, world, look) {
  // --- coins
  const coinLine = outlineFor(look, look.accent[0]);
  const c = new Painter();
  c.circle(0, 0, 0.33, coinLine, 0);
  c.circle(0, 0, 0.26, look.accent[0], 0.01);
  c.circle(0, 0, 0.15, look.accent[1], 0.02);
  c.circle(-0.08, 0.1, 0.06, look.shade(look.light, 0.5), 0.03, 0.06, 8);
  const coins = new THREE.InstancedMesh(c.geometry(), flat('#ffffff', { vertexColors: true }), Math.max(1, world.coins.length));
  coins.count = world.coins.length;
  coins.frustumCulled = false;
  group.add(coins);
  const m4 = new THREE.Matrix4();

  // --- checkpoints
  const pole = look.mix(look.base[2], look.shadow, 0.55);
  const asleep = look.mix(look.base[3], look.light, 0.45);
  const flags = world.checkpoints.map((cp) => {
    const p = new Painter();
    p.rect(-0.06, 0, 0.12, 2.3, pole);
    p.circle(0, 2.34, 0.11, pole, 0.01, 0.11, 10);
    p.roundRect(0, 0.06, 0.5, 0.14, 0.06, pole, 0.01);
    const post = p.mesh();
    post.position.set(cp.x, cp.y, Z - 0.1);
    group.add(post);
    const flagGeo = new Painter().tri(0, 0.28, 0, -0.28, 0.82, 0, '#ffffff').tri(0, 0.36, 0, -0.36, -0.06, 0, '#ffffff').geometry();
    const flag = new THREE.Mesh(flagGeo, flat(asleep));
    flag.position.set(cp.x + 0.06, cp.y + 1.0, Z);
    group.add(flag);
    return { flag, up: 0 };
  });

  // --- the goal
  let halo = null;
  if (world.goal) {
    const g = world.goal;
    const line = outlineFor(look, look.accent[0]);
    const p = new Painter();
    p.roundRect(0, 1.1, 1.86, 2.7, 0.93, line, 0);
    p.rect(-0.93, -0.02, 1.86, 1.1, line, 0);
    p.roundRect(0, 1.1, 1.62, 2.46, 0.81, look.accent[1], 0.01);
    p.rect(-0.81, 0, 1.62, 1.1, look.accent[1], 0.01);
    p.roundRect(0, 1.02, 1.18, 2.04, 0.59, look.mix(look.accent[0], look.light, 0.35), 0.02);
    p.rect(-0.59, 0, 1.18, 1.0, look.mix(look.accent[0], look.light, 0.35), 0.02);
    p.roundRect(0, 0.9, 0.7, 1.5, 0.35, look.shade(look.light, 0.55), 0.03);
    p.rect(-0.35, 0, 0.7, 0.9, look.shade(look.light, 0.55), 0.03);
    const door = p.mesh();
    door.position.set(g.x, g.y, Z - 0.2);
    group.add(door);
    halo = new THREE.Mesh(new THREE.CircleGeometry(1, 32), flat(look.accent[0], { transparent: true, opacity: 0.2, depthWrite: false }));
    halo.position.set(g.x, g.y + 1.2, Z - 0.3);
    group.add(halo);
  }

  return {
    update(time, dt) {
      world.coins.forEach((coin, i) => {
        if (coin.taken) m4.makeScale(0, 0, 0);
        else {
          const turn = Math.cos(time * 2.6 + coin.x * 0.7);
          m4.makeScale(0.35 + 0.65 * Math.abs(turn), 1, 1).setPosition(coin.x, coin.y + Math.sin(time * 2.2 + coin.x) * 0.07, Z);
        }
        coins.setMatrixAt(i, m4);
      });
      coins.instanceMatrix.needsUpdate = true;

      world.checkpoints.forEach((cp, i) => {
        const f = flags[i];
        const target = cp.reached ? 1 : 0;
        if (f.up !== target) {
          f.up = Math.max(0, Math.min(1, f.up + (target ? dt * 3.5 : -1)));
          f.flag.material.color.set(f.up > 0 ? look.accent[0] : asleep);
        }
        f.flag.position.y = cp.y + 1.0 + f.up * 0.95;
        const wave = cp.reached ? Math.sin(time * 5 + i) : Math.sin(time * 1.3 + i) * 0.3;
        f.flag.scale.set(1 + wave * 0.07, 1 - wave * 0.05, 1);
        f.flag.rotation.z = wave * 0.06 - (cp.reached ? 0 : 0.5);
      });

      if (halo) {
        const s = 1.9 + Math.sin(time * 2) * 0.18;
        halo.scale.set(s, s * 1.15, 1);
        halo.material.opacity = 0.16 + Math.sin(time * 2) * 0.05;
      }
    },
  };
}
