// The yard at run time: one three-avbd world for the page's whole life, the structure standing in it
// (swapped for another, or rebuilt, without making a new world), how it's drawn, and what happens to
// it: welds breaking, panes shattering into shards, pieces hitting the ground. It reads the solver
// back every few steps and turns what it sees into dust and sound. (Timberfall's site, for one
// structure at a time.)

import * as THREE from 'three/webgpu';
import { type Body, BodyMesh, type Joint, type World } from 'three-avbd';
import { build, type Built, type StructureId } from '../level/structures.ts';
import type { Builder, Piece, V3 } from '../physics/builder.ts';
import { type Mat, MATS } from '../physics/materials.ts';
import { createWorld, DT, GROUND_GROUP, Structure, type Tuning } from '../physics/structure.ts';
import { loadSet, type MatLook, Paint, PieceData, PieceMesh, type TextureSet } from '../render/pieces.ts';
import { terrainHeight, type View } from '../render/view.ts';

/** Most cannonballs in the solver at once. */
const MAX_BALLS = 24;

/** Room in the world: the biggest structure, plus shards, offcuts and cannonballs. */
const MAX_BODIES = 2048;
/** Steps between readbacks of every piece (poses for the cannon's sweep, impacts, sound). */
export const READBACK_EVERY = 3;
/** Shards are cleared this long after a pane breaks (s): they're small and many. */
const SHARD_LIFE = 7;
/**
 * Settling a new structure: steps a frame (90 in all), so a rebuild never stalls a frame: three
 * (at 8, a rebuild at 20 iterations took 130 ms frames in Patch Desktop), and more while warming
 * up, before anything is shown.
 */
const SETTLE_STEPS = 3;
const SETTLE_STEPS_WARM = 12;

export interface SiteEvents {
  /** A weld broke under load (not cut by the cannon): where, and the two pieces' materials. */
  onWeld?: (at: V3, a: Mat, b: Mat) => void;
  /** A piece lost speed suddenly (it hit something): where, how fast it was going (m/s), its material and mass (t). */
  onImpact?: (at: V3, dv: number, mat: Mat, mass: number) => void;
  /** A pane went. */
  onShatter?: (at: V3, size: number) => void;
  /** Timber or steel bending under load (a plastic weld gave this much since the last look, rad). */
  onStrain?: (at: V3, amount: number) => void;
}

const LOOKS: Partial<Record<Mat, Omit<MatLook, 'set'> & { set?: string }>> = {
  timber: { set: 'rough_wood', scale: 1.6, bevel: 0.02, tint: new THREE.Color(1.08, 0.86, 0.66), rough: 0.85, metal: 0, grain: true },
  board: { set: 'fine_grained_wood', scale: 1.1, bevel: 0.008, tint: new THREE.Color(1.25, 1.12, 0.98), rough: 0.8, metal: 0, grain: true },
  brick: { set: 'rough_concrete', scale: 0.9, bevel: 0.016, tint: new THREE.Color(1, 1, 1), rough: 0.88, metal: 0, grain: false },
  stone: { set: 'rock_surface', scale: 1.5, bevel: 0.025, tint: new THREE.Color(1.15, 1.05, 0.92), rough: 0.9, metal: 0, grain: false },
  tile: { set: 'clay_roof_tiles_02', scale: 1.25, bevel: 0.012, tint: new THREE.Color(0.86, 0.74, 0.7), rough: 0.8, metal: 0, grain: false },
  steel: { set: 'rusty_metal_sheet', scale: 1.2, bevel: 0.01, tint: new THREE.Color(1, 1, 1), rough: 0.6, metal: 0.55, grain: true },
};

/** What paint a piece gets, by its role. */
function paintOf(p: Piece): number {
  switch (p.role) {
    case 'weatherboard':
    case 'gable board':
      return Paint.Tar;
    case 'door':
    case 'ledge':
      return p.group === 'wall' ? Paint.None : Paint.Oxblood;
    case 'mullion':
    case 'glazing bar':
      return Paint.Cream;
    case 'tank plate':
    case 'lid':
    case 'finial':
    case 'tank floor':
      return Paint.Teal;
    case 'leg':
    case 'girt':
    case 'brace':
    case 'beam':
      return p.mat === 'steel' ? Paint.Charcoal : Paint.None;
    default:
      return Paint.None;
  }
}

