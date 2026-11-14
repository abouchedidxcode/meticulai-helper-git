# Simple particles (instanced)

**Problem:** dust, sparks, hit bursts and trails, without creating and deleting hundreds of meshes (which
causes hitches and slowly eats memory).

One `InstancedMesh` holds every particle: one draw call, a fixed pool, positions written each step.

**Where:** new file `src/feel/particles.js`. Create one per look (dust, sparks); `particles.update(dt)` every
step.

```js
// file: src/feel/particles.js
import * as THREE from 'three';

export function createParticles({ scene, max = 400, size = 0.12, color = '#ffd08a', additive = true, gravity = -6 }) {
  const geo = new THREE.IcosahedronGeometry(size, 0);
  const mat = new THREE.MeshBasicMaterial({
    color: '#ffffff', // per-particle colour comes from setColorAt (multiplied with this)
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; // particles move far from the mesh's own bounds
  mesh.count = 0;
  scene.add(mesh);

  const base = new THREE.Color(color);
  const tint = new THREE.Color();
  const parts = Array.from({ length: max }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, total: 1, scale: 1 }));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  let next = 0;

  // Prime the colour buffer so it exists before the first draw (and its shader compiles at load).
  for (let i = 0; i < max; i++) mesh.setColorAt(i, base);

  return {
    mesh,
    // rng: ctx.rng (never Math.random: keeps ?seed runs identical).
    burst(at, rng, { count = 16, speed = 4, up = 2, life = 0.6, scale = 1 } = {}) {
      for (let i = 0; i < count; i++) {
        const p = parts[next];
        next = (next + 1) % max;
        p.pos.copy(at);
        p.vel.set(rng.range(-1, 1), rng.range(0, 1), rng.range(-1, 1)).normalize().multiplyScalar(speed * rng.range(0.4, 1));
        p.vel.y += up;
        p.life = p.total = life * rng.range(0.7, 1.2);
        p.scale = scale * rng.range(0.6, 1.3);
      }
    },
    update(dt) {
      let n = 0;
      for (const p of parts) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) continue;
        p.vel.y += gravity * dt;
        p.vel.multiplyScalar(1 - 1.5 * dt); // a little air drag
        p.pos.addScaledVector(p.vel, dt);
        const k = p.life / p.total; // 1 -> 0
        s.setScalar(p.scale * (0.3 + 0.7 * k)); // shrink as it fades
        m4.compose(p.pos, q, s);
        mesh.setMatrixAt(n, m4);
        mesh.setColorAt(n, tint.copy(base).multiplyScalar(k)); // with additive blending, darker = more see-through
        n++;
      }
      mesh.count = n; // draw only the live ones
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}
```

Use it: `const sparks = createParticles({ scene });` then on a pickup `sparks.burst(item.position, rng)`; for dust
on landing: `createParticles({ scene, color: '#b59a7a', additive: false, gravity: -1 })` and
`dust.burst(feet, rng, { count: 8, speed: 1.5, up: 0.5 })`.

**Check it works:** in the console, `__game.events.on('pickup', () => console.log(__game.frames))` and watch
`tools/play/fps.mjs`: bursts show up without a frame-time spike, even ten at once.

**Common wrong version:** `new THREE.Mesh(...)` per particle and `scene.remove` when it dies (garbage and
hitches), forgetting `instanceMatrix.needsUpdate = true` (particles freeze at their first spot), leaving
`frustumCulled` on (the whole effect blinks out when the mesh's origin leaves the screen), and fading with
`material.opacity` (that fades every particle at once; fade per particle through colour or scale).
