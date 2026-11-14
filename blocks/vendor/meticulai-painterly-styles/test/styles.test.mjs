// node --test test/   (pure logic only: no three.js, no browser)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STYLES, STYLE_CHOICES, BASE_LOOKS, GOUACHE, KINDS,
  parseStyle, startStyle, saveStyle, styleLook, styleId, nextStyle, sunDirection,
} from '../src/styles.js';

const memStore = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};

test('parseStyle accepts the aliases and rejects unknown names', () => {
  assert.equal(parseStyle('painterly'), 'gouache');
  assert.equal(parseStyle('Classic'), 'none');
  assert.equal(parseStyle('current'), 'none');
  assert.equal(parseStyle(' miniature '), 'miniature');
  assert.equal(parseStyle('clean'), 'clean');
  assert.equal(parseStyle('watercolour'), null);
  assert.equal(parseStyle(null), null);
});

test('startStyle: URL beats saved choice beats the default (gouache)', () => {
  const store = memStore({ 'x.style': 'clean' });
  assert.equal(startStyle({ search: '?style=miniature', storage: store, storageKey: 'x.style' }), 'miniature');
  assert.equal(startStyle({ search: '', storage: store, storageKey: 'x.style' }), 'clean');
  assert.equal(startStyle({ search: '?style=nonsense', storage: memStore(), storageKey: 'x.style' }), 'gouache');
  assert.equal(startStyle({}), 'gouache');
});

test('saveStyle writes under the given key and never throws', () => {
  const store = memStore();
  saveStyle('miniature', { storage: store, storageKey: 'mygame.look' });
  assert.equal(store.getItem('mygame.look'), 'miniature');
  const broken = { setItem() { throw new Error('quota'); } };
  assert.doesNotThrow(() => saveStyle('clean', { storage: broken }));
  assert.doesNotThrow(() => saveStyle('clean', { storage: null }));
});

test('a failing storage read falls back to the default', () => {
  const broken = { getItem() { throw new Error('denied'); } };
  assert.equal(startStyle({ storage: broken }), 'gouache');
});

test('styleLook layers base < all < own look, merges grade field by field, leaves base untouched', () => {
  const base = BASE_LOOKS.golden;
  const before = JSON.stringify(base);
  const g = styleLook(base, 'gouache');
  assert.equal(g.sunIntensity, 4.8);
  assert.equal(g.hemiIntensity, 3.6);
  assert.equal(g.fogDensity, 0.0026);
  assert.equal(g.cloudShadow, 0.25); // from 'all'
  assert.equal(g.sunElev, 14); // kept from base
  assert.deepEqual(g.grade.shadow, [0.9, 0.98, 1.14]);
  assert.equal(g.grade.sat, 1.16);
  assert.equal(JSON.stringify(base), before);
  // a style's look table that only sets part of the grade keeps the rest of the base grade
  const m = styleLook(BASE_LOOKS.night, 'gouache');
  assert.equal(m.grade.curve, 1);
  assert.equal(m.exposure, 1.75);
  assert.equal(m.sunColor, BASE_LOOKS.night.sunColor);
});

test("styleLook with 'none' or an unknown look name", () => {
  assert.equal(styleLook(BASE_LOOKS.golden, 'none'), BASE_LOOKS.golden);
  const odd = { ...BASE_LOOKS.golden, name: 'dusk' };
  const r = styleLook(odd, 'miniature');
  assert.equal(r.bounce, 0.05); // only the 'all' table applies
  assert.equal(r.sunIntensity, odd.sunIntensity);
});

test('style ids match the shader (1 miniature, 2 gouache, 3 clean) and the tuned numbers are intact', () => {
  assert.deepEqual([styleId('none'), styleId('miniature'), styleId('gouache'), styleId('clean')], [0, 1, 2, 3]);
  assert.equal(GOUACHE.vignette, 0.28);
  assert.equal(GOUACHE.bloom, 0.8);
  assert.equal(STYLES.miniature.vignette, 0.12);
  assert.equal(STYLES.clean.noAO, false);
  assert.deepEqual(KINDS, { flat: 0, hero: 1, figure: 2, textured: 3, ground: 4 });
});

test('nextStyle cycles through the settings order', () => {
  let s = STYLE_CHOICES[0];
  const seen = [s];
  for (let i = 0; i < 4; i++) seen.push((s = nextStyle(s)));
  assert.deepEqual(seen, ['gouache', 'miniature', 'clean', 'none', 'gouache']);
});

test('sunDirection: unit length, elevation and azimuth as Kite Race measured them', () => {
  const d = sunDirection(14, -55);
  assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-9);
  assert.ok(Math.abs(d[1] - Math.sin((14 * Math.PI) / 180)) < 1e-9);
  assert.ok(d[0] < 0 && d[2] < 0); // ahead (-z) and to the left
  const ahead = sunDirection(0, 0);
  assert.ok(Math.abs(ahead[2] + 1) < 1e-9 && Math.abs(ahead[0]) < 1e-9);
  const right = sunDirection(0, 90);
  assert.ok(Math.abs(right[0] - 1) < 1e-9);
});
