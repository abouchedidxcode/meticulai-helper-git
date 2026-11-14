# A pickup that feels good

**Problem:** collecting things feels flat: the item just disappears and a number changes.

What makes it land, all at once, in the same step:
1. a short **magnet** pull when close (no pixel-hunting),
2. a **3-frame hit-stop** (50 ms),
3. a **chime that climbs** with each one collected in a row (and resets after a pause),
4. a **punch** on the player and on the HUD counter,
5. a small **burst** where it was.

**Where:** new file `src/game/pickups.js`. `pickups.update(dt, player.pos)` every step.

```js
// file: src/game/pickups.js
import * as THREE from 'three';

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; // pentatonic: any run of notes sounds nice

// items: [{ mesh }]. onCollect(item): your scoring. burst(position): optional particles.
export function createPickups({ items, juice, audio, ui, events, player, onCollect, burst }) {
  const tmp = new THREE.Vector3();
  let streak = 0;
  let sinceLast = 99;

  return {
    update(dt, playerPos) {
      sinceLast += dt;
      if (sinceLast > 2.5) streak = 0; // the climb resets after a pause

      for (const item of items) {
        if (item.taken) continue;
        const d = item.mesh.position.distanceTo(playerPos);
        // Magnet: inside 2 m, drift toward the player, faster the closer it is.
        if (d < 2) {
          tmp.subVectors(playerPos, item.mesh.position).normalize();
          item.mesh.position.addScaledVector(tmp, (2 - d) * 6 * dt);
        }
        if (d < 0.7) {
          item.taken = true;
          item.mesh.visible = false;
          sinceLast = 0;
          juice.hitStop(50);
          juice.punch(player, 1.15, 160);
          audio.chime({ note: SCALE[Math.min(streak, SCALE.length - 1)], vary: 0.05 });
          streak++;
          ui.hud.punch('score');
          burst?.(item.mesh.position);
          events.emit('pickup', { streak });
          onCollect(item);
        }
      }
    },
  };
}
```

Wire it in `game.js`: `const pickups = createPickups({ items, juice, audio, ui, events, player: player.mesh,
onCollect: () => { score += 10; ui.hud.set('score', { icon: 'spark', text: String(score) }); } });`
For the burst, see `simple-particles.md`.

**Check it works:** `__game.events.on('pickup', e => console.log(e.streak))` while collecting three in a row
prints 1, 2, 3, and you hear three rising notes.

**Common wrong version:** a random pitch per pickup (sounds like noise; a rising scale sounds like progress),
a hit-stop of 200 ms on something you collect 50 times (feels like lag; keep big stops for big moments), or
removing the mesh with `scene.remove` and creating a new one each time (hitches; hide and reuse instead).
