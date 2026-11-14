// Adaptive music -- an adaptive jazz-fusion score on synths, synthesised live with the Web Audio API.
// From Last Drop by Meticulai (meticulai.com). MIT licence (see LICENSE).
// No files, no fetch, no samples, no dependencies. Usable on its own (src/index.js wraps it with generic names):
//
//   import { Music } from './music.js';
//   const music = new Music(ctx, destNode);   // ctx may be an AudioContext or an OfflineAudioContext
//   music.update(state, dt);                  // every frame (also drives the scheduler)
//   music.event('bloom', { n: 2, of: 6 });    // musical stingers
//
// Every method is a silent no-op when construction failed, and none of them throws.
//
// Style: late-70s / 80s jazz fusion and smooth jazz played on synths, for a golden-hour drive: an 80s FM-style electric
// piano comping rootless 9th/11th/13th voicings, a ladder-filter-style synth bass (syncopated, or walking in the swing chorus), a warm
// synth lead that turns breathy and sax-like in the bridge, vibes for the sparkles, and a jazz kit (ride, hats,
// brushes, cross-stick) with a swung feel. Key: F major, with ii-V-Is, tritone substitutions and a classic
// IV-III7-vi-v bridge in the relative minor; the run resolves to Fmaj9 at the finish ("oasis" in the game).
// Event and state names below are the game's own (a water drop rolling across a desert: puddles, desert flowers,
// checkpoints, an oasis at the end, evaporating if it runs dry). src/index.js maps them to generic names.
//
// Instruments. The melodic mono synths and the pad are PERSISTENT voices built once (no per-note graph building):
//   pad    5 voices x 1 saw (detuned, panned L/R alternately) -> lowpass: soft "strings" behind the piano; swells at sunset
//   ep     electric piano: FM tine + body (the classic 80s FM electric piano recipe), two velocity layers pre-rendered at six pitches
//          and repitched; chords are one-shots (one buffer source per note) that choke the previous chord. Bus:
//          lowpass tone -> stereo tremolo (the classic electric-piano auto-pan) -> mix, reverb and a little delay
//   clav   (the old arp voice) mono square + saw through a plucky resonant filter: syncopated funk single-note lines
//          on chord tones; 8ths when slow, 16ths when fast; level follows the speed
//   bass   mono sine sub + lowpassed saw with a pluck envelope on the filter (its harmonics carry on phone speakers)
//   lead   mono saw + square + breath noise -> lowpass -> formant peak: "moog" (filter pluck), "sax" (breath,
//          formant, scoops), "soar" and "breath" tones; scoops, falls, legato glide, delayed vibrato
//   drums  jazz/fusion kit, pre-rendered once: kick, snare (+ghosts), cross-stick, ride, ride bell, closed hat,
//          hat foot chick, open hat, crash, tom, conga, shaker, brush tap and brush sweep; plus the danger tick and
//          heartbeat
//   vibes  pre-rendered vibraphone bars (puddle shimmer, blooms, checkpoints) through a motor tremolo
//   fx     ping-pong dotted-8th delay, an algorithmic ~2.6 s reverb (modulated combs + allpasses), tanh
//          saturation, and a "tape" DelayNode whose time wobbles slowly (pitch drift) and ramps up on death
//          (tape stop); cymbal swells (filtered noise) for airtime and checkpoints
//
// Form. A lookahead scheduler (16th-note steps, ~160 ms ahead on the audio clock, driven from update() and a
// 40 ms timer) asks a small conductor at every bar which section plays. Phrases are 8 bars; a bar holds one chord
// or two (the second on beat 3). Swing: "s16" sections swing the 16ths (ratio ~0.6, the smooth-jazz shuffle),
// "s8" sections swing the 8ths (ballad and straight-ahead feel).
//   menu     76 BPM ballad, s8: Fmaj9 | Em7b5 A7alt | Dm9 | Db9#11 | Cm9 | F13 | Bbmaj9 | Bbm9 Eb13 (backdoor home);
//            piano, strings, soft brushes, a breathy melody every other chorus
//   intro    100 BPM, s16: a vamp, Gm11 C13sus Gm11 C13sus Fmaj9 Fmaj9#11 Bbmaj9 Am7-D7alt; piano, clav, bass, kit
//   build    after checkpoint 1: the head (the theme) on the 'moog' lead patch, Fmaj9 Bb9#11 Am9 D13b9 Gm9 C13 ...
//   groove   after checkpoint 2: the bridge, Bbmaj9 A7alt Dm9 Cm9-F13 ... on the sax-like lead, congas
//   glow     after checkpoint 3: a swing chorus (s8): walking bass, ride, a bebop-ish solo over chromatic ii-subVs
//   sunset   checkpoint 4 or progress > 0.8: the head again over a lusher reharmonisation, soaring lead, strings
//   tension  danger high: D minor-major vamp over a D pedal, stabs, insistent clav, ride bell, ticks and heartbeat
//   outro    after the oasis: 76 BPM ballad resolving to F6/9, a closing melody, brushes
//   silence  after evaporating: a tape stop, then a barely audible Dm11 pad
// Checkpoints play a fill + cymbal swell and move to the next section on the following downbeat (with a crash).
//
// Gameplay mappings: speed -> drum density (ride and cross-stick when slow; hats, snare backbeat and ghosts,
// congas, open hat when fast), busier piano comping, the clav's level, filter and 8th/16th rate. Airborne -> the
// kit drops to a muffled pulse and a soft ride, bass out, piano and pad open up, the clav jumps an octave, a cymbal
// swell; landing -> kick + crash + a hard piano stab + bass root. Puddle -> vibes shimmer and a brightening.
// Danger -> tension section. Pause -> -10 dB.
//
// Levels (offline render through a copy of the game's master chain driven by a scripted run; nobody has listened
// yet). Music alone, after the chain: menu ~-27 dBFS RMS, run ~-25 to -22 (rising with the arc), end screen ~-25
// (the same as the chillwave score it replaced); fast sand hiss alone was ~-21 before the game's sound layer turned it down.
// Peaks <= -9 dBFS. The 300 Hz-3 kHz band carries more energy than everything under 300 Hz in every section but
// tension (heartbeat and pedal: about even) (phone speakers). CPU: ~0.04 ms per scheduler tick on a desktop
// (p99 ~0.2 ms); ~36 render jobs of <= ~4 ms each warm (a cold first job can take longer), ~30-50 ms in total, run
// inside a 5 ms budget per scheduler tick, the menu's piano and brushes first. About 10-12 one-shot voices on
// average (piano chords are 4-5 voices; each new chord chokes the last, each ride hit damps the previous one).

const LOOKAHEAD = 0.16;    // seconds of notes scheduled ahead of the audio clock
const TIMER_MS = 40;       // scheduler timer (update() also ticks it)
const PARAM_HZ = 20;       // continuous parameter re-targeting rate
const MAX_VOICES = 36;     // one-shot voices (drums, piano notes, vibes); groove hits yield above this
const HARD_VOICES = 48;    // stingers may go up to this
const RENDER_BUDGET = 5;   // ms of sample rendering per scheduler tick
const LEVEL = 0.16;        // music trim (sets the levels in the header)
const TAPE_BASE = 0.006;   // tape delay centre (s); the wobble LFOs swing around it
const BPM_RUN = 100, BPM_CALM = 76;
const EPS = 0.0001;

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
const rand = (a, b) => a + Math.random() * (b - a);
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const pcOf = (m) => ((m % 12) + 12) % 12;
const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

// ---------------------------------------------------------------- harmony

// Chord qualities. v: the four-note voicing above the root (rootless where idiomatic: the piano and the pad play
// these, the bass plays the root); c: a colour tone the pad's fifth voice and the piano's long chords add on top
// (-1: none); 3/5/7: the bass's third, fifth and seventh.
const QUAL = {
  'maj9': { v: [4, 7, 11, 14], c: 9, t: 4, f: 7, s: 11 },
  'maj9#11': { v: [4, 6, 11, 14], c: 7, t: 4, f: 7, s: 11 },
  '69': { v: [4, 7, 9, 14], c: -1, t: 4, f: 7, s: 9 },
  'm9': { v: [3, 7, 10, 14], c: 5, t: 3, f: 7, s: 10 },
  'm7': { v: [3, 7, 10, 14], c: -1, t: 3, f: 7, s: 10 },
  'm11': { v: [3, 10, 14, 17], c: 7, t: 3, f: 7, s: 10 },
  'mM9': { v: [3, 7, 11, 14], c: -1, t: 3, f: 7, s: 11 },
  'm7b5': { v: [3, 6, 10, 17], c: -1, t: 3, f: 6, s: 10 },
  '13': { v: [4, 9, 10, 14], c: -1, t: 4, f: 7, s: 10 },
  '13sus': { v: [5, 9, 10, 14], c: 7, t: 5, f: 7, s: 10 },
  '13b9': { v: [4, 9, 10, 13], c: -1, t: 4, f: 7, s: 10 },
  '9#11': { v: [4, 10, 14, 18], c: 9, t: 4, f: 7, s: 10 },
  '7alt': { v: [4, 10, 15, 20], c: 13, t: 4, f: 7, s: 10 },
};
const PCN = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const acc = (a) => (a === 'b' ? -1 : a === '#' ? 1 : 0);

