// Drawing the pieces: one instanced mesh per material, placed straight from three-avbd's body
// buffer on the GPU (as its BodyMesh does: no copies, no readback), with a look of its own.
//
// - Every piece is a box with rounded edges of a fixed width in metres, whatever its size: the
//   geometry's vertices are a unit box's corners plus an inset at the bevel, and the shader scales
//   only the corners. A brick and a 6 m beam get the same crisp 2 cm round, and catch the light
//   on their edges like the real thing (and like an architect's model).
// - Textures are mapped in each piece's own frame, in metres, so they ride on the piece as it
//   tumbles. Timber's grain runs along its length; its sawn ends are lighter. A piece's home (where
//   it was built) offsets its texture, so neighbours never repeat.
// - Per piece: a paint (weatherboards tarred black, the barn doors oxblood, the window joinery
//   cream, the tank teal) and a shade (each brick a little different).

import {
  abs,
  cross,
  float,
  hash,
  instanceIndex,
  max,
  min,
  mix,
  mx_noise_float,
  normalize,
  positionGeometry,
  select,
  smoothstep,
  storage,
  texture,
  transformNormalToView,
  varying,
  vec2,
  vec3,
  attribute,
  normalGeometry,
} from 'three/tsl';
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Body, World } from 'three-avbd';
import { B_POS, B_ROT, B_SIZE, BODY_FLOATS } from 'three-avbd/advanced';
import type { Mat } from '../physics/materials.ts';
import type { Piece } from '../physics/builder.ts';

// TSL's node types are too fine-grained to be worth spelling out here
// biome-ignore lint: TSL nodes
type N = any;

const VEC4_PER_BODY = BODY_FLOATS / 4;

/** v turned by the unit quaternion q = (u, w). */
function rotate(q: N, v: N): N {
  const t = cross(q.xyz, v).mul(2);
  return v.add(t.mul(q.w)).add(cross(q.xyz, t));
}

/** A unit box with rounded edges, its vertices split into the corner (±0.5) and the round's inset (at unit width). */
function bevelGeometry(segments = 2): THREE.BufferGeometry {
  const R = 0.1;
  const g = new RoundedBoxGeometry(1, 1, 1, segments, R);
  const p = g.getAttribute('position');
  const corner = new Float32Array(p.count * 3);
  const inset = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    for (let k = 0; k < 3; k++) {
      const v = p.getComponent(i, k);
      const c = Math.sign(v) * 0.5;
      corner[i * 3 + k] = c;
      inset[i * 3 + k] = (v - c) / R;
    }
  }
  const out = new THREE.BufferGeometry();
  out.index = g.index;
  out.setAttribute('position', new THREE.BufferAttribute(corner, 3));
  out.setAttribute('inset', new THREE.BufferAttribute(inset, 3));
  out.setAttribute('normal', g.getAttribute('normal'));
  return out;
}

export interface TextureSet {
  diff: THREE.Texture;
  nor: THREE.Texture;
  arm: THREE.Texture;
}