/** A builder's pieces copied (a structure adds its offcuts to its own list). */
function fresh(b: Builder): Builder {
  return { ...b, pieces: b.pieces.map((p) => ({ ...p, size: [...p.size] as V3, pos: [...p.pos] as V3 })), welds: b.welds } as Builder;
}

export class Site {
  readonly world: World;
  readonly data: PieceData;
  /** The structure standing (or what's left of it), and which. */
  s!: Structure;
  id!: StructureId;
  built!: Built;
  private readonly meshes = new Map<string, PieceMesh>();
  private readonly glass: PieceMesh;
  private readonly shardMesh: PieceMesh;
  private readonly ballMesh: BodyMesh;
  /** Each structure, built once (Builder output is the same every time). */
  private readonly plans = new Map<StructureId, Built>();
  /** Each piece's speed at the last readback (m/s), to see impacts. */
  private speeds = new Float32Array(0);
  private bends = new Float32Array(0);
  /** Shards, cannonballs, and when each goes (s). */
  private readonly shards: { body: Body; until: number }[] = [];
  private readonly balls: { body: Body; until: number }[] = [];
  private clock = 0;
  events: SiteEvents = {};
  /** Readbacks seen. */
  reads = 0;
  /** Pieces moving at the last readback, and where (for the rubble loop). */
  moving = 0;
  movingAt: V3 | null = null;
  /** The step the structure standing was put up at. */
  since = 0;
  private watching: Promise<void> | null = null;

  private constructor(world: World, sets: Map<string, TextureSet>, view: View) {
    this.world = world;
    this.data = new PieceData(world.maxBodies);
    for (const [mat, look] of Object.entries(LOOKS)) {
      if (!look) continue;
      const m = new PieceMesh(world, this.data, { ...look, set: look.set ? (sets.get(look.set) ?? null) : null } as MatLook, mat as Mat);
      this.meshes.set(mat, m);
      view.scene.add(m);
    }
    // Glass: its own material, see-through and reflective (drawn from the same buffer)
    this.glass = new PieceMesh(world, this.data, { set: null, scale: 1, bevel: 0.004, tint: new THREE.Color(0.55, 0.68, 0.7), rough: 0.04, metal: 0.1, grain: false }, 'glass', 1);
    this.glass.material.transparent = true;
    this.glass.material.opacity = 0.32;
    this.glass.material.depthWrite = false;
    this.glass.castShadow = false;
    this.glass.renderOrder = 2;
    view.scene.add(this.glass);
    this.shardMesh = new PieceMesh(world, this.data, { set: null, scale: 1, bevel: 0.002, tint: new THREE.Color(0.75, 0.85, 0.85), rough: 0.1, metal: 0.2, grain: false }, 'shard', 1);
    this.shardMesh.castShadow = false;
    view.scene.add(this.shardMesh);
    // Cannonballs once they've hit something: real spheres in the solver, drawn as spheres
    this.ballMesh = new BodyMesh(world, { bodies: 'sphere', geometry: new THREE.IcosahedronGeometry(0.5, 4), material: new THREE.MeshStandardNodeMaterial({ color: 0x1c1c1f, roughness: 0.32, metalness: 0.85 }) });
    this.ballMesh.castShadow = this.ballMesh.receiveShadow = true;
    view.scene.add(this.ballMesh);
    world.track(null);
    world.readbackEvery = READBACK_EVERY;
    world.onBreak((j) => this.broke(j));
  }

  static async create(view: View): Promise<Site> {
    const sets = new Map<string, TextureSet>();
    const world = await createWorld(view.renderer, MAX_BODIES);
    await Promise.all(
      [...new Set(Object.values(LOOKS).map((l) => l?.set).filter((x): x is string => !!x))].map((name) =>
        loadSet(name).then((t) => sets.set(name, t)).catch((e) => console.warn('texture', name, e)),
      ),
    );
    return new Site(world, sets, view);
  }

  /** The plan of a structure (built the first time it's asked for). */
  plan(id: StructureId): Built {
    let p = this.plans.get(id);
    if (!p) this.plans.set(id, (p = build(id)));
    return p;
  }

