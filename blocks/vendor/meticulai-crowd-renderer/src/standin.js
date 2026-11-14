// STAND-IN HORSE, ARCHER AND KNIGHT, built entirely in code. From TUMEN by Meticulai. Built so the crowd renderer,
// the movement law and the proof tool could be developed and checked before any real model existed, and so a game
// still runs if one is missing. They follow the asset contract in HOW-TO-USE.md (bone names, clip names, LODs, seat,
// hoof contacts), which makes them drop-in: crowd.register() takes either a GLB url or one of these.
//
// The horse's clips are generated, not animated by hand: each hoof is placed by a footfall table (which phase it
// lands, how long it stays down) and during stance it travels straight back at exactly one stride per cycle, the legs
// follow by two-bone IK. So the stand-in's hooves cannot slide by construction, and its meta is exact. That gives
// a movement checker a known-good baseline to measure a real horse against.
//
// Each builder returns { name, root (Object3D holding SkinnedMeshes named <name>_lod0/1/2 on one skeleton),
// clips: [{ name, duration, loop, pose(t) }], meta }.
import * as THREE from 'three';
import { DEFAULT_GAITS } from './locomotion.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const QX = (q, a) => q.setFromAxisAngle(AX, a);
const AX = V(1, 0, 0), AY = V(0, 1, 0), AZ = V(0, 0, 1), DOWN = V(0, -1, 0);
const sstep = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- mesh building
class Rig {
  constructor() { this.bones = []; this.byName = {}; this.world = {}; }
  bone(name, parent, x, y, z) {
    const b = new THREE.Bone(); b.name = name;
    const p = parent ? this.world[parent] : V(0, 0, 0);
    b.position.set(x - p.x, y - p.y, z - p.z);
    if (parent) this.byName[parent].add(b);
    this.world[name] = V(x, y, z); this.byName[name] = b; b.userData.index = this.bones.length; this.bones.push(b);
    return b;
  }
  idx(name) { return this.byName[name].userData.index; }
}
class MeshB {
  constructor(rig) { this.rig = rig; this.p = []; this.c = []; this.e = []; this.si = []; this.sw = []; this.i = []; }
  vert(x, y, z, col, mask, bone, bone2 = null, w2 = 0) {
    this.p.push(x, y, z); this.c.push(col[0], col[1], col[2]); this.e.push(mask[0], mask[1], mask[2] || 0);
    this.si.push(this.rig.idx(bone), bone2 ? this.rig.idx(bone2) : 0, 0, 0); this.sw.push(1 - w2, w2, 0, 0);
    return this.p.length / 3 - 1;
  }
  // rings: [{ p: [x,y,z], r: [rx, ry], b: bone, b2?, w2? }]; closed tube with optional caps
  tube(rings, sides, col, mask, { cap0 = true, cap1 = true, up = null } = {}) {
    const first = this.p.length / 3, n = rings.length, t = V(), u = V(), v = V(), ref = V();
    for (let k = 0; k < n; k++) {
      const a = rings[Math.max(0, k - 1)].p, b = rings[Math.min(n - 1, k + 1)].p, R = rings[k];
      t.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      if (up) ref.copy(up); else ref.set(0, 1, 0);
      if (Math.abs(t.dot(ref)) > 0.92) ref.set(0, 0, up ? 1 : -1);
      u.crossVectors(ref, t).normalize(); v.crossVectors(t, u);
      const rx = Array.isArray(R.r) ? R.r[0] : R.r, ry = Array.isArray(R.r) ? R.r[1] : R.r;
      for (let s = 0; s < sides; s++) {
        const th = (s / sides) * TAU, cx = Math.cos(th) * rx, cy = Math.sin(th) * ry;
        this.vert(R.p[0] + u.x * cx + v.x * cy, R.p[1] + u.y * cx + v.y * cy, R.p[2] + u.z * cx + v.z * cy, R.col || col, mask, R.b, R.b2, R.w2);
      }
    }
    for (let k = 0; k < n - 1; k++) for (let s = 0; s < sides; s++) {
      const a = first + k * sides + s, b = first + k * sides + (s + 1) % sides, c = a + sides, d = b + sides;
      this.i.push(a, c, b, b, c, d);
    }
    const cap = (k, flip) => {
      const R = rings[k], ci = this.vert(R.p[0], R.p[1], R.p[2], R.col || col, mask, R.b, R.b2, R.w2);
      for (let s = 0; s < sides; s++) { const a = first + k * sides + s, b = first + k * sides + (s + 1) % sides; if (flip) this.i.push(ci, b, a); else this.i.push(ci, a, b); }
    };
    if (cap0) cap(0, false); if (cap1) cap(n - 1, true);
  }
  build(skeleton, name) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aExtra', new THREE.Float32BufferAttribute(this.e, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.i);
    g.computeVertexNormals();
    const m = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }));
    m.name = name; m.bind(skeleton, new THREE.Matrix4());
    return m;
  }
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------------------------------------------------------------- the horse
// Footfalls: [touchdown phase, duty] per hoof, order fl, fr, hl, hr. Phase 0 is the left hind landing in every gait.
const FOOTFALL = {
  walk: { hl: [0.0, 0.58], fl: [0.25, 0.58], hr: [0.5, 0.58], fr: [0.75, 0.58] },
  trot: { hl: [0.0, 0.38], fr: [0.0, 0.38], hr: [0.5, 0.38], fl: [0.5, 0.38] },
  canter: { hl: [0.0, 0.28], hr: [0.16, 0.28], fl: [0.16, 0.28], fr: [0.36, 0.28] },      // right lead, three beats
  gallop: { hl: [0.0, 0.19], hr: [0.09, 0.19], fl: [0.34, 0.19], fr: [0.43, 0.19] },      // four beats then air
};
const HOOVES = ['fl', 'fr', 'hl', 'hr'];
const BODY = {   // bob (m), pitch (rad, + = nose up), where in the cycle the body is lowest, beats per cycle, hoof lift
  walk: { bob: 0.012, pitch: 0.008, low: 0.14, beats: 2, lift: 0.11, neck: 0.05 },
  trot: { bob: 0.032, pitch: 0.006, low: 0.19, beats: 2, lift: 0.17, neck: 0.015 },
  canter: { bob: 0.05, pitch: 0.06, low: 0.34, beats: 1, lift: 0.24, neck: 0.07 },
  gallop: { bob: 0.055, pitch: 0.045, low: 0.33, beats: 1, lift: 0.3, neck: 0.09 },
};

