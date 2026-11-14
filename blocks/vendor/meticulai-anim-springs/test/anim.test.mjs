// The animation core's tests, ported from the game's suite (same cases, same tolerances).
// Run: npm test   (node --test, needs `three` from npm install)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  easings, cubicBezier, ease,
  criticalSpring, decaySpring, Spring, SpringQuat, BouncySpring, SpringVec3,
  Rng, valueNoise1, fbm1, mulberry32,
  ChannelLayout, Timeline, TimelinePlayer, ChannelInertializer,
  Pose, findBestEntryTime, LayerStack,
  VariationPicker, Jitter,
  TwoBoneIK, lookAngles,
  MotionRecorder, pathDistance,
  quatToScaledAxis, scaledAxisToQuat, quatAngle, swingTwist, quatFromFrames, wrapAngle, DEG,
  softClamp, clampQuatAngle,
} from '../src/index.js';

/** Same rule as vitest's toBeCloseTo: |a - b| < 10^-digits / 2. */
function close(a, b, digits = 2, msg) {
  assert.ok(Math.abs(a - b) < Math.pow(10, -digits) / 2, `${msg ? msg + ': ' : ''}expected ${a} to be close to ${b} (${digits} digits)`);
}
const lt = (a, b, msg) => assert.ok(a < b, `${msg ? msg + ': ' : ''}expected ${a} < ${b}`);
const le = (a, b, msg) => assert.ok(a <= b, `${msg ? msg + ': ' : ''}expected ${a} <= ${b}`);
const gt = (a, b, msg) => assert.ok(a > b, `${msg ? msg + ': ' : ''}expected ${a} > ${b}`);
const ge = (a, b, msg) => assert.ok(a >= b, `${msg ? msg + ': ' : ''}expected ${a} >= ${b}`);

describe('math', () => {
  it('scaled axis round-trips', () => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 2, 3).normalize(), 2.1);
    const v = quatToScaledAxis(q);
    close(v.length(), 2.1, 5);
    lt(quatAngle(scaledAxisToQuat(v), q), 1e-5);
  });
  it('wraps angles', () => {
    close(wrapAngle(3 * Math.PI), Math.PI, 6);
    close(wrapAngle(-0.5), -0.5, 6);
  });
  it('swing-twist recomposes', () => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 1.1, -0.3));
    const sw = new THREE.Quaternion(), tw = new THREE.Quaternion();
    swingTwist(q, new THREE.Vector3(0, 1, 0), sw, tw);
    lt(quatAngle(sw.clone().multiply(tw), q), 1e-5);
  });
  it('builds rotations from frames', () => {
    const q = quatFromFrames(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
    lt(new THREE.Vector3(1, 0, 0).applyQuaternion(q).distanceTo(new THREE.Vector3(0, 0, 1)), 1e-6);
    lt(new THREE.Vector3(0, 1, 0).applyQuaternion(q).distanceTo(new THREE.Vector3(1, 0, 0)), 1e-6);
  });
});

describe('easing', () => {
  it('every curve maps 0->0 and 1->1', () => {
    for (const [name, f] of Object.entries(easings)) {
      close(f(0), 0, 6, name);
      close(f(1), 1, 6, name);
    }
  });
  it('in-out curves are monotone and symmetric', () => {
    for (const name of ['inOutQuad', 'inOutCubic', 'inOutSine', 'smoothstep', 'smootherstep']) {
      let prev = -1;
      for (let i = 0; i <= 100; i++) {
        const y = easings[name](i / 100);
        ge(y, prev - 1e-9, name);
        prev = y;
      }
      close(easings[name](0.5), 0.5, 6, name);
    }
  });
  it('cubic-bezier matches the CSS "ease" curve', () => {
    const e = cubicBezier(0.25, 0.1, 0.25, 1);
    close(e(0.5), 0.8024, 3);
    assert.equal(ease('outBack', 2), 1);
  });
});

