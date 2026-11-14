/**
 * Pure rules: no three.js, no DOM. Everything here is unit-tested (test/rules.test.mjs).
 *
 * The one mechanic: close your hand around a firefly. How fast the hand closed is measured from an `openness` value
 * (1 = fingers straight / button up, 0 = fist / button fully held): the time between the hand last being clearly open
 * and becoming clearly closed. Slower than `franticMs` is a catch; faster startles the fireflies nearby.
 */

/** Every number below was tuned by playing the game. Override them through options, don't edit them blindly. */
export const TUNING = Object.freeze({
  /** Openness at or above this counts as an open hand (also the release threshold). */
  openAbove: 0.6,
  /** Openness below this counts as a closed hand. */
  closedBelow: 0.4,
  /** Closing faster than this (ms from open to closed) is a frantic snatch. Charitable: a normal close is 250-500 ms; only a snatch (under ~150 ms) is frantic. */
  franticMs: 120,
  /** Capture radius around the palm centre, in screen heights. Generous on purpose. */
  captureRadius: 0.14,
  /** A frantic snatch startles fireflies within this radius (screen heights). */
  startleRadius: 0.34,
  /** Open your hand within this distance of the jar mouth (screen heights) to release into it. */
  jarRadius: 0.2,
  /** A firefly held this long slips out of the fist (ms). */
  holdMs: 7000,
  /** From here the glow in the fist flutters as a warning (ms). */
  slipWarnMs: 5000,
  /** One dusk session (s). */
  sessionS: 180,
  /** The sky reaches full night this far into the session (s); see duskAt. */
  nightS: 90,
  /** Both hands must close on the pair within this window (ms). */
  pairWindowMs: 1000,
  /** Fireflies within this distance of a still, open hand drift toward it (screen heights). */
  curiousRadius: 0.32,
});

/** @typedef {'common' | 'blue' | 'gold' | 'pair'} Kind */
/** @typedef {'slow' | 'frantic'} CloseKind */
/** @typedef {{ type: 'close', kind: CloseKind, durationMs: number } | { type: 'open' }} GripEvent */
/** @typedef {{ x: number, y: number }} P2 */

/** Jar points per kind. @type {Record<Kind, number>} */
export const VALUE = { common: 1, blue: 3, gold: 5, pair: 4 };

/**
 * Per-hand grip state with hysteresis. Feed it openness every frame; it reports a close (with how fast it was) and
 * an open. A hand that first appears already closed is treated as closed without a close event.
 *
 * Speed: when openness crosses below `closedBelow`, look back over the last second for the peak openness, then time
 * how long the hand took to fall from (peak - 0.12) to `closedBelow`, interpolating between samples so a 30 fps
 * input does not quantise it. That band is a fraction of the whole open-to-fist range, so the reported
 * `durationMs` is scaled up to an estimate of the full close: "the hand closed fully in about N ms".
 */
export class Grip {
  /** @param {{ openAbove: number, closedBelow: number, franticMs: number }} [tune] */
  constructor(tune = TUNING) {
    this.tune = tune;
    /** @type {'unknown' | 'open' | 'closed'} */
    this.state = 'unknown';
    /** Closing progress for visuals (0 open .. 1 closed). */
    this.progress = 0;
    /** @type {{ t: number, o: number }[]} */
    this.hist = [];
  }

  /**
   * @param {number} openness 1 open .. 0 fist
   * @param {number} t time in ms
   * @returns {GripEvent | null}
   */
  update(openness, t) {
    const { openAbove, closedBelow } = this.tune;
    this.progress = Math.min(1, Math.max(0, (openAbove - openness) / (openAbove - closedBelow)));
    this.hist.push({ t, o: openness });
    while (this.hist.length > 2 && this.hist[0].t < t - 1000) this.hist.shift();
    if (this.state === 'unknown') {
      if (openness >= openAbove) this.state = 'open';
      else if (openness < closedBelow) this.state = 'closed';
      return null;
    }
    if (this.state === 'open') {
      if (openness < closedBelow) {
        this.state = 'closed';
        const durationMs = closeDuration(this.hist, closedBelow);
        return { type: 'close', kind: classifyClose(durationMs, this.tune.franticMs), durationMs };
      }
      return null;
    }
    if (openness >= openAbove) { this.state = 'open'; return { type: 'open' }; }
    return null;
  }

  reset() { this.state = 'unknown'; this.hist = []; this.progress = 0; }
}

/**
 * Estimated full-close time (ms) from an openness history ending at the frame that crossed `closedBelow`.
 * @param {{ t: number, o: number }[]} hist
 * @param {number} closedBelow
 */
export function closeDuration(hist, closedBelow) {
  const n = hist.length;
  if (n < 2) return 0;
  let peak = 0;
  for (const h of hist) peak = Math.max(peak, h.o);
  const hi = Math.max(closedBelow + 0.1, peak - 0.12);
  // exact time openness fell through `lo` (between the last two samples)
  const a = hist[n - 2], b = hist[n - 1];
  const tLo = a.o === b.o ? b.t : a.t + ((a.o - closedBelow) / (a.o - b.o)) * (b.t - a.t);
  // last time it was at or above `hi`, interpolated forward to where it fell through
  let tHi = hist[0].t;
  for (let i = n - 1; i > 0; i--) {
    const p = hist[i - 1], q = hist[i];
    if (p.o >= hi && q.o < hi) { tHi = p.t + ((p.o - hi) / (p.o - q.o)) * (q.t - p.t); break; }
    if (q.o >= hi) { tHi = q.t; break; }
  }
  const band = hi - closedBelow;
  return Math.max(0, (tLo - tHi) / band);
}

