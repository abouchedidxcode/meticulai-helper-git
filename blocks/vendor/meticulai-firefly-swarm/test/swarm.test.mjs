// The swarm and the catching game, with a simple flat "screen" so no camera or WebGL is needed.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Flies } from '../src/flies.js';
import { FireflyCatcher } from '../src/catcher.js';
import { PointerHand } from '../src/pointer.js';
import { TUNING } from '../src/rules.js';

// world x -5..5 maps to screen x 0..1, world y 0..4 maps to screen y 1..0 (aspect 1 to keep distances simple)
const space = {
  pick: (r) => new THREE.Vector3(-3 + r() * 6, 1 + r() * 2, 0),
  project: (p, out) => { out.x = (p.x + 5) / 10; out.y = 1 - p.y / 4; return true; },
};
const toScreen = (p) => ({ x: (p.x + 5) / 10, y: 1 - p.y / 4 });

function world(seed = 1) {
  const flies = new Flies(space, seed);
  const jar = { mouth: new THREE.Vector3(4, 0.5, 0), count: 0, pulse: 0 };
  const events = [];
  const catcher = new FireflyCatcher({ flies, jar, aspect: () => 1, onEvent: (type, d) => events.push({ type, d }) });
  catcher.jarScreen = toScreen(jar.mouth);
  return { flies, jar, catcher, events };
}

/** run `seconds` of frames with one hand whose openness follows fn(time since start) */
function run(w, seconds, at, openness, t0 = { t: 0 }) {
  const dt = 1 / 60;
  for (let s = 0; s < seconds; s += dt) {
    t0.t += dt;
    const hands = at ? [{ id: 0, screen: toScreen(at), world: at.clone(), openness: openness(s) }] : [];
    w.catcher.update(dt, t0.t, hands);
  }
  return t0;
}

/** a fly settled at p, visible and catchable */
function settle(w, p) {
  const f = w.flies.spawn('common', p);
  f.target = p.clone();
  run(w, 2, null, () => 1);
  return f;
}

describe('fireflies', () => {
  test('fade in, blink, and are catchable once visible', () => {
    const w = world();
    const f = settle(w, new THREE.Vector3(0, 2, 0));
    assert.ok(f.alpha > 0.99);
    assert.ok(w.flies.catchable(f));
    let lo = Infinity, hi = 0;
    const clock = { t: 10 };
    for (let i = 0; i < 400; i++) { run(w, 1 / 60, null, () => 1, clock); lo = Math.min(lo, f.bright); hi = Math.max(hi, f.bright); }
    assert.ok(lo < 0.4 && hi > 1.0, `blink ${lo}..${hi}`);
  });

  test('a snatch makes the near ones bolt and they cannot be caught for a moment', () => {
    const w = world();
    const f = settle(w, new THREE.Vector3(0, 2, 0));
    const n = w.flies.startle(new THREE.Vector3(0.1, 2, 0), toScreen(new THREE.Vector3(0.1, 2, 0)), TUNING.startleRadius, 1);
    assert.equal(n, 1);
    assert.equal(f.state, 'startled');
    assert.ok(f.vel.length() > 2.5);
    assert.equal(w.flies.catchable(f), false);
  });

  test('a still open hand draws a curious firefly toward it', () => {
    const w = world();
    const f = settle(w, new THREE.Vector3(0, 2, 0));
    const hand = new THREE.Vector3(1.2, 2, 0);
    const d0 = f.pos.distanceTo(hand);
    run(w, 5, hand, () => 1);
    // it hovers round the palm (a little above, swaying), so it comes close but not onto it
    assert.ok(f.pos.distanceTo(hand) < d0 * 0.6, `${d0} -> ${f.pos.distanceTo(hand)}`);
  });

  test('neighbours keep a little apart', () => {
    const w = world();
    const p = new THREE.Vector3(0, 2, 0);
    const a = w.flies.spawn('common', p), b = w.flies.spawn('common', p.clone().add(new THREE.Vector3(0.05, 0, 0)));
    a.target = p.clone(); b.target = p.clone();
    run(w, 1, null, () => 1);
    assert.ok(a.pos.distanceTo(b.pos) > 0.1);
  });
});

