import test from 'node:test';
import assert from 'node:assert/strict';
import { createLookSwitch, pickLook } from '../src/look-switch.js';

// Fake looks: a "material" is a plain object; a "scene" is a tree with traverse().
function fakeLook(tag) {
  const cache = new Map();
  return {
    activated: 0,
    mat(id, mode, glow, side) {
      const k = `${id}|${mode}|${glow}|${side}`;
      if (!cache.has(k)) cache.set(k, { look: tag, id, mode, userData: {} });
      return cache.get(k);
    },
    createView() { const self = this; return { activate() { self.activated++; }, name: tag }; },
  };
}
function scene(children) {
  return { traverse(fn) { fn(this); children.forEach(fn); }, children };
}

test('pickLook: URL beats saved choice beats fallback', () => {
  const names = ['riso', 'plain'];
  const storage = { getItem: () => JSON.stringify('plain') };
  assert.equal(pickLook(names, { search: '?look=riso', storageKey: 'k', storage }), 'riso');
  assert.equal(pickLook(names, { search: '', storageKey: 'k', storage }), 'plain');
  assert.equal(pickLook(names, { search: '?look=nope', storage: null }), 'riso');
  assert.equal(pickLook(names, { search: '', fallback: 'plain', storage: null }), 'plain');
});

test('mat() asks the active look and tags the role', () => {
  const looks = createLookSwitch({ looks: { riso: fakeLook('riso'), plain: fakeLook('plain') }, initial: 'riso' });
  const m = looks.mat(4, 8);
  assert.equal(m.look, 'riso');
  assert.deepEqual(m.userData.inkRole, { id: 4, mode: 8, glow: 0, side: 0 });
  assert.equal(looks.mat(4, 8), m, 'same role, same material');
});

test('set() swaps every tagged material live and leaves the rest alone', () => {
  const riso = fakeLook('riso'), plain = fakeLook('plain');
  const looks = createLookSwitch({ looks: { riso, plain }, initial: 'riso', renderer: {} });
  assert.equal(riso.activated, 1);
  const own = { look: 'mine', userData: {} };
  const a = { material: looks.mat(2) }, b = { material: [looks.mat(4, 1), own] }, c = { material: own }, d = {};
  const s = scene([a, b, c, d]);
  assert.equal(looks.set('plain', s), true);
  assert.equal(looks.name, 'plain');
  assert.equal(a.material.look, 'plain');
  assert.equal(b.material[0].look, 'plain');
  assert.equal(b.material[0].mode, 1);
  assert.equal(b.material[1], own);
  assert.equal(c.material, own);
  assert.equal(plain.activated, 1);
  assert.equal(looks.set('plain', s), false, 'already on');
  assert.equal(looks.set('nope', s), false, 'unknown');
  looks.next(s);
  assert.equal(a.material.look, 'riso');
  assert.equal(riso.activated, 2);
});