  /**
   * Take whatever stands out of the world, with every shard, offcut and cannonball, and put up a
   * new structure: unbreakable until it has settled and armed (`ready`), a few steps a frame.
   */
  load(id: StructureId, tuning: Tuning): void {
    this.s?.remove();
    for (const list of [this.shards, this.balls]) {
      for (const x of list) x.body.remove();
      list.length = 0;
    }
    // Two steps with nothing in the world, so no contact the solver remembers (warm starts are kept
    // by body slot, and the new structure's bodies take the old slots) carries over
    if (this.s) {
      this.world.gravity = [0, 0, 0];
      this.world.step();
      this.world.step();
    }
    this.id = id;
    this.since = this.world.stepCount;
    this.built = this.plan(id);
    this.s = Structure.build(this.world, fresh(this.built.builder), tuning);
    const s = this.s;
    s.pieces.forEach((p, i) => s.bodies[i] && this.data.set(s.bodies[i]!, p, paintOf(p)));
    for (const [mat, m] of this.meshes) m.setBodies(s.pieces.map((p, i) => (p.mat === mat ? s.bodies[i] : null)).filter((b): b is Body => !!b));
    this.glassList();
    this.shardMesh.setBodies([]);
    this.speeds = new Float32Array(s.pieces.length + 256);
    this.bends = new Float32Array(s.welds.length);
  }

  /** Armed: its welds can break, and it can be shot at. */
  get ready(): boolean {
    return this.s.armed;
  }

  private glassList(): void {
    const s = this.s;
    this.glass.setBodies(s.pieces.map((p, i) => (p.mat === 'glass' ? s.bodies[i] : null)).filter((b): b is Body => !!b));
  }

  /** Steps the physics: settling a new structure, else the steps `dt` owes at `timeScale`. */
  update(dt: number, timeScale: number, warming = false): number {
    if (!this.s.armed) {
      this.s.settle(warming ? SETTLE_STEPS_WARM : SETTLE_STEPS);
      return 0;
    }
    this.clock += dt * timeScale;
    // Slow motion: smaller steps, still about one a frame, so it's smooth rather than stepped
    this.world.dt = DT * timeScale;
    const n = this.world.update(dt * timeScale);
    // When a readback the world started lands, look at what it brought
    const reading = (this.world as unknown as { reading: Promise<void> | null }).reading;
    if (reading && reading !== this.watching) {
      this.watching = reading;
      const s = this.s;
      void reading.then(() => s === this.s && this.readback());
    }
    // Clear old shards and spent cannonballs
    for (const list of [this.shards, this.balls])
      for (let k = list.length - 1; k >= 0; k--)
        if (list[k].until < this.clock) {
          list[k].body.remove();
          list.splice(k, 1);
          if (list === this.shards) this.shardMesh.drop();
        }
    return n;
  }

  /** After a readback: impacts, motion, things bending, and nothing left hanging in the air. */
  private readback(): void {
    this.reads++;
    const s = this.s;
    let moving = 0;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    if (this.speeds.length < s.pieces.length) {
      const sp = new Float32Array(s.pieces.length + 256);
      sp.set(this.speeds);
      this.speeds = sp;
    }
    for (let i = 0; i < s.pieces.length; i++) {
      const b = s.bodies[i];
      const p = s.pieces[i];
      if (p.fixed || !b) continue;
      const v = b.velocity;
      const speed = Math.hypot(v[0], v[1], v[2]);
      // Safety: nothing in a collapse flies faster than this, and nothing leaves the valley
      const at = b.position;
      if (Math.abs(at[0]) > 120 || Math.abs(at[1]) > 120 || at[2] > 120 || at[2] < -20 || !Number.isFinite(at[0])) {
        s.release(i);
        b.remove();
        s.bodies[i] = null;
        this.meshes.get(p.mat)?.drop();
        continue;
      }
      if (speed > 40) {
        const k = s.mass[i] * (1 - 25 / speed);
        b.applyImpulse([-v[0] * k, -v[1] * k, -v[2] * k]);
      }
      const before = this.speeds[i];
      this.speeds[i] = speed;
      if (speed > 1.2) {
        moving++;
        cx += at[0];
        cy += at[1];
        cz += at[2];
      }
      const dv = before - speed;
      if (dv > 2.2 && before > 2.5) this.events.onImpact?.(b.position as V3, dv, p.mat, s.mass[i]);
    }
    this.moving = moving;
    this.movingAt = moving ? [cx / moving, cy / moving, cz / moving] : null;
    // What's bending: the plastic welds that gave since the last look (the sag before a collapse)
    let worst = 0;
    let at = -1;
    for (let i = 0; i < s.joints.length; i++) {
      const j = s.joints[i];
      if (!j || !(s.yieldAt[i] < Infinity)) continue;
      const d = j.bend - this.bends[i];
      this.bends[i] = j.bend;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > 0.004 && at >= 0) this.events.onStrain?.(this.weldPoint(at), worst);
    // Twice a second: nothing may hang in the air (two looks in a row, so a section caught at
    // the top of a bounce isn't dropped)
    if (this.reads % 10 === 0) {
      const now = this.hanging();
      if (now.length && this.hangSeen) for (const list of now) for (const i of list) s.bodies[i]?.applyImpulse([0, 0, -s.mass[i] * 0.4]);
      this.hangSeen = now.length > 0;
    }
  }
  private hangSeen = false;