describe('springs', () => {
  it('critical spring is frame-rate independent', () => {
    const a = { x: 0, v: 0 }, b = { x: 0, v: 0 };
    criticalSpring(a, 1, 0.2, 1 / 30);
    criticalSpring(b, 1, 0.2, 1 / 60);
    criticalSpring(b, 1, 0.2, 1 / 60);
    close(a.x, b.x, 9);
    close(a.v, b.v, 9);
  });
  it('critical spring never overshoots from rest and converges', () => {
    const s = new Spring(0, 0.15);
    let maxX = 0;
    for (let i = 0; i < 300; i++) maxX = Math.max(maxX, s.update(1 / 60, 1));
    le(maxX, 1 + 1e-9);
    close(s.x, 1, 4);
  });
  it('tracks a moving goal with no steady-state lag', () => {
    const s = { x: 0, v: 1 };
    let goal = 0;
    for (let i = 0; i < 600; i++) {
      criticalSpring(s, goal, 0.1, 1 / 60, 1);
      goal += 1 / 60;
    }
    close(s.x, goal, 3);
  });
  it('decay spring goes to zero', () => {
    const s = { x: 0.3, v: -2 };
    for (let i = 0; i < 120; i++) decaySpring(s, 0.1, 1 / 60);
    lt(Math.abs(s.x), 1e-4);
  });
  it('bouncy spring overshoots then settles', () => {
    const s = new BouncySpring(0, 2, 0.3);
    let maxX = 0;
    for (let i = 0; i < 600; i++) maxX = Math.max(maxX, s.update(1 / 60, 1));
    gt(maxX, 1.05);
    close(s.x, 1, 3);
  });
  it('vector and quaternion springs converge', () => {
    const v = new SpringVec3(new THREE.Vector3(), 0.1);
    for (let i = 0; i < 200; i++) v.update(1 / 60, new THREE.Vector3(1, 2, 3));
    lt(v.x.distanceTo(new THREE.Vector3(1, 2, 3)), 1e-3);
    const q = new SpringQuat(new THREE.Quaternion(), 0.1);
    const goal = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, -1.2, 0.3));
    let prev = Infinity;
    for (let i = 0; i < 200; i++) {
      q.update(1 / 60, goal);
      const a = quatAngle(q.q, goal);
      le(a, prev + 1e-6);
      prev = a;
    }
    lt(prev, 1e-3);
  });
});

describe('noise', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(42), b = new Rng(42);
    for (let i = 0; i < 10; i++) assert.equal(a.random(), b.random());
    assert.notEqual(new Rng(1).random(), new Rng(2).random());
    const r = mulberry32(7);
    let sum = 0;
    for (let i = 0; i < 10000; i++) sum += r();
    close(sum / 10000, 0.5, 1);
  });
  it('value noise is bounded and continuous', () => {
    let prev = valueNoise1(0, 3);
    for (let i = 1; i < 2000; i++) {
      const x = i * 0.01;
      const v = valueNoise1(x, 3);
      le(Math.abs(v), 1);
      lt(Math.abs(v - prev), 0.05);
      prev = v;
    }
    le(Math.abs(fbm1(12.3, 9)), 1);
  });
  it('forked streams are independent and reproducible', () => {
    const r = new Rng(5);
    assert.equal(r.fork('blink').random(), new Rng(5).fork('blink').random());
    assert.notEqual(r.fork('blink').random(), r.fork('sway').random());
  });
});

