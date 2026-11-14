import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RAMPS, RAMP_ORDER, RAMP_ROW, RAMP_LEN, RAMP_W, hexToRgb, rampColor, rampHex, rampTextureData } from '../src/palette.js';

test('every ramp has 2..8 valid colours (fits the 8-wide ramp texture)', () => {
  for (const [name, r] of Object.entries(RAMPS)) {
    assert.ok(r.length >= 2 && r.length <= RAMP_W, name);
    for (const h of r) assert.match(h, /^#[0-9a-f]{6}$/, `${name} ${h}`);
  }
});

test('the palette is the one tuned in the game (spot checks)', () => {
  assert.equal(RAMPS.outline[0], '#120c10');
  assert.deepEqual(RAMPS.grass, ['#122614', '#1d3f1b', '#2f6024', '#4a842d', '#73a83a', '#a8cc52', '#dceb86']);
  assert.equal(RAMPS.gold[4], '#e8ae38');
  assert.equal(RAMP_ORDER.length, 35);
});

test('hexToRgb and rampHex / rampColor clamp to the ramp', () => {
  assert.deepEqual(hexToRgb('#120c10'), [0x12, 0x0c, 0x10]);
  assert.equal(rampHex('stone', -3), RAMPS.stone[0]);
  assert.equal(rampHex('stone', 99), RAMPS.stone[4]);
  assert.deepEqual(rampColor('stone', 0), hexToRgb(RAMPS.stone[0]));
  assert.deepEqual(rampColor('stone', 1), hexToRgb(RAMPS.stone[4]));
  assert.deepEqual(rampColor('stone', 0.5), hexToRgb(RAMPS.stone[2])); // nearest entry
  assert.deepEqual(rampColor('stone', 7), hexToRgb(RAMPS.stone[4]));
});

test('ramp texture: one row per ramp, short ramps repeat their last colour', () => {
  const { data, width, height } = rampTextureData();
  assert.equal(width, RAMP_W);
  assert.equal(height, RAMP_ORDER.length);
  const at = (row, i) => Array.from(data.slice((row * width + i) * 4, (row * width + i) * 4 + 4));
  const row = RAMP_ROW.outline;
  assert.deepEqual(at(row, 0), [...hexToRgb(RAMPS.outline[0]), 255]);
  assert.deepEqual(at(row, 7), [...hexToRgb(RAMPS.outline[1]), 255]);
  assert.equal(RAMP_LEN[RAMP_ROW.water], 7);
});
