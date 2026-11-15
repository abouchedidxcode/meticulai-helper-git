// Draws the level's tiles. You type letters; this file makes them look composed:
//   ground (#)   a grass cap with a bright lip wherever there is air above, a dark underside where it
//                hangs, darker earth the deeper inside it is, a few pebbles, swaying grass tufts
//   block (=)    a bevelled stone with a lighter top edge
//   one-way (-)  a thin plank on brackets (thin = "you can pass through this")
//   spikes (^)   teeth in the danger colour: the ONLY place besides enemies that colour appears
// Every rectangle of every tile goes into ONE instanced mesh, so a whole level is one draw call
// (plus one for spikes and one for grass tufts).
//
// To add a tile: add its drawing as a `case` in the loop below (use q(...) for rectangles), and its
// rules in levels.js (TILES + LEGEND). To use a tileset image instead, see STARTER.md.

import * as THREE from 'three';
import { TILES } from '../levels.js';
import { Painter, col, flat, hash } from './paint.js';

const Z = { body: 0, detail: 0.02, cap: 0.04, lip: 0.06, spikes: 0.08, tufts: 0.1 };

export function buildTiles(group, level, look) {
  const quads = []; // [x, y, w, h, colour, z] with x, y = bottom-left
  const q = (x, y, w, h, color, z = Z.detail) => quads.push([x, y, w, h, color, z]);
  const spikes = [];
  const tufts = [];

  const grass = look.base[0];
  const grassLip = look.mix(look.shade(grass, 0.18), look.light, 0.22); // the bright line that shows where you can stand
  const earth = look.base[1];
  const earthDeep = look.mix(look.base[1], look.shadow, 0.5);
  const earthEdge = look.mix(look.base[1], look.shadow, 0.35);
  const stone = look.base[2];
  const stoneLight = look.shade(look.base[2], 0.16);
  const stoneDark = look.mix(look.base[2], look.shadow, 0.4);
  const plank = look.shade(look.base[3], 0.1);
  const plankDark = look.mix(look.base[3], look.shadow, 0.45);

  const is = (cx, cy, kind) => level.tile(cx, cy) === TILES[kind].id;
  const solid = (cx, cy) => level.solid(cx, cy) && cx >= 0 && cx < level.w;
  const open = (cx, cy) => !level.solid(cx, cy); // air, or something you can pass through

  for (let cy = 0; cy < level.h; cy++) {
    for (let cx = 0; cx < level.w; cx++) {
      const t = level.tile(cx, cy);
      const r = hash(cx, cy);
      if (t === TILES.ground.id) {
        // How far below the surface is this tile? (0 = it is the surface.) Deeper = darker.
        let depth = 0;
        while (depth < 4 && solid(cx, cy + depth + 1)) depth++;
        const top = open(cx, cy + 1);
        q(cx, cy, 1, 1, look.shade(look.mix(earth, earthDeep, Math.min(1, depth / 3.5)), (r - 0.5) * 0.05), Z.body);
        if (r > 0.72 && !top) q(cx + 0.15 + r * 0.4, cy + 0.2 + hash(cy, cx) * 0.5, 0.2, 0.13, look.mix(earth, stone, 0.5)); // a pebble
        if (open(cx, cy - 1) && cy > 0) q(cx, cy, 1, 0.16, look.mix(earthDeep, look.shadow, 0.5));
        if (open(cx - 1, cy)) q(cx, cy, 0.1, 1, earthEdge);
        if (open(cx + 1, cy)) q(cx + 0.9, cy, 0.1, 1, earthEdge);
        if (top) {
          const l = open(cx - 1, cy) ? 0.08 : 0; // the cap hangs a little over an exposed side
          const rr = open(cx + 1, cy) ? 0.08 : 0;
          q(cx - l, cy + 0.72, 1 + l + rr, 0.3, grass, Z.cap);
          q(cx - l, cy + 0.94, 1 + l + rr, 0.08, grassLip, Z.lip);
          q(cx + 0.1 + r * 0.5, cy + 0.58, 0.2, 0.16, grass, Z.cap); // grass hanging down, to break the line
          if (r > 0.4) q(cx + 0.62 + r * 0.2, cy + 0.63, 0.13, 0.1, grass, Z.cap);
          if (!level.hazard(cx, cy + 1) && hash(cx, 7) > 0.45) tufts.push([cx + 0.2 + hash(cx, 3) * 0.6, cy + 1, 0.7 + hash(cx, 5) * 0.6]);
        }
      } else if (t === TILES.block.id) {
        q(cx, cy, 1, 1, look.shade(stone, (r - 0.5) * 0.06), Z.body);
        q(cx + 0.12, cy + 0.12, 0.76, 0.76, look.shade(stone, 0.06 + (r - 0.5) * 0.05)); // the raised face
        if (!is(cx, cy + 1, 'block')) q(cx, cy + 0.88, 1, 0.12, stoneLight, Z.cap);
        if (!is(cx, cy - 1, 'block')) q(cx, cy, 1, 0.12, stoneDark, Z.cap);
        if (!is(cx - 1, cy, 'block') && !solid(cx - 1, cy)) q(cx, cy, 0.08, 1, stoneDark);
        if (!is(cx + 1, cy, 'block') && !solid(cx + 1, cy)) q(cx + 0.92, cy, 0.08, 1, stoneDark);
      } else if (t === TILES.oneway.id) {
        q(cx, cy + 0.76, 1, 0.24, plank, Z.cap);
        q(cx, cy + 0.94, 1, 0.06, look.shade(plank, 0.2), Z.lip);
        q(cx, cy + 0.7, 1, 0.06, plankDark, Z.cap);
        if (!is(cx - 1, cy, 'oneway')) q(cx + 0.08, cy + 0.42, 0.12, 0.3, plankDark);
        if (!is(cx + 1, cy, 'oneway')) q(cx + 0.8, cy + 0.42, 0.12, 0.3, plankDark);
      } else if (t === TILES.spike.id) {
        spikes.push([cx, cy]);
      }
    }
  }

  // --- one instanced mesh for every rectangle
  const m4 = new THREE.Matrix4();
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), flat('#ffffff'), Math.max(1, quads.length));
  quads.forEach(([x, y, w, h, color, z], i) => {
    m4.makeScale(w, h, 1).setPosition(x + w / 2, y + h / 2, z);
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col(color));
  });
  mesh.count = quads.length;
  mesh.frustumCulled = false; // it spans the whole level
  group.add(mesh);

  // --- spikes: three teeth on a dark foot, with a pale tip so they read as sharp on any background
  if (spikes.length) {
    const p = new Painter();
    const tip = look.shade(look.danger, 0.45);
    const foot = look.mix(look.danger, look.shadow, 0.55);
    p.rect(0.04, 0, 0.92, 0.12, foot);
    for (let i = 0; i < 3; i++) {
      const x = 0.07 + i * 0.3;
      p.tri(x, 0.1, x + 0.26, 0.1, x + 0.13, 0.66, look.danger, 0.01);
      p.tri(x + 0.085, 0.47, x + 0.175, 0.47, x + 0.13, 0.66, tip, 0.02);
    }
    const sm = new THREE.InstancedMesh(p.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }), spikes.length);
    spikes.forEach(([x, y], i) => sm.setMatrixAt(i, m4.makeTranslation(x, y, Z.spikes)));
    sm.frustumCulled = false;
    group.add(sm);
  }

  // --- grass tufts that sway (a tiny shader moves the tips; the roots stay put)
  let tuftMaterial = null;
  if (tufts.length) {
    const g = new THREE.BufferGeometry();
    const pos = [];
    const uv = [];
    for (const [x, lean, h] of [[-0.12, -0.07, 0.2], [0, 0.02, 0.3], [0.12, 0.08, 0.22]]) {
      pos.push(x - 0.05, 0, 0, x + 0.05, 0, 0, x + lean, h, 0);
      uv.push(0, 0, 1, 0, 0.5, 1);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    tuftMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: col(look.shade(grass, 0.12)).clone() } },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform float uTime;
        void main() {
          vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
          world.x += sin(uTime * 1.7 + world.x * 0.9) * 0.07 * uv.y; // only the tips move
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        void main() {
          gl_FragColor = vec4(uColor, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const tm = new THREE.InstancedMesh(g, tuftMaterial, tufts.length);
    tufts.forEach(([x, y, s], i) => tm.setMatrixAt(i, m4.makeScale(s, s, 1).setPosition(x, y - 0.02, Z.tufts)));
    tm.frustumCulled = false;
    group.add(tm);
  }

  return {
    quads: quads.length,
    update(time) {
      if (tuftMaterial) tuftMaterial.uniforms.uTime.value = time;
    },
  };
}
