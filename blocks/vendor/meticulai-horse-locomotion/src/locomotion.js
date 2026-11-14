// THE MOVEMENT LAW for horses (and any animal or rider that should move like one). From TUMEN by Meticulai.
// Pure functions and numbers: no three.js, no DOM, importable from node (tools/movecheck.mjs and src/checker.js
// import the limits from here and check runs against them).
//
// Every horse in the game (the player's included, and each unit's invisible anchor) moves only like this:
//
//   speed  += clamp(wantSpeed - speed, -brake * dt, +accel(speed) * dt)        speed >= 0, always
//   curve  += bounded change toward the steering's wish, |curve| <= maxCurve(speed)   (the bend of its path, 1/m)
//   yaw    += curve * speed * dt                                               so no speed, no turning
//   x      += sin(yaw) * speed * dt;   z += cos(yaw) * speed * dt              only ever along its own facing
//   phase  += speed * dt / stride(gait)                                        hooves advance with the ground
//
// (the step moves along the facing half-way through the step, so the path and the headings recorded along it agree)
// What follows from that, by construction: no sideways motion, no backward motion, no jumps.
// The point (x, z) is the horse's FOREHAND. The rest of the horse follows it along its trail (see bendPoint), so
// the mid-body point, where the horse is drawn, also moves only along its own facing (src/herd.js does this).
//
// Turning. yaw rate = curve * v, and it never exceeds maxYawRate(v) = min(v / R_MIN, A_LAT / v). Two honest limits:
//   - a horse cannot pivot like a sprite: with zero speed it cannot rotate at all. To "turn on the spot" it steps
//     round a tight circle of radius R_MIN at a slow walk (about a third of a radian per second: slow, as asked).
//   - at speed the limit is sideways grip (A_LAT): a galloping horse needs an arc tens of metres wide.
// The horse leans into the turn by atan(v * yawRate / g) (see leanFor); the lean rolls the body, not the part of the
// legs near the ground, so planted hooves neither move nor sink.
//
// Hooves in a turn. Clips are authored walking straight. Drawn rigidly on a curved path, a planted hoof would be
// swung sideways by the body's rotation (half a metre at a tight walk). So the horse is not drawn rigid: its body is
// laid along the path its forehand has actually ridden (bendPoint below). With that, a hoof that moves straight back
// at ground speed in the clip stays on one world point while the horse turns. The same maths is in the crowd
// renderer's vertex shader (block meticulai-crowd-renderer) and in the checker (src/checker.js), which is what proves it.

export const G = 9.81;
export const GAIT = { idle: 0, walk: 1, trot: 2, canter: 3, gallop: 4 };
export const GAIT_NAMES = ['idle', 'walk', 'trot', 'canter', 'gallop'];

// Defaults for a small steppe horse, used until a horse meta file says otherwise. speed = stride x cycles/second:
// walk 1.7 m/s at 1.0 Hz, trot 3.6 at 1.5 Hz, canter 6.5 at 1.9 Hz, gallop 12 at 2.3 Hz.
export const DEFAULT_GAITS = {
  idle: { stride: 1, speed: [0, 0], duration: 4.0 },
  walk: { stride: 1.7, speed: [0, 2.2], duration: 1.0 },
  trot: { stride: 2.4, speed: [2.2, 4.8], duration: 0.667 },
  canter: { stride: 3.4, speed: [4.8, 8.6], duration: 0.52 },
  gallop: { stride: 5.2, speed: [8.6, 13.5], duration: 0.43 },
};

export const LIMITS = {
  R_MIN: 2.6,          // m: tightest circle a horse can step round
  A_LAT: 4.0,          // m/s^2: sideways grip at speed (a lean of about 22 degrees)
  YAW_ACCEL: 2.2,      // rad/s^2: how fast the turn itself can tighten or open
  BEND_RATE: 0.15,     // 1/m per metre travelled: how fast the path's curvature may change
  ACCEL_LOW: 3.2,      // m/s^2 from a standstill
  ACCEL_HIGH: 1.1,     // m/s^2 near top speed
  BRAKE: 4.2,          // m/s^2
  V_MAX: 13.5,         // m/s, flat-out gallop (overridden by the gallop clip's speed range)
  LEAN_MAX: 0.38,      // rad
  GAIT_BLEND: 0.32,    // seconds a gait change takes to cross-fade
  UP: 1.05, DOWN: 0.93 // hysteresis around each gait boundary
};

