// The demo's scythe. No scanned scythe is in Patch's library, so it is built here: a forged blade with a real
// section (a rolled rib along the back, a hollow-ground body, a honed bevel), its tang bent up the snath and held by
// a ring and wedge, on a steam-bent snath with two turned grips. The steel's maps are made in code (grinding marks,
// whetstone marks on the bevel, forge scale along the rib, a light patina); the wood is Poly Haven's Fine Grained
// Wood (CC0). Its own frame is the one it mows in: the heel (where blade meets snath) at the origin, the blade along
// +X to its tip, flat in the XZ plane with its edge on -Z, +Y up off the ground.
import * as THREE from 'three';

/** Heel to tip, metres. */
export const BLADE = 1.05;
/** How far out from the mower the heel runs in a stroke, metres. */
export const HEEL = 1.45;
/** The blade's lead: how far its tip is turned ahead of straight out, the way it travels, radians. */
export const HAFT = (25 * Math.PI) / 180;
/** How far the tip curls round towards the edge side, metres. */
const CURL = 0.22;

/**
 * The snath's direction from the heel, in the scythe's frame: in a stroke the heel is HEEL out on the ground and
 * the top of the snath is at the left hip, a metre up.
 */
export const SNATH = (() => {
  const out = -(HEEL - 0.25);
  const lead = 0.22;
  const c = Math.cos(HAFT);
  const s = Math.sin(HAFT);
  // (out, lead) on the ground turned into the blade's frame: X = c·out + s·lead, Z = s·out − c·lead
  return new THREE.Vector3(c * out + s * lead, 0.95, s * out - c * lead).normalize();
})();

const widthAt = (u) => (u >= 1 ? 0 : 0.008 + 0.108 * (1 - u) ** 0.75);
/** Where the edge is, as metres towards -Z from the blade's axis, at u from heel (0) to tip (1). */
export const edgeAt = (u) => CURL * u * u + 0.7 * widthAt(u);
const backAt = (u) => -CURL * u * u + 0.3 * widthAt(u);

// ---- the steel's maps ----------------------------------------------------------------------------------------
function hash(x, y, s) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth noise, 0 to 1, of a point in cells. */
function noise(x, y, s) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s);
  const b = hash(ix + 1, iy, s);
  const c = hash(ix, iy + 1, s);
  const d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function dataTexture(data, w, h, srgb, renderer) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * Across the blade (v: 0 at the edge, 1 at the back) and along it (u): colour, roughness and a height the normal
 * map is taken from.
 *   v < 0.13         the bevel: honed bright, the whetstone's strokes slanting across it
 *   0.13 to 0.74     the body: ground lengthwise, greyed by use, clouded with patina
 *   above 0.74       the rib: left as it came from the forge, dark scale, pitted
 */
