// Everything you see that you cannot touch: sky and light (from the palette), the deepening dusk,
// the ground, grass that sways, far trees and hills for depth, and fireflies.
// Nothing here affects play. Change it freely to restyle the place.
//
// Colours: all from `look` by role (see core/look.js). The dusk is the same palette pulled toward
// its shadow colour, so any palette gets its own evening.

import * as THREE from 'three';
import { createRandom } from '../core/random.js';
import { createAtmosphere } from '../render/atmosphere.js';
import { MAP, LEGEND, SIZE, cellX, cellZ, CELL } from './level.js';

// A soft round dot (a white mask; the material gives it its colour). Used for glows and fireflies.
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export function buildScenery(scene, look, focus) {
  const rand = createRandom(4242); // fixed: decoration never shifts gameplay
  const air = createAtmosphere(scene, { look, far: 120, shadows: { size: 2048, area: 26, far: 90 }, focus });
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });

  // Ground: one big disc, with darker patches so it is not a flat carpet.
  const ground = new THREE.Mesh(new THREE.CircleGeometry(170, 40), new THREE.MeshLambertMaterial({ color: look.base[0] }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const patches = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 9), new THREE.MeshLambertMaterial({ color: look.mix(look.base[0], look.base[1], 0.7) }), 70);
  for (let i = 0; i < patches.count; i++) {
    const s = rand.range(0.8, 2.6);
    m.compose(new THREE.Vector3(rand.range(-0.5, 0.5) * SIZE.width, 0.004 + i * 0.00005, rand.range(-0.5, 0.5) * SIZE.depth), q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rand.range(0, 6))), new THREE.Vector3(s, s * rand.range(0.5, 1), 1));
    patches.setMatrixAt(i, m);
  }
  patches.receiveShadow = true;
  scene.add(patches);

  // Grass tufts on the grass squares; they sway in the vertex shader (no per-frame work in JS).
  const wind = { value: 0 };
  const grassMat = new THREE.MeshLambertMaterial({ flatShading: true });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = `uniform float uWind;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
         float phase = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 0.7;
         float bend = max(position.y + 0.5, 0.0);
         transformed.x += sin(uWind * 1.7 + phase) * 0.22 * bend * bend;
         transformed.z += cos(uWind * 1.3 + phase * 1.3) * 0.12 * bend * bend;
       #endif`,
    );
  };
  const spots = [];
  MAP.forEach((row, cz) => [...row].forEach((ch, cx) => {
    const def = LEGEND[ch];
    if (def.floor || def.solid) return;
    for (let i = 0; i < 5; i++) spots.push({ x: cellX(cx) + rand.range(-0.5, 0.5) * CELL, z: cellZ(cz) + rand.range(-0.5, 0.5) * CELL });
  }));
  const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 1, 4, 1, true), grassMat, spots.length);
  spots.forEach((s, i) => {
    const h = rand.range(0.25, 0.6);
    m.compose(new THREE.Vector3(s.x, h / 2, s.z), q.setFromAxisAngle(up, rand.range(0, 6)), new THREE.Vector3(rand.range(0.7, 1.5), h, rand.range(0.7, 1.5)));
    grass.setMatrixAt(i, m);
    grass.setColorAt(i, col.set(look.mix(look.base[0], rand.chance(0.3) ? look.light : look.base[1], rand.range(0.1, 0.45))));
  });
  grass.receiveShadow = true;
  scene.add(grass);

  // Far depth: dark trees standing beyond the wall, and a ring of hills on the horizon.
  const treeCol = look.mix(look.base[1], look.shadow, 0.6);
  const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), lambert(treeCol), 46);
  for (let i = 0; i < trees.count; i++) {
    const a = (i / trees.count) * Math.PI * 2 + rand.range(-0.05, 0.05);
    const r = Math.max(SIZE.width, SIZE.depth) * rand.range(0.62, 0.95);
    const h = rand.range(7, 13);
    m.compose(new THREE.Vector3(Math.cos(a) * r * 1.05, h / 2 + 0.5, Math.sin(a) * r * 0.9), q.setFromAxisAngle(up, rand.range(0, 6)), new THREE.Vector3(rand.range(1.8, 2.8), h, rand.range(1.8, 2.8)));
    trees.setMatrixAt(i, m);
    trees.setColorAt(i, col.set(look.shade(treeCol, rand.range(-0.12, 0.1))));
  }
  scene.add(trees);
  const hillGeo = new THREE.CylinderGeometry(105, 108, 1, 40, 1, true);
  const hp = hillGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const a = Math.atan2(hp.getZ(i), hp.getX(i));
    hp.setY(i, hp.getY(i) > 0 ? 9 + Math.sin(a * 3) * 4 + Math.sin(a * 7 + 1) * 3 + Math.sin(a * 13 + 2) * 1.5 : -1);
  }
  hillGeo.computeVertexNormals();
  const hills = new THREE.Mesh(hillGeo, new THREE.MeshLambertMaterial({ color: look.mix(look.base[1], look.shadow, 0.75), flatShading: true, side: THREE.BackSide }));
  scene.add(hills);

  // Fireflies: a little life in the air.
  const flies = Array.from({ length: 36 }, () => ({ x: rand.range(-0.5, 0.5) * SIZE.width, y: rand.range(0.5, 2.6), z: rand.range(-0.5, 0.5) * SIZE.depth, p: rand.range(0, 6), s: rand.range(0.3, 0.8) }));
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(flies.length * 3), 3));
  const flyPoints = new THREE.Points(flyGeo, new THREE.PointsMaterial({ map: glowTexture(), color: look.light, size: 0.28, transparent: true, opacity: 0.9, depthWrite: false }));
  flyPoints.frustumCulled = false;
  scene.add(flyPoints);

  // The dusk: the palette pulled toward its shadow colour. amount 0 = as the palette says, 1 = deepest.
  let lastDusk = -1;
  function setDusk(amount) {
    if (Math.abs(amount - lastDusk) < 0.004) return;
    lastDusk = amount;
    const L = look.lighting;
    const dark = look.shade(look.shadow, -0.45);
    air.set({
      lighting: {
        ...L,
        sun: look.mix(L.sun, look.shadow, amount * 0.5),
        sunStrength: L.sunStrength * (1 - 0.8 * amount),
        ambient: look.mix(L.ambient, look.shadow, amount * 0.5),
        ambientStrength: L.ambientStrength * (1 - 0.5 * amount),
        ground: look.mix(L.ground, dark, amount * 0.5),
        fog: look.mix(L.fog, dark, amount * 0.6),
      },
      sky: {
        top: look.mix(look.sky.top, dark, amount * 0.7),
        horizon: look.mix(look.sky.horizon, look.shadow, amount * 0.65),
        below: look.mix(look.sky.below, dark, amount * 0.5),
        sun: look.sky.sun,
      },
    });
  }
  setDusk(0);

  return {
    air,
    setDusk,
    animate(time) {
      wind.value = time;
      const arr = flyGeo.attributes.position.array;
      flies.forEach((f, i) => {
        arr[i * 3] = f.x + Math.sin(time * f.s + f.p) * 1.4;
        arr[i * 3 + 1] = f.y + Math.sin(time * f.s * 1.7 + f.p * 2) * 0.5;
        arr[i * 3 + 2] = f.z + Math.cos(time * f.s * 0.8 + f.p) * 1.4;
      });
      flyGeo.attributes.position.needsUpdate = true;
    },
  };
}