  /**
   * Sections hanging in the air: groups of pieces still welded together, not welded (through each
   * other) to the ground, not moving, with nothing under their lowest piece. The solver can leave a
   * body that comes to rest with no contact or weld left standing still where it is.
   */
  hanging(): number[][] {
    const s = this.s;
    const n = s.pieces.length;
    const parent = new Int32Array(n).map((_, i) => i);
    const find = (x: number): number => {
      while (parent[x] !== x) x = parent[x] = parent[parent[x]];
      return x;
    };
    s.welds.forEach((w, i) => {
      if (s.joints[i]) parent[find(w.a)] = find(w.b);
    });
    const groups = new Map<number, number[]>();
    const anchored = new Set<number>();
    for (let i = 0; i < n; i++) {
      if (!s.bodies[i]) continue;
      const r = find(i);
      if (s.pieces[i].fixed) {
        anchored.add(r);
        continue;
      }
      const list = groups.get(r);
      if (list) list.push(i);
      else groups.set(r, [i]);
    }
    const out: number[][] = [];
    let boxes: (THREE.Box3 | null)[] | null = null;
    for (const [r, list] of groups) {
      if (anchored.has(r)) continue;
      if (list.some((i) => {
        const v = s.bodies[i]!.velocity;
        return Math.hypot(v[0], v[1], v[2]) > 0.08;
      })) continue;
      boxes ??= s.pieces.map((_, i) => this.bounds(i));
      let held = false;
      for (const i of list) {
        const bb = boxes[i];
        if (bb && bb.min.z - terrainHeight((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2) < 0.3) {
          held = true;
          break;
        }
      }
      if (!held) {
        const mine = new Set(list);
        for (const i of list.slice(0, 80)) {
          const bb = boxes[i];
          if (!bb) continue;
          const under = new THREE.Box3(new THREE.Vector3(bb.min.x - 0.04, bb.min.y - 0.04, bb.min.z - 0.15), new THREE.Vector3(bb.max.x + 0.04, bb.max.y + 0.04, bb.min.z + Math.min(0.3, (bb.max.z - bb.min.z) * 0.5)));
          for (let k = 0; k < boxes.length && !held; k++) {
            const ob = boxes[k];
            if (!ob || mine.has(k) || s.pieces[k].fixed) continue;
            if (ob.min.z < bb.min.z + 0.05 && ob.intersectsBox(under)) held = true;
          }
          if (held) break;
        }
      }
      if (!held) out.push(list);
    }
    return out;
  }

  /** A piece's world bounds now (null if gone). */
  bounds(i: number): THREE.Box3 | null {
    const b = this.s.bodies[i];
    if (!b) return null;
    const p = this.s.pieces[i];
    const r = b.rotation;
    const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(r[0], r[1], r[2], r[3])).elements;
    const h = [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
    const ext = [0, 1, 2].map((row) => Math.abs(m[row]) * h[0] + Math.abs(m[4 + row]) * h[1] + Math.abs(m[8 + row]) * h[2]);
    const c = b.position;
    return new THREE.Box3(new THREE.Vector3(c[0] - ext[0], c[1] - ext[1], c[2] - ext[2]), new THREE.Vector3(c[0] + ext[0], c[1] + ext[1], c[2] + ext[2]));
  }

  /** A weld seen broken at a readback. */
  private broke(j: Joint): void {
    const i = this.s.markBroken(j);
    if (i < 0) return;
    const w = this.s.welds[i];
    this.events.onWeld?.(this.weldPoint(i), this.s.pieces[w.a].mat, this.s.pieces[w.b].mat);
    for (const k of [w.a, w.b]) if (this.s.pieces[k].mat === 'glass') this.shatter(k);
  }

  /** Where a weld is now (world m). */
  weldPoint(i: number): V3 {
    const w = this.s.welds[i];
    const A = this.s.pieces[w.a];
    const body = this.s.bodies[w.a];
    if (!body || A.fixed) return w.at;
    const local = new THREE.Vector3(w.at[0] - A.pos[0], w.at[1] - A.pos[1], w.at[2] - A.pos[2]).applyQuaternion(new THREE.Quaternion(A.rot[0], A.rot[1], A.rot[2], A.rot[3]).invert());
    const r = body.rotation;
    local.applyQuaternion(new THREE.Quaternion(r[0], r[1], r[2], r[3]));
    const p = body.position;
    return [p[0] + local.x, p[1] + local.y, p[2] + local.z];
  }

  /** A pane goes: its body out, shards in its place, flung a little. */
  shatter(piece: number, push?: V3): void {
    const s = this.s;
    const body = s.bodies[piece];
    if (!body) return;
    s.release(piece);
    const p = s.pieces[piece];
    const pos = body.position;
    const rot = body.rotation;
    const vel = body.velocity;
    body.remove();
    s.bodies[piece] = null;
    this.glassList();
    const q = new THREE.Quaternion(rot[0], rot[1], rot[2], rot[3]);
    const axes = [0, 1, 2].sort((a, b) => p.size[b] - p.size[a]);
    const nu = Math.max(2, Math.min(4, Math.round(p.size[axes[0]] / 0.25)));
    const nv = Math.max(2, Math.min(4, Math.round(p.size[axes[1]] / 0.25)));
    for (let u = 0; u < nu; u++)
      for (let v = 0; v < nv; v++) {
        const local = [0, 0, 0];
        local[axes[0]] = ((u + 0.5) / nu - 0.5) * p.size[axes[0]];
        local[axes[1]] = ((v + 0.5) / nv - 0.5) * p.size[axes[1]];
        const size: V3 = [0, 0, 0];
        size[axes[0]] = (p.size[axes[0]] / nu) * (0.55 + Math.random() * 0.4);
        size[axes[1]] = (p.size[axes[1]] / nv) * (0.55 + Math.random() * 0.4);
        size[axes[2]] = 0.012;
        const at = new THREE.Vector3(local[0], local[1], local[2]).applyQuaternion(q).add(new THREE.Vector3(pos[0], pos[1], pos[2]));
        const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6)).premultiply(q);
        const k = push ? 0.6 : 0.3;
        const shard = this.world.addBox({
          size,
          position: at.toArray() as V3,
          rotation: tilt.toArray() as [number, number, number, number],
          velocity: [vel[0] + (push?.[0] ?? 0) * k + (Math.random() - 0.5) * 2, vel[1] + (push?.[1] ?? 0) * k + (Math.random() - 0.5) * 2, vel[2] + (push?.[2] ?? 0) * k + Math.random() * 1.5],
          angularVelocity: [(Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12],
          density: 2.5,
          friction: 0.4,
          // Shards fall through the structure to the ground: thin and quick, they knocked boards off
          // all round a barn wherever they flew
          group: 2,
          collidesWith: GROUND_GROUP,
        });
        if (!shard) continue;
        this.data.set(shard, { size, pos: at.toArray() as V3, seed: Math.random() }, 0);
        this.shards.push({ body: shard, until: this.clock + SHARD_LIFE + Math.random() * 2 });
      }
    this.shardMesh.setBodies(this.shards.map((x) => x.body));
    this.events.onShatter?.(pos as V3, p.size[axes[0]] * p.size[axes[1]]);
  }

