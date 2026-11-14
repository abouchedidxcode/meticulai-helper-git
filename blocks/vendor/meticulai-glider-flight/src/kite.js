// Kite mode: the arcade glide model from Kite Race (Meticulai), for a light, loose flyer (a paper kite, a bird, a paper
// plane, a drone) where control should be direct and forgiving. The opposite of glider.js: no lift curve, no stall,
// no hovering. The stick sets a turn rate and a climb angle and the kite does exactly that, at once. Speed is one
// number that chases a target (cruise, plus a wind stream's surge, a gust, a rival's draft, a squeezed lane, skimming
// low over water, a tailwind) through a soft limiter (tanh above a knee, never a flat cap); diving trades height for
// speed, climbing costs a little, thermals lift without costing speed; a wall contact pushes out, slides along and
// costs some speed instead of ending the run.
//
// THE NUMBERS ARE TUNED: KITE is the game's round 7 set, after its maker's first play ("too fast, not picturesque"):
// a gentle glide, cruise 15 m/s (54 km/h), a wind stream to ~21 (75 km/h), a gust in a stream ~26 (95 km/h).
//
// Headings: yaw 0 flies -Z, + turns right (toward +X). pitch is the climb angle (+ = up).
import * as THREE from 'three';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** 1 - exp(-rate dt): the share of the way to a target covered this step. */
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

/**
 * @typedef {object} KiteParams
 * @property {number} cruise m/s with no wind stream, level
 * @property {number} streamBoost m/s added at full stream power (power can reach ~1.3)
 * @property {number} streamSurge a stream multiplies the speed by 1 + streamSurge x power
 * @property {number} streamAccel speed approach rate (1/s) in a stream while under its speed (the surge)
 * @property {number} gustBoost m/s added while the gust runs
 * @property {number} gustTime its length (s)
 * @property {number} gustKick instant kick (m/s) when a gust fires
 * @property {number} draftBoost m/s added at full draft (in a rival's slipstream)
 * @property {number} squeezeBoost m/s added where walls squeeze the wind (a narrow lane)
 * @property {number} skimBoost m/s added skimming low over water (full under ~1.3 m, gone by ~5 m)
 * @property {number} top nominal top speed; the soft limiter's ceiling is top + 2
 * @property {number} knee above this the target is compressed (never a flat clamp)
 * @property {number} floor below this the kite recovers fast (racing never hovers)
 * @property {number} min the least speed a wall contact can leave
 * @property {number} turnRate rad/s at cruise
 * @property {number} turnRateTop rad/s at top speed
 * @property {number} maxPitch steepest climb or dive the stick asks for (rad)
 * @property {number} pitchRate how fast the climb angle follows the stick (1/s)
 * @property {number} yawResp how fast the turn rate follows the stick (1/s)
 * @property {number} accel speed approach rate toward the target when speeding up (1/s)
 * @property {number} decel ... when slowing down (1/s)
 * @property {number} gravity m/s^2 gained per unit of -sin(pitch) in a dive
 * @property {number} climbCost climbing costs climbCost times as much
 * @property {number} turnScrub m/s^2 lost per rad/s of turn rate
 * @property {number} maxBank visual bank at the full turn rate (rad)
 * @property {number} scrapeKeep speed kept on a fresh head-on wall contact
 */

/** @type {KiteParams} the game's numbers (round 7, after its maker's play) */
export const KITE = {
  cruise: 15,
  streamBoost: 0,
  streamSurge: 0.3,
  streamAccel: 2.6,
  gustBoost: 4.5,
  gustTime: 2.6,
  gustKick: 1,
  draftBoost: 1.2,
  squeezeBoost: 1,
  skimBoost: 1.5,
  top: 28,
  knee: 24,
  floor: 14,
  min: 11,
  turnRate: 1.35,
  turnRateTop: 1.05,
  maxPitch: 0.5,
  pitchRate: 3,
  yawResp: 8,
  accel: 1.0,
  decel: 0.6,
  gravity: 8,
  climbCost: 0.5,
  turnScrub: 0.7,
  maxBank: (42 * Math.PI) / 180,
  scrapeKeep: 0.8,
};

/** The soft limiter: identity up to `knee`, then compressed toward `ceil` (never reached, never a flat line). */
export function softLimit(v, knee, ceil) {
  if (v <= knee) return v;
  const room = ceil - knee;
  return knee + room * Math.tanh((v - knee) / room);
}

/** What a breeze along the course adds to the target speed (m/s): a tailwind helps, a headwind costs half as much. */
export function tailPush(tail) { return tail > 0 ? 0.12 * tail : 0.06 * tail; }

