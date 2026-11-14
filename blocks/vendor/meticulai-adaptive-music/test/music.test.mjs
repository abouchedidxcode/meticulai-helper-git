// node --test test/*.test.mjs
// Pure parts of the score (harmony, melodies, sections) and the conductor driven on a fake audio clock.
// None of this proves it sounds good: a person has to listen (see HOW-TO-USE.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeAudioContext } from './fake-audio.mjs';
import { Music, QUAL, PROG, MEL, SECT, TONE, chord, ladderOf, mel, mtof } from '../src/music.js';
import { createAdaptiveMusic, toScoreState, toScoreEvent, EVENTS, SPEED_LO, SPEED_SPAN } from '../src/index.js';

const pc = (m) => ((m % 12) + 12) % 12;

// ------------------------------------------------------------------ harmony
test('chord names parse into root, bass and four voicing tones', () => {
  const f = chord('Fmaj9');
  assert.equal(f.root, 5);
  assert.equal(f.bass, 5);
  assert.deepEqual(f.tones, [9, 0, 4, 7]); // A C E G: rootless Fmaj9
  const slash = chord('Bbmaj9#11/D');
  assert.equal(slash.root, 10);
  assert.equal(slash.bass, 2);
  assert.equal(chord('C#m7').root, 1);
});

