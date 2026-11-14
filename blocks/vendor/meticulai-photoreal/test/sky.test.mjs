import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { analyse, pixelDir, polyHavenHdri, rotate, skyIrradiance } from '../src/photoreal/sky.js';

// A synthetic equirect sky: uniform blue-ish radiance with a tiny, very bright sun disk.
function makeSky(w, h, sunDir, { sky = [0.3, 0.4, 0.6], sun = [40000, 38000, 34000], sunAngle = 0.0087 } = {}) {
  const data = new Float32Array(w * h * 4);
  const d = new THREE.Vector3();
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = (r * w + c) * 4;
      pixelDir(c, r, w, h, d);
      const inSun = d.angleTo(sunDir) < sunAngle * 2;
      const src = inSun ? sun : sky;
      data[i] = src[0];
      data[i + 1] = src[1];
      data[i + 2] = src[2];
      data[i + 3] = 1;
    }
  }
  return data;
}

test('finds the sun in an HDRI: direction within a degree, measured colour, pixels to paint out', () => {
  const w = 512;
  const h = 256;
  const sunDir = new THREE.Vector3(Math.cos(0.7) * Math.cos(0.6), Math.sin(0.7), Math.cos(0.7) * Math.sin(0.6)).normalize();
  const data = makeSky(w, h, sunDir);
  const a = analyse(data, w, h);
  assert.equal(a.isSun, true);
  assert.ok(a.dir.angleTo(sunDir) < THREE.MathUtils.degToRad(1), `off by ${THREE.MathUtils.radToDeg(a.dir.angleTo(sunDir))}°`);
  assert.ok(a.sunPixels.length > 0);
  assert.ok(a.sunColor.x > a.sunColor.z, 'a warm sun stays warm');
  assert.ok(Math.abs(a.skyL - (0.2126 * 0.3 + 0.7152 * 0.4 + 0.0722 * 0.6)) < 1e-4);
});

test('an overcast sky (no disk 40x brighter than the sky) has no sun', () => {
  const data = makeSky(256, 128, new THREE.Vector3(0, 1, 0), { sun: [2, 2, 2] });
  assert.equal(analyse(data, 256, 128).isSun, false);
});

test('sky irradiance of a uniform sky is its radiance', () => {
  const data = makeSky(256, 128, new THREE.Vector3(0, -1, 0), { sun: [0.3, 0.4, 0.6] });
  const s = skyIrradiance(data, 256, 128);
  assert.ok(Math.abs(s.x - 0.3) < 1e-4 && Math.abs(s.y - 0.4) < 1e-4 && Math.abs(s.z - 0.6) < 1e-4);
});

test('rotating the sky moves the sun to a chosen azimuth (how setSky({ sunAzimuth }) works)', () => {
  const w = 512;
  const h = 256;
  const data = makeSky(w, h, new THREE.Vector3(1, 1, 0).normalize());
  const before = analyse(data, w, h);
  const want = 1.2;
  const turned = rotate(data, w, h, want - Math.atan2(before.dir.z, before.dir.x));
  const after = analyse(turned, w, h);
  assert.ok(Math.abs(Math.atan2(after.dir.z, after.dir.x) - want) < 0.02);
  assert.ok(Math.abs(after.dir.y - before.dir.y) < 1e-6, 'elevation unchanged');
});

test('Poly Haven HDRI URL', () => {
  assert.equal(
    polyHavenHdri('kloofendal_48d_partly_cloudy_puresky'),
    'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
  );
});