describe('timeline', () => {
  const layout = new ChannelLayout({ a: 0, v: [0, 0, 0] });

  it('hits keys exactly and interpolates between', () => {
    const tl = new Timeline(layout).key(0, { a: 0 }).key(1, { a: 1 }).key(2, { a: 0.5 });
    const out = layout.create();
    close(tl.sample(1, out)[0], 1, 6);
    close(tl.sample(2, out)[0], 0.5, 6);
    gt(tl.sample(0.5, out)[0], 0);
    assert.equal(tl.duration, 2);
  });

  it('smooth tracks are C1 at interior keys and do not overshoot extremes', () => {
    const tl = new Timeline(layout).key(0, { a: 0 }).key(0.4, { a: 0.5 }).key(1, { a: 1 }).key(1.5, { a: 0.2 });
    const tr = tl.tracks.get(0);
    for (const t of [0.4, 1]) {
      const l = tr.derivative(t - 1e-5), r = tr.derivative(t + 1e-5);
      lt(Math.abs(l - r), 1e-2);
    }
    let maxV = -Infinity;
    for (let t = 0; t <= 1.5; t += 0.001) maxV = Math.max(maxV, tr.sample(t));
    le(maxV, 1 + 1e-9);
    // monotone segment stays monotone
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.001) {
      const v = tr.sample(t);
      ge(v, prev - 1e-9);
      prev = v;
    }
  });

  it('honours explicit velocities and easing', () => {
    const tl = new Timeline(layout)
      .key(0, { v: [0, 0, 0] })
      .key(1, { v: [1, 2, 3] }, { vel: { v: [2, 0, -1] } })
      .key(2, { v: [2, 2, 2] }, { ease: 'inOutCubic' });
    const vel = tl.velocity(1 - 1e-6, layout.create());
    close(vel[1], 2, 3);
    close(vel[2], 0, 3);
    close(vel[3], -1, 3);
    const out = tl.sample(1.5, layout.create());
    close(out[1], 1.5, 5);
  });

  it('startFrom keys the live pose at t=0; scaleTime stretches keys and events', () => {
    const live = layout.create();
    live[0] = 0.7;
    const tl = new Timeline(layout).key(0.5, { a: 0 }).event(0.25, 'grab');
    tl.startFrom(live);
    close(tl.sample(0, layout.create())[0], 0.7, 6);
    tl.scaleTime(2);
    close(tl.duration, 1, 6);
    close(tl.eventTime('grab'), 0.5, 6);
  });

  it('player fires each event exactly once and resolves', async () => {
    const tl = new Timeline(layout).key(0, { a: 0 }).key(1, { a: 1 }).event(0, 'start').event(0.5, 'mid').event(1, 'end');
    const p = new TimelinePlayer(tl, layout.create());
    const seen = [];
    p.onEvent((e) => seen.push(e.name));
    for (let i = 0; i < 90; i++) p.update(1 / 60);
    await p.done;
    assert.deepEqual(seen, ['start', 'mid', 'end']);
    close(p.out[0], 1, 6);
  });
});

describe('inertialization', () => {
  it('keeps value and velocity continuous across a switch, then decays', () => {
    const inert = new ChannelInertializer(1, 0.1);
    const out = new Float32Array(1);
    const dt = 1 / 60;
    let t = 0;
    const src = (x) => Math.sin(x * 3); // old animation
    const dst = (x) => 2 + 0 * x; // new animation, far away and still
    const values = [];
    for (let i = 0; i < 60; i++) {
      values.push(inert.update([src(t)], dt, out)[0]);
      t += dt;
    }
    inert.transition([dst(t)], [0]);
    for (let i = 0; i < 90; i++) {
      values.push(inert.update([dst(t)], dt, out)[0]);
      t += dt;
    }
    // no single-frame jump larger than the motion before the switch (max |d/dt sin 3t| * dt = 0.05)
    let maxStep = 0;
    for (let i = 1; i < values.length; i++) maxStep = Math.max(maxStep, Math.abs(values[i] - values[i - 1]));
    const beforeStep = Math.abs(values[59] - values[58]);
    lt(Math.abs(values[60] - values[59]), beforeStep * 1.5 + 1e-3);
    // the decay's own peak speed for a 2-unit gap: 2*y/e per second, y = 2 ln2 / halflife
    const y = (2 * Math.LN2) / 0.1;
    lt(maxStep, ((2 * y) / Math.E) * dt * 1.1 + 0.05);
    close(values[values.length - 1], 2, 2);
  });
});

