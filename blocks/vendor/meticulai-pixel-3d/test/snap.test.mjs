import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PPU, ZOOMS, pixelScale, artTarget, zoomFor, snapToGrid, blitWindow, followFactor, snapSprite } from '../src/snap.js';

test('game defaults', () => {
  assert.equal(PPU, 12);
  assert.deepEqual(ZOOMS, [1, 2, 3, 4, 5, 6]);
});

test('pixel scale is a whole number >= 1', () => {
  assert.equal(pixelScale(3, 1), 3);
  assert.equal(pixelScale(3, 2), 6);
  assert.equal(pixelScale(1, 0.5), 1);
  assert.equal(pixelScale(2, 1.25), 3);
});

test('art target covers the screen with 2 spare pixels and even sizes', () => {
  const t = artTarget(1280, 720, 4, 1);
  assert.deepEqual([t.k, t.tw, t.th, t.visW, t.visH], [4, 322, 182, 320, 180]);
  const odd = artTarget(1281, 721, 3, 1);
  assert.equal(odd.tw % 2, 0);
  assert.equal(odd.th % 2, 0);
  assert.ok(odd.tw >= Math.ceil(1281 / 3) + 2);
});

test('zoomFor picks the zoom whose visible height is closest', () => {
  // 720 device px tall: zoom 1 shows 60 units, 2 -> 30, 3 -> 20, 4 -> 15, 5 -> 12, 6 -> 10
  assert.equal(zoomFor(20, 720), 3);
  assert.equal(zoomFor(14, 720), 4);
  assert.equal(zoomFor(1000, 720), 1);
  assert.equal(zoomFor(1, 720), 6);
});

test('snapToGrid splits into whole art pixels and a 0..1 remainder', () => {
  const s = snapToGrid(1.0 + 0.5 / 12, -0.25 / 12);
  assert.equal(s.pxX, 12);
  assert.equal(s.pxY, -1);
  assert.ok(Math.abs(s.fx - 0.5) < 1e-9);
  assert.ok(Math.abs(s.fy - 0.75) < 1e-9);
  assert.ok(Math.abs(s.ox * 12 + s.fx - (1.0 + 0.5 / 12) * 12) < 1e-9);
});

test('blit window is centred and shifted by the remainder', () => {
  const b = blitWindow(322, 182, 320, 180, 0, 0);
  assert.ok(Math.abs(b.scaleX - 320 / 322) < 1e-12);
  assert.ok(Math.abs(b.offsetX - 1 / 322) < 1e-12);
  const b2 = blitWindow(322, 182, 320, 180, 0.5, 0.25);
  assert.ok(Math.abs(b2.offsetX - b.offsetX - 0.5 / 322) < 1e-12);
  assert.ok(Math.abs(b2.offsetY - b.offsetY - 0.25 / 182) < 1e-12);
});

test('follow easing is frame-rate independent', () => {
  const one = followFactor(1 / 30);
  const two = 1 - (1 - followFactor(1 / 60)) ** 2;
  assert.ok(Math.abs(one - two) < 1e-12);
  assert.ok(Math.abs(followFactor(1 / 60) - (1 - Math.exp(-8 / 60))) < 1e-12);
});

test('sprites land on whole art pixels', () => {
  const s = snapSprite(1.03, 2.0, 10, 15, 26, 16);
  assert.equal(s.left, Math.round(1.03 * 12 - 10));
  assert.equal(s.top, 24 + 15);
  // left edge of the quad in art px is an integer
  const leftPx = s.u * 12 - 26 / 2;
  assert.ok(Math.abs(leftPx - Math.round(leftPx)) < 1e-9);
});
