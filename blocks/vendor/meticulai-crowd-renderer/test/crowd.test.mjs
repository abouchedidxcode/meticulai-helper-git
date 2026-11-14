import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCrowd, F } from '../src/crowd.js';
import { buildHorse, buildArcher, buildKnight } from '../src/standin.js';
import { createHerd } from '../src/herd.js';
import { DEFAULT_GAITS, inIntervals } from '../src/locomotion.js';
import { leadFromModel, gaitRows, writeHorse } from '../src/herd-draw.js';

async function setup() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 3000);
  camera.position.set(0, 2, 0); camera.lookAt(0, 2, 10); camera.updateMatrixWorld();
  const crowd = createCrowd({ scene, camera });
  const horse = await crowd.register('horse', buildHorse());
  const archer = await crowd.register('archer', buildArcher());
  return { scene, camera, crowd, horse, archer };
}

test('a code-built horse bakes into a bone texture with its clips and tracked bones', async () => {
  const { horse } = await setup();
  assert.deepEqual(Object.keys(horse.clips), ['idle', 'walk', 'trot', 'canter', 'gallop', 'graze']);
  assert.equal(horse.tex.image.width, (horse.bones + 1) * 3);
  assert.equal(horse.tex.image.height, horse.rows);
  for (const b of ['seat', 'head', 'hoof_fl', 'hoof_fr', 'hoof_hl', 'hoof_hr']) assert.ok(horse.tracked[b], b);
  assert.equal(horse.lods.length, 4, 'three authored LODs and a far one made at load');
  const tris = horse.lods.map((l) => l.reduce((s, p) => s + p.tris, 0));
  assert.ok(tris[0] > tris[1] && tris[1] > tris[2] && tris[2] > tris[3], 'each LOD is lighter: ' + tris);
  const seat = horse.sample('seat', horse.row('idle', 0), new Float32Array(12));
  assert.ok(Math.abs(seat[7] - 1.385) < 0.02, 'the saddle is about 1.39 m up');
});

test('planted hooves of the stand-in move straight back one stride per cycle (no slide in the clips themselves)', async () => {
  const { horse } = await setup();
  for (const g of ['walk', 'trot', 'canter', 'gallop']) {
    const c = horse.clips[g], m = horse.meta.clips[g];
    for (const h of ['hoof_fl', 'hoof_fr', 'hoof_hl', 'hoof_hr']) {
      const tr = horse.tracked[h], [[a, b]] = m.contacts[h]; let x0, z0, worst = 0;
      for (let k = 0; k <= 40; k++) {
        const ph = a + (b - a) * k / 40, row = c.row + (ph - Math.floor(ph)) * c.n, y = Math.floor(row), f = row - y, i0 = y * 12, i1 = i0 + 12;
        const x = tr[i0 + 3] + (tr[i1 + 3] - tr[i0 + 3]) * f, z = tr[i0 + 11] + (tr[i1 + 11] - tr[i0 + 11]) * f + m.stride * ph;
        if (k === 0) { x0 = x; z0 = z; } else worst = Math.max(worst, Math.hypot(x - x0, z - z0));
      }
      assert.ok(worst < 0.004, `${g} ${h}: ${(worst * 1000).toFixed(1)} mm`);
    }
  }
});

test('LOD by distance, with hysteresis; culling; show = 2 casts a shadow only', async () => {
  const { crowd, camera } = await setup();
  const set = crowd.createSet('horse', 4); set.count = 4;
  set.set(0, { x: 0, y: 0, z: 40, yaw: 0, clip: 'walk', phase: 0 });        // in view, 40 m
  set.set(1, { x: 0, y: 0, z: -40, yaw: 0, clip: 'walk', phase: 0 });       // behind the camera
  set.set(2, { x: 0, y: 0, z: 5, yaw: 0, clip: 'idle', phase: 0 });         // close
  set.set(3, { x: 2, y: 0, z: 20, yaw: 0, clip: 'idle', phase: 0, show: 2 }); // shadow only
  for (let k = 0; k < 4; k++) crowd.prepare();
  assert.equal(set.lodOf[0], 1); assert.equal(set.lodOf[2], 0);
  assert.equal(crowd.stats.drawn, 2, 'behind the camera and shadow-only are not drawn');
  assert.ok(crowd.stats.shadow >= 3, 'but they cast shadows');
  set.set(0, { x: 0, y: 0, z: 47 }); crowd.prepare();
  assert.equal(set.lodOf[0], 1, 'just past the 45 m boundary it stays (no flicker)');
  set.set(0, { x: 0, y: 0, z: 52 }); crowd.prepare();
  assert.equal(set.lodOf[0], 2);
  crowd.cost.far = 30; crowd.prepare();
  assert.equal(crowd.stats.drawn, 1, 'nothing beyond cost.far');
});

