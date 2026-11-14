// A HERD: many horses under the movement law, in one struct of arrays (nothing allocated per step).
// From TUMEN by Meticulai. The law is in locomotion.js; this file adds what the game did around it:
//
//   - each horse's own TRAIL (where its forehand has been, a point every 5 cm, 3.2 m long),
//   - the BODY laid along that trail: the mid-body point (mx, mz, myaw) where you draw the horse, and the bend
//     coefficients b1..b4 that lay a model point on the trail (locomotion.js bendPoint). With these a hoof that
//     moves straight back at ground speed in its clip stays on one world point, even in a turn,
//   - the LEAN into a turn (roll, radians, + = to the left), eased in at 5 per second,
//   - the PLAYER'S REINS: A/D turn and W/S pace levels with the numbers the game was tuned with.
//
// Units: metres, seconds, radians. +Z is forward at yaw 0, +X is to the LEFT at yaw 0 (x += sin(yaw) * d).
// In three.js terms: rotation.y = yaw puts a model that faces +Z on the horse's heading.
//
// /** @typedef {{ x: number, z: number, yaw?: number, size?: number, limits?: object, speed?: number }} HorseSpawn */

import { makeGaits, stepHorse, leanFor, bendFitMatrix, bendPoint, wrapAngle, LIMITS, HERO } from './locomotion.js';

export const TR_N = 64, TR_DS = 0.05;          // each horse's own trail: 3.2 m of where its forehand has been
// How far ahead of the mid-body point the forehand (the point the law drives) sits, for a horse of size 1. It must
// be at least as far forward as the front hooves reach while planted. 0.965 m is the game's real steppe horse;
// footfall.js's code-built stand-in reaches 0.93 m. Measure your own model with leadFromHooves() in footfall.js.
export const DEFAULT_LEAD = 0.965;

/**
 * @param {{ capacity?: number, gaits?: ReturnType<typeof makeGaits>, lead?: number }} [opts]
 */
