import test from 'node:test';
import assert from 'node:assert/strict';
import { createBow, BOW_DEFAULTS, PLAYED_SETTINGS } from '../src/bow.js';

const dt = 1 / 60;
function holdFor(bow, secs) { let shot = null; for (let t = 0; t < secs - 1e-9; t += dt) shot = bow.update(dt, true) || shot; return shot; }

test('the tuned numbers are the source game\'s', () => {
  assert.equal(BOW_DEFAULTS.drawTime, 0.4);
  assert.equal(BOW_DEFAULTS.speedFull, 120);
  assert.equal(BOW_DEFAULTS.speedMin, 30);
  assert.equal(BOW_DEFAULTS.guideTurn, 30);
  assert.deepEqual(PLAYED_SETTINGS, { bow: { drawTime: 1.2, speedFull: 129 }, aim: { assistDeg: 0 } });
});

test('hold 0.4 s, let go: a perfect shot at 120 m/s', () => {
  const bow = createBow();
  holdFor(bow, 0.45);
  assert.equal(bow.state.ready, true, 'full draw after drawTime');
  const shot = bow.update(dt, false);
  assert.ok(shot && shot.perfect && Math.abs(shot.speed - 120) < 1e-9);
  assert.equal(bow.state.quiver, 59);
});

test('a tap is a snap shot: the draw carries on to minDraw and looses weak', () => {
  const bow = createBow();
  bow.update(dt, true);
  let shot = null, t = 0;
  while (!shot && t < 1) { shot = bow.update(dt, false); t += dt; }
  assert.ok(shot, 'it looses by itself');
  assert.ok(!shot.perfect && shot.power >= 0.45 && shot.power < 0.6, `power ${shot.power}`);
  assert.ok(t < 0.2, `about 0.15 s after the tap (${t.toFixed(2)})`);
});

test('ready again 0.5 s after the loose; a press during the reload is kept', () => {
  const bow = createBow();
  holdFor(bow, 0.45); bow.update(dt, false);
  bow.update(dt, true); bow.update(dt, false);       // a tap while nocking
  let t = 2 * dt, drew = false;
  while (t < 0.8) { bow.update(dt, false); t += dt; if (bow.state.phase === 'drawing') { drew = true; break; } }
  assert.ok(drew, 'the queued press starts a draw');
  assert.ok(t > 0.48 && t < 0.55, `at ${t.toFixed(3)} s`);
});
