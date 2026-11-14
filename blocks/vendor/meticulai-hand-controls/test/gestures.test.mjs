// Synthetic hands through the real GestureEngine: every pose, every motion, two-hand gestures,
// the on/off mask, and a no-false-positives jitter test. No camera, no browser.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GestureEngine, POSES, SYNTHETIC_POSES as P, computeFeatures, scorePose, screenHandLandmarks } from '../src/index.js';

const hand = (x, y, pose, o = {}) => ({
  landmarks: screenHandLandmarks(x, y, o.roll !== undefined ? { ...pose, roll: o.roll } : pose, { handedness: o.hd ?? 'Right', scale: o.scale ?? 0.2 }),
  handedness: o.hd ?? 'Right',
  aspect: 16 / 9,
});

function best(h) {
  const f = computeFeatures(h);
  return POSES.map((p) => [p.id, scorePose(p, f)]).sort((a, b) => b[1] - a[1])[0];
}

/** Runs the engine over a scripted clip at 30 fps and returns every event. */
function run(script, ms, engine = new GestureEngine()) {
  const events = [];
  for (let t = 0; t <= ms; t += 1000 / 30) events.push(...engine.update(script(t), t).events);
  return events;
}
const names = (ev, kind) => ev.filter((e) => !kind || e.kind === kind).map((e) => e.name);
const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
const SHAPES = ['open', 'fist', 'point', 'middle', 'victory', 'three', 'four', 'rock', 'shaka', 'gun', 'thumbs-up', 'thumbs-down', 'pinch', 'ok', 'claw'];

describe('poses', () => {
  for (const id of SHAPES) {
    for (const hd of ['Right', 'Left']) {
      it(`recognises ${id} (${hd} hand)`, () => {
        const [top, s] = best(hand(0.5, 0.5, P[id], { hd }));
        assert.equal(top, id);
        assert.ok(s > 0.75, `score ${s}`);
      });
    }
  }

  it('is unaffected by where the hand is or how big it looks', () => {
    for (const [x, y, sc] of [[0.2, 0.3, 0.12], [0.8, 0.7, 0.3]]) {
      assert.equal(best(hand(x, y, P.rock, { scale: sc }))[0], 'rock');
      assert.equal(best(hand(x, y, P.fist, { scale: sc }))[0], 'fist');
    }
  });

  it('emits pose start after the debounce and end when the hand leaves', () => {
    const ev = run((t) => (t < 500 ? [hand(0.5, 0.5, P.fist)] : []), 900);
    const pose = ev.filter((e) => e.kind === 'pose');
    assert.deepEqual(pose.map((e) => `${e.name}:${e.phase}`), ['fist:start', 'fist:end']);
    assert.ok(pose[0].t >= 60);
  });

  it('does not flicker on a single bad frame', () => {
    const ev = run((t) => [hand(0.5, 0.5, Math.abs(t - 300) < 20 ? P.open : P.fist)], 700);
    assert.deepEqual(names(ev, 'pose'), ['fist']);
  });

  it('switches pose cleanly', () => {
    const ev = run((t) => [hand(0.5, 0.5, t < 400 ? P.fist : P.point)], 800);
    assert.deepEqual(ev.filter((e) => e.kind === 'pose').map((e) => `${e.name}:${e.phase}`), ['fist:start', 'fist:end', 'point:start']);
  });

  it('accepts custom poses', () => {
    const engine = new GestureEngine();
    engine.registerPose({ id: 'pinky-up', name: 'Pinky up', hint: '', fingers: ['curl', 'curl', 'curl', 'curl', 'ext'] });
    const ev = run(() => [hand(0.5, 0.5, { curl: [1, 1, 1, 1, 0], pinch: 0 })], 400, engine);
    assert.ok(names(ev, 'pose').includes('pinky-up'));
  });

  it('has at least 16 built-in poses and no emoji in names or hints', () => {
    assert.ok(POSES.length >= 16);
    for (const p of POSES) assert.ok(!/\p{Extended_Pictographic}/u.test(p.name + p.hint), p.id);
  });
});