// 'Bbmaj9#11/D' -> { root, bass, tones (4 pcs), color, third, fifth, seventh }; parsed once and cached.
const CHORDS = {};
function chord(name) {
  let ch = CHORDS[name];
  if (ch) return ch;
  const m = /^([A-G])([b#]?)([^/]*)(?:\/([A-G])([b#]?))?$/.exec(name) || [0, 'A', '', 'm7'];
  const root = pcOf(PCN[m[1]] + acc(m[2])), q = QUAL[m[3]] || QUAL.m7;
  ch = {
    name, root, bass: m[4] ? pcOf(PCN[m[4]] + acc(m[5])) : root,
    tones: q.v.map((i) => pcOf(root + i)), color: q.c >= 0 ? pcOf(root + q.c) : -1,
    third: q.t, fifth: q.f, seventh: q.s,
  };
  CHORDS[name] = ch;
  return ch;
}

// Progressions: one entry per bar, 'X' (whole bar) or 'X Y' (two chords, the second on beat 3).
const P = (s) => s.trim().split(/\s*\|\s*/).map((b) => { const c = b.split(/\s+/); return [c[0], c[1] || c[0]]; });
const PROG = {
  menu: P('Fmaj9 | Em7b5 A7alt | Dm9 | Db9#11 | Cm9 | F13 | Bbmaj9 | Bbm9 Eb13'),
  intro: P('Gm11 | C13sus | Gm11 | C13sus | Fmaj9 | Fmaj9#11 | Bbmaj9 | Am7 D7alt'),
  head: P('Fmaj9 | Bb9#11 | Am9 | D13b9 | Gm9 | C13 | Fmaj9 Dm9 | Gm9 C7alt'),
  bridge: P('Bbmaj9 | A7alt | Dm9 | Cm9 F13 | Bbmaj9 | A7alt | Dm9 G13 | Gm9 C7alt'),
  swing1: P('Dm9 | Db9#11 | Cm9 | B9#11 | Bbmaj9 | Am7 D7alt | Gm9 | Gb9#11'),
  swing2: P('Fmaj9 | Ebm9 Ab13 | Dbmaj9 | Dm7b5 G7alt | Cm9 | F13 | Bbmaj9 Am7 | Gm9 C7alt'),
  sun1: P('Fmaj9 | Bb9#11 | Am9 | Ab9#11 | Gm9 | C13 | Fmaj9 Dm9 | Gm9 C7alt'),
  sun2: P('Fmaj9 | Bb9#11 | Am9 | Ab9#11 | Gm9 | C13 | Fmaj9 Dm9 | Gm9 Gb9#11'),
  tension: P('DmM9 | DmM9 | Bbmaj9#11/D | A7alt/D | DmM9 | Ebmaj9#11/D | DmM9 | A7alt'),
  outro: P('Fmaj9 | Bbmaj9 | Am9 | Abmaj9#11 | Gm11 | C13sus | Fmaj9 | F69'),
  silence: P('Dm11'),
};
for (const k in PROG) for (const bar of PROG[k]) { chord(bar[0]); chord(bar[1]); }

// ascending chord tones (voicing + root + colour) from `base` over three octaves
function ladderOf(ch, base, withColor) {
  const out = [];
  for (let m = base; m < base + 36; m++) {
    const pc = pcOf(m);
    if (pc === ch.root || ch.tones.indexOf(pc) >= 0 || (withColor && pc === ch.color)) out.push(m);
  }
  return out;
}
const bassNote = (pc) => 33 + pcOf(pc - 9);   // A1 .. G#2

// ---------------------------------------------------------------- melodies

// Melodies are written as 'bar.step:length:note' tokens on the 16th grid of an 8-bar phrase (steps are swung by the
// section's feel when played). Flags after the note: ^ scoop up into it, v fall off at the end, ' ghost (soft),
// ~ wide vibrato. Parsed once into flat [pos, len, midi, flags] arrays.
const NOTE = (s) => { const m = /^([A-G])([b#]?)(-?\d)$/.exec(s); return m ? 12 * (+m[3] + 1) + PCN[m[1]] + acc(m[2]) : 60; };
function mel(src) {
  const out = [];
  for (const tok of src.trim().split(/\s+/)) {
    const [pos, len, note] = tok.split(':'), [bar, step] = pos.split('.');
    const fl = (note.indexOf('^') >= 0 ? 1 : 0) | (note.indexOf('v') >= 0 ? 2 : 0) | (note.indexOf("'") >= 0 ? 4 : 0) | (note.indexOf('~') >= 0 ? 8 : 0);
    out.push(+bar * 16 + +step, +len, NOTE(note.replace(/[\^v'~]/g, '')), fl);
  }
  return out;
}
const HEAD_A = `0.2:2:C5 0.4:2:F5 0.6:2:G5 0.8:5:A5^ 0.13:1:G5' 0.14:2:F5
  1.0:6:E5~ 1.6:2:D5 1.8:4:C5 1.14:2:B4'
  2.0:4:C5 2.4:2:E5 2.6:2:G5 2.8:6:B5^ 2.14:2:A5
  3.0:6:F#5 3.6:2:Eb5 3.8:4:D5 3.12:2:C5 3.14:2:A4'`;
const MEL = {
  // the head (build and sunset), over Fmaj9 Bb9#11 Am9 D13b9 | Gm9 C13 Fmaj9-Dm9 Gm9-C7alt
  HEAD: mel(HEAD_A + ` 4.0:4:Bb4 4.4:2:D5 4.6:2:F5 4.8:6:A5^ 4.14:2:G5
    5.0:4:E5 5.4:2:D5 5.6:2:C5 5.8:6:A5^~ 5.14:2:G5
    6.0:8:F5~ 6.10:2:C5 6.12:2:F5
    7.0:2:A5 7.2:2:F5 7.4:2:D5 7.6:2:Bb4 7.8:2:Db5 7.10:2:Eb5 7.12:4:E5`),
  HEAD2: mel(HEAD_A + ` 4.0:2:Bb4 4.2:2:D5 4.4:2:F5 4.6:2:A5 4.8:4:C6^ 4.12:2:Bb5 4.14:2:A5
    5.0:4:G5 5.4:2:E5 5.6:2:D5 5.8:6:E5~ 5.14:2:F5'
    6.0:6:A5~ 6.6:2:G5 6.8:2:F5 6.10:2:E5 6.12:4:C5
    7.0:6:D5~ 7.6:2:C5 7.8:2:Db5 7.10:2:Bb4 7.12:4:E5`),
  // the bridge (sax), over Bbmaj9 A7alt Dm9 Cm9-F13 | Bbmaj9 A7alt Dm9-G13 Gm9-C7alt
  BR: mel(`0.2:2:F5 0.4:2:D5 0.6:2:F5 0.8:6:A5^ 0.14:2:G5'
    1.0:4:F5 1.4:2:Eb5 1.6:2:C#5 1.8:6:C5v
    2.2:2:A4 2.4:2:C5 2.6:2:D5 2.8:2:E5 2.10:4:F5^ 2.14:2:E5
    3.0:4:Eb5 3.4:2:D5 3.6:2:C5 3.8:4:A4 3.12:4:D5v
    4.4:2:D5 4.6:2:F5 4.8:6:C6^ 4.14:2:Bb5'
    5.0:4:G5 5.4:2:F5 5.6:2:Eb5 5.8:6:C#5~
    6.0:4:D5 6.4:2:F5 6.6:2:A5 6.8:4:B5^ 6.12:2:A5 6.14:2:F5
    7.0:4:D5 7.4:2:Bb4 7.6:2:A4 7.8:2:Ab4 7.10:2:Bb4 7.12:2:Db5 7.14:2:E5`),
  // the swing chorus solo (8th-note lines), over Dm9 Db9#11 Cm9 B9#11 Bbmaj9 Am7-D7alt Gm9 Gb9#11
  SOLO1: mel(`0.2:2:A4 0.4:2:C5 0.6:2:E5 0.8:2:G5 0.10:2:F5 0.12:2:E5 0.14:2:D5
    1.0:4:F5^ 1.4:2:Ab5 1.6:2:G5 1.8:2:F5 1.10:2:Eb5 1.12:2:Db5 1.14:2:D5
    2.0:4:Eb5 2.4:2:G5 2.6:2:Bb5 2.8:4:D6^ 2.12:2:C6 2.14:2:A5
    3.0:4:A5 3.4:2:F#5 3.6:2:F5 3.8:2:D#5 3.10:2:F#5 3.12:2:F5 3.14:2:C#5
    4.0:6:D5~ 4.6:2:E5 4.8:2:F5 4.10:2:A5 4.12:4:C6
    5.0:2:B5 5.2:2:A5 5.4:2:G5 5.6:2:E5 5.8:2:F#5 5.10:2:Eb5 5.12:2:C5 5.14:2:A4
    6.0:4:Bb4 6.4:2:D5 6.6:2:F5 6.8:6:A5^~
    7.2:2:Bb5 7.4:2:Ab5 7.6:2:E5 7.8:2:C5 7.10:2:Db5 7.12:2:Eb5 7.14:2:E5`),
  // ... and over Fmaj9 Ebm9-Ab13 Dbmaj9 Dm7b5-G7alt Cm9 F13 Bbmaj9-Am7 Gm9-C7alt
  SOLO2: mel(`0.0:4:F5 0.4:2:A5 0.6:2:C6 0.8:4:E6^ 0.12:2:D6 0.14:2:C6
    1.0:4:Bb5 1.4:2:Gb5 1.6:2:F5 1.8:2:Eb5 1.10:2:F5 1.12:2:Gb5 1.14:2:Eb5
    2.0:6:F5^~ 2.6:2:Eb5 2.8:2:C5 2.10:2:Ab4 2.12:2:Bb4 2.14:2:C5
    3.0:2:D5 3.2:2:F5 3.4:2:Ab5 3.6:2:C6 3.8:2:B5 3.10:2:Ab5 3.12:2:F5 3.14:2:Db5
    4.0:4:C5 4.4:2:Eb5 4.6:2:G5 4.8:4:Bb5 4.12:2:D6 4.14:2:C6
    5.0:6:A5~ 5.6:2:G5 5.8:2:F5 5.10:2:D5 5.12:2:Eb5 5.14:2:C5
    6.0:4:D5 6.4:2:F5 6.6:2:A5 6.8:2:G5 6.10:2:E5 6.12:2:C5 6.14:2:B4
    7.0:2:Bb4 7.2:2:D5 7.4:2:F5 7.6:2:A5 7.8:2:Ab5 7.10:2:Gb5 7.12:2:E5 7.14:2:Db5`),
  // menu ballad, over Fmaj9 Em7b5-A7alt Dm9 Db9#11 Cm9 F13 Bbmaj9 Bbm9-Eb13
  MENU: mel(`0.4:2:A4 0.6:2:C5 0.8:8:E5^~
    1.0:6:D5 1.8:2:F5 1.10:2:Eb5 1.12:4:C#5
    2.0:8:E5^~ 2.10:2:D5 2.12:2:C5 2.14:2:A4
    3.0:4:F5 3.4:2:Eb5 3.6:2:Db5 3.8:4:B4 3.14:2:D5'
    4.0:6:Eb5~ 4.6:2:D5 4.8:2:C5 4.10:2:Bb4 4.12:4:G4
    5.0:4:A4 5.4:2:C5 5.6:2:D5 5.8:6:Eb5^
    6.0:8:D5~ 6.10:2:F5 6.12:4:A5
    7.0:6:Ab5 7.6:2:F5 7.8:8:G5~`),
  // outro, over Fmaj9 Bbmaj9 Am9 Abmaj9#11 Gm11 C13sus Fmaj9 F69
  OUT: mel(`0.4:2:G5 0.6:2:A5 0.8:8:C6~
    1.2:2:A5 1.4:2:F5 1.6:2:D5 1.8:8:E5^~
    2.4:2:C5 2.6:2:E5 2.8:8:B5~
    3.0:4:C6 3.4:2:Bb5 3.6:2:G5 3.8:4:Eb5 3.12:4:D5
    4.0:6:Bb4 4.6:2:C5 4.8:8:D5~
    5.4:2:G5 5.6:2:A5 5.8:8:Bb5~
    6.0:16:A5^~`),
};

// ---------------------------------------------------------------- rhythm

// Piano comping, per section style: layers [minimum density, [bar A, bar B]] (the highest layer reached plays;
// odd and even bars alternate). L long chord (held to the next hit), l soft long, S short stab, s ghost stab,
// P push: the NEXT chord anticipated on the "and of 4" (the following downbeat is then left out).
const COMP = {
  ballad: [[0, ['L.........l.....', 'L.......l.....P.']]],
  groove: [[0, ['L.........S.....', 'L.....S.......P.']], [0.42, ['L.....S.....S...', '...S..S...L...P.']], [0.76, ['L..s..S...s.S...', '.s.S..s...S..sP.']]],
  swing: [[0, ['L.....S.........', '........L.....P.']], [0.45, ['L.....S...S.....', '..S.....S.....P.']], [0.76, ['L.S...S...S.S...', '..S.S...S..S..P.']]],
  tension: [[0, ['L.......S..S....', 'L.....S.....S...']], [0.62, ['S.S.S.S.S.S.S.S.', 'S..S..S.S..S..S.']]],
};

// Clav lines: 16 steps of indices into the chord-tone ladder (-1 rest). Slow running plays only the even steps.
const CLAV = {
  K1: [0, -1, -1, 2, -1, -1, 1, -1, -1, 3, -1, -1, 2, -1, -1, -1],
  K2: [0, -1, 2, -1, 3, -1, -1, 2, -1, 1, -1, 3, -1, 2, 1, -1],
  K3: [4, -1, 3, -1, -1, 2, -1, 3, -1, -1, 1, -1, 0, -1, 2, -1],
  T1: [0, 0, 2, 0, 0, 3, 0, 2, 0, 0, 2, 0, 3, 0, 1, 2],
};

// Bass: R root, O octave up, F fifth, 7 seventh, 3 third, A approach (a half step from the next chord's root).
const BASS = {
  fusion: [[0, 'R.........F...A.'], [0.42, 'R.....O...F...A.'], [0.78, 'R..R..O.R.F..7A.']],
  tension: [[0, 'R.R.O.R.R.R.O.R.'], [0.7, 'R.RRO.RRR.RRO.RR']],
};

// Drums: layers [minimum density, pattern]; every layer the density reaches adds its hits (upper case = accent).
const vp = (s) => { const a = new Float32Array(16); for (let i = 0; i < 16; i++) { const c = s[i]; a[i] = c === '.' ? 0 : c === c.toUpperCase() ? 1 : 0.55; } return a; };
const lay = (list) => list.map(([th, s]) => [th, vp(s)]);
const DR = {
  kick: lay([[0, 'K.........K.....'], [0.5, '......k.........'], [0.82, '...........k..k.']]),
  xstick: lay([[0.2, '............X...'], [0.45, '....X...........']]),
  snare: lay([[0.66, '....S.......S...'], [0.76, '.......s..s....s'], [0.9, '..s......s...s..']]),
  ride: lay([[0, 'R...r...R...r...'], [0.3, '..r.....r.r...r.']]),
  pedal: lay([[0.1, '....C.......C...']]),
  hat: lay([[0.6, 'H.h.H.h.H.h.H.h.'], [0.74, '.h.h.h.h.h.h.h.h']]),
  open: lay([[0.88, '..............O.']]),
  conga: lay([[0.4, '......c...c...C.'], [0.7, '..c.....c.c.c.C.']]),
  shk: lay([[0.62, 'x.X.x.X.x.X.x.X.']]),
  swRide: vp('R...R.r.R...R.r.'),
  brush: vp('T...T.t.T...T.t.'),
};

const ARC = ['intro', 'build', 'groove', 'glow', 'sunset'];
const isArc = (s) => ARC.indexOf(s) >= 0;

// feel: 's16' or 's8' and swing ratio; kit: drum style; comp: piano style; bass: bass style; clav: lines per
// phrase (null: none); leads: melody per phrase (cycled); tone: lead patch; pad/ep/clavLvl/leadLvl: levels;
// rich: colour-tone amount; drum: density multiplier; perc: congas and shaker.
const SECT = {
  menu: { bpm: BPM_CALM, feel: 's8', swing: 0.66, prog: ['menu'], kit: 'brush', drum: 0, comp: 'ballad', bass: 'two', bassLvl: 0.65, clav: null, leads: [null, 'MENU'], tone: 'breath', leadLvl: 0.6, pad: 0.7, ep: 1.2, rich: 0.7 },
  intro: { bpm: BPM_RUN, feel: 's16', swing: 0.58, prog: ['intro'], kit: 'fusion', drum: 0.75, comp: 'groove', bass: 'fusion', clav: ['K1', 'K2'], clavLvl: 0.9, leads: null, tone: 'moog', leadLvl: 0, pad: 0.45, ep: 1.2, rich: 0.5 },
  build: { bpm: BPM_RUN, feel: 's16', swing: 0.6, prog: ['head'], kit: 'fusion', drum: 0.9, comp: 'groove', bass: 'fusion', clav: ['K1', 'K2'], clavLvl: 0.6, leads: ['HEAD', 'HEAD2'], tone: 'moog', leadLvl: 0.9, pad: 0.4, ep: 0.9, rich: 0.5 },
  groove: { bpm: BPM_RUN, feel: 's16', swing: 0.6, prog: ['bridge'], kit: 'fusion', perc: true, drum: 1.0, comp: 'groove', bass: 'fusion', clav: ['K2', 'K3'], clavLvl: 0.6, leads: ['BR', null], tone: 'sax', leadLvl: 0.85, pad: 0.45, ep: 0.9, rich: 0.6 },
  glow: { bpm: BPM_RUN, feel: 's8', swing: 0.64, prog: ['swing1', 'swing2'], kit: 'swing', drum: 1.05, comp: 'swing', bass: 'walk', clav: null, leads: ['SOLO1', 'SOLO2'], tone: 'moog', leadLvl: 0.95, pad: 0.3, ep: 1.0, rich: 0.6 },
  sunset: { bpm: BPM_RUN, feel: 's16', swing: 0.6, prog: ['sun1', 'sun2'], kit: 'fusion', perc: true, drum: 1.1, comp: 'groove', bass: 'fusion', clav: ['K3', 'K1'], clavLvl: 0.45, leads: ['HEAD', 'HEAD2'], tone: 'soar', leadLvl: 1.1, pad: 0.9, ep: 0.85, rich: 1.0 },
  tension: { bpm: BPM_RUN, feel: 's16', swing: 0.54, prog: ['tension'], kit: 'T', drum: 0, comp: 'tension', bass: 'tension', bassLvl: 0.6, clav: ['T1'], clavLvl: 0.9, leads: null, tone: 'moog', leadLvl: 0, pad: 0.6, ep: 0.85, rich: 0 },
  outro: { bpm: BPM_CALM, feel: 's8', swing: 0.66, prog: ['outro'], kit: 'brush', drum: 0, comp: 'ballad', bass: 'two', bassLvl: 0.75, clav: null, leads: ['OUT', null], tone: 'soar', leadLvl: 0.8, pad: 0.9, ep: 1.0, rich: 1.0 },
  silence: { bpm: BPM_CALM, feel: 's8', swing: 0.66, prog: ['silence'], kit: null, drum: 0, comp: null, bass: null, clav: null, leads: null, tone: 'breath', leadLvl: 0, pad: 0.5, ep: 0, rich: 0 },
};
for (const k in SECT) { const S = SECT[k]; S.P = S.prog.map((p) => PROG[p]); S.plen = S.P[0].length; }

// Lead patches: saw/square/breath-noise mix, lowpass cutoff and Q, formant peak (Hz, dB), per-note filter pluck
// (cents), vibrato depth (cents) and rate, legato glide, scoop depth (semitones), delay and reverb sends.
const TONE = {
  moog: { saw: 0.9, sq: 0.35, br: 0, lp: 1900, q: 2.2, fF: 1400, fG: 0, env: 1500, vib: 12, vr: 5.2, glide: 0.04, scoop: 1, dly: 0.45, rev: 0.35 },
  sax: { saw: 0.55, sq: 0.6, br: 0.05, lp: 2700, q: 0.8, fF: 1250, fG: 7, env: 500, vib: 16, vr: 5.6, glide: 0.03, scoop: 2, dly: 0.25, rev: 0.4 },
  soar: { saw: 0.8, sq: 0.2, br: 0, lp: 2300, q: 1.2, fF: 2600, fG: 3, env: 900, vib: 15, vr: 5.0, glide: 0.06, scoop: 1, dly: 0.6, rev: 0.5 },
  breath: { saw: 0.3, sq: 0.25, br: 0.09, lp: 1500, q: 0.7, fF: 1100, fG: 4, env: 300, vib: 10, vr: 4.8, glide: 0.05, scoop: 1, dly: 0.5, rev: 0.55 },
};

// ---------------------------------------------------------------- sample rendering (plain JS math)

// RBJ biquad, in place. Only used at render time.
function biquad(d, type, f, q, sr) {
  const w = 2 * Math.PI * f / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al, a1 = -2 * cs / a0, a2 = (1 - al) / a0;
  b0 /= a0; b1 /= a0; b2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; d[i] = y;
  }
  return d;
}

// One cycle of sine in a table (phase in cycles), and a rational tanh: render-time maths without sin/tanh calls.
const SIN_N = 4096, SIN = new Float32Array(SIN_N);
for (let i = 0; i < SIN_N; i++) SIN[i] = Math.sin(2 * Math.PI * i / SIN_N);
const sinc = (ph) => SIN[(ph * SIN_N) & (SIN_N - 1)];
const sat = (x) => (x < -3 ? -1 : x > 3 ? 1 : x * (27 + x * x) / (27 + 9 * x * x));
const TWO_PI_INV = 1 / (2 * Math.PI);
const decay = (sr, tau) => Math.exp(-1 / (sr * tau));

function noiseArr(n) { const d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return d; }

// Peak-normalise and fade the tail so stops never click.
function finish(d, sr, peak = 0.9, fade = 0.02) {
  let m = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > m) m = a; }
  const k = m > 0 ? peak / m : 0, nf = Math.min(d.length, Math.floor(sr * fade));
  for (let i = 0; i < d.length; i++) d[i] *= k;
  for (let i = 0; i < nf; i++) d[d.length - 1 - i] *= i / nf;
  return d;
}

// Electric piano, the classic 80s FM electric piano idea in two operator pairs: a body (carrier with a ratio-1 modulator whose
// index falls from a bark to nearly pure) and a tine (the same carrier phase-modulated at 14x for a few ms: the
// metallic ping). Amplitude falls fast, then rings long; lower notes ring longer. A soft asymmetric saturation gives
// the hard layer its growl.
const EP_BASE = [50, 56, 62, 68, 74, 80];
function renderEP(sr, m, hard, len) {
  const f = mtof(m), dur = len || clamp(2.7 - (m - 50) * 0.04, 1.5, 2.7), n = Math.floor(sr * dur), d = new Float32Array(n);
  const tauA = clamp(2.2 - (m - 50) * 0.04, 0.9, 2.2);
  const kA = decay(sr, tauA), kA2 = decay(sr, 0.16), kI = decay(sr, hard ? 0.3 : 0.45), kT = decay(sr, 0.012), kTa = decay(sr, 0.25);
  const i0 = (hard ? 2.2 : 1.05) * TWO_PI_INV, ib = 0.32 * TWO_PI_INV, it0 = (hard ? 1.7 : 0.9) * TWO_PI_INV;
  const tAmp = hard ? 0.3 : 0.18, drive = hard ? 1.5 : 1.05, inc = f / sr, tinc = Math.min(14 * f, sr * 0.45) / sr;
  const na = Math.floor(sr * 0.0015);
  let pc = 0, pt = 0, eA = 1, eA2 = 1, eI = 1, eT = 1, eTa = 1;
  for (let i = 0; i < n; i++) {
    pc += inc; if (pc >= 1) pc -= 1;
    pt += tinc; if (pt >= 1) pt -= 1;
    const body = sinc(pc + (i0 * eI + ib) * sinc(pc)) * (0.7 * eA + 0.3 * eA2);
    const tine = sinc(pc + it0 * eT * sinc(pt)) * tAmp * eTa;
    const y = body + tine;
    d[i] = sat(drive * (y + 0.18 * y * y)) * (i < na ? i / na : 1);
    eA *= kA; eA2 *= kA2; eI *= kI; eT *= kT; eTa *= kTa;
  }
  biquad(d, 'hp', 45, 0.7, sr);
  biquad(d, 'lp', 9000, 0.7, sr);
  return finish(d, sr, 0.9, 0.06);
}

// Vibraphone bar: partials at 1, 4 and 10 times the fundamental (aluminium bars are tuned that way), the upper ones
// dying fast, and a soft mallet knock. The motor tremolo is on the vibes bus.
const VIB_BASE = [74, 81, 88];
function renderVibes(sr, m) {
  const f = mtof(m), n = Math.floor(sr * 2.2), d = new Float32Array(n);
  const i1 = f / sr, i2 = 3.98 * f / sr, i3 = Math.min(9.75 * f, sr * 0.45) / sr;
  const k1 = decay(sr, 1.5), k2 = decay(sr, 0.3), k3 = decay(sr, 0.06), kk = decay(sr, 0.003);
  const knock = biquad(noiseArr(Math.floor(sr * 0.02)), 'lp', 2500, 0.7, sr), nk = knock.length, na = Math.floor(sr * 0.001);
  let p1 = 0, p2 = 0, p3 = 0, e1 = 1, e2 = 0.3, e3 = 0.08, ek = 0.25;
  for (let i = 0; i < n; i++) {
    p1 += i1; if (p1 >= 1) p1 -= 1;
    p2 += i2; if (p2 >= 1) p2 -= 1;
    p3 += i3; if (p3 >= 1) p3 -= 1;
    let s = sinc(p1) * e1 + sinc(p2) * e2 + sinc(p3) * e3;
    if (i < nk) { s += knock[i] * ek; ek *= kk; }
    d[i] = s * (i < na ? i / na : 1);
    e1 *= k1; e2 *= k2; e3 *= k3;
  }
  return finish(d, sr, 0.9, 0.08);
}

// Kick: a soft sine dropping onto ~G1 with a little 2nd harmonic and a felt-beater click, through gentle tanh so
// its upper harmonics read on a phone speaker. Rounder and shorter than a dance kick.
function renderKick(sr) {
  const n = Math.floor(sr * 0.3), d = new Float32Array(n);
  const kp = decay(sr, 0.025), ka = decay(sr, 0.16), kh = decay(sr, 0.05), kc = decay(sr, 0.002), na = Math.floor(sr * 0.002);
  let ph = 0, ep = 1, ea = 1, eh = 1, ec = 1, lp = 0;
  for (let i = 0; i < n; i++) {
    ph += (49 + 85 * ep) / sr;
    if (ph >= 1) ph -= 1;
    lp += 0.2 * (Math.random() * 2 - 1 - lp);
    const x = sinc(ph) * ea + 0.35 * sinc(2 * ph) * eh + 0.35 * lp * ec;
    d[i] = sat(1.5 * x) * (i < na ? i / na : 1);
    ep *= kp; ea *= ka; eh *= kh; ec *= kc;
  }
  return finish(d, sr, 0.9, 0.03);
}

// Snare: two drum-head modes (185 and 330 Hz), a stick crack and the wires (band-passed noise ringing ~0.14 s).
function renderSnare(sr) {
  const n = Math.floor(sr * 0.35), d = new Float32Array(n);
  const wires = biquad(biquad(noiseArr(n), 'bp', 4200, 0.6, sr), 'hp', 1800, 0.7, sr);
  const kb = decay(sr, 0.07), kb2 = decay(sr, 0.04), kw = decay(sr, 0.13), kc = decay(sr, 0.004);
  let eb = 1, eb2 = 1, ew = 1, ec = 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const r = Math.random() * 2 - 1;
    d[i] = 0.55 * sinc((185 * t) % 1) * eb + 0.3 * sinc((330 * t) % 1) * eb2 + 1.1 * wires[i] * ew + 0.5 * r * ec;
    eb *= kb; eb2 *= kb2; ew *= kw; ec *= kc;
  }
  return finish(d, sr, 0.9, 0.04);
}

// Cross-stick: the stick laid across the rim: a woody knock (two damped modes) and a click.
function renderXstick(sr) {
  const n = Math.floor(sr * 0.12), d = new Float32Array(n), k1 = decay(sr, 0.03), k2 = decay(sr, 0.012), kc = decay(sr, 0.003);
  const clk = biquad(noiseArr(n), 'bp', 2600, 1.2, sr);
  let e1 = 1, e2 = 1, ec = 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    d[i] = 0.8 * sinc((480 * t) % 1) * e1 + 0.6 * sinc((1650 * t) % 1) * e2 + 1.2 * clk[i] * ec;
    e1 *= k1; e2 *= k2; ec *= kc;
  }
  return finish(d, sr);
}

// Brushes: a tap (band-passed noise with a soft attack and a hint of drum body) and a sweep (a slow swell and fall
// of filtered noise: the circular stir on the snare head).
function renderBrushTap(sr) {
  const n = Math.floor(sr * 0.2), d = biquad(noiseArr(n), 'bp', 3000, 0.6, sr), na = Math.floor(sr * 0.003);
  const k = decay(sr, 0.05), kb = decay(sr, 0.03);
  let e = 1, eb = 1;
  for (let i = 0; i < n; i++) { d[i] = (d[i] * e + 0.15 * sinc((180 * i / sr) % 1) * eb) * (i < na ? i / na : 1); e *= k; eb *= kb; }
  return finish(d, sr);
}
function renderBrushSweep(sr) {
  const n = Math.floor(sr * 0.6), d = biquad(biquad(noiseArr(n), 'bp', 2400, 0.5, sr), 'hp', 900, 0.7, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    d[i] *= t < 0.2 ? Math.pow(t / 0.2, 1.5) : Math.exp(-(t - 0.2) / 0.16);
  }
  return finish(d, sr, 0.9, 0.05);
}

// Ride cymbal: a bank of inharmonic partials with different decays, a stick ping and a high noise wash. The bell
// variant has fewer, stronger, lower partials and less wash.
function renderRide(sr, bell) {
  const dur = bell ? 0.9 : 1.2, n = Math.floor(sr * dur), d = new Float32Array(n);
  const P = bell
    ? [[740, 1, 0.7], [1090, 0.7, 0.55], [1620, 0.5, 0.45], [2410, 0.35, 0.35], [3530, 0.22, 0.25], [5150, 0.18, 0.2]]
    : [[610, 0.3, 1.0], [905, 0.5, 1.1], [1270, 0.55, 0.95], [1830, 0.5, 0.85], [2560, 0.45, 0.75], [3390, 0.4, 0.65], [4420, 0.35, 0.55], [5730, 0.3, 0.45]];
  const np = P.length, inc = new Float64Array(np), k = new Float64Array(np), e = new Float64Array(np), ph = new Float64Array(np);
  for (let j = 0; j < np; j++) { inc[j] = P[j][0] * rand(0.99, 1.01) / sr; k[j] = decay(sr, P[j][2]); e[j] = P[j][1]; }
  const ping = biquad(noiseArr(Math.floor(sr * 0.05)), 'bp', 5000, 1.0, sr), wash = biquad(noiseArr(n), 'hp', 6000, 0.7, sr);
  const kp = decay(sr, 0.006), kw = decay(sr, bell ? 0.2 : 0.55), na = Math.floor(sr * 0.0008);
  let ep = 1, ew = bell ? 0.05 : 0.16;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < np; j++) { let q = ph[j] + inc[j]; if (q >= 1) q -= 1; ph[j] = q; s += SIN[(q * SIN_N) & (SIN_N - 1)] * e[j]; e[j] *= k[j]; }
    if (i < ping.length) { s += ping[i] * 0.9 * ep; ep *= kp; }
    s += wash[i] * ew; ew *= kw;
    d[i] = s * (i < na ? i / na : 1);
  }
  biquad(d, 'hp', 350, 0.7, sr);
  return finish(d, sr, 0.9, 0.05);
}

// Hats and crash: six detuned square waves (the classic analog-drum metal cluster) plus noise, band-limited.
// Squares come from phase accumulators (no sin calls).
function renderMetal(sr, dur, tau, mul, bp, hp, noiseAmt) {
  const n = Math.floor(sr * dur), d = new Float32Array(n);
  const fs = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * mul / sr), ph = new Float64Array(6);
  const k = Math.exp(-1 / (sr * tau)), na = Math.floor(sr * 0.001);
  let e = 1;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < 6; j++) { ph[j] += fs[j]; if (ph[j] >= 1) ph[j] -= 1; s += ph[j] < 0.5 ? 1 : -1; }
    d[i] = (s / 6 + (Math.random() * 2 - 1) * noiseAmt) * e * (i < na ? i / na : 1);
    e *= k;
  }
  biquad(d, 'bp', bp, 0.8, sr);
  biquad(d, 'hp', hp, 0.7, sr);
  return finish(d, sr, 0.9, 0.01);
}

