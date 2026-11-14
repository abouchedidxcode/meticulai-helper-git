// The numbers and the pure logic behind the tilt-shift macro lens (no three.js import, so it runs in node tests).
// Every value here is exactly what Lost Marbles shipped with; the lens (lens.js) reads them as defaults.

/**
 * @typedef {{ max: number, step: number, half?: boolean }} DofPreset
 *   max: largest blur in px at 1080p. step: spiral step (bigger = fewer taps, about max^2 / (2 step)).
 *   half: blur at half resolution and blend it over the sharp frame by focus (a quarter of the cost).
 * @typedef {{ pixelRatio: number, shadow: number, shadowSpan: number, shadowEvery?: number, msaa: number,
 *   ao: boolean, dof: DofPreset | null, bloom: boolean }} QualityPreset
 */

/** Quality presets. high: GTAO + full-res bokeh + bloom. medium: no AO, half-res bokeh. low: no MSAA, no bloom,
 *  smaller bokeh, the sun's shadow map redrawn every 2nd frame. shadowSpan is the game's own shadow box size (its
 *  world units); the lens does not apply it (see HOW-TO-USE.md).
 *  @type {Record<'high'|'medium'|'low', QualityPreset>} */
export const QUALITY = {
  high: { pixelRatio: 1.5, shadow: 4096, shadowSpan: 50, msaa: 4, ao: true, dof: { max: 16, step: 2.2 }, bloom: true },
  medium: { pixelRatio: 1.25, shadow: 2048, shadowSpan: 50, msaa: 4, ao: false, dof: { max: 15, step: 2.4, half: true }, bloom: true },
  low: { pixelRatio: 1, shadow: 1024, shadowSpan: 42, shadowEvery: 2, msaa: 0, ao: false, dof: { max: 10, step: 2.8, half: true }, bloom: false },
};

/** The player's tilt-shift setting (multiplies the band's blur). */
export const TILT_PREF = { off: 0, on: 1, strong: 1.35 };

/** Lowest dynamic-resolution scale (of the preset's pixel ratio). */
export const RES_MIN = 0.65;

/** All tunable lens numbers. Pass any of them to `new TiltShiftLens(..., { ... })` to override. */
export const LENS_DEFAULTS = {
  // depth of field
  aperturePx: 125, // circle of confusion = aperturePx * aperture * |1/focus - 1/z| (px at 1080p)
  fgK: 0.45, // foreground blur relative to background (walls brushing the lens don't smear the view)
  catEye: 0.55, // how much the bokeh discs are clipped into cat's eyes toward the corners
  tiltPx: 11, // tilt band blur in px at 1080p for amount 1 (capped at the preset's max)
  // easing ("a focus puller", "a lens being adjusted")
  focusEase: 6, // 1/s
  tiltEase: 5, // 1/s for band position, width and roll
  amountEase: 2.5, // 1/s for the band's strength
  snapJump: 0.5, // a band jump bigger than this (NDC, a camera cut) snaps instead of sweeping
  // ambient occlusion (GTAOPass, high only), at half resolution
  ao: { radius: 1.4, distanceExponent: 1.4, thickness: 1.5, scale: 1.15, samples: 16, distanceFallOff: 1, screenSpaceRadius: false },
  aoDenoise: { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 },
  aoBlend: 0.9,
  // bloom (UnrealBloomPass at half resolution): restrained, only light brighter than the threshold blooms
  bloom: { strength: 0.12, radius: 0.5, threshold: 2.2, nightThreshold: 4 },
  // grade
  exposure: 1.0,
  whiteBalance: [1.04, 1.0, 0.95], // warm afternoon, before the AgX film curve
  nightBalance: [0.98, 1.0, 1.02], // near neutral at night
  nightSaturation: 0.87,
  saturation: 1.12, // AgX is neutral by design: a touch of saturation back
  saturationMini: 0.1, // + this much more at full miniature (follows the tilt amount)
  curve: 0.32, // gentle S-curve mix
  curveMini: 0.1,
  vignette: 0.55,
  vignetteNight: 0.7,
  grain: 0.032,
  grainLow: 0.02,
  fringe: 0.006, // lateral chromatic aberration toward the frame edges
  flashDecay: 2.5, // flash() fades at this rate per second
  flashGain: 0.6,
};

/**
 * Tilt band settings for different kinds of shot, as Lost Marbles used them. `core` may be a function of the
 * subject's projected size in NDC (subject radius / (distance * tan(fov/2))).
 * Use: lens.setTiltShift(bandY, core, amount, { roll, up, down }).
 */
