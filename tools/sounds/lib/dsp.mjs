// Sound made from maths: the small engine behind tools/sounds/synth.mjs.
// A recipe (plain JSON, see tools/sounds/recipes.json) lists layers; render() turns it into samples.
// No dependencies. Everything is mono, 44.1 kHz, Float64 samples in -1..1.
//
// Layer types
//   tone    an oscillator: wave (sine|tri|square|saw), freq, optional vib {rate, depth}, fm {ratio, index}, unison
//   noise   white | pink | brown noise
//   grains  many small copies of `each` scattered in time (crackle, drips, rain, debris, sparkles)
//   notes   `each` played as a tune: notes are semitones above `base` (a MIDI note), null is a rest, [..] a chord
// Every layer takes: at, dur (seconds), vol, attack, release, env (exp|lin|flat|swell|rise), curve (how fast an
// exp/lin envelope falls), filter {type: lp|hp|bp, freq, q} or a list of filters.
// Numbers can be: a number, a curve [start, ..., end] over the layer's life, or {"r": [lo, hi]} = a fresh random
// value for every variation (and every grain). That is where the variations come from.

export const SR = 44100;
const TAU = Math.PI * 2;

/** Small seeded random generator (mulberry32): same seed, same sound. */
export function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashText(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(g, 1e-9));
const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------- values

const isRange = (v) => v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.r);

/** Replace every {"r":[lo,hi]} in a layer with one random number. Leaves `each` alone (grains resolve their own). */
function resolve(v, rand, key = '') {
  if (isRange(v)) {
    const [lo, hi] = v.r;
    return v.log && lo > 0 && hi > 0 ? lo * Math.pow(hi / lo, rand()) : lo + (hi - lo) * rand();
  }
  if (key === 'each') return v;
  if (Array.isArray(v)) return v.map((x) => resolve(x, rand));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = resolve(x, rand, k);
    return o;
  }
  return v;
}

/** A number, or a curve [a, b, ...] read at u = 0..1 (smooth in pitch when all points are above zero). */
function at(c, u) {
  if (typeof c === 'number') return c;
  if (!Array.isArray(c) || !c.length) return 0;
  if (c.length === 1) return c[0];
  const x = Math.min(0.999999, Math.max(0, u)) * (c.length - 1);
  const i = Math.floor(x), f = x - i;
  const a = c[i], b = c[i + 1];
  return a > 0 && b > 0 ? a * Math.pow(b / a, f) : a + (b - a) * f;
}

// ---------------------------------------------------------------- building blocks

function envelope(L, i, n) {
  const t = i / SR, dur = n / SR, u = i / n;
  const attack = Math.max(0.0005, L.attack ?? 0.002);
  const release = Math.max(0.001, L.release ?? 0.005);
  let e;
  switch (L.env || 'exp') {
    case 'flat': e = 1; break;
    case 'lin': e = Math.pow(1 - u, L.curve ?? 1); break;
    case 'swell': e = Math.pow(Math.sin(Math.PI * u), L.curve ?? 1); break;
    case 'rise': e = Math.pow(u, L.curve ?? 2); break;
    default: e = Math.exp(-(L.curve ?? 5) * u);
  }
  if (t < attack) e *= t / attack;
  if (dur - t < release) e *= Math.max(0, (dur - t) / release);
  return e;
}

/** A filter whose frequency can move (state-variable, stable at any setting). Works in place. */
function filterInPlace(buf, F) {
  let ic1 = 0, ic2 = 0;
  const n = buf.length;
  const k = 1 / Math.max(0.3, F.q ?? 0.7);
  const type = F.type || 'lp';
  let g = 0, a1 = 0, a2 = 0, a3 = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) {
      const f = Math.min(SR * 0.45, Math.max(15, at(F.freq, i / n)));
      g = Math.tan((Math.PI * f) / SR);
      a1 = 1 / (1 + g * (g + k));
      a2 = g * a1;
      a3 = g * a2;
    }
    const v3 = buf[i] - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    buf[i] = type === 'lp' ? v2 : type === 'bp' ? v1 : buf[i] - k * v1 - v2;
  }
}

