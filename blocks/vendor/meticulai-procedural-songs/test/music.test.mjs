// Procedural songs unit tests: pure generators (scales, progressions, melody grammar, pattern bounds), the swing/look-ahead
// StepClock with a fake clock, and the MusicEngine on the strict FakeContext (lifecycle, voice cap, no leaks, throttling).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeContext } from './fake-audio.mjs';
import {
  SCALES, CHORDS, KEYS, KINDS, INSTS, MODE_STYLE, STEPS_PER_BAR, generateSong, locateBar, chordAt, chordPcs, chordScale,
  layoutChords, voiceChord, arpPool, bassBase, hashSeed, tonicMid,
} from '../src/music-gen.js';
import { StepClock, stepOffset, stepTimeAt, swingSplit } from '../src/music-sched.js';
import { MusicEngine, renderMusic } from '../src/music.js';
import { Budget } from '../src/music-voices.js';

const mod12 = (x) => ((x % 12) + 12) % 12;
const SEEDS = Array.from({ length: 24 }, (_, i) => i * 7919 + 1);

// ===================================================================== theory
test('scales and chord tables are well-formed', () => {
  for (const [name, sc] of Object.entries(SCALES)) {
    assert.equal(sc.length, 7, name);
    for (let i = 1; i < 7; i++) assert.ok(sc[i] > sc[i - 1] && sc[i] < 12, `${name} ascending`);
    assert.equal(sc[0], 0);
  }
  for (const [name, c] of Object.entries(CHORDS)) {
    assert.ok(c.length >= 3 && c.length <= 4, name);
    for (let i = 1; i < c.length; i++) assert.ok(c[i] > c[i - 1] && c[i] < 12, `${name} ascending`);
  }
  assert.ok(KEYS.every((k) => k >= 0 && k < 12));
});

test('chordScale always names a real scale that contains the chord tones', () => {
  for (const minor of [false, true]) {
    for (const type of Object.keys(CHORDS)) {
      for (let rel = 0; rel < 12; rel++) {
        const name = chordScale(rel, type, minor);
        assert.ok(SCALES[name], `${type}@${rel} -> ${name}`);
        // chord tones: scale steps 0,2,4 must give root/3rd/5th for the triad types
        const sc = SCALES[name], third = sc[2], fifth = sc[4];
        const iv = CHORDS[type];
        if (type !== 'sus4' && type !== 'dim7') {
          assert.equal(third, iv[1], `${type}@${rel} ${name} third`);
          assert.equal(fifth, iv[2], `${type}@${rel} ${name} fifth`);
        }
      }
    }
  }
});

test('layoutChords tiles the bars with no gaps', () => {
  const ch = layoutChords([[[0, 'maj']], [[2, 'min7'], [7, 'dom7']], [[0, 'maj6']], [[7, 'dom7']]], 3);
  assert.deepEqual(ch.map((c) => [c.s, c.d]), [[0, 16], [16, 8], [24, 8], [32, 16], [48, 16]]);
  assert.equal(ch[0].root, 3);
  assert.equal(ch[1].root, 5);
  assert.equal(chordAt(ch, 30).type, 'dom7');
  assert.equal(chordAt(ch, 0).type, 'maj');
  assert.equal(chordAt(ch, 63).root, mod12(3 + 7));
});

test('voicings: ascending, correct pitch classes, stable register', () => {
  for (const type of Object.keys(CHORDS)) {
    for (let root = 0; root < 12; root++) {
      const ch = { root, type, s: 0, d: 16, rel: 0, scale: 'major' };
      const v = voiceChord(ch, { lo: 57, center: 66 });
      assert.equal(v.length, CHORDS[type].length);
      for (let i = 1; i < v.length; i++) assert.ok(v[i] > v[i - 1]);
      assert.deepEqual(new Set(v.map(mod12)), new Set(chordPcs(ch)));
      assert.ok(v[0] >= 57 && v[v.length - 1] <= 57 + 23);
      const a = arpPool(ch);
      assert.equal(a.length, 4);
      assert.ok(a[0] >= 69 && a[3] <= 94 && a.every((x, i) => i === 0 || x > a[i - 1]));
      const b = bassBase(root);
      assert.ok(b >= 38 && b <= 49 && mod12(b) === root);
    }
  }
});

// ===================================================================== generation
const sig = (song) => JSON.stringify(song.sections.map((s) => [s.id, s.bars, s.tracks]));

test('generateSong is deterministic per seed and kind', () => {
  for (const kind of KINDS) {
    for (const seed of [1, 2, 99, 123456]) {
      const a = generateSong(kind, seed), b = generateSong(kind, seed);
      assert.equal(sig(a), sig(b), `${kind}/${seed}`);
      assert.equal(a.bpm, b.bpm);
      assert.equal(a.rootPc, b.rootPc);
    }
  }
});

