// ?bot=1: a bot that plays through the same input as a person (input.virtual): the left stick to
// move, the right stick to aim, the fire and dash buttons. Tests and recordings use it.
// It plays like a decent but careless newcomer: it backs away from what is close, steps out of
// marked ground late, aims with a lag and a wobble, and only sometimes remembers to dash.
// It usually finishes a run; it is not meant to be perfect. If you add a new kind of danger,
// teach it here (the "threats" part), or the bot will walk into it in every recording.

import { BOSS } from './boss.js';

export function createBot({ input, rng, arena }) {
  let aimAngle = -Math.PI / 2;
  let wobble = 0;
  let wobbleTimer = 0;
  let strafe = 1;
  let strafeTimer = 0;
  let lapse = 0; // > 0: not paying attention (people look away, too)
  let nextLapse = 5;

  return {
    reset() {
      aimAngle = -Math.PI / 2;
      wobble = wobbleTimer = strafeTimer = lapse = 0;
      strafe = 1;
      nextLapse = 5;
      input.virtual.release();
    },

    update(dt, { player, enemies, boss, shots, pickups }) {
      const px = player.pos.x;
      const pz = player.pos.z;
      let mx = 0;
      let mz = 0;
      let danger = false; // something is about to hit: a good moment to dash

      wobbleTimer -= dt;
      if (wobbleTimer <= 0) { wobble = rng.range(-0.09, 0.09); wobbleTimer = rng.range(0.3, 0.8); }
      strafeTimer -= dt;
      if (strafeTimer <= 0) { strafe = rng.sign(); strafeTimer = rng.range(1, 2.5); }

      nextLapse -= dt;
      if (nextLapse <= 0) { lapse = rng.range(0.5, 1.1); nextLapse = rng.range(4, 9); }
      lapse = Math.max(0, lapse - dt);

      // --- who to shoot: the nearest thing in sight (the boss counts)
      let target = null;
      let targetD = Infinity;
      const foes = boss.alive ? [...enemies.list, boss] : enemies.list;
      for (const e of foes) {
        const d = Math.hypot(e.pos.x - px, e.pos.z - pz) - (e.radius ?? e.k.radius);
        const seen = arena.lineClear(px, pz, e.pos.x, e.pos.z);
        if ((seen ? d : d + 20) < targetD) { targetD = seen ? d : d + 20; target = e; }
      }

      // --- threats: back away from what is close, step out of marked ground
      for (const e of enemies.list) {
        const dx = px - e.pos.x;
        const dz = pz - e.pos.z;
        const d = Math.hypot(dx, dz) || 0.01;
        const keep = e.k.attack === 'spit' ? 3 : 3.4;
        if (d < keep) { mx += (dx / d) * ((keep - d) / keep) * 2.2; mz += (dz / d) * ((keep - d) / keep) * 2.2; }
        if ((e.state === 'windup' || e.state === 'strike') && e.k.attack !== 'spit') {
          // In the path of a bite or a charge? Step sideways out of it.
          const along = dx * e.dir.x + dz * e.dir.z;
          const side = dx * -e.dir.z + dz * e.dir.x;
          const reach = e.k.attack === 'charge' ? e.k.strikeSpeed * e.k.strike + 1 : 3;
          if (along > -0.5 && along < reach && Math.abs(side) < e.k.radius + 1.3) {
            const s = side >= 0 ? 1 : -1;
            mx += -e.dir.z * s * 3;
            mz += e.dir.x * s * 3;
            if (e.state === 'strike' && along < 3.5) danger = true;
          }
        }
      }
      for (const s of shots.theirs) {
        const dx = px - s.x;
        const dz = pz - s.z;
        const along = dx * s.dx + dz * s.dz; // how far ahead of the seed we are
        const side = dx * -s.dz + dz * s.dx;
        if (along > 0 && along < 5 && Math.abs(side) < 1.3) {
          const k = side >= 0 ? 1 : -1;
          mx += -s.dz * k * 2.4;
          mz += s.dx * k * 2.4;
          if (along < 1.1 && Math.abs(side) < 0.7) danger = true;
        }
      }
      for (const s of boss.slams) {
        const dx = px - s.x;
        const dz = pz - s.z;
        const d = Math.hypot(dx, dz) || 0.01;
        if (d < BOSS.slam.radius + 0.9) {
          mx += (dx / d) * 3.5;
          mz += (dz / d) * 3.5;
          if (s.t < 0.25 && d < BOSS.slam.radius) danger = true;
        }
      }
      if (boss.alive) {
        const dx = px - boss.pos.x;
        const dz = pz - boss.pos.z;
        const d = Math.hypot(dx, dz) || 0.01;
        if (d < 6.5) { mx += (dx / d) * 2; mz += (dz / d) * 2; }
        if (boss.attack === 'charge' && (boss.state === 'windup' || boss.state === 'act')) {
          const along = dx * boss.dir.x + dz * boss.dir.z;
          const side = dx * -boss.dir.z + dz * boss.dir.x;
          if (along > 0 && Math.abs(side) < BOSS.radius + 1.6) {
            const k = side >= 0 ? 1 : -1;
            mx += -boss.dir.z * k * 4;
            mz += boss.dir.x * k * 4;
            if (boss.state === 'act' && along < 5) danger = true;
          }
        }
      }

      if (lapse > 0) { mx *= 0.15; mz *= 0.15; danger = false; }

      // --- with no pressure: close in to a comfortable range, circle, and pick things up
      const threatened = Math.hypot(mx, mz) > 0.4;
      if (!threatened) {
        let want = null;
        let wantD = 9;
        for (const p of pickups.list) {
          const d = Math.hypot(p.x - px, p.z - pz) * (p.type === 'heart' ? 0.4 : 1);
          if (d < wantD) { wantD = d; want = p; }
        }
        if (want && (targetD > 5 || want.type === 'heart')) {
          const d = Math.hypot(want.x - px, want.z - pz) || 0.01;
          mx += (want.x - px) / d;
          mz += (want.z - pz) / d;
        } else if (target) {
          const dx = target.pos.x - px;
          const dz = target.pos.z - pz;
          const d = Math.hypot(dx, dz) || 0.01;
          const toward = targetD > 20 ? 1 : d > 8 ? 0.8 : 0; // out of sight or far: walk toward it
          mx += (dx / d) * toward - (dz / d) * strafe * 0.6;
          mz += (dz / d) * toward + (dx / d) * strafe * 0.6;
        }
      }
      // Don't get pinned in a corner: a pull to the middle that grows near the walls.
      const edge = Math.max(Math.abs(px) / arena.halfX, Math.abs(pz) / arena.halfZ);
      if (edge > 0.7) { mx -= (px / arena.halfX) * (edge - 0.7) * 6; mz -= (pz / arena.halfZ) * (edge - 0.7) * 6; }

      const ml = Math.hypot(mx, mz);
      if (ml > 1) { mx /= ml; mz /= ml; }
      input.virtual.setMove(ml > 0.15 ? mx : 0, ml > 0.15 ? -mz : 0); // stick up = -z

      // --- aim with a lag and a wobble, fire when roughly on target
      let onTarget = false;
      if (target && targetD < 20) {
        const want = Math.atan2(target.pos.z - pz, target.pos.x - px) + wobble;
        let diff = want - aimAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        aimAngle += Math.max(-8 * dt, Math.min(8 * dt, diff));
        onTarget = Math.abs(diff) < 0.5;
      }
      input.virtual.setAim(Math.cos(aimAngle), Math.sin(aimAngle));
      input.virtual.hold('fire', onTarget);

      // --- dash: only sometimes in time, like a person
      if (danger && player.dashCooldown <= 0 && rng.chance(0.25)) input.virtual.press('dash');
    },
  };
}
