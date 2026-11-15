// The demo's character: a small round creature that runs and jumps.
// Jump = coyote time (jump just after leaving a ledge) + jump buffering (press just before
// landing) + variable height (let go early for a short hop). All numbers live in tuning.json.

import * as THREE from 'three';
import { makeBuffer } from '../core/input.js';
import { look } from '../core/look.js';
import { collideSphere, groundAt } from './world.js';

export const PLAYER_RADIUS = 0.5;

function buildMesh() {
  const root = new THREE.Group();
  const squash = new THREE.Group(); // scaled for squash and stretch, pivot at the feet
  squash.position.y = -PLAYER_RADIUS;
  root.add(squash);
  const inner = new THREE.Group();
  inner.position.y = PLAYER_RADIUS;
  squash.add(inner);

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(PLAYER_RADIUS, 32, 20),
    new THREE.MeshStandardMaterial({ color: look.player, roughness: 0.5 }),
  );
  body.castShadow = true;
  inner.add(body);

  const eyeMat = new THREE.MeshStandardMaterial({ color: look.shade(look.shadow, -0.5), roughness: 0.3 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), eyeMat);
    eye.position.set(side * 0.17, 0.1, 0.45);
    eye.scale.set(1, 1.35, 0.6);
    inner.add(eye);
    const cheek = new THREE.Mesh(
      new THREE.CircleGeometry(0.06, 12),
      new THREE.MeshBasicMaterial({ color: look.mix(look.player, look.danger, 0.5), transparent: true, opacity: 0.6 }),
    );
    cheek.position.set(side * 0.27, -0.04, 0.42);
    cheek.lookAt(side * 0.6, -0.1, 1.2);
    inner.add(cheek);
  }
  // A little leaf on top.
  const leaf = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 10, 6),
    new THREE.MeshStandardMaterial({ color: look.shade(look.base[0], -0.05), roughness: 0.8 }),
  );
  leaf.scale.set(0.55, 0.18, 1.2);
  leaf.position.set(0.05, 0.53, -0.02);
  leaf.rotation.set(0.5, 0.4, 0.3);
  leaf.castShadow = true;
  inner.add(leaf);

  return { root, squash, inner };
}

