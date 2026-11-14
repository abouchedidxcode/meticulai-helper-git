// =====================================================================
// Procedural songs - pure, seeded song generation (no WebAudio, Node-testable).
//
//   generateSong(kind, seed) -> Song   kind: 'menu' | 'game' | 'tense' | 'results'
//
// A Song is a list of Sections (8 bars of 16 sixteenth-steps). Every section carries event lists per instrument:
//   { s: step, d: duration (steps), v: velocity 0..1, i: min intensity, x: max intensity, n: midi (or array), k: variant }
// The engine plays an event only while  i <= intensity <= x, so one score holds every density level (layering).
//
// Harmony: 8-bar sections are built from 4-bar progression templates (open phrase ending on V, close phrase ending on I).
// Melody: a seeded GRAMMAR - a one-bar hook motif (call + answer cell), a response motif and a contrast motif, laid out by
// phrase templates (M M R E / M seq M E ...) with an OPEN ending (half cadence) then a CLOSE ending (tonic), so the tune
// repeats and varies like a real hook. Motif pitches are chord-relative scale steps, strong beats snap to chord tones.
// =====================================================================
import { mulberry32 } from './util.js';

export const STEPS_PER_BAR = 16;
export const KINDS = ['menu', 'game', 'tense', 'results'];
export const INSTS = ['kick', 'snare', 'clap', 'hat', 'shaker', 'wood', 'cow', 'tom', 'fx', 'bass', 'stab', 'lead', 'arp', 'pad', 'siren'];

// ------------------------------------------------------------------ theory
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  phrygDom: [0, 1, 4, 5, 7, 8, 10],
  dimWH: [0, 2, 3, 5, 6, 8, 9],
};
export const CHORDS = {
  maj: [0, 4, 7], maj6: [0, 4, 7, 9], maj7: [0, 4, 7, 11], dom7: [0, 4, 7, 10],
  min: [0, 3, 7], min7: [0, 3, 7, 10], dim7: [0, 3, 6, 9], sus4: [0, 5, 7],
};
/** chord tones expressed as scale steps from the chord root (in the chord's own scale) */
const TONE_STEPS = {
  maj: [0, 2, 4], maj6: [0, 2, 4, 5], maj7: [0, 2, 4, 6], dom7: [0, 2, 4, 6],
  min: [0, 2, 4], min7: [0, 2, 4, 6], dim7: [0, 2, 4, 6], sus4: [0, 3, 4],
};
/** keys that sit well for bass + lead registers (C D Eb F G Ab Bb) */
export const KEYS = [0, 2, 3, 5, 7, 8, 10];
const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export function noteName(m) { return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }
export function pcName(pc) { return NOTE_NAMES[((pc % 12) + 12) % 12]; }
const mod12 = (x) => ((x % 12) + 12) % 12;

export function hashSeed(seed, salt = 0) {
  let h = (Math.floor(seed) | 0) ^ Math.imul((salt | 0) + 0x9E3779B9, 0x85EBCA6B);
  h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D);
  h = Math.imul(h ^ (h >>> 12), 0x297A2D39);
  return (h ^ (h >>> 15)) >>> 0;
}

const pickOf = (rng, a) => a[Math.floor(rng() * a.length) % a.length];
const chance = (rng, p) => rng() < p;

/** Which scale the melody uses over a chord (rel = chord root in semitones above the tonic). */
export function chordScale(rel, type, minor = false) {
  if (type === 'dom7') return (rel === 4 || (minor && rel === 7)) ? 'phrygDom' : 'mixolydian';
  if (type === 'dim7') return 'dimWH';
  if (type === 'maj7') return 'lydian';
  if (type === 'sus4') return 'mixolydian';
  if (type === 'maj' || type === 'maj6') {
    if (minor) return rel === 8 || rel === 1 ? 'lydian' : rel === 10 || rel === 5 ? 'mixolydian' : 'major';
    return rel === 0 ? 'major' : rel === 7 ? 'mixolydian' : 'lydian';
  }
  // minor flavours
  if (minor) return rel === 5 ? 'dorian' : 'aeolian';
  return rel === 9 ? 'aeolian' : rel === 4 ? 'phrygian' : 'dorian';
}

/** bars: array (per bar) of arrays of [rel, type] (1 or 2 chords per bar) -> flat chord list with step positions */
export function layoutChords(bars, rootPc, minor = false) {
  const out = [];
  bars.forEach((cs, b) => {
    const per = STEPS_PER_BAR / cs.length;
    cs.forEach(([rel, type], k) => {
      out.push({ s: b * STEPS_PER_BAR + k * per, d: per, rel, type, root: mod12(rootPc + rel), scale: chordScale(rel, type, minor) });
    });
  });
  return out;
}
export function chordAt(chords, s) {
  for (let i = chords.length - 1; i >= 0; i--) if (chords[i].s <= s) return chords[i];
  return chords[0];
}
export function chordPcs(ch) { return CHORDS[ch.type].map((x) => mod12(ch.root + x)); }
export function chordName(ch) { return pcName(ch.root) + ch.type; }

/** lead register: the tonic sits in 62..73 and chord roots keep their interval to it (IV above, V below) so every key has the same shape */
export const tonicMid = (rootPc) => 62 + mod12(rootPc - 62);
const relFold = (rel) => (rel > 6 ? rel - 12 : rel);
export const bassBase = (pc) => 38 + mod12(pc - 38);        // D2..C#3

/** Closest-voicing chord: returns ascending midi notes starting near `lo`, inversion nearest `center` (and `prev`). */
export function voiceChord(ch, { lo = 55, center = 64, prev = null } = {}) {
  const pcs = chordPcs(ch);
  let best = null, bestCost = Infinity;
  for (let k = 0; k < pcs.length; k++) {
    const notes = [];
    let cur = lo + mod12(pcs[k] - lo);
    notes.push(cur);
    for (let j = 1; j < pcs.length; j++) {
      const pc = pcs[(k + j) % pcs.length];
      let m = cur + mod12(pc - cur);
      if (m === cur) m += 12;
      notes.push(m); cur = m;
    }
    const mean = notes.reduce((a, b) => a + b, 0) / notes.length;
    let cost = Math.abs(mean - center);
    if (prev) {
      let mv = 0;
      for (let i = 0; i < notes.length; i++) mv += Math.abs(notes[i] - prev[Math.min(i, prev.length - 1)]);
      cost = cost * 0.4 + mv / notes.length;
    }
    if (cost < bestCost) { bestCost = cost; best = notes; }
  }
  return best;
}
/** High arpeggio pool (4 ascending notes, 69..94) */
export function arpPool(ch) {
  const iv = CHORDS[ch.type];
  const r = 69 + mod12(ch.root - 69);
  return [r + iv[0], r + iv[1], r + iv[2], iv.length > 3 ? r + iv[3] : r + 12];
}
function bassNote(ch, what, nextRoot) {
  const b = bassBase(ch.root);
  const third = (ch.type === 'min' || ch.type === 'min7' || ch.type === 'dim7') ? 3 : 4;
  switch (what) {
    case 'r': return b;
    case '5': return b + 7;
    case '8': return b + 12;
    case '3': return b + third;
    case '7': return b + (ch.type === 'maj7' ? 11 : ch.type === 'maj' || ch.type === 'maj6' ? 9 : 10);
    case '6': return b + 9;
    case '4': return b + 5;
    case 'a': {                       // chromatic approach into the next root
      const nb = bassBase(nextRoot);
      return nextRoot === ch.root ? b + 7 : nb - 1;
    }
    default: return b;
  }
}

