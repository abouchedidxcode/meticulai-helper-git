// TARGETS: the list of things arrows can hit and the aim can pick. Pure (no three.js).
//
// A target is a plain object:
//   {
//     id: string,
//     test(p0, p1, arrow?) -> hit | null    the first thing the segment p0 -> p1 meets (world space)
//     center?: {x,y,z} (live), radius?: m   used to skip the test when the segment is nowhere near
//     vel?: {x,y,z} (live, m/s)             MOVING TARGETS: the segment handed to test() is then the arrow's path
//                                           RELATIVE to the target over the step, so test against your shapes where
//                                           they are NOW. Nothing tunnels through a thin shield at 70 m/s closing.
//     enemy?: true                          the aim locks shots onto it (see aim.js)
//     friend?: true                         the aim ignores it, and a locked arrow flies through it
//     near?(o, d, cone, out, opts) -> { key, point, vel? } | null   its thing nearest the aim ray (for the aim help)
//     where?(key, outPoint, outVel) -> bool                          where that thing is now (false: gone, fallen)
//     onHit?(hit, arrow)
//   }
// A hit:
//   { point, normal?, kind?: 'body'|'helm'|'shield'|'wood'|'horse'|'target'|'armor'|'friend'|..., key?,
//     attach?: anything with a current .matrixWorld (an Object3D, or arrows.anchor()) for the arrow to ride,
//     depth?: m the point goes in, stick?: false to glance off, seekBody?: true (see aim.js), score? }
import { Vec3 } from './vec3.js';
import { segmentSphere, segmentCapsule } from './shapes.js';

/** A list of targets. add() returns a function that removes the target again. */
export function createTargets() {
  const list = [];
  list.add = (t) => {
    if (!t || typeof t.test !== 'function') throw new Error('add needs { id, test(p0, p1) }');
    if (t.center && !(t.radius > 0)) t.radius = 2;
    list.push(t);
    return () => { const i = list.indexOf(t); if (i >= 0) list.splice(i, 1); };
  };
  return list;
}

/**
 * Many moving bodies as one target (riders, animals, soldiers): what replaces "the army" of the source game.
 * `bodies()` returns the live list; each body is
 *   { key, alive, center: {x,y,z} (the aim point: a chest), vel: {x,y,z}, radius (m),
 *     capsule?: { a: {x,y,z}, b: {x,y,z}, r } (world; else a sphere of `radius` at center),
 *     kind?: 'body', attach?: Object3D, extra?: [{ center, radius, kind, seekBody? }] (a horse, a shield...) }
 * The shared velocity for the swept test is taken per body (see `test` below), so `vel` on the target is unused.
 * -> a target with test, near, where (the aim's lock and help work on it).
 */
export function bodiesTarget({ id = 'bodies', bodies, enemy = true }) {
  const r0 = new Vec3(), r1 = new Vec3();
  const T = {
    id, enemy,
    // each body moves on its own: shift the arrow's segment by THAT body's motion over the step (arrow.dt)
    test(p0, p1, arrow) {
      const dt = arrow?.dt || 0;
      let best = null;
      for (const b of bodies()) {
        if (!b.alive) continue;
        r0.copy(p0); if (b.vel && dt > 0) r0.addScaledVector(b.vel, dt);
        r1.copy(p1);
        // quick reject
        const reach = (b.radius || 1) + 2.5;
        if (segDist2(r0, r1, b.center) > reach * reach) continue;
        const parts = [b, ...(b.extra || [])];
        for (const part of parts) {
          const h = part.capsule ? segmentCapsule(r0, r1, part.capsule.a, part.capsule.b, part.capsule.r) : segmentSphere(r0, r1, part.center, part.radius);
          if (h && (!best || h.t < best.t)) best = { t: h.t, point: h.point, normal: h.normal, kind: part.kind || 'body', key: b.key, attach: b.attach || null, seekBody: !!part.seekBody };
        }
      }
      return best;
    },
    // the body nearest the aim ray inside the cone (the source game's rule for its riders, exactly)
    near(o, d, cone, out, opts = {}) {
      const far = opts.far ?? 300, assistBody = opts.assistBody ?? 0.4;
      let best = null, bs = 1e9;
      for (const b of bodies()) {
        if (!b.alive) continue;
        const vx = b.center.x - o.x, vy = b.center.y - o.y, vz = b.center.z - o.z;
        const along = vx * d.x + vy * d.y + vz * d.z; if (along < 2.5 || along > far) continue;
        const perp = Math.sqrt(Math.max(0, vx * vx + vy * vy + vz * vz - along * along));
        const allow = cone + Math.atan2(assistBody, along), ang = Math.atan2(perp, along);
        if (ang > allow) continue;
        const score = ang / allow + along * 0.0012;        // the one nearest the crosshair; of two alike, the nearer
        if (score < bs) { bs = score; best = b; }
      }
      if (!best) return null;
      out.key = best.key; out.point = (out.point || new Vec3()).copy(best.center); out.vel = (out.vel || new Vec3()).copy(best.vel || { x: 0, y: 0, z: 0 });
      return out;
    },
    where(key, p, vel) {
      for (const b of bodies()) if (b.key === key) {
        if (!b.alive) return false;
        p.x = b.center.x; p.y = b.center.y; p.z = b.center.z;
        const v = b.vel || { x: 0, y: 0, z: 0 }; vel.x = v.x; vel.y = v.y; vel.z = v.z;
        return true;
      }
      return false;
    },
  };
  return T;
}

function segDist2(p0, p1, c) {
  const sx = p1.x - p0.x, sy = p1.y - p0.y, sz = p1.z - p0.z, l2 = sx * sx + sy * sy + sz * sz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((c.x - p0.x) * sx + (c.y - p0.y) * sy + (c.z - p0.z) * sz) / l2)) : 0;
  const x = p0.x + sx * t - c.x, y = p0.y + sy * t - c.y, z = p0.z + sz * t - c.z;
  return x * x + y * y + z * z;
}
