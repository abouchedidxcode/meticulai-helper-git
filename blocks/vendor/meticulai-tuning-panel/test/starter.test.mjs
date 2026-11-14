// The drop-in for the kit starter's settings.js: same tuning.json in, same exports and save body out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStarterSettings } from '../src/starter.js';

const FILE = {
  player: {
    runSpeed: { value: 6.5, min: 2, max: 14, step: 0.1, label: 'Run speed', help: 'Top speed.' },
    gravity: { value: 26, min: 8, max: 60, step: 0.5 },
  },
  feel: { invincible: { value: false, label: 'Invincible' } },
  look: { sky: { value: '#88aaff' }, mood: { value: 'calm', options: ['calm', 'storm'] } },
};
function memStorage() { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; }

test('tune holds the file values, grouped the same way, and the file is not mutated', () => {
  const s = createStarterSettings(FILE, { storage: memStorage() });
  assert.equal(s.tune.player.runSpeed, 6.5);
  assert.equal(s.tune.feel.invincible, false);
  assert.equal(s.tuning.item('player.gravity').label, 'Gravity');
  assert.equal(s.tuning.item('player.runSpeed').hint, 'Top speed.');
  assert.equal(s.tuning.item('feel.invincible').kind, 'bool');
  assert.equal(s.tuning.item('look.sky').kind, 'color');
  assert.equal(s.tuning.item('look.mood').kind, 'pick');
  s.set('player', 'runSpeed', 9);
  assert.equal(FILE.player.runSpeed.value, 6.5);
});

test('changedValues uses the old "group.id" keys, including values the game sets directly', () => {
  const s = createStarterSettings(FILE, { storage: memStorage() });
  s.set('player', 'runSpeed', 8);
  s.tune.feel.invincible = true; // the starter's cheat key writes tune directly
  assert.deepEqual(s.changedValues(), { 'player.runSpeed': 8, 'feel.invincible': true });
});

test('define adds a value from code and it goes into the saved file', () => {
  const s = createStarterSettings(FILE, { storage: memStorage() });
  const v = s.define('enemy', 'chaseSpeed', { value: 4, min: 0, max: 10, step: 0.1, label: 'Chase speed' });
  assert.equal(v, 4);
  assert.equal(s.define('enemy', 'chaseSpeed', { value: 99 }), 4, 'a second define does not replace it');
  s.set('enemy', 'chaseSpeed', 5);
  const out = s.fileWithCurrentValues();
  assert.deepEqual(out.enemy.chaseSpeed, { value: 5, min: 0, max: 10, step: 0.1, label: 'Chase speed' });
  assert.deepEqual(Object.keys(out), ['player', 'feel', 'look', 'enemy']);
});

test('"Save for my agent" posts { values } in the tuning.json format to /__helper/tuning, then nothing shows as changed', async () => {
  const s = createStarterSettings(FILE, { storage: memStorage() });
  s.set('player', 'gravity', 30);
  const extra = { x: 1 };
  s.tuning.num('Extra', 'X', extra, 'x', 0, 2, 0.1); // a control the file does not hold
  s.tuning.set('extra.x', 2);
  let sent = null;
  globalThis.fetch = async (url, init) => { sent = { url, init }; return { ok: true, status: 200 }; };
  const said = await s.saveForAgent(); // the function the panel's button calls
  assert.match(said, /Saved to src\/tuning.json/);
  assert.equal(sent.url, '/__helper/tuning');
  assert.equal(sent.init.method, 'POST');
  const body = JSON.parse(sent.init.body);
  assert.deepEqual(Object.keys(body), ['values']);
  assert.equal(body.values.player.gravity.value, 30);
  assert.equal(body.values.player.gravity.min, 8);
  assert.deepEqual(s.changedValues(), { 'extra.x': 2 }, 'only the file\'s values became defaults');
});

test('a value kept from an earlier visit comes back at import time, before the game reads tune', () => {
  const st = memStorage();
  const a = createStarterSettings(FILE, { storage: st });
  a.set('player', 'runSpeed', 10);
  const b = createStarterSettings(FILE, { storage: st });
  assert.equal(b.tune.player.runSpeed, 10);
  const edited = structuredClone(FILE);
  edited.player.runSpeed.value = 7; // the agent changed the default in tuning.json
  const c = createStarterSettings(edited, { storage: st });
  assert.equal(c.tune.player.runSpeed, 7, 'the stale value is dropped');
});