test('different seeds give different tunes, keys and progressions (per-play variation)', () => {
  for (const kind of KINDS) {
    const sigs = new Set(SEEDS.map((s) => sig(generateSong(kind, s))));
    assert.ok(sigs.size >= SEEDS.length - 2, `${kind}: ${sigs.size} distinct of ${SEEDS.length}`);
  }
  const keys = new Set(SEEDS.map((s) => generateSong('game', s).rootPc));
  assert.ok(keys.size >= 5, `keys: ${[...keys]}`);
  const progs = new Set(SEEDS.map((s) => generateSong('game', s).sections[0].chords.map((c) => c.rel + c.type).join(',')));
  assert.ok(progs.size >= 4, `A-section progressions: ${progs.size}`);
  const leads = new Set(SEEDS.map((s) => JSON.stringify(generateSong('game', s).sections[0].tracks.lead.filter((e) => e.i === 0.2).slice(0, 8).map((e) => [e.s, e.d, e.n - tonicMid(generateSong('game', s).rootPc)]))));
  assert.ok(leads.size >= 12, `distinct hooks: ${leads.size}`);
});

test('kinds of one seed share a key (the sudden-death swap stays in the family); the menu is in another key', () => {
  for (const seed of SEEDS) {
    const g = generateSong('game', seed), t = generateSong('tense', seed), r = generateSong('results', seed), m = generateSong('menu', seed);
    assert.equal(g.rootPc, t.rootPc);
    assert.equal(g.rootPc, r.rootPc);
    assert.notEqual(m.rootPc, g.rootPc);
  }
});

test('tempo and swing stay inside each mode style; menu is slower than game', () => {
  for (const kind of KINDS) {
    const st = MODE_STYLE[kind];
    for (const seed of SEEDS) {
      const s = generateSong(kind, seed);
      assert.ok(s.bpm >= st.bpm[0] && s.bpm <= st.bpm[1], `${kind} bpm ${s.bpm}`);
      assert.ok(Math.abs(s.swing - st.swing) <= 0.05, `${kind} swing ${s.swing}`);
    }
  }
  assert.ok(MODE_STYLE.menu.bpm[1] < MODE_STYLE.game.bpm[0]);
  assert.ok(MODE_STYLE.tense.swing < MODE_STYLE.game.swing);
});

test('song structure: 8-bar sections, 4+ distinct sections for game, loop points sane', () => {
  for (const seed of SEEDS.slice(0, 8)) {
    const g = generateSong('game', seed);
    assert.deepEqual(g.sections.map((s) => s.id), ['A', 'A2', 'B', 'A3', 'C']);
    assert.ok(g.sections.every((s) => s.bars === 8 && s.steps === 128));
    assert.equal(g.totalBars, 40);
    const t = generateSong('tense', seed);
    assert.equal(t.sections.length, 3);
    assert.ok(t.chords === undefined);
    const m = generateSong('menu', seed);
    assert.equal(m.sections.length, 4);
    const r = generateSong('results', seed);
    assert.equal(r.sections[0].id, 'F');
    assert.equal(r.sections[0].bars, 4);
    assert.equal(r.loopFrom, 1);
    // locateBar wraps back to the loop start, skipping the fanfare
    assert.equal(locateBar(r, 0).index, 0);
    assert.equal(locateBar(r, 4).index, 1);
    assert.equal(locateBar(r, 4 + 16).index, 1);
    assert.equal(locateBar(r, 4 + 8).index, 2);
    assert.equal(locateBar(g, 40).index, 0);
    assert.equal(locateBar(g, 39).index, 4);
    assert.equal(locateBar(g, 39).bar, 7);
  }
});

test('every section: chords tile the section, events are in bounds and well-formed, index matches the tracks', () => {
  for (const kind of KINDS) {
    for (const seed of [1, 5, 77]) {
      const song = generateSong(kind, seed);
      for (const sec of song.sections) {
        let at = 0;
        for (const c of sec.chords) { assert.equal(c.s, at); at += c.d; assert.ok(SCALES[c.scale] && CHORDS[c.type]); }
        assert.equal(at, sec.steps, `${kind}/${sec.id} chords cover section`);
        let count = 0;
        for (const inst of INSTS) {
          for (const e of sec.tracks[inst]) {
            count++;
            const where = `${kind}/${sec.id}/${inst}`;
            assert.ok(Number.isInteger(e.s) && e.s >= 0 && e.s < sec.steps, `${where} s=${e.s}`);
            assert.ok(Number.isFinite(e.d) && e.d >= 1, `${where} d=${e.d}`);
            assert.ok(e.v > 0 && e.v <= 1.01, `${where} v=${e.v}`);
            assert.ok(e.i >= 0 && e.x >= e.i, `${where} window ${e.i}..${e.x}`);
            if (e.n !== undefined) {
              for (const n of [].concat(e.n)) assert.ok(Number.isInteger(n) && n >= 24 && n <= 108, `${where} midi ${n}`);
            }
            if (inst === 'bass') assert.ok(e.n >= 33 && e.n <= 62, `bass range ${e.n}`);
            if (inst === 'lead') assert.ok(e.n >= 50 && e.n <= 100, `lead range ${e.n}`);
            if (inst === 'stab' || inst === 'pad') assert.ok(Array.isArray(e.n) && e.n.length >= 3);
            if (['bass', 'lead', 'arp', 'siren'].includes(inst)) assert.ok(Number.isFinite(e.n), `${where} needs a pitch`);
          }
        }
        const indexed = sec.byStep.reduce((a, l) => a + l.length, 0);
        assert.equal(indexed, count, `${kind}/${sec.id} index`);
        assert.equal(sec.byStep.length, sec.steps);
      }
    }
  }
});

