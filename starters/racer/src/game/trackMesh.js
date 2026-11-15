// Draws a track: ONE mesh for the road ribbon (asphalt, edge lines, centre dashes, striped kerbs
// in the corners, grass verges, the low rails and the start line), plus the checkpoint gates.
// Everything is coloured per face from the palette, so a new vibe repaints the whole circuit.
//
// The stripes are not decoration: dashes, kerbs and rail blocks rushing past are what makes
// speed visible (see "Visible speed" in STARTER.md). Keep some rhythm on the road if you restyle.
//
// To change the look of the road, edit the `colours` and the `strips` list in buildTrackMesh.

import * as THREE from 'three';

export const RAIL_HEIGHT = 0.75;

export function buildTrackMesh(track, look) {
  const { n, px, py, pz, rx, rz, half, tanB, turn } = track;
  const pos = [];
  const col = [];
  const nor = [];
  const c = (hex) => new THREE.Color(hex);

  // Asphalt = the path colour pulled toward the dark end. If that lands too close to the
  // player's colour (a dark car on a dark road), use a lighter or darker mix instead, so the
  // player's car stands out in every palette.
  const contrast = (x, y) => {
    const [hi, lo] = [look.luminance(x), look.luminance(y)].sort((p, q) => q - p);
    return (hi + 0.05) / (lo + 0.05);
  };
  const asphalt = [0.62, 0.3, 0.88].map((k) => look.mix(look.base[3], look.shadow, k));
  const road = contrast(asphalt[0], look.player) >= 2.2 ? asphalt[0] : asphalt.sort((x, y) => contrast(y, look.player) - contrast(x, look.player))[0];

  const colours = {
    road: [c(road), c(look.mix(road, look.base[3], 0.12))],
    // Road paint is the bright end, unless the road itself is pale: then the lines go dark.
    paint: c(contrast(look.shade(look.light, 0.25), road) >= 2.6 ? look.shade(look.light, 0.25) : look.shade(look.shadow, -0.35)),
    kerbA: c(look.shade(look.light, 0.3)),
    kerbB: c(look.accent[1]),
    verge: [c(look.mix(look.base[0], look.base[1], 0.35)), c(look.mix(look.base[0], look.base[1], 0.75))],
    rail: [c(look.mix(look.base[2], look.light, 0.35)), c(look.mix(look.base[2], look.shadow, 0.3))],
    railBend: [c(look.shade(look.light, 0.3)), c(look.accent[1])],
    skirt: c(look.mix(look.base[1], look.shadow, 0.35)),
    dark: c(look.shadow),
  };

  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  const D = new THREE.Vector3();
  const N = new THREE.Vector3();
  const E1 = new THREE.Vector3();
  const E2 = new THREE.Vector3();
  // A point on row i, `lat` metres right of the centre line, `up` metres above the road surface.
  const point = (out, i, lat, up = 0) => out.set(px[i] + rx[i] * lat, py[i] - lat * tanB[i] + up, pz[i] + rz[i] * lat);

  function push(a, b, cc, d, colour) {
    N.crossVectors(E1.subVectors(b, a), E2.subVectors(cc, a)).normalize();
    for (const v of [a, b, cc, a, cc, d]) {
      pos.push(v.x, v.y, v.z);
      nor.push(N.x, N.y, N.z);
      col.push(colour.r, colour.g, colour.b);
    }
  }
  // A flat piece of road between row i and the next, from lat l0 to l1 (l0 < l1).
  function flat(i, l0, l1, colour, up = 0) {
    const k = (i + 1) % n;
    push(point(A, i, l0, up), point(B, i, l1, up), point(C, k, l1, up), point(D, k, l0, up), colour);
  }
  // An upright piece at lat l, from height y0 to y1 above the road (rails and skirts).
  function wall(i, l, y0, y1, colour) {
    const k = (i + 1) % n;
    push(point(A, i, l, y0), point(B, i, l, y1), point(C, k, l, y1), point(D, k, l, y0), colour);
  }

  for (let i = 0; i < n; i++) {
    const h = half[i];
    const edge = h + track.verge;
    const bend = Math.abs(turn[i]) > 0.009; // a corner: paint kerbs and bright rails
    const kerb = bend ? (Math.floor(i / 2) % 2 ? colours.kerbA : colours.kerbB) : null;
    const verge = colours.verge[Math.floor(i / 4) % 2];
    const road = colours.road[Math.floor(i / 9) % 2];
    const dash = i % 6 < 3 ? colours.paint : road;
    const rail = bend ? colours.railBend[Math.floor(i / 3) % 2] : colours.rail[Math.floor(i / 3) % 2];

    // The strips across the road, left to right: [from, to, colour].
    const strips = [
      [-edge, -h - track.kerb, verge],
      [-h - track.kerb, -h, kerb ?? verge],
      [-h, -h + 0.35, colours.paint],
      [-h + 0.35, -0.13, road],
      [-0.13, 0.13, dash],
      [0.13, h - 0.35, road],
      [h - 0.35, h, colours.paint],
      [h, h + track.kerb, kerb ?? verge],
      [h + track.kerb, edge, verge],
    ];
    for (const [l0, l1, colour] of strips) flat(i, l0, l1, colour);

    for (const side of [-1, 1]) {
      wall(i, side * edge, 0, RAIL_HEIGHT, rail);
      wall(i, side * (edge + 0.3), 0, RAIL_HEIGHT, rail);
      flat(i, side > 0 ? edge : -edge - 0.3, side > 0 ? edge + 0.3 : -edge, rail, RAIL_HEIGHT);
      wall(i, side * (edge + 0.3), -5, 0, colours.skirt);
    }
  }

  // The start line: a chequered band across the road at s = 0.
  for (let row = 0; row < 2; row++) {
    const cells = Math.floor(half[row] * 2);
    for (let k = 0; k < cells; k++) {
      const l0 = -half[row] + (k * half[row] * 2) / cells;
      flat(row, l0, l0 + (half[row] * 2) / cells, (k + row) % 2 ? colours.dark : colours.paint, 0.03);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  mesh.name = 'track';
  return mesh;
}

// Checkpoint gates: two posts and a beam over the road at every gate. The player's next gate
// glows in the accent colour; the finish gate is the last one. gates.setNext(index) moves the glow.
export function buildGates(track, look) {
  const count = track.gates.length;
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 6.4, 0.5), mat, count * 2);
  const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.9, 0.5), mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const o = {};
  track.gates.forEach((s, g) => {
    track.at(s, 0, o);
    const reach = o.half + track.verge + 0.6;
    q.setFromAxisAngle(up, Math.atan2(o.tx, o.tz));
    for (const side of [-1, 1]) {
      const x = o.x + o.rx * side * reach;
      const z = o.z + o.rz * side * reach;
      m.compose(new THREE.Vector3(x, o.cy - side * reach * o.tanB + 3.2, z), q, new THREE.Vector3(1, 1, 1));
      posts.setMatrixAt(g * 2 + (side > 0 ? 1 : 0), m);
    }
    m.compose(new THREE.Vector3(o.x, o.cy + 6.2, o.z), q, new THREE.Vector3(reach * 2 + 0.5, 1, 1));
    beams.setMatrixAt(g, m);
  });
  posts.castShadow = beams.castShadow = true;
  group.add(posts, beams);

  const idle = new THREE.Color(look.mix(look.base[2], look.light, 0.4));
  const next = new THREE.Color(look.accent[0]);
  const finish = new THREE.Color(look.shade(look.light, 0.4));
  group.setNext = (index) => {
    for (let g = 0; g < count; g++) {
      const colour = g === index ? next : g === count - 1 ? finish : idle;
      posts.setColorAt(g * 2, colour);
      posts.setColorAt(g * 2 + 1, colour);
      beams.setColorAt(g, colour);
    }
    posts.instanceColor.needsUpdate = true;
    beams.instanceColor.needsUpdate = true;
  };
  group.setNext(count - 1);
  return group;
}