function wave(kind, ph, duty) {
  const x = ph / TAU - Math.floor(ph / TAU);
  switch (kind) {
    case 'tri': return 1 - 4 * Math.abs(x - 0.5);
    case 'square': return x < (duty ?? 0.5) ? 1 : -1;
    case 'saw': return 2 * x - 1;
    default: return Math.sin(ph);
  }
}

function toneSamples(L, n, c) {
  const out = new Float64Array(n);
  const voices = Math.max(1, Math.round(L.unison || 1));
  const spread = (L.spread ?? 12) / 1200; // cents either side
  const phases = Array.from({ length: voices }, () => c.rand() * TAU * (voices > 1 ? 1 : 0));
  const tunes = phases.map((_, v) => (voices === 1 ? 1 : Math.pow(2, spread * ((v / (voices - 1)) * 2 - 1))));
  let mph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n, t = i / SR;
    let f = at(L.freq, u) * c.pitch;
    if (L.vib) f *= Math.pow(2, ((L.vib.depth ?? 0.3) * Math.sin(TAU * (L.vib.rate ?? 6) * t)) / 12);
    let mod = 0;
    if (L.fm) {
      mod = Math.sin(mph) * at(L.fm.index ?? 1, u);
      mph += (TAU * f * (L.fm.ratio ?? 2)) / SR;
    }
    let s = 0;
    for (let v = 0; v < voices; v++) {
      phases[v] += (TAU * f * tunes[v]) / SR;
      s += wave(L.wave, phases[v] + mod, L.duty);
    }
    out[i] = s / Math.sqrt(voices);
  }
  return out;
}

function noiseSamples(L, n, c) {
  const out = new Float64Array(n);
  const r = c.rand;
  if (L.color === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.16;
      b6 = w * 0.115926;
    }
  } else if (L.color === 'brown') {
    let b = 0;
    for (let i = 0; i < n; i++) {
      b = (b + 0.02 * (r() * 2 - 1)) / 1.02;
      out[i] = b * 3.5;
    }
  } else {
    for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  }
  return out;
}

function mixLayer(out, layer, c, depth = 0) {
  const L = resolve(layer, c.rand);
  const start = Math.max(0, (L.at ?? 0) * c.time);
  if (L.type === 'grains') {
    const span = (L.dur ?? c.seconds) * c.time;
    const count = Math.max(1, Math.round(L.count ?? (L.rate ?? 10) * span));
    for (let k = 0; k < count; k++) {
      let u = c.rand();
      if (L.density) for (let tries = 0; tries < 8 && c.rand() > at(L.density, u); tries++) u = c.rand();
      const g = L.each || { type: 'noise', dur: 0.01 };
      const vol = scaleVol(g.vol, (L.vol ?? 1) * (L.volCurve ? at(L.volCurve, u) : 1));
      // the grain's own start is already in real seconds, so it is placed with time = 1
      mixLayer(out, { ...g, at: start + u * span + (typeof g.at === 'number' ? g.at : 0), vol }, { ...c, time: 1 }, depth + 1);
    }
    return;
  }
  if (L.type === 'notes') {
    const step = (L.step ?? 0.15) * c.time;
    (L.notes || []).forEach((note, k) => {
      if (note == null) return;
      const chord = Array.isArray(note) ? note : [note];
      chord.forEach((semi, j) => {
        const hz = midiToHz((L.base ?? 69) + semi);
        const e = L.each || { type: 'tone' };
        const freq = e.bend ? e.bend.map((m) => hz * m) : hz;
        mixLayer(out, { ...e, freq, at: start / c.time + (k * step + j * (L.strum ?? 0)) / c.time, vol: scaleVol(e.vol, L.vol ?? 1) }, c, depth + 1);
      });
    });
    return;
  }
  const dur = Math.max(0.002, (L.dur ?? c.seconds) * c.time);
  const n0 = Math.floor(start * SR);
  const n = Math.min(Math.floor(dur * SR), out.length - n0);
  if (n <= 0) return;
  const buf = L.type === 'noise' ? noiseSamples(L, n, c) : toneSamples(L, n, c);
  const filters = L.filter ? (Array.isArray(L.filter) ? L.filter : [L.filter]) : [];
  for (const F of filters) filterInPlace(buf, { ...F, freq: scaleFreq(F.freq, L.type === 'noise' ? c.pitch : 1) });
  const am = L.am ? { rate: L.am.rate ?? 20, depth: L.am.depth ?? 1 } : null; // a fast flutter (crickets, growls, purrs)
  for (let i = 0; i < n; i++) {
    let g = envelope(L, i, n) * at(L.vol ?? 0.5, i / n);
    if (am) g *= 1 - am.depth * (0.5 + 0.5 * Math.cos((TAU * am.rate * i) / SR));
    out[n0 + i] += buf[i] * g;
  }
}

