// The demo's world: a floating island at dusk, built entirely from code (no asset files).
// Also holds the simple collision used by the player: a list of solid boxes and upright
// cylinders, and a sphere-vs-solids push-out.

import * as THREE from 'three';
import { createRandom } from '../core/random.js';

export const PALETTE = {
  skyTop: '#2c3a63',
  skyHorizon: '#c98a7a',
  skySun: '#ffb46b',
  skyBelow: '#4a3f5e',
  fog: '#7d6a86',
  sun: '#ffc08a',
  hemiSky: '#b4c0e6',
  hemiGround: '#8a6450',
  moss: '#93ad5e',
  mossDark: '#6f8a45',
  rock: '#b9957a',
  rockDark: '#6e5752',
  path: '#a88462',
  amber: '#ffc46b',
  autumn: '#d4893f',
};

// A soft round dot, used for glows and particles.
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

// Move vertices a little for a hand-made, lumpy look. keep(v): true = leave this vertex alone.
function lumpy(geo, rand, amount, keep = () => false) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const seen = new Map(); // same position -> same offset, so no cracks open between faces
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (keep(v)) continue;
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, [rand.range(-1, 1), rand.range(-1, 1), rand.range(-1, 1)]);
    const [a, b, c] = seen.get(key);
    p.setXYZ(i, v.x + a * amount, v.y + b * amount * 0.6, v.z + c * amount);
  }
  geo.computeVertexNormals();
  return geo;
}

