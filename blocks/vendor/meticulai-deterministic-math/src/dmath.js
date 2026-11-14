// Deterministic math for simulations (from Trick Shot by Meticulai, meticulai.com). Math.sin, cos, atan2, exp, log
// and pow are not guaranteed to give the same last bit in every JavaScript engine (V8 and JavaScriptCore differ), so
// a simulation that is re-run in someone else's browser (a share link, a replay, a server check) can drift. These
// versions use only +, -, *, / and Math.sqrt, which IEEE 754 makes exact to the last bit everywhere, so the same
// inputs come out identical in Safari, Chrome, Firefox and Node.
//
// Ported from fdlibm / musl, with the range reduction simplified to the always-precise three-step Cody-Waite path
// (accurate for |x| < about 1e6; simulations never need more).
//
// fdlibm notice, preserved as its licence requires:
//   Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
//   Developed at SunPro, a Sun Microsystems, Inc. business.
//   Permission to use, copy, modify, and distribute this software is freely granted, provided that this notice
//   is preserved.
// musl libc (whose C ports of fdlibm this follows) is MIT-licensed: Copyright (c) 2005-2020 Rich Felker, et al.
//
// Simulation modules import it in place of the global: `import { DMath as Math } from './dmath.js';`

const buf = new DataView(new ArrayBuffer(8));
const hiWord = (x) => {
  buf.setFloat64(0, x);
  return buf.getUint32(0) | 0;
};
const withHi = (x, hi) => {
  buf.setFloat64(0, x);
  buf.setUint32(0, hi >>> 0);
  return buf.getFloat64(0);
};
// 2^k for an integer k in the normal range, exactly.
const pow2 = (k) => {
  buf.setUint32(0, ((k + 1023) << 20) >>> 0);
  buf.setUint32(4, 0);
  return buf.getFloat64(0);
};

// ---------------------------------------------------------------- sin / cos

const S1 = -1.66666666666666324348e-1, S2 = 8.33333333332248946124e-3, S3 = -1.98412698298579493134e-4,
  S4 = 2.75573137070700676789e-6, S5 = -2.50507602534068634195e-8, S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-2, C2 = -1.38888888888741095749e-3, C3 = 2.48015872894767294178e-5,
  C4 = -2.75573143513906633035e-7, C5 = 2.08757232129817482790e-9, C6 = -1.13596475577881948265e-11;

function kSin(x, y, iy) {
  const z = x * x, w = z * z;
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
  const v = z * x;
  if (iy === 0) return x + v * (S1 + z * r);
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}

function kCos(x, y) {
  const z = x * x;
  let w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z;
  w = 1 - hz;
  return w + (((1 - w) - hz) + (z * r - x * y));
}

const INVPIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417;
const PIO2_2 = 6.07710050630396597660e-11, PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.02226624871116645580e-21, PIO2_3T = 8.47842766036889956997e-32;
const red = [0, 0];

// x = n * pi/2 + (red[0] + red[1]); returns n.
function remPio2(x) {
  const fn = Math.floor(x * INVPIO2 + 0.5);
  let r = x - fn * PIO2_1;
  let t = r;
  let w = fn * PIO2_2;
  r = t - w;
  w = fn * PIO2_2T - ((t - r) - w);
  t = r;
  w = fn * PIO2_3;
  r = t - w;
  w = fn * PIO2_3T - ((t - r) - w);
  const y0 = r - w;
  red[0] = y0;
  red[1] = (r - y0) - w;
  return fn;
}

function sin(x) {
  if (!(x === x) || x === Infinity || x === -Infinity) return NaN;
  const ax = x < 0 ? -x : x;
  if (ax < 0.7853981633974483) return ax < 7.450580596923828e-9 ? x : kSin(x, 0, 0);
  const n = remPio2(x) & 3;
  if (n === 0) return kSin(red[0], red[1], 1);
  if (n === 1) return kCos(red[0], red[1]);
  if (n === 2) return -kSin(red[0], red[1], 1);
  return -kCos(red[0], red[1]);
}

function cos(x) {
  if (!(x === x) || x === Infinity || x === -Infinity) return NaN;
  const ax = x < 0 ? -x : x;
  if (ax < 0.7853981633974483) return ax < 7.450580596923828e-9 ? 1 : kCos(x, 0);
  const n = remPio2(x) & 3;
  if (n === 0) return kCos(red[0], red[1]);
  if (n === 1) return -kSin(red[0], red[1], 1);
  if (n === 2) return -kCos(red[0], red[1]);
  return kSin(red[0], red[1], 1);
}

function tan(x) {
  return sin(x) / cos(x);
}

// ---------------------------------------------------------------- atan / atan2

const ATANHI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.57079632679489655800];
const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.11111104054623557880e-1,
  9.09088713343650656196e-2, -7.69187620504482999495e-2, 6.66107313738753120669e-2, -5.83357013379057348645e-2,
  4.97687799461593236017e-2, -3.65315727442169155270e-2, 1.62858201153657823623e-2,
];

