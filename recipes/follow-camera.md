# Follow camera with pull-in

**Problem:** a third-person camera that trails the player smoothly, and moves in front of walls instead of
hiding the player behind them.

**Where:** new file `src/game/followCamera.js`; replace `createFollowCamera` from `game/camera.js` with it.
Pass it the meshes that should block the view (walls, cliffs, big rocks; not grass or pickups).

```js
// file: src/game/followCamera.js
import * as THREE from 'three';

export function createPullInCamera({ tune, input, blockers = [] }) {
  const camera = new THREE.PerspectiveCamera(tune.camera.fov, 16 / 9, 0.1, 600);
  const focus = new THREE.Vector3();
  const prevPos = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const prevFocus = new THREE.Vector3();
  const want = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const look = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  let dist = tune.camera.distance; // current distance after pull-in
  const rig = { camera, yaw: 0, blockers };

  rig.update = (dt, target) => {
    prevPos.copy(pos);
    prevFocus.copy(focus);
    const t = tune.camera;
    const turn = (input.held('turnRight') ? 1 : 0) - (input.held('turnLeft') ? 1 : 0);
    rig.yaw += turn * t.turnRate * dt;

    // Smooth follow (frame-rate independent). Vertical follows slower: jumps don't jolt the view.
    const kx = 1 - Math.exp(-t.follow * dt);
    const ky = 1 - Math.exp(-t.follow * 0.45 * dt);
    focus.x += (target.x - focus.x) * kx;
    focus.z += (target.z - focus.z) * kx;
    focus.y += (target.y + 0.8 - focus.y) * ky;

    // Where the camera wants to be, then check the line from the player to it.
    want.set(Math.sin(rig.yaw) * t.distance, t.height, Math.cos(rig.yaw) * t.distance);
    const full = want.length();
    dir.copy(want).divideScalar(full);
    ray.set(focus, dir);
    ray.far = full;
    const hit = ray.intersectObjects(rig.blockers, true)[0];
    const allowed = hit ? Math.max(1.2, hit.distance - 0.4) : full; // stop just in front of the wall

    // Snap IN fast (never show the inside of a wall), ease OUT slowly (no pumping).
    dist = allowed < dist ? allowed : dist + (allowed - dist) * (1 - Math.exp(-3 * dt));
    pos.copy(focus).addScaledVector(dir, dist);
  };

  rig.snap = (target, yaw = 0) => {
    rig.yaw = yaw;
    focus.copy(target).y += 0.8;
    dist = tune.camera.distance;
    rig.update(0, target);
    prevPos.copy(pos);
    prevFocus.copy(focus);
  };

  rig.toWorld = (stick, out = new THREE.Vector3()) =>
    out.set(-Math.sin(rig.yaw) * stick.y + Math.cos(rig.yaw) * stick.x, 0, -Math.cos(rig.yaw) * stick.y - Math.sin(rig.yaw) * stick.x);

  rig.render = (alpha) => {
    camera.position.lerpVectors(prevPos, pos, alpha);
    look.lerpVectors(prevFocus, focus, alpha);
    camera.lookAt(look);
  };

  return rig;
}
```

Use it in `game.js`: `const rig = createPullInCamera({ tune, input, blockers: [wallMesh, cliffMesh] });`
then `rig.update(dt, player.pos)` in `update`, `rig.render(alpha)` in `render`.

**Check it works:** walk the player with its back to a wall and turn the camera into the wall (Q/E): the
player must stay in view and the camera must never show the wall's inside.

**Common wrong version:** easing in both directions (the wall pops through for a few frames), raycasting
from the camera towards the player (misses walls the camera is already inside), or including small props
and pickups in `blockers` (the camera twitches every time one passes).
