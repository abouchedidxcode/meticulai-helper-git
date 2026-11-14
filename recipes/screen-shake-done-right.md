# Screen shake done right

**Problem:** shake either does nothing or makes people feel sick: it is too long, too frequent, random-jittery,
or moves the camera for real (so the follow camera fights it).

Rules:
- **Trauma model:** hits add "trauma" (0..1); shake = trauma squared, so small hits barely move and big hits
  kick. Trauma drains over time.
- **Smooth noise**, not a new random offset every frame.
- **Offset, don't move:** add the shake after the camera is placed and remove it after drawing. The starter
  does this in `main.js` with `juice.applyShake(camera)` / `juice.clearShake(camera)`.
- **A setting to turn it down** (some players get motion sick).
- Shake for **weight**: big hits, explosions, landing from very high. Not footsteps, not pickups.

**Where:** new file `src/feel/trauma.js`. Use it instead of `juice.shake` if you want rotation shake
and stacking. In `main.js`, call `trauma.update(dt)` right next to `juice.update(dt)` (before the
`juice.frozen` check, so it keeps shaking during a hit-stop) and `trauma.apply(camera)` / `trauma.clear(camera)`
around `view.draw` like `juice`. Pass `trauma` to the game through `ctx`.

```js
// file: src/feel/trauma.js
import * as THREE from 'three';

export function createTrauma({ tune }) {
  let trauma = 0;
  let time = 0;
  const offset = new THREE.Vector3();
  let roll = 0;

  // Smooth pseudo-noise from summed sines (deterministic, no rng needed).
  const n = (t, seed) => Math.sin(t * 1.7 + seed) * 0.6 + Math.sin(t * 3.1 + seed * 2.3) * 0.4;

  return {
    add(amount) {
      trauma = Math.min(1, trauma + amount); // 0.2 light hit, 0.5 heavy, 0.8 explosion
    },
    update(dt) {
      time += dt;
      trauma = Math.max(0, trauma - dt * 1.4); // gone in under a second
      const scale = tune.feel?.shakeScale ?? 1; // a "Screen shake" slider in tuning.json
      const s = trauma * trauma * scale;
      const f = time * 22; // frequency: higher = buzzier
      offset.set(n(f, 1) * 0.5 * s, n(f, 2) * 0.5 * s, 0);
      roll = n(f, 3) * 0.04 * s; // radians: a little roll sells it more than big moves
    },
    apply(camera) {
      camera.position.add(offset);
      camera.rotateZ(roll);
    },
    clear(camera) {
      camera.rotateZ(-roll);
      camera.position.sub(offset);
    },
  };
}
```

Add `"shakeScale": { "value": 1, "min": 0, "max": 1.5, "step": 0.05, "label": "Screen shake" }` to the
`feel` group in `src/tuning.json`, and expose it in your settings screen too.

**Check it works:** `__game.pause()` right after a big hit, then `__game.step(1)` a few times: the camera
offset shrinks every step and is back to exactly zero within a second.

**Common wrong version:** `camera.position.x += Math.random() * 0.5` every frame (jitter, breaks `?seed`
recordings, and never returns to where it was), setting the shake on the follow camera's target (the smoothing
turns it into wobble), shaking in wall-clock time (a hit-stop freezes the world but not the shake: the starter
counts shake in game time), and shaking on every small event (players stop noticing, then get tired).