function renderShaker(sr) {
  const n = Math.floor(sr * 0.12);
  const d = biquad(biquad(noiseArr(n), 'hp', 5000, 0.7, sr), 'bp', 7500, 0.6, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    d[i] *= t < 0.012 ? (t / 0.012) * (t / 0.012) : Math.exp(-(t - 0.012) / 0.035);
  }
  return finish(d, sr);
}

// Conga: a tuned membrane (pitch settling from a little above) and a palm slap; repitched for high and low drums.
function renderConga(sr) {
  const n = Math.floor(sr * 0.3), d = new Float32Array(n), k = decay(sr, 0.11), kp = decay(sr, 0.012), ks = decay(sr, 0.006);
  const slap = biquad(noiseArr(n), 'bp', 1800, 0.9, sr), na = Math.floor(sr * 0.001);
  let ph = 0, e = 1, ep = 1, es = 1;
  for (let i = 0; i < n; i++) {
    ph += 215 * (1 + 0.25 * ep) / sr; if (ph >= 1) ph -= 1;
    d[i] = (sinc(ph) * e + 0.12 * sinc(2.7 * ph % 1) * e + 0.5 * slap[i] * es) * (i < na ? i / na : 1);
    e *= k; ep *= kp; es *= ks;
  }
  return finish(d, sr);
}

// Clock tick for danger: a tiny bright sine knock.
function renderTick(sr) {
  const n = Math.floor(sr * 0.035), d = new Float32Array(n), k = Math.exp(-1 / (sr * 0.005));
  let e = 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    d[i] = (sinc((2600 * t) % 1) + 0.4 * sinc((5300 * t) % 1)) * e * (i < 24 ? i / 24 : 1);
    e *= k;
  }
  return finish(d, sr);
}