// ------------------------------------------------------------------ progressions (rel semitones, type), 4 bars each
const OPEN4 = [   // start on I, end on V
  [[[0, 'maj6']], [[9, 'min7']], [[2, 'min7']], [[7, 'dom7']]],
  [[[0, 'maj']], [[4, 'dom7']], [[9, 'min7']], [[7, 'dom7']]],
  [[[0, 'maj']], [[0, 'dom7']], [[5, 'maj']], [[7, 'dom7']]],
  [[[0, 'maj']], [[10, 'maj']], [[5, 'maj']], [[7, 'dom7']]],
  [[[0, 'maj6']], [[5, 'maj']], [[0, 'maj']], [[7, 'dom7']]],
  [[[0, 'maj']], [[9, 'dom7']], [[2, 'dom7']], [[7, 'dom7']]],
];
const CLOSE4 = [  // end on I
  [[[0, 'maj']], [[9, 'min7']], [[2, 'min7'], [7, 'dom7']], [[0, 'maj6']]],
  [[[5, 'maj']], [[5, 'min']], [[0, 'maj']], [[7, 'dom7'], [0, 'maj6']]],
  [[[2, 'min7']], [[7, 'dom7']], [[0, 'maj6']], [[0, 'maj6']]],
  [[[5, 'maj']], [[6, 'dim7']], [[0, 'maj']], [[7, 'dom7'], [0, 'maj6']]],
  [[[9, 'dom7']], [[2, 'dom7']], [[7, 'dom7']], [[0, 'maj6']]],
];
const B_PAIRS = [   // contrast section, 8 bars, ends on V
  [[[5, 'maj']], [[7, 'maj']], [[4, 'min7']], [[9, 'min7']], [[5, 'maj']], [[2, 'dom7']], [[7, 'dom7']], [[7, 'dom7']]],
  [[[9, 'min7']], [[5, 'maj']], [[0, 'maj']], [[7, 'maj']], [[9, 'min7']], [[5, 'maj']], [[2, 'min7']], [[7, 'dom7']]],
  [[[5, 'maj7']], [[5, 'min']], [[0, 'maj']], [[9, 'dom7']], [[5, 'maj']], [[5, 'min']], [[2, 'min7'], [7, 'dom7']], [[7, 'dom7']]],
];
const BRIDGES = [   // airy 8 bars
  [[[9, 'min7']], [[5, 'maj7']], [[0, 'maj']], [[7, 'sus4']], [[9, 'min7']], [[5, 'maj7']], [[2, 'min7']], [[7, 'dom7']]],
  [[[8, 'maj7']], [[10, 'maj']], [[0, 'maj']], [[0, 'maj']], [[8, 'maj7']], [[10, 'maj']], [[5, 'maj']], [[7, 'dom7']]],
];
const MINOR4 = [
  [[[0, 'min']], [[8, 'maj']], [[10, 'maj']], [[7, 'dom7']]],
  [[[0, 'min']], [[0, 'min']], [[5, 'min']], [[7, 'dom7']]],
  [[[0, 'min']], [[1, 'maj']], [[0, 'min']], [[7, 'dom7']]],
  [[[0, 'min']], [[8, 'maj']], [[5, 'min']], [[7, 'dom7']]],
];
const MENU_A = [
  [[[0, 'maj7']], [[9, 'min7']], [[2, 'min7']], [[7, 'dom7']], [[0, 'maj7']], [[4, 'min7']], [[5, 'maj7']], [[7, 'dom7']]],
  [[[0, 'maj6']], [[5, 'maj7']], [[0, 'maj6']], [[7, 'dom7']], [[9, 'min7']], [[2, 'min7']], [[7, 'dom7']], [[0, 'maj7']]],
  [[[0, 'maj7']], [[0, 'maj7']], [[5, 'maj7']], [[5, 'min7']], [[0, 'maj6']], [[9, 'min7']], [[2, 'min7'], [7, 'dom7']], [[0, 'maj7']]],
];
const MENU_B = [
  [[[5, 'maj7']], [[4, 'min7']], [[9, 'min7']], [[2, 'dom7']], [[5, 'maj7']], [[7, 'dom7']], [[4, 'min7']], [[9, 'dom7']]],
  [[[9, 'min7']], [[2, 'min7']], [[7, 'dom7']], [[0, 'maj7']], [[9, 'min7']], [[5, 'maj7']], [[2, 'min7']], [[7, 'dom7']]],
];

// ------------------------------------------------------------------ rhythm cells (half bar = 8 steps)
const CALL_CELLS = [
  [[0, 2], [2, 2], [4, 3]],
  [[0, 3], [3, 1], [4, 4]],
  [[0, 1], [1, 1], [2, 2], [4, 2], [6, 2]],
  [[0, 2], [3, 2], [6, 2]],
  [[0, 6], [6, 2]],
  [[2, 2], [4, 2], [6, 2]],
  [[0, 2], [2, 1], [3, 1], [4, 2], [6, 2]],
  [[0, 1], [1, 1], [2, 1], [3, 1], [4, 4]],
];
const ANSWER_CELLS = [
  [[0, 2], [2, 2], [4, 4]],
  [[0, 3], [3, 3], [6, 2]],
  [[0, 2], [2, 2], [4, 2]],
  [[0, 4], [4, 2]],
  [[1, 1], [2, 2], [4, 4]],
  [[0, 2], [3, 1], [4, 4]],
  [[0, 1], [2, 1], [4, 2], [6, 2]],
];
const SPARSE_CALL = [[[0, 4], [4, 2]], [[0, 3], [3, 3]], [[2, 2], [4, 4]], [[0, 2], [4, 3]], [[0, 6]]];
const SPARSE_ANS = [[[0, 4], [4, 3]], [[0, 2], [3, 2], [6, 2]], [[2, 2], [4, 2], [6, 2]], [[0, 6]], [[0, 3], [4, 4]]];
const TENSE_CELLS = [[[0, 2], [2, 2], [4, 2], [6, 2]], [[0, 1], [1, 1], [2, 2], [4, 2], [6, 2]], [[0, 2], [3, 1], [4, 2], [7, 1]], [[0, 3], [3, 3], [6, 1], [7, 1]]];

// ------------------------------------------------------------------ helpers for events
function E(s, d, v = 1, i = 0, x = 1.01, extra) {
  const e = { s, d, v, i, x };
  if (extra) Object.assign(e, extra);
  return e;
}
function newTracks() { const t = {}; for (const k of INSTS) t[k] = []; return t; }