export const TILT_SHOTS = {
  // slow high orbit before a race: the full miniature
  establishing: { core: 0.11, amount: 1.6, roll: 0.1, up: 0.7, down: 0.5, aperture: 0.3 },
  // fly-overs between stages (roll swings 0.14 * sin(t * 0.35))
  flyover: { core: 0.12, amount: 1.55, roll: 0.14, up: 0.75, down: 0.55, aperture: 0.25 },
  podium: { core: 0.16, amount: 1.5, roll: -0.06, up: 0.6, down: 0.45, aperture: 0.55 },
  // playing, following the subject: a band wide enough to read the way ahead
  play: { core: (s) => s * 1.5 + 0.06, amount: 1, roll: 0, up: 0.9, down: 0.5, aperture: 1 },
  // looking down into a crowd: wide band so the rivals stay crisp
  crowd: { core: (s) => s * 1.5 + 0.22, amount: 0.85, roll: 0, up: 0.8, down: 0.7, aperture: 1 },
  // cut-scenes and menus behind UI
  cut: { core: (s) => s * 1.6 + 0.04, amount: 1.45, roll: 0, up: 0.6, down: 0.4, aperture: 1 },
  attract: { core: (s) => s * 1.5 + 0.05, amount: 1.55, roll: 0.12, up: 0.6, down: 0.42, aperture: 1 },
  // "diorama camera": far back on a long lens; a shallow real depth of field does the miniature, the band only
  // softens the top and bottom of the frame. Focus a little ahead of the subject.
  diorama: { core: 0.55, amount: 0.5, roll: 0, up: 0.9, down: 0.5, aperture: 10.5, fgK: 1 },
  // a product shot of one object, band turned vertical
  showroom: { core: 0.32, amount: 1.3, roll: Math.PI / 2, up: 0.7, down: 0.7, aperture: 0.5 },
};

/** Resolve a TILT_SHOTS entry's core for a subject of projected size `subjectNdc`. */
export function shotCore(shot, subjectNdc = 0) {
  return typeof shot.core === 'function' ? shot.core(subjectNdc) : shot.core;
}

/** Smoothstep, as in GLSL. */
function smooth01(t) {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
}

/**
 * The band's blur (px) at a screen position, mirroring the shader's tiltCoc(). uv in 0..1.
 * @param {number} u @param {number} v
 * @param {{ y: number, core: number, blurPx: number, roll: number, up: number, down: number }} band
 * @param {number} aspect width / height
 */
export function tiltCoc(u, v, band, aspect) {
  const px = u * 2 - 1, py = v * 2 - 1;
  const d = (py - band.y) * Math.cos(band.roll) - px * aspect * Math.sin(band.roll);
  const t = d > 0 ? (d - band.core) / band.up : (-d - band.core) / band.down;
  return band.blurPx * smooth01(t);
}

/**
 * Circle of confusion (px) for a pixel at view depth z, mirroring the shader's coc().
 * @param {number} z @param {number} focus @param {number} aperturePx already scaled by aperture and resolution
 * @param {number} fgK @param {number} tilt the tiltCoc() value at this pixel @param {number} maxBlur
 */
export function coc(z, focus, aperturePx, fgK, tilt, maxBlur) {
  const k = z < focus ? fgK : 1;
  const c = aperturePx * k * Math.abs(1 / focus - 1 / z);
  return Math.min(maxBlur, Math.max(0, Math.max(c, tilt)));
}

/**
 * The per-frame depth-of-field numbers for a drawing buffer `heightPx` tall. Blur scales with resolution so the
 * look is the same at any size.
 */
export function dofNumbers(dof, heightPx, aperture, tiltAmount, opts = LENS_DEFAULTS) {
  const px = heightPx / 1080;
  const radScale = dof.step * Math.max(1, px);
  return {
    maxBlur: dof.max * px,
    aperturePx: opts.aperturePx * aperture * px,
    radScale,
    // each tap covers about 2*pi*step square pixels of the disc: read the mip whose texel matches that spacing
    lod: Math.max(0, Math.log2(Math.sqrt(2 * Math.PI * radScale)) - 0.5),
    tiltPx: Math.min(dof.max, opts.tiltPx * tiltAmount) * px,
  };
}

/** A fresh lens state: current and target focus and band. */
export function createLensState() {
  return {
    focus: 10, focusTarget: 10, aperture: 1, fgK: LENS_DEFAULTS.fgK,
    y: -0.2, core: 0.2, amt: 0, roll: 0, yT: -0.2, coreT: 0.2, amtT: 0, rollT: 0, up: 0.85, down: 0.5,
  };
}

