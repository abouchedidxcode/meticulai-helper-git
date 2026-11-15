// The sparks to collect, and the little burst when one is taken.

import * as THREE from 'three';
import { glowTexture } from './world.js';
import { look } from '../core/look.js';

// [x, surface height, z]. The spark floats 0.9 above the surface.
export const SPARK_SPOTS = [
  [-4, 0, 1],
  [4.5, 0, 1.2],
  [0, 0, 8.5],
  [-8, 0, 8],
  [9.5, 0, 7],
  [6, 1.2, -5], // pillar
  [10.4, 3.4, -4.2], // tall pillar
  [-6, 1.1, -6], // slab
  [-10.2, 3.3, 0.4], // highest slab
  [1.8, 0.9, -11.2], // log
  [0, 0, 16.6], // past the edge
  [2, 0, 4], // in a stone's lane
];

export function createSparks(scene) {
  const coreGeo = new THREE.OctahedronGeometry(0.2, 0);
  const coreMat = new THREE.MeshStandardMaterial({
    color: look.shade(look.accent[0], 0.45), emissive: look.accent[0], emissiveIntensity: 3, roughness: 0.4,
  });
  const haloMat = new THREE.SpriteMaterial({
    map: glowTexture(), color: look.accent[0], transparent: true, opacity: 0.95,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });

  const list = SPARK_SPOTS.map(([x, y, z], i) => {
    const g = new THREE.Group();
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.castShadow = true;
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(1.8);
    g.add(core, halo);
    g.position.set(x, y + 0.9, z);
    scene.add(g);
    return { i, group: g, core, base: new THREE.Vector3(x, y + 0.9, z), taken: false };
  });

  // Burst pool: one expanding glow ring + falling motes per pickup. Kept in the scene
  // (invisible by opacity) so their shaders are compiled at load, not at the first pickup.
  const burstMat = () =>
    new THREE.SpriteMaterial({
      map: glowTexture(), color: look.shade(look.accent[0], 0.25), transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
  const pool = Array.from({ length: 40 }, () => {
    const s = new THREE.Sprite(burstMat());
    s.scale.setScalar(0.001);
    scene.add(s);
    return { sprite: s, vel: new THREE.Vector3(), life: 0, total: 1, grow: 0, size: 0 };
  });
  let next = 0;

  function emit(at, { vel, life, size, grow }) {
    const p = pool[next];
    next = (next + 1) % pool.length;
    p.sprite.position.copy(at);
    p.vel.copy(vel);
    p.life = p.total = life;
    p.size = size;
    p.grow = grow;
  }

  return {
    list,
    get remaining() {
      return list.filter((s) => !s.taken).length;
    },
    reset() {
      for (const s of list) {
        s.taken = false;
        s.group.visible = true;
        s.group.position.copy(s.base);
        s.group.scale.setScalar(1);
      }
    },
    take(s, rand) {
      s.taken = true;
      s.group.visible = false;
      const at = s.group.position;
      emit(at, { vel: new THREE.Vector3(), life: 0.45, size: 0.6, grow: 7 });
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2 + rand.range(0, 0.6);
        emit(at, {
          vel: new THREE.Vector3(Math.cos(a) * 2.8, rand.range(2.5, 5), Math.sin(a) * 2.8),
          life: rand.range(0.5, 0.8), size: 0.3, grow: -0.2,
        });
      }
    },
    update(dt, time) {
      for (const s of list) {
        if (s.taken) continue;
        s.group.position.y = s.base.y + Math.sin(time * 2.2 + s.i * 1.3) * 0.13;
        s.core.rotation.y = time * 1.6 + s.i;
        s.core.rotation.x = Math.sin(time + s.i) * 0.3;
      }
      for (const p of pool) {
        if (p.life <= 0) continue;
        p.life = Math.max(0, p.life - dt);
        p.vel.y -= 9 * dt;
        p.sprite.position.addScaledVector(p.vel, dt);
        const u = 1 - p.life / p.total;
        p.sprite.scale.setScalar(Math.max(0.001, p.size + p.grow * u));
        p.sprite.material.opacity = p.life > 0 ? (1 - u) * 0.9 : 0;
      }
    },
  };
}
