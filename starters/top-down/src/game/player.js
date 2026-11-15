// The player: a small garden robot. 8-way movement that starts and stops fast, aiming at the
// ground point under the mouse (or with the right stick), hold-to-fire, and a short dash with
// invincibility. Every number is in tuning.json (groups "player", "shooting", "dash").
//
// Aiming has three modes, picked by whatever the player touched last:
//   'mouse'  aim at the ground under the cursor
//   'stick'  the gamepad's right stick; when the stick is let go, the last aim is kept
//   'auto'   no mouse or stick yet (keyboard only, or touch): aim at the nearest enemy in sight
// To swap the robot for a model, replace buildBody(); keep +z as "forward".

import * as THREE from 'three';
import { makeBuffer } from '../core/input.js';
import { apart, mergeParts } from './shapes.js';

export const PLAYER_RADIUS = 0.5; // for walls. The radius that can be HURT is smaller: tune.player.hurtRadius

function buildBody(look) {
  const dark = apart(look, look.mix(look.shadow, look.player, 0.15), look.player, 0.3);
  return mergeParts([
    { geo: new THREE.CylinderGeometry(0.4, 0.5, 0.34, 10), color: look.mix(look.player, look.shadow, 0.4), at: [0, 0.27, 0] },
    { geo: new THREE.SphereGeometry(0.47, 12, 8), color: look.player, at: [0, 0.74, 0], scale: [1, 1.05, 1] },
    { geo: new THREE.BoxGeometry(0.52, 0.17, 0.2), color: dark, at: [0, 0.88, 0.36] }, // visor: shows which way it faces
    { geo: new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8), color: look.mix(look.player, look.base[2], 0.5), at: [0, 0.74, -0.42] }, // water tank
    { geo: new THREE.CylinderGeometry(0.09, 0.12, 0.7, 6), color: dark, at: [0.36, 0.6, 0.38], rot: [Math.PI / 2, 0, 0] }, // hose
    { geo: new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), color: dark, at: [-0.15, 1.35, -0.1] },
    { geo: new THREE.SphereGeometry(0.07, 6, 5), color: look.light, at: [-0.15, 1.57, -0.1] },
  ]);
}