describe('motions', () => {
  for (const [name, x0, y0, x1, y1] of [
    ['swipe-left', 0.75, 0.5, 0.25, 0.5], ['swipe-right', 0.25, 0.5, 0.75, 0.5],
    ['swipe-up', 0.5, 0.75, 0.5, 0.3], ['swipe-down', 0.5, 0.3, 0.5, 0.75],
  ]) {
    it(name, () => {
      const ev = run((t) => [hand(lerp(x0, x1, (t - 200) / 250), lerp(y0, y1, (t - 200) / 250), P.open)], 900);
      assert.deepEqual(names(ev, 'motion').filter((n) => n.startsWith('swipe')), [name]);
    });
  }

  it('slow drifting is not a swipe', () => {
    const ev = run((t) => [hand(lerp(0.3, 0.7, t / 3000), 0.5, P.open)], 3000);
    assert.deepEqual(names(ev, 'motion').filter((n) => n.startsWith('swipe')), []);
  });

  it('push and pull', () => {
    const push = run((t) => [hand(0.5, 0.5, P.open, { scale: lerp(0.15, 0.24, (t - 200) / 300) })], 900);
    assert.ok(names(push, 'motion').includes('push'));
    const pull = run((t) => [hand(0.5, 0.5, P.open, { scale: lerp(0.24, 0.15, (t - 200) / 300) })], 900);
    assert.ok(names(pull, 'motion').includes('pull'));
  });

  it('circles, both ways (clockwise as seen on screen)', () => {
    const circ = (dir) => (t) => {
      const a = dir * (t / 1000) * 2 * Math.PI;
      return [hand(0.5 + 0.1 * Math.cos(a), 0.5 + 0.1 * Math.sin(a), P.point)];
    };
    assert.ok(names(run(circ(1), 1400), 'motion').includes('circle-cw'));
    assert.ok(names(run(circ(-1), 1400), 'motion').includes('circle-ccw'));
  });

  it('wave and shake', () => {
    const wave = run((t) => [hand(0.5 + 0.08 * Math.sin((t / 1000) * 2 * Math.PI * 2.5), 0.5, P.open)], 1400);
    assert.ok(names(wave, 'motion').includes('wave'));
    const shake = run((t) => [hand(0.5, 0.5 + 0.08 * Math.sin((t / 1000) * 2 * Math.PI * 2.5), P.fist)], 1400);
    assert.ok(names(shake, 'motion').includes('shake'));
  });

  it('twist (roll) both ways', () => {
    const tw = (dir) => run((t) => [hand(0.5, 0.5, P.fist, { roll: dir * lerp(0, 1.2, (t - 200) / 350) })], 900);
    const cw = names(tw(1), 'motion').filter((n) => n.startsWith('twist'));
    const ccw = names(tw(-1), 'motion').filter((n) => n.startsWith('twist'));
    assert.equal(cw.length, 1);
    assert.equal(ccw.length, 1);
    assert.notEqual(cw[0], ccw[0]);
  });

  it('tap and double tap; a long pinch is not a tap', () => {
    const tapAt = (starts) => (t) => [hand(0.5, 0.5, starts.some((s) => t >= s && t < s + 150) ? P.pinch : P.open)];
    const taps = (ev) => names(ev, 'motion').filter((n) => n !== 'hold');
    assert.deepEqual(taps(run(tapAt([300]), 900)), ['tap']);
    assert.deepEqual(taps(run(tapAt([300, 600]), 1200)), ['tap', 'double-tap']);
    assert.ok(!names(run((t) => [hand(0.5, 0.5, t > 200 && t < 1400 ? P.pinch : P.open)], 1800), 'motion').includes('tap'));
  });

  it('throw: a fist that flings open while moving, and it is not also a swipe', () => {
    const ev = run((t) => [hand(lerp(0.3, 0.75, (t - 400) / 250), 0.5, t < 520 ? P.fist : P.open)], 1000);
    assert.deepEqual(names(ev, 'motion').filter((n) => n !== 'hold'), ['throw']);
  });

  it('a still hand with tracking jitter triggers nothing', () => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
    for (const pose of [P.open, P.fist, P.point, P.pinch]) {
      const ev = run(() => [hand(0.5 + rnd() * 0.012, 0.5 + rnd() * 0.012, pose, { scale: 0.2 * (1 + rnd() * 0.04), roll: rnd() * 0.06 })], 4000);
      assert.deepEqual(names(ev, 'motion').filter((n) => n !== 'hold'), []);
    }
  });

  it('hold fires once per pose', () => {
    const ev = run(() => [hand(0.5, 0.5, P.rock)], 2500);
    const holds = ev.filter((e) => e.name === 'hold');
    assert.equal(holds.length, 1);
    assert.equal(holds[0].data.pose, 'rock');
  });
});

