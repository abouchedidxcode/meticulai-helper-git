// THE MOVEMENT PROOF. From TUMEN by Meticulai. Looks at EVERY horse after EVERY step and records (which horse, when,
// by how much) any time a horse:
//
//   off-facing       moves in a direction more than angleDeg off the way it faces (above a crawl); checked for the
//                    forehand (the point the law drives) and for the mid-body point the horse is drawn at
//   backward         moves against its facing
//   jump             moves further in one step than its speed allows; or its claimed speed is not its real speed
//   accel / brake    gains or loses speed faster than its limits
//   turn             turns faster than the yaw-rate limit for its speed; a standing horse may not pivot at all
//   overlap          stands inside another horse for more than a moment (overlapSecs)
//   hoof slide       a hoof that the footfall says is on the ground moves more than `slide` metres from where it
//                    landed, in world space, placed exactly as a renderer would (bent along the trail, leaned)
//
// The checks work from positions (finite differences), written separately from the law, so they catch a broken
// law instead of repeating it. Limits are each horse's own (herd.S.lim[i]: LIMITS, HERO, CHARGER...).
// The game ran this on recorded browser runs of up to 6,000 horses; here it runs on a herd.js herd in node or in
// the page. Pure JS, no three.js.

import { hoofAt, HOOVES, CONTACT_EPS, FOOTFALL } from './footfall.js';
import { GAIT_NAMES, DEFAULT_GAITS } from './locomotion.js';

export const CHECK_DEFAULTS = { angleDeg: 2, crawl: 0.3, slide: 0.03, settle: 0, overlapSecs: 0.5, overlapDist: 0.45, hooves: true, halfLength: 0.62 };

/**
 * @param {ReturnType<import('./herd.js').createHerd>} herd
 * @param {Partial<typeof CHECK_DEFAULTS> & { hoofAt?: Function, contactsOf?: Function, gaitTable?: object }} [opts]
 *   hoofAt(gaitName, hoof, phase, out) -> {x,y,z} model-space sole point (default: footfall.js, the stand-in);
 *   contactsOf(gaitName, hoof) -> [[a, b], ...] phase intervals the hoof is planted (default: footfall.js)
 */
