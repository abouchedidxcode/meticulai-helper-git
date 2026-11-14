# A jump that feels fair

**Problem:** jumps feel "eaten" when the player presses a hair too early or too late, and every jump is the
same height.

Three fixes, used together:
- **Coyote time:** you can still jump for ~0.1 s after walking off a ledge.
- **Jump buffer:** a press ~0.12 s before landing still jumps on landing.
- **Variable height:** letting go early cuts the rise short (tap = hop, hold = full jump).
- Plus **stronger gravity when falling**: snappy, not floaty.

**Where:** new file `src/game/jump.js`; call `jump.update(dt, body)` from the player's update, before
gravity is applied and before moving. The demo's `game/player.js` already does exactly this.

```js
// file: src/game/jump.js
import { makeBuffer } from '../core/input.js';

// body: { vel: {y}, grounded: boolean }   tune: tune.player (jumpSpeed, gravity, fallGravity,
// jumpCut, coyoteTime, jumpBuffer)   events: optional event bus
export function createJump({ input, tune, events }) {
  const buffer = makeBuffer(tune.jumpBuffer);
  let coyote = 0;
  let rising = false;

  return {
    update(dt, body) {
      buffer.window = tune.jumpBuffer;
      if (input.pressed('jump')) buffer.set();
      buffer.tick(dt);
      coyote = body.grounded ? tune.coyoteTime : Math.max(0, coyote - dt);

      if (coyote > 0 && buffer.take()) {
        body.vel.y = tune.jumpSpeed;
        body.grounded = false;
        coyote = 0; // one jump per ledge
        rising = true;
        events?.emit('jump', {});
      }
      // Let go while rising: keep only part of the upward speed (once).
      if (rising && body.vel.y > 0 && !input.held('jump')) {
        body.vel.y *= tune.jumpCut;
        rising = false;
      }
      if (body.vel.y <= 0) rising = false;

      // Gravity, stronger on the way down.
      const g = tune.gravity * (body.vel.y < 0 ? tune.fallGravity : 1);
      body.vel.y = Math.max(body.vel.y - g * dt, -30);
    },
  };
}
```

Pick numbers from the height you want: `jumpSpeed = sqrt(2 * gravity * height)`. For 1.5 m with gravity 26:
about 8.8.

**Check it works:** `__game.events.on('jump', ...)` fires when you walk off a ledge and press jump a moment
later; a quick tap of Space jumps visibly lower than holding it.

**Common wrong version:** checking `input.held('jump')` instead of `pressed` (holding Space bunny-hops
forever), resetting coyote time while in the air (infinite air jumps), or applying the cut every step
(`vel.y *= 0.5` each frame kills the jump in 3 frames). Also: a scripted `press Space` in a play script is a
one-frame tap, so it makes the shortest hop; use `hold Space 250` for a full jump.
