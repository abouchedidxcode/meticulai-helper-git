// A scripted pilot that flies with the same pitch / roll / flare inputs as a player (from Hezarfen's recorded
// play-through bot). Use it to test that a route is flyable, to tune the model in Node (tools/sim.mjs), and to record
// play-throughs. A plan is a list of steps:
//   { do: 'dive', secs }                         push for speed
//   { do: 'goto', x, z, within?, alt?, slope?, lead?, speed?, skim? }
//                                                fly to a point; with alt, fly a slope down (or up) to arrive at that
//                                                height; skim: hold ~3 m over water or ground in ground effect
//   { do: 'climb', thermal: '<id>', alt }        circle in a thermal until alt (gives up after 120 s)
//   { do: 'land', x?, z?, ground? }              approach and flare onto world.landing (or the given point)
//   { do: 'idle' }                               hands off
import { clamp, wrapAngle } from './util.js';

/**
 * @param {{glider: object, world: object, state?: object}} ctx  state: the input state to write
 *   ({ pitch, roll, flare }); defaults to a fresh object (read it from api.state)
 */
export function createAutopilot({ glider, world, state }) {
  const TUNE = glider.tune;
  const heightAt = world.heightAt;
  const thermal = (id) => world.thermals.find((t) => t.id === id);
  let plan = null;
  let i = 0;
  let stepT = 0;
  let circleDir = 1;
  let flightTime = 0;
  const log = [];
  const st = state || { pitch: 0, roll: 0, flare: 0 };
  const note = (s) => log.push(`[${flightTime.toFixed(1)}s] ${s}`);

  const steer = (tx, tz, speedTarget, out) => {
    const p = glider.pos;
    const want = Math.atan2(tx - p.x, -(tz - p.z));
    const have = Math.atan2(glider.vel.x, -glider.vel.z);
    const err = wrapAngle(want - have);
    out.roll = clamp(err * 1.5, -0.85, 0.85);
    // trade speed for height gently: a hard pull after a dive would zoom into a stall
    out.pitch = clamp((glider.speed - speedTarget) * 0.07, -0.8, 0.42);
    return err;
  };

  // close to the surface: hold height (or climb a little) rather than trade it for speed, as long as the wing is flying
  const lowGuard = (s) => {
    const agl = glider.pos.y - Math.max(0, heightAt(glider.pos.x, glider.pos.z));
    if (agl < 14 && glider.speed > 16) s.pitch = Math.max(s.pitch, clamp((14 - agl) * 0.03, 0.08, 0.32));
    if (agl < 14) s.roll = clamp(s.roll, -0.45, 0.45); // and keep the wingtips out of the water
  };

  const api = {
    log,
    state: st,
    active: () => !!plan,
    /** The step being flown (or null when the plan is done). */
    current: () => (plan ? plan[i] || null : null),
    start(steps) {
      plan = steps;
      i = 0;
      stepT = 0;
      flightTime = 0;
      note(`plan of ${steps.length} steps`);
    },
    stop() { plan = null; },
    /** Call once per frame (or per 1/60 s in Node) before the glider steps; writes api.state. */
    update(dt) {
      if (!plan) return st;
      flightTime += dt;
      st.pitch = 0;
      st.roll = 0;
      st.flare = 0;
      const step = plan[i];
      if (!step) return st;
      stepT += dt;
      const p = glider.pos;
      const next = (why) => { note(`${step.do} done (${why}) alt ${p.y.toFixed(0)} spd ${glider.speed.toFixed(1)} at ${p.x.toFixed(0)},${p.z.toFixed(0)}`); i++; stepT = 0; };
      if (step.do === 'dive') {
        st.pitch = -0.7;
        if (stepT > step.secs) next('speed up');
      } else if (step.do === 'idle') {
        // nothing
      } else if (step.do === 'goto') {
        steer(step.x, step.z, step.speed || 21, st);
        if (step.alt !== undefined) {
          // fly a slope down (or up) to arrive at the given altitude; never slower than 18 or faster than 36 m/s
          const dist = Math.hypot(step.x - p.x, step.z - p.z);
          const want = step.alt + Math.max(0, dist - (step.lead ?? 20)) * (step.slope ?? 0.085);
          st.pitch = clamp((want - p.y) * 0.05 - glider.vspeed * 0.04 - 0.08, -0.9, 0.5);
          if (glider.speed < 18) st.pitch = Math.min(st.pitch, -0.15);
          if (glider.speed > 36) st.pitch = Math.max(st.pitch, 0.15);
        }
        if (step.skim) {
          // over water and low: hold about three metres off the surface, in ground effect, for as long as speed lasts
          const agl = p.y - Math.max(0, heightAt(p.x, p.z));
          // (at 30 m/s even a small angle of attack lifts more than the weight, so the push must be allowed to be firm)
          if (agl < 22) {
            // the stick position that holds level flight at this speed, plus a correction toward 2.6 m
            const q = (0.5 * TUNE.rho * glider.speed * glider.speed * TUNE.area) / (TUNE.mass * (TUNE.speedScale || 1) ** 2);
            const alphaLevel = (TUNE.g / Math.max(q, 1) - TUNE.cl0) / TUNE.clPerDeg;
            const level = alphaLevel < TUNE.alphaTrim ? -(TUNE.alphaTrim - alphaLevel) / (TUNE.alphaTrim - TUNE.alphaMin) : (alphaLevel - TUNE.alphaTrim) / (TUNE.alphaMax - TUNE.alphaTrim);
            st.pitch = clamp(level + (3.7 - agl) * 0.12 - glider.vspeed * 0.3, -1, 0.9);
          }
        }
        if (Math.hypot(step.x - p.x, step.z - p.z) < (step.within || 60)) next('arrived');
      } else if (step.do === 'climb') {
        const t = thermal(step.thermal);
        const dx = p.x - t.x;
        const dz = p.z - t.z;
        const dist = Math.hypot(dx, dz);
        if (dist > t.r * 1.1) {
          steer(t.x, t.z, 20, st);
          lowGuard(st);
          circleDir = 1;
        } else {
          // circle: fly the tangent, corrected toward a ring at 0.3 r
          const ring = t.r * 0.3;
          const ang = Math.atan2(dz, dx) + circleDir * (Math.PI / 2 + clamp((dist - ring) / ring, -0.7, 0.7) * 0.9);
          steer(p.x + Math.cos(ang) * 50, p.z + Math.sin(ang) * 50, 17.5, st);
          lowGuard(st);
          st.roll = clamp(st.roll + circleDir * 0.45, -0.84, 0.84);
        }
        if (p.y >= step.alt) next('high enough');
        if (stepT > 120) next('gave up');
      } else if (step.do === 'land') {
        // final approach: hold a glide slope to the field using the flare as an airbrake, circle if far too
        // high, then a full flare just above the ground
        const g = { ...world.landing, ...(step.x !== undefined ? { x: step.x, z: step.z } : {}), ...(step.ground !== undefined ? { ground: step.ground } : {}) };
        const dist = Math.hypot(g.x - p.x, g.z - p.z);
        const agl = p.y - Math.max(0, heightAt(p.x, p.z));
        const need = (p.y - g.ground - 1.5) / Math.max(dist, 1); // slope we must fly to touch down on the target
        steer(g.x, g.z, dist < 260 ? 17.5 : 20.5, st);
        if (dist < 900) {
          if (need > 0.42 && dist < 200 && agl > 25) {
            st.roll = 0.85; // far too high and close: a descending turn
            st.flare = 0.5;
          } else if (need > 0.125) {
            st.flare = clamp((need - 0.125) * 9, 0.15, 0.85);
          }
        }
        if (agl < 5.5 && dist < 80) { st.flare = 1; st.pitch = 0.6; st.roll *= 0.3; }
        if (agl < 3.0 && dist < 140) { st.flare = 1; st.pitch = 0.6; st.roll *= 0.3; }
      }
      return st;
    },
  };
  return api;
}

/**
 * Touchdown rules from the game: contact when the wing's keel (1.6 m below the pilot's centre) reaches the ground or
 * water. On water: 'splash'. On ground: 'landed' if sinking slower than 6.2 m/s and slower than 24 m/s, else 'crashed'.
 * (The game's "Forgiving wings" setting is more lenient: up to 9 m/s sink and 32 m/s.) Returns null while flying.
 */
export function touchdown(glider, world, { maxSink = 6.2, maxSpeed = 24 } = {}) {
  const sea = world.seaLevel ?? 0;
  const g = world.heightAt(glider.pos.x, glider.pos.z);
  if (glider.pos.y - 1.6 > Math.max(sea, g)) return null;
  if (g <= sea) return 'splash';
  return -glider.vspeed < maxSink * (glider.tune.speedScale || 1) && glider.speed < maxSpeed * (glider.tune.speedScale || 1) ? 'landed' : 'crashed';
}