const scaleVol = (v, m) => (Array.isArray(v) ? v.map((x) => x * m) : isRange(v) ? { r: v.r.map((x) => x * m) } : (v ?? 0.5) * m);
const scaleFreq = (f, m) => (Array.isArray(f) ? f.map((x) => x * m) : f * m);

// ---------------------------------------------------------------- effects on the whole sound

function post(buf, fx) {
  const n = buf.length;
  switch (fx.type) {
    case 'lowpass': filterInPlace(buf, { type: 'lp', freq: fx.freq, q: fx.q }); break;
    case 'highpass': filterInPlace(buf, { type: 'hp', freq: fx.freq, q: fx.q }); break;
    case 'bandpass': filterInPlace(buf, { type: 'bp', freq: fx.freq, q: fx.q }); break;
    case 'drive': {
      const k = fx.amount ?? 2;
      for (let i = 0; i < n; i++) buf[i] = Math.tanh(buf[i] * k) / Math.tanh(k);
      break;
    }
    case 'tremolo': {
      const d = fx.depth ?? 0.5;
      for (let i = 0; i < n; i++) buf[i] *= 1 - d * (0.5 + 0.5 * Math.sin((TAU * (fx.rate ?? 8) * i) / SR));
      break;
    }
    case 'echo': {
      const d = Math.max(1, Math.floor((fx.time ?? 0.12) * SR)), fb = fx.feedback ?? 0.35, mix = fx.mix ?? 0.3;
      const wet = new Float64Array(n);
      for (let i = d; i < n; i++) wet[i] = buf[i - d] + wet[i - d] * fb;
      for (let i = 0; i < n; i++) buf[i] += wet[i] * mix;
      break;
    }
    case 'reverb': {
      // four comb filters and two all-pass filters: a small, cheap room
      const size = fx.size ?? 1, mix = fx.mix ?? 0.25, damp = fx.damp ?? 0.35;
      const wet = new Float64Array(n);
      for (const [ms, fb] of [[29.7, 0.8], [37.1, 0.78], [41.1, 0.76], [43.7, 0.74]]) {
        const d = Math.floor((ms / 1000) * size * SR);
        const line = new Float64Array(d);
        let p = 0, lp = 0;
        for (let i = 0; i < n; i++) {
          const y = line[p];
          lp = y * (1 - damp) + lp * damp;
          line[p] = buf[i] + lp * fb * Math.min(0.97, 0.9 + 0.05 * size);
          wet[i] += y * 0.25;
          p = (p + 1) % d;
        }
      }
      for (const ms of [5, 1.7]) {
        const d = Math.floor((ms / 1000) * SR);
        const line = new Float64Array(d);
        let p = 0;
        for (let i = 0; i < n; i++) {
          const y = line[p];
          const x = wet[i];
          line[p] = x + y * 0.5;
          wet[i] = y - x * 0.5;
          p = (p + 1) % d;
        }
      }
      for (let i = 0; i < n; i++) buf[i] = buf[i] * (1 - mix * 0.5) + wet[i] * mix;
      break;
    }
    default: throw new Error(`unknown effect "${fx.type}" (use lowpass, highpass, bandpass, drive, tremolo, echo, reverb)`);
  }
}

