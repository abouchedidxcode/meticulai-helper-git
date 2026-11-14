# Projectiles that never pass through walls

**Problem:** a fast bullet moves further in one step than a wall is thick, so it skips right through,
especially when the game runs slowly.

The fix is a **swept** test: each step, check the whole line from where the bullet was to where it will be,
not just the new point.

**Where:** new file `src/game/projectiles.js`. Create it once, call `shots.update(dt)` every step,
`shots.render(alpha)` every frame.

```js
// file: src/game/projectiles.js
import * as THREE from 'three';

// walls: meshes that stop bullets. targets: [{ position: Vector3, radius, onHit(shot) }]
export function createProjectiles({ scene, walls, targets = [], max = 64 }) {
  const geo = new THREE.SphereGeometry(0.08, 8, 6);
  const mat = new THREE.MeshBasicMaterial({ color: '#ffd28a' });
  const ray = new THREE.Raycaster();
  const step = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const pool = [];

  for (let i = 0; i < max; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, alive: false, pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0 });
  }

  // Does the segment [a, a + dirN*len] pass within r of c? Returns the distance along it, or -1.
  function segmentHitsSphere(a, dirN, len, c, r) {
    toTarget.subVectors(c, a);
    const proj = toTarget.dot(dirN);
    const along = THREE.MathUtils.clamp(proj, 0, len);
    // |c - (a + dirN*along)|^2
    const closestSq = toTarget.lengthSq() - 2 * along * proj + along * along;
    return closestSq <= r * r ? along : -1;
  }

  return {
    fire(from, velocity, life = 2) {
      const s = pool.find((p) => !p.alive);
      if (!s) return null;
      s.alive = true;
      s.pos.copy(from);
      s.prev.copy(from);
      s.vel.copy(velocity);
      s.life = life;
      s.mesh.visible = true;
      return s;
    },
    update(dt) {
      for (const s of pool) {
        if (!s.alive) continue;
        s.prev.copy(s.pos);
        s.life -= dt;
        step.copy(s.vel).multiplyScalar(dt);
        const len = step.length();
        if (len === 0) {
          if (s.life <= 0) s.alive = false;
          continue;
        }
        dir.copy(step).divideScalar(len);

        // 1. Walls: raycast along this step only.
        ray.set(s.pos, dir);
        ray.far = len;
        const wall = ray.intersectObjects(walls, true)[0];
        let travel = wall ? wall.distance : len;

        // 2. Targets: closest one hit before the wall.
        let victim = null;
        for (const t of targets) {
          const d = segmentHitsSphere(s.pos, dir, travel, t.position, t.radius);
          if (d >= 0 && d < travel) {
            travel = d;
            victim = t;
          }
        }

        s.pos.addScaledVector(dir, travel);
        if (victim) victim.onHit(s);
        if (victim || wall || s.life <= 0) s.alive = false;
      }
    },
    render(alpha) {
      for (const s of pool) {
        if (!s.alive && s.mesh.visible) s.mesh.visible = false;
        if (s.alive) s.mesh.position.lerpVectors(s.prev, s.pos, alpha);
      }
    },
  };
}
```

Fire from the player: `shots.fire(player.pos.clone().setY(1), aimDir.clone().multiplyScalar(40))`.

**Check it works:** set the bullet speed to 200 and run `__game.pause(); __game.step(1)` a few times in the
console next to a thin wall: the bullet stops at the wall every time.

**Common wrong version:** moving the bullet then checking `distanceTo(target) < radius` at the new point only
(fast bullets tunnel through), or using `Math.random()` for spread (breaks `?seed`; use `ctx.rng`).
Creating a new mesh per shot and never removing it leaks memory: always pool.