/** @param {number} durationMs @param {number} [franticMs] @returns {CloseKind} */
export function classifyClose(durationMs, franticMs = TUNING.franticMs) {
  return durationMs < franticMs ? 'frantic' : 'slow';
}

/** Distance between two screen points (0..1 of width / height) measured in screen heights. @param {P2} a @param {P2} b @param {number} aspect */
export function screenDist(a, b, aspect) {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

/** Indices of `targets` within `radius` of `p`, nearest first. @param {P2} p @param {P2[]} targets @param {number} radius @param {number} aspect */
export function within(p, targets, radius, aspect) {
  /** @type {{ i: number, d: number }[]} */
  const out = [];
  targets.forEach((q, i) => { const d = screenDist(p, q, aspect); if (d <= radius) out.push({ i, d }); });
  return out.sort((a, b) => a.d - b.d).map((o) => o.i);
}

/**
 * Two closes by different hands, close enough in time: the pair is caught.
 * @param {{ hand: number, t: number } | null} a @param {{ hand: number, t: number } | null} b @param {number} [windowMs]
 */
export function pairCaught(a, b, windowMs = TUNING.pairWindowMs) {
  return !!a && !!b && a.hand !== b.hand && Math.abs(a.t - b.t) <= windowMs;
}

/** How brightly the jar glows for a given score (0..1, eases toward full). @param {number} score */
export function jarGlow(score) {
  return 1 - Math.exp(-score / 14);
}

/**
 * Dusk progress 0 (amber) .. 1 (deep blue night). The sky front-loads its change so it reads in a short clip:
 * an ease-out that is about a quarter of the way at 15 s, half way at 30 s and full night at `nightS`, after which the
 * night holds. Endless mode drifts slowly between late dusk and night.
 * @param {number} elapsedS @param {boolean} endless @param {number} [nightS]
 */
export function duskAt(elapsedS, endless, nightS = TUNING.nightS) {
  if (endless) return 0.62 + 0.2 * Math.sin(elapsedS / 20);
  const k = Math.min(1, Math.max(0, elapsedS / nightS));
  return 1 - Math.pow(1 - k, 1.6);
}

/** @typedef {{ t: number, kind: Exclude<Kind, 'common'> }} Spawn */
/** When the rare fireflies appear in a session (seconds). Endless repeats the cycle every session. @type {Spawn[]} */
export const RARE_SCHEDULE = [
  { t: 22, kind: 'blue' },
  { t: 45, kind: 'gold' },
  { t: 68, kind: 'pair' },
  { t: 92, kind: 'blue' },
  { t: 118, kind: 'gold' },
  { t: 138, kind: 'pair' },
  { t: 158, kind: 'blue' },
];

/** Rare spawns due in (prevS, nowS]. @param {number} prevS @param {number} nowS @param {boolean} endless @param {number} [sessionS] @returns {Spawn[]} */
export function raresDue(prevS, nowS, endless, sessionS = TUNING.sessionS) {
  /** @type {Spawn[]} */
  const out = [];
  const cycles = endless ? [Math.floor(prevS / sessionS), Math.floor(nowS / sessionS)] : [0, 0];
  for (let c = cycles[0]; c <= cycles[1]; c++) {
    for (const s of RARE_SCHEDULE) {
      const t = s.t + c * sessionS;
      if (t > prevS && t <= nowS) out.push(s);
    }
  }
  return out;
}

/** How many ordinary fireflies should be about: a few at first light, more as it gets dark. @param {number} dusk */
export function targetCommon(dusk) {
  return Math.round(7 + dusk * 9);
}

/**
 * @typedef {{ score: number, caught: number, byKind: Record<Kind, number>, catches: number, startles: number,
 *   slips: number, releasedFree: number, bestHeld: number }} Stats
 */

/** @returns {Stats} */
export function newStats() {
  return { score: 0, caught: 0, byKind: { common: 0, blue: 0, gold: 0, pair: 0 }, catches: 0, startles: 0, slips: 0, releasedFree: 0, bestHeld: 0 };
}

/** Adds a released batch (kinds of the fireflies opened over the jar) to the stats. @param {Stats} s @param {Kind[]} kinds */
export function addToJar(s, kinds) {
  let gained = 0;
  for (const k of kinds) { s.byKind[k]++; s.caught++; gained += VALUE[k]; }
  s.score += gained;
  return gained;
}

/** A calm word for how the jar turned out. @param {number} score */
export function verdict(score) {
  if (score >= 60) return 'A lantern you could read by';
  if (score >= 40) return 'A jar full of summer';
  if (score >= 24) return 'A warm, steady glow';
  if (score >= 10) return 'A handful of light';
  if (score > 0) return 'A first few sparks';
  return 'The meadow kept its light';
}