async function steelTextures(renderer) {
  // (half a million texels of several noises each: done a few rows at a time, so the page keeps answering)
  let until = performance.now() + 20;
  const W = 2048;
  const H = 256;
  const colour = new Uint8Array(W * H * 4);
  const orm = new Uint8Array(W * H * 4);
  const height = new Float32Array(W * H);
  const toSrgb = (c) => 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
  for (let y = 0; y < H; y++) {
    if (performance.now() > until) {
      await turn();
      until = performance.now() + 20;
    }
    const v = y / (H - 1);
    for (let x = 0; x < W; x++) {
      const k = x + y * W;
      // long thin marks left by the grindstone, running the length of it: three sizes
      const grind = noise(x / 90, y / 1.2, 1) * 0.5 + noise(x / 28, y / 0.7, 2) * 0.3 + noise(x / 240, y / 2.5, 3) * 0.2;
      const cloud = noise(x / 150, y / 46, 4) * 0.6 + noise(x / 52, y / 19, 5) * 0.4;
      const wobble = (noise(x / 60, 0, 6) - 0.5) * 0.035;
      const bevel = 1 - smooth(0.115 + wobble, 0.14 + wobble, v);
      const scaleEdge = 0.74 + (noise(x / 34, 3, 7) - 0.5) * 0.09 + (noise(x / 7, 5, 8) - 0.5) * 0.03;
      const scale = smooth(scaleEdge - 0.03, scaleEdge + 0.04, v);
      // a few scratches that go their own way, from stones in the grass and years of use
      const sx = x + y * 5.5;
      const stray = Math.max(0, noise(sx / 2.2, (y - x * 0.01) / 38, 9) - 0.86) * 7 * (noise(x / 210, y / 60, 10) > 0.52 ? 1 : 0);
      const hone = noise((x - y * 1.7) / 1.6, (y + x * 0.5) / 30, 11);
      const pit = noise(x / 3.1, y / 3.1, 12) * 0.6 + noise(x / 8, y / 8, 13) * 0.4;

      // linear reflectance: steel is about 0.56; patina takes it down and warms it a touch
      const patina = smooth(0.42, 0.9, cloud) * (1 - bevel);
      // (a metal has no colour of its own but this: it tints everything the blade reflects, so the grinding and
      // the patina are put in strongly enough to show whatever it is reflecting)
      const line = 0.6 + 0.8 * grind;
      let r = 0.56 * line * (1 - 0.34 * patina) + 0.25 * stray;
      let g = 0.56 * line * (1 - 0.37 * patina) + 0.25 * stray;
      let b = 0.58 * line * (1 - 0.44 * patina) + 0.25 * stray;
      let rough = 0.2 + 0.16 * grind + 0.14 * patina + 0.12 * stray;
      let metal = 1;
      let h = (grind - 0.5) * 1.1 - stray * 0.8;
      if (bevel > 0) {
        const bright = 0.8 + 0.12 * hone;
        r += (bright - r) * bevel;
        g += (bright - g) * bevel;
        b += (bright + 0.01 - b) * bevel;
        rough += (0.1 + 0.1 * hone - rough) * bevel;
        h += ((hone - 0.5) * 0.35 - h) * bevel;
      }
      if (scale > 0) {
        const dark = 0.03 + 0.04 * pit + 0.015 * cloud;
        r += (dark * 1.08 - r) * scale;
        g += (dark - g) * scale;
        b += (dark * 0.96 - b) * scale;
        rough += (0.7 + 0.25 * pit - rough) * scale;
        metal -= 0.5 * scale;
        h += ((pit - 0.5) * 2.4 - h) * scale;
      }
      colour[k * 4] = toSrgb(Math.min(1, Math.max(0, r)));
      colour[k * 4 + 1] = toSrgb(Math.min(1, Math.max(0, g)));
      colour[k * 4 + 2] = toSrgb(Math.min(1, Math.max(0, b)));
      colour[k * 4 + 3] = 255;
      orm[k * 4] = 255;
      orm[k * 4 + 1] = Math.round(Math.min(1, Math.max(0.04, rough)) * 255);
      orm[k * 4 + 2] = Math.round(metal * 255);
      orm[k * 4 + 3] = 255;
      height[k] = h;
    }
  }
  const normal = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = x + y * W;
      const dx = height[Math.min(W - 1, x + 1) + y * W] - height[Math.max(0, x - 1) + y * W];
      const dy = height[x + Math.min(H - 1, y + 1) * W] - height[x + Math.max(0, y - 1) * W];
      // On top of the fine marks, the shape of the section, which is too slight to model but is what a blade's
      // light is made of: the body is hollow, so across it the surface turns through some thirty degrees and the
      // sun is only ever caught in a streak along it; the bevel is turned the other way and catches its own.
      const v = y / (H - 1);
      const body = smooth(0.1, 0.16, v) * (1 - smooth(0.7, 0.8, v));
      const hollow = -0.3 * ((v - 0.44) / 0.3) * body + 0.22 * (1 - smooth(0.1, 0.16, v));
      const nx = -dx * 0.9;
      const ny = -dy * 0.9 + hollow;
      const l = Math.hypot(nx, ny, 1);
      normal[k * 4] = 128 + (127 * nx) / l;
      normal[k * 4 + 1] = 128 + (127 * ny) / l;
      normal[k * 4 + 2] = 128 + 127 / l;
      normal[k * 4 + 3] = 255;
    }
  }
  return { map: dataTexture(colour, W, H, true, renderer), orm: dataTexture(orm, W, H, false, renderer), normal: dataTexture(normal, W, H, false, renderer) };
}