  /** Take away every cannonball in the solver. */
  clearBalls(): void {
    for (const x of this.balls) x.body.remove();
    this.balls.length = 0;
  }

  /** Fire a cannonball into the solver (after its first hit). */
  addBall(at: V3, velocity: V3, radius: number, density: number): Body | null {
    // (Fired as fast as you can click, balls pile up on each other for no gain: the oldest goes)
    if (this.balls.length >= MAX_BALLS) this.balls.shift()?.body.remove();
    const b = this.world.addSphere({ radius, position: at, velocity, density, friction: 0.5, reportContacts: true });
    if (!b) return null;
    this.balls.push({ body: b, until: this.clock + 10 });
    return b;
  }

  /**
   * Warm-up: a shard and a cannonball drawn once, far below the ground, so their shaders and the
   * solver's contact-event and push passes are compiled before the demo says it's ready.
   */
  warm(): void {
    const shard = this.world.addBox({ size: [0.1, 0.1, 0.012], position: [0, -60, -30], fixed: true });
    if (shard) {
      this.data.set(shard, { size: [0.1, 0.1, 0.012], pos: [0, -60, -30], seed: 0.5 }, 0);
      this.shards.push({ body: shard, until: this.clock + 0.2 });
      this.shardMesh.setBodies(this.shards.map((x) => x.body));
    }
    const ball = this.addBall([0, -60, -34], [0, 0, 0], 0.2, 7.8);
    if (ball) {
      ball.applyImpulse([0, 0, 0.01]);
      const list = this.balls.find((x) => x.body === ball);
      if (list) list.until = this.clock + 0.2;
    }
  }