export function buildHorse({ name = 'horse', scale = 1, heavy = false, gaits = DEFAULT_GAITS, exact = false } = {}) {      // exact: the gait table is this horse's own (do not scale it)
  // { walk: { stride, duration }, ... } from locomotion DEFAULT_GAITS (strides for a horse of scale 1), or with `exact`
  // this horse's own table (strides in the world: the model is built at 1 / scale and scaled up at the end)
  const G = exact ? Object.fromEntries(Object.entries(gaits).map(([k, v]) => [k, { ...v, stride: v.stride / scale }])) : gaits;
  const rig = new Rig();
  const bw = heavy ? 1.14 : 1;                 // barrel and limb thickness (the destrier)
  const SH = V(0.16, 1.03, 0.42), HIP = V(0.16, 1.05, -0.48), ANK = 0.07;
  const FL1 = 0.30, FL2 = 0.80, HL1 = 0.56, HL2 = 0.58;
  rig.bone('root', null, 0, 0, 0);
  rig.bone('body', 'root', 0, 1.02, 0);
  rig.bone('seat', 'body', 0, 1.385, -0.06);
  rig.bone('neck1', 'body', 0, 1.14, 0.5);
  rig.bone('neck2', 'neck1', 0, 1.33, 0.7);
  rig.bone('head', 'neck2', 0, 1.52, 0.88);
  rig.bone('tail1', 'body', 0, 1.2, -0.7);
  rig.bone('tail2', 'tail1', 0, 0.9, -0.82);
  const legs = {};
  for (const h of HOOVES) {
    const front = h[0] === 'f', sx = h[1] === 'l' ? 1 : -1, P = front ? SH : HIP, L1 = front ? FL1 : HL1, L2 = front ? FL2 : HL2;
    rig.bone('upper_' + h, 'body', sx * P.x, P.y, P.z);
    rig.bone('lower_' + h, 'upper_' + h, sx * P.x, P.y - L1, P.z);
    rig.bone('hoof_' + h, 'lower_' + h, sx * P.x, P.y - L1 - L2, P.z);
    legs[h] = { front, sx, L1, L2, pivot: V(sx * P.x, P.y, P.z).sub(rig.world.body), zc: front ? P.z + 0.02 : P.z + 0.1 };
  }
  rig.byName.root.updateMatrixWorld(true);       // bind matrices are taken from the bones' world matrices: they must exist first
  const skeleton = new THREE.Skeleton(rig.bones);
  const root = new THREE.Group(); root.name = name; root.add(rig.byName.root);

  const COAT = [0.78, 0.66, 0.5], DARK = [0.13, 0.1, 0.085], HOOF = [0.1, 0.09, 0.08], FELT = [0.62, 0.6, 0.55], LEATHER = [0.3, 0.19, 0.12], MUZ = [0.36, 0.3, 0.26];
  const mk = (lod) => {
    const m = new MeshB(rig), S = [12, 8, 5][lod], LS = [8, 6, 4][lod], coat = [1, 0, 0], none = [0, 0, 0], cloth = [0, 1, 0];
    // barrel (rump to chest)
    let rings = [
      { p: [0, 1.1, -0.74], r: [0.08, 0.1] }, { p: [0, 1.07, -0.66], r: [0.22 * bw, 0.24] }, { p: [0, 1.03, -0.45], r: [0.275 * bw, 0.3] },
      { p: [0, 0.98, -0.1], r: [0.29 * bw, 0.31] }, { p: [0, 0.99, 0.25], r: [0.275 * bw, 0.31] }, { p: [0, 1.04, 0.5], r: [0.22 * bw, 0.28] },
      { p: [0, 1.1, 0.64], r: [0.1, 0.15] }];
    if (lod === 2) rings = [rings[0], rings[2], rings[4], rings[6]];
    m.tube(rings.map((r) => ({ ...r, b: 'body' })), S, COAT, coat);
    // neck and head
    const neck = [
      { p: [0, 1.1, 0.5], r: [0.15 * bw, 0.23], b: 'body' }, { p: [0, 1.25, 0.62], r: [0.12 * bw, 0.19], b: 'neck1' },
      { p: [0, 1.4, 0.76], r: [0.1 * bw, 0.15], b: 'neck2' }, { p: [0, 1.52, 0.86], r: [0.09, 0.12], b: 'head' }];
    m.tube(lod === 2 ? [neck[0], neck[2], neck[3]] : neck, S, COAT, coat, { cap0: false });
    const head = [
      { p: [0, 1.58, 0.84], r: [0.085, 0.09] }, { p: [0, 1.52, 0.95], r: [0.095, 0.11] }, { p: [0, 1.4, 1.1], r: [0.075, 0.085] },
      { p: [0, 1.3, 1.22], r: [0.058, 0.062], col: MUZ }, { p: [0, 1.26, 1.26], r: [0.045, 0.045], col: MUZ }];
    m.tube((lod === 2 ? [head[0], head[1], head[3]] : head).map((r) => ({ ...r, b: 'head' })), S, COAT, coat);
    if (lod < 2) for (const sx of [1, -1]) m.tube([{ p: [sx * 0.06, 1.6, 0.86], r: [0.035, 0.02], b: 'head' }, { p: [sx * 0.085, 1.72, 0.84], r: 0.004, b: 'head' }], 4, COAT, coat, { cap0: false });
    // mane (a crest along the neck) and forelock, tail
    const mane = [{ p: [0, 1.2, 0.5], r: [0.035, 0.07], b: 'body' }, { p: [0, 1.4, 0.62], r: [0.04, 0.09], b: 'neck1' }, { p: [0, 1.55, 0.76], r: [0.04, 0.08], b: 'neck2' }, { p: [0, 1.64, 0.88], r: [0.05, 0.05], b: 'head' }, { p: [0, 1.6, 0.98], r: [0.03, 0.02], b: 'head' }];
    m.tube(lod === 2 ? [mane[0], mane[2], mane[4]] : mane, lod === 0 ? 6 : 4, DARK, none);
    const tail = [{ p: [0, 1.2, -0.7], r: 0.045, b: 'body' }, { p: [0, 1.12, -0.8], r: 0.075, b: 'tail1' }, { p: [0, 0.85, -0.86], r: 0.085, b: 'tail1', b2: 'tail2', w2: 0.6 }, { p: [0, 0.55, -0.9], r: 0.07, b: 'tail2' }, { p: [0, 0.3, -0.92], r: 0.012, b: 'tail2' }];
    m.tube(lod === 2 ? [tail[0], tail[2], tail[4]] : tail, lod === 0 ? 7 : 4, DARK, none);
    // legs: in the bind pose they hang straight down from the pivots
    for (const h of HOOVES) {
      const L = legs[h], x = L.sx * 0.16, P = L.front ? SH : HIP, k = P.y - L.L1, a = k - L.L2, U = 'upper_' + h, W = 'lower_' + h, F = 'hoof_' + h, t = bw;
      const up = L.front
        ? [{ p: [x, P.y + 0.02, P.z], r: [0.085 * t, 0.12], b: 'body' }, { p: [x, k, P.z], r: [0.075 * t, 0.1], b: U, b2: W, w2: 0.5 }]
        : [{ p: [x, P.y + 0.04, P.z], r: [0.1 * t, 0.17], b: 'body' }, { p: [x, P.y - 0.25, P.z], r: [0.085 * t, 0.12], b: U }, { p: [x, k, P.z], r: [0.05 * t, 0.058], b: U, b2: W, w2: 0.5 }];
      m.tube(up, LS, COAT, coat, { cap0: false, cap1: false });
      const lo = L.front
        ? [{ p: [x, k, P.z], r: [0.075 * t, 0.1], b: U, b2: W, w2: 0.5 }, { p: [x, k - 0.34, P.z], r: [0.05 * t, 0.058], b: W }, { p: [x, k - 0.42, P.z], r: 0.047 * t, b: W }, { p: [x, a + 0.1, P.z], r: 0.034 * t, b: W }, { p: [x, a, P.z], r: 0.042 * t, b: W, b2: F, w2: 0.5 }]
        : [{ p: [x, k, P.z], r: [0.05 * t, 0.058], b: U, b2: W, w2: 0.5 }, { p: [x, a + 0.1, P.z], r: 0.036 * t, b: W }, { p: [x, a, P.z], r: 0.044 * t, b: W, b2: F, w2: 0.5 }];
      m.tube(lod === 2 ? [lo[0], lo[lo.length - 1]] : lo, LS, COAT, coat, { cap0: false, cap1: false });
      m.tube([{ p: [x, a, P.z + 0.005], r: 0.045 * t, b: F, col: lod < 2 ? DARK : HOOF }, { p: [x, a - ANK, P.z + 0.02], r: [0.056 * t, 0.062 * t], b: F }], LS, HOOF, none, { cap0: false });
    }
    // felt blanket, saddle with high pommel and cantle, breast strap
    m.tube([{ p: [0, 1.0, -0.36], r: [0.295 * bw, 0.325] }, { p: [0, 0.99, -0.1], r: [0.305 * bw, 0.335] }, { p: [0, 1.0, 0.2], r: [0.295 * bw, 0.33] }].map((r) => ({ ...r, b: 'body' })), S, FELT, cloth, { cap0: false, cap1: false });
    if (heavy) {   // caparison: a cloth skirt over the barrel, tinted with the knight's colours
      m.tube([{ p: [0, 0.92, -0.72], r: [0.31 * bw, 0.42] }, { p: [0, 0.9, -0.2], r: [0.34 * bw, 0.45] }, { p: [0, 0.92, 0.3], r: [0.33 * bw, 0.45] }, { p: [0, 0.98, 0.6], r: [0.27 * bw, 0.4] }].map((r) => ({ ...r, b: 'body' })), S, [0.8, 0.8, 0.78], cloth, { cap0: false, cap1: false });
    }
    m.tube([{ p: [0, 1.31, -0.3], r: [0.17, 0.035] }, { p: [0, 1.33, -0.06], r: [0.15, 0.03] }, { p: [0, 1.31, 0.16], r: [0.16, 0.035] }].map((r) => ({ ...r, b: 'body' })), lod === 2 ? 4 : 6, LEATHER, none);
    if (lod < 2) {
      m.tube([{ p: [0, 1.32, 0.16], r: [0.1, 0.04], b: 'body' }, { p: [0, 1.5, 0.2], r: [0.06, 0.03], b: 'body' }], 5, LEATHER, none);
      m.tube([{ p: [0, 1.32, -0.3], r: [0.14, 0.04], b: 'body' }, { p: [0, 1.48, -0.36], r: [0.11, 0.03], b: 'body' }], 5, LEATHER, none);
      m.tube([{ p: [0, 1.06, 0.3], r: [0.285 * bw, 0.3] }, { p: [0, 1.06, 0.36], r: [0.275 * bw, 0.29] }].map((r) => ({ ...r, b: 'body' })), S, LEATHER, none, { cap0: false, cap1: false });
    }
    return m.build(skeleton, `${name}_lod${lod}`);
  };
  for (let l = 0; l < 3; l++) root.add(mk(l));

  // ---- poses
  const B = rig.byName, q = new THREE.Quaternion(), bodyRest = B.body.position.clone();
  const hoofLocal = (gait, h, ph, out) => {      // hoof ankle point in root space (x, y, z) for a moving gait
    const [p0, duty] = FOOTFALL[gait][h], L = legs[h], S = G[gait].stride, u = ((ph - p0) % 1 + 1) % 1;
    const half = S * duty / 2;
    if (u < duty) { out.z = L.zc + half - S * u; out.y = ANK; out.t = 0; }
    else {
      const s = (u - duty) / (1 - duty), m = -S * (1 - duty);     // Hermite back to the front with matched end speeds
      const h00 = 2 * s * s * s - 3 * s * s + 1, h10 = s * s * s - 2 * s * s + s, h01 = -2 * s * s * s + 3 * s * s, h11 = s * s * s - s * s;
      out.z = L.zc + h00 * -half + h10 * m + h01 * half + h11 * m;
      const lift = Math.sin(Math.PI * s); out.y = ANK + BODY[gait].lift * lift * lift * (L.front ? 1 : 0.8);
      out.t = Math.sin(Math.PI * Math.min(1, s * 1.6)) * (L.front ? 0.9 : 0.6);     // toe drops while the leg folds
    }
    out.x = L.sx * 0.16;
  };
  const tmp = { x: 0, y: 0, z: 0, t: 0 }, piv = V();
  const solveLeg = (h, tx, ty, tz, toe, bodyPitch, bodyPos) => {
    const L = legs[h];
    // pivot in root space: body position + pitch rotation of the pivot offset (pitch about X; + = nose up)
    const c = Math.cos(-bodyPitch), s = Math.sin(-bodyPitch);
    piv.set(L.pivot.x, L.pivot.y * c - L.pivot.z * s, L.pivot.y * s + L.pivot.z * c).add(bodyPos);
    let dy = ty - piv.y, dz = tz - piv.z, d = Math.hypot(dy, dz);
    const max = (L.L1 + L.L2) * 0.999; if (d > max) { dy *= max / d; dz *= max / d; d = max; }
    const phi = Math.atan2(dz, -dy);
    const al = Math.acos(Math.max(-1, Math.min(1, (L.L1 * L.L1 + d * d - L.L2 * L.L2) / (2 * L.L1 * d))));
    const th1 = phi + (L.front ? -al : -al);         // both joints sit behind the pivot-to-hoof line (elbow, hock)
    const ky = piv.y - Math.cos(th1) * L.L1, kz = piv.z + Math.sin(th1) * L.L1;
    const th2 = Math.atan2(piv.z + dz - kz, -(piv.y + dy - ky));
    B['upper_' + h].quaternion.setFromAxisAngle(AX, -th1 + bodyPitch);     // world Rx(-th1); parent world Rx(-bodyPitch)
    B['lower_' + h].quaternion.setFromAxisAngle(AX, th1 - th2);
    B['hoof_' + h].quaternion.setFromAxisAngle(AX, th2 + toe);
  };
  const setBody = (bob, pitch, sway = 0) => { B.body.position.set(bodyRest.x + sway, bodyRest.y + bob, bodyRest.z); B.body.quaternion.setFromAxisAngle(AX, -pitch); };
  const neckTail = (n1, n2, hd, t1, t2, tz = 0) => {
    QX(B.neck1.quaternion, n1); QX(B.neck2.quaternion, n2); QX(B.head.quaternion, hd);
    B.tail1.quaternion.setFromAxisAngle(AX, t1).multiply(q.setFromAxisAngle(AZ, tz)); QX(B.tail2.quaternion, t2);
  };
  const clips = [];
  for (const gait of ['walk', 'trot', 'canter', 'gallop']) {
    const bd = BODY[gait], fast = gait === 'gallop' ? 1 : gait === 'canter' ? 0.6 : gait === 'trot' ? 0.25 : 0;
    clips.push({
      name: gait, duration: G[gait].duration, loop: true, pose(t) {
        const ph = t / G[gait].duration, w = TAU * bd.beats * (ph - bd.low);
        const bob = -bd.bob * Math.cos(w) - (gait === 'gallop' ? 0.03 : gait === 'canter' ? 0.012 : 0), pitch = bd.beats === 1 ? bd.pitch * Math.cos(TAU * ph) : bd.pitch * Math.sin(w);
        setBody(bob, pitch);
        for (const h of HOOVES) { hoofLocal(gait, h, ph, tmp); solveLeg(h, tmp.x, tmp.y, tmp.z, tmp.t, pitch, B.body.position); }
        const nod = bd.neck * Math.cos(w + 0.6);
        neckTail(0.1 + fast * 0.42 + nod - pitch * 0.5, 0.05 + fast * 0.12 + nod * 0.5, -0.12 - fast * 0.38 - nod * 0.6, -fast * 1.05 + 0.06 * Math.sin(w), -fast * 0.3 + 0.08 * Math.sin(w - 1), 0.1 * Math.sin(TAU * ph));
      },
    });
  }
  clips.unshift({
    name: 'idle', duration: G.idle.duration, loop: true, pose(t) {
      const a = TAU * t / G.idle.duration;
      setBody(0.006 * Math.sin(a * 2), 0.004 * Math.sin(a), 0);       // no sideways sway: the leg IK is planar, the hooves would slide
      for (const h of HOOVES) { const L = legs[h]; solveLeg(h, L.sx * 0.16, ANK, L.zc - (L.front ? 0.0 : 0.02), 0, 0.004 * Math.sin(a), B.body.position); }
      neckTail(0.06 * Math.sin(a) + 0.03, 0.05 * Math.sin(a + 0.8), -0.08 * Math.sin(a + 1.2) - 0.05, 0.04 * Math.sin(a * 2), 0.1 * Math.sin(a * 2 - 0.8), 0.22 * Math.sin(a * 2) * Math.max(0, Math.sin(a)));
    },
  });

  // ---- meta, in the contract's shape; contact intervals are trimmed a hair so a sample exactly on a footfall edge
  // is not counted as planted
  const meta = { name, standin: true, withers: 1.33 * scale, seatRest: [0, 1.385 * scale, -0.06 * scale], barrelHalfWidth: 0.29 * bw * scale, scale, tint: { coat: 'aExtra.x', cloth: 'aExtra.y' }, clips: {} };
  const EPS = 0.012;
  for (const c of clips) {
    const m = { duration: c.duration, loop: true };
    if (c.name === 'idle') { m.stride = 0; m.speed = [0, 0]; m.contacts = {}; for (const h of HOOVES) m.contacts['hoof_' + h] = [[0, 1]]; m.suspension = []; }
    else {
      m.stride = G[c.name].stride * scale; m.speed = G[c.name].speed.map((v) => v * (heavy && !exact ? 0.92 : 1)); m.contacts = {};
      const marks = [];
      for (const h of HOOVES) { const [p0, d] = FOOTFALL[c.name][h]; m.contacts['hoof_' + h] = [[p0 + EPS, p0 + d - EPS]]; marks.push([p0, p0 + d]); }
      // suspension = the part of the cycle no hoof covers
      m.suspension = []; marks.sort((a, b) => a[0] - b[0]); let end = 0; for (const [a, b] of marks) { if (a > end + 1e-6 && end > 0) m.suspension.push([end, a]); end = Math.max(end, b); }
      if (end < 1) m.suspension.push([end, 1]);
    }
    meta.clips[c.name] = m;
  }
  // `graze`: a loose horse puts its head down. Head low, feet still.
  clips.push({
    name: 'graze', duration: 9, loop: true, pose(t) {
      const a = TAU * t / 9;
      setBody(0.004 * Math.sin(a * 2), 0.003 * Math.sin(a), 0);
      for (const h of HOOVES) { const L = legs[h]; solveLeg(h, L.sx * 0.16, ANK, L.zc - (L.front ? 0.0 : 0.02), 0, 0.003 * Math.sin(a), B.body.position); }
      neckTail(0.75 + 0.05 * Math.sin(a * 3), 0.35 + 0.05 * Math.sin(a * 3 + 0.8), -0.05, 0.04 * Math.sin(a * 2), 0.1 * Math.sin(a * 2 - 0.8), 0.15 * Math.sin(a * 2));
    },
  });
  meta.clips.graze = { duration: 9, loop: true, stride: 0, speed: [0, 0] };
  root.scale.setScalar(scale);
  return { name, root, clips, meta, skeleton };
}