describe('pose + layers', () => {
  const names = ['a', 'b'];
  const qa = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.8);

  it('blend handles aliasing and additive difference round-trips', () => {
    const p1 = Pose.identity(names);
    const p2 = Pose.identity(names);
    p2.rot.get('a').copy(qa);
    p1.blend(p1, p2, 0.5);
    close(quatAngle(p1.rot.get('a'), new THREE.Quaternion()), 0.4, 5);
    const ref = Pose.identity(names);
    ref.rot.get('b').setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.3);
    const d = Pose.difference(p2, ref);
    const back = ref.clone().addAdditive(d, 1);
    lt(back.maxAngleTo(p2).deg, 1e-3);
  });

  it('finds the best matching entry time', () => {
    const src = (t, out) => out.rot.get('a').setFromAxisAngle(new THREE.Vector3(0, 1, 0), t);
    const cur = Pose.identity(names);
    cur.rot.get('a').setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.6);
    close(findBestEntryTime(src, cur, 0, 1, 0.05).time, 0.6, 5);
  });

  it('crossfade and inertial transitions do not pop', () => {
    const mk = (name, f, duration = 2) => ({
      name,
      duration,
      loop: true,
      sample: (t, out) => void out.rot.get('a').setFromAxisAngle(new THREE.Vector3(0, 1, 0), f(t)),
    });
    for (const mode of ['crossfade', 'inertial']) {
      const stack = new LayerStack(names);
      stack.play(mk('one', (t) => Math.sin(t)));
      const angles = [];
      for (let i = 0; i < 60; i++) angles.push(2 * Math.asin(stack.update(1 / 60).rot.get('a').y));
      stack.play(mk('two', () => 1.2), { mode, fade: 0.2 });
      for (let i = 0; i < 60; i++) angles.push(2 * Math.asin(stack.update(1 / 60).rot.get('a').y));
      const jump = Math.abs(angles[60] - angles[59]);
      lt(jump, 0.05, mode);
      close(angles[119], 1.2, 2, mode);
    }
  });

  it('additive layers respect weight and mask', () => {
    const stack = new LayerStack(names);
    stack.play({ name: 'rest', duration: 1, loop: true, sample: () => {} });
    stack.addLayer({
      name: 'nod',
      weight: 1,
      fadeHalflife: 0.001,
      mask: { a: 1 },
      evaluate: (_dt, _t, out) => {
        out.rot.get('a').setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.5);
        out.rot.get('b').setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.5);
      },
    });
    let p = stack.update(1 / 60);
    for (let i = 0; i < 10; i++) p = stack.update(1 / 60);
    close(quatAngle(p.rot.get('a'), new THREE.Quaternion()), 0.5, 3);
    close(quatAngle(p.rot.get('b'), new THREE.Quaternion()), 0, 5);
  });
});

describe('variation', () => {
  it('never repeats a variant back to back and uses them all', () => {
    const pick = new VariationPicker(['a', 'b', 'c'], new Rng(9));
    const counts = {};
    let last = '';
    for (let i = 0; i < 3000; i++) {
      const v = pick.next();
      assert.notEqual(v, last);
      last = v;
      counts[v] = (counts[v] ?? 0) + 1;
    }
    for (const k of ['a', 'b', 'c']) gt(counts[k], 700, k);
  });
  it('respects weights and filters, and is seed-deterministic', () => {
    const seq = (seed) => {
      const p = new VariationPicker([{ value: 1, weight: 5 }, { value: 2 }, { value: 3 }], new Rng(seed));
      return Array.from({ length: 20 }, () => p.next());
    };
    assert.deepEqual(seq(3), seq(3));
    assert.notDeepEqual(seq(3), seq(4));
    const p = new VariationPicker([1, 2, 3, 4], new Rng(1), 2);
    const got = Array.from({ length: 200 }, () => p.next((v) => v !== 4));
    assert.equal(got.includes(4), false);
    for (let i = 2; i < got.length; i++) assert.equal(new Set(got.slice(i - 2, i + 1)).size, 3);
  });
  it('jitter stays inside its bounds', () => {
    const j = new Jitter(new Rng(2), { time: 0.1, amp: 0.2 });
    for (let i = 0; i < 500; i++) {
      const t = j.t(1);
      const a = j.a(1);
      ge(t, 0.9);
      le(t, 1.1);
      ge(a, 0.8);
      le(a, 1.2);
    }
  });
});

