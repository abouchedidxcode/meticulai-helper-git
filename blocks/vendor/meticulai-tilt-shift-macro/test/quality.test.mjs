import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUALITY, TILT_PREF, RES_MIN, LENS_DEFAULTS, TILT_SHOTS, shotCore, tiltCoc, coc, dofNumbers, createLensState, easeLens, settleLens,
  createPerfGovernor,
} from '../src/quality.js';

test('presets keep the shipped numbers', () => {
  assert.deepEqual(QUALITY.high, { pixelRatio: 1.5, shadow: 4096, shadowSpan: 50, msaa: 4, ao: true, dof: { max: 16, step: 2.2 }, bloom: true });
  assert.equal(QUALITY.medium.dof.half, true);
  assert.equal(QUALITY.medium.ao, false);
  assert.equal(QUALITY.low.msaa, 0);
  assert.equal(QUALITY.low.shadowEvery, 2);
  assert.equal(QUALITY.low.bloom, false);
  assert.deepEqual(TILT_PREF, { off: 0, on: 1, strong: 1.35 });
  assert.equal(RES_MIN, 0.65);
  assert.equal(LENS_DEFAULTS.aperturePx, 125);
  assert.equal(LENS_DEFAULTS.bloom.threshold, 2.2);
});

test('dofNumbers scales with resolution and caps the tilt blur', () => {
  const n = dofNumbers(QUALITY.high.dof, 1080, 1, 1);
  assert.equal(n.maxBlur, 16);
  assert.equal(n.aperturePx, 125);
  assert.equal(n.radScale, 2.2);
  assert.equal(n.tiltPx, 11);
  assert.ok(Math.abs(n.lod - (Math.log2(Math.sqrt(2 * Math.PI * 2.2)) - 0.5)) < 1e-12);
  const big = dofNumbers(QUALITY.high.dof, 2160, 1, 1.6);
  assert.equal(big.maxBlur, 32);
  assert.equal(big.tiltPx, 32); // min(16, 17.6) * 2
  const small = dofNumbers(QUALITY.low.dof, 540, 0.5, 1);
  assert.equal(small.radScale, 2.8); // never below the preset step
  assert.equal(small.aperturePx, 31.25);
});

test('tilt band: sharp inside the core, full blur past the ramp, asymmetric ramps', () => {
  const band = { y: 0, core: 0.1, blurPx: 11, roll: 0, up: 0.85, down: 0.5 };
  assert.equal(tiltCoc(0.5, 0.5, band, 16 / 9), 0);
  assert.equal(tiltCoc(0.5, 0.54, band, 16 / 9), 0); // ndc y 0.08 < core
  assert.equal(tiltCoc(0.5, 1.0, band, 16 / 9), 11); // ndc y 1: (1-0.1)/0.85 > 1
  const above = tiltCoc(0.5, 0.75, band, 1); // d = 0.5 -> t = 0.47
  const below = tiltCoc(0.5, 0.25, band, 1); // d = 0.5 -> t = 0.8
  assert.ok(below > above, 'the lower ramp is shorter, so blur grows faster below the band');
  // A rolled band: a point beside the centre is no longer on the band axis.
  const rolled = { ...band, roll: Math.PI / 2 };
  assert.ok(tiltCoc(0.9, 0.5, rolled, 1) > 0);
});

test('coc: foreground gentler than background, clamped, tilt wins when larger', () => {
  const bg = coc(20, 10, 125, 0.45, 0, 16);
  const fg = coc(10 / 1.5, 10, 125, 0.45, 0, 16); // same |1/f - 1/z| as z = 20
  assert.ok(Math.abs(fg - bg * 0.45) < 1e-9);
  assert.equal(coc(1000, 10, 125, 0.45, 0, 16), 12.375);
  assert.equal(coc(1, 10, 125, 0.45, 0, 16), 16);
  assert.equal(coc(10, 10, 125, 0.45, 7, 16), 7);
});