const leadMain = (sec) => sec.tracks.lead.filter((e) => !e.g && e.k !== 'hi' && !(e.k === 'brass' && e.v < 0.6));
const barRhythm = (notes, bar) => notes.filter((e) => e.s >= bar * 16 && e.s < bar * 16 + 16).map((e) => `${e.s - bar * 16}:${e.d}`).join(' ');

test('melody grammar: the hook repeats (bar 1 = bar 5 rhythm), sections are varied, phrases breathe', () => {
  for (const seed of SEEDS) {
    const g = generateSong('game', seed);
    const [A, A2, B, A3, C] = g.sections;
    const a = leadMain(A);
    assert.equal(barRhythm(a, 0), barRhythm(a, 4), `seed ${seed}: hook recurs in the second phrase`);
    assert.equal(barRhythm(leadMain(A3), 0), barRhythm(a, 0), 'A3 reprises the hook');
    assert.ok(a.length >= 20, 'melody has substance');
    // call/response: bar 4 (open ending) and bar 8 (close) hold a long note
    for (const sec of [A, A2, A3]) assert.ok(leadMain(sec).some((e) => e.d >= 6), 'a cadence note is held');
    // contrast: B and C differ from A in most bars
    let diffB = 0, diffC = 0, diffA2 = 0;
    for (let b = 0; b < 8; b++) {
      if (barRhythm(leadMain(B), b) !== barRhythm(a, b)) diffB++;
      if (barRhythm(leadMain(C), b) !== barRhythm(a, b)) diffC++;
      if (JSON.stringify(leadMain(A2).filter((e) => e.s >= b * 16 && e.s < b * 16 + 16).map((e) => e.n)) !== JSON.stringify(a.filter((e) => e.s >= b * 16 && e.s < b * 16 + 16).map((e) => e.n))) diffA2++;
    }
    assert.ok(diffB >= 4, `B differs from A (${diffB} bars)`);
    assert.ok(diffC >= 5, `bridge differs from A (${diffC} bars)`);
    assert.ok(diffA2 >= 1, 'A2 is a variation of A');
    // note density per bar is human-playable
    for (let b = 0; b < 8; b++) assert.ok(a.filter((e) => e.s >= b * 16 && e.s < b * 16 + 16).length <= 12);
  }
});

test('melody harmony: strong-beat notes are chord tones; sections close on the tonic; leaps are singable', () => {
  for (const kind of ['game', 'tense']) {
    for (const seed of SEEDS) {
      const song = generateSong(kind, seed);
      for (const sec of song.sections) {
        const notes = sec.tracks.lead.filter((e) => !e.g && e.k !== 'hi');
        for (const e of notes) {
          if (e.s % 8 !== 0) continue;
          const ch = chordAt(sec.chords, e.s);
          assert.ok(chordPcs(ch).includes(mod12(e.n)), `${kind}/${sec.id} seed ${seed} s=${e.s} note ${e.n} not in ${ch.type}@${ch.root}`);
        }
        // melodic leaps between consecutive main notes: no jumps beyond a 12th
        const seq = notes.slice().sort((p, q) => p.s - q.s);
        for (let k = 1; k < seq.length; k++) {
          if (seq[k].s - seq[k - 1].s > 8) continue;      // across a rest, bigger jumps are fine
          assert.ok(Math.abs(seq[k].n - seq[k - 1].n) <= 19, `${kind}/${sec.id} leap ${seq[k - 1].n}->${seq[k].n}`);
        }
      }
    }
  }
  for (const seed of SEEDS) {
    const g = generateSong('game', seed);
    for (const id of ['A', 'A2', 'A3']) {
      const sec = g.sections.find((s) => s.id === id);
      const last = leadMain(sec).sort((p, q) => p.s - q.s).pop();
      assert.equal(mod12(last.n), g.rootPc, `${id} ends on the tonic (seed ${seed})`);
      assert.ok(last.s >= 7 * 16, 'final note sits in the last bar');
    }
  }
});

