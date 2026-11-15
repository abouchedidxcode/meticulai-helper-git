// Collision: a box (the player) against the tile grid and the moving platforms.
//
// How it works, and why each part is here:
//   - SEPARATE AXES: move sideways and fix that, then move up/down and fix that. Walls never "catch" a
//     falling player and floors never stop a running one.
//   - SUB-STEPS: a move is cut into slices of at most a quarter tile, so nothing is ever skipped over,
//     however fast the body moves or however long the step is (slow machines, slow motion).
//   - ONE-WAY platforms and movers only stop a body that comes down onto them from above.
//   - CORNER CORRECTION (the two small kindnesses that make a platformer feel fair):
//       * head clips the corner of a ceiling by a few pixels -> slide sideways around it (opts.nudge)
//       * feet land a few pixels short of a ledge -> lift onto it (opts.lift)
//   - RIDING: a body standing on a mover is carried by exactly the mover's movement before its own.
//
// A body is { x (centre), y (feet), w, h, vx, vy } plus what the last move found:
//   onGround, hitCeil, hitWall (-1 / 0 / 1), riding (the mover under it), stoodOn ('solid'|'oneway'|'mover').
// No three.js here: this file also runs outside the browser.

const EPS = 1e-4;
const SLICE = 0.25; // longest sub-step, in tiles

export function createBody(w, h) {
  return { x: 0, y: 0, w, h, vx: 0, vy: 0, onGround: false, hitCeil: false, hitWall: 0, riding: null, stoodOn: null, dropTimer: 0, lifted: false, nudged: false };
}

/** Does a box with its feet at (x, y) overlap any solid tile? */
export function boxHitsSolid(level, x, y, w, h) {
  const x0 = Math.floor(x - w / 2 + EPS);
  const x1 = Math.floor(x + w / 2 - EPS);
  const y0 = Math.floor(y + EPS);
  const y1 = Math.floor(y + h - EPS);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (level.solid(cx, cy)) return true;
  return false;
}

/** Is there a solid wall right beside the body (dir = -1 left, 1 right)? Used for wall slide and wall jump. */
export function touchingWall(level, b, dir, reach = 0.06) {
  const cx = Math.floor(b.x + dir * (b.w / 2 + reach));
  // Sample the body from the knees to the shoulders: a lip at foot height is not a wall to slide on.
  return level.solid(cx, Math.floor(b.y + b.h * 0.25)) && level.solid(cx, Math.floor(b.y + b.h * 0.8));
}

function moveX(level, b, d, opts) {
  if (d === 0) return;
  b.x += d;
  if (!boxHitsSolid(level, b.x, b.y, b.w, b.h)) return;
  // Ledge lift: feet a few pixels below the top of the ledge -> pop up onto it.
  if (opts.lift > 0 && !b.onGround) {
    const top = Math.floor(b.y + EPS) + 1;
    const up = top - b.y;
    if (up > EPS && up <= opts.lift && !boxHitsSolid(level, b.x, top, b.w, b.h)) {
      b.y = top;
      if (b.vy < 0) b.vy = 0;
      b.lifted = true;
      return;
    }
  }
  if (d > 0) b.x = Math.floor(b.x + b.w / 2 - EPS) - b.w / 2;
  else b.x = Math.floor(b.x - b.w / 2 + EPS) + 1 + b.w / 2;
  b.vx = 0;
  b.hitWall = Math.sign(d);
}

function land(b, y, on, mover = null) {
  b.y = y;
  b.vy = 0;
  b.onGround = true;
  b.stoodOn = on;
  b.riding = mover;
}

function moveY(level, movers, b, d, opts) {
  const prevY = b.y;
  b.y += d;
  if (d > 0) {
    if (!boxHitsSolid(level, b.x, b.y, b.w, b.h)) return;
    // Corner nudge: try to slip past the corner, the side we are already drifting towards first.
    const first = b.vx < 0 ? -1 : 1;
    for (let k = 0.05; k <= opts.nudge + EPS; k += 0.05) {
      for (const s of [first, -first]) {
        if (!boxHitsSolid(level, b.x + s * k, b.y, b.w, b.h)) {
          b.x += s * k;
          b.nudged = true;
          return;
        }
      }
    }
    b.y = Math.floor(b.y + b.h - EPS) - b.h;
    b.vy = 0;
    b.hitCeil = true;
    return;
  }
  if (boxHitsSolid(level, b.x, b.y, b.w, b.h)) {
    land(b, Math.floor(b.y + EPS) + 1, 'solid');
    return;
  }
  if (b.dropTimer > 0) return; // dropping through: one-way things don't catch us
  // One-way tiles: only if the feet were above the top before this slice and are below it now.
  const top = Math.floor(prevY + EPS);
  if (b.y < top) {
    const x0 = Math.floor(b.x - b.w / 2 + EPS);
    const x1 = Math.floor(b.x + b.w / 2 - EPS);
    for (let cx = x0; cx <= x1; cx++) {
      if (level.oneWay(cx, top - 1)) {
        land(b, top, 'oneway');
        return;
      }
    }
  }
  // Movers: the same idea, but the mover itself may have moved up or down this step.
  for (const m of movers) {
    if (b.x + b.w / 2 <= m.x - m.w / 2 || b.x - b.w / 2 >= m.x + m.w / 2) continue;
    const wasAbove = prevY >= m.y - 0.03 || prevY >= m.prevY - 0.03;
    if (wasAbove && b.y <= m.y) {
      land(b, m.y, 'mover', m);
      return;
    }
  }
}

/** Move a body by its velocity for dt seconds. opts: { nudge, lift } in tiles. */
export function moveBody(b, dt, level, movers, opts) {
  const rode = b.riding;
  const startY = b.y;
  b.onGround = false;
  b.hitCeil = false;
  b.hitWall = 0;
  b.lifted = false;
  b.nudged = false;
  b.riding = null;
  b.stoodOn = null;
  if (b.dropTimer > 0) b.dropTimer = Math.max(0, b.dropTimer - dt);

  // Carried by the mover we stood on: its sideways move goes through the walls check, its height is ours.
  if (rode && b.dropTimer <= 0 && b.x + b.w / 2 > rode.x - rode.w / 2 && b.x - b.w / 2 < rode.x + rode.w / 2) {
    const keep = b.vx;
    moveX(level, b, rode.x - rode.prevX, { lift: 0 });
    b.vx = keep;
    b.hitWall = 0;
    if (!boxHitsSolid(level, b.x, rode.y, b.w, b.h)) b.y = rode.y;
  }

  const dx = b.vx * dt;
  const dy = b.vy * dt;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / SLICE));
  for (let i = 0; i < n; i++) {
    moveX(level, b, dx / n, opts);
    moveY(level, movers, b, dy / n, opts);
  }

  // A mover rising faster than we are (we hopped on a lift going up) comes up under our feet. The same
  // check gives movers the ledge lift: feet a few pixels below the top, and not on the way up -> lifted on.
  if (!b.onGround && b.dropTimer <= 0) {
    for (const m of movers) {
      if (b.x + b.w / 2 <= m.x - m.w / 2 || b.x - b.w / 2 >= m.x + m.w / 2) continue;
      const wasAbove = startY >= m.prevY - 0.03 || b.y >= m.y - (opts.lift ?? 0);
      if (wasAbove && b.y <= m.y && b.vy <= m.vy + 0.01 && !boxHitsSolid(level, b.x, m.y, b.w, b.h)) {
        land(b, m.y, 'mover', m);
        break;
      }
    }
  }
}
