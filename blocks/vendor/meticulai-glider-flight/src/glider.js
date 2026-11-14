// The glider flight model from Hezarfen (Meticulai): a point mass with a wing. The pilot sets angle of attack (pitch)
// and bank; lift grows with the square of airspeed, drag has a parasitic and an induced part, and the wing stalls.
// Air itself moves: a breeze, thermals that lean with the wind and breathe, ridge lift on windward slopes, sink over
// cold water, faint lift over warm ground. Close to a surface induced drag falls (ground effect) and a hands-off wing
// holds its height until the speed is spent (the skim cushion). A flare past the stall is the landing.
//
// THE FEEL IS TUNED. Every number in TUNE is the live game's (assistDrag 0.7 is the game's default "Drag" setting).
// Change them in your own copy (createGlider(world, { ...TUNE, ... })), after flying it.
//
// The world is yours: createGlider(world) where
//   world = { heightAt(x, z), wind: { x, z }, thermals: [{ x, z, r, strength, top, low?, id? }],
//             seaLevel?: 0, warmthAt?(x, z) -> 0..1, isWater?(x, z) }
// heightAt is the ground (or sea bed: below 0 is under water when seaLevel is 0).
import * as THREE from 'three';
import { clamp, lerp, smoothstep, damp, deg, noise2 } from './util.js';

export const TUNE = {
  mass: 95, // kg, pilot and wings
  area: 5.6, // m^2: best glide at about 20 m/s, stall just under 14
  rho: 1.2,
  g: 9.81,
  cl0: 0.26,
  clPerDeg: 0.082,
  alphaStall: 15, // degrees
  cd0: 0.03,
  kInduced: 0.07,
  alphaTrim: 5.3, // hands-off angle of attack: best glide
  alphaMin: -1.5, // full dive
  alphaMax: 14.2, // full pull, just under the stall
  alphaFlare: 19, // landing flare: past the stall on purpose
  alphaRate: 5.5,
  bankMax: deg(50), // full deflection: a held key circles tightly without bleeding the climb away (critic round 1)
  rollRate: deg(125),
  rollGain: 4.2,
  maxG: 3.4,
  turnAssist: 0.75,
  pitchDamp: 0.3, // degrees of angle of attack per degree the flight path is off the trim glide
  gammaTrim: -5.5, // degrees: the hands-off glide slope // how much extra lift is added automatically in a banked turn
  flareDrag: 0.16,
  groundEffect: 0.5, // share of induced drag removed when skimming within a wing-span of water or ground
  thermalScale: 1,
  // the air (1 or the number shown is the tuned game)
  gustScale: 1, // gusts
  seaSink: 0.35, // m/s of sinking air over open water
  cityLift: 0.55, // m/s of faint lift over warm ground (dense roofs in the game): scaled by world.warmthAt(x, z)
  ridgeScale: 1, // ridge lift on windward slopes
  dragScale: 1, // all drag: below 1 the wing glides further
  assistDrag: 0.7, // the player's Drag setting: the game's default is 0.7 ("Forgiving wings"); 1 is the original tuned difficulty
  speedScale: 1, // the player's Flight speed setting: every speed x k, same glide (as if the wing loading were k^2); call glider.retune() after changing it
  stalls: true, // the wing lets go when slow and nose-high
};

/**
 * The moving air of a world. Returns airAt(x, y, z, time, out, info): out (a Vector3) gets the air's velocity (m/s);
 * info (optional) gets { thermal, lift, agl }: the thermal the point is in, the vertical air, the height above ground.
 */