// ------------------------------------------------------------------ melody grammar
/** One-bar motif: call cell (steps 0-7) + answer cell (steps 8-15), pitches as chord-relative scale steps. */
function makeMotif(rng, opts = {}) {
  let best = null, bestScore = -1;
  for (let tries = 0; tries < 10; tries++) {
    const m = makeMotifOnce(rng, opts);
    // what the ear will hear after strong beats snap to triad tones: want >= 3 distinct pitches and a span of a third or more
    const snapped = m.map((q) => (q.s % 8 === 0 || q.d >= 4 ? [0, 2, 4, 7, 9].reduce((b, t) => (Math.abs(t - q.p) < Math.abs(b - q.p) ? t : b), 0) : q.p));
    const distinct = new Set(snapped).size;
    const span = Math.max(...snapped) - Math.min(...snapped);
    const score = Math.min(distinct, 4) + Math.min(span, 4) * 0.5;
    if (score > bestScore) { bestScore = score; best = m; }
    if (distinct >= Math.min(3, m.length - 1) && span >= 2) return m;
  }
  return best;
}
function makeMotifOnce(rng, { sparse = false, tense = false, start = null, callCells, ansCells } = {}) {
  const call = pickOf(rng, callCells || (tense ? TENSE_CELLS : sparse ? SPARSE_CALL : CALL_CELLS));
  const ans = pickOf(rng, ansCells || (tense ? TENSE_CELLS : sparse ? SPARSE_ANS : ANSWER_CELLS));
  const notes = [];
  for (const [s, d] of call) notes.push({ s, d, p: 0 });
  const nCall = notes.length;
  for (const [s, d] of ans) notes.push({ s: 8 + s, d, p: 0 });
  let p = start ?? pickOf(rng, [4, 4, 2, 0, 2]);
  const up = sparse ? [2, 1, 2, 3, -1, 2] : [1, 1, 2, 0, -1, 2, 1, 3];
  const down = sparse ? [-2, -1, -2, -3, 1, -2] : [-1, -1, -2, 0, 1, -2, -1, -3];
  notes.forEach((q, k) => {
    if (k > 0) {
      if (tense) p += pickOf(rng, [0, 0, 1, -1, -1, 0, 2, -2]);
      else p += pickOf(rng, k < nCall ? up : down);
    }
    q.p = Math.max(-3, Math.min(9, p));
    p = q.p;
  });
  // the answer should land low-ish (a settled feeling); the call reaches up
  if (!tense) notes[notes.length - 1].p = Math.max(0, Math.min(notes[notes.length - 1].p, 4));
  return notes;
}
const shiftP = (m, k) => m.map((q) => ({ ...q, p: q.p + k }));
/** a quieter answering echo of a motif (call/response without needing a second voice) */
const echoOf = (m) => m.map((q) => ({ ...q, p: q.p + 2, v: 0.5, free: true }));
const invertP = (m) => { const p0 = m[0].p; return m.map((q) => ({ ...q, p: p0 - (q.p - p0) })); };
/** rhythmic variation: split a long note into two repeated notes + add an 8th pickup when possible */
function varyRhythm(rng, m) {
  const out = [];
  for (const q of m) {
    if (q.d >= 4 && chance(rng, 0.7)) {
      const h = q.d >> 1;
      out.push({ ...q, d: h }, { ...q, s: q.s + h, d: q.d - h, p: q.p + (chance(rng, 0.5) ? 1 : 0) });
    } else out.push({ ...q });
  }
  return out;
}
const OPEN_ENDINGS = [
  [[0, 2, 7], [2, 2, 6], [4, 2, 4], [6, 2, 2], [8, 8, 4]],
  [[0, 3, 4], [3, 1, 2], [4, 4, 0], [8, 6, 2]],
  [[0, 2, 2], [2, 2, 4], [4, 2, 6], [6, 2, 4], [8, 8, 2]],
  [[2, 2, 4], [4, 2, 2], [6, 2, 0], [8, 2, 2], [10, 6, 4]],
];
const CLOSE_ENDINGS = [
  [[0, 2, 4], [2, 2, 2], [4, 2, 4], [6, 2, 2], [8, 8, 0]],
  [[0, 1, 7], [1, 1, 6], [2, 1, 5], [3, 1, 4], [4, 1, 3], [5, 1, 2], [6, 1, 1], [7, 1, 0], [8, 8, 0]],
  [[0, 3, 4], [3, 1, 2], [4, 4, 0], [8, 8, 0]],
  [[0, 2, 4], [3, 1, 4], [4, 2, 4], [8, 2, 2], [10, 2, 0], [12, 4, 0]],
];
const endingNotes = (e) => e.map(([s, d, p]) => ({ s, d, p }));

/** Place bar-motifs [bar0,bar1,bar2,bar3] (arrays of {s,d,p}) at bar offset `b0` */
function putBars(out, b0, bars) {
  bars.forEach((m, k) => { if (m) for (const q of m) out.push({ ...q, s: q.s + (b0 + k) * STEPS_PER_BAR }); });
}

/** Turn grammar notes into lead events with real pitches (snap strong beats to chord tones, fold into range, clip at chord edges). */
function realize(notes, chords, { tonic = 66, lo = 55, hi = 88, vel = 0.88, grace = 0, rng = null, i = 0, extra } = {}) {
  const out = [];
  const sorted = notes.slice().sort((a, b) => a.s - b.s);
  let prevM = null, prevCh = null;
  for (const q of sorted) {
    const ch = chordAt(chords, q.s);
    const chEnd = ch.s + ch.d;
    const sc = SCALES[ch.scale];
    let p = q.p;
    const strong = q.free ? false : (q.s % 8 === 0 || q.d >= 4);
    if (strong) {
      const set = TONE_STEPS[ch.type] || TONE_STEPS.maj;
      let bestP = p, bestDist = 1e9;
      for (let o = -2; o <= 2; o++) for (const t of set) {
        const cand = t + 7 * o, dist = Math.abs(cand - p);
        if (dist < bestDist) { bestDist = dist; bestP = cand; }
      }
      p = bestP;
    }
    const oct = Math.floor(p / 7), idx = ((p % 7) + 7) % 7;
    let m = tonic + relFold(ch.rel) + sc[idx] + 12 * oct;
    // voice-leading: when the chord changes, take the octave nearest the previous note so the hook follows the harmony without big leaps
    if (prevM !== null && ch !== prevCh) {
      while (m - prevM > 8) m -= 12;
      while (prevM - m > 8) m += 12;
    }
    while (m > hi) m -= 12;
    while (m < lo) m += 12;
    prevM = m; prevCh = ch;
    const d = Math.max(1, Math.min(q.d, chEnd - q.s));
    out.push({ s: q.s, d, n: m, v: q.v ?? vel, g: false, strong });
  }
  // cartoon grace notes: a quick chromatic approach from below into strong, un-crowded notes
  if (grace > 0 && rng) {
    const occupied = new Set();
    for (const e of out) for (let k = 0; k < e.d; k++) occupied.add(e.s + k);
    const extraEv = [];
    for (const e of out) {
      if (e.s > 0 && e.s % 4 === 0 && e.d >= 2 && !occupied.has(e.s - 1) && chance(rng, grace)) {
        extraEv.push({ s: e.s - 1, d: 1, n: e.n - 1, v: 0.55, g: true, strong: false });
      }
    }
    out.push(...extraEv);
  }
  return out.map((e) => E(e.s, e.d, e.v, i, 1.01, { n: e.n, g: e.g, ...(extra || {}) }));
}