const loader = new THREE.TextureLoader();
/** A Poly Haven set from public/textures (diffuse, GL normal, AO/roughness/metal). */
export async function loadSet(name: string): Promise<TextureSet> {
  const one = async (kind: string, srgb: boolean) => {
    const t = await loader.loadAsync(`textures/${name}_${kind}.webp`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const [diff, nor, arm] = await Promise.all([one('diff', true), one('nor', false), one('arm', false)]);
  return { diff, nor, arm };
}

/** Paints (PieceLook.paint). */
export const Paint = { None: 0, Tar: 1, Oxblood: 2, Cream: 3, Teal: 4, Charcoal: 5, Pale: 6 } as const;

/** How a material is drawn. */
export interface MatLook {
  set: TextureSet | null;
  /** Metres per texture repeat. */
  scale: number;
  /** The round on its edges (m). */
  bevel: number;
  /** Base tint (multiplies the texture), roughness and metalness. */
  tint: THREE.Color;
  rough: number;
  metal: number;
  /** Grain runs along the piece's length (timber), not tiled any which way. */
  grain: boolean;
}

/**
 * Per body slot: paint, shade (0..1), char (0..1: blackened by a blast), and whether its long axis
 * is x, y or z | its home (where it was built: texture offset).
 */
export class PieceData {
  readonly look: THREE.StorageInstancedBufferAttribute;
  readonly home: THREE.StorageInstancedBufferAttribute;
  private readonly lookArr: Float32Array;
  constructor(capacity: number) {
    this.lookArr = new Float32Array(capacity * 4);
    this.look = new THREE.StorageInstancedBufferAttribute(this.lookArr, 4);
    this.home = new THREE.StorageInstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  }
  set(body: Body, piece: Pick<Piece, 'size' | 'pos' | 'seed'>, paint: number): void {
    const i = body.index;
    const s = piece.size;
    const long = s[0] >= s[1] && s[0] >= s[2] ? 0 : s[1] >= s[2] ? 1 : 2;
    this.lookArr.set([paint, piece.seed, 0, long], i * 4);
    (this.home.array as Float32Array).set([piece.pos[0], piece.pos[1], piece.pos[2], 0], i * 4);
    this.look.needsUpdate = true;
    this.home.needsUpdate = true;
  }
  /** Blacken a body (a blast's scorch): `amount` added, up to 1. */
  char(body: Body, amount: number): void {
    const k = body.index * 4 + 2;
    this.lookArr[k] = Math.min(1, this.lookArr[k] + amount);
    this.look.needsUpdate = true;
  }
}

/** Instanced draw of a set of bodies with a material's look. */
export class PieceMesh extends THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshStandardNodeMaterial> {
  private readonly ids: THREE.StorageInstancedBufferAttribute;
  private list: Body[] = [];
  private dirty = true;

  constructor(world: World, data: PieceData, look: MatLook, mat: Mat | 'shard' | 'ball', segments = 2) {
    const n = world.maxBodies;
    const source = bevelGeometry(segments);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = source.index;
    for (const k of ['position', 'normal', 'inset']) geometry.setAttribute(k, source.getAttribute(k));
    geometry.instanceCount = 0;
    const material = new THREE.MeshStandardNodeMaterial({ roughness: look.rough, metalness: look.metal });
    super(geometry, material);
    this.ids = new THREE.StorageInstancedBufferAttribute(new Uint32Array(n), 1);
    const bodies = storage(world.bodyAttribute!, 'vec4', n * VEC4_PER_BODY).toReadOnly();
    const body = storage(this.ids, 'uint', n).toReadOnly().element(instanceIndex);
    const base = body.mul(VEC4_PER_BODY);
    const pos: N = bodies.element(base.add(B_POS / 4));
    const rot: N = bodies.element(base.add(B_ROT / 4));
    const size: N = bodies.element(base.add(B_SIZE / 4)).xyz;
    const info: N = storage(data.look, 'vec4', n).toReadOnly().element(body);
    const home: N = storage(data.home, 'vec4', n).toReadOnly().element(body);
    const inset: N = attribute('inset', 'vec3');
    // The round: the material's, but never more than a third of the piece's thinnest side
    const bevel = min(float(look.bevel), min(size.x, min(size.y, size.z)).mul(0.3));
    const local: N = positionGeometry.mul(size).add(inset.mul(bevel));
    material.positionNode = rotate(rot, local).add(pos.xyz);
    // Varyings for the fragment stage: where on the piece, which way its face looks, its turn
    const vLocal: N = varying(local, 'vLocal');
    const vN: N = varying(normalGeometry, 'vN');
    const vRot: N = varying(rot, 'vRot');
    const vInfo: N = varying(info, 'vInfo');
    const vHome: N = varying(home.xyz, 'vHome');
    const vSize: N = varying(size, 'vSize');

    // The face's axes: u and v across it (v along the grain where the grain lies in it), n out of it
    const an: N = abs(vN);
    const fx = an.x.greaterThan(an.y).and(an.x.greaterThan(an.z));
    const fy = an.y.greaterThanEqual(an.x).and(an.y.greaterThan(an.z));
    const faceN: N = select(fx, vec3(1, 0, 0), select(fy, vec3(0, 1, 0), vec3(0, 0, 1)));
    let A: N = select(fx, vec3(0, 1, 0), vec3(1, 0, 0));
    let Bv: N = select(fx.or(fy), vec3(0, 0, 1), vec3(0, 1, 0));
    const longAxis = vInfo.w;
    const L: N = select(longAxis.lessThan(0.5), vec3(1, 0, 0), select(longAxis.lessThan(1.5), vec3(0, 1, 0), vec3(0, 0, 1)));
    if (look.grain) {
      const swap = A.dot(L).greaterThan(0.5);
      const A2 = select(swap, Bv, A);
      const B2 = select(swap, A, Bv);
      A = A2;
      Bv = B2;
    }
    // Texture coordinates in metres, offset by the piece's home and its seed (no two alike)
    const seed: N = vInfo.y;
    const p: N = vLocal.add(vHome.mul(0.37)).add(vec3(seed.mul(7.31), seed.mul(3.17), seed.mul(5.53)));
    const uv: N = vec2(p.dot(A), p.dot(Bv)).div(look.scale);
    const endGrain: N = look.grain ? faceN.dot(L) : float(0);
    // Edges: how far into the round (0 on the flat, 1 at the edge's middle), for the mortar line and wear
    const towardEdge: N = (() => {
      // (across the face only: along its own axis every point is at the surface)
      const q: N = abs(vLocal).sub(vSize.mul(0.5)).add(bevel);
      return smoothstep(0, 1, max(q.dot(A), q.dot(Bv)).div(bevel).max(0));
    })();

    const tint = vec3(look.tint.r, look.tint.g, look.tint.b);
    let colour: N;
    let roughness: N;
    let ao: N = float(1);
    let nmap: N = vec3(0, 0, 1);
    if (look.set) {
      const d = texture(look.set.diff, uv).rgb;
      const arm = texture(look.set.arm, uv);
      nmap = texture(look.set.nor, uv).rgb.mul(2).sub(1);
      colour = d.mul(tint);
      roughness = arm.g.mul(look.rough / 0.8).clamp(0.05, 1);
      ao = arm.r.mul(0.6).add(0.4);
    } else {
      colour = tint;
      roughness = float(look.rough);
    }
    // Per-piece variation: value and a touch of hue
    const v = seed.sub(0.5);
    colour = colour.mul(vec3(float(1).add(v.mul(0.22)), float(1).add(v.mul(0.16)), float(1).add(v.mul(0.1))));

    if (mat === 'brick') {
      // Clay: deep red to orange-brown per brick, mottled, darker at the arrises (the mortar line)
      const h = hash(seed.mul(9137)) as N;
      const clay = mix(vec3(0.42, 0.13, 0.07), vec3(0.58, 0.24, 0.12), h);
      const burnt = mix(clay, vec3(0.2, 0.08, 0.05), smoothstep(0.82, 0.98, hash(seed.mul(3121)) as N).mul(0.7));
      const mottle = mx_noise_float(p.mul(9)).mul(0.5).add(0.5);
      colour = burnt.mul(mottle.mul(0.35).add(0.8)).mul(colour.div(max(tint, vec3(0.001))).mul(0.5).add(0.5));
      colour = mix(colour, vec3(0.32, 0.29, 0.25), towardEdge.mul(0.55));
      roughness = float(0.86);
    }
    if (mat === 'board' || mat === 'timber') {
      const paint = vInfo.x;
      const tar = vec3(0.035, 0.033, 0.032);
      const oxblood = vec3(0.26, 0.045, 0.035);
      const cream = vec3(0.78, 0.74, 0.62);
      const pale = vec3(0.62, 0.5, 0.36);
      const pc: N = select(paint.lessThan(1.5), tar, select(paint.lessThan(2.5), oxblood, select(paint.lessThan(3.5), cream, pale)));
      // Paint follows the grain a little (lighter where the grain shows through), worn at the edges
      const lum = colour.dot(vec3(0.3, 0.55, 0.15));
      const worn = smoothstep(0.55, 1, towardEdge.add(mx_noise_float(p.mul(3)).mul(0.25)));
      const painted = mix(pc.mul(lum.mul(1.2).add(0.6)), colour, worn.mul(0.6));
      colour = select(paint.greaterThan(0.5), painted, colour);
      roughness = select(paint.greaterThan(0.5), mix(float(0.55), roughness, worn), roughness);
      // Sawn ends: paler, rougher
      colour = mix(colour, colour.mul(vec3(1.5, 1.35, 1.15)), endGrain.mul(select(paint.greaterThan(0.5), 0.3, 1)));
    }
    if (mat === 'steel') {
      const paint = vInfo.x;
      const teal = vec3(0.12, 0.27, 0.25);
      const charcoal = vec3(0.07, 0.075, 0.08);
      const pc: N = select(paint.lessThan(4.5), teal, charcoal);
      const rust = vec3(0.32, 0.13, 0.05);
      const r: N = smoothstep(0.45, 0.85, mx_noise_float(p.mul(1.8)).mul(0.5).add(0.5).add(towardEdge.mul(0.35)));
      colour = mix(pc.mul(colour.dot(vec3(0.33)).mul(1.6).add(0.4)), rust, r.mul(0.8));
      roughness = mix(float(0.45), float(0.9), r);
    }
    // Char from blasts
    const charred = vInfo.z;
    colour = mix(colour, colour.mul(0.08), charred);
    roughness = mix(roughness, float(0.95), charred);

    material.colorNode = colour as THREE.Node<'color'>;
    material.roughnessNode = roughness as THREE.Node<'float'>;
    material.aoNode = ao as THREE.Node<'float'>;
    // Normal: the face's frame turned with the piece; the map tilts it
    const T: N = A;
    const Bt: N = Bv;
    const Nf: N = faceN.mul(vN.dot(faceN).sign());
    const strength = look.set ? 0.8 : 0;
    const flatN: N = normalize(vN);
    const mapped: N = normalize(T.mul(nmap.x.mul(strength)).add(Bt.mul(nmap.y.mul(strength))).add(Nf.mul(nmap.z)));
    // On the round, the geometry's own normal (the map would fight it)
    const edgeBlend: N = (smoothstep as N)(0.15, 0.6, towardEdge);
    const localN: N = (normalize as N)((mix as N)(mapped, flatN, edgeBlend));
    material.normalNode = transformNormalToView(rotate(vRot, localN)) as THREE.Node<'vec3'>;
    if (look.metal > 0) material.metalnessNode = float(look.metal);
    this.frustumCulled = false;
    this.castShadow = true;
    this.receiveShadow = true;
  }

  /** The bodies drawn. */
  get bodies(): readonly Body[] {
    return this.list;
  }

  /** Draw these bodies (call when the list changes). */
  setBodies(list: Body[]): void {
    this.list = list;
    this.dirty = true;
  }

  /** A body left (removed from the world): drop it at the next draw. */
  drop(): void {
    this.dirty = true;
  }

  onBeforeRender = (): void => {
    if (!this.dirty) return;
    this.dirty = false;
    this.list = this.list.filter((b) => b.alive);
    (this.ids.array as Uint32Array).set(this.list.map((b) => b.index));
    this.ids.needsUpdate = true;
    this.geometry.instanceCount = this.list.length;
  };
}

