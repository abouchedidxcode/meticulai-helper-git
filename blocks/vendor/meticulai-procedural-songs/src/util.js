// =====================================================================
// Procedural songs - math helpers, seeded RNG, procedural buffer fillers and the per-context resource cache
// (the white-noise buffer, the reverb impulse, the pulse waves and the soft-clip curve the music uses).
// Everything here is either pure (Node-testable) or only touches the ctx it is given.
// =====================================================================

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
/** Finite number or fallback (guards AudioParam writes against NaN/Infinity, which throw). */
export function fin(v, d = 0) { return Number.isFinite(v) ? v : d; }
export function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

/** Deterministic PRNG (mulberry32). Used for noise-buffer generation, the score generator and tests. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ buffer fillers (pure)
function normalize(a, peak = 0.9, removeDc = true) {
  const n = a.length;
  if (removeDc) {
    let m = 0;
    for (let i = 0; i < n; i++) m += a[i];
    m /= n;
    for (let i = 0; i < n; i++) a[i] -= m;
  }
  let mx = 1e-9;
  for (let i = 0; i < n; i++) { const v = Math.abs(a[i]); if (v > mx) mx = v; }
  const s = peak / mx;
  for (let i = 0; i < n; i++) a[i] *= s;
  return a;
}

/** Equal-power crossfade of the tail onto the head so a looping buffer has no seam click. */
export function makeLoopable(a, fade = 2048) {
  const n = a.length;
  fade = Math.min(fade, n >> 2);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    const wTail = Math.cos(t * Math.PI / 2), wHead = Math.sin(t * Math.PI / 2);
    a[n - fade + i] = a[n - fade + i] * wTail + a[i] * wHead;
  }
  return a;
}

export function fillWhite(a, rng) {
  for (let i = 0; i < a.length; i++) a[i] = rng() * 2 - 1;
  return normalize(makeLoopable(a), 0.95); // crossfade first: it can add up to +3 dB at the seam
}

/** Reverb impulse response: pre-delay, early taps, exponentially decaying damped noise. Pass R = null for a mono IR (half the convolution cost). */
export function fillImpulse(L, R, rng, sr = 44100, seconds = 1.6) {
  const chans = R ? [L, R] : [L];
  const n = L.length;
  for (let ch = 0; ch < chans.length; ch++) {
    const a = chans[ch];
    let lp = 0;
    const pre = Math.floor(sr * 0.009);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = Math.exp(-6.907755 * t / seconds);
      const w = rng() * 2 - 1;
      const c = lerp(0.9, 0.1, Math.min(1, t / (seconds * 0.85)));   // more damping later
      lp += (w - lp) * c;
      const fadeIn = i < pre ? 0 : Math.min(1, (i - pre) / (sr * 0.006));
      a[i] = lp * env * fadeIn;
    }
    const taps = [0.013, 0.019, 0.027, 0.034, 0.045, 0.058];
    for (let k = 0; k < taps.length; k++) {
      const idx = Math.floor(sr * (taps[k] + ch * 0.0017 * (k + 1)));
      if (idx < n) a[idx] += (rng() < 0.5 ? -1 : 1) * (0.9 - k * 0.1);
    }
    let e = 0;
    for (let i = 0; i < n; i++) e += a[i] * a[i];
    const s = Math.sqrt(0.5 / Math.max(e, 1e-9));
    for (let i = 0; i < n; i++) a[i] *= s;
  }
}

// ------------------------------------------------------------------ waves & curves (pure)
/** Fourier coefficients for a pulse wave of the given duty (cos series; DC removed). */
export function pulseCoeffs(duty, N = 48) {
  const real = new Float32Array(N + 1), imag = new Float32Array(N + 1);
  for (let k = 1; k <= N; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return { real, imag };
}
/** Soft-knee clip: linear below 0.7, tanh shoulder up to ~0.92 at |x|=1. Guarantees |y| < 1. */
export function softClipCurve(n = 4096) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const ax = Math.abs(x);
    const y = ax < 0.7 ? ax : 0.7 + 0.28 * Math.tanh((ax - 0.7) / 0.28);
    c[i] = Math.sign(x) * y;
  }
  return c;
}

// ------------------------------------------------------------------ per-context resources
const BUFFER_SPECS = {
  white: { sec: 2.0, fill: fillWhite, seed: 11 },
};

export class Resources {
  constructor(ctx) {
    this.ctx = ctx;
    this._bufs = Object.create(null);
    this._waves = Object.create(null);
    this._curves = Object.create(null);
  }
  /** Pooled mono noise buffer (generated once, deterministic). The music only uses 'white'. */
  buffer(name) {
    let b = this._bufs[name];
    if (b) return b;
    const spec = BUFFER_SPECS[name];
    if (!spec) throw new Error('unknown buffer ' + name);
    const sr = this.ctx.sampleRate;
    b = this.ctx.createBuffer(1, Math.floor(sr * spec.sec), sr);
    spec.fill(b.getChannelData(0), mulberry32(spec.seed), sr);
    this._bufs[name] = b;
    return b;
  }
  wave(name) {
    let w = this._waves[name];
    if (w) return w;
    let c;
    if (name === 'pulse12') c = pulseCoeffs(0.125);
    else if (name === 'pulse25') c = pulseCoeffs(0.25);
    else if (name === 'pulse33') c = pulseCoeffs(0.33);
    else throw new Error('unknown wave ' + name);
    w = this.ctx.createPeriodicWave(c.real, c.imag);
    this._waves[name] = w;
    return w;
  }
  curve(name) {
    let c = this._curves[name];
    if (c) return c;
    if (name === 'softclip') c = softClipCurve();
    else throw new Error('unknown curve ' + name);
    this._curves[name] = c;
    return c;
  }
}

const cache = new WeakMap();
export function getResources(ctx) {
  let r = cache.get(ctx);
  if (!r) { r = new Resources(ctx); cache.set(ctx, r); }
  return r;
}