export function createMoveChecker(herd, opts = {}) {
  const cfg = { ...CHECK_DEFAULTS, ...opts };
  const S = herd.S, CAP = herd.capacity, RAD = Math.PI / 180, vmax = herd.gaits.vmax;
  const gaitTable = cfg.gaitTable ?? DEFAULT_GAITS;
  const hoofFn = cfg.hoofAt ?? ((g, h, p, o) => hoofAt(g, h, p, o, gaitTable));
  const contactsOf = cfg.contactsOf ?? ((g, h) => (g === 'idle' ? [[0, 1]] : [[FOOTFALL[g][h][0] + CONTACT_EPS, FOOTFALL[g][h][0] + FOOTFALL[g][h][1] - CONTACT_EPS]]));
  // standing: the stand-in's idle keeps every hoof square under its pivot (fronts 0.44 m ahead of the middle, hinds 0.40 behind)
  const idleHoof = cfg.idleHoof ?? ((h, o) => { o.x = (h[1] === 'l' ? 1 : -1) * 0.16; o.y = 0.07; o.z = h[0] === 'f' ? 0.44 : -0.4; return o; });
  const px = new Float64Array(CAP), pz = new Float64Array(CAP), pyaw = new Float64Array(CAP), pv = new Float64Array(CAP), seen = new Uint8Array(CAP);
  const pmx = new Float64Array(CAP), pmz = new Float64Array(CAP), pmyaw = new Float64Array(CAP);
  const plantX = new Float64Array(CAP * 4), plantZ = new Float64Array(CAP * 4), planted = new Uint8Array(CAP * 4), plantGait = new Int8Array(CAP * 4);
  const checks = {};
  const mk = (name, unit, limit) => (checks[name] = { name, unit, limit, worst: 0, horse: -1, t: 0, fails: 0, first: null, samples: 0 });
  const cOff = mk('off-facing', 'deg', cfg.angleDeg), cBody = mk('body off-facing', 'deg', cfg.angleDeg), cBack = mk('backward', 'm/step', 1e-5), cJump = mk('jump', 'm over allowed', 0.002), cClaim = mk('speed claimed vs real', 'm/s', 0.03);
  const cAcc = mk('accel', 'x limit', 1.05), cBrk = mk('brake', 'x limit', 1.05), cTurn = mk('turn', 'x limit', 1.03), cPivot = mk('pivot at rest', 'rad/s', 0.003);
  const cOver = mk('overlap', 's', cfg.overlapSecs), cSlide = mk('hoof slide', 'm', cfg.slide);
  const info = { steps: 0, horseSteps: 0, movingSteps: 0, hoofChecked: 0, contacts: 0, blendSteps: 0, minGap: 9, maxSpeed: 0, gaitSteps: [0, 0, 0, 0, 0], slideByGait: [0, 0, 0, 0, 0] };
  const note = (c, value, i, t, extra) => {
    c.samples++;
    if (value > c.worst) { c.worst = value; c.horse = i; c.t = t; }
    if (value > c.limit) { c.fails++; if (!c.first) c.first = { horse: i, t: +t.toFixed(3), value: +value.toFixed(5), speed: +S.speed[i].toFixed(2), gait: S.gait[i], ...extra }; }
  };
  const maxAccel = (v, L) => { const t = Math.min(1, Math.max(0, v / vmax)); return L.ACCEL_LOW + (L.ACCEL_HIGH - L.ACCEL_LOW) * t; };
  const maxYaw = (v, L) => (v <= 0 ? 0 : Math.min(v / L.R_MIN, L.A_LAT / v));
  const inIv = (p, iv) => {
    p -= Math.floor(p);
    for (let [a, b] of iv) { if (b < a) b += 1; const m = (b - a) * cfg.settle; a += m; b -= m; if ((p >= a && p <= b) || (p + 1 >= a && p + 1 <= b)) return true; }
    return false;
  };
  const CELL = 3, cells = new Map(), pairs = new Map();
  const segDist = (ax, az, adx, adz, bx, bz, bdx, bdz, h) => {
    let best = 1e9;
    for (let s = -1; s <= 1; s += 0.5) for (let u = -1; u <= 1; u += 0.5) { const dx = ax + adx * h * s - bx - bdx * h * u, dz = az + adz * h * s - bz - bdz * h * u, d = dx * dx + dz * dz; if (d < best) best = d; }
    return Math.sqrt(best);
  };
  const H = { x: 0, y: 0, z: 0, down: false }, W = [0, 0, 0];
  let stepNo = 0;

  /** Call once after every horse has taken its step. dt: the step (s), t: the clock (s). */
  function afterStep(dt, t) {
    if (dt <= 0) return;
    const n = S.n; stepNo++; info.steps++;
    cells.clear();
    for (let i = 0; i < n; i++) {
      const x = S.x[i], z = S.z[i], yaw = S.yaw[i], v = S.speed[i], L = S.lim[i];
      const ymid = seen[i] ? (yaw + pyaw[i]) * 0.5 : yaw, fx = Math.sin(ymid), fz = Math.cos(ymid);
      info.horseSteps++; if (v > info.maxSpeed) info.maxSpeed = v;
      if (seen[i]) {
        const dx = x - px[i], dz = z - pz[i], dist = Math.hypot(dx, dz), vm = dist / dt, fwd = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
        // 1. only along its facing, never backward
        if (vm > cfg.crawl) { info.movingSteps++; note(cOff, Math.atan2(lat, fwd) / RAD, i, t, { lateral: +lat.toFixed(4) }); }
        note(cBack, fwd < 0 ? -fwd : 0, i, t);
        // 2. no jumps; the speed it claims is the speed it has
        note(cJump, dist - Math.max(v, pv[i]) * dt * 1.02, i, t, { moved: +dist.toFixed(3) });
        note(cClaim, Math.abs(vm - v) - 0.01 * v, i, t, { real: +vm.toFixed(3) });
        // 3. bounded acceleration and braking (from real displacement)
        const acc = (vm - pv[i]) / dt;
        if (acc > 0) note(cAcc, acc / (maxAccel(pv[i], L) + 0.05), i, t, { acc: +acc.toFixed(2) }); else note(cBrk, -acc / (L.BRAKE + 0.05), i, t, { acc: +acc.toFixed(2) });
        // 4. bounded turning; no pivot at rest
        const w = Math.abs(yaw - pyaw[i]) / dt, wl = maxYaw(vm, L);
        note(cTurn, w / (wl + 0.002), i, t, { yawRate: +w.toFixed(4), allowed: +wl.toFixed(4) });
        if (vm < 1e-3) note(cPivot, w, i, t);
        pv[i] = vm;
        // the same for the mid-body point, which is where the horse is drawn
        const bym = (S.myaw[i] + pmyaw[i]) * 0.5, bx = S.mx[i] - pmx[i], bz = S.mz[i] - pmz[i], bd = Math.hypot(bx, bz), bfx = Math.sin(bym), bfz = Math.cos(bym), bf = bx * bfx + bz * bfz;
        if (bd / dt > cfg.crawl) note(cBody, Math.atan2(Math.abs(bx * bfz - bz * bfx), bf) / RAD, i, t);
        note(cBack, bf < 0 ? -bf : 0, i, t, { point: 'body' });
        note(cJump, bd - Math.max(v, pv[i]) * dt * 1.03 - 0.001, i, t, { moved: +bd.toFixed(3), point: 'body' });
      } else { pv[i] = v; seen[i] = 1; }
      px[i] = x; pz[i] = z; pyaw[i] = yaw; pmx[i] = S.mx[i]; pmz[i] = S.mz[i]; pmyaw[i] = S.myaw[i];
      // 5. hooves: planted means planted, in world space
      const g = S.gait[i]; info.gaitSteps[g]++;
      if (cfg.hooves) {
        if (S.blend[i] < 1) { info.blendSteps++; for (let h = 0; h < 4; h++) planted[i * 4 + h] = 0; }
        else for (let h = 0; h < 4; h++) {
          const hoof = HOOVES[h], q = i * 4 + h, gn = GAIT_NAMES[g], iv = contactsOf(gn, hoof);
          if (!iv || !inIv(S.phase[i], iv)) { planted[q] = 0; continue; }
          if (g === 0) idleHoof(hoof, H); else hoofFn(gn, hoof, S.phase[i], H);
          herd.worldPoint(i, H.x, H.y, H.z, W);
          if (!planted[q] || plantGait[q] !== g) { planted[q] = 1; plantGait[q] = g; plantX[q] = W[0]; plantZ[q] = W[2]; info.contacts++; }
          else {
            const sl = Math.hypot(W[0] - plantX[q], W[2] - plantZ[q]); info.hoofChecked++;
            if (sl > info.slideByGait[g]) info.slideByGait[g] = sl;
            note(cSlide, sl, i, t, { hoof: 'hoof_' + hoof, gait: gn, phase: +(S.phase[i] % 1).toFixed(3) });
          }
        }
      }
      const key = Math.floor(S.mx[i] / CELL) * 65536 + Math.floor(S.mz[i] / CELL);
      let c = cells.get(key); if (!c) cells.set(key, c = []); c.push(i);
    }
    // 6. no two horses in the same place for more than a moment
    for (const [key, list] of cells) {
      const cx = Math.floor(key / 65536), cz = key - cx * 65536;
      for (let gx = cx; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
        if (gx === cx && gz < cz) continue;
        const other = gx === cx && gz === cz ? list : cells.get(gx * 65536 + gz); if (!other) continue;
        for (const i of list) for (const j of other) {
          if (other === list && j <= i) continue;
          const dx = S.mx[j] - S.mx[i], dz = S.mz[j] - S.mz[i]; if (dx * dx + dz * dz > 9) continue;
          const g = segDist(S.mx[i], S.mz[i], Math.sin(S.myaw[i]), Math.cos(S.myaw[i]), S.mx[j], S.mz[j], Math.sin(S.myaw[j]), Math.cos(S.myaw[j]), cfg.halfLength);
          if (g < info.minGap) info.minGap = g;
          if (g < cfg.overlapDist) { const pk = i * CAP + j, e = pairs.get(pk); if (e && e.step === stepNo - 1) { e.step = stepNo; e.time += dt; note(cOver, e.time, i, t, { with: j, gap: +g.toFixed(3) }); } else pairs.set(pk, { step: stepNo, time: dt }); }
        }
      }
    }
    if (stepNo % 600 === 0) for (const [k, e] of pairs) if (e.step < stepNo - 1) pairs.delete(k);
  }

  /** Forget a horse's history (after you teleport it on purpose: a respawn, a reset). */
  function forget(i) { seen[i] = 0; for (let h = 0; h < 4; h++) planted[i * 4 + h] = 0; }

  function report() {
    const list = Object.values(checks);
    return { ok: list.every((c) => !c.fails), failed: list.filter((c) => c.fails).map((c) => c.name), checks: list, info };
  }
  return { afterStep, forget, report, checks, info };
}

/** A plain-text table of a report (what the CLI prints). */
export function formatReport(rep) {
  const rows = rep.checks.map((c) => [c.name, c.worst.toFixed(c.worst < 0.1 ? 4 : 3) + ' ' + c.unit, String(c.limit), c.fails ? `FAIL x${c.fails}` : 'ok', c.horse >= 0 ? `#${c.horse} @ ${c.t.toFixed(2)}s` : '-']);
  const head = ['check', 'worst seen', 'limit', 'result', 'worst horse'], w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r) => '  ' + r.map((c, i) => c.padEnd(w[i])).join('  ');
  const i = rep.info;
  return [line(head), line(w.map((n) => '-'.repeat(n))), ...rows.map(line),
    `  ${i.horseSteps} horse-steps, ${i.contacts} footfalls followed, top speed ${i.maxSpeed.toFixed(1)} m/s; worst slide by gait (mm): ${GAIT_NAMES.map((g, k) => `${g} ${(i.slideByGait[k] * 1000).toFixed(1)}`).join(', ')}; closest two horses: ${i.minGap.toFixed(2)} m`].join('\n');
}
