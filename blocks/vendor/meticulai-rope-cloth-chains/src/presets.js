// The chains Inkbound's three fighters wear, with the game's numbers, and its wind. The game works in pixels with
// y up; a fighter is about 250 px tall. scaled(preset, unitsPerPx) converts a preset to your units (for metres on a
// 1.75 m character: unitsPerPx = 0.007, which turns the game's 1500 px/s^2 sash gravity into 10.5 m/s^2).

/**
 * @typedef {{ n: number, seg: number, grav: number, drag: number, stiff: number, w0: number, w1: number, tip: number,
 *   rest: [number, number], wind: number, note: string }} ChainPreset
 * n nodes, seg link length (px), grav px/s^2, drag kept per 1/60 s, stiff pull to rest, w0/w1 half-widths at pin and
 * tip (px), tip pointed end length (px), rest direction (x is multiplied by facing: -1 = trails behind), wind multiplier.
 */

/** @type {Record<string, ChainPreset>} */
export const PRESETS = {
  sash: { n: 5, seg: 13, grav: 1500, drag: 0.9, stiff: 0, w0: 4.6, w1: 2.2, tip: 6, rest: [-0.5, -0.86], wind: 0.5, note: 'a sash end at the back of the waist: heavy, swings' },
  sashShort: { n: 4, seg: 12, grav: 1500, drag: 0.9, stiff: 0, w0: 4.2, w1: 2, tip: 5, rest: [-0.3, -0.95], wind: 0.5, note: 'the second, shorter sash end' },
  ponytail: { n: 7, seg: 13, grav: 1300, drag: 0.9, stiff: 260, w0: 8.5, w1: 2.2, tip: 10, rest: [-0.8, -0.6], wind: 0.6, note: 'thick, keeps some shape' },
  headbandRibbon: { n: 7, seg: 13, grav: 520, drag: 0.84, stiff: 0, w0: 2.6, w1: 1.3, tip: 6, rest: [-0.95, -0.3], wind: 1.3, note: 'long headband ribbon: light, it floats' },
  headbandRibbon2: { n: 6, seg: 13, grav: 560, drag: 0.85, stiff: 0, w0: 2.4, w1: 1.2, tip: 6, rest: [-0.9, -0.44], wind: 1.3, note: 'its shorter twin' },
  spearRibbon: { n: 5, seg: 9, grav: 900, drag: 0.86, stiff: 0, w0: 2.6, w1: 1.2, tip: 5, rest: [0, -1], wind: 1, note: 'a ribbon tied under a spear head' },
  scarf: { n: 9, seg: 15, grav: 560, drag: 0.87, stiff: 46, w0: 9.5, w1: 3.4, tip: 14, rest: [-0.86, -0.5], wind: 1.5, note: 'a long scarf tail down the back' },
  scarf2: { n: 8, seg: 15, grav: 600, drag: 0.86, stiff: 40, w0: 7.5, w1: 2.6, tip: 12, rest: [-0.74, -0.67], wind: 1.5, note: 'the second scarf tail' },
  sleeve: { n: 2, seg: 30, grav: 2200, drag: 0.86, stiff: 0, w0: 0, w1: 0, tip: 0, rest: [-0.25, -0.97], wind: 0.3, note: 'a wide hanging sleeve corner (one link; read node 1 to bend the sleeve shape). 18 for a short sleeve' },
  hem: { n: 2, seg: 14, grav: 2000, drag: 0.84, stiff: 0, w0: 0, w1: 0, tip: 0, rest: [0, -1], wind: 0, note: 'a skirt or trouser hem corner (one link; how far it hangs behind)' },
};

/**
 * The game's wind at time t (seconds): two slow gusts sideways plus a gentle lift, pushing against the facing.
 * Multiply by a preset's `wind`. Returns [wx, wy] in px/s^2 (scale like gravity for other units).
 * @param {number} t
 * @param {number} [facing] 1 = facing +x, -1 = facing -x
 */
export function gameWind(t, facing = 1) {
  const gust = Math.sin(t * 1.3) * 0.6 + Math.sin(t * 3.1 + 1) * 0.4;
  return [gust * 190 - facing * 60, Math.sin(t * 2.2) * 120 + 60];
}

/** A copy of a preset with lengths, widths and accelerations multiplied by unitsPerPx (drag, stiff unchanged). */
export function scaled(p, unitsPerPx) {
  return { ...p, seg: p.seg * unitsPerPx, grav: p.grav * unitsPerPx, w0: p.w0 * unitsPerPx, w1: p.w1 * unitsPerPx, tip: p.tip * unitsPerPx, rest: [...p.rest] };
}