// ---- the blade -----------------------------------------------------------------------------------------------
const RIB = 0.0085; // how far the rolled rib stands above the body
const THICK = 0.0032; // the body where it leaves the rib

/** The section at u: points from the foot of the rib, over it, down the body to the edge: [z, y, v]. */
function section(u) {
  const w = widthAt(u);
  const back = backAt(u);
  const edge = -edgeAt(u);
  // everything thins out to the point
  const thin = Math.min(1, (1 - u) * 5 + 0.12);
  const rib = RIB * thin * (0.75 + 0.25 * (1 - u));
  const t = THICK * thin;
  const at = (f) => back + (edge - back) * f; // f: 0 at the back, 1 at the edge
  const ribW = Math.min(0.14, 0.012 / Math.max(w, 1e-4));
  return [
    [back + 0.0006, -0.0006 * thin, 1.0],
    [back, rib * 0.55, 0.985],
    [at(ribW * 0.18), rib, 0.96],
    [at(ribW * 0.55), rib * 0.92, 0.93],
    [at(ribW), t + rib * 0.2, 0.89],
    [at(ribW * 1.5), t, 0.84],
    [at(0.42), t * 0.5, 0.58], // hollow-ground: it dips in the middle
    [at(0.7), t * 0.42, 0.3],
    [at(0.875), t * 0.4, 0.125],
    [edge, 0, 0.0],
  ];
}

function bladeGeometry() {
  const N = 48;
  const positions = [];
  const uvs = [];
  const indices = [];
  // bands of the section that share an edge without sharing a normal: the rib's wall, the rib's crown, the body, the bevel
  const bands = [
    [0, 1],
    [1, 4],
    [4, 8],
    [8, 9],
  ];
  const ring = (i) => section(i / N);
  for (const [from, to] of bands) {
    const first = positions.length / 3;
    const across = to - from + 1;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const s = ring(i);
      for (let j = from; j <= to; j++) {
        positions.push(BLADE * u, s[j][1], s[j][0]);
        uvs.push(u, s[j][2]);
      }
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < across - 1; j++) {
        const a = first + i * across + j;
        indices.push(a, a + 1, a + across, a + 1, a + across + 1, a + across);
      }
    }
  }
  // the underside: nearly flat, a shallow bevel of its own at the edge
  {
    const first = positions.length / 3;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const s = ring(i);
      const edge = s[9];
      const back = s[0];
      const thin = Math.min(1, (1 - u) * 5 + 0.12);
      const z1 = edge[0] + (back[0] - edge[0]) * 0.1;
      positions.push(BLADE * u, edge[1], edge[0], BLADE * u, -0.0007 * thin, z1, BLADE * u, back[1], back[0]);
      uvs.push(u, 0, u, 0.1, u, 0.7);
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < 2; j++) {
        const a = first + i * 3 + j;
        indices.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
      }
    }
  }
  // the heel's end, closed
  {
    const s = ring(0);
    const first = positions.length / 3;
    for (const p of s) {
      positions.push(0, p[1], p[0]);
      uvs.push(0.004, p[2]);
    }
    for (let j = 1; j < s.length - 1; j++) indices.push(first, first + j + 1, first + j);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// ---- the snath and its fittings ------------------------------------------------------------------------------
/** Lets the browser have a turn, without a timer's wait. */
const turn = () =>
  new Promise((r) => {
    const c = new MessageChannel();
    c.port1.onmessage = () => r();
    c.port2.postMessage(0);
  });

const Y = new THREE.Vector3(0, 1, 0);

/** Wood whose grain runs along a bent piece: the texture's V is its length, 0.6 m a tile. */
function grain(geometry, length, girth, offset = 0) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const along = uv.getX(i);
    const around = uv.getY(i);
    uv.setXY(i, offset + (around * girth) / 0.6, offset * 1.7 + (along * length) / 0.6);
  }
  return geometry;
}

