// A SIMPLE DRIVER for the player's car. Used three ways:
//   ?bot=1        it plays the game through the same input a person uses (input.virtual), so
//                 tests and recordings show real driving, mistakes included
//   after the finish, it drives the slow-down lap while the end card is up
//   as a reference for a new kind of rival that uses the real handling model
//
// How it drives: it aims at a point further down the racing line (further when faster), brakes
// when it is above the speed the next corners allow, and throws the car into a drift when a
// tight corner is coming. It wanders a little and brakes late now and then, like a newcomer.

import { speedProfile } from './rivals.js';
import { clamp } from './handling.js';

export function createDriver({ track, tune, rng }) {
  let profile = null;
  let wander = 0;
  let wanderIn = 0;
  let drift = 0; // seconds left holding the handbrake
  let rest = 0; // seconds before the next drift
  let stuck = 0;
  const aim = {};
  const out = { steer: 0, digital: false, throttle: 0, brake: 0, handbrake: false, reset: false };

  return {
    reset() {
      const B = tune.bot;
      profile = speedProfile(track, { grip: B.cornerGrip, brake: tune.car.brake * 0.7, top: 999 });
      wander = wanderIn = drift = rest = stuck = 0;
    },
    /** Returns { steer, throttle, brake, handbrake, reset } for this step. calm = a slow, tidy lap. */
    think(dt, car, { calm = false } = {}) {
      const B = tune.bot;
      if (!profile) this.reset();
      const L = car.loc;
      const speed = Math.abs(car.speed);

      wanderIn -= dt;
      if (wanderIn <= 0) {
        wander = calm ? 0 : rng.range(-1, 1) * B.wander;
        wanderIn = rng.range(0.5, 1.4);
      }

      // Steer at a point down the road.
      const reach = 9 + speed * B.lookAhead;
      track.at(L.s + reach, 0, aim);
      track.at(L.s + reach, clamp(aim.line * 0.85 + wander * 3, -(aim.half - 2), aim.half - 2), aim);
      const dx = aim.x - car.x;
      const dz = aim.z - car.z;
      const fx = Math.sin(car.yaw);
      const fz = Math.cos(car.yaw);
      const error = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz); // + = the point is to the right
      out.steer = clamp(error * B.steerGain + wander * 0.25, -1, 1);

      // Speed for the corners ahead.
      const i = Math.floor(track.wrap(L.s + speed * 0.12) / track.ds) % track.n;
      const want = calm ? Math.min(profile[i] * 0.5, 17) : profile[i] * B.pace;
      out.throttle = speed < want ? 1 : 0;
      out.brake = speed > want + 2.5 ? 1 : 0;

      // A tight corner coming: flick it into a drift, hold while the road keeps bending.
      const coming = track.at(L.s + speed * 0.5, 0, aim).turn;
      rest -= dt;
      if (!calm && drift <= 0 && rest <= 0 && !car.drifting && Math.abs(coming) > B.driftTurn && speed > tune.drift.minSpeed + 3 && Math.sign(coming) === Math.sign(out.steer) && Math.abs(out.steer) > 0.3) {
        drift = B.driftHold;
        rest = 2.5;
      }
      if (drift > 0) {
        drift -= dt;
        if (Math.abs(L.turn) < B.driftTurn * 0.5 && drift < B.driftHold - 0.4) drift = 0;
        out.throttle = 1;
        out.brake = 0;
      }
      out.handbrake = drift > 0;

      // Stuck on something? Do what a person would: press reset.
      stuck = speed < 1.5 ? stuck + dt : 0;
      out.reset = stuck > 2;
      if (out.reset) stuck = 0;
      return out;
    },
  };
}

/** ?bot=1: feed the driver's decisions into the same input the player uses. */
export function createBot({ input, driver, rng }) {
  let launch = 0;
  return {
    reset() {
      driver.reset();
      input.virtual.release();
      launch = rng.range(0.05, 0.5); // when it floors it before GO (sometimes a rocket start)
    },
    /** countdown = seconds until GO (0 or less once racing). */
    update(dt, car, countdown) {
      if (countdown > 0) {
        input.virtual.setMove(0, countdown < launch ? 1 : 0);
        return;
      }
      const c = driver.think(dt, car);
      input.virtual.setMove(c.steer, c.throttle - c.brake);
      input.virtual.hold('drift', c.handbrake);
      if (c.reset) input.virtual.press('reset');
    },
  };
}