// Build the gait table used by the sim from a horse meta file ({ clips: { walk: { stride, speed:[a,b], duration,
// contacts, suspension } ... } } or the same keys at the top level). Missing pieces fall back to the defaults.
export function makeGaits(meta) {
  const src = meta?.clips || meta || {};
  const g = [];
  for (let i = 0; i < 5; i++) {
    const name = GAIT_NAMES[i], d = DEFAULT_GAITS[name], m = src[name] || {};
    g.push({
      name, id: i,
      stride: i === 0 ? 1 : (m.stride > 0 ? m.stride : d.stride),
      min: Array.isArray(m.speed) ? m.speed[0] : d.speed[0],
      max: Array.isArray(m.speed) ? m.speed[1] : d.speed[1],
      duration: m.duration > 0 ? m.duration : d.duration,
      contacts: m.contacts || null,
      contactsExact: m.contactsExact || m.contacts || null,     // the true touch-down and lift-off (sound, dust); `contacts` may be narrowed to where the sole is still
      suspension: m.suspension || null,
    });
  }
  // boundaries between neighbouring gaits, with hysteresis
  const up = new Float32Array(5), down = new Float32Array(5);
  up[0] = 1e-3; down[1] = 1e-4;                               // idle <-> walk: standing means standing still
  for (let i = 1; i < 4; i++) {
    const b = 0.5 * (g[i].max + g[i + 1].min);
    up[i] = b * LIMITS.UP; down[i + 1] = b * LIMITS.DOWN;
  }
  up[4] = Infinity; down[0] = -Infinity;
  const strides = new Float32Array(5); for (let i = 0; i < 5; i++) strides[i] = g[i].stride;
  return { list: g, up, down, strides, vmax: Math.max(g[4].max, 9), idlePeriod: g[0].duration };
}

// Which gait for this speed, given the gait the horse is in now (hysteresis: it does not flicker at a boundary).
export function pickGait(speed, current, gaits) {
  let g = current;
  while (g < 4 && speed > gaits.up[g]) g++;
  while (g > 0 && speed < gaits.down[g]) g--;
  return g;
}

// THE PLAYER'S HORSE (the player steers). The same law, with the limits of a picked, ridden-every-day
// pony under a rider who asks for everything: it grips harder in a turn, bends into one sooner, and jumps off and
// pulls up harder. Nothing else differs: no sideways motion, no backward motion, no turning without moving.
// The checker judges the player's horse against these and every other horse against LIMITS.
//   at a gallop (12 m/s) it comes about (180 degrees) in about 5 s on a 19 m circle; at a canter (6.5) in under 3 s;
//   at a walk it steps round a 2.3 m circle.
export const HERO = { ...LIMITS, R_MIN: 1.9, A_LAT: 7.6, YAW_ACCEL: 5.0, BEND_RATE: 0.6, ACCEL_LOW: 4.6, ACCEL_HIGH: 2.0, BRAKE: 5.6 };

// A DESTRIER IN A CHARGE (knights that catch a galloping rider). A war horse is bred to jump off: for the
// length of a charge or a sally it gets off the mark and reaches its pace as a sprinter does (0 to 10 m/s in about
// 2.5 s, its full pace in about 4), which is what lets a sally come up with a steppe pony that is already
// galloping. It turns and pulls up as every horse does. Declared, like HERO; judge a horse that uses it against
// these.
export const CHARGER = { ...LIMITS, ACCEL_LOW: 5.2, ACCEL_HIGH: 2.4 };

export function maxAccel(speed, vmax = LIMITS.V_MAX, lim = LIMITS) {
  const t = speed / vmax;
  return lim.ACCEL_LOW + (lim.ACCEL_HIGH - lim.ACCEL_LOW) * (t < 0 ? 0 : t > 1 ? 1 : t);
}
export function maxYawRate(speed) {
  if (speed <= 0) return 0;
  const a = speed / LIMITS.R_MIN, b = LIMITS.A_LAT / speed;
  return a < b ? a : b;
}
// The same limit as a curvature (1/m): the tightest path a horse can ride at this speed.
export function maxCurve(speed) {
  const a = 1 / LIMITS.R_MIN; if (speed <= 0) return a;
  const b = LIMITS.A_LAT / (speed * speed);
  return a < b ? a : b;
}
// The speed at which a horse turns fastest (it slows to about this to come round quickly).
export const BEST_TURN_SPEED = Math.sqrt(LIMITS.A_LAT * LIMITS.R_MIN);
export function leanFor(speed, yawRate) {
  const l = Math.atan(speed * yawRate / G) * 0.9;
  return l > LIMITS.LEAN_MAX ? LIMITS.LEAN_MAX : l < -LIMITS.LEAN_MAX ? -LIMITS.LEAN_MAX : l;
}
export function wrapAngle(a) {
  a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI;
}

