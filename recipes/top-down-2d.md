# Top-down or 2D view (orthographic camera)

**Problem:** a top-down or side-on game needs a flat camera with no perspective, that keeps the same play area
on every screen shape, and a way to turn the mouse position into a point in the world.

**Where:** new file `src/game/orthoCamera.js`. Register the camera with `ctx.view.addCamera(camera)` (the starter's
renderer then keeps its sides right when the window resizes; main.js already does this for `game.camera`).

```js
// file: src/game/orthoCamera.js
import * as THREE from 'three';

// viewHeight: how many world units fit top to bottom. topDown: look straight down (else side-on, 2D).
export function createOrthoCamera({ viewHeight = 20, topDown = true } = {}) {
  const h = viewHeight / 2;
  const camera = new THREE.OrthographicCamera(-h * (16 / 9), h * (16 / 9), h, -h, 0.1, 200);
  if (topDown) {
    camera.position.set(0, 50, 0);
    camera.up.set(0, 0, -1); // screen-up = world -z
    camera.lookAt(0, 0, 0);
  } else {
    camera.position.set(0, 0, 50);
    camera.lookAt(0, 0, 0);
  }

  const target = new THREE.Vector3();
  const offset = camera.position.clone();
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const ground = topDown ? new THREE.Plane(new THREE.Vector3(0, 1, 0), 0) : new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  return {
    camera,
    // Smoothly follow a point (call every step).
    follow(dt, point, speed = 8) {
      target.lerp(point, 1 - Math.exp(-speed * dt));
      camera.position.copy(target).add(offset);
    },
    // Zoom by changing the visible height (orthographic cameras ignore distance).
    setViewHeight(units) {
      const aspect = (camera.right - camera.left) / (camera.top - camera.bottom);
      camera.top = units / 2;
      camera.bottom = -units / 2;
      camera.left = -(units / 2) * aspect;
      camera.right = (units / 2) * aspect;
      camera.updateProjectionMatrix();
    },
    // Mouse pixel position -> point on the ground (top-down) or the z=0 plane (2D).
    screenToWorld(clientX, clientY, canvas, out = new THREE.Vector3()) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectPlane(ground, out);
    },
  };
}
```

Use it: `const cam = createOrthoCamera({ viewHeight: 24 });` return `cam.camera` as the game's camera; aim with
`cam.screenToWorld(input.mouse.x, input.mouse.y, ctx.view.canvas)`. For flat 2D art, use `MeshBasicMaterial`
on planes (no lights needed) and set `renderer.toneMapping = THREE.NoToneMapping` in `render/renderer.js` so
your colours come out exactly as picked.

**Check it works:** resize the browser window from wide to tall: the play area's height stays the same and
nothing stretches; clicking a spot puts the aim point exactly under the cursor.

**Common wrong version:** setting `left/right` once from `window.innerWidth` and never on resize (stretched
picture), moving the camera closer to "zoom" (does nothing for orthographic: change the view height), using
`near: 0` or putting the camera at y=0 (everything is clipped), or forgetting `camera.up` for straight-down
views (`lookAt` straight down with the default up gives a random spin).
