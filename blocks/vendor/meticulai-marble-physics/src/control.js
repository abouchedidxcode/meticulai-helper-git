// Turns one tick of player input into forces on a marble body (from Lost Marbles). The game shared it between the
// authoritative simulation and the client's prediction of its own marble, so both agree on how a marble handles.
// The game's perk abilities (turbo, rocket, pogo, ghost, anchor, head start) are left out; jump, double jump,
// grip, drag, air control and slick surfaces are kept with the game's numbers.
//
// input: { mx, mz, btn }  mx/mz = desired world-space direction (length <= 1); btn bits below
// ctl:   per-marble control state (cooldowns, timers); mutated
// st:    handling stats, start from { ...DEFAULT_STATS }
// mods:  optional { speed, accel } situational multipliers (slipstream, catch-up help...)

import { M as Math } from './math.js';
import { TICK_DT } from './physics.js';

export const BTN_JUMP = 1;

// The game's starting marble. Comments say what each one feels like.
export const DEFAULT_STATS = {
  topSpeed: 17, // control speed cap, units/s (downhill can exceed it)
  accel: 25, // grounded control acceleration
  airControl: 0.32, // fraction of accel available in the air
  jump: 10.5, // jump launch speed
  jumpCd: 0.9, // seconds between jumps
  grip: 2.4, // how fast sideways drift is bled off while steering (higher = carves, lower = slides)
  drag: 0.05, // horizontal speed lost per second (fraction)
  doubleJump: 0, // extra jumps allowed in the air
};

// The range the game allowed perks to push each stat into: a sensible tuning range.
export const STAT_RANGES = {
  topSpeed: [12, 27], accel: [16, 46], airControl: [0.2, 1], jump: [8, 21], jumpCd: [0.45, 2], grip: [1, 6],
  drag: [0.01, 0.1],
};

// Lacquered surfaces (collider tag 'slick'): less grip and less control push, so killing an orbit in a bowl takes
// skill. Contact is last tick's (control runs before physics); `memory` bridges the small hops of a bumpy ride.
export const SLICK = { grip: 0.1, accel: 0.2, memory: 0.2 };

export function makeCtl() {
  return { jumpCdT: 0, airJumps: 0, prevBtn: 0, justJumped: 0, slickT: 0 };
}

// Copies the fields prediction needs (used to snapshot/restore control state).
export function copyCtl(dst, src) {
  dst.jumpCdT = src.jumpCdT;
  dst.airJumps = src.airJumps;
  dst.prevBtn = src.prevBtn;
  dst.justJumped = src.justJumped;
  dst.slickT = src.slickT || 0;
  return dst;
}

const IDLE = { mx: 0, mz: 0, btn: 0 };

/**
 * Applies control for one tick, before stepWorld. `frozen` (a countdown) ignores movement and jumps.
 * Sets body.ax/ay/az and changes body.v* directly (grip, drag, jumps). Returns 'jump', 'airjump' or null.
 * @param {object} body from makeBody
 * @param {object} ctl from makeCtl
 * @param {{mx:number,mz:number,btn:number}|null} input
 * @param {typeof DEFAULT_STATS} st
 * @param {{speed:number,accel:number}|null} [mods]
 * @param {boolean} [frozen]
 * @param {number} [dt] tick length (the World's tickDt)
 */
export function controlStep(body, ctl, input, st, mods, frozen = false, dt = TICK_DT) {
  const inp = frozen ? IDLE : input || IDLE;
  const btn = inp.btn | 0;
  const pressed = btn & ~ctl.prevBtn;
  ctl.prevBtn = btn;
  ctl.justJumped = 0;

  ctl.jumpCdT = Math.max(0, ctl.jumpCdT - dt);
  ctl.slickT = body.touchTag === 'slick' ? SLICK.memory : Math.max(0, (ctl.slickT || 0) - dt);
  const slick = ctl.slickT > 0;

  let mx = Number.isFinite(inp.mx) ? inp.mx : 0;
  let mz = Number.isFinite(inp.mz) ? inp.mz : 0;
  let mag = Math.hypot(mx, mz);
  if (mag > 1) {
    mx /= mag;
    mz /= mag;
    mag = 1;
  }
  const dx = mag > 1e-4 ? mx / mag : 0;
  const dz = mag > 1e-4 ? mz / mag : 0;

  const grounded = body.groundT < 0.12;
  const top = st.topSpeed * (mods ? mods.speed : 1);
  let acc = st.accel * (mods ? mods.accel : 1);
  if (!grounded) acc *= st.airControl;
  if (slick) acc *= SLICK.accel;

  // Push hard when slow, fade the push out over the last quarter of top speed.
  const along = body.vx * dx + body.vz * dz;
  let lim = (top - along) / (top * 0.25);
  lim = lim < 0 ? 0 : lim > 1 ? 1 : lim;
  let ax = dx * acc * mag * lim, ay = 0, az = dz * acc * mag * lim;

  if (grounded) {
    // Keep the push in the ground plane so it doesn't press into slopes.
    const d = ax * body.gnx + ay * body.gny + az * body.gnz;
    ax -= body.gnx * d;
    ay -= body.gny * d;
    az -= body.gnz * d;
    if (mag > 0.15 && !frozen) {
      // Grip: bleed sideways drift while steering, handing some of it back as forward speed.
      const px = body.vx - along * dx, pz = body.vz - along * dz;
      const k = Math.min(1, st.grip * (slick ? SLICK.grip : 1) * dt * mag);
      const perp = Math.hypot(px, pz);
      body.vx -= px * k;
      body.vz -= pz * k;
      if (along > -2 && along < top) {
        body.vx += dx * perp * k * 0.55;
        body.vz += dz * perp * k * 0.55;
      }
    }
  }
  const drag = 1 - st.drag * dt;
  body.vx *= drag;
  body.vz *= drag;
  body.ax = ax;
  body.ay = ay;
  body.az = az;

  if (frozen) return null;

  // Jump (press edge): along the ground normal blended with straight up, cancelling any speed into the ground.
  if (pressed & BTN_JUMP) {
    if (grounded && ctl.jumpCdT <= 0) {
      let jx = body.gnx, jy = body.gny + 1, jz = body.gnz;
      const l = Math.hypot(jx, jy, jz);
      jx /= l; jy /= l; jz /= l;
      const vn = body.vx * jx + body.vy * jy + body.vz * jz;
      if (vn < 0) {
        body.vx -= jx * vn;
        body.vy -= jy * vn;
        body.vz -= jz * vn;
      }
      body.vx += jx * st.jump;
      body.vy += jy * st.jump;
      body.vz += jz * st.jump;
      body.groundT = 0.2;
      ctl.jumpCdT = st.jumpCd;
      ctl.airJumps = st.doubleJump | 0;
      ctl.justJumped = 1;
      return 'jump';
    } else if (!grounded && ctl.airJumps > 0) {
      ctl.airJumps--;
      body.vy = Math.max(body.vy, 0) + st.jump * 0.85;
      ctl.justJumped = 2;
      return 'airjump';
    }
  }
  return null;
}