function sky(scene, sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      horizon: { value: new THREE.Color(PALETTE.skyHorizon) },
      sunGlow: { value: new THREE.Color(PALETTE.skySun) },
      below: { value: new THREE.Color(PALETTE.skyBelow) },
      sunDir: { value: sunDir.clone().normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top, horizon, sunGlow, below, sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float s = max(dot(d, sunDir), 0.0);
        float towardSun = pow(max(dot(normalize(d.xz + 1e-5), normalize(sunDir.xz)), 0.0), 3.0);
        vec3 hor = mix(horizon, sunGlow, towardSun * 0.8);
        vec3 col = mix(hor, top, smoothstep(-0.02, 0.5, d.y));
        col = mix(col, below, smoothstep(0.0, -0.4, d.y));
        col += sunGlow * (pow(s, 900.0) * 3.0 + pow(s, 24.0) * 0.35);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

export function buildWorld(scene) {
  const rand = createRandom(1234); // fixed: the island is the same for every seed
  const solids = [];
  const addCyl = (x, z, r, y0, y1) => solids.push({ type: 'cyl', x, z, r, y0, y1 });
  const addBox = (cx, cy, cz, sx, sy, sz) =>
    solids.push({
      type: 'box',
      min: new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
      max: new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2),
    });

  // Light ----------------------------------------------------------------------------
  const sunDir = new THREE.Vector3(-0.9, 0.42, -0.25);
  scene.fog = new THREE.Fog(PALETTE.fog, 45, 190);
  const skyMesh = sky(scene, sunDir);

  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 3.0);
  sun.position.copy(sunDir).multiplyScalar(40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 100;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // Materials ------------------------------------------------------------------------
  const moss = new THREE.MeshStandardMaterial({ color: PALETTE.moss, roughness: 0.95 });
  const mossDark = new THREE.MeshStandardMaterial({ color: PALETTE.mossDark, roughness: 1, flatShading: true });
  const rock = new THREE.MeshStandardMaterial({ color: PALETTE.rock, roughness: 0.9, flatShading: true });
  const rockDark = new THREE.MeshStandardMaterial({ color: PALETTE.rockDark, roughness: 1, flatShading: true });
  const pathMat = new THREE.MeshStandardMaterial({
    color: PALETTE.path, roughness: 1, transparent: true, opacity: 0.55,
    polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
  });

  const shadowy = (m) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  // The island -------------------------------------------------------------------------
  const R = 14;
  const top = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(R, R - 0.4, 3, 64, 1), [rock, moss, rock]));
  top.position.y = -1.5;
  scene.add(top);
  const lip = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(R + 0.2, R - 0.05, 0.6, 64, 1, true), mossDark));
  lip.position.y = -0.25;
  scene.add(lip);
  const under = new THREE.Mesh(lumpy(new THREE.ConeGeometry(R - 0.4, 15, 22, 5), rand, 0.9, (v) => v.y < -7.49), rockDark);
  under.rotation.x = Math.PI;
  under.position.y = -3 - 7.5;
  under.receiveShadow = true;
  scene.add(under);
  addCyl(0, 0, R, -3, 0);

  // Worn tracks where the stones roll: the danger is readable before it moves.
  const lanes = [
    { from: new THREE.Vector3(-10.5, 0, 4), to: new THREE.Vector3(10.5, 0, 4) },
    { from: new THREE.Vector3(-1.5, 0, -8.5), to: new THREE.Vector3(-1.5, 0, 1.6) },
  ];
  for (const lane of lanes) {
    const len = lane.from.distanceTo(lane.to) + 2;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.7), pathMat);
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = -Math.atan2(lane.to.z - lane.from.z, lane.to.x - lane.from.x);
    strip.position.copy(lane.from).lerp(lane.to, 0.5).setY(0.012);
    strip.receiveShadow = true;
    scene.add(strip);
  }

  // Pillars (stand on them) ------------------------------------------------------------
  function pillar(x, z, r, h) {
    const geo = lumpy(new THREE.CylinderGeometry(r, r * 1.12, h, 8, 2), rand, 0.06, (v) => v.y > h / 2 - 0.01);
    const m = shadowy(new THREE.Mesh(geo, rock));
    m.position.set(x, h / 2, z);
    scene.add(m);
    const cap = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(r + 0.06, r + 0.02, 0.16, 8), moss));
    cap.position.set(x, h - 0.05, z);
    scene.add(cap);
    addCyl(x, z, r + 0.02, 0, h);
  }
  pillar(6, -5, 1.25, 1.2);
  pillar(8.6, -7.6, 1.0, 2.3);
  pillar(10.4, -4.2, 0.95, 3.4);

  // Floating slabs, each a tiny island of its own --------------------------------------
  function slab(x, topY, z, sx, sz) {
    const h = 0.45;
    const m = shadowy(new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), rock));
    m.position.set(x, topY - h / 2, z);
    scene.add(m);
    const cap = shadowy(new THREE.Mesh(new THREE.BoxGeometry(sx + 0.08, 0.12, sz + 0.08), moss));
    cap.position.set(x, topY - 0.04, z);
    scene.add(cap);
    const r = Math.min(sx, sz) * 0.5;
    const cone = new THREE.Mesh(lumpy(new THREE.ConeGeometry(r, 1.4, 7, 2), rand, 0.08, (v) => v.y < -0.69), rockDark);
    cone.rotation.x = Math.PI;
    cone.position.set(x, topY - h - 0.7, z);
    cone.castShadow = true;
    scene.add(cone);
    addBox(x, topY - h / 2, z, sx, h, sz);
  }
  slab(-6, 1.1, -6, 3, 2.2);
  slab(-9.2, 2.2, -3.6, 2.4, 2.4);
  slab(-10.2, 3.3, 0.4, 2.2, 2.2);

  // A fallen log near the far edge: a low step up.
  const log = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 4.2, 10), new THREE.MeshStandardMaterial({ color: '#7a5640', roughness: 1, flatShading: true })));
  log.rotation.z = Math.PI / 2;
  log.position.set(1.8, 0.46, -11.2);
  scene.add(log);
  addBox(1.8, 0.45, -11.2, 4.2, 0.9, 0.9);
  slab(0, 0, 16.6, 2.4, 2.4); // out past the edge: a risky spark

  // Trees (solid trunks) ------------------------------------------------------------------
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#6b4a36', roughness: 1 });
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: PALETTE.autumn, roughness: 0.9, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: '#8a9a4a', roughness: 0.9, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: '#c46a3a', roughness: 0.9, flatShading: true }),
  ];
  // Near the rim, so they frame the island instead of blocking the camera.
  const trees = [[-6, 11.2], [8, 10], [12.3, 1.2], [-12.2, 6], [6, -11.6], [-4.5, -12.3]];
  trees.forEach(([x, z], i) => {
    const s = rand.range(0.7, 0.9);
    const trunk = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.26 * s, 1.7 * s, 6), trunkMat));
    trunk.position.set(x, 0.85 * s, z);
    scene.add(trunk);
    const leaf = shadowy(new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(1.15 * s, 1), rand, 0.12), leafMats[i % 3]));
    leaf.position.set(x, 2.2 * s, z);
    leaf.scale.y = 0.85;
    scene.add(leaf);
    const leaf2 = shadowy(new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(0.7 * s, 1), rand, 0.08), leafMats[(i + 1) % 3]));
    leaf2.position.set(x + 0.5 * s, 2.9 * s, z - 0.2);
    scene.add(leaf2);
    addCyl(x, z, 0.3 * s, 0, 3.2 * s);
  });

  // Grass tufts: one instanced mesh, hundreds of copies, one draw call ---------------------
  const tuftGeo = new THREE.ConeGeometry(0.09, 0.24, 3);
  tuftGeo.translate(0, 0.1, 0);
  const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ roughness: 1 }), 420);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const col = new THREE.Color();
  for (let i = 0; i < tufts.count; i++) {
    const a = rand.range(0, Math.PI * 2);
    const r = Math.sqrt(rand.next()) * (R - 0.6);
    e.set(rand.range(-0.3, 0.3), rand.range(0, 6), rand.range(-0.3, 0.3));
    q.setFromEuler(e);
    const s = rand.range(0.6, 1.4);
    m4.compose(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), q, new THREE.Vector3(s, s, s));
    tufts.setMatrixAt(i, m4);
    tufts.setColorAt(i, col.set(rand.pick(['#a2bd68', '#8fae5a', '#b5c776', '#c9b46a'])));
  }
  tufts.receiveShadow = true;
  scene.add(tufts);

  // A scatter of small flowers for warmth.
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.055, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 90);
  for (let i = 0; i < flowers.count; i++) {
    const a = rand.range(0, Math.PI * 2);
    const r = Math.sqrt(rand.next()) * (R - 0.8);
    m4.makeTranslation(Math.cos(a) * r, 0.08, Math.sin(a) * r);
    flowers.setMatrixAt(i, m4);
    flowers.setColorAt(i, col.set(rand.pick(['#f6e2b8', '#f2c27a', '#f6efe0'])));
  }
  scene.add(flowers);

  // Far-off floating rocks for depth ---------------------------------------------------------
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand.range(-0.2, 0.2);
    const d = rand.range(55, 120);
    const s = rand.range(2, 7);
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(s, s * 0.9, s * 0.35, 9), moss);
    const u = new THREE.Mesh(lumpy(new THREE.ConeGeometry(s * 0.9, s * 1.6, 9, 2), rand, s * 0.08), rockDark);
    u.rotation.x = Math.PI;
    u.position.y = -s * 0.97;
    g.add(t, u);
    g.position.set(Math.cos(a) * d, rand.range(-14, 8), Math.sin(a) * d);
    scene.add(g);
  }

  // Drifting motes of light ---------------------------------------------------------------
  const moteCount = 160;
  const motePos = new Float32Array(moteCount * 3);
  const moteBase = [];
  for (let i = 0; i < moteCount; i++) {
    const a = rand.range(0, Math.PI * 2);
    const r = rand.range(2, 22);
    moteBase.push([Math.cos(a) * r, rand.range(0.4, 9), Math.sin(a) * r, rand.range(0, 10)]);
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(
    moteGeo,
    new THREE.PointsMaterial({
      size: 0.16, map: glowTexture(), color: '#ffd59a', transparent: true, opacity: 0.8,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  motes.frustumCulled = false;
  scene.add(motes);

  function animate(time) {
    for (let i = 0; i < moteCount; i++) {
      const [x, y, z, p] = moteBase[i];
      motePos[i * 3] = x + Math.sin(time * 0.3 + p) * 0.6;
      motePos[i * 3 + 1] = y + Math.sin(time * 0.5 + p * 2) * 0.4;
      motePos[i * 3 + 2] = z + Math.cos(time * 0.25 + p) * 0.6;
    }
    moteGeo.attributes.position.needsUpdate = true;
  }

  return { solids, lanes, skyMesh, sun, islandRadius: R, animate };
}

// --- Collision ------------------------------------------------------------------------------

const closest = new THREE.Vector3();
const push = new THREE.Vector3();

// Push a sphere out of every solid it overlaps. Changes pos and vel in place.
// Returns true if the sphere is standing on something.
export function collideSphere(solids, pos, vel, radius) {
  let grounded = false;
  for (let pass = 0; pass < 2; pass++) {
    for (const s of solids) {
      if (s.type === 'box') {
        closest.set(
          THREE.MathUtils.clamp(pos.x, s.min.x, s.max.x),
          THREE.MathUtils.clamp(pos.y, s.min.y, s.max.y),
          THREE.MathUtils.clamp(pos.z, s.min.z, s.max.z),
        );
      } else {
        const dx = pos.x - s.x;
        const dz = pos.z - s.z;
        const d = Math.hypot(dx, dz);
        const k = d > s.r ? s.r / d : 1;
        closest.set(s.x + dx * k, THREE.MathUtils.clamp(pos.y, s.y0, s.y1), s.z + dz * k);
      }
      push.subVectors(pos, closest);
      const dist = push.length();
      if (dist >= radius) continue;
      if (dist < 1e-6) {
        // Centre inside the solid: lift it onto the top.
        const topY = s.type === 'box' ? s.max.y : s.y1;
        pos.y = topY + radius;
        if (vel.y < 0) vel.y = 0;
        grounded = true;
        continue;
      }
      push.divideScalar(dist); // now the surface normal
      pos.addScaledVector(push, radius - dist);
      const into = vel.dot(push);
      if (into < 0) vel.addScaledVector(push, -into);
      if (push.y > 0.55) grounded = true;
    }
  }
  return grounded;
}

// Height of the highest surface under (x, z) at or below maxY. -Infinity over the void.
export function groundAt(solids, x, z, maxY = Infinity) {
  let best = -Infinity;
  for (const s of solids) {
    let inside;
    let topY;
    if (s.type === 'box') {
      inside = x >= s.min.x && x <= s.max.x && z >= s.min.z && z <= s.max.z;
      topY = s.max.y;
    } else {
      inside = Math.hypot(x - s.x, z - s.z) <= s.r;
      topY = s.y1;
    }
    if (inside && topY <= maxY + 0.05 && topY > best) best = topY;
  }
  return best;
}