test('set() writes the 24-float record: rows, blend, bend, tints', async () => {
  const { crowd, horse } = await setup();
  const set = crowd.createSet('horse', 2); set.count = 1;
  set.set(0, { x: 1, y: 2, z: 3, yaw: Math.PI / 2, scale: 1.1, clip: 'walk', phase: 0.25, clipB: 'trot', phaseB: 0.5, blend: 0.3, curve: 0.05, tint: [0.5, 0.4, 0.3], hair: 0.6 });
  const b = set.buf;
  assert.deepEqual([b[F.X], b[F.Y], b[F.Z], +b[F.SCALE].toFixed(3)], [1, 2, 3, 1.1]);
  assert.ok(Math.abs(b[F.ROW_A] - horse.row('walk', 0.25)) < 1e-4);
  assert.ok(Math.abs(b[F.ROW_B] - horse.row('trot', 0.5)) < 1e-4);
  assert.ok(Math.abs(b[F.W_A] - 0.7) < 1e-6);
  assert.ok(Math.abs(b[F.CURVE - 3] - 0.05) < 1e-7, 'b1 (curvature) at offset 12 for a horse');
  assert.ok(Math.abs(b[F.QY] - Math.sin(Math.PI / 4)) < 1e-6);
  assert.ok(Math.abs(b[F.TINT_A] - 0.5) < 1e-6 && Math.abs(b[F.RIDER_SCALE] - 0.6) < 1e-6);
});

test('a herd under the law writes horse and rider; the rider carries the horse\'s clip state', async () => {
  const { crowd, horse, archer } = await setup();
  const hs = crowd.createSet('horse', 3), rs = crowd.createSet('archer', 3, { mount: 'horse' });
  const lead = leadFromModel(horse);
  assert.ok(lead > 0.85 && lead < 1.05, 'forehand reach ' + lead);
  const herd = createHerd({ capacity: 3, lead });
  const i = herd.add({ x: 0, z: 0, yaw: 0 });
  for (let k = 0; k < 400; k++) herd.step(i, herd.S.yaw[i] + 0.5, 8, 1 / 60);
  writeHorse(herd, i, hs, gaitRows(horse), 0, 0, 0, rs, archer.row('ride', 0.3), 0);
  const o = 0, hb = hs.buf, rb = rs.buf;
  assert.equal(rb[o + F.X], hb[o + F.X]); assert.equal(rb[o + F.Z], hb[o + F.Z]);
  assert.equal(rb[o + F.M_ROW_A], hb[o + F.ROW_A]); assert.equal(rb[o + F.M_W_A], hb[o + F.W_A]);
  assert.equal(rb[o + F.CURVE], hb[o + 12]);
  assert.ok(hb[o + 12] > 0.01, 'the body bends in the turn');
  const g = herd.S.gait[i]; assert.ok(g >= 3, 'cantering or galloping');
});

test('rider models: an archer and a knight, both glued at the seat point', async () => {
  const archer = buildArcher(), knight = buildKnight();
  for (const m of [archer, knight]) {
    const names = []; m.root.traverse((o) => { if (o.isSkinnedMesh) names.push(o.name); });
    assert.deepEqual(names.sort(), [m.name + '_lod0', m.name + '_lod1', m.name + '_lod2']);
    assert.ok(m.clips.some((c) => c.name === 'ride'));
  }
  assert.ok(archer.clips.some((c) => c.name === 'draw_fwd') && knight.clips.some((c) => c.name === 'charge'));
  const dest = buildHorse({ name: 'destrier', scale: 1.17, heavy: true, gaits: DEFAULT_GAITS });
  assert.ok(Math.abs(dest.meta.clips.gallop.stride - 5.2 * 1.17) < 1e-9);
  assert.ok(inIntervals(0.1, dest.meta.clips.walk.contacts.hoof_hl));
});
