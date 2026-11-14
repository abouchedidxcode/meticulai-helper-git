// The wanderer of this page: a little girl in a red hooded cloak, with a basket of flowers on her arm. A pointed
// hood with its tip fallen back, the cloak gathered at her neck and tied in a bow, hanging in folds to her knees;
// under it a white blouse with puffed sleeves and a blue skirt, white stockings, brown boots; chestnut hair in two
// braids, and red cheeks.
//
// Underneath she is Patch's starter man (his bones, his clips, his way of moving), drawn smaller, and nothing of
// that body is drawn. Her cloak is not his: it hangs from three joints of its own, which swing back as she runs
// and to the side as she turns, and are never quite still.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadMan } from './figure/man.js';
import { noise } from './noise.js';
import { ball, knead, ring, roll, sstep, turned } from './shape.js';
import { field, hue } from './pencil.js';
import { SUN } from './glade/world.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2, SMALL = 0.86;
const WHITE = '#f8f2e4', SKIN = '#f8cfae', BLUE = '#4f74b4', BOOT = '#7d5232', HAIR = '#8a5630', WICKER = ['#c99a52', '#a87a3c'];
const RED = new THREE.Color('#d6332c'), DEEP = new THREE.Color('#7f1630'), WARM = new THREE.Color('#f4683e');