// Heartbeat "lub" on A1 with its octave and twelfth (phone speakers only play the upper partials).
function renderHeart(sr) {
  const n = Math.floor(sr * 0.32), d = new Float32Array(n), k = Math.exp(-1 / (sr * 0.085)), kp = Math.exp(-1 / (sr * 0.03));
  const thump = biquad(noiseArr(n), 'lp', 260, 0.7, sr), na = Math.floor(sr * 0.008);
  let ph = 0, e = 1, ep = 1;
  for (let i = 0; i < n; i++) {
    ph += 55 * (1 + 0.15 * ep) / sr;
    if (ph >= 1) ph -= 1;
    d[i] = (sinc(ph) + 0.6 * sinc(2 * ph) + 0.3 * sinc(3 * ph) + 0.5 * thump[i]) * e * (i < na ? i / na : 1);
    e *= k; ep *= kp;
  }
  return finish(d, sr);
}

// Tom for fills, repitched by playbackRate.
function renderTom(sr) {
  const n = Math.floor(sr * 0.35), d = new Float32Array(n), k = Math.exp(-1 / (sr * 0.13)), kp = Math.exp(-1 / (sr * 0.05));
  const skin = biquad(noiseArr(n), 'bp', 900, 0.8, sr);
  let ph = 0, e = 1, ep = 1;
  for (let i = 0; i < n; i++) {
    ph += (120 + 70 * ep) / sr;
    if (ph >= 1) ph -= 1;
    d[i] = (sinc(ph) + 0.3 * skin[i] * ep) * e * (i < 48 ? i / 48 : 1);
    e *= k; ep *= kp;
  }
  return finish(d, sr);
}

function toBuffer(ctx, chans) {
  const buf = ctx.createBuffer(chans.length, chans[0].length, ctx.sampleRate);
  for (let c = 0; c < chans.length; c++) {
    if (buf.copyToChannel) buf.copyToChannel(chans[c], c);
    else buf.getChannelData(c).set(chans[c]);
  }
  return buf;
}

// nearest pre-rendered pitch to m
function nearestBase(list, m) {
  let b = list[0];
  for (let i = 1; i < list.length; i++) if (Math.abs(list[i] - m) < Math.abs(b - m)) b = list[i];
  return b;
}

// ---------------------------------------------------------------- Music

export class Music {
  constructor(ctx, dest, opts = {}) {
    this.ctx = ctx;
    this._ok = false;
    this._muted = false;        // music-only mute (fades music out, stops creating notes)
    this._idle = false;         // everything muted upstream: keep time, create nothing
    this._useTimer = !(opts && opts.timer === false);
    this._timer = null;
    this._voices = 0;
    this._renderMs = 0; this._maxJobMs = 0; this._jobMs = []; this._jobsDone = 0; this._jobsTotal = 0;
    this._errors = 0;
    // conductor
    this._mode = 'menu';
    this._ending = null;        // 'win' | 'dead' after a run ends
    this._run = false;
    this._sect = 'menu';
    this._barIn = -1; this._barAbs = -1; this._phraseI = 0; this._pib = 0;
    this._bar = PROG.menu[0]; this._chord = 'Fmaj9'; this._nextChord = 'Em7b5';
    this._ladder = []; this._voicing = null; this._hasColor = true;
    this._lead = null; this._tone = null;
    this._accent = false; this._pushed = false;
    this._ep = []; this._walk = [0, 0, 0, 0]; this._bassPrev = 41;
    this._cps = 0; this._cpChangeAt = -1; this._fillStart = -1; this._stepAbs = 0;
    this._airRiser = null;
    // transport
    this._next = 0; this._step = 0; this._bpm = BPM_CALM;
    // smoothed inputs
    this._int = 0; this._air = 0; this._glow = 0; this._danger = 0; this._warm = 0; this._sun = 1; this._progress = 0;
    this._airRaw = false; this._airT = 0; this._airHold = false; this._puddleRaw = false;
    this._tense = false; this._paused = false; this._tapeDown = false;
    this._paramT = 1;
    this._beadI = 0; this._beadT = -9;
    try { this._build(dest); this._ok = true; } catch (e) { this._ok = false; }
    if (this._ok) {
      try { this._setChord(this._chord, ctx.currentTime, 0.01); } catch (e) { this._errors++; }
      if (this._useTimer) this.setActive(true);
    }
  }

  // true when music is actually being heard (the game's sound layer used it to hand the heartbeat and cues to the score)
  get audible() { return this._ok && !this._muted && !this._idle; }

  get stats() {
    return {
      ok: this._ok, renderMs: this._renderMs, maxJobMs: this._maxJobMs, queued: this._queue ? this._queue.length : 0,
      jobsDone: this._jobsDone, jobs: this._jobsTotal, jobMs: this._jobMs, voices: this._voices, section: this._sect, chord: this._chord,
      errors: this._errors,
    };
  }

  update(state, dt) {
    if (!this._ok) return;
    try { this._update(state || {}, dt); } catch (e) { this._errors++; }
  }

  event(type, data = {}) {
    if (!this._ok) return;
    try {
      const d = data || {};
      switch (type) {
        case 'start': this._start(true); break;
        case 'finish': this._finish(); break;
        case 'dead': this._dead(); break;
        case 'puddle': this._puddle(); break;
        case 'bloom': this._bloom(Math.max(1, Math.round(num(d.n, 1))), Math.max(1, Math.round(num(d.of, 6)))); break;
        case 'checkpoint': this._checkpoint(d.ahead); break;
        default: break;
      }
    } catch (e) { this._errors++; }
  }

  setMuted(muted) {
    const m = !!muted;
    if (!this._ok || m === this._muted) { this._muted = m; return; }
    this._muted = m;
    try {
      const t = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setTargetAtTime(m ? 0 : LEVEL, t, 0.15);
    } catch (e) { /* ignore */ }
  }

  // Upstream (global) mute: the master is already fading, so just stop making notes.
  setIdle(idle) { this._idle = !!idle; }

  // Start/stop the scheduler timer (hidden tab). The audio clock is suspended by the owner meanwhile;
  // on resume the scheduler resyncs instead of bursting the missed notes.
  setActive(on) {
    try {
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      if (on && this._ok && this._useTimer && typeof setInterval === 'function') {
        this._timer = setInterval(() => { try { this._tick(); } catch (e) { this._errors++; } }, TIMER_MS);
      }
    } catch (e) { /* ignore */ }
  }

  // Dew beads: the next chord tone up in the bell register (~800-1600 Hz), walking upward while beads come
  // quickly one after another, so a chain of beads plays a little rising arpeggio in key.
  beadFreq() {
    try {
      const lad = ladderOf(chord(this._chord), 79, true);
      const t = this.ctx.currentTime;
      if (t - this._beadT < 1.3) this._beadI = (this._beadI + 1) % 7;
      else this._beadI = Math.random() < 0.5 ? 0 : 1;
      this._beadT = t;
      return mtof(lad[Math.min(lad.length - 1, this._beadI)]);
    } catch (e) { return 1174.7; }
  }

  // -------------------------------------------------------------- graph

  _build(dest) {
    const ctx = this.ctx, sr = ctx.sampleRate, t0 = ctx.currentTime;
    const gain = (v, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
    const filt = (type, f, q, to) => {
      const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
      if (to) b.connect(to);
      return b;
    };
    const osc = (type, f, detune = 0) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
      o.start(t0);
      return o;
    };
    const pan = (p, to) => {
      if (!ctx.createStereoPanner) return to;
      const n = ctx.createStereoPanner(); n.pan.value = p; n.connect(to);
      return n;
    };
    this._pan = pan;

    // Samples are rendered by small jobs the scheduler works through inside a per-tick time budget, so no single
    // frame stalls (a note whose sample is not ready yet is skipped). The menu needs the piano and brushes first.
    const B = this._b = {};
    const one = (name, fn) => () => { B[name] = toBuffer(ctx, [fn()]); };
    const ep = (m, hard) => one('ep' + (hard ? 'h' : 's') + m, () => renderEP(sr, m, hard));
    this._queue = [
      () => this._buildFx('revL'), () => this._buildFx('revR'),
      () => { renderEP(sr, 62, false, 0.12); renderEP(sr, 62, true, 0.12); },   // warms up the JIT on short notes first
      ep(62, false), ep(56, false), ep(68, false),
      one('sweep', () => renderBrushSweep(sr)), one('btap', () => renderBrushTap(sr)),
      ep(50, false), ep(74, false), ep(80, false),
      () => this._buildFx('delay'), () => this._buildLead(),
      one('pedal', () => renderMetal(sr, 0.08, 0.018, 1.3, 7500, 4000, 0.4)),
      () => { B.noise = toBuffer(ctx, [noiseArr(Math.floor(sr * 0.5))]); B.tick = toBuffer(ctx, [renderTick(sr)]); },
      ...VIB_BASE.map((m) => one('vib' + m, () => renderVibes(sr, m))),
      ep(62, true), ep(56, true), ep(68, true), ep(50, true), ep(74, true), ep(80, true),
      one('kick', () => renderKick(sr)),
      one('ride', () => renderRide(sr, false)),
      one('xstick', () => renderXstick(sr)),
      one('snare', () => renderSnare(sr)),
      one('hat', () => renderMetal(sr, 0.07, 0.016, 1.6, 9000, 6500, 0.5)),
      one('shk', () => renderShaker(sr)),
      one('conga', () => renderConga(sr)),
      one('heart', () => renderHeart(sr)),
      one('rbell', () => renderRide(sr, true)),
      one('open', () => renderMetal(sr, 0.45, 0.13, 1.6, 9000, 6500, 0.7)),
      one('tom', () => renderTom(sr)),
      one('crash', () => renderMetal(sr, 1.1, 0.4, 3.1, 7000, 3500, 1.2)),
    ];
    this._jobsTotal = this._queue.length;

    // ---- output chain
    // out: music-only mute fade. bus: mode level and pause duck. fallG: the fall after evaporating.
    // Tone on the way out, for phone speakers (most players): a high-pass under 50 Hz (they can't play it, and it would
    // only push the master compressor down on everything else), a little less bass and a little more presence, so the
    // piano and the lead carry on a speaker that rolls off below ~250 Hz.
    const presence = filt('peaking', 1800, 0.8, dest); presence.gain.value = 3;
    const shelf = filt('lowshelf', 140, 0.7, presence); shelf.gain.value = -4;
    this.out = gain(this._muted ? 0 : LEVEL, filt('highpass', 48, 0.6, shelf));
    this.bus = gain(0.8, this.out);
    this.fallG = gain(1, this.bus);
    this.toneLp = filt('lowpass', 14000, 0.5, this.fallG);      // tape-ish top roll-off; swept down on death
    this.tapeG = gain(1, this.toneLp);                          // gate for resetting the tape delay
    this.tape = ctx.createDelay(0.8); this.tape.delayTime.value = TAPE_BASE; this.tape.connect(this.tapeG);
    // wow and flutter: two slow LFOs on the tape delay time (about +-5 cents of drift in total)
    const wow = osc('sine', 0.13), wowG = gain(0.0016); wow.connect(wowG); wowG.connect(this.tape.delayTime);
    const flt = osc('sine', 0.57), fltG = gain(0.0006); flt.connect(fltG); fltG.connect(this.tape.delayTime);
    // gentle saturation: unity slope at zero, soft ceiling
    const shaper = ctx.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(1.6 * x) / 1.6; }
    shaper.curve = curve; shaper.oversample = '2x';
    shaper.connect(this.tape);
    this.mixBus = gain(1, shaper);

    // ---- reverb and delay inputs (their networks are built by the first render jobs, see _buildFx)
    this.revIn = gain(1);
    this.dlyIn = gain(1);
    this.pumpRev = gain(1, this.mixBus);
    this.revOut = gain(0.5, this.pumpRev);
    this.dlyFb = gain(0.35); this.dlyFb2 = gain(0.35);

    // ---- pad ("strings"): 5 voices x 1 saw -> lowpass -> VCA -> pump
    this.pump = gain(1, this.mixBus);
    this.padVca = gain(0, this.pump);
    this.padVca.connect(gain(0.35, this.revIn));
    this.padLp = filt('lowpass', 1200, 1.0, this.padVca);
    const padL = pan(-0.5, this.padLp), padR = pan(0.5, this.padLp);
    this.padO = []; this.padG = [];
    for (let i = 0; i < 5; i++) {   // one saw per voice, detuned and panned alternately (the old pad had two)
      const a = osc('sawtooth', mtof(57 + i * 4), (i % 2 ? 7 : -7) + rand(-2, 2)), ga = gain(0, i % 2 ? padR : padL);
      a.connect(ga);
      this.padO.push(a); this.padG.push(ga);
    }
    const breath = osc('sine', 0.071), breathG = gain(140); breath.connect(breathG); breathG.connect(this.padLp.frequency);

    // ---- electric piano bus: tone lowpass -> level -> stereo tremolo (two gains swung in antiphase by one LFO)
    this.epIn = gain(1);
    this.epLp = filt('lowpass', 4000, 0.6, null);
    this.epIn.connect(this.epLp);
    this.epG = gain(0, null); this.epLp.connect(this.epG);
    this.epTL = gain(0.7, pan(-0.55, this.mixBus)); this.epTR = gain(0.7, pan(0.55, this.mixBus));
    this.epG.connect(this.epTL); this.epG.connect(this.epTR);
    this.trem = osc('sine', 4.5); this.tremD = gain(0.15);
    this.trem.connect(this.tremD); this.tremD.connect(this.epTL.gain);
    const inv = gain(-1); this.tremD.connect(inv); inv.connect(this.epTR.gain);
    this.epG.connect(gain(0.3, this.revIn));
    this.epG.connect(gain(0.07, this.dlyIn));

    // ---- clav: square + saw -> envelope -> resonant lowpass (per-note pluck on .detune)
    this.arpG = gain(0, this.mixBus);
    this.arpLp = filt('lowpass', 1200, 3, this.arpG);
    this.arpEnv = gain(0, this.arpLp);
    this.arpSaw = gain(0.45, this.arpEnv); this.arpSq = gain(0.8, this.arpEnv);
    this.arpO1 = osc('sawtooth', 440); this.arpO2 = osc('square', 440, 5);
    this.arpO1.connect(this.arpSaw); this.arpO2.connect(this.arpSq);
    this.arpDly = gain(0.25, this.dlyIn); this.arpG.connect(this.arpDly);
    this.arpRev = gain(0.2, this.revIn); this.arpG.connect(this.arpRev);

    // ---- bass: sine sub + saw -> lowpass with a pluck envelope -> envelope
    this.bassG = gain(1, this.mixBus);
    this.bassEnv = gain(0, this.bassG);
    this.bassO1 = osc('sine', 55); this.bassO2 = osc('sawtooth', 55);
    this.bassSub = gain(0.38, this.bassEnv); this.bassO1.connect(this.bassSub);
    this.bassLp = filt('lowpass', 700, 1.1); this.bassSawG = gain(0.75, this.bassEnv);
    this.bassO2.connect(this.bassLp); this.bassLp.connect(this.bassSawG);