/** A piece turned on a lathe: profile is [radius, height] pairs up its axis, which runs from `from` along `dir`. */
function turned(material, profile, from, dir, wood = true) {
  const points = profile.map(([r, h]) => new THREE.Vector2(r, h));
  const geometry = new THREE.LatheGeometry(points, 20);
  if (wood) {
    const length = profile[profile.length - 1][1] - profile[0][1];
    const girth = 2 * Math.PI * Math.max(...profile.map((p) => p[0]));
    // a lathe's uv is (around, along)
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.31 + (uv.getX(i) * girth) / 0.6, 0.17 + (uv.getY(i) * length) / 0.6);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.quaternion.setFromUnitVectors(Y, dir);
  mesh.position.copy(from);
  return mesh;
}

async function woodMaterial(renderer, base) {
  const loader = new THREE.TextureLoader();
  const load = async (file, srgb) => {
    const t = await loader.loadAsync(`${base}fine_grained_wood_${file}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const [map, normalMap, arm] = await Promise.all([load('baseColor', true), load('normal'), load('arm')]);
  // the scan is a dark stained board; a snath is ash, weathered and handled, so it is lifted towards that
  return new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap: arm, color: new THREE.Color(2.7, 2.25, 1.7), roughness: 0.82, metalness: 0, normalScale: new THREE.Vector2(0.8, 0.8) });
}

/**
 * @param renderer for the textures' filtering
 * @param base where the wood's maps are
 */
export async function makeScythe(renderer, base = './assets/materials/fineGrainedWood/') {
  const group = new THREE.Group();
  const { map, orm, normal } = await steelTextures(renderer);
  const steel = new THREE.MeshStandardMaterial({ map, roughnessMap: orm, metalnessMap: orm, normalMap: normal, normalScale: new THREE.Vector2(1, 1), metalness: 1, roughness: 1, side: THREE.DoubleSide, envMapIntensity: 1.25 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x55565a, metalness: 1, roughness: 0.5, envMapIntensity: 1.2, side: THREE.DoubleSide });
  // The sun here is as strong as the grass's own shading wants it, which on bare metal is a searchlight: steel takes
  // a share of it, and its very brightest point is held where the bloom can carry it. The glint stays a glint: what
  // keeps it to a streak is the blade's shape, above, not this.
  for (const m of [steel, iron]) {
    m.onBeforeCompile = (shader) => {
      const cap = '{ reflectedLight.directSpecular *= 0.16; float most = max(reflectedLight.directSpecular.r, max(reflectedLight.directSpecular.g, reflectedLight.directSpecular.b)); reflectedLight.directSpecular *= min(1.0, 7.0 / max(most, 1e-4)); }';
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${cap}`);
    };
  }
  const wood = await woodMaterial(renderer, base);
  group.add(new THREE.Mesh(bladeGeometry(), steel));

  // the snath: bent the way they are steamed, so the blade lies flat while the mower stands
  const across = new THREE.Vector3().crossVectors(SNATH, new THREE.Vector3(1, 0, 0)).normalize();
  const over = new THREE.Vector3().crossVectors(SNATH, across).normalize();
  const along = (d, a = 0, o = 0) => SNATH.clone().multiplyScalar(d).addScaledVector(across, a).addScaledVector(over, o);
  const curve = new THREE.CatmullRomCurve3([along(-0.035), along(0.3, 0, 0.022), along(0.75, 0.012, -0.03), along(1.15, -0.01, -0.012), along(1.56, 0, 0.025)]);
  const length = curve.getLength();
  // thickest in the middle where the hands work it, drawn down to the foot where the ring goes on
  const tube = new THREE.TubeGeometry(curve, 96, 1, 20, false);
  {
    const p = tube.attributes.position;
    const uv = tube.attributes.uv;
    const centre = new THREE.Vector3();
    const at = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const t = uv.getX(i);
      curve.getPointAt(t, centre);
      at.fromBufferAttribute(p, i).sub(centre);
      const r = 0.0165 + 0.004 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.0015 * smooth(0.9, 1, t);
      // not quite round: a little deeper than it is wide
      const squash = 1 + 0.12 * Math.abs(at.dot(over));
      at.multiplyScalar(r * squash);
      p.setXYZ(i, centre.x + at.x, centre.y + at.y, centre.z + at.z);
    }
    tube.computeVertexNormals();
  }
  group.add(new THREE.Mesh(grain(tube, length, 0.12), wood));
  // its ends, rounded off
  for (const [t, way] of [
    [0, -1],
    [1, 1],
  ]) {
    const end = new THREE.Mesh(grain(new THREE.SphereGeometry(t ? 0.018 : 0.0166, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.03, 0.1, 0.4), wood);
    end.scale.y = 0.45;
    end.quaternion.setFromUnitVectors(Y, curve.getTangentAt(t).multiplyScalar(way));
    end.position.copy(curve.getPointAt(t));
    group.add(end);
  }

  // the two grips, turned, each on a stem let through the snath with an iron collar: the lower for the right hand,
  // the upper for the left
  const grip = [
    [0.0105, 0],
    [0.0115, 0.02],
    [0.0135, 0.03],
    [0.0125, 0.036],
    [0.0145, 0.05],
    [0.0185, 0.075],
    [0.02, 0.1],
    [0.0185, 0.125],
    [0.0155, 0.142],
    [0.0165, 0.15],
    [0.0135, 0.158],
    [0.006, 0.163],
    [0, 0.164],
  ];
  const collar = [
    [0.012, 0],
    [0.0225, 0],
    [0.0245, 0.002],
    [0.0245, 0.016],
    [0.0225, 0.018],
    [0.012, 0.018],
  ];
  for (const [at, turn] of [
    [1.0, 0.35],
    [1.5, -2.2],
  ]) {
    const p = curve.getPointAt(at / length);
    const t = curve.getTangentAt(at / length);
    const dir = across.clone().multiplyScalar(Math.cos(turn)).addScaledVector(over, Math.sin(turn)).normalize();
    group.add(turned(wood, grip, p.clone().addScaledVector(dir, 0.012), dir));
    group.add(turned(iron, collar, p.clone().addScaledVector(t, -0.009), t, false));
  }

  // where they meet: the blade's tang turned up and laid along the snath, a wedge driven under the ring to hold it
  const tangDir = curve.getTangentAt(0.03);
  const tang = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.17, 0.006), iron);
  tang.quaternion.setFromUnitVectors(Y, tangDir);
  tang.position.copy(along(0.07)).addScaledVector(over, 0.0195);
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.012), iron);
  knob.quaternion.copy(tang.quaternion);
  knob.position.copy(along(0.15)).addScaledVector(over, 0.014);
  const ring = [
    [0.012, 0],
    [0.0262, 0],
    [0.0285, 0.003],
    [0.0285, 0.03],
    [0.0262, 0.033],
    [0.012, 0.033],
  ];
  const wedge = new THREE.Mesh(grain(new THREE.CylinderGeometry(0.004, 0.0075, 0.075, 4, 1), 0.075, 0.03, 0.7), wood);
  wedge.quaternion.setFromUnitVectors(Y, tangDir);
  wedge.position.copy(along(0.105)).addScaledVector(over, -0.0195);
  // the blade's neck, from the heel up into the tang
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.007, 0.03), iron);
  neck.position.set(0.012, 0.004, backAt(0) - 0.012);
  group.add(tang, knob, wedge, neck, turned(iron, ring, along(0.085), tangDir, false), turned(iron, collar, along(0.0), tangDir, false));
  return group;
}
