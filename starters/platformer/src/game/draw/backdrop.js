// The backdrop: a painted sky and layers of scenery that slide past at different speeds (parallax),
// which is what gives a flat game its depth. Back to front:
//   sky      a gradient from look.sky (below -> horizon -> top) that fills the screen, with the sun
//   clouds   drift slowly on their own
//   far hills, mid hills, near hills with round trees: each layer a little darker and more saturated,
//            each moving a little more as the camera moves (0 = pinned to the screen, 1 = moves like the level)
//   motes    a few specks of light floating in front of everything
// Everything is tinted from the sky and the base colours, so a new palette.json repaints it all.
//
// Change the mood: edit LAYERS (heights, how much they move), or swap hills() for your own silhouette
// (a city, a forest, cave pillars). Each layer is one mesh.

import * as THREE from 'three';
import { createRandom } from '../../core/random.js';
import { Painter, flat } from './paint.js';

// move: share of the camera's movement the layer follows (higher = feels further away).
const LAYERS = [
  { move: 0.9, base: 5.2, height: 4.6, bump: 13, tint: 0.3, trees: 0, z: -80 },
  { move: 0.78, base: 3.6, height: 3.4, bump: 8, tint: 0.55, trees: 0, z: -70 },
  { move: 0.6, base: 2.4, height: 2.2, bump: 5.5, tint: 0.8, trees: 0.5, z: -60 },
];
const CLOUDS = 7;
const MOTES = 26;

