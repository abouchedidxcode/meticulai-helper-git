// Arcade flight model from Dragon Aces (Meticulai), shared there by the local player, the server's bots and the
// authoritative room. A flyer goes where its nose points (with a little slip), trades height for speed, stalls when
// slow, flaps harder with throttle and burns stamina to boost. Body axes: forward -Z, up +Y, right +X.
// Pure maths: no three.js, no DOM. Runs in a browser, a worker, Node or a server.
//
// THE FEEL IS TUNED. Every number below is the live game's. Change them in your own copy of FLIGHT (or a preset),
// never here, and only after playing it.
import { clamp, lerp, qaxis, qmul, qnorm, qrot, qrotInv, vlen } from './math.js';

/** The model's numbers (all the live game's). Pass your own copy as the 5th argument of stepFlight to change them. */
export const FLIGHT = {
  thrust: 30, // m/s^2 at full flap
  topSpeed: 96, // terminal level speed at full flap (m/s); drag = thrust / topSpeed^2
  boost: 36, // m/s^2 added while boosting (costs stamina)
  brakeDrag: 3.2,
  g: 9.81,
  stallSpeed: 30, // below about this the nose starts to drop and lift goes
  maxSpeed: 190, // hard cap (m/s), times the preset's speed
  ceiling: 1700, // air gets thin above this height (m): thrust fades over the next 400 m
  dodge: { duration: 0.75, cooldown: 2.6, stamina: 0.22 }, // barrel roll: seconds, seconds, share of stamina
};
export const STALL_SPEED = FLIGHT.stallSpeed;
export const MAX_SPEED = FLIGHT.maxSpeed;

/**
 * Per-flyer multipliers (the game's four dragon breeds). speed scales thrust response and top speed, turn scales
 * control authority. The live game's breeds: balanced = Ember Drake, heavy = Frost Wyrm, fast = Storm Wyvern,
 * agile = Venom Serpent.
 */
export const PRESETS = {
  balanced: { speed: 1.0, turn: 1.0 },
  heavy: { speed: 0.93, turn: 0.9 },
  fast: { speed: 1.09, turn: 1.12 },
  agile: { speed: 0.98, turn: 1.06 },
};

/** A new flyer at pos ([x, y, z]) facing quat ([x, y, z, w]; local -Z is forward), at 75 m/s. */
export function createFlightState(pos, quat) {
  return {
    p: [pos[0], pos[1], pos[2]],
    q: [quat[0], quat[1], quat[2], quat[3]],
    vel: [0, 0, 0],
    speed: 75,
    sink: 0,
    stamina: 1,
    throttle: 0.6,
    boosting: false,
    braking: false,
    dodge: 0, // remaining dodge-roll time
    dodgeDir: 0,
    dodgeCd: 0,
    // angular velocity (body frame) for smooth control response
    wp: 0, wr: 0, wy: 0,
  };
}

const _f = [0, 0, 0], _u = [0, 0, 0], _r = [0, 0, 0], _tmpq = [0, 0, 0, 1], _tmpq2 = [0, 0, 0, 1];
const FWD = [0, 0, -1], UP = [0, 1, 0], RIGHT = [1, 0, 0];

export const forwardOf = (q, o = [0, 0, 0]) => qrot(o, q, FWD);
export const upOf = (q, o = [0, 0, 0]) => qrot(o, q, UP);
export const rightOf = (q, o = [0, 0, 0]) => qrot(o, q, RIGHT);

// Bank angle (rad), positive = right wing down.
export function bankOf(q) {
  qrot(_r, q, RIGHT);
  qrot(_u, q, UP);
  return Math.atan2(-_r[1], _u[1]);
}

/**
 * Advance one step (the game steps it at the frame rate on the client, dt up to 0.05 s, and at 30 Hz on the server).
 * @param {object} s flight state from createFlightState
 * @param {{pitch:number, roll:number, yaw:number, throttle:number, boost?:boolean, brake?:boolean, dodge?:number}} input
 *   pitch, roll, yaw in [-1, 1]; throttle 0..1; dodge -1 | 0 | 1 starts a barrel roll left / right
 * @param {number} dt seconds
 * @param {{speed:number, turn:number}} [breed] multipliers (PRESETS)
 * @param {typeof FLIGHT} [cfg] the model's numbers
 */
