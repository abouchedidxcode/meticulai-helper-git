// THE BOW AND THE SHOT: hold to draw, let go to loose, and the loose itself (the point under the crosshair, the
// launch solved to arrive there, the lock handed to the arrow). Pure (no three.js).
//
//   const bow = createBow(options?);
//   every step:  const shot = bow.update(dt, buttonHeld);   // -> null, or { power, perfect, speed } at the loose
//   bow.state -> { phase: 'ready'|'drawing'|'loosed'|'nocking'|'lowering'|'empty', draw 0..1, ready (full draw), quiver }
//   bow.cancel()  let the string down (right click)      bow.refill(n?)
//
//   const s = aimShot({ aim, eye, aimDir, from, carry, speed, options });   // at the loose
//   -> { vel (launch velocity, carry included), guide (or null), pick (what was aimed at) }; then flight/arrows.launch
import { Vec3 } from './vec3.js';
import { solve } from './ballistics.js';

/** The numbers, exactly as tuned in the source game. */
export const BOW_DEFAULTS = {
  drawTime: 0.4,          // seconds to full draw
  drawEase: 2.1,          // how front-loaded the pull is (1 = even; higher = quick start, slow last inch)
  minDraw: 0.45,          // a tap is a snap shot: the draw carries on to here (about 0.15 s) and looses weak
  tapShoots: true,        // false: a tap lets the string down instead
  speedMin: 30,           // arrow speed at no draw, m/s
  speedFull: 120,         // arrow speed at full draw, m/s
  followT: 0.09, reachT: 0.11, pullT: 0.17, nockT: 0.13,     // 0.5 s from the loose to ready again
  quiver: 60,             // arrows
  guideTurn: 30,          // deg/s a locked arrow may be turned in flight to meet its mark (0 = none)
  assistNear: 0.4,        // m: a locked arrow that passes this close to its mark strikes him...
  assistNearPer100: 0.3,  // ...and this much more per 100 m flown
};

/**
 * The settings the game was last played with by its maker (after the measured defaults above were tuned): a slow,
 * heavy 1.2 s draw, 129 m/s arrows and no aim help beside the target (the lock still works when the crosshair is ON
 * one). Pass both objects to opt in: createBow({ ...PLAYED_SETTINGS.bow }), createAim({ options: { ...PLAYED_SETTINGS.aim } }).
 */
export const PLAYED_SETTINGS = { bow: { drawTime: 1.2, speedFull: 129 }, aim: { assistDeg: 0 } };