// ------------------------------------------------------------------ drum / bass / stab / arp / pad pattern builders
function addFill(T, base, idx, i0 = 0.08) {
  // base = first step of the fill region inside the section (always the last bar's step 8)
  switch (idx % 4) {
    case 0:   // snare roll crescendo
      for (let k = 0; k < 8; k++) T.snare.push(E(base + k, 1, 0.3 + 0.7 * (k / 7), i0));
      break;
    case 1:   // tom tumble + snare
      [230, 190, 150, 118].forEach((f, k) => T.tom.push(E(base + k * 2, 2, 0.85, i0, 1.01, { f })));
      T.snare.push(E(base + 7, 1, 0.9, i0));
      break;
    case 2:   // syncopated kick/snare hits
      T.kick.push(E(base, 1, 0.9, i0), E(base + 2, 1, 0.8, i0));
      [3, 4, 6, 7].forEach((k, j) => T.snare.push(E(base + k, 1, 0.65 + 0.12 * j, i0)));
      T.cow.push(E(base, 1, 0.45, 0.4), E(base + 4, 1, 0.45, 0.4));
      break;
    default:  // clap flurry + cowbell
      [0, 2, 3, 4, 6, 7].forEach((k, j) => T.clap.push(E(base + k, 1, 0.55 + 0.07 * j, i0)));
      [0, 2, 4, 6].forEach((k) => T.cow.push(E(base + k, 1, 0.55, 0.3)));
      T.snare.push(E(base + 7, 1, 0.95, i0));
  }
}
function riser(T, s, d, i0 = 0.18) { T.fx.push(E(s, d, 0.7, i0, 1.01, { k: 'riser' })); }
function crash(T, s, v = 0.8, i0 = 0.15) { T.fx.push(E(s, 8, v, i0, 1.01, { k: 'crash' })); }

function gameDrums(T, o) {
  const { bars, kind, fill } = o;
  for (let b = 0; b < bars; b++) {
    const s0 = b * 16, last = b === bars - 1, odd = b & 1;
    const f = last && fill >= 0;
    if (kind === 'C') {            // bridge: breakdown
      T.kick.push(E(s0, 1, 0.95));
      if (b < 6) T.kick.push(E(s0 + 8, 1, 0.8, 0.4));
      for (let s = 0; s < 16; s += 2) T.shaker.push(E(s0 + s, 1, s % 4 === 2 ? 0.55 : 0.35, 0));
      for (let s = 1; s < 16; s += 2) T.shaker.push(E(s0 + s, 1, 0.22, 0.5));
      if (b < 6) { T.wood.push(E(s0 + 4, 1, 0.7, 0, 1.01, { f: 1300 }), E(s0 + 12, 1, 0.6, 0, 1.01, { f: 940 })); }
      if (b >= 4 && b < 6) T.hat.push(...[2, 6, 10, 14].map((s) => E(s0 + s, 1, 0.45, 0.3)));
      if (b === 6) for (let k = 0; k < 8; k++) T.snare.push(E(s0 + 8 + k, 1, 0.2 + 0.35 * (k / 7), 0));
      if (b === 7) {
        for (let k = 0; k < 14; k++) T.snare.push(E(s0 + k, 1, 0.3 + 0.7 * (k / 13), 0));
        riser(T, s0, 14, 0);
      }
      continue;
    }
    // ---- kick
    T.kick.push(E(s0, 1, 1));
    if (!f) T.kick.push(E(s0 + 8, 1, 0.92));
    if (f) T.kick.push(E(s0 + 6, 1, 0.6, 0.3));
    if (!f) {
      T.kick.push(E(s0 + (odd ? 14 : 6), 1, 0.55, 0.3));
      T.kick.push(E(s0 + 4, 1, 0.74, 0.52), E(s0 + 12, 1, 0.74, 0.52));
      if (kind === 'B') T.kick.push(E(s0 + 3, 1, 0.5, 0.22), E(s0 + 11, 1, 0.5, 0.22));
    }
    // ---- backbeat
    T.snare.push(E(s0 + 4, 1, 0.95, 0.1));
    if (!f) T.snare.push(E(s0 + 12, 1, 1, 0.1));
    T.clap.push(E(s0 + 4, 1, 0.75, 0.28));
    if (!f) T.clap.push(E(s0 + 12, 1, 0.8, 0.28));
    if (!f && kind !== 'A') T.snare.push(E(s0 + (odd ? 15 : 7), 1, 0.32, 0.62));
    // woodblock plays the backbeat at the lowest intensities
    T.wood.push(E(s0 + 4, 1, 0.8, 0, 0.42, { f: 1250 }), E(s0 + 12, 1, 0.7, 0, 0.42, { f: 900 }));
    // ---- hats (swung 8ths with off-beat accents) + 16th ghosts
    for (let s = 0; s < 16; s += 2) {
      if (f && s >= 8) break;
      T.hat.push(E(s0 + s, 1, s % 4 === 2 ? 0.7 : 0.42, 0.15));
    }
    for (let s = 1; s < 16; s += 2) { if (!(f && s >= 8)) T.hat.push(E(s0 + s, 1, 0.22, 0.62)); }
    if (odd && !f) T.hat.push(E(s0 + 14, 3, 0.7, 0.34, 1.01, { k: 'o' }));
    // ---- shaker
    for (let s = 0; s < 16; s += 2) T.shaker.push(E(s0 + s, 1, s % 4 === 0 ? 0.4 : 0.3, 0));
    for (let s = 1; s < 16; s += 2) T.shaker.push(E(s0 + s, 1, s % 4 === 3 ? 0.3 : 0.2, 0.34));
    // ---- cowbell colour
    if (kind === 'B') { T.cow.push(E(s0, 1, 0.5, 0.5), E(s0 + 8, 1, 0.45, 0.5)); }
    else if (kind !== 'A' && !f) T.cow.push(E(s0 + 2, 1, 0.42, 0.78), E(s0 + 10, 1, 0.38, 0.78));
  }
  if (fill >= 0) {
    addFill(T, (bars - 1) * 16 + 8, fill);
    // cartoon slide-whistle swoop on some fills, otherwise the noise riser
    if (o.whistle) T.fx.push(E((bars - 1) * 16 + 6, 9, 0.8, 0.28, 1.01, { k: 'whistle', f0: 520 + (fill % 3) * 90, f1: 2300 }));
    else riser(T, (bars - 1) * 16 + 8, 8, 0.3);
  }
}