export function createHerd(opts = {}) {
  const CAP = opts.capacity ?? 256;
  const gaits = opts.gaits ?? makeGaits();
  const lead = opts.lead ?? DEFAULT_LEAD;
  const fit = bendFitMatrix(lead, -0.6, -1.2);
  const f64 = () => new Float64Array(CAP), f32 = () => new Float32Array(CAP), u8 = () => new Uint8Array(CAP);
  const S = {
    n: 0,
    // the forehand: the point that obeys the law
    x: f64(), z: f64(), yaw: f64(), speed: f64(), yawRate: f64(), curve: f64(),
    // stride: phase in cycles of the current gait, and the cross-fade from the previous gait
    phase: f64(), phasePrev: f64(), gait: u8(), gaitPrev: u8(), blend: f32(), size: f32(),
    // the body: where to draw it, its heading, its bend along the trail, its lean
    mx: f64(), mz: f64(), myaw: f64(), b1: f64(), b2: f64(), b3: f64(), b4: f64(), roll: f32(),
    // the trail (ring buffers)
    trX: new Float64Array(CAP * TR_N), trZ: new Float64Array(CAP * TR_N), trYaw: new Float64Array(CAP * TR_N), trHead: u8(), trAcc: f64(),
    // per-horse limits (LIMITS, HERO, CHARGER or your own) and the last wish (for debugging)
    lim: new Array(CAP).fill(LIMITS), wYaw: f64(), wSpd: f32(),
  };
  S.blend.fill(1);

  let _hx = 0, _hz = 0, _hyaw = 0;
  function trailInit(i) {
    const o = i * TR_N, sn = Math.sin(S.yaw[i]), cs = Math.cos(S.yaw[i]);
    for (let k = 0; k < TR_N; k++) { S.trX[o + k] = S.x[i] - sn * (k + 1) * TR_DS; S.trZ[o + k] = S.z[i] - cs * (k + 1) * TR_DS; S.trYaw[o + k] = S.yaw[i]; }
    S.trHead[i] = 0; S.trAcc[i] = TR_DS;
  }
  function trailPush(i, d) {            // the lead point has moved d metres: drop points every TR_DS behind it
    let acc = S.trAcc[i] + d; const o = i * TR_N;
    while (acc >= TR_DS) {
      const h = S.trHead[i], f = TR_DS / acc, nh = (h + TR_N - 1) % TR_N;
      S.trX[o + nh] = S.trX[o + h] + (S.x[i] - S.trX[o + h]) * f; S.trZ[o + nh] = S.trZ[o + h] + (S.z[i] - S.trZ[o + h]) * f; S.trYaw[o + nh] = S.trYaw[o + h] + (S.yaw[i] - S.trYaw[o + h]) * f;
      S.trHead[i] = nh; acc -= TR_DS;
    }
    S.trAcc[i] = acc;
  }
  function trailGet(i, d) {             // the point d metres back along horse i's trail -> _hx, _hz, _hyaw
    const o = i * TR_N, acc = S.trAcc[i], h = S.trHead[i];
    if (d <= acc) { const f = acc > 1e-9 ? d / acc : 0; _hx = S.x[i] + (S.trX[o + h] - S.x[i]) * f; _hz = S.z[i] + (S.trZ[o + h] - S.z[i]) * f; _hyaw = S.yaw[i] + (S.trYaw[o + h] - S.yaw[i]) * f; return; }
    let k = (d - acc) / TR_DS, k0 = Math.floor(k); if (k0 > TR_N - 2) { k0 = TR_N - 2; k = k0 + 1; }
    const f = k - k0, i0 = o + (h + k0) % TR_N, i1 = o + (h + k0 + 1) % TR_N;
    _hx = S.trX[i0] + (S.trX[i1] - S.trX[i0]) * f; _hz = S.trZ[i0] + (S.trZ[i1] - S.trZ[i0]) * f; _hyaw = S.trYaw[i0] + (S.trYaw[i1] - S.trYaw[i0]) * f;
  }
  // where the body is: mid-body point M and the bend coefficients, from the trail
  function bodyFromTrail(i) {
    const s = S.size[i], l = lead * s, m = fit;
    trailGet(i, l); const mx = _hx, mz = _hz, my = _hyaw;
    const t1 = S.yaw[i] - my; trailGet(i, l * 0.5); const t2 = _hyaw - my; trailGet(i, l + 0.6 * s); const t3 = _hyaw - my; trailGet(i, l + 1.2 * s); const t4 = _hyaw - my;
    S.mx[i] = mx; S.mz[i] = mz; S.myaw[i] = my;
    const s2 = s * s;
    S.b1[i] = (m[0] * t1 + m[1] * t2 + m[2] * t3 + m[3] * t4) / s; S.b2[i] = (m[4] * t1 + m[5] * t2 + m[6] * t3 + m[7] * t4) / s2;
    S.b3[i] = (m[8] * t1 + m[9] * t2 + m[10] * t3 + m[11] * t4) / (s2 * s); S.b4[i] = (m[12] * t1 + m[13] * t2 + m[14] * t3 + m[15] * t4) / (s2 * s2);
  }

  /** Add a horse standing (or moving at `speed`) with its MID-BODY at (x, z). Returns its index. @param {HorseSpawn} o */
  function add(o) {
    if (S.n >= CAP) throw new Error('herd: full (raise capacity)');
    const i = S.n++, yaw = o.yaw ?? 0, size = o.size ?? 1;
    S.size[i] = size; S.yaw[i] = yaw; S.speed[i] = o.speed ?? 0; S.curve[i] = 0; S.yawRate[i] = 0;
    // the forehand stands `lead` ahead of the body
    S.x[i] = o.x + Math.sin(yaw) * lead * size; S.z[i] = o.z + Math.cos(yaw) * lead * size;
    S.phase[i] = o.phase ?? 0; S.phasePrev[i] = S.phase[i]; S.gait[i] = 0; S.gaitPrev[i] = 0; S.blend[i] = 1; S.roll[i] = 0;
    if (S.speed[i] > 0) { let g = 0; while (g < 4 && S.speed[i] > gaits.up[g]) g++; S.gait[i] = g; }
    S.lim[i] = o.limits ?? LIMITS;
    trailInit(i); bodyFromTrail(i);
    return i;
  }

  /** One step of the law for horse i, then its trail, body and lean. wantYaw: radians; wantSpeed: m/s. */
  function step(i, wantYaw, wantSpeed, dt) {
    S.wYaw[i] = wantYaw; S.wSpd[i] = wantSpeed;
    stepHorse(S, i, wantYaw, wantSpeed, dt, gaits, 1, Infinity, S.lim[i]);
    trailPush(i, S.speed[i] * dt); bodyFromTrail(i);
    S.roll[i] += (leanFor(S.speed[i], S.b1[i] * S.speed[i]) - S.roll[i]) * (dt * 5 > 1 ? 1 : dt * 5);
  }

  /**
   * Where a point of the horse's model lands in the world: model coordinates (+Z forward, +X left, origin at the
   * mid-body point, y up) bent along the trail, leaned, turned by the body's heading. Writes [x, y, z] into out.
   */
  const _b = [0, 0, 0];
  function worldPoint(i, px, py, pz, out) {
    const sc = S.size[i];
    bendPoint(px * sc, pz * sc, S.b1[i], S.b2[i], S.b3[i], S.b4[i], _b);
    let x = _b[0], y = py * sc; const z = _b[1];
    const roll = S.roll[i];
    if (roll) { let g = y / (0.55 * sc); g = g < 0 ? 0 : g > 1 ? 1 : g; const a = roll * g * g * (3 - 2 * g), sn = Math.sin(a), cs = Math.cos(a), nx = x * cs + y * sn; y = y * cs - x * sn; x = nx; }
    const yaw = S.myaw[i], c = Math.cos(yaw), s = Math.sin(yaw);
    out[0] = S.mx[i] + x * c + z * s; out[1] = y; out[2] = S.mz[i] - x * s + z * c;
    return out;
  }

  /** Go to a point and stop there: the heading to it, and a speed it can still brake from (cruise caps it). */
  function seek(i, tx, tz, cruise, out = { yaw: 0, speed: 0 }) {
    const dx = tx - S.x[i], dz = tz - S.z[i], d = Math.hypot(dx, dz);
    out.yaw = d > 1e-6 ? Math.atan2(dx, dz) : S.yaw[i];
    const lim = S.lim[i], brake = Math.sqrt(2 * lim.BRAKE * 0.8 * Math.max(0, d - 0.5));
    out.speed = Math.min(cruise, brake);
    return out;
  }

  return { S, gaits, lead, capacity: CAP, add, step, worldPoint, seek, trailGet: (i, d, out = [0, 0, 0]) => { trailGet(i, d); out[0] = _hx; out[1] = _hz; out[2] = _hyaw; return out; } };
}

