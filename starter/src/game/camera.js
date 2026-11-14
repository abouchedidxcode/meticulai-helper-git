// Third-person follow camera: trails the player with smoothing, turns with Q/E or by
// dragging the mouse. Vertical follow is slower than horizontal so jumps don't jerk the view.
// For walls between camera and player, see recipes/follow-camera.md (pull-in).

import * as THREE from 'three';

export function createFollowCamera({ tune, input }) {
  const camera = new THREE.PerspectiveCamera(tune.camera.fov, 16 / 9, 0.1, 600);
  const focus = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const prevPos = new THREE.Vector3();
  const prevFocus = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const rig = { camera, yaw: 0, focus, pos };

  function offset(out, yaw, dist, height) {
    return out.set(Math.sin(yaw) * dist, height, Math.cos(yaw) * dist);
  }

  rig.snap = (target, yaw = 0) => {
    rig.yaw = yaw;
    focus.copy(target).y += 0.8;
    offset(pos, yaw, tune.camera.distance, tune.camera.height).add(focus);
    prevPos.copy(pos);
    prevFocus.copy(focus);
  };

  // Turn the stick (x right, y forward) into a world direction on the ground.
  rig.toWorld = (stick, out = new THREE.Vector3()) => {
    const fx = -Math.sin(rig.yaw);
    const fz = -Math.cos(rig.yaw);
    // right = (cos, -sin)
    return out.set(fx * stick.y + Math.cos(rig.yaw) * stick.x, 0, fz * stick.y - Math.sin(rig.yaw) * stick.x);
  };

  rig.update = (dt, target, controlsOn) => {
    prevPos.copy(pos);
    prevFocus.copy(focus);
    const t = tune.camera;
    if (controlsOn) {
      const turn = (input.held('turnRight') ? 1 : 0) - (input.held('turnLeft') ? 1 : 0);
      rig.yaw += turn * t.turnRate * dt;
      if (input.mouse.buttons & 1 || input.mouse.buttons & 2) rig.yaw -= input.mouse.dx * 0.006;
    }
    // Exponential smoothing: frame-rate independent.
    const kx = 1 - Math.exp(-t.follow * dt);
    const ky = 1 - Math.exp(-t.follow * 0.45 * dt);
    focus.x += (target.x - focus.x) * kx;
    focus.z += (target.z - focus.z) * kx;
    // Don't dive after the player when they fall off the world.
    const ty = Math.max(target.y, -2) + 0.8;
    focus.y += (ty - focus.y) * ky;
    offset(pos, rig.yaw, t.distance, t.height).add(focus);
  };

  // Slow orbit for the title screen.
  rig.orbit = (time) => {
    prevPos.copy(pos);
    prevFocus.copy(focus);
    focus.set(0, 0.5, 0);
    pos.set(Math.sin(time * 0.06) * 27, 11, Math.cos(time * 0.06) * 27);
  };

  rig.render = (alpha) => {
    if (camera.fov !== tune.camera.fov) {
      camera.fov = tune.camera.fov;
      camera.updateProjectionMatrix();
    }
    camera.position.lerpVectors(prevPos, pos, alpha);
    lookAt.lerpVectors(prevFocus, focus, alpha);
    camera.lookAt(lookAt);
  };

  return rig;
}
