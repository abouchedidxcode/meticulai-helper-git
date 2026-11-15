// The final creature: Old Bramble. Big, slow, and it only ever does one of four things, each with a
// long, readable warning. Its numbers and the ORDER of its attacks are the data at the top.
//
//   ring    it swells, then throws a circle of slow seeds with a gap in it: walk through the gap
//   slam    patches appear under the player; thorns burst up a second later: keep moving
//   charge  it draws its path, then runs along it; a wall leaves it dizzy for a long time
//   summon  it calls a few small creatures (with the usual ground markers)
//
// Below half health it rests less between attacks and throws a second ring.
// The boss counts as a target for shots: { pos, radius } like any enemy.

import * as THREE from 'three';
import { apart, mergeParts, turnToward } from './shapes.js';

export const BOSS = {
  name: 'Old Bramble',
  hp: 110, radius: 1.7, speed: 1.6, rest: 1.1,
  pattern: ['ring', 'slam', 'charge', 'ring', 'summon', 'slam'],
  ring: { windup: 0.9, seeds: 14, gap: 3, speed: 4.8 },
  slam: { windup: 0.5, count: 3, radius: 2.1, warn: 1.0, every: 0.45 },
  charge: { windup: 1.0, speed: 14, time: 0.95, dizzy: 2.2 },
  summon: { windup: 0.7, kind: 'creeper', count: 3 },
  tips: {
    ring: 'One of Old Bramble\'s seeds hit you. Every ring has a gap: walk through it, or dash through the seeds.',
    slam: 'Thorns burst up under you. The patch on the ground closes for a full second first: keep moving.',
    charge: 'Old Bramble ran you down. It draws its path before it runs: step out of the strip and let it hit the wall.',
  },
};

