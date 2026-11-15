// The enemies. Each KIND is a row of data plus one of three attack styles, and every attack goes
// through the same four phases so it is always fair:
//
//   seek -> windup (THE WARNING: a ground marker, a swell, a sound) -> strike (short) -> recover (open)
//
// An enemy can only hurt the player during "strike". Walking into one never hurts.
// To add a kind: add a row to KINDS and a shape to buildShapes(). To add an attack style, add a
// case in the three places marked ATTACK STYLES. Global fairness knobs are in tuning.json "enemies".

import * as THREE from 'three';
import { apart, instanced, mergeParts, turnToward } from './shapes.js';

// speed m/s, radius m, times in seconds. range = how close before it starts an attack.
// knock = how far a hit pushes it (1 = normal). tip = the end card's advice when this kind wins.
export const KINDS = {
  creeper: {
    hp: 2, speed: 3.6, radius: 0.55, attack: 'bite', range: 1.9, windup: 0.45, strike: 0.16, strikeSpeed: 10, recover: 0.7,
    knock: 1, gems: 1, score: 10,
    tip: 'A creeper snapped at you. It swells and marks the ground before it bites: step out of the patch, or dash through.',
  },
  ram: {
    hp: 6, speed: 2.3, radius: 0.85, attack: 'charge', range: 8.5, windup: 0.85, strike: 0.6, strikeSpeed: 15, recover: 1.3,
    knock: 0.3, gems: 3, score: 30,
    tip: 'A bramble ram ran you over. It shakes and draws its path first: step aside, then hose it while it is dizzy.',
  },
  spitter: {
    hp: 3, speed: 2.4, radius: 0.6, attack: 'spit', range: 9, keep: 6, windup: 0.6, strike: 0, shotSpeed: 6, recover: 1.7,
    knock: 0.8, gems: 2, score: 20,
    tip: 'A spitter seed hit you. Seeds fly slowly: walk around them, or dash straight through.',
  },
};

function buildShapes(look, body, thorn) {
  const eye = look.shade(look.light, 0.5);
  const ring = (n, r, y, make) => Array.from({ length: n }, (_, i) => make(Math.cos((i / n) * 6.283) * r, y, Math.sin((i / n) * 6.283) * r, (i / n) * 6.283));
  return {
    // A low, round crawler with a crown of thorns. Forward is +z.
    creeper: mergeParts([
      { geo: new THREE.SphereGeometry(0.55, 9, 6), color: body, at: [0, 0.36, 0], scale: [1, 0.62, 1] },
      ...ring(6, 0.34, 0.62, (x, y, z, a) => ({ geo: new THREE.ConeGeometry(0.11, 0.42, 4), color: thorn, at: [x, y, z], rot: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9] })),
      { geo: new THREE.SphereGeometry(0.09, 5, 4), color: eye, at: [0.2, 0.42, 0.46] },
      { geo: new THREE.SphereGeometry(0.09, 5, 4), color: eye, at: [-0.2, 0.42, 0.46] },
    ]),
    // A heavy wedge with two horns pointing forward.
    ram: mergeParts([
      { geo: new THREE.SphereGeometry(0.8, 9, 6), color: body, at: [0, 0.6, -0.05], scale: [0.95, 0.75, 1.2] },
      { geo: new THREE.ConeGeometry(0.2, 0.9, 5), color: thorn, at: [0.38, 0.62, 0.95], rot: [Math.PI / 2, 0, 0] },
      { geo: new THREE.ConeGeometry(0.2, 0.9, 5), color: thorn, at: [-0.38, 0.62, 0.95], rot: [Math.PI / 2, 0, 0] },
      ...ring(4, 0.45, 1.05, (x, y, z) => ({ geo: new THREE.ConeGeometry(0.14, 0.5, 4), color: thorn, at: [x * 0.8, y, z - 0.2] })),
      { geo: new THREE.SphereGeometry(0.1, 5, 4), color: eye, at: [0.26, 0.86, 0.72] },
      { geo: new THREE.SphereGeometry(0.1, 5, 4), color: eye, at: [-0.26, 0.86, 0.72] },
    ]),
    // A stalk with a bulb head and an open mouth.
    spitter: mergeParts([
      { geo: new THREE.CylinderGeometry(0.16, 0.34, 0.95, 6), color: body, at: [0, 0.48, 0] },
      { geo: new THREE.SphereGeometry(0.46, 8, 6), color: body, at: [0, 1.15, 0] },
      { geo: new THREE.ConeGeometry(0.3, 0.5, 6), color: thorn, at: [0, 1.15, 0.5], rot: [-Math.PI / 2, 0, 0] },
      ...ring(5, 0.5, 0.95, (x, y, z, a) => ({ geo: new THREE.ConeGeometry(0.1, 0.4, 4), color: thorn, at: [x, y, z], rot: [Math.sin(a) * 1.9, 0, -Math.cos(a) * 1.9] })),
    ]),
  };
}