test('intensity layering: more events become audible as intensity rises; low intensity still has a groove', () => {
  const count = (song, I) => song.sections.reduce((a, sec) => a + INSTS.reduce((b, inst) => b + sec.tracks[inst].filter((e) => I >= e.i && I <= e.x).length, 0), 0);
  for (const seed of [1, 2, 3]) {
    const g = generateSong('game', seed);
    const c = [0, 0.15, 0.3, 0.5, 0.7, 0.9, 1].map((I) => count(g, I));
    for (let k = 1; k < c.length; k++) assert.ok(c[k] >= c[k - 1] * 0.97, `monotone-ish ${c}`);
    assert.ok(c[6] > c[0] * 1.8, `dense at the top: ${c}`);
    // always some kick + bass + something rhythmic even at 0
    const sec = g.sections[0];
    for (const inst of ['kick', 'bass']) assert.ok(sec.tracks[inst].some((e) => e.i === 0), inst);
    assert.ok(sec.tracks.wood.some((e) => e.i === 0 && e.x < 1) || sec.tracks.shaker.some((e) => e.i === 0));
  }
});

test('hashSeed spreads and tonicMid keeps the lead register in 62..73', () => {
  const s = new Set();
  for (let i = 0; i < 500; i++) s.add(hashSeed(i, 3));
  assert.equal(s.size, 500);
  for (let pc = 0; pc < 12; pc++) { const t = tonicMid(pc); assert.ok(t >= 62 && t <= 73 && mod12(t) === pc); }
});

// ===================================================================== swing + step clock
test('swing maths: straight, triplet and monotonic placement', () => {
  assert.equal(swingSplit(0), 0.5);
  assert.ok(Math.abs(swingSplit(1) - 2 / 3) < 1e-12);
  assert.deepEqual([0, 1, 2, 3].map((k) => stepOffset(k, 0)), [0, 0.25, 0.5, 0.75]);
  const t = [0, 1, 2, 3].map((k) => stepOffset(k, 1));
  assert.ok(Math.abs(t[1] - 1 / 3) < 1e-12 && Math.abs(t[2] - 2 / 3) < 1e-12 && Math.abs(t[3] - 5 / 6) < 1e-12);
  for (const sw of [0, 0.3, 0.6, 1]) {
    let prev = -1;
    for (let k = 0; k < 4; k++) { const o = stepOffset(k, sw); assert.ok(o > prev && o < 1); prev = o; }
  }
  // 120 bpm = 2 beats/s: step 4 starts exactly at 0.5 s whatever the swing
  assert.ok(Math.abs(stepTimeAt(4, 120, 0.7) - 0.5) < 1e-12);
  assert.ok(Math.abs(stepTimeAt(8, 120, 0.7, 10) - 11) < 1e-12);
  // the swung off-beat 8th (step 2) lands late: ratio of long:short 8th = split/(1-split)
  const r = swingSplit(0.6) / (1 - swingSplit(0.6));
  assert.ok(r > 1.2 && r < 1.5);
});

function runClock({ bpm = 120, swing = 0.5, until = 10, dt = 0.1, ahead = 0.4, getBpm } = {}) {
  let now = 0;
  const steps = [];
  const clock = new StepClock({
    now: () => now, getBpm: getBpm ? () => getBpm(now) : () => bpm, getSwing: () => swing, ahead,
    onStep: (t, info) => steps.push({ t, now, ...info }),
  });
  clock.start(0.5);
  while (now < until) { now += dt; clock.tick(); }
  return { clock, steps };
}

test('StepClock: every 16th scheduled exactly once, on the swung grid, ahead of the audio clock, never in the past', () => {
  const { steps, clock } = runClock({ bpm: 120, swing: 0.62, until: 20 });
  assert.ok(steps.length >= 20 * 8 - 4 && steps.length <= 20 * 8 + 12, `n=${steps.length}`);
  steps.forEach((s, i) => {
    assert.equal(s.n, i);
    assert.ok(Math.abs(s.t - stepTimeAt(i, 120, 0.62, 0.5)) < 1e-9, `step ${i}`);
    assert.ok(s.t >= s.now - 1e-9, 'never scheduled in the past');
    assert.ok(s.t - s.now <= 0.4 + 1e-9, `look-ahead bound ${s.t - s.now}`);
  });
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i].t > steps[i - 1].t);
  assert.equal(clock.skipped, 0);
  assert.equal(clock.resyncs, 0);
});

test('StepClock: no drift over a long run (step n always at the analytic time)', () => {
  const { steps } = runClock({ bpm: 133, swing: 0.5, until: 600, dt: 0.1 });
  const last = steps[steps.length - 1];
  assert.ok(Math.abs(last.t - stepTimeAt(last.n, 133, 0.5, 0.5)) < 1e-6);
  assert.ok(steps.length > 600 * 133 / 60 * 4 - 8);
});

test('StepClock: tempo changes apply per beat, stay monotonic and gap-free', () => {
  const { steps } = runClock({ until: 12, getBpm: (now) => (now < 5 ? 100 : 150) });
  for (let i = 1; i < steps.length; i++) {
    const dt = steps[i].t - steps[i - 1].t;
    assert.ok(dt > 0.03 && dt < 0.2, `spacing ${dt}`);
  }
  const early = steps.filter((s) => s.t < 4), late = steps.filter((s) => s.t > 7 && s.t < 11);
  assert.ok(late.length / 4 > early.length / 4 * 1.35, `late ${late.length} early ${early.length}`);
});

