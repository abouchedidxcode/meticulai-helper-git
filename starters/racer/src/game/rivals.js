// THE RIVALS: computer drivers that feel alive without real physics. Each one rides the track
// like a train on a wide rail: a position along the lap (s), a sideways position (lat) and a
// speed. That makes them cheap, and they can never get stuck or lost.
//
// What makes them feel like drivers:
//   - a racing line (outside-inside-outside) that each one follows a little differently
//   - a speed for every metre of the lap worked out from how tight the road is, so they brake
//     for corners and power out of them
//   - they look ahead: a slower car in front means "pull out and pass", or "lift" if there's no room
//   - small mistakes now and then (a lift, a wide line, a puff of smoke)
//   - gentle rubber-banding: a rival far ahead of the player eases off, one far behind pushes
//
// Tuning: the "rivals" group of tuning.json. Add or rename drivers in DRIVERS below.

import { clamp } from './handling.js';

// name, skill (share of the ideal pace), line (how much of the racing line they use), lane (habit: metres off it)
export const DRIVERS = [
  { name: 'Juno', skill: 1.0, line: 1.0, lane: 0 },
  { name: 'Brix', skill: 0.975, line: 0.75, lane: 1.2 },
  { name: 'Moss', skill: 0.95, line: 0.9, lane: -1.0 },
];

/**
 * The fastest sensible speed at every sample of the lap: slow enough for each corner
 * (speed = sqrt(grip / bend)), and slowing early enough to make the next one (brake).
 */
export function speedProfile(track, { grip, brake, top }) {
  const { n, ds, turn } = track;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.min(top, Math.sqrt(grip / Math.max(1e-4, Math.abs(turn[i]))));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[(i + 1) % n] ** 2 + 2 * brake * ds));
  }
  return v;
}

export function createRivals({ track, tune, rng, count = DRIVERS.length }) {
  const list = DRIVERS.slice(0, count).map((d, index) => ({
    ...d, index, s: 0, lat: 0, v: 0, latV: 0, x: 0, y: 0, z: 0, yaw: 0, slide: 0, latAccel: 0, longAccel: 0,
    mistakeIn: 0, mistake: 0, wait: 0, loc: {}, smoking: false,
  }));
  let profile = null;

  const rivals = {
    list, // every driver
    live: list, // the ones racing now (tuning: race.rivals; 0 = a time trial)
    reset(grid, active = list.length) {
      rivals.live = list.slice(0, Math.max(0, Math.min(list.length, Math.round(active))));
      const R = tune.rivals;
      profile = speedProfile(track, { grip: R.cornerGrip, brake: R.brake, top: R.topSpeed });
      rivals.live.forEach((r, i) => {
        r.s = grid[i].s; r.lat = grid[i].lat; r.v = 0; r.latV = 0; r.slide = 0;
        r.mistakeIn = rng.range(7, 16); r.mistake = 0;
        r.wait = rng.range(0.05, 0.35); // reaction time at the lights
        place(r);
      });
    },

    /**
     * One step. `others` = every car on the road as { s, lat, v } (the player included);
     * `ahead(r)` = metres the player is ahead of rival r along the race (negative = behind).
     */
    update(dt, others, ahead, go = true) {
      const R = tune.rivals;
      for (const r of rivals.live) {
        if (!go) { place(r); continue; }
        if (r.wait > 0) { r.wait -= dt; place(r); continue; }
        const i = Math.floor(track.wrap(r.s + r.v * 0.2) / track.ds) % track.n;

        // Pace: skill, rubber band, mistakes.
        const gap = ahead ? ahead(r) : 0;
        const band = clamp(gap / R.bandDistance, -1, 1);
        let pace = R.pace * r.skill * (1 + (band > 0 ? R.catchUp : R.easeOff) * band);
        r.mistakeIn -= dt;
        if (r.mistakeIn <= 0) {
          r.mistake = R.mistakeTime;
          r.mistakeIn = rng.range(R.mistakeEvery * 0.6, R.mistakeEvery * 1.5);
          r.mistakeSide = Math.sign(track.turn[i]) || rng.sign();
        }
        if (r.mistake > 0) {
          r.mistake -= dt;
          pace *= R.mistakeSlow;
        }
        let want = profile[i] * pace;

        // Line: the racing line, their habit, a mistake running wide, and other cars.
        const room = track.half[i] - 1.2;
        let lane = track.line[i] * r.line + r.lane - (r.mistake > 0 ? r.mistakeSide * 3 : 0);
        for (const o of others) {
          if (o === r) continue;
          const d = track.delta(r.s, o.s); // metres they are ahead of me
          const side = r.lat - o.lat;
          if (d > 0 && d < 9 + r.v * 0.35 && Math.abs(o.lat - lane) < 2.5 && o.v < want) {
            // Someone slower on my line: pass on the side with more room, or sit behind.
            let pass = o.lat + (o.lat > 0 ? -1 : 1) * 2.8;
            if (Math.abs(pass) > room) pass = o.lat + (o.lat > 0 ? 1 : -1) * 2.8;
            if (Math.abs(pass) <= room) lane = pass;
            else if (d < 7) want = Math.min(want, o.v);
            if (d < 5 && Math.abs(side) < 1.9) want = Math.min(want, o.v * 0.98); // never drive through a car
          } else if (Math.abs(d) < 4.6 && Math.abs(side) < 2.3) {
            lane = r.lat + Math.sign(side || 1) * 1.2; // side by side: give each other room
          }
        }
        lane = clamp(lane, -room, room);

        const before = r.v;
        const accel = R.accel * Math.max(0.05, 1 - r.v / (R.topSpeed * 1.1));
        r.v += clamp(want - r.v, -R.brake * dt, accel * dt);
        r.longAccel = (r.v - before) / dt;
        r.s = track.wrap(r.s + r.v * dt);
        const wantV = clamp((lane - r.lat) * 2.2, -R.laneSpeed, R.laneSpeed) * clamp(r.v / 12, 0, 1);
        r.latV += (wantV - r.latV) * Math.min(1, dt * 5);
        r.lat = clamp(r.lat + r.latV * dt, -room - 0.6, room + 0.6);
        place(r);
      }
    },
  };

  // Work out the world position and the pose from s and lat.
  function place(r) {
    const L = track.at(r.s, r.lat, r.loc);
    r.x = L.x; r.y = L.y; r.z = L.z;
    // In a tight corner the tail steps out a little (for show: it does not change their path).
    const slide = clamp(L.turn * r.v * tune.rivals.slideShow, -0.32, 0.32) * (r.mistake > 0 ? 1.6 : 1);
    r.slide += (slide - r.slide) * 0.1;
    r.yaw = Math.atan2(L.tx, L.tz) - Math.atan2(r.latV, Math.max(4, r.v)) - r.slide;
    r.latAccel = r.v * r.v * L.turn;
    r.smoking = Math.abs(r.slide) > 0.16 && r.v > 12;
  }

  return rivals;
}
