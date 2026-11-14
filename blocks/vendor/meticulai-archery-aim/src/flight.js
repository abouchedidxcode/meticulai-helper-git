// FLIGHT: one arrow's flight, step by step, with the swept hit test, the in-flight guidance of a locked shot and
// the near-pass rule. Pure (no three.js): arrows.js draws what this decides; tests and tools run it in Node.
//
//   const flight = createFlight({ targets, heightAt, normalAt? });
//   const a = flight.launch({ pos, vel, time, guide?, byPlayer? });   // pos, vel: world m and m/s; add the shooter's
//                                                                      // own velocity to vel yourself
//   const r = flight.step(a, time, dt);   // -> null (still flying) or { hit, target } (hit.kind 'ground' for the land)
//
// guide (a locked shot): { where(outPoint, outVel) -> bool, turn (rad/s), near (m), nearPer (m per m flown) }.
//   While it flies the arrow is turned, by no more than `turn`, onto the path that meets that moving point; where()
//   returning false (he fell, he is gone) lets the arrow fly on as it was. And it is generous: an arrow that passes
//   within `near + nearPer * distance flown` of the point without striking anything is put through the point (it
//   strikes what is there). No leading for the player.
// Moving targets: a target with a live `vel` gets the arrow's path RELATIVE to it over the step (p0 pushed by
//   vel * dt), so it tests against its shapes where they are NOW and nothing tunnels through a thin shield at a
//   closing speed of 70 m/s. Without that about one arrow in eight passed through a charging rider.
//   (bodiesTarget() does the same per body, from arrow.dt.)
import { Vec3 } from './vec3.js';
import { at, solve } from './ballistics.js';

/**
 * @param {object} o
 * @param {Array<object>} o.targets
 * @param {(x:number,z:number)=>number} [o.heightAt]
 * @param {(x:number,z:number)=>[number,number,number]} [o.normalAt]
 */
