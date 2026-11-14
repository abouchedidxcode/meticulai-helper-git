import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RAMPS } from '../src/palette.js';
import * as S from '../src/sprites.js';

// A fake canvas that records fillRect(x, y, 1, 1) calls, so the rasteriser runs in node without a DOM.
function fakeCanvas(w, h) {
  const px = new Array(w * h).fill(null);
  const ctx = {
    fillStyle: '#000000',
    fillRect(x, y, ww, hh) {
      for (let j = y; j < y + hh; j++) for (let i = x; i < x + ww; i++) if (i >= 0 && j >= 0 && i < w && j < h) px[j * w + i] = this.fillStyle;
    },
  };
  return { width: w, height: h, px, getContext: () => ctx };
}
S.setCanvasFactory(fakeCanvas);
const PALETTE = new Set(Object.values(RAMPS).flat());
const filled = (c) => c.px.filter(Boolean);

test('every sprite pixel is an exact palette colour', () => {
  const list = [S.beetle(1, 3, 1), S.grub(2), S.crystal(3, 'violet', 4, 1), S.organic(4), S.mushrooms(5), S.curio('snail', 1), S.butterfly(2), S.bird(1), S.leaf(3, 'autumn')];
  for (const sp of list) {
    const px = filled(sp.canvas);
    assert.ok(px.length > 4, 'sprite has pixels');
    for (const c of px) assert.ok(PALETTE.has(c), `not in palette: ${c}`);
  }
});

test('sprites are deterministic and cached by their arguments', () => {
  const a = S.mushrooms(9, 3);
  assert.equal(S.mushrooms(9, 3), a);
  S.clearSpriteCache();
  const b = S.mushrooms(9, 3);
  assert.notEqual(b, a);
  assert.deepEqual(b.canvas.px, a.canvas.px);
  assert.notDeepEqual(S.mushrooms(10, 3).canvas.px, a.canvas.px);
});

test('crystal stages remove prisms; anchors are as documented', () => {
  const full = S.crystal(5, 'rose', 4);
  const rock = S.crystal(5, 'rose', 0);
  assert.ok(filled(full.canvas).length > filled(rock.canvas).length);
  assert.deepEqual([full.ax, full.ay, full.canvas.width], [12, 15, 24]);
  const b = S.beetle(1, 0, 0);
  assert.deepEqual([b.ax, b.ay, b.canvas.width, b.canvas.height], [10.5, 10.5, 21, 21]);
});

test('custom sprite: ellipsoid gets a dark outline ring and a lit upper-left', () => {
  const sp = new S.Sprite(16, 16, 8, 8);
  sp.ellipsoid({ x: 0, y: 0, rx: 5, ry: 5, rz: 5, m: S.spriteMaterial('gold', 1, 5) });
  const c = sp.render();
  const at = (x, y) => c.px[y * 16 + x];
  // outline: just outside the disc on the shadow side (lower right) uses the darkest gold
  assert.equal(at(8, 13), RAMPS.gold[0]);
  // the upper-left of the body is brighter (later in the ramp) than the lower-right
  const idx = (h) => RAMPS.gold.indexOf(h);
  assert.ok(idx(at(6, 5)) > idx(at(10, 11)));
  // nothing outside the outline
  assert.equal(at(0, 0), null);
});