  /** Take a piece out (the cannon splinters it), leaving offcuts in its place. */
  cutOut(piece: number, at: V3, kick: V3, parts = 2, kerf = 0.16): void {
    const s = this.s;
    const body = s.bodies[piece];
    if (!body) return;
    s.release(piece);
    const p = s.pieces[piece];
    const pos = body.position;
    const rot = body.rotation;
    const vel = body.velocity;
    body.remove();
    s.bodies[piece] = null;
    this.meshes.get(p.mat)?.drop();
    const q = new THREE.Quaternion(rot[0], rot[1], rot[2], rot[3]);
    const long = p.size[0] >= p.size[1] && p.size[0] >= p.size[2] ? 0 : p.size[1] >= p.size[2] ? 1 : 2;
    const axis = new THREE.Vector3(long === 0 ? 1 : 0, long === 1 ? 1 : 0, long === 2 ? 1 : 0).applyQuaternion(q);
    const c = new THREE.Vector3(pos[0], pos[1], pos[2]);
    const along = new THREE.Vector3(at[0], at[1], at[2]).sub(c).dot(axis);
    const half = p.size[long] / 2;
    const cut = Math.max(-half + 0.15, Math.min(half - 0.15, along));
    const cuts = [cut];
    for (let k = 2; k < parts; k++) cuts.push(-half + (2 * half * k) / parts + (Math.random() - 0.5) * 0.2);
    cuts.sort((x, y) => x - y);
    const bounds: [number, number][] = [];
    let from = -half;
    for (const x of cuts) {
      bounds.push([from, x - kerf / 2]);
      from = x + kerf / 2;
    }
    bounds.push([from, half]);
    for (const [a, b] of bounds) {
      const len = b - a;
      if (len < 0.08) continue;
      const size: V3 = [...p.size];
      size[long] = len;
      const centre = c.clone().addScaledVector(axis, (a + b) / 2);
      const off = this.world.addBox({
        size,
        position: centre.toArray() as V3,
        rotation: [...rot] as [number, number, number, number],
        velocity: [vel[0] + kick[0] * (0.7 + Math.random() * 0.6), vel[1] + kick[1] * (0.7 + Math.random() * 0.6), vel[2] + kick[2] * (0.7 + Math.random() * 0.6)],
        angularVelocity: [(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6],
        density: (p.density ?? MATS[p.mat].density),
        friction: MATS[p.mat].friction,
      });
      if (!off) continue;
      const id = s.addLoose({ ...p, size, pos: centre.toArray() as V3, rot: [...rot] as [number, number, number, number], role: `${p.role} offcut`, manual: true }, off);
      this.data.set(off, s.pieces[id], paintOf(p));
      const m = this.meshes.get(p.mat);
      m?.setBodies([...m.bodies, off]);
    }
  }

  /** How many welds there were, and how many still hold. */
  get welds(): { total: number; holding: number } {
    let holding = 0;
    for (const j of this.s.joints) if (j) holding++;
    return { total: this.s.joints.length, holding };
  }
}
