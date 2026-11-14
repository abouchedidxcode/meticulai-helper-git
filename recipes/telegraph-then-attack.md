# An enemy that warns, then attacks

**Problem:** enemy hits feel unfair when they come with no warning; players should lose because they missed a
sign, not because they couldn't see one.

Every attack goes through four phases, timed in game time:
**idle/chase -> windup (the tell: colour, pose, sound) -> strike (short) -> recover (open to a counter)**.

**Where:** new file `src/game/enemy.js`. `enemy.update(dt, player.pos)` every step.

```js
// file: src/game/enemy.js
import * as THREE from 'three';

const PHASES = {
  chase: { next: 'windup' },
  windup: { time: 0.6, next: 'strike' }, // the warning: long enough to react (0.4-0.8 s)
  strike: { time: 0.15, next: 'recover' },
  recover: { time: 0.7, next: 'chase' }, // the opening: punish window for the player
};

export function createEnemy({ scene, rng, audio, juice, events, onHitPlayer }) {
  const mat = new THREE.MeshStandardMaterial({ color: '#7d5a6a', emissive: '#ff6a3a', emissiveIntensity: 0 });
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.8, 4, 12), mat);
  mesh.castShadow = true;
  mesh.position.set(0, 0.85, -6);
  scene.add(mesh);

  const toPlayer = new THREE.Vector3();
  const e = { mesh, phase: 'chase', t: 0, speed: 2.4, reach: 1.6, delay: 0.3 };

  function enter(phase) {
    e.phase = phase;
    e.t = 0;
    // A small random pause before the next attack, so several enemies don't attack in lockstep.
    if (phase === 'chase') e.delay = 0.3 + rng.range(0, 0.4);
    if (phase === 'windup') audio.blip({ freq: 220, slide: 0.6, length: 0.4, type: 'sawtooth', vol: 0.1 });
    if (phase === 'strike') audio.whoosh({ vol: 0.25, length: 0.18 });
  }

  e.update = (dt, playerPos) => {
    e.t += dt;
    toPlayer.subVectors(playerPos, mesh.position).setY(0);
    const dist = toPlayer.length();

    if (e.phase === 'chase') {
      // Close in, but stop just short of the player (enemies standing inside you look broken).
      if (dist > 1.1) mesh.position.addScaledVector(toPlayer.normalize(), Math.min(dist - 1.1, e.speed * dt));
      if (dist < e.reach && e.t > e.delay) enter('windup');
    } else if (e.t >= PHASES[e.phase].time) {
      if (e.phase === 'strike' && dist < e.reach + 0.3) {
        juice.hitStop(110);
        juice.shake(0.3, 250);
        events.emit('hit', { by: 'enemy' });
        onHitPlayer(e);
      }
      enter(PHASES[e.phase].next);
    }

    // The tell: glow builds through the windup, the body crouches, then snaps up on the strike.
    const u = e.phase === 'windup' ? e.t / PHASES.windup.time : 0;
    mat.emissiveIntensity = e.phase === 'windup' ? u * 2.5 : e.phase === 'strike' ? 3 : 0;
    mesh.scale.set(1 + u * 0.15, 1 - u * 0.25, 1 + u * 0.15);
    if (e.phase === 'recover') mat.color.set('#5a4a66'); // looks "open"
    else mat.color.set('#7d5a6a');
  };

  return e;
}
```

**Check it works:** stand still next to it: you see the glow and hear the rising buzz for 0.6 s before every hit;
`__game.events.on('hit', ...)` never fires without a windup first.

**Common wrong version:** dealing damage at the start of the animation (no time to react), a tell that is only
a sound (players with sound off can't see it) or only a tiny colour change, the same windup length for every
attack forever (learnable once, then boring: vary it a little with `rng`, never with `Math.random`), and timing
phases with `setTimeout` (breaks pause, hit-stop and slow test browsers).