export function createAir(world, TUNE = TUNE_DEFAULT) {
  const THERMALS = world.thermals || [];
  const WIND = world.wind || { x: 0, z: 0 };
  const SEA_LEVEL = world.seaLevel ?? 0;
  const heightAt = world.heightAt;
  const slopeAt = (x, z, e = 6) => [(heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e)];
  const isWater = world.isWater || ((x, z) => heightAt(x, z) < SEA_LEVEL - 3);
  const warmthAt = world.warmthAt || null;
  return function airAt(x, y, z, time, out, info) {
    let up = 0;
    let inThermal = null;
    let core = 0;
    const ground = Math.max(SEA_LEVEL, heightAt(x, z));
    const agl = y - ground;
    for (let i = 0; i < THERMALS.length; i++) {
      const t = THERMALS[i];
      // thermals lean with the breeze as they rise
      const lean = Math.max(0, y - 40) * 0.25;
      const dx = x - (t.x + WIND.x * lean * 0.1);
      const dz = z - (t.z + WIND.z * lean * 0.1);
      const r = Math.hypot(dx, dz) / t.r;
      if (r > 2.2) continue;
      const env = (t.low ? smoothstep(0.5, 4, agl) : smoothstep(4, 24, agl)) * (1 - smoothstep(t.top - 28, t.top + 6, y));
      const breathe = 0.88 + 0.12 * Math.sin(time * 0.35 + i * 1.7);
      // flat-topped: full lift out to 0.55 r, gone by 1.1 r, a faint sinking ring just outside (none round a low thermal)
      const profile = 1 - smoothstep(0.55, 1.1, r) - (t.low ? 0 : 0.1) * smoothstep(1.0, 1.3, r) * (1 - smoothstep(1.5, 2.1, r));
      const w = t.strength * TUNE.thermalScale * (TUNE.speedScale || 1) * breathe * env * profile; // a faster wing sinks faster: thermals keep pace
      up += w;
      if (r < 1.05 && env > 0.05 && w > core) { core = w; inThermal = t; }
    }
    // ridge lift: the breeze pushed up a slope, fading with height above it
    const s = slopeAt(x, z, 12);
    const ridge = (WIND.x * s[0] + WIND.z * s[1]) * 2.2 * Math.exp(-Math.max(agl, 0) / 70);
    up += clamp(ridge, -1.5, 2.5) * TUNE.ridgeScale;
    // warm ground (the game's city): a faint general lift, so staying over land costs less height
    if (warmthAt && heightAt(x, z) > SEA_LEVEL + 2) up += TUNE.cityLift * warmthAt(x, z) * smoothstep(5, 30, agl) * (1 - smoothstep(250, 400, y));
    // cool air sinking gently over open water, but not in the last few metres: skimming is the efficient line
    if (isWater(x, z)) up -= TUNE.seaSink * smoothstep(8, 60, y - SEA_LEVEL);
    // gusts: slow rolling noise, stronger low down
    const gust = (0.5 + 0.9 * (1 - smoothstep(20, 120, agl))) * TUNE.gustScale;
    const gx = (noise2(x * 0.011 + time * 0.13, z * 0.011, 5) - 0.5) * 2.4 * gust;
    const gz = (noise2(x * 0.011, z * 0.011 - time * 0.11, 9) - 0.5) * 2.4 * gust;
    const gy = (noise2(x * 0.02 + time * 0.2, z * 0.02 + time * 0.17, 13) - 0.5) * 1.3 * gust;
    out.set(WIND.x + gx, up + gy, WIND.z + gz);
    if (info) {
      info.thermal = inThermal;
      info.lift = up;
      info.agl = agl;
    }
    return out;
  };
}

const UP = new THREE.Vector3(0, 1, 0);

// TUNE is shared and live: a dev panel can change it while flying. Pass your own copy for a second glider.
const TUNE_DEFAULT = TUNE;

/**
 * @param {object} world see the top of this file
 * @param {typeof TUNE} [TUNE] the numbers (default: the shared TUNE object, live)
 */