export async function createFigure(mats, onProgress) {
  const man = await loadMan({ base: './figure/', onProgress });
  for (const mesh of man.meshes) mesh.visible = false;
  man.object.updateMatrixWorld(true);
  const B = man.bones, real = Object.keys(B), CLOAK = ['cloak_1', 'cloak_2', 'cloak_3'], names = [...real, ...CLOAK], id = Object.fromEntries(names.map((n, i) => [n, i]));
  const at = (name) => new THREE.Vector3().setFromMatrixPosition(B[name].matrixWorld);

  // every piece is given its pigment, the way its pencil lies, and which bones each point of it goes with
  const parts = { line: [], both: [] }, v = new THREE.Vector3();
  let count = 0;
  function add(g, colour, weigh, { a, b, lumps = 0.003, into = 'line' } = {}) {
    if (lumps) knead(g, lumps, 9, ++count); else g.computeVertexNormals();
    field(g, a, b);
    hue(g, colour);
    const p = g.attributes.position, si = new Uint16Array(p.count * 4), sw = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) {
      const list = weigh(v.fromBufferAttribute(p, i)).filter(([, w]) => w > 1e-4).slice(0, 4);
      let sum = 0;
      for (const [, w] of list) sum += w;
      list.forEach(([name, w], k) => { si[i * 4 + k] = id[name]; sw[i * 4 + k] = w / sum; });
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.deleteAttribute('uv');
    parts[into].push(g.index ? g.toNonIndexed() : g);
  }
  const only = (name) => () => [[name, 1]];

  const P = at('pelvis'), S1 = at('spine_01'), S2 = at('spine_02'), S3 = at('spine_03'), N = at('neck_01'), H = at('Head');
  const KNEE = at('calf_l').y, zc = (P.z + S3.z) / 2, left = Math.sign(at('thigh_l').x - P.x) || 1;
  const mids = [(P.y + S1.y) / 2, (S1.y + S2.y) / 2, (S2.y + S3.y) / 2, (S3.y + N.y) / 2], spine = ['pelvis', 'spine_01', 'spine_02', 'spine_03'];
  const trunk = (p) => {
    if (p.y <= mids[0]) return [['pelvis', 1]];
    for (let i = 0; i < 3; i++) if (p.y < mids[i + 1]) { const t = (p.y - mids[i]) / (mids[i + 1] - mids[i]); return [[spine[i], 1 - t], [spine[i + 1], t]]; }
    return [['spine_03', 1]];
  };

  // --- the blouse, and a blue sash at her waist ---
  const waist = P.y + 0.07, top = N.y + 0.02, SX = 0.98, SZ = 0.8;
  add(turned([[0, waist - 0.03], [0.165, waist - 0.03], [0.172, S1.y + 0.05], [0.18, S2.y + 0.05], [0.188, S3.y + 0.02], [0.17, S3.y + 0.12], [0.1, N.y - 0.02], [0.072, top], [0, top + 0.01]], 26).scale(SX, 1, SZ).translate(P.x, 0, zc), WHITE, trunk, { lumps: 0.004 });
  add(roll(ring(V(P.x, waist, zc), V(0, 1, 0), 0.17, 20).map((p) => V(P.x + (p.x - P.x) * SX, p.y, zc + (p.z - zc) * SZ)), 0.03, { closed: true, around: 6, every: 0.04, flat: 1.5 }), '#3f5f9c', trunk, { lumps: 0 });

  // --- the skirt: blue, in folds, to just above her knees, with a white band at its hem. It goes with her legs. ---
  {
    const hem = KNEE + 0.1, g = turned([[0.16, waist + 0.01], [0.19, P.y + 0.0], [0.24, (P.y + hem) / 2], [0.285, hem]], 30), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = (waist - p.getY(i)) / (waist - hem), k = 1 + 0.045 * t * Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 11); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    g.scale(1, 1, 0.84).translate(P.x, 0, zc);
    const pale = new THREE.Color(WHITE), blue = new THREE.Color(BLUE), dark = new THREE.Color('#3a5a98'), c = new THREE.Color();
    add(g, (x, y, z) => { const t = (waist - y) / (waist - hem); return t > 0.9 ? pale : c.copy(blue).lerp(dark, 0.5 + 0.5 * Math.sin(Math.atan2(z - zc, x - P.x) * 11 + 1.6)); }, (p) => {
      const t = Math.min(1, Math.max(0, (waist - p.y) / (waist - hem))), k = 0.8 * t ** 1.3, l = sstep(-0.07, 0.07, (p.x - P.x) * left);
      return [['pelvis', 1 - k], ['thigh_l', k * l], ['thigh_r', k * (1 - l)]];
    }, { lumps: 0, into: 'both', a: [0.2, 1, 0.1], b: [1, 0.3, 0.3] });
  }

  for (const s of ['l', 'r']) {
    // --- an arm: a puffed white sleeve to above the elbow, a bare forearm, a hand ---
    const sh = at(`upperarm_${s}`), el = at(`lowerarm_${s}`), wr = at(`hand_${s}`);
    const upper = el.clone().sub(sh).normalize(), lower = wr.clone().sub(el).normalize(), whole = wr.clone().sub(sh).normalize();
    const arm = (p) => {
      const bend = sstep(-0.07, 0.07, p.clone().sub(el).dot(whole)), root = 0.5 * (1 - sstep(0, 0.1, p.clone().sub(sh).dot(upper)));
      return [[`clavicle_${s}`, root], [`upperarm_${s}`, (1 - bend) * (1 - root)], [`lowerarm_${s}`, bend * (1 - root)]];
    };
    const cuff = sh.clone().lerp(el, 0.72);
    add(roll([sh.clone().addScaledVector(upper, -0.03), sh.clone().lerp(el, 0.3), cuff], (t) => 0.082 + 0.03 * Math.sin(Math.PI * t) - 0.02 * t, { around: 12, every: 0.03 }), WHITE, arm, { a: whole.toArray(), b: [0.7, 0.2, 0.7], lumps: 0.005 });
    add(roll(ring(cuff, upper, 0.062, 12), 0.02, { closed: true, around: 6, every: 0.03 }), '#e9dfca', arm, { lumps: 0 });
    add(roll([cuff, el, el.clone().lerp(wr, 0.5), wr.clone().addScaledVector(lower, 0.01)], (t) => 0.055 - 0.012 * t, { around: 10, every: 0.035 }), SKIN, arm, { a: lower.toArray(), b: [0.7, 0.2, 0.7] });
    add(ball(0.058, 3).scale(0.92, 1.2, 0.8).translate(wr.x + lower.x * 0.06, wr.y + lower.y * 0.06, wr.z + lower.z * 0.06), SKIN, only(`hand_${s}`), { a: lower.toArray(), b: [1, 0, 0.3] });

    // --- a leg: a white stocking, a brown boot with its top turned down ---
    const hip = at(`thigh_${s}`), kn = at(`calf_${s}`), an = at(`foot_${s}`), toe = at(`ball_${s}`), leg = an.clone().sub(hip).normalize(), shin = an.clone().sub(kn).normalize();
    add(roll([hip.clone().lerp(kn, 0.3), hip.clone().lerp(kn, 0.6), kn, kn.clone().lerp(an, 0.55)], (t) => 0.074 - 0.02 * t, { around: 12, every: 0.04 }), WHITE, (p) => {
      const bend = sstep(-0.08, 0.08, p.clone().sub(kn).dot(leg));
      return [[`thigh_${s}`, 1 - bend], [`calf_${s}`, bend]];
    }, { a: leg.toArray(), b: [0.9, 0.05, 0.4] });
    const bootTop = kn.clone().lerp(an, 0.5);
    add(roll([bootTop, an.clone().add(V(0, 0.03, 0))], (t) => 0.072 - 0.006 * t, { around: 10, every: 0.04 }), BOOT, only(`calf_${s}`), { a: shin.toArray(), b: [1, 0.1, 0.4] });
    add(roll(ring(bootTop, shin, 0.074, 12), 0.022, { closed: true, around: 6, every: 0.03, flat: 1.2 }), '#96683f', only(`calf_${s}`), { lumps: 0 });
    const fwd = toe.clone().sub(an).setY(0).normalize(), yaw = Math.atan2(fwd.x, fwd.z);
    add(ball(1, 3).scale(0.09, 0.078, 0.175).rotateY(yaw).translate(an.x + fwd.x * 0.07, 0.083, an.z + fwd.z * 0.07), BOOT, only(`foot_${s}`), { a: [fwd.x, 0.2, fwd.z], b: [0.3, 1, 0] });
    add(ball(1, 2).scale(0.095, 0.03, 0.18).rotateY(yaw).translate(an.x + fwd.x * 0.07, 0.026, an.z + fwd.z * 0.07), '#4a3423', only(`foot_${s}`), { lumps: 0 });

    // --- the basket, on her left arm: wicker, a cloth, and what she has picked ---
    if (s === 'l') {
      const out = V(0, 1, 0).addScaledVector(lower, -lower.y).normalize(), grip = wr.clone().addScaledVector(lower, 0.05).addScaledVector(out, 0.07), q = new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), lower);
      const hang = (g) => g.applyQuaternion(q).translate(grip.x, grip.y, grip.z), hand = only(`hand_${s}`);
      const bowl = turned([[0, -0.3], [0.085, -0.3], [0.118, -0.25], [0.13, -0.19], [0.138, -0.165], [0.12, -0.165], [0, -0.17]], 18), tones = WICKER.map((c) => new THREE.Color(c));
      add(hang(bowl), (x, y, z, i) => tones[(Math.floor(i / 3) + Math.floor(i / 19)) % 2], hand, { lumps: 0.004, a: [0.1, 1, 0.1], b: [1, 0.2, 0.2] });
      add(hang(roll(ring(V(0, -0.165, 0), V(0, 1, 0), 0.132, 16), 0.014, { closed: true, around: 6, every: 0.03 })), WICKER[1], hand, { lumps: 0 });
      add(hang(roll(Array.from({ length: 11 }, (_, i) => { const a = (i / 10) * Math.PI; return V(Math.cos(a) * 0.125, -0.17 + Math.sin(a) * 0.17, 0); }), 0.013, { around: 6, every: 0.03 })), WICKER[1], hand, { lumps: 0 });
      add(hang(ball(1, 2).scale(0.115, 0.035, 0.115).translate(0, -0.165, 0)), WHITE, hand, { lumps: 0.004 });
      [['#e8433a', 0.05, 0.03], ['#f7cf2a', -0.04, 0.05], ['#fffaf0', 0.0, -0.05], ['#4f78d8', -0.06, -0.02], ['#f08ab0', 0.065, -0.04], ['#f7cf2a', 0.02, 0.07], ['#e8433a', -0.02, 0.0]].forEach(([c, fx, fz], k) => {
        add(hang(ball(0.03 + 0.006 * (k % 3), 1).translate(fx, -0.118 + 0.012 * (k % 2), fz)), c, hand, { lumps: 0 });
        add(hang(ball(0.026, 1).scale(1, 0.5, 1).translate(fx * 0.7 + 0.02, -0.14, fz * 0.7 - 0.02)), '#6fa544', hand, { lumps: 0 });
      });
    }
  }

  // --- the head: a round face with red cheeks, a fringe, two braids ---
  const R = 0.19, C = V(H.x, H.y + 0.125, H.z + 0.012), head = only('Head');
  const on = (g, x, y, z) => g.translate(C.x + x, C.y + y, C.z + z);
  add(on(ball(R, 4).scale(0.98, 1.0, 0.96), 0, 0, 0), SKIN, head, { a: [0.5, 1, 0.3], b: [-0.7, 1, 0.2] });
  add(on(ball(0.026, 2), 0, -0.022, 0.185), '#f0b494', head);
  add(roll([V(C.x - 0.04, C.y - 0.074, C.z + 0.168), V(C.x, C.y - 0.09, C.z + 0.176), V(C.x + 0.04, C.y - 0.074, C.z + 0.168)], 0.009, { around: 5, every: 0.02 }), '#b0524a', head, { lumps: 0 });
  for (const s of [-1, 1]) {
    add(on(ball(0.025, 2), s * 0.066, 0.025, 0.172), '#2a2420', head, { lumps: 0 });
    add(on(ball(0.042, 2).scale(1, 0.8, 0.3), s * 0.108, -0.042, 0.148), '#f58f86', head, { lumps: 0 });
    // a braid, over her shoulder and down her front, tied with a red ribbon
    const braid = [V(C.x + s * 0.15, C.y - 0.08, C.z + 0.07), V(C.x + s * 0.155, N.y - 0.03, zc + 0.13), V(C.x + s * 0.13, S3.y + 0.02, zc + 0.175), V(C.x + s * 0.12, S2.y + 0.04, zc + 0.18)];
    const hangs = (p) => { const k = sstep(N.y - 0.02, N.y + 0.1, p.y); return [['Head', k], ['spine_03', 1 - k]]; };
    add(roll(braid, (t) => 0.042 - 0.012 * t + 0.008 * Math.sin(t * 34), { around: 8, every: 0.02 }), HAIR, hangs, { a: [1, 0.6, 0.2], b: [-1, 0.6, 0.2], lumps: 0.004 });
    add(ball(0.03, 2).translate(braid[3].x, braid[3].y - 0.005, braid[3].z), '#c0282e', only('spine_03'), { lumps: 0 });
    add(ball(0.03, 2).scale(0.8, 1.4, 0.8).translate(braid[3].x, braid[3].y - 0.05, braid[3].z), HAIR, only('spine_03'));
  }
  // her fringe: parted in the middle and swept to either side, high on her forehead under the hood's edge
  // (straight across and low, it was a single eyebrow)
  for (const [x, y, r] of [[-0.03, 0.168, 0.05], [0.03, 0.168, 0.05], [-0.082, 0.15, 0.052], [0.082, 0.15, 0.052], [-0.126, 0.118, 0.05], [0.126, 0.118, 0.05], [-0.155, 0.075, 0.042], [0.155, 0.075, 0.042], [0, 0.19, 0.05], [-0.07, 0.185, 0.05], [0.07, 0.185, 0.05]]) {
    add(on(ball(r, 2).scale(1, 0.72, 0.55), x, y, Math.sqrt(Math.max(0.0004, R * R - x * x - y * y)) * 0.96 + 0.004), HAIR, head, { a: [0.3, 1, 0.2], lumps: 0.005 });
  }
  // and her eyebrows: two small light strokes, well above her eyes
  for (const s of [-1, 1]) add(roll([V(C.x + s * 0.045, C.y + 0.078, C.z + 0.172), V(C.x + s * 0.068, C.y + 0.086, C.z + 0.166), V(C.x + s * 0.09, C.y + 0.079, C.z + 0.157)], 0.006, { around: 5, every: 0.015 }), '#a8744a', head, { lumps: 0 });

  // --- the cloak ---
  const tone = new THREE.Color();
  /** Red, deeper down in a fold and warmer on the ridge of one, never one flat colour. */
  const red = (fold, x, y, z, deep = 0) => tone.copy(RED).lerp(DEEP, Math.min(1, Math.max(0, -fold) ** 0.7 * 0.95 + deep)).lerp(WARM, Math.max(0, fold) * 0.6 + 0.22 * Math.max(0, noise(x * 9 + 3, y * 9 + z * 7)));
  {
    // its hood: round her face, open in front, coming to a point that stands up at the back
    const g = turned([[0, 0.40], [0.11, 0.33], [0.185, 0.22], [0.2, 0.1], [0.198, 0.0], [0.228, -0.014], [0.252, 0.05], [0.266, 0.15], [0.246, 0.26], [0.18, 0.37], [0.1, 0.46], [0.05, 0.54], [0.02, 0.59], [0, 0.6]], 26).rotateX(-Math.PI / 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z < 0) p.setY(i, p.getY(i) + 0.82 * z * z); }
    g.translate(C.x, C.y + 0.03, C.z + 0.085);
    add(g, (x, y, z, i, nx, ny, nz) => red(ny * 0.9, x, y, z, Math.hypot(x - C.x, y - C.y - 0.03) < 0.2 && z > C.z - 0.1 && nz > 0.2 ? 0.5 : 0), head, { lumps: 0.006, a: [0.5, 0.5, 0.7], b: [-0.7, 0.5, 0.5] });
    // gathered at her neck, and tied in a bow
    add(roll(ring(V(P.x, N.y - 0.0, zc + 0.01), V(0, 1, -0.1), 0.115, 14), 0.042, { closed: true, around: 8, every: 0.03 }), RED, only('spine_03'), { a: [1, 0.2, 0.1], b: [0.1, 1, 0.2] });
    add(ball(0.036, 2).translate(P.x, N.y - 0.03, zc + 0.135), DEEP, only('spine_03'));
    for (const s of [-1, 1]) {
      add(ball(1, 2).scale(0.062, 0.04, 0.03).rotateZ(s * 0.35).translate(P.x + s * 0.062, N.y - 0.022, zc + 0.14), RED, only('spine_03'));
      add(roll([V(P.x + s * 0.01, N.y - 0.045, zc + 0.14), V(P.x + s * 0.04, N.y - 0.11, zc + 0.165), V(P.x + s * 0.05, N.y - 0.18, zc + 0.16)], (t) => 0.02 - 0.006 * t, { around: 6, every: 0.03, flat: 1.6 }), RED, only('spine_03'));
    }
  }
  const NECK = N.y - 0.01, HEM = KNEE + 0.06, pivot = V(P.x, NECK - 0.12, zc - 0.1);
  {
    // and the cloak itself: gathered at the neck, over her shoulders, and down her back in folds to its hem
    const NU = 44, NT = 30, pos = [], index = [];
    for (let j = 0; j <= NT; j++) for (let i = 0; i <= NU; i++) {
      const t = j / NT, u = (i / NU) * 2 - 1, open = sstep(0, 0.14, t), a = u * (1.75 - 0.72 * sstep(0.1, 0.45, t));
      const fold = 1 + 0.15 * t * Math.sin(a * 8 + 1.3) + 0.04 * t * Math.sin(a * 17 + 0.4);
      const rx = (0.1 + 0.105 * open + 0.17 * t) * fold, rz = (0.095 + 0.12 * open + 0.15 * t) * fold;
      // (its hem dips at the back and lifts a little at its two edges)
      pos.push(P.x + Math.sin(a) * rx, NECK + 0.02 - (NECK + 0.02 - HEM) * t * (1 - 0.06 * u * u * t - 0.022 * t * Math.sin(a * 8 + 1.3)), zc - Math.cos(a) * rz);
      if (i < NU && j < NT) { const k = j * (NU + 1) + i; index.push(k, k + NU + 1, k + 1, k + 1, k + NU + 1, k + NU + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(index);
    const down = (y) => Math.min(1, Math.max(0, (NECK + 0.02 - y) / (NECK + 0.02 - HEM)));
    add(g, (x, y, z) => { const t = down(y), a = Math.atan2(x - P.x, -(z - zc)); return red(Math.sin(a * 8 + 1.3) * Math.min(1, t * 2.5), x, y, z, 0.3 * sstep(0.9, 1, t)); }, (p) => {
      const u = Math.max(0, (down(p.y) - 0.14) / 0.86) * 3, k = Math.min(2, Math.floor(u)), f = u - k, chain = ['spine_03', ...CLOAK];
      return [[chain[k], 1 - f], [chain[k + 1], f]];
    }, { lumps: 0, into: 'both', a: [0.25, 1, 0.1], b: [1, 0.25, 0.3] });
  }

  // --- her bones, and the cloak's three joints after them ---
  const bones = [...real.map((n) => B[n]), ...CLOAK.map(() => new THREE.Bone())], inverses = [...real.map((n) => B[n].matrixWorld.clone().invert()), ...CLOAK.map(() => new THREE.Matrix4())];
  const skeleton = new THREE.Skeleton(bones, inverses);
  skeleton.computeBoneTexture();
  skeleton.update = () => {};
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  for (const [key, material] of [['line', mats.line], ['both', mats.both]]) {
    const body = new THREE.SkinnedMesh(mergeGeometries(parts[key]), material);
    body.bindMode = THREE.DetachedBindMode;
    body.bind(skeleton, new THREE.Matrix4());
    body.castShadow = body.receiveShadow = true;
    body.frustumCulled = false;
    group.add(body);
  }
  const outer = new THREE.Group();
  outer.add(group);
  // The shade she stands in. Her legs are too slight to throw much of a shadow, and without one under her feet
  // she would seem to hang in the air: so, as a painter would, a soft pool of violet is laid on the ground there,
  // drawn out a little the way her shadow falls.
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        // deepest right under her, at the near end of it
        float d = length(vec2(vP.x * 1.15, (vP.y - 0.3) * (vP.y < 0.3 ? 0.78 : 1.5)));
        float a = (1.0 - smoothstep(0.15, 1.0, d)) * 0.52;
        gl_FragColor = vec4(mix(vec3(1.0), vec3(0.42, 0.4, 0.72), a), 1.0);
      }`,
  }));
  shade.scale.set(0.95, 1, 1.7);
  shade.rotation.y = Math.atan2(-SUN.x, -SUN.z);
  shade.renderOrder = 3;
  shade.frustumCulled = false;
  outer.add(shade);

  // The cloak's swing: how far back it stands off her, and how far to one side. Each is a weight on a spring, drawn
  // to where her going would carry it.
  const sw = { back: 0.08, backV: 0, side: 0, sideV: 0, t: 0, x: null, z: 0, yaw: 0, speed: 0 };
  const inverse = new THREE.Matrix4(), M = new THREE.Matrix4(), S = new THREE.Matrix4(), T0 = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z), T1 = new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z), Rm = new THREE.Matrix4(), E = new THREE.Euler();
  const small = V(SMALL, SMALL, SMALL), n3 = real.length;
  return {
    man, group: outer,
    simulate(dt) {
      const p = man.object.position, yaw = man.object.rotation.y;
      if (sw.x != null && dt > 0) {
        const vx = (p.x - sw.x) / dt, vz = (p.z - sw.z) / dt, fwd = vx * Math.sin(yaw) + vz * Math.cos(yaw), across = vx * Math.cos(yaw) - vz * Math.sin(yaw);
        const turned = Math.atan2(Math.sin(yaw - sw.yaw), Math.cos(yaw - sw.yaw)) / dt;
        const wantBack = Math.min(0.3, Math.max(0.05, 0.07 + 0.03 * fwd)), wantSide = Math.min(0.4, Math.max(-0.4, -0.06 * across + 0.045 * turned));
        sw.backV += (46 * (wantBack - sw.back) - 7.5 * sw.backV) * dt; sw.back += sw.backV * dt;
        sw.sideV += (40 * (wantSide - sw.side) - 6.5 * sw.sideV) * dt; sw.side += sw.sideV * dt;
        sw.speed = Math.hypot(vx, vz);
      }
      sw.x = p.x; sw.z = p.z; sw.yaw = yaw; sw.t += dt;
    },
    /** She is drawn where the man is, and smaller. */
    follow() {
      group.matrix.copy(man.object.matrixWorld).scale(small);
      // (drawn smaller, her lower foot would no longer be where his is: she is set down so that it is)
      const e = group.matrix.elements, low = Math.min(B.foot_l.matrixWorld.elements[13], B.foot_r.matrixWorld.elements[13]);
      e[13] += (1 - SMALL) * (low - 0.09 - e[13]);
      group.matrixWorldNeedsUpdate = true;
      const away = 0.28 / Math.hypot(SUN.x, SUN.z);
      shade.position.set(e[12] - SUN.x * away, Math.min(e[13], low - 0.09) + 0.035, e[14] - SUN.z * away);
    },
    /** Takes her pose from the bones as they are now, and the cloak's from its swing. */
    pose() {
      inverse.copy(man.object.matrixWorld).invert();
      const out = skeleton.boneMatrices;
      for (let i = 0; i < n3; i++) M.multiplyMatrices(inverse, bones[i].matrixWorld).multiply(inverses[i]).toArray(out, i * 16);
      S.fromArray(out, id.spine_03 * 16);
      const lean = Math.atan2(S.elements[6], S.elements[5]);
      for (let k = 0; k < 3; k++) {
        const far = [0.3, 0.72, 1.25][k], stir = 0.022 * Math.sin(sw.t * 3.1 + k * 1.1) * (1 + 0.35 * sw.speed);
        E.set(Math.max(0.01, sw.back * far + stir - lean * [0.15, 0.42, 0.62][k]), 0, sw.side * far + 0.7 * stir * Math.cos(sw.t * 2.3 + k));
        M.copy(S).multiply(T0).multiply(Rm.makeRotationFromEuler(E)).multiply(T1).toArray(out, (n3 + k) * 16);
      }
      skeleton.boneTexture.needsUpdate = true;
    },
  };
}
