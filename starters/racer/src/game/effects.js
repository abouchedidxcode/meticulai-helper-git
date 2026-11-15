// THINGS THAT MAKE SPEED AND SLIDES VISIBLE. Three small systems, each one draw call:
//   speed lines   pale streaks hanging in the air that whip past the camera; they fade in above
//                 a share of top speed and get longer the faster you go
//   puffs         tyre smoke, dust off the road, sparks off a rail and drift sparks (little
//                 blobs that grow and shrink; one instanced mesh, coloured per puff)
//   skid marks    dark ribbons the rear tyres leave while sliding
// Tuning: the "speed" group of tuning.json. None of this changes how the car drives.

import * as THREE from 'three';
import { createRandom } from '../core/random.js';

const LINES = 70;
const PUFFS = 140;
const SKIDS = 500; // quads, shared by both rear wheels, oldest overwritten first

export function createEffects({ scene, look, tune }) {
  const rand = createRandom(4242); // looks only: never touches the race's random numbers
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  // --- speed lines ---------------------------------------------------------------------
  const lineMat = new THREE.MeshBasicMaterial({ color: look.shade(look.light, 0.5), transparent: true, opacity: 0, depthWrite: false, fog: false });
  const lines = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, 0.025, 1), lineMat, LINES);
  lines.frustumCulled = false;
  lines.visible = false;
  const linePos = Array.from({ length: LINES }, () => new THREE.Vector3(0, -99, 0));
  scene.add(lines);

  function updateLines(car, camera) {
    const S = tune.speed;
    const total = Math.hypot(car.vx, car.vz);
    const share = total / tune.car.topSpeed;
    const strength = Math.max(0, Math.min(1, (share - S.linesFrom) / Math.max(0.01, 1 - S.linesFrom))) + (car.boost > 0 ? 0.35 : 0);
    lineMat.opacity = Math.min(1, strength) * S.linesStrength;
    lines.visible = lineMat.opacity > 0.01;
    if (!lines.visible) return;
    const dx = car.vx / (total || 1);
    const dz = car.vz / (total || 1);
    q.setFromAxisAngle(up, Math.atan2(dx, dz));
    sc.set(1, 1, 1.5 + total * S.linesLength);
    for (let i = 0; i < LINES; i++) {
      const p = linePos[i];
      const front = (p.x - camera.position.x) * dx + (p.z - camera.position.z) * dz;
      if (front < -4 || front > 150 || p.y < -50) {
        // Put it back ahead of the car, off to one side: never in the middle of the view.
        const side = rand.sign() * rand.range(3.4, 12);
        const ahead = p.y < -50 ? rand.range(10, 120) : rand.range(70, 120); // (the first time: spread out)
        p.set(car.x + dx * ahead - dz * side, car.y + rand.range(0.15, 2.6), car.z + dz * ahead + dx * side);
      }
      m.compose(p, q, sc);
      lines.setMatrixAt(i, m);
    }
    lines.instanceMatrix.needsUpdate = true;
  }

  // --- puffs ---------------------------------------------------------------------------
  const puffMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }), PUFFS);
  puffMesh.frustumCulled = false;
  const puffs = Array.from({ length: PUFFS }, () => ({ life: 0, total: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1 }));
  let nextPuff = 0;
  const COLOURS = {
    smoke: new THREE.Color(look.mix(look.light, look.base[3], 0.25)),
    dust: new THREE.Color(look.mix(look.base[0], look.light, 0.35)),
    spark: new THREE.Color(look.accent[0]),
    hot: new THREE.Color(look.shade(look.light, 0.5)),
  };
  m.makeScale(0, 0, 0);
  for (let i = 0; i < PUFFS; i++) {
    puffMesh.setMatrixAt(i, m);
    puffMesh.setColorAt(i, COLOURS.smoke);
  }
  scene.add(puffMesh);

  /** kind: smoke | dust | spark | hot */
  function puff(kind, x, y, z, { vx = 0, vy = 0.8, vz = 0, size = 0.5, life = 0.6 } = {}) {
    const p = puffs[nextPuff];
    Object.assign(p, { life, total: life, x, y, z, vx, vy, vz, size });
    puffMesh.setColorAt(nextPuff, COLOURS[kind] ?? COLOURS.smoke);
    puffMesh.instanceColor.needsUpdate = true;
    nextPuff = (nextPuff + 1) % PUFFS;
  }

  function updatePuffs(dt) {
    q.identity();
    for (let i = 0; i < PUFFS; i++) {
      const p = puffs[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const t = Math.max(0, p.life / p.total);
      const s = p.life <= 0 ? 0 : p.size * (0.35 + (1 - t) * 0.85) * Math.min(1, t * 2.2); // grow, then shrink away
      m.compose(v.set(p.x, p.y, p.z), q, sc.set(s, s, s));
      puffMesh.setMatrixAt(i, m);
    }
    puffMesh.instanceMatrix.needsUpdate = true;
  }

  // --- skid marks ----------------------------------------------------------------------
  const skidPos = new Float32Array(SKIDS * 18);
  const skidGeo = new THREE.BufferGeometry();
  skidGeo.setAttribute('position', new THREE.BufferAttribute(skidPos, 3).setUsage(THREE.DynamicDrawUsage));
  const skids = new THREE.Mesh(skidGeo, new THREE.MeshBasicMaterial({ color: look.shade(look.shadow, -0.8), transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }));
  skids.frustumCulled = false;
  scene.add(skids);
  let nextSkid = 0;
  const last = [null, null]; // per rear wheel: the previous pair of edge points

  function skid(wheel, x, y, z, dirX, dirZ, on) {
    if (!on) { last[wheel] = null; return; }
    const w = 0.15;
    const now = [x - dirZ * w, y + 0.05, z + dirX * w, x + dirZ * w, y + 0.05, z - dirX * w];
    const was = last[wheel];
    if (was) {
      const o = nextSkid * 18;
      skidPos.set([was[0], was[1], was[2], was[3], was[4], was[5], now[3], now[4], now[5], was[0], was[1], was[2], now[3], now[4], now[5], now[0], now[1], now[2]], o);
      nextSkid = (nextSkid + 1) % SKIDS;
      skidGeo.attributes.position.needsUpdate = true;
    }
    last[wheel] = now;
  }

  return {
    puff,
    /**
     * Once per step for the player's car: speed lines, tyre smoke, skid marks, dust and sparks.
     * sliding = 0..1 (how hard the tyres are sliding).
     */
    update(dt, car, camera, sliding) {
      updateLines(car, camera);
      const fx = Math.sin(car.yaw);
      const fz = Math.cos(car.yaw);
      const total = Math.hypot(car.vx, car.vz) || 1;
      const marks = sliding > tune.speed.skidFrom && total > 6;
      for (const side of [-1, 1]) {
        const wx = car.x - fx * 1.25 - fz * side * 0.82;
        const wz = car.z - fz * 1.25 + fx * side * 0.82;
        skid(side < 0 ? 0 : 1, wx, car.y, wz, car.vx / total, car.vz / total, marks && !car.offroad);
        if (marks && rand.chance(tune.speed.smoke * sliding)) {
          const charged = car.drifting && car.charge >= tune.drift.chargeTime;
          puff(car.offroad ? 'dust' : 'smoke', wx, car.y + 0.25, wz, { vx: car.vx * 0.12 + rand.range(-1, 1), vz: car.vz * 0.12 + rand.range(-1, 1), vy: rand.range(0.5, 1.3), size: rand.range(0.22, 0.42), life: rand.range(0.4, 0.7) });
          if (charged) puff(car.charge >= tune.drift.chargeFull ? 'hot' : 'spark', wx, car.y + 0.15, wz, { vx: car.vx * 0.6 + rand.range(-3, 3), vz: car.vz * 0.6 + rand.range(-3, 3), vy: rand.range(1.5, 4), size: 0.16, life: 0.3 });
        } else if (car.offroad && total > 8 && rand.chance(0.35)) {
          puff('dust', wx, car.y + 0.2, wz, { vx: car.vx * 0.15, vz: car.vz * 0.15, vy: 1, size: rand.range(0.2, 0.4), life: 0.5 });
        }
      }
      if (car.boost > 0 && rand.chance(0.8)) {
        puff('hot', car.x - fx * 2.1 + rand.range(-0.5, 0.5), car.y + 0.45, car.z - fz * 2.1 + rand.range(-0.5, 0.5), { vx: car.vx * 0.5, vz: car.vz * 0.5, vy: rand.range(0, 1), size: 0.22, life: 0.25 });
      }
      updatePuffs(dt);
    },
    /** Sparks where a car scrapes the rail. */
    sparks(x, y, z, vx, vz, count = 6) {
      for (let i = 0; i < count; i++) puff(i % 2 ? 'spark' : 'hot', x, y + 0.4, z, { vx: vx * 0.5 + rand.range(-4, 4), vz: vz * 0.5 + rand.range(-4, 4), vy: rand.range(2, 6), size: 0.14, life: rand.range(0.2, 0.45) });
    },
    /** Smoke behind a rival having a moment. */
    smoke(x, y, z) {
      if (rand.chance(0.4)) puff('smoke', x + rand.range(-0.6, 0.6), y + 0.3, z + rand.range(-0.6, 0.6), { vy: rand.range(0.5, 1.2), size: rand.range(0.22, 0.42), life: 0.6 });
    },
    idle(dt) {
      lines.visible = false;
      updatePuffs(dt);
    },
    reset() {
      skidPos.fill(0);
      skidGeo.attributes.position.needsUpdate = true;
      last[0] = last[1] = null;
      for (const p of puffs) p.life = Math.min(p.life, 0.01);
    },
  };
}