// ---- THE PLAYER'S REINS, with the game's numbers. turn: -1..1 (+1 = right, D), level 0 halt / 1 walk / 2 canter /
// 3 gallop (W up, S down), burst: Shift held (flat-out gallop). The paces come from the gait table the way the game
// picked them: walk at 72 % of the walk's range, canter at 55 % of its range (at most 6.5 m/s), gallop at 72 % of its
// range (at most 12.5 m/s), the burst at 98.5 % of top speed. A turn asked from a stand walks round at 1.9 m/s (a
// horse cannot pivot). Ask the HERO limits for the player's horse.
export const REINS = { steerAsk: 1.3, pivotSpeed: 1.9, burst: 0.985 };
export function paceSpeeds(gaits) {
  const r = (k, f) => gaits.list[k].min + (gaits.list[k].max - gaits.list[k].min) * f;
  return [0, r(1, 0.72), Math.min(6.5, r(3, 0.55)), Math.min(12.5, r(4, 0.72))];
}
export function reins(yaw, turn, level, burst, gaits, out = { yaw: 0, speed: 0 }) {
  let want = burst ? gaits.vmax * REINS.burst : paceSpeeds(gaits)[level];
  if (turn && want < REINS.pivotSpeed) want = REINS.pivotSpeed;
  out.yaw = yaw - turn * REINS.steerAsk; out.speed = want;
  return out;
}

export { LIMITS, HERO, wrapAngle };
