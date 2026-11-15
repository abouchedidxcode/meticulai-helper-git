// The top-down camera: looks down at a tilt, follows the player softly, leans a little toward
// where they aim (so you see more of what you shoot at), and pulls back when a crowd is near.
// It also answers "which point on the ground is under the mouse?" for aiming.
//
// Change the angle with tune.camera.height and tune.camera.back (same numbers = 45 degrees;
// back = 0 looks straight down). The player can never leave the picture: the focus point is
// clamped to within tune.camera.leash metres of them.

import * as THREE from 'three';

export function createTopDownCamera({ tune, view }) {
  const camera = new THREE.PerspectiveCamera(tune.camera.fov, 16 / 9, 0.5, 500);
  const focus = new THREE.Vector3();
  const prevFocus = new THREE.Vector3();
  const at = new THREE.Vector3();
  const ray = new THREE.Vector3();
  let zoom = 1;
  let prevZoom = 1;
  const rig = { camera, focus };

  function place(f, z) {
    camera.position.set(f.x, tune.camera.height * z, f.z + tune.camera.back * z);
    camera.lookAt(f);
  }

  rig.snap = (x, z) => {
    focus.set(x, 0, z);
    prevFocus.copy(focus);
    zoom = prevZoom = 1;
    place(focus, zoom);
  };

  // player: { x, z }. aimPoint: { x, z } on the ground. crowd: how many enemies are close.
  rig.update = (dt, player, aimPoint, crowd = 0) => {
    const t = tune.camera;
    prevFocus.copy(focus);
    prevZoom = zoom;

    // Look-ahead: a share of the way to the aim point, capped.
    let lx = (aimPoint.x - player.x) * t.lookAhead;
    let lz = (aimPoint.z - player.z) * t.lookAhead;
    const l = Math.hypot(lx, lz);
    if (l > t.lookAheadMax) { lx *= t.lookAheadMax / l; lz *= t.lookAheadMax / l; }

    const k = 1 - Math.exp(-t.follow * dt); // frame-rate independent smoothing
    focus.x += (player.x + lx - focus.x) * k;
    focus.z += (player.z + lz - focus.z) * k;

    // The leash: whatever happens (a dash, a knock-back), the player stays in the picture.
    const dx = focus.x - player.x;
    const dz = focus.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d > t.leash) { focus.x = player.x + (dx / d) * t.leash; focus.z = player.z + (dz / d) * t.leash; }

    const wantZoom = 1 + t.crowdZoom * Math.min(1, crowd / Math.max(1, t.crowdSize));
    zoom += (wantZoom - zoom) * (1 - Math.exp(-1.6 * dt)); // slow, so it never pumps
  };

  // Title screen: drift slowly over the garden.
  rig.title = (time) => {
    prevFocus.copy(focus);
    prevZoom = zoom;
    focus.set(Math.sin(time * 0.15) * 4, 0, Math.cos(time * 0.11) * 2 + 1);
    zoom = 1.12;
  };

  // The ground point under a screen position (pixels). Uses the camera's true position for this
  // step, not the smoothed one being drawn, so aiming is the same at any frame rate.
  rig.groundPoint = (sx, sy, out) => {
    place(focus, zoom);
    camera.updateMatrixWorld();
    ray.set((sx / Math.max(1, view.width)) * 2 - 1, -(sy / Math.max(1, view.height)) * 2 + 1, 0.5).unproject(camera).sub(camera.position);
    if (ray.y > -1e-4) return false; // pointing at the sky
    const s = -camera.position.y / ray.y;
    out.x = camera.position.x + ray.x * s;
    out.z = camera.position.z + ray.z * s;
    return true;
  };

  rig.render = (alpha) => {
    if (camera.fov !== tune.camera.fov) {
      camera.fov = tune.camera.fov;
      camera.updateProjectionMatrix();
    }
    at.lerpVectors(prevFocus, focus, alpha);
    place(at, prevZoom + (zoom - prevZoom) * alpha);
  };

  return rig;
}