/** Ease the lens toward its targets over dt seconds (mutates and returns s). pref: the TILT_PREF multiplier. */
export function easeLens(s, dt, pref = 1, opts = LENS_DEFAULTS) {
  s.focus += (s.focusTarget - s.focus) * (1 - Math.exp(-dt * opts.focusEase));
  const kt = 1 - Math.exp(-dt * opts.tiltEase);
  if (Math.abs(s.yT - s.y) > opts.snapJump) s.y = s.yT;
  s.y += (s.yT - s.y) * kt;
  s.core += (s.coreT - s.core) * kt;
  s.amt += (s.amtT * pref - s.amt) * (1 - Math.exp(-dt * opts.amountEase));
  s.roll += (s.rollT - s.roll) * kt;
  return s;
}

/** Snap the lens straight to its targets (first frame, screenshots). */
export function settleLens(s, pref = 1) {
  s.focus = s.focusTarget;
  s.y = s.yT; s.core = s.coreT; s.amt = s.amtT * pref; s.roll = s.rollT;
  return s;
}

/**
 * Dynamic resolution and automatic quality. Feed it every frame's dt; it answers with what to change:
 *   null | { type: 'res', scale } | { type: 'quality', quality, scale } | { type: 'slow' }
 * When frames run long it renders fewer pixels (x0.87 per step, down to RES_MIN), then drops a whole preset,
 * and once there is nothing left it reports 'slow' (twice in a row, once) so the game may lock to 30 fps.
 * It creeps back up when there is headroom, waiting longer each time it had to step down.
 */
export function createPerfGovernor({ quality = 'high', frameBudget = 1 / 60, autoQuality = true, adaptive = true, now = 0, resMin = RES_MIN } = {}) {
  const g = {
    quality, resScale: 1, frameBudget, autoQuality, adaptive, resMin,
    frameTimes: [], lastResChange: now, lastDowngrade: now, upWait: 4000, slowStrikes: 0, slowReported: false,
    /** @param {number} dt seconds @param {number} t ms (performance.now()) */
    tick(dt, t) {
      if (!g.adaptive) return null;
      const ft = g.frameTimes;
      ft.push(Math.min(dt, 0.1));
      if (ft.length > 90) ft.shift();
      if (ft.length < 90 || t - g.lastResChange < 1500) return null;
      // Ignore the slowest tenth (shader compiles, uploads, tab switches): they are hitches, not load.
      const sorted = ft.slice().sort((a, b) => a - b);
      let sum = 0;
      for (let i = 0; i < 81; i++) sum += sorted[i];
      const avg = sum / 81;
      const B = g.frameBudget;
      if (avg <= B * 1.33) g.slowStrikes = 0;
      if (avg > B * 1.2) {
        if (g.resScale > g.resMin + 0.01) {
          g.upWait = Math.min(30000, g.upWait * 2);
          return g.setRes(Math.max(g.resMin, g.resScale * 0.87), t);
        }
        if (g.autoQuality && g.quality !== 'low' && t - g.lastDowngrade > 8000) {
          g.quality = g.quality === 'high' ? 'medium' : 'low';
          g.lastDowngrade = t;
          g.resScale = 0.87;
          g.lastResChange = t;
          ft.length = 0;
          return { type: 'quality', quality: g.quality, scale: g.resScale };
        }
        if (!g.slowReported && (g.quality === 'low' || !g.autoQuality) && avg > B * 1.33) {
          g.lastResChange = t;
          if (++g.slowStrikes >= 2) {
            g.slowReported = true;
            return { type: 'slow' };
          }
        }
        return null;
      }
      if (avg < B * 1.05 && g.resScale < 1 && t - g.lastResChange > g.upWait) {
        g.upWait = Math.max(4000, g.upWait / 2);
        return g.setRes(Math.min(1, g.resScale / 0.87), t);
      }
      return null;
    },
    setRes(scale, t) {
      g.resScale = scale;
      g.lastResChange = t;
      ft0();
      return { type: 'res', scale };
    },
    /** The frame time to aim for (1/30 when capped at 30 fps). adapt false holds the resolution where it is. */
    setFrameBudget(seconds, adapt = true, t = 0) {
      if (seconds !== g.frameBudget || adapt !== g.adaptive) {
        g.frameBudget = seconds;
        g.adaptive = adapt;
        g.frameTimes.length = 0;
        g.lastResChange = t;
      }
    },
  };
  function ft0() {
    g.frameTimes.length = 0;
  }
  return g;
}