function atan(x0) {
  if (!(x0 === x0)) return NaN;
  const neg = x0 < 0;
  let x = neg ? -x0 : x0;
  let id;
  if (x >= 7.378697629483821e19) return neg ? -(ATANHI[3] + ATANLO[3]) : ATANHI[3] + ATANLO[3];
  if (x < 0.4375) {
    if (x < 3.725290298461914e-9) return x0;
    id = -1;
  } else if (x < 1.1875) {
    if (x < 0.6875) {
      id = 0;
      x = (2 * x - 1) / (2 + x);
    } else {
      id = 1;
      x = (x - 1) / (x + 1);
    }
  } else if (x < 2.4375) {
    id = 2;
    x = (x - 1.5) / (1 + 1.5 * x);
  } else {
    id = 3;
    x = -1 / x;
  }
  const z = x * x, w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) {
    const r = x - x * (s1 + s2);
    return neg ? -r : r;
  }
  const r = ATANHI[id] - ((x * (s1 + s2) - ATANLO[id]) - x);
  return neg ? -r : r;
}

const PI = 3.1415926535897931160, PI_LO = 1.2246467991473531772e-16;

function atan2(y, x) {
  if (!(x === x) || !(y === y)) return NaN;
  if (x === 1) return atan(y);
  const yneg = y < 0 || Object.is(y, -0);
  const xneg = x < 0 || Object.is(x, -0);
  if (y === 0) return xneg ? (yneg ? -PI : PI) : y;
  if (x === 0) return yneg ? -PI / 2 : PI / 2;
  if (x === Infinity || x === -Infinity) {
    if (y === Infinity || y === -Infinity) {
      const a = xneg ? (3 * PI) / 4 : PI / 4;
      return yneg ? -a : a;
    }
    return xneg ? (yneg ? -PI : PI) : yneg ? -0 : 0;
  }
  if (y === Infinity || y === -Infinity) return yneg ? -PI / 2 : PI / 2;
  const ay = yneg ? -y : y, ax = xneg ? -x : x;
  const q = ay / ax;
  let z;
  if (q > 1.152921504606847e18) z = PI / 2 + 0.5 * PI_LO;
  else if (xneg && q < 8.673617379884035e-19) z = 0;
  else z = atan(q);
  if (!xneg) return yneg ? -z : z;
  return yneg ? (z - PI_LO) - PI : PI - (z - PI_LO);
}

function asin(x) {
  if (x > 1 || x < -1) return NaN;
  return atan2(x, Math.sqrt(1 - x * x));
}

function acos(x) {
  if (x > 1 || x < -1) return NaN;
  return atan2(Math.sqrt(1 - x * x), x);
}

// ---------------------------------------------------------------- exp / log / pow

const LN2_HI = 6.93147180369123816490e-1, LN2_LO = 1.90821492927058770002e-10, INVLN2 = 1.44269504088896338700;
const P1 = 1.66666666666666019037e-1, P2 = -2.77777777770155933842e-3, P3 = 6.61375632143793436117e-5,
  P4 = -1.65339022054652515390e-6, P5 = 4.13813679705723846039e-8;

function exp(x) {
  if (!(x === x)) return NaN;
  if (x > 709.78) return Infinity;
  if (x < -708.39) return 0;
  const ax = x < 0 ? -x : x;
  let hi = x, lo = 0, k = 0;
  if (ax > 0.34657359027997264) {
    k = Math.trunc(INVLN2 * x + (x < 0 ? -0.5 : 0.5));
    hi = x - k * LN2_HI;
    lo = k * LN2_LO;
    x = hi - lo;
  } else if (ax < 3.725290298461914e-9) return 1 + x;
  const xx = x * x;
  const c = x - xx * (P1 + xx * (P2 + xx * (P3 + xx * (P4 + xx * P5))));
  const y = 1 + ((x * c) / (2 - c) - lo + hi);
  return k === 0 ? y : y * pow2(k);
}

const LG1 = 6.666666666666735130e-1, LG2 = 3.999999999940941908e-1, LG3 = 2.857142874366239149e-1,
  LG4 = 2.222219843214978396e-1, LG5 = 1.818357216161805012e-1, LG6 = 1.531383769920937332e-1,
  LG7 = 1.479819860511658591e-1;

function log(x) {
  if (!(x === x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let k = 0;
  if (x < 2.2250738585072014e-308) {
    k -= 54;
    x *= 18014398509481984;
  }
  let hx = hiWord(x);
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  const i = (hx + 0x95f64) & 0x100000;
  x = withHi(x, hx | (i ^ 0x3ff00000));
  k += i >> 20;
  const f = x - 1;
  const hfsq = 0.5 * f * f;
  const s = f / (2 + f);
  const z = s * s, w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const R = t2 + t1;
  return s * (hfsq + R) + k * LN2_LO - hfsq + f + k * LN2_HI;
}

function pow(x, y) {
  if (y === 0) return 1;
  if (!(x === x) || !(y === y)) return NaN;
  if (y === 1) return x;
  if (y === 2) return x * x;
  if (y === 0.5 && x >= 0) return Math.sqrt(x);
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x < 0) {
    if (Math.floor(y) !== y) return NaN;
    const r = exp(y * log(-x));
    return y % 2 === 0 ? r : -r;
  }
  return exp(y * log(x));
}

function hypot(...a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s);
}

export const DMath = Object.freeze({
  PI: Math.PI, E: Math.E, SQRT2: Math.SQRT2, SQRT1_2: Math.SQRT1_2, LN2: Math.LN2, LN10: Math.LN10,
  abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc, sign: Math.sign,
  min: Math.min, max: Math.max, sqrt: Math.sqrt, imul: Math.imul, fround: Math.fround, clz32: Math.clz32,
  // NOT deterministic: the built-in Math.random, kept so a stray call doesn't crash. Simulations must use a seeded
  // generator instead (see mulberry32 in check.js).
  random: Math.random,
  sin, cos, tan, atan, atan2, asin, acos, exp, log, pow, hypot,
});
