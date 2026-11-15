// The first-person body and its eyes: mouse look, walking, sprinting, jumping, head bob, footsteps.
// Every number is in tuning.json (groups "look", "move", "comfort"). The camera lives here too.
//
// What to change: speeds and feel in tuning.json; the body size in BODY below; what happens on a
// footstep in footstep(). The body knows nothing about lanterns or shades: the rules are in game.js.
//
// Feel rules kept on purpose (see STARTER.md, "Already tuned"):
// - The view turns by exactly mouse movement x sensitivity. No smoothing, no acceleration, no dt.
// - Velocity is steered toward the wished velocity with a big grip, so you start and stop at once.
// - Head bob and footsteps follow DISTANCE walked, so they never slide against the ground.

import * as THREE from 'three';
import { makeBuffer } from '../core/input.js';
import { moveBody } from './collide.js';
import { floorAt } from './level.js';

export const BODY = { radius: 0.35, height: 1.75, eye: 1.6 }; // metres; eye = eye height above the feet

export function createPlayer({ solids, tune, input, events, audio, juice }) {
  const camera = new THREE.PerspectiveCamera(tune.look.fov, 16 / 9, 0.03, 320);
  camera.rotation.order = 'YXZ'; // yaw, then pitch: the horizon never tilts

  // Extra actions on top of the base ones (move, jump, action).
  input.define('use', ['KeyE', 'pad:3', 'pad:1']);
  input.define('sprint', ['ShiftLeft', 'ShiftRight', 'pad:10']);

  const pos = new THREE.Vector3(); // the FEET
  const prev = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const jumpBuffer = makeBuffer(0.12);
  const p = {
    pos, prev, vel, camera,
    radius: BODY.radius,
    height: BODY.height,
    yaw: 0, // radians; 0 looks toward -z, positive turns left
    pitch: 0, // radians; positive looks up
    grounded: true,
    hitWall: false,
    coyote: 0,
    sprinting: false,
    speed: 0, // metres per second over the ground
    walked: 0, // metres walked on the ground since the run began
    stride: 0, // bob phase: one footstep every PI
    moving: 0, // 0..1, eased: how much the bob shows
    sprintBlend: 0, // 0..1, eased: the field-of-view kick
    stepLag: 0, // metres the eyes still have to catch up after a step-up (smoothing)
    dip: 0, // landing dip (metres, negative = down) on a spring
    dipVel: 0,
    lookDx: 0, // how far the view turned this step (radians): the hand sways with it
    lookDy: 0,
    steps: 0,
  };

  p.reset = (x, y, z, yaw = 0) => {
    pos.set(x, y, z);
    prev.copy(pos);
    vel.set(0, 0, 0);
    Object.assign(p, { yaw, pitch: 0, grounded: true, coyote: 0, sprinting: false, speed: 0, walked: 0, stride: 0, moving: 0, sprintBlend: 0, stepLag: 0, dip: 0, dipVel: 0, lookDx: 0, lookDy: 0, steps: 0 });
    jumpBuffer.clear();
  };

  function footstep() {
    p.steps++;
    const k = p.sprinting ? 1.25 : 1;
    const side = p.steps % 2 ? 1 : 0.9; // left and right feet differ a little
    if (floorAt(pos.x, pos.z) === 'path') audio.thud({ freq: 190 * side, vol: 0.09 * k, length: 0.07, vary: 2 });
    else audio.whoosh({ vol: 0.05 * k, length: 0.11, from: 900 * side, to: 320 });
    events.emit('step', { n: p.steps });
  }

  p.update = (dt, controlsOn) => {
    prev.copy(pos);
    const t = tune.move;

    // --- Look: raw. input.look() is mouse pixels (plus the gamepad's right stick) for this step.
    const lk = controlsOn ? input.look() : { x: 0, y: 0 };
    const sens = tune.look.sensitivity * 0.001; // radians per pixel
    p.lookDx = -lk.x * sens;
    p.lookDy = -lk.y * sens * (tune.look.invertY ? -1 : 1);
    p.yaw += p.lookDx;
    const limit = THREE.MathUtils.degToRad(tune.look.pitchLimit);
    p.pitch = THREE.MathUtils.clamp(p.pitch + p.lookDy, -limit, limit);

    // --- Walk: the stick is already no longer than 1, so a diagonal is not faster.
    const stick = controlsOn ? input.move() : { x: 0, y: 0 };
    const sin = Math.sin(p.yaw);
    const cos = Math.cos(p.yaw);
    const wx = cos * stick.x - sin * stick.y; // right * x + forward * y
    const wz = -sin * stick.x - cos * stick.y;
    const pushing = Math.hypot(stick.x, stick.y) > 0.05;
    p.sprinting = controlsOn && input.held('sprint') && stick.y > 0.3; // sprint only forward, like running
    const top = p.sprinting ? t.sprintSpeed : t.walkSpeed;
    const grip = (pushing ? t.groundAccel : t.stopAccel) * (p.grounded ? 1 : t.airControl);
    const dx = wx * top - vel.x;
    const dz = wz * top - vel.z;
    const dl = Math.hypot(dx, dz);
    const maxStep = grip * dt;
    if (dl <= maxStep) { vel.x = wx * top; vel.z = wz * top; } else { vel.x += (dx / dl) * maxStep; vel.z += (dz / dl) * maxStep; }

    // --- Jump: a press slightly early (buffer) or slightly late (coyote) still counts.
    jumpBuffer.window = t.jumpBuffer;
    if (controlsOn && input.pressed('jump')) jumpBuffer.set();
    jumpBuffer.tick(dt);
    p.coyote = p.grounded ? t.coyoteTime : Math.max(0, p.coyote - dt);
    let jumped = false;
    if (p.coyote > 0 && jumpBuffer.take()) {
      vel.y = t.jumpSpeed;
      p.coyote = 0;
      p.grounded = false;
      jumped = true;
      audio.whoosh({ vol: 0.07, length: 0.14, from: 500, to: 1400 });
      events.emit('jump', {});
    }
    vel.y = Math.max(vel.y - t.gravity * (vel.y < 0 ? t.fallGravity : 1) * dt, -30);

    // --- Move and collide (capsule against the level's boxes and cylinders).
    const wasGrounded = p.grounded;
    const fallSpeed = -vel.y;
    const stepped = moveBody(solids, p, dt, { stepHeight: t.stepHeight });
    if (wasGrounded && p.grounded && !jumped) p.stepLag -= stepped; // the feet jumped up a step: the eyes follow smoothly
    p.stepLag *= Math.exp(-14 * dt);

    if (!wasGrounded && p.grounded && fallSpeed > 2.5) {
      const k = Math.min(1, fallSpeed / 12);
      p.dipVel -= k * tune.comfort.landDip * 16; // landDip is roughly the depth of the dip in metres
      audio.thud({ freq: 110, vol: 0.1 + 0.25 * k, length: 0.12 });
      if (k > 0.8) juice.shake(0.03, 120);
      events.emit('land', { speed: fallSpeed });
    }
    // The landing dip: a quick spring back to level.
    p.dipVel += (-180 * p.dip - 20 * p.dipVel) * dt;
    p.dip += p.dipVel * dt;

    // --- Head bob and footsteps, from the distance actually covered.
    const moved = Math.hypot(pos.x - prev.x, pos.z - prev.z);
    p.speed = moved / dt;
    const walking = p.grounded && p.speed > 0.6;
    p.moving += ((walking ? Math.min(1, p.speed / t.walkSpeed) : 0) - p.moving) * Math.min(1, 10 * dt);
    if (walking) {
      p.walked += moved;
      const before = Math.floor(p.stride / Math.PI);
      p.stride += (moved / Math.max(0.2, tune.comfort.strideLength)) * Math.PI;
      if (Math.floor(p.stride / Math.PI) > before) footstep();
    }
    p.sprintBlend += ((p.sprinting && p.speed > t.walkSpeed * 0.9 ? 1 : 0) - p.sprintBlend) * Math.min(1, 8 * dt);
  };

  // Unit vector the eyes look along.
  p.forward = (out) => out.set(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
  // Where the eyes are right now (without bob), for aiming and the use-cone.
  p.eye = (out) => out.set(pos.x, pos.y + BODY.eye, pos.z);

  p.render = (alpha) => {
    const c = tune.comfort;
    const fov = tune.look.fov + tune.look.sprintFovKick * p.sprintBlend;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    // The lowest point of the bob is the footfall (stride = a whole number of PI).
    const bobY = -c.bobHeight * Math.cos(p.stride) ** 2 * p.moving;
    const bobX = c.bobSway * Math.sin(p.stride) * p.moving;
    camera.position.lerpVectors(prev, pos, alpha);
    camera.position.y += BODY.eye + p.stepLag + p.dip + bobY;
    camera.position.x += Math.cos(p.yaw) * bobX;
    camera.position.z += -Math.sin(p.yaw) * bobX;
    camera.rotation.set(p.pitch, p.yaw, 0);
  };

  return p;
}