export function stepFlight(s, input, dt, breed = PRESETS.balanced, cfg = FLIGHT) {
  const THRUST = cfg.thrust, DRAG = cfg.thrust / (cfg.topSpeed * cfg.topSpeed), BOOST = cfg.boost, BRAKE_DRAG = cfg.brakeDrag, G = cfg.g;
  const STALL_SPEED = cfg.stallSpeed, MAX_SPEED = cfg.maxSpeed, DODGE = cfg.dodge;
  const spd = breed.speed;
  const turn = breed.turn;
  forwardOf(s.q, _f);

  // control authority grows with airspeed
  const auth = clamp((s.speed - 14) / 46, 0.28, 1) * turn;

  // dodge roll: a fast barrel roll with a sideways hop
  s.dodgeCd = Math.max(0, s.dodgeCd - dt);
  if (input.dodge && s.dodge <= 0 && s.dodgeCd <= 0 && s.stamina >= DODGE.stamina) {
    s.dodge = DODGE.duration;
    s.dodgeDir = input.dodge > 0 ? 1 : -1;
    s.dodgeCd = DODGE.cooldown;
    s.stamina -= DODGE.stamina;
  }

  let tp = clamp(input.pitch, -1, 1) * 1.55 * auth;
  let tr = clamp(input.roll, -1, 1) * 3.6 * Math.max(auth, 0.5);
  let ty = clamp(input.yaw, -1, 1) * 0.7 * auth;
  let dodgeEnded = false;
  if (s.dodge > 0) {
    // roll rate follows a bell on top of a base rate (still exactly one turn): a hard kick-off, fastest mid-roll
    const p = clamp(1 - s.dodge / DODGE.duration, 0, 1);
    tr = -s.dodgeDir * (Math.PI * 2) / DODGE.duration * (0.3634 + Math.sin(Math.PI * p));
    tp *= 0.3;
    s.dodge -= dt;
    dodgeEnded = s.dodge <= 0;
  }
  // smooth angular velocity (wing inertia); a touch snappier than before
  const k = 1 - Math.exp(-(s.dodge > 0 ? 30 : 11) * dt);
  s.wp += (tp - s.wp) * k;
  s.wr += (tr - s.wr) * k;
  s.wy += (ty - s.wy) * k;
  if (dodgeEnded) s.wr *= 0.15; // snap out of the barrel roll instead of drifting on

  // body-frame rotation
  qaxis(_tmpq, 1, 0, 0, s.wp * dt);
  qmul(s.q, s.q, _tmpq);
  qaxis(_tmpq, 0, 0, -1, s.wr * dt);
  qmul(s.q, s.q, _tmpq);
  qaxis(_tmpq, 0, 1, 0, -s.wy * dt);
  qmul(s.q, s.q, _tmpq);

  // banked turn: a rolled flyer's lift curves its path around world up
  const bank = bankOf(s.q);
  forwardOf(s.q, _f);
  const level = 1 - Math.abs(_f[1]);
  const yawWorld = -Math.sin(bank) * 0.55 * auth * level * clamp(s.speed / 60, 0, 1.4);
  qaxis(_tmpq2, 0, 1, 0, yawWorld * dt);
  qmul(s.q, _tmpq2, s.q);

  // stall: nose falls toward the ground
  const lift = clamp((s.speed - 16) / (STALL_SPEED - 4), 0, 1);
  if (lift < 1) {
    forwardOf(s.q, _f);
    rightOf(s.q, _r);
    const drop = (1 - lift) * 1.4 * dt * Math.sqrt(Math.max(0, 1 - _f[1] * _f[1])) * (_f[1] > -0.95 ? 1 : 0);
    qaxis(_tmpq2, _r[0], _r[1], _r[2], -drop);
    qmul(s.q, _tmpq2, s.q);
  }
  qnorm(s.q);
  forwardOf(s.q, _f);

  // speed
  s.throttle = clamp(input.throttle, 0, 1);
  s.boosting = !!input.boost && s.stamina > 0.02;
  s.braking = !!input.brake;
  let thrust = THRUST * (0.3 + 0.7 * s.throttle);
  if (s.boosting) {
    thrust += BOOST;
    s.stamina = Math.max(0, s.stamina - 0.24 * dt);
  } else if (s.dodge <= 0) {
    s.stamina = Math.min(1, s.stamina + (s.throttle < 0.5 ? 0.13 : 0.09) * dt);
  }
  // thin air above the ceiling
  const thin = clamp((s.p[1] - cfg.ceiling) / 400, 0, 1);
  thrust *= 1 - thin * 0.85;
  const v = s.speed / spd;
  let acc = thrust - DRAG * v * v - G * _f[1] * 0.95;
  if (s.braking) acc -= BRAKE_DRAG * (s.speed > 40 ? 6 : 2);
  s.speed = clamp(s.speed + acc * dt * spd, 8, MAX_SPEED * spd);

  // sink when lift is lost; recover when flying
  s.sink += (-G * (1 - lift) - G * thin * 0.6) * dt;
  s.sink *= Math.exp(-2.4 * lift * dt);

  // velocity follows the nose with a little slip
  const slip = 1 - Math.exp(-4.5 * dt);
  s.vel[0] += (_f[0] * s.speed - s.vel[0]) * slip;
  s.vel[1] += (_f[1] * s.speed + s.sink - s.vel[1]) * slip;
  s.vel[2] += (_f[2] * s.speed - s.vel[2]) * slip;
  if (s.dodge > 0) {
    rightOf(s.q, _r);
    const hop = s.dodgeDir * 32 * dt;
    s.p[0] += _r[0] * hop; s.p[1] += _r[1] * hop; s.p[2] += _r[2] * hop;
  }
  s.p[0] += s.vel[0] * dt;
  s.p[1] += s.vel[1] * dt;
  s.p[2] += s.vel[2] * dt;
  return s;
}

