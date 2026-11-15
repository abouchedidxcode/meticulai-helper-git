// Collision for a first-person body: an upright capsule against boxes and upright cylinders.
// No physics engine: about 150 lines you can read. The level (level.js) fills the `solids` list.
//
//   solids.push(makeBox(cx, cz, width, depth, y0, y1));   // axis-aligned box, from y0 up to y1
//   solids.push(makeCyl(x, z, radius, y0, y1));           // upright cylinder (pillar, trunk, post)
//   moveBody(solids, body, dt, { stepHeight, airStep })   // body = { pos (the FEET), vel, radius, height, grounded }
//
// How it works (and why it feels right):
// - The body is a circle seen from above with a height. Anything whose top is higher than
//   "feet + stepHeight" is a WALL: the circle is pushed out sideways and only the speed INTO the wall is
//   removed, so you slide along walls and round corners instead of sticking.
// - Anything lower is a STEP: it is ignored sideways and the feet are lifted onto it (step-up). Walking off
//   a small step keeps you glued to the ground (no little hops down stairs).
// - The floor at y = 0 always exists, so nothing can fall out of the world, even at very low frame rates.
// - A long move is cut into short sub-steps (never further than half a radius), so a slow frame or a fast
//   body cannot pass through a wall.
//
// Also here: pointInSolid() and segmentBlocked() ("is there a wall between these two points?") for
// line of sight, projectiles and the use-cone.

export function makeBox(cx, cz, w, d, y0, y1) {
  return { type: 'box', x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0, y1 };
}

export function makeCyl(x, z, r, y0, y1) {
  return { type: 'cyl', x, z, r, y0, y1 };
}

// Does a circle (x, z, r) seen from above overlap this solid's footprint?
function overlaps(s, x, z, r) {
  if (s.type === 'cyl') {
    const rr = s.r + r;
    return (x - s.x) ** 2 + (z - s.z) ** 2 < rr * rr;
  }
  const dx = x - Math.max(s.x0, Math.min(x, s.x1));
  const dz = z - Math.max(s.z0, Math.min(z, s.z1));
  return dx * dx + dz * dz < r * r;
}

/** Height of the highest surface under the circle that is not above maxY. Never below 0 (the floor). */
export function groundAt(solids, x, z, r, maxY = Infinity) {
  let g = 0;
  for (const s of solids) if (s.y1 > g && s.y1 <= maxY && overlaps(s, x, z, r)) g = s.y1;
  return g;
}

/** Underside of the lowest solid above minY over the circle (Infinity if open sky). */
export function ceilingAt(solids, x, z, r, minY) {
  let c = Infinity;
  for (const s of solids) if (s.y0 >= minY && s.y0 < c && overlaps(s, x, z, r)) c = s.y0;
  return c;
}

// Push the circle out of every wall between y = low and y = high. Returns true if it touched one.
// `vel` (optional) loses only its part INTO the wall: that is what makes sliding.
export function pushOut(solids, pos, r, low, high, vel = null) {
  let hit = false;
  for (const s of solids) {
    if (s.y1 <= low || s.y0 >= high) continue;
    let nx = 0;
    let nz = 0;
    let depth = 0;
    if (s.type === 'cyl') {
      const dx = pos.x - s.x;
      const dz = pos.z - s.z;
      const d = Math.hypot(dx, dz);
      const rr = s.r + r;
      if (d >= rr) continue;
      if (d > 1e-6) { nx = dx / d; nz = dz / d; } else nx = 1;
      depth = rr - d;
    } else {
      const px = Math.max(s.x0, Math.min(pos.x, s.x1));
      const pz = Math.max(s.z0, Math.min(pos.z, s.z1));
      const dx = pos.x - px;
      const dz = pos.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        nx = dx / d; nz = dz / d;
        depth = r - d;
      } else {
        // The centre is inside the box: leave by the nearest side.
        const l = pos.x - s.x0;
        const rgt = s.x1 - pos.x;
        const n = pos.z - s.z0;
        const f = s.z1 - pos.z;
        const m = Math.min(l, rgt, n, f);
        if (m === l) nx = -1; else if (m === rgt) nx = 1; else if (m === n) nz = -1; else nz = 1;
        depth = m + r;
      }
    }
    pos.x += nx * depth;
    pos.z += nz * depth;
    if (vel) {
      const into = vel.x * nx + vel.z * nz;
      if (into < 0) { vel.x -= nx * into; vel.z -= nz * into; }
    }
    hit = true;
  }
  return hit;
}

/**
 * Move a body by its velocity for dt seconds and resolve every collision.
 * body: { pos: Vector3 (feet), vel: Vector3, radius, height, grounded }.
 * Sets body.grounded and body.hitWall. Returns how far the feet were lifted or lowered by steps
 * (so the camera can smooth it out).
 */
export function moveBody(solids, body, dt, { stepHeight = 0.35, airStep = 0.12 } = {}) {
  const { pos, vel, radius, height } = body;
  const travel = (Math.hypot(vel.x, vel.z) + Math.abs(vel.y)) * dt;
  const n = Math.max(1, Math.min(16, Math.ceil(travel / (radius * 0.5))));
  const h = dt / n;
  const support = radius * 0.55; // the part of the body that must be over a ledge to stand on it
  let stepped = 0;
  body.hitWall = false;

  for (let i = 0; i < n; i++) {
    const lift = body.grounded ? stepHeight : airStep;

    // Sideways first: slide along walls.
    pos.x += vel.x * h;
    pos.z += vel.z * h;
    for (let k = 0; k < 3; k++) {
      if (!pushOut(solids, pos, radius, pos.y + lift, pos.y + height, vel)) break;
      body.hitWall = true;
    }

    // Then up and down: ceiling, floor, steps.
    const y0 = pos.y;
    pos.y += vel.y * h;
    if (vel.y > 0) {
      const c = ceilingAt(solids, pos.x, pos.z, support, y0 + height - 0.01);
      if (pos.y + height > c) { pos.y = c - height; vel.y = 0; }
    }
    const g = groundAt(solids, pos.x, pos.z, support, y0 + lift);
    if (pos.y <= g) {
      if (body.grounded) stepped += g - y0; // lifted onto a step
      pos.y = g;
      if (vel.y < 0) vel.y = 0;
      body.grounded = true;
    } else if (body.grounded && vel.y <= 0 && y0 - g <= stepHeight) {
      stepped += g - y0; // walked down a small step: stay on the ground
      pos.y = g;
      vel.y = 0;
    } else {
      body.grounded = false;
    }
  }
  return stepped;
}

export function pointInSolid(solids, x, y, z, pad = 0) {
  for (const s of solids) {
    if (y < s.y0 - pad || y > s.y1 + pad) continue;
    if (overlaps(s, x, z, pad + 1e-4)) return true;
  }
  return false;
}

/** Is there something solid between two points? (Sampled every 0.2 m: fine for walls, not for wires.) */
export function segmentBlocked(solids, a, b, pad = 0) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / 0.2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (pointInSolid(solids, a.x + dx * t, a.y + dy * t, a.z + dz * t, pad)) return true;
  }
  return false;
}