export function createFlight({ targets, heightAt = () => 0, normalAt = null }) {
  const nAt = normalAt || ((x, z) => {
    const e = 0.5, hx = heightAt(x + e, z) - heightAt(x - e, z), hz = heightAt(x, z + e) - heightAt(x, z - e);
    const l = Math.hypot(hx, 2 * e, hz); return [-hx / l, 2 * e / l, -hz / l];
  });
  const v = new Vec3(), v2 = new Vec3(), v3 = new Vec3(), relP0 = new Vec3(), relSeg = new Vec3();
  const hitTmp = { t: 2, hit: null, target: null };

  function launch({ pos, vel, time, guide = null, byPlayer = false }) {
    const a = {
      state: 1,            // 1 flying, 4 glanced (tumbling to the ground)
      p0: new Vec3().copy(pos), v0: new Vec3().copy(vel), t0: time, born: time, origin: new Vec3().copy(pos),
      pos: new Vec3().copy(pos), prev: new Vec3().copy(pos), vel: new Vec3().copy(vel), dir: new Vec3().copy(vel).normalize(),
      guide: guide && typeof guide.where === 'function' ? guide : null, byPlayer, dt: 0, watch: null,
    };
    return a;
  }

  // A locked arrow is turned a little each step onto the path that meets its mark where the mark will be. It starts
  // again from where it is, on the new line, at the speed it has: the path stays a true flight.
  const gp = new Vec3(), gv = new Vec3(), gd = new Vec3();
  function steer(a, time, dt) {
    const g = a.guide;
    let ok = false; try { ok = g.where(gp, gv); } catch { ok = false; }
    if (!ok) { a.guide = null; return; }
    gp.addScaledVector(gv, -dt);                                   // (a.pos is a step old: put them at the same instant)
    const sp = a.vel.length();
    if (sp < 5) { a.guide = null; return; }
    if (a.pos.distanceToSquared(gp) < 1) return;                   // on him: nothing left to correct
    if (!solve(a.pos, gp, sp, null, gv, gd)) { a.guide = null; return; }
    const cos = gd.dot(a.dir);
    if (cos < 0.5) { a.guide = null; return; }                     // it has gone by: let it fly on
    const ang = Math.acos(Math.min(1, cos)), cap = (g.turn || 0) * dt;
    if (ang > cap) gd.lerp(a.dir, 1 - cap / ang).normalize();       // (small angles: a straight blend is the turn)
    a.p0.copy(a.pos); a.v0.copy(gd).multiplyScalar(sp); a.t0 = time - dt;
  }
  const np0 = new Vec3(), np1 = new Vec3(), nd = new Vec3();
  function nearPass(a, p0, p1, dt) {
    const g = a.guide;
    let ok = false; try { ok = g.where(gp, gv); } catch { ok = false; }
    if (!ok) return;
    // the arrow's path this step as the mark saw it, and how close it came
    np0.copy(p0).addScaledVector(gv, dt); nd.subVectors(p1, np0);
    const l2 = nd.lengthSq(); if (l2 < 1e-8) return;
    const k = np1.subVectors(gp, np0).dot(nd) / l2;
    if (k < 0 || k > 1) return;                                     // not abreast of him in this step
    np1.copy(np0).addScaledVector(nd, k);
    const lim = g.near + (g.nearPer || 0) * a.origin.distanceTo(gp);
    if (np1.distanceToSquared(gp) > lim * lim) return;
    nd.multiplyScalar(1 / Math.sqrt(l2));
    np0.copy(gp).addScaledVector(nd, -1.5); np1.copy(gp).addScaledVector(nd, 0.9);
    let bt = 2;
    const save = a.dt; a.dt = 0;                                    // (this short line is already where he is now)
    for (let i = 0; i < targets.length; i++) {
      const T = targets[i];
      if (T.center && T.center.distanceToSquared && T.center.distanceToSquared(gp) > (T.radius + 2.5) * (T.radius + 2.5)) continue;
      let h = null; try { h = T.test(np0, np1, a); } catch { h = null; }
      if (!h || !h.point) continue;
      const ht = v2.subVectors(h.point, np0).dot(nd) / 2.4;
      if (ht < bt) { bt = ht; hitTmp.t = 0.999; hitTmp.hit = h; hitTmp.target = T; }
    }
    a.dt = save;
  }

  /** Advance one arrow to `time` (dt: the step just taken). -> null, or { hit, target } where it struck. */
  function step(a, time, dt) {
    if (a.guide && a.state === 1 && dt > 0) steer(a, time, dt);
    const tau = time - a.t0;
    a.prev.copy(a.pos); a.dt = dt;
    at(a.p0, a.v0, tau, a.pos, a.vel);
    const sp = a.vel.length();
    if (sp > 1e-3) a.dir.copy(a.vel).multiplyScalar(1 / sp);
    hitTmp.t = 2; hitTmp.hit = null; hitTmp.target = null;
    const p0 = a.prev, p1 = a.pos;
    const seg = v.subVectors(p1, p0), segLen2 = seg.lengthSq();
    if (a.state === 1) {
      for (let i = 0; i < targets.length; i++) {
        const T = targets[i];
        let q0 = p0, sg = seg, sl2 = segLen2;
        if (T.vel && dt > 0 && (T.vel.x !== 0 || T.vel.y !== 0 || T.vel.z !== 0)) { q0 = relP0.copy(p0).addScaledVector(T.vel, dt); sg = relSeg.subVectors(p1, q0); sl2 = sg.lengthSq(); }
        if (T.center) {
          const tt = sl2 > 0 ? Math.max(0, Math.min(1, v2.subVectors(T.center, q0).dot(sg) / sl2)) : 0;
          v3.copy(q0).addScaledVector(sg, tt);
          if (v3.distanceToSquared(T.center) > T.radius * T.radius) continue;
        }
        const h = T.test(q0, p1, a);
        if (!h) continue;
        if ((h.kind === 'friend' || T.friend) && a.guide) continue;  // a locked shot is not stopped by a friend riding across it
        const ht = sl2 > 0 ? v2.subVectors(h.point, q0).dot(sg) / sl2 : 0;
        if (ht < hitTmp.t) { hitTmp.t = ht; hitTmp.hit = h; hitTmp.target = T; }
      }
    }
    // a locked arrow passing its mark close by without touching anything: it is put through the mark
    if (a.state === 1 && a.guide && a.guide.near > 0 && !hitTmp.hit && dt > 0) nearPass(a, p0, p1, dt);
    // the ground
    if (p1.y < heightAt(p1.x, p1.z)) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2; v2.copy(p0).addScaledVector(seg, mid); if (v2.y < heightAt(v2.x, v2.z)) hi = mid; else lo = mid; }
      if (hi < hitTmp.t) {
        v2.copy(p0).addScaledVector(seg, hi);
        const n = nAt(v2.x, v2.z);
        hitTmp.t = hi; hitTmp.target = null;
        hitTmp.hit = { point: v2.clone(), normal: new Vec3(n[0], n[1], n[2]), kind: 'ground' };
      }
    }
    // a watcher (a bot or a test) wants to know where this arrow crossed a plane
    if (a.watch && !a.watch.done) {
      const w = a.watch, d0 = v2.subVectors(p0, w.point).dot(w.normal), d1 = v3.subVectors(p1, w.point).dot(w.normal);
      if ((d0 > 0) !== (d1 > 0)) {
        const tt = d0 / (d0 - d1);
        if (tt <= Math.min(1, hitTmp.t) + 1e-6) { v2.copy(p0).addScaledVector(seg, tt); w.miss = v2.distanceTo(w.point); w.dy = v2.y - w.point.y; w.cross = v2.clone(); w.done = true; }
      }
    }
    if (!hitTmp.hit) return null;
    const h = hitTmp.hit, T = hitTmp.target;
    a.pos.copy(h.point); a.guide = null;
    if (T) h.targetId = h.targetId ?? T.id;
    if (a.watch && !a.watch.done) { a.watch.done = true; a.watch.miss = a.watch.miss ?? h.point.distanceTo(a.watch.point); }
    if (a.watch && a.state === 1) a.watch.hit = h.kind !== 'ground' ? (T?.id ?? true) : false;
    return { hit: h, target: T };
  }

  /** Glance off (hit.stick === false): lose most of the speed and tumble on to the ground. rng: () => 0..1 */
  function glance(a, h, time, rng = Math.random) {
    const n = h.normal || { x: 0, y: 1, z: 0 };
    v2.copy(a.vel); const vn = v2.dot(n); v2.addScaledVector(n, -1.7 * vn).multiplyScalar(0.22);
    v2.x += (rng() - 0.5) * 3; v2.y += 1.5 + rng() * 2; v2.z += (rng() - 0.5) * 3;
    a.p0.copy(h.point).addScaledVector(n, 0.03); a.v0.copy(v2); a.t0 = time; a.pos.copy(a.p0);
    a.state = 4;
  }

  // Where will this arrow end? Flies a copy of it ahead on the closed-form path against every target (moved along
  // its `vel`), up to maxT seconds. -> { t, point, dist, targetId, kind } or null if the ground comes first.
  // A guess for anything that steers; exact for what stands still or moves straight with `vel`.
  const pa = new Vec3(), pb = new Vec3(), pc = new Vec3(), pd = new Vec3();
  function predict(a, time, maxT = 6) {
    const H = 1 / 60, tau0 = time - a.t0;
    at(a.p0, a.v0, tau0, pa);
    for (let k = 1; k <= maxT * 60; k++) {
      const tau = tau0 + k * H, ahead = k * H;
      at(a.p0, a.v0, tau, pb);
      for (let i = 0; i < targets.length; i++) {
        const T = targets[i];
        pc.copy(pa); pd.copy(pb);
        if (T.vel) { pc.addScaledVector(T.vel, -(ahead - H)); pd.addScaledVector(T.vel, -ahead); }
        if (T.center) { const r = T.radius + 1.2; if (pd.distanceToSquared(T.center) > r * r && pc.distanceToSquared(T.center) > r * r) continue; }
        let h = null; try { h = T.test(pc, pd, { dt: 0 }); } catch { h = null; }
        if (h && h.stick !== false) { const pt = new Vec3().copy(h.point); if (T.vel) pt.addScaledVector(T.vel, ahead); return { t: a.t0 + tau, point: pt, dist: Math.hypot(pt.x - a.origin.x, pt.z - a.origin.z), targetId: h.targetId ?? T.id, kind: h.kind || 'target' }; }
      }
      if (pb.y < heightAt(pb.x, pb.z)) return null;
      pa.copy(pb);
    }
    return null;
  }

  return { launch, step, glance, predict, normalAt: nAt };
}
