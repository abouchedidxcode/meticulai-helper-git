// node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTuning, parse, flatten, fit } from '../src/tuning.js';

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}
const fresh = (storage = memStorage()) => createTuning({ storageKey: 't', storage });

test('captures the default at registration and reports what changed', () => {
  const t = fresh();
  const P = { speed: 6.5, jump: true };
  t.num('Player', 'Speed', P, 'speed', 2, 14, 0.1);
  t.bool('Player', 'Can jump', P, 'jump');
  assert.equal(t.item('player.speed').def, 6.5);
  assert.deepEqual(t.changes(), {});
  t.set('player.speed', 8);
  assert.equal(P.speed, 8);
  assert.ok(t.changed('player.speed'));
  assert.deepEqual(t.changes(), { 'player.speed': 8 });
  t.reset('player.speed');
  assert.equal(P.speed, 6.5);
  assert.deepEqual(t.changes(), {});
});

test('numbers are rounded to the step, may go past the slider, and nonsense is refused', () => {
  const t = fresh();
  const P = { a: 1 };
  t.num('G', 'A', P, 'a', 0, 2, 0.05);
  t.set('g.a', '1,23456789');
  assert.equal(P.a, 1.23457);
  t.set('g.a', 5);
  assert.equal(P.a, 5);
  assert.ok(t.beyond('g.a'));
  assert.equal(t.set('g.a', 'banana'), false);
  assert.equal(P.a, 5);
});

test('pick, colour and bool values are fitted to the control', () => {
  const it = { kind: 'pick', options: ['box', ['ball', 'Ball'], 3] };
  assert.equal(fit(it, 'ball'), 'ball');
  assert.equal(fit(it, '3'), 3);
  assert.equal(fit(it, 'cone'), null);
  assert.equal(fit({ kind: 'color' }, 'F80'), '#ff8800');
  assert.equal(fit({ kind: 'color' }, '#12345'), null);
  assert.equal(fit({ kind: 'bool' }, 'false'), false);
  assert.equal(fit({ kind: 'bool' }, 'yes'), null);
});

test('a colour on a THREE.Color-like object is edited in place', () => {
  const t = fresh();
  const c = { hex: 'ff0000', getHexString() { return this.hex; }, set(v) { this.hex = v.slice(1); } };
  const L = { sky: c };
  t.color('Look', 'Sky', L, 'sky');
  assert.equal(t.get('look.sky'), '#ff0000');
  t.set('look.sky', '#00ff00');
  assert.equal(c.hex, '00ff00');
  assert.ok(t.changed('look.sky'));
});

test('only the diff is stored, and a fresh page re-applies it as each control registers', () => {
  const st = memStorage();
  const a = fresh(st);
  const P = { speed: 6.5, other: 1 };
  a.num('Player', 'Speed', P, 'speed', 2, 14, 0.1);
  a.num('Player', 'Other', P, 'other', 0, 2, 0.1);
  a.set('player.speed', 9);
  const saved = JSON.parse(st.getItem('t'));
  assert.deepEqual(Object.keys(saved.v), ['player.speed']);
  assert.deepEqual(saved.v['player.speed'], { v: 9, base: 6.5 });

  const Q = { speed: 6.5, other: 1 };
  const b = fresh(st);
  b.num('Player', 'Speed', Q, 'speed', 2, 14, 0.1);
  assert.equal(Q.speed, 9);
  assert.equal(b.item('player.speed').def, 6.5, 'the default is still the game\'s, not the stored value');
});

test('a saved value is dropped when the game\'s own default has changed since', () => {
  const st = memStorage();
  const a = fresh(st);
  a.num('Player', 'Speed', { speed: 6.5 }, 'speed', 2, 14, 0.1);
  a.set('player.speed', 9);
  const Q = { speed: 7 }; // the agent made 7 the new default
  const b = fresh(st);
  b.num('Player', 'Speed', Q, 'speed', 2, 14, 0.1);
  assert.equal(Q.speed, 7);
  assert.deepEqual(b.dropped, ['player.speed']);
  assert.deepEqual(b.changes(), {});
});

test('useStored: false ignores earlier values', () => {
  const st = memStorage();
  const a = fresh(st);
  a.num('G', 'X', { x: 1 }, 'x', 0, 2, 0.1);
  a.set('g.x', 2);
  const b = createTuning({ storageKey: 't', storage: st, useStored: false });
  const Q = { x: 1 };
  b.num('G', 'X', Q, 'x', 0, 2, 0.1);
  assert.equal(Q.x, 1);
});

test('copies a header line and compact JSON, and pastes it back', () => {
  const t = fresh();
  const P = { a: 1, b: false };
  t.num('G', 'A', P, 'a', 0, 5, 0.5);
  t.bool('G', 'B', P, 'b');
  t.set('g.a', 2.5);
  t.set('g.b', true);
  const text = t.copyText({ title: 'My Game', when: new Date('2026-11-14T10:00:00Z') });
  const [head, body] = text.split('\n');
  assert.match(head, /^\/\/ My Game 2026-11-14 10:00: 2 values changed/);
  assert.equal(body, '{"g.a":2.5,"g.b":true}');
  t.resetAll();
  assert.equal(P.a, 1);
  const r = t.apply(parse('Here you go:\n```\n' + text + '\n```'));
  assert.deepEqual(r.used.sort(), ['g.a', 'g.b']);
  assert.equal(P.a, 2.5);
  assert.equal(P.b, true);
});