// ---------------------------------------------------------------- measuring

export function measure(buf) {
  let peak = 0, sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > peak) peak = a;
    sum += buf[i] * buf[i];
  }
  // "active" loudness: ignore the quiet tail, so a short click and a long ring compare fairly
  const gate = peak * 0.03;
  let asum = 0, an = 0;
  const win = Math.floor(SR * 0.01);
  for (let s = 0; s + win <= buf.length; s += win) {
    let w = 0;
    for (let i = s; i < s + win; i++) w += buf[i] * buf[i];
    if (Math.sqrt(w / win) > gate) { asum += w; an += win; }
  }
  return {
    seconds: +(buf.length / SR).toFixed(3),
    peakDb: +gainToDb(peak).toFixed(1),
    rmsDb: +gainToDb(Math.sqrt(sum / Math.max(1, buf.length))).toFixed(1),
    activeRmsDb: +gainToDb(Math.sqrt(asum / Math.max(1, an))).toFixed(1),
  };
}

/**
 * How well a loop joins end to start. `jump` is the step from the last sample back to the first, `typical` is a big
 * (99th percentile) step between neighbours inside the sound: a seamless loop has jump <= typical. `levelDb` is the
 * loudness of the last 0.2 s minus the first 0.2 s.
 */
export function seam(buf) {
  const n = buf.length;
  const steps = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) steps[i] = Math.abs(buf[i + 1] - buf[i]);
  const sorted = Float64Array.from(steps).sort();
  const typical = sorted[Math.floor(sorted.length * 0.99)] || 1e-9;
  const jump = Math.abs(buf[0] - buf[n - 1]);
  const w = Math.min(Math.floor(SR * 0.2), n >> 1);
  const rms = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += buf[i] * buf[i]; return Math.sqrt(s / (b - a)); };
  return { jump: +jump.toFixed(5), typical: +typical.toFixed(5), ratio: +(jump / typical).toFixed(2), levelDb: +(gainToDb(rms(n - w, n)) - gainToDb(rms(0, w))).toFixed(1) };
}

// ---------------------------------------------------------------- render

/** Loudness targets per group: one-shots are levelled by peak, loops by average level. Chosen so a pack mixes itself. */
export const GROUP_LEVELS = {
  ui: { peak: -10 }, pickup: { peak: -7 }, move: { peak: -8 }, impact: { peak: -4 }, weapon: { peak: -5 },
  vehicle: { peak: -6, loopRms: -21 }, feedback: { peak: -7 }, creature: { peak: -8 }, magic: { peak: -7 },
  ambience: { peak: -6, loopRms: -25 }, music: { peak: -6, loopRms: -21 },
};
const ACTIVE_RMS_CEILING = -13; // a dense one-shot is turned down to this even if its peak target allows more

/**
 * Render one variation of a recipe.
 * opts: { variation (0 = the plain one), seed, pitch (semitones), length (x), soft, hard }
 * Returns { samples (Float64Array; a loop is exactly `seconds` long and joins end to start), numbers, loop }.
 */