test('easeLens: eases toward targets, snaps big band jumps, applies the tilt preference', () => {
  const s = createLensState();
  s.focusTarget = 20;
  s.yT = 0.1; // small move from -0.2: eased
  s.amtT = 1;
  easeLens(s, 1 / 60, 1.35);
  assert.ok(s.focus > 10 && s.focus < 20);
  assert.ok(s.y > -0.2 && s.y < 0.1);
  assert.ok(s.amt > 0 && s.amt < 1.35);
  s.yT = 0.9; // jump > 0.5: snapped
  easeLens(s, 1 / 60, 1);
  assert.equal(s.y, 0.9);
  for (let i = 0; i < 600; i++) easeLens(s, 1 / 60, 1.35);
  assert.ok(Math.abs(s.amt - 1.35) < 1e-3);
  settleLens(s, 0);
  assert.equal(s.amt, 0);
});

test('shot table: subject-sized bands', () => {
  assert.equal(shotCore(TILT_SHOTS.establishing), 0.11);
  assert.ok(Math.abs(shotCore(TILT_SHOTS.play, 0.1) - 0.21) < 1e-12);
  assert.equal(TILT_SHOTS.diorama.aperture, 10.5);
});

function feed(g, dt, frames, t0, step = 16) {
  let t = t0;
  const actions = [];
  for (let i = 0; i < frames; i++) {
    t += step;
    const a = g.tick(dt, t);
    if (a) actions.push({ ...a, t });
  }
  return { t, actions };
}

test('governor: holds still when frames are on budget', () => {
  const g = createPerfGovernor({ now: 0 });
  const { actions } = feed(g, 1 / 60, 600, 0);
  assert.equal(actions.length, 0);
  assert.equal(g.resScale, 1);
});

test('governor: slow frames step resolution down x0.87 to RES_MIN, then drop a preset', () => {
  const g = createPerfGovernor({ quality: 'high', now: 0 });
  const { actions } = feed(g, 1 / 30, 2000, 0, 33);
  const res = actions.filter((a) => a.type === 'res');
  assert.ok(Math.abs(res[0].scale - 0.87) < 1e-12);
  const q = actions.find((a) => a.type === 'quality');
  assert.ok(q, 'drops a whole preset');
  assert.equal(q.quality, 'medium');
  const before = res.filter((a) => a.t < q.t);
  assert.ok(before[before.length - 1].scale <= RES_MIN + 0.01, 'only at the lowest scale (3 steps: 0.87^3 = 0.66)');
  assert.equal(before.length, 3);
  assert.equal(q.scale, 0.87);
});

test('governor: ignores the slowest tenth (hitches)', () => {
  const g = createPerfGovernor({ now: 0 });
  let t = 0;
  let acted = false;
  for (let i = 0; i < 900; i++) {
    t += 16;
    if (g.tick(i % 12 === 0 ? 0.1 : 1 / 60, t)) acted = true; // one 100 ms hitch in 12 frames
  }
  assert.equal(acted, false);
});

test('governor: reports sustained slowness once at the lowest preset, and recovers resolution with headroom', () => {
  const g = createPerfGovernor({ quality: 'low', now: 0 });
  g.resScale = RES_MIN;
  const slow = feed(g, 1 / 25, 1500, 0, 40).actions.filter((a) => a.type === 'slow');
  assert.equal(slow.length, 1);
  const g2 = createPerfGovernor({ now: 0 });
  g2.resScale = 0.75;
  const up = feed(g2, 1 / 90, 1200, 0, 11).actions.filter((a) => a.type === 'res');
  assert.ok(up.length >= 1 && Math.abs(up[0].scale - 0.75 / 0.87) < 1e-12);
  assert.ok(up.every((a) => a.scale <= 1));
});

test('governor: frame budget change resets the window; adaptive false does nothing', () => {
  const g = createPerfGovernor({ now: 0, adaptive: false });
  assert.equal(feed(g, 0.1, 500, 0).actions.length, 0);
  g.setFrameBudget(1 / 30, true, 0);
  assert.equal(g.adaptive, true);
  assert.equal(feed(g, 1 / 30, 500, 0).actions.length, 0); // 1/30 is on budget now
});