const BASS_PATTERNS = {
  stride: [[0, 3, 'r', 1, 0], [4, 3, '5', 0.78, 0], [8, 3, 'r', 0.92, 0], [12, 3, '5', 0.78, 0], [14, 2, 'a', 0.7, 0.5, 1]],
  bounce: [[0, 3, 'r', 1, 0], [3, 1, '8', 0.55, 0.3, 1], [6, 2, '5', 0.8, 0], [8, 3, 'r', 0.95, 0], [11, 1, '8', 0.55, 0.3, 1], [12, 2, '5', 0.8, 0], [14, 2, 'a', 0.72, 0.45, 1]],
  walk: [[0, 4, 'r', 1, 0], [4, 4, '3', 0.8, 0], [8, 4, '5', 0.9, 0], [12, 4, 'a', 0.85, 0]],
  sync: [[0, 3, 'r', 1, 0], [3, 3, 'r', 0.8, 0.2], [6, 2, '5', 0.85, 0], [8, 2, 'r', 0.95, 0], [10, 2, '8', 0.75, 0.2, 1], [12, 2, '7', 0.8, 0.3], [14, 2, 'a', 0.8, 0.4]],
  pump: [[0, 2, 'r', 1, 0], [2, 2, 'r', 0.7, 0], [4, 2, '8', 0.85, 0], [6, 2, 'r', 0.7, 0], [8, 2, 'r', 0.95, 0], [10, 2, 'r', 0.7, 0], [12, 2, '8', 0.85, 0], [14, 2, 'a', 0.8, 0]],
  gallop: [[0, 2, 'r', 1, 0], [3, 1, 'r', 0.7, 0], [4, 2, 'r', 0.9, 0], [6, 2, '8', 0.75, 0], [8, 2, 'r', 1, 0], [11, 1, 'r', 0.7, 0], [12, 2, 'r', 0.9, 0], [14, 2, 'a', 0.85, 0]],
  bossa: [[0, 5, 'r', 0.9, 0], [6, 2, '5', 0.7, 0], [8, 5, 'r', 0.85, 0], [14, 2, '5', 0.7, 0]],
  lazy: [[0, 6, 'r', 0.9, 0], [6, 2, '5', 0.6, 0], [8, 4, '3', 0.7, 0], [12, 4, '5', 0.75, 0]],
};
function bassBars(T, chords, bars, pattern, nextFirstRoot, { minI = 0 } = {}) {
  const pat = BASS_PATTERNS[pattern];
  for (let b = 0; b < bars; b++) {
    const s0 = b * 16;
    const nextCh = b < bars - 1 ? chordAt(chords, s0 + 16) : { root: nextFirstRoot };
    for (const [s, d, what, v, i, boing] of pat) {
      const ch = chordAt(chords, s0 + s);
      const nx = (s >= 8 && chordAt(chords, s0 + 15) !== ch) ? chordAt(chords, s0 + 15) : nextCh;
      T.bass.push(E(s0 + s, d, v, Math.max(i, minI), 1.01, { n: bassNote(ch, what, nx.root), k: boing ? 'b' : undefined }));
    }
  }
}

const STAB_PATTERNS = {
  offbeat: [[4, 2, 0.8, 0.1], [12, 2, 0.8, 0.1]],
  skank: [[2, 2, 0.6, 0.38], [6, 2, 0.62, 0.38], [10, 2, 0.6, 0.38], [14, 2, 0.62, 0.38], [4, 2, 0.8, 0.1], [12, 2, 0.8, 0.1]],
  charleston: [[0, 3, 0.85, 0.16], [6, 2, 0.8, 0.16], [8, 3, 0.7, 0.55], [14, 2, 0.65, 0.55]],
  tresillo: [[0, 2, 0.9, 0], [3, 2, 0.75, 0], [6, 2, 0.8, 0], [8, 2, 0.85, 0.2], [11, 2, 0.7, 0.2], [14, 2, 0.7, 0.2]],
  comp: [[6, 3, 0.7, 0], [10, 3, 0.6, 0], [14, 2, 0.5, 0.4]],
  sparse: [[6, 3, 0.7, 0]],
};
function stabBars(T, chords, bars, pattern, { lo = 57, center = 66, minI = 0, kind } = {}) {
  const pat = STAB_PATTERNS[pattern];
  let prev = null;
  for (let b = 0; b < bars; b++) {
    for (const [s, d, v, i] of pat) {
      const ch = chordAt(chords, b * 16 + s);
      const n = voiceChord(ch, { lo, center, prev });
      prev = n;
      T.stab.push(E(b * 16 + s, d, v, Math.max(i, minI), 1.01, { n, k: kind }));
    }
  }
}

const ARP_SHAPES = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 1, 2, 1], [3, 2, 1, 0], [0, 2, 3, 2]];
function arpBars(T, chords, bars, shape, { even = 0.42, odd = 0.78, from = 0, v = 0.7, kind } = {}) {
  const sh = ARP_SHAPES[shape % ARP_SHAPES.length];
  for (let b = 0; b < bars; b++) {
    for (let s = 0; s < 16; s++) {
      const ch = chordAt(chords, b * 16 + s);
      const pool = arpPool(ch);
      const n = pool[sh[s % 4]] + (b % 2 && s >= 8 ? 12 : 0);
      const accent = s % 4 === 0 ? 1 : s % 2 === 0 ? 0.7 : 0.45;
      if (b * 16 + s < from) continue;
      T.arp.push(E(b * 16 + s, 1, v * accent, s % 2 === 0 ? even : odd, 1.01, { n: Math.min(n, 96), k: kind }));
    }
  }
}
function padBars(T, chords, { i = 0, v = 0.7, lo = 50, center = 59, kind } = {}) {
  let prev = null;
  for (const ch of chords) {
    const n = voiceChord(ch, { lo, center, prev });
    prev = n;
    T.pad.push(E(ch.s, ch.d, v, i, 1.01, { n, k: kind }));
  }
}

function indexSection(sec) {
  const by = Array.from({ length: sec.steps }, () => []);
  for (const inst of INSTS) {
    for (const e of sec.tracks[inst]) {
      if (e.s >= 0 && e.s < sec.steps) by[e.s].push({ inst, e });
    }
  }
  sec.byStep = by;
  return sec;
}
function makeSection(id, bars, chords, tracks, extra = {}) {
  return indexSection({ id, bars, steps: bars * STEPS_PER_BAR, chords, tracks, ...extra });
}