export function createBow(options = {}) {
  const T = Object.assign(options, { ...BOW_DEFAULTS, ...options });
  const S = { phase: 'ready', t: 0, drawT: 0, draw: 0, holdT: 0, full: false, snap: false, queued: false, block: false, quiver: T.quiver, wasHeld: false };
  const state = { phase: 'ready', draw: 0, ready: false, quiver: T.quiver, power: 0 };

  function loose() {
    const power = Math.min(1, S.draw);
    const perfect = S.full && power > 0.985;                 // loosed at full draw: a true shot. Nothing else is asked.
    const speed = T.speedMin + (T.speedFull - T.speedMin) * power;
    S.quiver--;
    S.phase = 'loosed'; S.t = 0; S.draw = 0; S.drawT = 0; S.holdT = 0; S.full = false; S.snap = false; S.queued = false;
    return { power, perfect, speed };
  }
  function cancel() {
    if (S.phase !== 'drawing') return;
    S.phase = 'lowering'; S.block = true; S.full = false; S.snap = false; S.queued = false;
  }

  /** One step. held: is the shoot button down? -> null or the shot { power, perfect, speed } */
  function update(dt, held) {
    S.t += dt;
    const pressed = held && !S.wasHeld; S.wasHeld = held;
    if (!held) S.block = false;
    const tReach = T.followT + T.reachT, tDone = tReach + T.pullT + T.nockT;
    let shot = null;
    switch (S.phase) {
      case 'ready':
        // a press made while the last arrow was still going is kept: held, it is a draw; let go, a snap shot
        if ((held || S.queued) && !S.block) {
          if (S.quiver <= 0) { S.phase = 'empty'; S.queued = false; break; }
          S.phase = 'drawing'; S.drawT = 0; S.holdT = 0; S.full = false; S.snap = !held; S.queued = false;
        }
        break;
      case 'drawing':
        if (held) S.snap = false;
        else if (!S.snap) {
          if (S.draw >= T.minDraw) { shot = loose(); break; }
          if (T.tapShoots) S.snap = true; else { cancel(); break; }
        }
        S.drawT = Math.min(T.drawTime, S.drawT + dt);
        { const u = S.drawT / T.drawTime; S.draw = 1 - (1 - u) ** T.drawEase; }
        if (S.snap && S.draw >= T.minDraw) { shot = loose(); break; }
        if (S.drawT >= T.drawTime) { S.full = true; S.holdT += dt; }
        break;
      case 'lowering':
        S.draw = Math.max(0, S.draw - dt * 4.5); S.holdT = 0;
        if (S.draw <= 0) { S.phase = 'ready'; S.drawT = 0; }
        break;
      case 'loosed':
        if (pressed) S.queued = true;
        if (S.t >= tReach) S.phase = S.quiver > 0 ? 'nocking' : 'empty';
        break;
      case 'nocking':
        if (pressed) S.queued = true;
        if (S.t >= tDone) S.phase = 'ready';
        break;
      case 'empty':
        if (S.quiver > 0) S.phase = 'ready';
        break;
    }
    state.phase = S.phase; state.draw = S.draw; state.ready = S.full; state.quiver = S.quiver; state.held = S.holdT;
    if (shot) state.power = shot.power;
    return shot;
  }
  function refill(n = T.quiver) { S.quiver = Math.min(T.quiver, n); if (S.phase === 'empty' && S.quiver > 0) { S.phase = 'nocking'; S.t = T.followT + T.reachT; } }

  return { update, cancel, refill, state, options: T };
}

const _v1 = new Vec3(), _launch = new Vec3();
/**
 * The loose: what the crosshair is on, and the launch that arrives there.
 * @param {object} o
 * @param {ReturnType<import('./aim.js').createAim>} o.aim
 * @param {{x,y,z}} o.eye      the camera / eye position the crosshair is seen from
 * @param {{x,y,z}} o.aimDir   unit vector through the crosshair
 * @param {{x,y,z}} o.from     where the arrow starts (the arrow's point at full draw, or the eye)
 * @param {{x,y,z}|null} o.carry  the shooter's own velocity (the horse's, the cart's)
 * @param {number} o.speed     the bow's speed for this shot (createBow's shot.speed)
 * @param {object} [o.options] the bow's options (guideTurn, assistNear, assistNearPer100)
 */
export function aimShot({ aim, eye, aimDir, from, carry = null, speed, options = BOW_DEFAULTS, pick = null }) {
  const pk = aim.resolve(eye, aimDir, pick || aim.make());   // (the one the mark is on keeps the shot: what was shown is what happens)
  let guide = null;
  _v1.subVectors(pk.point, from);
  if (_v1.dot(aimDir) < 4) _launch.copy(aimDir);              // at arm's length there is nothing to solve
  else if (!solve(from, pk.point, speed, carry, pk.lock ? pk.vel : null, _launch)) {
    // out of this draw's reach: the best it can do on that line (it falls short)
    const h = Math.hypot(_v1.x, _v1.z) || 1; _launch.set(_v1.x / h * 0.78, 0.62, _v1.z / h * 0.78).normalize();
  } else if (pk.lock) guide = { where: pk.lock.where, turn: (options.guideTurn ?? 30) * Math.PI / 180, near: options.assistNear ?? 0.4, nearPer: (options.assistNearPer100 ?? 0.3) / 100 };
  const vel = new Vec3().copy(_launch).multiplyScalar(speed);
  if (carry) vel.add(carry);
  return { vel, guide, pick: pk };
}