export function createGlider(world, TUNE = TUNE_DEFAULT) {
  const airAt = createAir(world, TUNE);
  const SEA_LEVEL = world.seaLevel ?? 0;
  const g = {
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(0, 0, -1),
    air: new THREE.Vector3(),
    forward: new THREE.Vector3(0, 0, -1), // direction of flight through the air
    right: new THREE.Vector3(1, 0, 0), // horizontal right
    liftDir: new THREE.Vector3(0, 1, 0),
    wingRight: new THREE.Vector3(1, 0, 0), // along the right wing (right, rolled by the bank)
    nose: new THREE.Vector3(0, 0, -1), // where the body points (flight direction pitched up by alpha)
    bank: 0, // radians, + is right wing down
    alpha: TUNE.alphaTrim, // degrees
    speed: 0, // airspeed m/s
    groundSpeed: 0,
    vspeed: 0,
    gLoad: 1,
    stall: 0, // 0..1 how deep in the stall
    stallBreak: 0, // seconds left of a stall break (nose drops, controls mushy)
    buffet: 0, // 0..1 shake
    groundEffect: 0, // 0..1 how much the surface below is helping
    cl: 0,
    cd: 0,
    info: { thermal: null, lift: 0, agl: 0 },
    stallSpeed: 0, // m/s, set by retune(): about 13.7 at speedScale 1
    time: 0,
    tune: TUNE,
    airAt,
  };
  /** Recompute the stall speed after changing TUNE.speedScale, mass, area or the lift curve. */
  g.retune = () => {
    g.stallSpeed = TUNE.speedScale * Math.sqrt((2 * TUNE.mass * TUNE.g) / (TUNE.rho * TUNE.area * (TUNE.cl0 + TUNE.clPerDeg * TUNE.alphaStall)));
  };
  g.retune();
  const va = new THREE.Vector3();
  const acc = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  /** Place the glider: pos (Vector3), heading in degrees (0 = -Z, 90 = +X), speed m/s, climb m/s. */
  g.reset = (pos, headingDeg, speed = 10, climb = 0) => {
    const a = deg(headingDeg);
    g.pos.copy(pos);
    g.vel.set(Math.sin(a) * speed, climb, -Math.cos(a) * speed);
    g.bank = 0;
    g.alpha = TUNE.alphaTrim;
    g.stall = 0;
    g.stallBreak = 0;
    g.buffet = 0;
    g.forward.copy(g.vel).normalize();
    g.right.crossVectors(g.forward, UP).normalize();
  };

  const clOf = (alpha) => {
    if (alpha <= TUNE.alphaStall) return TUNE.cl0 + TUNE.clPerDeg * alpha;
    const peak = TUNE.cl0 + TUNE.clPerDeg * TUNE.alphaStall;
    return Math.max(0.7, peak - (alpha - TUNE.alphaStall) * 0.07);
  };

  // input: { pitch: -1 (push, dive) .. +1 (pull, climb), roll: -1 (left) .. +1 (right), flare: 0..1 }
  g.step = (dt, input) => {
    g.time += dt;
    airAt(g.pos.x, g.pos.y, g.pos.z, g.time, g.air, g.info);
    va.copy(g.vel).sub(g.air);
    const V = Math.max(va.length(), 0.01);
    g.speed = V;
    g.forward.copy(va).divideScalar(V);
    tmp.crossVectors(g.forward, UP);
    if (tmp.lengthSq() > 0.0025) g.right.copy(tmp.normalize());
    const q = (0.5 * TUNE.rho * V * V * TUNE.area) / (TUNE.mass * TUNE.speedScale * TUNE.speedScale); // lift acceleration per unit CL

    // --- controls
    let pitch = clamp(input.pitch, -1, 1);
    let roll = clamp(input.roll, -1, 1);
    const flare = clamp(input.flare || 0, 0, 1);
    if (g.stallBreak > 0) {
      g.stallBreak -= dt;
      pitch = Math.min(pitch, -0.55);
      roll *= 0.35;
    }
    let target = pitch >= 0 ? lerp(TUNE.alphaTrim, TUNE.alphaMax, pitch) : lerp(TUNE.alphaTrim, TUNE.alphaMin, -pitch);
    // hold height in a turn: a banked wing needs more lift
    const need = 1 / Math.max(Math.cos(g.bank), 0.45) - 1;
    target += (need * TUNE.turnAssist * (TUNE.cl0 + TUNE.clPerDeg * TUNE.alphaTrim)) / TUNE.clPerDeg * (pitch > -0.3 ? 1 : 0);
    target = Math.min(target, TUNE.alphaMax);
    // phugoid damping: a fixed angle of attack porpoises (speed and height trading back and forth for a minute).
    // Lean against the climb/descent itself, the way a pilot's hands do: a little less lift when the path is above
    // the trim glide, a little more when below. Fades out when the pilot is holding a pitch input.
    const gammaDeg = (Math.asin(clamp(g.forward.y, -1, 1)) * 180) / Math.PI;
    target -= clamp((gammaDeg - TUNE.gammaTrim) * TUNE.pitchDamp, -4, 4) * (1 - Math.min(1, Math.abs(pitch) * 1.5));
    // skim cushion: low over a surface with hands off the pitch, the wing holds its height (a little more angle of
    // attack as it sinks) until the speed is spent. Low and fast is the efficient line, and it has to be flyable.
    if (g.info.agl < 9 && Math.abs(pitch) < 0.18 && V > g.stallSpeed * 1.12 && flare < 0.1) {
      const cushion = clamp(-g.vel.y * 1.3 + (3.2 - g.info.agl) * 0.55, -1.5, 7) * (1 - smoothstep(4.5, 9, g.info.agl));
      target = clamp(target + cushion, TUNE.alphaMin, TUNE.alphaMax);
    }
    if (flare > 0) target = lerp(target, TUNE.alphaFlare, flare);
    // structural / pilot limit: never ask for more than maxG
    const clLimit = (TUNE.maxG * TUNE.g) / Math.max(q, 0.01);
    const alphaLimit = (clLimit - TUNE.cl0) / TUNE.clPerDeg;
    if (flare < 0.5) target = Math.min(target, Math.max(alphaLimit, TUNE.alphaMin));
    g.alpha = damp(g.alpha, target, TUNE.alphaRate, dt);

    const bankTarget = roll * TUNE.bankMax;
    const rate = clamp((bankTarget - g.bank) * TUNE.rollGain, -TUNE.rollRate, TUNE.rollRate);
    g.bank += rate * dt * (0.45 + 0.55 * smoothstep(g.stallSpeed * 0.7, g.stallSpeed * 1.4, V)); // sluggish when slow

    // --- stall: slow and nose-high, the wing lets go
    const slow = 1 - smoothstep(g.stallSpeed * 0.98, g.stallSpeed * 1.22, V);
    const high = smoothstep(TUNE.alphaTrim + 4, TUNE.alphaMax, g.alpha);
    g.buffet = damp(g.buffet, flare > 0.5 ? 0.25 * slow : slow * high, 6, dt);
    if (TUNE.stalls && flare < 0.5 && V < g.stallSpeed * 0.96 && g.alpha > TUNE.alphaTrim + 5 && g.stallBreak <= 0 && g.info.agl > 6) {
      g.stallBreak = 1.15;
      g.bank += (Math.sin(g.time * 12.9) > 0 ? 1 : -1) * deg(12);
    }
    g.stall = damp(g.stall, g.stallBreak > 0 ? 1 : 0, 5, dt);

    // --- forces
    let cl = clOf(g.alpha) * (1 - 0.45 * g.stall);
    // ground effect: close to a surface the wing's downwash is cut off and induced drag falls
    g.groundEffect = 1 - smoothstep(2, 9, g.info.agl);
    let cd = TUNE.cd0 + TUNE.kInduced * (1 - TUNE.groundEffect * g.groundEffect) * cl * cl + flare * TUNE.flareDrag + 0.5 * g.stall * 0.1;
    if (g.alpha > TUNE.alphaStall) cd += 0.012 * (g.alpha - TUNE.alphaStall) ** 1.5;
    cd += 0.02 * smoothstep(34, 50, V); // canvas flutter: the wings fight very high speed
    cd *= TUNE.dragScale * TUNE.assistDrag;
    g.cl = cl;
    g.cd = cd;
    g.liftDir.crossVectors(g.right, g.forward).multiplyScalar(Math.cos(g.bank)).addScaledVector(g.right, Math.sin(g.bank));
    acc.copy(g.liftDir).multiplyScalar(q * cl).addScaledVector(g.forward, -q * cd);
    g.gLoad = (q * cl) / TUNE.g;
    acc.y -= TUNE.g;
    g.vel.addScaledVector(acc, dt);
    g.pos.addScaledVector(g.vel, dt);
    g.vspeed = g.vel.y;
    g.groundSpeed = Math.hypot(g.vel.x, g.vel.z);

    // where the body points: the flight direction pitched up by alpha about the banked right axis
    g.wingRight.copy(g.right).applyAxisAngle(g.forward, g.bank);
    g.nose.copy(g.forward).applyAxisAngle(g.wingRight, deg(g.alpha));
  };

  /** Height above the ground or water right now (m). */
  g.agl = () => g.pos.y - Math.max(SEA_LEVEL, world.heightAt(g.pos.x, g.pos.z));
  g.heading = () => ((Math.atan2(g.vel.x, -g.vel.z) * 180) / Math.PI + 360) % 360;
  g.glideAngle = () => Math.atan2(g.vel.y, Math.max(g.groundSpeed, 0.01));
  return g;
}