test('StepClock: a stalled timer resyncs to the next beat instead of bursting; look-ahead adapts to throttling', () => {
  let now = 0;
  const steps = [], skips = [];
  const clock = new StepClock({ now: () => now, getBpm: () => 120, getSwing: () => 0.5, onStep: (t, i) => steps.push({ t, now, ...i }), onSkip: (n) => skips.push(n) });
  clock.start(0.05);
  for (let k = 0; k < 10; k++) { now += 0.1; clock.tick(); }
  const before = steps.length;
  now += 30;                                  // tab asleep for 30 s
  const n = clock.tick();
  assert.ok(n <= 32 && n <= 14, `burst of ${n}`);
  assert.equal(clock.resyncs, 1);
  assert.ok(steps.slice(before).every((s) => s.t >= now), 'resumed steps are in the future');
  assert.ok(steps[before].k === 0, 'resumes on a beat boundary');
  // throttled timer (1 Hz): look-ahead grows so the music keeps going without gaps
  const t0 = steps.length;
  for (let k = 0; k < 8; k++) { now += 1; clock.tick(); }
  assert.ok(clock.aheadEff > 1.0 && clock.aheadEff <= 1.5, `ahead ${clock.aheadEff}`);
  const seq = steps.slice(t0);
  for (let i = 1; i < seq.length; i++) assert.ok(seq[i].t - seq[i - 1].t < 0.3, 'no audible gap at 1 Hz ticks');
  // back to a fast timer: look-ahead relaxes
  for (let k = 0; k < 80; k++) { now += 0.1; clock.tick(); }
  assert.ok(clock.aheadEff < 0.6, `relaxed ${clock.aheadEff}`);
  void skips;
});

test('StepClock: a frozen (suspended) audio clock schedules nothing new; explicit horizon renders offline', () => {
  let now = 5;
  const steps = [];
  const clock = new StepClock({ now: () => now, getBpm: () => 120, onStep: (t) => steps.push(t) });
  clock.start(5.05);
  clock.tick();
  const first = steps.length;
  for (let k = 0; k < 50; k++) clock.tick();
  assert.equal(steps.length, first, 'no growth while suspended');
  const off = [];
  const c2 = new StepClock({ now: () => 0, getBpm: () => 120, getSwing: () => 0, onStep: (t) => off.push(t) });
  c2.start(0);
  let total = 0;
  for (let k = 0; k < 20; k++) total += c2.tick(10);
  assert.equal(total, 80);
  assert.ok(Math.abs(off[79] - 9.875) < 1e-9);
});

// ===================================================================== voice budget
test('Budget caps simultaneous sources and drops low-priority voices first', () => {
  const b = new Budget(10);
  for (let k = 0; k < 6; k++) assert.ok(b.take(1, 2, 0, 1));
  assert.ok(!b.take(1, 2, 0, 1), 'pri 0 refused at 60 %');
  assert.ok(b.take(1, 2, 1, 1) && b.take(1, 2, 1, 1));
  assert.ok(!b.take(1, 2, 1, 1), 'pri 1 refused at 80 %');
  assert.ok(b.take(1, 2, 2, 1) && b.take(1, 2, 2, 1));
  assert.ok(!b.take(1, 2, 2, 1), 'hard cap');
  assert.ok(b.take(3.5, 1, 0, 1), 'voices that ended free their slots');
  assert.equal(b.peak, 10);
});

// ===================================================================== engine on the strict fake context
function makeEngine(opts = {}) {
  const ctx = new FakeContext();
  const bus = ctx.createGain();
  bus.connect(ctx.destination);
  const timers = { handlers: new Map(), id: 0, cleared: 0, timeouts: [] };
  const eng = new MusicEngine(ctx, bus, {
    seed: 11,
    timers: {
      setInterval: (fn) => { const id = ++timers.id; timers.handlers.set(id, fn); return id; },
      clearInterval: (id) => { if (timers.handlers.delete(id)) timers.cleared++; },
      setTimeout: (fn, ms) => { const id = ++timers.id; timers.timeouts.push({ id, fn, ms }); return id; },
      clearTimeout: (id) => { timers.timeouts = timers.timeouts.filter((t) => t.id !== id); },
    },
    ...opts,
  });
  const advance = (sec, dt = 0.1) => { for (let t = 0; t < sec - 1e-9; t += dt) { ctx.currentTime += dt; for (const fn of [...timers.handlers.values()]) fn(); } };
  return { ctx, bus, eng, timers, advance };
}

test('engine never throws without a usable context', () => {
  for (const eng of [new MusicEngine(null, null), new MusicEngine(undefined, undefined), new MusicEngine({}, {})]) {
    assert.doesNotThrow(() => {
      eng.start('menu'); eng.setMode('game', 0.5); eng.setIntensity(0.5, { tempoMul: 1.2, sudden: true }); eng.setIntensity(NaN, { tempoMul: NaN });
      eng.tick(); eng.stop(0.2); eng.stop(0); eng.dispose(); eng.dispose(); eng.start('game');
    });
  }
  const { ctx, eng } = makeEngine();
  ctx.state = 'closed';
  assert.doesNotThrow(() => { eng.start('menu'); eng.tick(); eng.dispose(); });
  assert.equal(eng.running, false);
});

