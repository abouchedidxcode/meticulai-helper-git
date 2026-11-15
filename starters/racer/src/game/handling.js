// THE HANDLING MODEL: how the player's car drives. Plain maths, no physics engine, about 150
// lines of logic. This file is the feel of the game; every number is in tuning.json ("car",
// "drift", "forgive") and can be changed live with the backquote key.
//
// The idea (the classic arcade recipe):
//   - The car has a heading (where the nose points) and a velocity (where it actually goes).
//   - Steering turns the heading. GRIP pulls the velocity round to follow the nose.
//     High grip = goes where it points. Low grip = slides.
//   - A DRIFT is just "low grip for a while": asked for with the handbrake (or by lifting off
//     while turning hard), kept alive by steering into it, ended by straightening up.
//     The slide angle is capped, so the car can never spin; holding a drift charges a boost.
//   - Rails push the car back and take some speed; they never stop it dead.
//
// update(dt, controls) takes { steer -1..1, digital, throttle 0..1, brake 0..1, handbrake }.
// The bot and the player both come through that, so they drive the same car.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const angleDiff = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function createHandling({ track, tune }) {
  const car = {
    x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0,
    speed: 0, // metres per second along the nose (negative in reverse)
    steer: 0, // the shaped steering actually applied, -1..1 (+ = right)
    slip: 0, // slide angle in radians (+ = sliding to the right)
    drifting: false, driftDir: 0, driftTime: 0,
    charge: 0, // seconds of drift banked toward a boost
    boost: 0, // seconds of boost left
    offroad: false, scraping: false,
    wallHit: 0, // how hard it hit the rail this step (0 = no hit); the game turns it into sound and sparks
    boosted: 0, // set to the boost strength (0..1) on the step a drift pays out
    latAccel: 0, longAccel: 0, rev: 0,
    loc: { i: -1 }, // where on the lap: s, lat, half, turn, tx, tz ... (see track.locate)
    prevThrottle: 0,

    /** Put the car on the road at lap position s, facing forward, rolling at `speed`. */
    place(s, lat = 0, speed = 0) {
      track.at(s, lat, car.loc);
      car.x = car.loc.x; car.y = car.loc.y; car.z = car.loc.z;
      car.yaw = Math.atan2(car.loc.tx, car.loc.tz);
      car.vx = car.loc.tx * speed; car.vz = car.loc.tz * speed;
      car.speed = speed;
      car.steer = car.slip = car.charge = car.boost = car.driftTime = 0;
      car.drifting = car.offroad = car.scraping = false;
      car.wallHit = car.boosted = car.latAccel = car.longAccel = 0;
    },

    /** Start a boost by hand (the rocket start, a boost pad, a pickup). strength 0..1. */
    giveBoost(strength = 1) {
      const D = tune.drift;
      car.boost = Math.max(car.boost, D.boostTime * (0.5 + 0.5 * strength));
      const fx = Math.sin(car.yaw);
      const fz = Math.cos(car.yaw);
      car.vx += fx * D.boostKick * strength;
      car.vz += fz * D.boostKick * strength;
      car.boosted = strength;
    },

    update(dt, c, enabled = true) {
      const T = tune.car;
      const D = tune.drift;
      const F = tune.forgive;
      car.wallHit = 0;
      car.boosted = 0;

      // --- 1. Steering: immediate, then shaped ------------------------------------------
      if (c.digital) {
        // Keyboard. A tap gives a small, instant nudge (tapSteer); holding ramps to full lock.
        if (c.steer === 0) car.steer -= Math.sign(car.steer) * Math.min(Math.abs(car.steer), dt / T.centreTime);
        else {
          if (Math.sign(car.steer) !== c.steer) car.steer = 0; // flip sides at once
          car.steer = c.steer * Math.min(1, Math.max(Math.abs(car.steer), T.tapSteer) + dt / T.steerTime);
        }
      } else {
        // Stick: a gentle curve so small pushes are precise, and next to no smoothing.
        const want = Math.sign(c.steer) * Math.abs(c.steer) ** T.stickCurve;
        car.steer += (want - car.steer) * (1 - Math.exp(-dt * 28));
      }
      if (!enabled) {
        // On the grid: the car is held, but the engine answers the pedal.
        car.rev += ((c.throttle > 0.1 ? 1 : 0) - car.rev) * Math.min(1, dt * 9);
        car.vx = car.vz = car.speed = 0;
        car.latAccel = 0;
        car.longAccel = -car.rev * 6; // the nose lifts a little as it strains
        car.prevThrottle = c.throttle;
        return;
      }

      let fx = Math.sin(car.yaw);
      let fz = Math.cos(car.yaw);
      let vf = car.vx * fx + car.vz * fz;
      const total = Math.hypot(car.vx, car.vz);
      const frac = clamp(Math.abs(vf) / T.topSpeed, 0, 1);

      // --- 2. Drift: start, hold, end ----------------------------------------------------
      const lifted = car.prevThrottle > 0.5 && c.throttle < 0.2;
      if (!car.drifting && total > D.minSpeed && Math.abs(car.steer) > 0.25) {
        if (c.handbrake || (lifted && Math.abs(car.steer) > 0.7 && frac > D.liftAt)) {
          car.drifting = true;
          car.driftDir = Math.sign(car.steer);
          car.driftTime = 0;
          car.charge = 0;
          car.yaw -= car.driftDir * D.kick; // flick the nose in: the slide starts NOW
        }
      }
      let steer = car.steer;
      let grip = T.grip;
      if (car.drifting) {
        const into = car.steer * car.driftDir; // 1 = steering into the slide, -1 = full opposite lock
        // While you ask for it (handbrake, or steering in) the slide keeps turning in by itself
        // (hold); steer in for a tighter line, steer out for a wider one.
        const held = D.hold * (c.handbrake ? 1 : clamp(into * 3, 0, 1));
        steer = car.driftDir * clamp(into + held * (1 - into), -0.15, 1) * D.turnBoost;
        // Opposite lock (or letting go of the wheel) brings the grip back: that is the "catch".
        const catching = c.handbrake ? 0 : clamp((0.25 - into) / 0.7, 0, 1);
        grip = D.grip + (T.grip - D.grip) * catching;
        car.driftTime += dt;
        if (Math.abs(car.slip) > D.chargeSlip * 0.01745) car.charge = Math.min(D.chargeFull, car.charge + dt);
        const settled = !c.handbrake && car.driftTime > 0.3 && Math.abs(car.slip) < D.exitSlip * 0.01745;
        if (settled || total < D.minSpeed * 0.7) {
          car.drifting = false;
          if (car.charge >= D.chargeTime && total >= D.minSpeed * 0.7) car.giveBoost((car.charge - D.chargeTime) / Math.max(0.01, D.chargeFull - D.chargeTime));
          car.charge = 0;
        }
      }

      // --- 3. Turn the nose: less lock at speed, none when stopped -----------------------
      let turnRate = (T.turnLow + (T.turnHigh - T.turnLow) * frac) * clamp(Math.abs(vf) / T.turnFullAt, 0, 1) * Math.sign(vf || 1);
      if (car.drifting) turnRate = Math.min(turnRate, D.maxTurn); // a slow drift must not whip the car round
      const yawRate = steer * turnRate;
      car.yaw -= yawRate * dt;
      fx = Math.sin(car.yaw);
      fz = Math.cos(car.yaw);
      const rx = -fz;
      const rz = fx;
      vf = car.vx * fx + car.vz * fz;
      let vl = car.vx * rx + car.vz * rz;

      // --- 4. Speed: engine, brakes, drag, hills -----------------------------------------
      const L = car.loc;
      car.offroad = Math.abs(L.lat ?? 0) > (L.half ?? 99) + F.offroadMargin;
      let top = T.topSpeed * (car.offroad ? F.offroadTop : 1);
      if (car.boost > 0) {
        top = Math.max(top, T.topSpeed) * (1 + D.boostTop);
        car.boost -= dt;
      }
      let a = 0;
      const moving = vf > 0 ? Math.hypot(vf, vl) : vf; // sliding sideways counts toward top speed
      if (c.throttle > 0) a += c.throttle * T.accel * Math.max(0, 1 - moving / top) * (car.boost > 0 ? 1.5 : 1);
      if (c.brake > 0) a -= vf > 0.5 ? c.brake * T.brake : vf > -T.reverseSpeed ? c.brake * T.accel * 0.5 : 0;
      if (c.throttle <= 0 && c.brake <= 0) a -= vf * T.coast;
      if (moving > top) a -= (moving - top) * (car.offroad ? F.offroadDrag : 1.2);
      if (car.drifting) a -= Math.abs(car.slip) * D.scrub; // sliding scrubs a little speed
      if (c.handbrake && vf > 0) a -= D.handbrakeDrag;
      a -= 9.8 * ((L.slope ?? 0) * (fx * (L.tx ?? 0) + fz * (L.tz ?? 0))) * T.hillPull;
      vf += a * dt;

      // --- 5. Grip: the sideways speed dies away (fast = grippy, slow = sliding) ---------
      const sizeBefore = Math.hypot(vf, vl);
      vl *= Math.exp(-grip * dt);
      if (car.drifting && vf > 0) {
        // In a drift the tyres steer the velocity round instead of eating it; the only cost
        // of sliding is "Drift speed loss" (scrub), so it can be tuned on its own.
        const fix = sizeBefore / (Math.hypot(vf, vl) || 1);
        vf *= fix;
        vl *= fix;
      }
      // The slide angle is capped: past it the tyres bite. This is why the car cannot spin.
      // The velocity is swung toward the nose (keeping its size), so the cap costs no speed.
      const maxSide = Math.tan(D.maxSlip * 0.01745) * Math.max(2, Math.abs(vf));
      if (Math.abs(vl) > maxSide) {
        const size = Math.hypot(vf, vl);
        vl = Math.sign(vl) * maxSide;
        const fix = size / Math.hypot(vf, vl);
        vf *= fix;
        vl *= fix;
      }
      car.vx = fx * vf + rx * vl;
      car.vz = fz * vf + rz * vl;
      car.x += car.vx * dt;
      car.z += car.vz * dt;

      // --- 6. Where are we on the lap? Rails scrape, they don't stop you ----------------
      track.locate(car.x, car.z, L.i, L);
      const limit = L.half + track.verge - 0.95;
      car.scraping = false;
      if (Math.abs(L.lat) > limit) {
        const side = Math.sign(L.lat);
        const over = Math.abs(L.lat) - limit;
        car.x -= L.rx * side * over;
        car.z -= L.rz * side * over;
        const into = (car.vx * L.rx + car.vz * L.rz) * side; // speed into the rail
        // Which way along the rail should the nose end up? The way the car is travelling
        // (so a sideways slide into the rail straightens out forward), or the way it faces if it is slow.
        const slide = car.vx * L.tx + car.vz * L.tz;
        const facing = Math.sin(car.yaw) * L.tx + Math.cos(car.yaw) * L.tz >= 0 ? 1 : -1;
        const nose = Math.abs(slide) > 3 ? Math.sign(slide) * (vf >= 0 ? 1 : -1) : facing;
        const along = Math.atan2(L.tx * nose, L.tz * nose) + side * nose * 0.06; // the rail's direction, a touch away from it
        if (into > 0) {
          // A hit turns the car's speed ALONG the rail. A harder hit keeps less of it, but never
          // less than (1 - wallLossMax): the rail redirects the car, it does not stop it.
          const before = Math.hypot(car.vx, car.vz);
          const keep = 1 - Math.min(F.wallLossMax, into * F.wallLoss);
          const speed = Math.max(Math.abs(slide) * keep, before * (1 - F.wallLossMax));
          const way = Math.abs(slide) > 1 ? Math.sign(slide) : nose;
          car.vx = L.tx * way * speed - L.rx * side * into * 0.12; // (and a small bounce off it)
          car.vz = L.tz * way * speed - L.rz * side * into * 0.12;
          car.yaw += angleDiff(car.yaw, along) * clamp(0.3 + into * 0.04, 0, 0.9); // the nose swings round at once
          car.wallHit = into;
        }
        // Scraping along costs a little every second, and the nose is eased back along the road.
        const drag = Math.exp(-F.scrapeDrag * dt);
        car.vx *= drag;
        car.vz *= drag;
        car.yaw += angleDiff(car.yaw, along) * Math.min(1, F.wallAlign * dt);
        car.scraping = true;
        L.lat = side * limit;
      }
      car.y += (L.cy - L.lat * L.tanB - car.y) * Math.min(1, dt * 30);

      // --- 7. Numbers the camera, the body lean, the sound and the HUD read ------------
      car.speed = car.vx * Math.sin(car.yaw) + car.vz * Math.cos(car.yaw);
      const side = car.vx * -Math.cos(car.yaw) + car.vz * Math.sin(car.yaw);
      car.slip = Math.atan2(side, Math.max(3, Math.abs(car.speed)));
      car.latAccel = yawRate * vf;
      car.longAccel = a;
      car.rev = clamp(Math.abs(car.speed) / T.topSpeed, 0, 1.2);
      car.prevThrottle = c.throttle;
    },
  };
  return car;
}

export { clamp, angleDiff };