export function createBoss({ scene, arena, look, tune, fx, audio, juice, rng, shots, enemies }) {
  const B = BOSS;
  const ground = look.base[0];
  const bodyColor = apart(look, look.mix(look.danger, look.shadow, 0.5), ground, 0.12);
  const warn = look.danger;
  const crown = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * 6.283;
    return { geo: new THREE.ConeGeometry(0.32, 1.3, 5), color: look.danger, at: [Math.cos(a) * 1.25, 1.9, Math.sin(a) * 1.25], rot: [Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0] };
  });
  const geo = mergeParts([
    { geo: new THREE.SphereGeometry(1.7, 12, 8), color: bodyColor, at: [0, 1.2, 0], scale: [1, 0.8, 1] },
    ...crown,
    { geo: new THREE.SphereGeometry(0.6, 8, 6), color: look.shade(bodyColor, 0.12), at: [0, 2.5, 0] },
    { geo: new THREE.SphereGeometry(0.22, 6, 5), color: look.shade(look.light, 0.5), at: [0.6, 1.5, 1.5] },
    { geo: new THREE.SphereGeometry(0.22, 6, 5), color: look.shade(look.light, 0.5), at: [-0.6, 1.5, 1.5] },
  ]);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, emissive: look.danger, emissiveIntensity: 0.3 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.visible = false;
  scene.add(mesh);
  // Health bar floating over it (always faces the camera).
  const barBack = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.34), new THREE.MeshBasicMaterial({ color: look.shadow, depthTest: false }));
  const barFill = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.2).translate(1.55, 0, 0), new THREE.MeshBasicMaterial({ color: look.danger, depthTest: false }));
  barBack.renderOrder = 5;
  barFill.renderOrder = 6;
  barBack.visible = barFill.visible = false;
  scene.add(barBack, barFill);

  const slams = []; // { x, z, t }
  const left = new THREE.Vector3();
  const b = {
    pos: { x: 0, z: 0 }, prev: { x: 0, z: 0 }, dir: { x: 0, z: 1 }, radius: B.radius, isBoss: true,
    hp: 0, state: 'away', t: 0, step: 0, attack: '', yaw: 0, flash: 0, pop: 0, run: 0, slamsLeft: 0, slamWait: 0, ringsLeft: 0,
    dead: false, slams,
    onDeath: null, // set by game.js
    get alive() {
      return b.state !== 'away' && b.state !== 'dying' && !b.dead;
    },
    get rage() {
      return b.hp <= B.hp / 2;
    },
  };

  const enter = (state) => { b.state = state; b.t = 0; };

  b.reset = () => {
    b.state = 'away';
    b.dead = false;
    b.hp = 0;
    slams.length = 0;
    mesh.visible = barBack.visible = barFill.visible = false;
  };

  b.arrive = (x, z) => {
    b.pos.x = b.prev.x = x;
    b.pos.z = b.prev.z = z;
    b.hp = B.hp;
    b.step = 0;
    b.dead = false;
    enter('rise');
    audio.thud({ freq: 60, vol: 0.6, length: 0.6 });
    audio.duck(0.4, 1500);
  };

  b.damage = (amount, dx, dz) => {
    if (!b.alive || b.state === 'rise') return;
    const before = b.rage;
    b.hp -= amount;
    b.flash = 0.06;
    b.pop = 0.1;
    audio.blip({ freq: 420, slide: 0.7, length: 0.05, vol: 0.07, type: 'square', vary: 2 });
    if (!before && b.rage && b.hp > 0) {
      // Half way: it shakes itself and speeds up. A big event, so the screen may shake a little.
      juice.shake(0.25, 350);
      audio.thud({ freq: 70, vol: 0.6, length: 0.4 });
      fx.burst(b.pos.x, 2, b.pos.z, { count: 16, color: [look.danger, bodyColor], speed: 7, up: 6, life: 0.7, size: 0.2 });
    }
    if (b.hp <= 0) {
      enter('dying');
      slams.length = 0;
      juice.hitStop(tune.feel.bossStopMs);
      juice.shake(tune.feel.bigShake, 500);
      audio.thud({ freq: 55, vol: 0.8, length: 0.7 });
    }
  };

  function startAttack(player) {
    b.attack = B.pattern[b.step++ % B.pattern.length];
    // Nothing to run at if the player is hugging it: slam instead.
    if (b.attack === 'charge' && !arena.lineClear(b.pos.x, b.pos.z, player.pos.x, player.pos.z)) b.attack = 'slam';
    if (b.attack === 'summon' && enemies.count > 5) b.attack = 'ring';
    enter('windup');
    if (b.attack === 'charge') audio.whoosh({ vol: 0.25, length: B.charge.windup, from: 150, to: 1200 });
    else audio.blip({ freq: 110, slide: 1.8, length: B[b.attack].windup * 0.9, vol: 0.12, type: 'sawtooth', vary: 0 });
  }

  function throwRing(offset) {
    const n = B.ring.seeds;
    const gapAt = rng.int(0, n - 1);
    for (let i = 0; i < n; i++) {
      if ((i - gapAt + n) % n < B.ring.gap) continue;
      const a = ((i + offset) / n) * Math.PI * 2;
      shots.spit(b.pos.x + Math.cos(a) * B.radius, b.pos.z + Math.sin(a) * B.radius, Math.cos(a), Math.sin(a), B.ring.speed * tune.enemies.shotSpeed, { radius: 0.34, tip: B.tips.ring });
    }
    audio.blip({ freq: 160, slide: 0.5, length: 0.2, vol: 0.16, type: 'sawtooth', vary: 0 });
    b.pop = 0.14;
  }

  // One fixed step. hurt({ tip, x, z }) when something of the boss's reaches the player.
  b.update = (dt, player, hurt) => {
    b.flash = Math.max(0, b.flash - dt);
    b.pop = Math.max(0, b.pop - dt);

    // Slam patches run on their own clock, whatever the boss is doing.
    for (let i = slams.length - 1; i >= 0; i--) {
      const s = slams[i];
      s.t -= dt;
      const u = Math.max(0, s.t / B.slam.warn);
      fx.disc(s.x, s.z, B.slam.radius, warn);
      fx.ring(s.x, s.z, B.slam.radius * (1 + u * 0.9), warn);
      fx.ring(s.x, s.z, B.slam.radius, warn);
      if (s.t > 0) continue;
      slams.splice(i, 1);
      fx.burst(s.x, 0.2, s.z, { count: 14, color: [look.danger, bodyColor], speed: 4, up: 9, life: 0.55, size: 0.22 });
      audio.thud({ freq: 80, vol: 0.5, length: 0.25 });
      juice.shake(0.12, 180);
      if (player.invuln <= 0 && Math.hypot(player.pos.x - s.x, player.pos.z - s.z) < B.slam.radius - 0.1) hurt({ tip: B.tips.slam, x: s.x, z: s.z });
    }
    if (b.state === 'away' || b.dead) return;

    b.prev.x = b.pos.x;
    b.prev.z = b.pos.z;
    b.t += dt;
    const dx = player.pos.x - b.pos.x;
    const dz = player.pos.z - b.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    let face = Math.atan2(dx, dz);

    if (b.state === 'rise') {
      if (b.t >= 1.1) enter('idle');
    } else if (b.state === 'idle') {
      // Drift toward the player, then pick the next attack from the pattern.
      if (dist > 5) { b.pos.x += (dx / dist) * B.speed * dt; b.pos.z += (dz / dist) * B.speed * dt; }
      if (b.t >= B.rest * (b.rage ? 0.6 : 1)) startAttack(player);
    } else if (b.state === 'windup') {
      const a = B[b.attack];
      const u = Math.min(1, b.t / a.windup);
      if (b.attack === 'ring') {
        fx.ring(b.pos.x, b.pos.z, B.radius * (1 + u * 0.8), warn);
      } else if (b.attack === 'charge') {
        if (u < 0.75) { b.dir.x = dx / dist; b.dir.z = dz / dist; }
        face = Math.atan2(b.dir.x, b.dir.z);
        let run = 0;
        while (run < a.speed * a.time && !arena.blocksShot(b.pos.x + b.dir.x * (run + B.radius), b.pos.z + b.dir.z * (run + B.radius))) run += 0.5;
        fx.lane(b.pos.x, b.pos.z, Math.atan2(-b.dir.z, b.dir.x), run + B.radius, B.radius * 2 * (0.4 + u * 0.6), warn);
      } else if (b.attack === 'summon') {
        fx.ring(b.pos.x, b.pos.z, B.radius * (1.8 - u * 0.8), warn);
      }
      if (b.t >= a.windup) {
        enter('act');
        if (b.attack === 'ring') { throwRing(0); b.ringsLeft = b.rage ? 1 : 0; }
        if (b.attack === 'slam') { b.slamsLeft = a.count + (b.rage ? 1 : 0); b.slamWait = 0; }
        if (b.attack === 'charge') audio.whoosh({ vol: 0.3, length: 0.3, from: 1400, to: 300 });
        if (b.attack === 'summon') {
          for (let i = 0; i < a.count; i++) {
            const ang = Math.atan2(dz, dx) + (i - (a.count - 1) / 2) * 0.9;
            const x = b.pos.x + Math.cos(ang) * (B.radius + 1.6);
            const z = b.pos.z + Math.sin(ang) * (B.radius + 1.6);
            if (arena.isFree(x, z, 0.7)) enemies.spawn(a.kind, x, z);
          }
        }
      }
    } else if (b.state === 'act') {
      if (b.attack === 'ring') {
        if (b.ringsLeft > 0 && b.t >= 0.7) { b.ringsLeft--; b.t = 0; throwRing(0.5); }
        else if (b.ringsLeft <= 0 && b.t >= 0.3) enter('idle');
      } else if (b.attack === 'slam') {
        b.slamWait -= dt;
        if (b.slamsLeft > 0 && b.slamWait <= 0) {
          // The first lands where the player is; the rest lead a little, so standing still or running straight both fail.
          const lead = (B.slam.count - b.slamsLeft) * 0.35;
          slams.push({ x: player.pos.x + player.vel.x * lead, z: player.pos.z + player.vel.z * lead, t: B.slam.warn });
          b.slamsLeft--;
          b.slamWait = B.slam.every;
          audio.blip({ freq: 140, slide: 1.6, length: 0.3, vol: 0.08, type: 'sine', vary: 1 });
        }
        if (b.slamsLeft <= 0 && b.t >= B.slam.every * B.slam.count + 0.4) enter('idle');
      } else if (b.attack === 'charge') {
        face = Math.atan2(b.dir.x, b.dir.z);
        b.pos.x += b.dir.x * B.charge.speed * dt;
        b.pos.z += b.dir.z * B.charge.speed * dt;
        fx.burst(b.pos.x, 0.1, b.pos.z, { count: 2, color: look.base[3], speed: 2.5, up: 3, life: 0.4, size: 0.2 });
        if (player.invuln <= 0 && dist < B.radius + tune.player.hurtRadius) hurt({ tip: B.tips.charge, x: b.pos.x, z: b.pos.z });
        const crashed = arena.pushOut(b.pos, B.radius * 0.8);
        if (crashed || b.t >= B.charge.time) {
          enter('dizzy');
          if (crashed) {
            juice.shake(0.3, 300);
            audio.thud({ freq: 65, vol: 0.7, length: 0.35 });
            fx.burst(b.pos.x + b.dir.x * B.radius, 1, b.pos.z + b.dir.z * B.radius, { count: 14, color: [look.base[2], look.danger], speed: 5, up: 5, life: 0.5, size: 0.2 });
          } else b.t = B.charge.dizzy * 0.6; // stopped by itself: a shorter rest
        }
      } else enter('idle');
    } else if (b.state === 'dizzy') {
      face = b.yaw + Math.sin(b.t * 9) * 0.5;
      if (b.t >= B.charge.dizzy) enter('idle');
    } else if (b.state === 'dying') {
      // It shudders, sheds petals, then bursts into a ring of flowers.
      if (rng.chance(0.4)) fx.burst(b.pos.x + rng.range(-1, 1), 1.5, b.pos.z + rng.range(-1, 1), { count: 3, color: [look.danger, look.shade(look.light, 0.4), look.accent[0]], speed: 4, up: 5, life: 0.6, size: 0.18 });
      if (b.t >= 1.1) {
        b.dead = true;
        mesh.visible = barBack.visible = barFill.visible = false;
        fx.burst(b.pos.x, 1.5, b.pos.z, { count: 50, color: [look.danger, look.shade(look.light, 0.4), look.accent[0]], speed: 9, up: 9, life: 1, size: 0.24 });
        for (let i = 0; i < 14; i++) fx.flower(b.pos.x + Math.cos(i * 0.9) * (0.4 + i * 0.16), b.pos.z + Math.sin(i * 0.9) * (0.4 + i * 0.16));
        b.onDeath?.();
      }
      return;
    }

    if (b.state !== 'act' || b.attack !== 'charge') arena.pushOut(b.pos, B.radius * 0.95);
    // The player can't walk through it (and is not hurt by touching it).
    if (dist < B.radius + 0.35 && !(b.state === 'act' && b.attack === 'charge')) {
      player.pos.x = b.pos.x + (dx / dist) * (B.radius + 0.35);
      player.pos.z = b.pos.z + (dz / dist) * (B.radius + 0.35);
    }
    b.yaw = turnToward(b.yaw, face, 4 * dt);
  };

  b.render = (alpha, time, camera) => {
    const show = b.state !== 'away' && !b.dead;
    mesh.visible = show;
    barBack.visible = barFill.visible = show && b.state !== 'rise' && b.state !== 'dying';
    if (!show) return;
    const x = b.prev.x + (b.pos.x - b.prev.x) * alpha;
    const z = b.prev.z + (b.pos.z - b.prev.z) * alpha;
    let s = 1;
    let sy = 1 + Math.sin(time * 3) * 0.04;
    let bright = 1;
    let shake = 0;
    if (b.state === 'rise') { s = Math.min(1, b.t / 1.1); sy = s * (1.25 - 0.25 * s); shake = 0.06; }
    if (b.state === 'windup') {
      const u = Math.min(1, b.t / B[b.attack].windup);
      s = 1 + u * 0.14;
      sy = 1 + u * 0.12;
      bright = 1.2 + u * 1.1 + Math.sin(time * 36) * 0.25;
      shake = 0.05 * u;
    }
    if (b.state === 'dying') { shake = 0.14; bright = 1.5 + Math.sin(time * 50); s = 1 - b.t * 0.25; }
    if (b.pop > 0) { s *= 1 + b.pop * 1.2; sy *= 1 - b.pop; }
    if (b.flash > 0) bright = 4;
    mesh.position.set(x + Math.sin(time * 67) * shake, 0, z + Math.cos(time * 59) * shake);
    mesh.rotation.y = b.yaw;
    mesh.scale.set(s, s * sy, s);
    mat.color.setScalar(bright);
    barBack.position.set(x, 4.3, z);
    barBack.quaternion.copy(camera.quaternion);
    barFill.quaternion.copy(camera.quaternion);
    barFill.position.set(x, 4.3, z).add(left.set(-1.55, 0, 0).applyQuaternion(camera.quaternion));
    barFill.scale.x = Math.max(0.001, b.hp / B.hp);
  };

  return b;
}