// ------------------------------------------------------------------ GAME (bouncy cartoon / ragtime-meets-chiptune)
function buildGame(rng, rootPc) {
  const open = pickOf(rng, OPEN4);
  const closeA = pickOf(rng, CLOSE4);
  let closeB = pickOf(rng, CLOSE4);
  if (closeB === closeA) closeB = CLOSE4[(CLOSE4.indexOf(closeA) + 2) % CLOSE4.length];
  const bPair = pickOf(rng, B_PAIRS);
  const bridge = pickOf(rng, BRIDGES);
  const prog = { A: [...open, ...closeA], A2: [...open, ...closeB], B: bPair, C: bridge };
  const chordsOf = (id) => layoutChords(prog[id === 'A3' ? 'A' : id], rootPc);
  const order = ['A', 'A2', 'B', 'A3', 'C'];
  const bassPick = pickOf(rng, [['stride', 'bounce'], ['bounce', 'sync'], ['stride', 'sync']]);
  const bassFor = { A: bassPick[0], A2: bassPick[1], B: 'sync', A3: bassPick[1], C: 'walk' };
  const stabFor = { A: 'offbeat', A2: pickOf(rng, ['skank', 'charleston']), B: 'charleston', A3: 'skank', C: 'sparse' };
  const fills = [pickOf(rng, [0, 1, 2, 3]), pickOf(rng, [0, 1, 2, 3]), pickOf(rng, [0, 2, 3]), pickOf(rng, [1, 2, 3]), 0];
  const arpShape = Math.floor(rng() * ARP_SHAPES.length);

  // --- melody grammar
  const M = makeMotif(rng);
  let R = makeMotif(rng, { start: pickOf(rng, [2, 4, 0]) });
  if (R.length === M.length && R.every((q, k) => q.s === M[k].s && q.d === M[k].d)) R = varyRhythm(rng, R);
  const N = makeMotif(rng, { sparse: true, start: pickOf(rng, [4, 2, 0]) });
  const tpl = pickOf(rng, [
    (m, r) => [m, m, r], (m, r) => [m, shiftP(m, 1), m], (m, r) => [m, r, m], (m, r) => [m, shiftP(m, 2), r],
  ]);
  const openEnd = endingNotes(pickOf(rng, OPEN_ENDINGS));
  const closeEnds = [endingNotes(CLOSE_ENDINGS[Math.floor(rng() * CLOSE_ENDINGS.length)]), endingNotes(CLOSE_ENDINGS[Math.floor(rng() * CLOSE_ENDINGS.length)])];
  const openEnd2 = endingNotes(pickOf(rng, OPEN_ENDINGS));
  const graceP = 0.28;

  const sections = [];
  const gr = mulberry32(hashSeed(Math.floor(rng() * 1e9), 77));
  for (const id of order) {
    const base = id === 'A2' ? 'A' : id === 'A3' ? 'A' : id;
    const chords = chordsOf(id);
    const T = newTracks();
    const bars = 8;
    // melody notes (grammar)
    const notes = [];
    if (id === 'A' || id === 'A2' || id === 'A3') {
      let p1 = tpl(M, R);
      if (id === 'A2') p1 = [p1[0], p1[1], varyRhythm(rng, p1[2])];
      if (id === 'A3') p1 = [shiftP(p1[0], 0), p1[1], p1[2]];
      putBars(notes, 0, [...p1, openEnd]);
      let p2 = tpl(M, R);
      if (id === 'A2') p2 = [p2[0], p2[1], invertP(p2[2])];
      putBars(notes, 4, [...p2, closeEnds[id === 'A2' ? 1 : 0]]);
    } else if (id === 'B') {
      const NB = shiftP(N, 3);
      putBars(notes, 0, [NB, shiftP(NB, 1), shiftP(NB, 2), endingNotes(OPEN_ENDINGS[2])]);
      putBars(notes, 4, [NB, shiftP(NB, 2), M, openEnd2]);
    } else {  // bridge: held tones + an echo of the hook's call cell
      const call = M.filter((q) => q.s < 8);
      const hold = (p) => [{ s: 0, d: 12, p }];
      putBars(notes, 0, [hold(4), hold(2), hold(4), hold(7)]);
      putBars(notes, 4, [hold(4), hold(2), call, null]);
    }
    const lead = realize(notes, chords, { tonic: tonicMid(rootPc), rng: gr, grace: id === 'C' ? 0 : graceP, i: id === 'C' ? 0.15 : 0.2, vel: id === 'B' ? 0.8 : 0.88 });
    T.lead.push(...lead);
    // octave doubling when the round is hot
    for (const e of lead) if (!e.g && id !== 'C') T.lead.push(E(e.s, e.d, e.v * 0.5, 0.72, 1.01, { n: Math.min(e.n + 12, 100), k: 'hi' }));
    // --- accompaniment
    gameDrums(T, { bars, kind: id === 'A2' || id === 'A3' ? 'A2' : base, fill: fills[order.indexOf(id)], whistle: (fills[order.indexOf(id)] + order.indexOf(id) + (rng() < 0.5 ? 1 : 0)) % 3 === 0 });
    bassBars(T, chords, bars, bassFor[id], chordsOf(nextFirstId(order, id))[0].root, { minI: id === 'C' ? 0.2 : 0 });
    stabBars(T, chords, bars, stabFor[id], { minI: id === 'C' ? 0.3 : 0 });
    if (id === 'C') {
      padBars(T, chords, { i: 0, v: 0.8 });
      arpBars(T, chords, bars, arpShape, { even: 0.1, odd: 0.55, v: 0.8 });
    } else {
      arpBars(T, chords, bars, arpShape, { even: id === 'A' ? 0.46 : 0.4, odd: 0.8 });
      padBars(T, chords, { i: id === 'B' ? 0.35 : 0.55, v: 0.55 });
    }
    crash(T, 0, id === 'A' || id === 'A3' ? 0.85 : 0.65, 0.12);
    sections.push(makeSection(id, bars, chords, T, { crash: true }));
  }
  return sections;
}
function nextFirstId(order, id) { return order[(order.indexOf(id) + 1) % order.length]; }

