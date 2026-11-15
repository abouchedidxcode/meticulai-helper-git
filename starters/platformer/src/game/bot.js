// ?bot=1: a bot that plays through the same input a person uses (input.virtual), so tests and
// recordings show real play. It runs right and reads the tiles just ahead of its feet, the way a
// newcomer reads the screen:
//   a low wall -> jump it            a gap or spikes -> jump to the next safe ground
//   a gap too wide to jump -> wait for the moving platform, ride it, hop off at the far side
//   a crawler ahead -> jump so as to come down on it
// It is not clever on purpose: it never looks for coins off its path, it does not use one-way
// platforms or wall jumps, and now and then it hesitates. If you change the level format or add tiles
// that need a new trick (springs, ladders), teach it here. No three.js.

const tuneFumble = 0.12; // share of gap jumps the bot gets wrong

export function createBot({ input, rng }) {
  let hold = 0; // seconds left to keep jump held
  let think = 0; // > 0: hesitating
  let nextThink = 3;
  let stuck = 0;
  let lastX = 0;
  let aim = null; // a mover or enemy we are trying to come down on
  let leaving = false; // on a platform, and decided to get off

  function jump(seconds) {
    if (hold > 0) return;
    input.virtual.press('jump');
    hold = seconds * rng.range(0.92, 1.08);
  }

  return {
    reset() {
      hold = think = stuck = 0;
      nextThink = 3;
      aim = null;
      leaving = false;
      input.virtual.release();
    },

    update(dt, world) {
      const { level, player, movers, enemies, run } = world;
      const b = player.body;
      if (!player.alive || run.done) {
        input.virtual.setMove(0, 0);
        input.virtual.hold('jump', false);
        hold = 0;
        aim = null;
        return;
      }
      let mx = 1;
      const row = Math.floor(b.y + 0.05);
      const lead = b.x + b.w / 2; // the front edge of the body

      const moverUnder = (x, y) => movers.list.some((m) => Math.abs(x - m.x) < m.w / 2 && Math.abs(m.y - y) < 0.4);
      const floorAt = (cx) => level.solid(cx, row - 1) || level.oneWay(cx, row - 1) || moverUnder(cx + 0.5, row);
      // The height of standable ground in a column, looking from 3 tiles above our feet to `drop` below.
      const surface = (cx, drop) => {
        for (let y = row + 3; y >= row - drop; y--) {
          if ((level.solid(cx, y - 1) || level.oneWay(cx, y - 1)) && !level.solid(cx, y) && !level.solid(cx, y + 1)) return level.hazard(cx, y) ? null : y;
        }
        return null;
      };

      if (b.onGround && b.riding) {
        // --- on a moving platform: stand in the middle until the far side is close, then go
        const m = b.riding;
        aim = null;
        const edge = m.x + m.w / 2;
        const lift = m.y0 !== m.y1;
        let go = leaving;
        let walkOff = false;
        for (let c = Math.floor(edge + 0.02); c <= Math.floor(edge) + 3 && !go; c++) {
          const top = surface(c, 2);
          if (top === null) continue;
          const gap = c - edge;
          const rise = top - b.y;
          if (rise <= 0.3 && gap <= 0.5) go = walkOff = true;
          else if (!lift && gap <= 2.2 && rise <= 2.5 && m.vx >= -0.01) go = true;
        }
        leaving = go;
        if (go) {
          mx = 1;
          if (!walkOff && lead >= edge - 0.3) jump(0.3);
        } else {
          const d = m.x - b.x;
          mx = Math.abs(d) > 0.35 ? Math.sign(d) * 0.6 : 0;
        }
      } else if (b.onGround) {
        aim = null;
        leaving = false;
        // --- on the ground: what is the first thing in the way?
        let kind = null;
        let c = Math.floor(lead + 0.05);
        for (const end = c + 7; c < end; c++) {
          if (level.solid(c, row)) { kind = 'wall'; break; }
          if (level.hazard(c, row)) { kind = 'hazard'; break; }
          if (!floorAt(c)) { kind = 'gap'; break; }
        }
        const dist = c - lead;

        if (kind === 'wall') {
          let h = 1;
          while (h < 6 && level.solid(c, row + h)) h++;
          if (h <= 3 && dist < 0.6) jump(h === 1 ? 0.1 : 0.38);
        } else if (kind) {
          // Where can we land? Prefer ground at our height or above; else ground a little lower.
          let landAt = null;
          for (const drop of [0, 2]) {
            for (let c2 = c + 1; c2 <= c + 4 && landAt === null; c2++) if (surface(c2, drop) !== null) landAt = c2;
            if (landAt !== null) break;
          }
          if (landAt !== null) {
            const up = surface(landAt, 2) - row;
            // Now and then it fumbles: a jump let go too early (a person's most common mistake).
            if (dist < 0.25) jump(rng.chance(tuneFumble) ? 0.05 : landAt - c <= 2 && up <= 0 ? 0.16 : 0.4);
          } else {
            // Too wide: is there a moving platform to take?
            const m = movers.list.find((q) => Math.min(q.x0, q.x1) - q.w / 2 < c + 3 && Math.max(q.x0, q.x1) + q.w / 2 > c && Math.min(q.y0, q.y1) <= b.y + 1.2 && Math.max(q.y0, q.y1) >= b.y - 1.2);
            if (!m) {
              if (dist < 0.25) jump(0.4); // nothing to wait for: jump and hope
            } else {
              const toMover = m.x - m.w / 2 - lead;
              const rise = m.y - b.y;
              const lift = m.y0 !== m.y1;
              if (toMover < 0.45 && rise < 0.05 && rise > -0.6) mx = 1; // it is right here: walk on
              else if (!lift && toMover < 2 && rise < 1.2 && rise > -1.5) {
                if (dist < 0.3) { jump(0.25); aim = m; }
              } else if (dist < 0.2) mx = -0.4; // too close to the edge: back off
              else if (dist < 0.7) mx = 0; // wait here
            }
          }
        }

        // A crawler ahead, on our level: jump so as to come down on it.
        for (const e of enemies.list) {
          if (!e.alive || Math.abs(e.y - b.y) > 1.2) continue;
          const d = e.x - b.x;
          if (d > 0.4 && d < (e.dir < 0 && e.pause <= 0 ? 4.3 : 3.5)) { jump(0.4); aim = e; }
        }

        // Now and then, stop and look (only where it is safe to).
        nextThink -= dt;
        if (nextThink <= 0) {
          nextThink = rng.range(4, 9);
          if (!kind || dist > 2.5) think = rng.range(0.2, 0.5);
        }
        if (think > 0) {
          think -= dt;
          if (hold <= 0 && mx > 0) mx = 0;
        }
      } else if (aim) {
        // --- in the air, coming down on something: steer for it
        mx = Math.max(-1, Math.min(1, (aim.x - b.x) * 2));
        if (aim.alive === false) aim = null;
      }

      // Stuck somewhere for a few seconds (not just waiting for a platform)? Try a big jump.
      stuck = Math.abs(b.x - lastX) < 0.4 ? stuck + dt : 0;
      if (Math.abs(b.x - lastX) >= 0.4) lastX = b.x;
      if (stuck > (b.riding ? 14 : 7) && b.onGround) {
        mx = 1;
        jump(0.4);
        stuck = 0;
      }

      hold = Math.max(0, hold - dt);
      input.virtual.hold('jump', hold > 0);
      input.virtual.setMove(mx, 0);
    },
  };
}
