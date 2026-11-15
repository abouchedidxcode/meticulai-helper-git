// Rolling stones: roll along a worn track, rest at the end (wobble = warning), roll back.

import * as THREE from 'three';
import { createRandom } from '../core/random.js';
import { PALETTE } from './world.js';

export const STONE_RADIUS = 0.9;

export function createStones({ scene, lanes, tune, audio }) {
  const rand = createRandom(99);
  const mat = new THREE.MeshStandardMaterial({ color: PALETTE.stone, roughness: 0.95, flatShading: true });

  const stones = lanes.map((lane, i) => {
    const geo = new THREE.IcosahedronGeometry(STONE_RADIUS, 1);
    const pa = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let k = 0; k < pa.count; k++) {
      v.fromBufferAttribute(pa, k);
      const n = 1 + Math.sin(v.x * 3.1 + i) * 0.05 + Math.sin(v.y * 4.3) * 0.05 + Math.sin(v.z * 2.7) * 0.04;
      pa.setXYZ(k, v.x * n, v.y * n, v.z * n);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.rotation.set(rand.range(0, 6), rand.range(0, 6), 0);
    scene.add(mesh);
    const dir = new THREE.Vector3().subVectors(lane.to, lane.from).normalize();
    const axis = new THREE.Vector3(0, 1, 0).cross(dir).normalize(); // roll axis
    return {
      mesh, lane, dir, axis,
      length: lane.from.distanceTo(lane.to),
      pos: new THREE.Vector3(),
      prev: new THREE.Vector3(),
      t: 0, // distance along the lane
      heading: 1, // +1 towards `to`, -1 back
      rest: 0,
      rolling: false,
      rumble: audio.noiseLoop({ freq: 160 }),
    };
  });

  const q = new THREE.Quaternion();

  function place(s) {
    s.pos.copy(s.lane.from).addScaledVector(s.dir, s.t);
    s.pos.y = STONE_RADIUS * 0.95;
  }

  return {
    list: stones,
    reset() {
      stones.forEach((s, i) => {
        s.t = i === 0 ? 0 : s.length;
        s.heading = i === 0 ? 1 : -1;
        s.rest = 1.5 + i * 1.2; // give the player a moment at the start
        s.rolling = false;
        place(s);
        s.prev.copy(s.pos);
      });
    },
    update(dt, time, playerPos) {
      for (const s of stones) {
        s.prev.copy(s.pos);
        if (s.rest > 0) {
          s.rest -= dt;
          s.rolling = false;
          // Wobble harder as it gets ready to go: the warning.
          const w = s.rest < 0.8 ? (0.8 - s.rest) / 0.8 : 0;
          s.mesh.rotation.z += Math.sin(time * 30) * 0.012 * w;
        } else {
          s.rolling = true;
          const step = tune.stones.speed * dt;
          s.t += step * s.heading;
          q.setFromAxisAngle(s.axis, (step * s.heading) / STONE_RADIUS);
          s.mesh.quaternion.premultiply(q);
          if (s.t >= s.length || s.t <= 0) {
            s.t = THREE.MathUtils.clamp(s.t, 0, s.length);
            s.heading *= -1;
            s.rest = tune.stones.rest;
            audio.thud({ freq: 70, vol: 0.25 * near(s, playerPos), length: 0.25 });
          }
          place(s);
        }
        s.rumble.set(s.rolling ? 0.5 * near(s, playerPos) : 0);
      }
    },
    render(alpha) {
      for (const s of stones) s.mesh.position.lerpVectors(s.prev, s.pos, alpha);
    },
    mute() {
      for (const s of stones) s.rumble.set(0);
    },
  };
}

// 1 when close to the player, fading to 0 at 16 m.
function near(s, playerPos) {
  return Math.max(0, 1 - s.pos.distanceTo(playerPos) / 16);
}
