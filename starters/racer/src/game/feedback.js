// FORGIVENESS AND FEEDBACK: what happens when the player's car touches things or gets lost.
//   contacts()  rails (sparks, a thud, a small shake) and other cars (a soft shove, never a crash)
//   watch()     the reset key, the automatic reset when stuck or going the wrong way, and the
//               WRONG WAY / missed-gate banners
//   boosted()   the answer to a drift boost or a rocket start
// A reset always puts the car on the road, facing forward, already rolling (tuning: "forgive").

import { CAR } from './carModel.js';
import { clamp } from './handling.js';

export function createFeedback({ ctx, track, car, rivals, effects, rig, hud, run, carModel, getProgress }) {
  const { audio, juice, events, tune, input, look } = ctx;
  let hitCool = 0; // so one long scrape is one "hit", not sixty
  let bumpCool = 0;
  let resetCool = 0;

  function resetCar(why) {
    const p = getProgress();
    // Back to where you are on the lap; or, after a missed gate, back to just before that gate.
    const s = p.missed ? track.gates[p.next] - 8 : car.loc.s;
    let lat = 0;
    for (const tryLat of [0, 3, -3]) {
      lat = tryLat;
      if (!rivals.live.some((r) => Math.abs(track.delta(s, r.s)) < 6 && Math.abs(r.lat - tryLat) < 2.4)) break;
    }
    car.place(s, lat, tune.forgive.resetSpeed);
    p.prevS = car.loc.s;
    run.snap = true; // game.js snaps the model after posing it
    rig.snap(car);
    run.resets += 1;
    run.wrongWay = run.stuck = 0;
    resetCool = 1;
    hud.hold('');
    juice.flash(look.shade(look.light, 0.2), 160);
    audio.whoosh({ vol: 0.14, length: 0.25, from: 1800, to: 500 });
    events.emit('reset', { why });
  }

  return {
    reset() {
      hitCool = bumpCool = resetCool = 0;
    },

    boosted(strength, label = '') {
      run.boosts += 1;
      audio.whoosh({ vol: 0.16 + 0.1 * strength, length: 0.5, from: 500, to: 3200 });
      audio.blip({ freq: 440, slide: 2, length: 0.22, vol: 0.12 });
      juice.punch(carModel.body, 1.07, 220);
      if (label) hud.say(label.toUpperCase(), 0.9, 'small accent');
      events.emit('boost', { strength });
    },

    contacts(dt) {
      hitCool -= dt;
      bumpCool -= dt;

      // Rails.
      if (car.wallHit > 1.5) {
        const side = Math.sign(car.loc.lat);
        effects.sparks(car.x + car.loc.rx * side * 0.9, car.y, car.z + car.loc.rz * side * 0.9, car.vx, car.vz, Math.min(10, 3 + car.wallHit));
        if (hitCool <= 0) {
          hitCool = 0.6;
          run.wallHits += 1;
          audio.thud({ freq: 110, vol: clamp(car.wallHit * 0.06, 0.15, 0.6), length: 0.16 });
          juice.shake(clamp(car.wallHit * 0.015, 0.04, 0.22), 200);
          events.emit('hit', { by: 'rail', speed: Math.round(car.wallHit) });
        }
      } else if (car.scraping && Math.abs(car.speed) > 5) {
        const side = Math.sign(car.loc.lat);
        effects.sparks(car.x + car.loc.rx * side * 0.9, car.y, car.z + car.loc.rz * side * 0.9, car.vx, car.vz, 1);
      }

      // Other cars: push apart, share a little speed, and carry on.
      for (const r of rivals.live) {
        const dx = car.x - r.x;
        const dz = car.z - r.z;
        const d = Math.hypot(dx, dz);
        const reach = CAR.radius * 1.85;
        if (d >= reach || d < 0.01) continue;
        const nx = dx / d;
        const nz = dz / d;
        const over = reach - d;
        car.x += nx * over * 0.7;
        car.z += nz * over * 0.7;
        r.lat -= (nx * r.loc.rx + nz * r.loc.rz) * over * 0.5;
        const closing = -((car.vx - r.v * r.loc.tx) * nx + (car.vz - r.v * r.loc.tz) * nz);
        if (closing <= 0) continue;
        car.vx += nx * closing * tune.forgive.bumpLoss;
        car.vz += nz * closing * tune.forgive.bumpLoss;
        const fromBehind = track.delta(car.loc.s, r.s) > 0; // the rival is in front: it gets a shove
        r.v = Math.max(0, r.v + (fromBehind ? 1 : -1) * Math.min(3, closing * 0.3));
        if (closing > 1.5 && bumpCool <= 0) {
          bumpCool = 0.5;
          run.bumps += 1;
          audio.thud({ freq: 150, vol: clamp(closing * 0.05, 0.12, 0.45), length: 0.12 });
          juice.shake(clamp(closing * 0.012, 0.03, 0.15), 160);
          events.emit('hit', { by: 'car', name: r.name });
        }
      }
    },

    watch(dt, c) {
      const F = tune.forgive;
      const L = car.loc;
      resetCool -= dt;
      if (input.pressed('reset') && resetCool <= 0) return resetCar('key');

      // Stuck: trying to move, not moving.
      const trying = c.throttle > 0.3 || c.brake > 0.3;
      run.stuck = trying && Math.abs(car.speed) < 2 ? run.stuck + dt : 0;
      if (run.stuck > F.stuckTime) return resetCar('stuck');

      // Wrong way: the nose points back down the lap and the car is moving that way.
      const facing = Math.sin(car.yaw) * L.tx + Math.cos(car.yaw) * L.tz;
      const going = car.vx * L.tx + car.vz * L.tz;
      run.wrongWay = facing < -0.3 && going < -2 ? run.wrongWay + dt : Math.max(0, run.wrongWay - dt * 3);
      if (run.wrongWay > F.wrongWayTime) return resetCar('wrong way');

      const p = getProgress();
      if (run.wrongWay > 0.8) hud.hold('WRONG WAY', 'press R to turn round');
      else if (p.missed) hud.hold('MISSED A GATE', 'press R to go back to it');
      else hud.hold('');
      return undefined;
    },
  };
}
