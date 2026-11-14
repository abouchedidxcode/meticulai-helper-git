// THE AIM: what is under the crosshair, and who a shot loosed now would be sent at. Pure (no three.js).
//
// The rule it serves: "If I was aiming at that spot when I let go, the arrow should go there." At the loose ask
// resolve() for the point in the world under the crosshair, then solve the launch to arrive there (ballistics.js).
//
//   const aim = createAim({ targets, heightAt, options, now?, carrierVel? });
//   aim.pick(origin, dir, out = aim.make(), parts = true) -> out {
//       point (Vec3), dist (m), kind: 'enemy' | 'target' | 'ground' | 'far', targetId, key,
//       vel (Vec3: how that point is moving), direct (the ray is ON it, not beside it),
//       lock: null | { key, where(outPoint, outVel) -> bool } }
//
// The order of things:
//   1. the first thing the ray itself meets: any target in `targets` (see targets.js), else the ground, else the
//      point `aimFar` metres out.
//   2. NO LEADING: if that first thing is an enemy, or the ray passes within `assistDeg` (plus `assistBody` metres
//      of him) of one that the ground does not hide, the shot is LOCKED to him: `lock.where()` says where the
//      aimed-at point of him is now and how it moves. The launch is solved for where he will be, and the arrow is
//      kept on him in flight (flight.js, `guide`). A crosshair on a part marked `seekBody` (a rider's horse) sends
//      the arrow at the body (an arrow glancing off a horse read as broken); past `seekBodyFrom` metres a shot that
//      would find only his shield seeks his body instead.
//   3. Moving practice targets (a target with `vel` and `center`) are locked the same way, with a little less help.
//
// THE MARK: track() / follow() / resolve() hold that choice steady from one moment to the next so a HUD can show it
// (a thin ring on him) and the loose keeps to what was shown:
//   track(o, d, time, out?)  call it a few times a second (10 Hz is plenty): decides whether the mark changes hands
//   follow(o)                every frame: where the marked one is now -> the mark, or null
//   resolve(o, d, out)       at the loose: pick(), but the marked one keeps the shot while he is still in reach
//   drop()
import { Vec3 } from './vec3.js';

/** The numbers, exactly as tuned in the source game (see HOW-TO-USE.md for what each one feels like). */
export const AIM_DEFAULTS = {
  aimFar: 300,          // m: where the arrow is sent when nothing is under the crosshair; also how far the help reaches
  assistDeg: 1.1,       // a crosshair within this many degrees of an enemy sends the arrow at him (0 = only when it is on him)
  assistBody: 0.4,      // and his own half-width, metres, is added to that
  seekBodyFrom: 35,     // past this many metres a shot that would find only his shield goes for his body (0 = never)
  lockHold: 0.15,       // another one takes the mark only after being clearly nearer for this long without a break (s)
  lockSweep: 2.5,       // deg/s: a crosshair moving faster than this is on its way somewhere, and the mark goes with it
  lockOn: 0.04,         // s: one the crosshair is ON takes the mark from one it was only beside after this long
  lockShot: true,       // the marked one keeps the shot (false: the loose takes whoever is nearest at that instant)
  lockMargin: 0.3,      // ...and only if nearer the crosshair by this share (0.3: under 70 % of the marked one's angle)
  lockSlack: 1.3,       // and the marked one keeps it out to this many times the help's angle
  footHold: 0.35,       // s: a lock on an enemy that offers no where() (it stands, or walks) is good for this long
};

/**
 * @param {object} o
 * @param {Array<object>} o.targets                   the target list (createTargets())
 * @param {(x:number,z:number)=>number} [o.heightAt]  ground height; default flat at 0
 * @param {Partial<typeof AIM_DEFAULTS>} [o.options]  live: the object is read every call (change it any time)
 * @param {() => number} [o.now]                      the game clock (s), for the short spot locks
 * @param {() => ({x:number,y:number,z:number}|null)} [o.carrierVel]  the shooter's own velocity (a horse, a cart)
 */