test('paste accepts the starter tuning.json shape and the old { tune } shape', () => {
  assert.deepEqual(flatten({ player: { runSpeed: { value: 8, min: 2 } }, feel: { invincible: true } }), { 'player.runSpeed': 8, 'feel.invincible': true });
  assert.deepEqual(flatten({ tune: { 'a.b': 1 } }), { 'a.b': 1 });
  assert.equal(parse('no json here'), null);
});

test('apply: replace puts the rest back, on top keeps it; unknown ids are kept for later', () => {
  const st = memStorage();
  const t = fresh(st);
  const P = { a: 1, b: 1 };
  t.num('G', 'A', P, 'a', 0, 5, 1);
  t.num('G', 'B', P, 'b', 0, 5, 1);
  t.set('g.a', 3);
  t.apply({ 'g.b': 4 }, false);
  assert.deepEqual([P.a, P.b], [3, 4]);
  const r = t.apply({ 'g.b': 2, 'later.c': 7 }, true);
  assert.deepEqual([P.a, P.b], [1, 2]);
  assert.deepEqual(r.unknown, ['later.c']);
  const Q = { c: 0 };
  t.num('Later', 'C', Q, 'c', 0, 10, 1);
  assert.equal(Q.c, 7, 'a control that registers late still gets its value');
});

test('keeps three slots to compare feels', () => {
  const t = fresh();
  const P = { a: 1 };
  t.num('G', 'A', P, 'a', 0, 10, 1);
  t.set('g.a', 3);
  t.saveSlot('A');
  t.set('g.a', 7);
  t.saveSlot('B');
  assert.equal(t.activeSlot(), 'B');
  t.loadSlot('A');
  assert.equal(P.a, 3);
  assert.equal(t.activeSlot(), 'A');
  assert.equal(t.loadSlot('C'), false);
});

test('presets apply on top of the defaults without piling up, and checkPresets finds stale keys', () => {
  const t = fresh();
  const P = { a: 1, b: 1 };
  t.num('G', 'A', P, 'a', 0, 10, 1);
  t.num('G', 'B', P, 'b', 0, 10, 1);
  t.addPresets([
    { name: 'Fast', about: 'quick', values: { 'g.a': 5 } },
    { name: 'Slow', about: 'calm', values: { 'g.b': 0, 'g.gone': 1, 'g.a': 99 } },
  ]);
  t.applyPreset('fast');
  assert.deepEqual([P.a, P.b], [5, 1]);
  assert.equal(t.activePreset(), 'fast');
  t.applyPreset('slow');
  assert.deepEqual([P.a, P.b], [99, 0], 'Fast\'s value did not stay');
  const problems = t.checkPresets().map((p) => `${p.id}: ${p.problem}`);
  assert.deepEqual(problems.sort(), ['g.a: out of range (0..10)', 'g.gone: no such control']);
});

test('save: false keeps a control out of storage and copies; buttons and readouts are not values', () => {
  const st = memStorage();
  const t = fresh(st);
  const D = { god: false };
  let ran = 0;
  t.bool('Debug', 'God mode', D, 'god', { save: false });
  t.button('Debug', 'Kick', () => ran++);
  t.readout('Debug', 'Height', () => '1 m');
  t.set('debug.god', true);
  assert.equal(D.god, true);
  assert.deepEqual(t.changes(), {});
  assert.deepEqual(JSON.parse(st.getItem('t')).v, {});
  t.item('debug.kick').run();
  assert.equal(ran, 1);
  assert.equal(t.get('debug.height'), undefined);
});

test('registering an id again keeps the first default (hot reload)', () => {
  const t = fresh();
  const P = { a: 1 };
  t.num('G', 'A', P, 'a', 0, 10, 1);
  t.set('g.a', 4);
  t.num('G', 'A', P, 'a', 0, 10, 1);
  assert.equal(t.item('g.a').def, 1);
  assert.ok(t.changed('g.a'));
});

test('group() chains the shorthands', () => {
  const t = fresh();
  const P = { a: 1, b: true };
  t.group('Player').num('A', P, 'a', 0, 2, 0.1).bool('B', P, 'b');
  assert.deepEqual(t.items().map((i) => i.id), ['player.a', 'player.b']);
});

test('rebase makes the current values the defaults, only for the ids given', () => {
  const st = memStorage();
  const t = fresh(st);
  const P = { a: 1, b: 1 };
  t.num('G', 'A', P, 'a', 0, 10, 1);
  t.num('G', 'B', P, 'b', 0, 10, 1);
  t.set('g.a', 5);
  t.set('g.b', 6);
  t.rebase(['g.a']);
  assert.deepEqual(t.changes(), { 'g.b': 6 });
  assert.equal(t.item('g.a').def, 5);
});

test('essentials list the ids that match no control', () => {
  const t = fresh();
  t.num('G', 'A', { a: 1 }, 'a', 0, 10, 1);
  t.setEssentials([['Main', [['The A', 'g.a'], ['Gone', 'g.zzz']]]]);
  assert.deepEqual(t.missingEssentials(), ['g.zzz']);
});