describe('ik', () => {
  function chain(randomAxes) {
    const rng = new Rng(11);
    const root = new THREE.Object3D();
    const upper = new THREE.Bone(), lower = new THREE.Bone(), end = new THREE.Bone();
    root.add(upper);
    upper.add(lower);
    lower.add(end);
    upper.position.set(0.2, 1.4, 0);
    // arm hanging at 45 degrees, lengths 0.3 / 0.27
    const d = new THREE.Vector3(1, -1, 0).normalize();
    if (randomAxes) {
      // arbitrary bind-pose local frames (like an imported rig): child offsets expressed in them
      const qU = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.signed(2), rng.signed(2), rng.signed(2)));
      const qL = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.signed(2), rng.signed(2), rng.signed(2)));
      upper.quaternion.copy(qU);
      lower.quaternion.copy(qL);
      lower.position.copy(d.clone().multiplyScalar(0.3).applyQuaternion(qU.clone().invert()));
      const wL = qU.clone().multiply(qL);
      end.position.copy(d.clone().multiplyScalar(0.27).applyQuaternion(wL.invert()));
    } else {
      lower.position.copy(d.clone().multiplyScalar(0.3));
      end.position.copy(d.clone().multiplyScalar(0.27));
    }
    root.updateMatrixWorld(true);
    return { root, upper, lower, end, ik: new TwoBoneIK(upper, lower, end, new THREE.Vector3(0, 0, -1)) };
  }

  for (const randomAxes of [false, true]) {
    it(`reaches reachable targets and bends toward the pole (random axes: ${randomAxes})`, () => {
      const { upper, lower, end, ik } = chain(randomAxes);
      const rng = new Rng(4);
      for (let i = 0; i < 200; i++) {
        const target = new THREE.Vector3(0.2, 1.4, 0).add(
          new THREE.Vector3(rng.signed(1), rng.signed(1), rng.signed(1)).normalize().multiplyScalar(rng.range(0.1, 0.5)),
        );
        const pole = new THREE.Vector3(0.6, 0.6, -0.8);
        ik.solve(target, pole, { softness: 0 });
        const e = end.getWorldPosition(new THREE.Vector3());
        lt(e.distanceTo(target), 1e-3);
        const a = upper.getWorldPosition(new THREE.Vector3());
        const b = lower.getWorldPosition(new THREE.Vector3());
        close(a.distanceTo(b), 0.3, 4);
        close(b.distanceTo(e), 0.27, 4);
        // elbow lies on the pole side of the shoulder->target line
        const dir = target.clone().sub(a).normalize();
        const toP = pole.clone().sub(a);
        const pd = toP.sub(dir.clone().multiplyScalar(toP.dot(dir)));
        const toE = b.clone().sub(a);
        const ed = toE.sub(dir.clone().multiplyScalar(toE.dot(dir)));
        ge(ed.dot(pd), -1e-6);
      }
    });
  }

  it('soft reach never snaps and stays short of full extension', () => {
    const { end, ik } = chain(false);
    let prev = null;
    for (let i = 0; i <= 100; i++) {
      const target = new THREE.Vector3(0.2, 1.4, 0).add(new THREE.Vector3(0, -1, 0.3).normalize().multiplyScalar(0.45 + i * 0.002));
      ik.solve(target, new THREE.Vector3(0.6, 1.0, -1), { softness: 0.03 });
      const e = end.getWorldPosition(new THREE.Vector3());
      if (prev) lt(e.distanceTo(prev), 0.003);
      prev = e;
    }
  });

  it('look angles', () => {
    const r = lookAngles(new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    close(r.yaw, 45 * DEG, 5);
    close(r.pitch, Math.atan2(1, Math.SQRT2), 5);
  });
});

describe('metrics', () => {
  it('flags a pop and passes smooth motion', () => {
    const bone = new THREE.Object3D();
    const rec = new MotionRecorder([{ name: 'b', obj: bone }], [{ name: 'b', obj: bone }]);
    for (let i = 0; i < 120; i++) {
      if (i === 60) rec.markTransition('smooth');
      bone.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(i / 20));
      rec.record();
    }
    const r1 = rec.analyze();
    lt(r1.transitions[0].ratio, 1.3);

    const rec2 = new MotionRecorder([{ name: 'b', obj: bone }]);
    for (let i = 0; i < 120; i++) {
      if (i === 60) rec2.markTransition('pop');
      bone.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(i / 20) + (i >= 60 ? 0.3 : 0));
      rec2.record();
    }
    const r2 = rec2.analyze();
    gt(r2.transitions[0].ratio, 5);
    gt(r2.bones[0].maxJerk, r1.bones[0].maxJerk * 50);
  });
  it('path distance', () => {
    const a = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)];
    const b = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 1, 0)];
    close(pathDistance(a, b), 1, 6);
  });
});

