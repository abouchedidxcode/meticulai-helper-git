/**
 * Easing curves: u in [0,1] -> [0,1] (back/elastic may overshoot). All satisfy f(0)=0, f(1)=1.
 * Names follow the common easings.net vocabulary so authoring reads naturally.
 */

/** @typedef {(u: number) => number} EaseFn */
/** @typedef {keyof typeof easings} EaseName */

const PI = Math.PI;
const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;

export const easings = {
  linear: (u) => u,
  inQuad: (u) => u * u,
  outQuad: (u) => 1 - (1 - u) * (1 - u),
  inOutQuad: (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2),
  inCubic: (u) => u * u * u,
  outCubic: (u) => 1 - Math.pow(1 - u, 3),
  inOutCubic: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  inQuart: (u) => u * u * u * u,
  outQuart: (u) => 1 - Math.pow(1 - u, 4),
  inOutQuart: (u) => (u < 0.5 ? 8 * u ** 4 : 1 - Math.pow(-2 * u + 2, 4) / 2),
  inSine: (u) => 1 - Math.cos((u * PI) / 2),
  outSine: (u) => Math.sin((u * PI) / 2),
  inOutSine: (u) => -(Math.cos(PI * u) - 1) / 2,
  inExpo: (u) => (u === 0 ? 0 : Math.pow(2, 10 * u - 10)),
  outExpo: (u) => (u === 1 ? 1 : 1 - Math.pow(2, -10 * u)),
  inBack: (u) => c3 * u * u * u - c1 * u * u,
  outBack: (u) => 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2),
  inOutBack: (u) =>
    u < 0.5
      ? (Math.pow(2 * u, 2) * ((c2 + 1) * 2 * u - c2)) / 2
      : (Math.pow(2 * u - 2, 2) * ((c2 + 1) * (u * 2 - 2) + c2) + 2) / 2,
  outElastic: (u) =>
    u === 0 ? 0 : u === 1 ? 1 : Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * ((2 * PI) / 3)) + 1,
  smoothstep: (u) => u * u * (3 - 2 * u),
  smootherstep: (u) => u * u * u * (u * (u * 6 - 15) + 10),
};

/**
 * CSS-style cubic-bezier easing (x1,y1,x2,y2), solved with Newton iterations + bisection fallback.
 * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 @returns {EaseFn}
 */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (u) => {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    let t = u;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - u;
      if (Math.abs(e) < 1e-6) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = u;
    for (let i = 0; i < 30; i++) {
      const x = sx(t);
      if (Math.abs(x - u) < 1e-6) break;
      if (x < u) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

/** @param {EaseName | EaseFn} e @returns {EaseFn} */
export function getEase(e) {
  return typeof e === 'function' ? e : easings[e];
}

/** Evaluate an easing by name or function, clamping u to [0,1]. @param {EaseName | EaseFn} e @param {number} u */
export function ease(e, u) {
  return getEase(e)(u <= 0 ? 0 : u >= 1 ? 1 : u);
}