// One step of the law for horse i of a struct-of-arrays state S = { x, z, yaw, speed, curve, yawRate, phase ... (Float64
// arrays), gait (Uint8) ... }. wantYaw/wantSpeed come from steering. No allocation. S is updated in place.
// phasePrev/gaitPrev/blend handle the cross-fade when the gait changes. wCap: an extra yaw-rate cap (unit anchors).
//
// Turning is carried as the CURVATURE of the path (1/m; + = left). yawRate = curve * speed, so a standing horse
// cannot rotate. |curve| <= maxCurve(speed), and curve changes by at most BEND_RATE per metre travelled (and never
// faster than YAW_ACCEL allows): a horse needs a couple of strides to bend into its tightest circle. That is what
// keeps the steering smooth, and it is how horses turn.
// lim: the limits this horse obeys (LIMITS for every horse; HERO for the player's).
export function stepHorse(S, i, wantYaw, wantSpeed, dt, gaits, vmaxScale = 1, wCap = Infinity, lim = LIMITS) {
  if (dt <= 0) return;
  let v = S.speed[i];
  const vmax = gaits.vmax * vmaxScale;
  if (wantSpeed > vmax) wantSpeed = vmax;
  if (wantSpeed < 0) wantSpeed = 0;
  // a horse settling into a stand finishes settling before it moves off again (its feet are still squaring up)
  if (S.gait && S.gait[i] === 0 && S.blend[i] < 1) wantSpeed = 0;
  // speed: bounded push and bounded pull
  let dv = wantSpeed - v;
  const up = maxAccel(v, gaits.vmax, lim) * dt, dn = lim.BRAKE * dt;
  if (dv > up) dv = up; else if (dv < -dn) dv = -dn;
  v += dv; if (v < 1e-4 && wantSpeed === 0) v = 0;
  // turn: steer toward the wanted heading. The wanted curvature is the gentlest of: proportional to the error,
  // what can still be straightened out again before the heading is reached, and the limit for this speed.
  let k = S.curve[i];
  if (v > 0) {
    let kmax = lim.A_LAT / (v * v); if (kmax > 1 / lim.R_MIN) kmax = 1 / lim.R_MIN; if (wCap < kmax * v) kmax = wCap / v;
    const perM = Math.min(lim.BEND_RATE, lim.YAW_ACCEL / (v * v));       // how fast the bend may change, per metre
    const err = wrapAngle(wantYaw - S.yaw[i]), ae = err < 0 ? -err : err;
    let kw = ae * 2.6 / v; const ks = Math.sqrt(2 * perM * ae) * 0.8;
    if (kw > ks) kw = ks; if (kw > kmax) kw = kmax; if (err < 0) kw = -kw;
    const dkMax = perM * v * dt; let dk = kw - k;
    if (dk > dkMax) dk = dkMax; else if (dk < -dkMax) dk = -dkMax;
    k += dk;
    if (k > kmax) k = kmax; else if (k < -kmax) k = -kmax;                     // grip: the turn opens as the horse speeds up
  }
  const w = k * v, yaw = S.yaw[i] + w * dt;
  // move: only along the facing (the facing half-way through the step, so the path and the headings along it agree)
  const d = v * dt, ym = yaw - w * dt * 0.5;
  S.x[i] += Math.sin(ym) * d;
  S.z[i] += Math.cos(ym) * d;
  S.yaw[i] = yaw; S.yawRate[i] = w; S.curve[i] = k; S.speed[i] = v;
  // stride: phase by distance; a gait change starts a short cross-fade from the old clip
  if (S.gait) {
    const g0 = S.gait[i], g1 = pickGait(v, g0, gaits);
    if (g1 !== g0 && S.blend[i] >= 1) { S.gaitPrev[i] = g0; S.phasePrev[i] = S.phase[i]; S.gait[i] = g1; S.blend[i] = 0; }
    const g = S.gait[i], size = S.size ? S.size[i] : 1;     // a bigger horse has a longer stride
    if (g === 0) S.phase[i] += dt / gaits.idlePeriod; else S.phase[i] += d / (gaits.strides[g] * size);
    if (S.blend[i] < 1) {
      const gp = S.gaitPrev[i];
      if (gp === 0) S.phasePrev[i] += dt / gaits.idlePeriod; else S.phasePrev[i] += d / (gaits.strides[gp] * size);
      const b = S.blend[i] + dt / LIMITS.GAIT_BLEND; S.blend[i] = b > 1 ? 1 : b;
    }
  }
}

