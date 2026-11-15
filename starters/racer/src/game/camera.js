// CHASE CAMERA: sits behind the car and sells the speed.
//   - follows with a little lag (the car pulls away when it accelerates, the view catches up)
//   - at speed: the field of view widens, the camera drops back and lower (tuning: "camera")
//   - in a drift it swings toward where the car is GOING, so you see the car side-on
//   - looks a little into the turn, so the corner is on screen before you are in it
//   - never goes under the ground or behind a hill: it is lifted over the land between it and the car
//   - snap() puts it straight behind the car (after a reset or a restart)
// No shake at speed on purpose: a camera that buzzes reads as a rough road, not as fast.
//
// Other views: a bonnet camera is distance 0.5 / height 1.2 / lookAhead 20; a top-down view is
// a new small update() that puts the camera above the car and looks down.

import * as THREE from 'three';
import { clamp, angleDiff } from './handling.js';

export function createChaseCamera({ tune, heightAt }) {
  const camera = new THREE.PerspectiveCamera(tune.camera.fov, 16 / 9, 0.3, 1400);
  const pos = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const prevPos = new THREE.Vector3();
  const prevAim = new THREE.Vector3();
  const want = new THREE.Vector3();
  let yaw = 0; // the direction the camera trails
  let fov = tune.camera.fov;
  let prevFov = fov;
  let lean = 0; // smoothed "into the turn"
  let circle = 0; // extra angle for the slow circle after the finish

  function ideal(car, out, speedShare, boost) {
    const C = tune.camera;
    const dist = C.distance + C.speedDistance * speedShare + boost * C.boostDistance;
    const height = Math.max(0.8, C.height - C.speedDrop * speedShare);
    return out.set(car.x - Math.sin(yaw + circle) * dist, car.y + height, car.z - Math.cos(yaw + circle) * dist);
  }

  // Keep the camera above the land under it and above the land halfway to the car.
  function clearGround(car) {
    const hint = car.loc?.i ?? -1;
    const C = tune.camera;
    pos.y = Math.max(pos.y, heightAt(pos.x, pos.z, hint) + C.minHeight, car.y + 0.6);
    const mid = heightAt((pos.x + car.x) / 2, (pos.z + car.z) / 2, hint) + 0.5;
    const line = (pos.y + car.y + 1) / 2;
    if (line < mid) pos.y += (mid - line) * 2;
  }

  const rig = {
    camera,
    get yaw() { return yaw; },

    snap(car) {
      yaw = car.yaw;
      circle = 0;
      lean = 0;
      fov = prevFov = tune.camera.fov;
      ideal(car, pos, 0, 0);
      clearGround(car);
      aim.set(car.x + Math.sin(yaw) * tune.camera.lookAhead, car.y + 1, car.z + Math.cos(yaw) * tune.camera.lookAhead);
      prevPos.copy(pos);
      prevAim.copy(aim);
    },

    update(dt, car, { finished = false } = {}) {
      const C = tune.camera;
      prevPos.copy(pos);
      prevAim.copy(aim);
      prevFov = fov;
      const total = Math.hypot(car.vx, car.vz);
      const share = clamp(total / tune.car.topSpeed, 0, 1.15);
      const boost = car.boost > 0 ? 1 : 0;

      // Trail the direction of travel a little more than the nose: in a drift the two differ,
      // and the camera ends up on the outside of the slide.
      const travel = total > 4 && car.speed > 0 ? Math.atan2(car.vx, car.vz) : car.yaw;
      const target = car.yaw + angleDiff(car.yaw, travel) * C.driftSwing;
      const off = angleDiff(yaw, target);
      yaw += off * (1 - Math.exp(-C.turnFollow * (1 + Math.abs(off) * 2) * dt)); // hurries when far behind
      if (finished) circle += dt * 0.45;

      ideal(car, want, share, boost);
      const k = 1 - Math.exp(-C.follow * dt);
      pos.x += (want.x - pos.x) * k;
      pos.z += (want.z - pos.z) * k;
      pos.y += (want.y - pos.y) * (1 - Math.exp(-C.follow * 0.6 * dt));
      clearGround(car);

      // Look past the car along the camera's own direction (so the car stays mid-screen however
      // it is turned), and a little into the turn.
      lean += (car.steer * clamp(share * 2, 0, 1) - lean) * (1 - Math.exp(-4 * dt));
      const ahead = finished ? 0 : C.lookAhead;
      const fx = Math.sin(yaw + circle);
      const fz = Math.cos(yaw + circle);
      aim.set(car.x + fx * ahead - fz * lean * C.lookTurn, car.y + 1.0, car.z + fz * ahead + fx * lean * C.lookTurn);

      const wantFov = C.fov + C.speedFov * share * share + boost * C.boostFov;
      fov += (wantFov - fov) * (1 - Math.exp(-5 * dt));
    },

    // Title screen: glide along the lap, high and to one side, looking ahead down the road.
    flyover(time, track) {
      prevPos.copy(pos);
      prevAim.copy(aim);
      const a = track.at(time * 11, 0);
      pos.set(a.x + a.rx * 34, 0, a.z + a.rz * 34);
      pos.y = Math.max(a.cy + 26, heightAt(pos.x, pos.z, a.i) + 14);
      const b = track.at(time * 11 + 75, 0);
      aim.set(b.x, b.cy + 1, b.z);
      fov = prevFov = tune.camera.fov;
    },

    render(alpha) {
      const f = prevFov + (fov - prevFov) * alpha;
      if (Math.abs(camera.fov - f) > 0.01) {
        camera.fov = f;
        camera.updateProjectionMatrix();
      }
      camera.position.lerpVectors(prevPos, pos, alpha);
      want.lerpVectors(prevAim, aim, alpha);
      camera.lookAt(want);
    },
  };
  return rig;
}