test('every chord in every progression is a known quality, and bars are one or two chords', () => {
  for (const [name, prog] of Object.entries(PROG)) {
    assert.ok(prog.length >= 1, name);
    for (const bar of prog) {
      assert.equal(bar.length, 2, name);
      for (const c of bar) {
        const m = /^[A-G][b#]?([^/]*)/.exec(c);
        assert.ok(QUAL[m[1]], `${name}: unknown quality in ${c}`);
      }
    }
  }
});

test('every section has 8-bar phrases (silence: 1 bar), a tone and sane levels', () => {
  for (const [name, S] of Object.entries(SECT)) {
    for (const P of S.P) assert.equal(P.length, S.plen, name);
    assert.ok(name === 'silence' ? S.plen === 1 : S.plen === 8, `${name} phrase length`);
    assert.ok(TONE[S.tone], `${name} tone`);
    assert.ok(S.bpm >= 60 && S.bpm <= 140, `${name} bpm`);
    assert.ok(S.swing >= 0.5 && S.swing < 0.75, `${name} swing`);
  }
});

test('ladders hold only chord tones, ascending, inside three octaves', () => {
  for (const name of ['Fmaj9', 'A7alt', 'DmM9', 'Gm11']) {
    const ch = chord(name);
    const lad = ladderOf(ch, 60, true);
    assert.ok(lad.length >= 12, name);
    for (let i = 0; i < lad.length; i++) {
      assert.ok(lad[i] >= 60 && lad[i] < 96);
      if (i) assert.ok(lad[i] > lad[i - 1]);
      const p = pc(lad[i]);
      assert.ok(p === ch.root || ch.tones.includes(p) || p === ch.color, `${name}: ${lad[i]}`);
    }
  }
});

// ------------------------------------------------------------------ melodies
test('the melody notation parses position, length, pitch and flags', () => {
  const m = mel("0.2:2:C5 1.8:4:A5^~ 3.14:2:B4'");
  assert.deepEqual(Array.from(m), [2, 2, 72, 0, 24, 4, 81, 9, 62, 2, 71, 4]);
});

test('every melody stays inside its 8-bar phrase, in a singable range, and moves forward in time', () => {
  for (const [name, m] of Object.entries(MEL)) {
    let last = -1;
    for (let i = 0; i < m.length; i += 4) {
      const pos = m[i], len = m[i + 1], note = m[i + 2];
      assert.ok(pos > last, `${name} order at ${pos}`);
      last = pos;
      assert.ok(len >= 1 && pos + len <= 8 * 16, `${name} bounds at ${pos}`);
      assert.ok(note >= 64 && note <= 90, `${name} range ${note}`);
    }
  }
});

test('mtof: A4 is 440 Hz and an octave doubles', () => {
  assert.equal(mtof(69), 440);
  assert.ok(Math.abs(mtof(81) - 880) < 1e-9);
});

// ------------------------------------------------------------------ the adapter
test('generic state maps onto the score state (intensity -> the speed range the score was tuned on)', () => {
  const s = toScoreState({ mode: 'play', intensity: 0.5, danger: 2, progress: -1, lift: 1, shimmer: 0 });
  assert.equal(s.mode, 'play');
  assert.equal(s.speed, SPEED_LO + SPEED_SPAN * 0.5);
  assert.equal(s.danger, 1);
  assert.equal(s.progress, 0);
  assert.equal(s.airborne, true);
  assert.equal(s.inPuddle, false);
  assert.equal(s.volume, 1);
  assert.equal(toScoreState({ mode: 'nonsense' }).mode, 'menu');
  assert.equal(toScoreState({ intensity: NaN }).speed, SPEED_LO);
});

test('generic events map onto the score events; unknown names do nothing', () => {
  assert.deepEqual(toScoreEvent('pickup', { n: 2, of: 6 }), { type: 'bloom', data: { n: 2, of: 6 } });
  assert.equal(toScoreEvent('win').type, 'finish');
  assert.equal(toScoreEvent('lose').type, 'dead');
  assert.equal(toScoreEvent('nope'), null);
  assert.deepEqual(Object.keys(EVENTS).sort(), ['checkpoint', 'lose', 'pickup', 'shimmer', 'start', 'win']);
});

// ------------------------------------------------------------------ the conductor on a fake clock
function rig() {
  const ctx = new FakeAudioContext();
  const m = createAdaptiveMusic(ctx, ctx.createGain(), { timer: false });
  // 40 ms frames, like the score's own timer
  const run = (seconds, state) => {
    if (state) m.setState(state);
    for (let t = 0; t < seconds; t += 0.04) { ctx.advance(0.04); m.update(0.04); }
  };
  return { ctx, m, run };
}

test('builds without a real audio device and never throws while it plays', () => {
  const { m, run } = rig();
  assert.equal(m.ok, true);
  run(6, { mode: 'menu' });
  assert.equal(m.section, 'menu');
  assert.equal(m.stats.errors, 0);
  assert.equal(m.stats.jobsDone, m.stats.jobs, 'every instrument sample rendered');
});

test('the conductor follows the game: menu -> intro -> arc by progress -> tension -> outro / silence', () => {
  const { m, run } = rig();
  run(4, { mode: 'menu' });
  m.hit('start');
  run(3, { mode: 'play', intensity: 0.5, progress: 0 });
  assert.equal(m.section, 'intro');
  run(12, { mode: 'play', intensity: 0.5, progress: 0.5 });
  assert.equal(m.section, 'groove');
  run(12, { mode: 'play', intensity: 0.9, progress: 0.9 });
  assert.equal(m.section, 'sunset');
  run(8, { mode: 'play', intensity: 0.9, progress: 0.9, danger: 1 });
  assert.equal(m.section, 'tension');
  run(12, { mode: 'play', intensity: 0.9, progress: 0.9, danger: 0 });
  assert.notEqual(m.section, 'tension');
  m.hit('win');
  run(5, { mode: 'end' });
  assert.equal(m.section, 'outro');
  m.hit('start');
  run(2, { mode: 'play' });
  m.hit('lose');
  run(5, { mode: 'end' });
  assert.equal(m.section, 'silence');
  assert.equal(m.stats.errors, 0);
});

test('checkpoints move the arc on even with no progress given', () => {
  const { m, run } = rig();
  m.hit('start');
  run(3, { mode: 'play', intensity: 0.5 });
  assert.equal(m.section, 'intro');
  m.hit('checkpoint', { ahead: true });
  run(6);
  assert.equal(m.section, 'build');
  m.hit('checkpoint');
  run(6);
  assert.equal(m.section, 'groove');
});

test('busier when intensity is high, and the one-shot voice count stays capped', () => {
  const count = (intensity) => {
    const { ctx, m, run } = rig();
    m.hit('start');
    run(4, { mode: 'play', intensity, progress: 0.1 });
    const before = ctx.started.length;
    let maxVoices = 0;
    for (let i = 0; i < 300; i++) { run(0.04); maxVoices = Math.max(maxVoices, m.stats.voices); }
    return { notes: ctx.started.length - before, maxVoices };
  };
  const lo = count(0.05), hi = count(1);
  assert.ok(hi.notes > lo.notes * 1.3, `high ${hi.notes} vs low ${lo.notes}`);
  assert.ok(hi.maxVoices <= 48 && lo.maxVoices <= 48);
});

test('stingers (pickup, last pickup, shimmer, lift) play notes and never break the scheduler', () => {
  const { ctx, m, run } = rig();
  m.hit('start');
  run(4, { mode: 'play', intensity: 0.6 });
  const before = ctx.started.length;
  m.hit('pickup', { n: 1, of: 3 });
  m.hit('pickup', { n: 3, of: 3 });
  run(0.2, { mode: 'play', intensity: 0.6, shimmer: true });
  run(1, { mode: 'play', intensity: 0.6, lift: true });
  run(1, { mode: 'play', intensity: 0.6 });
  assert.ok(ctx.started.length - before > 15);
  assert.equal(m.stats.errors, 0);
});

test('muted: no new notes are made', () => {
  const { ctx, m, run } = rig();
  m.hit('start');
  run(4, { mode: 'play', intensity: 1 });
  m.setMuted(true);
  const before = ctx.started.length;
  run(4);
  assert.equal(ctx.started.length, before);
});

test('without an audio context the score is a silent no-op', () => {
  const m = new Music(null, null, { timer: false });
  assert.equal(m.stats.ok, false);
  m.update({ mode: 'play' }, 0.016);
  m.event('bloom', { n: 1, of: 2 });
});