const _n = new THREE.Vector3();

/**
 * step(dt, input, env):
 *   input { turn: -1..1 (+ right), climb: -1..1 (+ up) }
 *   env   { power: stream power 0..~1.3, lift: thermal lift m/s, draft: 0..1, tail?: m/s (+ tailwind),
 *           squeeze?: 0..1, skim?: 0..1, stream?: 0..1 how deep in a stream (over 0.5 = riding it) }
 */
export class KiteGlider {
  /** @param {KiteParams} [p] */
  constructor(p = KITE) {
    this.p = p;
    this.pos = new THREE.Vector3();
    /** velocity over the ground (m/s) */
    this.vel = new THREE.Vector3();
    /** unit flight direction (yaw + pitch) */
    this.fwd = new THREE.Vector3(0, 0, -1);
    this.yaw = 0;
    this.pitch = 0;
    /** airspeed along fwd (m/s) */
    this.speed = 22;
    /** current turn rate (rad/s, + = right) */
    this.yawRate = 0;
    /** visual bank (rad, + = right wing down) */
    this.bank = 0;
    /** seconds of gust left */
    this.gustT = 0;
    /** racing: the floor applies (a kite placed slow on a start line or in a test does not get lifted) */
    this.racing = true;
    /** multiplies the target speed (rival skill, catch-up); the player flies at 1 */
    this.speedMul = 1;
    /** the target speed of the last step (HUD, tests) */
    this.target = 22;
    /** the most the speed may rise per second (m/s^2): limit it for a launch that builds */
    this.accelCap = Infinity;
    /** riding a stream this step, and the speed the stream holds the kite at while it stays in */
    this.inStream = false;
    this.streamHold = 0;
    /** seconds since the kite last entered a stream (for a camera or HUD kick) */
    this.streamT = 99;
    this.updateFwd();
  }

  /** Place the kite at a point, flying along a direction at a speed. */
  place(pos, dir, speed) {
    this.pos.copy(pos);
    this.yaw = Math.atan2(dir.x, -dir.z);
    this.pitch = Math.asin(clamp(dir.y / (dir.length() || 1), -1, 1));
    this.speed = speed;
    this.yawRate = 0; this.bank = 0; this.gustT = 0;
    this.updateFwd();
    this.vel.copy(this.fwd).multiplyScalar(speed);
  }

  updateFwd() {
    const cp = Math.cos(this.pitch);
    this.fwd.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    return this.fwd;
  }

  get gusting() { return this.gustT > 0; }
  /** 0..1 of the top speed */
  get speedNorm() { return clamp(this.speed / this.p.top, 0, 1); }

  /** Fire the gust (the caller checks any meter). */
  gust(time = this.p.gustTime) {
    this.gustT = Math.max(this.gustT, time);
    this.speed = softLimit(this.speed + this.p.gustKick, this.p.knee, this.p.top + 2);
  }

  /** Turn rate available at the current speed. */
  turnRate() {
    const f = clamp((this.speed - this.p.cruise) / (this.p.top - this.p.cruise), 0, 1);
    return lerp(this.p.turnRate, this.p.turnRateTop, f);
  }

