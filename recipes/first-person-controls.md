# First-person controls (pointer lock)

**Problem:** a first-person game needs the mouse to turn the view without a cursor hitting the screen edge,
and must let go of the mouse cleanly for menus.

Pointer lock hides the cursor and reports raw movement. The browser only grants it **after a click**, and
releases it on **Esc** (which the starter also uses for pause, so the two line up).

**Where:** new file `src/game/fpsControls.js`. Call `fps.update(dt)` every step; `fps.render(alpha)` places the
camera.

```js
// file: src/game/fpsControls.js
import * as THREE from 'three';

export function createFpsControls({ view, input, tune, onUnlock }) {
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 500);
  camera.rotation.order = 'YXZ'; // yaw first, then pitch: no roll creeping in
  const pos = new THREE.Vector3(0, 1.6, 5);
  const prev = pos.clone();
  const move = new THREE.Vector3();
  const sens = () => tune.camera?.mouseSensitivity ?? 0.0022;
  let yaw = 0;
  let pitch = 0;

  const canvas = view.canvas;
  canvas.addEventListener('click', () => {
    if (document.pointerLockElement !== canvas) {
      // unadjustedMovement: raw mouse, no OS acceleration (not every browser has it).
      const p = canvas.requestPointerLock({ unadjustedMovement: true });
      p?.catch?.(() => canvas.requestPointerLock()); // older browsers return nothing, some reject the option
    }
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas) onUnlock?.(); // e.g. show the pause screen
  });

  return {
    camera,
    get locked() {
      return document.pointerLockElement === canvas;
    },
    update(dt) {
      prev.copy(pos);
      if (document.pointerLockElement === canvas) {
        // input.mouse.dx/dy = movement since the last step (the starter adds it up for you).
        yaw -= input.mouse.dx * sens();
        pitch -= input.mouse.dy * sens();
        pitch = THREE.MathUtils.clamp(pitch, -1.5, 1.5); // never flip over the top
      }
      const stick = input.move();
      // Forward is where you look, flattened onto the ground.
      move.set(stick.x, 0, -stick.y).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      pos.addScaledVector(move, (tune.player?.runSpeed ?? 5) * dt);
    },
    render(alpha) {
      camera.position.lerpVectors(prev, pos, alpha);
      camera.rotation.set(pitch, yaw, 0);
    },
  };
}
```

In `game.js`: `const fps = createFpsControls({ view: ctx.view, input, tune, onUnlock: () => {} });` and use
`fps.camera` as the game's camera. Add `"mouseSensitivity"` to the `camera` group in `tuning.json` so the
player (and the dev panel) can change it.

**Check it works:** click the game: the cursor disappears and moving the mouse turns the view; Esc brings the
cursor back and the pause screen shows. Headless tests can't lock the pointer, so give bots a separate
aim input (`input.virtual`) instead of relying on mouse movement.

**Common wrong version:** reading `event.clientX` (stops at the screen edge), Euler order `'XYZ'` (the view
rolls when you look up and turn), turning by `movementX * dt` (mouse movement is already a distance; multiplying
by `dt` makes sensitivity depend on frame rate), and calling `requestPointerLock()` on load with no click (the
browser refuses).