describe('catching', () => {
  test('a slow close over a firefly catches it; it rides in the fist', () => {
    const w = world();
    const f = settle(w, new THREE.Vector3(0, 2, 0));
    const hand = f.pos.clone();
    run(w, 0.3, hand, () => 1);
    run(w, 1, hand, (s) => Math.max(0, 1 - s / 0.55)); // the mouse's 0.55 s close
    assert.equal(f.state, 'caught');
    assert.equal(w.events[0].type, 'catch');
    assert.ok(f.pos.distanceTo(hand) < 0.1);
    assert.ok(w.catcher.fists()[0].glow > 0.9);
  });

  test('a snap shut startles instead of catching', () => {
    const w = world();
    const f = settle(w, new THREE.Vector3(0, 2, 0));
    const hand = f.pos.clone();
    run(w, 0.3, hand, () => 1);
    run(w, 0.3, hand, (s) => Math.max(0, 1 - s / 0.05));
    assert.equal(f.state, 'startled');
    assert.equal(w.catcher.stats.startles, 1);
    assert.equal(w.catcher.stats.catches, 0);
  });

  test('open over the jar: they fly in and score; open elsewhere: they fly off', () => {
    const w = world();
    const f = settle(w, new THREE.Vector3(0, 2, 0));
    const clock = run(w, 0.3, f.pos.clone(), () => 1);
    run(w, 1, f.pos.clone(), (s) => Math.max(0, 1 - s / 0.55), clock);
    // carry to the jar, closed, then open
    run(w, 0.5, w.jar.mouth.clone(), () => 0, clock);
    run(w, 1.5, w.jar.mouth.clone(), () => 1, clock);
    assert.equal(w.catcher.stats.caught, 1);
    assert.equal(w.jar.count, 1);
    assert.ok(w.events.some((e) => e.type === 'jar'));
    assert.equal(w.flies.list.includes(f), false);

    const g = settle(w, new THREE.Vector3(-2, 2, 0));
    run(w, 0.3, g.pos.clone(), () => 1, clock);
    run(w, 1, g.pos.clone(), (s) => Math.max(0, 1 - s / 0.55), clock);
    assert.equal(g.state, 'caught');
    run(w, 0.3, g.pos.clone(), () => 1, clock);
    assert.equal(g.state, 'escape');
    assert.equal(w.catcher.stats.releasedFree, 1);
  });

  test('held too long, one slips out', () => {
    const w = world();
    const f = settle(w, new THREE.Vector3(0, 2, 0));
    const clock = run(w, 0.3, f.pos.clone(), () => 1);
    run(w, 1, f.pos.clone(), (s) => Math.max(0, 1 - s / 0.55), clock);
    assert.equal(f.state, 'caught');
    run(w, TUNING.holdMs / 1000 + 0.2, f.pos.clone(), () => 0, clock);
    assert.equal(w.catcher.stats.slips, 1);
    assert.notEqual(f.state, 'caught');
  });

  test('a hand that disappears lets its fireflies go after 0.6 s', () => {
    const w = world();
    const f = settle(w, new THREE.Vector3(0, 2, 0));
    const clock = run(w, 0.3, f.pos.clone(), () => 1);
    run(w, 1, f.pos.clone(), (s) => Math.max(0, 1 - s / 0.55), clock);
    run(w, 0.4, null, () => 1, clock);
    assert.equal(f.state, 'caught');
    run(w, 0.4, null, () => 1, clock);
    assert.notEqual(f.state, 'caught');
  });
});

describe('pointer hand', () => {
  const el = { addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  test('holding the button closes in 0.55 s: a gentle catch; a quick click snaps shut: frantic', async () => {
    const { Grip } = await import('../src/rules.js');
    const close = (fn) => {
      const p = new PointerHand(el), g = new Grip();
      let ev = null, t = 0;
      for (let i = 0; i < 10; i++) { t += 16.7; g.update(p.update(1 / 60), t); }
      fn(p);
      for (let i = 0; i < 90; i++) { t += 16.7; const e = g.update(p.update(1 / 60), t); if (e && e.type === 'close') ev = e; }
      return ev;
    };
    const held = close((p) => p.press());
    assert.equal(held.kind, 'slow');
    assert.ok(held.durationMs > 450 && held.durationMs < 650, `${held.durationMs}`);
    const tap = close((p) => { p.press(); p.lift(); });
    assert.equal(tap.kind, 'frantic');
  });
});