// ------------------------------------------------------------------ TENSE (sudden death)
function buildTense(rng, rootPc) {
  const progA = pickOf(rng, MINOR4);
  let progB = pickOf(rng, MINOR4);
  if (progB === progA) progB = MINOR4[(MINOR4.indexOf(progA) + 1) % MINOR4.length];
  const hooks = [[0, 0, 1, 0, 0, 0, -1, 0], [4, 4, 3, 4, 2, 0, 1, 0], [0, 2, 1, 0, 4, 2, 3, 2]];
  const hook = pickOf(rng, hooks);
  const cellA = pickOf(rng, TENSE_CELLS), cellB = pickOf(rng, TENSE_CELLS);
  const mkMotif = (shift) => {
    const notes = [];
    let k = 0;
    for (const [s, d] of cellA) notes.push({ s, d, p: hook[k++ % hook.length] + shift });
    for (const [s, d] of cellB) notes.push({ s: 8 + s, d, p: hook[k++ % hook.length] + shift });
    return notes;
  };
  const sections = [];
  const specs = [
    { id: 'TA', prog: [...progA, ...progA], bass: 'pump', stab: 'tresillo' },
    { id: 'TB', prog: [...progB, ...progA], bass: 'gallop', stab: 'tresillo' },
    { id: 'TC', prog: [...progA, ...progB], bass: 'pump', stab: 'tresillo' },
  ];
  const gr = mulberry32(hashSeed(Math.floor(rng() * 1e9), 78));
  specs.forEach((sp, idx) => {
    const chords = layoutChords(sp.prog, rootPc, true);
    const T = newTracks();
    const bars = 8;
    const notes = [];
    for (let b = 0; b < bars; b++) {
      if (b === 3 || b === 7) {
        // the "stab-stab-HOLD" answer
        notes.push({ s: b * 16, d: 2, p: 0 }, { s: b * 16 + 3, d: 2, p: 0 }, { s: b * 16 + 6, d: 2, p: 1 }, { s: b * 16 + 8, d: 8, p: b === 7 ? 4 : 2 });
      } else putBars(notes, b, [mkMotif(idx === 2 ? 2 : 0)]);
    }
    const lead = realize(notes, chords, { tonic: tonicMid(rootPc), rng: gr, grace: 0.2, i: 0, vel: 0.86, lo: 62, hi: 89, extra: { k: 'edge' } });
    T.lead.push(...lead);
    // drums: driving four-on-the-floor, 16th hats, ticking clock
    for (let b = 0; b < bars; b++) {
      const s0 = b * 16, last = b === bars - 1;
      [0, 4, 8, 12].forEach((s, j) => T.kick.push(E(s0 + s, 1, j % 2 ? 0.8 : 1, 0)));
      if (!last) T.kick.push(E(s0 + 10, 1, 0.55, 0.25));
      T.snare.push(E(s0 + 4, 1, 1, 0), E(s0 + 12, 1, 1, 0));
      T.clap.push(E(s0 + 4, 1, 0.8, 0.1), E(s0 + 12, 1, 0.8, 0.1));
      for (let s = 0; s < 16; s += 2) T.hat.push(E(s0 + s, 1, s % 4 === 2 ? 0.75 : 0.45, 0));
      for (let s = 1; s < 16; s += 2) T.hat.push(E(s0 + s, 1, 0.26, 0.3));
      for (let s = 0; s < 16; s += 1) T.shaker.push(E(s0 + s, 1, s % 4 === 0 ? 0.45 : 0.28, 0.12));
      [0, 4, 8, 12].forEach((s, j) => T.wood.push(E(s0 + s + 2, 1, 0.55, 0, 1.01, { f: j % 2 ? 1450 : 1050 })));
      if (b % 2 === 1 && b !== 7) {
        [0, 4, 8, 12].forEach((s, j) => T.siren.push(E(s0 + s, 4, 0.7, 0.18, 1.01, { n: bassBase(chords[0].root) + 36 + (j % 2 ? 1 : 0) + (b === 5 ? 2 : 0), k: j % 2 ? 'b' : 'a' })));
      }
      if (b === 7) {
        for (let k = 0; k < 16; k++) T.snare.push(E(s0 + k, 1, 0.25 + 0.75 * (k / 15), 0));
        riser(T, s0, 16, 0);
      } else if (b === 3) {
        for (let k = 0; k < 8; k++) T.snare.push(E(s0 + 8 + k, 1, 0.3 + 0.6 * (k / 7), 0));
      }
      if (b % 4 === 0) T.fx.push(E(s0, 8, 0.7, 0, 1.01, { k: b === 0 ? 'crash' : 'boom' }));
    }
    bassBars(T, chords, bars, sp.bass, chords[0].root);
    stabBars(T, chords, bars, sp.stab, { lo: 55, center: 64 });
    arpBars(T, chords, bars, 2, { even: 0.25, odd: 0.6, v: 0.7, kind: 'sharp' });
    padBars(T, chords, { i: 0, v: 0.9, lo: 48, center: 57, kind: 'dark' });
    sections.push(makeSection(sp.id, bars, chords, T, { crash: true }));
  });
  return sections;
}

// ------------------------------------------------------------------ MENU (mellow lounge swing) and RESULTS
function buildMenu(rng, rootPc) {
  const A = pickOf(rng, MENU_A), B = pickOf(rng, MENU_B);
  const prog = { A, A2: A, B, A3: A };
  const order = ['A', 'A2', 'B', 'A3'];
  const M = makeMotif(rng, { sparse: true, start: pickOf(rng, [4, 2]) });
  const R = makeMotif(rng, { sparse: true, start: pickOf(rng, [2, 0, 4]) });
  const N = makeMotif(rng, { sparse: true, start: 4, callCells: CALL_CELLS.slice(0, 5) });
  const openEnd = endingNotes(pickOf(rng, OPEN_ENDINGS.slice(0, 2)));
  const closeEnd = endingNotes(pickOf(rng, [CLOSE_ENDINGS[0], CLOSE_ENDINGS[2]]));
  const bassPick = pickOf(rng, ['walk', 'bossa']);
  const gr = mulberry32(hashSeed(Math.floor(rng() * 1e9), 79));
  const sections = [];
  order.forEach((id, idx) => {
    const chords = layoutChords(prog[id], rootPc);
    const T = newTracks();
    const notes = [];
    if (id === 'B') {
      putBars(notes, 0, [N, echoOf(N), shiftP(N, 1), null]);
      putBars(notes, 4, [N, shiftP(N, 2), M, openEnd]);
    } else {
      putBars(notes, 0, [M, id === 'A2' ? varyRhythm(rng, M) : echoOf(M), R, echoOf(R)]);
      putBars(notes, 4, [M, id === 'A3' ? shiftP(M, 2) : echoOf(M), R, id === 'A3' ? closeEnd : openEnd]);
    }
    T.lead.push(...realize(notes, chords, { tonic: tonicMid(rootPc), rng: gr, grace: 0.12, i: 0, vel: 0.78, lo: 66, hi: 90, extra: { k: 'marimba' } }));
    for (let b = 0; b < 8; b++) {
      const s0 = b * 16, last = b === 7;
      T.kick.push(E(s0, 1, 0.8, 0), E(s0 + 8, 1, 0.62, 0));
      if (b % 2 === 1) T.kick.push(E(s0 + 11, 1, 0.4, 0.4));
      T.wood.push(E(s0 + 4, 1, 0.55, 0, 1.01, { f: 1100 }), E(s0 + 12, 1, 0.5, 0, 1.01, { f: 820 }));
      for (let s = 0; s < 16; s += 2) T.shaker.push(E(s0 + s, 1, s % 4 === 2 ? 0.5 : 0.3, 0));
      for (let s = 1; s < 16; s += 2) T.shaker.push(E(s0 + s, 1, 0.2, 0.6));
      for (let s = 2; s < 16; s += 4) T.hat.push(E(s0 + s, 1, 0.38, 0.55));
      if (last) {
        [0, 2, 3, 4, 6, 7].forEach((k, j) => T.shaker.push(E(s0 + 8 + k, 1, 0.3 + 0.07 * j, 0)));
        T.tom.push(E(s0 + 12, 2, 0.5, 0, 1.01, { f: 190 }), E(s0 + 14, 2, 0.5, 0, 1.01, { f: 150 }));
      }
    }
    crash(T, 0, 0.45, 0.2);
    bassBars(T, chords, 8, id === 'B' ? 'walk' : bassPick, chords[0].root);
    stabBars(T, chords, 8, 'comp', { lo: 55, center: 64, kind: 'ep' });
    padBars(T, chords, { i: 0, v: 0.8, kind: 'soft' });
    arpBars(T, chords, 8, idx % ARP_SHAPES.length, { even: 0.5, odd: 0.95, v: 0.55, kind: 'marimba' });
    sections.push(makeSection(id, 8, chords, T, { crash: true }));
  });
  return sections;
}