export function createPlayer({ scene, arena, look, tune, input, audio, events, fx, rig, shots, rng }) {
  input.define('fire', ['mouse:0', 'KeyJ', 'KeyF', 'pad:7', 'pad:5']);
  input.define('dash', ['Space', 'ShiftLeft', 'ShiftRight', 'mouse:2', 'pad:0', 'pad:6', 'pad:4', 'touch:right']);

  const ground = look.base[0];
  const markColor = apart(look, look.player, ground, 0.2);
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const bodyGeo = buildBody(look);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  group.add(body);
  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: apart(look, look.shade(look.light, 0.5), ground, 0.25) }));
  flash.visible = false;
  group.add(flash);
  scene.add(group);

  // Afterimages for the dash: a few see-through copies left behind, fading.
  const ghosts = Array.from({ length: 5 }, () => {
    const m = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: markColor, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false;
    scene.add(m);
    return { mesh: m, life: 0 };
  });
  let ghostNext = 0;
  let ghostTimer = 0;

  const dashBuffer = makeBuffer(tune.dash.buffer);
  const aimPoint = { x: 0, z: 0 };
  const p = {
    pos: { x: 0, z: 0 }, prev: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    aim: { x: 0, z: -1 }, aimPoint, aimMode: 'auto', yaw: Math.PI,
    invuln: 0, hurtTime: 0, dashTime: 0, dashCooldown: 0, dashDir: { x: 0, z: -1 },
    fireWait: 0, flashTime: 0, readyPop: 0, shotsFired: 0, autoFire: false, autoTarget: null, group,
  };
  let lastMouseX = -1;
  let lastMouseY = -1;
  window.addEventListener('touchstart', () => { p.aimMode = 'auto'; p.autoFire = true; }, { passive: true });

  p.reset = (x, z) => {
    p.pos.x = p.prev.x = x;
    p.pos.z = p.prev.z = z;
    p.vel.x = p.vel.z = 0;
    p.aim.x = 0; p.aim.z = -1;
    aimPoint.x = x; aimPoint.z = z - 6;
    p.invuln = p.hurtTime = p.dashTime = p.dashCooldown = p.fireWait = p.flashTime = p.readyPop = 0;
    p.shotsFired = 0;
    dashBuffer.clear();
    for (const g of ghosts) { g.life = 0; g.mesh.visible = false; }
    lastMouseX = input.mouse.x;
    lastMouseY = input.mouse.y;
  };

  // Knocked by something at (fromX, fromZ): pushed away, invincible for a while.
  p.hurt = (fromX, fromZ) => {
    const dx = p.pos.x - fromX;
    const dz = p.pos.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    p.vel.x = (dx / d) * tune.feel.hurtKnock;
    p.vel.z = (dz / d) * tune.feel.hurtKnock;
    p.invuln = p.hurtTime = tune.feel.hurtInvuln;
    p.dashTime = 0;
  };

  function updateAim(targets) {
    const stick = input.aim();
    const mouse = input.mouse;
    p.autoTarget = null;
    if (Math.hypot(stick.x, stick.y) > 0.35) {
      p.aimMode = 'stick';
      const l = Math.hypot(stick.x, stick.y);
      p.aim.x = stick.x / l;
      p.aim.z = stick.y / l; // stick down = toward the camera = +z
    } else if (mouse.x !== lastMouseX || mouse.y !== lastMouseY) {
      p.aimMode = 'mouse';
      p.autoFire = false;
    }
    lastMouseX = mouse.x;
    lastMouseY = mouse.y;

    if (p.aimMode === 'mouse' && rig.groundPoint(mouse.x, mouse.y, aimPoint)) {
      const dx = aimPoint.x - p.pos.x;
      const dz = aimPoint.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.25) { p.aim.x = dx / d; p.aim.z = dz / d; }
      return;
    }
    if (p.aimMode === 'auto') {
      // Nearest enemy in sight; with none, face the way we walk.
      let best = null;
      let bestD = 15;
      for (const t of targets) {
        const d = Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
        if (d < bestD && arena.lineClear(p.pos.x, p.pos.z, t.pos.x, t.pos.z)) { bestD = d; best = t; }
      }
      p.autoTarget = best;
      if (best) { p.aim.x = (best.pos.x - p.pos.x) / bestD; p.aim.z = (best.pos.z - p.pos.z) / bestD; }
      else if (Math.hypot(p.vel.x, p.vel.z) > 1) { const s = Math.hypot(p.vel.x, p.vel.z); p.aim.x = p.vel.x / s; p.aim.z = p.vel.z / s; }
    }
    // Stick and auto: the aim point is a fixed reach along the aim direction (the stick keeps its last aim).
    aimPoint.x = p.pos.x + p.aim.x * tune.shooting.stickReach;
    aimPoint.z = p.pos.z + p.aim.z * tune.shooting.stickReach;
  }

  function fire(targets) {
    const s = tune.shooting;
    // The shot leaves the hose (to the side of the body) but flies to the aim point, so what you
    // point at is what you hit. Very close aim points are pushed out so shots never cross over.
    const rx = -p.aim.z;
    const rz = p.aim.x;
    const mx = p.pos.x + p.aim.x * 0.62 - rx * 0.36;
    const mz = p.pos.z + p.aim.z * 0.62 - rz * 0.36;
    const reach = Math.max(s.minConverge, Math.hypot(aimPoint.x - p.pos.x, aimPoint.z - p.pos.z));
    let dx = p.pos.x + p.aim.x * reach - mx;
    let dz = p.pos.z + p.aim.z * reach - mz;
    let ang = Math.atan2(dz, dx);

    // Aim magnetism: bend the shot part of the way toward the enemy nearest to the aim line.
    let bestOff = (s.assistAngle * Math.PI) / 180;
    let bend = 0;
    for (const t of targets) {
      const tx = t.pos.x - mx;
      const tz = t.pos.z - mz;
      const d = Math.hypot(tx, tz);
      if (d > s.range || d < 0.5) continue;
      let off = Math.atan2(tz, tx) - ang;
      if (off > Math.PI) off -= Math.PI * 2;
      if (off < -Math.PI) off += Math.PI * 2;
      if (Math.abs(off) < bestOff) { bestOff = Math.abs(off); bend = off; }
    }
    ang += bend * s.assist + rng.range(-1, 1) * (s.spread * Math.PI) / 180;
    dx = Math.cos(ang);
    dz = Math.sin(ang);

    shots.fire(mx, mz, dx, dz);
    p.fireWait = 1 / s.fireRate;
    p.flashTime = s.flashTime;
    p.shotsFired++;
    audio.blip({ freq: 250, slide: 0.5, length: 0.07, vol: 0.13, type: 'triangle', vary: s.pitchVary });
    audio.whoosh({ vol: 0.07, length: 0.07, from: 3200, to: 900 });
    events.emit('shoot', {});
  }

  // One fixed step. on: false while the run is ending (no control). targets: things to aim at.
  p.update = (dt, on, targets) => {
    const t = tune.player;
    const d = tune.dash;
    p.prev.x = p.pos.x;
    p.prev.z = p.pos.z;
    const stick = on ? input.move() : { x: 0, y: 0 };
    const wx = stick.x;
    const wz = -stick.y; // stick up = away from the camera = -z
    const wl = Math.hypot(wx, wz);
    if (on) updateAim(targets);

    // Dash: buffered, so pressing a moment early (still dashing, or just before it is ready) counts.
    dashBuffer.window = d.buffer;
    if (on && input.pressed('dash')) dashBuffer.set();
    dashBuffer.tick(dt);
    const wasCooling = p.dashCooldown > 0;
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    if (wasCooling && p.dashCooldown === 0) {
      p.readyPop = 0.18;
      audio.blip({ freq: 880, slide: 1.3, length: 0.05, vol: 0.05, vary: 0 });
    }
    if (on && p.dashTime <= 0 && p.dashCooldown <= 0 && dashBuffer.take()) {
      // Dash the way you push; standing still, dash the way you aim.
      p.dashDir.x = wl > 0.2 ? wx / wl : p.aim.x;
      p.dashDir.z = wl > 0.2 ? wz / wl : p.aim.z;
      p.dashTime = d.time;
      p.dashCooldown = d.cooldown;
      p.invuln = Math.max(p.invuln, d.invuln);
      ghostTimer = 0;
      audio.whoosh({ vol: 0.22, length: 0.2, from: 500, to: 2600 });
      fx.burst(p.pos.x, 0.2, p.pos.z, { count: 6, color: markColor, speed: 2.5, up: 1.5, life: 0.3, size: 0.12, dirX: -p.dashDir.x * 0.6, dirZ: -p.dashDir.z * 0.6 });
      events.emit('dash', {});
    }

    if (p.dashTime > 0) {
      p.dashTime -= dt;
      const speed = d.distance / d.time;
      p.vel.x = p.dashDir.x * speed;
      p.vel.z = p.dashDir.z * speed;
      if (p.dashTime <= 0) { p.vel.x = p.dashDir.x * t.speed; p.vel.z = p.dashDir.z * t.speed; }
      ghostTimer -= dt;
      if (ghostTimer <= 0) {
        ghostTimer = d.time / 4;
        const g = ghosts[ghostNext++ % ghosts.length];
        g.life = 1;
        g.mesh.visible = true;
        g.mesh.position.set(p.pos.x, 0, p.pos.z);
        g.mesh.rotation.y = p.yaw;
      }
    } else {
      // Move the velocity toward the wanted one by a fixed amount per second: quick to start, quicker to stop.
      const tx = wx * t.speed;
      const tz = wz * t.speed;
      const ex = tx - p.vel.x;
      const ez = tz - p.vel.z;
      const el = Math.hypot(ex, ez);
      const step = (wl > 0.05 ? t.accel : t.brake) * dt;
      if (el <= step) { p.vel.x = tx; p.vel.z = tz; }
      else { p.vel.x += (ex / el) * step; p.vel.z += (ez / el) * step; }
    }
    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    arena.pushOut(p.pos, PLAYER_RADIUS);

    p.invuln = Math.max(0, p.invuln - dt);
    p.hurtTime = Math.max(0, p.hurtTime - dt);
    p.readyPop = Math.max(0, p.readyPop - dt);
    p.flashTime = Math.max(0, p.flashTime - dt);
    p.fireWait = Math.max(0, p.fireWait - dt);
    const wantsFire = input.held('fire') || (p.autoFire && p.autoTarget);
    if (on && wantsFire && p.fireWait <= 0 && p.dashTime <= 0) fire(targets);

    // Feet marker: where you are, and the dash cooldown (the disc grows back; the ring pops when ready).
    const ready = 1 - p.dashCooldown / Math.max(0.01, d.cooldown);
    fx.ring(p.pos.x, p.pos.z, 0.72 + p.readyPop * 2.2, ready >= 1 ? markColor : look.mix(markColor, ground, 0.55));
    if (ready < 1) fx.disc(p.pos.x, p.pos.z, 0.68 * ready, markColor);

    for (const g of ghosts) {
      if (g.life <= 0) continue;
      g.life -= dt / tune.dash.trail;
      g.mesh.material.opacity = Math.max(0, g.life) * 0.45;
      if (g.life <= 0) g.mesh.visible = false;
    }
    p.yaw = Math.atan2(p.aim.x, p.aim.z);
  };

  p.render = (alpha, time) => {
    const x = p.prev.x + (p.pos.x - p.prev.x) * alpha;
    const z = p.prev.z + (p.pos.z - p.prev.z) * alpha;
    const speed = Math.hypot(p.vel.x, p.vel.z);
    group.position.set(x, 0, z);
    group.rotation.y = p.yaw;
    // Lean into the movement (in the body's own frame), bob while moving, kick back on a shot.
    const fwd = (p.vel.x * p.aim.x + p.vel.z * p.aim.z) / 30;
    const side = (p.vel.x * -p.aim.z + p.vel.z * p.aim.x) / 30;
    body.rotation.x = fwd;
    body.rotation.z = side;
    body.position.y = speed > 1 ? Math.abs(Math.sin(time * 14)) * 0.06 : Math.sin(time * 2.5) * 0.02 + 0.02;
    body.position.z = -(p.flashTime / Math.max(0.01, tune.shooting.flashTime)) * 0.08;
    // Hurt: flash bright, then blink while invincible.
    const flashing = p.hurtTime > tune.feel.hurtInvuln - 0.12;
    bodyMat.color.setScalar(flashing ? 4 : 1);
    body.visible = p.hurtTime <= 0 || flashing || Math.floor(time * 14) % 2 === 0;
    flash.visible = p.flashTime > 0;
    if (flash.visible) {
      const k = p.flashTime / Math.max(0.01, tune.shooting.flashTime);
      flash.position.set(0.36, 0.6, 0.85);
      flash.scale.set(0.6 + k * 0.5, 0.6 + k * 0.5, 1 + k * 1.2);
      flash.rotation.z = p.shotsFired * 1.3;
    }
  };

  return p;
}
