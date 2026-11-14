import test from 'node:test';
import assert from 'node:assert/strict';
import { INK, MODE, PALETTES, PALETTE_EASE, easePalette, overprint, ROLE_COVERAGE, inkDefines } from '../src/riso/inks.js';

test('ink role ids are unique and fit in one byte', () => {
  const ids = Object.values(INK);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(id >= 1 && id <= 254 && Number.isInteger(id));
});

test('every role has a coverage entry for the plain look', () => {
  for (const id of Object.values(INK)) assert.equal(ROLE_COVERAGE[id]?.length, 3, `role ${id}`);
});

test('surface modes are unique', () => {
  const m = Object.values(MODE);
  assert.equal(new Set(m).size, m.length);
});

test('the eight ink sets are complete and in 0..1', () => {
  assert.deepEqual(Object.keys(PALETTES), ['classic', 'teal', 'violet', 'green', 'night', 'burgundy', 'slate', 'black']);
  for (const p of Object.values(PALETTES)) {
    for (const k of ['paper', 'B', 'P', 'Y']) {
      assert.equal(p[k].length, 3);
      for (const v of p[k]) assert.ok(v >= 0 && v <= 1);
    }
  }
  assert.deepEqual(PALETTES.classic.B, [0.16, 0.33, 0.68]);
});

test('easePalette closes min(1, dt * 2.5) of the gap per call', () => {
  const cur = structuredClone(PALETTES.classic);
  const target = PALETTES.night;
  easePalette(cur, target, 0.1);
  const k = 0.1 * PALETTE_EASE;
  assert.ok(Math.abs(cur.B[0] - (0.16 + (0.27 - 0.16) * k)) < 1e-12);
  easePalette(cur, target, 1); // k clamps to 1: arrives
  assert.deepEqual(cur, structuredClone(target));
});

test('overprint: no ink is paper, full ink multiplies', () => {
  const p = PALETTES.classic;
  assert.deepEqual(overprint([0, 0, 0], p), p.paper);
  const full = overprint([1, 0, 0], p);
  full.forEach((v, i) => assert.ok(Math.abs(v - p.paper[i] * p.B[i]) < 1e-12));
  const enemy = overprint(ROLE_COVERAGE[INK.ENEMY], p);
  assert.ok(enemy[0] > enemy[1], 'enemy reads pink (red over green)');
});

test('inkDefines names every role for GLSL', () => {
  const d = inkDefines();
  assert.match(d, /#define I_ENEMY 4\.0/);
  assert.equal(d.split('\n').length, Object.keys(INK).length);
});