test('engine lifecycle: start -> play -> stop halts timers and nodes; dispose is idempotent', () => {
  const { ctx, eng, timers, advance } = makeEngine();
  assert.equal(timers.handlers.size, 0);
  eng.start('menu');
  assert.equal(eng.running, true);
  assert.equal(timers.handlers.size, 1, 'exactly one timer');
  eng.start('menu');
  assert.equal(timers.handlers.size, 1, 'second start does not add a timer');
  advance(3);
  assert.ok(eng.stats.steps > 20, `steps ${eng.stats.steps}`);
  assert.equal(eng.stats.errors, 0, String(eng.lastError));
  eng.stop(0.5);
  advance(1.2);
  assert.equal(eng.running, false);
  assert.equal(timers.handlers.size, 0, 'timer cleared after the fade');
  const nodesAtStop = ctx.nodes.length;
  advance(2);
  assert.equal(ctx.nodes.length, nodesAtStop, 'nothing is scheduled once stopped');
  eng.start('game');
  assert.equal(eng.running, true);
  advance(1);
  eng.dispose();
  eng.dispose();
  assert.equal(timers.handlers.size, 0);
  assert.equal(ctx.unstopped().length, 0, 'every source stopped (incl. the vibrato LFO)');
  assert.equal(ctx.unstarted().length, 0);
  assert.equal(ctx.warnings.length, 0, ctx.warnings.join('\n'));
  eng.start('menu');
  assert.equal(eng.running, false, 'disposed engines stay dead');
});

test('stop(0) halts immediately; stop is safe when not running', () => {
  const { eng, timers, advance } = makeEngine();
  eng.stop(0.3);
  eng.start('game');
  advance(1);
  eng.stop(0);
  assert.equal(eng.running, false);
  assert.equal(timers.handlers.size, 0);
  eng.dispose();
});

test('stop() has a wall-clock fallback when the audio clock is frozen', () => {
  const { ctx, eng, timers } = makeEngine();
  eng.start('menu');
  eng.stop(0.4);
  ctx.state = 'suspended';
  assert.equal(timers.timeouts.length, 1, 'fallback halt timer armed');
  timers.timeouts[0].fn();
  assert.equal(eng.running, false);
  assert.equal(timers.handlers.size, 0);
  eng.dispose();
});

test('all scheduled events are finite, ordered sensibly and only slightly ahead of the audio clock', () => {
  const { ctx, eng, advance } = makeEngine();
  eng.setIntensity(0.8, { tempoMul: 1.15 });
  eng.start('game');
  advance(20);
  assert.equal(ctx.warnings.length, 0, ctx.warnings.join('\n'));
  assert.ok(ctx.maxEventTime <= ctx.currentTime + 2.5, `scheduled up to ${ctx.maxEventTime} at ${ctx.currentTime}`);
  for (const s of ctx.sources) {
    assert.ok(s.startT >= 0 && Number.isFinite(s.startT));
    if (s.stopT !== null) assert.ok(s.stopT >= s.startT, 'stop after start');
  }
  assert.equal(eng.stats.errors, 0, String(eng.lastError));
  eng.dispose();
});

test('voice cap holds and the essential voices (kick/bass/lead) are never starved at the default cap', () => {
  const small = makeEngine({ maxVoices: 20 });
  small.eng.setIntensity(1, { tempoMul: 1.2 });
  small.eng.start('game');
  small.advance(25);
  assert.ok(small.eng.stats.peakVoices <= 20, `peak ${small.eng.stats.peakVoices}`);
  assert.ok(small.eng.stats.dropped > 0, 'the cap actually bit');
  assert.ok((small.eng.dropBy.hat || 0) + (small.eng.dropBy.arp || 0) + (small.eng.dropBy.shaker || 0) > (small.eng.dropBy.lead || 0), 'sparkle goes first');
  small.eng.dispose();
  for (const [mode, sudden] of [['game', false], ['game', true], ['menu', false], ['results', false]]) {
    const b = makeEngine();
    b.eng.setIntensity(1, { tempoMul: 1.25, sudden });
    b.eng.start(mode);
    b.advance(40);
    const d = b.eng.dropBy;
    assert.ok(b.eng.stats.peakVoices <= 64, `${mode} default cap ${b.eng.stats.peakVoices}`);
    assert.ok(!d.kick && !d.bass && !d.lead && !d.snare, `${mode}/${sudden}: essential voices dropped ${JSON.stringify(d)}`);
    assert.ok(b.eng.stats.errors === 0, String(b.eng.lastError));
    b.eng.dispose();
  }
});