export function render(recipe, opts = {}) {
  const v = opts.variation ?? 0;
  const rand = makeRandom((hashText(recipe.id || 'sound') + (opts.seed ?? 0) * 104729 + v * 7919) >>> 0);
  const vary = recipe.vary || {};
  const jitter = v === 0 ? 0 : 1;
  const pitch = Math.pow(2, ((opts.pitch ?? 0) + jitter * (rand() * 2 - 1) * (vary.pitch ?? 0.8)) / 12);
  const time = (opts.length ?? 1) * (1 + jitter * (rand() * 2 - 1) * (vary.time ?? 0.05));
  const loop = !!recipe.loop;
  const seconds = recipe.seconds * (loop ? opts.length ?? 1 : time);
  const N = Math.round(seconds * SR);
  // loopMode "crossfade" (default): the extra tail is faded into the start; right for steady sounds (wind, rain).
  // loopMode "wrap": the tail (ringing notes, echoes) is added onto the start; right for tunes and single drops.
  const wrap = loop && recipe.loopMode === 'wrap';
  const X = !loop ? 0 : wrap ? Math.round((recipe.tail ?? 1.5) * SR) : Math.round(Math.min(recipe.crossfade ?? 1, seconds * 0.3) * SR);
  const buf = new Float64Array(N + X);
  const c = { rand, pitch, time: loop ? opts.length ?? 1 : time, seconds: recipe.seconds + (loop ? X / SR : 0) };
  for (const layer of recipe.layers || []) {
    const L = { ...layer };
    if (opts.soft && L.type !== 'grains' && L.type !== 'notes') L.attack = Math.max(L.attack ?? 0.002, 0.012);
    if (loop && !wrap && L.dur == null && L.type !== 'notes') L.dur = c.seconds / c.time; // background layers cover the crossfade too
    if (wrap && L.type === 'grains' && L.dur == null) L.dur = recipe.seconds;
    mixLayer(buf, L, c);
  }
  const chain = [...(recipe.post || [])];
  if (opts.soft) chain.push({ type: 'lowpass', freq: 2600 });
  if (opts.hard) chain.push({ type: 'drive', amount: 2.5 });
  chain.push({ type: 'highpass', freq: recipe.group === 'impact' || recipe.group === 'vehicle' ? 25 : 40 });
  for (const fx of chain) post(buf, fx);

  let out;
  if (loop) {
    // fold the extra tail into the start: the end of the loop then runs straight into its beginning
    out = buf.slice(0, N);
    const tonal = recipe.crossfadeShape === 'linear';
    if (wrap) for (let i = 0; i < X && i < N; i++) out[i] += buf[N + i];
    else for (let i = 0; i < X; i++) {
      const u = i / X;
      const a = tonal ? u : Math.sin((u * Math.PI) / 2), b = tonal ? 1 - u : Math.cos((u * Math.PI) / 2);
      out[i] = buf[i] * a + buf[N + i] * b;
    }
  } else {
    out = buf;
    const fi = Math.min(N, Math.floor(SR * 0.001)), fo = Math.min(N, Math.floor(SR * (recipe.fadeOut ?? 0.008)));
    for (let i = 0; i < fi; i++) out[i] *= i / fi;
    for (let i = 0; i < fo; i++) out[N - 1 - i] *= i / fo;
  }

  // level it
  const target = { ...(GROUP_LEVELS[recipe.group] || { peak: -6 }) };
  const offset = (recipe.level ?? 0) + (opts.soft ? -4 : 0);
  let m = measure(out);
  let gain;
  if (loop && target.loopRms != null) {
    gain = dbToGain(target.loopRms + offset - m.rmsDb);
    if (m.peakDb + gainToDb(gain) > target.peak) gain = dbToGain(target.peak - m.peakDb);
  } else {
    gain = dbToGain(target.peak + offset - m.peakDb);
    const active = m.activeRmsDb + gainToDb(gain);
    if (active > ACTIVE_RMS_CEILING + offset) gain *= dbToGain(ACTIVE_RMS_CEILING + offset - active);
  }
  if (!Number.isFinite(gain)) gain = 0;
  for (let i = 0; i < out.length; i++) out[i] *= gain;
  m = measure(out);
  return { samples: out, numbers: { ...m, ...(loop ? { seam: seam(out) } : {}) }, loop };
}

// ---------------------------------------------------------------- WAV files

/** 16-bit mono WAV. `pad` (seconds) wraps a loop: the end is copied before the start and the start after the end. */
export function encodeWav(samples, { pad = 0 } = {}) {
  const P = Math.round(pad * SR);
  const n = samples.length + 2 * P;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  const N = samples.length;
  for (let i = 0; i < n; i++) {
    const s = samples[(((i - P) % N) + N) % N];
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2);
  }
  return b;
}

/** Raw 16-bit little-endian mono samples (what ffmpeg prints with -f s16le) to Float64. */
export function pcm16ToFloat(buffer) {
  const n = buffer.length >> 1;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = buffer.readInt16LE(i * 2) / 32768;
  return out;
}