describe('two hands', () => {
  const two = (xl, yl, xr, yr, pose, pose2 = pose) => [hand(xl, yl, pose, { hd: 'Left' }), hand(xr, yr, pose2, { hd: 'Right' })];

  it('clap, and neither hand counts as swiping on its own', () => {
    const ev = run((t) => { const d = lerp(0.25, 0, (t - 200) / 200); return two(0.5 - d, 0.5, 0.5 + d, 0.5, P.open); }, 700);
    assert.deepEqual(names(ev, 'two-hand'), ['clap']);
    assert.deepEqual(names(ev, 'motion').filter((n) => n.startsWith('swipe')), []);
  });

  it('zoom in and out with both hands pinching', () => {
    const zin = run((t) => { const d = lerp(0.08, 0.25, (t - 300) / 400); return two(0.5 - d, 0.5, 0.5 + d, 0.5, P.pinch); }, 1000);
    assert.ok(names(zin, 'two-hand').includes('zoom-in'));
    assert.deepEqual(names(zin, 'motion').filter((n) => n.startsWith('swipe')), []);
    const zout = run((t) => { const d = lerp(0.25, 0.08, (t - 300) / 400); return two(0.5 - d, 0.5, 0.5 + d, 0.5, P.pinch); }, 1000);
    assert.ok(names(zout, 'two-hand').includes('zoom-out'));
  });

  it('steering wheel with two fists', () => {
    const steer = (dir) => run((t) => {
      const a = dir * lerp(0, 0.9, (t - 300) / 400);
      return two(0.5 - 0.2 * Math.cos(a), 0.5 - 0.2 * Math.sin(a), 0.5 + 0.2 * Math.cos(a), 0.5 + 0.2 * Math.sin(a), P.fist);
    }, 1000);
    assert.ok(names(steer(1), 'two-hand').includes('steer-right'));
    assert.ok(names(steer(-1), 'two-hand').includes('steer-left'));
  });

  it('keeps two hands apart as separate ids', () => {
    const engine = new GestureEngine();
    let f = engine.update([], 0);
    for (let t = 0; t < 500; t += 33) f = engine.update(two(0.3, 0.5, 0.7, 0.5, P.fist, P.point), t);
    assert.equal(f.hands.length, 2);
    const byX = [...f.hands].sort((a, b) => a.features.center.x - b.features.center.x);
    assert.deepEqual(byX.map((h) => h.pose), ['fist', 'point']);
  });
});