test('rapid intensity / tempo / sudden changes never break scheduling', () => {
  const { ctx, eng, advance } = makeEngine({ seed: 3 });
  eng.start('game');
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let k = 0; k < 400; k++) {
    eng.setIntensity(rnd() * 1.4 - 0.2, { tempoMul: 0.8 + rnd() * 0.6, sudden: rnd() < 0.1 });
    eng.setIntensity(NaN); eng.setIntensity(Infinity, { tempoMul: -3 });
    if (k % 3 === 0) advance(0.1);
  }
  advance(5);
  assert.equal(eng.stats.errors, 0, String(eng.lastError));
  assert.ok(eng.iSm >= 0 && eng.iSm <= 1);
  assert.ok(eng.bpm > 60 && eng.bpm < 220, `bpm ${eng.bpm}`);
  assert.equal(ctx.warnings.length, 0, ctx.warnings.join('\n'));
  eng.dispose();
});

test('mode changes crossfade on a beat; sudden swaps to the tense arrangement and back; old tracks are released', () => {
  const { ctx, eng, advance } = makeEngine({ seed: 21 });
  eng.setIntensity(0.5, { tempoMul: 1.05 });
  eng.start('menu');
  advance(2);
  assert.equal(eng.kind, 'menu');
  eng.setMode('game', 0.6);
  assert.equal(eng.kind, 'menu', 'switch waits for the next beat');
  advance(1);
  assert.equal(eng.kind, 'game');
  const bpmGame = eng.song.bpm;
  eng.setIntensity(0.9, { tempoMul: 1.16, sudden: true });
  advance(1.5);
  assert.equal(eng.kind, 'tense');
  assert.equal(eng.song.rootPc, generateSong('game', 21).rootPc);
  eng.setIntensity(0.9, { tempoMul: 1.1, sudden: false });
  advance(1.5);
  assert.equal(eng.kind, 'game');
  assert.equal(eng.song.bpm, bpmGame);
  eng.setMode('results', 0.5);
  advance(1.5);
  assert.equal(eng.kind, 'results');
  advance(4);
  assert.equal(eng._retiring.length, 0, 'faded tracks were disposed');
  eng.setMode('menu', 0.5); eng.setMode('game', 0.5);   // rapid double request: only the last one wins
  advance(2);
  assert.equal(eng.kind, 'game');
  assert.equal(eng.stats.errors, 0, String(eng.lastError));
  assert.equal(ctx.warnings.length, 0, ctx.warnings.join('\n'));
  // 'sudden' outside of game mode is ignored
  eng.setMode('results', 0.4);
  advance(1.5);
  eng.setIntensity(0.5, { sudden: true });
  advance(1);
  assert.equal(eng.kind, 'results');
  eng.dispose();
  assert.equal(ctx.unstopped().length, 0);
});

test('unpinned seeds: every new round (menu -> game) gets a fresh tune; game, tense and results of one round share a key', () => {
  const { eng, advance } = makeEngine({ seed: undefined });
  eng.start('menu');
  const seedMenu = eng.seed;
  advance(1);
  eng.setMode('game', 0.5);
  advance(1.2);
  const seedA = eng.seed;
  assert.notEqual(seedA, seedMenu);
  const keyA = eng.song.rootPc;
  eng.setIntensity(0.9, { tempoMul: 1.1, sudden: true });
  advance(1.5);
  assert.equal(eng.kind, 'tense');
  assert.equal(eng.seed, seedA);
  assert.equal(eng.song.rootPc, keyA);
  eng.setMode('results', 0.5); advance(1.5);
  assert.equal(eng.seed, seedA);
  assert.equal(eng.song.rootPc, keyA);
  eng.setMode('menu', 0.5); advance(1.5);
  assert.equal(eng.seed, seedA);
  eng.setMode('game', 0.5); advance(1.5);
  assert.notEqual(eng.seed, seedA, 'next round, new tune');
  eng.stop(0); eng.start('menu');
  assert.ok(eng.running);
  eng.dispose();
});

test('start() while fading out resumes; asking for the current kind cancels a pending switch', () => {
  const { eng, advance } = makeEngine({ seed: 2 });
  eng.start('game');
  advance(1);
  eng.stop(1);
  advance(0.3);
  assert.ok(eng._stopAt !== null);
  eng.start('game');
  assert.equal(eng._stopAt, null, 'stop cancelled');
  advance(3);
  assert.equal(eng.running, true);
  eng.setMode('results', 0.5);
  assert.ok(eng._pending);
  eng.setMode('game', 0.5);
  assert.equal(eng._pending, null, 'back to the current kind: nothing to crossfade');
  advance(2);
  assert.equal(eng.kind, 'game');
  eng.dispose();
});