  step(dt, inp, env) {
    const P = this.p;
    const turn = clamp(inp.turn, -1, 1), climb = clamp(inp.climb, -1, 1);
    // steering: rate and angle follow the stick almost at once
    this.yawRate += (turn * this.turnRate() - this.yawRate) * damp(P.yawResp, dt);
    this.yaw += this.yawRate * dt;
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2; else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
    this.pitch += (climb * P.maxPitch - this.pitch) * damp(P.pitchRate, dt);
    // bank like a real flyer: the roll a coordinated turn at this speed needs (tan bank = v * turn rate / g), at 0.8
    // of it and eased in over ~0.3 s (gentle and graceful)
    const bankT = clamp(Math.atan((this.speed * this.yawRate) / 9.81) * 0.8, -P.maxBank, P.maxBank);
    this.bank += (bankT - this.bank) * damp(3.5, dt);
    // speed: chase the target, plus the dive/climb trade
    if (this.gustT > 0) this.gustT = Math.max(0, this.gustT - dt);
    const ceil = P.top + 2;
    // the air the kite would have anyway (the line, a slipstream, a squeezed lane, the water, the breeze), multiplied
    // up by a wind stream (a surge you feel: +30-40%), the gust on top
    const air = P.cruise + P.draftBoost * env.draft + P.squeezeBoost * (env.squeeze ?? 0) + P.skimBoost * (env.skim ?? 0) + tailPush(env.tail ?? 0);
    const rideT = softLimit((air * (1 + P.streamSurge * env.power) + P.streamBoost * env.power) * this.speedMul, P.knee, ceil);
    const raw = (air * (1 + P.streamSurge * env.power) + P.streamBoost * env.power + (this.gustT > 0 ? P.gustBoost : 0)) * this.speedMul;
    const target = softLimit(raw, P.knee, ceil);
    this.target = target;
    const riding = (env.stream ?? (env.power > 0.3 ? 1 : 0)) > 0.5;
    if (riding && !this.inStream) { this.streamHold = 0; this.streamT = 0; }
    else this.streamT += dt;
    this.inStream = riding;
    const before = this.speed;
    // speeding up: in a stream at once (the surge), quick in a gust, quicker still under the floor
    const rate = target > this.speed ? (riding ? Math.max(P.streamAccel, this.gustT > 0 ? P.accel * 1.8 : 0) : this.gustT > 0 ? P.accel * 1.8 : this.racing && this.speed < P.floor ? P.accel * 2.2 : P.accel) : P.decel;
    let dv = (target - this.speed) * rate;
    const sp = Math.sin(this.pitch);
    // a dive gains (less and less toward the ceiling); a climb costs a little (less in rising air), nothing under the floor
    if (sp < 0) dv -= P.gravity * sp * (1 - smoothstep(P.knee, ceil, this.speed));
    else if (!this.racing || this.speed > P.floor) dv -= P.gravity * sp * P.climbCost * (1 - clamp(env.lift / 6, 0, 0.8));
    // a corner scrubs a little speed (a hairpin ~2-3 m/s)
    dv -= Math.abs(this.yawRate) * P.turnScrub;
    if (dv > this.accelCap) dv = this.accelCap;
    // (`min` is a floor the speed is kept above, never a speed it is lifted to)
    this.speed = clamp(this.speed + dv * dt, Math.min(P.min, this.speed), ceil);
    // in a stream the speed never sags below what the stream has given; leaving it, it bleeds back (decel)
    if (riding) {
      this.streamHold = Math.max(this.streamHold, Math.min(before, rideT));
      if (this.speed < before) this.speed = Math.max(this.speed, Math.min(before, this.streamHold));
    }
    this.updateFwd();
    this.vel.copy(this.fwd).multiplyScalar(this.speed);
    this.vel.y += env.lift;
    this.pos.addScaledVector(this.vel, dt);
  }

  /** Turn the flight direction toward `dir` by `k` (0..1) at once (after a wall: back along the way it was going). */
  turnToward(dir, k) {
    this.fwd.lerp(dir, k).normalize();
    this.yaw = Math.atan2(this.fwd.x, -this.fwd.z);
    this.pitch = clamp(Math.asin(clamp(this.fwd.y, -1, 1)), -this.p.maxPitch, this.p.maxPitch);
    this.updateFwd();
    this.vel.copy(this.fwd).multiplyScalar(this.speed);
  }

  /** A soft snag (a string, a wire, bunting): some speed gone and a flutter, the line kept. */
  snag(keep = 0.86) {
    this.speed = Math.max(this.p.min, this.speed * keep);
    this.yawRate *= 0.4;
    this.vel.copy(this.fwd).multiplyScalar(this.speed);
  }

  /**
   * Wall contact: push out along the normal (a unit Vector3 pointing out of the wall), slide along the surface and,
   * on a fresh contact, lose speed (scrapeKeep head-on, half that loss glancing). Returns the speed lost (m/s).
   */
  collide(normal, depth, fresh, dt = 1 / 60) {
    this.pos.addScaledVector(normal, depth + 0.02);
    _n.copy(normal);
    const into = this.fwd.dot(_n);
    if (into < 0) {
      // slide: remove the part of the heading into the surface, and bounce a touch away from it
      this.fwd.addScaledVector(_n, -into * 1.15);
      if (this.fwd.lengthSq() < 1e-4) this.fwd.copy(_n);
      this.fwd.normalize();
      this.yaw = Math.atan2(this.fwd.x, -this.fwd.z);
      this.pitch = clamp(Math.asin(clamp(this.fwd.y, -1, 1)), -this.p.maxPitch, this.p.maxPitch);
      this.yawRate *= 0.3;
    }
    const before = this.speed;
    const keep = fresh ? lerp(1 - (1 - this.p.scrapeKeep) * 0.5, this.p.scrapeKeep, clamp(-into * 2, 0, 1)) : 1 - 0.5 * dt;
    this.speed = Math.max(this.p.min, this.speed * keep);
    this.updateFwd();
    this.vel.copy(this.fwd).multiplyScalar(this.speed);
    return before - this.speed;
  }
}
