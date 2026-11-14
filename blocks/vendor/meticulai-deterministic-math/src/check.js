// A self-check: the exact bits DMath must return for 97 inputs (computed in Node with this file). Any engine that
// gives a different bit for any of them would make re-run simulations drift. Run selfCheck() once in a new browser
// or a test, not every frame.
import { DMath } from './dmath.js';

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

/** The 16 hex digits of a number's IEEE 754 bits (big-endian), e.g. bitsHex(1) === '3ff0000000000000'. */
export function bitsHex(x) {
  f64[0] = x;
  return u32[1].toString(16).padStart(8, '0') + u32[0].toString(16).padStart(8, '0');
}

/** [function name, ...arguments, expected bits] */
export const GOLDEN = [
  ["sin", 0.1, "3fb98eaecb8bcb2c"],
  ["sin", 0.5, "3fdeaee8744b05f0"],
  ["sin", 1, "3feaed548f090cee"],
  ["sin", 1.5707963267948966, "3ff0000000000000"],
  ["sin", 2.5, "3fe326af0dcfcab0"],
  ["sin", -3, "bfc210386db6d55b"],
  ["sin", 3.141592653589793, "3ca1a62633145c07"],
  ["sin", 10, "bfe1689ef5f34f53"],
  ["sin", -77.7, "bfe7d31cb31f6496"],
  ["sin", 100.5, "bf9fb3f833470ff1"],
  ["sin", 1234.5678, "3fb3fa00084ee3dd"],
  ["sin", 100000.3, "bfd0b728e269eb36"],
  ["cos", 0.1, "3fefd712f9a817c1"],
  ["cos", 0.5, "3fec1528065b7d50"],
  ["cos", 1, "3fe14a280fb5068c"],
  ["cos", 1.5707963267948966, "3c91a62633145c07"],
  ["cos", 2.5, "bfe9a2f7ef858b7d"],
  ["cos", -3, "bfefae04be85e5d2"],
  ["cos", 3.141592653589793, "bff0000000000000"],
  ["cos", 10, "bfead9ac890c6b1f"],
  ["cos", -77.7, "bfe55cf9c92e02cb"],
  ["cos", 100.5, "3feffc12adaecec2"],
  ["cos", 1234.5678, "bfefe7053dc31387"],
  ["cos", 100000.3, "bfeee3a88fbcbcb0"],
  ["tan", 0.1, "3fb9af8877430b7f"],
  ["tan", 0.5, "3fe17b4f5bf3474a"],
  ["tan", 1, "3ff8eb245cbee3a5"],
  ["tan", 1.5707963267948966, "434d02967c31cdb5"],
  ["tan", 2.5, "bfe7e79b4e00bb14"],
  ["tan", -3, "3fc23ef71254b86f"],
  ["tan", 3.141592653589793, "bca1a62633145c07"],
  ["tan", 10, "3fe4bf5f34be3783"],
  ["tan", -77.7, "3ff1d7f11e46b836"],
  ["tan", 100.5, "bf9fb7dcab49130c"],
  ["tan", 1234.5678, "bfb409a448794f2a"],
  ["tan", 100000.3, "3fd151075483eb83"],
  ["atan", 0.1, "3fb983e282e2cc4d"],
  ["atan", 0.5, "3fddac670561bb4f"],
  ["atan", 1, "3fe921fb54442d18"],
  ["atan", 1.5707963267948966, "3ff00fe987ed02ff"],
  ["atan", 2.5, "3ff30b6d796a4da8"],
  ["atan", -3, "bff3fc176b7a8560"],
  ["atan", 3.141592653589793, "3ff433b8a322ddd2"],
  ["atan", 10, "3ff789bd2c160054"],
  ["atan", -77.7, "bff8ed44e3384d23"],
  ["atan", 100.5, "3ff8f93a14d937bd"],
  ["atan", 1234.5678, "3ff91ea9fb93a10c"],
  ["atan", 100000.3, "3ff921f0d7eb786c"],
  ["asin", -1, "bff921fb54442d18"],
  ["acos", -1, "400921fb54442d18"],
  ["asin", -0.75, "bfeb235315c680dc"],
  ["acos", -0.75, "400359d26f93b6c3"],
  ["asin", -0.3, "bfd380159e14f6ff"],
  ["acos", -0.3, "3ffe0200bbc96ad9"],
  ["asin", 0, "0000000000000000"],
  ["acos", 0, "3ff921fb54442d18"],
  ["asin", 0.2, "3fc9c618aa4ae23e"],
  ["acos", 0.2, "3ff5e9383efad0d0"],
  ["asin", 0.5, "3fe0c152382d7366"],
  ["acos", 0.5, "3ff0c152382d7365"],
  ["asin", 0.99, "3ff6de3c6f33d51d"],
  ["acos", 0.99, "3fc21df72882bfd9"],
  ["atan2", 1, 1, "3fe921fb54442d18"],
  ["atan2", 1, -1, "4002d97c7f3321d2"],
  ["atan2", -1, -1, "c002d97c7f3321d2"],
  ["atan2", -1, 1, "bfe921fb54442d18"],
  ["atan2", 0.3, 2, "3fc30ed367d7cd04"],
  ["atan2", 5, -0.01, "3ff92a2c7a76658c"],
  ["atan2", -2, 1e-9, "bff921fb5421d100"],
  ["atan2", 3, 4, "3fe4978fa3269ee1"],
  ["exp", -20, "3e21b48655f37267"],
  ["exp", -5, "3f7b993fe00d5376"],
  ["exp", -0.3, "3fe7b4c869c37c05"],
  ["exp", 0.001, "3ff0041919b7ee34"],
  ["exp", 0.3, "3ff599058c8c1a96"],
  ["exp", 1, "4005bf0a8b14576a"],
  ["exp", 2.5, "40285d6fd931e0bb"],
  ["exp", 20, "41bceb088b68e804"],
  ["exp", 300, "5afc05c0a7166b4a"],
  ["log", 1e-10, "c037069e2aa2aa5b"],
  ["log", 0.001, "c01ba18a998fffa0"],
  ["log", 0.5, "bfe62e42fefa39ef"],
  ["log", 0.9999, "bf1a3738d2cf1cc2"],
  ["log", 2, "3fe62e42fefa39ef"],
  ["log", 10, "40026bb1bbb55516"],
  ["log", 12345.678, "4022d79559791e31"],
  ["log", 10000000000, "4037069e2aa2aa5b"],
  ["pow", 2, 0.3, "3ff3b2c47bff8329"],
  ["pow", 0.5, 1.25, "3fdae89f995ad3ae"],
  ["pow", 10, -2.5, "3f69e7c6e43390b0"],
  ["pow", 1.0001, 10000, "4005bec34aabbfd3"],
  ["pow", 3.7, 3.3, "4052c00c85eccee6"],
  ["pow", -2, 3, "c01ffffffffffffe"],
  ["pow", 7, 0.5, "40052a7fa9d2f8ea"],
  ["hypot", 3, 4, "4014000000000000"],
  ["hypot", 1, 2, 3, "400deeea11683f49"],
  ["hypot", 0.1, 0.2, "3fcc9f25c5bfedda"],
];

/**
 * Re-computes every GOLDEN case with `M` (DMath by default) and lists the ones whose bits differ.
 * @param {object} [M]
 * @returns {{ total: number, failed: Array<{ fn: string, args: number[], expected: string, got: string }> }}
 */
export function selfCheck(M = DMath) {
  const failed = [];
  for (const c of GOLDEN) {
    const fn = c[0], args = c.slice(1, -1), expected = c[c.length - 1];
    const got = bitsHex(M[fn](...args));
    if (got !== expected) failed.push({ fn, args, expected, got });
  }
  return { total: GOLDEN.length, failed };
}

/** mulberry32: a tiny seeded random generator (public domain). Use it instead of Math.random in a simulation. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