export function createPlayer({ scene, solids, tune, input, events, audio, juice }) {
  const { root, squash, inner } = buildMesh();
  scene.add(root);

  // A soft dark spot straight below: shows where you will land.
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.48, 24),
    new THREE.MeshBasicMaterial({ color: look.shade(look.shadow, -0.7), transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
  );
  blob.rotation.x = -Math.PI / 2;
  scene.add(blob);

  const pos = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const lastSafe = new THREE.Vector3();
  const jumpBuffer = makeBuffer(0.12);
  const p = {
    pos, vel, prev, lastSafe,
    grounded: false,
    coyote: 0,
    rising: false, // in a jump that can still be cut short
    facing: 0, // yaw in radians
    squashAmount: 0,
    squashVel: 0,
    bob: 0,
    invuln: 0,
  };

  p.reset = (x, y, z) => {
    pos.set(x, y, z);
    prev.copy(pos);
    lastSafe.copy(pos);
    vel.set(0, 0, 0);
    p.grounded = false;
    p.coyote = 0;
    p.rising = false;
    p.facing = Math.PI; // face away from the camera (towards -z)
    p.squashAmount = p.squashVel = 0;
    p.invuln = 0;
    jumpBuffer.clear();
  };

  // wish: world-space direction (x, z) with length 0..1, from the camera-relative stick.
  p.update = (dt, wish, controlsOn) => {
    prev.copy(pos);
    const t = tune.player;

    // Run: move velocity toward the wished velocity, with less grip in the air.
    const grip = t.groundAccel * (p.grounded ? 1 : t.airControl);
    const tx = wish.x * t.runSpeed;
    const tz = wish.z * t.runSpeed;
    const dx = tx - vel.x;
    const dz = tz - vel.z;
    const dl = Math.hypot(dx, dz);
    const maxStep = grip * dt;
    if (dl <= maxStep) {
      vel.x = tx;
      vel.z = tz;
    } else {
      vel.x += (dx / dl) * maxStep;
      vel.z += (dz / dl) * maxStep;
    }

    // Jump: buffer + coyote + variable height.
    jumpBuffer.window = t.jumpBuffer;
    if (controlsOn && input.pressed('jump')) jumpBuffer.set();
    jumpBuffer.tick(dt);
    p.coyote = p.grounded ? t.coyoteTime : Math.max(0, p.coyote - dt);
    if (p.coyote > 0 && jumpBuffer.take()) {
      vel.y = t.jumpSpeed;
      p.coyote = 0;
      p.grounded = false;
      p.rising = true;
      p.squashVel = -6; // stretch on take-off
      audio.blip({ freq: 520, slide: 1.8, vol: 0.12 });
      events.emit('jump', {});
    }
    if (p.rising && (!input.held('jump') || !controlsOn) && vel.y > 0) {
      vel.y *= t.jumpCut;
      p.rising = false;
    }
    if (vel.y <= 0) p.rising = false;

    // Gravity: stronger on the way down = snappy, not floaty.
    const g = t.gravity * (vel.y < 0 ? t.fallGravity : 1);
    vel.y = Math.max(vel.y - g * dt, -30);

    // Move, then push out of anything solid.
    const fallSpeed = -vel.y;
    pos.addScaledVector(vel, dt);
    const wasGrounded = p.grounded;
    p.grounded = collideSphere(solids, pos, vel, PLAYER_RADIUS);

    if (p.grounded) {
      if (!wasGrounded && fallSpeed > 3) {
        const k = Math.min(1, fallSpeed / 16);
        p.squashVel = 0;
        p.squashAmount = tune.feel.landSquash * (0.35 + 0.65 * k);
        audio.thud({ freq: 150, vol: 0.12 + 0.3 * k, length: 0.12 });
        if (k > 0.6) juice.shake(0.06 * k, 120);
        events.emit('land', { speed: fallSpeed });
      }
      // Remember the last place it was safe to stand (for respawn after a fall).
      if (groundAt(solids, pos.x, pos.z, pos.y) > -1 && Math.hypot(pos.x, pos.z) < 12.5) lastSafe.copy(pos);
    }

    // Face where we move.
    const speed = Math.hypot(vel.x, vel.z);
    if (speed > 0.5) {
      const want = Math.atan2(vel.x, vel.z);
      let d = want - p.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.facing += d * Math.min(1, t.turnSpeed * dt);
    }

    // Squash spring (critically-ish damped): amount > 0 = squashed, < 0 = stretched.
    const k = 220;
    const c = 18;
    p.squashVel += (-k * p.squashAmount - c * p.squashVel) * dt;
    p.squashAmount += p.squashVel * dt;
    if (!p.grounded && vel.y > 2) p.squashAmount = Math.min(p.squashAmount, -0.12);

    p.bob = p.grounded && speed > 1 ? p.bob + dt * speed * 2.6 : 0;
    if (p.invuln > 0) p.invuln -= dt;
  };

  const tmp = new THREE.Vector3();
  p.render = (alpha) => {
    tmp.lerpVectors(prev, pos, alpha);
    root.position.copy(tmp);
    root.rotation.y = p.facing;
    const s = p.squashAmount;
    squash.scale.set(1 + s * 0.6, 1 - s, 1 + s * 0.6);
    inner.position.y = PLAYER_RADIUS + Math.abs(Math.sin(p.bob)) * 0.09;
    inner.rotation.z = Math.sin(p.bob) * 0.08;
    // Blink while invulnerable.
    root.visible = p.invuln <= 0 || Math.floor(p.invuln * 12) % 2 === 0;

    const gy = groundAt(solids, tmp.x, tmp.z, tmp.y);
    if (gy === -Infinity) {
      blob.visible = false;
    } else {
      blob.visible = true;
      const h = tmp.y - PLAYER_RADIUS - gy;
      blob.position.set(tmp.x, gy + 0.02, tmp.z);
      const f = Math.max(0, 1 - h / 6);
      blob.scale.setScalar(0.6 + 0.4 * f);
      blob.material.opacity = 0.35 * f;
    }
  };

  p.mesh = root;
  return p;
}