    // ---- lead: built by a render job (_buildLead); nothing needs it before the menu's second chorus
    this.leadG = gain(0, this.mixBus);
    this.leadEnv = null;

    // ---- one-shot buses
    // vibes: motor tremolo on the bus
    this.bellBus = gain(1, this.mixBus);
    const motor = osc('sine', 5.6), motorG = gain(0.22); motor.connect(motorG); motorG.connect(this.bellBus.gain);
    this.bellBus.connect(gain(0.35, this.dlyIn));
    this.bellBus.connect(gain(0.5, this.revIn));
    this.kickLp = filt('lowpass', 18000, 0.7, this.mixBus);
    this.kickBus = gain(1, this.kickLp);
    this.snBus = gain(1, this.mixBus);
    const snSend = gain(0.3, this.revIn); this.snBus.connect(snSend);
    // cymbals sit a little right of centre: the bus is panned once, so their hits need no panner of their own
    this.hatBus = gain(1, pan(0.3, this.mixBus));
    const hatSend = gain(0.12, this.revIn); this.hatBus.connect(hatSend);
    this.fxBus = gain(1, this.mixBus);
    const fxSend = gain(0.45, this.revIn); this.fxBus.connect(fxSend);

    this._next = t0 + 0.25;   // gives the first render jobs (reverb, piano) a head start
  }

  _setDelayTime(bpm, t) {
    if (!this.dL) return;
    const d = 0.75 * 60 / bpm;   // dotted eighth
    this.dL.delayTime.setTargetAtTime(d, t, 0.05);
    this.dR.delayTime.setTargetAtTime(d, t, 0.05);
  }

  // Lead: saw + square + breath noise -> lowpass (pluck on .detune) -> formant peak -> envelope; delayed vibrato.
  _buildLead() {
    const ctx = this.ctx, t0 = ctx.currentTime, sr = ctx.sampleRate;
    const gain = (v, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
    const osc = (type, f, detune = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; o.start(t0); return o; };
    const env = gain(0, this.leadG);
    this.leadPk = ctx.createBiquadFilter(); this.leadPk.type = 'peaking'; this.leadPk.frequency.value = 1400; this.leadPk.Q.value = 1.4; this.leadPk.gain.value = 0;
    this.leadPk.connect(env);
    this.leadLp = ctx.createBiquadFilter(); this.leadLp.type = 'lowpass'; this.leadLp.frequency.value = 2000; this.leadLp.Q.value = 1; this.leadLp.connect(this.leadPk);
    this.leadO1 = osc('sawtooth', 660); this.leadO2 = osc('square', 660, 6);
    this.leadSawG = gain(0.9, this.leadLp); this.leadSqG = gain(0.3, this.leadLp);
    this.leadO1.connect(this.leadSawG); this.leadO2.connect(this.leadSqG);
    const nb = ctx.createBuffer(1, Math.floor(sr * 0.5), sr); nb.getChannelData(0).set(noiseArr(Math.floor(sr * 0.5)));
    const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true; ns.start(t0);
    const nbp = ctx.createBiquadFilter(); nbp.type = 'bandpass'; nbp.frequency.value = 1900; nbp.Q.value = 0.9;
    this.leadBrG = gain(0, this.leadLp); ns.connect(nbp); nbp.connect(this.leadBrG);
    this.vib = osc('sine', 5.2); this.vibG = gain(0); this.vib.connect(this.vibG);
    this.vibG.connect(this.leadO1.detune); this.vibG.connect(this.leadO2.detune);
    this.leadDly = gain(0.45, this.dlyIn); this.leadG.connect(this.leadDly);
    this.leadRev = gain(0.35, this.revIn); this.leadG.connect(this.leadRev);
    this.leadEnv = env;
    this._tone = null;
    this._leadTone(SECT[this._sect].tone, t0);
  }

  _leadTone(name, t) {
    if (!this.leadEnv || this._tone === name) return;
    const T = TONE[name] || TONE.moog;
    this._tone = name; this._T = T;
    const s = (p, v) => p.setTargetAtTime(v, t, 0.15);
    s(this.leadSawG.gain, T.saw); s(this.leadSqG.gain, T.sq); s(this.leadBrG.gain, T.br);
    s(this.leadLp.frequency, T.lp); s(this.leadLp.Q, T.q);
    s(this.leadPk.frequency, T.fF); s(this.leadPk.gain, T.fG);
    s(this.vib.frequency, T.vr);
    s(this.leadDly.gain, T.dly); s(this.leadRev.gain, T.rev);
  }

  // The effect networks, built by render jobs so the constructor stays small (DelayNodes allocate their
  // whole buffer on creation, so max delay times are kept tight).
  // Reverb: algorithmic, Freeverb-style: per side four damped feedback combs into two allpass diffusers,
  // comb times slowly modulated against metallic ringing. (A convolver's impulse-response setup is one
  // native call of ~6-20 ms that cannot be split up.)
  _buildFx(which) {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const gain = (v, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
    const filt = (type, f, q, to) => {
      const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
      if (to) b.connect(to);
      return b;
    };
    const delay = (max, v) => { const d = ctx.createDelay(max); d.delayTime.value = v; return d; };
    if (which === 'delay') {
      // ping-pong dotted eighth with a band-limited feedback path
      // in-loop filters use Q -3 dB (no resonant peak), so the loop gain stays below the feedback gain
      const dlyLp = filt('lowpass', 3200, -3), dlyHp = filt('highpass', 350, -3);
      this.dL = delay(0.8, 0.45); this.dR = delay(0.8, 0.45);
      this.dlyIn.connect(dlyLp); dlyLp.connect(this.dL);
      this.dL.connect(this.dlyFb); this.dlyFb.connect(dlyHp); dlyHp.connect(this.dR);
      this.dR.connect(this.dlyFb2); this.dlyFb2.connect(this.dL);
      const dlyOut = gain(0.5, this.mixBus);
      this.dL.connect(this._pan(-0.7, dlyOut)); this.dR.connect(this._pan(0.7, dlyOut));
      dlyOut.connect(gain(0.25, this.revIn));
      this._setDelayTime(this._bpm, t0);
      return;
    }
    if (!this._revHp) {
      this._revHp = filt('highpass', 220, 0.7);
      this.revIn.connect(this._revHp);
      const m = ctx.createOscillator(); m.frequency.value = 0.31; m.start(t0);
      this._modP = gain(0.00025); this._modN = gain(-0.00025);
      m.connect(this._modP); m.connect(this._modN);
    }
    const left = which === 'revL', rt = 2.6;
    const combs = left ? [29.7, 37.1, 41.1, 43.7] : [31.3, 35.9, 40.3, 45.1];
    const aps = left ? [5.1, 12.6] : [5.9, 11.3];
    const sum = gain(0.4), outP = this._pan(left ? -0.9 : 0.9, this.revOut);
    combs.forEach((ms, i) => {
      const node = gain(1), dl = delay(0.05, ms / 1000), damp = filt('lowpass', 3600, -3);
      const fb = gain(Math.pow(10, -3 * (ms / 1000) / rt));
      this._revHp.connect(node); node.connect(dl); dl.connect(damp); damp.connect(fb); fb.connect(node);
      dl.connect(sum);
      (i % 2 ? this._modN : this._modP).connect(dl.delayTime);
    });
    let x = sum;
    for (const ms of aps) {   // Schroeder allpass: v = x + g v[-D]; y = -g v + v[-D]
      const v = gain(1), dl = delay(0.015, ms / 1000), fb = gain(0.5), y = gain(1), ff = gain(-0.5, y);
      x.connect(v); v.connect(dl); dl.connect(fb); fb.connect(v); v.connect(ff); dl.connect(y);
      x = y;
    }
    x.connect(outP);
  }

  _renderSome(budget) {
    if (!this._queue.length) return;
    const t0 = nowMs();
    while (this._queue.length && nowMs() - t0 < budget) {
      const job = this._queue.shift(), j0 = nowMs();
      try { job(); this._jobsDone++; } catch (e) { this._errors++; }
      const ms = nowMs() - j0;
      this._maxJobMs = Math.max(this._maxJobMs, ms);
      this._jobMs.push(Math.round(ms * 10) / 10);
    }
    this._renderMs += nowMs() - t0;
  }

  // -------------------------------------------------------------- per-frame

  _update(st, dtIn) {
    const dt = clamp(num(dtIn, 0.016), 0, 0.1);
    const paused = !!st.paused;
    let mode = st.mode === 'play' || st.mode === 'end' ? st.mode : 'menu';
    if (paused && this._mode !== 'menu') mode = this._mode;   // a paused run keeps its music, quieter
    if (mode !== this._mode) this._modeChange(mode, st);
    this._paused = paused;
    const play = mode === 'play' && !paused;

    const speed = Math.max(0, num(st.speed, 0));
    const vol = num(st.volume, 1);
    // danger: the game's estimate when given; otherwise (and in any case near empty) the water level
    const low = clamp((0.25 - vol) / 0.2, 0, 1);
    const dIn = typeof st.danger === 'number' && isFinite(st.danger) ? clamp(st.danger, 0, 1) : clamp((0.42 - vol) / 0.3, 0, 1);
    const danger = mode === 'play' ? Math.max(dIn, low) : 0;
    const progress = clamp(num(st.progress, 0), 0, 1);

    const ease = (cur, target, up, down) => cur + (target - cur) * (1 - Math.exp(-dt / (target > cur ? up : down)));
    if (!paused) {
      this._int = ease(this._int, play ? 0.1 + 0.9 * smooth((speed - 2) / 16) : 0, 1.0, 2.0);
      this._air = ease(this._air, play && st.airborne ? 1 : 0, 0.1, 0.3);
      this._glow = ease(this._glow, play && st.inPuddle ? 1 : 0, 0.15, 1.4);
      this._danger = ease(this._danger, danger, 0.8, 1.5);
      this._sun = ease(this._sun, clamp(num(st.sunlit, 1), 0, 1), 1, 1);
      if (mode === 'play') this._progress = progress;
      this._warm = ease(this._warm, mode === 'menu' ? 0 : smooth(this._progress), 2, 2);

      // airborne edges: a swell while in the air, an impact on landing
      const airRaw = play && !!st.airborne;
      if (airRaw) {
        if (!this._airRaw) this._airStart();
        this._airT += dt;
      } else {
        if (this._airRaw) this._airEnd(this._airT, mode === 'play');
        this._airT = 0;
      }
      this._airRaw = airRaw;
      this._airHold = airRaw && this._airT > 0.2;
      this._puddleRaw = play && !!st.inPuddle;
    }
    if (!this._tense && this._danger > 0.5 && mode === 'play') this._tense = true;
    else if (this._tense && (this._danger < 0.25 || mode !== 'play')) this._tense = false;

    this._tick();

    this._paramT += dt;
    if (this._paramT < 1 / PARAM_HZ) return;
    this._paramT = 0;
    this._params();
  }

  _modeChange(mode, st) {
    const t = this.ctx.currentTime;
    this._mode = mode;
    if (mode === 'play') {
      if (!this._run || this._ending) this._start(false);
    } else if (mode === 'end') {
      if (!this._ending) this._ending = num(st.volume, 1) > 0.02 ? 'win' : 'dead';
      this._cutRiser(t);
    } else {
      this._run = false; this._ending = null; this._tense = false;
      this._danger = 0; this._int = 0; this._cps = 0; this._cpChangeAt = -1;
      this._leadStop(t); this._cutRiser(t); this._resetTape(t);
      // back to the menu straight after an ending: don't wait out the ending's pause
      if (this._next > t + 0.3) this._restart(t + 0.05, BPM_CALM);
    }
  }

  // Continuous mix moves, re-targeted at PARAM_HZ.
  _params() {
    const t = this.ctx.currentTime;
    const set = (p, v, tau) => p.setTargetAtTime(v, t, tau);
    const sect = this._sect, S = SECT[sect], mode = this._mode;
    const air = this._air, glow = this._glow, dz = this._danger, int = this._int, warm = this._warm;
    const calm = sect === 'menu' || sect === 'outro' || sect === 'silence';
    set(this.bus.gain, (mode === 'menu' ? 0.78 : mode === 'end' ? 0.66 : 0.8) * (this._paused ? 0.3 : 1), mode === 'end' ? 1.5 : 0.25);

    // strings: warm and low behind the piano, swelling with the sunset; open up and resonate while airborne
    set(this.padVca.gain, S.pad * (1 + 0.3 * glow + 0.4 * warm * (calm ? 0 : 1)) * (1 - 0.15 * dz), 0.6);
    const cut = (calm ? 1300 : 800 + 500 * int) * (1.1 - 0.15 * warm) * (0.9 + 0.1 * this._sun) + 2600 * air + 1000 * glow - 300 * dz;
    set(this.padLp.frequency, clamp(cut, 260, 6500), air > 0.1 ? 0.12 : 0.4);
    set(this.padLp.Q, 1.0 + 3.2 * air + 1.6 * dz, 0.3);
    const rich = this._hasColor ? clamp(S.rich + 0.25 * warm + 0.6 * glow, 0, 1.2) * (1 - dz) : 0;
    const vg = [1, 1, 1, 1 - 0.5 * dz, rich];
    for (let i = 0; i < 5; i++) {
      set(this.padG[i].gain, 0.065 * vg[i], 0.4);
    }

    // piano: brighter with speed, airtime and puddles, darker in danger; the tremolo quickens with tension
    set(this.epG.gain, (S.ep || 0) * (1 + 0.1 * air), 0.3);
    const ecut = (calm ? 2600 : 2300 + 2700 * int) * (1.05 - 0.1 * warm) + 3000 * air + 1500 * glow - 700 * dz;
    set(this.epLp.frequency, clamp(ecut, 900, 9500), air > 0.1 ? 0.1 : 0.3);
    set(this.trem.frequency, sect === 'tension' ? 6 + 2 * dz : calm ? 4.2 : 5, 0.5);
    set(this.tremD.gain, sect === 'tension' ? 0.2 + 0.35 * dz : calm ? 0.24 : 0.14, 0.5);

    // clav: comes in with speed; the speed opens its filter; danger makes it squarer and more resonant
    set(this.arpG.gain, S.clav ? (S.clavLvl || 0.6) * (sect === 'tension' ? 1 : 0.2 + 0.8 * int) * (1 + 0.15 * air) : 0, 0.3);
    const acut = 650 + 2400 * int + 2200 * air + 1300 * glow + (sect === 'tension' ? 500 : 0) - 200 * dz;
    set(this.arpLp.frequency, clamp(acut, 300, 7500), air > 0.1 ? 0.1 : 0.25);
    set(this.arpLp.Q, 3 + 5 * dz + 2.5 * air, 0.3);
    set(this.arpSaw.gain, 0.45 - 0.3 * dz, 0.3);
    set(this.arpSq.gain, 0.8 + 0.3 * dz, 0.3);

    set(this.bassG.gain, (S.bassLvl || 1) * (1 - 0.9 * air), air > 0.1 ? 0.05 : 0.2);
    const walk = S.bass === 'walk' || S.bass === 'two';
    set(this.bassLp.frequency, walk ? 850 : sect === 'tension' ? 800 : 1100, 0.3);
    set(this.bassLp.Q, sect === 'tension' ? 3 : 1.1, 0.3);
    set(this.kickLp.frequency, this._airHold ? 320 : 18000, this._airHold ? 0.06 : 0.03);
    set(this.leadG.gain, (S.leadLvl || 0) * (1 - 0.7 * dz), 0.4);
    const fb = 0.26 + 0.12 * warm + 0.15 * air + (calm ? 0.08 : 0);
    set(this.dlyFb.gain, fb, 0.3); set(this.dlyFb2.gain, fb, 0.3);
    set(this.revOut.gain, 0.5 + 0.3 * warm + 0.35 * air + (calm ? 0.2 : 0), 0.3);
  }

  // -------------------------------------------------------------- scheduler

  _stepDur() { return 60 / this._bpm / 4; }

  // Swing: in s16 sections the off-16ths come late, in s8 sections the off-8ths (towards the triplet).
  _sw(step, sd) {
    const S = SECT[this._sect], r = S.swing || 0.5;
    if (S.feel === 's8') return step % 4 === 2 ? (2 * r - 1) * 2 * sd : 0;
    return step % 2 ? (2 * r - 1) * sd : 0;
  }

  _tick() {
    if (!this._ok) return;
    this._renderSome(RENDER_BUDGET);
    const now = this.ctx.currentTime;
    if (this._next < now - 0.05) {
      // fell behind (main-thread stall, tab restored): drop the missed steps, keep the bar grid
      const sd = this._stepDur();
      const missed = Math.ceil((now + 0.02 - this._next) / sd);
      for (let i = 0; i < missed; i++) {
        if (this._step === 0) this._onBar(this._next + i * sd, true);
        this._step = (this._step + 1) % 16;
      }
      this._next += missed * sd;
    }
    let guard = 0;
    while (this._next < now + LOOKAHEAD && guard++ < 24) {
      this._doStep(this._next);
      this._next += this._stepDur();
      this._step = (this._step + 1) % 16;
    }
  }

  _silent() { return this._muted || this._idle; }

  _doStep(t) {
    if (this._step === 0) this._onBar(t, false);
    const step = this._step;
    this._stepAbs = this._barAbs * 16 + step;
    // the bar's second chord arrives on beat 3
    if (step === 8 && this._bar[1] !== this._bar[0]) this._setChord(this._bar[1], t, 0.03);
    if (this._silent()) return;
    const sect = this._sect, S = SECT[sect], sd = this._stepDur();
    if (sect === 'silence') return;
    const lastBar = this._pib === S.plen - 1;

    if (step === 0 && this._accent) {
      this._accent = false;
      this._hit(this._b.crash, t, 0.26, this.fxBus, 0.2, 1, true);
      if (S.drum) { this._hit(this._b.kick, t, 0.55, this.kickBus, 0, 1, true); this._pump(t, 0.3); }
    }
    this._compStep(t, step, sd, S, lastBar);
    this._clavStep(t, step, sd, S, lastBar);
    this._bassStep(t, step, sd, S, lastBar);
    this._drumStep(t, step, sd, S, lastBar);
    this._leadStep(t, step, sd, S);
    this._dangerStep(t, step, sd);
    // in a puddle: drops of light from the chord, high up on the vibes
    if (this._puddleRaw && step % 2 === 0 && Math.random() < 0.5) {
      const lad = ladderOf(chord(this._chord), 84, true);
      this._bell(lad[Math.floor(Math.random() * Math.min(5, lad.length))], t + this._sw(step, sd) + rand(0, 0.02), 0.45, rand(-0.6, 0.6), false);
    }
  }

  // The bar's chords for bar index `bi` of section S: [first, second].
  _barOf(S, bi) { return S.P[Math.floor(bi / S.plen) % S.P.length][bi % S.plen]; }

  // The conductor: pick the section and the chords for the bar starting at t.
  _onBar(t, skipped) {
    this._barAbs++;
    let want = this._pickSection();
    const cur = this._sect;
    let force = false;
    if (this._cpChangeAt >= 0) {
      if (this._barAbs >= this._cpChangeAt) { force = true; this._cpChangeAt = -1; this._fillStart = -1; }
      else if (isArc(want) && isArc(cur)) want = cur;   // hold until the checkpoint fill has played
    }
    const arcMove = isArc(want) && isArc(cur) && want !== cur;
    let change = want !== cur || this._barIn < 0;
    // without a checkpoint the arc moves on at a 4-bar boundary
    if (arcMove && !force && (this._barIn + 1) % 4 !== 0) change = false;
    if (change) {
      const from = cur;
      this._sect = want; this._barIn = 0;
      if (SECT[want].bpm !== this._bpm) { this._bpm = SECT[want].bpm; this._setDelayTime(this._bpm, t); }
      if (isArc(want) && (force || arcMove || from === 'tension')) this._accent = true;
      if (want === 'tension' || from === 'tension') this._leadStop(t);
      if (from === 'tension' && want !== 'tension') this._glow = Math.max(this._glow, 0.8);   // the release
      this._lead = null;
      this._pushed = false;   // a push was aimed at the old section's next chord
      this._leadTone(SECT[want].tone, t);
    } else {
      this._barIn++;
    }
    const S = SECT[this._sect], bi = this._barIn;
    this._phraseI = Math.floor(bi / S.plen); this._pib = bi % S.plen;
    this._bar = this._barOf(S, bi);
    // the next bar's first chord (for pushes, approach notes and walking lines); across a pending checkpoint
    // change, the next section's first chord
    const nextS = this._cpChangeAt === this._barAbs + 1 ? SECT[this._pickSection()] : S;
    this._nextChord = (nextS === S ? this._barOf(S, bi + 1) : nextS.P[0][0])[0];
    this._setChord(this._bar[0], t, 0.035);
    if (S.bass === 'walk') this._planWalk(S);
    if (skipped) return;
    if (this._pib === 0) {
      const name = S.leads ? S.leads[this._phraseI % S.leads.length] : null;
      this._lead = name ? { mel: MEL[name], i: 0, prevEnd: -1 } : null;
    }
  }

  _pickSection() {
    if (!this._run && !this._ending) return 'menu';
    if (this._ending) return this._ending === 'dead' ? 'silence' : 'outro';
    if (this._tense) return 'tension';
    const p = this._progress;
    const i = p >= 0.8 ? 4 : p >= 0.61 ? 3 : p >= 0.41 ? 2 : p >= 0.21 ? 1 : 0;
    return ARC[Math.max(i, Math.min(4, this._cps))];
  }

  // Reset the transport so a new bar starts at t.
  _restart(t, bpm) {
    this._next = t; this._step = 0; this._barIn = -1;
    if (bpm !== this._bpm) { this._bpm = bpm; this._setDelayTime(bpm, t); }
  }

  // New chord: the strings glide to a voice-led voicing (the piano's, an octave up only for the colour tone), the
  // clav gets a new ladder.
  _setChord(name, t, tau) {
    const ch = chord(name), S = SECT[this._sect];
    this._chord = name;
    this._ladder = ladderOf(ch, 60, false);
    const v = this._voice(ch, true);
    this._hasColor = ch.color >= 0;
    let top = v[2] + 12;
    if (this._hasColor) { top = v[3] + 1; while (pcOf(top) !== ch.color) top++; }
    const notes = [v[0], v[1], v[2], v[3], top];
    for (let i = 0; i < 5; i++) {
      this.padO[i].frequency.setTargetAtTime(mtof(notes[i]), t, tau);
    }
  }

  // Voice leading: of every close-position inversion of the four voicing tones with its lowest note between F3
  // and E4, take the one that moves the voices least from the previous chord (with a pull towards the middle of
  // the register). Kept this high on purpose: phone speakers lose most of what is under ~250 Hz.
  _voice(ch, commit) {
    const prev = this._voicing || [57, 60, 64, 67];
    let best = null, bestCost = 1e9;
    for (let k = 0; k < 4; k++) {
      const order = [ch.tones[k], ch.tones[(k + 1) % 4], ch.tones[(k + 2) % 4], ch.tones[(k + 3) % 4]];
      for (let lo = 54; lo <= 65; lo++) {
        if (pcOf(lo) !== order[0]) continue;
        const v = [lo];
        for (let j = 1; j < 4; j++) { let m = v[j - 1] + 1; while (pcOf(m) !== order[j]) m++; v.push(m); }
        if (v[3] > 78) continue;
        let cost = 0.5 * Math.abs((v[0] + v[3]) / 2 - 65);
        for (let j = 0; j < 4; j++) cost += Math.abs(v[j] - prev[j]);
        if (cost < bestCost) { bestCost = cost; best = v; }
      }
    }
    best = best || prev;
    if (commit) this._voicing = best;
    return best;
  }

  _density(S) { return typeof S.drum === 'number' ? clamp(this._int * S.drum, 0, 1.1) : 0; }

  // -------------------------------------------------------------- piano

  _compStep(t, step, sd, S, lastBar) {
    if (!S.comp) return;
    const tiers = COMP[S.comp];
    const d = S.comp === 'tension' ? this._danger : S.comp === 'ballad' ? 0 : clamp(this._int * 1.05, 0, 1);
    let pats = tiers[0][1];
    for (let i = 0; i < tiers.length; i++) if (d >= tiers[i][0]) pats = tiers[i][1];
    let c = pats[this._barIn % 2][step];
    const two = this._bar[1] !== this._bar[0];
    // a bar with two chords: make sure the second one is played
    if (two && step === 8 && c === '.') c = 'L';
    if (step === 0 && this._pushed) { this._pushed = false; if (c === 'L' || c === 'l') return; }
    if (c === '.') return;
    if (this._airHold && c !== 'L' && c !== 'P') return;   // airborne: only the long chords, hanging in the air
    const calm = S.comp === 'ballad';
    if (calm && c === 'l' && Math.random() < 0.3) return;   // breathe
    let name = step < 8 ? this._bar[0] : this._bar[1];
    if (c === 'P') {
      if (this._nextChord === this._bar[1] || (this._cpChangeAt === this._barAbs + 1 && S !== SECT[this._pickSection()])) c = 'S';
      else { name = this._nextChord; this._pushed = true; }
    }
    const ch = chord(name);
    const v = c === 'P' ? this._voice(ch, false) : name === this._chord ? this._voicing : this._voice(ch, false);
    const long = c === 'L' || c === 'l' || c === 'P';
    const base = c === 'L' || c === 'P' ? 1 : c === 'S' ? 0.85 : c === 'l' ? 0.6 : 0.5;
    const vel = base * (calm ? 0.75 : 0.75 + 0.35 * this._int) * rand(0.92, 1.04);
    const ts = t + this._sw(step, sd) + rand(-0.004, 0.006);
    this._chordHit(ch, v, ts, vel, long ? 0 : sd * (S.feel === 's8' ? 2.2 : 1.6), calm ? 0.022 : 0.006, long && S.rich > 0.55);
  }

  // A piano chord: chokes the previous one, then one buffer voice per note (rolled by `roll` seconds per note).
  _chordHit(ch, v, t, vel, gate, roll, color) {
    this._choke(t);
    for (let i = 0; i < 4; i++) this._epNote(v[i], t + i * roll * rand(0.7, 1.2), vel * (i === 3 ? 1.08 : 1), gate);
    if (color && ch.color >= 0) {
      let top = v[3] + 1;
      while (pcOf(top) !== ch.color) top++;
      if (top <= 81) this._epNote(top, t + 4 * roll, vel * 0.8, gate);
    }
  }

  _choke(t) {
    const live = this._ep;
    for (let i = 0; i < live.length; i++) {
      const n = live[i];
      if (n.end <= t) continue;
      try { n.g.gain.setTargetAtTime(0, t, 0.045); n.src.stop(t + 0.3); } catch (e) { /* ignore */ }
    }
    live.length = 0;
  }

  _epNote(m, t, vel, gate, prio) {
    const hard = vel > 0.86, base = nearestBase(EP_BASE, m);
    const buf = this._b[(hard ? 'eph' : 'eps') + base] || this._b['eps' + base];
    if (!buf || !this._take(prio)) return;
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = Math.pow(2, (m - base) / 12);
    const g = ctx.createGain(); g.gain.value = 0.16 * vel;
    src.connect(g); g.connect(this.epIn);
    src.start(t);
    let end = t + buf.duration / src.playbackRate.value;
    if (gate > 0) { g.gain.setTargetAtTime(0, t + gate, 0.05); end = Math.min(end, t + gate + 0.35); src.stop(end); }
    this._release(src, [src, g]);
    this._ep.push({ src, g, end });
  }

  // -------------------------------------------------------------- clav

  _clavStep(t, step, sd, S, lastBar) {
    if (!S.clav || !this._ladder.length) return;
    const sect = this._sect;
    const sixteenths = sect === 'tension' || this._int > 0.55;
    if (!sixteenths && step % 2) return;
    const pat = CLAV[S.clav[this._phraseI % S.clav.length]];
    let idx = pat[step];
    if (idx < 0) return;
    if (lastBar && sect !== 'tension' && step >= 8) idx += 2;   // the phrase's last bar climbs
    const lad = this._ladder;
    let m = lad[Math.min(idx, lad.length - 1)];
    if (this._air > 0.5) m += 12;                                 // lifted while airborne
    const vel = step % 4 === 0 ? 1 : step % 2 === 0 ? 0.85 : 0.7;
    const ratchet = sect === 'tension' && this._danger > 0.65 && step % 4 === 3;
    const ts = t + this._sw(step, sd);
    this._clavNote(m, ts, vel, ratchet ? sd * 0.4 : sd * 0.55);
    if (ratchet) this._clavNote(m + 12, ts + sd * 0.5, 0.6, sd * 0.35);
  }

  _clavNote(m, t, vel, gate) {
    const f = mtof(m), g = this.arpEnv.gain, d = this.arpLp.detune;
    this.arpO1.frequency.setValueAtTime(f, t);
    this.arpO2.frequency.setValueAtTime(f, t);
    const pk = 0.26 * vel;
    g.setTargetAtTime(pk, t, 0.002);
    g.setTargetAtTime(pk * 0.35, t + 0.01, 0.05);
    g.setTargetAtTime(0, t + gate, 0.018);
    d.setTargetAtTime(2400, t, 0.0015);
    d.setTargetAtTime(0, t + 0.004, 0.05);
  }

  // -------------------------------------------------------------- bass

  // Walking line for the bar: a root on each chord, chord tones heading towards the next root, and a chromatic
  // (or fifth-below) approach on the beat before it.
  _planWalk(S) {
    const near = (pc, ref) => { let m = 31 + pcOf(pc - 7); while (m + 12 <= 50 && Math.abs(m + 12 - ref) < Math.abs(m - ref)) m += 12; return m; };
    const two = this._bar[1] !== this._bar[0];
    const spans = two ? [[0, 2, this._bar[0], this._bar[1]], [2, 2, this._bar[1], this._nextChord]] : [[0, 4, this._bar[0], this._nextChord]];
    let prev = this._bassPrev;
    for (const [b0, n, cn, nn] of spans) {
      const ch = chord(cn), nx = chord(nn);
      const r = near(ch.bass, prev), tgt = near(nx.bass, r);
      let app = tgt === r ? r + ch.fifth - (r + ch.fifth > 50 ? 12 : 0) : Math.random() < 0.7 ? (tgt > r ? tgt - 1 : tgt + 1) : tgt + 7 > 50 ? tgt - 5 : tgt + 7;
      if (n === 2) { this._walk[b0] = r; this._walk[b0 + 1] = app; }
      else {
        const up = app > r || (app === r && Math.random() < 0.5);
        const a = up ? r + ch.third : r - (12 - ch.seventh), b = up ? r + ch.fifth : r - (12 - ch.fifth);
        this._walk[b0] = r; this._walk[b0 + 1] = clamp(a, 28, 52); this._walk[b0 + 2] = clamp(b, 28, 52); this._walk[b0 + 3] = app;
      }
      prev = app;
    }
    this._bassPrev = prev;
  }

  _bassStep(t, step, sd, S, lastBar) {
    const type = S.bass;
    if (!type) return;
    const two = this._bar[1] !== this._bar[0];
    const ch = chord(step < 8 ? this._bar[0] : this._bar[1]), root = bassNote(ch.bass);
    if (type === 'two') {
      // ballad two-feel: root, fifth (or the second chord's root), and a soft approach into a new chord
      const next = chord(this._nextChord);
      if (step === 0) this._bassNote(root, t, sd * 7.5, 0.75, false, 0.4);
      else if (step === 8) this._bassNote(two ? root : root + ch.fifth - (root + ch.fifth > 46 ? 12 : 0), t, sd * (next.bass !== ch.bass ? 3.6 : 7.5), 0.6, false, 0.3);
      else if (step === 12 && !two && next.bass !== ch.bass && this._sect !== 'silence') {
        const tgt = bassNote(next.bass);
        this._bassNote(tgt + (tgt > root ? -1 : 1), t, sd * 3.6, 0.5, false, 0.3);
      }
      return;
    }
    if (this._airHold) return;
    if (type === 'walk') {
      const d = this._density(S);
      if (d < 0.32) {   // two-feel when slow
        if (step === 0 || step === 8) this._bassNote(this._walk[step / 4], t, sd * 7.2, 0.85, false, 0.6);
        return;
      }
      if (step % 4 === 0) this._bassNote(this._walk[step / 4], t, sd * 3.4, step % 8 ? 0.8 : 0.95, false, 0.7);
      else if (step === 14 && d > 0.8 && Math.random() < 0.3) {   // a swung skip note into the next bar
        this._bassNote(this._walk[3] + (Math.random() < 0.5 ? 1 : -1), t + this._sw(step, sd), sd * 0.8, 0.45, false, 0.5);
      }
      return;
    }
    const d = type === 'tension' ? this._danger : this._density(S);
    const layers = BASS[type];
    let pat = layers[0][1];
    for (let i = 0; i < layers.length; i++) if (d >= layers[i][0]) pat = layers[i][1];
    let c = pat[step];
    if (two && step === 8) c = 'R';
    if (c === '.') return;
    const next = chord(this._nextChord);
    let m = root, vel = 1;
    if (c === 'O') { m += 12; vel = 0.75; }
    else if (c === 'F') { m += ch.fifth; vel = 0.8; }
    else if (c === '7') { m += ch.seventh - 12; vel = 0.7; }
    else if (c === '3') { m += ch.third; vel = 0.75; }
    else if (c === 'A') {
      const tgt = bassNote(next.bass);
      if (next.bass === ch.bass || type === 'tension') { m += 7; vel = 0.65; }
      else { m = tgt + (tgt > root ? -1 : 1); vel = 0.75; }
    }
    let gap = 1;
    while (gap < 16 - step && pat[step + gap] === '.' && !(two && step + gap === 8)) gap++;
    this._bassNote(m, t + this._sw(step, sd), Math.max(sd * 0.8, gap * sd * 0.85), vel, false, type === 'tension' ? 0.5 : 0.8);
  }

  _bassNote(m, t, dur, vel, glide, pluck) {
    const f = mtof(m), g = this.bassEnv.gain, fd = this.bassLp.detune;
    for (const o of [this.bassO1, this.bassO2]) {
      if (glide) o.frequency.setTargetAtTime(f, t, 0.02); else o.frequency.setValueAtTime(f, t);
    }
    const pk = 0.2 * vel;
    g.setTargetAtTime(pk, t, 0.005);
    g.setTargetAtTime(pk * 0.6, t + 0.03, Math.max(0.1, Math.min(0.35, dur * 0.5)));
    g.setTargetAtTime(0, t + dur, 0.035);
    fd.setTargetAtTime(1800 * (pluck || 0), t, 0.002);
    fd.setTargetAtTime(0, t + 0.006, 0.08);
  }

  // -------------------------------------------------------------- drums

  _drumStep(t, step, sd, S, lastBar) {
    const kit = S.kit;
    if (!kit) return;
    const B = this._b, ts = t + this._sw(step, sd) + rand(-0.003, 0.003);
    if (this._airHold && kit !== 'brush') {   // airborne: a muffled pulse and a soft ride, hanging
      if (step % 8 === 0) this._hit(B.kick, t, 0.3, this.kickBus);
      if (step % 4 === 0) this._ride(B.ride, t, 0.05);
      return;
    }
    if (kit === 'brush') {
      if (step === 0 || step === 8) this._hit(B.sweep, t, 0.16 * rand(0.85, 1.05), this.snBus, step ? 0.3 : -0.3, rand(0.95, 1.05));
      const bv = DR.brush[step];
      if (bv) this._hit(B.btap, ts, 0.09 * bv * rand(0.8, 1.05), this.snBus, 0.1);
      if (step === 4 || step === 12) this._hit(B.pedal, t, 0.05, this.hatBus);
      return;
    }
    if (kit === 'T') {   // tension: sparse kick, ride bell and shaker (the ticks and heartbeat are in _dangerStep)
      if (step % 8 === 0 || (step === 10 && this._danger > 0.6)) { this._hit(B.kick, t, step === 10 ? 0.25 : 0.36, this.kickBus); }
      if (step === 0 || step === 6 || step === 8 || step === 14) this._ride(B.rbell, ts, 0.05);
      if (step % 2 === 0) this._hit(B.shk, ts, 0.045 * (step % 4 === 2 ? 1 : 0.6), this.hatBus, -0.7);
      return;
    }
    const d = this._density(S);
    const cpFill = this._fillStart >= 0 && this._stepAbs >= this._fillStart;
    const phraseFill = lastBar && d > 0.45 && step >= 12 && !cpFill;

    if (kit === 'swing') {
      // straight-ahead: "spang-a-lang" on the ride, hat foot on 2 and 4, feathered kick, snare comping chatter
      const rv = DR.swRide[step];
      if (rv) this._ride(B.ride, ts, (step === 4 || step === 12 ? 0.14 : 0.11) * rv * rand(0.9, 1.05));
      if (step === 4 || step === 12) this._hit(B.pedal, t, 0.06, this.hatBus);
      if (step % 4 === 0 && d > 0.3) this._hit(B.kick, t, 0.1, this.kickBus);
      if (cpFill) {
        const k = clamp((this._stepAbs - this._fillStart) / 8, 0, 1);
        if (step % 2 === 0) this._hit(B.snare, ts, 0.1 + 0.18 * k, this.snBus, rand(-0.2, 0.2));
        if (step % 4 === 2) this._hit(B.tom, ts, 0.3 + 0.2 * k, this.kickBus, step > 8 ? 0.35 : -0.35, 1.2 - 0.2 * k);
      } else if (phraseFill && step % 2 === 0) {
        this._hit(this._phraseI % 2 ? B.tom : B.snare, ts, 0.16 + 0.04 * (step - 12), this._phraseI % 2 ? this.kickBus : this.snBus, 0.3 - 0.15 * (step - 12), [1.3, 1, 1.1, 0.9][(step - 12) >> 1 & 3]);
      } else if (d > 0.5 && step % 4 === 2 && Math.random() < 0.12 + 0.35 * (d - 0.5)) {
        this._hit(B.snare, ts, rand(0.05, 0.12), this.snBus, 0.1);
      }
      if (d > 0.8 && step === 14 && Math.random() < 0.15) this._hit(B.kick, ts, 0.3, this.kickBus);
      return;
    }

    // fusion kit
    const hitOf = (list) => { let v = 0; for (let i = 0; i < list.length; i++) if (d >= list[i][0] && list[i][1][step] > v) v = list[i][1][step]; return v; };
    const kv = hitOf(DR.kick);
    if (kv) this._hit(B.kick, ts, 0.3 * kv * rand(0.95, 1.02), this.kickBus);

    if (cpFill) {
      // checkpoint fill: a crescendo roll of snare and toms into the next section's downbeat
      const k = clamp((this._stepAbs - this._fillStart) / 8, 0, 1);
      if (step % 2 === 0 || k > 0.4) this._hit(B.snare, ts, 0.1 + 0.2 * k, this.snBus, rand(-0.2, 0.2));
      if (step % 4 === 3) this._hit(B.tom, ts, 0.32 + 0.2 * k, this.kickBus, step > 8 ? 0.35 : -0.35, 1.25 - 0.25 * k);
    } else if (phraseFill) {
      if (this._phraseI % 2) this._hit(B.tom, ts, 0.4, this.kickBus, 0.4 - 0.25 * (step - 12), [1.35, 1.2, 1.05, 0.9][step - 12]);
      else this._hit(B.snare, ts, 0.1 + 0.06 * (step - 12), this.snBus, 0.1);
    } else if (d >= 0.66) {
      const sv = hitOf(DR.snare);
      if (sv) this._hit(B.snare, ts, (sv === 1 ? 0.26 : 0.07) * rand(0.9, 1.05), this.snBus, 0.05);
    } else {
      const xv = hitOf(DR.xstick);
      if (xv) this._hit(B.xstick, ts, 0.17 * xv * rand(0.9, 1.05), this.snBus, 0.1);
    }

    if (d < 0.6) {
      const rv = hitOf(DR.ride);
      if (rv) this._ride(B.ride, ts, 0.12 * rv * rand(0.9, 1.05));
      const pv = hitOf(DR.pedal);
      if (pv) this._hit(B.pedal, t, 0.055, this.hatBus);
    } else {
      const ov = hitOf(DR.open);
      if (ov) this._hit(B.open, ts, 0.065, this.hatBus);
      else {
        const hv = hitOf(DR.hat);
        if (hv) this._hit(B.hat, ts, 0.1 * (step % 4 === 0 ? 1 : step % 2 === 0 ? 0.7 : 0.5) * rand(0.85, 1.05), this.hatBus);
      }
    }
    if (S.perc) {
      const cv = hitOf(DR.conga);
      if (cv) this._hit(B.conga, ts, 0.13 * rand(0.85, 1.05), this.snBus, -0.45, cv === 1 ? 0.82 : 1.12);
      const sv = hitOf(DR.shk);
      if (sv) this._hit(B.shk, ts, 0.05 * sv * rand(0.8, 1.05), this.hatBus, -0.7, rand(0.95, 1.05));
    }
  }

  // -------------------------------------------------------------- lead

  _leadStep(t, step, sd, S) {
    const L = this._lead;
    if (!L) return;
    const pos = this._pib * 16 + step, mel = L.mel;
    while (L.i < mel.length && mel[L.i] < pos) L.i += 4;
    if (L.i >= mel.length || mel[L.i] !== pos) return;
    const len = mel[L.i + 1], m = mel[L.i + 2], fl = mel[L.i + 3];
    const legato = L.prevEnd === pos;
    const tied = L.i + 4 < mel.length && mel[L.i + 4] === pos + len;
    L.prevEnd = pos + len; L.i += 4;
    const ts = t + this._sw(step, sd) + rand(0, 0.008);
    const te = t + len * sd + this._sw((step + len) % 16, sd);   // the end lands on the (swung) grid too
    this._leadNote(m, ts, Math.max(0.05, te - ts), legato, tied, fl & 4 ? 0.5 : 1, fl);
  }

  _leadNote(m, t, dur, legato, tied, vel, fl = 0) {
    if (!this.leadEnv) return;
    const T = this._T || TONE.moog;
    const f = mtof(m), g = this.leadEnv.gain, v = this.vibG.gain, fd = this.leadLp.detune;
    const scoop = fl & 1;
    for (const o of [this.leadO1, this.leadO2]) {
      const p = o.frequency;
      if (scoop) { p.setValueAtTime(f * Math.pow(2, -T.scoop / 12), t); p.setTargetAtTime(f, t + 0.012, 0.05); }
      else if (legato) p.setTargetAtTime(f, t, T.glide);
      else p.setValueAtTime(f, t);
      if (fl & 2) p.setTargetAtTime(f * Math.pow(2, -5 / 12), t + dur * 0.7, 0.09);   // fall-off
    }
    const pk = 0.13 * vel;
    if (legato && !scoop) g.setTargetAtTime(pk, t, 0.03);
    else { g.setTargetAtTime(pk * 1.15, t, 0.012); g.setTargetAtTime(pk, t + 0.05, 0.08); }
    if (!legato || scoop) { fd.setTargetAtTime(T.env * (0.6 + 0.4 * vel), t, 0.004); fd.setTargetAtTime(0, t + 0.01, 0.13); }
    v.setTargetAtTime(0, t, 0.02);
    v.setTargetAtTime(dur > 0.45 ? T.vib * (fl & 8 ? 1.6 : 1) : 4, t + Math.min(0.28, dur * 0.4), 0.22);
    if (!tied) g.setTargetAtTime(0, t + dur * (fl & 2 ? 0.95 : 0.9), fl & 2 ? 0.06 : 0.08);
  }

  _leadStop(t) {
    this._lead = null;
    if (!this.leadEnv) return;
    try {
      const g = this.leadEnv.gain;
      g.cancelScheduledValues(t); g.setTargetAtTime(0, t, 0.12);
    } catch (e) { /* ignore */ }
  }

  _dangerStep(t, step, sd) {
    if (!isArc(this._sect) && this._sect !== 'tension') return;
    const dz = this._danger;
    if (dz < 0.22) return;
    const k = smooth((dz - 0.22) / 0.45);
    if (step % 2 === 0 || dz > 0.62) this._hit(this._b.tick, t, 0.2 * k * (step % 4 === 0 ? 1 : 0.65), this.hatBus, step % 4 === 0 ? -0.15 : 0.15, 1, true);
    if (step % 8 === 0 || (dz > 0.7 && step % 4 === 0)) {
      const rate = mtof(bassNote(chord(this._chord).bass)) / 55;
      this._hit(this._b.heart, t, 0.6 * k, this.kickBus, 0, rate, true);
      this._hit(this._b.heart, t + sd * 0.8, 0.38 * k, this.kickBus, 0, rate, true);
    }
  }

  // Sidechain-style dip on the big hits only: the strings (and a little of the reverb) duck and swell back.
  _pump(t, depth) {
    const g = this.pump.gain, r = this.pumpRev.gain;
    g.setTargetAtTime(1 - depth, t, 0.006); g.setTargetAtTime(1, t + 0.035, 0.18);
    r.setTargetAtTime(1 - 0.5 * depth, t, 0.006); r.setTargetAtTime(1, t + 0.035, 0.2);
  }

  // -------------------------------------------------------------- one-shot voices

  _take(prio) {
    if (this._voices >= (prio ? HARD_VOICES : MAX_VOICES)) return false;
    this._voices++;
    return true;
  }

  // Nodes hung off `src` are disconnected when it ends (onended fires on the audio clock, offline too).
  _release(src, nodes) {
    src.onended = () => {
      this._voices--;
      for (let i = 0; i < nodes.length; i++) { try { nodes[i].disconnect(); } catch (e) { /* ignore */ } }
    };
  }

  _hit(buf, t, vel, bus, pan = 0, rate = 1, prio = false) {
    if (!buf || this._silent() || !this._take(prio)) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = vel;
    src.connect(g);
    const nodes = [src, g];
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      g.connect(p); p.connect(bus); nodes.push(p);
    } else g.connect(bus);
    src.start(t);
    this._release(src, nodes);
    return { src, g };
  }

  // Ride (and ride bell): each stick hit damps the previous hit's tail, which keeps the voice count low (the new hit's
  // own wash covers it).
  _ride(buf, t, vel) {
    const p = this._lastRide, r = this._hit(buf, t, vel, this.hatBus);
    if (!r) return;
    if (p && p.t < t) { try { p.g.gain.setTargetAtTime(0, t + 0.02, 0.07); p.src.stop(t + 0.4); } catch (e) { /* ignore */ } }
    r.t = t; this._lastRide = r;
  }

  // A vibraphone note from the nearest pre-rendered bar, repitched.
  _bell(m, t, vel, pan, prio) {
    const base = nearestBase(VIB_BASE, m);
    this._hit(this._b['vib' + base], t, 0.12 * vel, this.bellBus, clamp(pan || 0, -1, 1), Math.pow(2, (m - base) / 12), prio);
  }

  // Cymbal swell (a mallet roll on a suspended cymbal): looped noise through a rising band-pass. With `dur` it
  // peaks at t + dur and stops; without, it swells open-ended (airborne) until cut.
  _riser(t, dur, lvl) {
    if (!this._b.noise || this._silent() || !this._take(true)) return null;
    const ctx = this.ctx, open = !(dur > 0), len = open ? 4 : dur;
    const src = ctx.createBufferSource(); src.buffer = this._b.noise; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(EPS, t);
    if (open) {
      bp.frequency.setValueAtTime(2500, t); bp.frequency.setTargetAtTime(9000, t, 1.2);
      g.gain.setTargetAtTime(lvl, t, 0.8);
    } else {
      bp.frequency.setValueAtTime(2500, t); bp.frequency.exponentialRampToValueAtTime(9000, t + dur);
      g.gain.exponentialRampToValueAtTime(lvl, t + dur);
      g.gain.setTargetAtTime(EPS, t + dur, 0.05);
    }
    src.connect(bp); bp.connect(g); g.connect(this.fxBus);
    src.start(t, Math.random() * 0.4);
    const end = t + len + 0.4;
    src.stop(end);
    this._release(src, [src, bp, g]);
    return { g, src, end };
  }

  _cutRiser(t) {
    const r = this._airRiser;
    this._airRiser = null;
    if (!r || r.end < t) return;
    try {
      r.g.gain.cancelScheduledValues(t); r.g.gain.setTargetAtTime(0, t, 0.04);
      r.src.stop(t + 0.3);
    } catch (e) { /* ignore */ }
  }

  // -------------------------------------------------------------- gameplay moments

  _airStart() {
    if (!isArc(this._sect) && this._sect !== 'tension') return;
    const t = this.ctx.currentTime + 0.01;
    this._cutRiser(t);
    this._airRiser = this._riser(t, 0, 0.1);
  }

  // Landing: the swell is cut and a downbeat hits (kick, crash, a hard piano stab, bass root), scaled by the airtime.
  _airEnd(airT, impact) {
    const t = this.ctx.currentTime + 0.01;
    this._cutRiser(t);
    if (!impact || airT < 0.4 || this._silent()) return;
    const k = clamp((airT - 0.3) / 1.2, 0, 1), B = this._b;
    this.kickLp.frequency.cancelScheduledValues(t);
    this.kickLp.frequency.setTargetAtTime(18000, t, 0.005);
    this._hit(B.kick, t, 0.5 + 0.3 * k, this.kickBus, 0, 1, true);
    this._hit(B.crash, t, 0.13 + 0.22 * k, this.fxBus, -0.2, 1, true);
    this._pump(t, 0.3 + 0.3 * k);
    const ch = chord(this._chord);
    if (this._voicing && this._sect !== 'tension') this._chordHit(ch, this._voicing, t, 0.9 + 0.1 * k, 0, 0.004, true);
    this._bassNote(bassNote(ch.bass), t, 60 / this._bpm, 1, false, 1);
  }

  _start(downbeat) {
    const t = this.ctx.currentTime;
    this._run = true; this._ending = null; this._tense = false;
    this._danger = 0; this._progress = 0; this._cps = 0; this._cpChangeAt = -1; this._fillStart = -1;
    this._int = Math.max(this._int, 0.2);
    this._leadStop(t); this._cutRiser(t); this._resetTape(t); this._choke(t);
    this._sect = 'intro'; this._pushed = false;
    this._leadTone(SECT.intro.tone, t);
    this._restart(t + 0.06, BPM_RUN);
    this._accent = !!downbeat;
  }

  // Oasis: everything resolves onto Fmaj9: a crash and soft kick, the low F, a big rolled piano chord, vibes running
  // up the chord, the lead sighing G5 -> A5, and the strings swelling open; then the outro picks up on the same chord.
  _finish() {
    const ctx = this.ctx, t = ctx.currentTime + 0.03, B = this._b;
    this._ending = 'win'; this._tense = false; this._danger = 0;
    this._leadStop(t); this._cutRiser(t);
    for (const p of [this.arpEnv.gain, this.bassEnv.gain]) { p.cancelScheduledValues(t); p.setTargetAtTime(0, t, 0.05); }
    this._sect = 'outro'; this._pushed = false;
    this._leadTone('soar', t);
    this._setChord('Fmaj9', t, 0.06);
    this._glow = 1;
    if (!this._silent()) {
      this._hit(B.crash, t, 0.32, this.fxBus, 0, 1, true);
      this._hit(B.kick, t, 0.55, this.kickBus, 0, 1, true);
      this._pump(t, 0.4);
      this._bassNote(41, t + 0.02, 3.4, 1, false, 0.6);
      this._chordHit(chord('Fmaj9'), this._voicing, t + 0.02, 0.95, 0, 0.03, true);
      [65, 69, 72, 76, 79, 81, 84, 88].forEach((m, i) => this._bell(m, t + 0.12 + i * 0.075, 0.75 - i * 0.04, (i / 7) * 1.2 - 0.6, true));
      this._leadNote(79, t + 0.1, 0.35, false, true, 1.1, 0);
      this._leadNote(81, t + 0.45, 2.6, true, false, 1.1, 8);
    }
    this._restart(t + 3.2, BPM_CALM);
  }

  // Evaporated: a tape stop. The tape delay's time ramps up quadratically (the pitch of everything falls
  // towards zero, accelerating, like a reel slowing), the tone darkens and the level falls away to near
  // silence; then the silence section leaves only a barely audible Dm11 pad.
  _dead() {
    const ctx = this.ctx, t = ctx.currentTime + 0.03;
    this._ending = 'dead'; this._tense = false;
    this._lead = null; this._cutRiser(t);
    this._sect = 'silence'; this._pushed = false;
    const T = 1.8, n = 64, a = 0.84 / (2 * T), curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * T; curve[i] = TAPE_BASE + a * x * x; }
    try {
      const d = this.tape.delayTime;
      if (d.cancelAndHoldAtTime) d.cancelAndHoldAtTime(t); else d.cancelScheduledValues(t);
      d.setValueCurveAtTime(curve, t, T);
      this._tapeDown = true;
      this._tapeEnd = t + T;
    } catch (e) { this._errors++; }
    this.toneLp.frequency.cancelScheduledValues(t);
    this.toneLp.frequency.setTargetAtTime(280, t + 0.3, 0.5);
    this.fallG.gain.cancelScheduledValues(t);
    this.fallG.gain.setValueAtTime(1, t);
    this.fallG.gain.setTargetAtTime(0.04, t + 0.5, 0.45);
    this._restart(t + T + 0.6, BPM_CALM);
  }

  // Undo a tape stop: gate the output for a moment while the delay snaps back.
  _resetTape(t) {
    if (!this._tapeDown) return;
    this._tapeDown = false;
    // (without cancelAndHoldAtTime, e.g. Firefox, a curve already running can't be cut short: wait for it to end,
    // muted, rather than set a value inside it, which throws)
    let back = t + 0.08;
    try {
      this.tapeG.gain.cancelScheduledValues(t);
      this.tapeG.gain.setTargetAtTime(0, t, 0.01);
      const d = this.tape.delayTime;
      if (d.cancelAndHoldAtTime) d.cancelAndHoldAtTime(t + 0.06);
      else {
        d.cancelScheduledValues(t);
        back = Math.max(back, (this._tapeEnd || 0) + 0.02);
      }
      d.setValueAtTime(TAPE_BASE, back - 0.01);
    } catch (e) { this._errors++; }
    try {
      this.tapeG.gain.setTargetAtTime(1, back, 0.05);
    } catch (e) { this._errors++; }
    this.toneLp.frequency.cancelScheduledValues(t);
    this.toneLp.frequency.setTargetAtTime(14000, t + 0.08, 0.1);
    this.fallG.gain.cancelScheduledValues(t);
    this.fallG.gain.setTargetAtTime(1, t + 0.08, 0.3);
  }

  // Puddle: vibes falling through the chord and a brief brightening of the piano, strings and clav.
  _puddle() {
    this._glow = 1;
    if (this._mode !== 'play' || this._silent()) return;
    const t = this.ctx.currentTime + 0.02, lad = ladderOf(chord(this._chord), 84, true);
    for (let i = 0; i < 5; i++) this._bell(lad[Math.min(lad.length - 1, 6 - i)], t + i * 0.06, 0.8 - i * 0.1, 0.5 - i * 0.25, true);
    if (this._sect === 'tension') this._hit(this._b.crash, t, 0.18, this.fxBus, 0, 1, true);
  }

  // Desert flower: vibes up the current chord, starting higher and running longer with each bloom.
  // The last flower gets a two-octave sweep, a crash, the low root and a full brightening.
  _bloom(n, of) {
    if (this._silent()) return;
    const t = this.ctx.currentTime + 0.02, ch = chord(this._chord);
    const lad = ladderOf(ch, 72, true);
    this._glow = 1;
    if (n >= of) {
      const run = lad.slice(0, Math.min(lad.length, 11));
      run.forEach((m, i) => this._bell(m, t + i * 0.06, 0.7 + 0.03 * i, (i / run.length) * 1.4 - 0.7, true));
      this._hit(this._b.crash, t + run.length * 0.06, 0.3, this.fxBus, 0, 1, true);
      this._hit(this._b.kick, t, 0.45, this.kickBus, 0, 1, true);
      this._bassNote(bassNote(ch.bass), t, 1.2, 1, false, 0.8);
      return;
    }
    const count = Math.min(7, 2 + n), start = Math.min(n - 1, 3);
    for (let i = 0; i < count; i++) {
      const m = lad[Math.min(lad.length - 1, start + i)];
      this._bell(m, t + i * 0.07, 0.6 + 0.05 * i, -0.4 + (0.8 * i) / count, true);
    }
  }

  // Split marker: a fill and cymbal swell into the next section, which starts on the following downbeat with a
  // crash. Ahead of the best run, a bright rising vibes motif; behind, a single gentle note.
  _checkpoint(ahead) {
    if (this._mode !== 'play') return;
    this._cps = Math.min(4, this._cps + 1);
    const ctx = this.ctx, now = ctx.currentTime, sd = this._stepDur();
    const unsched = this._barAbs * 16 + this._step + (this._step === 0 ? 16 : 0);   // next step not yet scheduled
    const curBar = Math.floor((unsched - 1) / 16);
    const left = (curBar + 1) * 16 - unsched;
    const changeBar = left >= 6 ? curBar + 1 : curBar + 2;
    this._cpChangeAt = changeBar;
    this._fillStart = Math.max(unsched, (changeBar - 1) * 16 + 8);
    if (this._silent()) return;
    const tChange = this._next + (changeBar * 16 - unsched) * sd;
    if (!this._tense) this._riser(now + 0.02, Math.max(0.4, tChange - now - 0.02), 0.09);
    const t = now + 0.02, lad = ladderOf(chord(this._chord), 79, true);
    if (ahead === true) {
      this._bell(lad[0], t, 0.7, 0.3, true); this._bell(lad[2], t + 0.09, 0.75, 0.3, true); this._bell(lad[4], t + 0.18, 0.85, 0.3, true);
    } else this._bell(lad[1], t, 0.6, 0, true);
  }
}

// ---------------------------------------------------------------- exports for tests and remixing (added by the block)
export { QUAL, PROG, MEL, SECT, TONE, COMP, CLAV, BASS, DR, ARC, chord, ladderOf, mel, bassNote, mtof, LEVEL, BPM_RUN, BPM_CALM };