export function createEnemies({ scene, arena, look, tune, fx, audio, rng, shots }) {
  const ground = look.base[0];
  const thorn = look.danger;
  const body = apart(look, look.mix(look.danger, look.shadow, 0.45), ground, 0.12);
  const warn = look.danger; // every warning on the ground is the danger colour
  const petals = [look.danger, look.shade(look.light, 0.4), look.accent[0]];
  const shapes = buildShapes(look, body, thorn);
  // A faint glow in the danger colour, so they still read as danger in a dark palette.
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, emissive: look.danger, emissiveIntensity: 0.3 });
  const meshes = {};
  for (const kind of Object.keys(KINDS)) meshes[kind] = instanced(scene, shapes[kind], mat, 48, { shadow: true, colors: true });

  const list = [];
  const pending = []; // spawn markers: { kind, x, z, t, warn }
  const dir = { x: 0, z: 0 };
  let nextId = 0;

  function enter(e, state) {
    e.state = state;
    e.t = 0;
  }

  // How far a charge can go before a wall stops it (for drawing the path).
  function clearRun(x, z, dx, dz, max) {
    let d = 0;
    while (d < max && !arena.blocksShot(x + dx * (d + 0.5), z + dz * (d + 0.5), 0.3)) d += 0.5;
    return Math.min(max, d + 0.5);
  }

  const api = {
    list,
    pending,
    onKill: null, // set by game.js: (enemy) => {}
    get count() {
      return list.length + pending.length;
    },

    // Ask for an enemy. It appears after a ground marker has warned for tune.enemies.spawnWarn seconds.
    spawn(kind, x, z, warnTime = tune.enemies.spawnWarn) {
      pending.push({ kind, x, z, t: warnTime, warn: Math.max(0.01, warnTime) });
      audio.blip({ freq: 150, slide: 1.5, length: 0.25, vol: 0.05, type: 'sine', vary: 1 });
    },

    // A shot (or anything) hits an enemy. (dx, dz) = the direction it is pushed.
    damage(e, amount, dx, dz) {
      if (e.hp <= 0) return;
      e.hp -= amount;
      e.flash = 0.07;
      e.pop = 0.12;
      const push = tune.feel.knockback * e.k.knock * (e.state === 'strike' ? 0.2 : 1);
      e.kx += dx * push;
      e.kz += dz * push;
      if (e.hp > 0) {
        audio.blip({ freq: 620, slide: 0.7, length: 0.04, vol: 0.07, type: 'square', vary: 2 });
        return;
      }
      list.splice(list.indexOf(e), 1);
      // The death pop: petals, a flower where it stood, a soft thump.
      fx.burst(e.pos.x, 0.6, e.pos.z, { count: 10 + e.k.gems * 3, color: petals, speed: 5, up: 5, life: 0.6, size: 0.17, dirX: dx * 0.4, dirZ: dz * 0.4 });
      fx.flower(e.pos.x, e.pos.z);
      audio.thud({ freq: 190, vol: 0.3, length: 0.12, vary: 2 });
      audio.blip({ freq: 520, slide: 2, length: 0.09, vol: 0.08, vary: 1 });
      api.onKill?.(e);
    },

    // One fixed step. hurt({ tip, x, z }) is called when a strike reaches the player.
    update(dt, player, hurt, active = true) {
      const T = tune.enemies;
      const px = player.pos.x;
      const pz = player.pos.z;

      // Spawn markers: a ring closing on the spot. Never appear on top of the player.
      for (let i = pending.length - 1; i >= 0; i--) {
        const m = pending[i];
        const k = KINDS[m.kind];
        m.t -= dt;
        const u = Math.max(0, m.t / m.warn);
        fx.disc(m.x, m.z, k.radius * 1.1, warn);
        fx.ring(m.x, m.z, k.radius * (1.1 + u * 1.6), warn);
        if (m.t > 0) continue;
        if (Math.hypot(m.x - px, m.z - pz) < k.radius + 1.6) continue; // wait until they step off
        pending.splice(i, 1);
        list.push({
          id: nextId++, kind: m.kind, k, radius: k.radius, pos: { x: m.x, z: m.z }, prev: { x: m.x, z: m.z }, kx: 0, kz: 0,
          dir: { x: 0, z: 1 }, yaw: Math.atan2(px - m.x, pz - m.z), hp: k.hp, state: 'rise', t: 0,
          wait: rng.range(0.2, 0.7), flash: 0, pop: 0, side: rng.chance(0.5) ? 1 : -1, run: 0,
        });
        fx.burst(m.x, 0.2, m.z, { count: 6, color: [body, look.base[1]], speed: 3, up: 4, life: 0.4, size: 0.14 });
      }

      arena.updateFlow(px, pz);
      let attackers = 0;
      for (const e of list) if (e.state === 'windup' || e.state === 'strike') attackers++;

      for (const e of list) {
        const k = e.k;
        e.prev.x = e.pos.x;
        e.prev.z = e.pos.z;
        e.t += dt;
        e.flash = Math.max(0, e.flash - dt);
        e.pop = Math.max(0, e.pop - dt);
        const dx = px - e.pos.x;
        const dz = pz - e.pos.z;
        const dist = Math.hypot(dx, dz) || 0.001;
        let mx = 0;
        let mz = 0;
        let face = e.yaw;

        if (e.state === 'rise') {
          if (e.t >= 0.35) enter(e, 'seek');
        } else if (e.state === 'seek') {
          e.wait -= dt;
          const sees = arena.lineClear(e.pos.x, e.pos.z, px, pz);
          if (sees || !arena.flowDir(e.pos.x, e.pos.z, dir)) { dir.x = dx / dist; dir.z = dz / dist; }
          const speed = k.speed * T.speed;
          // ATTACK STYLES (1 of 3): how each one moves while looking for an opening.
          if (k.attack === 'spit' && sees && dist < k.keep + 1) {
            const back = dist < k.keep - 1 ? -0.7 : 0; // too close: back off. In the band: drift sideways.
            mx = (dir.x * back - dir.z * e.side * 0.45) * speed;
            mz = (dir.z * back + dir.x * e.side * 0.45) * speed;
          } else {
            mx = dir.x * speed;
            mz = dir.z * speed;
          }
          face = Math.atan2(sees ? dx : dir.x, sees ? dz : dir.z);
          if (active && e.wait <= 0 && sees && dist < k.range && attackers < T.maxAttackers) {
            attackers++;
            enter(e, 'windup');
            e.dir.x = dx / dist;
            e.dir.z = dz / dist;
            if (k.attack === 'bite') audio.blip({ freq: 240, slide: 1.5, length: k.windup * 0.8, vol: 0.06, type: 'sawtooth', vary: 2 });
            else if (k.attack === 'charge') audio.whoosh({ vol: 0.16, length: k.windup * T.telegraph, from: 200, to: 1400 });
            else audio.blip({ freq: 330, slide: 1.8, length: k.windup * 0.8, vol: 0.06, type: 'triangle', vary: 1 });
          }
        } else if (e.state === 'windup') {
          const len = k.windup * T.telegraph;
          const u = Math.min(1, e.t / len);
          // Rams and spitters keep turning toward the player for most of the warning, then commit.
          if (k.attack !== 'bite' && u < 0.75) { e.dir.x = dx / dist; e.dir.z = dz / dist; }
          face = Math.atan2(e.dir.x, e.dir.z);
          // ATTACK STYLES (2 of 3): the warning each one draws on the ground.
          if (k.attack === 'bite') {
            const reach = k.strikeSpeed * k.strike;
            fx.disc(e.pos.x + e.dir.x * reach * 0.6, e.pos.z + e.dir.z * reach * 0.6, k.radius + reach * 0.55, warn);
            fx.ring(e.pos.x + e.dir.x * reach * 0.6, e.pos.z + e.dir.z * reach * 0.6, (k.radius + reach * 0.55) * (1.6 - u * 0.6), warn);
          } else if (k.attack === 'charge') {
            e.run = clearRun(e.pos.x, e.pos.z, e.dir.x, e.dir.z, k.strikeSpeed * k.strike);
            fx.lane(e.pos.x, e.pos.z, Math.atan2(-e.dir.z, e.dir.x), e.run + k.radius, k.radius * 2 * (0.4 + u * 0.6), warn);
          } else {
            fx.ring(e.pos.x, e.pos.z, k.radius * (2.2 - u * 1.1), warn);
            fx.lane(e.pos.x, e.pos.z, Math.atan2(-e.dir.z, e.dir.x), 2.5, 0.18, warn);
          }
          if (e.t >= len) {
            enter(e, 'strike');
            if (k.attack === 'spit') {
              shots.spit(e.pos.x + e.dir.x * 0.7, e.pos.z + e.dir.z * 0.7, e.dir.x, e.dir.z, k.shotSpeed * T.shotSpeed, { tip: k.tip });
              audio.blip({ freq: 200, slide: 0.5, length: 0.12, vol: 0.1, type: 'sawtooth', vary: 1 });
              enter(e, 'recover');
            } else {
              audio.whoosh({ vol: k.attack === 'charge' ? 0.25 : 0.12, length: 0.2, from: 1500, to: 400 });
            }
          }
        } else if (e.state === 'strike') {
          // ATTACK STYLES (3 of 3): the strike itself. Only here can the player be hurt.
          mx = e.dir.x * k.strikeSpeed;
          mz = e.dir.z * k.strikeSpeed;
          face = Math.atan2(e.dir.x, e.dir.z);
          if (k.attack === 'charge') fx.burst(e.pos.x, 0.1, e.pos.z, { count: 1, color: look.base[3], speed: 1.5, up: 2, life: 0.35, size: 0.16 });
          if (player.invuln <= 0 && dist < k.radius + tune.player.hurtRadius + 0.15) hurt({ tip: k.tip, x: e.pos.x, z: e.pos.z });
          if (e.t >= k.strike) enter(e, 'recover');
        } else if (e.state === 'recover') {
          if (e.t >= k.recover) {
            enter(e, 'seek');
            e.wait = rng.range(0.3, 0.9); // so a group doesn't attack in step
          }
        }

        // Move: its own walking plus the push from being hit (which fades fast).
        const striking = e.state === 'strike';
        e.pos.x += (mx + (striking ? 0 : e.kx)) * dt;
        e.pos.z += (mz + (striking ? 0 : e.kz)) * dt;
        const fade = Math.exp(-9 * dt);
        e.kx *= fade;
        e.kz *= fade;
        const bumped = arena.pushOut(e.pos, k.radius);
        if (bumped && striking && k.attack === 'charge' && e.t > 0.08) {
          // A ram that hits a wall is dizzy for longer: a reward for baiting it.
          enter(e, 'recover');
          e.t = -0.6;
          fx.burst(e.pos.x, 0.7, e.pos.z, { count: 8, color: [look.base[2], thorn], speed: 4, up: 4, life: 0.45, size: 0.15 });
          audio.thud({ freq: 90, vol: 0.4, length: 0.2 });
        }
        // Never stand inside the player (except mid-strike): they crowd round instead of stacking on top.
        if (!striking && dist < k.radius + 0.4) {
          e.pos.x = px - (dx / dist) * (k.radius + 0.4);
          e.pos.z = pz - (dz / dist) * (k.radius + 0.4);
        }
        e.yaw = turnToward(e.yaw, face, 9 * dt);
      }

      // Separation: overlapping enemies push each other apart, so a crowd spreads into a ring.
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          const sx = b.pos.x - a.pos.x;
          const sz = b.pos.z - a.pos.z;
          const d = Math.hypot(sx, sz) || 0.001;
          const overlap = (a.k.radius + b.k.radius) * T.spacing - d;
          if (overlap <= 0) continue;
          const push = overlap * 0.5 * Math.min(1, T.separation * dt * 10);
          const wa = a.state === 'strike' ? 0 : 1; // a striking enemy is not shoved off its line
          const wb = b.state === 'strike' ? 0 : 1;
          a.pos.x -= (sx / d) * push * wa; a.pos.z -= (sz / d) * push * wa;
          b.pos.x += (sx / d) * push * wb; b.pos.z += (sz / d) * push * wb;
        }
      }
    },

    render(alpha, time) {
      for (const kind of Object.keys(meshes)) meshes[kind].begin();
      for (const e of list) {
        const k = e.k;
        let x = e.prev.x + (e.pos.x - e.prev.x) * alpha;
        const z = e.prev.z + (e.pos.z - e.prev.z) * alpha;
        let s = 1;
        let sy = 1 + Math.sin(time * 7 + e.id * 1.7) * 0.06; // breathing
        let sz = 1;
        let bright = 1;
        let yaw = e.yaw;
        if (e.state === 'rise') {
          s = Math.min(1, e.t / 0.35);
          sy = s * (1.3 - 0.3 * s);
        } else if (e.state === 'windup') {
          const u = Math.min(1, e.t / (k.windup * tune.enemies.telegraph));
          s = 1 + u * 0.22;
          sy = k.attack === 'bite' ? 1 - u * 0.3 : 1 + u * 0.15; // creepers crouch, the others rear up
          x += Math.sin(time * 70) * 0.05 * u;
          bright = 1.3 + u * 1.2 + Math.sin(time * 40) * 0.3;
        } else if (e.state === 'strike') {
          sz = 1.3;
          bright = 1.6;
        } else if (e.state === 'recover' && k.attack === 'charge') {
          yaw += Math.sin(time * 9) * 0.35; // dizzy
        }
        if (e.pop > 0) { const p = e.pop / 0.12; s *= 1 + p * 0.22; sy *= 1 - p * 0.2; }
        if (e.flash > 0) bright = 4.5;
        meshes[e.kind].place(x, 0, z, { yaw, sx: s, sy: s * sy, sz: s * sz, bright });
      }
      for (const kind of Object.keys(meshes)) meshes[kind].done();
    },

    reset() {
      list.length = 0;
      pending.length = 0;
      nextId = 0;
    },
  };
  return api;
}