const _d = [0, 0, 0];
/**
 * "Mouse aim" autopilot: fill input.pitch/roll/yaw so the flyer turns toward a world direction (dir: [x, y, z]).
 * The player's mouse sets dir (the game uses sharp = 1.15); bots point it at their target (sharp 1). Returns the
 * angle (rad) between the nose and dir.
 * Rolls into the turn for big corrections and levels the wings once the target is nearly ahead.
 */
export function steerToward(s, dir, input, sharp = 1) {
  qrotInv(_d, s.q, dir);
  const l = vlen(_d) || 1;
  const x = _d[0] / l, y = _d[1] / l, z = _d[2] / l;
  const off = Math.acos(clamp(-z, -1, 1)); // angle off the nose
  // pitch toward target (positive pitch = nose up)
  const pitchErr = Math.atan2(y, -z);
  const yawErr = Math.atan2(x, -z);
  // roll so the target sits above the flyer's back; wings level when target is ahead
  const aggressive = clamp((off - 0.06) / 0.35, 0, 1);
  const rollToTarget = Math.atan2(x, y);
  // level roll uses the world-up reference
  const bank = bankOf(s.q);
  const levelErr = -bank;
  let rollErr = lerp(levelErr * 0.9, rollToTarget, aggressive);
  // don't fight a target that's directly behind by rolling inverted forever
  if (off > 2.6) rollErr = rollToTarget * 0.4 + levelErr * 0.6;
  input.roll = clamp(rollErr * 2.2 * sharp, -1, 1);
  input.pitch = clamp(pitchErr * 4.2 * sharp * (y > -0.2 || off < 0.5 ? 1 : 0.35), -1, 1);
  input.yaw = clamp(yawErr * 3, -1, 1);
  return off;
}