// ---------------------------------------------------------------- riders
// Seat space: origin at the bottom of the pelvis on the saddle, +Z forward, +X left.
const AIMS = { fwd: [20, 0], left: [90, 0], back: [160, 0], high: [30, 38] };

function buildRiderBase(name, P) {
  const rig = new Rig(), half = P.barrel;
  rig.bone('root', null, 0, 0, 0);
  rig.bone('hips', 'root', 0, 0.1, 0);
  rig.bone('spine1', 'hips', 0, 0.2, 0);
  rig.bone('spine2', 'spine1', 0, 0.33, 0);
  rig.bone('spine3', 'spine2', 0, 0.46, 0);
  rig.bone('neck', 'spine3', 0, 0.6, 0);
  rig.bone('head', 'neck', 0, 0.67, 0);
  const SHW = P.shoulder, UA = 0.29, FA = 0.27;
  for (const [s, sx] of [['l', 1], ['r', -1]]) {
    rig.bone('upperarm_' + s, 'spine3', sx * SHW, 0.55, 0);
    rig.bone('forearm_' + s, 'upperarm_' + s, sx * SHW, 0.55 - UA, 0);
    rig.bone('hand_' + s, 'forearm_' + s, sx * SHW, 0.55 - UA - FA, 0);
  }
  return { rig, half, SHW, UA, FA };
}
function riderBody(m, P, lod, { coatCol, legCol, bootCol, skin, half }) {
  const S = [10, 7, 5][lod], LS = [7, 5, 4][lod], cloth = [1, 0, 0.0], tw = (w) => [1, 0, w], no = (w) => [0, 0, w];
  const t = P.bulk;
  // torso (deel or surcoat) with a skirt over the thighs
  const torso = [
    { p: [0, -0.02, 0.0], r: [0.2 * t, 0.17], b: 'hips' }, { p: [0, 0.12, 0], r: [0.18 * t, 0.15], b: 'hips' }, { p: [0, 0.24, 0], r: [0.17 * t, 0.135], b: 'spine1' },
    { p: [0, 0.38, 0], r: [0.19 * t, 0.14], b: 'spine2' }, { p: [0, 0.52, 0], r: [0.205 * t, 0.135], b: 'spine3' }, { p: [0, 0.6, 0], r: [0.1, 0.085], b: 'spine3' }];
  const wts = [0, 0, 0.3, 0.65, 1, 1];
  torso.forEach((r, i) => { r.w = wts[i]; });
  const first = m.p.length / 3;
  m.tube(lod === 2 ? [torso[0], torso[2], torso[4], torso[5]] : torso, S, coatCol, cloth);
  // per-ring twist weights (third mask channel)
  { const rings = lod === 2 ? [torso[0], torso[2], torso[4], torso[5]] : torso; for (let k = 0; k < rings.length; k++) for (let s = 0; s < S; s++) m.e[(first + k * S + s) * 3 + 2] = rings[k].w; const caps = first + rings.length * S; m.e[caps * 3 + 2] = 0; m.e[(caps + 1) * 3 + 2] = 1; }
  // neck and head
  m.tube([{ p: [0, 0.58, 0.005], r: 0.055, b: 'neck' }, { p: [0, 0.68, 0.01], r: 0.05, b: 'head' }], LS, skin, no(1), { cap0: false, cap1: false });
  // legs wrapped round the barrel, feet in stirrups
  for (const sx of [1, -1]) {
    const hip = [sx * 0.1, 0.04, 0.02], knee = [sx * (half + 0.03), -0.2, 0.26], foot = [sx * (half + 0.04), -0.62, 0.14];
    m.tube([{ p: hip, r: [0.085 * t, 0.095], b: 'hips' }, { p: lerp3(hip, knee, 0.5), r: [0.08 * t, 0.085], b: 'hips' }, { p: knee, r: 0.065 * t, b: 'hips' }], LS, legCol, [1, 0, 0], { cap0: false, cap1: false });
    m.tube([{ p: knee, r: 0.065 * t, b: 'hips' }, { p: lerp3(knee, foot, 0.6), r: 0.058 * t, b: 'hips', col: bootCol }, { p: foot, r: 0.048 * t, b: 'hips', col: bootCol }], LS, legCol, [0, 0, 0], { cap0: false, cap1: false });
    m.tube([{ p: [foot[0], foot[1] - 0.02, foot[2] - 0.06], r: [0.045, 0.04], b: 'hips' }, { p: [foot[0], foot[1] - 0.03, foot[2] + 0.17], r: [0.04, 0.03], b: 'hips' }], LS, bootCol, [0, 0, 0]);
  }
}
function riderArms(m, B, lod, sleeveCol, handCol, bulk = 1) {
  const LS = [7, 5, 4][lod];
  for (const [s, sx] of [['l', 1], ['r', -1]]) {
    const x = sx * B.SHW, y0 = 0.55, y1 = y0 - B.UA, y2 = y1 - B.FA;
    m.tube([{ p: [x, y0 + 0.03, 0], r: 0.066 * bulk, b: 'spine3', b2: 'upperarm_' + s, w2: 0.6 }, { p: [x, y0 - 0.12, 0], r: 0.056 * bulk, b: 'upperarm_' + s }, { p: [x, y1, 0], r: 0.048 * bulk, b: 'upperarm_' + s, b2: 'forearm_' + s, w2: 0.5 },
      { p: [x, y2 + 0.03, 0], r: 0.04 * bulk, b: 'forearm_' + s }], LS, sleeveCol, [1, 0, 1], { cap1: false });
    m.tube([{ p: [x, y2 + 0.03, 0], r: 0.036, b: 'forearm_' + s }, { p: [x, y2 - 0.03, 0], r: [0.04, 0.03], b: 'hand_' + s }, { p: [x, y2 - 0.09, 0], r: [0.03, 0.022], b: 'hand_' + s }], LS, handCol, [0, 0, 1], { cap0: false });
  }
}
// Two-bone arm IK in the rider's root space. Needs the spine already posed.
const _s = V(), _t = V(), _e = V(), _d = V(), _n = V(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _m = new THREE.Matrix4();
function solveArm(root, bones, side, target, pole, UA, FA) {
  const up = bones['upperarm_' + side], fo = bones['forearm_' + side], hand = bones['hand_' + side];
  root.updateMatrixWorld(true);
  _m.copy(root.matrixWorld).invert();
  _s.setFromMatrixPosition(up.matrixWorld).applyMatrix4(_m);
  _d.copy(target).sub(_s); let d = _d.length(); const max = (UA + FA) * 0.999; if (d > max) { _d.multiplyScalar(max / d); d = max; }
  _t.copy(_s).add(_d);
  const a = (UA * UA + d * d - FA * FA) / (2 * d), h = Math.sqrt(Math.max(0, UA * UA - a * a));
  _d.normalize(); _n.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  _e.copy(_s).addScaledVector(_d, a).addScaledVector(_n, h);
  // parent world quaternion (in root space) of the upper arm
  up.parent.getWorldQuaternion(_pq); root.getWorldQuaternion(_wq); _pq.premultiply(_wq.invert());
  _wq.setFromUnitVectors(DOWN, _n.copy(_e).sub(_s).normalize());
  up.quaternion.copy(_pq).invert().multiply(_wq);
  const upW = _wq.clone();
  _wq.setFromUnitVectors(DOWN, _n.copy(_t).sub(_e).normalize());
  fo.quaternion.copy(upW).invert().multiply(_wq);
  hand.quaternion.identity();
  return _wq;    // the forearm's root-space orientation
}

export function buildArcher({ name = 'archer' } = {}) {
  const P = { barrel: 0.28, shoulder: 0.19, bulk: 1 };
  const Bs = buildRiderBase(name, P), rig = Bs.rig;
  rig.bone('bow', 'hand_l', Bs.SHW, -0.07, 0);
  rig.bone('bow_upper', 'bow', Bs.SHW, 0.02, 0); rig.bone('bow_lower', 'bow', Bs.SHW, -0.16, 0);
  rig.bone('string', 'bow', Bs.SHW, -0.07, -0.16);
  rig.bone('quiver', 'hips', -0.2, 0.1, -0.08);
  rig.byName.root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(rig.bones), root = new THREE.Group(); root.name = name; root.add(rig.byName.root);
  const DEEL = [0.75, 0.72, 0.68], LAM = [0.2, 0.19, 0.18], SKIN = [0.62, 0.42, 0.3], FUR = [0.3, 0.21, 0.14], BOOT = [0.16, 0.11, 0.08], WOOD = [0.42, 0.26, 0.13], HORN = [0.14, 0.1, 0.07];
  for (let lod = 0; lod < 3; lod++) {
    const m = new MeshB(rig), LS = [7, 5, 4][lod];
    riderBody(m, P, lod, { coatCol: DEEL, legCol: DEEL, bootCol: BOOT, skin: SKIN, half: Bs.half });
    // lamellar cuirass over the chest (untinted, dark iron), belt
    m.tube([{ p: [0, 0.2, 0], r: [0.185, 0.15], b: 'spine1' }, { p: [0, 0.36, 0], r: [0.205, 0.155], b: 'spine2' }, { p: [0, 0.5, 0], r: [0.215, 0.148], b: 'spine3' }], [10, 7, 5][lod], LAM, [0, 0, 0], { cap0: false, cap1: false });
    { const n = m.p.length / 3, S = [10, 7, 5][lod]; const w = [0.3, 0.65, 1]; for (let k = 0; k < 3; k++) for (let s = 0; s < S; s++) m.e[(n - 3 * S + k * S + s) * 3 + 2] = w[k]; }
    riderArms(m, Bs, lod, DEEL, SKIN);
    // head, fur-trimmed pointed hat with a neck flap
    m.tube([{ p: [0, 0.665, 0.0], r: [0.07, 0.08] }, { p: [0, 0.72, 0.012], r: [0.088, 0.098] }, { p: [0, 0.79, 0.008], r: [0.086, 0.096] }].map((r) => ({ ...r, b: 'head' })), LS + 1, SKIN, [0, 0, 1], { cap1: false });
    m.tube([{ p: [0, 0.785, 0.0], r: [0.108, 0.115], col: FUR }, { p: [0, 0.825, 0.0], r: [0.106, 0.112], col: FUR }, { p: [0, 0.86, 0], r: [0.08, 0.085] }, { p: [0, 0.93, -0.005], r: [0.035, 0.04] }, { p: [0, 0.975, -0.01], r: 0.006 }].map((r) => ({ ...r, b: 'head' })), LS + 1, LAM, [0, 0, 1]);
    if (lod < 2) m.tube([{ p: [0, 0.79, -0.07], r: [0.095, 0.03], b: 'head' }, { p: [0, 0.64, -0.1], r: [0.11, 0.02], b: 'head', b2: 'spine3', w2: 0.5 }], 5, FUR, [0, 0, 1]);
    // quiver at the right hip with arrows
    m.tube([{ p: [-0.2, 0.16, -0.02], r: [0.05, 0.035], b: 'quiver' }, { p: [-0.24, -0.25, -0.2], r: [0.04, 0.03], b: 'quiver' }], LS, HORN, [0, 0, 0]);
    if (lod < 2) m.tube([{ p: [-0.2, 0.16, -0.02], r: 0.035, b: 'quiver' }, { p: [-0.185, 0.33, 0.05], r: 0.04, b: 'quiver', col: [0.8, 0.78, 0.7] }], 5, WOOD, [0, 0, 0]);
    // the bow: grip at the left hand, two recurved limbs, string through the `string` bone
    const hx = Bs.SHW, hy = -0.07;
    for (const [bn, sy] of [['bow_upper', 1], ['bow_lower', -1]]) {
      m.tube([{ p: [hx, hy + sy * 0.0, 0], r: [0.016, 0.02], b: 'bow' }, { p: [hx, hy + sy * 0.09, 0.0], r: [0.02, 0.014], b: 'bow', b2: bn, w2: 0.5 }, { p: [hx, hy + sy * 0.3, -0.035], r: [0.022, 0.01], b: bn }, { p: [hx, hy + sy * 0.47, -0.05], r: [0.016, 0.008], b: bn }, { p: [hx, hy + sy * 0.57, 0.0], r: [0.009, 0.007], b: bn }], lod === 2 ? 3 : 5, WOOD, [0, 0, 1], { cap0: false });
      m.tube([{ p: [hx, hy + sy * 0.56, -0.005], r: 0.0035, b: bn }, { p: [hx, hy, -0.16], r: 0.0035, b: 'string' }], 3, [0.85, 0.8, 0.7], [0, 0, 1], { cap0: false, cap1: false });
    }
    root.add(m.build(skeleton, `${name}_lod${lod}`));
  }
  const B = rig.byName, q = new THREE.Quaternion(), tgt = V(), pole = V(), aim = V(), sideV = V();
  const rideL = V(0.2, 0.2, 0.3), rideR = V(-0.08, 0.17, 0.33);
  // raise 0..1: from the riding pose to the aim pose; draw 0..1: string back; k: small extra motion
  const pose = (aimName, raise, draw, t, recoil = 0) => {
    const [ya, pa] = AIMS[aimName || 'fwd'], a = ya * Math.PI / 180, pt = pa * Math.PI / 180, r = sstep(raise);
    const twist = (a - Math.PI / 2) * r, sway = Math.sin(t * 3.1) * 0.02 * (1 - r);
    B.hips.quaternion.setFromAxisAngle(AX, 0.06 * (1 - r) + sway);
    for (const [bn, f] of [['spine1', 0.3], ['spine2', 0.35], ['spine3', 0.35]]) { B[bn].quaternion.setFromAxisAngle(AY, twist * f * 0.86); if (bn === 'spine3') B[bn].quaternion.multiply(q.setFromAxisAngle(AZ, -pt * 0.25 * r)); }
    const headYaw = Math.max(-1.25, Math.min(1.25, a * r - twist * 0.86));
    B.neck.quaternion.setFromAxisAngle(AY, headYaw * 0.4); B.head.quaternion.setFromAxisAngle(AY, headYaw * 0.6).multiply(q.setFromAxisAngle(AX, -pt * 0.5 * r));
    aim.set(Math.sin(a) * Math.cos(pt), Math.sin(pt), Math.cos(a) * Math.cos(pt));
    sideV.set(0, 0.5, 0);
    // left hand: out along the aim from the left shoulder
    root.updateMatrixWorld(true);
    const sh = V().setFromMatrixPosition(B.upperarm_l.matrixWorld); root.worldToLocal(sh);
    tgt.copy(sh).addScaledVector(aim, 0.535); tgt.y += 0.07; tgt.lerpVectors(rideL, tgt, r); tgt.y += sway * 0.5;
    pole.set(0.3, -1, -0.2); solveArm(root, B, 'l', tgt, pole, Bs.UA, Bs.FA);
    const handL = tgt.clone();
    // the bow stands upright in the hand, in the plane of the shot, tilted a little when relaxed
    root.updateMatrixWorld(true);
    B.hand_l.getWorldQuaternion(q); const rq = new THREE.Quaternion(); root.getWorldQuaternion(rq); q.premultiply(rq.invert());
    const bowQ = new THREE.Quaternion().setFromUnitVectors(AZ, aim);     // the bow's back (+Z of the mesh) faces the target, the string the archer
    const flat = new THREE.Quaternion().setFromAxisAngle(AZ, -0.5).premultiply(new THREE.Quaternion().setFromAxisAngle(AY, 0.6));
    bowQ.slerp(flat, 1 - r);
    B.bow.quaternion.copy(q).invert().multiply(bowQ);
    // right hand: on the rein, then on the string, drawn back to the jaw along the aim
    const dl = 0.16 + 0.58 * draw;
    const str = handL.clone().addScaledVector(aim, -dl - 0.02); str.y += 0.02;
    tgt.lerpVectors(rideR, str, sstep(raise * 1.4 - 0.15)); if (recoil > 0) tgt.addScaledVector(aim, -0.16 * recoil).add(V(0, -0.05 * recoil, 0));
    pole.set(-0.6, -0.4, -0.7); solveArm(root, B, 'r', tgt, pole, Bs.UA, Bs.FA);
    B.string.position.set(0, 0, -(0.16 + 0.58 * draw));
    QX(B.bow_upper.quaternion, 0.42 * draw); QX(B.bow_lower.quaternion, -0.42 * draw);
  };
  const clips = [{ name: 'ride', duration: 2.03, loop: true, pose: (t) => pose('fwd', 0, 0, (t / 2.03) * TAU / 3.1) }];
  for (const an of Object.keys(AIMS)) {
    clips.push({ name: 'draw_' + an, duration: 0.7, loop: false, pose: (t) => { const u = t / 0.7; pose(an, Math.min(1, u * 1.9), sstep((u - 0.38) / 0.62), 0); } });
    clips.push({ name: 'hold_' + an, duration: 1.2, loop: true, pose: (t) => pose(an, 1, 1 + 0.012 * Math.sin(t / 1.2 * TAU * 3), 0) });
    clips.push({ name: 'loose_' + an, duration: 0.6, loop: false, pose: (t) => { const u = t / 0.6; const d = u < 0.06 ? 1 - u / 0.06 : -0.1 * Math.exp(-(u - 0.06) * 14) * Math.cos((u - 0.06) * 60); pose(an, u < 0.4 ? 1 : 1 - sstep((u - 0.4) / 0.6), Math.max(-0.1, d), 0, u < 0.4 ? Math.min(1, u / 0.08) * (1 - u / 0.4 * 0.3) : 0.7 * (1 - sstep((u - 0.4) / 0.4))); } });
  }
  // extra riding clips a real rider model may have (same poses as `ride` here)
  clips.push({ name: 'ride_look', duration: 4, loop: true, pose: (t) => pose('fwd', 0, 0, (t / 4) * TAU / 3.1) });
  clips.push({ name: 'ride_lean', duration: 2, loop: true, pose: (t) => pose('fwd', 0, 0, (t / 2) * TAU / 3.1) });
  clips.push({ name: 'nock', duration: 0.9, loop: false, pose: (t) => pose('fwd', 0.25 * Math.sin(Math.PI * t / 0.9), 0, 0) });
  const meta = { name, standin: true, barrelHalfWidth: 0.28, aims: AIMS, tint: { cloth: 'aExtra.x' }, clips: {} };
  for (const c of clips) meta.clips[c.name] = { duration: c.duration, loop: c.loop };
  return { name, root, clips, meta, skeleton };
}

export function buildKnight({ name = 'knight', seatHeight = 1.62 } = {}) {
  const P = { barrel: 0.33, shoulder: 0.215, bulk: 1.16 };
  const Bs = buildRiderBase(name, P), rig = Bs.rig;
  rig.bone('lance', 'hand_r', -Bs.SHW, -0.05, 0);
  rig.bone('shield', 'forearm_l', Bs.SHW + 0.07, 0.1, 0);
  rig.byName.root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(rig.bones), root = new THREE.Group(); root.name = name; root.add(rig.byName.root);
  const SUR = [0.86, 0.85, 0.82], MAIL = [0.36, 0.38, 0.41], STEEL = [0.55, 0.57, 0.6], WOOD = [0.36, 0.25, 0.15];
  for (let lod = 0; lod < 3; lod++) {
    const m = new MeshB(rig), LS = [7, 5, 4][lod];
    riderBody(m, P, lod, { coatCol: SUR, legCol: MAIL, bootCol: MAIL, skin: MAIL, half: Bs.half });
    // legs are mail, not cloth: clear their tint mask (riderBody marks thighs as cloth)
    riderArms(m, Bs, lod, MAIL, MAIL, 1.15);
    { const n = m.p.length / 3; for (let v = 0; v < n; v++) { const c = m.c[v * 3]; if (Math.abs(c - MAIL[0]) < 1e-3) m.e[v * 3] = 0; } }
    // great helm: a flat-topped barrel
    m.tube([{ p: [0, 0.64, 0.01], r: [0.105, 0.115] }, { p: [0, 0.76, 0.012], r: [0.112, 0.122] }, { p: [0, 0.865, 0.01], r: [0.108, 0.118] }, { p: [0, 0.885, 0.01], r: [0.085, 0.095] }].map((r) => ({ ...r, b: 'head' })), LS + 2, STEEL, [0, 0, 1]);
    if (lod < 2) m.tube([{ p: [0.0, 0.775, 0.118], r: [0.09, 0.008], b: 'head', col: [0.05, 0.05, 0.05] }, { p: [0.0, 0.775, 0.128], r: [0.085, 0.006], b: 'head', col: [0.05, 0.05, 0.05] }], 4, STEEL, [0, 0, 1]);
    // kite shield on the left forearm (bind pose: arm hanging; the shield faces +X, outward)
    const sx = Bs.SHW + 0.075;
    m.tube([{ p: [sx, 0.52, 0], r: [0.02, 0.2] }, { p: [sx, 0.36, 0], r: [0.022, 0.25] }, { p: [sx, 0.05, 0], r: [0.02, 0.17] }, { p: [sx, -0.3, 0], r: [0.015, 0.03] }].map((r) => ({ ...r, b: 'shield' })), lod === 2 ? 4 : 6, [0.82, 0.8, 0.76], [0, 1, 1], { up: V(1, 0, 0) });
    // lance: bind pose points straight up from the right hand, 3.4 m, grip a quarter of the way up
    const lx = -Bs.SHW, ly = -0.05;
    m.tube([{ p: [lx, ly - 0.75, 0], r: 0.024 }, { p: [lx, ly + 0.3, 0], r: 0.022 }, { p: [lx, ly + 2.45, 0], r: 0.014 }, { p: [lx, ly + 2.5, 0], r: 0.024, col: STEEL }, { p: [lx, ly + 2.7, 0], r: 0.002, col: STEEL }].map((r) => ({ ...r, b: 'lance' })), lod === 2 ? 3 : 5, WOOD, [0, 0, 1]);
    if (lod < 2) m.tube([{ p: [lx - 0.02, ly + 2.38, 0], r: [0.004, 0.02] }, { p: [lx - 0.3, ly + 2.3, 0], r: [0.004, 0.06] }, { p: [lx - 0.5, ly + 2.24, 0], r: [0.003, 0.01] }].map((r) => ({ ...r, b: 'lance' })), 4, [0.8, 0.78, 0.74], [0, 1, 1], { up: V(0, 0, 1) });
    root.add(m.build(skeleton, `${name}_lod${lod}`));
  }
  const B = rig.byName, q = new THREE.Quaternion(), tgt = V(), pole = V(), rq = new THREE.Quaternion(), hipsRest = B.hips.position.clone();
  // couch 0..1: lance down and tucked; lean: forward lean (rad); flinch: knocked back (rad); fall 0..1
  const pose = (couch, lean, flinch, t, fall = 0, twist = 0) => {
    const c = sstep(couch), f = sstep(fall);
    B.hips.position.set(hipsRest.x, hipsRest.y - f * (seatHeight - 0.16), hipsRest.z - f * 1.5);
    B.hips.quaternion.setFromAxisAngle(AX, lean * 0.5 - flinch * 0.6 - f * 1.52).multiply(q.setFromAxisAngle(AZ, f * 0.35));
    QX(B.spine1.quaternion, lean * 0.25 - flinch * 0.3).multiply(q.setFromAxisAngle(AY, twist * 0.4));
    QX(B.spine2.quaternion, lean * 0.25 - flinch * 0.2).multiply(q.setFromAxisAngle(AY, twist * 0.6));
    QX(B.spine3.quaternion, 0.02 * Math.sin(t)); QX(B.neck.quaternion, -lean * 0.5 + flinch * 0.4); B.head.quaternion.identity();
    // right arm: lance upright at rest, couched under the arm when charging, flung wide in a fall
    tgt.set(-0.27 - 0.02 * c, 0.12 + 0.17 * c, 0.2 - 0.02 * c).lerp(V(-0.6, 0.5, -0.3), f); pole.set(-0.5, -0.5, -0.8);
    solveArm(root, B, 'r', tgt, pole, Bs.UA, Bs.FA);
    root.updateMatrixWorld(true); B.hand_r.getWorldQuaternion(q); root.getWorldQuaternion(rq); q.premultiply(rq.invert());
    const up = new THREE.Quaternion().setFromAxisAngle(AX, 0.06 + 0.03 * Math.sin(t));
    const down = new THREE.Quaternion().setFromAxisAngle(AX, Math.PI / 2 - 0.06 + lean * 0.2).premultiply(new THREE.Quaternion().setFromAxisAngle(AY, 0.07));
    up.slerp(down, c); if (f > 0) up.slerp(new THREE.Quaternion().setFromAxisAngle(AZ, 1.2), f);
    B.lance.quaternion.copy(q).invert().multiply(up);
    // left arm: rein hand low with the shield at the side; shield up across the body when charging or hit
    const su = Math.max(c, Math.min(1, flinch * 3));
    tgt.set(0.2 - 0.1 * su, 0.2 + 0.16 * su, 0.24 + 0.05 * su).lerp(V(0.65, 0.45, -0.25), f); pole.set(0.7, -0.7, -0.2);
    solveArm(root, B, 'l', tgt, pole, Bs.UA, Bs.FA);
    root.updateMatrixWorld(true); B.forearm_l.getWorldQuaternion(q); root.getWorldQuaternion(rq); q.premultiply(rq.invert());
    const sq = new THREE.Quaternion().setFromAxisAngle(AY, -0.25 - 0.75 * su).multiply(new THREE.Quaternion().setFromAxisAngle(AZ, 0.12 * su));
    B.shield.quaternion.copy(q).invert().multiply(sq);
  };
  const clips = [
    { name: 'ride', duration: 2.4, loop: true, pose: (t) => pose(0, 0.02 + 0.015 * Math.sin(t / 2.4 * TAU), 0, t / 2.4 * TAU) },
    { name: 'couch', duration: 0.6, loop: false, pose: (t) => pose(t / 0.6, 0.3 * sstep(t / 0.6), 0, 0) },
    { name: 'charge', duration: 1.0, loop: true, pose: (t) => pose(1, 0.3 + 0.02 * Math.sin(t * TAU), 0, t * TAU) },
    { name: 'hit_shield', duration: 0.4, loop: false, pose: (t) => { const u = t / 0.4; pose(1, 0.3, Math.sin(Math.PI * Math.min(1, u * 1.2)) * 0.22 * (1 - u * 0.4), 0); } },
    { name: 'hit_body', duration: 0.5, loop: false, pose: (t) => { const u = t / 0.5; pose(1, 0.3, Math.sin(Math.PI * Math.min(1, u * 1.1)) * 0.5 * (1 - u * 0.3), 0, 0, Math.sin(Math.PI * u) * 0.5); } },
    { name: 'fall', duration: 1.3, loop: false, pose: (t) => { const u = t / 1.3; pose(1 - Math.min(1, u * 3), 0.3 * (1 - u), Math.min(1, u * 4) * 0.5 * (1 - sstep((u - 0.3) / 0.5)), 0, Math.min(1, u / 0.72)); } },
  ];
  const meta = { name, standin: true, barrelHalfWidth: 0.33, seatHeight, tint: { cloth: 'aExtra.x', shield: 'aExtra.y' }, clips: {} };
  for (const c of clips) meta.clips[c.name] = { duration: c.duration, loop: c.loop };
  return { name, root, clips, meta, skeleton };
}