test('the crossfade is smooth: gains move by time-constant targets only (no hard value jumps once audible)', () => {
  const { ctx, eng, advance } = makeEngine({ seed: 4 });
  eng.start('game');
  advance(2);
  const first = eng.track;
  eng.setMode('results', 0.8);
  advance(1);
  const second = eng.track;
  assert.notEqual(first, second);
  const ev = (tr) => tr.out.gain.events.map((e) => e.type);
  assert.ok(ev(first).includes('target') && ev(second).includes('target'));
  assert.equal(first.out.gain.events.filter((e) => e.type === 'set').length, 0);
  assert.ok(first.out.gain.events.some((e) => e.type === 'target' && e.v === 0), 'old track fades to 0');
  assert.ok(second.out.gain.events.some((e) => e.type === 'target' && e.v === 1), 'new track fades to 1');
  void ctx;
  eng.dispose();
});

test('suspended context (autoplay lock): only the first look-ahead is scheduled, nothing piles up', () => {
  const { ctx, eng } = makeEngine();
  ctx.state = 'suspended';
  eng.start('menu');
  const n1 = ctx.sources.length;
  assert.ok(n1 > 0 && n1 < 80, `first window ${n1}`);
  for (let k = 0; k < 300; k++) eng.tick();
  assert.equal(ctx.sources.length, n1);
  ctx.state = 'running';
  ctx.currentTime += 0.5;
  eng.tick();
  assert.ok(ctx.sources.length > n1, 'resumes when the clock moves');
  eng.dispose();
});

test('throttled / backgrounded tab: catches up gracefully without a burst', () => {
  const { ctx, eng } = makeEngine({ seed: 8 });
  eng.setIntensity(1, { tempoMul: 1.2 });
  eng.start('game');
  const firstWindow = ctx.sources.length;           // one normal look-ahead worth of sources
  for (let k = 0; k < 20; k++) { ctx.currentTime += 0.1; eng.tick(); }
  const before = ctx.sources.length;
  ctx.currentTime += 60;
  eng.tick();
  const burst = ctx.sources.length - before;
  assert.ok(burst <= firstWindow * 1.5 + 30, `scheduled ${burst} sources after a 60 s stall (a normal window is ${firstWindow})`);
  assert.equal(eng.clock.resyncs, 1);
  // 1 Hz ticks (throttled tab) keep the music continuous: look-ahead grows, bursts stay bounded
  let worst = 0;
  for (let k = 0; k < 10; k++) { ctx.currentTime += 1; const b = ctx.sources.length; eng.tick(); worst = Math.max(worst, ctx.sources.length - b); }
  assert.ok(worst <= firstWindow * 4.5 + 60, `1 Hz tick placed ${worst} sources`);
  assert.ok(eng.clock.aheadEff > 1.0 && eng.clock.aheadEff <= 1.5, `ahead ${eng.clock.aheadEff}`);
  assert.equal(eng.stats.errors, 0, String(eng.lastError));
  assert.ok(Math.max(...ctx.sources.map((x) => x.startT)) <= ctx.currentTime + 1.6, 'nothing starts more than the max look-ahead into the future');
  eng.dispose();
});

test('renderMusic is deterministic per seed and tempo follows tempoMul', () => {
  const run = (seed, extra = {}) => {
    const ctx = new FakeContext();
    const r = renderMusic(ctx, 'game', 12, { seed, intensity: 0.7, ...extra });
    const sig = ctx.sources.map((s) => `${s.startT.toFixed(5)}`).join(',');
    r.engine.dispose();
    return { sig, bpm: r.bpm, n: ctx.sources.length, warnings: ctx.warnings.length, kind: r.kind, song: r.song };
  };
  const a = run(5), b = run(5), c = run(6);
  assert.equal(a.sig, b.sig);
  assert.notEqual(a.sig, c.sig);
  assert.equal(a.warnings, 0);
  assert.ok(Math.abs(run(5, { tempoMul: 1.25 }).bpm / a.bpm - 1.25) < 1e-9);
  assert.equal(run(5, { sudden: true, tempoMul: 1.1 }).kind, 'tense');
  assert.equal(run(5, { sudden: true }).song.kind, 'tense');
  for (const m of ['menu', 'results']) assert.equal(run(2, {}).song.kind, 'game') || assert.ok(m);
});

test('renderMusic can start mid-form to audition any section (loop seam coverage)', () => {
  const ctx = new FakeContext();
  const total = generateSong('game', 9).totalBars;
  const r = renderMusic(ctx, 'game', 8, { seed: 9, startBar: total - 1, intensity: 0.9 });
  assert.equal(r.engine.stats.errors, 0, String(r.engine.lastError));
  const pos = r.engine.position;
  assert.ok(pos.index === 0 || pos.index === 4, `position after the seam: ${JSON.stringify(pos)}`);
  assert.ok(r.engine.track.sectionsPlayed >= 1, 'crossed the loop point');
  r.engine.dispose();
});

test('the public API surface (start, stop, setMode, setIntensity, dispose)', () => {
  const { eng } = makeEngine();
  for (const m of ['start', 'stop', 'setMode', 'setIntensity', 'dispose']) assert.equal(typeof eng[m], 'function', m);
  assert.equal(MusicEngine.length, 2, 'constructor(ctx, destination)');
  eng.dispose();
  assert.equal(STEPS_PER_BAR, 16);
});
