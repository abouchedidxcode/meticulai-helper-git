// The land around the track: a low-poly island that hugs the road, a lake and the sea, and
// instanced scenery (trees, rocks, roadside posts, clouds, far islets) placed by the rules in
// the track's data (tracks.js -> terrain, scenery). All colours come from the palette by role.
//
// The ground is a FUNCTION, heightAt(x, z): next to the road it sits just under the road, and it
// blends into rolling hills further away, so any track you write gets land that fits it.
// The cars never drive on this ground (they drive on the road surface, between the rails);
// the camera uses heightAt so it never dips into a hill.
//
// To change the scenery: edit the rules in tracks.js. To add a new kind of thing (a house, a
// windmill, a buoy): add a geometry to KINDS below and name it in a rule.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRandom } from '../core/random.js';

export const WATER_Y = 0;
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function buildScenery(scene, track, look) {
  const T = { hills: 12, scale: 90, seed: 1, shore: 90, lakes: [], ...(track.data.terrain ?? {}) };
  const rand = createRandom(1000 + T.seed); // its own stream: scenery never shifts the race
  const { n, px, pz, py, half, tanB } = track;

  // Is (x, z) inside the loop? (the sea only starts outside it)
  function insideLoop(x, z) {
    let inside = false;
    for (let i = 0, j = n - 4; i < n; j = i, i += 4) {
      if (pz[i] > z !== pz[j] > z && x < ((px[j] - px[i]) * (z - pz[i])) / (pz[j] - pz[i]) + px[i]) inside = !inside;
    }
    return inside;
  }

  function wild(x, z) {
    const k = 1 / T.scale;
    const s = T.seed;
    let h = Math.sin(x * k + s) * Math.cos(z * k * 1.3 + s * 2) * 0.5 + Math.sin((x + z) * k * 2.1 + s * 3) * 0.3 + Math.sin(x * k * 3.7 - z * k * 2.9 + s) * 0.2;
    h = T.hills * (0.5 + 0.5 * h) + 2.2;
    for (const lake of T.lakes) {
      const d = Math.hypot(x - lake.x, z - lake.z) / lake.r;
      h = h + (-lake.depth - h) * smooth(1, 0.35, d);
    }
    return h;
  }

  /** Height of the land at (x, z). hint = a nearby track sample index (-1 searches the whole lap). */
  function heightAt(x, z, hint = -1, checkSea = false) {
    const i = track.nearest(x, z, hint, 30);
    const d = Math.hypot(x - px[i], z - pz[i]);
    const corridor = half[i] + track.verge;
    const bed = py[i] - 1.1 - corridor * Math.abs(tanB[i]);
    let h = bed + (wild(x, z) - bed) * smooth(corridor + 1.5, corridor + 44, d);
    if (checkSea && d > T.shore * 0.5 && !insideLoop(x, z)) h += (-7 - h) * smooth(T.shore * 0.5, T.shore, d);
    return h;
  }

  // --- the ground mesh -------------------------------------------------------------------
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]);
    minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]);
  }
  const pad = T.shore + 30;
  minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
  const CELL = 6;
  const gx = Math.ceil((maxX - minX) / CELL);
  const gz = Math.ceil((maxZ - minZ) / CELL);
  const H = new Float32Array((gx + 1) * (gz + 1));
  for (let b = 0; b <= gz; b++) for (let a = 0; a <= gx; a++) H[b * (gx + 1) + a] = heightAt(minX + a * CELL, minZ + b * CELL, -1, true);

  const grassA = new THREE.Color(look.base[0]);
  const grassB = new THREE.Color(look.base[1]);
  const rock = new THREE.Color(look.mix(look.base[2], look.shadow, 0.15));
  const sand = new THREE.Color(look.mix(look.base[3], look.light, 0.4));
  const deep = new THREE.Color(look.mix(look.base[3], look.shadow, 0.5));
  const tmp = new THREE.Color();
  const pos = [];
  const col = [];
  const tri = (ax, az, bx, bz, cx, cz) => {
    const ya = H[az * (gx + 1) + ax];
    const yb = H[bz * (gx + 1) + bx];
    const yc = H[cz * (gx + 1) + cx];
    if (ya < -6 && yb < -6 && yc < -6) return; // far under the sea: never seen
    pos.push(minX + ax * CELL, ya, minZ + az * CELL, minX + bx * CELL, yb, minZ + bz * CELL, minX + cx * CELL, yc, minZ + cz * CELL);
    const mid = (ya + yb + yc) / 3;
    const steep = Math.max(ya, yb, yc) - Math.min(ya, yb, yc);
    if (mid < WATER_Y - 0.5) tmp.copy(deep);
    else if (mid < WATER_Y + 0.9) tmp.copy(sand);
    else if (steep > 3.3) tmp.copy(rock);
    else tmp.copy(grassA).lerp(grassB, rand.range(0, 1) * 0.8 + (steep > 2 ? 0.2 : 0));
    for (let k = 0; k < 3; k++) col.push(tmp.r, tmp.g, tmp.b);
  };
  for (let b = 0; b < gz; b++) {
    for (let a = 0; a < gx; a++) {
      tri(a, b, a, b + 1, a + 1, b);
      tri(a + 1, b, a, b + 1, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals(); // not indexed, so every face is flat: the low-poly look
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // --- water ------------------------------------------------------------------------------
  const waterColour = look.mix(look.mix(look.shadow, look.sky.horizon, 0.55), look.light, 0.12);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: waterColour, roughness: 0.25, metalness: 0.15 }),
  );
  water.position.y = WATER_Y;
  water.receiveShadow = true;
  scene.add(water);

  // --- instanced scenery ----------------------------------------------------------------
  const paint = (geometry, hex) => {
    const colour = new THREE.Color(hex);
    const count = geometry.attributes.position.count;
    const data = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colour.toArray(data, i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
    return geometry;
  };
  const leaf = look.mix(look.base[1], look.shadow, 0.28);
  const KINDS = {
    tree: {
      geometry: mergeGeometries([
        paint(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 5).translate(0, 0.8, 0), look.mix(look.base[2], look.shadow, 0.5)),
        paint(new THREE.ConeGeometry(1.7, 3.2, 6).translate(0, 2.9, 0), leaf),
        paint(new THREE.ConeGeometry(1.2, 2.6, 6).translate(0, 4.6, 0), look.mix(leaf, look.base[0], 0.3)),
      ]),
      size: [0.8, 1.7], shadow: true, minY: 0.7,
    },
    rock: {
      geometry: paint(new THREE.IcosahedronGeometry(1, 0).scale(1, 0.7, 1), look.mix(look.base[2], look.shadow, 0.2)),
      size: [0.6, 2.4], shadow: true, minY: -0.6,
    },
    post: {
      geometry: mergeGeometries([
        paint(new THREE.BoxGeometry(0.22, 1.5, 0.22).translate(0, 0.75, 0), look.mix(look.base[2], look.shadow, 0.35)),
        paint(new THREE.BoxGeometry(0.3, 0.4, 0.3).translate(0, 1.6, 0), look.shade(look.light, 0.3)),
      ]),
      size: [1, 1], shadow: false, minY: -9,
    },
  };
  const spots = {}; // kind -> [x, y, z, scale, turn]
  const o = {};
  for (const rule of track.data.scenery ?? []) {
    const kind = KINDS[rule.kind];
    if (!kind) continue;
    const list = (spots[rule.kind] ??= []);
    const add = (x, z, clear, y) => {
      const i = track.nearest(x, z, -1);
      if (Math.hypot(x - px[i], z - pz[i]) < half[i] + track.verge + clear) return; // not on a road
      const ground = y ?? heightAt(x, z, i, true);
      if (ground < kind.minY) return;
      list.push([x, ground, z, rand.range(kind.size[0], kind.size[1]), rand.range(0, 6.28)]);
    };
    if (rule.along) {
      for (let s = rand.range(0, rule.along); s < track.length; s += rule.along) {
        for (const side of [-1, 1]) {
          if (!rand.chance(rule.chance ?? 1)) continue;
          const off = rand.range(rule.from ?? 3, rule.to ?? 20);
          track.at(s, 0, o);
          track.at(s, side * (o.half + track.verge + off), o); // `off` metres beyond the rail
          add(o.x, o.z, Math.min(off, 0.5), rule.kind === 'post' ? o.y - 0.2 : undefined);
        }
      }
    }
    for (let k = 0; k < (rule.scatter ?? 0); k++) add(rand.range(minX, maxX), rand.range(minZ, maxZ), 5);
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  for (const [name, list] of Object.entries(spots)) {
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(KINDS[name].geometry, material, list.length);
    list.forEach(([x, y, z, s, a], i) => {
      m.compose(new THREE.Vector3(x, y - 0.15, z), q.setFromAxisAngle(up, a), new THREE.Vector3(s, s * (name === 'rock' ? 1 : rand.range(0.85, 1.25)), s));
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = KINDS[name].shadow;
    mesh.receiveShadow = true;
    mesh.name = name;
    scene.add(mesh);
  }

  // --- far things: islets in the sea and slow clouds (depth, and a little motion) ----------
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const reach = Math.max(maxX - minX, maxZ - minZ) / 2;
  const islets = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), new THREE.MeshStandardMaterial({ color: look.mix(look.base[1], look.shadow, 0.4), roughness: 1, flatShading: true }), 9);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * 6.28 + rand.range(-0.2, 0.2);
    const r = reach + rand.range(60, 190);
    const w = rand.range(25, 60);
    m.compose(new THREE.Vector3(cx + Math.sin(a) * r, w * 0.25, cz + Math.cos(a) * r), q.identity(), new THREE.Vector3(w, w * rand.range(0.5, 0.9), w));
    islets.setMatrixAt(i, m);
  }
  scene.add(islets);

  const clouds = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: look.mix(look.light, look.sky.horizon, 0.35), fog: false, transparent: true, opacity: 0.85 }), 22);
  for (let i = 0; i < 22; i++) {
    const a = rand.range(0, 6.28);
    const r = rand.range(140, 620);
    const w = rand.range(22, 50);
    m.compose(new THREE.Vector3(Math.sin(a) * r, rand.range(95, 150), Math.cos(a) * r), q.identity(), new THREE.Vector3(w, w * 0.22, w * rand.range(0.5, 0.8)));
    clouds.setMatrixAt(i, m);
  }
  clouds.position.set(cx, 0, cz);
  scene.add(clouds);

  return {
    heightAt,
    reach,
    centre: new THREE.Vector3(cx, 0, cz),
    animate(time) {
      clouds.rotation.y = time * 0.006;
      water.position.y = WATER_Y + Math.sin(time * 0.7) * 0.06;
    },
  };
}