export function createBackdrop(group, level, look, viewHeight) {
  const rand = createRandom(4242);
  const sky = look.sky;
  const maxHalfW = viewHeight * 1.6; // wide enough for very wide windows

  // --- sky: two stacked gradients in a 1 x 1 square, stretched over the view every frame
  const s = new Painter();
  s.gradient(-0.5, -0.5, 1, 0.42, sky.below, sky.horizon);
  s.gradient(-0.5, -0.08, 1, 0.58, sky.horizon, sky.top);
  const skyMesh = s.mesh({ depthWrite: false, depthTest: false });
  skyMesh.renderOrder = -10;
  skyMesh.frustumCulled = false;
  group.add(skyMesh);

  const sun = new THREE.Group();
  const sunGlow = new THREE.Mesh(new THREE.CircleGeometry(1, 40), flat(sky.sun, { transparent: true, opacity: 0.16, depthWrite: false }));
  sunGlow.scale.setScalar(2.3);
  sun.add(sunGlow, new THREE.Mesh(new THREE.CircleGeometry(1, 40), flat(look.mix(sky.sun, look.light, 0.3))));
  sun.children[1].position.z = 0.1;
  group.add(sun);

  // --- hills: a wavy strip per layer, paler at its foot (ground mist), sized to cover the whole level
  const layers = LAYERS.map((L, li) => {
    const top = look.mix(sky.horizon, look.mix(look.base[1], look.shadow, 0.35), L.tint);
    const foot = look.mix(top, sky.horizon, 0.45);
    const span = level.w * (1 - L.move) + maxHalfW * 2 + 8;
    const x0 = -maxHalfW - 4;
    const phase = [rand.range(0, 6), rand.range(0, 6), rand.range(0, 6)];
    const ridge = (x) => L.base + L.height * (0.5 + 0.32 * Math.sin(x / L.bump + phase[0]) + 0.18 * Math.sin(x / (L.bump * 0.43) + phase[1]) + 0.08 * Math.sin(x / (L.bump * 0.19) + phase[2]));
    const p = new Painter();
    const step = 0.6;
    for (let x = x0; x < x0 + span; x += step) {
      const a = ridge(x);
      const b = ridge(x + step);
      p.tri(x, -14, x + step, -14, x + step, b, foot, 0, foot, top);
      p.tri(x, -14, x + step, b, x, a, foot, 0, top, top);
    }
    if (L.trees > 0) {
      const leaf = look.mix(top, look.base[0], 0.35);
      const trunk = look.mix(top, look.shadow, 0.3);
      for (let x = x0 + 2; x < x0 + span - 2; x += rand.range(2.5, 7)) {
        const y = ridge(x) - 0.1;
        const h = rand.range(1.3, 2.4);
        p.rect(x - 0.09, y, 0.18, h, trunk, 0.01);
        p.circle(x, y + h + 0.3, rand.range(0.7, 1.05), leaf, 0.02, rand.range(0.8, 1.2), 14);
        p.circle(x + rand.range(-0.5, 0.5), y + h - 0.15, 0.6, leaf, 0.02, 0.55, 12);
      }
    }
    const mesh = p.mesh();
    mesh.frustumCulled = false;
    group.add(mesh);
    return { mesh, L, li };
  });

  // --- clouds: a few puffs each, drifting; they wrap round when they leave the screen
  const cloudColor = look.mix(sky.horizon, look.light, 0.55);
  const clouds = [];
  for (let i = 0; i < CLOUDS; i++) {
    const p = new Painter();
    const w = rand.range(2.2, 4.2);
    p.roundRect(0, 0, w, 0.7, 0.35, cloudColor);
    p.circle(-w * 0.18, 0.3, w * 0.22, cloudColor, 0, w * 0.17, 14);
    p.circle(w * 0.14, 0.38, w * 0.27, cloudColor, 0, w * 0.2, 14);
    const mesh = p.mesh({ transparent: true, opacity: 0.75, depthWrite: false });
    mesh.frustumCulled = false;
    group.add(mesh);
    clouds.push({ mesh, x: rand.range(0, 1), y: rand.range(0.18, 0.86), speed: rand.range(0.25, 0.6), depth: rand.range(0, 1) });
  }

  // --- motes: tiny lights floating in the near air
  const motes = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 8), flat(look.shade(look.light, 0.4), { transparent: true, opacity: 0.5, depthWrite: false }), MOTES);
  motes.frustumCulled = false;
  group.add(motes);
  const moteSeeds = Array.from({ length: MOTES }, () => [rand.range(0, 1), rand.range(0, 1), rand.range(0.5, 1.5), rand.range(0, 6.28)]);
  const m4 = new THREE.Matrix4();
  const wrap = (v, size) => ((v % size) + size) % size;

  return {
    // cam: { x, y, halfW, halfH } of the view this frame.
    update(cam, time) {
      skyMesh.position.set(cam.x, cam.y, -95);
      skyMesh.scale.set(cam.halfW * 2 + 2, cam.halfH * 2 + 2, 1);
      sun.position.set(cam.x + cam.halfW * 0.52, cam.y + cam.halfH * 0.5, -90);
      sun.scale.setScalar(cam.halfH * 0.13);
      const floorY = cam.y - cam.halfH; // hills sit on the bottom of the view and rise a little as you climb
      for (const { mesh, L } of layers) mesh.position.set(cam.x * L.move, floorY * (0.55 + L.move * 0.4), L.z);
      for (const c of clouds) {
        const span = cam.halfW * 2 + 10;
        const x = wrap(c.x * span + time * c.speed - cam.x * 0.06 * (1 + c.depth), span) - span / 2;
        c.mesh.position.set(cam.x + x, cam.y - cam.halfH + c.y * cam.halfH * 2.2, -85 + c.depth);
      }
      moteSeeds.forEach(([sx, sy, size, ph], i) => {
        const w = cam.halfW * 2 + 2;
        const h = cam.halfH * 2 + 2;
        const x = wrap(sx * w + time * 0.25 * size - cam.x * 1.15, w) - w / 2;
        const y = wrap(sy * h + Math.sin(time * 0.5 + ph) * 0.6 + time * 0.12 - cam.y * 1.1, h) - h / 2;
        const sc = 0.07 * size * (0.7 + 0.3 * Math.sin(time * 1.7 + ph));
        motes.setMatrixAt(i, m4.makeScale(sc, sc, 1).setPosition(cam.x + x, cam.y + y, 6));
      });
      motes.instanceMatrix.needsUpdate = true;
    },
  };
}