describe('softClamp', () => {
  it('is identity inside, never exceeds the limits, and is C1', () => {
    assert.equal(softClamp(0.2, -1, 1, 0.2), 0.2);
    let prev = softClamp(-3, -1, 1, 0.2);
    for (let x = -3; x <= 3; x += 0.001) {
      const y = softClamp(x, -1, 1, 0.2);
      le(y, 1);
      ge(y, -1);
      le(y - prev, 0.001 + 1e-9); // slope <= 1, no jumps
      ge(y, prev - 1e-12); // monotone
      prev = y;
    }
  });
});

describe('clampQuatAngle', () => {
  it('with history stays continuous when the request sweeps through 180 degrees (no hand flip)', () => {
    const axis = new THREE.Vector3(0.3, 0.8, -0.5).normalize();
    const hist = new THREE.Quaternion();
    const shortArc = [];
    const cont = [];
    let prevS = null, prevC = null;
    // request goes 0 -> 340 deg -> 0 around one axis, 1 deg per frame
    const seq = [...Array(341).keys(), ...[...Array(340).keys()].reverse()];
    for (const deg of seq) {
      const req = new THREE.Quaternion().setFromAxisAngle(axis, deg * DEG);
      const s = clampQuatAngle(req.clone(), 100 * DEG, 30 * DEG);
      const c = clampQuatAngle(req.clone(), 100 * DEG, 30 * DEG, hist);
      if (prevS) shortArc.push(quatAngle(prevS, s) / DEG);
      if (prevC) cont.push(quatAngle(prevC, c) / DEG);
      prevS = s;
      prevC = c;
      le(quatAngle(c, new THREE.Quaternion()) / DEG, 100.001);
    }
    gt(Math.max(...shortArc), 150); // the plain clamp: a ~180 deg flip at 180
    lt(Math.max(...cont), 2.5); // continuous: never more than ~2x the request step
  });
  it('with history matches the plain clamp for ordinary requests', () => {
    const hist = new THREE.Quaternion();
    for (const a of [0.2, 0.9, 1.5, 2.2]) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(a, -a * 0.5, a * 0.3));
      const x = clampQuatAngle(q.clone(), 100 * DEG, 30 * DEG);
      const y = clampQuatAngle(q.clone(), 100 * DEG, 30 * DEG, hist);
      lt(quatAngle(x, y), 1e-5);
    }
  });
});

describe('timeline speed limit', () => {
  it('inserts time where a vector channel moves too fast, leaving explicit-velocity keys alone', () => {
    const L = new ChannelLayout({ hand: [0, 0, 0], x: 0 });
    const tl = new Timeline(L)
      .key(0, { hand: [0, 0, 0], x: 0 })
      .key(0.2, { hand: [0.5, 0, 0] }) // 2.5 m/s: too fast
      .key(0.5, { hand: [0.6, 0, 0], x: 1 }) // 0.33 m/s: fine
      .key(0.6, { hand: [1.2, 0, 0] }, { vel: { hand: [6, 0, 0] } }) // a throw: exempt
      .event(0.55, 'release');
    const added = tl.limitSpeed('hand', 1);
    close(added, 0.3, 5);
    close(tl.eventTime('release'), 0.85, 5);
    const tr = tl.tracks.get(0);
    assert.deepEqual(tr.keys.map((k) => +k.t.toFixed(4)), [0, 0.5, 0.8, 0.9]);
  });
});

describe('timeline arcs', () => {
  it('bends long moves into an arc and leaves explicit-velocity segments straight', () => {
    const L = new ChannelLayout({ hand: [0, 0, 0] });
    const tl = new Timeline(L)
      .key(0, { hand: [0, 0, 0] })
      .key(0.6, { hand: [0.4, 0, 0] })
      .key(0.9, { hand: [0.8, 0, 0] }, { vel: { hand: [2, 0, 0] } });
    assert.equal(tl.addArcs('hand', { up: [0, 1, 0], bulge: 0.1 }), 1);
    const out = new Float32Array(3);
    tl.sample(0.3, out);
    close(out[1], 0.04, 3); // 10% of the 40 cm chord, upward
    tl.sample(0.75, out);
    lt(Math.abs(out[1]), 1e-6);
  });
});
