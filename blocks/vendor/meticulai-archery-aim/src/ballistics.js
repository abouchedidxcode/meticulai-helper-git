// BALLISTICS: gravity plus a little drag proportional to speed. That law has a closed form, so the position of an
// arrow at any time after the loose is one formula (at()), the same formula runs in the volley shader, and the
// launch that hits a moving point can be solved exactly (solve()). Pure maths: no three.js, runs in Node.
//
// Inputs are anything with x, y, z (THREE.Vector3, Vec3, { x, y, z }). Outputs are written into the x, y, z fields
// of the `out` objects you pass, so THREE.Vector3s work as outputs too.

export const G = 9.81;                    // m/s^2
export const DRAG = 0.05;                 // 1/s: an arrow at 60 m/s loses about 3 m/s each second
export const VT = -G / DRAG;              // terminal velocity (vertical), m/s

const put = (o, x, y, z) => { o.x = x; o.y = y; o.z = z; return o; };

/**
 * Position and velocity at time `tau` (s) after a launch from p0 with velocity v0.
 * @param {{x:number,y:number,z:number}} p0
 * @param {{x:number,y:number,z:number}} v0
 * @param {number} tau
 * @param {{x:number,y:number,z:number}|null} [outP]
 * @param {{x:number,y:number,z:number}|null} [outV]
 */
export function at(p0, v0, tau, outP, outV) {
  const E = Math.exp(-DRAG * tau), f = (1 - E) / DRAG;
  if (outP) put(outP, p0.x + v0.x * f, p0.y + VT * tau + (v0.y - VT) * f, p0.z + v0.z * f);
  if (outV) put(outV, v0.x * E, VT + (v0.y - VT) * E, v0.z * E);
  return outP;
}

const _d = { x: 0, y: 0, z: 0 };
/**
 * The launch direction (unit vector, into `out`) for an arrow of `speed` m/s, from `from`, carried by `carry` (the
 * shooter's own velocity, added to the arrow's), to pass through a target that is at `to` now and moves with `tvel`.
 * Returns the flight time in seconds, or 0 if it is out of reach. `high` picks the lobbed solution.
 * The arrow's launch velocity is then  out * speed + carry.
 */
export function solve(from, to, speed, carry, tvel, out, high = false) {
  // p(t) = from + VT*t*j + (v0 - VT*j) * f(t),  v0 = speed*d + carry.  Solve |speed*d| = speed for t.
  const need = (t, o) => {
    const E = Math.exp(-DRAG * t), f = (1 - E) / DRAG;
    const tx = to.x + (tvel ? tvel.x * t : 0) - from.x, ty = to.y + (tvel ? tvel.y * t : 0) - from.y, tz = to.z + (tvel ? tvel.z * t : 0) - from.z;
    put(o, tx / f - (carry ? carry.x : 0), (ty - VT * t) / f + VT - (carry ? carry.y : 0), tz / f - (carry ? carry.z : 0));
    return Math.hypot(o.x, o.y, o.z) - speed;
  };
  // need(t) is large for tiny t, dips below zero between the flat and the lobbed solution, then rises again
  const tMin = 0.02;
  let best = Infinity, tBest = 0;
  for (let t = 0.05; t < 14; t *= 1.18) { const e = need(t, _d); if (e < best) { best = e; tBest = t; } }
  if (best > 0) return 0;
  if (high && need(14, _d) < 0) return 0;               // the lob would stay up longer than the search covers
  let a = high ? tBest : tMin, b = high ? 14 : tBest;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; const e = need(m, _d); if ((e > 0) !== high) a = m; else b = m; }
  const t = (a + b) / 2; need(t, _d);
  const l = Math.hypot(_d.x, _d.y, _d.z) || 1;
  put(out, _d.x / l, _d.y / l, _d.z / l);
  return t;
}

/**
 * Time of flight until the path meets the ground (closed form + Newton steps on the land's height).
 * @param {(x:number, z:number) => number} heightAt  the ground height under a point
 */
export function flightTime(p0, v0, heightAt) {
  let h = heightAt(p0.x, p0.z), t = 0;
  for (let it = 0; it < 4; it++) {
    const dy = p0.y - h, disc = v0.y * v0.y + 2 * G * Math.max(dy, -0.5 * v0.y * v0.y / G + 0.01);
    if (it === 0) t = (v0.y + Math.sqrt(Math.max(0, disc))) / G;
    for (let k = 0; k < 4; k++) {
      const E = Math.exp(-DRAG * t), f = (1 - E) / DRAG;
      const y = p0.y + VT * t + (v0.y - VT) * f - h, vy = VT + (v0.y - VT) * E;
      if (Math.abs(vy) < 1e-4) break;
      t = Math.max(0.01, t - y / vy);
    }
    const f = (1 - Math.exp(-DRAG * t)) / DRAG;
    h = heightAt(p0.x + v0.x * f, p0.z + v0.z * f);
  }
  return t;
}

/**
 * Loosed at a set elevation `arcDeg` (degrees): the speed that carries from `from` to `to`. -> { speed, time, dir }
 * (dir is the unit launch direction). A volley at 35 to 42 degrees: up, a hang at the top, a rain; ~5 s for 180 m.
 */
export function speedForArc(from, to, arcDeg) {
  const th = arcDeg * Math.PI / 180, ct = Math.cos(th), st = Math.sin(th);
  const dx = to.x - from.x, dz = to.z - from.z, D = Math.hypot(dx, dz) || 1, dy = to.y - from.y;
  let lo = 18, hi = 95, ft = 0;
  for (let k = 0; k < 22; k++) {
    const v = (lo + hi) / 2, a = 1 - DRAG * D / (v * ct);
    if (a <= 0) { lo = v; continue; }
    const t = -Math.log(a) / DRAG, y = VT * t + (v * st - VT) * (1 - Math.exp(-DRAG * t)) / DRAG;
    if (y < dy) lo = v; else hi = v;
    ft = t;
  }
  return { speed: (lo + hi) / 2, time: ft, dir: { x: dx / D * ct, y: st, z: dz / D * ct } };
}
