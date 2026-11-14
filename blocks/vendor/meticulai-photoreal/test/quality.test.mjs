import test from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY, pickQuality } from '../src/photoreal/quality.js';

test('?q= forces a preset; an unknown one is ignored', () => {
  assert.equal(pickQuality({ search: '?q=ultra', userAgent: 'iPhone', cores: 2 }), 'ultra');
  assert.equal(pickQuality({ search: '?q=potato', userAgent: 'Desktop', cores: 16 }), 'high');
});

test('phones get low; desktops pick by CPU cores', () => {
  assert.equal(pickQuality({ search: '', userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile', cores: 8 }), 'low');
  assert.equal(pickQuality({ search: '', userAgent: 'Mozilla/5.0 (Macintosh)', cores: 8 }), 'high');
  assert.equal(pickQuality({ search: '', userAgent: 'Mozilla/5.0 (Windows NT 10.0)', cores: 4 }), 'medium');
});

test('presets climb in cost from low to ultra', () => {
  const order = ['low', 'medium', 'high', 'ultra'];
  for (let i = 1; i < order.length; i++) {
    const a = QUALITY[order[i - 1]];
    const b = QUALITY[order[i]];
    assert.ok(b.ssr >= a.ssr && b.shadowSize >= a.shadowSize && b.probeSize >= a.probeSize && b.maxPixelRatio >= a.maxPixelRatio);
  }
  assert.equal(QUALITY.low.ssr, 0);
  assert.equal(QUALITY.low.dof, null);
  assert.equal(QUALITY.low.motionBlur, 0);
});