// ---- the body on its path (see the header). The point that obeys the law is the horse's FOREHAND (the "lead"
// point, a little ahead of where the front hooves land). Behind it the horse leaves a trail, and the body is laid
// along that trail: the mid-body point M sits `lead` metres back along it, and a model point (x, z) (+Z forward,
// +X left, z measured from M) is put at arc length z along the trail, x to the side. Because every hoof is then
// placed on ground the horse has really covered, a hoof that travels straight back at ground speed in the clip
// stays on one world point, whatever the steering does.
// The trail near M is described by the heading change along it: theta(u) = b1 u + b2 u^2 + b3 u^3 + b4 u^4 (u = arc
// length from M, + ahead; b1 is the curvature at M), fitted through the trail's real heading at four places. bendPoint
// integrates that with a 4-point Gauss rule. Measured in the game: under 2 mm of hoof slide in
// violent zig-zags and about-turns at every gait; a plain arc gives 25 to 40 mm. The same maths is in the vertex
// renderer's vertex shader (meticulai-crowd-renderer) and in the checker (src/checker.js).
const GX = [0.0694318442, 0.3300094782, 0.6699905218, 0.9305681558], GW = [0.1739274226, 0.3260725774, 0.3260725774, 0.1739274226];
export function bendPoint(x, z, b1, b2, b3, b4, out) {
  let X = 0, Z = 0;
  for (let k = 0; k < 4; k++) { const u = z * GX[k], th = u * (b1 + u * (b2 + u * (b3 + u * b4))); X += GW[k] * Math.sin(th); Z += GW[k] * Math.cos(th); }
  const th = z * (b1 + z * (b2 + z * (b3 + z * b4)));
  out[0] = X * z + x * Math.cos(th); out[1] = Z * z - x * Math.sin(th); out[2] = th;
  return out;
}
// Fit b1..b4 from the trail's heading (relative to the heading at M) at four arc positions: uL (the lead point
// itself) and uL / 2 ahead of M, and uA, uB behind it (negative). Returns the 4x4 inverse (row-major) once.
export function bendFitMatrix(uL, uA = -0.6, uB = -1.2) {
  const us = [uL, uL * 0.5, uA, uB], n = 4, a = [];
  for (let r = 0; r < n; r++) { a.push([]); for (let c = 0; c < n; c++) a[r].push(us[r] ** (c + 1)); for (let c = 0; c < n; c++) a[r].push(r === c ? 1 : 0); }
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
    [a[i], a[p]] = [a[p], a[i]]; const d = a[i][i]; for (let c = 0; c < 2 * n; c++) a[i][c] /= d;
    for (let r = 0; r < n; r++) if (r !== i) { const f = a[r][i]; for (let c = 0; c < 2 * n; c++) a[r][c] -= f * a[i][c]; }
  }
  const out = new Float64Array(16); for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out[r * 4 + c] = a[r][n + c];
  return out;
}
export const CURVE_MAX = 1 / LIMITS.R_MIN;

// Is phase (any real number; its fractional part is used) inside one of the [start, end] intervals? Intervals may
// wrap (start > end means it runs through 1.0).
export function inIntervals(phase, intervals) {
  if (!intervals) return false;
  const p = phase - Math.floor(phase);
  for (let k = 0; k < intervals.length; k++) {
    const a = intervals[k][0], b = intervals[k][1];
    if (a <= b ? (p >= a && p <= b) : (p >= a || p <= b)) return true;
  }
  return false;
}