describe('on/off mask', () => {
  const poseStarts = (ev) => ev.filter((e) => e.kind === 'pose' && e.phase === 'start').map((e) => e.name);

  it('everything is on by default', () => {
    const e = new GestureEngine();
    assert.deepEqual(e.enabled, { poses: null, motions: null, twoHand: null });
    assert.equal(e.isEnabled('victory'), true);
    assert.equal(e.isEnabled('swipe-left'), true);
    assert.equal(e.isEnabled('clap'), true);
  });

  it('a disabled pose is never reported, but its raw score is still measured', () => {
    const e = new GestureEngine();
    e.setEnabled({ poses: ['fist', 'point', 'pinch'] });
    assert.equal(e.isEnabled('victory'), false);
    assert.deepEqual(poseStarts(run(() => [hand(0.5, 0.5, P.victory)], 600, e)), []);
    const f = e.update([hand(0.5, 0.5, P.victory)], 700);
    assert.equal(f.hands[0].pose, null);
    assert.ok(f.hands[0].scores.victory > 0.75);
  });

  it('the classifier picks among enabled poses only (OK off -> reads as pinch)', () => {
    assert.deepEqual(poseStarts(run(() => [hand(0.5, 0.5, P.ok)], 500)), ['ok']);
    const off = new GestureEngine();
    off.setEnabled({ poses: off.poses.map((p) => p.id).filter((id) => id !== 'ok') });
    assert.deepEqual(poseStarts(run(() => [hand(0.5, 0.5, P.ok)], 500, off)), ['pinch']);
  });

  it('disabling the active pose ends it', () => {
    const e = new GestureEngine();
    const ev = run((t) => { if (t > 400 && t < 440) e.setEnabled({ poses: ['point'] }); return [hand(0.5, 0.5, P.fist)]; }, 900, e);
    assert.deepEqual(ev.filter((x) => x.kind === 'pose').map((x) => `${x.name}:${x.phase}`), ['fist:start', 'fist:end']);
  });

  it('a disabled motion never fires; the others still do', () => {
    const e = new GestureEngine();
    e.setEnabled({ motions: ['swipe-right'] });
    assert.deepEqual(names(run((t) => [hand(lerp(0.75, 0.25, (t - 200) / 250), 0.5, P.open)], 900, e), 'motion'), []);
    assert.deepEqual(names(run((t) => [hand(lerp(0.25, 0.75, (t - 200) / 250), 0.5, P.open)], 900, e), 'motion'), ['swipe-right']);
  });

  it('with double tap off, two quick taps are two taps', () => {
    const tapAt = (starts) => (t) => [hand(0.5, 0.5, starts.some((s) => t >= s && t < s + 150) ? P.pinch : P.open)];
    const e = new GestureEngine();
    e.setEnabled({ motions: ['tap'] });
    assert.deepEqual(names(run(tapAt([300, 600]), 1200, e), 'motion'), ['tap', 'tap']);
  });

  it('two-hand gestures switch off one by one; setEnabled(null) turns all back on', () => {
    const clap = (e) => run((t) => { const d = lerp(0.25, 0, (t - 200) / 200); return [hand(0.5 - d, 0.5, P.open, { hd: 'Left' }), hand(0.5 + d, 0.5, P.open, { hd: 'Right' })]; }, 700, e);
    const e = new GestureEngine();
    e.setEnabled({ twoHand: ['zoom-in'] });
    assert.deepEqual(names(clap(e), 'two-hand'), []);
    const f = new GestureEngine();
    f.setEnabled({ poses: ['fist'], twoHand: ['zoom-in'] });
    f.setEnabled({ twoHand: null });
    assert.deepEqual(f.enabled, { poses: ['fist'], motions: null, twoHand: null });
    f.setEnabled(null);
    assert.deepEqual(names(clap(f), 'two-hand'), ['clap']);
  });

  it('listeners get events by name, by kind and with *', () => {
    const e = new GestureEngine();
    const got = [];
    e.on('fist', (x) => got.push('name:' + x.phase));
    e.on('pose', () => got.push('kind'));
    const off = e.on('*', () => got.push('all'));
    run(() => [hand(0.5, 0.5, P.fist)], 300, e);
    off();
    assert.deepEqual(got, ['name:start', 'kind', 'all']);
  });
});