export function createAim({ targets, heightAt = () => 0, options = {}, now = () => 0, carrierVel = () => null }) {
  const T = Object.assign(options, { ...AIM_DEFAULTS, ...options });
  const s0 = new Vec3(), s1 = new Vec3(), c = new Vec3(), v = new Vec3(), w = new Vec3();
  const ZERO = { x: 0, y: 0, z: 0 };
  const moving = (t) => t.vel && t.center && (t.vel.x !== 0 || t.vel.y !== 0 || t.vel.z !== 0);

  // where the ray goes into the ground (metres along it), or Infinity. (The land is gentle: a ray climbing at more
  // than ~0.22 never meets it. Raise that if your world has cliffs.)
  function groundAlong(o, d, far) {
    if (d.y > 0.22) return Infinity;
    let t0 = 0, t = 1.2;
    while (t0 < far) {
      if (t > far) t = far;
      if (o.y + d.y * t < heightAt(o.x + d.x * t, o.z + d.z * t)) {
        let lo = t0, hi = t;
        for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (o.y + d.y * m < heightAt(o.x + d.x * m, o.z + d.z * m)) hi = m; else lo = m; }
        return hi;
      }
      if (t >= far) break;
      t0 = t; t += Math.max(0.8, t * 0.045);
    }
    return Infinity;
  }
  // does the ground stand between two points? (one behind the crest is not to be shot at through it)
  function hidden(a, b) {
    for (let i = 1; i <= 12; i++) {
      const k = 0.06 + 0.9 * i / 12, x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k, z = a.z + (b.z - a.z) * k;
      if (y < heightAt(x, z) - 0.25) return true;
    }
    return false;
  }

  // a lock on one thing of a target that offers where(): the aimed-at point rides with him (+ where on him it was)
  function whereLock(Tg, key, off) {
    return {
      key: 'h' + Tg.id + ':' + key, targetId: Tg.id, thing: key,
      where(p, vel) {
        let ok = false; try { ok = !!Tg.where(key, p, vel); } catch { ok = false; }
        if (ok && off) { p.x += off.x; p.y += off.y; p.z += off.z; }
        return ok;
      },
    };
  }
  // a lock on a moving target as a whole (its live centre + where on it the crosshair was)
  function centreLock(Tg, off) {
    return {
      key: 't' + Tg.id, targetId: Tg.id,
      where(p, vel) {
        if (!targets.includes(Tg)) return false;
        p.x = Tg.center.x + (off ? off.x : 0); p.y = Tg.center.y + (off ? off.y : 0); p.z = Tg.center.z + (off ? off.z : 0);
        vel.x = Tg.vel.x; vel.y = Tg.vel.y; vel.z = Tg.vel.z;
        return true;
      },
    };
  }

  const hookOut = {};
  function pick(o, d, out, parts = true) {
    out = out || make();
    const far = T.aimFar;
    out.lock = null; out.key = undefined; out.targetId = undefined; out.vel.set(0, 0, 0); out.direct = false;
    const tg = groundAlong(o, d, far), reach = Math.min(far, tg + 0.4);
    s0.copy(o).addScaledVector(d, 0.6); s1.copy(o).addScaledVector(d, reach);
    // 1. what the ray itself meets first
    let bt = Infinity, bh = null, bT = null;
    for (let i = 0; i < targets.length; i++) {
      const Tg = targets[i];
      if (Tg.friend) continue;                                // a friend in the way is not an aim point
      if (Tg.center) {
        const along = Math.max(0, Math.min(reach, v.subVectors(Tg.center, o).dot(d)));
        w.copy(o).addScaledVector(d, along);
        if (w.distanceToSquared(Tg.center) > Tg.radius * Tg.radius) continue;
      }
      let h = null; try { h = Tg.test(s0, s1, null); } catch { h = null; }
      if (!h || !h.point || h.kind === 'friend') continue;
      const t = v.subVectors(h.point, o).dot(d);
      if (t < bt) { bt = t; bh = h; bT = Tg; }
    }
    if (bh) {
      out.point.copy(bh.point); out.dist = bt; out.targetId = bT.id;
      const enemy = bT.enemy || bh.enemy;
      if (enemy && bh.key !== undefined && typeof bT.where === 'function') {
        out.kind = 'enemy'; out.key = bh.key; out.direct = true;
        if (!parts) return out;
        let okp = false; try { okp = !!bT.where(bh.key, c, w); } catch { okp = false; }
        if (bh.seekBody || (bh.kind === 'shield' && T.seekBodyFrom > 0 && bt > T.seekBodyFrom) || !okp) {
          out.lock = whereLock(bT, bh.key, null);              // his body, not the horse or the shield
          if (okp) out.point.copy(c);
        } else out.lock = whereLock(bT, bh.key, new Vec3().subVectors(out.point, c));   // exactly that spot of him
        out.lock.part = bh.seekBody ? 'body' : bh.kind || 'body';
        out.lock.where(c, out.vel);
        return out;
      }
      if (moving(bT)) {                                      // a moving target (enemy or practice): ride its centre
        out.kind = enemy ? 'enemy' : 'target'; out.direct = true;
        if (!parts) return out;
        out.lock = centreLock(bT, new Vec3().subVectors(bh.point, bT.center));
        out.vel.copy(bT.vel);
        return out;
      }
      if (enemy) {
        // an enemy that offers no where(): the lock is the spot itself, good for a moment and renewed at every look
        // while the crosshair stays on him (one who stands, or walks a metre a second)
        out.kind = 'enemy'; out.direct = true;
        if (!parts) return out;
        const pt = out.point.clone(), t0 = now();
        out.lock = { key: 'f' + bT.id + ':' + (bh.key ?? ''), targetId: bT.id, part: bh.kind || 'body', where(p, vel) { if (now() - t0 > T.footHold) return false; p.x = pt.x; p.y = pt.y; p.z = pt.z; vel.x = vel.y = vel.z = 0; return true; } };
        return out;
      }
      out.kind = 'target';
      return out;
    }
    // 2. nothing under the crosshair itself: is there an enemy close beside it?
    const cone = T.assistDeg * Math.PI / 180;
    let bestScore = 1e9, found = false;
    if (cone > 0) {
      for (let i = 0; i < targets.length; i++) {
        const Tg = targets[i];
        if (Tg.friend || !Tg.enemy || typeof Tg.near !== 'function' || typeof Tg.where !== 'function') continue;
        let r = null; try { r = Tg.near(o, d, cone, hookOut, { far, assistBody: T.assistBody }); } catch { r = null; }
        if (!r || !r.point) continue;
        v.subVectors(r.point, o); const along = v.dot(d); if (along < 2.5 || along > far) continue;
        const perp = Math.sqrt(Math.max(0, v.lengthSq() - along * along));
        const allow = cone + Math.atan2(T.assistBody, along), score = Math.atan2(perp, along) / allow + along * 0.0012;
        if (score > 1.4 || score >= bestScore || hidden(o, r.point)) continue;
        out.point.copy(r.point); out.dist = v.length(); out.kind = 'enemy'; out.key = r.key; out.targetId = Tg.id;
        out.vel.copy(r.vel || ZERO);
        if (parts) { out.lock = whereLock(Tg, r.key, null); out.lock.part = 'body'; }
        bestScore = score; found = true;
      }
      // moving targets as a whole (a swinging dummy, a cart): the same help, a little less of it
      for (let i = 0; i < targets.length; i++) {
        const Tg = targets[i];
        if (Tg.friend || !moving(Tg)) continue;
        v.subVectors(Tg.center, o); const along = v.dot(d); if (along < 2.5 || along > far) continue;
        const perp = Math.sqrt(Math.max(0, v.lengthSq() - along * along));
        const allow = cone * 0.7 + Math.atan2(Math.max(0.2, Tg.radius - 0.25), along), score = Math.atan2(perp, along) / allow + along * 0.0012;
        if (score > 1 + along * 0.0012 || score >= bestScore || hidden(o, Tg.center)) continue;
        out.point.copy(Tg.center); out.dist = v.length(); out.kind = Tg.enemy ? 'enemy' : 'target'; out.key = undefined; out.targetId = Tg.id; out.vel.copy(Tg.vel);
        out.lock = parts ? centreLock(Tg, null) : null;
        bestScore = score; found = true;
      }
    }
    if (found) return out;
    // 3. the ground, or the far point
    if (tg < far) { out.point.copy(o).addScaledVector(d, tg); out.dist = tg; out.kind = 'ground'; }
    else { out.point.copy(o).addScaledVector(d, far); out.dist = far; out.kind = 'far'; }
    return out;
  }

  /** A fresh pick result to reuse. */
  function make() { return { point: new Vec3(), vel: new Vec3(), dist: 0, kind: 'far', targetId: undefined, key: undefined, lock: null, direct: false }; }

  // ---------------------------------------------------------------- THE MARK
  // Steady: the first one found is taken at once. While the crosshair is MOVING over them (faster than `lockSweep`
  // degrees a second, measured against the marked one's own drift across the view) the mark simply goes to whoever
  // is nearest. Once the crosshair has come to REST, another one beside it only takes the mark when he is CLEARLY the
  // nearer (his angle under `1 - lockMargin` of the marked one's) and has been so without a break for `lockHold`
  // seconds: two equally near swap places in the pick many times a second as they bob and as a hand wanders, and
  // the mark stays on the first. One the crosshair is ON takes it after `lockOn` from one it was only beside. The
  // mark moves at once if the marked one is out of reach (fallen, gone, more than `lockSlack` times the help's angle
  // from the crosshair, behind the ground).
  const mark = { key: null, lock: null, kind: '', targetId: undefined, thing: undefined, part: '', point: new Vec3(), vel: new Vec3(), dist: 0, since: 0, direct: false };
  let candKey = null, candSince = 0, markAng = 0;
  const tk = make(), mp = new Vec3(), mv = new Vec3();
  function take(out, time) {
    mark.key = out.lock.key; mark.lock = out.lock; mark.kind = out.kind; mark.targetId = out.targetId; mark.thing = out.key; mark.part = out.lock.part || '';
    mark.direct = !!out.direct; mark.since = time; candKey = null;
    if (!out.lock.where(mark.point, mark.vel)) drop();
  }
  function drop() { mark.key = null; mark.lock = null; candKey = null; }
  // is the marked one still in reach of a ray from o along d? (leaves his point in mp)
  function inReach(o, d) {
    if (!mark.lock) return false;
    let ok = false; try { ok = mark.lock.where(mp, mv); } catch { ok = false; }
    if (!ok) return false;
    v.subVectors(mp, o); const along = v.dot(d); if (along < 2 || along > T.aimFar * 1.05) return false;
    const perp = Math.sqrt(Math.max(0, v.lengthSq() - along * along));
    // (close to, a crosshair on his horse marks his body a metre away: the allowance is in metres as well as degrees)
    markAng = Math.atan2(perp, along);
    if (markAng > (T.assistDeg * Math.PI / 180 + Math.atan2(T.assistBody + 0.7, along)) * (T.lockSlack || 1.3)) return false;
    return !hidden(o, mp);
  }
  const angOf = (o, d, pt) => { v.subVectors(pt, o); const along = v.dot(d); return Math.atan2(Math.sqrt(Math.max(0, v.lengthSq() - along * along)), along); };
  // how fast the crosshair is moving over them, rad/s: the turning of the aim ray, less the turning it needs just to
  // stay on the marked one as he and the shooter move (from their speeds: the bob of a gallop is not the hand moving)
  const dPrev = new Vec3(), wRay = new Vec3(), wMark = new Vec3();
  let tPrev = -1e9;
  function sweepRate(d, time) {
    const dtk = time - tPrev;
    let sweep = 0;
    if (dtk > 1e-4 && dtk < 0.4) {
      wRay.subVectors(d, dPrev).multiplyScalar(1 / dtk);
      if (mark.lock && mark.dist > 1) {
        wMark.copy(mark.vel); const cv = carrierVel(); if (cv) wMark.sub(cv);
        wMark.addScaledVector(d, -wMark.dot(d)).multiplyScalar(1 / mark.dist);
        wRay.sub(wMark);
      }
      sweep = wRay.length();
    }
    dPrev.copy(d); tPrev = time;
    return sweep;
  }
  function track(o, d, time, out = tk) {
    const sweeping = sweepRate(d, time) > (T.lockSweep ?? 2.5) * Math.PI / 180;
    pick(o, d, out, true);
    const k = out.lock ? out.lock.key : null;
    if (k !== null && k === mark.key) { mark.lock = out.lock; mark.part = out.lock.part || ''; mark.direct = !!out.direct; candKey = null; }
    else if (mark.key === null) { if (k !== null) take(out, time); }
    else if (!inReach(o, d)) { if (k !== null) take(out, time); else drop(); }
    else if (k !== null && sweeping) take(out, time);           // on its way somewhere: the mark goes with it
    else if (k !== null) {
      // at rest, and somebody else is the pick. On him (the ray meets him): he is the one. Beside him: only if clearly nearer.
      const clearly = out.direct || angOf(o, d, out.point) < markAng * (1 - (T.lockMargin ?? 0.3));
      if (!clearly) candKey = null;
      else {
        if (candKey !== k) { candKey = k; candSince = time; }
        if (time - candSince >= (out.direct && !mark.direct ? (T.lockOn ?? 0.04) : (T.lockHold ?? 0.15))) take(out, time);
      }
    } else candKey = null;                                     // nobody is the pick, but he is within the slack: he keeps it
    return out;
  }
  function follow(o) {
    if (!mark.lock) return null;
    let ok = false; try { ok = mark.lock.where(mark.point, mark.vel); } catch { ok = false; }
    if (!ok) { drop(); return null; }
    mark.dist = mark.point.distanceTo(o);
    return mark;
  }
  function resolve(o, d, out) {
    out = pick(o, d, out, true);
    const k = out.lock ? out.lock.key : null;
    out.picked = out.key; out.kept = false;                    // (for tools: who the nearest was, and whether the mark overruled him)
    if (T.lockShot !== false && mark.key !== null && k !== mark.key && inReach(o, d)) {
      out.kind = mark.kind; out.key = mark.thing; out.targetId = mark.targetId; out.lock = mark.lock; out.direct = false; out.kept = true;
      mark.lock.where(out.point, out.vel); out.dist = out.point.distanceTo(o);
    }
    return out;
  }

  return { pick, groundAlong, hidden, make, track, follow, resolve, drop, options: T, get mark() { return mark.lock ? mark : null; } };
}
