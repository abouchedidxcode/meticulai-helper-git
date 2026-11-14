// Seeded random numbers. Use `rng` everywhere instead of Math.random, so ?seed=42 gives
// the same game every time (bots, recordings and bug reports depend on it).
//
//   import { rng } from './core/random.js';
//   rng.next()          // 0 <= x < 1
//   rng.range(2, 5)     // 2 <= x < 5
//   rng.int(1, 6)       // 1..6 inclusive
//   rng.pick(['a','b']) // one item
//   rng.chance(0.25)    // true 25% of the time
//   rng.reset()         // back to the start of the sequence (called on every restart)
//
// Need an independent stream (e.g. for decoration that must not shift gameplay)?
//   const decor = createRandom(rng.seed + 1);

import { flags } from './hooks.js';

// mulberry32: small, fast, good enough for games. Returns a function giving 0 <= x < 1.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRandom(seed) {
  let next = mulberry32(seed);
  const r = {
    seed,
    next: () => next(),
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
    reset(newSeed = r.seed) {
      r.seed = newSeed >>> 0;
      next = mulberry32(r.seed);
    },
  };
  return r;
}

export const rng = createRandom(flags.seed);
