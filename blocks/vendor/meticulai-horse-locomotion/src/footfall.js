// WHERE EACH HOOF IS, from a footfall table. Pure maths, no three.js. From TUMEN by Meticulai (the game's code-built
// stand-in horse places its hooves exactly like this and bends its legs to them with two-bone IK).
//
// Each hoof lands at a phase of the stride and stays down for a share of it (the duty). While down it travels
// straight back at exactly one stride per cycle, so it cannot slide; in the air it swings forward on a Hermite curve
// with matched end speeds, lifted by a sine. Phase 0 is the left hind landing in every gait.
//
// Model space: +Z forward, +X left, y up, origin on the ground under the middle of the body (the mid-body point
// herd.js gives you as mx, mz).

import { DEFAULT_GAITS } from './locomotion.js';

// [touchdown phase, duty] per hoof
export const FOOTFALL = {
  walk: { hl: [0.0, 0.58], fl: [0.25, 0.58], hr: [0.5, 0.58], fr: [0.75, 0.58] },
  trot: { hl: [0.0, 0.38], fr: [0.0, 0.38], hr: [0.5, 0.38], fl: [0.5, 0.38] },
  canter: { hl: [0.0, 0.28], hr: [0.16, 0.28], fl: [0.16, 0.28], fr: [0.36, 0.28] },      // right lead, three beats
  gallop: { hl: [0.0, 0.19], hr: [0.09, 0.19], fl: [0.34, 0.19], fr: [0.43, 0.19] },      // four beats then air
};
export const HOOVES = ['fl', 'fr', 'hl', 'hr'];
// bob (m), pitch (rad, + = nose up), where in the cycle the body is lowest, beats per cycle, hoof lift (m), neck nod
export const BODY = {
  walk: { bob: 0.012, pitch: 0.008, low: 0.14, beats: 2, lift: 0.11, neck: 0.05 },
  trot: { bob: 0.032, pitch: 0.006, low: 0.19, beats: 2, lift: 0.17, neck: 0.015 },
  canter: { bob: 0.05, pitch: 0.06, low: 0.34, beats: 1, lift: 0.24, neck: 0.07 },
  gallop: { bob: 0.055, pitch: 0.045, low: 0.33, beats: 1, lift: 0.3, neck: 0.09 },
};
// the stand-in horse's proportions (metres, size 1): shoulder and hip pivots, hoof sole height, half the track width
export const SHAPE = { shoulder: { y: 1.03, z: 0.42 }, hip: { y: 1.05, z: -0.48 }, ankle: 0.07, halfTrack: 0.16 };
const ZC = { fl: SHAPE.shoulder.z + 0.02, fr: SHAPE.shoulder.z + 0.02, hl: SHAPE.hip.z + 0.1, hr: SHAPE.hip.z + 0.1 };
// contact intervals are trimmed a hair so a sample exactly on a footfall edge is not counted as planted
export const CONTACT_EPS = 0.012;

/**
 * The hoof's sole point in model space for a gait ('walk' .. 'gallop') at a phase (cycles, any real number).
 * out = { x, y, z, down } (down: true while it is planted). gaits: { walk: { stride }, ... } (default: DEFAULT_GAITS).
 */
export function hoofAt(gait, hoof, phase, out = { x: 0, y: 0, z: 0, down: false }, gaits = DEFAULT_GAITS) {
  const [p0, duty] = FOOTFALL[gait][hoof], S = gaits[gait].stride, u = ((phase - p0) % 1 + 1) % 1, front = hoof[0] === 'f';
  const half = S * duty / 2, zc = ZC[hoof];
  if (u < duty) { out.z = zc + half - S * u; out.y = SHAPE.ankle; out.down = true; }
  else {
    const s = (u - duty) / (1 - duty), m = -S * (1 - duty);     // Hermite back to the front with matched end speeds
    const h00 = 2 * s * s * s - 3 * s * s + 1, h10 = s * s * s - 2 * s * s + s, h01 = -2 * s * s * s + 3 * s * s, h11 = s * s * s - s * s;
    out.z = zc + h00 * -half + h10 * m + h01 * half + h11 * m;
    const lift = Math.sin(Math.PI * s); out.y = SHAPE.ankle + BODY[gait].lift * lift * lift * (front ? 1 : 0.8);
    out.down = false;
  }
  out.x = (hoof[1] === 'l' ? 1 : -1) * SHAPE.halfTrack;
  return out;
}

/** Contact intervals per gait and hoof, in the meta-file shape: { walk: { hoof_fl: [[a, b]], ... }, ... }. */
export function contacts() {
  const out = {};
  for (const g of Object.keys(FOOTFALL)) { out[g] = {}; for (const h of HOOVES) { const [p0, d] = FOOTFALL[g][h]; out[g]['hoof_' + h] = [[p0 + CONTACT_EPS, p0 + d - CONTACT_EPS]]; } }
  return out;
}

/** The forehand reach a herd needs for this footfall: the furthest forward a front hoof is while planted, + 5 cm. */
export function leadFromHooves(gaits = DEFAULT_GAITS) {
  let reach = 0; const o = { x: 0, y: 0, z: 0, down: false };
  for (const g of Object.keys(FOOTFALL)) for (const h of ['fl', 'fr']) for (let k = 0; k < 200; k++) { hoofAt(g, h, k / 200, o, gaits); if (o.down) reach = Math.max(reach, o.z); }
  return Math.max(0.6, Math.min(1.5, reach + 0.05));
}

/** The body's bob (m) and pitch (rad, + = nose up) at a phase, as the stand-in's clips move it. */
export function bodyAt(gait, phase, out = { bob: 0, pitch: 0 }) {
  const bd = BODY[gait], w = 2 * Math.PI * bd.beats * (phase - bd.low);
  out.bob = -bd.bob * Math.cos(w) - (gait === 'gallop' ? 0.03 : gait === 'canter' ? 0.012 : 0);
  out.pitch = bd.beats === 1 ? bd.pitch * Math.cos(2 * Math.PI * phase) : bd.pitch * Math.sin(w);
  return out;
}
