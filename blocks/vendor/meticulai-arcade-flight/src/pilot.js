// Mouse-aim piloting, as the player flies in Dragon Aces. The mouse swings an aim direction in the world (the camera
// looks along it) and the flyer's autopilot (steerToward) banks and pulls toward it. A/D add direct roll; W/S open
// and close the throttle (the wings spool up and down instead of snapping); S also brakes; Shift/Space boosts;
// Q/E start a barrel roll. Pure maths, no DOM: feed it the controls from input.js (or a bot, or a test).
import { clamp } from './math.js';
import { forwardOf, steerToward, stepFlight, PRESETS, FLIGHT } from './flight.js';

/** The pilot's numbers (the live game's). */
export const PILOT = {
  sharp: 1.15, // how hard the autopilot chases the mouse (bots use 1)
  pitchLimit: 1.45, // the aim can look this far up or down (rad)
  throttleCruise: 0.62, // throttle with no key held
  throttleOpen: 1, // W held
  throttleClosed: 0.08, // S held (and the brake is on)
  spoolUp: 5, // 1/s: the throttle eases toward the command (opening)
  spoolDown: 7, // 1/s: (closing)
};

/**
 * @param {object} fs flight state (createFlightState)
 * @param {{breed?: {speed:number, turn:number}, cfg?: typeof FLIGHT, pilot?: typeof PILOT}} [opts]
 */
export function createPilot(fs, opts = {}) {
  const P = opts.pilot || PILOT;
  const breed = opts.breed || PRESETS.balanced;
  const cfg = opts.cfg || FLIGHT;
  const input = { pitch: 0, roll: 0, yaw: 0, throttle: P.throttleCruise, boost: false, brake: false, dodge: 0 };
  const api = {
    fs,
    input,
    aimYaw: 0,
    aimPitch: 0,
    throttleCmd: undefined,
    /** The world direction the player is aiming ([x, y, z], unit). */
    aimDir(out = [0, 0, 0]) {
      const cp = Math.cos(api.aimPitch);
      out[0] = -Math.sin(api.aimYaw) * cp;
      out[1] = Math.sin(api.aimPitch);
      out[2] = -Math.cos(api.aimYaw) * cp;
      return out;
    },
    /** Point the aim along the nose (call after placing or respawning the flyer). */
    aimAlongNose() {
      const f = forwardOf(fs.q);
      api.aimYaw = Math.atan2(-f[0], -f[2]);
      api.aimPitch = Math.asin(Math.max(-1, Math.min(1, f[1])));
    },
    /** Swing the aim by mouse movement already turned into radians (input.js does 0.0022 rad per pixel). */
    look(dYaw, dPitch) {
      api.aimYaw -= dYaw;
      api.aimPitch = clamp(api.aimPitch - dPitch, -P.pitchLimit, P.pitchLimit);
    },
    /**
     * One step. c: { aimDx, aimDy (rad), roll (-1..1), throttleUp, throttleDown, boost, dodge (-1|0|1) }.
     * Returns the angle between the nose and the aim (rad).
     */
    fly(dt, c) {
      if (c.aimDx || c.aimDy) api.look(c.aimDx || 0, c.aimDy || 0);
      const aim = api.aimDir(_aim);
      const off = steerToward(fs, aim, input, P.sharp);
      if (c.roll) input.roll = c.roll;
      // wings spool up and down instead of snapping
      const tt = c.throttleUp ? P.throttleOpen : c.throttleDown ? P.throttleClosed : P.throttleCruise;
      if (api.throttleCmd === undefined) api.throttleCmd = tt;
      api.throttleCmd += (tt - api.throttleCmd) * (1 - Math.exp(-(tt > api.throttleCmd ? P.spoolUp : P.spoolDown) * dt));
      input.throttle = api.throttleCmd;
      input.brake = !!c.throttleDown;
      input.boost = !!c.boost;
      input.dodge = c.dodge || 0;
      stepFlight(fs, input, dt, breed, cfg);
      return off;
    },
  };
  api.aimAlongNose();
  return api;
}
const _aim = [0, 0, 0];