function buildResults(rng, rootPc) {
  const sections = [];
  const gr = mulberry32(hashSeed(Math.floor(rng() * 1e9), 80));
  // ---- fanfare (4 bars): I - IV - V - I, brass over timpani/toms, then a crash
  {
    const prog = [[[0, 'maj']], [[5, 'maj']], [[7, 'dom7']], [[0, 'maj6']]];
    const chords = layoutChords(prog, rootPc);
    const T = newTracks();
    const notes = [
      { s: 0, d: 2, p: 4 }, { s: 2, d: 2, p: 4 }, { s: 4, d: 2, p: 4 }, { s: 6, d: 2, p: 7 }, { s: 8, d: 8, p: 9 },
      { s: 16, d: 2, p: 2 }, { s: 18, d: 2, p: 2 }, { s: 20, d: 2, p: 2 }, { s: 22, d: 2, p: 4 }, { s: 24, d: 8, p: 7 },
      { s: 32, d: 1, p: 0 }, { s: 33, d: 1, p: 2 }, { s: 34, d: 1, p: 4 }, { s: 35, d: 1, p: 7 }, { s: 36, d: 1, p: 9 }, { s: 37, d: 1, p: 11 }, { s: 38, d: 2, p: 9 }, { s: 40, d: 8, p: 11 },
      { s: 48, d: 3, p: 4 }, { s: 51, d: 1, p: 4 }, { s: 52, d: 12, p: 7 },
    ];
    const lead = realize(notes, chords, { tonic: tonicMid(rootPc), rng: gr, grace: 0, i: 0, vel: 0.95, lo: 52, hi: 93, extra: { k: 'brass' } });
    T.lead.push(...lead);
    for (const e of lead) if (e.n >= 64) T.lead.push(E(e.s, e.d, e.v * 0.55, 0, 1.01, { n: e.n - 12, k: 'brass' }));
    for (let b = 0; b < 4; b++) {
      const s0 = b * 16;
      T.kick.push(E(s0, 1, 1), E(s0 + 8, 1, 0.9));
      if (b < 3) { T.snare.push(E(s0 + 4, 1, 0.8), E(s0 + 12, 1, 0.9)); T.clap.push(E(s0 + 4, 1, 0.6), E(s0 + 12, 1, 0.6)); }
      [0, 2, 4, 6, 8, 10, 12, 14].forEach((s, j) => T.hat.push(E(s0 + s, 1, j % 2 ? 0.65 : 0.4)));
    }
    for (let k = 0; k < 8; k++) T.snare.push(E(40 + k, 1, 0.3 + 0.55 * (k / 7)));
    T.snare.push(E(48, 1, 1));
    [0, 4].forEach((s) => T.tom.push(E(s, 2, 0.9, 0, 1.01, { f: 140 })));
    T.fx.push(E(48, 16, 1, 0, 1.01, { k: 'crash' }), E(0, 8, 0.6, 0, 1.01, { k: 'crash' }));
    riser(T, 40, 8, 0);
    chords.forEach((ch) => T.stab.push(E(ch.s, Math.min(ch.d, 6), 0.9, 0, 1.01, { n: voiceChord(ch, { lo: 55, center: 63 }), k: 'brass' })));
    bassBars(T, chords, 4, 'stride', rootPc);
    padBars(T, chords, { i: 0, v: 0.9, kind: 'bright' });
    sections.push(makeSection('F', 4, chords, T));
  }
  // ---- relaxed loop (two 8-bar sections)
  const A = pickOf(rng, MENU_A);
  const B = pickOf(rng, MENU_B);
  const M = makeMotif(rng, { sparse: true, start: 4 });
  const R = makeMotif(rng, { sparse: true, start: 2 });
  ['R1', 'R2'].forEach((id, idx) => {
    const chords = layoutChords(idx ? B : A, rootPc);
    const T = newTracks();
    const notes = [];
    putBars(notes, 0, [M, echoOf(M), R, echoOf(R)]);
    putBars(notes, 4, [M, echoOf(M), idx ? shiftP(R, 2) : R, endingNotes(CLOSE_ENDINGS[0])]);
    T.lead.push(...realize(notes, chords, { tonic: tonicMid(rootPc), rng: gr, grace: 0.1, i: 0, vel: 0.75, lo: 66, hi: 92, extra: { k: 'bell' } }));
    for (let b = 0; b < 8; b++) {
      const s0 = b * 16;
      T.kick.push(E(s0, 1, 0.6), E(s0 + 8, 1, 0.45));
      T.clap.push(E(s0 + 4, 1, 0.3), E(s0 + 12, 1, 0.3));
      for (let s = 0; s < 16; s += 2) T.shaker.push(E(s0 + s, 1, s % 4 === 2 ? 0.5 : 0.3));
      for (let s = 2; s < 16; s += 4) T.hat.push(E(s0 + s, 1, 0.3, 0.5));
    }
    crash(T, 0, 0.4, 0.2);
    bassBars(T, chords, 8, 'lazy', chords[0].root);
    stabBars(T, chords, 8, 'comp', { lo: 55, center: 64, kind: 'ep' });
    padBars(T, chords, { i: 0, v: 0.85, kind: 'soft' });
    arpBars(T, chords, 8, idx + 1, { even: 0.5, odd: 0.95, v: 0.5, kind: 'marimba' });
    sections.push(makeSection(id, 8, chords, T, { crash: true }));
  });
  return sections;
}

// ------------------------------------------------------------------ public API
export const MODE_STYLE = {
  menu: { bpm: [96, 104], swing: 0.68 },
  game: { bpm: [120, 128], swing: 0.6 },
  tense: { bpm: [128, 134], swing: 0.22 },
  results: { bpm: [106, 112], swing: 0.5 },
};
const KIND_SALT = { menu: 11, game: 22, tense: 33, results: 44 };

/**
 * Deterministic song for (kind, seed). game / tense / results of one seed share the same key (so the sudden-death switch
 * stays in the family); the menu uses a related but different key and its own tune.
 */
export function generateSong(kind, seed = 1) {
  if (!KINDS.includes(kind)) kind = 'game';
  const base = mulberry32(hashSeed(seed, 5));
  const keyIdx = Math.floor(base() * KEYS.length);
  const rootPc = kind === 'menu' ? KEYS[(keyIdx + 3) % KEYS.length] : KEYS[keyIdx];
  const rng = mulberry32(hashSeed(seed, KIND_SALT[kind]));
  const st = MODE_STYLE[kind];
  const bpm = Math.round(st.bpm[0] + rng() * (st.bpm[1] - st.bpm[0]));
  const swing = Math.max(0, Math.min(1, st.swing + (rng() - 0.5) * 0.08));
  let sections, loopFrom = 0;
  switch (kind) {
    case 'menu': sections = buildMenu(rng, rootPc); break;
    case 'tense': sections = buildTense(rng, rootPc); break;
    case 'results': sections = buildResults(rng, rootPc); loopFrom = 1; break;
    default: sections = buildGame(rng, rootPc);
  }
  return { kind, seed, rootPc, key: pcName(rootPc) + (kind === 'tense' ? 'm' : ''), bpm, swing, sections, loopFrom, totalBars: sections.reduce((a, s) => a + s.bars, 0) };
}

/** Section lookup helper for a running position: global bar counter -> { section index, step offset } (handles intro + loop). */
export function locateBar(song, bar) {
  const secs = song.sections;
  let b = Math.max(0, Math.floor(bar));
  let idx = 0;
  const introBars = secs.slice(0, song.loopFrom).reduce((a, s) => a + s.bars, 0);
  if (b >= introBars) {
    const loopBars = secs.slice(song.loopFrom).reduce((a, s) => a + s.bars, 0);
    b = introBars + ((b - introBars) % loopBars);
  }
  for (; idx < secs.length; idx++) { if (b < secs[idx].bars) break; b -= secs[idx].bars; }
  return { index: Math.min(idx, secs.length - 1), bar: b };
}
